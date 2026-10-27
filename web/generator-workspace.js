import { createSculptLayerWindow, requiresRetainedLayers } from './sculpt-layer-window.js';
import {axisTimes} from './branch-axis.js';
import * as THREE from 'three';
import { normalizeGenerator, curvePoints, profileValue } from './generator-data.js';
import { lineTangent, sampleLine } from './tree-sculpt.js';

const $ = (id) => document.getElementById(id);
const icon = (name) => `<i data-lucide="${name}"></i>`;
const button = (id, name, title) => `<button id="${id}" type="button" title="${title}" aria-label="${title}">${icon(name)}</button>`;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const labels = ['主干', '一级侧枝', '二级侧枝', '三级侧枝'];
const profiles = { branch_length: '枝长', branch_density: '分叉概率', branch_angle: '分叉角度', radius_taper: '粗细轮廓', leaf_density: '叶片概率', leaf_scale: '叶片尺寸' };
const modes = { LEGACY: '原始分叉', COUNT: '定量', INTERVAL: '等距', WHORLED: '轮生', BEND: '弯曲处分叉' };
const curveKeys = ['curve_knots', 'curve_samples', 'curve_sample_times', 'curve_reference_knots', 'curve_parent_frame', 'frozen_points'];

export function createGeneratorWorkspace({ getAuthoring, getAsset, getSelection, setSelection, modelRoot, isVisible, transact, begin, preview, commit, cancel, isEditing, status, canvas, camera, controls, setTool }) {
  let selected = 'LEVEL_1', profile = 'branch_length', knot = 1, dragging = false;
  let baseline = [], baselineAsset = null;
  let rangeMode = '', rangeDrag = null;
  const rangeRoot = new THREE.Group(); rangeRoot.name = '生长范围端点'; modelRoot.add(rangeRoot);
  const rangeMaterials = [new THREE.MeshBasicMaterial({ color: 0xf0c965, depthTest: false }), new THREE.MeshBasicMaterial({ color: 0x61d3d0, depthTest: false })];
  const rangeRay = new THREE.Raycaster();
  const overlay = new THREE.Group(); overlay.name = '生成影响与基准'; modelRoot.add(overlay);
  const materials = [0x57bfd9, 0xe3b84b, 0xcc88d3, 0x88968c].map((color) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, depthTest: false }));
  function section(id, name, page, html) {
    const el = document.createElement('section'); el.id = id; el.className = 'parameter-section generator-workspace';
    el.innerHTML = `<h2>${name}</h2>${html}`; document.querySelector(`[data-page="${page}"]`).prepend(el); return el;
  }
  $('levelRuleList').closest('section').classList.add('legacy-authoring');
  document.querySelector('.profile-row').closest('section').classList.add('legacy-authoring');
  const panel = section('generatorPanel', '生成层级', 'structure', `
    <div class="generator-toolbar">${button('addGenerator', 'plus', '添加独立枝组')}${button('duplicateGenerator', 'copy-plus', '复制独立枝组')}${button('deleteGenerator', 'trash-2', '删除独立枝组')}<span id="generatorCount"></span></div>
    <div id="generatorTree" role="tree" aria-label="生成层级"></div>
    <div class="generator-toolbar"><label><input id="showGeneratorInfluence" type="checkbox">影响范围</label>${button('selectGeneratorBranches', 'scan', '选择该生成组的枝条')}${button('captureShapeBaseline', 'camera', '记录当前造型基准')}<label><input id="showShapeBaseline" type="checkbox">基准</label>${button('editGenerationRange', 'move-horizontal', '在母枝上调整生长起点和终点')}</div>
    <div id="generatorInfluence" class="generator-status"></div>
    <div id="generatorFields"></div>
    <div class="generator-subhead"><strong>分布曲线</strong><span id="curveScope"></span></div>
    <select id="curveScopeMode" aria-label="曲线作用范围"><option value="GLOBAL">整树共享曲线</option><option value="LEVEL">当前生成层曲线</option><option value="GROUP">独立枝组曲线</option></select>
    <div class="generator-pair"><select id="generatorProfile" aria-label="分布参数">${Object.entries(profiles).map(([key, value]) => `<option value="${key}">${value}</option>`).join('')}</select><select id="curveInterpolation" aria-label="曲线插值"><option value="LINEAR">线性</option><option value="SMOOTH">平滑</option></select></div>
    <svg id="generatorCurve" viewBox="0 0 300 156" tabindex="0" role="application" aria-label="分布曲线编辑器"></svg>
    <div class="generator-axis"><span id="curveAxis">母枝根部</span><span>枝梢</span></div>
    <div class="generator-toolbar"><select id="curvePreset" aria-label="曲线预设"><option value="">曲线预设</option><option value="FLAT">均匀</option><option value="TIP">向梢增加</option><option value="ROOT">向根增加</option><option value="MIDDLE">中部饱满</option></select>${button('addCurvePoint', 'plus', '添加曲线控制点')}${button('removeCurvePoint', 'minus', '删除选中控制点')}${button('resetGeneratorCurve', 'rotate-ccw', '恢复该曲线默认值')}</div>
    <div class="generator-pair"><label>位置<input id="curvePointX" type="number" min="0" max="1" step="0.01"></label><label><span id="curveValueLabel">倍率</span><input id="curvePointY" type="number" min="0" max="3" step="0.05"></label></div>`);
  const foliage = section('foliageRangePanel', '叶片生长范围', 'foliage', `<div class="generator-toolbar">${button('editFoliageRange', 'move-horizontal', '在枝条上调整叶片生长范围')}</div><div id="foliageRangeFields"></div>`);
  const layers = section('sculptLayersPanel', '雕刻层', 'edit', `
    <div class="generator-toolbar">${button('addSculptLayer', 'plus', '添加雕刻层')}${button('bakeSculptLayers', 'layers-2', '合并可见雕刻层到局部曲线')}<span id="sculptLayerCount"></span></div><div id="sculptLayerList"></div>`);
  const overridePanel = document.createElement('div'); overridePanel.className = 'generator-overrides'; overridePanel.id = 'overrideProperties';
  $('selectedBranchLabel').closest('section').append(overridePanel);
  const group = (a = getAuthoring()) => a.generator_groups.find((g) => g.id === selected);
  const level = () => Number(selected.replace('LEVEL_', '')) || 0;
  const rule = (a = getAuthoring()) => group(a) || a.generation_rules[level()];
  const profileStore = (a = getAuthoring()) => group(a)?.profiles || (rule(a).use_profiles ? rule(a).profiles : a.profiles);
  const profileMaximum = () => ['branch_density', 'leaf_density'].includes(profile) ? 1 : 3;
  const apply = (label, fn) => transact(label, fn);
  function gesture(input, fn) {
    input.addEventListener('pointerdown', () => { if (input.type === 'range') begin(); });
    input.addEventListener('input', () => {
      if (input.type !== 'range' || !input.validity.valid) return;
      preview((a) => fn(a, Number(input.value)));
      const numberField = input.parentElement.querySelector('input[type=number]'); if (numberField) numberField.value = input.value;
      input.parentElement.querySelector('output')?.replaceChildren(document.createTextNode(Number(input.value).toFixed(2)));
    });
    input.addEventListener('change', () => {
      if (!input.validity.valid || input.value === '') { cancel(); refresh(); return; }
      if (input.type === 'range') { preview((a) => fn(a, Number(input.value))); commit(); }
      else apply('已调整生成参数', (a) => fn(a, Number(input.value)));
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cancel(); refresh(); } });
    input.addEventListener('pointercancel', () => { cancel(); refresh(); });
  }
  function numeric(parent, key, title, value, min, max, step, change, slider = true) {
    const label = document.createElement('label'); label.className = 'generator-field';
    label.innerHTML = `<span>${title}</span><input data-generator-field="${key}" aria-label="${title}" type="number" min="${min}" max="${max}" step="${step}"><input aria-label="${title}滑条" data-generator-range="${key}" type="range" min="${min}" max="${max}" step="${step}">`;
    label.querySelectorAll('input').forEach((input) => { input.value = value; gesture(input, change); });
    if (!slider) label.querySelector('[type=range]').remove(); parent.append(label);
  }
  function rangeFields(parent, key, value, getter) {
    const wrapper = document.createElement('div'); wrapper.className = 'generator-range';
    wrapper.innerHTML = '<div class="generator-axis"><span>根部 0%</span><span>枝梢 100%</span></div><div class="generator-range-band"></div><div class="generator-pair"></div>';
    wrapper.querySelector('.generator-range-band').style.background = `linear-gradient(to right, #343e38 0% ${value.start * 100}%, #5caaa5 ${value.start * 100}% ${value.end * 100}%, #343e38 ${value.end * 100}% 100%)`;
    for (const [field, name] of [['start', '起点'], ['end', '终点']]) numeric(wrapper.lastElementChild, `${key}_${field}`, name, value[field], 0, 1, 0.01, (a, v) => {
      const r = getter(a); r[field] = field === 'start' ? Math.min(v, r.end) : Math.max(v, r.start);
      wrapper.querySelector('.generator-range-band').style.background = `linear-gradient(to right, #343e38 0% ${r.start * 100}%, #5caaa5 ${r.start * 100}% ${r.end * 100}%, #343e38 ${r.end * 100}% 100%)`;
    });
    parent.append(wrapper);
  }
  function selectField(parent, key, name, options, value, change) {
    const label = document.createElement('label'); label.className = 'generator-field'; label.append(document.createTextNode(name));
    const select = document.createElement('select'); select.dataset.generatorField = key; select.setAttribute('aria-label', name);
    Object.entries(options).forEach(([id, text]) => select.add(new Option(text, id))); select.value = value;
    select.addEventListener('change', () => apply('已调整生成规则', (a) => change(a, select.value))); label.append(select); parent.append(label);
  }
  function drawFields() {
    const a = getAuthoring(), g = group(a), r = rule(a), n = level(); const fields = $('generatorFields'); fields.replaceChildren();
    const heading = document.createElement('div'); heading.className = 'generator-subhead';
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = g ? g.enabled : a.level_rules[n].enabled; enabled.title = '启用此生成组';
    enabled.addEventListener('change', () => apply('已切换生成组', (next) => { if (g) group(next).enabled = enabled.checked; else next.level_rules[n].enabled = enabled.checked; }));
    const name = document.createElement(g ? 'input' : 'strong');
    if (g) { name.value = g.name; name.maxLength = 64; name.setAttribute('aria-label', '生成组名称'); name.addEventListener('change', () => apply('已重命名生成组', (next) => { group(next).name = name.value; })); }
    else name.textContent = `${labels[n]} · 层级参数`;
    heading.append(enabled, name); fields.append(heading);
    if (g) {
      selectField(fields, 'order', '分叉层级', { 1: labels[1], 2: labels[2], 3: labels[3] }, g.order, (next, v) => { group(next).order = Number(v); group(next).parent_group = 'ANY'; });
      const parents = { ANY: `全部 L${g.order - 1} 母枝`, [`LEVEL_${g.order - 1}`]: labels[g.order - 1] };
      a.generator_groups.filter((other) => other.order === g.order - 1).forEach((other) => { parents[other.id] = other.name; });
      if (!parents[g.parent_group]) parents[g.parent_group] = `待匹配：${g.parent_group}`;
      selectField(fields, 'parent_group', '母生成组', parents, g.parent_group, (next, v) => { group(next).parent_group = v; });
    }
    if (g || n > 0) {
      selectField(fields, 'mode', '分叉方式', g ? Object.fromEntries(Object.entries(modes).filter(([k]) => k !== 'LEGACY')) : modes, r.mode, (next, v) => { rule(next).mode = v; });
      if (r.mode !== 'LEGACY') {
        rangeFields(fields, 'generation', r, rule);
        const definitions = r.mode === 'COUNT' ? [['count', '每根母枝数量', 0, 40, 1]] : r.mode === 'WHORLED' ? [['layers', '轮生层数', 1, 20, 1], ['per_layer', '每层枝数', 1, 12, 1]] : [['spacing', '最小间距 (m)', 0.03, 5, 0.01]];
        if (r.mode === 'BEND') definitions.push(['threshold', '弯曲阈值 (°)', 0, 90, 1]);
        definitions.push(['rotation', '环向旋转 (°)', -180, 180, 1]);
        for (const [key, title, min, max, step] of definitions) numeric(fields, key, title, r[key], min, max, step, (next, v) => { rule(next)[key] = v; });
      }
    }
    const grid = document.createElement('div'); grid.className = 'generator-pair'; fields.append(grid);
    const data = g || a.level_rules[n]; const target = (next) => group(next) || next.level_rules[n];
    const definitions = [['length', '长度倍率', 0.05, 3, 0.05], ['radius', '粗度倍率', 0.05, 3, 0.05]];
    if (g || n > 0) definitions.push(['angle', '角度偏移 (°)', -75, 75, 1]);
    if (!g && n > 0 && r.mode === 'LEGACY') definitions.push(['count', '数量倍率', 0, 3, 0.05]);
    if (!g) definitions.push(['bend', '弯曲倍率', 0, 3, 0.05], ['gravity', '重力倍率', 0, 3, 0.05], ['leaves', '叶量倍率', 0, 3, 0.05]);
    else definitions.push(['leaf_scale', '叶片尺寸倍率', 0.05, 3, 0.05]);
    if (g) definitions.push(['leaf_scale_variation', '叶片尺寸变化 ±', 0, 1, 0.01]);
    for (const [key, title, min, max, step] of definitions) numeric(grid, key, title, data[key], min, max, step, (next, v) => { target(next)[key] = v; });
    if (!g && n === 0) numeric(grid, 'root_count', '主干数量', a.root_count, 1, 8, 1, (next, v) => { next.root_count = v; });
    if ((g || n > 0) && r.mode !== 'LEGACY') {
      const title = document.createElement('div'); title.className = 'generator-subhead'; title.textContent = '随机变化 ±'; fields.append(title);
      for (const [key, title, max, step] of [['length_variation', '长度比例', 1, 0.01], ['radius_variation', '粗度比例', 1, 0.01], ['angle_variation', '角度 (°)', 90, 1]]) numeric(fields, key, title, r[key], 0, max, step, (next, v) => { rule(next)[key] = v; });
    }
  }
  function drawTree() {
    const a = getAuthoring(), branches = getAsset()?.masterBranches || [], tree = $('generatorTree'); tree.replaceChildren();
    const nodes = labels.flatMap((name, n) => [{ id: `LEVEL_${n}`, name, order: n, enabled: a.level_rules[n].enabled }, ...a.generator_groups.filter((g) => g.order === n)]);
    for (const node of nodes) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'generator-node'; row.dataset.generator = node.id;
      row.setAttribute('role', 'treeitem'); row.setAttribute('aria-level', String(node.order + 1)); row.setAttribute('aria-selected', String(selected === node.id)); row.style.paddingLeft = `${6 + node.order * 10}px`;
      row.innerHTML = `${icon(node.enabled ? 'git-branch' : 'eye-off')}<span></span><small></small>`;
      row.querySelector('span').textContent = node.name; row.querySelector('small').textContent = branches.filter((b) => b.generatorId === node.id).length;
      row.addEventListener('click', () => { commit(); deactivateRange(); selected = node.id; knot = 1; refresh(); }); tree.append(row);
    }
    $('generatorCount').textContent = `${a.generator_groups.length} / 24 独立组`;
    $('addGenerator').disabled = a.generator_groups.length >= 24;
    $('duplicateGenerator').disabled = !group() || a.generator_groups.length >= 24; $('deleteGenerator').disabled = !group();
    $('editGenerationRange').disabled = (!group() && level() === 0) || rule().mode === 'LEGACY';
  }
  function drawCurve() {
    const value = profileStore()[profile]; const points = curvePoints(value); knot = clamp(knot, 0, points.length - 1);
    const maximum = profileMaximum();
    $('curveScope').textContent = group() ? group().name : rule().use_profiles ? labels[level()] : '整树';
    $('curveScopeMode').value = group() ? 'GROUP' : rule().use_profiles ? 'LEVEL' : 'GLOBAL';
    $('curveScopeMode').disabled = Boolean(group()); $('curveScopeMode').querySelector('[value=GROUP]').hidden = !group();
    $('curveValueLabel').textContent = maximum === 1 ? '概率' : '倍率';
    $('generatorProfile').value = profile; $('curveInterpolation').value = value.interpolation || 'LINEAR';
    $('curveAxis').textContent = ['branch_length', 'branch_density', 'branch_angle'].includes(profile) ? '母枝根部' : '自身根部';
    const x = (v) => 25 + v * 262, y = (v) => 137 - clamp(v, 0, maximum) / maximum * 124;
    let markup = '';
    for (let i = 0; i <= 4; i++) markup += `<path d="M25 ${13 + i * 31}H287 M${25 + i * 65.5} 13V137" stroke="#303c35" fill="none"/>`;
    markup += `<text x="2" y="17" fill="#98a99e" font-size="10">${maximum}×</text><text x="9" y="140" fill="#98a99e" font-size="10">0</text>`;
    markup += `<path d="${Array.from({ length: 101 }, (_, i) => `${i ? 'L' : 'M'}${x(i / 100)} ${y(profileValue(value, i / 100))}`).join(' ')}" stroke="#66c4c0" stroke-width="2" fill="none"/>`;
    points.forEach((p, i) => { markup += `<circle data-knot="${i}" cx="${x(p[0])}" cy="${y(p[1])}" r="${i === knot ? 6 : 4}" fill="${i === knot ? '#f0cb67' : '#89d0cd'}" stroke="#15221c" stroke-width="2"/>`; });
    $('generatorCurve').innerHTML = markup;
    $('curvePointX').value = Number(points[knot][0].toFixed(3)); $('curvePointX').disabled = knot === 0 || knot === points.length - 1;
    $('curvePointY').max = maximum; $('curvePointY').value = Number(Math.min(maximum, points[knot][1]).toFixed(3));
    $('removeCurvePoint').disabled = knot === 0 || knot === points.length - 1; $('addCurvePoint').disabled = points.length >= 32;
  }
  function editPoint(a, x, y) {
    const old = profileStore(a)[profile], points = curvePoints(old);
    if (knot > 0 && knot < points.length - 1) points[knot][0] = clamp(x, points[knot - 1][0] + 0.001, points[knot + 1][0] - 0.001);
    points[knot][1] = clamp(y, 0, profileMaximum());
    profileStore(a)[profile] = { points, interpolation: old.interpolation || 'LINEAR' };
  }
  function graphPosition(e) {
    const rect = $('generatorCurve').getBoundingClientRect();
    return [(300 * (e.clientX - rect.left) / rect.width - 25) / 262, (137 - 156 * (e.clientY - rect.top) / rect.height) / 124 * profileMaximum()];
  }
  const graph = $('generatorCurve');
  graph.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.target.hasAttribute('data-knot')) return;
    knot = Number(e.target.dataset.knot); dragging = true; begin(); graph.setPointerCapture(e.pointerId); drawCurve(); e.preventDefault();
  });
  graph.addEventListener('pointermove', (e) => { if (dragging) { const [x, y] = graphPosition(e); preview((a) => editPoint(a, x, y)); drawCurve(); } });
  graph.addEventListener('pointerup', () => { if (dragging) { dragging = false; commit(); refresh(); } });
  graph.addEventListener('pointercancel', () => { dragging = false; cancel(); refresh(); });
  graph.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { dragging = false; cancel(); refresh(); }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault(); const p = curvePoints(profileStore()[profile])[knot], step = e.shiftKey ? 0.01 : 0.05;
      apply('已调整曲线控制点', (a) => editPoint(a, p[0] + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), p[1] + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0)));
    }
  });
  $('generatorProfile').addEventListener('change', (e) => { profile = e.target.value; knot = 1; drawCurve(); });
  $('curveScopeMode').onchange = (e) => apply('已调整曲线作用范围', (a) => { if (group(a)) return; if (e.target.value === 'LEVEL' && !rule(a).use_profiles) rule(a).profiles = structuredClone(a.profiles); rule(a).use_profiles = e.target.value === 'LEVEL'; });
  $('curveInterpolation').addEventListener('change', (e) => apply('已调整曲线插值', (a) => { profileStore(a)[profile] = { points: curvePoints(profileStore(a)[profile]), interpolation: e.target.value }; }));
  $('curvePointX').addEventListener('change', (e) => { if (e.target.validity.valid && e.target.value !== '') apply('已调整曲线位置', (a) => editPoint(a, Number(e.target.value), curvePoints(profileStore(a)[profile])[knot][1])); else drawCurve(); });
  $('curvePointY').addEventListener('change', (e) => { if (e.target.validity.valid && e.target.value !== '') apply('已调整曲线倍率', (a) => editPoint(a, curvePoints(profileStore(a)[profile])[knot][0], Number(e.target.value))); else drawCurve(); });
  function addPoint(x) {
    apply('已添加曲线控制点', (a) => {
      const old = profileStore(a)[profile], points = curvePoints(old); if (points.length >= 32) return;
      if (x === undefined) { let gap = -1; for (let i = 1; i < points.length; i++) if (points[i][0] - points[i - 1][0] > gap) { gap = points[i][0] - points[i - 1][0]; x = (points[i][0] + points[i - 1][0]) / 2; } }
      if (x <= 0 || x >= 1 || points.some((p) => Math.abs(p[0] - x) < 0.002)) return;
      points.push([x, profileValue(old, x)]); points.sort((p, q) => p[0] - q[0]); knot = points.findIndex((p) => p[0] === x);
      profileStore(a)[profile] = { points, interpolation: old.interpolation || 'LINEAR' };
    });
  }
  graph.addEventListener('dblclick', (e) => { if (!e.target.hasAttribute('data-knot')) addPoint(clamp(graphPosition(e)[0], 0, 1)); });
  $('addCurvePoint').addEventListener('click', () => addPoint());
  $('removeCurvePoint').addEventListener('click', () => apply('已删除曲线控制点', (a) => { const old = profileStore(a)[profile], points = curvePoints(old); if (!knot || knot === points.length - 1) return; points.splice(knot, 1); knot--; profileStore(a)[profile] = { points, interpolation: old.interpolation || 'LINEAR' }; }));
  $('curvePreset').addEventListener('change', (e) => { const values = { FLAT: [1, 1, 1], TIP: [0.1, 0.5, 1], ROOT: [1, 0.5, 0.1], MIDDLE: [0.15, 1, 0.15] }[e.target.value]; if (values) apply('已应用曲线预设', (a) => { profileStore(a)[profile] = values; }); e.target.value = ''; });
  $('resetGeneratorCurve').addEventListener('click', () => apply('已重置分布曲线', (a) => { profileStore(a)[profile] = !group(a) && profile === 'branch_length' ? [0.82, 1, 0.68] : !group(a) && profile === 'leaf_density' ? [0.45, 1, 1.2] : [1, 1, 1]; }));
  $('addGenerator').addEventListener('click', () => apply('已添加独立生成组', (a) => {
    if (a.generator_groups.length >= 24) return; const id = `GROUP_${Date.now()}`;
    const order = group(a)?.order || clamp(level(), 1, 3); a.generator_groups.push(normalizeGenerator({ id, order }, a.generator_groups.length + 1)); selected = id;
  }));
  $('duplicateGenerator').addEventListener('click', () => apply('已复制独立生成组', (a) => { if (!group(a) || a.generator_groups.length >= 24) return; const copy = structuredClone(group(a)); copy.id = `GROUP_${Date.now()}`; copy.name += ' 副本'; a.generator_groups.push(copy); selected = copy.id; }));
  $('deleteGenerator').addEventListener('click', () => apply('已删除独立生成组', (a) => { if (!group(a)) return; a.generator_groups = a.generator_groups.filter((g) => g.id !== selected); selected = 'LEVEL_1'; }));
  $('selectGeneratorBranches').addEventListener('click', () => setSelection(new Set((getAsset()?.masterBranches || []).filter((b) => b.generatorId === selected && isVisible(b.stableId)).map((b) => b.stableId))));
  $('showGeneratorInfluence').addEventListener('change', drawOverlay);
  $('captureShapeBaseline').addEventListener('click', () => { baseline = (getAsset()?.masterBranches || []).map((b) => b.points.map((p) => p.clone())); baselineAsset = getAsset(); $('showShapeBaseline').checked = true; drawOverlay(); });
  $('showShapeBaseline').addEventListener('change', drawOverlay);
  function clearRange() { rangeRoot.children.forEach((child) => child.geometry.dispose()); rangeRoot.clear(); }
  function drawRange() {
    clearRange(); if (!rangeMode) return;
    const a = getAuthoring(), r = rangeMode === 'FOLIAGE' ? a.foliage_range : rule(a);
    const selectedIds = getSelection();
    const parents = (getAsset()?.masterBranches || []).filter((b) => isVisible(b.stableId) && (rangeMode === 'FOLIAGE'
      ? selectedIds.size ? selectedIds.has(b.stableId) : b.generatorId === selected
      : b.order === (group()?.order || level()) - 1 && (!group() || group().parent_group === 'ANY' || group().parent_group === b.generatorId)));
    for (const b of parents) {
      for (const [index, field] of ['start', 'end'].entries()) {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.016, (getAsset()?.settings.length || 2.4) * 0.012), 12, 8), rangeMaterials[index]);
        marker.position.copy(sampleLine(b.points, r[field])); marker.userData = { field, branch: b }; marker.renderOrder = 12; rangeRoot.add(marker);
      }
      const points = Array.from({ length: 25 }, (_, i) => sampleLine(b.points, r.start + (r.end - r.start) * i / 24));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), materials[0]); line.renderOrder = 10; rangeRoot.add(line);
    }
  }
  function cancelRange() { if (!rangeDrag) return false; const old = rangeDrag; rangeDrag = null; cancel(); if (canvas.hasPointerCapture(old.pointerId)) canvas.releasePointerCapture(old.pointerId); controls.enabled = true; refresh(); return true; }
  function deactivateRange() { cancelRange(); rangeMode = ''; clearRange(); $('editGenerationRange').classList.remove('active'); $('editFoliageRange').classList.remove('active'); }
  function toggleRange(value) { const previous = rangeMode; setTool('SELECT'); rangeMode = previous === value ? '' : value; $('editGenerationRange').classList.toggle('active', rangeMode === 'BRANCH'); $('editFoliageRange').classList.toggle('active', rangeMode === 'FOLIAGE'); drawRange(); }
  $('editGenerationRange').onclick = () => toggleRange('BRANCH'); $('editFoliageRange').onclick = () => toggleRange('FOLIAGE');
  function beginRange(e) {
    if (!rangeMode || e.button !== 0) return false;
    if (getAsset()?.group.userData.pending_rebuild) return true;
    const rect = canvas.getBoundingClientRect(); rangeRay.setFromCamera(new THREE.Vector2((e.clientX - rect.x) / rect.width * 2 - 1, -(e.clientY - rect.y) / rect.height * 2 + 1), camera); rangeRoot.updateMatrixWorld(true);
    const hit = rangeRay.intersectObjects(rangeRoot.children.filter((c) => c.isMesh))[0]; if (!hit) return true;
    begin(); rangeDrag = { pointerId: e.pointerId, field: hit.object.userData.field, points: hit.object.userData.branch.points.map((p) => p.clone()) };
    canvas.setPointerCapture(e.pointerId); controls.enabled = false; return true;
  }
  function moveRange(e) {
    if (!rangeMode) return false; if (!rangeDrag) return true;
    const rect = canvas.getBoundingClientRect(), points = rangeDrag.points.map((p) => { const q = modelRoot.localToWorld(p.clone()).project(camera); return new THREE.Vector2(rect.x + (q.x + 1) * rect.width / 2, rect.y + (1 - q.y) * rect.height / 2); });
    const pointer = new THREE.Vector2(e.clientX, e.clientY); let best = Infinity, t = 0;
    for (let i = 0; i < points.length - 1; i++) { const d = points[i + 1].clone().sub(points[i]), f = clamp(pointer.clone().sub(points[i]).dot(d) / Math.max(1e-8, d.lengthSq()), 0, 1); const distance = pointer.distanceToSquared(points[i].clone().addScaledVector(d, f)); if (distance < best) { best = distance; t = (i + f) / (points.length - 1); } }
    preview((a) => { const r = rangeMode === 'FOLIAGE' ? a.foliage_range : rule(a), key = rangeDrag.field; r[key] = key === 'start' ? Math.min(t, r.end) : Math.max(t, r.start); }); drawRange(); return true;
  }
  function endRange(e) { if (!rangeMode || e.button !== 0) return false; if (rangeDrag) { const id = rangeDrag.pointerId; rangeDrag = null; controls.enabled = true; if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); commit(); refresh(); } return true; }
  canvas.addEventListener('lostpointercapture', cancelRange);
  function drawOverlay() {
    overlay.children.forEach((child) => child.geometry.dispose()); overlay.clear();
    const branches = getAsset()?.masterBranches || [], a = getAuthoring();
    const direct = new Set(branches.filter((b) => b.generatorId === selected).map((b) => b.id)); const follows = new Set(direct);
    let changed = true; while (changed) { changed = false; for (const b of branches) if (follows.has(b.parentId) && !follows.has(b.id)) { follows.add(b.id); changed = true; } }
    let local = 0;
    const line = (points, material) => { const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material); mesh.renderOrder = 9; overlay.add(mesh); };
    for (const b of branches) if (follows.has(b.id)) {
      const edited = Boolean(a.overrides[b.stableId]?.curve_knots || b.layerIds?.length); if (edited) local++;
      if ($('showGeneratorInfluence').checked && isVisible(b.stableId)) line(b.points, materials[edited ? 2 : direct.has(b.id) ? 0 : 1]);
    }
    $('generatorInfluence').textContent = `直接 ${direct.size} · 子枝 ${follows.size - direct.size} · 手调 ${local}`;
    if ($('showShapeBaseline').checked) baseline.forEach((points) => line(points, materials[3]));
    $('showShapeBaseline').disabled = !baseline.length;
    $('captureShapeBaseline').title = baselineAsset === getAsset() ? '基准已记录' : '记录当前造型基准';
  }
  const layerWindow=createSculptLayerWindow();
  function drawLayers() {
    const a = getAuthoring(), list = $('sculptLayerList'); list.replaceChildren();
    $('sculptLayerCount').textContent = `${a.sculpt_layers.length} 条编辑记录`;
    $('addSculptLayer').disabled = false; $('bakeSculptLayers').disabled = !a.sculpt_layers.some((l) => l.enabled);
    if (requiresRetainedLayers(a.sculpt_layers)) {
      $('bakeSculptLayers').disabled = true;
      $('bakeSculptLayers').title = '这些操作保留挂接与粗细关系，无需合并即可继续编辑；较早记录会自动折叠';
    } else $('bakeSculptLayers').title = '';
    const branches = getAsset()?.masterBranches || [], byId = new Map(branches.map((b) => [b.id, b])),byStable=new Map();
    // Preserve find's first match, including older data with duplicate IDs.
    for(const branch of branches)if(!byStable.has(branch.stableId))byStable.set(branch.stableId,branch);
    layerWindow(list,a.sculpt_layers,drawLayers).forEach(([index,layer]) => {
      const row = document.createElement('div'); row.className = 'sculpt-layer-row'; row.dataset.layer = layer.id;
      row.innerHTML = `<div class="generator-toolbar"><input data-active type="radio" name="activeSculptLayer" title="当前编辑层"><input data-enabled type="checkbox" title="显示雕刻层"><input data-name aria-label="雕刻层名称" maxlength="64">${button('', 'chevron-up', '上移雕刻层')}${button('', 'chevron-down', '下移雕刻层')}${button('', 'trash-2', '删除雕刻层')}</div><label class="layer-strength">强度 <output>${layer.strength.toFixed(2)}</output><input data-strength aria-label="雕刻层强度" type="range" min="0" max="1" step="0.01"></label><small></small>`;
      const find = (next) => next.sculpt_layers.find((l) => l.id === layer.id);
      row.querySelector('[data-active]').checked = a.active_sculpt_layer === layer.id;
      row.querySelector('[data-active]').disabled = Boolean(layer.operation);
      row.querySelector('[data-active]').title = layer.enabled && layer.strength === 1 && a.sculpt_layers.filter((l) => l.enabled && l.strength > 0).at(-1)?.id === layer.id ? '当前编辑层' : '在此状态继续雕刻将追加顶层';
      row.querySelector('[data-enabled]').checked = layer.enabled; row.querySelector('[data-name]').value = layer.name; row.querySelector('[data-strength]').value = layer.strength;
      row.querySelector('[data-active]').addEventListener('change', () => apply('已切换编辑层', (next) => { next.active_sculpt_layer = layer.id; }));
      row.querySelector('[data-enabled]').addEventListener('change', (e) => apply('已切换雕刻层显示', (next) => { find(next).enabled = e.target.checked; }));
      row.querySelector('[data-name]').addEventListener('change', (e) => apply('已重命名雕刻层', (next) => { find(next).name = e.target.value; }));
      gesture(row.querySelector('[data-strength]'), (next, v) => { find(next).strength = v; });
      const buttons = row.querySelectorAll('button'); buttons[0].disabled = index === 0; buttons[1].disabled = index === a.sculpt_layers.length - 1;
      buttons[0].onclick = () => apply('已调整雕刻层顺序', (next) => { [next.sculpt_layers[index - 1], next.sculpt_layers[index]] = [next.sculpt_layers[index], next.sculpt_layers[index - 1]]; });
      buttons[1].onclick = () => apply('已调整雕刻层顺序', (next) => { [next.sculpt_layers[index + 1], next.sculpt_layers[index]] = [next.sculpt_layers[index], next.sculpt_layers[index + 1]]; });
      buttons[2].onclick = () => apply('已删除雕刻层', (next) => { next.sculpt_layers.splice(index, 1); });
      const activeRecords = Object.entries(layer.branches).filter(([id, record]) => { const b = byStable.get(id); return b && record.parent === (byId.get(b.parentId)?.stableId || ''); }).length;
      row.querySelector('small').textContent = `${activeRecords} 枝 · ${Object.keys(layer.branches).length - activeRecords} 条待匹配`;
      if (layer.operation?.type === 'ROOT_SCALE') row.querySelector('small').textContent = `${layer.operation.targets.length} 束 · 枝根缩放 · 单元枝大小保持`;
      if (layer.operation?.type === 'RADIUS') row.querySelector('small').textContent = `${layer.operation.targets.length} 束 · ${layer.operation.point ? '控制点后段' : '整束'}粗细 ×${Number(layer.operation.factor.toFixed(3))} · 长度与单元枝保持`;
      if (layer.operation?.type === 'POINT_SLIDE') row.querySelector('small').textContent = `${layer.operation.root} · 控制点 ${layer.operation.point+1} 沿枝滑动 · 树形保持`;
      if (layer.operation?.type === 'POINT_SCALE') row.querySelector('small').textContent = `${layer.operation.root} · 控制点 ${layer.operation.point+1} 向梢缩放 · 后段控制点重排`;
      if (layer.operation?.type === 'POINT_ROTATE') row.querySelector('small').textContent = `${layer.operation.root} · 控制点 ${layer.operation.point + 1} 向梢旋转 · 保持枝长`;
      if(layer.operation?.type==='CONTROL_CURVE')row.querySelector('small').textContent=`${layer.operation.root} · ${layer.operation.knots.length} 个控制点决定走势`;
      if (layer.operation && !['DUPLICATE','ROOT_SCALE','POINT_ROTATE','POINT_SCALE','POINT_SLIDE','CONTROL_CURVE','RADIUS'].includes(layer.operation.type)) {
        const edit = document.createElement('button'); edit.textContent = '编辑造型参数';
        edit.onclick = () => layer.operation.type === 'MOUNT' ? document.dispatchEvent(new CustomEvent('branch-mount-edit',{detail:layer.id})) : window.__branchForge.workbench.deformation.activate(layer.operation.type, layer.id);
        row.querySelector('small').textContent = `${layer.operation.targets.length} 个造型目标`; row.append(edit);
      }
      if (['MOUNT','DUPLICATE'].includes(layer.operation?.type)) {
        row.querySelector('[data-strength]').disabled = true;
        buttons[0].disabled = true; buttons[1].disabled = true;
      }
      list.append(row);
    });
    window.lucide?.createIcons({nodes:[list]});
    if (!a.sculpt_layers.length) { const empty = document.createElement('div'); empty.className = 'generator-status'; empty.textContent = '当前：局部曲线编辑'; list.append(empty); }
  }
  $('addSculptLayer').addEventListener('click', () => apply('已添加雕刻层', (a) => { const id = `SCULPT_${Date.now()}`; a.sculpt_layers.push({ id, name: `雕刻层 ${a.sculpt_layers.length + 1}`, enabled: true, strength: 1, branches: {} }); a.active_sculpt_layer = id; }));
  $('bakeSculptLayers').addEventListener('click', () => {
    if (requiresRetainedLayers(getAuthoring().sculpt_layers)) { status('保留原始操作即可继续编辑，无需合并', 'ready'); return; }
    if (getAsset()?.group.userData.pending_rebuild) { status('模型更新后可合并雕刻层', 'busy'); return; }
    transact('已合并可见雕刻层', (a) => {
      const branches = getAsset()?.masterBranches || [], byId = new Map(branches.map((b) => [b.id, b]));
      for (const b of branches) {
        if (a.sculpt_layers.some((l) => l.enabled && (['POSE', 'VOLUME'].includes(l.operation?.type) || l.branches[b.stableId]?.sections?.length))) { a.overrides[b.stableId] ||= {}; a.overrides[b.stableId].sections = structuredClone(b.sections); }
        const parent = byId.get(b.parentId), t = b.parentT;
        const tangent = parent ? lineTangent(parent.points, t).toArray() : [0, 0, 1];
        a.overrides[b.stableId] = { ...a.overrides[b.stableId], curve_knots: b.controlPoints.map((p) => p.toArray()), curve_reference_knots: b.controlPoints.map((p) => p.toArray()), curve_samples: b.points.map((p) => p.toArray()), curve_sample_times: axisTimes(b.points)?[...axisTimes(b.points)]:null, frozen_points: null, locked: false, curve_parent_frame: parent ? { parent: parent.stableId, tangent } : null };
        if (parent) a.overrides[b.stableId].offset = b.points[0].clone().sub(sampleLine(parent.points, b.parentT)).toArray();
      }
      a.sculpt_layers = a.sculpt_layers.filter((l) => {
        if (!l.enabled) return true;
        l.branches = Object.fromEntries(Object.entries(l.branches).filter(([id, record]) => { const b = branches.find((b) => b.stableId === id); return !b || record.parent !== (byId.get(b.parentId)?.stableId || ''); }));
        return Object.keys(l.branches).length > 0;
      }); a.active_sculpt_layer = '';
    }, { bypassLayers: true });
  });
  function drawOverrides() {
    overridePanel.replaceChildren(); const ids = [...getSelection()], a = getAuthoring(); if (!ids.length) return;
    const title = document.createElement('div'); title.className = 'generator-subhead'; title.textContent = '参数来源'; overridePanel.append(title);
    const definitions = [['length', '长度', 1], ['radius', '粗度', 1], ['bend', '弯曲', 1], ['leaf_density', '叶量', 1], ['rotation', '旋转', [0, 0, 0]], ['offset', '偏移', [0, 0, 0]], ['curve', '曲线', null]];
    for (const [key, name, value] of definitions) {
      const changed = ids.filter((id) => key === 'curve' ? a.overrides[id]?.curve_knots || a.sculpt_layers.some((l) => l.branches[id]) : JSON.stringify(a.overrides[id]?.[key] ?? value) !== JSON.stringify(value));
      const row = document.createElement('div'); row.className = 'override-source'; row.innerHTML = `<span>${name}</span><small>${changed.length ? `局部 ${changed.length} / ${ids.length}` : '程序'}</small>${button('', 'rotate-ccw', `恢复所选枝条的${name}`)}`;
      row.querySelector('button').disabled = !changed.length;
      row.querySelector('button').onclick = () => transact(`已恢复所选枝条的${name}`, (next) => { for (const id of ids) {
        if (key === 'curve') {
          if (next.overrides[id]) { curveKeys.forEach((field) => { next.overrides[id][field] = null; }); next.overrides[id].locked = false; next.overrides[id].pinned_points = []; next.overrides[id].sculpt_mask = []; }
          next.sculpt_layers.forEach((l) => { delete l.branches[id]; });
        } else if (next.overrides[id]) next.overrides[id][key] = structuredClone(value);
      } }, { bypassLayers: true });
      overridePanel.append(row);
    }
  }
  function refresh({selectionOnly=false}={}) {
    if (isEditing() || dragging) return;
    if(selectionOnly){drawOverrides();drawRange();window.lucide?.createIcons({root:overridePanel});return;}
    if (!selected.startsWith('LEVEL_') && !group()) selected = 'LEVEL_1';
    if (rangeMode === 'BRANCH' && (rule().mode === 'LEGACY' || (!group() && level() === 0))) deactivateRange();
    drawTree(); drawFields(); drawCurve(); drawLayers(); drawOverrides(); drawOverlay(); drawRange();
    $('foliageRangeFields').replaceChildren(); rangeFields($('foliageRangeFields'), 'foliage', getAuthoring().foliage_range, (a) => a.foliage_range);
    window.lucide?.createIcons();
  }
  window.addEventListener('blur', () => { cancelRange(); dragging = false; cancel(); refresh(); });
  refresh();
  return { refresh, get selected() { return selected; }, get rangeActive() { return Boolean(rangeMode); }, get rangeDragging() { return Boolean(rangeDrag); }, overlay, panel, foliage, layers, rangeRoot, beginRange, moveRange, endRange, cancelRange, deactivateRange,
    cancelInteractions() { if (cancelRange()) return true; if (dragging) { dragging = false; cancel(); refresh(); return true; } return false; },
    reset() { deactivateRange(); baseline = []; baselineAsset = null; $('showShapeBaseline').checked = false; $('showGeneratorInfluence').checked = false; refresh(); } };
}
