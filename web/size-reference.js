import * as THREE from 'three';
import { branchRadiusAt } from './branch-shaping.js';
import { referenceDefaults, normalizeReferencePreferences, formatDistance, referenceGridStep, referenceAssetBounds, branchMeasuredLength, createHumanSilhouette } from './size-reference-data.js';

const STORAGE = 'branchforge.size-reference.v1';
export function createSizeReference(api) {
  const { scene, camera, controls, canvas, grid, ground } = api;
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(STORAGE)) || {}; } catch {}
  let mode = '', prefs, current = null, bounds = new THREE.Box3(), base = new THREE.Vector3(), lastStep = 0, lastViewKey = '', lastReadoutKey = '', configDirty = true;
  const root = new THREE.Group(); root.name = '视口尺寸参照'; root.userData.editorOnly = true; scene.add(root);
  const face = new THREE.Group(), human = new THREE.Mesh(createHumanSilhouette(), new THREE.MeshBasicMaterial({ color: 0xadbcae, transparent: true, opacity: .65, side: THREE.DoubleSide, fog: false, depthWrite: false }));
  const ruler = new THREE.Group(), heightLine = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc9b86e, fog: false }));
  face.add(human, ruler, heightLine); root.add(face);
  // References have no selection semantics, including when callers raycast the scene.
  const noHit = () => {}; human.raycast = heightLine.raycast = noHit;
  const area = canvas.closest('.viewport-area');
  const button = document.createElement('button'); button.id = 'sizeReferenceBtn'; button.textContent = '尺寸参照'; button.title = '人物、厘米尺与实际尺寸'; button.setAttribute('aria-expanded', 'false');
  const quickButton = document.createElement('button'); quickButton.id = 'toggleSizeReferenceBtn'; quickButton.textContent = '参照显隐';
  document.querySelector('.viewport-tools').prepend(quickButton, button);
  const panel = document.createElement('section'); panel.className = 'size-reference-panel'; panel.id = 'sizeReferencePanel'; panel.hidden = true;
  panel.innerHTML = `<header><strong>尺寸参照</strong><button id="srClose" aria-label="关闭尺寸参照面板">×</button></header>
    <label>显示尺寸参照<input id="srVisible" type="checkbox"></label>
    <label>人物剪影<input id="srHuman" type="checkbox"></label><label>人物身高（m）<input id="srHumanHeight" type="number" min=".5" max="3" step=".05"></label>
    <label>实体刻度尺<input id="srRuler" type="checkbox"></label><label>尺子长度<select id="srRulerLength"><option value="0.1">10 cm</option><option value="0.2">20 cm</option><option value="0.5">50 cm</option><option value="1">1 m</option></select></label>
    <label>高度标尺<input id="srHeightMark" type="checkbox"></label><label>实际尺寸读数<input id="srDimensions" type="checkbox"></label><label>刻度网格<input id="srGrid" type="checkbox"></label>
    <label>网格坐标文字<input id="srGridLabels" type="checkbox"></label>
    <label>人物位置<select id="srSide"><option value="RIGHT">树根右侧</option><option value="LEFT">树根左侧</option></select></label><label>人物离根距离（m）<input id="srGap" type="number" min="0" max="20" step=".1"></label>
    <p>人物和尺子保持真实尺寸。偏好按工作区记住；参照不参与编辑和模型导出。</p><div class="size-reference-actions"><button id="srFit">模型与参照同框</button><button id="srReset">恢复默认</button></div>`;
  area.append(panel);
  const readout = document.createElement('div'); readout.className = 'size-reference-readout'; readout.id = 'sizeReferenceReadout'; area.append(readout);
  const labels = document.createElement('div'); labels.className = 'size-reference-labels'; area.append(labels);
  const label = (key, gridLabel = false) => { const node = document.createElement('span'); node.className = 'size-reference-label' + (gridLabel ? ' grid-label' : ''); node.dataset.reference = key; labels.append(node); return node; };
  const humanLabel = label('human'), rulerLabels = [label('ruler-start'), label('ruler-end')], heightLabel = label('height'), gridLabels = Array.from({ length: 7 }, (_, i) => label('grid-' + i, true));
  const fields = { srVisible: 'visible', srGridLabels: 'gridLabels', srHuman: 'human', srRuler: 'ruler', srHeightMark: 'heightMark', srDimensions: 'dimensions', srGrid: 'grid', srHumanHeight: 'humanHeight', srRulerLength: 'rulerLength', srSide: 'side', srGap: 'gap' };
  const el = id => panel.querySelector('#' + id);
  function sync() {
    el('srSide').options[0].textContent = mode === 'VINE' ? '藤蔓右侧' : '树根右侧';
    el('srSide').options[1].textContent = mode === 'VINE' ? '藤蔓左侧' : '树根左侧';
    el('srGap').parentElement.firstChild.textContent = mode === 'VINE' ? '人物离藤蔓距离（m）' : '人物离根距离（m）';
    for (const [id, key] of Object.entries(fields)) { const e = el(id); if (e.type === 'checkbox') e.checked = prefs[key]; else e.value = String(prefs[key]); }
    button.classList.toggle('active', prefs.human || prefs.ruler || prefs.heightMark || prefs.dimensions);
    quickButton.classList.toggle('active', prefs.visible);
    quickButton.setAttribute('aria-pressed', String(prefs.visible));
    quickButton.title = prefs.visible ? '隐藏剪影、标尺、网格坐标文字和尺寸读数' : '恢复尺寸参照显示（保留各项设置）';
    api.setGridVisible(prefs.grid); configDirty = true;
  }
  function persist() { saved[mode] = prefs; try { localStorage.setItem(STORAGE, JSON.stringify(saved)); } catch {} sync(); }
  for (const [id, key] of Object.entries(fields)) el(id).addEventListener('change', () => {
    const e = el(id); if (e.type === 'number' && (!e.value || !e.checkValidity())) { sync(); return; }
    prefs = normalizeReferencePreferences({ ...prefs, [key]: e.type === 'checkbox' ? e.checked : e.value }, mode); persist(); update(performance.now(), true);
  });
  const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.onclick = () => { panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden)); };
  quickButton.onclick = () => {
    prefs = { ...prefs, visible: !prefs.visible };
    persist(); update(performance.now(), true);
  };
  el('srClose').onclick = close;
  panel.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); button.focus(); } });
  el('srReset').onclick = () => { prefs = referenceDefaults(mode); persist(); update(performance.now(), true); };
  el('srFit').onclick = () => { update(performance.now(), true); const box = bounds.clone(); for (const object of [human, ruler, heightLine]) if (root.visible && object.visible) box.union(new THREE.Box3().setFromObject(object)); api.fit(box); close(); };
  function lines(object, points) {
    let position = object.geometry.getAttribute('position');
    if (!position) { position = new THREE.BufferAttribute(new Float32Array(points.length * 3), 3); object.geometry.setAttribute('position', position); }
    points.forEach((p,i) => position.setXYZ(i,...p)); position.needsUpdate = true; object.geometry.computeBoundingSphere();
  }
  function buildRuler() {
    if (ruler.userData.length === prefs.rulerLength) return;
    ruler.userData.length = prefs.rulerLength;
    ruler.children.forEach(o => { o.geometry?.dispose(); o.material?.dispose(); }); ruler.clear();
    const length = prefs.rulerLength, count = length <= .2 ? Math.round(length * 100) : 10, points = [[0,0,0],[length,0,0]];
    for (let i = 0; i <= count; i++) { const x = length * i / count; points.push([x,0,0],[x,0,length * (i % 5 === 0 ? .065 : .035)]); }
    const ticks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: 0xe4cd83, fog: false })); ticks.raycast = noHit; ruler.add(ticks);
  }
  const right = new THREE.Vector3(1,0,0), front = new THREE.Vector3(0,-1,0), center = new THREE.Vector3(), size = new THREE.Vector3();
  let screenWidth = 0, screenHeight = 0;
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  function placeLabel(node, point, visible) {
    if (!visible) { node.hidden = true; return; }
    const v = point.clone().project(camera), w = screenWidth, h = screenHeight;
    const x = (v.x + 1) * w / 2, y = (1 - v.y) * h / 2;
    node.hidden = !visible || v.z < -1 || v.z > 1 || x < 90 || x > w - 45 || y < 92 || y > h - 35;
    if (!node.hidden) node.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
  }
  function update(time, force = false) {
    const nextMode = api.getMode() === 'BRANCH' ? 'BRANCH' : api.getMode() === 'VINE' ? 'VINE' : 'TREE';
    if (mode !== nextMode) { mode = nextMode; prefs = normalizeReferencePreferences(saved[mode], mode); sync(); force = true; }
    const asset = api.getAsset();
    if (asset !== current) {
      current = asset; force = true; lastReadoutKey = '';
      bounds = asset ? referenceAssetBounds(asset.group) : new THREE.Box3();
      const stem = asset?.masterBranches.find(b => b.parentId < 0 && !b.instanceId);
      base.copy(stem?.points[0] || new THREE.Vector3()); configDirty = true;
    }
    const valid = !!asset && !bounds.isEmpty(); root.visible = valid && prefs.visible && !api.isMultiview(); labels.hidden = !root.visible; readout.hidden = !root.visible || !prefs.dimensions;
    if (!valid) return;
    // Camera-linked overlays follow every rendered frame, using this frame's camera matrix.
    // Skip idle work; model bounds remain cached until the generated asset changes.
    camera.updateMatrixWorld();
    const width = canvas.clientWidth, height = canvas.clientHeight;
    screenWidth = width; screenHeight = height;
    const viewKey = [camera.matrixWorld.elements.join(','), camera.projectionMatrix.elements.join(','), controls.target.toArray().join(','), width, height, api.getSelectedBranch(), api.isSkeletonOnly(), root.visible].join('|');
    if (!force && !configDirty && viewKey === lastViewKey) return; lastViewKey = viewKey;
    bounds.getCenter(center); bounds.getSize(size);
    const step = referenceGridStep(camera, camera.position.distanceTo(controls.target), height);
    if (step !== lastStep) {
      if (!lastStep) { const next = new THREE.GridHelper(80,80,0x496153,0x293d31); grid.geometry.dispose(); grid.geometry = next.geometry; next.material.dispose(); }
      grid.scale.setScalar(step); lastStep = step;
    }
    grid.position.x = Math.round(controls.target.x/(step*5))*step*5; grid.position.y = Math.round(controls.target.y/(step*5))*step*5;
    ground.scale.setScalar(Math.max(1,step*80/16,(Math.max(size.x,size.y)+Math.abs(center.x)+Math.abs(center.y))/8));
    if (!root.visible) { configDirty = false; return; }
    front.copy(camera.position).sub(controls.target); front.z = 0;
    if (front.lengthSq() < 1e-10) front.set(0,-1,0); front.normalize(); right.set(-front.y,front.x,0);
    face.rotation.z = Math.atan2(right.y, right.x);
    // Hanging vines are authored from their top attachment. The person stands
    // on the preview floor beside the coverage, never at the hanging root.
    if (mode === 'VINE') base.set(center.x, center.y, ground.position.z);
    const vineExtent = mode === 'VINE' ? (Math.abs(right.x) * size.x + Math.abs(right.y) * size.y) / 2 : 0;
    const humanX = (prefs.side === 'LEFT' ? -1 : 1) * (vineExtent + prefs.gap + prefs.humanHeight * .22);
    human.position.set(base.dot(right) + humanX, -base.dot(front), base.z); human.scale.setScalar(prefs.humanHeight); human.visible = prefs.human;
    const rulerStart = center.clone().addScaledVector(front, Math.max(size.x, size.y) * .55 + prefs.rulerLength * .12).addScaledVector(right, -prefs.rulerLength / 2);
    ruler.position.set(rulerStart.dot(right), -rulerStart.dot(front), ground.position.z + .005); ruler.visible = prefs.ruler;
    buildRuler(); configDirty = false;
    heightLine.visible = prefs.heightMark;
    const extent = (Math.abs(right.x) * size.x + Math.abs(right.y) * size.y) / 2;
    const hx = center.dot(right) - extent - Math.max(.025, size.z * .05), hy = -center.dot(front), cap = Math.max(.01, size.z * .015);
    // A single tiny line buffer, regenerated only when its placement changes.
    const lineStamp = [hx,hy,bounds.min.z,bounds.max.z,cap].join(':');
    if (heightLine.userData.stamp !== lineStamp) { lines(heightLine, [[hx,hy,bounds.min.z],[hx,hy,bounds.max.z],[hx-cap,hy,bounds.min.z],[hx+cap,hy,bounds.min.z],[hx-cap,hy,bounds.max.z],[hx+cap,hy,bounds.max.z]]); heightLine.userData.stamp = lineStamp; }
    root.updateMatrixWorld(true);
    setText(humanLabel, `人物 ${formatDistance(prefs.humanHeight)}`);
    placeLabel(humanLabel, human.localToWorld(new THREE.Vector3(0,0,1.07)), prefs.human);
    setText(rulerLabels[0], '0'); setText(rulerLabels[1], formatDistance(prefs.rulerLength));
    rulerLabels.forEach((node,i) => placeLabel(node,ruler.localToWorld(new THREE.Vector3(i*prefs.rulerLength,0,prefs.rulerLength*.11)),prefs.ruler));
    setText(heightLabel, `高 ${formatDistance(size.z)}`);
    placeLabel(heightLabel,face.localToWorld(new THREE.Vector3(hx,hy,bounds.max.z+cap*2)),prefs.heightMark);
    const spacing = step * 5;
    gridLabels.forEach((node,i) => { const axis = i < 4 ? 'x' : 'y', offset = i < 4 ? i-1 : [-1,1,2][i-4]; const p = new THREE.Vector3(grid.position.x,grid.position.y,grid.position.z+.001); p[axis] += offset*spacing; setText(node, `${axis.toUpperCase()} ${formatDistance(p[axis])}`); placeLabel(node,p,prefs.grid && prefs.gridLabels); });
    const readoutKey = [api.getSelectedBranch(), api.isSkeletonOnly(), step, mode, asset.settings.preview_lod].join('|');
    if (readoutKey === lastReadoutKey) return; lastReadoutKey = readoutKey;
    const scope = api.isSkeletonOnly() ? '承重骨架（完整装配暂停）' : mode === 'TREE' ? '整树 · 含叶花果' : mode === 'VINE' ? '藤蔓 · 含叶花果' : '单元枝 · 含叶花果';
    const branch = asset.masterBranches.find(b => b.stableId === api.getSelectedBranch());
    const selected = branch ? `所选枝干：沿枝长 ${formatDistance(branchMeasuredLength(branch))} · 基部直径 ${formatDistance(2*branchRadiusAt(branch,asset.settings,0))}` : '';
    const text = `<strong>${scope}</strong>${asset.settings.preview_lod ? ' · 当前 LOD' : ''}<br>高 Z ${formatDistance(size.z)}　${mode === 'TREE' ? '冠幅' : '跨度'} X ${formatDistance(size.x)} × Y ${formatDistance(size.y)}<br>网格每格 ${formatDistance(step)}${selected ? '<br>'+selected : ''}`;
    if (readout.innerHTML !== text) readout.innerHTML = text;
  }
  return { root, update, toggleGrid() { prefs.grid = !prefs.grid; persist(); update(performance.now(), true); },
    get state() { return { mode, preferences: {...prefs}, bounds: bounds.clone(), human, ruler, gridStep: lastStep }; } };
}
