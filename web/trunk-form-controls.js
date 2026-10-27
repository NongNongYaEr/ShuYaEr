import {supportsHorizontalRootPlane} from './trunk-root-plane.js';
import * as THREE from 'three';
import { normalizeTrunkForm, sampleTrunkSectionProfile, trunkFormSectionAt, normalizeTrunkForms, createTrunkFormPreset, trunkFormForBranch, createTrunkSectionProfile, createDirectTrunkForm, isDirectTrunkForm, sampleDirectTrunkSection, trunkSectionEllipseRadius, getBaseTrunkForm,createDirectTrunkSectionProfileSampler,updateDirectTrunkSectionTangents,updateTrunkSectionJoinTangents } from './trunk-form.js';
import {wholeTrunkContourKnots,captureWholeTrunkContour,applyWholeTrunkContour,pullWholeTrunkContour,wholeTrunkSurfaceSampler} from './trunk-whole-contour.js';
import { createTrunkFormPreviewGeometry,createTrunkFormPreviewJob } from './branch-kernel.js';
import {createGeometryJobClient} from './geometry-job-client.js';
import {createCoalescedGeometryPreview} from './coalesced-geometry-preview.js';
import {computeTrunkGeometry} from './trunk-geometry-compute.js';
import { skeletonBranches } from './skeleton-thickness.js';
import { sectionAt } from './branch-shaping.js';
import { createTrunkSectionDock } from './trunk-section-dock.js';
import {trunkSectionContext,createTrunkSectionReferenceCache} from './trunk-section-reference.js';
import {selectTrunkSections,transformTrunkSectionGroup,removeTrunkSections} from './trunk-section-group.js';
import {TRUNK_RANGE_DEFAULTS,trunkSectionRange,applyTrunkSectionRange} from './trunk-section-range.js';
import { interpolateSectionRing, projectSectionPosition, sectionPlanePoint, sectionPointerAngle, signedAngleDelta } from './trunk-section-interaction.js';
import { trunkSectionShortcut, TRUNK_SECTION_MODE_ACTIONS } from './trunk-section-shortcuts.js';
import { createSectionOverlayLine, hitSectionPolyline } from './trunk-section-overlay.js';
import { sectionPositionFromSurfaceHit } from './trunk-section-placement.js';
import { createSectionProfileMarker } from './trunk-section-marker.js';
import { createTrunkDetailControls } from './trunk-detail-controls.js';
import { createTrunkMeshControls } from './trunk-mesh-controls.js';
import {createTrunkWorkspaceLayout} from './trunk-workspace-layout.js';
import { normalizeTrunkMeshSettings, trunkRingAngleSegment } from './trunk-mesh-density.js';
import { createTrunkDetailSizeMetric } from './trunk-detail-size.js';
import { intersectTrunkSurface } from './trunk-surface-picker.js';
import {insertTrunkSectionPoint,insertTrunkSectionPointAfter,removeTrunkSectionPoints} from './trunk-section-point-edit.js';
import {selectTrunkSectionPoints,trunkSectionPointWeights,pullTrunkSectionPoints,moveTrunkSectionPoints} from './trunk-section-point-group.js';
import {trunkSectionPointPivot,transformTrunkSectionPoints} from './trunk-section-point-transform.js';
import {createTrunkPointSelectionMemory} from './trunk-point-selection-memory.js';
import {trunkPointTransformInputKey,parseTrunkPointTransformInput} from './trunk-point-transform-input.js';
import {captureTrunkContour,pasteTrunkContour} from './trunk-contour-transfer.js';
import {createTrunkPointCursor} from './trunk-point-cursor.js';
import {createTrunkChildEditLayer,excludeRemovedTrunkChildren,reconnectRemovedTrunkChildren} from './trunk-child-edit-layer.js';
import {trunkWorkflowStage,trunkWorkflowMarkup,updateTrunkWorkflow,trunkWorkflowShortcut,TRUNK_WORKFLOW_LABELS} from './trunk-workflow-ui.js';
import {createTrunkNumberDrag} from './trunk-number-drag.js';
import {selectTrunkRoots,editTrunkRootGroup,rootFieldValue,rootAngleDelta,TRUNK_ROOT_FIELDS} from './trunk-root-edit.js';
import {applyTrunkRootPreset} from './trunk-root-presets.js';
import {prepareTrunkRootBase,trunkRootBaseSection,isTrunkRootBase,omitUnchangedTrunkRootBase} from './trunk-root-base.js';
import {trunkSectionMainPoints,trunkSectionChildPoints,editTrunkSectionLayer,resetTrunkSectionLayer,TRUNK_MAIN_POINT_LIMIT} from './trunk-section-layers.js';

// Thumbnail rendering is synchronous and traverses the committed asset group.
// Restore only carriers concealed by our local overlays, without changing the
// user's inspection mode or making an originally hidden carrier visible.
export function withFinalTrunkFormVisibility(entries, callback) {
  const previous = new Map();
  try {
    for (const entry of entries) {
      if (!entry?.mesh || typeof entry.visible !== 'boolean' || previous.has(entry.mesh)) continue;
      previous.set(entry.mesh, entry.mesh.visible);
      entry.mesh.visible = entry.visible;
    }
    return callback();
  } finally {
    for (const [mesh, visible] of previous) mesh.visible = visible;
  }
}

// Surface edits are a small local preview. Authoring and history only change
// when the user releases a slider/handle or confirms a numeric field.
export function createTrunkFormControls(api) {
  const panel = document.createElement('details'); panel.id='trunkFormPanel'; panel.className='trunk-form-panel'; panel.open=true;
  const field=(id,label,min,max,step,value)=>`<label class="trunk-form-field"><span>${label}</span><input id="${id}" type="number" min="${min}" max="${max}" step="any" value="${value}"><input data-trunk-range="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"></label>`;
  panel.innerHTML=`<summary>主枝干 · 形体</summary><p id="trunkFormTarget"></p><div id="trunkFormEmpty" class="empty-state">点选一根承重主枝干，或<button id="trunkFormSelectRoot" type="button">选择主干</button></div>
  <div id="trunkFormBody">${trunkWorkflowMarkup('panel')}<p id="trunkWorkflowGuide" class="trunk-workflow-guide"></p><div id="trunkDetailWorkspaceNotice" class="trunk-workflow-notice" hidden>细节类型、走势、尺寸与预设在视口工具窗中编辑。点紫色标记或列表可调整已有细节。</div>
  <details class="trunk-form-advanced"><summary>查看对比与旧版兼容</summary><div class="trunk-form-kind"><strong id="trunkFormKind"></strong><button id="trunkDirectStart" type="button">开始直接截面</button><button id="trunkLegacyRestore" type="button" hidden>恢复旧版</button></div><p id="trunkFormKindHint"></p><div class="trunk-view-switch" role="group" aria-label="仅改变当前枝干的查看方式"><button data-trunk-view="BASE" type="button">只看基础轮廓</button><button data-trunk-view="FINAL" type="button">查看完整效果</button></div></details>
  <div id="trunkDirectPreview" data-trunk-conversion-controls hidden><p>改为相邻截面过渡，旧版效果可能变化。请预览后确认；取消可恢复原样。</p><div><button id="trunkDirectConfirm" type="button">确认使用直接截面</button><button id="trunkDirectCancel" type="button">取消试用</button></div></div>
  <details class="trunk-form-section" data-trunk-subpanel="details"><summary>基础沟纹与基部</summary><div class="trunk-form-presets"><button data-trunk-preset="NATURAL" type="button">自然纵沟</button><button data-trunk-preset="BUTTRESS" type="button">板根老树</button><button id="trunkFormReset" type="button">恢复本枝原形</button></div>
  <small id="trunkFormPresetHint">预设与恢复仅作用当前这根枝干。</small>
  <div class="trunk-form-grid">${field('trunkGrooveDepth','纵沟深度',0,.65,.01,0)}${field('trunkGrooveCount','纵沟数量',3,16,1,7)}${field('trunkRootFlare','基部膨大',0,3,.05,0)}${field('trunkAsymmetry','不对称',0,.4,.01,0)}${field('trunkHeightStart','形体起点（%）',0,99,1,0)}${field('trunkHeightEnd','形体终点（%）',1,100,1,100)}</div></details>
  <details class="trunk-form-section" data-trunk-subpanel="section"><summary>局部截面 · 大轮廓</summary><div class="trunk-form-row"><select id="trunkSectionSelect" aria-label="选取局部截面"></select><button id="trunkSectionAdd" type="button">＋截面</button><button id="trunkSectionRemove" type="button">删除</button></div><div id="trunkSectionFields" class="trunk-form-grid">${field('trunkSectionT','沿枝位置（%）',0,100,1,50)}${field('trunkSectionRadius','粗细倍率',.2,3,.05,1)}${field('trunkSectionOval','椭圆比例',.25,4,.05,1)}${field('trunkSectionRoll','截面扭转（°）',-180,180,1,0)}${field('trunkSectionSpan','过渡范围（%）',3,100,1,18)}</div><small id="trunkSectionInterpolationHint">以本枝原有粗细为基准，平滑衔接相邻区域。</small></details>
  <details class="trunk-form-section" data-trunk-subpanel="buttress"><summary>独立板根</summary><div class="trunk-form-row"><select id="trunkButtressSelect" aria-label="选取独立板根"></select><button id="trunkButtressAdd" type="button">＋板根</button><button id="trunkButtressRemove" type="button">删除</button></div><div id="trunkButtressFields" class="trunk-form-grid">${field('trunkButtressAngle','绕枝方向（°）',0,360,1,0)}${field('trunkButtressLength','伸出倍率',0,6,.1,2)}${field('trunkButtressHeight','沿枝高度（%）',2.5,100,1,25)}${field('trunkButtressWidth','展开角度（°）',4,90,1,35)}</div><small>伸出倍率以基部半径为单位；黄色端点可直接拖动，改变这条板根的方向与伸出。</small></details>
  <button id="trunkFinalContourEdit" type="button">下一步 · ${TRUNK_WORKFLOW_LABELS.CONTOUR}</button><button id="trunkFormHandles" type="button" aria-pressed="false">开始视口调整</button><p id="trunkFormStatus" role="status"></p><small>当前仅调整这一根承重枝。松手确认，Esc 取消；进入造型自动暂停单元枝；Esc 留在本区，完成调整恢复整树。</small></div>`;
  document.getElementById('branchEditor').before(panel);
  const workspaceLayout=createTrunkWorkspaceLayout(panel);
  const revealMesh=()=>{workspaceLayout.revealAdvanced();meshControls.reveal();};
  const toggle=document.createElement('button'); toggle.id='trunkFormMode'; toggle.type='button'; toggle.textContent='主干形体'; toggle.title='进入枝干编辑，暂时隐藏单元枝；Esc 取消或退一层，完成调整后恢复整树'; toggle.setAttribute('aria-pressed','false');
  document.getElementById('treeSelectionModes').after(toggle);
  const $=id=>panel.querySelector('#'+id),root=new THREE.Group();root.name='TrunkFormControls';api.modelRoot.add(root);
  const handles=new THREE.Group(),previewRoot=new THREE.Group();root.add(previewRoot,handles);
  let sizeGeometry=null,sizeTransform='',sizeMetric=null;
  let enabled=false,target=null,draft=null,gesture=null,pending=null,overlay=null,viewOverlay=null,baseGeometry=null,baseGeometryKey='',frame=null,sectionId='',buttressId='',stamp='',drag=null,placement=null,conversion=null,controlEnabled=true,sectionMode='PROFILE',editPart='SECTION',viewMode='BASE',lastPointer=null,swallowPointer=null,blockContext=false,blockDoubleUntil=0,hoverSectionId='',hoverKnotId='';
  let handlePreview=null,handlePreviewKey='';
  const previewQueue=createCoalescedGeometryPreview(createGeometryJobClient(),{
    valid:c=>enabled&&!pending&&target?.stableId===c.id&&api.getAsset()===c.asset,
    install:(geometry,c)=>installPreviewGeometry(geometry,c.mesh,c.view),
    fallback:job=>computeTrunkGeometry(job),onError:error=>console.warn('树干预览后台回退：',error.message),
  });
  window.addEventListener('beforeunload',()=>previewQueue.dispose());
  let selectionScope='POINTS',preparingWholeMode=null,selectedRingIds=new Set(),directEditSession=null;
  let region='SECTION',rootSectionBefore=null,selectedRootIds=new Set(),rootBaseFocused=false,rootBaseSession=null;
  let contourScope='BASE',wholePointCount=64,wholeTool='POINT',wholeReach=18,mainReach=72,wholeWorldPoints=true;
  let selectedKnotId='',selectedKnotKey='',wholeDensityKey='',selectedKnotIds=new Set();
  let childPlanKey='',childPlanCache=null;
  const ringPointAnchors=new Map();
  const readSectionReferences=createTrunkSectionReferenceCache();
  let rangeOpen=false,rangeSelection={startId:'',endId:''},rangeOptions={...TRUNK_RANGE_DEFAULTS},rangeRevision=0,rangeViewBefore=null,rangeResult={changed:[],limited:[]};
  let contourClipboard=null;
  const pointMemory=createTrunkPointSelectionMemory();
  let worldBox=null,worldHoverPointer=null,workspaceOpening=null;
  const pointCursor=createTrunkPointCursor(),worldBoxNode=document.createElement('div');worldBoxNode.className='trunk-world-point-box';worldBoxNode.hidden=true;document.body.append(worldBoxNode);
  const dock=createTrunkSectionDock({canvas:api.canvas,
    openRange,closeRange,selectRange,editRange,confirmRange:commit,cancelRange:cancel,previewLoft,confirmLoft:commit,moveRing:()=>beginQuickDrag('SLIDE'),selectRing:()=>setSelectionScope('RING'),selectPointScope:()=>setSelectionScope('POINTS'),transformRing:beginQuickDrag,
    state:()=>({region,rootPlane:{supported:supportsHorizontalRootPlane(target),mode:draft?.root_plane||'FOLLOW',preview:gesture?.rootPlane?.mode},rootBase:region==='SECTION'&&isTrunkRootBase(section()),virtualRootBase:Boolean(rootBaseSession),roots:rootState(),selectionScope,selectedSectionIds:ringSelection(),wholeAction:['SLIDE','TWIST','RADIUS'].includes(drag?.kind)?drag.kind:null,ringMoving:drag?.kind==='SLIDE',loft:draft?.loft_interpolation||'LINEAR',loftPreview:Boolean(gesture?.loft),range:rangeState(),clipboard:contourClipboard&&{scope:contourClipboard.shape.scope,label:contourClipboard.label,compatible:contourClipboard.shape.direct===isDirectTrunkForm(draft)},pastePreview:Boolean(gesture?.contourPaste),childLayer:childLayerInfo(),enabled:enabled&&editPart==='SECTION',editable:usable(),target:target?.stableId,stage:displayWorkflowStage(),compatibility:Boolean(directEditSession),conversionOriginal:Boolean(conversion?.original),sections:draft?.sections||[],section:uiSection(),sectionField:gesture?.sectionField,presetPreview:gesture?.preset?.record,mode:sectionMode,count:draft?.sections.length||0,active:Boolean(gesture||drag||placement||conversion||pending||dock.active),keyboard:Boolean(drag?.keyboard||placement||conversion),pending:Boolean(pending||api.isBusy?.()||api.getAsset()?.group.userData.pending_rebuild),direct:isDirectTrunkForm(draft),view:isDirectTrunkForm(draft)?viewMode:'FINAL',contourScope,wholePointCount,wholeTool,wholeReach:pointReach(),wholeWorldPoints,conversion:Boolean(conversion),legacy:Boolean(current()&&!isDirectTrunkForm(current())),covered:Boolean(coveredSection()),hoverKnot:hoverKnotId,activeKnot:drag?.kind==='PROFILE'?drag.knotId:'',hint:gesture?.loft?'层间过渡试用 · Enter 确认 / Esc 取消':conversion?TRUNK_WORKFLOW_LABELS[displayWorkflowStage()]+'准备 · Q 对照原形 · 确认后进入编辑':placement?placementHint():drag?.keyboard?quickHint():region==='ROOT'?'板根生成参数 · 局部造型用根盘圈点编辑':captureBlockMessage()||overlapHint()||captureWarning()}),
    setRegion,editRootBase,previewRootPlane,confirmRootPlane:commit,selectRootItem,selectRootItems,clearRootSelection,editRootField,focusRoot,addRoot:()=>createRoots(false),duplicateRoots:()=>createRoots(true),removeRoots,previewRootPreset,confirmRootPreset:commit,
    copyContour:copyContourShape,pasteContour:previewContourPaste,confirmPaste:commit,workflow:setWorkflowStage,selectSection:selectRingSection,inspectMesh:revealMesh,
    editSectionField:(key,value)=>{
      const id={t:'trunkSectionT',radius:'trunkSectionRadius',roll:'trunkSectionRoll'}[key];
      if(key==='t'&&!gesture&&usable())pinRingPointSelection();
      if(!id||!section()||drag||placement||conversion||detailControls.active||gesture&&gesture.sectionField!==key||!begin('调整当前截面参数'))return false;
      gesture.beforeSectionMode??=sectionMode;gesture.sectionField=key;gesture.ringFieldStartRoll??=sectionRoll(section());gesture.ringFieldSources??=draft.sections.filter(s=>(selectionScope==='RING'?ringSelection():[sectionId]).includes(s.id)).map(s=>structuredClone(s));$(id).value=value;
      if($(id).value===''||!$(id).checkValidity()){status('请输入范围内的数值，或 Esc 取消');return false;}
      const source=gesture.ringFieldSources,original=source.find(s=>s.id===sectionId);if(original){const action={t:'SLIDE',radius:'RADIUS',roll:'TWIST'}[key];let v;if(key==='roll')v=isDirectTrunkForm(draft)?Number(value)-original.roll:rotationDelta(gesture.ringFieldStartRoll,Number(value));else{if(!read(id))return false;v=key==='radius'?section().radius/original.radius:section()[key]-original[key];}writeSectionGroup(source,action,v);}
      loadFields();queuePreview();status();return true;
    },
    setMode:mode=>mode==='SLIDE'?beginQuickDrag('SLIDE'):setSectionMode(mode),selectPart:setEditPart,showSurface:()=>revealControls('details'),selectRoot:()=>$('trunkFormSelectRoot').click(),
    reconnect:repairDeletedArcs,
    add:()=>beginPlacement(),duplicate:duplicateSection,remove:removeSection,exit:finishWorkspace,focus:focusSection,round:()=>{if(coveredSection()){status(overlapHint());return false;}return mutate(contourScope==='BASE'?'主点归圆，保留子点细形':'子点归基形',()=>{if(isDirectTrunkForm(draft)){const reset=resetTrunkSectionLayer(section(),{main:contourScope==='BASE'});if(!reset)return;Object.assign(section(),reset);}else delete section().profile;clearCapture(section());});},
    apply:applySectionPreset,previewPreset:previewSectionPreset,confirmPreset:commit,
    setContourScope,editWhole:editWholeContour,setWholePointCount:count=>{if(gesture||drag||pending||dock.active)return false;wholePointCount=Number(count);wholeDensityKey=pointContextKey();drawHandles();return true;},capturePreset:wholeSectionPreset,
    setWholeOptions:patch=>{if(gesture||drag||pending||dock.active||!usable())return false;if(['SOFT','POINT'].includes(patch.tool))wholeTool=patch.tool;if(Number.isFinite(patch.reach)){const reach=Math.max(6,Math.min(90,patch.reach));if(contourScope==='BASE')mainReach=reach;else wholeReach=reach;}if(typeof patch.worldPoints==='boolean')wholeWorldPoints=patch.worldPoints;drawHandles();return true;},
    pointKey:pointTransformKey,pointState:profilePointState,selectPoint:selectProfilePoint,selectPoints:selectProfilePoints,offsetPoints:editPointOffset,addPoint:insertProfilePoint,removePoint:removeProfilePoint,cyclePoint:cycleProfilePoint,nudgePoint:nudgeProfilePoint,finishNudge:()=>{if(drag?.pointNudge)finishDrag();},cancelNudge:()=>{if(drag?.pointNudge)cancel();},worldBoxActive:()=>Boolean(worldBox),
    flush:commit,frontData,beginFront,moveFront,finishFront:finishDrag,cancel,setView,beginDirect:beginConversion,confirmDirect:confirmConversion,compareConversion:()=>setConversionComparison(!conversion?.original),
  });
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const neutral=()=>createDirectTrunkForm();
  let refreshReadCache=null;
  const current=()=>{if(!target)return null;const authoring=api.getAuthoring();if(!refreshReadCache)return trunkFormForBranch(authoring,target.stableId);let records=refreshReadCache.get(authoring);if(!records)refreshReadCache.set(authoring,records=new Map());if(!records.has(target.stableId))records.set(target.stableId,trunkFormForBranch(authoring,target.stableId));return records.get(target.stableId);};
  const section=()=>draft?.sections?.find(s=>s.id===sectionId),buttress=()=>draft?.buttresses?.find(b=>b.id===buttressId);
  const detailControls=createTrunkDetailControls({panel,canvas:api.canvas,camera:api.camera,controls:api.controls,root,
    state:()=>({enabled,mode:editPart,stage:workflowStage(),editable:usable(),active:Boolean(gesture||drag||placement||conversion||pending),target:target?.stableId,direct:isDirectTrunkForm(draft),view:viewMode,geometryKey:(overlay?.object||viewOverlay?.object||meshFor(target?.stableId))?.geometry.uuid}),
    workflow:setWorkflowStage,inspectMesh:revealMesh,
    draft:()=>draft,begin,commit,cancel,preview:()=>{queuePreview();status();},selectMode:setEditPart,setView,exit:finishWorkspace,surface:detailSurfacePosition,point:detailSurfacePoint,metric:detailSizeMetric,
    onContextChanged:()=>{updateFormUi();api.onTrunkFormModeChanged?.();},
    updateTransform:group=>{const asset=api.getAsset();if(asset){asset.group.updateMatrix();group.matrix.copy(asset.group.matrix);group.matrixAutoUpdate=false;}},
    focus:(t,angle)=>{const local=detailSurfacePoint(t,angle);if(!local)return;root.updateWorldMatrix(true,false);const point=local.applyMatrix4(detailControls.markers.matrixWorld),delta=point.sub(api.controls.target);api.camera.position.add(delta);api.controls.target.add(delta);api.controls.update();},
  });
  const wireRoot=new THREE.Group();wireRoot.name='TrunkMeshWire';root.add(wireRoot);
  let wireEnabled=false,wireObject=null,wireSource=null;
  const meshControls=createTrunkMeshControls({containers:[$('trunkFormBody')],
    state:()=>({target:target?.stableId,mesh:draft?.mesh,wire:wireEnabled,geometry:(overlay?.object||viewOverlay?.object||meshFor(target?.stableId))?.geometry,view:isDirectTrunkForm(draft)?viewMode:'FINAL',editable:usable()&&!rangeOpen&&!drag&&!placement&&!detailControls.active&&!dock.active&&(!gesture||gesture.mesh),active:Boolean(gesture||pending||conversion||detailControls.active||dock.active)}),
    edit:patch=>{if(drag||placement||detailControls.active||gesture&&!gesture.mesh||!begin('调整本枝网格精度'))return false;gesture.mesh=true;draft.mesh=normalizeTrunkMeshSettings({...normalizeTrunkMeshSettings(draft.mesh)||{version:1},...patch});queuePreview();status();return true;},
    apply:mesh=>{if(gesture||drag||placement||detailControls.active)return false;if(!mesh&&!draft?.mesh)return true;return mutate('调整本枝网格精度',d=>{if(mesh)d.mesh=mesh;else delete d.mesh;});},
    commit,cancel,setWire:next=>{if(next&&!enabled)enable(true);wireEnabled=next;syncWire();meshControls.update();},
  });
  function releaseWire(){if(wireObject){wireRoot.remove(wireObject);wireObject.material.dispose();wireObject=null;wireSource=null;}}
  function syncWire(){
    const source=overlay?.object||viewOverlay?.object||meshFor(target?.stableId);
    if(!wireEnabled||!enabled||!target||!source||panel.hidden){releaseWire();return;}
    if(wireSource!==source||wireObject?.geometry!==source.geometry){releaseWire();wireSource=source;wireObject=new THREE.Mesh(source.geometry,new THREE.MeshBasicMaterial({color:0x9ce5ce,wireframe:true,transparent:true,opacity:.48,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));wireObject.name='本枝网格线框';wireObject.renderOrder=2;wireRoot.add(wireObject);}
    wireObject.matrix.copy(source.matrix);wireObject.matrixAutoUpdate=false;
    const asset=api.getAsset();if(asset){asset.group.updateMatrix();wireRoot.matrix.copy(asset.group.matrix);wireRoot.matrixAutoUpdate=false;}
  }
  function setEditPart(next){if(rangeOpen){if(gesture?.range)return false;closeRange();}if(!['SECTION','DETAIL'].includes(next))return false;if(detailControls.active){status('请先确认或取消当前细节操作');return false;}if((!enabled||workspaceOpening)&&deferWorkspaceEntry(()=>setEditPart(next)))return false;if(!enabled||!commit()||drag||placement||conversion)return false;if(next==='DETAIL')leaveRootBase();if(next==='DETAIL'&&!isDirectTrunkForm(draft)&&!startDirectEditSession())return false;editPart=next;hoverSectionId=hoverKnotId='';if(next==='DETAIL'){viewMode='FINAL';releaseViewPreview();revealControls('detail-library');}else detailControls.externalCancel();syncViewPreview();updateFormUi();drawHandles();return true;}
  // Prepare an editable DIRECT view without writing the legacy document. The
  // first actual edit commits this projection and that edit in one history step.
  function startDirectEditSession(){
    if(isDirectTrunkForm(draft))return true;
    if(!usable()||gesture||drag||placement||conversion||!current())return false;
    rememberPointSelection();directEditSession={id:target.stableId,source:JSON.stringify(current())};draft=prepareBaseDraft(createDirectTrunkForm(current()));
    selectionScope='POINTS';selectedRingIds.clear();selectedKnotId=selectedKnotKey=wholeDensityKey='';selectedKnotIds.clear();viewMode='FINAL';return true;
  }
  function discardDirectEditSession(){directEditSession=null;releaseViewPreview();releaseBaseGeometry();stamp='';}
  function workflowStage(){return trunkWorkflowStage({part:editPart,contourScope});}
  function displayWorkflowStage(){return conversion?(conversion.nextContour==='FINAL'?'CONTOUR':conversion.nextPart==='DETAIL'?'DETAIL':'SHAPE'):workflowStage();}
  function setWorkflowStage(next){
    if(conversion){cancel();return setWorkflowStage(next);}
    if(!['SHAPE','CONTOUR','DETAIL'].includes(next)||gesture||drag||placement||conversion||pending||detailControls.active||dock.active||!target)return false;
    if((!enabled||workspaceOpening)&&deferWorkspaceEntry(()=>setWorkflowStage(next)))return true;
    if(region==='ROOT'){region='SECTION';rootSectionBefore=null;}
    if(next==='SHAPE'&&directEditSession){discardDirectEditSession();refresh();}
    if(next==='CONTOUR')return editWholeContour();
    if(!setEditPart(next==='DETAIL'?'DETAIL':'SECTION'))return false;
    if(next==='SHAPE'){contourScope='BASE';wholeTool='POINT';sectionMode='PROFILE';if(isDirectTrunkForm(draft)){viewMode='FINAL';releaseViewPreview();}dock.closePresets();revealControls('section');}
    updateFormUi();drawHandles();status();return true;
  }
  panel.querySelectorAll('[data-trunk-stage]').forEach(b=>b.onclick=()=>setWorkflowStage(b.dataset.trunkStage));
  function coveredSection(){const s=section();if(!s||!isDirectTrunkForm(draft))return null;const last=draft.sections.filter(other=>Math.abs(other.t-s.t)<1e-10).at(-1);return last?.id!==s.id?last:null;}
  function overlapHint(){return coveredSection()?'当前截面与后面的截面重叠，最后项生效；按 G 滑开位置后，再编辑轮廓、扭转或粗细。':'';}
  const fields={trunkGrooveDepth:['groove_depth'],trunkGrooveCount:['groove_count'],trunkRootFlare:['root_flare'],trunkAsymmetry:['asymmetry'],trunkHeightStart:['height_start',.01],trunkHeightEnd:['height_end',.01],
    trunkSectionT:['t',.01,'section'],trunkSectionRadius:['radius',1,'section'],trunkSectionOval:['oval',1,'section'],trunkSectionRoll:['roll',1,'section'],trunkSectionSpan:['span',.01,'section'],
    trunkButtressAngle:['angle',1,'buttress'],trunkButtressLength:['length',1,'buttress'],trunkButtressHeight:['height',.01,'buttress'],trunkButtressWidth:['width',1,'buttress']};
  const ranges=new Map([...panel.querySelectorAll('[data-trunk-range]')].map(e=>[e.dataset.trunkRange,e]));
  const subpanels=[...panel.querySelectorAll('[data-trunk-subpanel]')];
  function revealControls(kind){subpanels.forEach(p=>p.open=p.dataset.trunkSubpanel===kind);}
  subpanels.forEach(p=>p.addEventListener('toggle',()=>{if(p.open)subpanels.filter(other=>other!==p).forEach(other=>other.open=false);}));
  let indexedGroup=null,indexedBranches=null,carrierBranches=[],carrierMeshes=new Map();
  function syncCarrierIndex(){const asset=api.getAsset();if(indexedBranches!==asset?.masterBranches){indexedBranches=asset?.masterBranches;carrierBranches=skeletonBranches(indexedBranches||[]);}if(indexedGroup!==asset?.group){indexedGroup=asset?.group;carrierMeshes=new Map();indexedGroup?.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&o.userData.category==='branch'&&!carrierMeshes.has(o.userData.stable_id))carrierMeshes.set(o.userData.stable_id,o);});}}
  function carrier(){syncCarrierIndex();const id=api.getSelection();return carrierBranches.find(b=>b.stableId===id&&(!b.copySnapshot||b.prefabCarrier)&&!b.localBundle)||null;}
  function meshFor(id){syncCarrierIndex();return carrierMeshes.get(id);}
  function usable(){return api.isTree()&&api.getTreeEditMode()==='BONE'&&target&&!conversion&&!api.isBusy?.()&&!api.getAuthoring().overrides[target.stableId]?.locked&&!api.getAsset()?.group.userData.pending_rebuild&&!pending&&!api.isEditing();}
  function clearGroup(group){const geometries=new Set(),materials=new Set();for(const obj of [...group.children]){obj.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const material of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(material);});group.remove(obj);}geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
  function releasePreview(){previewQueue.cancel();releaseHandlePreview();if(frame!==null)cancelAnimationFrame(frame);frame=null;if(overlay){overlay.mesh.visible=overlay.visible;overlay.object.geometry.dispose();previewRoot.remove(overlay.object);overlay=null;}}
  function releaseHandlePreview(){handlePreview?.dispose();handlePreview=null;handlePreviewKey='';}
  function handleTs(){return [0,1,...(draft.sections||[]).flatMap(s=>[s.t,Math.max(0,s.t-.025),Math.min(1,s.t+.025)]),...(draft.buttresses||[]).map(rootEndT)];}
  function liveHandlePreview(){
    if(!target||!draft||editPart!=='SECTION'||!isDirectTrunkForm(draft)||target.legacyRigidGeometry||meshFor(target.stableId)?.geometry.userData.sweepStripRelaxed||!(gesture||drag||conversion))return null;
    const key=JSON.stringify([draft,viewMode,api.getSettings()]);if(key!==handlePreviewKey){releaseHandlePreview();handlePreview=createTrunkFormPreviewGeometry(target,api.getSettings(),draft,api.getSettings().preview_lod,{view:viewMode,vertexLimit:48000,handleTs:handleTs()});handlePreviewKey=key;}
    return handlePreview;
  }
  function releaseViewPreview(){if(viewOverlay){viewOverlay.mesh.visible=viewOverlay.visible;viewOverlay.object.geometry.dispose();previewRoot.remove(viewOverlay.object);viewOverlay=null;}}
  function releaseBaseGeometry(){baseGeometry?.dispose();baseGeometry=null;baseGeometryKey='';sizeGeometry=null;sizeTransform='';sizeMetric=null;}
  function baseKey(){return target?JSON.stringify([target.stableId,meshFor(target.stableId)?.geometry.uuid,isDirectTrunkForm(draft)?getBaseTrunkForm(draft):draft,api.getSettings().preview_lod]):'';}
  function handleGeometry(){
    const live=liveHandlePreview();if(live)return live;
    if(conversion?.original)return meshFor(target?.stableId)?.geometry;
    if(viewMode==='FINAL'&&enabled&&editPart==='SECTION'&&isDirectTrunkForm(draft))return finalGeometry();
    return baseHandleGeometry();
  }
  function baseHandleGeometry(){
    if(!isDirectTrunkForm(draft))return (overlay?.object||meshFor(target?.stableId))?.geometry;
    if(overlay?.view==='BASE')return overlay.object.geometry;
    if(viewOverlay?.key===baseKey())return viewOverlay.object.geometry;
    const key=baseKey();if(baseGeometryKey!==key){releaseBaseGeometry();baseGeometry=createTrunkFormPreviewGeometry(target,api.getSettings(),draft,api.getSettings().preview_lod,{view:'BASE'});baseGeometryKey=key;}
    return baseGeometry;
  }
  function detailSizeMetric(){
    if(!target||!draft||!isDirectTrunkForm(draft))return null;
    const geometry=baseHandleGeometry(),mesh=meshFor(target.stableId);if(!geometry||!mesh)return null;
    mesh.updateWorldMatrix(true,false);const transform=mesh.matrixWorld.elements.join(',');
    if(sizeGeometry!==geometry||sizeTransform!==transform){sizeGeometry=geometry;sizeTransform=transform;sizeMetric=createTrunkDetailSizeMetric(geometry,mesh.matrixWorld);}
    return sizeMetric;
  }
  function previewObject(mesh,geometry){const object=new THREE.Mesh(geometry,mesh.material);object.castShadow=mesh.castShadow;object.receiveShadow=mesh.receiveShadow;object.matrix.copy(mesh.matrix);object.matrixAutoUpdate=false;object.userData.trunk_form_preview_target=target.stableId;previewRoot.add(object);const entry={mesh,object,visible:mesh.visible};mesh.visible=false;return entry;}
  function syncViewPreview(){
    if(!enabled||!target||!draft||!isDirectTrunkForm(draft)||viewMode!=='BASE'&&!directEditSession||overlay||conversion){releaseViewPreview();return;}
    if(pending||api.isBusy?.()||api.getAsset()?.group.userData.pending_rebuild)return;
    const mesh=meshFor(target.stableId),view=viewMode,key=baseKey()+(directEditSession?'|EDIT|'+view+'|'+JSON.stringify(draft):'');if(!mesh)return;
    if(viewOverlay?.mesh===mesh&&viewOverlay.key===key)return;
    releaseViewPreview();viewOverlay={...previewObject(mesh,createTrunkFormPreviewGeometry(target,api.getSettings(),draft,api.getSettings().preview_lod,{view,vertexLimit:48000})),key};viewOverlay.object.userData.trunk_form_preview_view=view;viewOverlay.object.userData.trunk_form_preview_readonly=true;refreshTransform();
  }
  function setView(next){if(!['BASE','FINAL'].includes(next)||!enabled||!isDirectTrunkForm(draft)||pending||api.isBusy?.()||api.getAsset()?.group.userData.pending_rebuild)return false;if(drag||placement||detailControls.active||gesture&&!conversion){status('先确认或取消当前调节，再切换查看方式');return false;}if(next==='BASE')contourScope='BASE';viewMode=next;if(conversion){queuePreview();}else{releasePreview();syncViewPreview();drawHandles();}updateFormUi();status();return true;}
  function setContourScope(next){
    if(rangeOpen){if(gesture?.range)return false;closeRange();}
    if(!['BASE','FINAL'].includes(next)||!enabled||gesture||drag||placement||pending||!usable())return false;
    if(next==='FINAL'&&!isDirectTrunkForm(draft)&&!startDirectEditSession())return false;
    contourScope=next;wholeTool='POINT';editPart='SECTION';sectionMode='PROFILE';revealControls('section');if(next==='FINAL'){wholeWorldPoints=true;viewMode='FINAL';}dock.closePresets();syncViewPreview();drawHandles();updateFormUi();status();return true;
  }
  function editWholeContour(){if((!enabled||workspaceOpening)&&deferWorkspaceEntry(editWholeContour))return false;if(!enabled||!setEditPart('SECTION')||!setContourScope('FINAL'))return false;if(!section())return beginPlacement();return true;}
  $('trunkFinalContourEdit').onclick=editWholeContour;
  function refreshTransform(){const asset=api.getAsset();if(asset){asset.group.updateMatrix();previewRoot.matrix.copy(asset.group.matrix);handles.matrix.copy(asset.group.matrix);previewRoot.matrixAutoUpdate=handles.matrixAutoUpdate=false;}}
  function installPreviewGeometry(geometry,mesh,view){
    if(!overlay){releaseViewPreview();overlay={...previewObject(mesh,geometry),view};}
    else {overlay.object.geometry.dispose();overlay.object.geometry=geometry;}
    overlay.view=view;syncConversionComparison();
    overlay.object.userData.trunk_form_preview_view=view;overlay.object.userData.trunk_form_preview_readonly=false;
    refreshTransform();drawHandles();
  }
  function preview(submit=true){frame=null;if(!target||!draft)return;const mesh=meshFor(target.stableId);if(!mesh)return;
    const view=isDirectTrunkForm(draft)?viewMode:'FINAL';
    liveHandlePreview();drawHandles();
    if(submit!==false)previewQueue.request(createTrunkFormPreviewJob(target,api.getSettings(),draft,api.getSettings().preview_lod,{view,vertexLimit:48000}),{id:target.stableId,asset:api.getAsset(),mesh,view});
  }
  function syncConversionComparison(){if(!conversion||!overlay)return;overlay.object.visible=!conversion.original;overlay.mesh.visible=conversion.original?overlay.visible:false;}
  function setConversionComparison(original){if(!conversion)return false;conversion.original=Boolean(original);syncConversionComparison();drawHandles();status();return true;}
  function queuePreview(){if(frame===null)frame=requestAnimationFrame(preview);}
  function begin(label='修改本枝主干形体',allowRange=false){if(rangeOpen&&!allowRange)return false;if(gesture)return !gesture.preset;if(!usable())return false;gesture={id:target.stableId,label,before:JSON.stringify(current()),beforeSectionId:sectionId,beforeSectionMode:sectionMode,beforeSelectionScope:selectionScope,beforeRingSelection:ringSelection(),beforeRegion:region,beforeRootSelection:[...selectedRootIds],beforeRootPrimary:buttressId,beforeRootBase:rootBaseFocused,editBefore:directEditSession||rootBaseSession?JSON.stringify(normalizeTrunkForm(draft)):null};controlEnabled=api.controls.enabled;draft=structuredClone(directEditSession||rootBaseSession?draft:current()||neutral());return true;}
  function rangeState(){return {...trunkSectionRange(draft?.sections,rangeSelection,rangeOptions),open:rangeOpen,selection:{...rangeSelection},options:{...rangeOptions},revision:rangeRevision,preview:Boolean(gesture?.range),changed:rangeResult.changed,limited:rangeResult.limited};}
  function resetRangeValues(){rangeResult={changed:[],limited:[]};rangeOptions={...rangeOptions,radiusPercent:0,twist:0};rangeRevision++;}
  function resetRange(){rangeOpen=false;rangeSelection={startId:'',endId:''};rangeOptions={...TRUNK_RANGE_DEFAULTS};rangeResult={changed:[],limited:[]};rangeRevision++;if(rangeViewBefore!==null)viewMode=rangeViewBefore;rangeViewBefore=null;}
  function openRange(){if(rangeOpen)return true;if(!enabled||editPart!=='SECTION'||!usable()||!isDirectTrunkForm(draft)||gesture||drag||placement||conversion||pending||dock.active)return false;dock.closePresets();rangeOpen=true;rangeViewBefore=viewMode;viewMode='FINAL';releaseViewPreview();resetRangeValues();drawHandles();status('先选择区段起止圈，再预览整圈粗细与扭转');return true;}
  function closeRange(){if(gesture||drag||pending)return false;rangeOpen=false;if(rangeViewBefore!==null)viewMode=rangeViewBefore;rangeViewBefore=null;resetRangeValues();syncViewPreview();drawHandles();status();return true;}
  function selectRange(patch){if(!rangeOpen||gesture||drag||pending||!usable())return false;for(const key of ['startId','endId'])if(typeof patch[key]==='string')rangeSelection[key]=patch[key];rangeResult={changed:[],limited:[]};drawHandles();return true;}
  function editRange(patch){
    if(!rangeOpen||!usable()||drag||placement||conversion||pending||gesture&&!gesture.range)return false;
    const options={...rangeOptions,...patch},source=gesture?.range?.source||draft,result=applyTrunkSectionRange(source,rangeSelection,options);rangeOptions=options;rangeResult={changed:result.changed,limited:result.limited};
    if(!result.valid){drawHandles();return false;}
    if(!gesture&&!result.changed.length){drawHandles();return true;}
    if(!gesture){if(!begin('调整区段粗细与扭转',true))return false;gesture.range={source:structuredClone(source)};}
    gesture.range.changed=result.changed;gesture.range.limited=result.limited;draft=result.form;loadFields();queuePreview();status('区段预览 · Enter / 树上左键确认，Esc / 树上右键取消');return true;
  }
  function rotationDelta(from,to){return Math.atan2(Math.sin((to-from)*Math.PI/180),Math.cos((to-from)*Math.PI/180))*180/Math.PI;}
  function sectionRoll(s){if(!s)return 0;if(isDirectTrunkForm(draft))return s.roll;const angle=trunkFormSectionAt(draft,s.t).roll;return rotationDelta(0,angle);}
  function uiSection(){const s=section();return s?{...s,roll:sectionRoll(s)}:null;}
  function clearCapture(s){if(s){delete s.contour_capture;delete s.capture_error;}}
  function read(id){const input=$(id),[key,factor=1,kind]=fields[id];if(input.value===''||!input.checkValidity())return false;const obj=kind==='section'?section():kind==='buttress'?buttress():draft;if(!obj)return false;const value=Number(input.value)*factor;if(kind==='section'&&key==='roll'&&!isDirectTrunkForm(draft)){const offset=(obj.roll_offset||0)+rotationDelta(sectionRoll(obj),value);if(Math.abs(offset)<1e-10)delete obj.roll_offset;else obj.roll_offset=Math.max(-3600,Math.min(3600,offset));ranges.get(id).value=input.value;return true;}if(kind==='section'&&key!=='t'&&key!=='span'&&obj[key]!==value)clearCapture(obj);obj[key]=value;ranges.get(id).value=input.value;return true;}
  function valid(){return pointInputValid()&&meshControls.valid()&&dock.valid()&&Object.keys(fields).every(id=>$(id).disabled||$(id).value!==''&&$(id).checkValidity());}
  function commit(){if(conversion){status('请先确认直接截面试用，或取消恢复旧版');return false;}if(!gesture)return true;if(!valid()){status('请修正无效数值，或按 Esc 取消');return false;}
    if(captureBlockMessage()){status(captureBlockMessage());return false;}
    if(placement&&!placement.valid){status('请将鼠标移到当前本枝表面再放置，或按 Esc 取消');return false;}
    if(drag&&unchangedDrag()){cancel();return true;}
    if(drag||placement){api.controls.enabled=controlEnabled;dock.cancel();}
    endPlacement();
    const rangeGesture=Boolean(gesture.range);if(rangeGesture)resetRangeValues();const id=gesture.id,label=gesture.label,preset=gesture.preset?.record,rootPreset=gesture.rootPreset?.record,candidate=normalizeTrunkForm(draft),form=omitUnchangedTrunkRootBase(candidate,rootBaseSession?.section),same=gesture.before===JSON.stringify(form)||gesture.editBefore===JSON.stringify(candidate);if((gesture.sectionField==='t'||gesture.ringSlide)&&gesture.beforeSectionMode&&!coveredSection())sectionMode=gesture.beforeSectionMode;gesture=null;drag=null;
    if(same){releasePreview();refresh();if(preset)dock.presetConfirmed?.(preset);if(rootPreset)dock.rootPresetConfirmed?.(rootPreset);return true;}
    if(frame!==null){cancelAnimationFrame(frame);frame=null;preview(false);}
    previewQueue.cancel();releaseHandlePreview();
    if(rootBaseFocused&&!isTrunkRootBase(candidate.sections.find(s=>s.id===sectionId))){rootBaseFocused=false;rootBaseSession=null;}
    pending={id,stamp:JSON.stringify(form),asset:api.getAsset()};
    try{const changed=api.transact(label,a=>{const forms=normalizeTrunkForms(a.workbench.trunk_forms);forms.branches[id]=form;a.workbench={...a.workbench,trunk_forms:forms};},{bypassLayers:true,deferControls:true});if(changed===false){pending=null;releasePreview();stamp='';}else if(directEditSession){discardDirectEditSession();}refresh();if(rootBaseSession&&trunkRootBaseSection(current()))rootBaseSession=null;if(preset&&changed!==false)dock.presetConfirmed?.(preset);if(rootPreset&&changed!==false)dock.rootPresetConfirmed?.(rootPreset);return true;}
    catch(e){pending=null;releasePreview();stamp='';api.toast(e.message,true);refresh();return false;}
  }
  function cancel(){if(gesture?.range)resetRangeValues();cancelWorldBox();pointCursor.hide();dock?.cancel();detailControls?.externalCancel();if(!gesture&&!drag&&!placement&&!conversion){if(pending){pending=null;releasePreview();stamp='';}return false;}if(gesture){rootBaseFocused=Boolean(gesture.beforeRootBase);region=gesture.beforeRegion||'SECTION';selectedRootIds=new Set(gesture.beforeRootSelection||[]);buttressId=gesture.beforeRootPrimary||'';sectionId=gesture.beforeSectionId;sectionMode=gesture.beforeSectionMode;selectionScope=gesture.beforeSelectionScope;selectedRingIds=new Set(gesture.beforeRingSelection);if(gesture.preset){const p=gesture.preset;contourScope=p.scope;viewMode=p.view;sectionMode=p.mode;selectedKnotId=p.point;selectedKnotIds=new Set(p.points);}}if(gesture?.contourPaste){selectedKnotId=gesture.contourPaste.primary;selectedKnotIds=new Set(gesture.contourPaste.ids);}if(drag?.kind==='PROFILE')wholeDensityKey=drag.beforeDensityKey;if(conversion){viewMode=conversion.beforeView;const p=conversion.beforePoints;if(p){selectedKnotId=p.primary;selectedKnotIds=new Set(p.ids);selectedKnotKey=p.key;wholeDensityKey=p.density;}}conversion=null;gesture=null;drag=null;endPlacement();if(api.controls)api.controls.enabled=controlEnabled;releasePreview();stamp='';refresh();status('已取消本次形体调节');return true;}
  function captureWarning(){const error=section()?.contour_capture?.relative_error;return isDirectTrunkForm(draft)&&error>.01?`截面捕获最大径向误差 ${(error*100).toFixed(1)}% · 请检查轮廓；可取消或拖蓝点微调`:'';}
  function captureBlockMessage(){const s=gesture?.captureId&&draft?.sections.find(item=>item.id===gesture.captureId),error=Math.max(s?.contour_capture?.relative_error||0,s?.capture_error?.relative_error||0);if(!s||!isDirectTrunkForm(draft)||!(error>.01))return '';return `当前位置捕获误差 ${(error*100).toFixed(1)}% 超过 1%，暂不能确认；${placement?'请换一个放置位置，或按 Esc 取消。':'请按 Esc 取消，换位置重新添加；也可拖蓝点修正轮廓。'}`;}
  function status(text){$('trunkFormStatus').textContent=text||(pending?'正在确认本枝形体…':conversion?TRUNK_WORKFLOW_LABELS[displayWorkflowStage()]+'准备 · Q 对照原形 · Enter 确认 / Esc 取消':placement?placementHint():drag?.keyboard?quickHint():region==='ROOT'?'辅助生成参数 · 仅所选项，拖标签 / 数值调整':captureBlockMessage()||(gesture?'实时预览 · 松手确认，Esc 取消':overlapHint()||captureWarning()||(target?isDirectTrunkForm(draft)?contourScope==='FINAL'?'子点精修 · 修局部凹凸，保留主点；松手确认，Esc 取消':'主点塑形 · 调一圈的大体起伏，带动子点；松手确认，Esc 取消':'旧版叠加 · 工程保持原样，可先试用直接截面':'')));}
  function loadFields(){
    const list=(select,items,active,label)=>{select.replaceChildren(...items.map((item,i)=>{const o=document.createElement('option');o.value=item.id;o.textContent=label(item,i);return o;}));select.value=active;if(!items.length){const o=document.createElement('option');o.textContent='尚未添加';select.add(o);select.disabled=true;}else select.disabled=false;};
    if(!draft)return;
    if(!draft.sections.some(s=>s.id===sectionId))sectionId=draft.sections[0]?.id||'';
    if(coveredSection()&&sectionMode!=='SLIDE')sectionMode='SLIDE';
    else if(gesture?.ringSlide&&gesture.beforeSectionMode&&!coveredSection())sectionMode=gesture.beforeSectionMode;
    if(!draft.buttresses.some(b=>b.id===buttressId))buttressId=draft.buttresses[0]?.id||'';
    list($('trunkSectionSelect'),draft.sections,sectionId,(s,i)=>`截面 ${i+1} · ${Math.round(s.t*100)}%${isDirectTrunkForm(draft)&&draft.sections.some((other,j)=>j>i&&Math.abs(other.t-s.t)<1e-10)?' · 重叠未生效':''}`);
    list($('trunkButtressSelect'),draft.buttresses,buttressId,(b,i)=>`板根 ${i+1} · ${Math.round(b.angle)}°`);
    for(const[id,[key,factor=1,kind]]of Object.entries(fields)){const obj=kind==='section'?section():kind==='buttress'?buttress():draft;const input=$(id),range=ranges.get(id);input.disabled=range.disabled=rangeOpen||!obj||!target||Boolean(api.getAuthoring().overrides[target.stableId]?.locked)||Boolean(pending)||Boolean(gesture?.preset)||Boolean(placement||drag?.created||conversion)||kind==='section'&&key!=='t'&&Boolean(coveredSection())||id==='trunkSectionSpan'&&isDirectTrunkForm(draft);if(obj){input.value=Number(((kind==='section'&&key==='roll'?sectionRoll(obj):obj[key])/factor).toFixed(4));range.value=input.value;}}
    $('trunkSectionRemove').disabled=!section()||!usable()||Boolean(rootBaseSession&&sectionId===rootBaseSession.section.id);$('trunkButtressRemove').disabled=!buttress()||!usable();updateFormUi();dock.update();
  }
  function updateFormUi(){
    workspaceLayout.update({enabled:enabled&&!panel.hidden,target:target?.stableId,stage:region==='ROOT'?'板根生成参数':TRUNK_WORKFLOW_LABELS[displayWorkflowStage()],region,roots:draft?.buttresses?.length||0,rootSelected:rootSelection().length,sections:draft?.sections.length||0,details:draft?.details?.length||0});
    const direct=isDirectTrunkForm(draft),legacy=Boolean(current()&&!isDirectTrunkForm(current()));
    panel.dataset.trunkRecipe=direct?'DIRECT':'LEGACY';panel.dataset.trunkRegion=region;
    $('trunkFormKind').textContent=conversion?'直接截面 · 试用预览':direct?'直接截面 · 主点 / 子点':'旧版叠加 · 工程保持';
    $('trunkFormKindHint').textContent=conversion?'重新按相邻截面过渡；效果可能变化，确认后才写入工程。':direct&&contourScope==='FINAL'?'子点精修当前一圈的实际凹凸，主点和独立细节配方保留。':direct?'主点与子点共同控制同一截面；主点带动子点，子点保留局部细形。':'继续按原算法编辑。开始直接截面前会先预览，不自动转换旧工程。';
    $('trunkDirectStart').hidden=!legacy||Boolean(conversion||directEditSession);$('trunkDirectStart').disabled=!usable();
    $('trunkLegacyRestore').hidden=!direct||!draft?.legacy_form||Boolean(conversion||directEditSession);$('trunkLegacyRestore').disabled=!usable();
    $('trunkDirectPreview').hidden=!conversion;
    panel.querySelectorAll('[data-trunk-view]').forEach(b=>{b.disabled=!enabled||!direct||Boolean(pending)||Boolean((gesture||drag||placement)&&!conversion);b.classList.toggle('active',b.dataset.trunkView===(direct?viewMode:'FINAL'));b.setAttribute('aria-pressed',String(b.dataset.trunkView===(direct?viewMode:'FINAL')));});
    $('trunkSectionSpan').closest('label').hidden=direct;
    $('trunkSectionInterpolationHint').textContent=direct?'相邻截面连续过渡，首尾衔接基础轮廓；位置移动会改变邻接过渡，没有叠乘范围。':'旧版：截面在过渡范围内叠加，重叠时共同改变结果。';
    $('trunkFormPresetHint').textContent=direct?(viewMode==='BASE'?'当前大轮廓查看暂不显示这些效果；切「最终效果」查看。':'细节预设保留已有大轮廓。')+'恢复本枝原形会清除本枝全部形体。':'旧版预设替换本枝截面与板根配置。';
    panel.querySelectorAll('[data-trunk-part]').forEach(b=>{b.classList.toggle('active',b.dataset.trunkPart===editPart);b.setAttribute('aria-pressed',String(b.dataset.trunkPart===editPart));b.disabled=!target||Boolean(pending)||Boolean(conversion)||Boolean(drag||placement||detailControls.active);});
    $('trunkHeightStart').closest('label').querySelector('span').textContent=direct?'细节起点（%）':'形体起点（%）';$('trunkHeightEnd').closest('label').querySelector('span').textContent=direct?'细节终点（%）':'形体终点（%）';
    $('trunkFinalContourEdit').disabled=!target||Boolean(gesture||pending||conversion||drag||placement||detailControls.active)||!usable();
    $('trunkFormHandles').disabled=Boolean(gesture||pending||conversion||drag||placement||detailControls.active||api.isBusy?.());
    const stage=displayWorkflowStage();updateTrunkWorkflow(panel,{stage,disabled:!target||Boolean(gesture||pending||conversion||drag||placement||detailControls.active)||Boolean(target&&api.getAuthoring().overrides[target.stableId]?.locked)});
    panel.querySelector('[data-trunk-subpanel="section"] summary').textContent=enabled?(direct?'当前整圈 · 椭圆比例':'当前截面 · 椭圆 / 过渡范围'):stage==='CONTOUR'?'当前截面 · 精确参数':'截面位置与粗细';
    panel.querySelectorAll('[data-trunk-subpanel]').forEach(p=>p.hidden=p.dataset.trunkSubpanel==='detail-library'||stage==='DETAIL'||stage==='CONTOUR'&&p.dataset.trunkSubpanel!=='section');
    $('trunkDetailWorkspaceNotice').hidden=stage!=='DETAIL';$('trunkFinalContourEdit').hidden=stage!=='SHAPE';
    if(conversion)panel.querySelectorAll('[data-trunk-stage]').forEach(b=>b.disabled=!['SHAPE',stage].includes(b.dataset.trunkStage));
    $('trunkWorkflowGuide').textContent=conversion?'正在准备'+TRUNK_WORKFLOW_LABELS[stage]+'；Q 对照原形，确认后才进入编辑，Esc 取消。':stage==='DETAIL'?`③ ${TRUNK_WORKFLOW_LABELS.DETAIL} · 在本枝表面独立添加或编辑沟、脊、瘤、疤，并保存预设。`:stage==='CONTOUR'?`② ${TRUNK_WORKFLOW_LABELS.CONTOUR} · 密集子点精修局部凹凸，主点保留；可加点、删点、框选与 G 移动。`:`① ${TRUNK_WORKFLOW_LABELS.SHAPE} · 默认 10 个主点控制一圈的大体起伏，带动子点；可加点、删点、框选与 G 移动。`;
  }
  function beginConversion(){
    if((!enabled||workspaceOpening)&&deferWorkspaceEntry(beginConversion))return false;if(!usable()||gesture||drag||placement||conversion||!current()||isDirectTrunkForm(current()))return false;
    dock.closePresets();profilePointState();const beforePoints={ids:[...selectedKnotIds],primary:selectedKnotId,key:selectedKnotKey,density:wholeDensityKey};if(!begin())return false;
    conversion={beforeView:viewMode,beforePoints,original:false};draft=createDirectTrunkForm(current());viewMode='FINAL';hoverSectionId=hoverKnotId='';
    loadFields();queuePreview();status();return true;
  }
  function confirmConversion(){
    if(!conversion)return false;if(conversion.original){status('当前正在对照原形；请先切回升级预览，再确认进入编辑');api.toast('请先切回升级预览再确认');return false;}
    const trial=conversion,{nextPart,nextContour}=trial;conversion=null;loadFields();const success=commit();
    if(!success){conversion=trial;if(!gesture)cancel();else{loadFields();drawHandles();}return false;}
    if(nextPart==='DETAIL'){editPart='DETAIL';viewMode='FINAL';releaseViewPreview();revealControls('detail-library');}
    if(nextContour==='FINAL'){selectionScope='POINTS';selectedRingIds.clear();selectedKnotId=selectedKnotKey='';selectedKnotIds.clear();contourScope='FINAL';wholeWorldPoints=true;wholeTool='POINT';editPart='SECTION';sectionMode='PROFILE';viewMode='FINAL';releaseViewPreview();}
    updateFormUi();drawHandles();api.onTrunkFormModeChanged?.();return true;
  }
  $('trunkDirectStart').onclick=beginConversion;$('trunkDirectConfirm').onclick=confirmConversion;$('trunkDirectCancel').onclick=cancel;
  $('trunkLegacyRestore').onclick=()=>{if(!usable()||!draft?.legacy_form)return;const saved=structuredClone(draft.legacy_form);mutate('恢复旧版形体',()=>{draft=saved;sectionId='';buttressId='';});};
  panel.querySelectorAll('[data-trunk-view]').forEach(b=>b.onclick=()=>setView(b.dataset.trunkView));
  for(const[id]of Object.entries(fields)){const input=$(id),range=ranges.get(id);input.addEventListener('input',()=>{if(!begin())return;if(read(id)){queuePreview();status();}});input.addEventListener('change',commit);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(commit())input.blur();}});range.addEventListener('input',()=>{if(!begin())return;input.value=range.value;read(id);queuePreview();status();});range.addEventListener('change',commit);range.addEventListener('pointercancel',cancel);}
  createTrunkNumberDrag({inputs:Object.keys(fields).map($),canStart:()=>usable()&&!gesture&&!drag&&!placement&&!detailControls.active,
    step:input=>Number(ranges.get(input.id).step)/8,integer:input=>input.id==='trunkGrooveCount',cancel});
  function mutate(label,fn){if(!begin(label))return false;fn(draft);draft=normalizeTrunkForm(draft);loadFields();queuePreview();return commit();}
  function applySectionPreset(shape){
    if(coveredSection()){status(overlapHint());api.toast(overlapHint());return false;}
    if(shape.geometry_version===2&&!isDirectTrunkForm(draft)){const message='这是直接截面预设；请先试用并确认「开始直接截面」，再套用。';status(message);api.toast(message);return false;}
    const whole=shape.profile_scope==='FINAL'&&section()?applyWholeTrunkContour(draft,section(),shape,api.getSettings()):null;
    if(whole?.relative_error>.01){status('整圈预设在这里的拟合误差超过 1%，请换位置或减少叠加细节。');api.toast('整圈轮廓拟合误差 '+(whole.relative_error*100).toFixed(2)+'%');return false;}
    if(whole){contourScope='FINAL';viewMode='FINAL';sectionMode='PROFILE';releaseViewPreview();}
    return mutate('套用截面预设',()=>{const s=section();if(!s)return;Object.assign(s,{radius:shape.radius,oval:shape.oval,roll:shape.roll});delete s.roll_offset;if(whole)s.profile=whole.profile;else if(shape.profile)s.profile=structuredClone(shape.profile);else delete s.profile;if(whole?.profile_coarse||shape.profile_coarse)s.profile_coarse=structuredClone(whole?.profile_coarse||shape.profile_coarse);else delete s.profile_coarse;delete s.profile_exclusions;if(shape.profile_exclusions)s.profile_exclusions=structuredClone(shape.profile_exclusions);clearCapture(s);});
  }
  function previewSectionPreset(record){
    if(!usable()||drag||placement||conversion||detailControls.active||dock.active||gesture&&!gesture.preset||!section())return false;
    const source=gesture?.preset?.source||structuredClone(draft),s=source.sections.find(s=>s.id===sectionId),shape=record.shape;
    if(!s||source.sections.filter(p=>Math.abs(p.t-s.t)<1e-10).at(-1)?.id!==s.id||shape.geometry_version===2&&!isDirectTrunkForm(source))return false;
    const whole=shape.profile_scope==='FINAL'?applyWholeTrunkContour(source,s,shape,api.getSettings()):null;
    if(whole?.relative_error>.01){status('整圈预设在这里的拟合误差超过 1%，请换位置或减少叠加细节。');return false;}
    if(!gesture){const before={source,scope:contourScope,view:viewMode,mode:sectionMode,point:selectedKnotId,points:[...selectedKnotIds]};if(!begin('套用截面预设'))return false;gesture.preset=before;}
    gesture.preset.record={id:record.id,name:record.name};
    draft=structuredClone(source);const targetSection=section();Object.assign(targetSection,{radius:shape.radius,oval:shape.oval,roll:shape.roll});delete targetSection.roll_offset;
    if(whole)targetSection.profile=whole.profile;else if(shape.profile)targetSection.profile=structuredClone(shape.profile);else delete targetSection.profile;
    if(whole?.profile_coarse||shape.profile_coarse)targetSection.profile_coarse=structuredClone(whole?.profile_coarse||shape.profile_coarse);else delete targetSection.profile_coarse;
    delete targetSection.profile_exclusions;if(shape.profile_exclusions)targetSection.profile_exclusions=structuredClone(shape.profile_exclusions);clearCapture(targetSection);contourScope=whole?'FINAL':'BASE';viewMode='FINAL';sectionMode='PROFILE';releaseViewPreview();
    loadFields();queuePreview();status('试用「'+record.name+'」 · Enter 确认 / Esc 取消');return true;
  }
  function wholeSectionPreset(){const result=captureWholeTrunkContour(draft,section(),api.getSettings(),childCurveOptions());if(result.relative_error>.01)throw Error('整圈捕获误差 '+(result.relative_error*100).toFixed(2)+'% 超过 1%，请换位置或减少叠加细节。');return result.shape;}
  panel.querySelectorAll('[data-trunk-preset]').forEach(b=>b.onclick=()=>{revealControls(b.dataset.trunkPreset==='BUTTRESS'?'buttress':'details');mutate('形体预设',()=>{const preset=createTrunkFormPreset(b.dataset.trunkPreset);if(isDirectTrunkForm(draft)){for(const key of ['preset','groove_depth','groove_count','root_flare','asymmetry','height_start','height_end','buttresses'])draft[key]=structuredClone(preset[key]);buttressId='';}else{const mesh=draft.mesh;draft=preset;if(mesh)draft.mesh=mesh;sectionId='';buttressId='';}});});
  $('trunkFormReset').onclick=()=>{if(!usable())return;cancel();const id=target.stableId;api.transact('恢复本枝原形',a=>{const forms=normalizeTrunkForms(a.workbench.trunk_forms);delete forms.branches[id];if(Object.keys(forms.branches).length)a.workbench={...a.workbench,trunk_forms:forms};else delete a.workbench.trunk_forms;},{bypassLayers:true,deferControls:true});};
  function directSamplerOptions(){const settings=api.getSettings();return {settings,carrierSurfaceAt:(t,a)=>trunkSectionEllipseRadius((settings.cross_section==='OVAL'?settings.oval_ratio:1)*sectionAt(target?.sections,t).oval,a)};}
  function previewLoft(){
    if(!enabled||editPart!=='SECTION'||!usable()||!isDirectTrunkForm(draft)||gesture||drag||placement||conversion||pending||rangeOpen||dock.active)return false;
    const smooth=draft.loft_interpolation!=='SMOOTH';if(!begin(smooth?'平顺层间过渡':'恢复直线层间过渡'))return false;
    gesture.loft=true;if(smooth)draft.loft_interpolation='SMOOTH';else delete draft.loft_interpolation;
    queuePreview();drawHandles();status('层间过渡试用 · 控制圈与选点保留 · Enter 确认 / Esc 取消');return true;
  }
  function capturedSection(source,t){return {t,radius:1,oval:1,roll:0,span:.18,...(isDirectTrunkForm(source)?structuredClone(sampleDirectTrunkSection(source,t,directSamplerOptions())):{})};}
  function addSection(t=.5){leaveRootBase();revealControls('section');mutate('添加局部截面',d=>{if(d.sections.length>=24)return;sectionId='SECTION_'+crypto.randomUUID();selectionScope='RING';selectedRingIds=new Set([sectionId]);d.sections.push({id:sectionId,...capturedSection(d,t)});gesture.captureId=sectionId;});}
  function placementHint(){if(!placement?.valid)return 'N 放置截面 · 鼠标移到当前本枝表面 · 左键放置 · 右键/Esc 取消';return captureBlockMessage()||`N 放置截面 · ${(section().t*100).toFixed(1)}%${draft.loft_interpolation==='SMOOTH'?' · 新圈参与相邻段平顺':''} · 左键/Enter 确认 · 右键/Esc 取消`;}
  function endPlacement(){if(!placement)return;api.canvas.style.cursor=placement.cursor;delete api.canvas.dataset.trunkPlacement;placement=null;}
  function surfacePosition(coords){
    const mesh=overlay?.object||viewOverlay?.object||meshFor(target?.stableId);if(!mesh)return null;
    const rect=api.canvas.getBoundingClientRect();if(coords.x<rect.left||coords.x>rect.right||coords.y<rect.top||coords.y>rect.bottom)return null;
    pointer.set((coords.x-rect.left)/rect.width*2-1,-(coords.y-rect.top)/rect.height*2+1);api.camera.updateMatrixWorld();ray.setFromCamera(pointer,api.camera);mesh.updateWorldMatrix(true,false);
    const hit=intersectTrunkSurface(mesh,ray);if(!hit)return null;
    // Do not place through a different structural branch in front of this one.
    if(placement?.occluders.some(o=>{o.updateWorldMatrix(true,false);const other=intersectTrunkSurface(o,ray);return other&&other.distance<hit.distance-1e-5;}))return null;
    return sectionPositionFromSurfaceHit(mesh.geometry.userData.radiusRings,hit,mesh);
  }
  function detailSurfacePosition(coords){
    const mesh=overlay?.object||viewOverlay?.object||meshFor(target?.stableId);if(!mesh)return null;
    const rect=api.canvas.getBoundingClientRect();if(coords.x<rect.left||coords.x>rect.right||coords.y<rect.top||coords.y>rect.bottom)return null;
    pointer.set((coords.x-rect.left)/rect.width*2-1,-(coords.y-rect.top)/rect.height*2+1);api.camera.updateMatrixWorld();ray.setFromCamera(pointer,api.camera);mesh.updateWorldMatrix(true,false);const hit=intersectTrunkSurface(mesh,ray);if(!hit)return null;
    syncCarrierIndex();for(const b of carrierBranches){const o=carrierMeshes.get(b.stableId);if(!o||!o.visible||b.stableId===target.stableId)continue;o.updateWorldMatrix(true,false);const other=intersectTrunkSurface(o,ray);if(other&&other.distance<hit.distance-1e-5)return null;}
    const t=sectionPositionFromSurfaceHit(mesh.geometry.userData.radiusRings,hit,mesh);if(t===null)return null;const ring=ringAt(t,mesh.geometry);if(!ring)return null;const local=hit.point.clone().applyMatrix4(mesh.matrixWorld.clone().invert()).sub(V(ring.center)),x=V(ring.rolledX||ring.x),y=V(ring.rolledY||ring.y);return {t,angle:wrap((Math.atan2(local.dot(y),local.dot(x))-(ring.angleOffset||0))*180/Math.PI)};
  }
  function detailSurfacePoint(t,angle){const geometry=finalGeometry(),ring=geometry&&ringAt(t,geometry);return ring?knotPosition(ring,radians(angle)+(ring.angleOffset||0),geometry):null;}
  function updatePlacement(coords){if(!placement)return;const t=surfacePosition(coords);placement.valid=t!==null;if(t!==null){if(isDirectTrunkForm(placement.source)){const index=draft.sections.findIndex(s=>s.id===placement.id);draft.sections[index]={id:placement.id,...capturedSection(placement.source,t)};}else section().t=t;}loadFields();drawHandles();status();}
  function beginPlacement(){
    if(!enabled||gesture||drag||placement||!usable())return false;
    leaveRootBase();if(draft.sections.length>=24){status('本枝最多添加 24 个截面');return false;}
    dock.closePresets();if(!begin())return false;
    const source=structuredClone(draft);sectionId='SECTION_'+crypto.randomUUID();selectionScope='RING';selectedRingIds=new Set([sectionId]);draft.sections.push({id:sectionId,...capturedSection(source,.5)});gesture.captureId=sectionId;sectionMode=contourScope==='FINAL'?'PROFILE':'SLIDE';revealControls('section');
    const carrierIds=new Set(skeletonBranches(api.getAsset()?.masterBranches||[]).map(b=>b.stableId)),occluders=[];
    api.getAsset()?.group.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&o.visible&&o.userData.category==='branch'&&o.userData.stable_id!==target.stableId&&carrierIds.has(o.userData.stable_id))occluders.push(o);});
    placement={id:sectionId,source,valid:false,cursor:api.canvas.style.cursor,occluders};api.controls.enabled=false;api.canvas.style.cursor='crosshair';api.canvas.dataset.trunkPlacement='ADD';api.canvas.focus({preventScroll:true});hoverSectionId=hoverKnotId='';
    if(lastPointer&&document.elementFromPoint(lastPointer.x,lastPointer.y)===api.canvas)updatePlacement(lastPointer);else{loadFields();drawHandles();status();}
    return true;
  }
  function duplicateSection(){
    if(!enabled||gesture||drag||placement||!usable()||!section())return false;
    if(draft.sections.length-(rootBaseSession?1:0)>=24){status('本枝最多添加 24 个截面');return false;}
    const source=structuredClone(section());leaveRootBase();dock.closePresets();if(!begin())return false;
    sectionId='SECTION_'+crypto.randomUUID();selectionScope='RING';selectedRingIds=new Set([sectionId]);draft.sections.push({...source,id:sectionId});hoverKnotId='';revealControls('section');loadFields();
    return beginQuickDrag('SLIDE',{created:true});
  }
  function removeSection(){
    if(!section()||!usable()||gesture||drag||placement||conversion||pending||dock.active)return false;
    const ids=selectionScope==='RING'?ringSelection():[sectionId],result=removeTrunkSections(draft.sections,ids,sectionId,{protectedIds:rootBaseSession?[rootBaseSession.section.id]:[]});
    if(!result.removed.length){status('根盘轮廓尚未写入工程；可直接删选中的点，未编辑的底圈无需删除');return false;}
    return mutate(result.removed.length>1?'删除所选 '+result.removed.length+' 个截面':'删除所选截面',d=>{
      const removed=new Set(result.removed);d.sections=d.sections.filter(s=>!removed.has(s.id));
      if(rootBaseSession)d.sections=omitUnchangedTrunkRootBase(d,rootBaseSession.section).sections;
      rootBaseFocused=false;rootBaseSession=null;sectionId=d.sections.some(s=>s.id===result.nextId)?result.nextId:d.sections[0]?.id||'';
      selectionScope='POINTS';selectedRingIds.clear();selectedKnotIds.clear();selectedKnotId=hoverKnotId=hoverSectionId='';selectedKnotKey=pointContextKey();wholeDensityKey='';rememberPointSelection();
    });
  }
  function ringSelection(){
    selectedRingIds=new Set(selectTrunkSections(draft?.sections||[],[],[...selectedRingIds]));
    if(selectionScope!=='RING')return [];
    if(!selectedRingIds.size&&draft?.sections.some(s=>s.id===sectionId))selectedRingIds.add(sectionId);
    return [...selectedRingIds];
  }
  function selectRingSection(id,{mode='REPLACE',keepGroup=false}={}){
    if(region!=='SECTION'&&!setRegion('SECTION'))return false;
    if(!draft?.sections.some(s=>s.id===id)||!usable()||gesture||drag||placement||conversion||pending||dock.active)return false;
    if(!isTrunkRootBase(draft.sections.find(s=>s.id===id)))leaveRootBase();else rootBaseFocused=true;
    const before=ringSelection(),ids=keepGroup&&before.includes(id)?before:selectTrunkSections(draft.sections,before,[id],mode);
    selectedRingIds=new Set(ids);selectionScope=ids.length?'RING':'POINTS';sectionId=ids.includes(id)?id:ids.at(-1)||sectionId;
    hoverKnotId='';if(!coveredSection())sectionMode='PROFILE';loadFields();drawHandles();status();return true;
  }
  function setSelectionScope(scope){
    if(scope==='RING')return selectRingSection(sectionId);
    if(!section()||!usable()||gesture||drag||placement||conversion||pending||dock.active)return false;
    selectionScope='POINTS';selectedRingIds.clear();hoverKnotId='';if(!coveredSection())sectionMode='PROFILE';
    drawHandles();status('点编辑 · 点击或框选点，再用 G / R / S');return true;
  }
  function setSectionMode(mode){if(region==='ROOT'&&!setRegion('SECTION'))return false;if(coveredSection()&&mode!=='SLIDE'){status(overlapHint());return false;}if(!commit())return false;sectionMode=mode;if(mode==='PROFILE'){selectionScope='POINTS';selectedRingIds.clear();}revealControls('section');drawHandles();return true;}
  function prepareBaseDraft(form){
    if(!form||!rootBaseFocused||region!=='SECTION'||editPart!=='SECTION')return form;
    const ready=prepareTrunkRootBase(form);if(ready.created)rootBaseSession={section:structuredClone(ready.section)};else if(trunkRootBaseSection(current()))rootBaseSession=null;
    sectionId=ready.section.id;return ready.form;
  }
  function leaveRootBase(){
    rootBaseFocused=false;if(rootBaseSession){draft=omitUnchangedTrunkRootBase(draft,rootBaseSession.section);rootBaseSession=null;}
  }
  function editRootBase(){
    if(!enabled||!usable()||gesture||drag||placement||conversion||pending||dock.active||detailControls.active)return false;
    if(region==='SECTION'&&editPart==='SECTION'&&rootBaseFocused&&isTrunkRootBase(section()))return true;
    if(region!=='SECTION'&&!setRegion('SECTION'))return false;rememberPointSelection();
    // Main controls on V1 remain V1. Child refinement uses the existing
    // read-only conversion path only when the user chooses the child layer.
    if(directEditSession){discardDirectEditSession();draft=structuredClone(current()||neutral());}
    region='SECTION';editPart='SECTION';rootBaseFocused=true;contourScope='BASE';sectionMode='PROFILE';selectionScope='POINTS';selectedRingIds.clear();wholeTool='POINT';wholeWorldPoints=true;viewMode='FINAL';
    try{draft=prepareBaseDraft(structuredClone(current()||neutral()));}catch(e){rootBaseFocused=false;rootBaseSession=null;api.toast(e.message,true);return false;}
    releaseViewPreview();releaseBaseGeometry();syncViewPreview();loadFields();drawHandles();status(rootBaseSession?'根盘轮廓 · 主点 / 子点同样编辑；首次实际修改才保存底圈':'根盘轮廓 · 点选或框选，再用 G / R / S');api.onTrunkFormModeChanged?.();return true;
  }
  function previewRootPlane(mode){
    if(!['FOLLOW','HORIZONTAL'].includes(mode)||!enabled||!usable()||!supportsHorizontalRootPlane(target)||region!=='SECTION'||!isTrunkRootBase(section())||drag||placement||conversion||pending||dock.active||gesture)return false;
    if((draft.root_plane||'FOLLOW')===mode)return true;
    if(!begin(mode==='HORIZONTAL'?'根盘调为水平':'根盘恢复随干方向'))return false;
    gesture.rootPlane={mode};if(mode==='HORIZONTAL')draft.root_plane=mode;else delete draft.root_plane;
    loadFields();queuePreview();status('根盘方向预览 · Enter 确认 / Esc 取消；基部中心不变，上方平顺接回树干');return true;
  }
  function drawRootBaseReference(){
    if(trunkRootBaseSection(draft))return;const geometry=handleGeometry(),r=ringAt(0,geometry);if(!r)return;
    Object.assign(line(ringData(r,geometry),0x87c9bf,true,2.5).userData,{kind:'root-base',action:'SELECT'});
    const h=createSectionProfileMarker(V(r.center),0x87c9bf,{radius:7,halo:2,pivot:true,renderOrder:127});Object.assign(h.userData,{kind:'root-base',action:'SELECT'});handles.add(h);
  }
  function rootSelection(){selectedRootIds=new Set(selectTrunkRoots(draft?.buttresses||[],[],[...selectedRootIds]));return [...selectedRootIds];}
  function rootState(){const ids=rootSelection();return {items:draft?.buttresses||[],selectedIds:ids,primaryId:ids.includes(buttressId)?buttressId:ids.at(-1)||'',field:gesture?.rootField,dragging:drag?.kind==='ROOT',creating:drag?.kind==='ROOT'&&drag.created,limited:drag?.rootLimited||gesture?.rootLimited,flare:draft?.root_flare||0,presetPreview:gesture?.rootPreset&&{...gesture.rootPreset.record,ids:gesture.rootPreset.ids}};}
  function rootStartT(){return draft?.height_start||0;}
  function rootEndT(b){return rootStartT()+Math.max(.001,(draft?.height_end??1)-rootStartT())*b.height;}
  function rootGeometry(){return isDirectTrunkForm(draft)?finalGeometry():handleGeometry();}
  function setRegion(next){
    if(!['SECTION','ROOT'].includes(next)||!enabled||!usable()||gesture||drag||placement||conversion||pending||dock.active||detailControls.active)return false;
    if(next===region)return true;dock.closePresets();rememberPointSelection();pointCursor.hide();
    if(next==='ROOT'){
      rootSectionBefore={view:viewMode,scope:contourScope,mode:sectionMode,sectionId,selectionScope,rings:ringSelection(),rootBase:rootBaseFocused,points:{ids:[...selectedKnotIds],primary:selectedKnotId,density:wholeDensityKey}};pinRingPointSelection();
      if(rangeOpen)closeRange();rootBaseFocused=false;rootBaseSession=null;if(directEditSession){discardDirectEditSession();refresh();}else draft=structuredClone(current()||neutral());viewMode='FINAL';releaseViewPreview();editPart='SECTION';region='ROOT';
    }else{
      region='SECTION';const before=rootSectionBefore;rootSectionBefore=null;
      if(before){rootBaseFocused=Boolean(before.rootBase);draft=prepareBaseDraft(draft);sectionId=draft.sections.some(s=>s.id===before.sectionId)?before.sectionId:sectionId;if(before.scope==='FINAL'&&!isDirectTrunkForm(draft))startDirectEditSession();contourScope=before.scope;sectionMode=before.mode;viewMode=before.view;selectionScope=before.selectionScope;selectedRingIds=new Set(before.rings.filter(id=>draft.sections.some(s=>s.id===id)));if(before.points){selectedKnotKey=pointContextKey();selectedKnotIds=new Set(before.points.ids);selectedKnotId=before.points.primary;wholeDensityKey=before.points.density;rememberPointSelection();}}
    }
    syncViewPreview();loadFields();drawHandles();status();api.onTrunkFormModeChanged?.();return true;
  }
  function selectRootItem(id,{mode='REPLACE',keepGroup=true}={}){
    if(region!=='ROOT'){if(!setRegion('ROOT'))return false;selectedRootIds.clear();keepGroup=false;}
    if(!usable()||gesture||drag||placement||conversion||pending||dock.active||!draft?.buttresses.some(p=>p.id===id))return false;
    const before=rootSelection(),ids=keepGroup&&mode==='REPLACE'&&before.includes(id)?before:selectTrunkRoots(draft.buttresses,before,[id],mode);
    selectedRootIds=new Set(ids);buttressId=ids.includes(id)?id:ids.at(-1)||'';loadFields();drawHandles();status();api.onTrunkFormModeChanged?.();return true;
  }
  function selectRootItems(ids,{mode='REPLACE'}={}){if(gesture||drag||pending||!usable())return false;selectedRootIds=new Set(selectTrunkRoots(draft?.buttresses||[],rootSelection(),ids,mode));buttressId=[...selectedRootIds].at(-1)||'';loadFields();drawHandles();status();api.onTrunkFormModeChanged?.();return true;}
  function clearRootSelection(){if(gesture||drag||pending)return false;selectedRootIds.clear();loadFields();drawHandles();status('生成参数作用范围已清空；树上仍显示截面参考');api.onTrunkFormModeChanged?.();return true;}

  function applyRootDelta(sources,field,delta){const result=editTrunkRootGroup(sources,sources.map(p=>p.id),field,delta);for(const update of result.updates){const item=draft.buttresses.find(p=>p.id===update.id);if(item)Object.assign(item,update);}return result;}
  function editRootField(field,value){
    if(!usable()||drag||placement||conversion||!Number.isFinite(value)||gesture&&gesture.rootField!==field)return false;
    if(field!=='root_flare'&&!TRUNK_ROOT_FIELDS[field])return false;const ids=rootSelection();if(field!=='root_flare'&&!ids.length)return false;
    if(!begin(field==='root_flare'?'调整根盘展开':'调整所选板根'+TRUNK_ROOT_FIELDS[field].label))return false;
    gesture.rootField=field;gesture.rootSources??=draft.buttresses.filter(p=>ids.includes(p.id)).map(p=>structuredClone(p));gesture.rootPrimary??=rootState().primaryId;
    if(field==='root_flare')draft.root_flare=Math.max(0,Math.min(3,value));
    else{const primary=gesture.rootSources.find(p=>p.id===gesture.rootPrimary);if(!primary)return false;const delta=field==='angle'?rootAngleDelta(primary.angle,value):value-rootFieldValue(primary,field);gesture.rootLimited=applyRootDelta(gesture.rootSources,field,delta).limited;}
    loadFields();queuePreview();status('板根形状预览 · 松手 / Enter 确认，Esc 取消');return true;
  }
  function previewRootPreset(record){
    if(region!=='ROOT'||!usable()||drag||placement||conversion||pending||dock.active||gesture&&!gesture.rootPreset)return false;
    const ids=gesture?.rootPreset?.ids||rootSelection();if(!ids.length){status('先选板根，再试用形状');return false;}
    let roots;try{roots=applyTrunkRootPreset(draft.buttresses,ids,record.shape);}catch(e){api.toast(e.message,true);return false;}
    if(!gesture){if(!begin('套用所选板根形状'))return false;gesture.rootPreset={ids:[...ids]};}
    gesture.rootPreset.record={id:record.id,name:record.name};draft.buttresses=roots;loadFields();queuePreview();status('板根形状试用 · '+ids.length+' 条 · Enter 确认 / Esc 取消');return true;
  }
  function focusRoot(){
    if(!target||drag)return;const geometry=rootGeometry(),r=ringAt(rootStartT(),geometry);if(!r)return;handles.updateWorldMatrix(true,false);
    const box=new THREE.Box3();for(const p of ringData(r,geometry))box.expandByPoint(p.clone().applyMatrix4(handles.matrixWorld));for(const b of draft.buttresses){const end=ringAt(rootEndT(b),geometry);if(end)box.expandByPoint(V(end.center).applyMatrix4(handles.matrixWorld));}
    const center=box.getCenter(new THREE.Vector3()),radius=Math.max(.3,box.getSize(new THREE.Vector3()).length()*.5),direction=api.camera.position.clone().sub(api.controls.target).normalize();api.controls.target.copy(center);api.camera.position.copy(center).addScaledVector(direction,radius/Math.tan((api.camera.fov||45)*Math.PI/360)*1.35);api.controls.update();
  }
  function createRoots(copy=false){
    if(region!=='ROOT'||!usable()||gesture||drag||placement||pending||dock.active)return false;const source=copy?draft.buttresses.filter(p=>rootSelection().includes(p.id)):null;if(copy&&!source.length)return false;
    if(draft.buttresses.length+(source?.length||1)>12){status('本枝最多 12 条板根');return false;}if(!begin(copy?'复制板根生成参数':'新增板根生成参数'))return false;
    const records=source||[{angle:(draft.buttresses.length*137.5)%360,length:2,height:.25,width:35,strength:1}],ids=[];for(const root of records){const id='BUTTRESS_'+crypto.randomUUID();draft.buttresses.push({...structuredClone(root),id,angle:wrap(root.angle+(copy?15:0))});ids.push(id);}selectedRootIds=new Set(ids);buttressId=ids.at(-1);
    queuePreview();return commit();
  }
  function removeRoots(){const ids=rootSelection();if(!ids.length||gesture||drag||pending||!usable())return false;return mutate('移除所选板根',d=>{d.buttresses=d.buttresses.filter(p=>!ids.includes(p.id));selectedRootIds.clear();buttressId='';});}
  function rootKey(e){
    if(e.defaultPrevented||e.isComposing||document.querySelector('dialog[open]'))return false;const typing=e.target?.matches?.('input,textarea,select')||e.target?.isContentEditable,key=e.key?.toLowerCase();
    if(e.key==='Escape'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey){if(gesture||drag||dock.active)cancel();else if(!dock.back())setRegion('SECTION');return true;}
    if(e.key==='Enter'&&(gesture||drag)&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey){if(drag)finishDrag();else commit();return true;}
    if(typing)return false;if(key==='p'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.repeat&&(!gesture||gesture.rootPreset)){dock.toggleRootPresets(e.shiftKey);return true;}if((e.ctrlKey||e.metaKey)&&['a','d','i'].includes(key)){if(!gesture&&!drag&&!pending){const all=draft?.buttresses||[];selectRootItems(key==='d'?[]:all.filter(p=>key==='a'||!selectedRootIds.has(p.id)).map(p=>p.id));}return true;}
    if(e.ctrlKey||e.metaKey)return false;if(['g','r','s'].includes(key)){if(!e.repeat){const message='当前为生成参数；返回圈点编辑，再用 G / R / S 调整所选点或整圈';status(message);api.toast(message);}return true;}
    if(e.altKey)return false;if(e.repeat)return ['n','d','delete','backspace'].includes(key);
    if(gesture||drag||pending||dock.active)return true;
    if(key==='n'&&!e.shiftKey){createRoots(false);return true;}if(key==='d'&&e.shiftKey){createRoots(true);return true;}if(['delete','backspace'].includes(key)){removeRoots();return true;}if(key==='f'){focusRoot();return true;}if(key==='v'){finishWorkspace();return true;}
    if(key==='?'){dock.toggleShortcuts();return true;}if(['c','o','w','1','2'].includes(key)){status('当前是辅助生成参数；点根盘轮廓或返回圈点编辑继续改点');return true;}return false;
  }
  function focusSection(){if(region==='ROOT'){focusRoot();return;}const s=section(),r=s&&ringAt(s.t);if(!r||drag)return;handles.updateWorldMatrix(true,false);const center=new THREE.Vector3(...r.center).applyMatrix4(handles.matrixWorld),delta=center.clone().sub(api.controls.target);api.camera.position.add(delta);api.controls.target.copy(center);api.controls.update();}
  function cycleSection(direction){const context=trunkSectionContext(draft?.sections,sectionId),next=direction<0?context.previous:context.next;if(!next)return;selectRingSection(next.id);}
  $('trunkSectionAdd').onclick=()=>{if((!enabled||workspaceOpening)&&deferWorkspaceEntry(beginPlacement))return;beginPlacement();};
  $('trunkSectionRemove').onclick=removeSection;
  $('trunkButtressAdd').onclick=()=>{if(setRegion('ROOT'))createRoots(false);};
  $('trunkButtressRemove').onclick=()=>{if(setRegion('ROOT')){selectRootItem(buttressId);removeRoots();}};
  $('trunkSectionSelect').onchange=()=>{if(commit())selectRingSection($('trunkSectionSelect').value);};
  $('trunkButtressSelect').onchange=()=>{if(!commit())return;const id=$('trunkButtressSelect').value;if(setRegion('ROOT'))selectRootItem(id);};
  $('trunkFormSelectRoot').onclick=()=>{if(api.isBusy?.())return;const b=skeletonBranches(api.getAsset()?.masterBranches||[]).find(b=>b.parentId<0);if(b)api.select(b.stableId);};
  function enable(next){if(next&&(api.isEditing()||api.isBusy?.()))return;if(next&&!enabled)workspaceLayout.prepare();cancel();hoverSectionId=hoverKnotId='';if(next)api.setTool('SELECT');if(!next){rootBaseFocused=false;if(rootBaseSession){rootBaseSession=null;draft=structuredClone(current()||neutral());stamp='';}resetRange();if(directEditSession){discardDirectEditSession();draft=structuredClone(current()||neutral());contourScope='BASE';editPart='SECTION';sectionMode='PROFILE';}}const changed=enabled!==next;enabled=next;toggle.classList.toggle('active',next);toggle.setAttribute('aria-pressed',String(next));$('trunkFormHandles').setAttribute('aria-pressed',String(next));$('trunkFormHandles').textContent=next?'完成主干编辑':'开始主干编辑';if(next){if(changed){wholeWorldPoints=true;wholeTool='POINT';}panel.open=true;if(workflowStage()==='SHAPE'){revealControls('details');if(isDirectTrunkForm(draft))viewMode='FINAL';}syncViewPreview();}else{detailControls.deactivate();releasePreview();releaseViewPreview();releaseBaseGeometry();}updateFormUi();drawHandles();if(changed){api.onTrunkFormModeChanged?.();if(next&&api.onTrunkWorkspaceOpened){workspaceOpening=Promise.resolve(api.onTrunkWorkspaceOpened());const opening=workspaceOpening;opening.finally(()=>{if(workspaceOpening===opening)workspaceOpening=null;});}}}
  function deferWorkspaceEntry(action){if(!enabled)enable(true);if(workspaceOpening){workspaceOpening.then(()=>{if(enabled)action();});return true;}return !enabled;}
  function finishWorkspace(){if(api.isBusy?.())return;enable(false);api.onTrunkWorkspaceFinished?.();}
  toggle.onclick=()=>enabled?finishWorkspace():enable(true);$('trunkFormHandles').onclick=()=>enabled?finishWorkspace():enable(true);
  function finalGeometry(){const live=viewMode==='FINAL'&&liveHandlePreview();return live||(overlay?.view==='FINAL'?overlay.object:viewOverlay?.object.userData.trunk_form_preview_view==='FINAL'?viewOverlay.object:meshFor(target?.stableId))?.geometry;}
  const ringCache = new WeakMap();
  function ringAt(t,geometry=handleGeometry()){
    if(!geometry)return null;const rings=geometry.userData.radiusRings||[],position=geometry.getAttribute('position');
    let cache=ringCache.get(geometry);
    if(!cache||cache.rings!==rings||cache.position!==position||cache.version!==position?.version){cache={rings,position,version:position?.version,values:new Map()};ringCache.set(geometry,cache);}
    if(!cache.values.has(t)){if(cache.values.size>=256)cache.values.clear();cache.values.set(t,interpolateSectionRing(rings,t,position,{points:false})||rings.reduce((best,r)=>!best||Math.abs(r.t-t)<Math.abs(best.t-t)?r:best,null));}
    return cache.values.get(t);
  }
  function ringData(r,geometry=handleGeometry()){if(r.points)return r.points;if(r.pointAt)return Array.from({length:r.count},(_,i)=>r.pointAt(i));const pos=geometry.getAttribute('position'),points=[];for(let i=0;i<r.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(pos,r.offset+i));return points;}
  const markerMaterial=color=>new THREE.MeshBasicMaterial({color,depthTest:false,depthWrite:false});
  const V=a=>new THREE.Vector3(...a), radians=d=>d*Math.PI/180, wrap=a=>(a%360+360)%360;
  function marker(p,kind,id,color,extra={}){const radius=Math.max(.012,target.startRadius*.09),m=new THREE.Mesh(new THREE.SphereGeometry(radius,10,6),markerMaterial(color));m.position.copy(p);m.userData={kind,id,...extra};m.renderOrder=125;handles.add(m);}
  function profileMarker(p,s,knot,influenced=false){
    const dragging=drag?.kind==='PROFILE'&&drag.pointIds.includes(knot.id),hovered=hoverKnotId===knot.id,selected=selectionScope==='POINTS'&&selectedKnotIds.has(knot.id),primary=selected&&selectedKnotId===knot.id;
    const radius=selected?primary?9:8:dragging||hovered?7.5:contourScope==='FINAL'?3.5:6,color=dragging?0xff9a52:selected?primary?0xffffff:0xffb553:hovered?0xe6f7ff:influenced?0xb7ddf2:contourScope==='BASE'&&isDirectTrunkForm(draft)?0xf0c867:0x55c5ff;
    const m=createSectionProfileMarker(p,color,{radius,halo:selected?3:2,haloColor:selected&&!dragging?primary?0xffa23c:0xfff4de:selected?0xfff4de:0x11171b,renderOrder:dragging?134:primary?132:selected?130:126});
    Object.assign(m.userData,{kind:'profile',id:s.id,knotId:knot.id,pixelRadius:radius,dragging,hovered,selected,primary,influenced});handles.add(m);
  }
  function line(points,color,loop=false,width=2.5){const object=createSectionOverlayLine(points,color,{loop,width,haloWidth:width+2,renderOrder:120});handles.add(object);return object;}
  function rememberPointSelection(){if(selectedKnotKey)pointMemory.remember(selectedKnotKey,[...selectedKnotIds],selectedKnotId);}
  function prunePointSelections(){
    if(gesture||drag||placement||conversion||pending||api.isBusy?.()||api.getAsset()?.group.userData.pending_rebuild)return;
    const branches=new Set((api.getAsset()?.masterBranches||[]).map(b=>b.stableId)),forms=api.getAuthoring().workbench?.trunk_forms?.branches||{};
    pointMemory.prune(key=>{const [branch,id,scope]=key.split('|');if(!branches.has(branch))return null;if(branch===target?.stableId&&rootSectionBefore?.rootBase&&id===rootSectionBefore.sectionId)return undefined;const stored=branch===target?.stableId?draft:forms[branch],form=branch===target?.stableId&&scope==='FINAL'&&stored&&!isDirectTrunkForm(stored)?createDirectTrunkForm(stored):stored,s=form?.sections?.find(s=>s.id===id);if(!s)return null;const points=isDirectTrunkForm(form)?scope==='BASE'?trunkSectionMainPoints(s):s.profile||wholeTrunkContourKnots(s,64):s.profile||createTrunkSectionProfile(8);return branch===target?.stableId&&scope==='FINAL'&&isDirectTrunkForm(form)?createTrunkChildEditLayer(s,{...childCurveOptions(s,form),anchors:childAnchors(s)}).profile.map(p=>p.id):points.map(p=>p.id);});
  }
  function copyContourShape(){
    if(!usable()||gesture||drag||placement||conversion||pending||!section())return false;
    const shape=captureTrunkContour(section(),{direct:isDirectTrunkForm(draft),main:contourScope==='BASE'});if(!shape)return false;
    contourClipboard={shape,label:`${target.stableId} · ${(section().t*100).toFixed(1)}%`};drawHandles();status('已复制轮廓；切到目标截面后套用，位置与尺寸保留');return true;
  }
  function previewContourPaste(){
    if(!contourClipboard||!usable()||gesture||drag||placement||conversion||pending||!section()||coveredSection())return false;
    const next=pasteTrunkContour(section(),contourClipboard.shape,{direct:isDirectTrunkForm(draft),idFor:kind=>kind+'_'+crypto.randomUUID()});
    if(!next){status('配方版本不同或轮廓超出范围；请先预览转换，或复制相同版本的轮廓');return false;}
    profilePointState();const before={ids:[...selectedKnotIds],primary:selectedKnotId};if(!begin('套用截面轮廓'))return false;
    gesture.contourPaste=before;Object.assign(section(),next);clearCapture(section());selectedKnotId='';selectedKnotIds.clear();wholeDensityKey='';loadFields();queuePreview();drawHandles();status('轮廓试用 · 目标位置、尺寸与表面配方保持 · Enter 确认 / Esc 取消');return true;
  }
  function pointContextKey(){return [target?.stableId,sectionId,contourScope].join('|');}
  function ringAnchorKey(s){return [target?.stableId,s.id].join('|');}
  function childAnchors(s){const record=ringPointAnchors.get(ringAnchorKey(s));return record?.source===JSON.stringify(s.profile)?record.points:[];}
  function pinRingPointSelection(){
    if(contourScope!=='FINAL'||!section()||!isDirectTrunkForm(draft))return;
    profilePointState();const s=section(),source=new Set((s.profile||[]).map(p=>p.id)),points=profilePoints(s).filter(p=>selectedKnotIds.has(p.id)&&!source.has(p.id)).map(p=>({id:p.id,angle:p.angle}));
    if(!points.length)return;const key=ringAnchorKey(s);ringPointAnchors.delete(key);ringPointAnchors.set(key,{source:JSON.stringify(s.profile),points});while(ringPointAnchors.size>256)ringPointAnchors.delete(ringPointAnchors.keys().next().value);
  }
  function pointReach(){return contourScope==='BASE'?mainReach:wholeReach;}
  function childCurveOptions(s=section(),form=draft){
    const {settings,carrierSurfaceAt}=directSamplerOptions(),effect=wholeTrunkSurfaceSampler(form,s,settings);
    return {exclusions:s.profile_exclusions,surfaceAt:a=>effect(a)*trunkSectionEllipseRadius(s.oval,a)*carrierSurfaceAt(s.t,a)};
  }
  function childEditLayer(s=section()){
    if(!s||!isDirectTrunkForm(draft))return null;
    const {settings,carrierSurfaceAt}=directSamplerOptions(),carrierOval=carrierSurfaceAt(s.t,0);
    const anchors=childAnchors(s),key=JSON.stringify([draft,s.id,carrierOval,settings.twist,settings.section_roll,wholePointCount,wholeDensityKey,anchors]);
    if(key!==childPlanKey){childPlanKey=key;
      childPlanCache=createTrunkChildEditLayer(s,{count:wholePointCount,densify:wholeDensityKey===pointContextKey(),
        surfaceAt:childCurveOptions(s).surfaceAt,anchors});
    }return childPlanCache;
  }
  function childLayerInfo(){if(contourScope!=='FINAL'||drag||!enabled)return null;const plan=childEditLayer();if(!plan)return null;const {profile,...info}=plan;return {...info,repairable:section().profile_exclusions?.some(p=>p.join!=='SMOOTH')||false};}
  function profilePoints(s){if(drag?.kind==='PROFILE'&&s.id===drag.originalSection.id)return drag.currentProfile||drag.section.profile;if(!isDirectTrunkForm(draft))return s.profile||createTrunkSectionProfile(8);return contourScope==='BASE'?trunkSectionMainPoints(s):childEditLayer(s)?.profile||trunkSectionChildPoints(s);}
  function writeProfilePoints(points,source=section()){
    const s=section();if(!isDirectTrunkForm(draft)){s.profile=points;if(drag?.kind==='PROFILE')drag.currentProfile=points;return true;}
    if(drag?.kind==='PROFILE'&&JSON.stringify(points)===JSON.stringify(drag.section.profile)){
      for(const key of ['profile','profile_coarse','profile_exclusions','contour_capture','capture_error']){if(drag.originalSection[key])s[key]=structuredClone(drag.originalSection[key]);else delete s[key];}wholeDensityKey=drag.beforeDensityKey;drag.currentProfile=points;return true;
    }
    const options=contourScope==='FINAL'?childCurveOptions(drag?.originalSection||source):undefined;
    const before=drag?.section.profile||profilePoints(source),edited=updateDirectTrunkSectionTangents(points,before);const next=editTrunkSectionLayer(s,edited,{main:contourScope==='BASE',source:drag?.kind==='PROFILE'?drag.originalSection:source,surfaceAt:drag?.layerSurface});if(!next)return false;if(options)next.profile=updateTrunkSectionJoinTangents(next.profile,before,{...options,exclusions:next.profile_exclusions});Object.assign(s,next);wholeDensityKey='';if(drag?.kind==='PROFILE')drag.currentProfile=contourScope==='BASE'?edited:next.profile;return true;
  }
  function profilePointState(){
    const key=pointContextKey(),points=section()?profilePoints(section()):[];
    if(selectedKnotKey!==key){rememberPointSelection();selectedKnotKey=key;const saved=pointMemory.restore(key,points.map(p=>p.id));selectedKnotId=saved.primary;selectedKnotIds=new Set(saved.ids);}
    selectedKnotIds=new Set(selectTrunkSectionPoints(points,[],[...selectedKnotIds]));
    if(!selectedKnotIds.has(selectedKnotId))selectedKnotId=[...selectedKnotIds][0]||'';
    if(!gesture&&!drag&&!placement&&!conversion)rememberPointSelection();
    const ids=selectionScope==='POINTS'?[...selectedKnotIds]:[],selected=selectionScope==='POINTS'?selectedKnotId:'',i=points.findIndex(p=>p.id===selected);
    const weights=trunkSectionPointWeights(points,ids,{smooth:!drag?.pointTranslate&&!drag?.pointTransform&&isDirectTrunkForm(draft)&&(drag?.wholeTool||wholeTool)==='SOFT',reach:drag?.wholeReach||pointReach()});
    return {transform:pointTransformState(),move:pointMoveState(),input:pointInputState(),selected,ids,selectedCount:ids.length,index:i,count:points.length,mainCount:section()&&isDirectTrunkForm(draft)?trunkSectionMainPoints(section()).length:points.length,childCount:section()&&isDirectTrunkForm(draft)?contourScope==='FINAL'?points.length:trunkSectionChildPoints(section()).length:0,point:points[i],influenced:points.filter((p,j)=>weights[j]>0&&!selectedKnotIds.has(p.id)).map(p=>p.id),dragging:drag?.kind==='PROFILE'?drag.pointIds:[],offset:drag?.pointOffset?drag.nudgeRadius*100:0,offsetActive:Boolean(drag?.pointOffset),limit:isDirectTrunkForm(draft)&&contourScope==='FINAL'?128:TRUNK_MAIN_POINT_LIMIT,active:Boolean(gesture||drag||placement||conversion||pending||dock.active),nudge:Boolean(drag?.pointNudge)};
  }
  function selectProfilePoints(ids,{mode='REPLACE'}={}){if(gesture||drag||placement||conversion||pending)return false;profilePointState();if(selectionScope==='RING'){selectedKnotIds.clear();selectedKnotId='';}selectionScope='POINTS';selectedKnotIds=new Set(selectTrunkSectionPoints(section()?profilePoints(section()):[],[...selectedKnotIds],ids,mode));selectedKnotId=selectedKnotIds.has(ids.at(-1))?ids.at(-1):[...selectedKnotIds][0]||'';drawHandles();return true;}
  function selectProfilePoint(id,options){return selectProfilePoints(id?[id]:[],options);}
  function cycleProfilePoint(direction){const state=profilePointState(),points=section()&&profilePoints(section());if(!points?.length||state.active)return false;const index=state.index<0?(direction>0?-1:0):state.index;return selectProfilePoint(points[(index+direction+points.length)%points.length].id);}
  function insertProfilePoint(point){
    if(!usable()||gesture||drag||placement||conversion||!section()||coveredSection())return false;
    profilePointState();
    const s=section(),points=profilePoints(s),id='POINT_'+crypto.randomUUID(),direct=isDirectTrunkForm(draft),limit=profilePointState().limit;
    if(points.length>=limit){api.toast(`最多 ${limit} 个${contourScope==='BASE'?'主点':'子点'}`);return false;}
    const options={direct,...(direct&&contourScope==='FINAL'?childCurveOptions(s):{})};
    let next;if(point){const r=ringAt(s.t);if(!r)return false;const local=V(r.center).addScaledVector(V(r.x),point.x).addScaledVector(V(r.y),point.y),angle=wrap(polar(r,local).angle*180/Math.PI);next=insertTrunkSectionPoint(points,angle,id,options);if(!next&&points.length<(direct?128:32)){const before=points.findLast(p=>p.angle<=angle)||points.at(-1);next=insertTrunkSectionPointAfter(points,before.id,id,options);}}
    else {if(selectedKnotIds.size>1){api.toast('加点前先选一个蓝点，或双击要补点的黄线');return false;}next=insertTrunkSectionPointAfter(points,profilePointState().selected,id,options);}
    if(!next){api.toast(points.length>=(direct?128:32)?`最多 ${direct?128:32} 个控制点`:'先选一个点；相邻点须留出 0.2° 间距。');return false;}
    selectionScope='POINTS';wholeDensityKey='';selectedKnotId=id;selectedKnotIds=new Set([id]);return mutate(contourScope==='BASE'?'增加主点':'增加子点',()=>{if(writeProfilePoints(next))clearCapture(section());});
  }
  function removeProfilePoint(id){
    const state=profilePointState();if(!usable()||state.active||!id&&!state.selected||coveredSection())return false;
    const points=profilePoints(section()),ids=id?[id]:state.ids,next=removeTrunkSectionPoints(points,ids,{direct:isDirectTrunkForm(draft),...(isDirectTrunkForm(draft)&&contourScope==='FINAL'?childCurveOptions():{})});
    if(!next){api.toast('闭合轮廓至少保留 3 个点');return false;}
    selectionScope='POINTS';wholeDensityKey='';selectedKnotId=!id&&state.selectedCount===1?next[state.index%next.length].id:'';selectedKnotIds=new Set(id?state.ids.filter(value=>value!==id):selectedKnotId?[selectedKnotId]:[]);return mutate(`移除${ids.length>1?'所选':''}${contourScope==='BASE'?'主点':'子点'}`,()=>{if(writeProfilePoints(next)){if(isDirectTrunkForm(draft)&&contourScope==='FINAL'){const s=section();s.profile_exclusions=excludeRemovedTrunkChildren(s,points,next);s.profile=updateTrunkSectionJoinTangents(s.profile,points,childCurveOptions(s));}clearCapture(section());}});
  }
  function repairDeletedArcs(){
    if(!usable()||gesture||drag||placement||conversion||pending||contourScope!=='FINAL'||coveredSection())return false;
    const repaired=reconnectRemovedTrunkChildren(section(),childCurveOptions());if(!repaired)return false;
    wholeDensityKey='';return mutate('重连已删点区段',()=>{Object.assign(section(),repaired);clearCapture(section());});
  }
  function knotPosition(r,angle,geometry=handleGeometry()){
    const offset=r.angleOffset??radians((api.getSettings().twist||0)+(api.getSettings().section_roll||0))*r.t;
    const {i,next,u}=trunkRingAngleSegment({...r,angleOffset:offset},angle);
    if(r.pointAt)return r.pointAt(i)?.lerp(r.pointAt(next),u)||null;
    const points=ringData(r,geometry);
    return points[i].clone().lerp(points[next],u);
  }
  function frontData({references=false}={}){
    const s=section(),r=s&&ringAt(s.t);if(!r)return null;
    const center=V(r.center),x=V(r.x),y=V(r.y),xy=p=>{const v=p.clone().sub(center);return {x:v.dot(x),y:v.dot(y)};};
    const data={outline:ringData(r).map(xy),knots:profilePoints(s).map(p=>({id:p.id,angle:p.angle,...xy(knotPosition(r,radians(p.angle)))}))};
    if(references){const context=trunkSectionContext(draft?.sections,sectionId);data.references=readSectionReferences(handleGeometry(),[{side:'ROOT',section:context.root},{side:'TIP',section:context.tip}],ringAt,ringData);}
    return data;
  }
  function drawHandles(){clearGroup(handles);dock.update();detailControls.update();syncConversionComparison();if(overlay&&!conversion)overlay.mesh.visible=false;if(viewOverlay)viewOverlay.mesh.visible=false;syncWire();meshControls.update();if(!enabled||panel.hidden||!target||!draft||editPart==='DETAIL')return;refreshTransform();
    drawRootBaseReference();
    if(region==='ROOT'){
      for(const s of draft.sections){const r=ringAt(s.t);if(!r)continue;Object.assign(line(ringData(r),0x7cbdae,true,2.5).userData,{kind:'section',id:s.id,action:'SELECT',ringSelected:false,ringPrimary:false});const h=createSectionProfileMarker(V(r.center),0x7cbdae,{radius:7,halo:2,pivot:true,renderOrder:128});Object.assign(h.userData,{kind:'section',id:s.id,action:'SELECT',ringSelectHandle:true,ringSelected:false});handles.add(h);}
      return;
    }
    const selectedRings=new Set(ringSelection());
    const rangeWeights=new Map(rangeOpen?rangeState().weights.map(w=>[w.id,w]):[]);
    for(const s of draft.sections){const r=ringAt(s.t);if(!r)continue;const points=ringData(r),active=s.id===sectionId,chosen=selectedRings.has(s.id);
      if(rangeOpen){const weight=rangeWeights.get(s.id);Object.assign(line(points,weight?.weight>0?0xd6a6ef:weight?0x9a9caf:0x526578,true,weight?.weight>0?3.5:1.5).userData,{rangeSectionId:s.id,rangeMember:Boolean(weight),rangeWeight:weight?.weight||0,rangeLocked:Boolean(weight?.locked),rangeShadowed:Boolean(weight?.shadowed)});continue;}
      if(placement&&s.id===placement.id&&!placement.valid)continue;
      Object.assign(line(points,chosen?active?0xffb553:0xe9a951:active?0xffd84d:s.id===hoverSectionId?0xe1fff1:0x7cbdae,true,chosen?5:active||s.id===hoverSectionId?3.5:2.5).userData,{kind:'section',id:s.id,action:'SELECT',ringSelected:chosen,ringPrimary:chosen&&active});
      if(conversion)continue;
      if(!active){const h=createSectionProfileMarker(V(r.center),chosen?0xffb553:0x7cbdae,{radius:chosen?9:7,halo:2,pivot:true,renderOrder:128});Object.assign(h.userData,{kind:'section',id:s.id,action:'SELECT',ringSelectHandle:true,ringSelected:chosen});handles.add(h);continue;}
      if((sectionMode==='PROFILE'||sectionMode==='SLIDE')&&!placement&&(!drag||drag.kind==='SLIDE')){
        const moving=drag?.kind==='SLIDE',center=V(r.center),before=ringAt(Math.max(0,s.t-.025)),after=ringAt(Math.min(1,s.t+.025));
        if(moving)line(handleGeometry().userData.radiusRings.map(p=>V(p.center)),0xc7af6a);
        else if(before&&after)line([V(before.center),V(after.center)],0xe7c975,false,2);
        const h=createSectionProfileMarker(center,moving||selectionScope==='RING'?0xffa23c:hoverSectionId===s.id?0xfff1ba:0xffd84d,{radius:10,halo:2,pivot:true,renderOrder:133});
        Object.assign(h.userData,{kind:'section',id:s.id,action:'SLIDE',ringMoveHandle:true});handles.add(h);
      }
      const wholeMode=preparingWholeMode||(['TWIST','RADIUS'].includes(drag?.kind)?drag.kind:sectionMode);
      if(wholeMode==='TWIST'){
        const center=V(r.center),x=V(r.x),y=V(r.y),extent=Math.max(...points.map(p=>p.distanceTo(center)))*1.22;
        const circle=Array.from({length:64},(_,i)=>center.clone().addScaledVector(x,Math.cos(i/64*Math.PI*2)*extent).addScaledVector(y,Math.sin(i/64*Math.PI*2)*extent));
        line(circle,0xffd84d,true);marker(center.clone().addScaledVector(x,Math.cos(isDirectTrunkForm(draft)?radians(s.roll):r.roll)*extent).addScaledVector(y,Math.sin(isDirectTrunkForm(draft)?radians(s.roll):r.roll)*extent),'section',s.id,0xffd84d,{action:'TWIST'});
      }else if(wholeMode==='RADIUS'){const center=V(r.center),endpoint=points[0].clone().sub(center).multiplyScalar(1.25).add(center);line([points[0],endpoint],0xffd84d);marker(endpoint,'section',s.id,0xffd84d,{action:'RADIUS'});}
      // The selected outline always exposes its knots. Clicking one switches
      // to PROFILE; choosing a transform need not hide the editing affordance.
      if(!placement&&(!drag?.keyboard||drag.kind==='PROFILE')&&!coveredSection()){const influenced=new Set(profilePointState().influenced);profilePoints(s).filter(p=>contourScope!=='FINAL'||wholeWorldPoints||Boolean(worldBox)||selectedKnotIds.has(p.id)).forEach(p=>{profileMarker(knotPosition(r,radians(p.angle)),s,p,influenced.has(p.id));if(worldBox?.candidates.includes(p.id)&&(selectionScope==='RING'||!selectedKnotIds.has(p.id))){const candidate=handles.children.at(-1);candidate.userData.screenColor.setHex(0xb7ddf2);candidate.userData.screenHaloColor.setHex(0x81d9ff);}});}
    }
    if(rangeOpen||conversion)return;
    if(drag?.pointTransform){const pivot=createSectionProfileMarker(transformLocal(drag.pointPivot),0xeebcff,{radius:16,halo:2,haloColor:0x17101f,renderOrder:138,pivot:true});pivot.userData.pointTransformPivot=true;handles.add(pivot);}

  }
  function screenPoint(p,refresh=true){if(refresh)root.updateWorldMatrix(true,true);const rect=api.canvas.getBoundingClientRect();const v=p.clone().applyMatrix4(handles.matrixWorld).project(api.camera);return {x:rect.left+(v.x+1)*rect.width/2,y:rect.top+(1-v.y)*rect.height/2,z:v.z};}
  function hitHandle(e){root.updateWorldMatrix(true,true);const project=p=>screenPoint(p,false);let best=null;for(const h of handles.children.filter(o=>o.isMesh&&o.userData.kind)){const p=project(h.position),dist=Math.hypot(e.clientX-p.x,e.clientY-p.y);if(p.z>=-1&&p.z<=1&&dist<16&&(!best||dist<best.distance))best={h,distance:dist};}
    if(best&&(best.distance<=6||best.h.userData.kind==='profile'&&best.distance<=12))return best.h;
    for(const h of handles.children.filter(o=>(o.userData.kind==='section'||o.userData.kind==='root-base')&&o.userData.polyline)){const hit=hitSectionPolyline(h.userData.polyline,pointerXY(e),project,{loop:true,radius:10});if(hit!==null&&(!best||hit<best.distance))best={h,distance:hit};}return best?.h;}
  function hitRingSelection(e){
    root.updateWorldMatrix(true,true);const project=p=>screenPoint(p,false);let best=null;
    for(const h of handles.children.filter(o=>o.isMesh&&o.userData.kind==='section'&&(o.userData.ringMoveHandle||o.userData.ringSelectHandle))){const p=project(h.position),distance=Math.hypot(e.clientX-p.x,e.clientY-p.y);if(p.z>=-1&&p.z<=1&&distance<=14&&(!best||distance<best.distance))best={h,distance};}
    for(const h of handles.children.filter(o=>o.userData.kind==='section'&&o.userData.action==='SELECT'&&o.userData.polyline)){const distance=hitSectionPolyline(h.userData.polyline,pointerXY(e),project,{loop:true,radius:10});if(distance!==null&&(!best||distance<best.distance))best={h,distance};}
    return best?.h;
  }
  function consume(e){e.preventDefault();e.stopImmediatePropagation();}
  function pointerXY(e){return {x:e.clientX,y:e.clientY};}
  function polar(r,p){const delta=p.clone().sub(V(r.center)),x=V(r.rolledX||r.x),y=V(r.rolledY||r.y),direct=isDirectTrunkForm(draft),px=delta.dot(x)/(direct?1:r.ovalX||1),py=delta.dot(y)/(direct?1:r.ovalY||1);return {angle:Math.atan2(py,px),radius:Math.hypot(px,py)};}
  function startDrag(kind,r,p,knotId){
    if(coveredSection()&&['PROFILE','TWIST','RADIUS'].includes(kind)){status(overlapHint());return false;}
    if(selectionScope==='RING'&&['TWIST','RADIUS'].includes(kind)&&ringSelection().some(id=>{const s=draft.sections.find(s=>s.id===id);return draft.sections.filter(other=>Math.abs(other.t-s.t)<1e-10).at(-1)?.id!==id;})){status('选区含重叠遮盖的圈；先沿干移开，或减选该圈再变换');return false;}
    if(kind==='PROFILE'){profilePointState();if(selectionScope==='RING'){selectedKnotIds.clear();selectedKnotId='';}selectionScope='POINTS';}
    if(kind==='SLIDE')pinRingPointSelection();
    if(!begin(kind==='SLIDE'?'沿干移动整圈':undefined))return false;
    if(kind==='SLIDE'){pointCursor.hide();gesture.ringSlide=true;gesture.beforeSectionMode??=sectionMode;}
    const originalSection=section()?structuredClone(section()):null,editPoints=kind==='PROFILE'?profilePoints(section()):null;
    const knot=editPoints?.find(n=>n.id===knotId);
    if(kind==='PROFILE'&&!knot){cancel();return false;}
    if(knot){selectedKnotKey=pointContextKey();if(!selectedKnotIds.has(knot.id))selectedKnotIds=new Set([knot.id]);selectedKnotId=knot.id;}
    drag={kind,ring:r,beforeDensityKey:wholeDensityKey,originalSection,section:originalSection&&structuredClone(originalSection),root:buttress()?structuredClone(buttress()):null,knotId,knot:knot&&structuredClone(knot),pointIds:knot?[...selectedKnotIds]:[],startPolar:p&&polar(r,p),lastAngle:null,angleDelta:0};
    if(['SLIDE','TWIST','RADIUS'].includes(kind)){const ids=selectionScope==='RING'?ringSelection():[sectionId];drag.ringSections=draft.sections.filter(s=>ids.includes(s.id)).map(s=>structuredClone(s));drag.ringValue=kind==='RADIUS'?1:0;gesture.label=({SLIDE:'沿干移动',TWIST:'旋转',RADIUS:'缩放'}[kind])+(ids.length>1?'所选 '+ids.length+' 圈':'当前圈');}
    if(editPoints)drag.section.profile=structuredClone(editPoints);
    if(drag.pointIds.length>1)gesture.label='成组推拉轮廓控制点';
    if(kind==='PROFILE'&&isDirectTrunkForm(draft)){const options=childCurveOptions(drag.originalSection);drag.wholeSample=createDirectTrunkSectionProfileSampler(drag.section.profile,contourScope==='FINAL'?options:undefined);drag.wholeRadiusAt=angle=>knotPosition(r,angle)?.distanceTo(V(r.center))||.0001;drag.wholeTool=wholeTool;drag.wholeReach=pointReach();drag.layerSurface=options.surfaceAt;}
    if(kind==='PROFILE'){
      if(rootBaseFocused&&!isDirectTrunkForm(draft)){const geometry=handleGeometry();drag.rootBaseRadiusAt=angle=>polar(r,knotPosition(r,angle,geometry)).radius;}
      const radii=new Map(drag.section.profile.map(p=>[radians(p.angle),p.radius])),surfaces=new Map(),direct=isDirectTrunkForm(draft),oval=drag.section.oval,carrierOval=(r.ovalX||1)/oval;
      drag.pointRadiusAt=angle=>{if(!surfaces.has(angle))surfaces.set(angle,drag.wholeRadiusAt?drag.wholeRadiusAt(angle):drag.rootBaseRadiusAt?drag.rootBaseRadiusAt(angle):direct?radii.get(angle)*Math.max(.0001,r.localRadius*trunkSectionEllipseRadius(oval,angle)*trunkSectionEllipseRadius(carrierOval,angle)):radii.get(angle)*drag.startPolar.radius/drag.knot.radius);return surfaces.get(angle);};
      if(drag.pointIds.length>1){const selected=drag.section.profile.filter(p=>drag.pointIds.includes(p.id)),unit=Math.max(.0001,drag.startPolar.radius*Math.cos(drag.startPolar.angle-radians(drag.knot.angle)));drag.groupNudgeBounds=[Math.min(...selected.map(p=>drag.pointRadiusAt(radians(p.angle))*((direct?.001:.15)/p.radius-1)/unit)),Math.max(...selected.map(p=>drag.pointRadiusAt(radians(p.angle))*((direct?64:4)/p.radius-1)/unit))];}
    }
    api.controls.enabled=false;return true;
  }
  function pointPositionAt(point){const angle=radians(point.angle),radius=drag.pointRadiusAt(angle);return {x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};}
  function pointRadiusFor(point,angle,radius){const r=drag.ring;return drag.rootBaseRadiusAt?sampleTrunkSectionProfile(drag.section.profile,angle)*radius/Math.max(.0001,drag.rootBaseRadiusAt(angle)):drag.wholeSample?drag.wholeSample(angle)*radius/Math.max(.0001,drag.wholeRadiusAt(angle)):isDirectTrunkForm(draft)?radius/Math.max(.0001,r.localRadius*trunkSectionEllipseRadius(drag.section.oval,angle)*trunkSectionEllipseRadius((r.ovalX||1)/drag.section.oval,angle)):point.radius*radius/drag.pointRadiusAt(radians(point.angle));}
  function transformLocal(point){const r=drag.ring,direct=isDirectTrunkForm(draft);return V(r.center).addScaledVector(V(r.rolledX||r.x),point.x*(direct?1:r.ovalX||1)).addScaledVector(V(r.rolledY||r.y),point.y*(direct?1:r.ovalY||1));}
  function transformFront(point){const r=drag.ring,delta=transformLocal(point).sub(V(r.center));return {x:delta.dot(V(r.x)),y:delta.dot(V(r.y))};}
  function pointTransformState(){if(!drag?.pointTransform)return null;return {action:drag.pointTransform,pivot:transformFront(drag.pointPivot),reference:transformFront(drag.transformReference),scope:drag.pointPivot.scope,value:drag.pointTransform==='SCALE'?Math.exp(drag.transformValue):drag.transformValue,limited:drag.transformLimited};}
  function beginPointTransform(action){
    drag.pointTranslate=false;drag.pointTransform=action;drag.wholeTool='POINT';drag.transformValue=0;
    drag.pointPivot=trunkSectionPointPivot(drag.section.profile,drag.pointIds,pointPositionAt);
    const knot=pointPositionAt(drag.knot),extent=Math.max(...drag.section.profile.map(p=>drag.pointRadiusAt(radians(p.angle))));
    drag.transformReference=Math.hypot(knot.x-drag.pointPivot.x,knot.y-drag.pointPivot.y)<extent*.06?{x:drag.pointPivot.x+extent*.3,y:drag.pointPivot.y}:knot;
    drag.transformInput={...drag.transformReference};gesture.label=`${action==='ROTATE'?'旋转':'缩放'}所选${contourScope==='BASE'?'主点':'子点'}`;
  }
  function applyPointTransformValue(value){
    const direct=isDirectTrunkForm(draft),result=transformTrunkSectionPoints(drag.section.profile,drag.pointIds,{action:drag.pointTransform,value,previous:drag.transformValue,pivot:drag.pointPivot,positionAt:pointPositionAt,radiusFor:pointRadiusFor,min:direct?.001:.15,max:direct?64:4,accept:points=>!direct||contourScope==='FINAL'||Boolean(editTrunkSectionLayer(drag.originalSection,points,{main:true,surfaceAt:drag.layerSurface}))});
    if(writeProfilePoints(result.profile)){drag.transformValue=result.value;drag.transformLimited=result.limited;if(result.value)clearCapture(section());}
  }
  function movePointTransform(input,{precision=false}={}){
    const pivot=drag.pointPivot,last=drag.transformInput,a={x:last.x-pivot.x,y:last.y-pivot.y},b={x:input.x-pivot.x,y:input.y-pivot.y};
    if(Math.hypot(b.x,b.y)<1e-8)return;
    const increment=drag.pointTransform==='ROTATE'?Math.atan2(a.x*b.y-a.y*b.x,a.x*b.x+a.y*b.y)*180/Math.PI:Math.log(Math.hypot(b.x,b.y)/Math.max(1e-8,Math.hypot(a.x,a.y)));
    if(!drag.pointInput)applyPointTransformValue(drag.transformValue+increment*(precision?.1:1));
    drag.transformInput={...input};
  }
  function pointGestureAction(){return drag?.pointTransform|| (drag?.pointTranslate?'MOVE':null);}
  function pointInputState(){const action=pointGestureAction();return action?{text:drag.pointInput||'',valid:parseTrunkPointTransformInput(drag.pointInput||'',action).valid,axis:drag.pointAxis||null}:null;}
  function pointInputValid(){return !pointGestureAction()||parseTrunkPointTransformInput(drag.pointInput||'',pointGestureAction()).valid;}
  function pointMoveState(){if(!drag?.pointTranslate)return null;const delta=transformFront(drag.translationDelta||{x:0,y:0});return {origin:transformFront(pointPositionAt(drag.knot)),x:Math.abs(delta.x)<1e-10?0:delta.x*100,y:Math.abs(delta.y)<1e-10?0:delta.y*100,axis:drag.pointAxis||null,limited:drag.translationLimited};}
  function applyPointTranslation(dx,dy){
    const profile=drag.section.profile,result=moveTrunkSectionPoints(profile,drag.pointIds,{dx:Math.abs(dx)<1e-10?0:dx,dy:Math.abs(dy)<1e-10?0:dy,positionAt:pointPositionAt,radiusFor:pointRadiusFor,min:isDirectTrunkForm(draft)?.001:.15,max:isDirectTrunkForm(draft)?64:4});
    const written=writeProfilePoints(result.profile);drag.translationLimited=result.fraction<.999999||!written;if(written)drag.translationDelta={x:dx*result.fraction,y:dy*result.fraction};
    if(written&&result.profile.some((p,i)=>p.radius!==profile[i].radius||p.angle!==profile[i].angle))clearCapture(section());
  }
  function applyTranslationFront(x,y){const r=drag.ring,v=V(r.center).addScaledVector(V(r.x),x).addScaledVector(V(r.y),y),p=polar(r,v);applyPointTranslation(Math.cos(p.angle)*p.radius,Math.sin(p.angle)*p.radius);}
  function pointTransformKey(e){
    if(!pointGestureAction()||!(drag.keyboard||drag.pointKeyboard)||e.target?.matches?.('input,textarea,select')||e.target?.isContentEditable||document.querySelector('dialog[open]'))return false;
    const next=trunkPointTransformInputKey(e,{action:pointGestureAction(),text:drag.pointInput||'',axis:drag.pointAxis});if(!next)return false;
    drag.pointInput=next.text;drag.pointAxis=next.axis;
    const parsed=parseTrunkPointTransformInput(next.text,pointGestureAction());
    if(parsed.valid&&parsed.value!==null){if(drag.pointTransform)applyPointTransformValue(drag.pointTransform==='SCALE'?Math.log(parsed.value):parsed.value);else applyTranslationFront(next.axis==='Y'?0:parsed.value/100,next.axis==='Y'?parsed.value/100:0);}
    else if(next.axisChanged&&drag.pointTranslate){const delta=pointMoveState();applyTranslationFront(next.axis==='Y'?0:delta.x/100,next.axis==='X'?0:delta.y/100);}
    loadFields();queuePreview();status();return true;
  }
  function moveProfile(p,{freeAngle=false,precision=false}={}){
    const r=drag.ring,now=polar(r,p),initial=drag.startPolar,profile=drag.section.profile,working=structuredClone(profile),knot=working.find(n=>n.id===drag.knotId);
    if(!initial||!knot)return;
    if(drag.pointTransform){movePointTransform({x:now.radius*Math.cos(now.angle),y:now.radius*Math.sin(now.angle)},{precision});return;}
    if(drag.pointTranslate){
      const input={x:now.radius*Math.cos(now.angle),y:now.radius*Math.sin(now.angle)},previous=drag.translationInput||{x:initial.radius*Math.cos(initial.angle),y:initial.radius*Math.sin(initial.angle)};
      drag.translationInput=input;
      if(drag.pointInput)return;
      const factor=precision?.1:1,dx=(drag.translationDelta?.x||0)+(input.x-previous.x)*factor,dy=(drag.translationDelta?.y||0)+(input.y-previous.y)*factor;
      if(drag.pointAxis){const delta=transformFront({x:dx,y:dy});applyTranslationFront(drag.pointAxis==='Y'?0:delta.x,drag.pointAxis==='X'?0:delta.y);}else applyPointTranslation(dx,dy);return;
    }
    if(drag.pointIds.length>1){
      const a=radians(drag.knot.angle),delta=now.radius*Math.cos(now.angle-a)-initial.radius*Math.cos(initial.angle-a),direct=isDirectTrunkForm(draft);
      const next=pullTrunkSectionPoints(profile,drag.pointIds,{delta:Math.abs(delta)<1e-10?0:delta,radiusAt:drag.pointRadiusAt,smooth:Boolean(drag.wholeSample)&&drag.wholeTool==='SOFT',reach:drag.wholeReach,min:direct?.001:.15,max:direct?64:4});
      if(writeProfilePoints(next)&&next.some((p,i)=>p.radius!==profile[i].radius))clearCapture(section());return;
    }
    if(drag.wholeSample&&(drag.wholeTool==='SOFT'||!freeAngle)){
      const a=radians(drag.knot.angle),delta=now.radius*Math.cos(now.angle-a)-initial.radius*Math.cos(initial.angle-a);
      const next=pullWholeTrunkContour(profile,{angle:drag.knot.angle,delta:Math.abs(delta)<1e-10?0:delta,radiusAt:drag.wholeRadiusAt,reach:drag.wholeReach,single:drag.wholeTool==='POINT'});
      if(writeProfilePoints(next)&&next.some((p,i)=>p.radius!==profile[i].radius))clearCapture(section());return;
    }
    const sorted=[...profile].sort((a,b)=>a.angle-b.angle),i=sorted.findIndex(n=>n.id===knot.id),original=drag.knot;
    let low=sorted[(i+sorted.length-1)%sorted.length].angle,high=sorted[(i+1)%sorted.length].angle;
    if(low>=original.angle)low-=360;if(high<=original.angle)high+=360;
    if(drag.lastAngle===null)drag.lastAngle=initial.angle;
    drag.angleDelta+=signedAngleDelta(drag.lastAngle,now.angle);drag.lastAngle=now.angle;
    const angle=original.angle+drag.angleDelta*180/Math.PI;
    const separation=Math.min(2,(original.angle-low)/3,(high-original.angle)/3),appliedAngle=Math.max(low+separation,Math.min(high-separation,angle));
    knot.angle=wrap(appliedAngle);drag.angleDelta=(appliedAngle-original.angle)*Math.PI/180;
    if(drag.wholeSample){const physical=drag.wholeRadiusAt(radians(original.angle))+now.radius-initial.radius;
      knot.radius=Math.max(.001,Math.min(64,drag.wholeSample(radians(appliedAngle))*physical/Math.max(.0001,drag.wholeRadiusAt(radians(appliedAngle)))));
    }else if(isDirectTrunkForm(draft)){
      const oval=drag.section.oval,carrierOval=(r.ovalX||1)/oval,base=angle=>Math.max(.0001,r.localRadius*trunkSectionEllipseRadius(oval,angle)*trunkSectionEllipseRadius(carrierOval,angle));
      const physical=original.radius*base(radians(original.angle))+now.radius-initial.radius;
      knot.radius=Math.max(.001,Math.min(64,physical/base(radians(appliedAngle))));
    }else{const base=Math.max(.0001,initial.radius/original.radius);knot.radius=Math.max(.15,Math.min(4,original.radius+(now.radius-initial.radius)/base));}
    if(Math.abs(knot.angle-original.angle)<1e-10)knot.angle=original.angle;if(Math.abs(knot.radius-original.radius)<1e-10)knot.radius=original.radius;
    if(writeProfilePoints(working)&&(knot.angle!==original.angle||knot.radius!==original.radius))clearCapture(section());
  }
  function writeSectionGroup(source,action,value){
    const localRoll=action==='TWIST'&&!isDirectTrunkForm(draft),result=transformTrunkSectionGroup(source,source.map(s=>s.id),action,value,{localRoll}),key=localRoll?'roll_offset':{SLIDE:'t',TWIST:'roll',RADIUS:'radius'}[action];
    for(const update of result.updates){const s=draft.sections.find(s=>s.id===update.id),original=source.find(s=>s.id===update.id);if(!s)continue;if(localRoll&&update[key]===0&&!original.roll_offset)delete s[key];else s[key]=update[key];
      if(action!=='SLIDE'){if(s[key]!==original[key])clearCapture(s);else for(const field of ['contour_capture','capture_error']){if(original[field])s[field]=structuredClone(original[field]);else delete s[field];}}
    }return result;
  }
  function applyRingTransform(action,value){
    const result=writeSectionGroup(drag.ringSections||[drag.originalSection],action,value);drag.ringValue=result.value;drag.ringLimited=result.limited;
  }
  function moveTwist(angle){if(drag.lastAngle===null){drag.lastAngle=angle;return;}drag.angleDelta+=signedAngleDelta(drag.lastAngle,angle);drag.lastAngle=angle;applyRingTransform('TWIST',drag.angleDelta*180/Math.PI);}
  function nudgeProfilePoint(axis,amount){
    if(!['RADIUS','ANGLE'].includes(axis)||!Number.isFinite(amount))return false;
    const state=profilePointState();if(!state.selected||state.active&&!state.nudge||!usable())return false;
    if(state.selectedCount>1&&axis==='ANGLE'){status('多选先用上下键推拉；绕圈移动请单选一个点');api.toast('多选点暂只支持径向推拉');return false;}
    if(!drag){if(!beginPointNudge())return false;drag.pointNudge=true;}
    if(axis==='RADIUS')drag.nudgeRadius=drag.groupNudgeBounds?Math.max(drag.groupNudgeBounds[0],Math.min(drag.groupNudgeBounds[1],drag.nudgeRadius+amount)):Math.max(-.999,drag.nudgeRadius+amount);else drag.nudgeAngle+=radians(amount);
    const r=drag.ring,a=drag.startPolar.angle+drag.nudgeAngle,size=drag.startPolar.radius*(1+drag.nudgeRadius),direct=isDirectTrunkForm(draft);
    const p=V(r.center).addScaledVector(V(r.rolledX||r.x),Math.cos(a)*size*(direct?1:r.ovalX||1)).addScaledVector(V(r.rolledY||r.y),Math.sin(a)*size*(direct?1:r.ovalY||1));
    moveProfile(p,{freeAngle:true});const applied=profilePoints(section()).find(p=>p.id===drag.knotId),appliedAngle=signedAngleDelta(radians(drag.knot.angle),radians(applied.angle));
    // Reset only at a real bound: sampled frames have small floating-point
    // errors which must not accumulate into ordinary repeated key steps.
    if(Math.abs(appliedAngle-drag.nudgeAngle)>1e-6){drag.nudgeAngle=appliedAngle;drag.lastAngle=radians(applied.angle);}
    if(drag.pointIds.length===1&&(applied.radius===(direct?.001:.15)||applied.radius===(direct?64:4))){
      let physical;if(drag.wholeSample)physical=drag.wholeRadiusAt(radians(applied.angle))*applied.radius/drag.wholeSample(radians(applied.angle));
      else if(direct){const oval=drag.section.oval,carrierOval=(r.ovalX||1)/oval;physical=applied.radius*Math.max(.0001,r.localRadius*trunkSectionEllipseRadius(oval,radians(applied.angle))*trunkSectionEllipseRadius(carrierOval,radians(applied.angle)));}
      else physical=applied.radius*drag.startPolar.radius/drag.knot.radius;
      drag.nudgeRadius=physical/drag.startPolar.radius-1;
    }
    loadFields();queuePreview();status(`方向键微调 ${drag.pointIds.length} 点 · 松键确认，Esc 取消`);return true;
  }
  function beginPointNudge(){const state=profilePointState(),r=section()&&ringAt(section().t),knot=profilePoints(section()).find(p=>p.id===state.selected);if(!r||!knot||!startDrag('PROFILE',r,knotPosition(r,radians(knot.angle)),knot.id))return false;drag.wholeTool='POINT';drag.nudgeRadius=drag.nudgeAngle=0;gesture.label=state.selectedCount>1?'微调所选轮廓控制点':'微调轮廓控制点';return true;}
  function editPointOffset(value){
    const state=profilePointState();if(!usable()||!state.selected||state.active&&!state.offsetActive||!Number.isFinite(value)||value< -99.9||value>200)return false;
    if(!drag){if(!beginPointNudge())return false;drag.pointOffset=true;}
    drag.nudgeRadius=value/100;const r=drag.ring,a=drag.startPolar.angle,size=drag.startPolar.radius*(1+drag.nudgeRadius),direct=isDirectTrunkForm(draft);
    moveProfile(V(r.center).addScaledVector(V(r.rolledX||r.x),Math.cos(a)*size*(direct?1:r.ovalX||1)).addScaledVector(V(r.rolledY||r.y),Math.sin(a)*size*(direct?1:r.ovalY||1)));
    loadFields();queuePreview();status(`推拉所选 ${drag.pointIds.length} 点 · 偏移 ${value}% · Enter 确认，Esc 取消`);return true;
  }
  function beginFront(kind,id,point,{translate=false,transform=null,keyboard=false}={}){
    if(!usable()||!section())return false;const r=ringAt(section().t);if(!r)return false;
    const p=V(r.center).addScaledVector(V(r.x),point.x).addScaledVector(V(r.y),point.y);
    if(!startDrag(kind,r,p,id))return false;drag.pointTranslate=kind==='PROFILE'&&(translate||(isDirectTrunkForm(draft)||rootBaseFocused)&&wholeTool==='POINT');if(drag.pointTranslate)gesture.label=contourScope==='BASE'?'移动主点并带动子点':'移动所选子点';if(transform)beginPointTransform(transform);drag.pointKeyboard=keyboard;sectionMode=kind;if(kind==='TWIST')drag.lastAngle=Math.atan2(point.y,point.x);loadFields();drawHandles();return true;
  }
  function moveFront(kind,id,point,options){if(!drag||!gesture)return;const r=drag.ring;
    if(kind==='PROFILE')moveProfile(V(r.center).addScaledVector(V(r.x),point.x).addScaledVector(V(r.y),point.y),options);
    else moveTwist(Math.atan2(point.y,point.x));loadFields();queuePreview();status();
  }
  function quickHint(){const s=section();if(!s||!drag)return '';if(drag.pointTransform){const t=pointTransformState();return `${t.action==='ROTATE'?'R 旋转':'S 缩放'} ${drag.pointIds.length} 个选点 · ${t.action==='ROTATE'?t.value.toFixed(1)+'°':'×'+t.value.toFixed(3)} · ${t.scope==='SECTION'?'截面中心':'选点中心'}${t.limited?' · 已到轮廓边界':''} · 左键/Enter 确认 · 右键/Esc 取消`;}if(drag.kind==='PROFILE'){const m=pointMoveState();return `G 移动 ${drag.pointIds.length} 个选点 · ${m?.axis||'XY'} · X ${(m?.x||0).toFixed(2)} / Y ${(m?.y||0).toFixed(2)} cm${drag.translationLimited?' · 已到相邻点边界':''} · X/Y 限方向 / 输入厘米 / Shift 细调 · Enter 确认 / Esc 取消`;}const value=drag.kind==='SLIDE'?`${(s.t*100).toFixed(1)}%`:drag.kind==='TWIST'?`${sectionRoll(s).toFixed(1)}°（增量 ${(drag.ringValue||0).toFixed(1)}°）`:`${s.radius.toFixed(2)} 倍`;return `${drag.created?'Shift+D 复制并滑动':{SLIDE:(selectionScope==='RING'?'G':'Alt+G')+' 整圈沿干移动',TWIST:'R 整圈旋转',RADIUS:'S 整圈缩放'}[drag.kind]} · ${drag.ringSections?.length>1?'所选 '+drag.ringSections.length+' 圈 · ':''}${value}${drag.ringLimited?' · 已到边界':''} · 移动鼠标 · 左键/Enter 确认 · 右键/Esc 取消`;}
  function preparePointerDrag(coords){
    drag.startX=coords.x;drag.startY=coords.y;
    const rect=api.canvas.getBoundingClientRect();handles.updateWorldMatrix(true,false);
    if(drag.kind==='SLIDE'){
      drag.rings=handleGeometry().userData.radiusRings;
      const hit=projectSectionPosition(drag.rings,coords,api.camera,handles.matrixWorld,rect,{nearT:section().t,searchWindow:.2});drag.tOffset=section().t-(hit?.t??section().t);drag.slideProjectionT=hit?.t??section().t;drag.slideLastRaw=section().t;
    }
    if(drag.kind==='TWIST'){const angle=sectionPointerAngle(drag.ring,coords,api.camera,handles.matrixWorld,rect);drag.lastAngle=angle?.angle??null;drag.angleMode=angle?.mode;}
  }
  function beginQuickDrag(kind,{created=false}={}){
    if(!created&&(!usable()||gesture||drag||placement||conversion||pending||rangeOpen||dock.active))return false;
    const keepPointEditor=['SLIDE','TWIST','RADIUS'].includes(kind)&&sectionMode==='PROFILE'&&!created;
    if(created){sectionMode=kind;drawHandles();}else if(!keepPointEditor&&!setSectionMode(kind))return false;
    if(keepPointEditor){preparingWholeMode=kind;drawHandles();preparingWholeMode=null;}
    const h=handles.children.find(o=>o.isMesh&&o.userData.id===sectionId&&o.userData.action===kind),s=section(),r=s&&ringAt(s.t);if(!h||!r){if(created)cancel();return false;}
    const reference=screenPoint(h.position),rect=api.canvas.getBoundingClientRect();
    if(reference.z < -1 || reference.z > 1 || reference.x < rect.left || reference.x > rect.right || reference.y < rect.top || reference.y > rect.bottom){if(created)cancel();status('当前截面不在可见范围，请按 F 定位后再操作');api.toast('当前截面不在可见范围，请按 F 定位后再操作');return false;}
    const initial=lastPointer||{x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    if(!startDrag(kind,r,h.position)){if(created)cancel();return false;}
    // Start at the real handle, regardless of where the mouse happens to be.
    // Its screen offset prevents an initial jump and keeps curved sliding and
    // twist on the same projection path as a direct handle drag.
    drag.keyboard=true;drag.created=created;drag.screenOffset={x:reference.x-initial.x,y:reference.y-initial.y};preparePointerDrag(reference);
    api.canvas.focus({preventScroll:true});loadFields();drawHandles();status();return true;
  }
  function movePointerDrag(e){if(!drag)return;let hint;const rect=api.canvas.getBoundingClientRect();handles.updateWorldMatrix(true,false);
    if(drag.pointNudge)return;
    const coords=drag.keyboard?{x:e.clientX+drag.screenOffset.x,y:e.clientY+drag.screenOffset.y}:pointerXY(e);
    if(['PROFILE','SLIDE'].includes(drag.kind)&&!drag.keyboard&&!drag.moved){if(Math.hypot(coords.x-drag.startX,coords.y-drag.startY)<3)return;drag.moved=true;}
    if(drag.kind==='RADIUS')applyRingTransform('RADIUS',1+(coords.x-drag.startX)/100/drag.section.radius);
    else if(drag.kind==='SLIDE'){
      const hit=projectSectionPosition(drag.rings,coords,api.camera,handles.matrixWorld,rect,{nearT:drag.slideProjectionT??section().t,searchWindow:.2});if(hit){const raw=hit.t+drag.tOffset;applyRingTransform('SLIDE',drag.ringValue+(raw-drag.slideLastRaw)*(e.shiftKey?.1:1));drag.slideLastRaw=raw;drag.slideProjectionT=hit.t;}
    }else if(drag.kind==='TWIST'){
      const angle=sectionPointerAngle(drag.ring,coords,api.camera,handles.matrixWorld,rect,{mode:drag.angleMode});if(angle)moveTwist(angle.angle);
    }else {
      const p=sectionPlanePoint(drag.ring,coords,api.camera,handles.matrixWorld,rect);
      if(p){if(drag.kind==='PROFILE')moveProfile(p,{freeAngle:e.altKey,precision:e.shiftKey});else{const next=polar(drag.ring,p);buttress().angle=wrap(Math.round(next.angle*180/Math.PI));buttress().length=Math.max(0,Math.min(6,drag.root.length+(next.radius-drag.startPolar.radius)/Math.max(.0001,drag.ring.localRadius||target.startRadius)));}}
      else if(drag.kind==='PROFILE')hint='当前截面接近侧视；可在正视小窗继续拖动蓝点';
    }
    loadFields();queuePreview();status(hint);
  }
  function unchangedDrag(){if(drag.kind==='ROOT')return !drag.created&&drag.rootSources.every(before=>JSON.stringify(draft.buttresses.find(p=>p.id===before.id))===JSON.stringify(before));if(drag.ringSections)return !drag.created&&drag.ringSections.every(before=>JSON.stringify(draft.sections.find(s=>s.id===before.id))===JSON.stringify(before));return !drag.created&&(drag.kind==='BUTTRESS'?JSON.stringify(buttress())===JSON.stringify(drag.root):JSON.stringify(section())===JSON.stringify(drag.originalSection||drag.section));}
  function finishDrag(){
    if(!drag)return false;
    if(!pointInputValid()){status('请输入有效数值，或用 Backspace 清空 / Esc 取消');return false;}
    const unchanged=unchangedDrag();
    api.controls.enabled=controlEnabled;
    if(unchanged){cancel();status();return true;}drag=null;return commit();
  }
  function pointEditing(){return enabled&&region==='SECTION'&&!rangeOpen&&editPart==='SECTION'&&sectionMode==='PROFILE'&&section()&&!coveredSection();}
  function worldKnotHit(e,max=12){const r=section()&&ringAt(section().t);if(!r)return null;root.updateWorldMatrix(true,true);let best=null;for(const p of profilePoints(section())){const screen=screenPoint(knotPosition(r,radians(p.angle)),false),distance=Math.hypot(e.clientX-screen.x,e.clientY-screen.y);if(screen.z>=-1&&screen.z<=1&&distance<=max&&(!best||distance<best.distance))best={id:p.id,screen,distance};}return best;}
  function worldContourPoint(e){const r=section()&&ringAt(section().t);root.updateWorldMatrix(true,true);if(!r||hitSectionPolyline(ringData(r),pointerXY(e),p=>screenPoint(p,false),{loop:true,radius:12})===null)return null;const p=sectionPlanePoint(r,pointerXY(e),api.camera,handles.matrixWorld,api.canvas.getBoundingClientRect());if(!p)return null;const v=p.sub(V(r.center));return {x:v.dot(V(r.x)),y:v.dot(V(r.y))};}
  function updateWorldCursor(e){
    pointCursor.hide();if(!pointEditing()||gesture||drag||pending||worldBox||dock.active||!usable()||e.metaKey||document.activeElement?.matches('input,textarea,select')||document.activeElement?.isContentEditable||document.querySelector('dialog[open]'))return;
    if(selectionScope==='RING'&&!e.altKey&&(e.shiftKey||e.ctrlKey)){const circle=hitRingSelection(e);if(circle)pointCursor.show(pointerXY(e),e.ctrlKey?'REMOVE':'ADD',e.ctrlKey&&!ringSelection().includes(circle.userData.id),e.ctrlKey?'Ctrl 点击减选整圈':'Shift 点击加选整圈');return;}
    if(e.ctrlKey||!e.shiftKey&&!e.altKey)return;const knot=worldKnotHit(e),s=profilePointState();
    if(e.altKey&&(knot||worldContourPoint(e)))pointCursor.show(pointerXY(e),'REMOVE',!knot||s.count<=3);else if(e.shiftKey&&!worldKnotHit(e,6)&&worldContourPoint(e))pointCursor.show(pointerXY(e),'ADD',s.count>=s.limit);
  }
  function cancelWorldBox(){if(!worldBox)return;const g=worldBox;worldBox=null;worldBoxNode.hidden=true;api.controls.enabled=g.controls;if(api.canvas.hasPointerCapture(g.pointerId))api.canvas.releasePointerCapture(g.pointerId);drawHandles();}
  function moveWorldBox(e){const g=worldBox;if(!g)return;root.updateWorldMatrix(true,true);const a=Math.min(g.x,e.clientX),b=Math.max(g.x,e.clientX),c=Math.min(g.y,e.clientY),d=Math.max(g.y,e.clientY),rect=api.canvas.getBoundingClientRect(),r=ringAt(section().t);g.candidates=profilePoints(section()).filter(p=>{const q=screenPoint(knotPosition(r,radians(p.angle)),false);return q.z>=-1&&q.z<=1&&q.x>=Math.max(a,rect.left)&&q.x<=Math.min(b,rect.right)&&q.y>=Math.max(c,rect.top)&&q.y<=Math.min(d,rect.bottom);}).map(p=>p.id);Object.assign(worldBoxNode.style,{left:a+'px',top:c+'px',width:(b-a)+'px',height:(d-c)+'px'});drawHandles();status(`树上框选 · ${g.candidates.length} 个候选点 · 松手选择，Esc 取消`);}
  function beginWorldPointMove(action='MOVE'){
    const state=profilePointState(),r=section()&&ringAt(section().t);
    if(!state.selected||state.active||!usable()||!r)return false;
    const p=knotPosition(r,radians(state.point.angle)),reference=screenPoint(p),rect=api.canvas.getBoundingClientRect();
    const visible=q=>q.z>=-1&&q.z<=1&&q.x>=rect.left&&q.x<=rect.right&&q.y>=rect.top&&q.y<=rect.bottom;
    const offscreen=()=>{status('当前选点不在可见范围，请按 F 定位或在正视图操作');api.toast('当前选点不在可见范围，请按 F 定位或在正视图操作');};
    if(!visible(reference)){offscreen();return false;}
    const initial=lastPointer||{x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    if(!sectionPlanePoint(r,reference,api.camera,handles.matrixWorld,rect)){api.toast('当前截面接近侧视；请在正视图用 G / R / S 调整选点');return false;}
    if(!startDrag('PROFILE',r,p,state.selected))return false;
    drag.pointTranslate=drag.keyboard=true;gesture.label='移动所选轮廓控制点';let anchor=reference;
    if(action!=='MOVE'){beginPointTransform(action);anchor=screenPoint(transformLocal(drag.transformReference));}
    if(!visible(anchor)){cancel();offscreen();return false;}
    drag.screenOffset={x:anchor.x-initial.x,y:anchor.y-initial.y};preparePointerDrag(anchor);
    api.canvas.focus({preventScroll:true});loadFields();drawHandles();status();return true;
  }

  api.canvas.addEventListener('pointerdown',e=>{if(rangeOpen)return;if(detailControls.pointerDown(e)){consume(e);return;}if(!enabled||editPart==='DETAIL'||e.button!==0||!usable())return;if(region==='ROOT'&&gesture?.rootPreset){consume(e);if(!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey)commit();return;}if(gesture?.rootPlane){consume(e);if(!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey)commit();return;}const h=hitHandle(e);
    if(h?.userData.kind==='root-base'){if(!gesture&&!drag&&!placement&&!conversion&&!pending&&!dock.active)editRootBase();consume(e);return;}
    if(region==='ROOT'&&h?.userData.kind==='section'){
      if(gesture||drag||placement||conversion||pending||dock.active){consume(e);return;}
      if(setRegion('SECTION'))selectRingSection(h.userData.id);api.canvas.focus({preventScroll:true});consume(e);return;
    }
    if(!gesture&&!drag&&!placement&&!dock.active&&!e.altKey&&!e.metaKey&&(e.shiftKey||e.ctrlKey)){const circle=selectionScope==='RING'?hitRingSelection(e):h?.userData.kind==='section'&&h.userData.action==='SELECT'&&h.userData.id!==sectionId?h:null;if(circle){api.canvas.focus({preventScroll:true});selectRingSection(circle.userData.id,{mode:e.ctrlKey?'SUBTRACT':'ADD'});consume(e);return;}}
    if(pointEditing()&&!gesture&&!drag&&!placement&&!dock.active){
      const knot=worldKnotHit(e);pointCursor.hide();
      if(e.altKey&&!e.ctrlKey&&!e.metaKey){if(knot)removeProfilePoint(knot.id);consume(e);return;}
      if(e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!worldKnotHit(e,6)){const point=worldContourPoint(e);if(point){insertProfilePoint(point);consume(e);return;}}
      if(!knot&&(!h||h.userData.kind==='section'&&h.userData.id===sectionId&&h.userData.action==='SELECT')){worldBox={x:e.clientX,y:e.clientY,pointerId:e.pointerId,candidates:[],ringCandidate:h?.userData.action==='SELECT'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey,mode:e.ctrlKey?'SUBTRACT':e.shiftKey?'ADD':'REPLACE',controls:api.controls.enabled};api.controls.enabled=false;worldBoxNode.hidden=false;moveWorldBox(e);api.canvas.focus({preventScroll:true});api.canvas.setPointerCapture(e.pointerId);consume(e);return;}
      if(knot&&(e.shiftKey||e.ctrlKey)){selectProfilePoint(knot.id,{mode:e.ctrlKey?'SUBTRACT':'ADD'});consume(e);return;}
    }

    if(!h){if(overlay){const r=api.canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,api.camera);previewRoot.updateWorldMatrix(true,true);if(ray.intersectObject(overlay.object).length){consume(e);return;}}return;}
    if(region==='ROOT'){consume(e);return;}
    if(h.userData.kind==='profile'&&(e.shiftKey||e.ctrlKey)){if(gesture||drag||placement){consume(e);return;}sectionId=h.userData.id;sectionMode='PROFILE';hoverKnotId=h.userData.knotId;revealControls('section');loadFields();selectProfilePoint(h.userData.knotId,{mode:e.ctrlKey?'SUBTRACT':'ADD'});consume(e);return;}
    if(h.userData.kind==='buttress')buttressId=h.userData.id;else{if(sectionId!==h.userData.id)hoverKnotId='';sectionId=h.userData.id;}
    if(h.userData.kind==='profile'){sectionMode='PROFILE';hoverKnotId=h.userData.knotId;dock.closePresets();}
    revealControls(h.userData.kind==='buttress'?'buttress':'section');loadFields();drawHandles();
    if(h.userData.action==='SELECT'){api.canvas.focus({preventScroll:true});selectRingSection(h.userData.id);consume(e);return;}
    if(h.userData.ringMoveHandle){api.canvas.focus({preventScroll:true});selectRingSection(h.userData.id,{keepGroup:true});}
    const r=h.userData.kind==='buttress'?ringAt(0,isDirectTrunkForm(draft)?finalGeometry():handleGeometry()):ringAt(section().t),kind=h.userData.kind==='profile'?'PROFILE':h.userData.kind==='buttress'?'BUTTRESS':h.userData.action;
    if(!r)return;handles.updateWorldMatrix(true,false);
    const grabbed=['PROFILE','BUTTRESS'].includes(kind)?sectionPlanePoint(r,pointerXY(e),api.camera,handles.matrixWorld,api.canvas.getBoundingClientRect()):null;
    if(!startDrag(kind,r,grabbed||h.position,h.userData.knotId))return;
    drag.pointTranslate=kind==='PROFILE'&&(isDirectTrunkForm(draft)||rootBaseFocused)&&wholeTool==='POINT';if(drag.pointTranslate)gesture.label=contourScope==='BASE'?'移动主点并带动子点':'移动所选子点';
    preparePointerDrag(pointerXY(e));
    drawHandles();
    api.canvas.setPointerCapture(e.pointerId);consume(e);
  },true);
  api.canvas.addEventListener('pointermove',e=>{worldHoverPointer={...pointerXY(e),clientX:e.clientX,clientY:e.clientY,shiftKey:e.shiftKey,altKey:e.altKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey};if(worldBox){moveWorldBox(e);consume(e);return;}updateWorldCursor(e);if(detailControls.pointerMove(e)){consume(e);return;}if(editPart==='DETAIL')return;if(drag){consume(e);movePointerDrag(e);return;}if(!enabled||gesture||placement||!usable())return;const h=hitHandle(e),hover=h?.userData.kind==='section'?h.userData.id:'',knot=h?.userData.kind==='profile'?h.userData.knotId:'';if(hover!==hoverSectionId||knot!==hoverKnotId){hoverSectionId=hover;hoverKnotId=knot;drawHandles();}},true);
  api.canvas.addEventListener('pointerleave',()=>{pointCursor.hide();worldHoverPointer=null;if(hoverSectionId||hoverKnotId){hoverSectionId=hoverKnotId='';drawHandles();}},true);
  api.canvas.addEventListener('pointerup',e=>{if(worldBox){const g=worldBox;cancelWorldBox();if(g.ringCandidate&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<3)setSelectionScope('RING');else selectProfilePoints(g.candidates,{mode:g.mode});consume(e);return;}if(detailControls.pointerUp(e)){consume(e);return;}if(!drag||drag.keyboard)return;consume(e);finishDrag();},true);
  api.canvas.addEventListener('lostpointercapture',()=>{if(worldBox||drag&&!drag.keyboard)cancel();},true);
  api.canvas.addEventListener('pointercancel',()=>cancel(),true);
  api.canvas.addEventListener('dblclick',e=>{if(region==='ROOT'){consume(e);return;}if(editPart==='DETAIL'){if(enabled)consume(e);return;}if(performance.now()<blockDoubleUntil||pointEditing()&&(e.shiftKey||e.altKey||e.ctrlKey||e.metaKey)){consume(e);return;}if(!enabled||e.button!==0||!usable()||gesture||placement)return;
    if(hitHandle(e)){consume(e);return;}
    const t=surfacePosition(pointerXY(e));if(t!==null){consume(e);addSection(t);}
  },true);
  function key(e){
    if(enabled&&region==='ROOT'&&rootKey(e))return true;
    if(conversion&&!e.defaultPrevented&&!e.isComposing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!e.target?.isContentEditable&&!e.target?.matches?.('input,textarea,select')&&!document.querySelector('dialog[open]')&&['q','f'].includes(e.key?.toLowerCase())){if(!e.repeat){if(e.key.toLowerCase()==='q')setConversionComparison(!conversion.original);else focusSection();}return true;}
    if(gesture?.loft&&!e.defaultPrevented&&!e.isComposing&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.target?.matches?.('input,textarea,select')){cancel();return true;}
    if(enabled&&rangeOpen&&!e.defaultPrevented&&!e.isComposing&&!document.querySelector('dialog[open]')){
      if(dock.rangeKey(e))return true;
      const typing=e.target?.isContentEditable||e.target?.matches?.('input,textarea,select');
      if(!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key==='?'){if(!gesture)dock.toggleShortcuts();return true;}
      const rangeWorkflow=trunkWorkflowShortcut(e,{enabled:true,typing,dialogOpen:false});if(rangeWorkflow){if(!gesture){closeRange();if(rangeWorkflow==='MESH')revealMesh();else setWorkflowStage(rangeWorkflow);}return true;}
      if(gesture?.range&&(e.ctrlKey||e.metaKey)&&!typing&&e.key.toLowerCase()==='z'){cancel();return true;}
      if(!typing&&!e.ctrlKey&&!e.metaKey){const action=trunkSectionShortcut(e,{enabled:true,active:Boolean(gesture),typing:false});if(action){if(!gesture&&['PREVIOUS','NEXT'].includes(action))cycleSection(action==='PREVIOUS'?-1:1);else if(action==='FOCUS')focusSection();else if(action==='EXIT'&&!gesture)finishWorkspace();return true;}}
      if((e.ctrlKey||e.metaKey)&&!typing&&(['a','d','i'].includes(e.key.toLowerCase())||e.shiftKey&&['c','v'].includes(e.key.toLowerCase())))return true;
      return false;
    }
    if(enabled&&editPart==='SECTION'&&selectionScope==='RING'&&!e.defaultPrevented&&!e.isComposing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!e.target?.isContentEditable&&!e.target?.matches?.('input,textarea,select')&&!document.querySelector('dialog[open]')){
      const action={g:'SLIDE',r:'TWIST',s:'RADIUS'}[e.key.toLowerCase()];
      if(action){if(!e.repeat&&!gesture&&!drag&&!pending&&!dock.active)beginQuickDrag(action);return true;}
      if(['Delete','Backspace'].includes(e.key||e.code)){if(!e.repeat){if(gesture||drag||placement||conversion||pending||dock.active)status('先确认或取消当前调节，再删除所选圈');else removeSection();}return true;}
    }
    if(e.target===api.canvas&&pointTransformKey(e))return true;
    if(pointEditing()&&(e.target===api.canvas||e.target?.closest?.('#sectionFrontSvg,.section-point-tools'))&&!e.defaultPrevented&&!e.isComposing&&e.ctrlKey&&e.shiftKey&&!e.altKey&&!e.metaKey&&!document.querySelector('dialog[open]')&&!e.target?.matches?.('input,textarea,select')&&['c','v'].includes(e.key.toLowerCase())){if(!e.repeat)(e.key.toLowerCase()==='c'?copyContourShape:previewContourPaste)();return true;}
    if((gesture?.preset||gesture?.contourPaste||gesture?.loft)&&!e.defaultPrevented&&!e.isComposing&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!document.querySelector('dialog[open]')){if(e.key==='Escape'){cancel();return true;}if(e.key==='Enter'&&!e.target?.matches?.('input,textarea,select')&&!e.target?.isContentEditable){commit();return true;}}
    if(worldHoverPointer&&['Shift','Alt','Control','Meta'].includes(e.key)){Object.assign(worldHoverPointer,{shiftKey:e.shiftKey,altKey:e.altKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey});updateWorldCursor(worldHoverPointer);}
    const pointContext=pointEditing()&&e.target===api.canvas&&!e.defaultPrevented&&!e.isComposing&&!e.target?.isContentEditable&&!document.querySelector('dialog[open]');
    if(worldBox&&e.key==='Escape'){cancelWorldBox();return true;}
    if(pointContext&&!e.metaKey&&!e.altKey){
      if(e.ctrlKey&&!e.shiftKey&&['a','d','i'].includes(e.key.toLowerCase())){if(!gesture&&!drag&&!pending){const points=profilePoints(section());selectProfilePoints(e.key.toLowerCase()==='d'?[]:points.filter(p=>e.key.toLowerCase()==='a'||selectionScope==='RING'||!selectedKnotIds.has(p.id)).map(p=>p.id));}return true;}
      if(!e.ctrlKey&&!e.shiftKey){if(e.key.toLowerCase()==='b'){if(!e.repeat&&!gesture&&!drag&&!pending&&!dock.active){api.canvas.focus({preventScroll:true});status('左键拖空白直接框选 · Shift 加选 · Ctrl 减选 · G 移动 / Delete 删选点');}return true;}if(['Delete','Backspace'].includes(e.key)){if(!e.repeat)removeProfilePoint();return true;}if(['g','r','s'].includes(e.key.toLowerCase())){if(!e.repeat&&!gesture&&!drag&&!pending&&!dock.active){if(profilePointState().selected)beginWorldPointMove({g:'MOVE',r:'ROTATE',s:'SCALE'}[e.key.toLowerCase()]);else status('先点选或拖空白框选；点「选整圈」后 G / R / S 操作整圈');}return true;}}
    }
    if(enabled&&!e.defaultPrevented&&!e.isComposing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key==='?'&&!e.target?.isContentEditable&&!e.target?.matches?.('input,textarea,select')&&!document.querySelector('dialog[open]')){if(!e.repeat&&!gesture&&!drag&&!placement&&!conversion&&!pending&&!dock.active&&!detailControls.active)(editPart==='DETAIL'?detailControls:dock).toggleShortcuts();return true;}
    const workflowAction=trunkWorkflowShortcut(e,{enabled,typing:e.target?.isContentEditable||e.target?.matches?.('input,textarea,select'),dialogOpen:Boolean(document.querySelector('dialog[open]'))});
    if(workflowAction){
      if(conversion&&workflowAction==='SHAPE'){setWorkflowStage('SHAPE');return true;}
      if(gesture||drag||placement||conversion||pending||detailControls.active||dock.active||!usable()){status('先确认或取消当前调节，再切换分区');return true;}
      if(workflowAction==='MESH')revealMesh();else setWorkflowStage(workflowAction);return true;
    }
    if(dock.key(e))return true;
    if(gesture?.mesh&&!e.defaultPrevented&&!e.isComposing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&e.key==='Escape'&&!document.querySelector('dialog[open]')){cancel();return true;}
    if(detailControls.key(e))return true;if(enabled&&editPart==='DETAIL'){if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.target?.matches?.('input,textarea,select')&&(e.key?.toLowerCase()==='n'||e.code==='KeyN')){status('N 用于截面放置；点击「截面」后使用。表面细节按 A 添加。');return true;}return false;}
    const typing=e.target?.isContentEditable||e.target?.matches?.('input,textarea,select,[contenteditable="true"]'),dialogOpen=Boolean(document.querySelector('dialog[open]'));
    // Numeric controls also support Escape before the viewport mode is opened.
    if(!enabled&&!dialogOpen&&!e.defaultPrevented&&!e.isComposing&&e.key==='Escape'&&(gesture||drag)){cancel();return true;}
    const action=trunkSectionShortcut(e,{enabled,active:Boolean(gesture||drag),typing,dialogOpen});if(!action)return false;
    if(action==='CANCEL'){cancel();return true;}
    if(action==='ESCAPE'){if(gesture||drag||placement||conversion||dock.active)cancel();else dock.back();return true;}
    if(action==='CONFIRM'){if(conversion)confirmConversion();else if(placement)commit();else if(drag)finishDrag();else commit();return true;}
    if(action==='EXIT'){finishWorkspace();return true;}
    if(gesture||drag||dock.active){status('请先用左键/Enter 确认，或用右键/Esc 取消当前调节');return true;}
    if(!target){status('请先点选承重枝干，再按 N 添加截面');api.toast('请先点选承重枝干，再按 N 添加截面');return true;}
    if(action==='FOCUS'){focusSection();return true;}
    if(action==='PRESETS'||action==='SAVE_PRESET'){
      if(!section()){status('尚无当前截面，按 N 添加截面');return true;}
      if(action==='PRESETS')dock.togglePresets();else dock.openPresets({focusName:true});return true;
    }
    if(!usable()){const message=api.getAuthoring().overrides[target.stableId]?.locked?'当前枝干已锁定，请先解锁':pending||api.getAsset()?.group.userData.pending_rebuild?'正在确认本枝形体，请稍候':'请先结束当前编辑';status(message);api.toast(message);return true;}
    if(action==='ADD'){beginPlacement();return true;}
    if(!section()){status('尚无当前截面，按 N 添加截面');return true;}
    if(action==='DUPLICATE')duplicateSection();
    else if(action==='REMOVE')removeSection();
    else if(action==='PREVIOUS'||action==='NEXT')cycleSection(action==='PREVIOUS'?-1:1);
    else if(TRUNK_SECTION_MODE_ACTIONS.includes(action)){if(sectionMode==='PROFILE'&&action!=='PROFILE'&&!e.altKey){status('先点选或框选点，或点「选整圈」；G / R / S 跟随实际选区');return true;}dock.closePresets();if(action==='PROFILE')setSectionMode(action);else beginQuickDrag(action);}
    return true;
  }
  window.addEventListener('keydown',e=>{if(key(e))consume(e);},true);
  window.addEventListener('keyup',e=>{if(worldHoverPointer&&['Shift','Alt','Control','Meta'].includes(e.key)){Object.assign(worldHoverPointer,{shiftKey:e.shiftKey,altKey:e.altKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey});updateWorldCursor(worldHoverPointer);}},true);
  window.addEventListener('pointermove',e=>{
    if(enabled||e.target===api.canvas||drag?.keyboard)lastPointer=pointerXY(e);
    if(placement){if(e.target===api.canvas){consume(e);updatePlacement(pointerXY(e));}else if(placement.valid){placement.valid=false;drawHandles();status();}return;}
    if(drag?.keyboard){consume(e);movePointerDrag(e);}
  },true);
  window.addEventListener('pointerdown',e=>{
    if(e.target===api.canvas)lastPointer=pointerXY(e);
    if(gesture?.range&&e.target===api.canvas&&[0,2].includes(e.button)){consume(e);swallowPointer=e.pointerId;if(e.button===0)commit();else{blockContext=true;cancel();}return;}
    if(conversion){if(e.target===api.canvas){if(e.button===2){consume(e);swallowPointer=e.pointerId;blockContext=true;cancel();}return;}if(!e.target.closest?.('[data-trunk-conversion-controls],[data-trunk-view],[data-section-view],[data-trunk-stage],#sectionFrontView,#sectionEditorExpand,[data-section-action="focus"]'))cancel();return;}
    if(!drag?.keyboard&&!placement)return;
    if(e.target!==api.canvas){cancel();return;}
    consume(e);swallowPointer=e.pointerId;
    if(e.button===0){if(placement){updatePlacement(pointerXY(e));if(placement.valid){blockDoubleUntil=performance.now()+500;commit();}}else{if(drag.created)blockDoubleUntil=performance.now()+500;finishDrag();}}else if(e.button===2){blockContext=true;cancel();}
  },true);
  window.addEventListener('pointerup',e=>{if(swallowPointer===e.pointerId){swallowPointer=null;consume(e);}},true);
  api.canvas.addEventListener('contextmenu',e=>{if(enabled&&editPart==='DETAIL'){consume(e);if(detailControls.active||detailControls.armed)detailControls.cancel();return;}if(blockContext||drag?.keyboard||placement||conversion||gesture?.rootPreset||gesture?.rootPlane){blockContext=false;consume(e);cancel();}},true);
  api.canvas.addEventListener('wheel',e=>{if(drag?.keyboard||placement)consume(e);},{capture:true,passive:false});
  window.addEventListener('focusin',e=>{if((drag?.keyboard||placement)&&e.target!==api.canvas)cancel();},true);
  window.addEventListener('blur',()=>{pointCursor.hide();worldHoverPointer=null;if(worldBox||drag?.keyboard||placement||conversion)cancel();});
  window.addEventListener('resize',()=>{pointCursor.hide();worldHoverPointer=null;if(worldBox||drag?.keyboard||placement||conversion)cancel();});
  function refresh(){const previous=refreshReadCache;refreshReadCache=new WeakMap();try{return refreshImpl();}finally{refreshReadCache=previous;}}
  function refreshImpl(){
    panel.hidden=toggle.hidden=!api.isTree()||api.getTreeEditMode()!=='BONE';if(panel.hidden){enable(false);releasePreview();pending=null;target=null;return;}
    const next=carrier();if(gesture&&next?.stableId!==gesture.id)cancel();if(next?.stableId!==target?.stableId){region='SECTION';selectedRootIds.clear();rootSectionBefore=null;rootBaseFocused=false;rootBaseSession=null;directEditSession=null;resetRange();selectionScope='POINTS';selectedRingIds.clear();rememberPointSelection();selectedKnotId=selectedKnotKey=wholeDensityKey='';selectedKnotIds.clear();releaseViewPreview();releaseBaseGeometry();}
    if(pending){const built=api.getAsset();if(built&&!built.group.userData.pending_rebuild&&JSON.stringify(trunkFormForBranch(built.authoring,pending.id))===pending.stamp){releasePreview();pending=null;}}
    target=next;$('trunkFormBody').hidden=!target;$('trunkFormEmpty').hidden=Boolean(target);
    const selected=(api.getAsset()?.masterBranches||[]).find(b=>b.stableId===api.getSelection());
    $('trunkFormEmpty').firstChild.textContent=selected&&(selected.copySnapshot&&!selected.prefabCarrier||selected.localBundle)?'这类复制快照／局部独立枝暂不支持表面形体。可选择原始承重枝干，或':'点选一根承重主枝干，或';
    $('trunkFormTarget').textContent=target?`${target.stableId} · L${target.order} · 仅当前本枝${api.getSelections().size>1?'（多选中以最后选中的本枝为准）':''}${api.getAuthoring().overrides[target.stableId]?.locked?' · 已锁定':''}`:'未选择承重主枝干';
    const nextStamp=target?JSON.stringify([target.stableId,current(),Boolean(api.getAuthoring().overrides[target.stableId]?.locked)]):'';if(!gesture&&!pending&&nextStamp!==stamp){stamp=nextStamp;hoverKnotId='';if(directEditSession&&(directEditSession.id!==target?.stableId||directEditSession.source!==JSON.stringify(current()))){directEditSession=null;releaseViewPreview();}
      if(region==='SECTION'&&isTrunkRootBase(current()?.sections.find(s=>s.id===sectionId)))rootBaseFocused=true;
      if(rootBaseFocused&&region==='SECTION'&&contourScope==='FINAL'&&current()&&!isDirectTrunkForm(current())&&!directEditSession)directEditSession={id:target.stableId,source:JSON.stringify(current())};draft=target?prepareBaseDraft(directEditSession?createDirectTrunkForm(current()):structuredClone(current()||neutral())):null;if(draft&&!isDirectTrunkForm(draft)){editPart='SECTION';if(contourScope==='FINAL'){contourScope='BASE';sectionMode='PROFILE';selectionScope='POINTS';selectedRingIds.clear();}}loadFields();}
    prunePointSelections();
    const disabled=!target||Boolean(target&&api.getAuthoring().overrides[target.stableId]?.locked)||Boolean(pending)||Boolean(api.isBusy?.());
    panel.querySelectorAll('[data-trunk-preset],#trunkFormReset,#trunkSectionAdd,#trunkButtressAdd').forEach(b=>b.disabled=disabled||Boolean(conversion));updateFormUi();syncViewPreview();status();drawHandles();
    $('trunkSectionAdd').disabled=disabled||Boolean(conversion)||(draft?.sections.length||0)>=24;$('trunkButtressAdd').disabled=disabled||Boolean(conversion)||(draft?.buttresses.length||0)>=12;
  }
  return {root,refresh,key,cancel,withFinalVisibility(callback){const visible=wireRoot.visible;wireRoot.visible=false;try{return withFinalTrunkFormVisibility([overlay,viewOverlay],callback);}finally{wireRoot.visible=visible;}},deactivate(){enable(false);},resetInputs(){cancel();region='SECTION';selectedRootIds.clear();rootSectionBefore=null;rootBaseFocused=false;rootBaseSession=null;directEditSession=null;resetRange();selectionScope='POINTS';selectedRingIds.clear();detailControls.deactivate();releaseWire();wireEnabled=false;releasePreview();releaseViewPreview();releaseBaseGeometry();selectedKnotId=selectedKnotKey=wholeDensityKey='';selectedKnotIds.clear();pointMemory.clear();ringPointAnchors.clear();contourClipboard=null;dock.resetViews();pending=null;target=null;stamp='';},flushPending(){if(!detailControls.flush())return false;if(dock.active&&!drag){status('请先完成图窗操作');return false;}if(gesture?.rootPlane){status('请先确认或取消根盘方向预览，再保存或导出');return false;}if(gesture?.range){status('请先确认或取消区段预览，再保存或导出');return false;}if(gesture?.loft){status('请先确认或取消层间过渡试用，再保存或导出');return false;}if(gesture?.preset||gesture?.contourPaste||gesture?.rootPreset){status('请先确认或取消'+(gesture.rootPreset?'板根形状试用':gesture.contourPaste?'轮廓套用试用':'整圈预设试用')+'，再保存或导出');return false;}if(conversion){status('请先确认直接截面试用，或取消恢复旧版');return false;}if(!commit())throw Error(captureBlockMessage()||(placement?'请先在当前本枝表面放置截面，或按 Esc 取消':'请先修正主干形体中的无效数值'));return true;},reveal(){panel.open=true;},get previewStats(){return previewQueue.stats;},get context(){return {part:editPart,...detailControls.context,stage:displayWorkflowStage(),preparing:Boolean(conversion),compatibility:Boolean(directEditSession),region,rootSelection:rootSelection()};},get active(){return Boolean(gesture||drag||pending||conversion||detailControls.active||dock.active);},get enabled(){return enabled;}};
}
