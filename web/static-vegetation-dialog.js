export function createStaticVegetationExporter({ api, save, ready, status, button }) {
  const dialog = document.createElement('dialog'); dialog.id = 'staticVegetationDialog';
  dialog.style.cssText = 'width:min(800px,90vw);max-height:88vh;overflow:auto;background:#132019;color:#e3eae2;border:1px solid #526b58;border-radius:12px;padding:28px';
  dialog.innerHTML = `<h2>导出 UE 静态植被</h2><p>保存工程 → 生成实际藤蔓 → 整理共享叶片 → 输出 USD 装配 → 校验完成</p>
    <p id="svStage" role="status" aria-live="polite"></p><p id="svElapsed"></p><p id="svDetail" style="white-space:pre-line;overflow-wrap:anywhere"></p>
    <section id="svResult" hidden><p id="svSummary"></p><p id="svDirectory" style="overflow-wrap:anywhere"></p>
    <p><strong>UE 5.8：使用官方 USD 导入 vegetation.usda。</strong><br>需要 USD Importer 和 Nanite Foliage 支持；配套文件一起保留。<br>软件端校验通过后，仍需在 UE 验证导入、材质及保存重载。<br>当前输出静态资产，不包含骨骼风动画；桥墩等承载模型不导出。</p></section>
    <p id="svLog" style="white-space:pre-line;overflow-wrap:anywhere;font-size:13px"></p>
    <div style="display:flex;gap:12px;flex-wrap:wrap"><button id="svOpen" hidden>打开输出文件夹</button><button id="svCopy" hidden>复制 USD 导入路径</button><button id="svRetry" hidden>重新保存并导出</button><button id="svClose">关闭</button></div>`;
  document.body.append(dialog); const $ = id => dialog.querySelector('#' + id);
  for (const b of dialog.querySelectorAll('button')) b.style.cssText = 'padding:8px 12px;min-height:36px;border:1px solid #526b58;border-radius:5px';
  let running = false, job = null, timer;
  const close = () => { if (!running) dialog.close(); };
  $('svClose').onclick = close; dialog.oncancel = e => { e.preventDefault(); close(); };
  dialog.addEventListener('keydown', e => e.stopPropagation()); dialog.addEventListener('keyup', e => e.stopPropagation());
  $('svOpen').onclick = async () => { try { await api('/api/open-pve-output', { job_id: job.job_id }); } catch (e) { $('svDetail').textContent = e.message; } };
  $('svCopy').onclick = async () => { try { await navigator.clipboard.writeText(job.entry_path); $('svDetail').textContent = '已复制 USD 入口：' + job.entry_path; } catch { $('svDetail').textContent = '请复制此路径：' + job.entry_path; } };
  $('svRetry').onclick = () => { dialog.close(); run(); };
  async function run() {
    if (running) return;
    running = true; button.disabled = true; $('svClose').disabled = true;
    for (const id of ['svResult', 'svOpen', 'svCopy', 'svRetry']) $(id).hidden = true;
    $('svLog').textContent = ''; $('svDetail').textContent = ''; $('svElapsed').textContent = '';
    let started = Date.now();
    try {
      const pending = sessionStorage.getItem('staticVegetationJob');
      if (!pending) {
        job = null; ready(); status('保存软件工程 · 尚未生成静态植被包', 'busy');
        const saved = await save(); if (!saved) { status('已取消静态植被导出', 'ready'); return; }
        dialog.showModal(); $('svStage').textContent = '生成实际藤蔓 · 正在启动';
        job = await api('/api/export-static-vegetation', { project_path: saved.path, output_dir: saved.path.replace(/\.branch\.json$/i, '_UE_Static'), keep_history: saved.keepHistory === true });
        sessionStorage.setItem('staticVegetationJob', job.job_id);
      } else { dialog.showModal(); job = { job_id: pending }; }
      timer = setInterval(() => { $('svElapsed').textContent = `已运行 ${Math.floor((Date.now() - started) / 1000)} 秒 · 后台导出中，请保留软件运行`; }, 1000);
      let failures = 0;
      for (;;) {
        try { job = await api('/api/export-pve-status?id=' + job.job_id); failures = 0; }
        catch (e) { if (++failures >= 5) throw Error('无法读取状态，任务可能仍在运行。关闭后重新点击导出可恢复查询。' + e.message); await new Promise(r => setTimeout(r, 1000)); continue; }
        if (job.started) started = Date.parse(job.started);
        $('svStage').textContent = job.stage; $('svDetail').textContent = job.detail;
        $('svLog').textContent = `运行日志：${job.log_path}\n错误日志：${job.error_log_path}`;
        if (job.state === 'failed') { sessionStorage.removeItem('staticVegetationJob'); throw Error(job.detail); }
        if (job.state === 'succeeded') break;
        status(job.stage, 'busy'); await new Promise(r => setTimeout(r, 750));
      }
      sessionStorage.removeItem('staticVegetationJob');
      if (!job.validation?.valid || !job.entry_path?.endsWith('.usda')) throw Error('任务结束但缺少完整的 USD 校验结果');
      $('svSummary').textContent = `${job.name} · ${job.branches} 段藤干 · ${job.leaves} 片叶 · ${job.prototypes} 个共享原型 · ${job.assembly_count} 个静态装配`;
      $('svDetail').textContent = `软件端校验通过，待 UE 导入验证。\n${job.shared_leaves} 片叶复用原型，${job.baked_leaves} 片保留独有几何。\n展开面数 ${job.triangles.toLocaleString()}，基础网格与原型面数 ${job.stored_triangles.toLocaleString()}；这是几何统计，不是 UE 内存测量。`;
      for (const warning of [...(job.warnings || []), ...(job.maintenance_warnings || [])]) $('svDetail').textContent += '\n' + warning;
      $('svDirectory').textContent = '输出目录：' + job.output_dir;
      if (job.keep_history && job.previous_dir) $('svDirectory').textContent += '\n历史备份：' + job.previous_dir;
      for (const id of ['svResult', 'svOpen', 'svCopy']) $(id).hidden = false;
      status('UE 静态植被包已生成 · 软件端校验通过', 'ready');
    } catch (e) {
      if (!dialog.open) dialog.showModal();
      $('svStage').textContent = '导出失败 · ' + (job?.stage || '保存工程 / 启动任务'); $('svDetail').textContent = e.message;
      if (!$('svLog').textContent) $('svLog').textContent = '服务日志：软件目录下 .runtime/server.log';
      status('静态植被导出失败', 'error');
    } finally {
      clearInterval(timer); $('svElapsed').textContent = dialog.open ? `本次处理 ${Math.max(0, Math.floor((Date.now() - started) / 1000))} 秒` : '';
      running = false; button.disabled = false; $('svClose').disabled = false; $('svRetry').hidden = false;
      $('svRetry').textContent = sessionStorage.getItem('staticVegetationJob') ? '恢复查询运行状态' : '重新保存并导出';
    }
  }
  return { run };
}
