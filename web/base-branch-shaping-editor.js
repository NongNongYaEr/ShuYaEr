import * as THREE from './vendor/three.module.min.js';
import { createAppConfirm } from './app-confirm.js';
import { bindGlbTextures } from './glb-export.js';
import { BASE_BRANCH_SHAPING_OPTIONS, BASE_BRANCH_THICKNESS_RANGE, baseBranchShapingAnalysisInput, createBaseBranchShaping } from './base-branch-shaping.js';
import { createTrunkGuideControls } from './trunk-guide-controls.js';
import { combineGuideSelection, guideSelectionCenter } from './trunk-guide-selection.js';

const axes = ['X', 'Y', 'Z'];
const noTargets = [];
const sameGuides = (a, b) => a.every((guide, index) => guide === b[index]);

function analyze(base, signal) {
  return new Promise((resolve, reject) => {
    const input = baseBranchShapingAnalysisInput(base);
    const worker = new Worker(new URL('./trunk-auto-worker.js', import.meta.url), { type: 'module' });
    const finish = (complete, value) => {
      clearTimeout(timeout);
      worker.terminate();
      signal.removeEventListener('abort', cancel);
      complete(value);
    };
    const cancel = () => finish(reject, signal.reason);
    const timeout = setTimeout(() => finish(reject, Error('生成控制曲线超时，请重新打开微调造型。')), 30000);
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.result) finish(resolve, data.result.guides);
      if (data.error) finish(reject, Error(data.error));
    };
    worker.onerror = () => finish(reject, Error('无法生成控制曲线，请重新打开微调造型。'));
    try { worker.postMessage({ input, options: BASE_BRANCH_SHAPING_OPTIONS }); }
    catch (error) { finish(reject, error); }
  });
}

export function createBaseBranchShapingEditor(api, panel) {
  const editor = document.createElement('section');
  editor.id = 'baseBranchShapeEditor';
  editor.hidden = true;
  editor.innerHTML = `
    <h4>微调造型</h4>
    <p id="baseBranchShapeName"></p>
    <fieldset id="baseBranchShapeControls" hidden>
      <label>控制枝<select id="baseBranchShapeGuide"></select></label>
      <label>控制点<select id="baseBranchShapePoint"></select></label>
      <div class="wb-row base-branch-shape-transforms">
        <button type="button" id="baseBranchShapeMove" aria-keyshortcuts="G">移动 G</button>
        <button type="button" id="baseBranchShapeRotate" aria-keyshortcuts="R" title="从所选点旋转后段，选枝梢时转动最后一段">旋转 R</button>
        <button type="button" id="baseBranchShapeThickness" aria-keyshortcuts="S Alt+S" title="调整选中控制点附近的枝条粗细">粗细 S</button>
      </div>
      <div class="base-branch-guide-fields">
        ${axes.map(axis => `<label>${axis}（cm）<input type="number" step="any" id="baseBranchShape${axis}"></label>`).join('')}
      </div>
      <button type="button" id="baseBranchShapeApply">应用点坐标</button>
      <div class="wb-row"><button type="button" id="baseBranchShapeUndo">撤销</button><button type="button" id="baseBranchShapeRedo">重做</button></div>
      <label class="base-branch-check"><input id="baseBranchShapeCompare" type="checkbox">查看原形</label>
      <p class="vine-note">拖动控制点调形，空白拖动框选，Shift 加选，Ctrl 减选。R 转枝段，S 调选点附近的粗细。选根点按 S 可调根部粗细，根点位置和方向固定。</p>
    </fieldset>
    <p class="vine-note" id="baseBranchShapeStatus" role="status" aria-live="polite"></p>
    <div class="wb-row"><button type="button" id="baseBranchShapeExit">退出</button><button type="button" class="accent" id="baseBranchShapeSave">另存为基础枝</button></div>`;
  panel.append(editor);
  const el = id => editor.querySelector('#baseBranchShape' + id);
  const confirmSave = createAppConfirm('baseBranchShapeSaveDialog');
  const confirmExit = createAppConfirm('baseBranchShapeExitDialog');
  const host = api.canvas.parentElement;
  let draft = null, stageVisible = false, fieldsDirty = false;

  const status = message => { el('Status').textContent = message; };
  const errorMessage = error => error?.message || '基础枝预览加载失败，请检查套装贴图。';
  const ready = () => Boolean(draft?.core && !draft.saving && stageVisible);
  const edited = () => Boolean(draft?.core && !draft.core.isRest(draft.guides));
  const primary = () => draft.selection.at(-1);
  const guideOf = id => draft.guides.find(guide => guide.id === id);
  const pointOf = ({ guide, index }) => guideOf(guide).points[index];
  const editablePoints = () => draft.selection.filter(({ guide, index }) => draft.core.canEditPoint(guide, index));
  const thicknessPoints = () => draft.selection.filter(({ guide, index }) => draft.core.canScaleThickness(guide, index));
  const isRootCollar = ({ guide, index }) => guide === draft.guides[0].id && index <= 1;
  const comparing = () => el('Compare').checked;

  function options(select, values, selected) {
    const signature = JSON.stringify(values);
    if (select.dataset.options !== signature) {
      select.replaceChildren(...values.map(([label, value]) => new Option(label, value)));
      select.dataset.options = signature;
    }
    select.value = selected;
  }

  function refresh() {
    const { core, saving, error } = draft || {};
    editor.dataset.state = saving ? 'saving' : core ? 'ready' : error ? 'error' : 'loading';
    el('Controls').hidden = !core;
    el('Controls').disabled = Boolean(saving);
    el('Exit').disabled = Boolean(saving);
    el('Save').disabled = !edited() || Boolean(saving || draft?.gesture);
    if (!core) return;
    const point = primary();
    const guide = guideOf(draft.guideId);
    const locked = comparing() || Boolean(draft.gesture);
    options(el('Guide'), draft.guides.map((item, i) => [i ? `分叉 ${i}` : '主控制枝', item.id]), guide.id);
    options(el('Point'), [['选择控制点', ''], ...guide.points.map((_, index) => [
      index === 0 ? (guide.parent ? '分叉接点' : '根点') : index === guide.points.length - 1 ? '枝梢' :
        isRootCollar({ guide: guide.id, index }) ? '根部方向点' : `控制点 ${index}`, String(index)
    ])], point?.guide === guide.id ? String(point.index) : '');
    const canPosition = Boolean(point && draft.selection.length === 1 && core.canEditPoint(point.guide, point.index));
    for (const [index, axis] of axes.entries()) {
      const input = el(axis);
      if (!fieldsDirty) input.value = point ? Number((pointOf(point)[index] * 100).toFixed(5)) : '';
      input.disabled = !canPosition || locked;
    }
    el('Apply').disabled = !canPosition || locked;
    el('Move').disabled = !editablePoints().length || locked;
    el('Rotate').disabled = !point || !core.canRotateAfter(point.guide, point.index) || locked;
    el('Thickness').disabled = !thicknessPoints().length || locked;
    el('Undo').disabled = !draft.undo.length || Boolean(draft.gesture);
    el('Redo').disabled = !draft.redo.length || Boolean(draft.gesture);
    el('Compare').disabled = Boolean(draft.gesture);
    draft.overlay?.refresh();
  }

  function selectMany(items, operation = 'replace') {
    draft.selection = combineGuideSelection({ guides: draft.guides }, draft.selection, items, operation);
    if (primary()) draft.guideId = primary().guide;
    fieldsDirty = false;
    refresh();
  }

  function showGeometry() {
    draft.mesh.geometry = comparing() ? draft.original : draft.geometry;
  }

  function replace(guides) {
    if (sameGuides(guides, draft.guides)) return;
    const geometry = draft.core.preview(guides);
    draft.geometry.dispose();
    draft.guides = guides;
    draft.geometry = geometry;
    fieldsDirty = false;
    showGeometry();
    refresh();
  }

  function record(before) {
    if (sameGuides(before, draft.guides)) return;
    draft.undo.push(before);
    if (draft.undo.length > 64) draft.undo.shift();
    draft.redo.length = 0;
  }

  function history(from, to) {
    if (!ready() || draft.gesture || !draft[from].length) return;
    const previous = draft.guides;
    replace(draft[from].at(-1));
    draft[from].pop();
    draft[to].push(previous);
    refresh();
  }

  function gesture(center, adjust, label) {
    const owner = draft;
    const before = owner.guides;
    owner.gesture = true;
    fieldsDirty = false;
    refresh();
    if (editor.contains(document.activeElement)) api.canvas.focus({ preventScroll: true });
    return {
      center, label,
      valid: () => ready() && draft === owner,
      update(delta) {
        try { replace(adjust(before, delta)); status(''); }
        catch (error) { status(errorMessage(error)); return { hint: errorMessage(error) }; }
      },
      commit() { if (draft === owner) { record(before); owner.gesture = false; refresh(); } },
      cancel() { if (draft === owner) { replace(before); owner.gesture = false; status(''); refresh(); } }
    };
  }

  function keyboardTransform(operation) {
    if (!ready() || draft.gesture || draft.overlay.active || comparing()) return null;
    if (operation === 'translate') {
      const points = editablePoints();
      if (!points.length) return null;
      const center = guideSelectionCenter({ guides: draft.guides }, points);
      return gesture(center, (before, { translation }) => draft.core.movePoints(before, points, translation), '基础枝控制点');
    }
    if (operation === 'scale' || operation === 'radius') {
      const points = thicknessPoints();
      if (!points.length) return null;
      const rootOnly = points.every(isRootCollar);
      const center = rootOnly ? new THREE.Vector3(...draft.guides[0].points[0]) : guideSelectionCenter({ guides: draft.guides }, points);
      return {
        ...gesture(center, (before, { amount }) => draft.core.scaleThickness(before, points, amount), rootOnly ? '根部' : '所选控制点附近'),
        title: operation === 'radius' ? 'Alt+S 粗细' : 'S 粗细',
        axisLabel: '截面', lockAxes: true, scaleRange: BASE_BRANCH_THICKNESS_RANGE,
        hint: '输入倍率，例如 1.25 加粗 25%'
      };
    }
    const point = primary();
    if (operation === 'rotate' && point) {
      const pivot = draft.core.rotationPivot(point.guide, point.index);
      if (pivot === null) return null;
      return {
        ...gesture(new THREE.Vector3(...pointOf({ guide: point.guide, index: pivot })),
          (before, { rotation }) => draft.core.rotateAfter(before, point, rotation), '基础枝后段'),
        hint: pivot === point.index ? '以所选点为支点 · X/Y/Z 约束轴' : '以枝梢前一控制点为支点 · X/Y/Z 约束轴'
      };
    }
    return null;
  }

  function makeOverlay() {
    let previousGuides, previousMatrix, model;
    return createTrunkGuideControls({
      host, camera: api.camera, controls: api.controls,
      getState() {
        if (!ready() || comparing() || document.querySelector('dialog[open]')) return null;
        const root = api.modelRoot;
        root.updateWorldMatrix(true, false);
        if (previousGuides !== draft.guides || !previousMatrix?.equals(root.matrixWorld)) {
          previousGuides = draft.guides;
          previousMatrix = root.matrixWorld.clone();
          model = { guides: draft.guides.map(guide => ({ ...guide, points: guide.points.map(point =>
            new THREE.Vector3(...point).applyMatrix4(previousMatrix).toArray()) })) };
        }
        return { model, selection: draft.selection, selected: primary(), targets: noTargets, target: 'point', through: true, selectionMode: 'click',
          isPointLocked: (guide, index) => !draft.core.canEditPoint(guide, index),
          lockedPointHint: (guide, index) => isRootCollar({ guide, index }) ? '位置固定，S 调根部粗细' : '' };
      },
      select(guide, index, operation, drag) {
        if (!drag || !draft.selection.some(point => point.guide === guide && point.index === index)) selectMany([{ guide, index }], operation);
        api.canvas.focus({ preventScroll: true });
        return draft.core.canEditPoint(guide, index);
      },
      selectMany,
      canBox: event => !event.altKey && !draft?.gesture,
      begin(guide, index) {
        const points = editablePoints();
        const center = new THREE.Vector3(...pointOf({ guide, index }));
        return gesture(center, (before, world) => draft.core.movePoints(before, points,
          api.modelRoot.worldToLocal(new THREE.Vector3(...world)).sub(center)), '基础枝控制点');
      },
      refreshView() {}, onError: status
    });
  }

  function fit() {
    if (!draft?.root?.visible) return false;
    api.fit(new THREE.Box3().setFromObject(draft.mesh));
    draft.overlay?.refresh();
    return true;
  }

  function setVisible(visible) {
    stageVisible = visible;
    if (!draft?.root || draft.root.visible === visible) return;
    if (visible) {
      draft.restoreView = api.beginBaseBranchShapeView();
      draft.root.visible = true;
      fit();
    } else {
      draft.overlay?.cancel();
      api.cancelKeyboardTransform();
      draft.root.visible = false;
      draft.restoreView?.();
      draft.restoreView = null;
    }
    draft.overlay?.refresh();
  }

  function releaseMaterial(material) {
    material?.map?.dispose();
    material?.normalMap?.dispose();
    material?.dispose();
  }

  function isolatePanel() {
    const side = panel.closest('.parameter-panel');
    const sections = [...document.querySelectorAll('.inspector-panel, .branch-workspace-bar, .project-actions, .build-actions')];
    if (side) {
      for (let section = panel; section !== side; section = section.parentElement) {
        sections.push(...[...section.parentElement.children].filter(sibling => sibling !== section));
      }
    }
    const enabled = sections.filter(section => !section.inert);
    for (const section of enabled) section.inert = true;
    return () => { for (const section of enabled) section.inert = false; };
  }

  async function open(pack, base) {
    if (draft) return;
    const owner = draft = { pack, base, controller: new AbortController(), undo: [], redo: [] };
    owner.restorePanel = isolatePanel();
    panel.dataset.shaping = '';
    document.body.dataset.baseBranchShaping = '';
    el('Name').textContent = `${pack.name} · ${base.name}`;
    el('Compare').checked = false;
    editor.hidden = false;
    editor.scrollIntoView({ block: 'nearest' });
    fieldsDirty = false;
    status(base.shape_guides ? '正在加载控制曲线…' : '正在生成主枝和分叉的控制曲线…');
    refresh();
    const material = new THREE.MeshStandardMaterial({ color: '#79674c', side: THREE.DoubleSide });
    try {
      const candidates = base.shape_guides ? undefined : await analyze(base, owner.controller.signal);
      const core = createBaseBranchShaping(base, { candidates });
      await bindGlbTextures(material, pack.material);
      if (draft !== owner) { releaseMaterial(material); return; }
      const original = core.preview(core.guides);
      const geometry = original.clone();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'BaseBranchShapeWood';
      mesh.castShadow = mesh.receiveShadow = true;
      const root = new THREE.Group();
      root.name = 'BaseBranchShapePreview';
      root.visible = false;
      root.add(mesh);
      api.modelRoot.add(root);
      const main = core.guides[0];
      Object.assign(owner, { core, guides: core.guides, root, mesh, geometry, original, guideId: main.id,
        selection: [{ guide: main.id, index: main.points.length - 1 }] });
      owner.overlay = makeOverlay();
      api.controls.addEventListener('change', owner.overlay.refresh);
      owner.layout = new ResizeObserver(owner.overlay.refresh);
      owner.layout.observe(host);
      setVisible(stageVisible);
      status('');
      refresh();
      if (stageVisible) api.canvas.focus({ preventScroll: true });
    } catch (error) {
      if (!owner.mesh) releaseMaterial(material);
      if (draft !== owner) return;
      owner.error = error;
      status(errorMessage(error));
      refresh();
    }
  }

  function close() {
    const owner = draft;
    owner.layout?.disconnect();
    if (owner.overlay) api.controls.removeEventListener('change', owner.overlay.refresh);
    owner.overlay?.dispose();
    api.cancelKeyboardTransform();
    draft = null;
    owner.controller.abort();
    owner.root?.removeFromParent();
    owner.geometry?.dispose();
    owner.original?.dispose();
    releaseMaterial(owner.mesh?.material);
    owner.restoreView?.();
    owner.restorePanel();
    editor.hidden = true;
    delete panel.dataset.shaping;
    delete document.body.dataset.baseBranchShaping;
    api.onShapeClosed();
  }

  async function exit() {
    if (!draft || draft.saving) return;
    if (edited() && !await confirmExit({ title: '退出微调造型', name: draft.base.name,
      message: '这次调整还没有另存。退出会放弃本次调整。', accept: '放弃并退出', danger: true })) return;
    close();
  }

  async function save() {
    if (!ready() || !edited() || draft.gesture) return;
    const name = await confirmSave({ title: '另存为基础枝', name: draft.pack.name, detail: draft.base.name,
      message: '在同一套装中创建新基础枝，共用套装的原贴图。', accept: '另存', input: `${draft.base.name.slice(0, 75)} · 变体` });
    if (!name) return;
    draft.saving = true;
    status('正在保存基础枝…');
    refresh();
    try {
      const candidate = draft.core.bake(draft.guides, { id: crypto.randomUUID(), name });
      candidate.variant_from = { base_id: draft.base.id };
      const saved = await api.saveBaseBranchVariant(draft.pack, candidate);
      close();
      api.onShapeSaved(saved);
    } catch (error) {
      if (!draft) throw error;
      draft.saving = false;
      status(errorMessage(error));
      api.toast(errorMessage(error), true);
      refresh();
    }
  }

  el('Guide').onchange = () => {
    draft.guideId = el('Guide').value;
    selectMany([{ guide: draft.guideId, index: guideOf(draft.guideId).points.length - 1 }]);
  };
  el('Point').onchange = () => selectMany(el('Point').value === '' ? [] : [{ guide: draft.guideId, index: Number(el('Point').value) }]);
  el('Apply').onclick = () => {
    const inputs = axes.map(axis => el(axis));
    if (inputs.some(input => !input.value || !input.reportValidity())) { status('请输入有效的控制点坐标。'); return; }
    const before = draft.guides;
    try {
      const target = new THREE.Vector3(...inputs.map(input => Number(input.value) / 100));
      replace(draft.core.movePoints(before, draft.selection, target.sub(new THREE.Vector3(...pointOf(primary())))));
      record(before);
      fieldsDirty = false;
      status('');
      refresh();
    } catch (error) { status(errorMessage(error)); }
  };
  for (const axis of axes) {
    el(axis).oninput = () => { fieldsDirty = true; };
    el(axis).onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); el('Apply').click(); } };
  }
  function beginKeyboard(operation) {
    api.canvas.focus({ preventScroll: true });
    api.beginKeyboardTransform(operation);
  }
  el('Move').onclick = () => beginKeyboard('translate');
  el('Rotate').onclick = () => beginKeyboard('rotate');
  el('Thickness').onclick = () => beginKeyboard('scale');
  el('Undo').onclick = () => history('undo', 'redo');
  el('Redo').onclick = () => history('redo', 'undo');
  el('Compare').onchange = () => { showGeometry(); refresh(); };
  el('Save').onclick = save;
  el('Exit').onclick = exit;

  function key(event) {
    if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]')
      || event.target.matches?.('input,textarea,select,[contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') { event.preventDefault(); if (!draft.overlay?.cancel()) exit(); }
    else if ((event.ctrlKey || event.metaKey) && ['z', 'y', 's'].includes(key)) {
      event.preventDefault();
      if (key === 's') save();
      else if (key === 'y' || event.shiftKey) history('redo', 'undo');
      else history('undo', 'redo');
    } else if (key === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey && fit()) event.preventDefault();
  }

  return { open, setVisible, key, keyboardTransform, fit,
    acceptsTransformKeyTarget: target => ready() && (target === el('Guide') || target === el('Point')),
    get active() { return Boolean(draft); }
  };
}
