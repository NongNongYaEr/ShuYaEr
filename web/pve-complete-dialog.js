export function createPveCompleteExporter({ api, save, ready, status, button, prepare }) {
  const dialog = document.createElement('dialog'); dialog.id = 'pveCompleteDialog';
  dialog.style.cssText = 'width:min(780px,90vw);max-height:88vh;overflow:auto;background:#132019;color:#e3eae2;border:1px solid #526b58;border-radius:12px;padding:28px';
  dialog.innerHTML = `<h2>UE/PVE 完整单元枝包</h2><p>保存软件工程 → 生成骨架与单元枝模型 → 输出实际装配数据 → 校验完成</p>
    <p id="pveStage" role="status" aria-live="polite"></p><p id="pveElapsed"></p><p id="pveDetail" style="white-space:pre-wrap;overflow-wrap:anywhere"></p>
    <div id="pveResult" hidden><p id="pveSummary"></p><p id="pveDirectory" style="overflow-wrap:anywhere"></p>
    <p><strong>UE 工作台请选择 whole.pve-skeleton.json，不能选择 .branch.json。</strong><br>GLB、图集、清单及 resolved 文件必须一起保留。</p></div>
    <p id="pveLog" style="overflow-wrap:anywhere;white-space:pre-line;font-size:13px"></p><div style="display:flex;gap:12px;flex-wrap:wrap"><button id="pveOpen" hidden>打开输出文件夹</button><button id="pveCopy" hidden>复制 UE 导入 JSON 路径</button><button id="pveRetry" hidden>重新保存并导出</button><button id="pveClose">关闭</button></div>`;
  document.body.append(dialog); const $ = id => dialog.querySelector('#' + id);
  for (const control of dialog.querySelectorAll('button')) control.style.cssText = 'padding:8px 12px;min-height:36px;border:1px solid #526b58;border-radius:5px';
  let running = false, job = null, timer;
  const close = () => { if (!running) dialog.close(); };
  $('pveClose').onclick = close; dialog.oncancel = e => { e.preventDefault(); close(); };
  dialog.addEventListener('keydown', e => e.stopPropagation());
  $('pveOpen').onclick = async () => { try { await api('/api/open-pve-output', { job_id: job.job_id }); } catch (e) { $('pveDetail').textContent = e.message; } };
  $('pveCopy').onclick = async () => { try { await navigator.clipboard.writeText(job.skeleton_path); $('pveDetail').textContent = '已复制 UE 入口：' + job.skeleton_path; } catch (e) { $('pveDetail').textContent = '请复制此路径：' + job.skeleton_path; } };
  $('pveRetry').onclick = () => { sessionStorage.removeItem('pveExportJob'); dialog.close(); run(); };
  async function run() {
    if (running) return;
    running = true; button.disabled = true; $('pveClose').disabled = true;
    for (const id of ['pveResult','pveOpen','pveCopy','pveRetry']) $(id).hidden = true;
    $('pveLog').textContent = ''; $('pveDetail').textContent = ''; $('pveElapsed').textContent = '';
    let started = Date.now();
    try {
      const pending = sessionStorage.getItem('pveExportJob');
      if (!pending) {
        job = null;
        ready(); status('保存软件工程 · 尚未生成 UE 完整包', 'busy');
        const prepared = await prepare?.();
        if (prepared === false) { status('已取消完整单元枝包导出', 'ready'); return; }
        const saved = await save(prepared); if (!saved) { status('已取消完整单元枝包导出', 'ready'); return; }
        const project = typeof saved === 'string' ? saved : saved.path;
        dialog.showModal(); $('pveStage').textContent = '生成骨架与单元枝模型 · 正在启动';
        job = await api('/api/export-pve-complete', { project_path: project, output_dir: project.replace(/\.branch\.json$/i, '_PVE_Complete'), keep_history: saved.keepHistory === true });
        sessionStorage.setItem('pveExportJob', job.job_id);
      } else { dialog.showModal(); job = { job_id: pending }; }
      timer = setInterval(() => { $('pveElapsed').textContent = `已运行 ${Math.floor((Date.now() - started) / 1000)} 秒 · 正在后台处理，请保留本软件运行`; }, 1000);
      let failures = 0;
      for (;;) {
        try { job = await api('/api/export-pve-status?id=' + job.job_id); failures = 0; }
        catch (e) { if (++failures >= 5) throw Error('无法读取运行状态；任务可能仍在后台执行。关闭面板后重新点击导出可恢复查询。' + e.message); await new Promise(r => setTimeout(r, 1000)); continue; }
        if (job.started) started = Date.parse(job.started);
        $('pveStage').textContent = job.stage; $('pveDetail').textContent = job.detail;
        $('pveLog').textContent = `运行日志：${job.log_path}\n错误日志：${job.error_log_path}`;
        status(job.stage, 'busy');
        if (job.state === 'failed') { sessionStorage.removeItem('pveExportJob'); throw Error(job.detail); }
        if (job.state === 'succeeded') break;
        await new Promise(r => setTimeout(r, 750));
      }
      sessionStorage.removeItem('pveExportJob');
      if (!job.validation?.valid) throw Error('任务结束但缺少完整校验结果');
      const models = job.model_reuse;
      $('pveSummary').textContent = job.package_kind === 'vine'
        ? `${job.name} · ${job.sources} 类完整藤蔓 · ${job.units} 个装配实例 · ${job.branches} 段藤干 · ${job.leaves} 片叶 · 校验通过`
        : models?.historical_complete_models
          ? `${job.name} · ${models.source_models} 个源模型 + ${models.historical_complete_models} 个历史完整模型 · ${job.units} 个实例 · 校验通过`
          : `${job.name} · ${job.sources} 类单元枝模型 · ${job.units} 个实例 · 校验通过`;
      if (job.validation.quality_warnings?.length) {
        $('pveDetail').textContent = '完整包校验通过。以下为造型质量提示，已保留原样导出：\n' + job.validation.quality_warnings.join('\n');
      }
      if (job.maintenance_warnings?.length) $('pveDetail').textContent += '\n' + job.maintenance_warnings.join('\n');
      if (models?.historical_complete_models) $('pveDetail').textContent += '\n历史完整模型用于保留旧副本的枝叶造型；枝叶整体一致的副本经校验后复用模型，不会拆成独立叶花果。';
      if (job.package_kind === 'vine') $('pveDetail').textContent += '\n藤干、叶层和连接细茎已合为完整藤蔓装配。承载模型不导出，无需单独绑定叶片。';
      $('pveDirectory').textContent = '输出目录：' + job.output_dir;
      if (job.keep_history && job.previous_dir) $('pveDirectory').textContent += '\n历史备份：' + job.previous_dir;
      for (const id of ['pveResult','pveOpen','pveCopy']) $(id).hidden = false;
      status('UE/PVE 完整单元枝包已生成并通过校验', 'ready');
    } catch (e) {
      if (!dialog.open) dialog.showModal();
      $('pveStage').textContent = `导出失败 · ${job?.stage || '保存工程 / 启动任务'}`;
      $('pveDetail').textContent = e.message; status('完整单元枝包导出失败', 'error');
      if (!$('pveLog').textContent) $('pveLog').textContent = '服务端日志：软件目录下 .runtime/server.log';
    } finally {
      clearInterval(timer); $('pveElapsed').textContent = dialog.open ? `本次处理 ${Math.max(0, Math.floor((Date.now() - started) / 1000))} 秒` : '';
      running = false; button.disabled = false; $('pveClose').disabled = false; $('pveRetry').hidden = false;
    }
  }
  return { run };
}
