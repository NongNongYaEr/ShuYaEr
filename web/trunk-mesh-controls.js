import { createTrunkMeshPreset, normalizeTrunkMeshSettings, trunkMeshStats } from './trunk-mesh-density.js';
import {createTrunkNumberDrag} from './trunk-number-drag.js';

export function createTrunkMeshControls(api) {
  const nodes = api.containers.map(container => {
    const node = document.createElement('details'); node.className = 'trunk-mesh-controls';
    node.innerHTML = `<summary>本枝网格 · 精度 / 线框</summary>
      <div class="trunk-mesh-presets"><button data-trunk-mesh-preset="COARSE">粗</button><button data-trunk-mesh-preset="STANDARD">标准</button><button data-trunk-mesh-preset="FINE">精细</button><button data-trunk-mesh-preset="ORIGINAL">原采样</button></div>
      <div class="trunk-mesh-fields"><label>绕干基础点数<input data-trunk-mesh-value="radial_segments" type="number" min="64" max="512" step="1"></label><label>沿枝段长 cm<input data-trunk-mesh-value="segment_length" type="number" min="0.5" max="200" step="any"></label><label>局部采样精度<input data-trunk-mesh-value="detail_samples" type="number" min="8" max="24" step="1"></label></div>
      <div class="trunk-mesh-options"><label><input data-trunk-mesh-adaptive type="checkbox">细节区域自动加密</label><label><input data-trunk-mesh-wire type="checkbox">查看线框</label></div>
      <p data-trunk-mesh-stats></p><small data-trunk-mesh-note></small>`;
    container.append(node); return node;
  });
  let statsGeometry, stats;
  const all = selector => nodes.flatMap(node => [...node.querySelectorAll(selector)]);
  all('[data-trunk-mesh-preset]').forEach(button => button.onclick = () => api.apply(button.dataset.trunkMeshPreset === 'ORIGINAL' ? null : createTrunkMeshPreset(button.dataset.trunkMeshPreset)));
  all('[data-trunk-mesh-value]').forEach(input => {
    input.addEventListener('input', () => {
      if (input.value === '' || !input.checkValidity()) return;
      const key = input.dataset.trunkMeshValue;
      all(`[data-trunk-mesh-value="${key}"]`).filter(other => other !== input).forEach(other => other.value = input.value);
      api.edit({ [key]: Number(input.value) * (key === 'segment_length' ? .01 : 1) });
    });
    input.addEventListener('change', () => api.commit());
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (api.commit()) input.blur(); } });
  });
  createTrunkNumberDrag({inputs:all('[data-trunk-mesh-value]'),canStart:()=>api.state().editable&&!api.state().active,
    step:input=>(input.dataset.trunkMeshValue==='segment_length' ? .5 : 1)/8,
    integer:input=>input.dataset.trunkMeshValue!=='segment_length',cancel:()=>api.cancel()});
  all('[data-trunk-mesh-adaptive]').forEach(input => input.onchange = () => {
    const mesh = normalizeTrunkMeshSettings(api.state().mesh) || createTrunkMeshPreset();
    api.apply({ ...mesh, adaptive_details: input.checked });
  });
  all('[data-trunk-mesh-wire]').forEach(input => input.onchange = () => api.setWire(input.checked));
  function update() {
    const s = api.state(), mesh = normalizeTrunkMeshSettings(s.mesh) || createTrunkMeshPreset();
    if (statsGeometry !== s.geometry) { statsGeometry = s.geometry; stats = trunkMeshStats(s.geometry); }
    for (const node of nodes) {
      node.hidden = !s.target;
      node.querySelectorAll('[data-trunk-mesh-value]').forEach(input => {
        const key = input.dataset.trunkMeshValue;
        if (!s.active || document.activeElement !== input) input.value = Number((mesh[key] * (key === 'segment_length' ? 100 : 1)).toFixed(4));
        input.disabled = !s.editable;
      });
      node.querySelectorAll('[data-trunk-mesh-preset]').forEach(button => button.disabled = !s.editable || s.active);
      const adaptive = node.querySelector('[data-trunk-mesh-adaptive]'); adaptive.checked = mesh.adaptive_details; adaptive.disabled = !s.editable || s.active;
      const wire = node.querySelector('[data-trunk-mesh-wire]'); wire.checked = s.wire; wire.disabled = !s.target || s.active;
      node.querySelector('[data-trunk-mesh-stats]').textContent = stats
        ? `${s.view === 'BASE' ? '当前大轮廓' : '当前最终效果'} · ${stats.radial_samples} 点/圈 · ${stats.rings - 1} 段 · ${stats.triangles.toLocaleString()} 面\n沿轴最大 ${ (stats.max_axial_spacing * 100).toFixed(2)} cm · 绕干最大 ${(stats.max_around_spacing * 100).toFixed(2)} cm` : '等待本枝网格';
      const interactive=s.geometry?.userData.trunkMeshSampling?.interactive_preview;
      node.querySelector('[data-trunk-mesh-note]').textContent = (s.mesh ? '本枝精度随工程保存；线框仅用于查看。' : '当前保留原采样；点「标准」或调整数值开启本枝精度。')
        + (interactive ? ' 拖动采用轻量预览，确认后恢复设定精度。' : stats?.limited ? ' 已达本枝网格上限，部分区域未达到请求精度。' : '');
      node.classList.toggle('limited', Boolean(stats?.limited&&!interactive));
    }
  }
  return { update, reveal(){const node=nodes[0];node.open=true;node.closest('details.trunk-form-panel').open=true;node.scrollIntoView({block:'nearest'});},valid: () => all('[data-trunk-mesh-value]').every(input => input.disabled || input.value !== '' && input.checkValidity()) };
}
