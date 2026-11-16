import * as THREE from './vendor/three.module.min.js';
import { createAppConfirm } from './app-confirm.js';
import { deserializeGeometry } from './branch-kernel.js';
import { TransformControls } from './vendor/TransformControls.js';
import { UNIT_ROLES } from './plant-unit-data.js';
import { BASE_BRANCH_GUIDE, BASE_BRANCH_SCALE_RANGE, baseBranchAnchorFrame, baseBranchGuidePoints, baseBranchShape, baseBranchUnitMatrix, baseBranchWoodSize, createBaseBranchAssembly, distributeBaseBranchUnits } from './base-branch-assembly.js';
import { createBaseBranchSelection } from './base-branch-selection.js';
import { createBaseBranchInspector } from './base-branch-inspector.js';
import { createBaseBranchPoseEdit, localBaseBranchRotation, baseBranchDegrees, baseBranchRotationDegrees, baseBranchRotationFields } from './base-branch-pose-edit.js';
import { createBaseBranchSurfaceProjector, inspectBaseBranchPlacements, rehangBaseBranchPlacements } from './base-branch-surface-edit.js';
import { baseBranchBrushEntry, baseBranchBrushFrame } from './base-branch-brush.js';
import { canPlaceBaseBranchLeaf, createBaseBranchLeafStroke } from './base-branch-leaf-stroke.js';
import { createBaseBranchShapingEditor } from './base-branch-shaping-editor.js';

const MAX_GUIDE_POINTS = 32;
const MAX_PLACEMENTS = 256;
const CARD_MIME = 'application/x-branchforge-base-branch-unit';
const EMPTY_IMAGES = new Map();
const EMPTY_UNITS = [];
const LEAF_SPACING_MIN = .5, LEAF_SPACING_MAX = 100;

export function createBaseBranchWorkbench(api, panel) {
  const confirm = createAppConfirm('baseBranchChangeConfirm');
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./base-branch-workbench.css', import.meta.url).href;
  document.head.append(css);
  panel.className = 'base-branch-workbench';
  panel.innerHTML = `
    <h4 id="baseBranchSourcesHeading">基础枝</h4>
    <div class="pu-unit-grid base-branch-cards" id="baseBranchSources" role="group" aria-labelledby="baseBranchSourcesHeading"></div>
    <button type="button" class="accent" id="baseBranchUse">使用这根基础枝</button>
    <button type="button" id="baseBranchShapeOpen">微调造型</button>
    <label class="base-branch-check" id="baseBranchRehangRow" hidden><input id="baseBranchRehang" type="checkbox" checked>换枝时保留并重新贴面</label>
    <p class="vine-note" id="baseBranchSource"></p>
    <div id="baseBranchEditing" hidden>
      <button type="button" id="baseBranchWholeScale" title="以枝根为中心，等比缩放木枝和已放置的叶花果">整枝缩放 S</button>
      <fieldset><legend>贴面组装</legend>
        <h4 id="baseBranchUnitsHeading">叶花果素材</h4>
        <div class="pu-unit-grid base-branch-cards" id="baseBranchUnits" role="group" aria-labelledby="baseBranchUnitsHeading"></div>
        <p class="vine-note" id="baseBranchPlacementHelp">拖动卡片到枝面，松手添加。也可点选卡片，再点「在枝面放置」。</p>
        <div class="wb-row"><button type="button" id="baseBranchPlace" aria-pressed="false">在枝面放置</button><button type="button" id="baseBranchBrushLeaves" aria-pressed="false" title="沿枝面拖动，连续放置选中的叶片">刷叶</button></div>
        <div class="wb-row" role="group" aria-label="叶花果编辑工具">
          <button type="button" data-base-branch-tool="SELECT" aria-pressed="true">点选 V</button>
          <button type="button" data-base-branch-tool="COMB" aria-pressed="false">梳理 C</button>
          <button type="button" data-base-branch-tool="TWIST_BRUSH" aria-pressed="false">绕柄扭转</button>
        </div>
        <label>已放置单元<select id="baseBranchPlaced"></select></label>
        <div class="wb-row"><button type="button" id="baseBranchSlide">移动 G</button><button type="button" id="baseBranchRotate">旋转 R</button><button type="button" id="baseBranchScale">缩放 S</button></div>
        <div class="field-grid">
          <label>绕柄轴（°）<input id="baseBranchPlacementRoll" type="number" min="-180" max="180" step="1"></label>
          <label>尺寸倍率<input id="baseBranchPlacementScale" type="number" min=".05" max="8" step=".05"></label>
        </div>
        <button type="button" id="baseBranchRemove">移除单元</button>
      </fieldset>
      <fieldset><legend>沿曲线排布</legend>
        <div class="field-grid">
          <label>数量<input id="baseBranchBatchCount" type="number" min="1" max="256" value="8"></label>
          <label>排布单元<select id="baseBranchBatchUnits"><option value="SELECTED">所选单元</option><option value="MIX">混合本套装</option></select></label>
          <label>起点（%）<input id="baseBranchBatchStart" type="number" min="0" max="99" value="10"></label>
          <label>终点（%）<input id="baseBranchBatchEnd" type="number" min="1" max="100" value="90"></label>
        </div>
        <label class="base-branch-check"><input id="baseBranchBatchReplace" type="checkbox" checked>替换上次批量排布</label>
        <button type="button" class="accent" id="baseBranchBatchApply">沿曲线批量排布</button>
        <details id="baseBranchGuideDetails"><summary>编辑排布曲线</summary>
          <label>曲线控制点<select id="baseBranchGuidePoint"></select></label>
          <div class="base-branch-guide-fields">
            <label>X（cm）<input id="baseBranchGuideX" type="number" step=".1"></label>
            <label>Y（cm）<input id="baseBranchGuideY" type="number" step=".1"></label>
            <label>Z（cm）<input id="baseBranchGuideZ" type="number" step=".1"></label>
          </div>
          <button type="button" id="baseBranchGuideApply">应用点坐标</button>
          <div class="wb-row"><button type="button" id="baseBranchGuideAdd">插入控制点</button><button type="button" id="baseBranchGuideRemove">移除控制点</button></div>
          <p class="vine-note">用控制点让曲线穿过弯枝，批量排布会沿曲线取样并吸附到枝面。</p>
        </details>
      </fieldset>
    </div>
    <p class="vine-note" id="baseBranchStatus" role="status" aria-live="polite"></p>`;

  const inspector = createBaseBranchInspector();
  const view = api.canvas.parentElement;
  const rail = document.createElement('div');
  rail.dataset.baseBranchRail = '';
  rail.setAttribute('role', 'group');
  rail.setAttribute('aria-label', '贴面组装工具');
  rail.innerHTML = `
    <button type="button" data-base-branch-tool="SELECT" aria-pressed="true" aria-keyshortcuts="V" title="点选叶花果或基础枝；退出刷叶（V）"><i data-lucide="mouse-pointer-2"></i><span>点选 V</span></button>
    <button type="button" data-base-branch-tool="BRUSH_LEAVES" aria-pressed="false" title="沿枝面拖动，连续放置所选叶片"><i data-lucide="leaf"></i><span>刷叶</span></button>
    <button type="button" data-base-branch-tool="COMB" aria-pressed="false" aria-keyshortcuts="C" title="梳理所选叶花果（C）"><i data-lucide="wind"></i><span>梳理 C</span></button>
    <button type="button" data-base-branch-tool="SIZE_BRUSH" aria-pressed="false" title="刷过所选叶花果来放大；按住 Alt 临时缩小"><i data-lucide="scaling"></i><span>大小刷</span></button>
    <button type="button" data-base-branch-tool="TWIST_BRUSH" aria-pressed="false" title="绕柄轴扭转所选叶花果"><i data-lucide="rotate-3d"></i><span>绕柄扭转</span></button>
    <button type="button" data-base-branch-tool="MOVE" aria-keyshortcuts="G" title="移动所选叶花果（G）"><i data-lucide="move-3d"></i><span>移动 G</span></button>
    <button type="button" data-base-branch-tool="ROTATE" aria-keyshortcuts="R" title="旋转所选叶花果（R）"><i data-lucide="rotate-cw"></i><span>旋转 R</span></button>
    <button type="button" data-base-branch-tool="SCALE" aria-keyshortcuts="S" title="缩放所选叶花果（S）"><i data-lucide="scaling"></i><span>缩放叶花果</span></button>
    <div class="base-branch-rail-separator"></div>
    <button type="button" data-base-branch-tool="WHOLE_SCALE" title="以枝根为中心，等比缩放木枝和全部挂件"><i data-lucide="maximize"></i><span>整枝缩放</span></button>`;
  view.append(rail);
  const railTool = name => rail.querySelector(`[data-base-branch-tool="${name}"]`);
  window.lucide?.createIcons({ nodes: [rail] });
  const brushBar = document.createElement('section');
  brushBar.id = 'baseBranchBrushBar';
  brushBar.hidden = true;
  brushBar.setAttribute('aria-label', '刷叶工具');
  brushBar.innerHTML = `
    <div class="leaf-brush-heading"><strong>刷叶模式</strong><span id="baseBranchBrushUnit"></span>
      <button type="button" id="baseBranchBrushExit" aria-keyshortcuts="Escape">退出刷叶 <kbd>Esc</kbd></button></div>
    <div class="leaf-brush-spacing" id="baseBranchBrushSpacingRow">
      <label for="baseBranchBrushSpacing">间距</label>
      <button type="button" id="baseBranchBrushLess" aria-label="间距减少 1 厘米">−</button>
      <input id="baseBranchBrushSpacing" type="number" min="${LEAF_SPACING_MIN}" max="${LEAF_SPACING_MAX}" step=".1" value="8" required>
      <span aria-hidden="true">cm</span>
      <button type="button" id="baseBranchBrushMore" aria-label="间距增加 1 厘米">＋</button>
      <input id="baseBranchBrushSpacingSlider" type="range" min="${LEAF_SPACING_MIN}" max="${LEAF_SPACING_MAX}" step=".1" value="8" aria-label="刷叶间距（厘米）">
    </div>
    <p id="baseBranchBrushReadout" role="status" aria-live="polite"></p>`;
  const brushCursor = document.createElement('div');
  brushCursor.id = 'baseBranchBrushCursor';
  brushCursor.hidden = true;
  brushCursor.setAttribute('aria-hidden', 'true');
  brushCursor.innerHTML = '<span></span>';
  view.append(brushBar, brushCursor);
  const el = id => panel.querySelector('#baseBranch' + id) || inspector.querySelector('#baseBranch' + id) || brushBar.querySelector('#baseBranch' + id);
  const assembly = () => api.getAuthoring().base_branch_assembly;
  let pack = null, enabled = false, baseId = '', unitId = '', guidePoint = 0;
  let mode = '', drag = null, cardDrag = null, gizmoDrag = null, transforming = false, lastAnchor = null, assetCache = null, pickingCache = null;
  let leafStroke = null, leafFrame = 0, leafPoints = [], suppressLeafMenu = false;
  let leafHover = null, leafHoverFrame = 0, leafPointer = null, leafAnchors = null, lastSpacing = 8;
  let assemblyKey = '', packImages = EMPTY_IMAGES, mountedImages = EMPTY_IMAGES;
  let wholeScalePreview = 1;
  let issuesFor = null, exactRecord = null, syncSelection = true;
  const cardState = new WeakMap();
  const dropHint = document.createElement('div');
  dropHint.className = 'base-branch-drop-hint';
  dropHint.setAttribute('aria-hidden', 'true');
  dropHint.hidden = true;
  document.body.append(dropHint);

  const overlay = new THREE.Group();
  overlay.name = 'BaseBranchAssemblyHelpers';
  overlay.visible = false;
  overlay.matrixAutoUpdate = false;
  const guideMaterial = new THREE.LineBasicMaterial({ color: 0x6cd4cf, depthTest: false });
  const guide = new THREE.Line(new THREE.BufferGeometry(), guideMaterial);
  guide.renderOrder = 110;
  const sphere = new THREE.SphereGeometry(1, 10, 8);
  const guidePointMaterial = new THREE.MeshBasicMaterial({ color: 0xffd46c, depthTest: false });
  const guideMarker = new THREE.Mesh(sphere, guidePointMaterial);
  const surfaceMarker = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: 0xcaff7b, depthTest: false }));
  guideMarker.renderOrder = 111;
  surfaceMarker.renderOrder = 111;
  overlay.add(guide, guideMarker, surfaceMarker);
  api.modelRoot.add(overlay);
  const axisPositions = new THREE.BufferAttribute(new Float32Array(MAX_PLACEMENTS * 6), 3).setUsage(THREE.DynamicDrawUsage);
  const axisGeometry = new THREE.BufferGeometry().setAttribute('position', axisPositions);
  axisGeometry.setDrawRange(0, 0);
  const selectionAxes = new THREE.LineSegments(axisGeometry, new THREE.LineBasicMaterial({ color:0xe6c961, depthTest:false, depthWrite:false }));
  selectionAxes.name = 'BaseBranchSelectionAxes';
  selectionAxes.userData.category = 'base_branch_selection_axes';
  selectionAxes.frustumCulled = false;
  selectionAxes.renderOrder = 109;
  selectionAxes.visible = false;
  const axisPoint = new THREE.Vector3();
  const axisIndices = new Map();
  const gizmoProxy = new THREE.Object3D();
  const gizmo = new TransformControls(api.camera);
  const gizmoHelper = gizmo.getHelper();
  gizmo.setSpace('world');
  gizmo.setSize(.72);
  gizmo.showE = false;
  gizmo.showXYZE = false;
  api.scene.add(selectionAxes);
  api.modelRoot.add(gizmoProxy, gizmoHelper);
  const selection = createBaseBranchSelection({ ...api, active: capturesSelection, getTargets: selectionTargets, changed: selectionChanged });
  const shaping = createBaseBranchShapingEditor({ ...api,
    onShapeClosed() { api.refreshBranchSelection(); refresh(); },
    onShapeSaved({ pack: updated, variant, copied }) {
      baseId = variant.id;
      refresh(updated);
      setStatus(copied ? `已另存「${variant.name}」到「${updated.name}」。` : `已另存「${variant.name}」，可使用这根基础枝。`);
      api.toast(`已另存「${variant.name}」`);
    }
  }, panel);

  function setOptions(select, options, value) {
    const signature = JSON.stringify(options);
    if (select.dataset.options !== signature) {
      select.replaceChildren(...options.map(([name, id]) => new Option(name, id)));
      select.dataset.options = signature;
    }
    if (select.value !== value) select.value = value;
  }
  function selectCard(grid, id) {
    for (const button of grid.children) {
      const pressed = String(button.dataset.itemId === id);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    }
  }
  function renderCards(grid, items, images, selected, isBase, canUse) {
    const previous = cardState.get(grid);
    if (previous?.items !== items || previous.images !== images) {
      grid.replaceChildren(...items.map(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pu-unit-card base-branch-card';
        button.dataset.itemId = item.id;
        if (isBase) button.dataset.baseBranchCard = item.id;
        else button.dataset.baseBranchUnitCard = item.id;
        button.title = item.name;
        const image = document.createElement('img');
        image.alt = '';
        image.draggable = false;
        const thumbnail = images.get(item.id);
        if (thumbnail) image.src = thumbnail;
        else image.hidden = true;
        const name = document.createElement('strong');
        name.textContent = item.name;
        const detail = document.createElement('small');
        detail.textContent = `${isBase ? '基础枝' : UNIT_ROLES[item.role]} · ${(item.size_m * 100).toFixed(1)} cm`;
        button.append(image, name, detail);
        button.onclick = () => {
          if (isBase) baseId = item.id;
          else {
            const stayInBrush = mode === 'BRUSH_LEAVES' && item.role === 'LEAF' && !leafStroke;
            unitId = item.id;
            if (stayInBrush) resetLeafHover();
            else cancelGesture();
          }
          refresh();
        };
        if (!isBase) button.ondragstart = event => startCardDrag(event, item.id);
        return button;
      }));
      cardState.set(grid, { items, images });
    }
    selectCard(grid, selected);
    for (const button of grid.children) {
      const disabled = isBase && !canUse, draggable = !isBase && canUse;
      if (button.disabled !== disabled) button.disabled = disabled;
      if (button.draggable !== draggable) button.draggable = draggable;
    }
  }
  function active() {
    return !shaping.active && enabled && api.isBranch() && panel.getClientRects().length > 0 && !document.querySelector('dialog[open]');
  }
  function canEdit() {
    return !shaping.active && api.isBranch() && !!assembly() && api.canDirectSelect() && !document.querySelector('dialog[open]');
  }
  function brushing() {
    return !shaping.active && api.isBaseBranchBrush() && !!assembly() && !document.querySelector('dialog[open]');
  }
  function setStatus(message) { el('Status').textContent = message; }
  function report(error) {
    setStatus(error.message);
    api.toast(error.message, true);
  }
  function action(fn) { return async () => { try { await fn(); } catch (error) { report(error); } }; }
  function readNumber(id) {
    const input = el(id);
    if (!input.value || !input.reportValidity()) throw Error('请填写有效的' + input.closest('label').firstChild.textContent);
    return Number(input.value);
  }
  function update(label, change) {
    const current = assembly();
    if (!current) return false;
    const next = { ...current };
    change(next, current);
    const shapeChanged = next.guide !== current.guide || next.scale !== current.scale;
    return api.transact(label, authoring => {
      authoring.base_branch_assembly = next;
      if (shapeChanged) authoring.branch_shape = baseBranchShape(next);
    }, { deferControls: !shapeChanged, bypassLayers: true });
  }
  function changePlacement(label, fields, id = selection.primary) {
    return update(label, (next, current) => {
      next.placements = current.placements.map(item => item.id === id ? { ...item, ...fields } : item);
    });
  }
  function currentPlacement() {
    return assembly()?.placements.find(item => item.id === selection.primary);
  }
  function selectedPlacements() {
    const records = new Map(assembly()?.placements.map(item => [item.id, item]) || []);
    return selection.ids.map(id => records.get(id)).filter(Boolean);
  }
  function refreshInspector(current) {
    inspector.hidden = !current;
    const count = current ? selectedPlacements().length : 0;
    const indicator = String(canEdit() || brushing() ? count : 0);
    if (document.body.dataset.baseBranchSelection !== indicator) {
      document.body.dataset.baseBranchSelection = indicator;
      document.dispatchEvent(new Event('base-branch-selection-change'));
    }
    if (!current) return;
    const primary = currentPlacement();
    el('SelectionCount').textContent = `已选 ${count} 个挂件 · 共 ${current.placements.length} 个`;
    for (const id of ['InspectorMove','InspectorRotate','InspectorScale','InspectorCopy','InspectorDelete','ReplaceApply','BatchEditApply']) {
      el(id).disabled = !count;
    }
    el('InspectorCopy').disabled ||= count + current.placements.length > MAX_PLACEMENTS;
    const sources = current.units.map(unit => [`${unit.name} · ${UNIT_ROLES[unit.role]}`, unit.id]);
    const replace = el('ReplaceSource');
    setOptions(replace, sources, current.units.some(unit => unit.id === replace.value) ? replace.value : primary?.unit_id || sources[0]?.[1] || '');
    replace.disabled = !count;
    el('Exact').hidden = count !== 1;
    if (count === 1 && exactRecord !== primary) {
      const frame = baseBranchAnchorFrame(current, primary);
      const angles = baseBranchDegrees(localBaseBranchRotation(primary));
      const fields = {PositionPct:frame.t * 100, ExactScale:primary.scale, RotationX:angles[0], RotationY:angles[1], RotationZ:angles[2]};
      for (const [id,value] of Object.entries(fields)) el(id).value = Number(value.toFixed(6));
    }
    exactRecord = count === 1 ? primary : null;
    if (issuesFor && issuesFor !== current) {
      issuesFor = null;
      el('Issues').replaceChildren();
      el('CheckStatus').textContent = '';
    }
  }
  function renderIssues(current, issues, summary) {
    issuesFor = current;
    const records = new Map(current.placements.map((record,i) => [record.id,{record,index:i+1}]));
    const names = new Map(current.units.map(unit => [unit.id,unit.name]));
    el('CheckStatus').textContent = summary;
    el('Issues').replaceChildren(...issues.slice(0,60).map(issue => {
      const button = document.createElement('button');
      const item = records.get(issue.id);
      button.type = 'button';
      button.textContent = `${item ? item.index + '. ' + names.get(item.record.unit_id) : '挂件'} · ${issue.reason}`;
      button.disabled = !item;
      button.onclick = () => {
        selectPlacement(issue.id);
        const asset = api.getAsset(), frame = baseBranchAnchorFrame(current,item.record);
        if (frame && asset) {
          api.controls.target.copy(asset.group.localToWorld(frame.position));
          api.controls.update();
        }
      };
      return button;
    }));
  }
  function selectionTargets() {
    const current = assembly(), byId = pickables()?.unitsById;
    if (!current || !byId) return [];
    const roles = new Map(current.units.map(unit => [unit.id, unit.role]));
    const filter = el('SelectionFilter').value;
    return current.placements.flatMap(item => {
      const role = roles.get(item.unit_id), object = byId.get(item.id);
      if (!visible(object) || (filter !== 'ALL' && filter !== role)) return [];
      const frame = baseBranchAnchorFrame(current, item);
      return frame ? [{id:item.id, object, point:assetCache.group.localToWorld(frame.position), role}] : [];
    });
  }
  function capturesSelection() {
    const selecting = canEdit() || (brushing() && !api.isBaseBranchStroke());
    return selecting && !mode && !drag && !cardDrag && !gizmoDrag && !transforming && Boolean(assembly()?.placements.length);
  }
  function selectionChanged(ids) {
    if (!syncSelection) return;
    lastAnchor = currentPlacement();
    if (ids.length) api.onSelectBaseUnit();
    refresh();
  }
  function writeAxis(object, index) {
    const [start, end] = object.baseBranchAxis;
    axisPoint.copy(start).applyMatrix4(object.matrixWorld).toArray(axisPositions.array, index * 6);
    axisPoint.copy(end).applyMatrix4(object.matrixWorld).toArray(axisPositions.array, index * 6 + 3);
  }
  function syncAxes(editing) {
    axisIndices.clear();
    if (editing && !cardDrag && !mode) for (const id of selection.ids) {
      const object = placementMesh(id);
      if (!object?.baseBranchAxis) continue;
      const index = axisIndices.size;
      axisIndices.set(id, index);
      object.updateWorldMatrix(true, false);
      writeAxis(object, index);
    }
    selectionAxes.visible = axisIndices.size > 0;
    axisGeometry.setDrawRange(0, axisIndices.size * 2);
    if (selectionAxes.visible) axisPositions.needsUpdate = true;
  }
  function syncGizmo(editing) {
    if (gizmoDrag) return;
    const name = el('Gizmo').value;
    const records = editing && !mode && !drag && !cardDrag && !transforming && name !== 'OFF' ? selectedPlacements() : [];
    if (!records.length || !placementMesh(selection.primary)) { gizmo.detach(); return; }
    const current = assembly(), asset = api.getAsset();
    const targets = el('Pivot').value === 'CENTER' ? records : [records.at(-1)];
    const center = targets.reduce((p, record) => p.add(baseBranchAnchorFrame(current, record).position), new THREE.Vector3())
      .divideScalar(targets.length);
    gizmoProxy.position.copy(api.modelRoot.worldToLocal(asset.group.localToWorld(center)));
    gizmoProxy.quaternion.identity();
    gizmoProxy.scale.setScalar(1);
    gizmoProxy.updateMatrixWorld(true);
    gizmo.attach(gizmoProxy);
    gizmo.setMode({MOVE:'translate', ROTATE:'rotate', SCALE:'scale'}[name]);
  }
  function setGizmoMode(mode) {
    el('Gizmo').value = mode;
    api.canvas.focus({preventScroll:true});
    showOverlay();
  }
  function showOverlay() {
    const current = assembly(), asset = api.getAsset();
    const showGuide = active() && !mode && el('GuideDetails').open;
    const editing = canEdit();
    if (mode === 'BRUSH_LEAVES' && (!editing || !active())) finishLeafBrush(false, true);
    syncAxes(editing || brushing());
    syncGizmo(editing);
    overlay.visible = Boolean(editing && current && asset && (showGuide || lastAnchor));
    if (!overlay.visible) return;
    asset.group.updateWorldMatrix(true, false);
    api.modelRoot.updateWorldMatrix(true, false);
    overlay.matrix.copy(api.modelRoot.matrixWorld).invert().multiply(asset.group.matrixWorld);
    if (wholeScalePreview !== 1) overlay.matrix.scale(new THREE.Vector3().setScalar(wholeScalePreview));
    overlay.matrixWorldNeedsUpdate = true;
    guide.visible = showGuide;
    guideMarker.visible = showGuide;
    if (showGuide) {
      const points = current.guide;
      if (guide.userData.points !== points || guide.userData.scale !== current.scale) {
        guide.geometry.dispose();
        guide.geometry = new THREE.BufferGeometry().setFromPoints(baseBranchGuidePoints(current));
        guide.userData.points = points;
        guide.userData.scale = current.scale;
      }
      guideMarker.position.fromArray(points[guidePoint] || points[0]).multiplyScalar(current.scale ?? 1);
    }
    const radius = Math.max(.001, baseBranchWoodSize(current) * .012);
    guideMarker.scale.setScalar(radius);
    surfaceMarker.scale.setScalar(radius * .85);
    const frame = lastAnchor && baseBranchAnchorFrame(current, lastAnchor);
    surfaceMarker.visible = Boolean(frame);
    if (frame) surfaceMarker.position.copy(frame.position).addScaledVector(frame.normal, radius * .25);
    if (cardDrag) {
      cardDrag.ghost.visible = Boolean(frame);
      if (frame) {
        cardDrag.ghost.matrix.copy(baseBranchUnitMatrix(current, cardDrag.unit, { ...lastAnchor, roll: 0, scale: 1 }, frame));
        cardDrag.ghost.matrixWorldNeedsUpdate = true;
      }
    }
  }

  function refresh(nextPack = pack, show = enabled, images = packImages) {
    pack = nextPack;
    packImages = images || EMPTY_IMAGES;
    enabled = show;
    const current = assembly();
    panel.hidden = !show;
    shaping.setVisible(show && api.isBranch() && panel.getClientRects().length > 0);
    if (!api.isBranch()) {
      selection.cancel();
      syncSelection = false; selection.clear(); syncSelection = true;
      cancelGesture();
      overlay.visible = false;
      syncAxes(false);
      refreshInspector(null);
      gizmo.detach();
      return;
    }
    const key = current ? (current.pack_id || '') + ':' + current.base.id + ':' + current.revision : '';
    if (key !== assemblyKey) {
      assemblyKey = key;
      if (transforming) api.cancelKeyboardTransform();
      cancelGesture();
      mountedImages = EMPTY_IMAGES;
      syncSelection = false; selection.clear(); syncSelection = true;
      guidePoint = 0;
      setStatus(current ? `当前有 ${current.placements.length} 个贴面单元。` : '');
    }
    const filter = el('SelectionFilter').value;
    const roles = filter === 'ALL' ? null : new Map(current?.units.map(unit => [unit.id,unit.role]));
    const existingIds = new Set(current?.placements.filter(item => !roles || roles.get(item.unit_id) === filter).map(item => item.id) || []);
    syncSelection = false;
    if (selection.replace(selection.ids.filter(id => existingIds.has(id)))) lastAnchor = currentPlacement();
    syncSelection = true;
    refreshInspector(current);
    if (!show) { showOverlay(); return; }
    if (cardDrag && (cardDrag.assembly !== current || cardDrag.asset !== api.getAsset())) cancelGesture();
    if (leafStroke && !validLeafStroke(leafStroke)) finishLeafBrush(false, true);
    if (current && packImages !== EMPTY_IMAGES && pack?.revision === current.revision
      && (pack.id === current.pack_id || (!current.pack_id && pack.base_branches?.some(base => base.id === current.base.id)))
      && pack.material.color === current.material.color && pack.material.normal === current.material.normal
      && pack.material.cutoff === current.material.cutoff && pack.material.roughness === current.material.roughness) mountedImages = packImages;
    const hasBaseChoices = Boolean(pack?.base_branches?.length);
    const bases = hasBaseChoices ? pack.base_branches : current ? [current.base] : EMPTY_UNITS;
    if (!bases.some(base => base.id === baseId)) baseId = bases[0]?.id || '';
    renderCards(el('Sources'), bases, hasBaseChoices ? packImages : mountedImages, baseId, true, hasBaseChoices);
    el('Sources').hidden = !bases.length;
    el('Use').disabled = !hasBaseChoices;
    el('ShapeOpen').disabled = !hasBaseChoices;
    const selectedBaseDiffers = current && (current.base.id !== baseId || current.pack_id !== pack?.id || current.revision !== pack?.revision);
    el('RehangRow').hidden = !(hasBaseChoices && selectedBaseDiffers && current.placements.length);
    el('Source').textContent = current ? `当前基础枝：${current.base.name}` : bases.length ? '选择基础枝后，使用套装内的叶花果贴面装配。' : '在叶花果资产工作台拆分整包 GLB 时，将树枝标为「基础枝」。';
    el('Editing').hidden = !current;
    if (!current) {
      cancelGesture();
      showOverlay();
      return;
    }
    if (!current.units.some(unit => unit.id === unitId)) unitId = current.units[0]?.id || '';
    el('UnitsHeading').textContent = pack?.id === current.pack_id ? '叶花果素材' : '当前基础枝的叶花果';
    renderCards(el('Units'), current.units, mountedImages, unitId, false, current.placements.length < MAX_PLACEMENTS);
    el('PlacementHelp').textContent = current.units.length ? '拖动卡片到枝面，松手添加。也可点选卡片，再点「在枝面放置」。' : '当前套装没有叶花果素材。';
    el('Place').disabled = !unitId || current.placements.length >= MAX_PLACEMENTS;
    el('BrushLeaves').disabled = current.units.find(unit => unit.id === unitId)?.role !== 'LEAF' || current.placements.length >= MAX_PLACEMENTS;
    if (mode === 'BRUSH_LEAVES') {
      if (el('BrushLeaves').disabled) finishLeafBrush(false, true);
      else { syncLeafBrushBar(); requestLeafHover(); }
    }
    const names = new Map(current.units.map(unit => [unit.id, unit.name]));
    setOptions(el('Placed'), [['选择已放置单元', ''], ...current.placements.map((item, index) => [`${index + 1}. ${names.get(item.unit_id) || item.unit_id}${item.automatic ? '（批量）' : ''}`, item.id])], selection.primary);
    el('Placed').disabled = !current.placements.length;
    const placement = currentPlacement();
    syncAssemblyTools();
    for (const [id, key] of [['PlacementRoll', 'roll'], ['PlacementScale', 'scale']]) {
      if (document.activeElement !== el(id)) el(id).value = selection.ids.length === 1 ? placement[key] : '';
    }
    guidePoint = Math.min(guidePoint, current.guide.length - 1);
    const last = current.guide.length - 1;
    setOptions(el('GuidePoint'), current.guide.map((point, index) => [index === 0 ? '根部' : index === last ? '枝梢' : `控制点 ${index}`, String(index)]), String(guidePoint));
    const fixed = guidePoint === 0 || guidePoint === last;
    for (const [index, suffix] of ['X', 'Y', 'Z'].entries()) {
      const input = el('Guide' + suffix);
      if (document.activeElement !== input) input.value = Number((current.guide[guidePoint][index] * (current.scale ?? 1) * 100).toFixed(2));
      input.disabled = fixed;
    }
    el('GuideApply').disabled = fixed;
    el('GuideAdd').disabled = current.guide.length >= MAX_GUIDE_POINTS;
    el('GuideRemove').disabled = fixed;
    showOverlay();
  }

  function syncAssemblyTools() {
    const editingSurface = Boolean(mode);
    const count = selection.ids.length;
    el('WholeScale').disabled = editingSurface;
    el('BatchApply').disabled = editingSurface || !assembly()?.units.length;
    el('GuideDetails').inert = editingSurface;
    inspector.inert = editingSurface;
    for (const id of ['Slide', 'Rotate', 'Scale', 'Remove']) el(id).disabled = editingSurface || !count;
    for (const id of ['PlacementRoll', 'PlacementScale']) el(id).disabled = editingSurface || count !== 1;
    railTool('WHOLE_SCALE').disabled = editingSurface;
    railTool('BRUSH_LEAVES').disabled = !enabled || el('BrushLeaves').disabled;
    railTool('BRUSH_LEAVES').setAttribute('aria-pressed', String(mode === 'BRUSH_LEAVES'));
    railTool('BRUSH_LEAVES').lastElementChild.textContent = mode === 'BRUSH_LEAVES' ? '退出刷叶' : '刷叶';
    const selecting = !editingSurface && !api.isBaseBranchBrush();
    for (const container of [panel, rail]) {
      container.querySelector('[data-base-branch-tool="SELECT"]').setAttribute('aria-pressed', String(selecting));
      for (const name of ['COMB', 'TWIST_BRUSH']) {
        container.querySelector(`[data-base-branch-tool="${name}"]`).disabled = editingSurface || !count;
      }
    }
    for (const name of ['MOVE', 'ROTATE', 'SCALE', 'SIZE_BRUSH']) railTool(name).disabled = editingSurface || !count;
  }

  function syncBrushButtons(tool, effect) {
    const size = tool === 'COMB' && effect === 'SCALE';
    railTool('SIZE_BRUSH').setAttribute('aria-pressed', String(size));
    for (const container of [panel, rail]) {
      container.querySelector('[data-base-branch-tool="COMB"]').setAttribute('aria-pressed', String(tool === 'COMB' && !size));
    }
  }

  function setMode(next) {
    mode = next;
    const painting = mode === 'BRUSH_LEAVES';
    el('Place').setAttribute('aria-pressed', String(mode === 'PLACE'));
    el('BrushLeaves').setAttribute('aria-pressed', String(painting));
    el('BrushLeaves').textContent = painting ? '退出刷叶' : '刷叶';
    brushBar.hidden = !painting;
    view.classList.toggle('base-branch-leaf-brushing', painting);
    syncAssemblyTools();
    if (painting) {
      syncLeafBrushBar();
      setLeafBrushReadout('idle');
    } else resetLeafHover();
    api.canvas.classList.toggle('base-branch-surface-pick', Boolean(mode || drag));
  }
  function releaseDrag() {
    const ended = drag;
    drag = null;
    if (ended) {
      api.controls.enabled = ended.controlsEnabled;
      if (api.canvas.hasPointerCapture(ended.pointerId)) api.canvas.releasePointerCapture(ended.pointerId);
    }
    return ended;
  }
  function cancelGesture() {
    finishLeafBrush(false, false);
    if (cardDrag) {
      cardDrag.ghost.removeFromParent();
      cardDrag.ghost.geometry.dispose();
      cardDrag.ghost.material.dispose();
      cardDrag = null;
    }
    dropHint.hidden = true;
    selection.cancel();
    if (gizmoDrag) finishGizmo(false);
    releaseDrag()?.session.cancel();
    lastAnchor = null;
    setMode('');
  }
  function tool(next) {
    if (!canEdit()) api.setTool('SELECT');
    const same = mode === next;
    cancelGesture();
    if (!same && canEdit() && active()) setMode(next);
    showOverlay();
    if (mode) api.canvas.focus({ preventScroll: true });
    if (mode === 'BRUSH_LEAVES') requestAnimationFrame(() => {
      if (mode === 'BRUSH_LEAVES' && !leafStroke && active()) woodPicker();
    });
    setStatus(mode === 'PLACE' ? '点击基础枝表面放置单元，Esc 退出。' : '');
  }
  function pickables() {
    const asset = api.getAsset();
    if (!asset || asset.group.userData.pending_rebuild) return null;
    const mounted = asset.authoring.base_branch_assembly;
    if (asset !== assetCache || pickingCache?.mounted !== mounted) {
      assetCache = asset;
      pickingCache = { mounted, surfaces: [], units: [], unitsById: new Map() };
      asset.group.traverse(object => {
        if (!object.isMesh) return;
        if (object.userData.base_branch_mesh === true && object.userData.stable_id === BASE_BRANCH_GUIDE) pickingCache.surfaces.push(object);
        if (object.userData.base_branch_unit_id && object.userData.base_branch_host === BASE_BRANCH_GUIDE) {
          pickingCache.units.push(object);
          pickingCache.unitsById.set(object.userData.base_branch_unit_id, object);
        }
      });
    }
    return pickingCache;
  }
  const ray = new THREE.Raycaster();
  const screen = new THREE.Vector2();
  const localRay = new THREE.Ray();
  let surfaceProjection = null;
  function visible(object) {
    if (!object) return false;
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return true;
  }
  function rayHit(event, objects) {
    const rect = api.canvas.getBoundingClientRect();
    if (!objects?.length || !rect.width || !rect.height) return null;
    const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    api.camera.updateMatrixWorld();
    assetCache.group.updateWorldMatrix(true, false);
    for (const object of objects) object.updateWorldMatrix(true, false);
    ray.setFromCamera(screen.set(x * 2 - 1, 1 - y * 2), api.camera);
    return ray.intersectObjects(objects, false).find(hit => visible(hit.object)) || null;
  }
  function anchorAt(event) {
    return woodPicker()?.(event.clientX, event.clientY)?.anchor || null;
  }
  function woodPicker(withNormal = false) {
    const mesh = pickables()?.surfaces.find(visible), current = assembly();
    if (!mesh || !current) return null;
    const bounds = api.canvas.getBoundingClientRect(), camera = api.camera;
    if (!bounds.width || !bounds.height) return null;
    if (surfaceProjection?.base !== current.base || surfaceProjection.scale !== current.scale) {
      surfaceProjection = { base: current.base, scale: current.scale, projector: createBaseBranchSurfaceProjector(current) };
    }
    const { projector } = surfaceProjection, side = mesh.material.side;
    camera.updateWorldMatrix(true, false);
    mesh.updateWorldMatrix(true, false);
    const inverse = mesh.matrixWorld.clone().invert();
    const height = bounds.height * Math.abs(camera.projectionMatrix.elements[5]);
    const pixelFactor = 2 * inverse.getMaxScaleOnAxis() / Math.max(1, height);
    return (x, y) => {
      const u = (x - bounds.left) / bounds.width, v = (y - bounds.top) / bounds.height;
      if (u < 0 || u > 1 || v < 0 || v > 1) return null;
      ray.setFromCamera(screen.set(u * 2 - 1, 1 - v * 2), camera);
      const hit = projector.raycast(localRay.copy(ray.ray).applyMatrix4(inverse), { side, withNormal });
      if (!hit) return null;
      const depth = -screenDepth.copy(hit.point).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse).z;
      if (depth < camera.near || depth > camera.far) return null;
      return { ...hit, metresPerPixel: pixelFactor * (camera.isOrthographicCamera ? 1 : depth) };
    };
  }
  const screenDepth = new THREE.Vector3();
  function placementMesh(id) {
    const object = id && pickables()?.unitsById.get(id);
    return visible(object) ? object : null;
  }
  function selectPlacement(id) {
    selection.replace(id ? [id] : []);
    lastAnchor = currentPlacement();
    if (lastAnchor) api.canvas.focus({preventScroll:true});
  }
  function placementPreview(current, placement, object, frame = baseBranchAnchorFrame(current, placement)) {
    const unit = current.units.find(item => item.id === placement.unit_id);
    const inversePose = baseBranchUnitMatrix(current, unit, placement, frame).invert();
    object.updateWorldMatrix(true, false);
    const originalMatrix = object.matrix.clone(), originalAutoUpdate = object.matrixAutoUpdate;
    const groupToParent = object.parent.matrixWorld.clone().invert().multiply(api.getAsset().group.matrixWorld);
    const parentToGroup = groupToParent.clone().invert();
    function applyTransform(delta) {
      object.matrixAutoUpdate = false;
      object.matrix.copy(groupToParent).multiply(delta).multiply(parentToGroup).multiply(originalMatrix);
      object.matrixWorldNeedsUpdate = true;
      object.updateMatrixWorld(true);
    }
    return {
      apply(next, nextFrame) {
        applyTransform(baseBranchUnitMatrix(current, unit, next, nextFrame).multiply(inversePose));
      },
      applyTransform,
      restore() {
        object.matrix.copy(originalMatrix);
        object.matrixAutoUpdate = originalAutoUpdate;
        object.matrixWorldNeedsUpdate = true;
        object.updateMatrixWorld(true);
      },
    };
  }
  function applyEdits(label, records) {
    const edits = new Map(records.map(record => [record.id, {...record, automatic:false}]));
    return update(label, (next, current) => {
      next.placements = current.placements.map(record => edits.get(record.id) || record);
    });
  }
  let combTargets;
  function combSelection() {
    const current = assembly(), meshes = pickables(), revision = selection.revision;
    const selected = selection.ids;
    if (!current || !meshes) return { selected:selected.length, targets:[] };
    if (combTargets?.current !== current || combTargets.meshes !== meshes || combTargets.revision !== revision) {
      const records = new Map(current.placements.map(record => [record.id, record]));
      const sources = new Map(current.units.map(unit => [unit.id, unit]));
      const targets = selected.flatMap(id => {
        const object = meshes.unitsById.get(id), record = records.get(id);
        const unit = record && sources.get(record.unit_id);
        return unit && object ? [{ object, unit, record }] : [];
      });
      combTargets = { current, meshes, revision, targets };
    }
    return { selected:selected.length, targets:combTargets.targets.filter(target => visible(target.object)) };
  }
  const combBrush = {
    deferStrokeInput: true,
    entries() {
      const current = assembly();
      return combSelection().targets.flatMap(target => {
        if (target.entry === undefined) {
          const anchor = baseBranchAnchorFrame(current, target.record);
          target.entry = anchor ? baseBranchBrushEntry(current, target.unit, target.record, anchor) : null;
        }
        return target.entry ? [target.entry] : [];
      });
    },
    summary() {
      const { selected, targets } = combSelection();
      const editable = targets.length;
      return { selected, editable, reason: editable ? '' : selected ? '所选叶花果暂不可刷，请检查挂点和可见性。' : '先点选叶花果，或按住 Shift 加选挂件。' };
    },
    reference(event) {
      const current = assembly(), meshes = pickables();
      const hit = rayHit(event, meshes ? [...meshes.surfaces, ...meshes.units] : []);
      const record = current.placements.find(item => item.id === hit?.object.userData.base_branch_unit_id);
      const unit = record && current.units.find(item => item.id === record.unit_id);
      const anchor = unit && baseBranchAnchorFrame(current, record);
      return anchor ? baseBranchBrushFrame(current, unit, record, anchor) : null;
    },
    preview(entries) {
      const current = assembly(), asset = api.getAsset(), revision = selection.revision;
      const previews = new Map(entries.map(({ id, instance }) => {
        const object = placementMesh(id);
        return [id, { object, preview: placementPreview(current, instance, object) }];
      }));
      return {
        valid: () => brushing() && current === assembly() && asset === api.getAsset() && revision === selection.revision,
        updateTransforms(transforms) {
          let axesChanged = false;
          for (const [id, motion] of transforms) {
            const { object, preview } = previews.get(id);
            preview.applyTransform(motion.matrix);
            const index = axisIndices.get(id);
            if (index === undefined) continue;
            writeAxis(object, index);
            axesChanged = true;
          }
          if (axesChanged) axisPositions.needsUpdate = true;
        },
        restore() {
          if (api.getAsset() !== asset) return;
          for (const { preview } of previews.values()) preview.restore();
          if (current === assembly()) syncAxes(brushing());
        },
      };
    },
    commitPreview(updates, label, preview) {
      if (!brushing()) { preview.restore(); return false; }
      return api.commitPreview(preview, () => applyEdits(label, [...updates.values()].map(({ radius_scale, ...record }) => record)));
    },
  };
  const transformLabels = {translate:'已贴面移动叶花果', rotate:'已旋转叶花果', scale:'已缩放叶花果', duplicate:'已复制并贴面放置叶花果'};
  function poseSession(operation, primaryId = selection.primary) {
    const asset = api.getAsset(), current = assembly(), records = selectedPlacements();
    const objects = records.map(record => placementMesh(record.id));
    if (!records.length || objects.some(object => !object)) return null;
    const duplicate = operation === 'duplicate';
    if (duplicate && records.length + current.placements.length > MAX_PLACEMENTS) {
      api.toast(`复制后超过 ${MAX_PLACEMENTS} 个挂件，请减少选择数量`, true);
      return null;
    }
    const pose = createBaseBranchPoseEdit(current, records, primaryId);
    const centered = el('Pivot').value === 'CENTER';
    const ghosts = [];
    const previews = pose.entries.map(({record,frame}, i) => {
      let object = objects[i];
      if (duplicate) {
        object.updateWorldMatrix(true, false);
        const copy = object.clone(false);
        copy.name = '基础枝复制预览';
        copy.matrixAutoUpdate = false;
        copy.matrix.copy(api.scene.matrixWorld.clone().invert().multiply(object.matrixWorld));
        api.scene.add(copy);
        ghosts.push(copy);
        object = copy;
      }
      return placementPreview(current, record, object, frame);
    });
    let next = records, blocked = false;
    const modelToGroup = asset.group.getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply(api.modelRoot.getWorldQuaternion(new THREE.Quaternion()));
    const groupToModel = modelToGroup.clone().invert();
    const modelToGroupMatrix = asset.group.matrixWorld.clone().invert().multiply(api.modelRoot.matrixWorld);
    const center = api.modelRoot.worldToLocal(asset.group.localToWorld((centered ? pose.center : pose.primary.frame.position).clone()));
    const restore = () => {
      previews.forEach(preview => preview.restore());
      ghosts.forEach(object => object.removeFromParent());
    };
    return {
      asset, current, pose, center,
      valid: () => canEdit() && assembly() === current && api.getAsset() === asset && !asset.group.userData.pending_rebuild
        && records.length === selection.ids.length && records.every(record => selection.has(record.id)),
      apply(candidate) {
        blocked = !candidate;
        if (candidate) {
          next = candidate;
          previews.forEach((preview,i) => preview.apply(next[i]));
          lastAnchor = next[pose.entries.indexOf(pose.primary)];
        }
        showOverlay();
        return !blocked;
      },
      transform(rotation, factor) {
        const local = modelToGroup.clone().multiply(rotation).multiply(groupToModel);
        return pose.transform({rotation:local, factor, centered});
      },
      translate(delta) {
        const linear = new THREE.Matrix3().setFromMatrix4(modelToGroupMatrix);
        return pose.moveBy(delta.clone().applyMatrix3(linear));
      },
      commit() {
        if (blocked) {
          restore();
          api.toast('部分挂件无法贴回枝面，本次变换已取消', true);
        } else if (duplicate) {
          const copies = next.map(record => ({...record, id:'BASE_PLACEMENT_' + crypto.randomUUID(), automatic:false}));
          if (api.commitPreview({restore}, () => update(transformLabels.duplicate, (draft, before) => {
            draft.placements = [...before.placements, ...copies];
          }))) selection.replace(copies.map(record => record.id));
        } else if (next.some((record, i) => record !== records[i])) {
          api.commitPreview({restore}, () => applyEdits(transformLabels[operation], next.filter((record, i) => record !== records[i])));
        } else restore();
        lastAnchor = currentPlacement();
        refresh();
      },
      cancel() {
        restore();
        lastAnchor = currentPlacement();
        refresh();
      },
    };
  }
  function keyboardTransform(operation) {
    if (!Object.hasOwn(transformLabels, operation) || !canEdit() || drag || cardDrag || gizmoDrag || selection.dragging || transforming) return null;
    const session = poseSession(operation);
    if (!session) return null;
    cancelGesture();
    transforming = true;
    lastAnchor = currentPlacement();
    const moving = operation === 'translate' || operation === 'duplicate';
    const {frame,record} = session.pose.primary;
    let mouseAnchor = record;
    return {
      center:session.center, uniform:true, alongBranch:moving, scaleRange:session.pose.scaleRange,
      label: `${operation === 'duplicate' ? '复制 ' : ''}${session.pose.entries.length} 个叶花果单元`,
      ...(moving ? {axisLabel:'吸附基础枝表面', hint:'移到枝面 / 数值沿排布曲线'} : {}),
      valid:session.valid,
      update({rotation, scale}, {start, pointer, numeric}) {
        if (!moving) {
          return session.apply(session.transform(rotation, scale.x)) ? undefined : {hint:'部分挂件无法贴回枝面'};
        }
        const value = numeric.trim() && Number.isFinite(Number(numeric)) ? Number(numeric) : null;
        const dx = pointer.x - start.x, dy = pointer.y - start.y;
        let next;
        if (value !== null) next = session.pose.slide(value);
        else {
          if (Math.hypot(dx, dy) > .01) {
            const bounds = api.canvas.getBoundingClientRect();
            const projected = session.asset.group.localToWorld(frame.position.clone()).project(api.camera);
            const target = {clientX:bounds.left+(projected.x+1)*bounds.width/2+dx, clientY:bounds.top+(1-projected.y)*bounds.height/2+dy};
            mouseAnchor = anchorAt(target) || anchorAt({clientX:pointer.x,clientY:pointer.y}) || mouseAnchor;
          } else mouseAnchor = record;
          next = session.pose.moveTo(mouseAnchor);
        }
        const ok = session.apply(next);
        const distance = baseBranchAnchorFrame(session.current, lastAnchor).t - frame.t;
        return {amount:distance * frame.guideLength, ...(!ok ? {hint:'部分挂件无法贴回枝面'} : {})};
      },
      commit() { transforming = false; session.commit(); },
      cancel() { transforming = false; session.cancel(); },
    };
  }
  function wholeScaleSelected() {
    return api.isBranch() && !!assembly() && api.getSelection() === BASE_BRANCH_GUIDE;
  }
  function wholeScaleTransform() {
    if (!canEdit() || !wholeScaleSelected() || mode || drag || cardDrag || gizmoDrag || selection.dragging || transforming) return null;
    const current = assembly(), asset = api.getAsset(), meshes = pickables();
    if (!meshes?.surfaces.length) return null;
    const scale = current.scale ?? 1;
    const [minimum, maximum] = BASE_BRANCH_SCALE_RANGE;
    asset.group.updateWorldMatrix(true, false);
    const center = api.modelRoot.worldToLocal(asset.group.localToWorld(new THREE.Vector3()));
    const originals = [...meshes.surfaces, ...meshes.units].map(object => {
      object.updateWorldMatrix(true, false);
      const matrix = object.matrix.clone(), autoUpdate = object.matrixAutoUpdate;
      const toGroup = asset.group.matrixWorld.clone().invert().multiply(object.parent.matrixWorld);
      return { object, matrix, autoUpdate, toGroup, fromGroup: toGroup.clone().invert() };
    });
    const helperVisibility = api.selectionHelpers.map(object => object.visible);
    api.selectionHelpers.forEach(object => { object.visible = false; });
    const delta = new THREE.Matrix4();
    const restore = () => {
      for (const { object, matrix, autoUpdate } of originals) {
        object.matrixAutoUpdate = autoUpdate;
        object.matrix.copy(matrix);
        object.updateMatrixWorld(true);
      }
    };
    const finish = () => {
      wholeScalePreview = 1;
      transforming = false;
      api.selectionHelpers.forEach((object, index) => { object.visible = helperVisibility[index]; });
    };
    transforming = true;
    return {
      center, uniform: true, lockAxes: true, scaleRange: [minimum / scale, maximum / scale],
      label: current.base.name, hint: '以枝根为中心', uniformHint: '木枝和已放置的叶花果一起等比缩放。',
      valid: () => canEdit() && wholeScaleSelected() && assembly() === current && api.getAsset() === asset && !asset.group.userData.pending_rebuild,
      update({ scale: factor }) {
        wholeScalePreview = factor.x;
        delta.makeScale(factor.x, factor.x, factor.x);
        for (const { object, matrix, toGroup, fromGroup } of originals) {
          object.matrixAutoUpdate = false;
          object.matrix.copy(fromGroup).multiply(delta).multiply(toGroup).multiply(matrix);
          object.updateMatrixWorld(true);
        }
        showOverlay();
      },
      commit() {
        const nextScale = THREE.MathUtils.clamp(scale * wholeScalePreview, minimum, maximum);
        finish();
        if (Math.abs(nextScale - scale) > 1e-9) {
          api.commitPreview({restore}, () => update('已整体缩放基础枝', next => {
            if (Math.abs(nextScale - 1) < 1e-9) delete next.scale;
            else next.scale = nextScale;
          }));
        } else restore();
        showOverlay();
      },
      cancel() { finish(); restore(); showOverlay(); },
    };
  }
  function place(anchor, id = unitId) {
    const current = assembly();
    if (!anchor || !current?.units.some(unit => unit.id === id) || current.placements.length >= MAX_PLACEMENTS) return false;
    const placementId = 'BASE_PLACEMENT_' + crypto.randomUUID();
    if (!update('已放置叶花果单元', (next, current) => {
      next.placements = [...current.placements, { id: placementId, unit_id: id, ...anchor, roll: 0, scale: 1, automatic: false }];
    })) return false;
    selectPlacement(placementId);
    refresh();
    setStatus(`已放置 ${assembly().placements.length} 个单元。${mode === 'PLACE' ? '可继续点选枝面，或按 Esc 结束。' : 'G 移动，R 旋转，S 等比缩放。'}`);
    return true;
  }
  function leafSpacing() {
    const input = el('BrushSpacing'), value = input.valueAsNumber;
    return input.validity.valid ? value : null;
  }
  function syncLeafBrushBar() {
    const unit = assembly()?.units.find(item => item.id === unitId);
    if (el('BrushUnit').textContent !== (unit?.name || '')) el('BrushUnit').textContent = unit?.name || '';
    const value = leafSpacing();
    const slider = el('BrushSpacingSlider');
    if (value !== null && slider.valueAsNumber !== value) slider.value = String(value);
    el('BrushLess').disabled = Boolean(leafStroke) || value === LEAF_SPACING_MIN;
    el('BrushMore').disabled = Boolean(leafStroke) || value === LEAF_SPACING_MAX;
    el('BrushSpacing').disabled = Boolean(leafStroke);
    slider.disabled = Boolean(leafStroke);
  }
  function changeLeafSpacing(value) {
    if (leafStroke) return;
    const next = Number.isFinite(value) ? THREE.MathUtils.clamp(Math.round(value * 10) / 10, LEAF_SPACING_MIN, LEAF_SPACING_MAX) : lastSpacing;
    el('BrushSpacing').value = String(next);
    lastSpacing = next;
    syncLeafBrushBar();
    requestLeafHover();
  }
  function setLeafBrushReadout(state, count = 0) {
    const messages = { idle: '移到枝面预览落点，按住左键拖动。', ready: '这里可以落叶，按住左键沿枝面刷。',
      blocked: '这里已有挂点，移开一点再刷。', empty: '当前指针下没有木枝，移回枝面继续。',
      invalid: `请输入 ${LEAF_SPACING_MIN}–${LEAF_SPACING_MAX} cm 的间距。`,
      painting: `本笔已预览 ${count} 片 · 松手确认，Esc 取消。` };
    if (brushBar.dataset.state !== state) brushBar.dataset.state = state;
    const readout = el('BrushReadout');
    if (readout.textContent !== messages[state]) readout.textContent = messages[state];
  }
  function existingLeafAnchors(current) {
    if (leafAnchors?.assembly !== current) leafAnchors = { assembly: current,
      anchors: current.placements.flatMap(anchor => {
        const frame = baseBranchAnchorFrame(current, anchor);
        return frame ? [{ anchor, point: frame.position, normal: frame.normal }] : [];
      }) };
    return leafAnchors.anchors;
  }
  function leafPreviewMaterial(meshes, surface) {
    return meshes.units[0]?.material || (surface.material.userData.base_branch_atlas ? surface.material : null);
  }
  function hideLeafCursor() {
    brushCursor.hidden = true;
    if (leafHover) leafHover.mesh.visible = false;
  }
  function resetLeafHover() {
    cancelAnimationFrame(leafHoverFrame);
    leafHoverFrame = 0;
    leafPointer = null;
    hideLeafCursor();
    if (!leafHover) return;
    leafHover.mesh.removeFromParent();
    leafHover.mesh.geometry.dispose();
    if (!leafHover.borrowed) leafHover.mesh.material.dispose();
    leafHover = null;
  }
  function showLeafCursor(hit, x, y, spacing, state) {
    const bounds = view.getBoundingClientRect();
    const radius = THREE.MathUtils.clamp(spacing / Math.max(hit.metresPerPixel, 1e-6) / 2, 8, 52);
    brushCursor.style.transform = `translate(${x - bounds.left}px,${y - bounds.top}px)`;
    brushCursor.style.setProperty('--brush-marker-size', `${radius * 2}px`);
    brushCursor.dataset.state = state;
    const label = state === 'blocked' ? '已有挂点' : `${Number((spacing * 100).toFixed(1))} cm`;
    if (brushCursor.firstElementChild.textContent !== label) brushCursor.firstElementChild.textContent = label;
    brushCursor.hidden = false;
  }
  function previewLeafAt(current, unit, hit) {
    const asset = api.getAsset(), meshes = pickables(), surface = meshes?.surfaces.find(visible);
    if (!surface) return;
    const borrowed = leafPreviewMaterial(meshes, surface);
    if (leafHover?.asset !== asset || leafHover.unit !== unit || leafHover.borrowed !== borrowed) {
      const pointer = leafPointer;
      resetLeafHover();
      leafPointer = pointer;
      const mesh = new THREE.Mesh(deserializeGeometry(unit.geometry), borrowed || new THREE.MeshBasicMaterial({ color: 0xc7ed85, side: THREE.DoubleSide }));
      mesh.name = 'BaseBranchLeafHoverPreview';
      mesh.matrixAutoUpdate = false;
      mesh.raycast = () => {};
      api.modelRoot.add(mesh);
      leafHover = { asset, unit, mesh, borrowed };
    }
    const matrix = baseBranchUnitMatrix(current, unit, { ...hit.anchor, roll: 0, scale: 1 });
    if (!matrix) return;
    api.modelRoot.updateWorldMatrix(true, false);
    asset.group.updateWorldMatrix(true, false);
    leafHover.mesh.matrix.copy(api.modelRoot.matrixWorld).invert().multiply(asset.group.matrixWorld).multiply(matrix);
    leafHover.mesh.matrixWorldNeedsUpdate = true;
    leafHover.mesh.visible = true;
  }
  function updateLeafHover() {
    leafHoverFrame = 0;
    if (mode !== 'BRUSH_LEAVES' || leafStroke) return;
    const value = leafSpacing();
    if (value === null || !active() || !canEdit() || !leafPointer) {
      hideLeafCursor();
      setLeafBrushReadout(value === null ? 'invalid' : 'idle');
      return;
    }
    const { x, y } = leafPointer, hit = woodPicker(true)?.(x, y), current = assembly();
    if (!hit) { hideLeafCursor(); setLeafBrushReadout('empty'); return; }
    const spacing = value / 100;
    const allowed = canPlaceBaseBranchLeaf(hit, existingLeafAnchors(current), spacing);
    const unit = current.units.find(item => item.id === unitId);
    if (allowed && unit?.role === 'LEAF') previewLeafAt(current, unit, hit);
    else if (leafHover) leafHover.mesh.visible = false;
    const state = allowed ? 'ready' : 'blocked';
    showLeafCursor(hit, x, y, spacing, state);
    setLeafBrushReadout(state);
  }
  function requestLeafHover() {
    if (!leafHoverFrame && mode === 'BRUSH_LEAVES' && !leafStroke) leafHoverFrame = requestAnimationFrame(updateLeafHover);
  }
  function validLeafStroke(stroke) {
    return mode === 'BRUSH_LEAVES' && active() && canEdit() && !transforming && assembly() === stroke.assembly
      && api.getAsset() === stroke.asset && !stroke.asset.group.userData.pending_rebuild && unitId === stroke.unit.id;
  }
  function beginLeafBrush(event) {
    if (leafStroke || transforming || event.isPrimary === false) return;
    const current = assembly(), asset = api.getAsset(), meshes = pickables();
    const unit = current?.units.find(item => item.id === unitId);
    const capacity = MAX_PLACEMENTS - (current?.placements.length || 0);
    const surface = meshes?.surfaces.find(visible);
    if (unit?.role !== 'LEAF' || !surface || capacity <= 0) return;
    const value = leafSpacing();
    if (value === null) { el('BrushSpacing').focus(); return; }
    const spacing = value / 100;
    hideLeafCursor();
    const borrowed = leafPreviewMaterial(meshes, surface);
    const material = borrowed || new THREE.MeshBasicMaterial({ color: 0xc7ed85, side: THREE.DoubleSide });
    const display = new THREE.InstancedMesh(deserializeGeometry(unit.geometry), material, capacity);
    display.name = 'BaseBranchLeafStrokePreview';
    display.count = 0;
    display.frustumCulled = false;
    display.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    asset.group.add(display);
    const records = [];
    const stroke = createBaseBranchLeafStroke({ spacing, capacity,
      existing: existingLeafAnchors(current),
      add({ anchor }) {
        const record = { ...anchor, unit_id: unit.id, roll: 0, scale: 1, automatic: false };
        display.setMatrixAt(records.length, baseBranchUnitMatrix(current, unit, record));
        records.push(record);
      },
    });
    leafStroke = { assembly: current, asset, unit, capacity, display, records, stroke, spacing,
      pointerId: event.pointerId, controlsEnabled: api.controls.enabled,
      restore() { display.removeFromParent(); display.dispose(); display.geometry.dispose(); if (!borrowed) material.dispose(); },
    };
    api.canvas.focus({ preventScroll: true });
    syncLeafBrushBar();
    setLeafBrushReadout('painting');
    api.controls.enabled = false;
    if (event.isTrusted) api.canvas.setPointerCapture(event.pointerId);
    queueLeafPoint(event);
    flushLeafPoints();
  }
  function queueLeafPoint(event) {
    const points = event.getCoalescedEvents?.() || [];
    for (const point of points) leafPoints.push([point.clientX, point.clientY]);
    leafPoints.push([event.clientX, event.clientY]);
    if (!leafFrame) leafFrame = requestAnimationFrame(() => {
      try { flushLeafPoints(); }
      catch (error) { finishLeafBrush(false, true); report(error); }
    });
  }
  function flushLeafPoints() {
    cancelAnimationFrame(leafFrame);
    leafFrame = 0;
    const points = leafPoints;
    leafPoints = [];
    const pending = leafStroke;
    if (!pending) return;
    if (!validLeafStroke(pending)) { finishLeafBrush(false, true); return; }
    const pick = woodPicker(true);
    if (!pick) return;
    for (const [x, y] of points) pending.stroke.move(x, y, pick);
    if (points.length) {
      const [x, y] = points.at(-1), hit = pick(x, y);
      if (hit) showLeafCursor(hit, x, y, pending.spacing, 'painting');
      else brushCursor.hidden = true;
    }
    if (pending.display.count === pending.records.length) return;
    pending.display.count = pending.records.length;
    pending.display.instanceMatrix.needsUpdate = true;
    setLeafBrushReadout('painting', pending.records.length);
    setStatus(`已预览 ${pending.records.length} 片叶。${pending.records.length >= pending.capacity ? `已达 ${MAX_PLACEMENTS} 个挂件上限。` : '松手提交。'}`);
  }
  function finishLeafBrush(commit, exitMode) {
    const pending = leafStroke;
    const valid = commit && pending && validLeafStroke(pending);
    leafStroke = null;
    cancelAnimationFrame(leafFrame);
    leafFrame = 0;
    leafPoints = [];
    hideLeafCursor();
    if (exitMode && mode === 'BRUSH_LEAVES') setMode('');
    if (!pending) return;
    if (mode === 'BRUSH_LEAVES') { syncLeafBrushBar(); requestLeafHover(); }
    api.controls.enabled = pending.controlsEnabled;
    if (api.canvas.hasPointerCapture(pending.pointerId)) api.canvas.releasePointerCapture(pending.pointerId);
    if (!valid || !pending.records.length) {
      pending.restore();
      if (valid) setStatus('本笔没有放置叶片。请拖过有空位的枝面。');
      return;
    }
    const placements = pending.records.map(record => ({ ...record, id: 'BASE_PLACEMENT_' + crypto.randomUUID() }));
    const label = `已刷入 ${placements.length} 片叶`;
    const accepted = api.commitPreview(pending, () => update(label, (next, before) => {
      next.placements = [...before.placements, ...placements];
    }));
    if (accepted) {
      if (placements.length === pending.capacity) setMode('');
      setStatus(`${label}，可撤销整笔。${placements.length === pending.capacity ? `已达 ${MAX_PLACEMENTS} 个挂件上限。` : ''}`);
    }
  }
  function cancelLeafWithPointer(event) {
    suppressLeafMenu = true;
    swallow(event);
    finishLeafBrush(false, true);
    setStatus('已取消刷叶。');
  }
  function startCardDrag(event, id) {
    const current = assembly(), asset = api.getAsset();
    const unit = current?.units.find(item => item.id === id);
    if (!active() || !unit || !event.dataTransfer || !pickables()?.surfaces.length || current.placements.length >= MAX_PLACEMENTS) {
      event.preventDefault();
      return;
    }
    cancelGesture();
    unitId = id;
    selectCard(el('Units'), unitId);
    const ghost = new THREE.Mesh(deserializeGeometry(unit.geometry), new THREE.MeshBasicMaterial({
      color: 0xd8f6ae, side: THREE.DoubleSide, transparent: true, opacity: .68, depthWrite: false,
    }));
    ghost.name = '基础枝贴面放置预览';
    ghost.visible = false;
    ghost.matrixAutoUpdate = false;
    overlay.add(ghost);
    cardDrag = { unit, asset, assembly: current, ghost };
    event.dataTransfer.setData(CARD_MIME, id);
    event.dataTransfer.effectAllowed = 'copy';
  }
  function cardDragEvent(event) {
    return cardDrag && event.dataTransfer?.types.includes(CARD_MIME);
  }
  function cardAnchorAt(event) {
    if (!active() || api.getAsset() !== cardDrag.asset || assembly() !== cardDrag.assembly) return null;
    return anchorAt(event);
  }
  api.canvas.addEventListener('dragover', event => {
    if (!cardDragEvent(event)) return;
    swallow(event);
    lastAnchor = cardAnchorAt(event);
    event.dataTransfer.dropEffect = lastAnchor ? 'copy' : 'none';
    dropHint.textContent = lastAnchor ? `松手添加「${cardDrag.unit.name}」` : '拖到基础枝的表面';
    dropHint.style.left = Math.max(0, Math.min(window.innerWidth - 205, event.clientX + 14)) + 'px';
    dropHint.style.top = Math.max(0, Math.min(window.innerHeight - 40, event.clientY + 14)) + 'px';
    dropHint.hidden = false;
    showOverlay();
  }, true);
  api.canvas.addEventListener('dragleave', event => {
    if (!cardDragEvent(event)) return;
    lastAnchor = null;
    dropHint.hidden = true;
    showOverlay();
  });
  api.canvas.addEventListener('drop', event => {
    if (!cardDragEvent(event)) return;
    swallow(event);
    const { id, name } = cardDrag.unit;
    const anchor = event.dataTransfer.getData(CARD_MIME) === id ? cardAnchorAt(event) : null;
    cancelGesture();
    if (anchor && place(anchor, id)) api.toast(`已贴面添加「${name}」`);
    showOverlay();
  }, true);
  window.addEventListener('dragend', () => {
    if (!cardDrag) return;
    cancelGesture();
    showOverlay();
  });
  function swallow(event) { event.preventDefault(); event.stopImmediatePropagation(); }

  function gizmoPointer(event, button = event.button) {
    const bounds = api.canvas.getBoundingClientRect();
    return {x:(event.clientX-bounds.left)/bounds.width*2-1, y:1-(event.clientY-bounds.top)/bounds.height*2, button};
  }
  function beginGizmo(event) {
    if (!gizmo.object) return false;
    gizmoHelper.updateMatrixWorld(true);
    gizmo.pointerHover(gizmoPointer(event));
    if (!gizmo.axis) return false;
    const session = poseSession(gizmo.mode);
    if (!session) return false;
    gizmo.pointerDown(gizmoPointer(event));
    if (!gizmo.dragging) { session.cancel(); return false; }
    api.canvas.focus({preventScroll:true});
    gizmoDrag = {session, pointerId:event.pointerId, controlsEnabled:api.controls.enabled,
      origin:gizmoProxy.position.clone(), axis:gizmo.axis};
    api.controls.enabled = false;
    if (event.isTrusted) api.canvas.setPointerCapture(event.pointerId);
    return true;
  }
  function finishGizmo(commit) {
    const ended = gizmoDrag;
    if (!ended) return;
    gizmoDrag = null;
    gizmo.pointerUp({button:0});
    api.controls.enabled = ended.controlsEnabled;
    if (api.canvas.hasPointerCapture(ended.pointerId)) api.canvas.releasePointerCapture(ended.pointerId);
    if (commit && ended.session.valid()) ended.session.commit();
    else ended.session.cancel();
  }
  gizmo.addEventListener('objectChange', () => {
    if (!gizmoDrag) return;
    const {session, origin, axis} = gizmoDrag;
    let next;
    if (gizmo.mode === 'translate') next = session.translate(gizmoProxy.position.clone().sub(origin));
    else if (gizmo.mode === 'rotate') next = session.transform(gizmoProxy.quaternion, 1);
    else next = session.transform(gizmoProxy.quaternion, gizmoProxy.scale[axis === 'Y' ? 'y' : axis === 'Z' ? 'z' : 'x']);
    if (!session.apply(next)) setStatus('部分挂件无法贴回枝面');
  });

  api.canvas.addEventListener('pointerdown', event => {
    suppressLeafMenu = false;
    if (event.button === 2 && mode === 'BRUSH_LEAVES' && !event.altKey) {
      cancelLeafWithPointer(event);
      return;
    }
    if (selection.begin(event)) { swallow(event); return; }
    if (!canEdit() || event.button !== 0 || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (mode === 'BRUSH_LEAVES') {
      swallow(event);
      try { beginLeafBrush(event); }
      catch (error) { finishLeafBrush(false, true); report(error); }
      return;
    }
    if (mode) {
      swallow(event);
      const anchor = anchorAt(event);
      if (!anchor) return;
      lastAnchor = anchor;
      place(anchor);
      return;
    }
    if (beginGizmo(event)) { swallow(event); return; }
    const meshes = pickables();
    const hit = rayHit(event, meshes ? [...meshes.surfaces, ...meshes.units] : []);
    const id = hit?.object.userData.base_branch_placement_id || hit?.object.userData.base_branch_unit_id;
    if (!id || !selectionTargets().some(target => target.id === id)) {
      selection.clear();
      return;
    }
    swallow(event);
    if (!selection.has(id)) selectPlacement(id);
    else api.canvas.focus({preventScroll:true});
    const session = poseSession('translate', id);
    if (!session) return;
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, controlsEnabled: api.controls.enabled,
      id, session, moved: false };
    api.controls.enabled = false;
    if (event.isTrusted) api.canvas.setPointerCapture(event.pointerId);
    api.canvas.classList.add('base-branch-surface-pick');
    refresh();
  }, true);
  api.canvas.addEventListener('pointermove', event => {
    if (mode === 'BRUSH_LEAVES') {
      leafPointer = { x: event.clientX, y: event.clientY };
      if (leafStroke?.pointerId === event.pointerId) {
        if (event.buttons & 2) cancelLeafWithPointer(event);
        else { swallow(event); queueLeafPoint(event); }
      } else if (!event.buttons) requestLeafHover();
      return;
    }
    if (selection.move(event)) { swallow(event); return; }
    if (gizmoDrag?.pointerId === event.pointerId) {
      swallow(event);
      if (gizmoDrag.session.valid()) gizmo.pointerMove(gizmoPointer(event, -1));
      else finishGizmo(false);
      return;
    }
    if ((!drag && !mode) || !canEdit()) return;
    if (drag && drag.pointerId !== event.pointerId) return;
    if (drag) {
      swallow(event);
      if (!drag.session.valid()) { cancelGesture(); showOverlay(); return; }
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    }
    const hit = anchorAt(event);
    if (hit) {
      lastAnchor = hit;
      if (drag) {
        drag.moved = true;
        drag.session.apply(drag.session.pose.moveTo(hit));
      }
    } else if (mode === 'PLACE') lastAnchor = null;
    showOverlay();
  }, true);
  api.canvas.addEventListener('pointerleave', () => {
    leafPointer = null;
    if (!leafStroke && mode === 'BRUSH_LEAVES') { hideLeafCursor(); setLeafBrushReadout('idle'); }
  });
  api.controls.addEventListener('change', () => { if (leafPointer) requestLeafHover(); });
  api.canvas.addEventListener('pointerup', event => {
    if (leafStroke?.pointerId === event.pointerId && event.button === 0) {
      swallow(event);
      try { queueLeafPoint(event); flushLeafPoints(); finishLeafBrush(true, false); }
      catch (error) { finishLeafBrush(false, true); report(error); }
      return;
    }
    if (selection.end(event)) { swallow(event); return; }
    if (gizmoDrag?.pointerId === event.pointerId) { swallow(event); finishGizmo(true); return; }
    if (drag?.pointerId !== event.pointerId) {
      if (active() && mode && event.button === 0) swallow(event);
      return;
    }
    swallow(event);
    const ended = releaseDrag();
    setMode('');
    if (ended.moved && ended.session.valid()) ended.session.commit();
    else {
      ended.session.cancel();
      selectPlacement(ended.id);
    }
  }, true);
  for (const type of ['pointercancel', 'lostpointercapture']) api.canvas.addEventListener(type, event => {
    if (leafStroke?.pointerId === event.pointerId) {
      finishLeafBrush(false, true);
      setStatus('已取消刷叶。');
      return;
    }
    if (selection.cancel(event)) { swallow(event); return; }
    if (gizmoDrag?.pointerId === event.pointerId) { finishGizmo(false); return; }
    if (drag?.pointerId !== event.pointerId) return;
    cancelGesture();
    showOverlay();
  }, true);
  api.canvas.addEventListener('contextmenu', event => {
    if (leafStroke) cancelLeafWithPointer(event);
    if (suppressLeafMenu) { suppressLeafMenu = false; swallow(event); }
  }, true);
  window.addEventListener('blur', () => {
    if (!drag && !mode && !cardDrag && !gizmoDrag && !selection.dragging) return;
    cancelGesture();
    showOverlay();
  });
  window.addEventListener('keydown', event => {
    if (transforming || !canEdit() || event.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && (drag || gizmoDrag || selection.dragging || leafStroke)) {
      swallow(event); cancelGesture(); showOverlay(); return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (mode && event.key.toLowerCase() === 'v' && !event.shiftKey && !event.target.closest?.('input,select,textarea,[contenteditable="true"]')) {
      const wasBrush = mode === 'BRUSH_LEAVES';
      swallow(event); cancelGesture(); showOverlay(); setStatus(wasBrush ? '已退出刷叶。' : '已退出贴面放置。');
    } else if (event.key === 'Escape' && (mode || drag || cardDrag || gizmoDrag || selection.dragging)) {
      const wasBrush = mode === 'BRUSH_LEAVES';
      swallow(event); cancelGesture(); showOverlay(); setStatus(wasBrush ? '已退出刷叶。' : '已取消贴面操作。');
      if (wasBrush) api.canvas.focus({ preventScroll: true });
    } else if (!mode && selection.ids.length && !event.target.closest?.('input,select,textarea,[contenteditable="true"]')) {
      if (event.key === 'Escape') { swallow(event); selection.clear(); }
      if (!event.shiftKey && (event.key === 'Delete' || event.code === 'Delete')) {
        swallow(event);
        if (!event.repeat) removeSelected();
      }
    }
  }, true);

  el('ShapeOpen').onclick = action(async () => {
    if (!active()) return;
    const source = pack, base = source?.base_branches.find(item => item.id === baseId);
    if (!base) return;
    await api.flush();
    if (!active() || pack !== source || base.id !== baseId) return;
    cancelGesture();
    api.setTool('SELECT');
    const opening = shaping.open(source, base);
    api.refreshBranchSelection();
    showOverlay();
    await opening;
  });
  el('Use').onclick = action(async () => {
    const next = createBaseBranchAssembly(pack, baseId);
    if (!next) throw Error('请先选择有效的基础枝');
    const current = assembly();
    if (current?.base.id === baseId && current.pack_id === next.pack_id && current.revision === next.revision) {
      setStatus('当前正在使用这根基础枝。');
      return;
    }
    const keptSelection = selection.ids;
    if (current?.placements.length) {
      if (el('Rehang').checked) {
        if (current.scale !== undefined) next.scale = current.scale;
        const rehang = rehangBaseBranchPlacements(current, next);
        if (rehang.unmatched.length) {
          renderIssues(current, rehang.unmatched, `${rehang.unmatched.length} 个挂件无法重新贴面，当前装配已保留。`);
          document.getElementById('contextTab')?.click();
          setStatus('部分挂件无法重新贴面，请查看右侧检查结果。');
          return;
        }
        next.placements = rehang.placements;
        next.guide = rehang.guide;
      }
      const preserve = Boolean(next.placements.length);
      if (!await confirm({ title: preserve ? '重新贴面到这根基础枝？' : '换用基础枝？', name: next.base.name,
        message: preserve ? `将 ${next.placements.length} 个挂件重新贴到新枝面，保留姿态和尺寸。此操作可以撤销。` : '换用后会清空当前的贴面排布。这一步可以撤销。',
        accept: preserve ? '重新贴面' : '更换基础枝' })) return;
      if (assembly() !== current) throw Error('当前装配已更新，请重新选择基础枝');
    }
    cancelGesture();
    guidePoint = 0;
    unitId = next.units[0]?.id || '';
    api.transact('已启用基础枝组装', authoring => {
      authoring.base_branch_assembly = next;
      authoring.branch_shape = baseBranchShape(next);
      authoring.leaf_material = next.material;
      authoring.plant_unit_assembly = null;
    }, { bypassLayers: true });
    selection.replace(keptSelection.filter(id => next.placements.some(record => record.id === id)));
    refresh();
    setStatus(next.placements.length ? `已重新贴面 ${next.placements.length} 个挂件。` : '基础枝已就绪。把叶花果卡片拖到枝面，或沿曲线批量排布。');
    await api.flush();
    if (active() && assembly()?.base.id === next.base.id) api.fit();
  });
  el('Place').onclick = () => tool('PLACE');
  el('BrushLeaves').onclick = () => tool('BRUSH_LEAVES');
  el('BrushExit').onclick = () => {
    cancelGesture(); showOverlay(); setStatus('已退出刷叶。');
    api.canvas.focus({ preventScroll: true });
  };
  el('BrushSpacing').oninput = () => {
    const value = leafSpacing();
    if (value !== null) lastSpacing = value;
    syncLeafBrushBar(); requestLeafHover();
  };
  el('BrushSpacing').onblur = () => changeLeafSpacing(el('BrushSpacing').valueAsNumber);
  el('BrushSpacing').onkeydown = event => {
    if (event.key === 'Enter') { event.preventDefault(); changeLeafSpacing(el('BrushSpacing').valueAsNumber); api.canvas.focus({ preventScroll: true }); }
  };
  el('BrushSpacingSlider').oninput = () => changeLeafSpacing(el('BrushSpacingSlider').valueAsNumber);
  el('BrushLess').onclick = () => changeLeafSpacing((leafSpacing() ?? lastSpacing) - 1);
  el('BrushMore').onclick = () => changeLeafSpacing((leafSpacing() ?? lastSpacing) + 1);
  el('WholeScale').onclick = railTool('WHOLE_SCALE').onclick = () => {
    api.setTool('SELECT');
    cancelGesture();
    api.select(BASE_BRANCH_GUIDE);
    api.canvas.focus({preventScroll:true});
    api.beginKeyboardTransform('scale');
  };
  railTool('BRUSH_LEAVES').onclick = () => {
    if (!panel.getClientRects().length) api.showAssembly?.();
    tool('BRUSH_LEAVES');
  };
  railTool('SIZE_BRUSH').onclick = () => {
    if (railTool('SIZE_BRUSH').getAttribute('aria-pressed') === 'true') api.setTool('SELECT');
    else api.activateBaseBranchBrush('SCALE');
    api.canvas.focus({ preventScroll: true });
  };
  for (const [name, id] of [['MOVE', 'Slide'], ['ROTATE', 'Rotate'], ['SCALE', 'Scale']]) {
    railTool(name).onclick = () => el(id).click();
  }
  for (const container of [panel, rail]) for (const name of ['SELECT', 'COMB', 'TWIST_BRUSH']) {
    const button = container.querySelector(`[data-base-branch-tool="${name}"]`);
    button.onclick = () => {
      if (name === 'SELECT') cancelGesture();
      if (button.getAttribute('aria-pressed') === 'true') api.setTool('SELECT');
      else if (name === 'COMB') api.activateBaseBranchBrush();
      else api.setTool(name);
      api.canvas.focus({ preventScroll: true });
    };
  }
  el('Placed').onchange = () => {
    cancelGesture();
    selectPlacement(el('Placed').value);
    refresh();
  };
  for (const [button, operation] of [['Slide','translate'], ['Rotate','rotate'], ['Scale','scale']]) {
    el(button).onclick = () => {
      api.canvas.focus({preventScroll:true});
      api.beginKeyboardTransform(operation);
    };
  }
  for (const [button, operation] of [['InspectorMove','translate'], ['InspectorRotate','rotate'],
    ['InspectorScale','scale'], ['InspectorCopy','duplicate']]) {
    el(button).onclick = () => {
      api.canvas.focus({preventScroll:true});
      api.beginKeyboardTransform(operation);
    };
  }
  el('InspectorDelete').onclick = action(removeSelected);
  el('SelectionFilter').onchange = () => {
    const validIds = new Set(selectionTargets().map(target => target.id));
    selection.replace(selection.ids.filter(id => validIds.has(id)));
  };
  el('Pivot').onchange = () => { api.canvas.focus({preventScroll:true}); showOverlay(); };
  el('Gizmo').onchange = () => setGizmoMode(el('Gizmo').value);
  el('ReplaceApply').onclick = action(() => {
    const current = assembly(), source = current?.units.find(unit => unit.id === el('ReplaceSource').value);
    if (!source) return;
    const [minimum, maximum] = BASE_BRANCH_SCALE_RANGE;
    const replacements = selectedPlacements().filter(record => record.unit_id !== source.id).map(record => {
      const previous = current.units.find(unit => unit.id === record.unit_id);
      const scale = record.scale * previous.size_m / source.size_m;
      if (scale < minimum || scale > maximum) throw Error('替换素材无法保留当前尺寸，请先调整挂件大小');
      return {...record,unit_id:source.id,scale};
    });
    if (replacements.length) applyEdits('已替换所选挂件的素材',replacements);
  });
  const readAngles = prefix => baseBranchRotationDegrees(['X','Y','Z'].map(axis => readNumber(prefix + axis)));
  el('ExactApply').onclick = action(() => {
    const [record] = selectedPlacements();
    if (!record || selection.ids.length !== 1) return;
    const current = assembly(), pose = createBaseBranchPoseEdit(current,[record]), frame = pose.primary.frame;
    const delta = (readNumber('PositionPct') / 100 - frame.t) * frame.guideLength;
    const [moved] = pose.slide(delta);
    if (Math.abs(delta) > 1e-6 && moved === record) throw Error('这个位置附近没有可贴合的枝面');
    const local = readAngles('Rotation'), scale = readNumber('ExactScale');
    const unchangedRotation = local.angleTo(localBaseBranchRotation(record)) < 1e-6;
    if (moved === record && unchangedRotation && Math.abs(scale-record.scale) < 1e-6) return;
    applyEdits('已调整挂件精确位置和姿态', [{...moved,...(!unchangedRotation && baseBranchRotationFields(record,local)),scale}]);
  });
  el('BatchEditApply').onclick = action(() => {
    const records = selectedPlacements();
    if (!records.length) return;
    const pose = createBaseBranchPoseEdit(assembly(),records), offset = readNumber('BatchOffsetCm') / 100;
    const factor = readNumber('BatchScaleFactor'), rotation = readAngles('BatchRotation');
    if (factor < pose.scaleRange[0] || factor > pose.scaleRange[1]) throw Error('所选挂件的尺寸超出可调范围，请减小倍率');
    const rotated = 1-Math.abs(rotation.w) > 1e-12;
    if (offset === 0 && factor === 1 && !rotated) return;
    const moved = pose.slide(offset);
    const next = moved.flatMap((record,i) => {
      if (record === records[i] && factor === 1 && !rotated) return [];
      const local = rotation.clone().multiply(localBaseBranchRotation(record));
      return [{...record,...(rotated && baseBranchRotationFields(record,local)),scale:record.scale * factor}];
    });
    if (next.length) applyEdits(`已批量调整 ${next.length} 个挂件`,next);
    else setStatus('所选挂件已到枝面可移动边界。');
  });
  el('Check').onclick = action(() => {
    const current = assembly();
    if (!current) return;
    const issues = inspectBaseBranchPlacements(current);
    renderIssues(current, issues, issues.length ? `发现 ${issues.length} 项需要检查的问题` : '挂点有效，未发现近似重叠。');
  });
  function removeSelected() {
    const ids = new Set(selection.ids);
    if (!ids.size || !pickables()) return;
    cancelGesture();
    update('已删除所选贴面单元', (next, current) => { next.placements = current.placements.filter(item => !ids.has(item.id)); });
    selection.clear();
    refresh();
  }
  el('Remove').onclick = action(removeSelected);
  el('PlacementRoll').onchange = action(() => changePlacement('已旋转贴面单元', { roll: readNumber('PlacementRoll'), automatic:false }));
  el('PlacementScale').onchange = action(() => changePlacement('已调整贴面单元大小', { scale: readNumber('PlacementScale'), automatic:false }));
  el('BatchApply').onclick = action(() => {
    const current = assembly();
    if (!current) return;
    const count = readNumber('BatchCount'), start = readNumber('BatchStart') / 100, end = readNumber('BatchEnd') / 100;
    const clearExisting = el('BatchReplace').checked;
    const kept = current.placements.filter(item => !clearExisting || !item.automatic).length;
    if (start >= end) throw Error('排布起点必须小于终点');
    if (count + kept > MAX_PLACEMENTS) throw Error(`含已放置单元最多 ${MAX_PLACEMENTS} 个，请减少排布数量`);
    const unitIds = el('BatchUnits').value === 'MIX' ? current.units.map(unit => unit.id) : [unitId];
    const placements = distributeBaseBranchUnits(current, { unitIds, count, start, end, clearExisting });
    if (placements.length <= kept) throw Error('这段曲线附近找不到可吸附的枝面，请调整控制点或排布范围');
    cancelGesture();
    update('已沿曲线批量排布', next => { next.placements = placements; });
    refresh();
    setStatus(`沿曲线已贴面放置 ${placements.length - kept} 个单元。当前共 ${placements.length} 个。`);
  });
  el('GuideDetails').ontoggle = showOverlay;
  el('GuidePoint').onchange = () => { guidePoint = Number(el('GuidePoint').value); refresh(); };
  el('GuideApply').onclick = action(() => {
    update('已更新基础枝排布曲线', (next, current) => {
      const point = ['X', 'Y', 'Z'].map(suffix => readNumber('Guide' + suffix) / (100 * (current.scale ?? 1)));
      next.guide = current.guide.map((previous, index) => index === guidePoint ? point : previous);
    });
    refresh();
    setStatus('排布曲线已更新，再次批量排布即可使用新曲线。');
  });
  el('GuideAdd').onclick = action(() => {
    update('已插入曲线控制点', (next, current) => {
      const index = Math.min(guidePoint, current.guide.length - 2);
      const midpoint = current.guide[index].map((value, axis) => (value + current.guide[index + 1][axis]) * .5);
      guidePoint = index + 1;
      next.guide = [...current.guide.slice(0, guidePoint), midpoint, ...current.guide.slice(guidePoint)];
    });
    refresh();
  });
  el('GuideRemove').onclick = action(() => {
    update('已移除曲线控制点', (next, current) => {
      next.guide = current.guide.filter((point, index) => index !== guidePoint);
      guidePoint -= 1;
    });
    refresh();
  });
  new ResizeObserver(() => {
    shaping.setVisible(enabled && api.isBranch() && panel.getClientRects().length > 0);
    if (!active() && (mode || cardDrag)) cancelGesture();
    showOverlay();
    if (leafPointer) requestLeafHover();
  }).observe(panel);
  return { refresh, shaping, keyboardTransform, wholeScaleSelected, wholeScaleTransform, capturesSelection, setGizmoMode, syncBrushButtons, hasSelection: () => canEdit() && selection.ids.length > 0,
    combBrush, chooseBrushSelection: all => selection.replace(all ? selectionTargets().map(target => target.id) : []),
    prepareBrush() { if (mode || drag || cardDrag || gizmoDrag || selection.dragging) cancelGesture(); },
    get surfaceEditing() { return Boolean(mode || cardDrag); },
    get paintingLeaves() { return Boolean(leafStroke); },
    get selectionCount() { return canEdit() || brushing() ? selection.ids.length : 0; },
    clearSelection() { selection.clear(); },
    suspend() { shaping.setVisible(false); if (transforming) api.cancelKeyboardTransform(); cancelGesture(); overlay.visible = false; syncAxes(false); gizmo.detach(); }, showOverlay };
}
