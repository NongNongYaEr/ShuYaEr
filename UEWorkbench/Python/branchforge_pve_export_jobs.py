"""Background export stages. This module never calls Unreal from a worker thread."""
import atexit
import json
from pathlib import Path
import subprocess
import threading
import time

_active = set()
_active_lock = threading.RLock()


def _stop_active_exports():
    with _active_lock:
        jobs = list(_active)
    for job in jobs:
        job.cancel()
        process = job.process
        if process and process.poll() is None:
            try:
                process.terminate()
            except OSError:
                pass
        job.done.wait(2)


atexit.register(_stop_active_exports)


class ExportJob:
    def __init__(self, token, receipt_path, receipt, stages, timeout=420):
        self.token = token
        self.receipt_path = Path(receipt_path)
        self.receipt = dict(receipt)
        self.stages = stages
        self.timeout = timeout
        self.lock = threading.RLock()
        self.cancelled = threading.Event()
        self.done = threading.Event()
        self.process = None
        self.started = self.phase_started = time.monotonic()

    def snapshot(self):
        with self.lock:
            result = dict(self.receipt)
        result['elapsed_seconds'] = round(time.monotonic() - self.started)
        return result

    def _record(self, **changes):
        with self.lock:
            self.receipt.update(changes)
            payload = self.snapshot()
            temporary = self.receipt_path.with_suffix('.json.tmp')
            temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
            temporary.replace(self.receipt_path)

    def start(self):
        self._record(status='running', phase='export')
        self.thread = threading.Thread(target=self._run, name='PVEExport-' + self.token, daemon=True)
        with _active_lock:
            _active.add(self)
        try:
            self.thread.start()
        except Exception:
            with _active_lock:
                _active.discard(self)
            raise

    def cancel(self):
        self.cancelled.set()

    def _run(self):
        try:
            for phase, command, report in self.stages:
                if self.cancelled.is_set():
                    raise InterruptedError('用户取消了导出，已有成品保留')
                self.phase_started = time.monotonic()
                self._record(phase=phase)
                console = Path(report).with_suffix('.console.log')
                with console.open('wb') as output:
                    self.process = subprocess.Popen(command, stdout=output, stderr=subprocess.STDOUT,
                        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                    self._record(pid=self.process.pid)
                    while self.process.poll() is None:
                        if self.cancelled.wait(.2):
                            raise InterruptedError('用户取消了导出，已有成品保留')
                        if time.monotonic() - self.phase_started > self.timeout:
                            raise TimeoutError('本阶段超过等待上限，已停止本次后台进程；请查看日志')
                result = json.loads(Path(report).read_text(encoding='utf-8-sig'))
                checked = result.get('trunk_export', {}) if phase == 'export' else result
                if self.process.returncode or not checked.get('passed'):
                    raise RuntimeError(checked.get('error') or result.get('error') or '后台验收未通过')
                if phase == 'export':
                    if 'publish_plan' in self.receipt:
                        self._record(staged_export=checked)
                    else:
                        self._record(**checked)
            self._record(status='ready_to_publish' if 'publish_plan' in self.receipt else 'complete', cold_reload=True, pid=None)
        except Exception as exc:
            try:
                self._record(status='cancelled' if isinstance(exc, InterruptedError) else 'failed', error=str(exc), pid=None)
            except OSError:
                with self.lock:
                    self.receipt.update(status='failed', error=str(exc))
        finally:
            try:
                if self.process and self.process.poll() is None:
                    self.process.terminate()
                    try:
                        self.process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        self.process.kill()
                        self.process.wait()
            finally:
                with _active_lock:
                    _active.discard(self)
                self.done.set()

    def publishing(self):
        self._record(status='publishing', phase='publish')

    def published(self, result):
        self._record(**result, status='complete')

    def publication_failed(self, error):
        self._record(status='failed', error=str(error))
