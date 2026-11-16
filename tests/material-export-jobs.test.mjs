import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import {createExportJobs} from '../material/core/export-jobs.mjs';

function bakePayload(extra = {}) {
  const size = 256;
  const header = Buffer.from(JSON.stringify({
    width: size, height: size, modelName: 'ExportFixture', includeModel: false, ...extra
  }));
  const bytes = Buffer.alloc(4 + header.length + size * size * 4 * 3, 255);
  bytes.writeUInt32LE(header.length, 0);
  header.copy(bytes, 4);
  return bytes;
}

function fixture(t, publishRename) {
  const runtime = path.resolve('.runtime');
  fs.mkdirSync(runtime, {recursive: true});
  const base = fs.realpathSync(runtime);
  const root = fs.mkdtempSync(path.join(base, 'material-export-job-'));
  const staging = path.join(root, '.runtime', 'export-jobs');
  const exports = path.join(root, 'exports');
  const jobs = createExportJobs({root, publishRename});
  t.after(async () => {
    jobs.dispose();
    assert.equal(path.dirname(fs.realpathSync(root)), base);
    await fs.promises.rm(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
  });
  return {jobs, staging, exports};
}

async function until(predicate) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(20);
  }
  assert.fail('导出任务未在测试时限内完成');
}

test('材质导出成功后保留成品，只清理自己的暂存目录', async t => {
  const {jobs, staging} = fixture(t);
  const otherStage = path.join(staging, 'other-job');
  fs.mkdirSync(otherStage, {recursive: true});
  const otherFile = path.join(otherStage, 'keep.txt');
  fs.writeFileSync(otherFile, 'existing');
  const {id} = jobs.start(bakePayload());

  await until(() => !fs.existsSync(path.join(staging, id)));
  const result = jobs.info(id);
  assert.equal(result.state, 'complete', result.error);
  assert.equal(result.result.committed, true);
  assert(fs.existsSync(path.join(result.result.folder, 'ExportFixture_Textures.zip')));
  assert.equal(fs.readFileSync(otherFile, 'utf8'), 'existing');
});

test('材质导出发布失败后清理暂存，保留已经存在的成品', async t => {
  let previous;
  const {jobs, staging, exports} = fixture(t, (_source, target) => {
    fs.mkdirSync(target);
    previous = path.join(target, 'existing.txt');
    fs.writeFileSync(previous, 'existing');
    throw Error('simulated destination collision');
  });
  const {id} = jobs.start(bakePayload());

  await until(() => !fs.existsSync(path.join(staging, id)));
  assert.equal(jobs.info(id).state, 'failed');
  assert.equal(jobs.info(id).error, 'simulated destination collision');
  assert.equal(fs.readFileSync(previous, 'utf8'), 'existing');
  assert.deepEqual(fs.readdirSync(exports), [path.basename(path.dirname(previous))]);
  assert.deepEqual(fs.readdirSync(path.dirname(previous)), ['existing.txt']);
});

test('材质导出工作线程在暂存贴图后报错时清理暂存', async t => {
  const {jobs, staging, exports} = fixture(t);
  const {id} = jobs.start(bakePayload({surface: {effects: [null]}}));

  await until(() => !fs.existsSync(path.join(staging, id)));
  assert.equal(jobs.info(id).state, 'failed');
  assert.match(jobs.info(id).error, /paint/);
  assert.deepEqual(fs.readdirSync(exports), []);
});

test('材质导出在等待重试时取消，清理暂存且不再发布', async t => {
  let attempts = 0;
  let stage;
  const {jobs, staging, exports} = fixture(t, source => {
    attempts++;
    stage = source;
    throw Object.assign(Error('simulated busy file'), {code: 'EBUSY'});
  });
  const {id} = jobs.start(bakePayload());

  await until(() => attempts > 0);
  assert(fs.existsSync(path.join(stage, 'ExportFixture_Textures.zip')));
  assert.equal(jobs.cancel(id).state, 'cancelled');
  await until(() => !fs.existsSync(path.join(staging, id)));
  assert.equal(attempts, 1);
  assert.equal(jobs.info(id).state, 'cancelled');
  assert.deepEqual(fs.readdirSync(exports), []);
});
