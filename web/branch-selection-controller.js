import {cloneAxis} from './branch-axis.js';
import {createBranchOutlineBatch} from './branch-outline-batch.js';
import {createPointCornerPreview} from './branch-point-preview.js';
import {controlCurveOperation,evaluateControlCurve,writeControlCurve,controlCurveTransforms} from './branch-control-curve.js';
import { evaluateBranchRadius, createRadiusPreview } from './branch-radius.js';
import { createBranchCarrierSlide } from './branch-carrier-slide.js';
import { captureBranchDuplicate } from './branch-duplicate.js';
import { captureLinkedBranchDuplicate } from './linked-branch-duplicate.js';
import { createSelectionCopyPreview } from './selection-copy-preview.js';
import { combineScopedSelection } from './scoped-selection.js';
import { evaluateBranchMount, branchMountTransform, makeMountOperation, makeMountRotationOperation, mountPreviewBase } from './branch-mount.js';
import { selectionRoots } from './branch-selection.js';
import { projectedMountParameter, mountDistanceAt, slideMountParameter } from './branch-mount-drag.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';
import { evaluatePointSlide, pointSlideRange } from './branch-point-slide.js';
import { evaluateRootScale } from './branch-root-scale.js';
import * as THREE from 'three';
import { symmetryPreview } from './branch-symmetry.js';
import { TransformControls } from './vendor/TransformControls.js';
import { SCULPT_TOOLS, createSculptSnapshot, createMeshPreview } from './tree-sculpt.js';
import { SELECTION_TOOLS, TRANSFORM_TOOLS, descendants, polylineInRegion, transformBundles, bundleOverrides, createIsolationView } from './branch-selection.js';

export function createBranchSelectionController({ canvas, camera, controls, modelRoot, skeletonRoot, getAsset, getLeafSources = () => [], getDuplicateAsset = getAsset, releaseDuplicateAsset = () => {}, getAuthoring, getSelection, setSelection, getWorkspace = () => 'TREE', selectableBranch = () => true, selectionId = b => b.stableId, getRegionHits = null, getSelectedPoint = () => null, getSelectionExclusions = () => new Set(), getEditTargets = null, getOutlineTargets = () => null, includeSelectionChildren = () => false, temporarySelectionDone = () => {}, temporaryClick = () => {}, renderMountPreview = () => {}, renderPointSlidePreview = () => {}, getTool, transact, commitPreview, status }) {
  const $ = (id) => document.getElementById(id);
  const proxy = new THREE.Object3D();
  const outline = new THREE.Group();
  outline.name = '枝束选择轮廓';
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x72c5de, transparent: true, opacity: 0.8, depthTest: false });
  const outlineBatch=createBranchOutlineBatch(outlineMaterial);outline.add(outlineBatch.object);
  modelRoot.add(proxy, outline);
  const gizmo = new TransformControls(camera);
  gizmo.setSize(0.85);
  gizmo.setSpace('world');
  const helper = gizmo.getHelper();
  modelRoot.add(helper);
  let region = null;
  let drag = null;
  let mountDrag = null;
  let frame = 0;
  let currentAsset = null;
  let isolation = null;
  let isolatedRoots = null;
  let visibleIds = null;
  let editPivot = false;
  let customPivot = new THREE.Vector3();
  let lastPointer = null;
  const overlay = $('regionOverlay');
  const path = $('regionPath');
  const mode = () => ({ BUNDLE_MOVE: 'translate', BUNDLE_ROTATE: 'rotate', BUNDLE_SCALE: 'scale' }[getTool()] || 'translate');
  const busy = () => !getAsset() || getAsset().group.userData.pending_rebuild || !$('busyOverlay').hidden;
  // Selection belongs to the saved graph. A preview LOD can remove an internal
  // twig or an entire tier without removing its complete unit from the project.
  const available = () => getAsset()?.masterBranches.filter((branch) => (!visibleIds || visibleIds.has(branch.stableId)) && selectableBranch(branch)) || [];
  const point = (event) => { const bounds = canvas.getBoundingClientRect(); return [event.clientX - bounds.left, event.clientY - bounds.top]; };
  const pointer = (event, button = event.button) => {
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width * 2 - 1, y: -(event.clientY - bounds.top) / bounds.height * 2 + 1, button };
  };
  function updateVisibility() {
    const asset = getAsset();
    if (!asset) return;
    if (asset !== currentAsset) { currentAsset = asset; isolation = createIsolationView(asset); }
    if (isolatedRoots) {
      isolatedRoots = new Set([...isolatedRoots].filter((id) => asset.masterBranches.some((branch) => branch.stableId === id)));
      if (!isolatedRoots.size) isolatedRoots = null;
    }
    visibleIds = isolatedRoots ? descendants(asset.masterBranches, isolatedRoots) : null;
    isolation.apply(visibleIds);
    if(skeletonRoot.userData.setVisibleIds)skeletonRoot.userData.setVisibleIds(visibleIds);else skeletonRoot.children.forEach((object) => { object.visible = !visibleIds || visibleIds.has(object.userData.stable_id); });
    $('isolateSelectionBtn').classList.toggle('active', Boolean(visibleIds));
    $('isolateSelectionBtn').setAttribute('aria-pressed', String(Boolean(visibleIds)));
    $('isolationBadge').hidden = !visibleIds;
  }
  function drawOutline(branches = getAsset()?.masterBranches, targets = null, transforms = null) {
    const entries=[];
    const selected = getSelection();
    const sculpting = SCULPT_TOOLS.has(getTool());
    const ids = getOutlineTargets() ?? (sculpting && getEditTargets ? targets || getEditTargets(branches || []) : descendants(branches || [], selected));
    outlineMaterial.color.setHex(sculpting ? 0xffd451 : 0x72c5de);
    (branches || []).forEach((branch) => {
      if (!ids.has(branch.stableId) || getSelectionExclusions().has(branch.stableId) || (visibleIds && !visibleIds.has(branch.stableId))) return;
      const matrix=transforms?.get(branch.id)?.matrix;
      entries.push({id:branch.stableId,points:branch.points,matrix});
    });
    outlineBatch.update(entries);outline.visible=entries.length>0;
  }
  function drawRigidOutline(snapshot,ids,matrix){
    const transforms=new Map();for(const id of ids)transforms.set(id,{matrix});
    drawOutline([...snapshot.values()],null,transforms);
  }
  function drawPreviewOutline(branches,preview){drawOutline(preview.outlineBranches?.(branches)||branches);}
  function center() {
    const group=pointGroupContext();if(group)return group.pivot.clone();
    const branches = getAsset()?.masterBranches || [];
    const selected = getSelection();
    if (getTool() === 'BUNDLE_SCALE' && pointRotationContext()) { const c=pointRotationContext();return c.root.controlPoints[c.index].clone(); }
    if (getWorkspace() === 'TREE' && getTool() === 'BUNDLE_SCALE') return selectionRoots(branches, selected)[0]?.points[0].clone() || new THREE.Vector3();
    if ($('bundlePivot').value === 'CUSTOM') return customPivot.clone();
    if ($('bundlePivot').value === 'ACTIVE_ROOT') {
      return branches.find((branch) => branch.stableId === [...selected].at(-1))?.points[0].clone() || new THREE.Vector3();
    }
    const box = new THREE.Box3();
    const ids = descendants(branches, selected);
    branches.forEach((branch) => { if (ids.has(branch.stableId)) branch.points.forEach((point) => box.expandByPoint(point)); });
    return box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  }
  function pivotInputs() {
    ['X', 'Y', 'Z'].forEach((axis) => { $(`bundlePivot${axis}`).value = proxy.position[axis.toLowerCase()].toFixed(4); });
  }
  function refresh() {
    if(pendingCopies?.every(id=>getAsset()?.masterBranches.some(b=>b.stableId===id))){const ids=pendingCopies;pendingCopies=null;setSelection(new Set(ids));return;}
    if (drag || region || mountDrag) return;
    updateVisibility();
    drawOutline();
    const selected = getSelection();
    $('bundleSelectionCount').textContent = `${selected.size} 枝`;
    const transformMode = TRANSFORM_TOOLS.has(getTool());
    const pointContext = pointRotationContext();
    const pointGroup=pointGroupContext(),emptyPoints=getSelectedPoint()?.scope==='POINTS'&&!getSelectedPoint().indices?.length;
    const mountRotation = getTool() === 'SELECT' && !pointGroup&&!emptyPoints&&$('mountRotationHandles').checked && !(pointContext || mountContext()).reason;
    const pointRotation = getTool() === 'BUNDLE_ROTATE' && pointContext && !pointContext.reason;
    gizmo.showXYZE = !mountRotation; gizmo.showE = !mountRotation;
    gizmo.setSize(mountRotation ? .65 : .85);
    if (mountRotation || pointRotation) {
      proxy.position.copy(pointContext ? pointContext.root.controlPoints[pointContext.index] : mountContext().root.points[0]); proxy.quaternion.identity(); proxy.scale.setScalar(1); proxy.updateMatrixWorld(true);
      gizmo.attach(proxy); gizmo.enabled=true; gizmo.setMode('rotate');
    } else if (transformMode && !emptyPoints&&selected.size && getAsset()) {
      proxy.position.copy(center()); proxy.quaternion.identity(); proxy.scale.setScalar(1); proxy.updateMatrixWorld(true);
      gizmo.attach(proxy); gizmo.enabled = true;
      gizmo.setMode(editPivot && !(getWorkspace() === 'TREE' && getTool() === 'BUNDLE_SCALE') ? 'translate' : mode());
      pivotInputs();
    } else { gizmo.detach(); gizmo.enabled = false; }
    $('applyBundleTransform').disabled = !transformMode || !selected.size;
    $('editBundlePivot').disabled = !transformMode || !selected.size || $('bundlePivot').value !== 'CUSTOM';
    $('editBundlePivot').classList.toggle('active', editPivot);
    const rootScaling = getWorkspace() === 'TREE' && getTool() === 'BUNDLE_SCALE';
    const pointScaling=getTool()==='BUNDLE_SCALE' && Boolean(pointContext);
    const fixedPivot = rootScaling || Boolean(pointRotation) || pointScaling||Boolean(pointGroup);
    $('bundlePivot').disabled = fixedPivot; $('bundleKeepRoots').disabled = fixedPivot;
    $('bundlePivot').parentElement.hidden = fixedPivot;
    $('bundlePivotX').closest('.field-grid').hidden = fixedPivot;
    $('bundleKeepRoots').closest('.switch-list').hidden = fixedPivot;
    $('editBundlePivot').hidden = fixedPivot;
    if (fixedPivot) $('editBundlePivot').disabled = true;
    $('bundleNumericLabel').textContent = mode() === 'rotate' ? (pointRotation ? '从当前点转弯（°）· 邻点越近转角越紧' : '旋转角度（°）') : pointScaling ? '控制点向梢缩放倍率 · 前段固定' : rootScaling ? '枝根缩放倍率 · 单元枝大小保持' : mode() === 'scale' ? '形状缩放倍率' : '移动距离（m）';
    $('bundleTransformOptions').hidden = !transformMode;
    if(pointGroup){$('bundleNumericLabel').textContent=`所选 ${pointGroup.indices.length} 个控制点 · ${mode()==='rotate'?'旋转角度（°）':mode()==='scale'?'缩放倍率':'移动距离（m）'}`;$('applyBundleTransform').disabled=!!pointGroup.reason;}
    if(emptyPoints)$('applyBundleTransform').disabled=true;
    refreshMount();
  }
  function pointGroupContext(){
    const selected=getSelectedPoint();if(selected?.scope!=='POINTS'||selected.indices?.length<2)return null;
    const branches=getAsset()?.masterBranches||[],root=branches.find(b=>b.stableId===selected.branchId);if(!root)return null;
    const pins=new Set(getAuthoring().overrides[root.stableId]?.pinned_points||[]);if(getAuthoring().curve_editor.lock_root)pins.add(0);
    const indices=selected.indices.filter(i=>i>=0&&i<root.controlPoints.length),movable=indices.filter(i=>!pins.has(i)),pivot=new THREE.Vector3();movable.forEach(i=>pivot.add(root.controlPoints[i]));pivot.divideScalar(movable.length||1);
    const ids=descendants(branches,new Set([root.stableId]));
    const reason=root.unitOwner||root.instanceId||root.symmetryGroup?'单元枝内部请进入枝条工作台编辑':!movable.length?'所选控制点已固定':branches.some(b=>b!==root&&ids.has(b.stableId)&&getAuthoring().overrides[b.stableId]?.pinned_points?.length)?'连接子枝有固定锚点，请先解除固定':[...getSelectionExclusions()].some(id=>ids.has(id))?'点间走势调整包含减选子枝，请先加回选区':'';
    return {branches,root,indices:movable,pivot,reason};
  }
  function makePointGroupState(){
    const c=pointGroupContext();if(!c||c.reason){if(c)status(c.reason,'ready');return null;}
    const snapshot=createSculptSnapshot(c.branches,getAuthoring().overrides);return {pointGroup:c,snapshot,pivot:c.pivot,originalPivot:customPivot.clone(),preview:createPointCornerPreview(getAsset(),snapshot,c.root),changed:false};
  }
  function previewPointGroup(d,{translation=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1)}){
    const root=d.snapshot.get(d.pointGroup.root.id),indices=new Set(d.pointGroup.indices),knots=root.controlPoints.map((p,i)=>indices.has(i)?p.clone().sub(d.pivot).multiply(scale).applyQuaternion(rotation).add(d.pivot).add(translation):p.clone());
    d.changed=knots.some((p,i)=>p.distanceToSquared(root.controlPoints[i])>1e-16);d.operation=controlCurveOperation(root,knots);
    d.updated=new Map(evaluateControlCurve([...d.snapshot.values()],d.operation,1,getAuthoring().overrides).map(b=>[b.id,b]));
    d.preview.update(d.updated,controlCurveTransforms(d.snapshot,d.updated,root.id));d.preview.updateCarrier(d.updated.get(root.id));drawPreviewOutline([...d.updated.values()],d.preview);renderMountPreview(knots,d.updated.get(root.id).points);
  }
  function commitPointGroup(d){
    if(d.changed)return commitPreview(d.preview,()=>transact(`已调整 ${d.pointGroup.indices.length} 个控制点`,next=>writeControlCurve(next,d.operation)));
    d.preview.restore();renderMountPreview(null);
  }
  function keyboardPointGroup(){
    const d=makePointGroupState();if(!d)return null;const asset=getAsset();gizmo.detach();gizmo.enabled=false;
    return {center:d.pivot.clone(),uniform:false,scaleRange:[.05,20],label:`所选 ${d.pointGroup.indices.length} 个控制点`,hint:'只调整所选点；Enter 确认 / Esc 取消',valid:()=>getAsset()===asset&&!busy(),update:v=>previewPointGroup(d,v),commit(){commitPointGroup(d);refresh();},cancel(){d.preview.restore();renderMountPreview(null);refresh();}};
  }
  function pointRotationContext() {
    const selected = getSelectedPoint();
    if (!selected || selected.index <= 0||selected.indices?.length>1) return null;
    const branches = getAsset()?.masterBranches || [], root = branches.find(b => b.stableId === selected.branchId);
    if (!root) return null;
    const index = selected.index, roots = selectionRoots(branches, getSelection());
    let reason = roots.length !== 1 || roots[0] !== root ? '控制点旋转请只选择这一束枝条' : '';
    if (root.unitOwner || root.instanceId || root.symmetryGroup) reason = '请选择承重枝干控制点；单元枝内部请进入枝条工作台编辑';
    if (index >= root.controlPoints.length - 1) reason = '末端控制点后没有枝段，请选择中间控制点';
    if (!reason) {
      const movingRoots = new Set(branches.filter(b => b.parentId === root.id).map(b=>b.stableId));
      const ids = descendants(branches,movingRoots);
      if ([...getSelectionExclusions()].some(id => ids.has(id))) reason = '点间走势调整包含减选子枝，请先加回选区';
      else if ((getAuthoring().overrides[root.stableId]?.pinned_points || []).some(i=>i>index)
        || branches.some(b=>ids.has(b.stableId)&&getAuthoring().overrides[b.stableId]?.pinned_points?.length)) reason = '后段有固定锚点，请先解除固定；前段固定点可以保留';
    }
    return {branches,root,index,reason};
  }
  function makePointRotationState(c) {
    if (c.reason) {
      status(c.reason,'ready'); return null;
    }
    const snapshot = createSculptSnapshot(c.branches,getAuthoring().overrides);
    return {pointRotation:true,c,snapshot,preview:createPointCornerPreview(getAsset(),snapshot,c.root),originalPivot:customPivot.clone(),changed:false};
  }
  function previewPointRotation(d, q) {
    d.changed = 1-Math.abs(q.w)>1e-12;
    const root=d.snapshot.get(d.c.root.id),pivot=root.controlPoints[d.c.index];
    d.operation=controlCurveOperation(root,root.controlPoints.map((p,i)=>i<=d.c.index?p.clone():p.clone().sub(pivot).applyQuaternion(q).add(pivot)));
    d.updated = new Map(evaluateControlCurve([...d.snapshot.values()],d.operation,1,getAuthoring().overrides).map(b=>[b.id,b]));
    const transforms=controlCurveTransforms(d.snapshot,d.updated,d.c.root.id);
    d.preview.update(d.updated,transforms);d.preview.updateCarrier(d.updated.get(d.c.root.id));drawPreviewOutline([...d.updated.values()],d.preview);
    renderMountPreview(d.updated.get(d.c.root.id).controlPoints,d.updated.get(d.c.root.id).points);
  }
  function commitPointRotation(d) {
    if (!d.changed) { d.preview.restore(); renderMountPreview(null); return; }
    return commitPreview(d.preview,()=>transact('已转向后段控制点，按当前点位更新走势',next=>writeControlCurve(next,d.operation)));
  }
  function keyboardPointRotation(c) {
    const d = makePointRotationState(c); if (!d) return null;
    const asset = getAsset(); gizmo.detach(); gizmo.enabled=false;
    return {center:c.root.controlPoints[c.index].clone(),label:`控制点 ${c.index+1} · 从当前点转弯，前段控制点保持`,hint:'X/Y/Z 调方向；邻点越近转角越紧，挂接子枝保持大小',
      valid:()=>getAsset()===asset&&!busy(),
      update:({rotation})=>previewPointRotation(d,rotation),
      commit(){commitPointRotation(d);refresh();},
      cancel(){d.preview.restore();renderMountPreview(null);refresh();}
    };
  }
  function mountContext() {
    const branches = getAsset()?.masterBranches || [], authoring = getAuthoring();
    const roots = selectionRoots(branches, getSelection());
    const root = roots.length === 1 ? roots[0] : null;
    const parent = branches.find(b => b.id === root?.parentId);
    let reason = '';
    if (!root || !parent) reason = '请选择一束有母干的承重侧枝（可包含它的子枝）。';
    else if (root.unitOwner || root.instanceId || root.symmetryGroup) reason = '请选择承重骨架侧枝；单元枝和联动副本不在这里调整。';
    const ids = root ? descendants(branches, new Set([root.stableId])) : new Set();
    if (!reason && [...getSelectionExclusions()].some(id => ids.has(id))) reason = '挂接调整需要完整枝束，请先将减选的子枝加回选区。';
    if (!reason && [...ids].some(id => authoring.overrides[id]?.pinned_points?.length)) reason = '枝束中有固定锚点，请先解除固定再调整挂接。';
    const layers = authoring.sculpt_layers;
    const last = [...layers].reverse().find(l => l.enabled && l.strength === 1 && l.operation?.type === 'MOUNT' && !l.operation.root_rotation && l.operation.root === root?.stableId && l.operation.parent === parent?.stableId);
    return {branches, root, parent, reason, last, layers};
  }
  function refreshMount() {
    const c = mountContext();
    const values = c.last?.operation || {azimuth:0,elevation:0};
    const point = pointRotationContext();
    $('branchMountHint').textContent = point ? (point.reason || `控制点 ${point.index+1}：G 沿当前枝滑点 / R 转后段 / S 缩放后段 / Alt+S 调后段粗细；前段固定。下方数值仍控制整束挂接。`) : c.reason || `${c.root.stableId} → 母干 ${c.parent.stableId} · 整束跟随`;
    for (const [id,value] of [['mountAttach',(c.root?.parentT || 0)*100],['mountAzimuth',values.azimuth],['mountElevation',values.elevation]]) {
      $(id).disabled = Boolean(c.reason); $(id).value = Number(value.toFixed(4));
    }
  }
  function changeMount() {
    if (busy()) return;
    const c = mountContext();
    if (c.reason) { status(c.reason,'ready'); refreshMount(); return; }
    const values = {attach:Number($('mountAttach').value)/100, azimuth:Number($('mountAzimuth').value), elevation:Number($('mountElevation').value)};
    if (['mountAttach','mountAzimuth','mountElevation'].some(id => !$(id).value || !$(id).checkValidity())) { refreshMount(); return; }
    const previous = {attach:c.root.parentT, azimuth:c.last?.operation.azimuth || 0, elevation:c.last?.operation.elevation || 0};
    if (Object.keys(values).every(key => Math.abs(values[key]-previous[key]) < 1e-7)) return;
    cancel();
    const merge = !c.root.trunkCarrierAnchor && c.last && c.last === c.layers.at(-1) ? c.last : null;
    const operation = makeMountOperation(c.branches,c.root,values,previous,merge?.operation);
    const snapshot = createSculptSnapshot(c.branches,getAuthoring().overrides,{bindings:false});
    const preview = createMeshPreview(getAsset(),snapshot,{targets:new Set([c.root.stableId]),rigid:true});
    const updated=evaluateBranchMount(mountPreviewBase([...snapshot.values()],c.root,merge?.operation),operation),root=updated.find(b=>b.stableId===c.root.stableId),family=descendants(c.branches,new Set([c.root.stableId]));
    const matrix=root.mountMatrix.clone().multiply((c.root.mountMatrix||new THREE.Matrix4()).clone().invert());
    preview.updateRigid(matrix,new Set(c.branches.filter(b=>family.has(b.stableId)).map(b=>b.id)));
    commitMount(c,merge,operation,preview);
  }
  function commitMount(c,merge,operation,preview) {
    return commitPreview(preview, () => transact('已调整枝束挂接位置与朝向', next => {
      if (merge) next.sculpt_layers.find(l => l.id === merge.id).operation = operation;
      else next.sculpt_layers.push({id:`MOUNT_${Date.now()}`,name:`${operation.root_rotation ? '枝根三轴旋转' : '枝束挂接'} ${c.root.stableId}`,enabled:true,strength:1,operation,branches:{}});
      next.active_sculpt_layer = '';
    }));
  }
  function beginMount(event, branchId) {
    if (busy()) return true;
    const c = mountContext();
    if (c.reason || c.root?.stableId !== branchId) { status(c.reason || '请只选择这一整束枝条','ready'); return true; }
    const merge = null;
    const bounds = canvas.getBoundingClientRect();
    getAsset().group.updateWorldMatrix(true,false); camera.updateMatrixWorld();
    const projection = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).multiply(getAsset().group.matrixWorld);
    const project = p => { const v = new THREE.Vector4(p.x,p.y,p.z,1).applyMatrix4(projection); return {x:bounds.left+(v.x/v.w+1)*bounds.width/2,y:bounds.top+(1-v.y/v.w)*bounds.height/2,z:v.z/v.w,w:v.w}; };
    const anchor = project(sampleLine(c.parent.points,c.root.parentT));
    const previous = {attach:c.root.parentT,azimuth:c.last?.operation.azimuth||0,elevation:c.last?.operation.elevation||0};
    mountDrag = {c,merge,previous,values:{...previous},path:cloneAxis(c.parent.points,project),anchor,start:[event.clientX,event.clientY],snapshot:null,preview:null,operation:null};
    mountDrag.slide=createBranchCarrierSlide(c.branches,c.root,{camera,modelRoot:getAsset().group,bounds,asset:getAsset(),authoring:getAuthoring()});
    gizmo.detach(); gizmo.enabled=false;
    controls.enabled = false; lastPointer = event.pointerId; canvas.setPointerCapture(event.pointerId);
    canvas.dataset.mountDragging = 'true'; status('拖动枝根 · 沿母干移动整束，Esc 取消','busy');
    return true;
  }
  function moveMount(event) {
    const d = mountDrag;
    const dx = event.clientX-d.start[0], dy = event.clientY-d.start[1];
    if (!d.preview && Math.hypot(dx,dy)<3) return true;
    const carrier=d.slide({start:{x:d.start[0],y:d.start[1]},pointer:{x:event.clientX,y:event.clientY}});
    if(carrier.blocked)return true;
    const attach=carrier.attach;
    d.values = {...d.previous,attach,target_parent:carrier.parent.stableId,...(carrier.trunk_anchor?{trunk_anchor:carrier.trunk_anchor}:{})};
    d.operation = makeMountOperation(d.c.branches,d.c.root,d.values,d.previous,d.merge?.operation);
    if (!d.snapshot) { d.snapshot=createSculptSnapshot(d.c.branches,getAuthoring().overrides,{bindings:false}); d.preview=createMeshPreview(getAsset(),d.snapshot,{targets:new Set([d.c.root.stableId]),rigid:true});const family=descendants(d.c.branches,new Set([d.c.root.stableId]));d.rigidIds=new Set(d.c.branches.filter(b=>family.has(b.stableId)).map(b=>b.id)); }
    d.matrix=branchMountTransform(d.c.branches,d.operation).matrix;
    d.previewKnots=d.c.root.controlPoints.map(p=>p.clone().applyMatrix4(d.matrix));
    $('mountAttach').value = Number((attach*100).toFixed(4));
    if (!frame) frame = requestAnimationFrame(() => {
      frame=0; if (mountDrag!==d) return;
      d.preview.updateRigid(d.matrix,d.rigidIds);drawRigidOutline(d.snapshot,d.rigidIds,d.matrix);
      renderMountPreview(d.previewKnots);
    });
    return true;
  }
  function endMount(event) {
    moveMount(event); const d=mountDrag; mountDrag=null;
    cancelAnimationFrame(frame); frame=0;
    controls.enabled=true; delete canvas.dataset.mountDragging; releasePointer();
    if (d.preview && (d.values.target_parent!==d.c.parent.stableId || Math.abs(d.values.attach-d.previous.attach)>1e-7 || d.operation.trunk_anchor&&JSON.stringify(d.operation.trunk_anchor)!==JSON.stringify(d.c.root.trunkCarrierAnchor))) {
      d.preview.updateRigid(d.matrix,d.rigidIds);
      renderMountPreview(d.previewKnots);
      commitMount(d.c,d.merge,d.operation,d.preview);
    } else { d.preview?.restore(); renderMountPreview(null); status('挂接位置未改变','ready'); }
    refresh(); return true;
  }
  for (const id of ['mountAttach','mountAzimuth','mountElevation']) {
    $(id).addEventListener('change',changeMount);
    $(id).addEventListener('keydown',event => { if(event.key === 'Enter') { event.preventDefault(); $(id).blur(); } });
  }
  $('mountRotationHandles').addEventListener('change', () => { cancel(); refresh(); });
  document.addEventListener('branch-mount-edit', event => {
    const layer = getAuthoring().sculpt_layers.find(l => l.id === event.detail);
    if (!layer?.operation?.root) return;
    cancel(); setSelection(new Set([layer.operation.root]));
    $('contextTab').click();
    for (let node = $('branchMountPanel').parentElement; node; node = node.parentElement) if (node.matches('details')) node.open = true;
    $('branchMountPanel').scrollIntoView({block:'center'}); $('mountAttach').focus();
  });
  function rootScaleAllowed() {
    const group=pointGroupContext();if(group){if(group.reason)status(group.reason,'ready');return !group.reason;}
    const point=pointRotationContext();
    if(point) { const reason=point.reason;if(reason)status(reason.replaceAll('旋转','缩放'),'ready');return !reason; }
    const branches = getAsset().masterBranches, roots = selectionRoots(branches, getSelection());
    const ids = descendants(branches, new Set(roots.map(b => b.stableId)));
    const reason = roots.some(b => b.unitOwner || b.instanceId || b.symmetryGroup) ? '请选择承重枝干，单元枝内部请进入枝条工作台编辑'
      : [...getSelectionExclusions()].some(id => ids.has(id)) ? '枝根缩放需要完整枝束，请先加回减选的子枝'
      : branches.some(b => ids.has(b.stableId) && getAuthoring().overrides[b.stableId]?.pinned_points?.length) ? '枝束中有固定锚点，请先解除固定'
      : '';
    if (reason) status(reason, 'ready');
    return !reason;
  }
  function makeTransformState(pivotOnly = false, rootScaling = (getWorkspace() === 'TREE' || Boolean(pointRotationContext())) && getTool() === 'BUNDLE_SCALE') {
    if(pointGroupContext())return makePointGroupState();
    const snapshot = createSculptSnapshot(getAsset().masterBranches, getAuthoring().overrides);
    const pointScale=rootScaling ? pointRotationContext() : null;
    return { pointScale, snapshot, updated: snapshot, selection: new Set(getSelection()), pivot: pointScale ? pointScale.root.controlPoints[pointScale.index].clone() : rootScaling ? selectionRoots([...snapshot.values()],getSelection())[0].points[0].clone() : proxy.position.clone(), pivotOnly: rootScaling ? false : pivotOnly, rootScaling,
      originalPivot: customPivot.clone(), preview: pivotOnly ? null : pointScale ? createPointCornerPreview(getAsset(),snapshot,pointScale.root) : createMeshPreview(getAsset(), snapshot,{targets:new Set(getSelection()),rigidUnits:rootScaling}),
      individual: $('bundlePivot').value === 'INDIVIDUAL', keepRoots: $('bundleKeepRoots').checked };
  }
  function scalePreview(state, scale) {
    state.scale = scale.clone().clampScalar(.05,20);
    const point=state.pointScale;
    state.operation=point ? controlCurveOperation(point.root,point.root.controlPoints.map((p,i)=>i<=point.index?p.clone():p.clone().sub(state.pivot).multiply(state.scale).add(state.pivot))) : {type:'ROOT_SCALE',targets:[...state.selection],scale:state.scale.toArray(),...([...state.snapshot.values()].some(b=>b.importedTrunkHost&&state.selection.has(b.stableId))?{scale_trunk_volume:true}:{})};
    state.updated = new Map((point ? evaluateControlCurve : evaluateRootScale)([...state.snapshot.values()],state.operation,1,getAuthoring().overrides).map(b=>[b.id,b]));
    if(point){const root=state.updated.get(point.root.id);renderMountPreview(root.controlPoints,root.points);state.unitTransforms=controlCurveTransforms(state.snapshot,state.updated,point.root.id);return;}
    state.unitTransforms = new Map();
    for (const b of state.updated.values()) {
      const old = state.snapshot.get(b.id);
      if ((!b.unitOwner && !b.instanceId) || b === old || !b.mountMatrix) continue;
      const matrix = b.mountMatrix.clone().multiply((old.mountMatrix || new THREE.Matrix4()).clone().invert());
      state.unitTransforms.set(b.id, {matrix, normal:new THREE.Matrix3().getNormalMatrix(matrix)});
    }
  }
  function previewTransform() {
    if (!drag) return;
    if(drag.pointGroup){previewPointGroup(drag,{translation:proxy.position.clone().sub(drag.pivot),rotation:proxy.quaternion.clone(),scale:proxy.scale.clone()});return;}
    if (drag.pointRotation) { previewPointRotation(drag,proxy.quaternion.clone().normalize()); return; }
    if (drag.mountRotation) {
      const d=drag, q=proxy.quaternion.clone().normalize();
      d.operation=makeMountRotationOperation(d.c.branches,d.c.root,q,d.previous,d.merge?.operation);
      d.changed=1-Math.abs(q.w)>1e-10;
      const origin=d.c.root.points[0];
      d.rigidMatrix=new THREE.Matrix4().makeTranslation(...origin.toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(...origin.clone().negate().toArray()));
      d.previewKnots=d.c.root.controlPoints.map(p=>p.clone().applyMatrix4(d.rigidMatrix));
      if (!frame) frame=requestAnimationFrame(()=>{frame=0;if(drag!==d)return;d.preview.updateRigid(d.rigidMatrix,d.rigidIds);drawRigidOutline(d.snapshot,d.rigidIds,d.rigidMatrix);renderMountPreview(d.previewKnots);});
      return;
    }
    pivotInputs();
    if (drag.pivotOnly) return;
    proxy.scale.clampScalar(0.05, 20);
    if (drag.rootScaling) scalePreview(drag, proxy.scale);
    else drag.updated = transformBundles(drag.snapshot, drag.selection, {
      pivot: drag.pivot, translation: proxy.position.clone().sub(drag.pivot), rotation: proxy.quaternion.clone(), scale: proxy.scale.clone(),
      individual: drag.individual, keepRoots: drag.keepRoots,
    });
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      if (!drag) return;
      drag.preview.update(symmetryPreview(drag.updated, getAuthoring().symmetry_groups), drag.unitTransforms);
      if(drag.pointScale)drag.preview.updateCarrier(drag.updated.get(drag.pointScale.root.id));
      drawPreviewOutline([...drag.updated.values()],drag.preview);
    });
  }
  function releasePointer() {
    if (lastPointer !== null && canvas.hasPointerCapture?.(lastPointer)) canvas.releasePointerCapture(lastPointer);
    lastPointer = null;
  }
  function cancel() {
    if (!drag && !region && !mountDrag) return false;
    const mounting = mountDrag; mountDrag = null;
    if (mounting) { mounting.preview?.restore(); renderMountPreview(null); delete canvas.dataset.mountDragging; }
    const previous = drag;
    drag = null; region = null; delete canvas.dataset.temporarySelection;
    cancelAnimationFrame(frame); frame = 0;
    if (previous) { previous.preview?.restore(); customPivot.copy(previous.originalPivot); if(previous.mountRotation || previous.pointRotation || previous.pointScale||previous.pointGroup)renderMountPreview(null); }
    gizmo.dragging = false; gizmo.axis = null;
    overlay.setAttribute('hidden', '');
    releasePointer(); controls.enabled = true;
    refresh();
    status('枝束编辑 · 已取消', 'ready');
    return true;
  }
  function commit(completed) {
    if(completed.pointGroup)return commitPointGroup(completed);
    if (completed.rootScaling) {
      if (!completed.scale || completed.scale.distanceToSquared(new THREE.Vector3(1,1,1)) < 1e-14) { completed.preview.restore(); return; }
      completed.preview.update(symmetryPreview(completed.updated,getAuthoring().symmetry_groups), completed.unitTransforms);
      if(completed.pointScale)completed.preview.updateCarrier(completed.updated.get(completed.pointScale.root.id));
      return commitPreview(completed.preview, () => transact(completed.pointScale ? '已缩放后段控制点，点间走势自动更新' : '已从枝根缩放承重枝束，单元枝大小保持', next => {
        if(completed.pointScale){writeControlCurve(next,completed.operation);return;}
        next.sculpt_layers.push({id:`SCALE_${Date.now()}`,name:completed.pointScale ? `控制点 ${completed.pointScale.index+1} 向梢缩放` : '枝根缩放 · 保持单元枝',enabled:true,strength:1,
          operation:completed.operation,branches:{}});
        next.active_sculpt_layer = '';
      }));
    }
    const overrides = bundleOverrides(completed.snapshot, completed.updated, getAuthoring().overrides);
    if (!Object.keys(overrides).length) { completed.preview?.restore(); status('枝束变换 · 未产生修改，含固定点的枝束保持不动', 'ready'); return; }
    completed.preview?.update(symmetryPreview(completed.updated, getAuthoring().symmetry_groups));
    commitPreview(completed.preview, () => transact(`已变换 ${Object.keys(overrides).length} 根枝条`, (next) => {
      Object.assign(next.overrides, overrides); next.curve_editor.affect_children = true;
    }));
  }
  gizmo.addEventListener('mouseDown', () => {
    if (busy()) { gizmo.dragging = false; return; }
    if ((getWorkspace() === 'TREE' || pointRotationContext()) && getTool() === 'BUNDLE_SCALE' && !rootScaleAllowed()) { gizmo.dragging = false; return; }
    if(pointGroupContext()){drag=makePointGroupState();if(!drag){gizmo.dragging=false;return;}}
    else if (['SELECT','BUNDLE_ROTATE'].includes(getTool()) && pointRotationContext()) {
      drag=makePointRotationState(pointRotationContext());
      if(!drag) {gizmo.dragging=false;return;}
    } else if (getTool() === 'SELECT') {
      const c=mountContext(),last=c.layers.at(-1);
      const merge=last?.enabled && last.strength===1 && last.operation?.root_rotation && last.operation.root===c.root?.stableId && last.operation.parent===c.parent?.stableId ? last : null;
      if(c.reason) {gizmo.dragging=false;status(c.reason,'ready');return;}
      const snapshot=createSculptSnapshot(c.branches,getAuthoring().overrides,{bindings:false});
      const family=descendants(c.branches,new Set([c.root.stableId]));
      drag={mountRotation:true,c,merge,snapshot,preview:createMeshPreview(getAsset(),snapshot,{targets:new Set([c.root.stableId]),rigid:true}),originalPivot:customPivot.clone(),changed:false,
        rigidIds:new Set(c.branches.filter(b=>family.has(b.stableId)).map(b=>b.id)),
        previous:{azimuth:c.last?.operation.azimuth||0,elevation:c.last?.operation.elevation||0}};
    } else drag = makeTransformState(editPivot);
    controls.enabled = false;
    status(drag.pointRotation ? '控制点三轴旋转 · 前段固定，后段保长，Esc 取消' : drag.mountRotation ? '枝根三轴旋转 · 整束跟随，Esc 取消' : editPivot ? '调整变换中心' : '枝束实时变换', 'busy');
  });
  gizmo.addEventListener('objectChange', previewTransform);
  gizmo.addEventListener('mouseUp', () => {
    if (!drag) return;
    previewTransform();
    const completed = drag;
    const nextPivot = proxy.position.clone();
    drag = null;
    cancelAnimationFrame(frame); frame = 0;
    controls.enabled = true;
    gizmo.dragging = false; gizmo.axis = null;
    if (completed.pointRotation) { commitPointRotation(completed);
    } else if (completed.mountRotation) {
      if(completed.changed) {
        completed.preview.updateRigid(completed.rigidMatrix,completed.rigidIds);renderMountPreview(completed.previewKnots);
        commitMount(completed.c,completed.merge,completed.operation,completed.preview);
      } else {completed.preview.restore();renderMountPreview(null);status('旋转角度未改变','ready');}
    } else if (completed.pivotOnly) { customPivot.copy(nextPivot); status('变换中心已更新', 'ready'); }
    else commit(completed);
    refresh();
  });
  function polygon() {
    if (region.tool === 'LASSO_SELECT') return region.points;
    const a = region.points[0]; const b = region.points.at(-1);
    return [a, [b[0], a[1]], b, [a[0], b[1]]];
  }
  function regionHits() {
    const bounds = canvas.getBoundingClientRect();
    const asset = getAsset(); asset.group.updateWorldMatrix(true, false);
    const shape = polygon();
    const branches = available();
    const project = (point) => {
      const projected = asset.group.localToWorld(point.clone()).project(camera);
      return [(projected.x * 0.5 + 0.5) * bounds.width, (-projected.y * 0.5 + 0.5) * bounds.height, projected.z];
    };
    const master = new Map(asset.masterBranches.map(branch => [branch.stableId, branch]));
    const canonical = new Map(branches.map(branch => [branch.stableId, selectionId(branch)]));
    // A visible internal twig can identify its whole unit even when isolation
    // hides the root. The canonical target must still exist and be selectable.
    const roots = new Set([...canonical.values()].filter(id => master.has(id) && selectableBranch(master.get(id))));
    const hits = new Set(branches.filter(branch => polylineInRegion(branch.points.map(project), shape)).map(selectionId).filter(id => roots.has(id)));
    if (getRegionHits) {
      // Complete-unit callers may add projected leaf/flower/fruit geometry.
      // Both internal branch IDs and already canonical root IDs are accepted;
      // all hits still pass this controller's visibility and selection filter.
      for (const id of getRegionHits({ asset, branches, polygon: shape, camera, bounds, project }) || []) {
        const root = canonical.get(id) || (roots.has(id) ? id : null);
        if (roots.has(root)) hits.add(root);
      }
    }
    return hits;
  }
  function regionMove(event) {
    const next = point(event);
    if (region.tool === 'BOX_SELECT') region.points = [region.points[0], next];
    else if (Math.hypot(next[0] - region.points.at(-1)[0], next[1] - region.points.at(-1)[1]) >= 3) region.points.push(next);
    path.setAttribute('points', polygon().map((p) => p.join(',')).join(' '));
    $('bundleSelectionCount').textContent = `${regionHits().size} 枝`;
  }
  function beginRegion(event, tool, temporary) {
      const bounds = canvas.getBoundingClientRect();
      overlay.style.left = `${canvas.offsetLeft}px`; overlay.style.top = `${canvas.offsetTop}px`;
      overlay.style.width = `${bounds.width}px`; overlay.style.height = `${bounds.height}px`;
      overlay.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`); overlay.removeAttribute('hidden');
      region = { tool, temporary, excluded: new Set(getSelectionExclusions()), points: [point(event)], before: new Set(getSelection()), operation: event.ctrlKey ? 'SUBTRACT' : event.shiftKey ? 'ADD' : $('regionOperation').value };
      if (temporary) { canvas.dataset.temporarySelection = region.operation; status(region.operation === 'SUBTRACT' ? `临时框选 · 减选（Ctrl）${SCULPT_TOOLS.has(getTool()) ? ' · 空白框清空全部选择' : ''}` : '临时框选 · 加选（Shift）', 'ready'); }
      lastPointer = event.pointerId; canvas.setPointerCapture(event.pointerId); controls.enabled = false;
      regionMove(event);
      return true;
  }
  function keyboardPointSlide() {
    const selected=getSelectedPoint(), asset=getAsset(), branches=asset.masterBranches;
    const root=branches.find(b=>b.stableId===selected?.branchId), index=selected?.index;
    if (!root || index <= 0) return null;
    const roots=selectionRoots(branches,getSelection()), range=pointSlideRange(root,index);
    const scope=descendants(branches,new Set([root.stableId]));
    const reason=root.unitOwner || root.instanceId || root.symmetryGroup ? '请选择可编辑承重枝条上的控制点'
      : roots.length!==1 || roots[0]!==root ? '滑动控制点请只选择这一束枝条'
      : index===root.controlPoints.length-1 ? '枝梢端点保持固定，请选择中间控制点'
      : getAuthoring().overrides[root.stableId]?.pinned_points?.includes(index) ? '该控制点已固定，请先解除固定'
      : !range ? '相邻控制点没有可滑动的曲线范围'
      : [...getSelectionExclusions()].some(id=>scope.has(id)) ? '点间走势调整包含减选子枝，请先加回选区'
      : branches.some(b=>b!==root&&scope.has(b.stableId)&&getAuthoring().overrides[b.stableId]?.pinned_points?.length) ? '连接子枝有固定锚点，请先解除固定'
      : '';
    if (reason) {status(reason,'ready');return null;}
    const bounds=canvas.getBoundingClientRect();asset.group.updateWorldMatrix(true,false);camera.updateMatrixWorld();
    const projection=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).multiply(asset.group.matrixWorld);
    const project=p=>{const v=new THREE.Vector4(p.x,p.y,p.z,1).applyMatrix4(projection);return {x:bounds.left+(v.x/v.w+1)*bounds.width/2,y:bounds.top+(1-v.y/v.w)*bounds.height/2,z:v.z/v.w,w:v.w};};
    const path=cloneAxis(root.points,project), anchor=project(sampleLine(root.points,range.start));
    let attach=range.start, changed=false, operation=null,preview=null;
    const snapshot=createSculptSnapshot(branches,getAuthoring().overrides);
    gizmo.detach();gizmo.enabled=false;
    return {center:root.controlPoints[index].clone(),alongBranch:true,axisLabel:`当前枝 ${root.stableId}`,
      label:`控制点 ${index+1} 沿枝移点 · 点间自动更新`,hint:'在相邻点间移动 / 数值单位米，正值向梢、负值向根；按当前点位重新生成走势',
      valid:()=>getAsset()===asset&&!busy(),
      update(_,gesture) {
        const value=gesture.numeric.trim() && Number.isFinite(Number(gesture.numeric)) ? Number(gesture.numeric) : null;
        const dx=gesture.pointer.x-gesture.start.x,dy=gesture.pointer.y-gesture.start.y;
        const target=value!==null ? slideMountParameter(root.points,range.start,value) : Math.hypot(dx,dy)<2 ? range.start : projectedMountParameter(path,anchor.x+dx,anchor.y+dy,attach);
        attach=Math.max(range.min,Math.min(range.max,target));
        changed=Math.abs(attach-range.start)>1e-10;
        const knots=root.controlPoints.map((p,i)=>i===index?sampleLine(root.points,attach):p.clone());
        operation=controlCurveOperation(root,knots);
        if(changed){
          preview||=createPointCornerPreview(asset,snapshot,root);
          const updated=new Map(evaluateControlCurve([...snapshot.values()],operation,1,getAuthoring().overrides).map(b=>[b.id,b])),after=updated.get(root.id);
          preview.update(updated,controlCurveTransforms(snapshot,updated,root.id));preview.updateCarrier(after);drawPreviewOutline([...updated.values()],preview);renderMountPreview(after.controlPoints,after.points);
        }else{preview?.restore();preview=null;renderMountPreview(null);}
        return {amount:mountDistanceAt(root.points,attach)-mountDistanceAt(root.points,range.start)};
      },
      commit() {
        if(changed) {
          const accepted=commitPreview(preview,()=>transact('已移动控制点，点间走势自动更新',next=>writeControlCurve(next,operation)));
          // Keep the preview handle until the rebuild supplies its new pivot;
          // refreshing against the old asset would flash the ring at the old point.
          if(accepted!==false)return;
          renderMountPreview(null);
        } else {preview?.restore();renderMountPreview(null);}
        refresh();
      },
      cancel(){preview?.restore();renderMountPreview(null);refresh();}
    };
  }
  let pendingCopies=null;
  function keyboardDuplicate() {
    if(busy()||!getSelection().size)return null;
    const asset=getAsset(),branches=asset.masterBranches,roots=selectionRoots(branches,getSelection());
    if(roots.some(b=>b.unitOwner||b.instanceId||b.symmetryGroup)){status('请先选择承重枝干；单元枝内部请在枝条工作台编辑','ready');return null;}
    const token='DUP_'+Date.now().toString(36)+'_'+crypto.randomUUID().slice(0,4);
    const copyAsset=getDuplicateAsset();let operation,copies=[];try{
      if(getWorkspace()==='TREE')({operation,copies}=captureLinkedBranchDuplicate(copyAsset,getSelection(),token,getLeafSources()));
      else operation=captureBranchDuplicate(copyAsset,getSelection(),token,getLeafSources());
    }finally{if(copyAsset!==asset)releaseDuplicateAsset(copyAsset);}
    asset.group.updateWorldMatrix(true,true);camera.updateMatrixWorld();
    const entries=roots.map((root,i)=>{
      const family=descendants(branches,new Set([root.stableId]));
      const elementIds=new Set(asset.elements.filter(e=>family.has(e.id)||family.has(e.branchStableId)).map(e=>e.id));
      for(const p of [...asset.placements,...asset.treeOrgans])if(family.has(p.branchStableId))elementIds.add(p.stableId);
      const preview=createSelectionCopyPreview(asset,e=>e&&elementIds.has(e.id));
      if(getWorkspace()==='BRANCH'&&root.parentId<0){
        // A workbench sample has one connector. Its copied main stem starts
        // attached to that connector and can immediately snap to another branch.
        const r=operation.records.find(r=>r.id===operation.targets[i]);
        r.parent=root.stableId;r.parentT=0;r.frame={position:root.points[0].toArray(),tangent:lineTangent(root.points,0).toArray()};
        for(const record of operation.records)record.order=Math.min(3,record.order+1);
        root={...root,parentId:root.id,parentT:0};
      }
      return {root,preview,slide:createBranchCarrierSlide(branches,root,{camera,modelRoot:asset.group,bounds:canvas.getBoundingClientRect(),excludeSubtree:false,asset,authoring:getAuthoring()}),matrix:new THREE.Matrix4(),mount:null,copyId:operation.targets[i]};
    });
    gizmo.detach();gizmo.enabled=false;
    const restore=()=>entries.forEach(e=>e.preview.restore());
    return {center:roots[0].points[0].clone(),alongBranch:entries.every(e=>e.slide),label:`复制 ${roots.length} 束枝条 · 原枝保留`,valid:()=>getAsset()===asset&&!busy(),
      update({translation},gesture){let carrier='';for(const e of entries){
        if(e.slide){const target=e.slide(gesture);if(target.blocked)continue;const values={attach:target.attach,azimuth:0,elevation:0,target_parent:target.parent.stableId,...(target.trunk_anchor?{trunk_anchor:target.trunk_anchor}:{})};
          const op=makeMountOperation(branches,e.root,values,{azimuth:0,elevation:0});
          if(target.parent.importedTrunkHost&&(e.root.trunkCarrierAnchor||target.trunk_anchor))e.matrix.copy(branchMountTransform(branches,op).matrix);
          else{const source=branches.find(b=>b.id===e.root.parentId),from=e.root.trunkCarrierAnchor?e.root.points[0]:sampleLine(source.points,e.root.parentT);e.matrix.makeTranslation(...sampleLine(target.parent.points,target.attach).toArray()).multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...op.rotation))).multiply(new THREE.Matrix4().makeTranslation(...from.clone().negate().toArray()));}
          e.mount={...op,root:e.copyId,targets:[e.copyId]};carrier=target.parent.stableId;
        }else e.matrix.makeTranslation(...translation.toArray());
        e.preview.update(e.matrix);
      }return {carrier};},
      commit(){
        // Rootless copies use a rigid placement baked into their independent snapshot.
        for(const e of entries)if(!e.slide){const family=new Set([e.copyId]);let changed=true;while(changed){changed=false;for(const r of operation.records)if(family.has(r.parent)&&!family.has(r.id)){family.add(r.id);changed=true;}}
          for(const r of operation.records)if(family.has(r.id)){for(const key of ['points','controlPoints'])r[key]=r[key].map(p=>new THREE.Vector3(...p).applyMatrix4(e.matrix).toArray());r.mountMatrix=e.matrix.clone().multiply(r.mountMatrix?new THREE.Matrix4().fromArray(r.mountMatrix):new THREE.Matrix4()).toArray();}}
        pendingCopies=operation.targets;
        const preview={restore,dispose:restore};
        const accepted=commitPreview(preview,()=>transact('复制枝束并放置',next=>{
          next.sculpt_layers.push({id:token,name:'复制枝束',enabled:true,strength:1,operation,branches:{}});
          next.branch_instances.push(...copies);
          for(const [i,e]of entries.entries())if(e.mount)next.sculpt_layers.push({id:token+'_M'+i,name:'副本挂接',enabled:true,strength:1,operation:e.mount,branches:{}});
          next.active_sculpt_layer='';
        },{bypassLayers:true}));
        if(accepted===false){pendingCopies=null;restore();}refresh();
      },cancel(){restore();refresh();}};
  }
  function keyboardMount(mode) {
    const c = mountContext(), last = c.layers.at(-1);
    if (c.reason) { status(c.reason, 'ready'); return null; }
    const rotating = mode === 'rotate';
    const merge = rotating
      ? last?.enabled && last.strength === 1 && last.operation?.root_rotation && last.operation.root === c.root.stableId && last.operation.parent === c.parent.stableId ? last : null
      : null;
    const asset = getAsset(), snapshot = createSculptSnapshot(c.branches, getAuthoring().overrides,{bindings:false});
    const preview = createMeshPreview(asset, snapshot,{targets:new Set([c.root.stableId]),rigid:true});
    const family = descendants(c.branches, new Set([c.root.stableId]));
    const rigidIds = new Set(c.branches.filter(b => family.has(b.stableId)).map(b => b.id));
    const previous = { attach: c.root.parentT, azimuth: c.last?.operation.azimuth || 0, elevation: c.last?.operation.elevation || 0 };
    const bounds = canvas.getBoundingClientRect();
    asset.group.updateWorldMatrix(true, false); camera.updateMatrixWorld();
    const projection = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).multiply(asset.group.matrixWorld);
    const project = p => {
      const v = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(projection);
      return { x: bounds.left + (v.x / v.w + 1) * bounds.width / 2, y: bounds.top + (1 - v.y / v.w) * bounds.height / 2, z: v.z / v.w, w: v.w };
    };
    const path = cloneAxis(c.parent.points,project), anchor = project(sampleLine(c.parent.points, previous.attach));
    const slide=createBranchCarrierSlide(c.branches,c.root,{camera,modelRoot:asset.group,bounds,asset,authoring:getAuthoring()});
    let carrier=c.parent;
    let attach = previous.attach, operation = null, changed = false;
    gizmo.detach(); gizmo.enabled = false;
    return {
      center: c.root.points[0].clone(), alongBranch: !rotating,
      label: `${c.root.stableId} · ${rotating ? '绕枝根旋转，保持枝长' : '沿母干移动整束，保持原形'}`,
      hint: rotating ? 'X/Y/Z 调整倾斜与朝向' : '拖到另一根枝干换挂点 / 数值沿原母枝移动',
      valid: () => getAsset() === asset && !busy(),
      update({ rotation }, gesture) {
        let local;
        if (rotating) {
          changed = 1 - Math.abs(rotation.w) > 1e-12;
          local = makeMountRotationOperation(c.branches, c.root, rotation, previous);
          operation = makeMountRotationOperation(c.branches, c.root, rotation, previous, merge?.operation);
        } else {
          const result=slide(gesture);if(result.blocked)return {blocked:true};carrier=result.parent;attach=result.attach;
          const values = { ...previous, attach, target_parent:carrier.stableId,...(result.trunk_anchor?{trunk_anchor:result.trunk_anchor}:{}) };
          changed = carrier!==c.parent || Math.abs(attach - previous.attach) > 1e-10 || !!result.trunk_anchor&&JSON.stringify(result.trunk_anchor)!==JSON.stringify(c.root.trunkCarrierAnchor);
          local = makeMountOperation(c.branches, c.root, values, previous);
          operation = makeMountOperation(c.branches, c.root, values, previous, merge?.operation);
          $('mountAttach').value = Number((attach * 100).toFixed(4));
        }
        // The fresh operation is in the current parent frame; apply one rigid
        // matrix to all bound vertices, including installed leaves and organs.
        const matrix = branchMountTransform(c.branches,local).matrix;
        preview.updateRigid(matrix, rigidIds); drawRigidOutline(snapshot,rigidIds,matrix);
        renderMountPreview(c.root.controlPoints.map(p=>p.clone().applyMatrix4(matrix)));
        return rotating ? undefined : { carrier:carrier.stableId, amount: mountDistanceAt(carrier.points, attach) - (carrier===c.parent?mountDistanceAt(c.parent.points, previous.attach):0) };
      },
      commit() {
        if (changed) commitMount(c, merge, operation, preview);
        else { preview.restore(); renderMountPreview(null); }
        refresh();
      },
      cancel() { preview.restore(); renderMountPreview(null); refresh(); },
    };
  }
  function keyboardRadius() {
    const asset=getAsset(),branches=asset.masterBranches,roots=selectionRoots(branches,getSelection());
    const selected=getSelectedPoint(),root=branches.find(b=>b.stableId===selected?.branchId);
    const point=selected?.index>0 ? selected.index : 0;
    if(!roots.length)return null;
    const reason=roots.some(b=>b.symmetryGroup) ? '请选联动枝群的源枝调整粗细'
      : point && (roots.length!==1 || roots[0]!==root) ? '后段粗细调整请只选这一束枝条'
      : point && point>=root.controlPoints.length-1 ? '枝梢后没有可调整枝段，请选中间控制点' : '';
    if(reason){status(reason,'ready');return null;}
    const operation={type:'RADIUS',targets:roots.map(b=>b.stableId),point,factor:1,excluded:[...getSelectionExclusions()].sort()};
    const layers=getAuthoring().sculpt_layers,last=layers.at(-1),previous=last?.operation;
    const merge=!point && last?.enabled && last.strength===1 && previous?.type==='RADIUS'
      && previous.point===point && JSON.stringify(previous.targets)===JSON.stringify(operation.targets)
      && JSON.stringify(previous.excluded||[])===JSON.stringify(operation.excluded) ? last : null;
    const preview=createRadiusPreview(asset);let factor=1;
    gizmo.detach();gizmo.enabled=false;
    return {center:(point?root.controlPoints[point]:roots[0].points[0]).clone(),uniform:true,lockAxes:true,
      scaleRange:merge?[.05/previous.factor,20/previous.factor]:[.05,20],axisLabel:'截面粗细',
      label:point?'控制点后段及下级枝干 · 前段保持':'整束承重枝干',hint:'只改粗细，枝长、走向与单元枝大小保持',
      valid:()=>getAsset()===asset&&!busy(),
      update(delta){factor=delta.amount;preview.update(evaluateBranchRadius(branches,{...operation,factor}));},
      commit(){
        if(Math.abs(factor-1)>1e-10){
          const final={...operation,factor:factor*(merge?previous.factor:1)};
          commitPreview(preview,()=>transact(point?'已调整控制点后段的枝干粗细':'已调整整束枝干粗细',next=>{
            if(merge)next.sculpt_layers.find(l=>l.id===merge.id).operation=final;
            else next.sculpt_layers.push({id:`RADIUS_${Date.now()}`,name:point?`控制点 ${point+1} 后段粗细`:'整束枝干粗细',enabled:true,strength:1,operation:final,branches:{}});
            next.active_sculpt_layer='';
          }));
        }else preview.restore();
        refresh();
      },cancel(){preview.restore();refresh();}
    };
  }
  function keyboardTransform(operation) {
    if(getSelectedPoint()?.scope==='POINTS'){
      if(!getSelectedPoint().indices?.length){status('先选择要调整的控制点','ready');return null;}
      if(pointGroupContext()&&['translate','rotate','scale'].includes(operation))return keyboardPointGroup();
    }
    if(busy()||drag||mountDrag||region||!getSelection().size)return null;
    const roots=selectionRoots(getAsset().masterBranches,getSelection());
    if(roots.some(b=>b.unitOwner||b.instanceId)){status('请在枝条工作台编辑单元枝内部样式','ready');return null;}
    if (operation === 'radius') return keyboardRadius();
    if (operation === 'translate' && getSelectedPoint()?.index>0) return keyboardPointSlide();
    if (operation === 'rotate' && pointRotationContext()) return keyboardPointRotation(pointRotationContext());
    if (getWorkspace() === 'TREE' && ['translate', 'rotate'].includes(operation)) return keyboardMount(operation);
    const rootScaling = (getWorkspace() === 'TREE' || Boolean(pointRotationContext())) && operation === 'scale';
    if (rootScaling && !rootScaleAllowed()) return null;
    // Reuse existing branch transforms, root preservation and preview handoff.
    proxy.position.copy(center());const completed=makeTransformState(false,rootScaling),asset=getAsset();let changed=false;
    gizmo.detach();
    return {center:completed.pivot.clone(),uniform:false,scaleRange:[.05,20],label:completed.pointScale?'缩放后段控制点 · 点间自动更新':rootScaling?'各自枝根缩放 · 单元枝大小保持':getSelection().size+' 束枝干',valid:()=>getAsset()===asset&&!busy(),
      update({translation,rotation,scale}) {
        changed=translation.lengthSq()>1e-14||1-Math.abs(rotation.w)>1e-12||scale.distanceToSquared(new THREE.Vector3(1,1,1))>1e-14;
        if(rootScaling)scalePreview(completed,scale);
        else completed.updated=transformBundles(completed.snapshot,completed.selection,{pivot:completed.pivot,individual:completed.individual,keepRoots:completed.keepRoots,translation,rotation,scale:scale.clone().clampScalar(.05,20)});
        completed.preview.update(symmetryPreview(completed.updated,getAuthoring().symmetry_groups),completed.unitTransforms);drawPreviewOutline([...completed.updated.values()],completed.preview);
        if(completed.pointScale)completed.preview.updateCarrier(completed.updated.get(completed.pointScale.root.id));
      },
      commit(){if(changed)commit(completed);else completed.preview.restore();refresh();},
      cancel(){completed.preview.restore();if(completed.pointScale)renderMountPreview(null);refresh();}
    };
  }
  const controller = {
    get active() { return Boolean(drag || region || mountDrag); },
    get mounting() { return Boolean(mountDrag || drag?.mountRotation || drag?.pointRotation); },
    beginMount,
    get debug() { return { selected: [...getSelection()], isolated: visibleIds ? [...visibleIds] : null, dragging: Boolean(drag), pivot: proxy.position.toArray(), gizmo }; },
    isVisible(id) { return !visibleIds || visibleIds.has(id); },
    refresh, cancel, keyboardTransform, keyboardDuplicate, drawOutline,
    isolate(ids) { cancel(); isolatedRoots=ids?.length?new Set(ids):null; refresh(); },
    reset() { cancel(); isolatedRoots = null; visibleIds = null; editPivot = false; refresh(); },
    toolChanged() {
      cancel(); editPivot = false;
      ['X', 'Y', 'Z'].forEach((axis) => { $(`bundleValue${axis}`).value = mode() === 'scale' ? 1 : 0; });
      refresh();
    },
    beginTemporary(event) { if (busy() || drag || region) return false; return beginRegion(event, 'BOX_SELECT', true); },
    begin(event) {
      if (event.button !== 0) return false;
      if (getTool()==='SELECT' && gizmo.enabled && gizmo.mode==='rotate') {
        if (busy()) return true;
        const bounds=canvas.getBoundingClientRect(),p=proxy.getWorldPosition(new THREE.Vector3()).project(camera);
        // Keep the center clickable for moving the existing root control point.
        if(Math.hypot(event.clientX-(bounds.left+(p.x+1)*bounds.width/2),event.clientY-(bounds.top+(1-p.y)*bounds.height/2))<12)return false;
        helper.updateMatrixWorld(true);gizmo.pointerHover(pointer(event));
        if(!['X','Y','Z'].includes(gizmo.axis))return false;
        gizmo.pointerDown(pointer(event));
        if(drag){lastPointer=event.pointerId;canvas.setPointerCapture(event.pointerId);return true;}
        return false;
      }
      if (TRANSFORM_TOOLS.has(getTool())) {
        if (busy()) return true;
        helper.updateMatrixWorld(true);
        gizmo.pointerHover(pointer(event)); gizmo.pointerDown(pointer(event));
        if (drag) { lastPointer = event.pointerId; canvas.setPointerCapture(event.pointerId); }
        return true;
      }
      if (!SELECTION_TOOLS.has(getTool())) return false;
      if (busy()) return true;
      return beginRegion(event, getTool(), false);
    },
    move(event) {
      if (mountDrag) return moveMount(event);
      if (drag?.mountRotation || drag?.pointRotation) {gizmo.pointerMove(pointer(event,-1));return true;}
      if(getTool()==='SELECT' && gizmo.enabled && gizmo.mode==='rotate')gizmo.pointerHover(pointer(event));
      if (region) { regionMove(event); return true; }
      if (TRANSFORM_TOOLS.has(getTool())) {
        if (drag) gizmo.pointerMove(pointer(event, -1)); else gizmo.pointerHover(pointer(event));
        return true;
      }
      return SELECTION_TOOLS.has(getTool());
    },
    end(event) {
      if (event.button !== 0) return false;
      if (mountDrag) return endMount(event);
      if (drag?.mountRotation || drag?.pointRotation) {gizmo.pointerUp(pointer(event));releasePointer();return true;}
      if (!region && TRANSFORM_TOOLS.has(getTool())) { gizmo.pointerUp(pointer(event)); releasePointer(); return true; }
      if (!region) return SELECTION_TOOLS.has(getTool());
      regionMove(event);
      const completed = region;
      const hits = regionHits();
      const p = completed.points;
      const moved = p.some((value) => Math.hypot(value[0] - p[0][0], value[1] - p[0][1]) > 4);
      region = null; overlay.setAttribute('hidden', ''); releasePointer(); controls.enabled = true;
      delete canvas.dataset.temporarySelection;
      const isRegion = moved && polygonArea(p, completed.tool) > 16;
      const clear = isRegion && completed.temporary && completed.operation === 'SUBTRACT'
        && hits.size === 0 && SCULPT_TOOLS.has(getTool());
      let clicked = false;
      if (isRegion) {
        const result = clear ? { ids: new Set(), excluded: new Set() }
          : combineScopedSelection(getAsset().masterBranches, completed.before, hits, completed.operation, includeSelectionChildren(), completed.excluded);
        if (completed.temporary) temporarySelectionDone({ clear });
        setSelection(result.ids, { excluded: result.excluded });
      } else {
        refresh();
        if (completed.temporary) clicked = Boolean(temporaryClick(event, completed.operation));
      }
      if (completed.temporary) status(clear ? '已清空所有选择 · 继续使用当前笔刷' : isRegion || clicked ? `${completed.operation === 'SUBTRACT' ? '减选' : '加选'}完成 · 继续使用原工具` : '未命中枝条 · 继续使用原工具', 'ready');
      return true;
    },
    key(event) {
      if (event.key === 'Escape' && cancel()) return true;
      if (event.target.matches?.('input,select,textarea,[contenteditable="true"]')) return false;
      if (event.code === 'NumpadDivide' || event.key === '/') { $('isolateSelectionBtn').click(); return true; }
      return false;
    },
  };
  function selectAction(action) {
    cancel();
    const branches = available(); const current = getSelection();
    let next;
    if (action === 'ALL') next = new Set(branches.map(selectionId));
    if (action === 'NONE') next = new Set();
    if (action === 'INVERT') next = new Set(branches.filter((b) => !current.has(selectionId(b))).map(selectionId));
    if (action === 'SUBTREE') next = descendants(branches, current);
    if (action === 'GROW') {
      next = new Set(current);
      branches.forEach((branch) => {
        if (current.has(branch.stableId)) { const parent = branches.find((b) => b.id === branch.parentId); if (parent) next.add(parent.stableId); }
        if (current.has(branches.find((b) => b.id === branch.parentId)?.stableId)) next.add(branch.stableId);
      });
    }
    if (action === 'SHRINK') next = new Set(branches.filter((branch) => current.has(branch.stableId) && branch.children.some((id) => current.has(branches.find((b) => b.id === id)?.stableId))).map((branch) => branch.stableId));
    setSelection(next);
  }
  document.querySelectorAll('[data-selection-action]').forEach((button) => button.addEventListener('click', () => selectAction(button.dataset.selectionAction)));
  $('isolateSelectionBtn').addEventListener('click', () => {
    cancel();
    if (isolatedRoots) isolatedRoots = null;
    else if (getSelection().size) isolatedRoots = new Set(getSelection());
    else { status('请先选择需要隔离的枝条', 'ready'); return; }
    refresh();
    setSelection(getSelection());
    status(isolatedRoots ? '隔离编辑已开启' : '已恢复全树显示', 'ready');
  });
  $('bundlePivot').addEventListener('change', () => {
    cancel(); editPivot = false;
    if ($('bundlePivot').value === 'CUSTOM') customPivot.copy(proxy.position);
    refresh();
  });
  $('editBundlePivot').addEventListener('click', () => { cancel(); editPivot = !editPivot; refresh(); });
  ['X', 'Y', 'Z'].forEach((axis) => $(`bundlePivot${axis}`).addEventListener('change', () => {
    const value = Number($(`bundlePivot${axis}`).value) || 0;
    cancel(); customPivot.copy(proxy.position); customPivot[axis.toLowerCase()] = value;
    $('bundlePivot').value = 'CUSTOM'; refresh();
  }));
  $('applyBundleTransform').addEventListener('click', () => {
    cancel();
    if (busy() || !getSelection().size) return;
    const values = ['X', 'Y', 'Z'].map((axis) => Number($(`bundleValue${axis}`).value));
    if (values.some((value) => !Number.isFinite(value))) return;
    if(getSelectedPoint()?.scope==='POINTS'&&!getSelectedPoint().indices?.length)return;
    if(pointGroupContext()){
      const d=makePointGroupState();if(!d)return;previewPointGroup(d,{translation:mode()==='translate'?new THREE.Vector3(...values):new THREE.Vector3(),rotation:mode()==='rotate'?new THREE.Quaternion().setFromEuler(new THREE.Euler(...values.map(THREE.MathUtils.degToRad))):new THREE.Quaternion(),scale:mode()==='scale'?new THREE.Vector3(...values).clampScalar(.05,20):new THREE.Vector3(1,1,1)});commitPointGroup(d);refresh();return;
    }
    if ((getWorkspace() === 'TREE' || pointRotationContext()) && getTool() === 'BUNDLE_SCALE' && !rootScaleAllowed()) return;
    if (getTool() === 'BUNDLE_ROTATE' && pointRotationContext()) {
      const d=makePointRotationState(pointRotationContext()); if(!d)return;
      previewPointRotation(d,new THREE.Quaternion().setFromEuler(new THREE.Euler(...values.map(THREE.MathUtils.degToRad))));
      commitPointRotation(d);refresh();return;
    }
    const completed = makeTransformState();
    if (completed.rootScaling) scalePreview(completed, new THREE.Vector3(...values));
    else completed.updated = transformBundles(completed.snapshot, completed.selection, {
      pivot: completed.pivot, individual: completed.individual, keepRoots: completed.keepRoots,
      translation: mode() === 'translate' ? new THREE.Vector3(...values) : new THREE.Vector3(),
      rotation: mode() === 'rotate' ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...values.map(THREE.MathUtils.degToRad))) : new THREE.Quaternion(),
      scale: mode() === 'scale' ? new THREE.Vector3(...values).clampScalar(0.05, 20) : new THREE.Vector3(1, 1, 1),
    });
    commit(completed); refresh();
  });
  $('bundleKeepRoots').addEventListener('change', cancel);
  canvas.addEventListener('lostpointercapture', cancel);
  window.addEventListener('blur', cancel);
  window.addEventListener('resize', cancel);
  return controller;
}

function polygonArea(points, tool) {
  if (tool === 'BOX_SELECT') return Math.abs((points.at(-1)[0] - points[0][0]) * (points.at(-1)[1] - points[0][1]));
  return Math.abs(points.reduce((sum, point, i) => { const next = points[(i + 1) % points.length]; return sum + point[0] * next[1] - point[1] * next[0]; }, 0)) / 2;
}
