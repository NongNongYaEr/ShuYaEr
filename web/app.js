import {createWindPreview} from './wind-preview.js';
import {normalizeWindPreview} from './wind-preview-settings.js';
import {nativeModelRevision,markNativeModelChanged} from './native-model-changes.js';
import {upgradeStructuralCurves} from './branch-kernel.js';
import {sealCompiledSampleMaterials,compiledSampleCacheStats,compiledSampleHistoryStats} from './compiled-sample-cache.js';
import {withAssemblyReadScope} from './assembly-distribution.js';
import {createAuthoringDraft} from './authoring-draft.js';
import {createSkeletonDisplay} from './skeleton-display.js';
import { createProjectSession } from './project-session.js';
import {createNativeViewport} from './native-viewport.js';
import {createPerformanceRecorder} from './performance-recorder.js';
import {updateBarkMaterialResources} from './bark-material-update.js';
import {createGeometryJobClient} from './geometry-job-client.js';
import {prepareBackgroundTrunks} from './trunk-background-geometry.js';
import {prepareBackgroundSkeleton,rememberPreparedSkeleton} from './skeleton-background-geometry.js';
import {updateTrunkSurfaceResources} from './trunk-surface-update.js';
import {createWebGLGpuTimer} from './webgl-gpu-timer.js';
import {instantiateNativeGeometryKernel} from './native-geometry-kernel.js';
import {installGeometryAccelerator,geometryAcceleratorState} from './geometry-accelerator.js';
import { collectExportMaterialBuckets } from './export-material-buckets.js';
import { createBarkMaterialControls } from './bark-material-controls.js';
import {ensureDefaultTreeBark} from './bark-materials.js';
import { createTrunkPresetStore } from './trunk-preset-store.js';
import { loadDefaultTreeDocument } from './default-plant-project.js';
import { createProjectLoadFlow } from './project-load-flow.js';
import { createEditContext } from './edit-context.js';
import { layoutCurveHandles, pickCurveHandle } from './curve-handle-picking.js';
import {createCurveGuide,addCurveHandleOutline,disposeCurveGuide} from './curve-edit-overlay.js';
import {createCurvePointSelection,planCurvePointDeletion,planCurvePointInsertion} from './curve-point-selection.js';
import {bindCurvePointInteraction} from './curve-point-interaction.js';
import {controlCurveAxis,controlCurveOperation,evaluateControlCurve,writeControlCurve,controlCurveTransforms} from './branch-control-curve.js';
import {createPointCornerPreview} from './branch-point-preview.js';
import { createSizeReference } from './size-reference.js';
import { bindKeyboardTransform } from './keyboard-transform.js';
import { bindTemporaryBranchSelection } from './temporary-branch-selection.js';
import { createViewportSelectionMenu } from './viewport-selection-menu.js';
import { createPreviewHandoff } from './preview-handoff.js';
import { createDeferredEditRefresh } from './deferred-edit-refresh.js';
import { installIconReuse } from './icon-reuse.js';
import { resolveBranchEditScope, cutHasProtectedChildren } from './branch-edit-scope.js';
import { planBranchDeletion } from './branch-delete.js';
import { createPveCompleteExporter } from './pve-complete-dialog.js';
import { planUnitSourceRecovery, recoverUnitSources, verifyUnitSourceRecovery } from './unit-source-recovery.js';
import { reviewUnitSourceRecovery } from './unit-source-recovery-dialog.js';
import { createStaticVegetationExporter } from './static-vegetation-dialog.js';
import * as THREE from 'three';
import {configureViewportNavigation} from './viewport-navigation.js';
import { OrbitControls } from '/vendor/OrbitControls.js';
import { FBXExporter } from '@comfyorg/fbx-exporter-three';
import { zlibSync } from 'fflate';
import {
  DEFAULT_SETTINGS,
  LOD_PROFILES,
  PROJECT_FORMAT,
  analyzeGroup,
  applySpeciesPreset,
  buildBranchAsset,
  buildBranchAssetAsync,
  createBranchMaterials,
  createDefaultLeafGeometry,
  createManifest,
  createProjectDocument,
  deserializeGeometry,
  disposeBranchAsset,
  disposeBranchAssetAsync,
  disposeMaterials,
  hierarchyTexturePayload,
  normalizeSettings,
  parseObjLeaf,
} from './branch-kernel.js';
import { cloneAuthoring, migrateProjectDocument, normalizeAuthoring } from './authoring-state.js';
import { copy, equalData } from './branch-workbench-data.js';
import {
  applyTangentHandle, compileGenerationPlan, constrainPoint, curveInfluenceWeights, deformCurvePoints,
  closestPolylineStrokeHit, curveShortcutAction, evaluateTimeline, expandVariantMatrix, resamplePolyline, simplifyCurvePoints, smoothCurvePoints,
  subdivideCurvePoints, tangentHandles, trimCurvePoints,
} from './v4-tools.js';
import { createMaterialSetup, createPcgCsv, createRecipeDocument, createUeImportScript } from './ue-contract.js';
import { SCULPT_TOOLS, lineTangent,createSculptSnapshot } from './tree-sculpt.js';
import { createSculptController } from './tree-sculpt-controller.js';
import { createUnitCombController } from './unit-comb-controller.js';
import { mergeUnitAssemblySelection } from './unit-assembly-selection.js';
import { unitBranchIndex, resolveUnitEditScope } from './unit-branch-boundary.js';
import { legacyUnitBranches, legacyUnitInstances } from './legacy-unit-placement.js';
import { SELECTION_TOOLS, TRANSFORM_TOOLS, insidePolygon, descendants } from './branch-selection.js';
import { createBranchSelectionController } from './branch-selection-controller.js';
import { createParameterWorkspace } from './parameter-workspace.js';
import { createBranchWorkflowUI } from './branch-workflow-ui.js';
import { createWorkspaceNavigation } from './workspace-navigation.js';
import { prepareTreeAssemblyLayout } from './tree-assembly-layout.js';
import { createResourceCenter } from './resource-center.js';
import {createTrunkPreparation} from './trunk-preparation.js';
import {createModelSculpt} from './model-sculpt.js';
import {createTrunkModelStore} from './trunk-model-store.js';
import {importedTrunkShape,hydrateImportedTrunkMaterials} from './imported-trunk-runtime.js';
import {pickImportedTrunkAttachment} from './imported-trunk-picker.js';
import {createImportedTrunkContext} from './imported-trunk-context.js';
import {readPackAsset} from './plant-pack-client.js';
import {createPlantPackWorkspace} from './plant-pack-workspace.js';
import {emptyPrefabAssets,normalizePrefabAssets,normalizePrefabInstances,portablePrefabAssets} from './prefab-project-data.js';
import { createPanelGuides } from './panel-guides.js';
import { arrangeCompanionPanels } from './companion-panels.js';
import { bindLocalBranchEdit } from './local-branch-edit.js';
import {createSculptTrunkReplacementPreview} from './sculpt-trunk-replacement-preview.js';
import {sculptReplacementTargets} from './sculpt-trunk-replacement.js';
import { renderBranchCandidate } from './branch-candidate-renderer.js';
import { renderPlantThumbnail } from './project-thumbnail.js';
import { profileValue } from './generator-data.js';
import { captureSculptLayer } from './generator-geometry.js';
import { createGeneratorWorkspace } from './generator-workspace.js';
import { createSpatialControls } from './spatial-controls.js';
import { createBranchWorkbench } from './branch-workbench.js';
import { createProjectLibraryManager } from './project-library-manager.js';
import { createProjectSavePanel } from './project-save.js';
import { createLeafResources, applyLeafMaterial, clearLeafTextureCache, waitForLeafTextures } from './leaf-resources.js';
import { normalizeLeafMaterial, syncLeafMaterialVariants } from './leaf-material-data.js';
import { canEditLeafStyle, requireLeafStyleEditing, isLeafStyleControl, restoreLeafStyleControls, createLeafStyleBoundaryUi } from './leaf-style-boundary.js';
import { bindLeafExportTextures, preserveLeafTextureNames } from './leaf-material-export.js';
import { bindGlbTextures, exportGlb, modelOutputPath } from './glb-export.js';
import { pveBranchConnector } from './pve-export.js';
import { createPVESkeleton, validatePVESkeleton } from './pve-skeleton-export.js';

const $ = (id) => document.getElementById(id);
const number = (id) => Number($(id).value);
const checked = (id) => $(id).checked;
let leafResources = null;
let leafStyleBoundary = null;
const leafStyleApi = { isTree: () => branchWorkbench?.mode === 'TREE', toast: (...args) => showToast(...args) };
const allowLeafStyleWrite = () => requireLeafStyleEditing(leafStyleApi);
let projectSaver = null; let projectSession=null; let projectLoadFlow=null;let importedTrunkContext=null;
let sizeReference = null;
const formatNumber = (value) => Math.round(value).toLocaleString('zh-CN');
const curveModeLabels = { DIRECT: '精确', SOFT_MOVE: '柔性', BEND: '弯曲', TIP_IK: '牵引', SEGMENT: '段落', SMOOTH: '平滑' };

let config = { output_fbx: '' };
let asset = null;
let skeletonEditMode = false;
let skeletonModeSwitch = false;
let leafSources = [];
let authoring = normalizeAuthoring({}, DEFAULT_SETTINGS.seed);
let prefabAssets=emptyPrefabAssets(),prefabInstances=[],prefabEpoch=0;
function prefabSnapshot(){return {prefabOnly:true,prefab_items:prefabAssets.items,prefab_instances:prefabInstances};}
function changePrefabAssets(next){if(next===prefabAssets)return;pushHistory(prefabSnapshot());prefabAssets=next;prefabEpoch++;branchWorkbench?.prefabs.refresh();}
let selectedBranchId = null;
let selectedBranchIds = new Set();
let selectionKind = 'SKELETON';
let selectionModeSwitch = false;
let selectedBranchExclusions = new Set();
let selectedPointIndex = -1;
const curvePoints=createCurvePointSelection();
let curvePointInteraction=null;
let curvePointProjection=null;
let leafBrushMode = 'SELECT';
const normalizedSnapshots=new WeakSet();
let history = [];
let future = [];
let parameterWorkspace = null;
let localBranchEdit = null;
let generatorWorkspace = null;
let spatialControls = null;
let branchWorkbench = null;
let refreshingBranchSelection=false;
let barkMaterialControls = null;
let unitComb = null;
let assemblyHover = null, unitHangReference = null;
let unitScopeIndex = null;
let unitAssemblyPoolCache = null;
let keyboardTransform = null;
let advancedGesture = null;
let advancedPreviewTimer = null;
let settingsGesture = null;
let committedSettings = null;
let highDetailMeshBudget = false;
let parameterPreviewTimer = null;
let viewMode = 'SOLID';
let skeletonDirty = true;
let gridVisible = true;
let matrixVariants = [];
let buildTimer = null;
let toastTimer = null;
let windPreview = null;
let generationSnapshot = null;
let resetLeafTextureCache = false;
let editTimings = {};
let gpuTimer=null;
const performanceRecorder=createPerformanceRecorder({onStart:()=>gpuTimer?.start(),onStop:()=>gpuTimer?.stop()});
const geometryJobs=createGeometryJobClient();
const skeletonGeometryJobs=createGeometryJobClient({createWorker:()=>new Worker(new URL('./skeleton-geometry.worker.js',import.meta.url),{type:'module'})});
const nativeGeometryReady=(async()=>{try{const response=await fetch('./native/geometry-kernel-v1.wasm',{cache:'no-store'});if(!response.ok)throw Error('C++ geometry kernel unavailable');installGeometryAccelerator(await instantiateNativeGeometryKernel(await response.arrayBuffer()));}catch(error){console.warn('C++ geometry unavailable; using exact JS reference:',error.message);}})();
window.addEventListener('beforeunload',()=>{geometryJobs.dispose();skeletonGeometryJobs.dispose();});
let pendingAuthoringControls = false;
installIconReuse(window.lucide);
let generationRequestId = 0;
let buildSequence = 0;
const generationResolvers = new Map();
let generationPlanner = null;
try {
  generationPlanner = new Worker('./generation-planner.worker.js', { type: 'module' });
  generationPlanner.addEventListener('message', (event) => {
    const resolver = generationResolvers.get(event.data?.id);
    if (!resolver) return;
    generationResolvers.delete(event.data.id);
    if (event.data.ok) resolver.resolve(event.data.plan); else resolver.reject(new Error(event.data.message));
  });
} catch (error) { console.warn('增量生成 Worker 不可用，使用主线程规划', error); }

const canvas = $('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
gpuTimer=createWebGLGpuTimer(renderer.getContext(),{record:(name,value)=>performanceRecorder.record(name,value),status:value=>performanceRecorder.gpuTime(value)});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
const viewportBackground=window.treeDuckAppearance?.viewportBackground||'#0b100d';
renderer.setClearColor(viewportBackground, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(viewportBackground, 7, 22);
window.addEventListener('tree-duck-viewport-background',()=>{
  const color=window.treeDuckAppearance.viewportBackground;
  renderer.setClearColor(color,1);scene.fog?.color.set(color);
});
let previewFogRadius = 0;
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
camera.up.set(0, 0, 1);
camera.position.set(4.5, -5.2, 3.4);
const controls = new OrbitControls(camera, canvas);
configureViewportNavigation(controls);
controls.target.set(0.8, 0, 1.2);
controls.minDistance = 0.15;
controls.maxDistance = 40;
controls.update();

const axisElements = {
  x: document.querySelector('.axis-x'),
  y: document.querySelector('.axis-y'),
  z: document.querySelector('.axis-z'),
};
const axisDirections = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const axisCameraQuaternion = new THREE.Quaternion();
const axisScreenDirection = new THREE.Vector3();

function updateAxisWidget() {
  axisCameraQuaternion.copy(camera.quaternion).invert();
  Object.entries(axisElements).forEach(([axis, element]) => {
    axisScreenDirection.copy(axisDirections[axis]).applyQuaternion(axisCameraQuaternion);
    element.style.setProperty('--axis-x', `${(axisScreenDirection.x * 14).toFixed(2)}px`);
    element.style.setProperty('--axis-y', `${(-axisScreenDirection.y * 14).toFixed(2)}px`);
    element.style.opacity = String(0.58 + Math.abs(axisScreenDirection.z) * 0.42);
  });
}

scene.add(new THREE.HemisphereLight(0xcde3d2, 0x2b312a, 1.65));
const keyLight = new THREE.DirectionalLight(0xfff1cf, 3.25);
keyLight.position.set(-3.5, -4.2, 7.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
// Keep thin, curved leaves from shadowing their own surface in the preview.
keyLight.shadow.normalBias = 0.003;
keyLight.shadow.bias = -0.0001;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x9bbbc3, 1.15);
rimLight.position.set(5, 4, 3);
scene.add(rimLight);

const grid = new THREE.GridHelper(16, 32, 0x34483a, 0x1d2a22);
grid.rotation.x = Math.PI * 0.5;
grid.material.opacity = 0.65;
grid.material.transparent = true;
scene.add(grid);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ color: window.treeDuckAppearance?.groundColor||'#101711', roughness: 1 }));
window.addEventListener('tree-duck-ground-color',()=>ground.material.color.set(window.treeDuckAppearance.groundColor));
ground.receiveShadow = true;
scene.add(ground);

const modelRoot = new THREE.Group();
const skeletonRoot = new THREE.Group();
const controlPointRoot = new THREE.Group();
const maskPreviewRoot = new THREE.Group();
controlPointRoot.name = '编辑控制点';
maskPreviewRoot.name = '叶片遮罩预览';
maskPreviewRoot.visible = false;
modelRoot.add(controlPointRoot, maskPreviewRoot);
scene.add(modelRoot, skeletonRoot);
const selectionBounds = new THREE.Box3();
const selectionHelper = new THREE.Box3Helper(selectionBounds, 0xe3b84b);
selectionHelper.visible = false;
scene.add(selectionHelper);
const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.035;
const pointer = new THREE.Vector2();
let pointerDown = null;
let pointDrag = null;
let viewportTool = 'SELECT';
let pruneStroke = null;
const pruneStrokeOverlay = $('pruneStrokeOverlay');
const pruneStrokePath = $('pruneStrokePath');
const pruneHitMarkers = $('pruneHitMarkers');
const viewportStrokeTools = new Set(['PRUNE', 'LINE_PRUNE', 'ERASE_BRANCH', 'THICKNESS', 'GROW', 'FORK', 'SIMPLIFY_BRUSH', 'REFINE_BRUSH', 'WIND_SOFT', 'WIND_STIFF']);
const viewportToolLabels = {
  UNIT_PAINT:'刷生成完整单元枝', UNIT_DENSITY:'完整单元枝密度刷',
  BOX_SELECT: '框选枝条', LASSO_SELECT: '套索选择', BUNDLE_MOVE: '移动枝束', BUNDLE_ROTATE: '旋转枝束', BUNDLE_SCALE: '缩放枝束',
  RETRACT: '沿枝路回缩', GRAB: '区域抓取', BEND_BRUSH: '弯压枝束', SPREAD: '收拢与展开', TWIST_BRUSH: '扭转枝束', GUIDE: '走势引导', PROTECT: '保护蒙版',
  SELECT: '选择', PRUNE: '自由剪刀', LINE_PRUNE: '直线裁切', ERASE_BRANCH: '整枝删除', COMB: '保长梳理', PUSH_PULL: '枝条推拉',
  SMOOTH_BRUSH: '曲线平滑', THICKNESS: '粗细', GROW: '枝梢生长', FORK: '分叉笔', SIMPLIFY_BRUSH: '局部精简',
  REFINE_BRUSH: '局部加密', LEAF_ADD: '添加叶片', LEAF_ERASE: '擦除叶片', WIND_SOFT: '降低刚度', WIND_STIFF: '提高刚度',
};
const pointDragPlane = new THREE.Plane();
const pointDragIntersection = new THREE.Vector3();
let curveHoverPointer = null;
const hoveredPointMaterial = new THREE.MeshBasicMaterial({transparent:true, color:0xffffff,depthTest:false,depthWrite:false,fog:false});
const controlPointGeometry = new THREE.SphereGeometry(0.018, 10, 8);
const controlPointMaterial = new THREE.MeshBasicMaterial({transparent:true,  color: 0x92d8d0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
const selectedControlPointMaterial=new THREE.MeshBasicMaterial({transparent:true, color:0xffd35b,depthTest:false,depthWrite:false,fog:false,toneMapped:false});
const activeControlPointMaterial=new THREE.MeshBasicMaterial({transparent:true, color:0xfffae9,depthTest:false,depthWrite:false,fog:false,toneMapped:false});
const pinnedPointMaterial = new THREE.MeshBasicMaterial({transparent:true,  color: 0xff8b7c, depthTest: false, depthWrite: false, fog: false, toneMapped:false });
const tangentPointMaterial = new THREE.MeshBasicMaterial({transparent:true,  color: 0xa9bfff, depthTest: false, depthWrite: false, fog: false, toneMapped:false });

const influencePointMaterials = Array.from({ length: 11 }, (_, index) => new THREE.MeshBasicMaterial({
  color: new THREE.Color(0x83b8ba).lerp(new THREE.Color(0x92d8d0), index / 10), transparent:true, depthTest: false, depthWrite: false, fog: false, toneMapped:false,
}));
const curvePreviewMaterial = new THREE.MeshStandardMaterial({ color: 0x78c98a, roughness: 0.72, transparent: true, opacity: 0.54, depthTest: false });

const windPreviewMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
const skeletonMaterial = new THREE.LineBasicMaterial({ color: 0xe3b84b, transparent: true, opacity: 0.9 });
const previewHandoff = createPreviewHandoff();
const editUiRefresh = createDeferredEditRefresh({
  canRun(token) {
    if (token.sequence !== buildSequence || token.asset !== asset || token.authoring !== authoring) return 'STALE';
    if (asset?.group.userData.pending_rebuild || !$('busyOverlay').hidden || sculpt.active || sculpt.adjusting || unitComb?.active || branchWorkbench?.unitBrushes.active
      || keyboardTransform?.active || asset?.activeEditPreview || bundle.active || pointDrag || pointerDown || pruneStroke
      || advancedGesture || settingsGesture || branchWorkbench?.busy || branchWorkbench?.localAssembly.active
      || branchWorkbench?.unitEditor.enabled || branchWorkbench?.trunkForm.active || branchWorkbench?.tools.active || branchWorkbench?.installation.active
      || branchWorkbench?.stroke.active || branchWorkbench?.influence.active || branchWorkbench?.forms.active
      || branchWorkbench?.arrays.active || branchWorkbench?.deformation.active || generatorWorkspace?.rangeActive || spatialControls?.active
      || document.querySelector('dialog[open]') || document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')) return 'BUSY';
    return 'READY';
  },
  refresh() {
    const started = performance.now();
    if (pendingAuthoringControls) { pendingAuthoringControls = false; applyAuthoringToControls({ renderEditor: false }); }
    updateInspector(asset); renderBranchOutliner(); renderBranchEditor(); updateSelectionHelper(); renderControlPoints();
    editContextPanel?.refresh();
    editTimings = { ...editTimings, deferred_ui_ms: performance.now() - started };
  },
});
const commitPreview = (preview, mutate) => {
  const accepted = previewHandoff.commit(asset, preview, mutate);
  if (accepted !== false) {
    try { finishPlacementEdit(); }
    catch (error) {
      // Authoring/history are already accepted. A refresh failure must not tell
      // the controller that this edit was cancelled; rebuild that accepted data.
      console.error('Complete placement refresh failed', error);
      scheduleBuild(0);
    }
  }
  return accepted;
};
const sculpt = createSculptController({
  canvas, camera, controls, getAsset: () => asset, getAuthoring: () => authoring,
  getSelectedIds: () => selectedBranchIds, getTool: () => viewportTool, getEditTargets: branchEditTargets,
  getUnitBrush: () => treeUnitMode() ? unitComb : null,
  cancelUnitBrush: () => unitComb?.cancel(),
  showActiveBranches: (branches, targets) => bundle.drawOutline(branches, targets),
  isBlocked: () => Boolean(keyboardTransform?.active || bundle?.active || pointDrag || pruneStroke || advancedGesture || settingsGesture || branchWorkbench?.busy || branchWorkbench?.trunkForm.enabled || branchWorkbench?.tools.active || branchWorkbench?.unitEditor.enabled || spatialControls?.active || generatorWorkspace?.rangeActive),
  isVisible: (id) => bundle.isVisible(id) && (branchWorkbench?.instances.isEditable(id) ?? true),
  transact: transactAuthoring, commitPreview, status: setStatus,
});
const bundle = createBranchSelectionController({
  canvas, camera, controls, modelRoot, skeletonRoot, getAsset: () => asset, getAuthoring: () => authoring,
  getDuplicateAsset: () => asset?.skeletonOnly || asset?.settings.preview_lod > 0 ? buildBranchAsset(collectSettings(),null,leafSources,0,authoring,{instanced:true}) : asset,
  releaseDuplicateAsset: disposeBranchAsset, getLeafSources: () => leafSources,
  getSelection: () => selectedBranchIds, setSelection: setBranchSelection, getTool: () => viewportTool,
  getSelectionExclusions: () => selectedBranchExclusions,
  getEditTargets: branchEditTargets,
  getOutlineTargets: () => {
    // Guides follow actual selection; operation scope can include more targets.
    // Complete units keep all their owned wood in the displayed selection.
    if (branchWorkbench?.trunkForm.enabled || !selectedBranchIds.size) return new Set();
    if (branchWorkbench?.mode !== 'TREE') return null;
    return treeUnitMode() ? descendants(asset?.masterBranches || [], selectedBranchIds) : new Set(selectedBranchIds);
  },
  getWorkspace: () => branchWorkbench?.mode,
  selectableBranch: branch => branchWorkbench?.mode !== 'TREE'
    ? true
    : selectionKind === 'INSTANCE' ? branchWorkbench.instances.isEditable(branch.stableId)===false : branchWorkbench.instances.isEditable(branch.stableId)!==false,
  selectionId: branch => instanceSelectionId(branch),
  getRegionHits: ({asset: current, branches, polygon, project}) => {
    if (!treeUnitMode()) return [];
    const candidates = new Set(branches.map(branch => branch.stableId)), hits = new Set();
    // Organ attachment points are addresses for picking their complete owner,
    // never selections of the individual leaf/flower model in TREE.
    for (const placement of [...(current.masterPlacements||[]), ...(current.treeOrgans||[])]) {
      if (!candidates.has(placement.branchStableId) || hits.has(placement.branchStableId)) continue;
      const point = project(placement.position);
      if (point[2] >= -1 && point[2] <= 1 && insidePolygon(point, polygon)) hits.add(placement.branchStableId);
    }
    return hits;
  },
  getSelectedPoint: () => ({branchId:selectedBranchId,index:selectedPointIndex,...currentCurvePoints()}),
  renderMountPreview: (points,guide) => renderControlPoints(points, false,guide),
  renderPointSlidePreview: points => {
    renderControlPoints(points,false,selectedBranch()?.points);
    const p=points?.[selectedPointIndex];
    if(p) { $('pointX').value=p.x.toFixed(4);$('pointY').value=p.y.toFixed(4);$('pointZ').value=p.z.toFixed(4); } else renderPointEditor();
  },
  includeSelectionChildren: () => $('branchEditScope').value !== 'DIRECT',
  temporaryClick: (event, operation) => {
    if (treeUnitMode()) {
      const owner = branchWorkbench.instances.hitOwner(event), root = unitScopeBoundary().roots.get(owner?.id);
      if (!root) return false;
      if ($('branchEditScope').value === 'ALL') { $('branchEditScope').value = 'SELECTED'; $('branchEditScope').dispatchEvent(new Event('change')); }
      const next = new Set(selectedBranchIds), excluded = new Set(selectedBranchExclusions);
      if (operation === 'SUBTRACT') { next.delete(root); excluded.add(root); }
      else { next.add(root); excluded.delete(root); }
      setBranchSelection(next, {excluded}); return true;
    }
    if (viewportTool === 'SELECT' || SCULPT_TOOLS.has(viewportTool)) {
      selectBranchFromViewport({clientX:event.clientX,clientY:event.clientY,ctrlKey:operation==='SUBTRACT',shiftKey:operation==='ADD'}); return true;
    }
    return false;
  },
  temporarySelectionDone: ({clear=false}={}) => { if (clear || $('branchEditScope').value === 'ALL') { $('branchEditScope').value = 'SELECTED'; $('branchEditScope').dispatchEvent(new Event('change')); } },
  transact: transactAuthoring, commitPreview, status: setStatus,
});

const brushSelectionMenu = createViewportSelectionMenu({
  canvas,
  enabled: () => SCULPT_TOOLS.has(viewportTool),
  canOpen: event => {
    if (!asset || sculpt.active || bundle.active || asset.group.userData.pending_rebuild || !$('busyOverlay').hidden) return false;
    setPointerRay(event); asset.group.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(asset.group);
    if (!raycaster.ray.intersectsBox(bounds)) return true;
    const meshes = [];
    asset.group.traverse(object => {
      if (!object.isMesh) return;
      for (let p=object;p;p=p.parent) if (!p.visible) return;
      meshes.push(object);
    });
    return !raycaster.intersectObjects(meshes, false).length;
  },
  choose: action => {
    if (!SCULPT_TOOLS.has(viewportTool)) return;
    const ids = action === 'ALL' ? treeUnitMode() ? unitBrushRoots('ALL') : resolveBranchEditScope(asset?.masterBranches || [], new Set(), 'ALL', {
      protectUnits: document.body.dataset.workbench === 'TREE',
      editable: id => bundle.isVisible(id) && (branchWorkbench?.instances.isEditable(id) ?? true),
    }) : new Set();
    $('branchEditScope').value = 'SELECTED'; $('sculptSelection').value = 'SELECTED';
    setBranchSelection(ids);
    refreshBranchEditScope();
    const target=treeUnitMode()?'支单元枝':'根可编辑枝干';
    setStatus(action === 'ALL' ? `已选择 ${selectedBranchIds.size} ${target} · 继续使用当前笔刷` : `已清空所有选择 · 请重新选择${treeUnitMode()?'单元枝':'需要雕刻的枝干'}`, 'ready');
  },
});

function planGeneration(nextSnapshot) {
  // Asset-bearing projects already rebuild the whole model for changes. Sending
  // every embedded atlas/mesh to a worker just to classify the update doubles
  // the payload and then JSON-stringifies it again for hashing.
  if (!generationSnapshot || nextSnapshot.authoring.branch_library.some(item => item.sample))
    return Promise.resolve({ scope:'FULL', key:'direct-'+buildSequence, changed_settings:[] });
  if (!generationPlanner) return Promise.resolve(compileGenerationPlan(generationSnapshot, nextSnapshot));
  const id = ++generationRequestId;
  return new Promise((resolve, reject) => {
    generationResolvers.set(id, { resolve, reject });
    generationPlanner.postMessage({ id, previous: generationSnapshot, next: nextSnapshot });
    setTimeout(() => {
      if (!generationResolvers.has(id)) return;
      generationResolvers.delete(id);
      resolve(compileGenerationPlan(generationSnapshot, nextSnapshot));
    }, 800);
  });
}

function resizeRenderer() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

const modelBuildOwners=new WeakMap();
function retainBuildOwner(owner){
  if(!owner)return ()=>{};
  let users=modelBuildOwners.get(owner);if(!users)modelBuildOwners.set(owner,users=new Set());
  const token={};users.add(token);
  return ()=>{users.delete(token);if(!users.size)modelBuildOwners.delete(owner);};
}
const nativeViewport=createNativeViewport({scene,camera,renderer,canvas,profile:performanceRecorder,getRetainedModel:()=>{
  if(!asset?.isInstancedAssembly||branchWorkbench?.mode!=='TREE'||asset.group.userData.pending_rebuild&&!modelBuildOwners.has(asset)||branchWorkbench.trunkForm.enabled)return null;
  const preview=asset.activeEditPreview;
  if(preview&&!Object.hasOwn(preview,'nativeTextures'))return null;
  const dynamicBuffers=preview?.nativeTextures;
  if(preview&&!Array.isArray(dynamicBuffers))return null;
  return {root:asset.group,revision:nativeModelRevision(asset),dynamicBuffers:dynamicBuffers||[]};
},motionRoot:()=>modelRoot,assetIdentity:()=>asset?.group.uuid||'',isSuspended:()=>document.body.classList.contains('resource-center-active'),isAllowed:()=>!branchWorkbench?.views.enabled&&document.visibilityState==='visible'});
let editContextPanel,lastNativeProfileRevision=-1;
function animate(time) {
  const frameProfile=performanceRecorder.begin('frame.main_cpu_wall');
  performanceRecorder.frame(time,document.visibilityState==='visible');
  editContextPanel?.refresh();
  requestAnimationFrame(animate);
  resizeRenderer();
  if (!document.body.classList.contains('resource-center-active') && !branchWorkbench?.trunkForm.active && !branchWorkbench?.assemblyGrowth.dragging && !branchWorkbench?.tools.dragging && !sculpt.active && !bundle.active && !spatialControls?.dragging && !generatorWorkspace?.rangeDragging && !pointDrag && !pruneStroke) controls.update();
  updateAxisWidget();
  branchWorkbench?.assemblyGrowth.update();
  modelRoot.rotation.set(0, 0, 0);
  windPreview?.tick(time);
  if (previewFogRadius > 2) {
    const viewDistance = camera.position.distanceTo(controls.target);
    scene.fog.near = Math.max(7, viewDistance + previewFogRadius * 1.1);
    scene.fog.far = Math.max(scene.fog.near + 5, viewDistance + previewFogRadius * 3);
  } else {
    scene.fog.near = 7;
    scene.fog.far = 22;
  }
  // An imported support can exist before any plant geometry is generated.
  // Keep it clear of fog even when the plant is empty or the view is panned.
  const surface = branchWorkbench?.vines?.surface;
  if (surface?.root.visible) {
    const geometry = surface.reference.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (sphere && Number.isFinite(sphere.radius)) {
      const extent = Math.max(.25, sphere.radius), distance = camera.position.distanceTo(sphere.center);
      scene.fog.near = Math.max(scene.fog.near, distance + extent * 1.1);
      scene.fog.far = Math.max(scene.fog.far, scene.fog.near + Math.max(5, extent * 2));
    }
  }
  updateCurveHandleDisplay();
  sizeReference?.update(time);
  const renderProfile=performanceRecorder.begin('render.main_cpu_submit');
  gpuTimer.begin();
  try{nativeViewport.render();}finally{gpuTimer.end();renderProfile?.end();}
  if(performanceRecorder.enabled){const compiled=compiledSampleCacheStats(asset),history=compiledSampleHistoryStats(asset);performanceRecorder.counters({draw_calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
    geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs?.length||0,
    complete_units:authoring?.branch_instances.length||0,skeleton_edit:Number(skeletonEditMode),
    compiled_samples_built:compiled?.built||0,compiled_samples_reused:compiled?.reused||0,
    historical_graph_scoped:Number(history?.scoped||false),historical_graph_reused_owners:history?.reusedOwners||0,historical_graph_evaluated_owners:history?.evaluatedOwners||0});}
  branchWorkbench?.views.render();
  const nativeStatus=nativeViewport.stats,renderText=nativeStatus.active?`DX12${nativeStatus.native?.dlss_active?' · DLSS':''} · ${Number(nativeStatus.native?.gpu_ms||0).toFixed(1)} ms`:nativeStatus.available?(nativeStatus.presentation==='auxiliary-webgl'?'辅助多视图 · WebGL':nativeStatus.presentation==='diagnostic-webgl'?'WebGL 诊断':nativeStatus.presentation==='blocked'?'DX12 · 待恢复':'DX12 · 正在准备'):`WebGL · ${renderer.info.render.triangles.toLocaleString()} 面`;
  if(performanceRecorder.enabled&&nativeStatus.native?.revision!==lastNativeProfileRevision){lastNativeProfileRevision=nativeStatus.native?.revision;performanceRecorder.record('native.render_to_present',nativeStatus.native?.render_to_present_ms);performanceRecorder.record('native.cpu_receive',nativeStatus.native?.cpu_receive_ms);performanceRecorder.record('native.cpu_record',nativeStatus.native?.cpu_record_ms);performanceRecorder.record('native.gpu_fence_wait',nativeStatus.native?.gpu_fence_wait_ms);performanceRecorder.record('native.dxgi_present',nativeStatus.native?.dxgi_present_ms);performanceRecorder.record('native.post_present_wait',nativeStatus.native?.post_present_wait_ms);performanceRecorder.record('native.packet_age',nativeStatus.native?.packet_age_ms);}
  if($('renderInfo').textContent!==renderText)$('renderInfo').textContent=renderText;
  frameProfile?.end();
}
requestAnimationFrame(animate);

function setBusy(value, title = '正在生成枝条', { cover = true } = {}) {
  // A committed edit already has a displayed preview. Keep the same input
  // blocker and disabled actions without painting a dark cover over that frame.
  $('busyOverlay').classList.toggle('busy-overlay-silent', value && !cover);
  $('busyOverlay').hidden = !value;
  $('busyTitle').textContent = title;
  $('buildBtn').disabled = value;
  $('exportBtn').disabled = value;
  $('exportLod0GlbBtn').disabled = value;
  $('batchExportBtn').disabled = value;
  $('exportFormat').disabled = value;
  $('pickOutputBtn').disabled = value;
  barkMaterialControls?.refresh();
}

function setStatus(text, state = 'ready') {
  $('statusText').textContent = text;
  $('statusDot').dataset.state = state;
}

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}

function snapshotAuthoring() {
  // Installed authoring is already normalized at load/set/restore boundaries.
  // History needs an independent copy, not another complete source migration.
  const snapshot=copy(authoring);normalizedSnapshots.add(snapshot);return snapshot;
}

function snapshotProject(includeLeaves = false) {
  return { settings: collectSettings(), authoring: snapshotAuthoring(),prefab_items:prefabAssets.items,prefab_instances:prefabInstances,
    ...(includeLeaves ? { leaf_meshes: createProjectDocument(asset, leafSources, authoring).leaf_meshes } : {}) };
}

function pushHistory(previous) {
  history.push(previous); history = history.slice(-80); future = [];
  updateHistoryButtons();
}

function restoreProject(previous) {
  windPreview?.stop();
  if(previous.prefab_items){prefabAssets={...prefabAssets,items:previous.prefab_items};prefabInstances=previous.prefab_instances||[];prefabEpoch++;branchWorkbench?.prefabs.refresh();}
  if(previous.prefabOnly){updateHistoryButtons();return;}
  if (previous.leaf_meshes) {
    disposeLeafSources();
    leafSources = previous.leaf_meshes.map((item) => ({ ...structuredClone(item), geometry: deserializeGeometry(item.geometry) })).filter((item) => item.geometry);
    generationSnapshot = null; updateLeafSourceUi();
  }
  applySettings(previous.settings);
  setAuthoring(previous.authoring,{normalized:normalizedSnapshots.has(previous.authoring)});
}

function rejectLeafStyleControl(control) {
  if (!isLeafStyleControl(control) || canEditLeafStyle(leafStyleApi)) return false;
  allowLeafStyleWrite();
  // A rejected DOM event must also restore its value: collectSettings reads
  // these controls later when saving or rebuilding the entire plant.
  const key = Object.keys(settingControls).find(key => settingControls[key] === control.id);
  if (key) {
    const value = (committedSettings || asset?.settings || DEFAULT_SETTINGS)[key];
    if (control.type === 'checkbox') control.checked = !!value; else control.value = value;
  } else leafResources?.refresh();
  return true;
}

function beginParameterEdit(event = null) {
  if (rejectLeafStyleControl(event?.target)) return;
  if (!settingsGesture) settingsGesture = { settings: structuredClone(committedSettings || collectSettings()), authoring: snapshotAuthoring() };
}

function previewParameterEdit(event = null) {
  if (rejectLeafStyleControl(event?.target)) return;
  beginParameterEdit();
  if (!canEditLeafStyle(leafStyleApi)) restoreLeafStyleControls(settingsGesture.settings, settingControls, $);
  if (event?.target?.type === 'number' && (event.target.value === '' || !Number.isFinite(Number(event.target.value)))) return;
  updateOutputs(); parameterWorkspace?.sync();
  if (parameterPreviewTimer) return;
  const interval = Math.max(140, Math.min(800, (asset?.report.generation_ms || 0) * 2));
  parameterPreviewTimer = setTimeout(() => { parameterPreviewTimer = null; scheduleBuild(0); }, interval);
}

function commitParameterEdit(event = null) {
  if (rejectLeafStyleControl(event?.target)) return;
  if (!settingsGesture) return;
  if (!canEditLeafStyle(leafStyleApi)) restoreLeafStyleControls(settingsGesture.settings, settingControls, $);
  const invalid = [...Object.values(settingControls), 'baseDiameter', 'tipDiameter'].some((id) => $(id)?.type === 'number' && ($(id).value === '' || !Number.isFinite(number(id))));
  if (invalid) { cancelParameterEdit(); return; }
  clearTimeout(parameterPreviewTimer); parameterPreviewTimer = null;
  const previous = settingsGesture; settingsGesture = null;
  const next = collectSettings();
  if (JSON.stringify(previous.settings) !== JSON.stringify(next)) pushHistory(previous);
  applySettings(next); scheduleBuild(0);
}

function cancelParameterEdit() {
  if (!settingsGesture) return false;
  const previous = settingsGesture; settingsGesture = null;
  clearTimeout(parameterPreviewTimer); parameterPreviewTimer = null;
  applySettings(previous.settings); scheduleBuild(0);
  setStatus('已取消参数调整', 'ready');
  return true;
}

function updateHistoryButtons() {
  $('undoBtn').disabled = history.length === 0;
  $('redoBtn').disabled = future.length === 0;
}

function setAuthoring(next, { rebuild = true, refresh = true, normalized = false } = {}) {
  geometryJobs.cancel();
  skeletonGeometryJobs.cancel();
  editUiRefresh.invalidate();
  sculpt.cancel();
  bundle.cancel();
  authoring = normalized ? next : normalizeAuthoring(next, number('seed') || DEFAULT_SETTINGS.seed);
  if (branchWorkbench) authoring.branch_library = copy(branchWorkbench.library);
  if (refresh) { pendingAuthoringControls = false; applyAuthoringToControls(); }
  updateHistoryButtons();
  if (rebuild) scheduleBuild(0);
}

const curveOverrideKeys = ['curve_knots', 'curve_samples', 'curve_sample_times', 'curve_reference_knots', 'curve_parent_frame', 'frozen_points', 'locked', 'offset'];
function transactAuthoring(label, mutation, { bypassLayers = false, deferControls = false } = {}) {
  windPreview?.stop();
  const timingStart=performance.now(),timings={},baseline=authoring,draft=createAuthoringDraft(baseline);
  mutation(draft.value);let next=draft.finish();timings.draft=performance.now()-timingStart;
  let symmetry=null;
  for(const branch of asset?.masterBranches||[])if(branch.symmetryGroup&&Object.hasOwn(next.overrides,branch.stableId)){symmetry||=createAuthoringDraft(next);delete symmetry.value.overrides[branch.stableId];}
  if(symmetry)next=symmetry.finish();
  const curvesDiffer=(value,before)=>!equalData(value.curve_knots,before?.curve_knots)||!equalData(value.curve_samples,before?.curve_samples)||!equalData(value.curve_sample_times,before?.curve_sample_times);
  const changedCurves=next.overrides===baseline.overrides?{}:Object.fromEntries(Object.entries(next.overrides).filter(([id,value])=>value!==baseline.overrides[id]&&value.curve_knots&&curvesDiffer(value,baseline.overrides[id])));
  if(!bypassLayers&&Object.keys(changedCurves).length&&(next.active_sculpt_layer||next.sculpt_layers.some(layer=>layer.enabled&&layer.strength))){
    const layers=next.sculpt_layers.slice(),lastVisible=layers.filter(item=>item.enabled&&item.strength>0).at(-1);
    let index=layers.findIndex(item=>item.id===next.active_sculpt_layer),layer=layers[index],active=next.active_sculpt_layer;
    if(!layer||layer.operation||!layer.enabled||layer.strength!==1||lastVisible&&lastVisible.id!==layer.id){index=layers.length;layer={id:'SCULPT_'+Date.now(),name:'雕刻层 '+(layers.length+1),enabled:true,strength:1,branches:{}};active=layer.id;}
    else layer={...layer,branches:{...layer.branches}};
    // Capture replaces individual branch records; it never edits an existing
    // record's arrays. Keep unrelated historical deltas exactly as saved.
    captureSculptLayer(layer,asset?.masterBranches||[],changedCurves);layers[index]=layer;
    const overrides={...next.overrides};
    for(const id of Object.keys(changedCurves)){
      const value={...overrides[id]};for(const key of curveOverrideKeys){if(baseline.overrides[id]?.[key]!==undefined)value[key]=baseline.overrides[id][key];else delete value[key];}
      overrides[id]=equalData(value,baseline.overrides[id])?baseline.overrides[id]:value;
    }
    next={...next,sculpt_layers:layers,active_sculpt_layer:active,overrides};
  }
  let frames=null;
  if(next.overrides!==baseline.overrides)for(const [id,override]of Object.entries(next.overrides)){
    const before=baseline.overrides[id];
    if(override===before||!override.curve_knots||!before?.curve_parent_frame||equalData(override.curve_knots,before.curve_knots)||!equalData(override.curve_parent_frame,before.curve_parent_frame))continue;
    const branch=asset?.masterBranches.find(item=>item.stableId===id),parent=asset?.masterBranches.find(item=>item.id===branch?.parentId);
    if(parent){frames||=createAuthoringDraft(next);frames.value.overrides[id].curve_parent_frame={parent:parent.stableId,tangent:lineTangent(parent.points,branch.parentT).toArray()};}
  }
  if(frames)next=frames.finish();
  const normalized=normalizeAuthoring(next,number('seed')||DEFAULT_SETTINGS.seed,baseline),normalizedAt=performance.now();timings.normalize=normalizedAt-timingStart-timings.draft;
  if(equalData(baseline,normalized))return false;
  const previous=snapshotAuthoring();timings.snapshots=performance.now()-normalizedAt;
  pushHistory({settings:structuredClone(committedSettings||collectSettings()),authoring:previous});committedSettings=collectSettings();
  const refreshAt=performance.now();setAuthoring(normalized,{refresh:!deferControls,normalized:true});if(deferControls)pendingAuthoringControls=true;
  timings.refresh=performance.now()-refreshAt;timings.total=performance.now()-timingStart;editTimings={...editTimings,transaction:timings};performanceRecorder.timings('transaction.sync',timings);showToast(label);return true;
}

function beginAdvancedEdit() {
  commitParameterEdit();
  if (!advancedGesture) advancedGesture = snapshotProject();
}
function previewAdvancedEdit(mutation) {
  beginAdvancedEdit();
  const baseline=authoring,draft=createAuthoringDraft(baseline);mutation(draft.value);
  authoring=normalizeAuthoring(draft.finish(),number('seed'),baseline);
  applyAuthoringToControls();
  if (asset) asset.group.userData.pending_rebuild = true;
  if (!advancedPreviewTimer) advancedPreviewTimer = setTimeout(() => { advancedPreviewTimer = null; scheduleBuild(0); }, Math.max(160, Math.min(800, (asset?.report.generation_ms || 0) * 2)));
}
function commitAdvancedEdit() {
  if (!advancedGesture) return;
  localBranchEdit?.finish();
  branchWorkbench?.assemblyGrowth.finish();
  clearTimeout(advancedPreviewTimer); advancedPreviewTimer = null;
  const previous = advancedGesture; advancedGesture = null;
  if (!equalData(previous.authoring, authoring)) pushHistory(previous);
  applyAuthoringToControls(); updateHistoryButtons(); scheduleBuild(0);
}
function cancelAdvancedEdit() {
  if (!advancedGesture) return false;
  localBranchEdit?.finish();
  branchWorkbench?.assemblyGrowth.finish();
  clearTimeout(advancedPreviewTimer); advancedPreviewTimer = null;
  const previous = advancedGesture; advancedGesture = null;
  restoreProject(previous); return true;
}

function undoAuthoring() {
  if (branchWorkbench?.trunkForm.cancel()) return;
  if (branchWorkbench?.stroke.cancel() || branchWorkbench?.influence.cancel() || branchWorkbench?.forms.cancel() || branchWorkbench?.arrays.cancel()) return;
  if (branchWorkbench?.deformation.cancel() || branchWorkbench?.instances.cancel()) return;
  if (generatorWorkspace?.cancelRange()) return;
  if (spatialControls?.cancel() || cancelAdvancedEdit()) return;
  if (cancelParameterEdit()) return;
  if (bundle.cancel()) return;
  if (sculpt.cancel()) return;
  if (!history.length) return;
  const previous = history.pop();
  future.push(previous.prefabOnly?prefabSnapshot():snapshotProject(!!previous.leaf_meshes));
  restoreProject(previous);
  showToast('已撤销编辑');
}

function redoAuthoring() {
  if (branchWorkbench?.trunkForm.cancel()) return;
  if (branchWorkbench?.stroke.cancel() || branchWorkbench?.influence.cancel() || branchWorkbench?.forms.cancel() || branchWorkbench?.arrays.cancel()) return;
  if (branchWorkbench?.deformation.cancel() || branchWorkbench?.instances.cancel()) return;
  if (generatorWorkspace?.cancelRange()) return;
  if (spatialControls?.cancel() || cancelAdvancedEdit()) return;
  if (cancelParameterEdit()) return;
  if (bundle.cancel()) return;
  if (sculpt.cancel()) return;
  if (!future.length) return;
  const next = future.pop();
  history.push(next.prefabOnly?prefabSnapshot():snapshotProject(!!next.leaf_meshes));
  restoreProject(next);
  showToast('已重做编辑');
}

function buildLevelRuleControls() {
  const container = $('levelRuleList');
  container.replaceChildren();
  ['主枝', '一级侧枝', '二级侧枝', '三级侧枝'].forEach((label, level) => {
    const card = document.createElement('div');
    card.className = 'level-rule';
    card.innerHTML = `<header><strong>${label}</strong><label><span>启用</span><input class="authoring-control" data-level="${level}" data-rule="enabled" type="checkbox" checked></label></header>
      <div class="level-rule-grid">
        <label>数量<input class="authoring-control" data-level="${level}" data-rule="count" type="number" value="1" min="0" max="3" step="0.05"></label>
        <label>长度<input class="authoring-control" data-level="${level}" data-rule="length" type="number" value="1" min="0.05" max="3" step="0.05"></label>
        <label>粗度<input class="authoring-control" data-level="${level}" data-rule="radius" type="number" value="1" min="0.05" max="3" step="0.05"></label>
        <label>角度<input class="authoring-control" data-level="${level}" data-rule="angle" type="number" value="0" min="-75" max="75" step="1"></label>
        <label>弯曲<input class="authoring-control" data-level="${level}" data-rule="bend" type="number" value="1" min="0" max="3" step="0.05"></label>
        <label>重力<input class="authoring-control" data-level="${level}" data-rule="gravity" type="number" value="1" min="0" max="3" step="0.05"></label>
        <label>叶量<input class="authoring-control" data-level="${level}" data-rule="leaves" type="number" value="1" min="0" max="3" step="0.05"></label>
      </div>`;
    container.append(card);
  });
}

function collectAuthoringFromControls() {
  const next = snapshotAuthoring();
  next.seeds = { topology: number('topologySeed'), shape: number('shapeSeed'), foliage: number('foliageSeed'), damage: number('damageSeed') };
  next.root_count = number('rootCount');
  next.root_spread = number('rootSpread');
  next.root_radial_offset = number('rootOffset');
  next.envelope = { ...next.envelope, type: $('envelopeType').value, radius: number('envelopeRadius'), height: number('envelopeHeight'), strength: number('envelopeStrength'), flatness: number('envelopeFlatness') };
  next.attractor = { enabled: checked('attractorEnabled'), x: number('attractorX'), y: number('attractorY'), z: number('attractorZ'), strength: number('attractorStrength') };
  next.repeller = { enabled: checked('repellerEnabled'), x: number('repellerX'), y: number('repellerY'), z: number('repellerZ'), radius: number('repellerRadius'), strength: number('repellerStrength') };
  next.phenotype = { apical_dominance: number('apicalDominance'), competition: number('competition'), tropism_bias: next.phenotype.tropism_bias, individual_scale: number('individualScale') };
  next.curve_editor = {
    coordinate_space: $('pointCoordinateSpace').value,
    constraint: $('pointConstraint').value,
    snap: number('pointSnap'), tangent_mode: $('tangentMode').value, tangent_length: number('tangentLength'),
    edit_mode: next.curve_editor.edit_mode, falloff_radius: number('pointFalloff'), falloff_profile: $('pointFalloffProfile').value,
    preserve_length: number('pointPreserveLength'), lock_root: checked('curveLockRoot'), affect_children: checked('curveAffectChildren'),
    live_preview: checked('curveLivePreview'), knot_count: number('curveKnotCount'), smooth_strength: number('curveSmoothStrength'),
    simplify_tolerance: number('curveSimplifyTolerance'), subdivision_levels: number('curveSubdivisionLevels'),
  };
  next.timeline.enabled = checked('timelineEnabled');
  next.timeline.time = number('timelineTime');
  next.timeline.loop = checked('timelineLoop');
  next.wind_preview = normalizeWindPreview(authoring.wind_preview);
  next.wind_profile = {
    root_stiffness: number('rootStiffness'), branch_stiffness: number('branchStiffness'), tip_stiffness: number('tipStiffness'),
    leaf_flutter: number('leafFlutter'), gust_frequency: number('gustFrequency'), turbulence: number('windTurbulence'),
  };
  next.recipe = { ...next.recipe, name: $('recipeName').value, tags: $('recipeTags').value.split(',').map((value) => value.trim()).filter(Boolean) };
  document.querySelectorAll('[data-level][data-rule]').forEach((control) => {
    const level = Number(control.dataset.level);
    next.level_rules[level][control.dataset.rule] = control.type === 'checkbox' ? control.checked : Number(control.value);
  });
  return normalizeAuthoring(next, number('seed'));
}

function applyAuthoringToControls({ renderEditor = true } = {}) {
  const values = {
    topologySeed: authoring.seeds.topology, shapeSeed: authoring.seeds.shape,
    foliageSeed: authoring.seeds.foliage, damageSeed: authoring.seeds.damage,
    rootCount: authoring.root_count, rootSpread: authoring.root_spread, rootOffset: authoring.root_radial_offset,
    envelopeType: authoring.envelope.type, envelopeRadius: authoring.envelope.radius,
    envelopeHeight: authoring.envelope.height, envelopeStrength: authoring.envelope.strength, envelopeFlatness: authoring.envelope.flatness,
    attractorEnabled: authoring.attractor.enabled, attractorX: authoring.attractor.x, attractorY: authoring.attractor.y,
    attractorZ: authoring.attractor.z, attractorStrength: authoring.attractor.strength,
    repellerEnabled: authoring.repeller.enabled, repellerX: authoring.repeller.x, repellerY: authoring.repeller.y,
    repellerZ: authoring.repeller.z, repellerRadius: authoring.repeller.radius, repellerStrength: authoring.repeller.strength,
    apicalDominance: authoring.phenotype.apical_dominance, competition: authoring.phenotype.competition, individualScale: authoring.phenotype.individual_scale,
    pointCoordinateSpace: authoring.curve_editor.coordinate_space, pointConstraint: authoring.curve_editor.constraint, pointSnap: authoring.curve_editor.snap,
    tangentMode: authoring.curve_editor.tangent_mode, tangentLength: authoring.curve_editor.tangent_length,
    pointFalloff: authoring.curve_editor.falloff_radius, pointFalloffProfile: authoring.curve_editor.falloff_profile,
    pointPreserveLength: authoring.curve_editor.preserve_length, curveLockRoot: authoring.curve_editor.lock_root,
    curveAffectChildren: authoring.curve_editor.affect_children, curveLivePreview: authoring.curve_editor.live_preview,
    curveKnotCount: authoring.curve_editor.knot_count, curveSmoothStrength: authoring.curve_editor.smooth_strength,
    curveSimplifyTolerance: authoring.curve_editor.simplify_tolerance, curveSubdivisionLevels: authoring.curve_editor.subdivision_levels,
    timelineEnabled: authoring.timeline.enabled, timelineTime: authoring.timeline.time, timelineLoop: authoring.timeline.loop,
    rootStiffness: authoring.wind_profile.root_stiffness, branchStiffness: authoring.wind_profile.branch_stiffness,
    tipStiffness: authoring.wind_profile.tip_stiffness, leafFlutter: authoring.wind_profile.leaf_flutter,
    gustFrequency: authoring.wind_profile.gust_frequency, windTurbulence: authoring.wind_profile.turbulence,
    recipeName: authoring.recipe.name, recipeTags: authoring.recipe.tags.join(', '),
  };
  Object.entries(values).forEach(([id, value]) => {
    const control = $(id);
    if (control.type === 'checkbox') control.checked = Boolean(value);
    else control.value = value;
  });
  document.querySelectorAll('[data-level][data-rule]').forEach((control) => {
    const value = authoring.level_rules[Number(control.dataset.level)][control.dataset.rule];
    if (control.type === 'checkbox') control.checked = Boolean(value);
    else control.value = value;
  });
  document.querySelectorAll('[data-profile][data-point]').forEach((control) => {
    control.value = profileValue(authoring.profiles[control.dataset.profile], Number(control.dataset.point) / 2);
  });
  document.querySelectorAll('[data-curve-mode]').forEach((button) => {
    const active = button.dataset.curveMode === authoring.curve_editor.edit_mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  canvas.dataset.curveMode = authoring.curve_editor.edit_mode;
  renderModifiers();
  if (renderEditor) renderBranchEditor();
  renderSelectionSets();
  renderMasks();
  renderAttachmentLayers();
  renderTimeline();
  $('recipeBadge').textContent = authoring.recipe.name;
}

function commitAuthoringControls(event = null) {
  if (isLeafStyleControl(event?.target) && !allowLeafStyleWrite()) { applyAuthoringToControls(); return; }
  const next = collectAuthoringFromControls();
  const previous = snapshotAuthoring();
  if (equalData(previous, next)) return;
  pushHistory({ settings: collectSettings(), authoring: previous });
  setAuthoring(next, { refresh: false });
}

function disposeLeafSources() {
  leafSources.forEach((source) => source.geometry?.dispose?.());
  leafSources = [];
}

function renderLeafSources() {
  const container = $('leafSourceList');
  container.replaceChildren();
  leafSources.forEach((source, index) => {
    const row = document.createElement('div');
    row.className = 'resource-item';
    const calibration = source.calibration || { scale: 1, rotation: 0, flip: false };
    row.innerHTML = `<span title="${source.name}">${source.name}</span><input data-weight type="number" value="${source.weight}" min="0.01" max="20" step="0.1" title="出现权重"><button title="移除"><i data-lucide="x"></i></button><div class="resource-rules"><label>最低层级<input data-order-min type="number" value="${source.orderMin ?? 0}" min="0" max="3"></label><label>最高层级<input data-order-max type="number" value="${source.orderMax ?? 3}" min="0" max="3"></label><label>季节<select data-season><option value="ANY">全部</option><option value="SPRING">春</option><option value="SUMMER">夏</option><option value="AUTUMN">秋</option><option value="WINTER">冬</option></select></label><label>叶龄<select data-age-stage><option value="ANY">不指定</option><option value="MATURE">成熟叶</option><option value="TRANSITION">过渡叶</option><option value="YOUNG">嫩叶</option></select></label><label>枝丫配色<select data-shoot-role><option value="ANY">不指定</option><option value="MATURE">深绿</option><option value="MIXED">深绿＋少量嫩绿</option><option value="YOUNG">嫩绿</option></select></label></div><div class="resource-calibration"><label>校准尺寸<input data-calibration-scale type="number" value="${calibration.scale}" min="0.01" max="20" step="0.05"></label><label>轴向旋转<input data-calibration-rotation type="number" value="${calibration.rotation}" min="-180" max="180" step="1"></label><label class="inline-check">翻转正面<input data-calibration-flip type="checkbox" ${calibration.flip ? 'checked' : ''}></label></div>`;
    row.querySelector('[data-season]').value = source.season || 'ANY';
    row.querySelector('[data-age-stage]').value = source.ageStage || 'ANY';
    row.querySelector('[data-shoot-role]').value = source.shootRole || 'ANY';
    const mutate = fn => event => { if (!allowLeafStyleWrite()) { renderLeafSources(); return; } fn(event); };
    for (const control of row.querySelectorAll('input,select,button')) control.disabled = !canEditLeafStyle(leafStyleApi);
    row.querySelector('[data-weight]').addEventListener('change', mutate((event) => { source.weight = Math.max(0.01, Number(event.target.value) || 1); scheduleBuild(0); }));
    row.querySelector('[data-order-min]').addEventListener('change', mutate((event) => { source.orderMin = Math.max(0, Math.min(3, Number(event.target.value) || 0)); scheduleBuild(0); }));
    row.querySelector('[data-order-max]').addEventListener('change', mutate((event) => { source.orderMax = Math.max(0, Math.min(3, Number(event.target.value) || 3)); scheduleBuild(0); }));
    row.querySelector('[data-season]').addEventListener('change', mutate((event) => { source.season = event.target.value; scheduleBuild(0); }));
    row.querySelector('[data-age-stage]').addEventListener('change', mutate((event) => { source.ageStage = event.target.value; scheduleBuild(0); }));
    row.querySelector('[data-shoot-role]').addEventListener('change', mutate((event) => { source.shootRole = event.target.value; scheduleBuild(0); }));
    row.querySelector('[data-calibration-scale]').addEventListener('change', mutate((event) => { source.calibration = { ...calibration, scale: Math.max(0.01, Number(event.target.value) || 1) }; scheduleBuild(0); }));
    row.querySelector('[data-calibration-rotation]').addEventListener('change', mutate((event) => { source.calibration = { ...(source.calibration || calibration), rotation: Number(event.target.value) || 0 }; scheduleBuild(0); }));
    row.querySelector('[data-calibration-flip]').addEventListener('change', mutate((event) => { source.calibration = { ...(source.calibration || calibration), flip: event.target.checked }; scheduleBuild(0); }));
    row.querySelector('button').addEventListener('click', mutate(() => {
      source.geometry.dispose();
      leafSources.splice(index, 1);
      renderLeafSources();
      updateLeafSourceUi();
      scheduleBuild(0);
    }));
    container.append(row);
  });
  window.lucide?.createIcons();
}

async function api(path, body = null) {
  const response = await fetch(path, body === null ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.message || `请求失败：${path}`);
  return data;
}

function collectSettings() {
  return normalizeSettings({
    object_name: $('objectName').value,
    species_profile: $('speciesProfile').value,
    architecture: $('architecture').value,
    seed: number('seed'),
    length: number('length'),
    base_radius: number('baseDiameter') / 200,
    tip_radius: number('tipDiameter') / 200,
    main_segments: number('mainSegments'),
    radial_segments: number('radialSegments'),
    root_elevation: number('rootElevation'),
    root_azimuth: number('rootAzimuth'),
    bend: number('bend'),
    bend_frequency: number('bendFrequency'),
    twist: number('twist'),
    gravity: number('gravity'),
    phototropism: number('phototropism'),
    surface_roughness: number('surfaceRoughness'),
    junction_flare: number('junctionFlare'),
    cross_section: $('crossSection').value,
    oval_ratio: number('ovalRatio'),
    lobe_count: number('lobeCount'),
    lobe_strength: number('lobeStrength'),
    bark_seam: number('barkSeam'),
    bark_tiling: number('barkTiling'),
    adaptive_tessellation: checked('adaptiveTessellation'),
    curvature_detail: number('curvatureDetail'), radius_bias: number('radiusBias'), section_roll: number('sectionRoll'),
    groove_count: number('grooveCount'), groove_depth: number('grooveDepth'), knot_strength: number('knotStrength'),
    junction_collar: checked('junctionCollar'),
    branch_levels: number('branchLevels'),
    child_count: number('childCount'),
    child_decay: number('childDecay'),
    child_length_ratio: number('childLengthRatio'),
    child_radius_ratio: number('childRadiusRatio'),
    branch_angle: number('branchAngle'),
    angle_variation: number('angleVariation'),
    phyllotaxis_angle: number('phyllotaxisAngle'),
    asymmetry: number('asymmetry'),
    season: $('season').value,
    age: $('age').value,
    health: number('health'),
    leaf_loss: number('leafLoss'),
    growth_vigor: number('growthVigor'),
    dead_tip_ratio: number('deadTipRatio'),
    regrowth: number('regrowth'),
    wind_shape: number('windShape'),
    environment_load: $('environmentLoad').value,
    environment_load_amount: number('environmentLoadAmount'),
    damage_mode: $('damageMode').value,
    damage_amount: number('damageAmount'),
    age_progress: number('ageProgress'),
    season_progress: number('seasonProgress'),
    cut_style: $('cutStyle').value,
    leaf_arrangement: $('leafArrangement').value,
    leaf_density: number('leafDensity'),
    leaf_scale: number('leafScale'),
    leaf_scale_variation: number('leafScaleVariation'),
    leaf_age_layering: number('leafAgeLayering'),
    leaf_shoot_zoning: checked('leafShootZoning'),
    leaf_shoot_quota: checked('leafShootQuota'),
    leaf_shoot_mature_share: number('leafShootMatureShare'),
    leaf_shoot_mixed_share: number('leafShootMixedShare'),
    leaf_shoot_inner: number('leafShootInner'),
    leaf_shoot_outer: number('leafShootOuter'),
    leaf_shoot_mid_mix: number('leafShootMidMix'),
    leaf_shoot_outer_young: number('leafShootOuterYoung'),
    leaf_aspect: number('leafAspect'),
    leaf_zone_start: number('leafZoneStart'),
    tip_cluster: number('tipCluster'),
    leaf_droop: number('leafDroop'),
    leaf_outward: number('leafOutward'),
    leaf_twist: number('leafTwist'),
    leaf_min_spacing: number('leafMinSpacing'),
    foliage_mode: $('foliageMode').value,
    cluster_leaf_count: number('clusterLeafCount'),
    cluster_spread: number('clusterSpread'),
    petiole_length: number('petioleLength'),
    leaf_light_response: number('leafLightResponse'),
    branch_clearance: number('branchClearance'),
    collision_avoidance: checked('collisionAvoidance'),
    source_axis: $('sourceAxis').value,
    leaf_double_sided: checked('leafDoubleSided'),
    buds_enabled: checked('budsEnabled'),
    fruit_enabled: checked('fruitEnabled'),
    fruit_density: number('fruitDensity'),
    bark_color: $('barkColor').value,
    leaf_color: $('leafColor').value,
    autumn_color: $('autumnColor').value,
    bud_color: $('budColor').value,
    fruit_color: $('fruitColor').value,
    wind_mode: $('windMode').value,
    wind_strength: number('windStrength'),
    preview_lod: number('previewLod'),
    export_lods: checked('exportLods'),
    merge_by_material: checked('mergeByMaterial'),
    collision_mode: $('collisionMode').value,
    export_profile: $('exportProfile').value,
    generation_budget_ms: number('generationBudgetMs'),
    batch_count: number('batchCount'),
    batch_seed_step: number('batchSeedStep'),
    export_sockets: checked('exportSockets'),
    export_pcg_metadata: checked('exportPcgMetadata'),
    export_ue_script: checked('exportUeScript'),
    export_material_setup: checked('exportMaterialSetup'),
    export_state_variants: checked('exportStateVariants'),
    nanite_policy: $('nanitePolicy').value,
    ue_destination: $('ueDestination').value,
    test_map: $('testMap').value,
    capture_duration_s: number('captureDuration'),
    max_triangles: number('maxTriangles'),
    high_detail_mesh_budget: highDetailMeshBudget,
    max_leaves: number('maxLeaves'),
    output_fbx: $('outputPath').value,
    export_format: $('exportFormat').value==='FBX'?'FBX':'GLB',
    export_rigged: $('exportFormat').value==='GLB_SKINNED',
  });
}

const settingControls = {
  export_format: 'exportFormat',
  object_name: 'objectName', species_profile: 'speciesProfile', architecture: 'architecture', seed: 'seed',
  length: 'length', main_segments: 'mainSegments', radial_segments: 'radialSegments', bend: 'bend',
  root_elevation: 'rootElevation', root_azimuth: 'rootAzimuth',
  bend_frequency: 'bendFrequency', twist: 'twist', gravity: 'gravity', phototropism: 'phototropism',
  surface_roughness: 'surfaceRoughness', junction_flare: 'junctionFlare', cross_section: 'crossSection', oval_ratio: 'ovalRatio',
  lobe_count: 'lobeCount', lobe_strength: 'lobeStrength', bark_seam: 'barkSeam', bark_tiling: 'barkTiling', branch_levels: 'branchLevels', child_count: 'childCount',
  adaptive_tessellation: 'adaptiveTessellation', curvature_detail: 'curvatureDetail', radius_bias: 'radiusBias', section_roll: 'sectionRoll',
  groove_count: 'grooveCount', groove_depth: 'grooveDepth', knot_strength: 'knotStrength', junction_collar: 'junctionCollar',
  child_decay: 'childDecay', child_length_ratio: 'childLengthRatio', child_radius_ratio: 'childRadiusRatio',
  branch_angle: 'branchAngle', angle_variation: 'angleVariation', phyllotaxis_angle: 'phyllotaxisAngle',
  asymmetry: 'asymmetry', season: 'season', age: 'age', health: 'health', leaf_loss: 'leafLoss',
  growth_vigor: 'growthVigor', dead_tip_ratio: 'deadTipRatio', regrowth: 'regrowth', wind_shape: 'windShape', environment_load: 'environmentLoad', environment_load_amount: 'environmentLoadAmount',
  damage_mode: 'damageMode', damage_amount: 'damageAmount', age_progress: 'ageProgress', season_progress: 'seasonProgress', cut_style: 'cutStyle', leaf_arrangement: 'leafArrangement',
  leaf_density: 'leafDensity', leaf_scale: 'leafScale', leaf_scale_variation: 'leafScaleVariation', leaf_age_layering: 'leafAgeLayering',
  leaf_shoot_zoning: 'leafShootZoning', leaf_shoot_inner: 'leafShootInner', leaf_shoot_outer: 'leafShootOuter',
  leaf_shoot_quota: 'leafShootQuota', leaf_shoot_mature_share: 'leafShootMatureShare', leaf_shoot_mixed_share: 'leafShootMixedShare',
  leaf_shoot_mid_mix: 'leafShootMidMix', leaf_shoot_outer_young: 'leafShootOuterYoung',
  leaf_aspect: 'leafAspect', leaf_zone_start: 'leafZoneStart', tip_cluster: 'tipCluster',
  leaf_droop: 'leafDroop', leaf_outward: 'leafOutward', leaf_twist: 'leafTwist', leaf_min_spacing: 'leafMinSpacing',
  foliage_mode: 'foliageMode', cluster_leaf_count: 'clusterLeafCount', cluster_spread: 'clusterSpread', petiole_length: 'petioleLength',
  leaf_light_response: 'leafLightResponse', branch_clearance: 'branchClearance',
  collision_avoidance: 'collisionAvoidance', source_axis: 'sourceAxis', leaf_double_sided: 'leafDoubleSided',
  buds_enabled: 'budsEnabled', fruit_enabled: 'fruitEnabled', fruit_density: 'fruitDensity',
  bark_color: 'barkColor', leaf_color: 'leafColor', autumn_color: 'autumnColor', bud_color: 'budColor',
  fruit_color: 'fruitColor', wind_mode: 'windMode', wind_strength: 'windStrength', preview_lod: 'previewLod',
  export_lods: 'exportLods', merge_by_material: 'mergeByMaterial', collision_mode: 'collisionMode', export_profile: 'exportProfile',
  generation_budget_ms: 'generationBudgetMs', batch_count: 'batchCount', batch_seed_step: 'batchSeedStep', export_sockets: 'exportSockets',
  export_pcg_metadata: 'exportPcgMetadata', export_ue_script: 'exportUeScript', max_triangles: 'maxTriangles', max_leaves: 'maxLeaves',
  export_material_setup: 'exportMaterialSetup', export_state_variants: 'exportStateVariants', nanite_policy: 'nanitePolicy',
  ue_destination: 'ueDestination', test_map: 'testMap', capture_duration_s: 'captureDuration',
};

function applySettings(settings) {
  const normalized = normalizeSettings(settings);
  highDetailMeshBudget = normalized.high_detail_mesh_budget;
  $('maxTriangles').max = highDetailMeshBudget ? '30000000' : '6000000';
  $('generationBudgetMs').max = highDetailMeshBudget ? '45000' : '10000';
  Object.entries(settingControls).forEach(([key, id]) => {
    const control = $(id);
    if (!control || normalized[key] === undefined) return;
    if (control.type === 'checkbox') control.checked = Boolean(normalized[key]);
    else control.value = normalized[key];
  });
  if(normalized.export_format==='GLB'&&normalized.export_rigged)$('exportFormat').value='GLB_SKINNED';
  if (!$('outputPath').value) $('outputPath').value = config.output_fbx || '';
  $('baseDiameter').value = Number((normalized.base_radius * 200).toFixed(2));
  $('tipDiameter').value = Number((normalized.tip_radius * 200).toFixed(2));
  updateExportFormat();
  updateOutputs();
  committedSettings = collectSettings();
  parameterWorkspace?.sync();
}

function updateOutputs() {
  $('bendValue').textContent = number('bend').toFixed(2);
  $('gravityValue').textContent = number('gravity').toFixed(2);
  $('phototropismValue').textContent = number('phototropism').toFixed(2);
  $('healthValue').textContent = `${Math.round(number('health') * 100)}%`;
  $('leafLossValue').textContent = `${Math.round(number('leafLoss') * 100)}%`;
  $('damageAmountValue').textContent = `${Math.round(number('damageAmount') * 100)}%`;
  $('windStrengthValue').textContent = `${Math.round(number('windStrength') * 100)}%`;
}

function updateExportFormat() {
  const glb = $('exportFormat').value !== 'FBX',rigged=$('exportFormat').value==='GLB_SKINNED';
  $('exportBtn').querySelector('span').textContent = rigged?'导出骨骼 GLB':glb ? '导出静态 GLB' : '导出 UE FBX';
  $('exportRiggedHint').hidden=!rigged;
  $('exportLod0GlbBtn').hidden = glb;
  $('exportUnitBadge').textContent = rigged?'骨骼 GLB':glb ? '静态 GLB' : 'FBX · 厘米';
  if ($('outputPath').value) $('outputPath').value = modelOutputPath($('outputPath').value, $('exportFormat').value);
  $('exportFormatNote').textContent = rigged?'单文件包含模型、材质、贴图、真实骨骼与蒙皮。当前造型作为绑定姿态，完整单元枝整体跟随挂接；默认不附带风动动画。'
    :glb
    ? '完整精度单文件，内嵌材质与贴图，不附带 LOD、JSON 或脚本。单枝自动以连接点归零，导入 UE 后生长方向为 +Z、朝面参考为 +Y。整树和表面植物保留原有朝向。'
    : '传统 FBX：贴图另存为 PNG，可选多档 LOD 及配套文件。PVE 单枝请使用“导出高模 GLB”。';
  for (const id of ['collisionMode', 'exportSockets', 'exportPcgMetadata', 'exportUeScript', 'exportMaterialSetup', 'ueDestination', 'testMap', 'captureDuration', 'nanitePolicy']) {
    $(id).disabled = glb;
    $(id).title = glb ? '仅用于 UE FBX 导出' : '';
  }
  for (const id of ['exportLods', 'exportProfile', 'exportStateVariants']) {
    $(id).disabled = glb;
    $(id).closest('label').hidden = glb;
  }
}

function clearGroup(group) {
  while (group.children.length) group.remove(group.children[0]);
}

function buildSkeleton(branches) {
  for(const child of skeletonRoot.children)child.userData.dispose?.();
  clearGroup(skeletonRoot);
  const display=createSkeletonDisplay(branches,skeletonMaterial);
  skeletonRoot.add(display);
  skeletonRoot.userData.setVisibleIds=display.userData.setVisibleIds;
}

function previewModelBounds(object) {
  const box = new THREE.Box3().setFromObject(object);
  const surface = authoring.surface_growth;
  if (surface?.enabled && surface.visible) box.union(new THREE.Box3().setFromArray(surface.mesh.position));
  return box;
}

function fitView(referenceBounds = null) {
  if (!asset) return;
  const preview = branchWorkbench?.stroke.active ? branchWorkbench.stroke.root : branchWorkbench?.forms.active ? branchWorkbench.forms.root : branchWorkbench?.arrays.active ? branchWorkbench.arrays.root : asset.group;
  const box = referenceBounds?.isBox3 ? referenceBounds : previewModelBounds(preview);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.25);
  previewFogRadius = radius;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * Math.max(camera.aspect, 0.2));
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = radius / Math.sin(limitingFov * 0.5) * 1.12;
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 0.000001) direction.set(0.82, -1, 0.55);
  direction.normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(0.005, distance / 1000);
  camera.far = Math.max(100, distance * 20);
  camera.updateProjectionMatrix();
  controls.minDistance = Math.max(radius * 0.04, 0.05);
  controls.maxDistance = Math.max(radius * 18, 20);
  controls.update();
}

function updateViewMode() {
  if(asset)markNativeModelChanged(asset);
  const skeleton = viewMode === 'SKELETON';
  if (skeleton && skeletonDirty && asset) { buildSkeleton(asset.branches); skeletonDirty = false; }
  if (viewMode === 'WIND' && (!nativeViewport.stats.available || branchWorkbench?.views.enabled)) asset?.materialize?.();
  if (skeleton && viewportTool !== 'SELECT') setViewportTool('SELECT');
  modelRoot.visible = !skeleton;
  skeletonRoot.visible = skeleton;
  if (!asset) return;
  asset.group.traverse((object) => {
    if (!object.isMesh) return;
    if (!object.userData.originalMaterial) object.userData.originalMaterial = object.material;
    if (viewMode === 'WIND' && object.geometry.getAttribute('color')) object.material = windPreviewMaterial;
    else {
      object.material = object.userData.originalMaterial;
      object.material.wireframe = viewMode === 'WIREFRAME';
    }
  });
}

function iconListItem(icon, text, className = '') {
  const li = document.createElement('li');
  li.className = className;
  li.innerHTML = `<i data-lucide="${icon}"></i><span></span>`;
  li.querySelector('span').textContent = text;
  return li;
}

function updateInspector(result) {
  const report = result.report;
  $('statBranches').textContent = formatNumber(result.branches.length);
  $('statLeaves').textContent = formatNumber(result.placements.length);
  $('statVertices').textContent = formatNumber(report.vertices);
  $('statTriangles').textContent = formatNumber(report.triangles);
  $('statElements').textContent = formatNumber(result.elements.length);
  $('statMaterials').textContent = formatNumber(report.material_slots);
  $('branchCountMini').textContent = `${result.branches.length} 枝段`;
  $('lodBadge').textContent = ['完整预览', '标准预览', '简化预览', '远景预览'][result.settings.preview_lod];
  const budgetRatio = report.triangles / result.settings.max_triangles;
  $('budgetLabel').textContent = `${Math.round(budgetRatio * 100)}%`;
  $('validationBadge').textContent = report.ok ? (report.warnings.length ? '通过，有建议' : '检查通过') : '检查失败';
  $('validationBadge').dataset.state = report.ok ? (report.warnings.length ? 'warn' : 'ready') : 'error';

  const lodBars = $('lodBars');
  lodBars.replaceChildren();
  LOD_PROFILES.forEach((profile, index) => {
    const estimated = Math.round(report.triangles / Math.max(0.01, LOD_PROFILES[result.settings.preview_lod].segment * LOD_PROFILES[result.settings.preview_lod].leaves) * profile.segment * profile.leaves);
    const row = document.createElement('div');
    row.className = `lod-row${estimated > result.settings.max_triangles ? ' warn' : ''}`;
    row.innerHTML = `<span>LOD${index}</span><div class="lod-track"><div class="lod-fill"></div></div><b></b>`;
    row.querySelector('.lod-fill').style.width = `${Math.min(100, estimated / result.settings.max_triangles * 100)}%`;
    row.querySelector('b').textContent = formatNumber(estimated);
    lodBars.append(row);
  });

  const hierarchy = $('hierarchySummary');
  hierarchy.replaceChildren();
  const counts = new Map();
  result.branches.forEach((branch) => counts.set(branch.order, (counts.get(branch.order) || 0) + 1));
  [...counts].sort((a, b) => a[0] - b[0]).forEach(([order, count]) => {
    const span = document.createElement('span');
    span.textContent = `L${order} · ${count} 枝`;
    hierarchy.append(span);
  });
  const leaf = document.createElement('span');
  leaf.textContent = `叶片 · ${result.placements.length}`;
  hierarchy.append(leaf);

  const channels = $('channelList');
  channels.replaceChildren();
  [
    'UV0 树皮与叶片材质坐标',
    `UV1 ${result.lookupTexture.width}×${result.lookupTexture.height} 层级索引`,
    'UV2 UE 光照通道预留',
    '法线与切线完整',
    'RGBA 顶点风权重',
    `${result.settings.cross_section} 截面 · ${result.settings.foliage_mode} 叶簇`,
    `${report.material_slots} 个明确材质槽`,
  ].forEach((text) => channels.append(iconListItem('circle-check', text)));

  const issues = $('issueList');
  issues.replaceChildren();
  if (!report.warnings.length) issues.append(iconListItem('shield-check', '网格拓扑、UV 与风通道检查通过'));
  report.warnings.forEach((warning) => issues.append(iconListItem('triangle-alert', warning, 'warn')));
  if (result.placements.length >= result.settings.max_leaves) issues.append(iconListItem('gauge', '叶片数量已达到当前上限', 'warn'));
  if (result.settings.wind_mode === 'HIERARCHY_TEXTURE') issues.append(iconListItem('info', '导出时同时生成两张 16 位层级纹理与解码清单'));
  if (report.generation_ms !== undefined) issues.append(iconListItem('timer', `本次生成 ${report.generation_ms.toFixed(1)} ms / 门槛 ${result.settings.generation_budget_ms} ms`, report.generation_ms > result.settings.generation_budget_ms ? 'warn' : ''));
  if (result.authoring.foliage_masks.length) issues.append(iconListItem('circle-off', `${result.authoring.foliage_masks.length} 个叶片体积遮罩正在生效`));
  if (!leafSources.length) issues.append(iconListItem('leaf', '当前使用内置阔叶网格，可添加多个 OBJ 叶片资源'));
  window.lucide?.createIcons();
}

let selectedBranchLookup={branches:null,id:null,index:-1};
function selectedBranch() {
  const branches=asset?.branches;if(!branches||!selectedBranchId)return null;
  if(selectedBranchLookup.branches!==branches||selectedBranchLookup.id!==selectedBranchId||branches[selectedBranchLookup.index]?.stableId!==selectedBranchId)
    selectedBranchLookup={branches,id:selectedBranchId,index:branches.findIndex(branch=>branch.stableId===selectedBranchId)};
  return branches[selectedBranchLookup.index]||null;
}
function canEditSelectedBranch() {
  return !!selectedBranch() && branchWorkbench?.instances.isEditable(selectedBranchId)!==false;
}
function currentCurvePoints(){return curvePoints.sync(selectedBranchId,selectedPointIndex,editableBranchPoints(selectedBranch()).length);}
function selectCurvePoints(indices,active=null,operation='REPLACE'){
  const branch=selectedBranch();if(!branch||!canEditSelectedBranch())return;
  if(selectedBranchIds.size!==1)setBranchSelection([branch.stableId]);
  selectedPointIndex=curvePoints.select(branch.stableId,indices,active,editableBranchPoints(branch).length,operation);
  renderPointEditor();renderControlPoints();updateSelectionHelper();editContextPanel?.refresh();
  const n=currentCurvePoints().indices.length;setStatus(n?`已选 ${n} 个控制点 · Delete 删点 · G / R / S 调整`:'控制点选区为空 · 框选或点选控制点','ready');
}

function updateSelectionHelper() {
  bundle.refresh();
  if (branchWorkbench?.trunkForm.enabled || viewportTool !== 'SELECT' || selectedBranchIds.size !== 1) {
    selectionHelper.visible = false;
    return;
  }
  const branch = selectedBranch();
  const mesh = branch ? asset.group.getObjectByProperty('name', `枝段_B${String(branch.id + 1).padStart(3, '0')}_L${branch.order}`) || asset.branchMesh?.(branch.stableId) : null;
  if (!mesh) {
    selectionHelper.visible = false;
    return;
  }
  mesh.updateWorldMatrix(true, false);
  selectionBounds.setFromObject(mesh);
  selectionHelper.visible = viewportTool === 'SELECT' && selectedBranchIds.size === 1 && currentCurvePoints().scope==='BRANCH';
}

function editableBranchPoints(branch) {
  if(branchWorkbench?.instances.isEditable(branch?.stableId)===false)return [];
  return branch?.controlPoints?.length ? branch.controlPoints : branch?.points || [];
}

function curveEditOptions(branch) {
  return {
    mode: authoring.curve_editor.edit_mode,
    radius: authoring.curve_editor.falloff_radius,
    profile: authoring.curve_editor.falloff_profile,
    preserveLength: authoring.curve_editor.preserve_length,
    lockRoot: authoring.curve_editor.lock_root,
    strength: authoring.curve_editor.smooth_strength,
    pinned: authoring.overrides[branch?.stableId]?.pinned_points || [],
  };
}

function smoothPreviewPoints(points, segments = 36) {
  return controlCurveAxis(points)||points.map(p=>p.isVector3?p.clone():new THREE.Vector3(...p));
}

function updateCurveHandleDisplay() {
  const records=layoutCurveHandles(controlPointRoot,camera,canvas.clientWidth,canvas.clientHeight,selectedPointIndex,new Set(currentCurvePoints().indices));
  if(curvePointInteraction?.hovering)return records;
  const canHover=viewportTool==='SELECT' && !branchWorkbench?.trunkForm.enabled && !pointDrag && !bundle.active && !keyboardTransform?.active && !branchWorkbench?.unitEditor.enabled;
  const hit=canHover && curveHoverPointer ? pickCurveHandle(records,curveHoverPointer.x,curveHoverPointer.y) : null;
  for(const {object} of records){
    object.userData.baseMaterial ||= object.material;
    object.material=object===hit?.object ? hoveredPointMaterial : object.userData.baseMaterial;
    if(object===hit?.object)object.scale.multiplyScalar(1.18);
  }
  const label=hit ? `${hit.object.userData.category==='tangent_handle'?'切线手柄':'控制点'} ${hit.object.userData.point_index+1}` : '';
  if(label && canvas.dataset.curveHover!==label){canvas.dataset.curveHover=label;canvas.style.cursor='pointer';}
  else if(!label && canvas.dataset.curveHover){delete canvas.dataset.curveHover;canvas.style.cursor='';}
  return records;
}

function renderControlPoints(pointsOverride = null, showCurvePreview = true, guidePointsOverride = null) {
  controlPointRoot.children.filter((item) => ['control_guide', 'tangent_guide', 'curve_preview'].includes(item.userData.category)).forEach((item) => {
    if (item.userData.category === 'curve_preview') item.geometry.dispose();
    else disposeCurveGuide(item);
  });
  controlPointRoot.clear();
  const branch = selectedBranch();
  if (!branch || !selectedBranchIds.has(branch.stableId) || branchWorkbench?.trunkForm.enabled || viewMode === 'SKELETON' || !canEditSelectedBranch()) return;
  const editPoints = (pointsOverride || editableBranchPoints(branch)).map((point) => point.isVector3 ? point.clone() : new THREE.Vector3(...point));
  const selectedPoints=new Set(currentCurvePoints().indices);
  const pinned = new Set(authoring.overrides[branch.stableId]?.pinned_points || []);
  if (authoring.curve_editor.lock_root) pinned.add(0);
  const weights = selectedPointIndex >= 0
    ? curveInfluenceWeights(editPoints.map((point) => point.toArray()), selectedPointIndex, curveEditOptions(branch))
    : editPoints.map(() => 0);
  const previewCurve = guidePointsOverride || (!pointsOverride ? branch.points : smoothPreviewPoints(editPoints, Math.max(24, branch.points.length - 1)));
  const guide = createCurveGuide(previewCurve);
  guide.userData = { category: 'control_guide', branch_id: branch.stableId };
  guide.renderOrder = 99;
  controlPointRoot.add(guide);
  editPoints.forEach((point, index) => {
    const weight = weights[index] || 0;
    const material = selectedPoints.has(index)?index===selectedPointIndex?activeControlPointMaterial:selectedControlPointMaterial:pinned.has(index) ? pinnedPointMaterial : selectedPointIndex >= 0 ? influencePointMaterials[Math.round(weight * 10)] : controlPointMaterial;
    const handle = new THREE.Mesh(controlPointGeometry, material);
    handle.position.copy(point);
    handle.scale.setScalar(index === selectedPointIndex ? 1.65 : 0.92 + weight * 0.24);
    handle.renderOrder = 100;
    handle.userData = { category: 'control_point', branch_id: branch.stableId, point_index: index, influence: weight };
    addCurveHandleOutline(handle,{active:index===selectedPointIndex,selected:selectedPoints.has(index),pinned:pinned.has(index)});
    controlPointRoot.add(handle);
  });
  if (pointsOverride && showCurvePreview && !pointDrag?.preview && authoring.curve_editor.live_preview && previewCurve.length > 1) {
    const curve = new THREE.CatmullRomCurve3(editPoints, false, 'centripetal', 0.5);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(16, branch.points.length - 1), Math.max(0.0025, branch.startRadius * 1.015), 7, false),
      curvePreviewMaterial,
    );
    tube.userData.category = 'curve_preview';
    tube.renderOrder = 98;
    controlPointRoot.add(tube);
  }
  if (selectedPointIndex >= 0 && editPoints[selectedPointIndex]) {
    const handles = tangentHandles(editPoints.map((point) => point.toArray()), selectedPointIndex, authoring.curve_editor.tangent_length);
    if (handles) {
      const pivot = editPoints[selectedPointIndex];
      const guide = createCurveGuide([new THREE.Vector3(...handles.in), pivot, new THREE.Vector3(...handles.out)],{tangent:true});
      guide.userData.category = 'tangent_guide';
      guide.renderOrder = 101;
      controlPointRoot.add(guide);
      [-1, 1].filter((side) => editPoints[selectedPointIndex + side]).forEach((side) => {
        const position = side < 0 ? handles.in : handles.out;
        const handle = new THREE.Mesh(controlPointGeometry, tangentPointMaterial);
        handle.position.set(...position);
        handle.scale.setScalar(0.72);
        handle.renderOrder = 102;
        handle.userData = { category: 'tangent_handle', branch_id: branch.stableId, point_index: selectedPointIndex, side };
        addCurveHandleOutline(handle);
        controlPointRoot.add(handle);
      });
    }
  }
}

function instanceSelectionId(branch) {
  return branch?.stableId ? branchWorkbench?.instances.canonicalSelectionId(branch.stableId) || branch.stableId : null;
}
function syncTreeSelectionMode() {
  document.body.dataset.treeEditMode=treeUnitMode()?'UNIT':'BONE';
  document.querySelectorAll('button[data-tree-selection-kind]').forEach(button=>{
    const active=button.dataset.treeSelectionKind===selectionKind;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  });
  const pick=$('treeAssemblySelect');
  if(pick){pick.classList.toggle('active',selectionKind==='INSTANCE');pick.setAttribute('aria-pressed',String(selectionKind==='INSTANCE'));}
  canvas.dataset.treePickKind=selectionKind;
  document.querySelectorAll('[data-viewport-tool]').forEach(button=>{
    if (SCULPT_TOOLS.has(button.dataset.viewportTool) || viewportStrokeTools.has(button.dataset.viewportTool)) button.disabled=treeUnitMode()&&button.dataset.viewportTool!=='COMB';
  });
}
async function requestTreeSelectionMode(kind) {
  if(branchWorkbench?.mode!=='TREE')return;
  if(selectionModeSwitch||keyboardTransform?.active||advancedGesture||branchWorkbench.busy){showToast('请先结束当前操作，再切换点选对象');return;}
  selectionModeSwitch=true;
  try{
    const next=kind==='INSTANCE'?'INSTANCE':'SKELETON',keepComb=viewportTool==='COMB';
    branchWorkbench.trunkForm.deactivate();
    setViewportTool('SELECT');setBranchSelection([]);
    // A skeleton-only preview contains no mounted units to pick. Restore the
    // complete tree when entering unit selection, rather than silently failing.
    if(next==='INSTANCE'&&skeletonEditMode){showToast('正在恢复整树，以便点选单元枝…');await setSkeletonEditMode(false);}
    if(branchWorkbench.mode!=='TREE')return;
    if(next==='INSTANCE'&&viewMode==='SKELETON')document.querySelector('.view-mode[data-view="SOLID"]').click();
    selectionKind=next;syncTreeSelectionMode();refreshBranchEditScope();
    if(keepComb)setViewportTool('COMB');
    bundle.drawOutline();branchWorkbench.context.refresh();
    showToast(next==='INSTANCE'?'单元枝：点选整支，G/R/S 微调；C 梳理批量转向，枝根与内部样式保持':'主枝干：编辑承重骨架与控制点；C 梳理树形，单元枝整体跟随');
  }catch(error){showToast(error.message,true);}finally{selectionModeSwitch=false;}
}
function setBranchSelection(ids, { excluded = new Set() } = {}) {
  const selectedProfile=performanceRecorder.begin('selection.total_sync');
  const measure=(name,fn)=>performanceRecorder.measure('selection.'+name,fn);
  branchWorkbench?.trunkForm.cancel();
  hoverAssemblyUnits([]);
  localBranchEdit?.commit();
  branchWorkbench?.assemblyGrowth.commit();
  const boundary = measure('boundary',()=>branchWorkbench?.mode === 'TREE' ? unitScopeBoundary() : null);
  const canonical = id => {
    const b = asset?.masterBranches.find(branch => branch.stableId === id), owner = boundary?.ownerOf(id);
    return owner ? boundary.roots.get(owner.id) || id : b?.symmetrySource || id;
  };
  selectedBranchExclusions = new Set([...excluded].map(canonical));
  ids = [...ids].map(canonical);
  if (branchWorkbench?.mode === 'TREE' && ids.length) {
    const containsInstance = ids.some(id=>branchWorkbench.instances.isEditable(id)===false);
    selectionKind = containsInstance ? 'INSTANCE' : 'SKELETON';
    ids=ids.filter(id=>(branchWorkbench.instances.isEditable(id)===false) === containsInstance);
    syncTreeSelectionMode();
  }
  sculpt.cancel(); bundle.cancel(); cancelControlPointDrag(); cancelPruneStroke();
  selectedBranchIds = new Set([...ids].filter(id => asset?.masterBranches.some(branch => branch.stableId === id)
    && (bundle.isVisible(id) || boundary?.ownedBranches.get(boundary.ownerOf(id)?.id)?.some(branch => bundle.isVisible(branch.stableId)))
    && (branchWorkbench?.instances.isSelectable(id) ?? true)));
  selectedBranchId = [...selectedBranchIds].at(-1) || null;
  selectedPointIndex = -1;
  curvePoints.branch(selectedBranchId);curvePointInteraction?.clear();
  return withAssemblyReadScope(()=>{
  refreshingBranchSelection=true;
  try{measure('editor',()=>renderBranchEditor({selectionOnly:true}));}finally{refreshingBranchSelection=false;}
  measure('outliner',()=>renderBranchOutliner());
  measure('outline',()=>updateSelectionHelper());
  measure('points',()=>renderControlPoints());
  measure('sets',()=>renderSelectionSets());
  measure('comb_targets',()=>unitComb?.refreshTargets());
  measure('context',()=>editContextPanel?.refresh());selectedProfile?.end();
  });
}

function selectBranch(stableId, additive = false) {
  const ids = additive ? new Set(selectedBranchIds) : new Set();
  if (stableId) { if (additive && ids.has(stableId)) ids.delete(stableId); else ids.add(stableId); }
  setBranchSelection(ids);
}

function renderBranchEditor({ placementOnly = false, selectionOnly = false } = {}) {
  importedTrunkContext?.refresh();
  syncTreeSelectionMode();
  // A placement refresh derives the current assembly state below and then
  // synchronizes this bar. Do not build that same selection twice beforehand.
  if (!placementOnly && !selectionOnly) refreshBranchEditScope();
  branchWorkbench?.refresh({ placementOnly, selectionOnly });
  if(!selectionOnly)barkMaterialControls?.refresh();
  if (!placementOnly) {
    leafResources?.refresh();
    leafStyleBoundary?.refresh();
    generatorWorkspace?.refresh({selectionOnly});
    spatialControls?.refresh();
  }
  const branch = selectedBranch();
  $('selectionEmpty').hidden = Boolean(branch);
  const editable=!!branch&&branchWorkbench?.instances.isEditable(branch.stableId)!==false;
  $('branchEditor').hidden = !editable;
  $('branchEditor').inert = !editable;
  $('selectedBranchLabel').textContent = branch ? `${branch.stableId} · L${branch.order}${selectedBranchIds.size > 1 ? ` · 共 ${selectedBranchIds.size} 枝` : ''}` : '未选择';
  $('multiSelectCount').textContent = `${selectedBranchIds.size} 枝`;
  parameterWorkspace?.selectionChanged(selectedBranchIds.size, [...selectedBranchIds].join(','));
  if (!editable) { renderPointEditor(); if (!placementOnly) parameterWorkspace?.sync(); return; }
  if (localBranchEdit?.active) { renderPointEditor(); parameterWorkspace?.sync(); return; }
  const local = authoring.overrides[branch.stableId] || {};
  const relative = $('localApplyMode').value === 'RELATIVE';
  const values = {
    localLength: local.length ?? 1, localRadius: local.radius ?? 1,
    localBend: local.bend ?? 1, localLeaves: local.leaf_density ?? 1,
    localRotX: local.rotation?.[0] ?? 0, localRotY: local.rotation?.[1] ?? 0,
    localRotZ: local.rotation?.[2] ?? 0, localOffsetZ: local.offset?.[2] ?? 0,
  };
  const property = { localLength: ['length', 1], localRadius: ['radius', 1], localBend: ['bend', 1], localLeaves: ['leaf_density', 1],
    localRotX: ['rotation', 0, 0], localRotY: ['rotation', 0, 1], localRotZ: ['rotation', 0, 2], localOffsetZ: ['offset', 0, 2] };
  Object.entries(values).forEach(([id, value]) => {
    const [key, fallback, index] = property[id];
    const selectedValues = [...selectedBranchIds].map((stableId) => {
      const field = authoring.overrides[stableId]?.[key]; return (index === undefined ? field : field?.[index]) ?? fallback;
    });
    const mixed = selectedValues.some((candidate) => candidate !== value);
    $(id).value = relative ? fallback : mixed ? '' : value; $(id).placeholder = !relative && mixed ? '混合值' : ''; $(id).dataset.mixed = String(!relative && mixed);
  });
  $('localLocked').checked = Boolean(local.locked);
  $('localHidden').checked = Boolean(local.hidden);
  for (const [id, key] of [['localLocked', 'locked'], ['localHidden', 'hidden']]) {
    $(id).indeterminate = relative || [...selectedBranchIds].some((stableId) => Boolean(authoring.overrides[stableId]?.[key]) !== $(id).checked);
  }
  renderPointEditor();
  parameterWorkspace?.sync();
}

let outlinerSignature='',outlinerRows=[];
function renderBranchOutliner() {
  const container = $('branchOutliner');
  const branches=asset?.branches.filter(branch=>bundle.isVisible(branch.stableId)&&(branchWorkbench?.instances.isSelectable(branch.stableId)??true))||[];
  const signature=JSON.stringify([branchWorkbench?.mode,branches.map(b=>[b.stableId,b.order,Boolean(b.manual)]),authoring.topology.suppressed]);
  $('overrideCount').textContent = `${Object.keys(authoring.overrides).length + authoring.manual_branches.length} 个局部修改`;
  if(signature===outlinerSignature){
    for(const [id,manual,button]of outlinerRows){button.classList.toggle('active',selectedBranchIds.has(id));button.dataset.overridden=String(Boolean(authoring.overrides[id]||manual));}
    return;
  }
  outlinerSignature=signature;outlinerRows=[];
  const scrollTop = container.scrollTop;
  container.replaceChildren();
  if (!asset) return;
  const fragment=document.createDocumentFragment();
  branches.forEach((branch) => {
    const button = document.createElement('button');
    button.classList.toggle('active', selectedBranchIds.has(branch.stableId));
    button.dataset.overridden = String(Boolean(authoring.overrides[branch.stableId] || branch.manual));
    button.style.paddingLeft = `${6 + branch.order * 12}px`;
    button.innerHTML = `<i data-lucide="git-branch"></i><span>${branch.stableId}${branch.manual ? ' · 手工' : ''}</span><small>L${branch.order}</small>`;
    button.addEventListener('click', (event) => selectBranch(branch.stableId, event.ctrlKey || event.shiftKey));
    fragment.append(button);outlinerRows.push([branch.stableId,branch.manual,button]);
  });
  authoring.topology.suppressed.forEach((stableId) => {
    const button = document.createElement('button');
    button.className = 'suppressed';
    button.innerHTML = `<i data-lucide="eye-off"></i><span>${stableId} · 已抑制</span><small>恢复</small>`;
    button.addEventListener('click', () => transactAuthoring('已恢复程序枝', (next) => { next.topology.suppressed = next.topology.suppressed.filter((id) => id !== stableId); }));
    fragment.append(button);
  });
  container.append(fragment);
  window.lucide?.createIcons({root:container});
  container.scrollTop = scrollTop;
}

function resetSelectedBranchEdit() {
  if(!canEditSelectedBranch())return;
  localBranchEdit?.commit();
  const branch = selectedBranch();
  if (!branch) return;
  transactAuthoring('已重置当前枝条', (next) => { delete next.overrides[branch.stableId]; next.sculpt_layers=next.sculpt_layers.filter(l=>l.operation?.type!=='CONTROL_CURVE'||l.operation.root!==branch.stableId);next.sculpt_layers.forEach((layer) => { delete layer.branches[branch.stableId]; }); }, { bypassLayers: true });
}

function renderPointEditor() {
  const branch = selectedBranch();
  const editPoints = editableBranchPoints(branch);
  const point = editPoints[selectedPointIndex];
  const pointSelection=currentCurvePoints();
  if ($('pointCompanion')) $('pointCompanion').hidden = !point&&pointSelection.scope!=='POINTS';
  $('pointLabel').textContent = pointSelection.scope==='POINTS'?`已选 ${pointSelection.indices.length} / ${editPoints.length} 点${point?' · 当前 '+(selectedPointIndex+1):''}`: '整枝已选 · Delete 删枝';
  $('curvePointStats').textContent = branch ? `${editPoints.length} 个锚点` : '0 个锚点';
  ['pointX', 'pointY', 'pointZ', 'applyPointBtn', 'pinPointBtn', 'insertBeforeBtn', 'insertPointBtn', 'removePointBtn', 'smoothCurveBtn', 'subdivideNeighborhoodBtn', 'trimTipBtn', 'trimRootBtn'].forEach((id) => { $(id).disabled = !point; });
  $('rebuildControlCurveBtn').disabled=!branch||!canEditSelectedBranch();
  $('insertBeforeBtn').disabled = !point || selectedPointIndex <= 0 || editPoints.length >= 64;
  $('insertPointBtn').disabled = !point || selectedPointIndex >= editPoints.length - 1 || editPoints.length >= 64;
  $('subdivideNeighborhoodBtn').disabled = !point || editPoints.length >= 64;
  $('removePointBtn').disabled = !pointSelection.indices.length || editPoints.length<=4;
  $('trimTipBtn').disabled = !point || selectedPointIndex < 3 || selectedPointIndex >= editPoints.length - 1;
  $('trimRootBtn').disabled = !point || selectedPointIndex <= 0 || editPoints.length - selectedPointIndex < 4;
  $('subdivideAllBtn').disabled = !branch || editPoints.length >= 64;
  $('smartSimplifyBtn').disabled = !branch || editPoints.length <= 4;
  $('redistributeKnotsBtn').disabled = !branch;
  $('resetCurveBtn').disabled = !branch;
  if (!point) return;
  $('pointX').value = point.x.toFixed(4);
  $('pointY').value = point.y.toFixed(4);
  $('pointZ').value = point.z.toFixed(4);
  const pinned = new Set(authoring.overrides[branch.stableId]?.pinned_points || []);
  const rootLocked = authoring.curve_editor.lock_root && selectedPointIndex === 0;
  $('pinPointBtn').disabled = rootLocked;
  $('pinPointBtn').classList.toggle('active', pinned.has(selectedPointIndex) || rootLocked);
  $('pinPointBtn').title = rootLocked ? '先关闭固定枝根才能编辑根部锚点' : '固定或解除当前锚点';
}

function commitCurveKnots(points, label = '已编辑枝条曲线') {
  if(!canEditSelectedBranch())return false;
  const branch = selectedBranch();
  if (!branch) return false;
  const operation=controlCurveOperation(branch,points);
  if(!controlCurveAxis(operation.knots)){showToast('至少保留两个不同位置的控制点',true);return false;}
  if(evaluateControlCurve(asset.masterBranches,operation,1,authoring.overrides)===asset.masterBranches){showToast('连接枝条或控制点有固定锚点，请先解除固定',true);return false;}
  return transactAuthoring(label,next=>writeControlCurve(next,operation));
}

function commitControlPoint(position, label = '已编辑枝条控制点') {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  if (!branch || selectedPointIndex < 0) return;
  const pinned = new Set(authoring.overrides[branch.stableId]?.pinned_points || []);
  if (pinned.has(selectedPointIndex) || (authoring.curve_editor.lock_root && selectedPointIndex === 0)) return showToast('该锚点已固定，请先解除固定', true);
  const points = editableBranchPoints(branch).map((point) => point.toArray());
  const deformed = deformCurvePoints(points, selectedPointIndex, position.toArray(), curveEditOptions(branch));
  commitCurveKnots(deformed, label);
}

function constrainCurveTarget(branch, origin, candidate) {
  if (authoring.curve_editor.coordinate_space !== 'LOCAL' || authoring.curve_editor.constraint === 'FREE') {
    return new THREE.Vector3(...constrainPoint(origin.toArray(), candidate.toArray(), authoring.curve_editor.constraint, authoring.curve_editor.snap));
  }
  const editPoints = editableBranchPoints(branch);
  const previous = editPoints[Math.max(0, selectedPointIndex - 1)] || origin;
  const next = editPoints[Math.min(editPoints.length - 1, selectedPointIndex + 1)] || origin;
  const localZ = next.clone().sub(previous).normalize();
  const helper = Math.abs(localZ.z) < 0.92 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const localX = helper.clone().cross(localZ).normalize();
  const localY = localZ.clone().cross(localX).normalize();
  const delta = candidate.clone().sub(origin);
  const local = [delta.dot(localX), delta.dot(localY), delta.dot(localZ)];
  const constrained = constrainPoint([0, 0, 0], local, authoring.curve_editor.constraint, authoring.curve_editor.snap);
  return origin.clone().addScaledVector(localX, constrained[0]).addScaledVector(localY, constrained[1]).addScaledVector(localZ, constrained[2]);
}

function applyPointInputs() {
  const branch = selectedBranch();
  const origin = editableBranchPoints(branch)[selectedPointIndex];
  if (!origin) return;
  const constrained = constrainCurveTarget(branch, origin, new THREE.Vector3(number('pointX'), number('pointY'), number('pointZ')));
  commitControlPoint(constrained);
}

function togglePointPin() {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  if (!branch || selectedPointIndex < 0) return;
  transactAuthoring('已切换控制点固定状态', (next) => {
    const override = next.overrides[branch.stableId] = { ...(next.overrides[branch.stableId] || {}) };
    const pins = new Set(override.pinned_points || []);
    if (pins.has(selectedPointIndex)) pins.delete(selectedPointIndex); else pins.add(selectedPointIndex);
    override.pinned_points = [...pins];
  });
}

function closestCurvePointIndex(points, target) {
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  points.forEach((point, index) => {
    const value = point.isVector3 ? point : new THREE.Vector3(...point);
    const candidate = value.distanceToSquared(target);
    if (candidate < nearestDistance) { nearestDistance = candidate; nearestIndex = index; }
  });
  return nearestIndex;
}

function remapPinnedPoints(previousPoints, nextPoints, pinnedPoints) {
  const nextVectors = nextPoints.map((point) => point.isVector3 ? point : new THREE.Vector3(...point));
  return [...new Set((pinnedPoints || []).map((index) => previousPoints[index])
    .filter(Boolean)
    .map((point) => closestCurvePointIndex(nextVectors, point.isVector3 ? point : new THREE.Vector3(...point))))]
    .sort((a, b) => a - b);
}

function commitCurveTopology(points, label, options = {}) {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  if (!branch || points.length < 4) return;
  const previousPoints = editableBranchPoints(branch).map((point) => point.clone());
  let normalized = points.map((point) => point.isVector3 ? point.toArray() : point.slice(0, 3));
  if (normalized.length > 64) normalized = resamplePolyline(normalized, 64);
  if(evaluateControlCurve(asset.masterBranches,controlCurveOperation(branch,normalized),1,authoring.overrides)===asset.masterBranches){showToast('连接枝条或控制点有固定锚点，请先解除固定',true);return;}
  const previousPins = authoring.overrides[branch.stableId]?.pinned_points || [];
  const pins = options.pinnedPoints || remapPinnedPoints(previousPoints, normalized, previousPins);
  const focus = options.focusPoint || previousPoints[selectedPointIndex] || new THREE.Vector3(...normalized[0]);
  selectedPointIndex = closestCurvePointIndex(normalized, focus.isVector3 ? focus : new THREE.Vector3(...focus));
  selectedPointIndex=curvePoints.select(branch.stableId,options.clearPoints?[]:[selectedPointIndex],options.clearPoints?-1:selectedPointIndex,normalized.length);
  transactAuthoring(label, (next) => {
    const previous = next.overrides[branch.stableId] || {};
    next.curve_editor.knot_count = normalized.length;
    next.overrides[branch.stableId] = { ...previous,pinned_points:pins };
    writeControlCurve(next,controlCurveOperation(branch,normalized));
  });
}

function insertControlPoint(side = 1) {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  const editPoints = editableBranchPoints(branch);
  if (!branch || selectedPointIndex < 0 || editPoints.length >= 64) return;
  const segmentIndex = side < 0 ? selectedPointIndex - 1 : selectedPointIndex;
  if (segmentIndex < 0 || segmentIndex >= editPoints.length - 1) return;
  const points = editPoints.map((point) => point.toArray());
  const midpoint = editPoints[segmentIndex].clone().lerp(editPoints[segmentIndex + 1], 0.5);
  points.splice(segmentIndex + 1, 0, midpoint.toArray());
  commitCurveTopology(points, side < 0 ? '已在当前点前方加点' : '已在当前点后方加点', { focusPoint: midpoint });
}

function removeControlPoint() {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  const editPoints = editableBranchPoints(branch);
  if(!branch)return;
  const plan=planCurvePointDeletion(editPoints,currentCurvePoints().indices,authoring.overrides[branch.stableId]?.pinned_points||[]);
  if(plan.reason)return showToast(plan.reason,true);
  commitCurveTopology(plan.points,`已删除 ${plan.removed.length} 个控制点${plan.retained?'，端点和固定点保留':''}`,{pinnedPoints:plan.pinned,clearPoints:true});
}

function smoothSelectedCurve() {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  if (!branch || selectedPointIndex < 0) return showToast('请先选择一个曲线锚点', true);
  const points = editableBranchPoints(branch).map((point) => point.toArray());
  commitCurveKnots(smoothCurvePoints(points, selectedPointIndex, curveEditOptions(branch)), '已平滑局部枝条曲线');
}

function redistributeCurveKnots() {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  if (!branch) return;
  const points = resamplePolyline(editableBranchPoints(branch).map((point) => point.toArray()), authoring.curve_editor.knot_count);
  commitCurveTopology(points, `已匹配为 ${points.length} 个均匀锚点`);
}

function subdivideSelectedCurve(scope) {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  const editPoints = editableBranchPoints(branch);
  if (!branch || !editPoints.length || (scope !== 'ALL' && selectedPointIndex < 0)) return;
  const points = subdivideCurvePoints(editPoints.map((point) => point.toArray()), {
    scope,
    index: Math.max(0, selectedPointIndex),
    levels: authoring.curve_editor.subdivision_levels,
  });
  const added = Math.min(64, points.length) - editPoints.length;
  if (added <= 0) return showToast('当前曲线已达到 64 个锚点', true);
  commitCurveTopology(points, `已${scope === 'ALL' ? '细分整条曲线' : '加密当前邻域'}，增加 ${added} 个锚点`);
}

function simplifySelectedCurve() {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  const editPoints = editableBranchPoints(branch);
  if (!branch || editPoints.length <= 4) return;
  const pinned = authoring.overrides[branch.stableId]?.pinned_points || [];
  const required = [...pinned];
  if (selectedPointIndex >= 0) required.push(selectedPointIndex);
  const points = simplifyCurvePoints(editPoints.map((point) => point.toArray()), authoring.curve_editor.simplify_tolerance, required, 4);
  const removed = editPoints.length - points.length;
  if (!removed) return showToast('当前容差内没有可精简的冗余锚点');
  commitCurveTopology(points, `已精简 ${removed} 个锚点，保留 ${points.length} 个`);
}

function trimSelectedCurve(keepSide) {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  const editPoints = editableBranchPoints(branch);
  if (!branch || selectedPointIndex < 0) return;
  const points = trimCurvePoints(editPoints.map((point) => point.toArray()), selectedPointIndex, keepSide, 4);
  if (points.length === editPoints.length) return showToast('修剪后至少需要保留 4 个锚点', true);
  const previousPins = authoring.overrides[branch.stableId]?.pinned_points || [];
  const pins = keepSide === 'TIP'
    ? previousPins.filter((index) => index >= selectedPointIndex).map((index) => index - selectedPointIndex)
    : previousPins.filter((index) => index <= selectedPointIndex);
  const focus = keepSide === 'TIP' ? new THREE.Vector3(...points[0]) : new THREE.Vector3(...points.at(-1));
  commitCurveTopology(points, keepSide === 'TIP' ? '已修剪根侧曲线' : '已修剪枝梢曲线', { focusPoint: focus, pinnedPoints: pins });
}

function resetSelectedCurve() {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  if (!branch) return;
  selectedPointIndex = -1;
  transactAuthoring('已恢复程序化枝条曲线', (next) => {
    next.sculpt_layers=next.sculpt_layers.filter(l=>l.operation?.type!=='CONTROL_CURVE'||l.operation.root!==branch.stableId);
    next.sculpt_layers.forEach((layer) => { delete layer.branches[branch.stableId]; });
    const previous = next.overrides[branch.stableId];
    if (!previous) return;
    const cleaned = { ...previous, locked: false, curve_knots: null, curve_samples: null, curve_sample_times: null, curve_reference_knots: null, curve_parent_frame: null, frozen_points: null, pinned_points: [], sculpt_mask: [] };
    const isDefault = !cleaned.hidden && cleaned.length === 1 && cleaned.radius === 1 && cleaned.bend === 1 && cleaned.wind_stiffness === 1 && cleaned.leaf_density === 1
      && cleaned.rotation.every((value) => value === 0) && cleaned.offset.every((value) => value === 0);
    if (isDefault) delete next.overrides[branch.stableId]; else next.overrides[branch.stableId] = cleaned;
  }, { bypassLayers: true });
}

function setCurveEditMode(mode) {
  if (!['DIRECT', 'SOFT_MOVE', 'BEND', 'TIP_IK', 'SEGMENT', 'SMOOTH'].includes(mode)) return;
  if (viewportTool !== 'SELECT') setViewportTool('SELECT');
  const next = snapshotAuthoring();
  next.curve_editor.edit_mode = mode;
  setAuthoring(next, { rebuild: false, refresh: true });
  renderControlPoints();
  const label = curveModeLabels[mode] || mode;
  showToast(`曲线模式：${label}`);
}

function selectCurvePoint(index) {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  const points = editableBranchPoints(branch);
  if (!branch || !points.length) return;
  const selected=Math.max(0,Math.min(points.length-1,index));selectCurvePoints([selected],selected);
}

function runCurveShortcut(action) {
  const mode = action.startsWith('MODE_') ? action.slice(5) : null;
  if (mode) return setCurveEditMode(mode);
  if (action === 'TOOL_SELECT') return setViewportTool('SELECT');
  if (action === 'TOGGLE_PRUNE_BRUSH') return setViewportTool(viewportTool === 'PRUNE' ? 'SELECT' : 'PRUNE');
  const branch = selectedBranch();
  if (!branch) return;
  const lastIndex = editableBranchPoints(branch).length - 1;
  const operations = {
    PREVIOUS_POINT: () => selectCurvePoint(selectedPointIndex < 0 ? 0 : selectedPointIndex - 1),
    NEXT_POINT: () => selectCurvePoint(selectedPointIndex < 0 ? 0 : selectedPointIndex + 1),
    FIRST_POINT: () => selectCurvePoint(0),
    LAST_POINT: () => selectCurvePoint(lastIndex),
    INSERT_BEFORE: () => insertControlPoint(-1),
    INSERT_AFTER: () => insertControlPoint(1),
    REMOVE_POINT: removeControlPoint,
    SUBDIVIDE_NEIGHBORHOOD: () => subdivideSelectedCurve('NEIGHBORHOOD'),
    SUBDIVIDE_ALL: () => subdivideSelectedCurve('ALL'),
    SIMPLIFY: simplifySelectedCurve,
    MATCH_COUNT: redistributeCurveKnots,
    TRIM_TIP: () => trimSelectedCurve('ROOT'),
    TRIM_ROOT: () => trimSelectedCurve('TIP'),
    TOGGLE_PIN: togglePointPin,
    SMOOTH: smoothSelectedCurve,
  };
  operations[action]?.();
}

function duplicateOrMirrorBranch(mirror = false) {
  const targets = [...selectedBranchIds].map((id) => asset?.branches.find((branch) => branch.stableId === id)).filter(branch=>branch&&(branchWorkbench?.instances.isEditable(branch.stableId)??true));
  if (!targets.length) return;
  transactAuthoring(mirror ? '已镜像复制枝条' : '已复制枝条', (next) => {
    targets.forEach((branch, index) => {
      if (branch.order === 0) { next.root_count = Math.min(8, next.root_count + 1); return; }
      const parent = asset.branches.find((item) => item.id === branch.parentId);
      if (!parent) return;
      const id = `M${Date.now().toString(36).toUpperCase()}_${index}`;
      next.manual_branches.push({ id, parent: parent.stableId, attach: 0.7, length: branch.length, radius: branch.startRadius, angle: 42, azimuth: mirror ? 180 : 0 });
      next.overrides[id] = {
        locked: true,
        curve_knots: editableBranchPoints(branch).map((point) => mirror ? [point.x, -point.y, point.z] : [point.x + 0.08, point.y, point.z]),
        frozen_points: null,
      };
    });
  });
}

function reparentSelectedBranch() {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  const targetId = $('reparentTarget').value.trim();
  const parent = asset?.branches.find((item) => item.stableId === targetId);
  if (!branch || !parent) return showToast('请输入现有父级 Stable ID', true);
  if (branch.order === 0 || parent.stableId === branch.stableId || parent.stableId.startsWith(`${branch.stableId}.`)) return showToast('主枝或自身子树不能这样重设父级', true);
  transactAuthoring('已重设枝条父级', (next) => {
    next.topology.reparent[branch.stableId] = parent.stableId;
    next.topology.attach[branch.stableId] = number('reparentAttach');
    next.topology.operations.push({ id: `TOPO_${Date.now().toString(36).toUpperCase()}`, type: 'REPARENT', target: branch.stableId, created: parent.stableId, at: number('reparentAttach') });
  });
}

function splitSelectedBranch() {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  const editPoints = editableBranchPoints(branch);
  if (!branch || selectedPointIndex <= 1 || selectedPointIndex >= editPoints.length - 2) return showToast('请选择枝条中部锚点进行分段', true);
  const splitIndex = selectedPointIndex;
  const first = editPoints.slice(0, splitIndex + 1).map((point) => point.toArray());
  const second = editPoints.slice(splitIndex).map((point) => point.toArray());
  const newId = `S${Date.now().toString(36).toUpperCase()}`;
  transactAuthoring('已从控制点分段', (next) => {
    next.overrides[branch.stableId] = { ...(next.overrides[branch.stableId] || {}), locked: true, curve_knots: first, frozen_points: null };
    next.manual_branches.push({ id: newId, parent: branch.stableId, attach: 0.98, length: Math.max(0.03, branch.length * (1 - splitIndex / editPoints.length)), radius: branch.endRadius * 1.25, angle: 5, azimuth: 0 });
    next.overrides[newId] = { locked: true, curve_knots: second, frozen_points: null };
    branch.children.forEach((childId) => {
      const child = asset.branches.find((item) => item.id === childId);
      if (child) { next.topology.reparent[child.stableId] = newId; next.topology.attach[child.stableId] = 0.72; }
    });
    next.topology.operations.push({ id: `TOPO_${Date.now().toString(36).toUpperCase()}`, type: 'SPLIT', target: branch.stableId, created: newId, at: splitIndex / (editPoints.length - 1) });
  });
}

function extendSelectedBranch() {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  if (!branch) return;
  const editPoints = editableBranchPoints(branch);
  const points = editPoints.map((point) => point.toArray());
  const tip = editPoints.at(-1);
  const previous = editPoints.at(-2);
  const direction = tip.clone().sub(previous).normalize();
  const step = Math.max(0.03, tip.distanceTo(previous));
  for (let index = 1; index <= 3; index += 1) points.push(tip.clone().addScaledVector(direction, step * index).toArray());
  selectedPointIndex = points.length - 1;
  transactAuthoring('已延长枝条', (next) => {
    next.overrides[branch.stableId] = { ...(next.overrides[branch.stableId] || {}), locked: true, curve_knots: points, frozen_points: null };
    next.topology.operations.push({ id: `TOPO_${Date.now().toString(36).toUpperCase()}`, type: 'EXTEND', target: branch.stableId, at: 1 });
  });
}

function toggleSuppressedBranch() {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  if (!branch) return;
  const wasSuppressed = authoring.topology.suppressed.includes(branch.stableId);
  transactAuthoring(wasSuppressed ? '已恢复程序枝' : '已抑制程序枝', (next) => {
    const values = new Set(next.topology.suppressed);
    if (values.has(branch.stableId)) values.delete(branch.stableId); else values.add(branch.stableId);
    next.topology.suppressed = [...values];
    next.topology.operations.push({ id: `TOPO_${Date.now().toString(36).toUpperCase()}`, type: wasSuppressed ? 'RESTORE' : 'SUPPRESS', target: branch.stableId, at: 0 });
  });
}

function renderSelectionSets() {
  const container = $('selectionSetList');
  if (!container) return;
  container.replaceChildren();
  Object.entries(authoring.selection_sets).forEach(([name, ids]) => {
    const row = document.createElement('div');
    row.className = 'selection-set-item';
    row.innerHTML = `<span>${name}</span><small>${ids.length} 枝</small><button title="删除"><i data-lucide="x"></i></button>`;
    row.querySelector('span').addEventListener('click', () => {
      setBranchSelection(new Set(ids));
    });
    row.querySelector('button').addEventListener('click', () => transactAuthoring('已删除选择集', (next) => { delete next.selection_sets[name]; }));
    container.append(row);
  });
  window.lucide?.createIcons({root:container});
}

function saveCurrentSelectionSet() {
  const name = $('selectionSetName').value.trim();
  if (!name || !selectedBranchIds.size) return showToast('请先输入名称并选择枝条', true);
  transactAuthoring('已保存选择集', (next) => { next.selection_sets[name] = [...selectedBranchIds]; });
  $('selectionSetName').value = '';
}

function renderMasks() {
  const container = $('maskList');
  if (!container) return;
  container.replaceChildren();
  maskPreviewRoot.traverse((object) => { if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); } });
  maskPreviewRoot.clear();
  authoring.foliage_masks.forEach((mask, index) => {
    const row = document.createElement('div');
    row.className = 'modifier-item';
    row.innerHTML = `<span>${mask.mode === 'EXCLUDE' ? '排除' : '保留'}</span><span>${mask.shape === 'SPHERE' ? '球体' : '盒体'} · ${mask.radius.toFixed(2)}m</span><div class="modifier-actions"><button data-toggle title="切换模式"><i data-lucide="repeat-2"></i></button><button data-remove title="删除"><i data-lucide="trash-2"></i></button></div>`;
    row.querySelector('[data-toggle]').addEventListener('click', () => { if (allowLeafStyleWrite()) transactAuthoring('已切换叶片遮罩模式', (next) => { next.foliage_masks[index].mode = next.foliage_masks[index].mode === 'EXCLUDE' ? 'INCLUDE' : 'EXCLUDE'; }); });
    row.querySelector('[data-remove]').addEventListener('click', () => { if (allowLeafStyleWrite()) transactAuthoring('已删除叶片遮罩', (next) => { next.foliage_masks.splice(index, 1); }); });
    container.append(row);
    const geometry = mask.shape === 'SPHERE'
      ? new THREE.SphereGeometry(mask.radius, 16, 10)
      : new THREE.BoxGeometry(...mask.size);
    const preview = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: mask.mode === 'EXCLUDE' ? 0xdb715f : 0x73b76f, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false }));
    preview.position.set(...mask.center);
    preview.userData.category = 'mask_preview';
    maskPreviewRoot.add(preview);
  });
  window.lucide?.createIcons();
}

function renderAttachmentLayers() {
  const container = $('attachmentLayerList');
  if (!container) return;
  container.replaceChildren();
  const labels = { LEAF: '叶片', NEEDLE: '针叶', FLOWER: '花', FRUIT: '果实', THORN: '刺', DEAD_LEAF: '枯叶', CUSTOM: '自定义' };
  authoring.attachment_layers.forEach((layer, index) => {
    const row = document.createElement('div');
    row.className = 'modifier-item';
    row.innerHTML = `<input type="checkbox" ${layer.enabled ? 'checked' : ''} title="启用附着层"><span>${layer.name} · ${labels[layer.type]} · ${layer.density.toFixed(2)}x</span><div class="modifier-actions"><button data-duplicate title="复制"><i data-lucide="copy-plus"></i></button><button data-remove title="删除"><i data-lucide="trash-2"></i></button></div>`;
    row.querySelector('input').addEventListener('change', (event) => { if (allowLeafStyleWrite()) transactAuthoring('已切换附着物层', (next) => { next.attachment_layers[index].enabled = event.target.checked; }); else renderAttachmentLayers(); });
    row.querySelector('[data-duplicate]').addEventListener('click', () => { if (!allowLeafStyleWrite()) return; transactAuthoring('已复制附着物层', (next) => {
      const copy = { ...next.attachment_layers[index], id: `ATTACH_${Date.now().toString(36).toUpperCase()}`, name: `${next.attachment_layers[index].name} 副本` };
      next.attachment_layers.splice(index + 1, 0, copy);
    }); });
    row.querySelector('[data-remove]').addEventListener('click', () => { if (allowLeafStyleWrite()) transactAuthoring('已删除附着物层', (next) => { next.attachment_layers.splice(index, 1); }); });
    container.append(row);
  });
  $('attachmentLayerCount').textContent = `${authoring.attachment_layers.length} 层`;
  window.lucide?.createIcons();
}

function addAttachmentLayer() {
  if (!allowLeafStyleWrite()) return;
  transactAuthoring('已添加附着物层', (next) => {
    next.attachment_layers.push({
      id: `ATTACH_${Date.now().toString(36).toUpperCase()}`, name: $('attachmentName').value.trim() || '附着层',
      type: $('attachmentType').value, enabled: true, density: number('attachmentDensity'), scale: number('attachmentScale'),
      order_min: number('attachmentOrderMin'), order_max: number('attachmentOrderMax'), start: number('attachmentStart'), end: number('attachmentEnd'),
      season: $('attachmentSeason').value, health_min: number('attachmentHealthMin'), light_min: number('attachmentLightMin'),
      material_variant: 0, source: number('attachmentSource'),
    });
  });
}

function renderTimeline() {
  const container = $('timelineKeyList');
  if (!container) return;
  container.replaceChildren();
  $('timelineLabel').textContent = `${Math.round(authoring.timeline.time * 100)}% · ${authoring.timeline.snapshots.length} 姿态`;
  authoring.timeline.keyframes.forEach((frame, index) => {
    const row = document.createElement('div');
    row.className = 'modifier-item';
    row.innerHTML = `<span>${Math.round(frame.time * 100)}%</span><span>年龄 ${frame.age_progress.toFixed(2)} · 季节 ${frame.season_progress.toFixed(2)} · 健康 ${frame.health.toFixed(2)}</span><div class="modifier-actions"><button title="跳转"><i data-lucide="play"></i></button><button data-remove title="删除"><i data-lucide="trash-2"></i></button></div>`;
    row.querySelector('button:not([data-remove])').addEventListener('click', () => {
      authoring.timeline.time = frame.time;
      applyAuthoringToControls();
      scheduleBuild(0);
    });
    row.querySelector('[data-remove]').addEventListener('click', () => {
      if (authoring.timeline.keyframes.length <= 1) return showToast('时间线至少保留一个关键帧', true);
      transactAuthoring('已删除时间线关键帧', (next) => { next.timeline.keyframes.splice(index, 1); });
    });
    container.append(row);
  });
  window.lucide?.createIcons();
}

function addTimelineKey() {
  transactAuthoring('已记录时间线关键帧', (next) => {
    next.timeline.enabled = true;
    const frame = {
      id: `KEY_${Date.now().toString(36).toUpperCase()}`, time: number('timelineTime'), age_progress: number('ageProgress'),
      season_progress: number('seasonProgress'), health: number('health'), leaf_loss: number('leafLoss'), wind_shape: number('windShape'),
    };
    const existing = next.timeline.keyframes.findIndex((item) => Math.abs(item.time - frame.time) < 0.001);
    if (existing >= 0) next.timeline.keyframes[existing] = frame; else next.timeline.keyframes.push(frame);
  });
}

function saveTimelinePose() {
  transactAuthoring('已保存时间线姿态', (next) => {
    next.timeline.snapshots.push({ id: `POSE_${Date.now().toString(36).toUpperCase()}`, name: `姿态 ${String(next.timeline.snapshots.length + 1).padStart(2, '0')}`, time: number('timelineTime') });
  });
}

function buildVariantMatrix() {
  const parseText = (id) => $(id).value.split(',').map((value) => value.trim()).filter(Boolean);
  matrixVariants = expandVariantMatrix({
    season: parseText('matrixSeasons'), age: parseText('matrixAges'), health: parseText('matrixHealth').map(Number).filter(Number.isFinite),
  }, Math.round(number('matrixLimit'))).map((settings, index) => ({ seed: wrapSeed(Math.trunc(number('seed')) + index * Math.max(1, Math.round(number('batchSeedStep')))), settings }));
  showToast(`已生成 ${matrixVariants.length} 个状态组合，使用“导出候选变体”输出`);
}

function stateVariantEntries(seed) {
  if (!checked('exportStateVariants') || !authoring.timeline.snapshots.length) return [{ seed, settings: {} }];
  return authoring.timeline.snapshots.map((snapshot, index) => ({
    seed: wrapSeed(seed + index),
    settings: evaluateTimeline(authoring.timeline.keyframes, snapshot.time),
  }));
}

function addFoliageMask() {
  if (!allowLeafStyleWrite()) return;
  transactAuthoring('已添加叶片体积遮罩', (next) => {
    const size = Math.max(0.01, number('maskSize'));
    next.foliage_masks.push({
      id: `MASK_${Date.now().toString(36).toUpperCase()}`, mode: $('maskMode').value, shape: $('maskShape').value,
      center: [number('maskX'), number('maskY'), number('maskZ')], size: [size, size, size], radius: size, strength: 1,
    });
  });
}

function pruneSelectedBranch() {
  if(!canEditSelectedBranch())return;
  if (!asset || asset.group.userData.pending_rebuild || !$('busyOverlay').hidden) return;
  if (pointDrag || pruneStroke || sculpt.active || bundle.active || advancedGesture || settingsGesture
    || branchWorkbench?.tools.active || branchWorkbench?.stroke.active || branchWorkbench?.deformation.active
    || branchWorkbench?.forms.active || branchWorkbench?.arrays.active || branchWorkbench?.influence.active
    || branchWorkbench?.trunkForm.active || branchWorkbench?.installation.active || spatialControls?.active || generatorWorkspace?.rangeActive) return showToast('请先结束当前编辑，再删除选中枝干');
  if (!selectedBranchIds.size) return showToast('请先选中要删除的枝干');
  const plan = planBranchDeletion(asset.masterBranches, selectedBranchIds, selectedBranchExclusions);
  if (!plan.roots.length) return showToast(plan.skipped.join('；') || '没有可删除的承重枝干', true);
  const remaining = new Set([...selectedBranchIds].filter(id => !plan.removed.has(id)));
  transactAuthoring(`已删除 ${plan.roots.length} 束枝干及其子枝，Ctrl+Z 撤销${plan.skipped.length ? '；' + plan.skipped.join('；') : ''}`, next => {
    next.topology.suppressed = [...new Set([...next.topology.suppressed, ...plan.roots])];
  }, { bypassLayers: true });
  setBranchSelection(remaining);
}

function addManualBranch() {
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  if (!branch) return;
  branchWorkbench?.stroke.open(branch.stableId, 'FILL');
}

function addManualLeaf() {
  if (!allowLeafStyleWrite()) return;
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  if (!branch) return;
  const id = `ML${Date.now().toString(36).toUpperCase()}`;
  transactAuthoring('已在当前枝条补充叶片', (next) => {
    next.leaf_edits.added.push({ id, parent: branch.stableId, t: 0.82, azimuth: (next.leaf_edits.added.length * 137.5) % 360, scale: 1, source: 0 });
  });
}

function clearSelectedBranchLeaves() {
  if (!allowLeafStyleWrite()) return;
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  if (!branch) return;
  transactAuthoring('已清除当前枝条叶片', (next) => {
    next.overrides[branch.stableId] = { ...(next.overrides[branch.stableId] || {}), leaf_density: 0 };
    next.leaf_edits.added = next.leaf_edits.added.filter((leaf) => leaf.parent !== branch.stableId);
  });
}

function renderModifiers() {
  const container = $('modifierList');
  if (!container) return;
  container.replaceChildren();
  const labels = { BEND: '定向弯曲', TWIST: '整体扭转', GRAVITY: '附加重力', FLATTEN: '轴向压平', SCALE: '渐变缩放', NOISE: '形态扰动' };
  authoring.modifiers.forEach((modifier, index) => {
    const row = document.createElement('div');
    row.className = 'modifier-item';
    row.innerHTML = `<input type="checkbox" ${modifier.enabled ? 'checked' : ''} title="启用修改器"><span>${index + 1}. ${labels[modifier.type]} · ${modifier.axis} · ${modifier.amount} · ${modifier.start.toFixed(2)}-${modifier.end.toFixed(2)}</span><div class="modifier-actions"><button data-move="-1" title="上移"><i data-lucide="chevron-up"></i></button><button data-move="1" title="下移"><i data-lucide="chevron-down"></i></button><button data-remove title="删除修改器"><i data-lucide="trash-2"></i></button></div>`;
    row.querySelector('input').addEventListener('change', (event) => transactAuthoring('已切换修改器', (next) => { next.modifiers[index].enabled = event.target.checked; }));
    row.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => {
      const target = index + Number(button.dataset.move);
      if (target < 0 || target >= authoring.modifiers.length) return;
      transactAuthoring('已调整修改器顺序', (next) => { [next.modifiers[index], next.modifiers[target]] = [next.modifiers[target], next.modifiers[index]]; });
    }));
    row.querySelector('[data-remove]').addEventListener('click', () => transactAuthoring('已删除修改器', (next) => { next.modifiers.splice(index, 1); }));
    container.append(row);
  });
  window.lucide?.createIcons();
}

function addModifier() {
  transactAuthoring('已添加非破坏修改器', (next) => {
    next.modifiers.push({
      id: `MOD_${Date.now().toString(36).toUpperCase()}`, type: $('modifierType').value,
      axis: $('modifierAxis').value, amount: number('modifierAmount'), enabled: true,
      order_min: number('modifierOrderMin'), order_max: number('modifierOrderMax'), start: number('modifierStart'), end: number('modifierEnd'),
    });
  });
}

function treeUnitMode() {return branchWorkbench?.mode==='TREE'&&selectionKind==='INSTANCE';}
function unitSizeEffectSelected() {return treeUnitMode()&&$('unitBrushEffect').value==='SCALE';}
function clearAssemblyDecoration(object) {
  if(!object)return;
  object.removeFromParent();object.traverse(child=>{child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(m=>m.dispose());else child.material?.dispose();});
}
function hoverAssemblyUnits(ids) {
  clearAssemblyDecoration(assemblyHover);assemblyHover=null;
  if(!asset||!ids.length||unitComb?.active||keyboardTransform?.active)return;
  const chosen=new Set(ids),positions=[];
  for(const branch of asset.masterBranches)if(chosen.has(branch.stableId)&&bundle.isVisible(branch.stableId))for(let i=1;i<branch.points.length;i++)positions.push(...branch.points[i-1].toArray(),...branch.points[i].toArray());
  if(!positions.length)return;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  assemblyHover=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xf0d980,transparent:true,opacity:.35,depthTest:false,depthWrite:false}));
  asset.group.updateWorldMatrix(true,false);modelRoot.updateWorldMatrix(true,false);assemblyHover.matrixAutoUpdate=false;assemblyHover.matrix.copy(modelRoot.matrixWorld.clone().invert().multiply(asset.group.matrixWorld));assemblyHover.renderOrder=111;modelRoot.add(assemblyHover);
}
function showUnitHangReference(direction) {
  clearAssemblyDecoration(unitHangReference);unitHangReference=null;
  if(!direction||branchWorkbench?.mode!=='BRANCH'||!asset)return;
  const connector=authoring.branch_shape?.connector;if(!connector)return;
  const vector=new THREE.Vector3(...direction);if(vector.lengthSq()<1e-12)return;
  const box=new THREE.Box3();for(const b of asset.masterBranches)for(const p of b.points)box.expandByPoint(p);
  const length=Math.max(.15,Math.min(2,box.getSize(new THREE.Vector3()).length()*.2));
  unitHangReference=new THREE.Group();const arrow=new THREE.ArrowHelper(vector.normalize(),new THREE.Vector3(...connector.position),length,0x86c7bc,length*.2,length*.12);unitHangReference.add(arrow);
  asset.group.updateWorldMatrix(true,false);modelRoot.updateWorldMatrix(true,false);unitHangReference.matrixAutoUpdate=false;unitHangReference.matrix.copy(modelRoot.matrixWorld.clone().invert().multiply(asset.group.matrixWorld));modelRoot.add(unitHangReference);
}
// Historical complete copies remain their saved graph. Virtual placements are
// view/tool identities only; never append them to the saved instance registry.
function unitAssemblyPool(branches=asset?.masterBranches||[]) {
  if(unitAssemblyPoolCache?.authoring===authoring&&(unitAssemblyPoolCache.raw===branches||unitAssemblyPoolCache.branches===branches))return unitAssemblyPoolCache;
  const normalized=legacyUnitBranches(authoring,branches),legacy=legacyUnitInstances(authoring,branches);
  const pool={authoring,raw:branches,branches:normalized,instances:[...authoring.branch_instances,...legacy]};
  if(branches===asset?.masterBranches)unitAssemblyPoolCache=pool;
  return pool;
}
function unitScopeBoundary(branches=asset?.masterBranches||[]) {
  const pool=unitAssemblyPool(branches);
  if(unitScopeIndex?.branches!==pool.branches||unitScopeIndex.instances!==pool.instances)
    unitScopeIndex={branches:pool.branches,instances:pool.instances,index:unitBranchIndex(pool.branches,pool.instances)};
  return unitScopeIndex.index;
}
function unitBrushRoots(scope=$('branchEditScope').value,branches=asset?.masterBranches||[]) {
  const pool=unitAssemblyPool(branches);
  return resolveUnitEditScope(pool.branches, pool.instances, selectedBranchIds, scope,
    {excluded:selectedBranchExclusions, isVisible:id=>bundle.isVisible(id), index:unitScopeBoundary(branches)});
}
function branchEditTargets(branches = asset?.masterBranches || []) {
  // One axis per complete unit keeps dense brush feedback readable and avoids
  // thousands of internal-branch outline draw calls. GPU placement still moves
  // all wood, leaves, flowers and nested units as a rigid family.
  if(treeUnitMode())return unitBrushRoots($('branchEditScope').value,branches);
  return resolveBranchEditScope(branches, selectedBranchIds, $('branchEditScope').value, {
    excluded: selectedBranchExclusions,
    protectUnits: document.body.dataset.workbench === 'TREE',
    editable: id => bundle.isVisible(id) && (branchWorkbench?.instances.isEditable(id) ?? true),
  });
}
function refreshBranchEditScope() {
  const unitMode=treeUnitMode(),bar=$('branchEditScopeBar');
  if(viewportTool==='UNIT_DENSITY'){
    bar.querySelector('label').hidden=true;bar.querySelector('.temporary-selection-hint').hidden=true;
    $('unitBrushEffectRow').hidden=$('unitCombOrientationRow').hidden=$('unitAssemblyScopeSummary').hidden=true;
    $('branchEditScopeCount').textContent=($('unitDensityScope')?.value==='VISIBLE'?'全部可见':'当前选区 · 含挂接子枝')+' · '+($('unitDensityStrength')?.value||20)+'% / 笔';bar.title='按完整单元枝挂接点局部加密或疏化，Alt 临时反向，Esc 取消整笔。';return;
  }
  if(viewportTool==='UNIT_PAINT'){
    bar.querySelector('label').hidden=true;bar.querySelector('.temporary-selection-hint').hidden=true;
    $('unitBrushEffectRow').hidden=$('unitCombOrientationRow').hidden=$('unitAssemblyScopeSummary').hidden=true;
    $('branchEditScopeCount').textContent=($('unitPaintScope')?.value==='SELECTED'?'指定母枝':'可见母枝')+' · '+($('unitPaintHitMode')?.value==='SURFACE'?'表面刷取':'穿透刷取')+' · '+($('unitPaintOrientation')?.value==='SURFACE'?'表面朝向':'环绕360°');bar.title='左侧选择生成素材，按当前范围刷取母枝，松手确认整笔。';return;
  }
  if(branchWorkbench?.trunkForm.enabled){
    bar.querySelector('label').hidden=true;bar.querySelector('.temporary-selection-hint').hidden=true;
    $('unitBrushEffectRow').hidden=$('unitCombOrientationRow').hidden=$('unitAssemblyScopeSummary').hidden=true;
    $('branchEditScopeCount').textContent=selectedBranchId?`仅当前本枝 · ${selectedBranchId}`:'点选承重枝干 · 编辑表面形体';
    bar.title='形体控件只修改当前本枝；不沿雕刻范围扩展到子枝。';return;
  }
  $('unitBrushEffectRow').hidden=!unitMode||viewportTool!=='COMB';
  $('unitCombOrientationRow').hidden=!unitMode||viewportTool!=='COMB'||$('unitBrushEffect').value!=='TURN';
  const summary=$('unitAssemblyScopeSummary');summary.hidden=!unitMode;
  const assemblySummary=branchWorkbench?.assemblyLinks?.state.summary;
  if(unitMode){summary.textContent=$('branchEditScope').value==='ALL'?`全部单元枝 · ${assemblySummary?.editable??0} 支可编辑${assemblySummary?.locked?` · ${assemblySummary.locked} 支锁定`:''}`:assemblySummary?.selected?`已选 ${assemblySummary.selected} 支${assemblySummary.legacy?` · 旧副本 ${assemblySummary.legacy} 支`:assemblySummary.zoneNames.length?` · ${assemblySummary.zoneNames.join(' / ')}`:''}`:'框选树上单元枝或点右侧卡片';summary.title=assemblySummary?.reason||assemblySummary?.text||summary.textContent;}
  bar.querySelector('label').hidden=false;bar.querySelector('.temporary-selection-hint').hidden=false;
  const temporaryHint=bar.querySelector('.temporary-selection-hint');
  temporaryHint.textContent=SCULPT_TOOLS.has(viewportTool)?'Shift 加选 · Ctrl 减选 · Ctrl 空框清空':'空白 Shift 加选 · Ctrl 减选';
  temporaryHint.title=SCULPT_TOOLS.has(viewportTool)?'按住 Ctrl 拖出未命中对象的空白框，清空选择与减选限制；框到对象仍减选，Esc 取消框选':'空白处 Shift 框选加选，Ctrl 框选减选';
  $('branchEditScopeLabel').textContent=unitMode?'作用范围':'裁切 / 雕刻范围';
  const labels=unitMode?{SELECTED:'选中单元枝及下级',DIRECT:'仅选中单元枝',ALL:'全部单元枝'}:{SELECTED:'选中枝条及子枝',DIRECT:'仅选中枝条',ALL:'全树'};
  for(const id of ['branchEditScope','sculptSelection'])for(const option of $(id).options)option.textContent=labels[option.value]||option.textContent;
  if(unitMode){const count=assemblySummary?.editable??unitBrushRoots().size,effect=$('unitBrushEffect').selectedOptions[0]?.textContent||'整支转向';$('branchEditScopeCount').textContent=viewportTool==='COMB'?`${count} 支可编辑 · ${effect}`:(selectedBranchIds.size?`已选 ${selectedBranchIds.size} 支 · G/R/S 微调 · C 梳理`:'点选整支 · G/R/S 微调 · C 梳理');bar.title='单元枝笔刷围绕各自枝根调整完整模型，木枝与叶花果一起变化；内部样式在枝条工作台编辑。';return;}
  const count = branchEditTargets().size, mode = $('branchEditScope').value;
  $('branchEditScopeCount').textContent = count ? `${count} 根可编辑 · ${mode === 'ALL' ? '全树' : '选区限定'}` : '请先选择可编辑枝条';
  if (count && mode !== 'ALL' && selectedBranchExclusions.size) $('branchEditScopeCount').textContent += ` · 排除 ${selectedBranchExclusions.size} 根`;
  $('branchEditScopeBar').title = '骨架工具只编辑承重枝干，挂接的单元枝保持完整样式。单元枝整体用 G/R/S 与 Shift+D；内部样式只能在枝条工作台编辑源素材。';
}
function prunePointerPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return [event.clientX - bounds.left, event.clientY - bounds.top];
}

function clearPruneStroke() {
  pruneStroke = null;
  controls.enabled = true;
  pruneStrokePath.setAttribute('points', '');
  pruneHitMarkers.replaceChildren();
}

function setViewportTool(tool) {
  if (!windPreview?.state.preparing) windPreview?.stop();
  if(treeUnitMode()&&((SCULPT_TOOLS.has(tool)&&tool!=='COMB')||viewportStrokeTools.has(tool))){
    showToast('单元枝模式使用 C 梳理或 G/R/S 整支微调；需要塑造骨架时切到「主枝干」');return;
  }
  if(branchWorkbench?.mode==='TREE'&&['LEAF_ADD','LEAF_ERASE'].includes(tool)){
    showToast('叶花果属于单元枝内部样式，请在枝条工作台编辑源单元枝');return;
  }
  branchWorkbench?.trunkForm.deactivate();
  const unitTransform={BUNDLE_MOVE:'SLIDE',BUNDLE_ROTATE:'ROTATE',BUNDLE_SCALE:'SCALE'}[tool];
  if(branchWorkbench?.mode==='TREE'&&unitTransform&&branchWorkbench.instances.selectionOwners().length){branchWorkbench.instances.activate(unitTransform);return;}
  branchWorkbench?.vines.surface.cancel();
  brushSelectionMenu.close();
  branchWorkbench?.assemblyGrowth.deactivate();
  keyboardTransform?.cancel();
  branchWorkbench?.unitEditor.deactivate();
  branchWorkbench?.stroke.cancel(); branchWorkbench?.influence.cancel(); branchWorkbench?.forms.cancel(); branchWorkbench?.arrays.cancel();
  branchWorkbench?.symmetry.deactivate();
  branchWorkbench?.deformation.deactivate(); branchWorkbench?.instances.deactivate();
  branchWorkbench?.tools.activate('');
  generatorWorkspace?.deactivateRange();
  spatialControls?.deactivate();
  const supported = ['SELECT', 'UNIT_PAINT', 'UNIT_DENSITY', ...viewportStrokeTools, ...SCULPT_TOOLS, ...SELECTION_TOOLS, ...TRANSFORM_TOOLS, 'LEAF_ADD', 'LEAF_ERASE'];
  const next = supported.includes(tool) && viewMode !== 'SKELETON' ? tool : 'SELECT';
  branchWorkbench?.unitBrushes?.toolChanged(next);
  cancelControlPointDrag();
  sculpt.toolChanged(next);
  bundle.cancel();
  clearPruneStroke();
  viewportTool = next;
  leafBrushMode = next === 'LEAF_ADD' ? 'ADD' : next === 'LEAF_ERASE' ? 'ERASE' : 'SELECT';
  document.querySelectorAll('.brush-mode').forEach((button) => button.classList.toggle('active', button.dataset.brush === leafBrushMode));
  document.querySelectorAll('[data-viewport-tool]').forEach((button) => {
    const active = button.dataset.viewportTool === next;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  controls.enabled = true;
  if (SCULPT_TOOLS.has(next) || SELECTION_TOOLS.has(next) || TRANSFORM_TOOLS.has(next)) {
    modelRoot.rotation.set(0, 0, 0);
    modelRoot.updateMatrixWorld(true);
    selectionHelper.visible = false;
    // Tool options live beside the viewport in the inspector. Preserve the
    // user's generation/material page and its scroll position on the left.
  }
  bundle.toolChanged();
  controlPointRoot.visible = next === 'SELECT';
  canvas.dataset.brush = leafBrushMode;
  canvas.dataset.viewportTool = next;
  canvas.dataset.pruneMode = String(viewportStrokeTools.has(next));
  syncTreeSelectionMode();
  branchWorkbench?.context.setMode(next);
  refreshBranchEditScope();
  const label = next === 'COMB' && treeUnitMode() ? `单元枝 · ${$('unitBrushEffect').selectedOptions[0].textContent}` : viewportToolLabels[next];
  setStatus(`${label} · 就绪`, 'ready');
}

function projectBranchForPruning(branch, bounds) {
  return branch.points.map((point) => {
    const projected = asset.group.localToWorld(point.clone()).project(camera);
    return [(projected.x * 0.5 + 0.5) * bounds.width, (-projected.y * 0.5 + 0.5) * bounds.height, projected.z];
  });
}

function renderPruneStroke() {
  if (!pruneStroke) return clearPruneStroke();
  pruneStrokePath.setAttribute('points', pruneStroke.points.map((point) => `${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' '));
  pruneHitMarkers.replaceChildren();
  for (const hit of pruneStroke.hits.values()) {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    marker.setAttribute('cx', hit.point[0].toFixed(1));
    marker.setAttribute('cy', hit.point[1].toFixed(1));
    marker.setAttribute('r', '6');
    pruneHitMarkers.append(marker);
  }
}

function updatePruneHits(strokeSegment) {
  if (!asset || !pruneStroke || strokeSegment.length < 2) return;
  const bounds = canvas.getBoundingClientRect();
  for (const branch of asset.branches) {
    if (!pruneStroke.targets.has(branch.stableId)) continue;
    const projected = projectBranchForPruning(branch, bounds);
    if (projected.every((point) => point[2] < -1 || point[2] > 1)) continue;
    const hit = closestPolylineStrokeHit(projected, strokeSegment, 11);
    if (!hit || hit.curveT >= 0.995) continue;
    const previous = pruneStroke.hits.get(branch.stableId);
    if (!previous || hit.curveT < previous.curveT) pruneStroke.hits.set(branch.stableId, { ...hit, branch });
  }
  renderPruneStroke();
}

function beginPruneStroke(event) {
  if (!viewportStrokeTools.has(viewportTool) || event.button !== 0 || !asset) return false;
  const targets = branchEditTargets();
  if (!targets.size) { showToast('请先选择可编辑枝条，或将裁切 / 雕刻范围切换为全树'); return true; }
  const bounds = canvas.getBoundingClientRect();
  pruneStrokeOverlay.style.left = `${canvas.offsetLeft}px`;
  pruneStrokeOverlay.style.top = `${canvas.offsetTop}px`;
  pruneStrokeOverlay.style.width = `${bounds.width}px`;
  pruneStrokeOverlay.style.height = `${bounds.height}px`;
  pruneStrokeOverlay.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  pruneStroke = { targets, protectCutChildren: $('branchEditScope').value === 'DIRECT' || selectedBranchExclusions.size > 0, cutTargets: $('branchEditScope').value === 'DIRECT' ? targets : new Set(asset.masterBranches.filter(b => !selectedBranchExclusions.has(b.stableId)).map(b => b.stableId)), scope: $('branchEditScope').value, selection: new Set(selectedBranchIds), tool: viewportTool, points: [prunePointerPosition(event)], hits: new Map(), invert: event.altKey };
  controls.enabled = false;
  canvas.setPointerCapture?.(event.pointerId);
  renderPruneStroke();
  return true;
}

function movePruneStroke(event) {
  if (!pruneStroke) return false;
  const point = prunePointerPosition(event);
  const previous = pruneStroke.points.at(-1);
  if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 3) return true;
  if (pruneStroke.tool === 'LINE_PRUNE') {
    pruneStroke.points = [pruneStroke.points[0], point];
    pruneStroke.hits.clear();
    updatePruneHits(pruneStroke.points);
  } else {
    pruneStroke.points.push(point);
    updatePruneHits([previous, point]);
  }
  setStatus(`${viewportToolLabels[pruneStroke.tool]} · ${pruneStroke.hits.size} 个目标`, 'busy');
  return true;
}

function closestPolylineParameter3d(points, target) {
  const candidate = new THREE.Vector3();
  let bestDistance = Infinity;
  let bestT = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    new THREE.Line3(points[index], points[index + 1]).closestPointToPoint(target, true, candidate);
    const distance = candidate.distanceToSquared(target);
    if (distance < bestDistance) { bestDistance = distance; bestT = (index + points[index].distanceTo(candidate) / Math.max(1e-9, points[index].distanceTo(points[index + 1]))) / (points.length - 1); }
  }
  return bestT;
}

function commitPruneStroke(stroke) {
  if (!stroke?.hits.size) { setStatus('剪刀刷 · 未命中', 'ready'); return; }
  const cuts = [];
  const suppress = new Set(authoring.topology.suppressed);
  for (const hit of stroke.hits.values()) {
    const branch = hit.branch;
    let curveT = hit.curveT;
    if (stroke.protectCutChildren && cutHasProtectedChildren(asset.masterBranches, branch, curveT < .06 ? 0 : curveT, stroke.cutTargets)) { showToast('该裁切会移除未选或已减选的子枝，已跳过；请先加选这些子枝'); continue; }
    if (curveT < 0.06 && branch.order > 0) { suppress.add(branch.stableId); continue; }
    curveT = Math.max(0.04, curveT);
    const denseCursor = curveT * (branch.points.length - 1);
    const segmentIndex = Math.min(branch.points.length - 2, Math.max(0, Math.floor(denseCursor)));
    const cutPoint = branch.points[segmentIndex].clone().lerp(branch.points[segmentIndex + 1], denseCursor - segmentIndex);
    const retained = branch.points.slice(0, segmentIndex + 1).map((point) => point.toArray());
    if (!branch.points[segmentIndex].equals(cutPoint)) retained.push(cutPoint.toArray());
    const knotCount = Math.max(4, Math.min(64, Math.round((branch.controlPoints.length - 1) * curveT) + 1));
    const knots = resamplePolyline(retained, knotCount);
    const pins = remapPinnedPoints(branch.controlPoints, knots, authoring.overrides[branch.stableId]?.pinned_points || []);
    cuts.push({ branch, curveT, knots, pins });
    asset.branches.filter((child) => child.parentId === branch.id).forEach((child) => {
      if (closestPolylineParameter3d(branch.points, child.points[0]) >= curveT - 0.01) suppress.add(child.stableId);
    });
  }
  if (!cuts.length && suppress.size === authoring.topology.suppressed.length) { setStatus('剪刀刷 · 未产生修剪', 'ready'); return; }
  selectedBranchId = cuts[0]?.branch.stableId || null;
  selectedBranchIds = stroke.selection;
  selectedBranchId = [...selectedBranchIds].at(-1) || null;
  selectedPointIndex = cuts[0] ? cuts[0].knots.length - 1 : -1;
  transactAuthoring(`${viewportToolLabels[stroke.tool]}已处理 ${cuts.length + suppress.size - authoring.topology.suppressed.length} 根枝条`, (next) => {
    cuts.forEach(({ branch, knots, pins }) => {
      next.overrides[branch.stableId] = { ...(next.overrides[branch.stableId] || {}), locked: true, curve_knots: knots, frozen_points: null, pinned_points: pins };
    });
    next.topology.suppressed = [...suppress];
    next.topology.operations.push({ id: `TOPO_${Date.now().toString(36).toUpperCase()}`, type: 'STROKE_PRUNE', target: [...stroke.hits.keys()].join(','), at: 0.5 });
  });
}

function strokeWorldDelta(stroke, localPoint) {
  const bounds = canvas.getBoundingClientRect();
  const start = stroke.points[0];
  const end = stroke.points.at(-1);
  const world = asset.group.localToWorld(localPoint.clone());
  const projected = world.clone().project(camera);
  const moved = new THREE.Vector3(
    projected.x + (end[0] - start[0]) * 2 / Math.max(1, bounds.width),
    projected.y - (end[1] - start[1]) * 2 / Math.max(1, bounds.height),
    projected.z,
  ).unproject(camera);
  return asset.group.worldToLocal(moved).sub(localPoint);
}

function commitBranchBrushStroke(stroke) {
  if (!stroke?.hits.size) { setStatus(`${viewportToolLabels[stroke?.tool] || '笔刷'} · 未命中`, 'ready'); return; }
  const curveUpdates = [];
  const scalarUpdates = [];
  const suppress = new Set(authoring.topology.suppressed);
  const verticalMotion = stroke.points[0][1] - stroke.points.at(-1)[1];
  for (const hit of stroke.hits.values()) {
    const branch = hit.branch;
    const controlPoints = branch.controlPoints.map((point) => point.toArray());
    const index = Math.max(0, Math.min(controlPoints.length - 1, Math.round(hit.curveT * (controlPoints.length - 1))));
    const override = authoring.overrides[branch.stableId] || {};
    const pins = override.pinned_points || [];
    let points = null;
    if (stroke.tool === 'ERASE_BRANCH') {
      if (stroke.protectCutChildren && cutHasProtectedChildren(asset.masterBranches, branch, 0, stroke.cutTargets)) { showToast('该枝连接未选或已减选的子枝，已跳过删除；请先加选这些子枝'); continue; }
      if (branch.order > 0) suppress.add(branch.stableId);
    } else if (stroke.tool === 'SIMPLIFY_BRUSH') {
      points = simplifyCurvePoints(controlPoints, authoring.curve_editor.simplify_tolerance, [...pins, index], 4);
    } else if (stroke.tool === 'REFINE_BRUSH') {
      points = subdivideCurvePoints(controlPoints, { scope: 'NEIGHBORHOOD', index, levels: authoring.curve_editor.subdivision_levels });
      if (points.length > 64) points = resamplePolyline(points, 64);
    } else if (stroke.tool === 'GROW' && hit.curveT >= 0.42) {
      const tip = branch.controlPoints.at(-1);
      const localDelta = strokeWorldDelta(stroke, tip);
      const maximum = Math.max(0.06, branch.length * 0.55);
      if (localDelta.length() > maximum) localDelta.setLength(maximum);
      if (localDelta.length() >= 0.008) points = [...controlPoints, tip.clone().add(localDelta).toArray()];
      if (points?.length > 64) points = resamplePolyline(points, 64);
    } else if (stroke.tool === 'THICKNESS') {
      scalarUpdates.push({ stableId: branch.stableId, key: 'radius', value: Math.max(0.05, Math.min(4, (override.radius || 1) * Math.exp(verticalMotion * 0.008))) });
    } else if (stroke.tool === 'WIND_SOFT' || stroke.tool === 'WIND_STIFF') {
      const factor = stroke.tool === 'WIND_SOFT' ? 0.82 : 1.22;
      scalarUpdates.push({ stableId: branch.stableId, key: 'wind_stiffness', value: Math.max(0.1, Math.min(3, (override.wind_stiffness || 1) * factor)) });
    }
    if (points && JSON.stringify(points) !== JSON.stringify(controlPoints)) {
      curveUpdates.push({ stableId: branch.stableId, points, pins: remapPinnedPoints(branch.controlPoints, points, pins) });
    }
  }
  const newSuppressions = suppress.size - authoring.topology.suppressed.length;
  if (!curveUpdates.length && !scalarUpdates.length && !newSuppressions) { setStatus(`${viewportToolLabels[stroke.tool]} · 未产生修改`, 'ready'); return; }
  selectedBranchId = curveUpdates[0]?.stableId || scalarUpdates[0]?.stableId || null;
  selectedBranchIds = stroke.selection;
  selectedBranchId = [...selectedBranchIds].at(-1) || null;
  selectedPointIndex = -1;
  transactAuthoring(`${viewportToolLabels[stroke.tool]}已处理 ${stroke.hits.size} 根枝条`, (next) => {
    curveUpdates.forEach(({ stableId, points, pins }) => {
      next.overrides[stableId] = { ...(next.overrides[stableId] || {}), locked: true, curve_knots: points, frozen_points: null, pinned_points: pins };
    });
    scalarUpdates.forEach(({ stableId, key, value }) => { next.overrides[stableId] = { ...(next.overrides[stableId] || {}), [key]: value }; });
    next.topology.suppressed = [...suppress];
    next.topology.operations.push({ id: `TOPO_${Date.now().toString(36).toUpperCase()}`, type: stroke.tool, target: [...stroke.hits.keys()].join(','), at: 0.5 });
  });
}

function commitForkStroke(stroke) {
  if (!stroke?.hits.size || stroke.points.length < 2) { setStatus('分叉笔 · 未命中母枝', 'ready'); return; }
  const start = stroke.points[0];
  const hit = [...stroke.hits.values()].sort((a, b) => Math.hypot(a.point[0] - start[0], a.point[1] - start[1]) - Math.hypot(b.point[0] - start[0], b.point[1] - start[1]))[0];
  const branch = hit.branch;
  const denseCursor = hit.curveT * (branch.points.length - 1);
  const segmentIndex = Math.min(branch.points.length - 2, Math.max(0, Math.floor(denseCursor)));
  const base = branch.points[segmentIndex].clone().lerp(branch.points[segmentIndex + 1], denseCursor - segmentIndex);
  const bounds = canvas.getBoundingClientRect();
  const depth = asset.group.localToWorld(base.clone()).project(camera).z;
  const drawn = stroke.points.map((point) => asset.group.worldToLocal(new THREE.Vector3(
    point[0] / Math.max(1, bounds.width) * 2 - 1,
    -(point[1] / Math.max(1, bounds.height) * 2 - 1),
    depth,
  ).unproject(camera)));
  drawn[0].copy(base);
  const screenLength = stroke.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - stroke.points[index][0], point[1] - stroke.points[index][1]), 0);
  const knotCount = Math.max(4, Math.min(12, Math.round(screenLength / 28) + 2));
  const knots = resamplePolyline(drawn.map((point) => point.toArray()), knotCount);
  const length = knots.slice(1).reduce((sum, point, index) => sum + new THREE.Vector3(...point).distanceTo(new THREE.Vector3(...knots[index])), 0);
  if (length < 0.025) { setStatus('分叉笔 · 笔迹过短', 'ready'); return; }
  const id = `M${Date.now().toString(36).toUpperCase()}`;
  const radius = THREE.MathUtils.lerp(branch.startRadius, branch.endRadius, hit.curveT) * 0.58;
  selectedBranchId = id;
  selectedBranchIds = new Set([id]);
  selectedPointIndex = knots.length - 1;
  transactAuthoring('已按笔迹生成新分叉', (next) => {
    next.manual_branches.push({ id, parent: branch.stableId, attach: hit.curveT, length, radius: Math.max(0.0015, radius), angle: 35, azimuth: 0 });
    next.overrides[id] = { locked: true, curve_knots: knots, frozen_points: null, pinned_points: [] };
    next.topology.operations.push({ id: `TOPO_${Date.now().toString(36).toUpperCase()}`, type: 'FORK_DRAW', target: branch.stableId, created: id, at: hit.curveT });
  });
}

function commitViewportStroke(stroke) {
  if (['PRUNE', 'LINE_PRUNE'].includes(stroke?.tool)) commitPruneStroke(stroke);
  else if (stroke?.tool === 'FORK') commitForkStroke(stroke);
  else commitBranchBrushStroke(stroke);
}

function endPruneStroke(event) {
  if (!pruneStroke) return false;
  movePruneStroke(event);
  const completed = pruneStroke;
  clearPruneStroke();
  canvas.releasePointerCapture?.(event.pointerId);
  commitViewportStroke(completed);
  return true;
}

function cancelPruneStroke() {
  if (!pruneStroke) return false;
  clearPruneStroke();
  setStatus(`${viewportToolLabels[viewportTool]} · 已取消笔迹`, 'ready');
  return true;
}

function setPointerRay(event) {
  const bounds = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function beginControlPointDrag(event) {
  if (branchWorkbench?.trunkForm.enabled) return false;
  if (!controlPointRoot.visible || !controlPointRoot.children.length) return false;
  const bounds=canvas.getBoundingClientRect();
  const hit=pickCurveHandle(updateCurveHandleDisplay(),event.clientX-bounds.left,event.clientY-bounds.top);
  setPointerRay(event);
  if (!hit) return false;
  const handlePosition=hit.object.position.clone();
  const handleWorld=controlPointRoot.localToWorld(handlePosition.clone());
  const clicked=hit.object.userData.point_index,previousSelection=currentCurvePoints();
  selectCurvePoints(previousSelection.indices.includes(clicked)?previousSelection.indices:[clicked],clicked);
  const branch = selectedBranch();
  const editPoints = editableBranchPoints(branch);
  const pinned = new Set(authoring.overrides[branch?.stableId]?.pinned_points || []);
  renderPointEditor();
  renderControlPoints();
  bundle.refresh();
  // The root handle moves the attachment of a complete structural bundle.
  // lock_root still protects ordinary curve sculpting, not attachment relocation.
  if (selectedPointIndex === 0 && currentCurvePoints().indices.length===1 && hit.object.userData.category === 'control_point' && branch?.parentId >= 0 && !branch.unitOwner && !branch.instanceId) {
    pointerDown = null;
    return bundle.beginMount(event, branch.stableId);
  }
  if (pinned.has(selectedPointIndex) || (authoring.curve_editor.lock_root && selectedPointIndex === 0)) { showToast('该锚点已固定'); return true; }
  const normal = camera.getWorldDirection(new THREE.Vector3());
  pointDragPlane.setFromNormalAndCoplanarPoint(normal, handleWorld);
  raycaster.ray.intersectPlane(pointDragPlane,pointDragIntersection);
  const grabOffset=handlePosition.clone().sub(controlPointRoot.worldToLocal(pointDragIntersection.clone()));
  pointDrag = {
    moved: false, startX:event.clientX, startY:event.clientY, grabOffset, category: hit.object.userData.category,
    side: hit.object.userData.side || 0, origin: editPoints[selectedPointIndex].clone(),
    originalPoints: editPoints.map((point) => point.toArray()), previewPoints: editPoints.map((point) => point.toArray()),preview:null,snapshot:null,indices:currentCurvePoints().indices,
  };
  controls.enabled = false;
  canvas.dataset.curveDragging = 'true';
  canvas.setPointerCapture?.(event.pointerId);
  return true;
}

function moveControlPointDrag(event) {
  if (!pointDrag) return;
  if(!pointDrag.moved && Math.hypot(event.clientX-pointDrag.startX,event.clientY-pointDrag.startY)<4)return;
  setPointerRay(event);
  if (raycaster.ray.intersectPlane(pointDragPlane, pointDragIntersection)) {
    const branch = selectedBranch();
    const target=controlPointRoot.worldToLocal(pointDragIntersection.clone()).add(pointDrag.grabOffset);
    const constrained = constrainCurveTarget(branch, pointDrag.origin, target).toArray();
    const delta=new THREE.Vector3(...constrained).sub(pointDrag.origin),protectedPoints=new Set([...(authoring.overrides[branch.stableId]?.pinned_points||[]),...(authoring.curve_editor.lock_root?[0]:[])]);
    pointDrag.previewPoints = pointDrag.indices.length>1&&pointDrag.category==='control_point'?pointDrag.originalPoints.map((p,i)=>pointDrag.indices.includes(i)&&!protectedPoints.has(i)?p.map((n,k)=>n+delta.getComponent(k)):[...p]):pointDrag.category === 'tangent_handle'
      ? applyTangentHandle(pointDrag.originalPoints, selectedPointIndex, pointDrag.side, constrained, authoring.curve_editor.tangent_mode)
      : deformCurvePoints(pointDrag.originalPoints, selectedPointIndex, constrained, curveEditOptions(branch));
    pointDrag.moved = true;
    if (pointDrag.category === 'control_point') {
      const current = pointDrag.previewPoints[selectedPointIndex];
      $('pointX').value = current[0].toFixed(4);
      $('pointY').value = current[1].toFixed(4);
      $('pointZ').value = current[2].toFixed(4);
    }
    if(authoring.curve_editor.live_preview){
      pointDrag.snapshot||=createSculptSnapshot(asset.masterBranches,authoring.overrides);
      const source=[...pointDrag.snapshot.values()],result=evaluateControlCurve(source,controlCurveOperation(branch,pointDrag.previewPoints),1,authoring.overrides);
      if(result===source){cancelControlPointDrag(event);showToast('连接枝条有固定锚点，请先解除固定',true);return;}
      pointDrag.preview||=createPointCornerPreview(asset,pointDrag.snapshot,branch);
      const updated=new Map(result.map(b=>[b.id,b])),root=updated.get(branch.id);
      pointDrag.preview.update(updated,controlCurveTransforms(pointDrag.snapshot,updated,branch.id));pointDrag.preview.updateCarrier(root);bundle.drawOutline(pointDrag.preview.outlineBranches?.([...updated.values()])||[...updated.values()]);renderControlPoints(root.controlPoints,false,root.points);
    }else renderControlPoints(pointDrag.previewPoints);
    setStatus(`曲线预览 · ${curveModeLabels[authoring.curve_editor.edit_mode]}`, 'busy');
  }
}

function endControlPointDrag(event) {
  if (!pointDrag) return false;
  const drag = pointDrag;
  const moved = drag.moved;
  pointDrag = null;
  controls.enabled = true;
  canvas.dataset.curveDragging = 'false';
  canvas.releasePointerCapture?.(event.pointerId);
  if (moved) commitPreview(drag.preview,()=>commitCurveKnots(drag.previewPoints,drag.category==='tangent_handle'?'已编辑枝条切线':'已移动控制点，点间走势自动更新'));
  else { renderControlPoints(); bundle.refresh(); }
  return true;
}

function cancelControlPointDrag(event = null) {
  if (!pointDrag) return false;
  pointDrag.preview?.restore();
  pointDrag = null;
  controls.enabled = true;
  canvas.dataset.curveDragging = 'false';
  if (event?.pointerId !== undefined) canvas.releasePointerCapture?.(event.pointerId);
  renderControlPoints();
  renderPointEditor();
  bundle.drawOutline();
  setStatus('已取消曲线预览', 'ready');
  return true;
}

function insertPointFromCurve(event) {
  if (branchWorkbench?.trunkForm.enabled) return false;
  if(!canEditSelectedBranch())return;
  const branch = selectedBranch();
  const editPoints = editableBranchPoints(branch);
  if (!branch || editPoints.length < 2 || editPoints.length >= 64 || viewMode === 'SKELETON') return false;
  setPointerRay(event);
  const guide = controlPointRoot.children.find((item) => item.userData.category === 'control_guide');
  const hit = guide ? raycaster.intersectObject(guide, false)[0] : null;
  if (!hit) return false;
  const localHit = controlPointRoot.worldToLocal(hit.point.clone());
  if(editPoints.some(p=>p.distanceToSquared(localHit)<1e-10))return true;
  const closest = new THREE.Vector3();
  let segmentIndex = 0;
  let segmentDistance = Infinity;
  for (let index = 0; index < editPoints.length - 1; index += 1) {
    new THREE.Line3(editPoints[index], editPoints[index + 1]).closestPointToPoint(localHit, true, closest);
    const candidate = closest.distanceToSquared(localHit);
    if (candidate < segmentDistance) { segmentDistance = candidate; segmentIndex = index; }
  }
  const points = editPoints.map((point) => point.toArray());
  points.splice(segmentIndex + 1, 0, localHit.toArray());
  commitCurveTopology(points, '已在曲线上添加锚点', { focusPoint: localHit });
  return true;
}

function insertCurvePointAt(hit){
  const branch=selectedBranch();if(!branch||!canEditSelectedBranch())return;
  const plan=planCurvePointInsertion(branch,hit,authoring.overrides[branch.stableId]?.pinned_points||[]);
  if(plan.reason)return showToast(plan.reason,true);
  commitCurveTopology(plan.points,'已在曲线上添加控制点',{focusPoint:hit.point,pinnedPoints:plan.pinned});
}
function selectBranchFromViewport(event) {
  if (!asset || viewMode === 'SKELETON') return;
  if (leafBrushMode !== 'SELECT' && !allowLeafStyleWrite()) return;
  if (leafBrushMode === 'SELECT' && branchWorkbench?.mode === 'TREE' && selectionKind === 'INSTANCE') {
    if (!branchWorkbench.instances.selectHit(event, {shift:event.shiftKey,ctrl:event.ctrlKey}) && !event.shiftKey && !event.ctrlKey) {
      setBranchSelection([]); setStatus('未选中枝干 · 已隐藏编辑辅助线', 'ready');
    }
    return;
  }
  setPointerRay(event);
  const candidates = [];
  asset.group.traverse((object) => { if (object.isMesh && object.visible && object.userData.category === 'branch' && bundle.isVisible(object.userData.stable_id) && (branchWorkbench?.instances.isEditable(object.userData.stable_id) ?? true) && (branchWorkbench?.mode!=='TREE'||!asset.masterBranches.find(b=>b.stableId===object.userData.stable_id)?.instanceId)) candidates.push(object); });
  const hit = raycaster.intersectObjects(candidates, false)[0];
  const stableId = hit?.object?.userData?.imported_trunk ? pickImportedTrunkAttachment(asset,authoring,hit)?.parent : hit?.object?.userData?.stable_id || null;
  if (!hit && SCULPT_TOOLS.has(viewportTool) && (event.ctrlKey || event.shiftKey)) return;
  if (!hit || leafBrushMode === 'SELECT') {
    selectBranch(stableId, event.ctrlKey || event.shiftKey);
    if (!stableId && leafBrushMode === 'SELECT' && !event.ctrlKey && !event.shiftKey) setStatus('未选中枝干 · 已隐藏编辑辅助线', 'ready');
    return;
  }
  const branch = asset.branches.find((item) => item.stableId === stableId);
  if (!branch) return;
  const localPoint = asset.group.worldToLocal(hit.point.clone());
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  branch.points.forEach((point, index) => {
    const distance = point.distanceToSquared(localPoint);
    if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
  });
  const t = nearestIndex / Math.max(1, branch.points.length - 1);
  const radius = number('leafBrushRadius');
  if (leafBrushMode === 'ADD') {
    const count = Math.max(1, Math.round(number('leafBrushCount')));
    transactAuthoring(`已绘制 ${count} 片叶片`, (next) => {
      for (let index = 0; index < count; index += 1) {
        next.leaf_edits.added.push({
          id: `ML${Date.now().toString(36).toUpperCase()}_${index}`, parent: branch.stableId,
          t: THREE.MathUtils.clamp(t + ((index / Math.max(1, count - 1)) - 0.5) * radius / Math.max(branch.length, 0.01), 0.02, 0.99),
          azimuth: (index * 137.5 + next.leaf_edits.added.length * 47) % 360, scale: 1, source: 0,
        });
      }
    });
  } else if (leafBrushMode === 'ERASE') {
    const ids = asset.placements.filter((placement) => placement.branchStableId === branch.stableId && placement.position.distanceTo(localPoint) <= radius).map((placement) => placement.stableId);
    transactAuthoring(`已擦除 ${ids.length} 片叶片`, (next) => {
      next.leaf_edits.removed.push(...ids);
      next.leaf_edits.added = next.leaf_edits.added.filter((leaf) => !ids.includes(leaf.id));
    });
  }
}

function generationInputs(settings = collectSettings()) {
  return { settings, authoring, leaf_sources: leafSources.map(source => ({ id:source.id, weight:source.weight,
    orderMin:source.orderMin, orderMax:source.orderMax, season:source.season, calibration:source.calibration })) };
}
function canReuseGeneration(snapshot) {
  return !skeletonEditMode && !asset?.skeletonOnly && !resetLeafTextureCache && generationSnapshot
    && equalData(generationSnapshot.leaf_sources, snapshot.leaf_sources);
}
function finishPlacementEdit() {
  if (!pendingAuthoringControls || !previewHandoff.active || !asset?.group.userData.pending_rebuild
    || settingsGesture || advancedGesture || authoring.vine || viewMode === 'SKELETON' || branchWorkbench?.mode !== 'TREE') return false;
  const started = performance.now(), snapshot = generationInputs();
  // This check rejects source, topology, internal style and incompatible edits
  // before releasing the displayed preview. Those keep the full build path.
  if (!canReuseGeneration(snapshot) || asset.updateAssemblyTransforms?.(snapshot.settings, authoring,
    { beforeCommit:() => previewHandoff.release(asset) }) !== true) return false;
  const plan = performance.now() - started;
  clearTimeout(buildTimer); buildTimer = null;
  const sequence = ++buildSequence;
  asset.authoring = authoring; generationSnapshot = snapshot;
  const bounds = previewModelBounds(asset.group);
  const floor = authoring.branch_shape ? Math.min(0, new THREE.Box3().setFromObject(asset.group).min.z - .025) : 0;
  ground.position.z = Number.isFinite(floor) ? floor : 0; grid.position.z = ground.position.z + .002;
  previewFogRadius = bounds.isEmpty() ? 0 : bounds.getBoundingSphere(new THREE.Sphere()).radius;
  skeletonDirty = true;
  asset.report.generation_ms = plan; asset.report.generation_budget_ms = snapshot.settings.generation_budget_ms;
  asset.report.warnings = asset.report.warnings.filter(warning => !warning.startsWith('生成耗时 '));
  if (plan > snapshot.settings.generation_budget_ms) asset.report.warnings.push(`生成耗时 ${plan.toFixed(0)} ms，超过门槛 ${snapshot.settings.generation_budget_ms} ms`);
  const uiStarted = performance.now();
  // Selection, cards, actual instance parameters and brush context stay in sync.
  // Other libraries/panels are coalesced after the user pauses between strokes.
  renderBranchEditor({ placementOnly:true }); updateSelectionHelper(); renderControlPoints(); editContextPanel?.refresh();
  editTimings = { ...editTimings, generation:{ plan, model:0, editor:performance.now()-uiStarted,
    total:performance.now()-started, immediate:true } };
  performanceRecorder.timings('placement.commit_wall',editTimings.generation);
  setBusy(false);
  setStatus(`模型已更新 · INSTANCE_TRANSFORMS · Seed ${snapshot.settings.seed}`, reportState(asset.report));
  editUiRefresh.replace({ sequence, asset, authoring });
  return true;
}

async function generateModel({ fit = false, throwOnError = false } = {}) {
  if (!windPreview?.state.preparing) windPreview?.stop();
  const generationProfile=performanceRecorder.begin('generation.total_wall');
  let profileScope='PENDING',profileOutcome='STALE',profileError=null;
  if(branchWorkbench?.mode==='TREE')ensureDefaultTreeBark(authoring);
  editUiRefresh.invalidate();
  const updateStart=performance.now(),timings={};let stage=updateStart;
  const mark=key=>{const now=performance.now();timings[key]=now-stage;stage=now;};
  sculpt.cancel();
  bundle.cancel();
  const sequence = ++buildSequence;
  let preparedGeometry=null;
  geometryJobs.cancel();
  skeletonGeometryJobs.cancel();
  if (!settingsGesture && !advancedGesture) setBusy(true, '正在生成枝条', { cover: !previewHandoff.active&&!branchWorkbench?.trunkForm.active&&!branchWorkbench?.unitBrushes?.committing });
  setStatus('正在生成程序化枝条', 'busy');
  try {
    // Preparation reads the displayed model and creates separate worker output.
    // Keep its validated native snapshot during this wait, just as during the
    // cooperative replacement build. Release before any in-place commit; those
    // paths retain their normal geometry/material revision checks.
    const releasePreparationOwner=retainBuildOwner(asset);
    let settings,snapshot,reusedMembership=false;
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      settings = collectSettings();
      snapshot = generationInputs(settings);
      if(asset&&canReuseGeneration(snapshot)&&!asset.activeEditPreview)reusedMembership=performanceRecorder.measure('generation.membership_update_sync',()=>asset.updateAssemblyMembers?.(settings,authoring,{beforeCommit:()=>{previewHandoff.release(asset);branchWorkbench?.unitBrushes?.releaseDisplay(asset);}}))===true;
      if(!reusedMembership&&typeof Worker!=='undefined'){
        const backgroundProfile=performanceRecorder.begin('generation.background_geometry_wall');
        try{if(asset&&generationSnapshot)preparedGeometry=await prepareBackgroundTrunks(geometryJobs,asset,generationSnapshot,snapshot,LOD_PROFILES[settings.preview_lod]);if(!preparedGeometry)preparedGeometry=await prepareBackgroundSkeleton(skeletonGeometryJobs,asset,generationSnapshot,snapshot,{skeletonOnly:skeletonEditMode,reuseUnchanged:true});}
        catch(error){if(error.name==='AbortError')throw error;console.warn('后台几何不可用，使用本地参考生成：',error.message);}
        finally{backgroundProfile?.end();}
        if(sequence!==buildSequence||authoring!==snapshot.authoring||!equalData(settings,collectSettings()))return;
      }
    } finally { releasePreparationOwner(); }
    const transformStarted = performance.now();
    const reusedBark=!reusedMembership&&asset&&generationSnapshot&&Boolean(asset.skeletonOnly)===skeletonEditMode&&performanceRecorder.measure('generation.bark_update_sync',()=>updateBarkMaterialResources(asset,generationSnapshot,snapshot,{beforeCommit:()=>previewHandoff.release(asset)}));
    const reusedSurface=!reusedMembership&&!reusedBark&&asset&&generationSnapshot&&Boolean(asset.skeletonOnly)===skeletonEditMode&&performanceRecorder.measure('generation.surface_update_sync',()=>updateTrunkSurfaceResources(asset,generationSnapshot,snapshot,preparedGeometry,{beforeCommit:()=>previewHandoff.release(asset)}));
    const reuseAllowed = canReuseGeneration(snapshot);
    const reusedInstances = !reusedMembership&&!reusedBark&&!reusedSurface&&reuseAllowed && performanceRecorder.measure('generation.instance_update_sync',()=>asset?.updateAssemblyTransforms?.(settings, authoring,{beforeCommit:()=>previewHandoff.release(asset)})) === true;
    const reusedSupports = !reusedMembership&&!reusedBark&&!reusedSurface&&reuseAllowed && !reusedInstances && performanceRecorder.measure('generation.support_update_sync',()=>asset?.updateSupportingBranches?.(settings,authoring,{beforeCommit:()=>previewHandoff.release(asset),branchGeometries:preparedGeometry})) === true;
    const reused = reusedMembership||reusedBark||reusedSurface||reusedInstances || reusedSupports;
    const generationPlan = reusedMembership?{scope:'INSTANCE_MEMBERSHIP'}:reusedBark?{scope:'BARK_MATERIALS'}:reusedSurface?{scope:'TRUNK_SURFACES'}:skeletonEditMode ? { scope: 'SKELETON_EDIT' } : reusedSupports ? { scope: 'SUPPORT_UPDATE' } : reusedInstances ? { scope: 'INSTANCE_TRANSFORMS' } : await planGeneration(snapshot);
    profileScope=generationPlan.scope;
    mark('plan');
    if (sequence !== buildSequence || authoring!==snapshot.authoring || !equalData(settings,collectSettings())) return;
    if (generationPlan.scope === 'NONE' && asset) {
      previewHandoff.release(asset);
      asset.group.userData.pending_rebuild = false;
      asset.authoring = authoring;
      generationSnapshot = snapshot;
      if (pendingAuthoringControls) { pendingAuthoringControls = false; applyAuthoringToControls({ renderEditor: false }); }
      bundle.refresh(); renderBranchOutliner(); renderBranchEditor(); updateSelectionHelper(); renderControlPoints();
      if (fit) fitView();
      setStatus('模型无变化 · 已复用当前生成结果', 'ready');
      profileOutcome='SUCCEEDED';
      return;
    }
    const generationStarted = reused ? transformStarted : performance.now();
    const previousAsset=!reused?asset:null;
    // Keep the displayed asset until the replacement is successfully built.
    if (resetLeafTextureCache) { clearLeafTextureCache(); resetLeafTextureCache = false; }
    if (!reused) {
      const buildProfile=performanceRecorder.begin('generation.full_build_wall');let candidate;
      const stale=()=>sequence!==buildSequence||authoring!==snapshot.authoring||!equalData(settings,collectSettings());
      const releaseBuildOwner=retainBuildOwner(previousAsset);
      try{candidate=await buildBranchAssetAsync(settings,null,skeletonEditMode?[]:leafSources,settings.preview_lod,snapshot.authoring,{instanced:true,skeletonOnly:skeletonEditMode,branchGeometries:preparedGeometry,reuseSamplesFrom:previousAsset},{shouldAbort:stale,onSlice:({stage,ms})=>{performanceRecorder.record('generation.build_slice',ms);performanceRecorder.record('generation.build_slice.'+stage,ms);}});const cache=compiledSampleCacheStats(candidate);if(cache)performanceRecorder.counters({compiled_samples_built:cache.built,compiled_samples_reused:cache.reused});const history=compiledSampleHistoryStats(candidate);if(history)performanceRecorder.counters({historical_graph_scoped:Number(history.scoped),historical_graph_reused_owners:history.reusedOwners,historical_graph_evaluated_owners:history.evaluatedOwners});}
      finally{releaseBuildOwner();buildProfile?.end();}
      if(snapshot.authoring.imported_trunks){try{await hydrateImportedTrunkMaterials(candidate.group);}catch(error){await disposeBranchAssetAsync(candidate);throw error;}}
      if(stale()){await disposeBranchAssetAsync(candidate);return;}
      if(previousAsset){previewHandoff.release(previousAsset);modelRoot.remove(previousAsset.group);}
      asset=candidate;
    }
    asset.gpuEditPreview = renderer.capabilities.maxVertexTextures >= 2;
    asset.editPreviewTextureLimit = renderer.capabilities.maxTextureSize;
    asset.authoring = authoring;
    rememberPreparedSkeleton(asset,preparedGeometry);
    mark('model');
    if (!skeletonEditMode && !reused) {
      applyLeafMaterial(asset.materials.leaf, authoring.leaf_material);
      syncLeafMaterialVariants(asset, applyLeafMaterial,{skip:asset.reusedCompiledMaterials});
      sealCompiledSampleMaterials(asset);
    }
    asset.vegetation?.materials.forEach(m=>{if(m.vegetationTexture)applyLeafMaterial(m,m.vegetationTexture);});
    if (!skeletonEditMode && !reused && authoring.flowering.enabled) applyLeafMaterial(asset.materials.flower, authoring.flowering.material);
    mark('materials');
    let floor = authoring.vine ? new THREE.Box3().setFromObject(asset.group).min.z - .08
      : authoring.branch_shape ? Math.min(0, new THREE.Box3().setFromObject(asset.group).min.z - .025) : 0;
    if (authoring.vine && authoring.surface_growth?.enabled) {
      const p = authoring.surface_growth.mesh.position;
      for (let i = 2; i < p.length; i += 3) floor = Math.min(floor, p[i] - .08);
    }
    if (!Number.isFinite(floor)) floor = 0;
    ground.position.z = floor; grid.position.z = floor + .002;
    asset.report.generation_ms = performance.now() - generationStarted;
    asset.report.generation_budget_ms = settings.generation_budget_ms;
    asset.report.warnings = asset.report.warnings.filter(warning => !warning.startsWith('生成耗时 '));
    if (asset.report.generation_ms > settings.generation_budget_ms) asset.report.warnings.push(`生成耗时 ${asset.report.generation_ms.toFixed(0)} ms，超过门槛 ${settings.generation_budget_ms} ms`);
    modelRoot.add(asset.group);
    const previewBounds = previewModelBounds(asset.group);
    previewFogRadius = previewBounds.isEmpty() ? 0 : previewBounds.getBoundingSphere(new THREE.Sphere()).radius;
    if (!reused) buildSkeleton([]);
    skeletonDirty = true;
    updateViewMode();
    mark('view');
    if(previousAsset){
      const disposeProfile=performanceRecorder.begin('generation.dispose_wall');
      try{await disposeBranchAssetAsync(previousAsset,{onSlice:({ms})=>performanceRecorder.record('generation.dispose_slice',ms)});}
      finally{disposeProfile?.end();renderer.renderLists.dispose();}
      mark('dispose');
      if(sequence!==buildSequence||authoring!==snapshot.authoring||!equalData(settings,collectSettings()))return;
    }
    if (reusedSupports || (!reused && previousAsset && preparedGeometry)) {
      // The final geometry is installed. Give rendering/input a turn before
      // synchronizing the side panels; keep authoring gestures blocked until
      // both stages finish and never publish a stale build after another edit.
      asset.group.userData.pending_rebuild = true;
      const releaseInstalledOwner=retainBuildOwner(asset);
      try { await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))); }
      finally { releaseInstalledOwner(); }
      mark('yield');
      if (sequence !== buildSequence || authoring !== snapshot.authoring || !equalData(settings, collectSettings())) return;
      asset.group.userData.pending_rebuild = false;
    }
    bundle.refresh();
    updateInspector(asset);
    mark('inspector');
    if (selectedBranchId && !asset.branches.some((branch) => branch.stableId === selectedBranchId)) selectedBranchId = null;
    selectedBranchIds = new Set([...selectedBranchIds].filter((id) => asset.branches.some((branch) => branch.stableId === id)));
    selectedBranchExclusions = new Set([...selectedBranchExclusions].filter(id => asset.masterBranches.some(b => b.stableId === id)));
    const activeEditPoints = editableBranchPoints(selectedBranch());
    if (selectedPointIndex >= activeEditPoints.length) selectedPointIndex = activeEditPoints.length - 1;
    renderBranchOutliner();
    mark('outliner');
    if (pendingAuthoringControls) { pendingAuthoringControls = false; applyAuthoringToControls({ renderEditor: false }); }
    renderBranchEditor();
    mark('editor');
    updateSelectionHelper();
    renderControlPoints();
    mark('points');
    if (fit) fitView();
    generationSnapshot = snapshot;
    timings.total=performance.now()-updateStart;editTimings={...editTimings,generation:timings};
    profileOutcome='SUCCEEDED';
    setStatus(skeletonEditMode ? '枝干编辑 · 单元枝装配已暂停' : `模型已更新 · ${generationPlan.scope} · Seed ${settings.seed}`, reportState(asset.report));
  } catch (error) {
    if(error.name==='AbortError'){profileOutcome='CANCELLED';if(throwOnError&&sequence===buildSequence)throw error;return;}
    profileError=error.message;
    profileOutcome='FAILED';
    if (sequence === buildSequence) previewHandoff.release();
    if (sequence === buildSequence) branchWorkbench?.trunkForm.cancel();
    console.error(error);
    setStatus('生成失败', 'error');
    showToast(error.message, true);
    if (throwOnError) throw error;
  } finally { for(const geometry of preparedGeometry?.values()||[])geometry.dispose();if (sequence === buildSequence) setBusy(false);generationProfile?.timings('generation.phase_wall',timings);generationProfile?.end({scope:profileScope,outcome:profileOutcome,error:profileError,skeleton_edit:skeletonEditMode,sequence}); }
}

async function setSkeletonEditMode(enabled) {
  enabled = enabled === true;
  if (enabled === skeletonEditMode) return;
  if (skeletonModeSwitch) throw Error('正在切换枝干编辑模式，请稍候');
  if (enabled && branchWorkbench?.mode !== 'TREE') throw Error('枝干编辑仅用于整树造型');
  skeletonModeSwitch = true;
  const previous = skeletonEditMode;
  try {
    branchWorkbench?.installation.cancel();
    await flushWorkbench();
    skeletonEditMode = enabled;
    generationSnapshot = null;
    clearTimeout(buildTimer);
    await generateModel({ throwOnError: true });
  } catch (error) {
    skeletonEditMode = previous; generationSnapshot = null;
    await generateModel();
    throw error;
  } finally { skeletonModeSwitch = false; branchWorkbench?.refresh(); }
}

async function flushCompleteWorkbench() {
  await flushWorkbench();
  if (skeletonEditMode) await setSkeletonEditMode(false);
  if (!asset || asset.skeletonOnly) throw Error('完整整树尚未恢复，请重试返回整树预览');
}

function reportState(report) { return report.ok ? 'ready' : 'error'; }
function scheduleBuild(delay = 180, fit = false) {
  clearTimeout(buildTimer);
  if (asset) asset.group.userData.pending_rebuild = true;
  setStatus('参数已更新，等待生成', 'busy');
  buildTimer = setTimeout(() => generateModel({ fit }), delay);
}

function mergeGeometryBatch(meshes) {
  const arrays = { position: [], normal: [], tangent: [], uv: [], uv1: [], uv2: [], color: [], index: [] };
  let offset = 0;
  meshes.forEach((mesh) => {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const tangent = geometry.getAttribute('tangent');
    const uv = geometry.getAttribute('uv');
    const uv1 = geometry.getAttribute('uv1');
    const uv2 = geometry.getAttribute('uv2');
    const color = geometry.getAttribute('color');
    for (let index = 0; index < position.count; index += 1) {
      arrays.position.push(position.getX(index), position.getY(index), position.getZ(index));
      arrays.normal.push(normal ? normal.getX(index) : 0, normal ? normal.getY(index) : 0, normal ? normal.getZ(index) : 1);
      arrays.tangent.push(tangent ? tangent.getX(index) : 1, tangent ? tangent.getY(index) : 0, tangent ? tangent.getZ(index) : 0, tangent?.itemSize >= 4 ? tangent.getW(index) : 1);
      arrays.uv.push(uv ? uv.getX(index) : 0, uv ? uv.getY(index) : 0);
      arrays.uv1.push(uv1 ? uv1.getX(index) : 0, uv1 ? uv1.getY(index) : 0);
      arrays.uv2.push(uv2 ? uv2.getX(index) : 0, uv2 ? uv2.getY(index) : 0);
      arrays.color.push(
        color ? color.getX(index) : 0,
        color ? color.getY(index) : 0,
        color ? color.getZ(index) : 0,
        color?.itemSize >= 4 ? color.getW(index) : 1,
      );
    }
    const count = geometry.index ? geometry.index.count : position.count;
    for (let index = 0; index < count; index += 1) arrays.index.push(offset + (geometry.index ? geometry.index.getX(index) : index));
    offset += position.count;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
  geometry.setAttribute('tangent', new THREE.Float32BufferAttribute(arrays.tangent, 4));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uv, 2));
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(arrays.uv1, 2));
  geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(arrays.uv2, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(arrays.color, 4));
  geometry.setIndex(arrays.index);
  geometry.computeBoundingBox();
  return geometry;
}

function addCollisionGeometry(root, sourceAsset, mode) {
  const targetName = `${sourceAsset.group.name}_M_Bark`;
  const appendCapsule = (start, end, radius, index) => {
    const direction = end.clone().sub(start);
    const height = Math.max(radius * 2.1, direction.length());
    const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.002, height - radius * 2), 4, 8);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    geometry.translate(...start.clone().lerp(end, 0.5).toArray());
    const mesh = new THREE.Mesh(geometry, sourceAsset.materials.bark);
    mesh.name = `UCX_${targetName}_${String(index).padStart(2, '0')}`;
    mesh.userData = { category: 'collision', temporary_geometry: true };
    root.add(mesh);
  };
  if (mode === 'CONVEX_PROXY') {
    const bounds = new THREE.Box3().setFromObject(sourceAsset.group);
    const size = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.9);
    const geometry = new THREE.BoxGeometry(Math.max(0.04, size.x), Math.max(0.04, size.y), Math.max(0.04, size.z));
    geometry.translate(...bounds.getCenter(new THREE.Vector3()).toArray());
    const mesh = new THREE.Mesh(geometry, sourceAsset.materials.bark);
    mesh.name = `UCX_${targetName}_00`;
    mesh.userData = { category: 'collision', temporary_geometry: true };
    root.add(mesh);
    return;
  }
  const candidates = mode === 'MAIN_BRANCHES'
    ? sourceAsset.branches.filter((branch) => branch.order <= 1)
    : sourceAsset.branches.filter((branch) => branch.order === 0);
  candidates.slice(0, 24).forEach((branch, index) => appendCapsule(branch.points[0], branch.points.at(-1), Math.max(0.012, branch.startRadius * 0.88), index));
}

function prepareLodForExport(sourceAsset, mergeByMaterial, collisionMode = 'NONE', includeSockets = false) {
  if (!mergeByMaterial) return sourceAsset.group;
  sourceAsset.group.updateMatrixWorld(true);
  const root = new THREE.Group();
  root.name = sourceAsset.group.name;
  const buckets = collectExportMaterialBuckets(sourceAsset.group);
  buckets.forEach(({ material, name, category, meshes: sources }) => {
    const meshes = sources.map(object => {
      const clone = object.clone();
      clone.geometry = object.geometry.clone();
      clone.geometry.applyMatrix4(object.matrixWorld);
      return clone;
    });
    const mesh = new THREE.Mesh(mergeGeometryBatch(meshes), material);
    mesh.name = `${sourceAsset.group.name}_${name}`;
    mesh.userData = { category, merged_source_objects: meshes.length, temporary_geometry: true };
    root.add(mesh);
    meshes.forEach((item) => item.geometry.dispose());
  });
  if (collisionMode !== 'NONE') addCollisionGeometry(root, sourceAsset, collisionMode);
  if (includeSockets) {
    const socket = new THREE.Object3D();
    socket.name = `SOCKET_${sourceAsset.group.name}_M_Bark_Root`;
    socket.userData = { category: 'socket', socket_name: 'Root' };
    root.add(socket);
  }
  root.userData = { ...sourceAsset.group.userData, merged_by_material: true };
  return root;
}

function disposePreparedRoot(root) {
  root.traverse((object) => { if (object.isMesh && object.userData.temporary_geometry) object.geometry.dispose(); });
}

function wrapSeed(value) {
  const maximum = 2147483646;
  return ((Math.trunc(value) - 1) % maximum + maximum) % maximum + 1;
}

function authoringForVariant(seed, baseSeed) {
  const next = cloneAuthoring(authoring);
  const delta = Math.trunc(seed) - Math.trunc(baseSeed);
  if (delta !== 0) Object.keys(next.seeds).forEach((key) => { next.seeds[key] = wrapSeed(next.seeds[key] + delta); });
  if (delta !== 0 && next.flowering) next.flowering.seed = wrapSeed(next.flowering.seed + delta);
  if (delta !== 0 && next.vegetation) next.vegetation.seed = wrapSeed(next.vegetation.seed + delta);
  return normalizeAuthoring(next, seed);
}

function signature(values) {
  let hash = 2166136261;
  [...values].sort().forEach((value) => {
    for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  });
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function applyExportProfile(settings) {
  if (settings.export_profile === 'HERO') return normalizeSettings({ ...settings, main_segments: Math.min(80, Math.round(settings.main_segments * 1.25)), radial_segments: Math.min(20, settings.radial_segments + 2) });
  if (settings.export_profile === 'MOBILE') return normalizeSettings({ ...settings, main_segments: Math.max(8, Math.round(settings.main_segments * 0.68)), radial_segments: Math.max(4, Math.round(settings.radial_segments * 0.65)), max_leaves: Math.min(settings.max_leaves, 700) });
  if (settings.export_profile === 'SHADOW') return normalizeSettings({ ...settings, main_segments: Math.max(6, Math.round(settings.main_segments * 0.45)), radial_segments: 4, max_leaves: Math.min(settings.max_leaves, 260), wind_mode: 'VERTEX_COLOR' });
  return settings;
}

function createExportBundle(settings, seed = settings.seed, explicitAuthoring = null, sourceLeaves = leafSources,{rigged=false}={}) {
  windPreview?.stop();
  const exportAuthoring = explicitAuthoring || authoringForVariant(seed, settings.seed);
  const frame = exportAuthoring.timeline.enabled ? evaluateTimeline(exportAuthoring.timeline.keyframes, exportAuthoring.timeline.time) : {};
  const exportSettings = applyExportProfile(normalizeSettings({ ...settings, ...frame, seed }));
  const materials = createBranchMaterials(exportSettings);
  const root = new THREE.Group();
  root.name = exportSettings.object_name;
  const assets = [];
  const preparedRoots = [];
  const lodReports = [];
  const lodIndices = exportSettings.export_lods ? [0, 1, 2, 3] : [exportSettings.preview_lod];
  lodIndices.forEach((lodIndex) => {
    const buildStarted = performance.now();
    const built = buildBranchAsset(exportSettings, materials, sourceLeaves, lodIndex, exportAuthoring);
    const generationMs = performance.now() - buildStarted;
    assets.push(built);
    const prepared = prepareLodForExport(
      built,
      !rigged&&(exportSettings.merge_by_material || (exportSettings.export_format !== 'GLB' && (exportSettings.collision_mode !== 'NONE' || exportSettings.export_sockets))),
      lodIndex === 0 && exportSettings.export_format !== 'GLB' ? exportSettings.collision_mode : 'NONE',
      lodIndex === 0 && exportSettings.export_format !== 'GLB' && exportSettings.export_sockets,
    );
    preparedRoots.push(prepared);
    root.add(prepared);
    lodReports.push({
      lod: lodIndex, branches: built.branches.length, leaves: built.placements.length, flowers: built.blooms.length,
      vertices: built.report.vertices, triangles: built.report.triangles, valid: built.report.ok,
      generation_ms: Number(generationMs.toFixed(2)), performance_ok: generationMs <= exportSettings.generation_budget_ms,
      triangle_budget_ok: built.report.triangles <= exportSettings.max_triangles,
      master_branches: built.masterBranches.length,
      branch_signature: signature(built.branches.map((branch) => branch.stableId)),
      leaf_signature: signature(built.placements.map((placement) => placement.stableId)),
    });
  });
  const baseBranches = new Set(assets[0].branches.map((branch) => branch.stableId));
  const baseLeaves = new Set(assets[0].placements.map((placement) => placement.stableId));
  const baseFlowers = new Set(assets[0].blooms.map((p) => p.stableId));
  const baseVegetation = new Set(assets[0].vegetation.placements.map(p => p.id));
  lodReports.forEach((report, index) => {
    report.master_derived = assets[index].branches.every((branch) => baseBranches.has(branch.stableId))
      && assets[index].placements.every((placement) => baseLeaves.has(placement.stableId))
      && assets[index].blooms.every((p) => baseFlowers.has(p.stableId))
      && assets[index].vegetation.placements.every(p => baseVegetation.has(p.id));
    report.valid = report.valid && report.master_derived;
  });
  root.userData = {
    generator: 'Procedural Branch Generator 4.0', seed,
    ue_axis_up: 'Z', ue_axis_forward: '-Y', source_unit: 'meter', target_unit: 'centimeter',
    lod_count: lodIndices.length, wind_mode: exportSettings.wind_mode,
  };
  root.updateMatrixWorld(true);
  return { root, assets, preparedRoots, materials, lodReports, settings: exportSettings, authoring: exportAuthoring };
}

function disposeExportBundle(bundle) {
  bundle.preparedRoots.forEach(disposePreparedRoot);
  bundle.assets.forEach(disposeBranchAsset);
  disposeMaterials(bundle.materials);
}

function encodePath(path) {
  const bytes = new TextEncoder().encode(path);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(...parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length, false);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(concatBytes(typeBytes, data)), false);
  return concatBytes(length, typeBytes, data, crc);
}

function encodeRgba16Png(width, height, pixels) {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, width, false);
  header.setUint32(4, height, false);
  ihdr[8] = 16;
  ihdr[9] = 6;
  const stride = width * 8 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < width * 4; x += 1) {
      const value = pixels[(y * width * 4) + x];
      const offset = y * stride + 1 + x * 2;
      raw[offset] = value >>> 8;
      raw[offset + 1] = value & 255;
    }
  }
  return concatBytes(signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibSync(raw, { level: 6 })), pngChunk('IEND', new Uint8Array()));
}

async function postBytes(path, bytes, outputPath, headerName = 'X-Branch-Path') {
  const response = await fetch(path, {
    // A Blob streams through WebView2's binary upload path. Sending a large
    // ArrayBuffer directly also exposes the whole body to DevTools post-data
    // capture, which can stall the renderer after a successful file write.
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', [headerName]: encodePath(outputPath) }, body: new Blob([bytes],{type:'application/octet-stream'}),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || '文件保存失败');
  return result;
}

function variantOutputPath(basePath, index, seed, count) {
  if (count <= 1) return basePath;
  return basePath.replace(/\.(fbx|glb)$/i, (_, ext) => `_V${String(index + 1).padStart(2, '0')}_S${seed}.${ext}`);
}

async function exportSeed(seed, outputPath, settingOverrides = {}, { modelOnly = false,rigged=false } = {}) {
  const settings = normalizeSettings({ ...collectSettings(), ...settingOverrides,
    ...(modelOnly ? { export_format: 'GLB',export_rigged:rigged, export_lods: false, preview_lod: 0, export_profile: 'STANDARD', merge_by_material: true } : {}),
  });
  const exportAuthoring = authoringForVariant(seed, settings.seed);
  ['age_progress', 'season_progress', 'health', 'leaf_loss', 'wind_shape'].forEach((key) => {
    if (settingOverrides[key] === undefined) return;
    exportAuthoring.timeline.keyframes = exportAuthoring.timeline.keyframes.map((frame) => ({ ...frame, [key]: settingOverrides[key] }));
  });
  const bundle = createExportBundle(settings, seed, exportAuthoring,leafSources,{rigged});
  const glb = /\.glb$/i.test(outputPath);
  const texturePrefix = outputPath.replace(/\.(fbx|glb)$/i, '').split(/[\\/]/).pop();
  const flowerConfig = bundle.authoring.flowering;
  const textureFiles = glb ? [] : [...bindLeafExportTextures(bundle.materials.leaf, bundle.authoring.leaf_material, texturePrefix), ...(flowerConfig.enabled && bundle.authoring.vine && !(flowerConfig.source && flowerConfig.shared_atlas) ? bindLeafExportTextures(bundle.materials.flower, flowerConfig.material, texturePrefix, 'flower') : [])];
  if (!glb) {
    const names = new Set(textureFiles.map(f=>f.name));
    for (const item of bundle.assets) syncLeafMaterialVariants(item, (m,raw)=>{
      for(const file of bindLeafExportTextures(m,raw,texturePrefix,m.name==='M_Leaf'?'leaf':m.name))if(!names.has(file.name)){names.add(file.name);textureFiles.push(file);}
    });
  }
  try {
    if (bundle.authoring.surface_growth?.enabled && !bundle.assets[0].branches.length && !bundle.assets[0].vegetation?.placements.length) throw new Error('尚未生成植物：请刷生长区域、点起点或画路线，并检查覆盖率与禁生区');
    if (!bundle.lodReports.every((item) => item.valid)) throw new Error('至少一个 LOD 未通过几何或主图派生检查');
    if (glb) {
      const textureCache = new Map();
      await bindGlbTextures(bundle.materials.leaf, bundle.authoring.leaf_material, textureCache);
      for (const item of bundle.assets){await Promise.all(syncLeafMaterialVariants(item,(m,raw)=>bindGlbTextures(m,raw,textureCache)));await hydrateImportedTrunkMaterials(item.group);}
      for(const item of bundle.assets)for(const m of item.vegetation?.materials.values()||[])if(m.vegetationTexture)await bindGlbTextures(m,m.vegetationTexture, textureCache);
      if (flowerConfig.enabled && bundle.authoring.vine && !(flowerConfig.source && flowerConfig.shared_atlas)) {
        await bindGlbTextures(bundle.materials.flower, flowerConfig.material, textureCache);
      }
    }
    if(!glb){const names=new Set(textureFiles.map(f=>f.name));for(const item of bundle.assets)for(const m of item.vegetation?.materials.values()||[])if(m.vegetationTexture)for(const f of bindLeafExportTextures(m,m.vegetationTexture,texturePrefix,m.name)){if(!names.has(f.name)){names.add(f.name);textureFiles.push(f);}}}
    const savedFiles = [];let rigReport=null;
    for (let index = 0; index < bundle.preparedRoots.length; index += 1) {
      const lod = bundle.lodReports[index].lod;
      const lodPath = index === 0 ? outputPath : outputPath.replace(/\.(fbx|glb)$/i, (_, ext) => `_LOD${lod}.${ext}`);
      const bytes = glb ? await exportGlb(bundle.preparedRoots[index], { connector: pveBranchConnector(bundle.authoring), singleMesh: modelOnly,...(rigged?{rigAsset:bundle.assets[index],onRigReport:report=>{rigReport=report;}}:{}) }) : new FBXExporter().register(preserveLeafTextureNames).parseSync(bundle.preparedRoots[index], {
        axisUp: 'Z', axisForward: '-Y', unitScale: 100, version: 7400,
        includeAnimations: false, embedTextures: false, customProperties: true,
        creator: 'BranchForge Procedural Branch Generator 4.0',
      });
      const saved = await postBytes(glb ? '/api/save-glb' : '/api/save-fbx', bytes, lodPath);
      savedFiles.push(saved);
      bundle.lodReports[index].file_name = lodPath.split(/[\\/]/).pop();
      if (!glb && settings.wind_mode === 'HIERARCHY_TEXTURE') {
        const payload = hierarchyTexturePayload(bundle.assets[index]);
        const pivotPath = lodPath.replace(/\.fbx$/i, '.pivot-parent.png');
        const axisPath = lodPath.replace(/\.fbx$/i, '.axis-extent.png');
        await postBytes('/api/save-texture', encodeRgba16Png(payload.width, payload.height, payload.pivotParent), pivotPath);
        await postBytes('/api/save-texture', encodeRgba16Png(payload.width, payload.height, payload.axisExtent), axisPath);
        bundle.lodReports[index].pivot_parent_texture = pivotPath.split(/[\\/]/).pop();
        bundle.lodReports[index].axis_extent_texture = axisPath.split(/[\\/]/).pop();
      }
    }
    if (modelOnly) return { ...savedFiles[0], files: savedFiles, lodReports: bundle.lodReports,rigging:rigReport };
    const manifest = createManifest(bundle.assets[0], bundle.lodReports);
    manifest.export_format = glb ? 'GLB' : 'FBX';
    if (glb) {
      manifest.format = 'BranchForgeGLBManifest';
      manifest.coordinate_system = { up: 'Y', unit: 'meter', source_up: 'Z', source_unit: 'meter' };
      manifest.textures_embedded = true;
      manifest.wind_attribute = '_BRANCH_WIND';
      manifest.wind_animation = false;
      manifest.vertex_color_contract = null;
      manifest.hierarchy_texture = null;
      manifest.sockets = [];
      manifest.pcg = null;
      delete manifest.ue_import;
      manifest.readiness.target_platform = 'glTF 2.0 / GLB';
      manifest.readiness.build_configuration = 'Static textured mesh';
    }
    for (const texture of textureFiles) {
      const bytes = Uint8Array.from(atob(texture.base64), (c) => c.charCodeAt(0));
      await postBytes('/api/save-texture', bytes, outputPath.replace(/[^\\/]+$/, texture.name));
    }
    bundle.leafTextureFiles = textureFiles.filter((f) => f.slot === 'M_Leaf').map(({ key, name }) => ({ key, name }));
    bundle.flowerTextureFiles = textureFiles.filter((f) => f.slot === 'M_Flower').map(({ key, name }) => ({ key, name }));
    bundle.vegetationTextureFiles = textureFiles.filter(f => f.slot.startsWith('M_Vegetation_')).map(({key,name,slot})=>({key,name,slot}));
    manifest.vegetation_textures = bundle.vegetationTextureFiles;
    manifest.leaf_textures = bundle.leafTextureFiles;
    manifest.flower_textures = bundle.flowerTextureFiles;
    const project = createProjectDocument(bundle.assets[0], leafSources, bundle.authoring);
    if (branchWorkbench) {
      project.workspaces = branchWorkbench.serialize();
      const activeKey = project.workspaces.active.toLowerCase();
      project.workspaces[activeKey] = { ...project.workspaces[activeKey], settings: project.settings, authoring: project.authoring, leaf_meshes: project.leaf_meshes };
    }
    await api('/api/save-sidecars', {
      output_fbx: outputPath,
      project_json: JSON.stringify(project, null, 2),
      manifest_json: JSON.stringify(manifest, null, 2),
      ue_import_script: !glb && settings.export_ue_script ? createUeImportScript(outputPath, bundle) : '',
      pcg_csv: !glb && settings.export_pcg_metadata ? createPcgCsv(bundle.assets[0]) : '',
      material_json: !glb && settings.export_material_setup ? JSON.stringify(createMaterialSetup(bundle), null, 2) : '',
      validation_json: JSON.stringify(manifest.readiness, null, 2),
      recipe_json: JSON.stringify(createRecipeDocument(bundle), null, 2),
    });
    return { ...savedFiles[0], files: savedFiles, lodReports: bundle.lodReports };
  } finally { disposeExportBundle(bundle); }
}

async function exportModels(entries) {
  if (!$('outputPath').value) throw new Error('请先选择模型输出位置');
  await flushCompleteWorkbench();
  const format = $('exportFormat').value,glb=format!=='FBX',rigged=format==='GLB_SKINNED';
  const basePath = modelOutputPath($('outputPath').value, format);
  $('outputPath').value = basePath;
  setBusy(true, entries.length > 1 ? `正在导出 ${entries.length} 个候选` : `正在导出 ${format}`);
  setStatus('正在构建导出网格', 'busy');
  try {
    const results = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = typeof entries[index] === 'number' ? { seed: entries[index], settings: {} } : entries[index];
      setStatus(`正在导出 ${index + 1}/${entries.length} · Seed ${entry.seed}`, 'busy');
      results.push(await exportSeed(entry.seed, variantOutputPath(basePath, index, entry.seed, entries.length), { ...entry.settings, export_format: glb?'GLB':'FBX',export_rigged:rigged }, { modelOnly: glb,rigged }));
    }
    setStatus(`导出完成 · ${results.length} 个资产`, 'ready');
    showToast(results.length === 1 ? `${format} 已导出：${results[0].path}` : `已导出 ${results.length} 个 ${format} 候选枝条`);
  } finally { setBusy(false); }
}

async function exportCandidateDocuments(candidates, progress, cancelled) {
  const basePath=$('outputPath').value;
  if(!basePath)throw new Error('请先设置输出位置');
  const directory=basePath.replace(/[^\\/]*$/,'');
  const results=[];setBusy(true,'正在导出所选枝条');
  try {
    for(let i=0;i<candidates.length;i++){
      if(cancelled?.())break;
      const candidate=candidates[i],doc=candidate.document;
      progress?.(i,candidates.length,candidate);
      const sources=(doc.leaf_meshes||[]).map(s=>({...s,geometry:deserializeGeometry(s.geometry)}));let bundle;
      try {
        const name=candidate.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'');
        const output=directory+name+'.glb';
        const settings=normalizeSettings({...doc.settings,object_name:name,export_format:'GLB',export_lods:false,preview_lod:0,export_profile:'STANDARD',merge_by_material:true});
        bundle=createExportBundle(settings,settings.seed,doc.authoring,sources);
        if(!bundle.lodReports.every(r=>r.valid))throw new Error('几何检查未通过，请载入调整后再导出');
        await bindGlbTextures(bundle.materials.leaf,doc.authoring.leaf_material);
        for (const item of bundle.assets) await Promise.all(syncLeafMaterialVariants(item,bindGlbTextures));
        const bytes=await exportGlb(bundle.preparedRoots[0],{connector:pveBranchConnector(doc.authoring),singleMesh:true});
        const saved=await postBytes('/api/save-glb',bytes,output);
        results.push({id:candidate.id,path:saved.path||output});
      }catch(e){results.push({id:candidate.id,error:e.message});}
      finally{if(bundle)disposeExportBundle(bundle);sources.forEach(s=>s.geometry.dispose());}
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const successful=results.filter(r=>!r.error).length;
    setStatus(`候选导出完成 · ${successful}/${results.length} 项成功`,successful===results.length?'ready':'error');
    return results;
  } finally {setBusy(false);}
}

async function exportLod0Glb() {
  if (!$('outputPath').value) throw new Error('请先选择模型输出位置');
  await flushCompleteWorkbench();
  const outputPath = modelOutputPath($('outputPath').value, 'GLB');
  const rigged=$('exportFormat').value==='GLB_SKINNED';
  setBusy(true, rigged?'正在绑定并导出骨骼 GLB':'正在导出静态 GLB');
  setStatus('正在构建最高精度模型', 'busy');
  try {
    const result = await exportSeed(Math.trunc(number('seed')), outputPath, {}, { modelOnly: true,rigged });
    setStatus(rigged?`骨骼 GLB 已导出 · ${result.rigging.bones} 个骨骼 · 含蒙皮与贴图`:'导出完成 · 单个静态 GLB', 'ready');
    showToast(`已导出${rigged?'骨骼':'静态'} GLB（含贴图）：${result.path}`);
  } finally { setBusy(false); }
}

async function exportPveSkeleton() {
  if (!$('outputPath').value) throw new Error('请先选择模型输出位置');
  await flushCompleteWorkbench();
  if (!asset) throw new Error('请先生成树形');
  const outputPath = modelOutputPath($('outputPath').value, 'GLB').replace(/\.glb$/i, '.pve-skeleton.json');
  setBusy(true, '正在导出 PVE 骨架');
  try {
    const skeleton = createPVESkeleton(asset, leafSources);
    const validation = validatePVESkeleton(skeleton);
    if (validation.errors.length) throw new Error(validation.errors.join('；'));
    const result = await api('/api/save-pve-skeleton', {
      output_path: outputPath,
      skeleton_json: `${JSON.stringify(skeleton, null, 2)}\n`,
      validation_json: `${JSON.stringify(validation, null, 2)}\n`,
    });
    setStatus(`PVE ${skeleton.kind === 'whole_plant' ? '整株' : '枝条单元'}骨架已导出 · ${validation.branch_count} 根枝`, 'ready');
    showToast(skeleton.kind === 'whole_plant'
      ? `PVE 整株骨架和验证报告已保存：${result.skeleton_path}`
      : `已保存枝条单元骨架；它不能直接充当整树主干：${result.skeleton_path}`);
  } finally { setBusy(false); }
}

let pveCompleteExporter;
let staticVegetationExporter;
async function exportStaticVegetation() {
  staticVegetationExporter ||= createStaticVegetationExporter({ api, status: setStatus, button: $('exportStaticVegetationBtn'),
    ready: () => { if (!asset || !(authoring.vine || authoring.surface_growth?.enabled)) throw Error('请先打开藤蔓工程；当前静态装配入口支持藤蔓'); },
    save: () => saveProject({ fileOnly: true, exportStatic: true }) });
  return staticVegetationExporter.run();
}
async function exportPveComplete() {
  pveCompleteExporter ||= createPveCompleteExporter({ api, status: setStatus, button: $('exportPveCompleteBtn'),
    ready: () => { if (!asset) throw Error('请先生成整树或藤蔓'); },
    prepare: async () => {
      await flushCompleteWorkbench();
      if(authoring.vine||authoring.surface_growth?.enabled)return;
      const full=buildBranchAsset(collectSettings(),null,leafSources,0,authoring,{instanced:true});
      try {
        const report=planUnitSourceRecovery(full,leafSources);
        if(!report.items.length&&!report.unresolved.length)return;
        const action=await reviewUnitSourceRecovery(report);
        if(action==='cancel')return false;
        if(action==='legacy')return;
        const repaired=recoverUnitSources(full,leafSources,report);
        const checked=buildBranchAsset(full.settings,null,leafSources,0,repaired,{instanced:true});
        try {verifyUnitSourceRecovery(report.plan,checked);} finally {disposeBranchAsset(checked);}
        transactAuthoring('已恢复源单元枝；可撤销。请另存修复工程',next=>Object.assign(next,repaired),{bypassLayers:true});
        selectBranch('');
        await flushCompleteWorkbench();
        return {name:collectSettings().object_name+'_源单元枝修复'};
      } finally {disposeBranchAsset(full);}
    },
    save: prepared => saveProject({ fileOnly: true, exportPve: true, ...prepared }) });
  return pveCompleteExporter.run();
}

async function saveProject(options = {}) {
  if (!projectSaver) throw Error('软件正在初始化，请稍后保存');
  return projectSaver.open(options);
}

async function loadProjectFile(file) {
  windPreview?.stop();
  if (branchWorkbench) {
    if(projectSession&&!await projectSession.guard(file.name))return;
    const operation=async progress=>{await progress(0,'读取 '+file.name);const doc=migrateProjectDocument(JSON.parse(await file.text()));await branchWorkbench.load(doc,{progress,origin:{fileName:file.name}});await projectSession?.loaded();};
    if(projectLoadFlow)await projectLoadFlow.run(file.name,operation);else await operation(async()=>{});
    showToast(`已载入工程：${file.name}`);
    return;
  }
  generatorWorkspace?.reset();
  spatialControls?.deactivate(); cancelAdvancedEdit();
  cancelParameterEdit();
  bundle.reset();
  const document = migrateProjectDocument(JSON.parse(await file.text()));
  await progress(1,'读取真实叶片、花果网格和材质');
  disposeLeafSources();
  leafSources = (document.leaf_meshes || []).map((item, index) => ({
    ...(item.sampleLeafMaterial?{sampleLeafMaterial:item.sampleLeafMaterial}:{}),
    ...(item.sampleLeafMaterialId?{sampleLeafMaterialId:item.sampleLeafMaterialId}:{}),
    ...(item.sampleLeafMaterialName?{sampleLeafMaterialName:item.sampleLeafMaterialName}:{}),
    ...(item.manual_only ? { manual_only: true } : {}),
    id: item.id || `LEAF_${index + 1}`, name: item.name || item.geometry?.source_name || `叶片 ${index + 1}`,
    weight: Number(item.weight) || 1, orderMin: Number(item.orderMin) || 0, orderMax: Number.isFinite(Number(item.orderMax)) ? Number(item.orderMax) : 3,
    season: item.season || 'ANY', ageStage: item.ageStage || 'ANY', shootRole: item.shootRole || 'ANY', colorTint: item.colorTint || '', calibration: item.calibration || { scale: 1, rotation: 0, flip: false }, geometry: deserializeGeometry(item.geometry),
  })).filter((item) => item.geometry);
  authoring = normalizeAuthoring(document.authoring, document.settings?.seed || DEFAULT_SETTINGS.seed);
  selectedBranchId = null;
  selectedBranchIds.clear(); selectedBranchExclusions.clear();
  selectedPointIndex = -1;
  history = [];
  future = [];
  updateLeafSourceUi();
  applySettings(document.settings || DEFAULT_SETTINGS);
  applyAuthoringToControls();
  updateHistoryButtons();
  await generateModel({ fit: true });
  showToast(`已载入工程：${file.name}`);
}

async function importLeafFile(file) {
  if (!allowLeafStyleWrite()) return;
  if (!file || !file.name.toLowerCase().endsWith('.obj')) throw new Error('当前版本支持导入 OBJ 叶片网格');
  const owner = authoring;
  const parsed = parseObjLeaf(await file.text(), file.name, $('sourceAxis').value);
  if (!allowLeafStyleWrite() || authoring !== owner) { parsed.dispose(); return; }
  leafSources.push({ id: `LEAF_${Date.now()}_${leafSources.length}`, name: file.name, weight: 1, orderMin: 0, orderMax: 3, season: 'ANY', calibration: { scale: 1, rotation: 0, flip: false }, geometry: parsed });
  updateLeafSourceUi();
  await generateModel({ fit: false });
  showToast(`叶片网格已导入：${file.name}`);
}

function updateLeafSourceUi() {
  const label = leafSources.length ? `${leafSources.length} 个叶片源` : '内置阔叶';
  $('leafSourceBadge').textContent = label;
  $('leafSourceStatus').textContent = `叶片：${label}`;
  renderLeafSources();
}

async function saveSnapshot() {
  renderer.render(scene, camera);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('无法读取当前视口');
  const outputPath = ($('outputPath').value || `${asset?.settings.object_name || 'Branch'}.fbx`).replace(/\.(fbx|glb)$/i, '.preview.png');
  const result = await postBytes('/api/save-texture', new Uint8Array(await blob.arrayBuffer()), outputPath);
  showToast(`预览图已保存：${result.path}`);
}

function bindEvents() {
  const authoringControlIds = new Set([
    'topologySeed', 'shapeSeed', 'foliageSeed', 'damageSeed', 'rootCount', 'rootSpread', 'rootOffset',
    'envelopeType', 'envelopeRadius', 'envelopeHeight', 'envelopeStrength', 'envelopeFlatness',
    'attractorEnabled', 'attractorX', 'attractorY', 'attractorZ', 'attractorStrength',
    'repellerEnabled', 'repellerX', 'repellerY', 'repellerZ', 'repellerRadius', 'repellerStrength',
    'apicalDominance', 'competition', 'individualScale',
    'pointCoordinateSpace', 'pointConstraint', 'pointSnap', 'pointFalloff', 'pointFalloffProfile', 'pointPreserveLength',
    'tangentMode', 'tangentLength', 'curveKnotCount', 'curveSmoothStrength', 'curveSimplifyTolerance', 'curveSubdivisionLevels',
    'curveLockRoot', 'curveAffectChildren', 'curveLivePreview',
  ]);
  document.querySelectorAll('.tab-button').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('.tab-page').forEach((page) => page.classList.toggle('active', page.dataset.page === button.dataset.tab));
    maskPreviewRoot.visible = button.dataset.tab === 'foliage' && canEditLeafStyle(leafStyleApi);
  }));
  document.querySelectorAll('.view-mode').forEach((button) => button.addEventListener('click', () => {
    viewMode = button.dataset.view;
    document.querySelectorAll('.view-mode').forEach((item) => item.classList.toggle('active', item === button));
    updateViewMode();
  }));
  document.querySelectorAll('[data-curve-mode]').forEach((button) => button.addEventListener('click', () => setCurveEditMode(button.dataset.curveMode)));
  document.querySelectorAll('.parameter-panel input, .parameter-panel select').forEach((control) => {
    if (['projectInput', 'leafInput', 'outputPath', 'speciesProfile', 'sourceAxis'].includes(control.id)
      || authoringControlIds.has(control.id) || control.classList.contains('authoring-control') || control.closest('[data-page="edit"]')) return;
    control.addEventListener('pointerdown', beginParameterEdit);
    control.addEventListener('input', previewParameterEdit);
    control.addEventListener('change', event => { if (rejectLeafStyleControl(event.target)) return; beginParameterEdit(event); commitParameterEdit(event); });
    control.addEventListener('blur', commitParameterEdit);
  });
  [...authoringControlIds].map($).concat([...document.querySelectorAll('.authoring-control')]).forEach((control) => control.addEventListener('change', event => {
    commitAuthoringControls(event);
    if (control.closest('.subtool-block')) renderControlPoints();
  }));
  $('speciesProfile').addEventListener('change', () => {
    beginParameterEdit();
    applySettings(applySpeciesPreset(collectSettings(), $('speciesProfile').value));
    commitParameterEdit();
  });
  $('sourceAxis').addEventListener('change', event => { if (!rejectLeafStyleControl(event.target)) showToast('生长轴会在下次导入叶片 OBJ 时应用'); });
  $('buildBtn').addEventListener('click', async () => {
    try { if (!await branchWorkbench?.regenerateAssembly()) await generateModel(); }
    catch (error) { showToast(error.message, true); }
  });
  $('fitViewBtn').addEventListener('click', fitView);
  document.querySelectorAll('[data-viewport-tool]').forEach((button) => button.addEventListener('click', () => {
    const tool = button.dataset.viewportTool;
    // Size shares the rigid-instance controller, but the visible Comb command
    // must leave its SCALE effect before applying the active-tool toggle.
    const leavingSize = tool === 'COMB' && unitSizeEffectSelected();
    if (leavingSize) {
      $('unitBrushEffect').value = 'TURN';
      $('unitBrushEffect').dispatchEvent(new Event('input', {bubbles:true}));
      $('unitBrushEffect').dispatchEvent(new Event('change', {bubbles:true}));
    }
    setViewportTool(!leavingSize && viewportTool === tool && tool !== 'SELECT' ? 'SELECT' : tool);
  }));
  $('toggleGridBtn').addEventListener('click', () => {
    if (sizeReference) { sizeReference.toggleGrid(); return; }
    gridVisible = !gridVisible;
    grid.visible = gridVisible;
    ground.visible = gridVisible;
    $('toggleGridBtn').classList.toggle('active', gridVisible);
  });
  $('randomSeedBtn').addEventListener('click', () => {
    if(branchWorkbench?.mode==='BRANCH'){branchWorkbench.candidates.open();return;}
    const seed = Math.floor(1 + Math.random() * 2147483645);
    $('seed').value = seed;
    transactAuthoring('已生成新的完整变体', (next) => {
      next.seeds = { topology: seed, shape: seed + 10003, foliage: seed + 20007, damage: seed + 30009 };
    });
  });
  $('syncSeedsBtn').addEventListener('click', () => {
    const seed = Math.max(1, Math.trunc(number('seed')));
    transactAuthoring('四组随机流已从主种子重置', (next) => {
      next.seeds = { topology: seed, shape: seed + 10003, foliage: seed + 20007, damage: seed + 30009 };
    });
  });
  $('newBtn').addEventListener('click', async () => {
    try{if(projectSession&&!await projectSession.guard('新建植物工程'))return;}catch(error){showToast(error.message,true);return;}
    unitComb?.resetReferences();
    branchWorkbench?.deformation.cancel(); branchWorkbench?.instances.deactivate();
    branchWorkbench?.installation.cancel(); branchWorkbench?.views.cancel(); branchWorkbench?.context.cancel();
    if (branchWorkbench?.mode === 'BRANCH') { branchWorkbench.newDraft().catch((error) => showToast(error.message, true)); return; }
    if (branchWorkbench?.mode === 'VINE') { branchWorkbench.newVineDraft().catch((error) => showToast(error.message, true)); return; }
    try {
      const document = await loadDefaultTreeDocument();
      if (document) { await branchWorkbench.load(migrateProjectDocument(document)); projectSaver?.reset({all:true}); return; }
    } catch (error) { showToast(error.message, true); return; }
    generatorWorkspace?.reset();
    spatialControls?.deactivate(); cancelAdvancedEdit();
    cancelParameterEdit();
    bundle.reset();
    disposeLeafSources();
    authoring = normalizeAuthoring({}, DEFAULT_SETTINGS.seed);
    if (branchWorkbench) authoring.branch_library = copy(branchWorkbench.library);
    selectedBranchId = null;
    selectedBranchIds.clear(); selectedBranchExclusions.clear();
    selectedPointIndex = -1;
    history = [];
    future = [];
    matrixVariants = [];
    updateLeafSourceUi();
    applySettings(DEFAULT_SETTINGS);
    projectSaver?.reset({all:true});
    applyAuthoringToControls();
    updateHistoryButtons();
    scheduleBuild(0, true);
  });
  $('resetLeafBtn').addEventListener('click', () => {
    if (!allowLeafStyleWrite()) return;
    disposeLeafSources();
    updateLeafSourceUi();
    scheduleBuild(0);
  });
  $('leafInput').addEventListener('change', async (event) => {
    try { for (const file of event.target.files) await importLeafFile(file); } catch (error) { showToast(error.message, true); }
    event.target.value = '';
  });
  $('projectInput').addEventListener('change', async (event) => {
    try { await loadProjectFile(event.target.files[0]); } catch (error) { showToast(error.message, true); }
    event.target.value = '';
  });
  const dropZone = $('leafDropZone');
  ['dragenter', 'dragover'].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
  dropZone.addEventListener('drop', async (event) => { try { for (const file of event.dataTransfer.files) await importLeafFile(file); } catch (error) { showToast(error.message, true); } });
  $('undoBtn').addEventListener('click', undoAuthoring);
  $('redoBtn').addEventListener('click', redoAuthoring);
  $('localApplyMode').addEventListener('change', () => { localBranchEdit?.commit(); renderBranchEditor(); });
  $('resetBranchEdit').addEventListener('click', resetSelectedBranchEdit);
  $('pruneBranch').addEventListener('click', pruneSelectedBranch);
  $('addChildBranch').addEventListener('click', addManualBranch);
  $('addLeafToBranch').addEventListener('click', addManualLeaf);
  $('clearBranchLeaves').addEventListener('click', clearSelectedBranchLeaves);
  $('duplicateBranch').addEventListener('click', () => document.dispatchEvent(new CustomEvent('duplicate-selection')));
  $('mirrorBranch').addEventListener('click', () => duplicateOrMirrorBranch(true));
  $('reparentBranchBtn').addEventListener('click', reparentSelectedBranch);
  $('splitBranchBtn').addEventListener('click', splitSelectedBranch);
  $('extendBranchBtn').addEventListener('click', extendSelectedBranch);
  $('suppressBranchBtn').addEventListener('click', toggleSuppressedBranch);
  $('applyPointBtn').addEventListener('click', applyPointInputs);
  $('pinPointBtn').addEventListener('click', togglePointPin);
  $('insertBeforeBtn').addEventListener('click', () => insertControlPoint(-1));
  $('insertPointBtn').addEventListener('click', () => insertControlPoint(1));
  $('removePointBtn').addEventListener('click', removeControlPoint);
  $('smoothCurveBtn').addEventListener('click', smoothSelectedCurve);
  $('subdivideNeighborhoodBtn').addEventListener('click', () => subdivideSelectedCurve('NEIGHBORHOOD'));
  $('subdivideAllBtn').addEventListener('click', () => subdivideSelectedCurve('ALL'));
  $('smartSimplifyBtn').addEventListener('click', simplifySelectedCurve);
  $('redistributeKnotsBtn').addEventListener('click', redistributeCurveKnots);
  $('rebuildControlCurveBtn').addEventListener('click',()=>{const branch=selectedBranch();if(branch)commitCurveKnots(editableBranchPoints(branch),'已按当前控制点重新生成走势');});
  $('trimTipBtn').addEventListener('click', () => trimSelectedCurve('ROOT'));
  $('trimRootBtn').addEventListener('click', () => trimSelectedCurve('TIP'));
  $('resetCurveBtn').addEventListener('click', resetSelectedCurve);
  $('saveSelectionSet').addEventListener('click', saveCurrentSelectionSet);
  $('addMaskBtn').addEventListener('click', addFoliageMask);
  $('addAttachmentLayerBtn').addEventListener('click', addAttachmentLayer);
  $('addModifierBtn').addEventListener('click', addModifier);
  $('addTimelineKeyBtn').addEventListener('click', addTimelineKey);
  $('savePoseBtn').addEventListener('click', saveTimelinePose);
  $('buildVariantMatrixBtn').addEventListener('click', buildVariantMatrix);
  document.querySelectorAll('.brush-mode').forEach((button) => button.addEventListener('click', () => {
    const tool = button.dataset.brush === 'ADD' ? 'LEAF_ADD' : button.dataset.brush === 'ERASE' ? 'LEAF_ERASE' : 'SELECT';
    setViewportTool(tool);
  }));
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 1) event.preventDefault();
    if (event.button !== 0) return;
    if (branchWorkbench?.trunkForm.active) { pointerDown = null; return; }
    // Form handles consume their hits in capture handlers. Ordinary clicks
    // still choose a carrier, without starting a curve or sculpt operation.
    if (branchWorkbench?.trunkForm.enabled) { pointerDown = { x: event.clientX, y: event.clientY }; return; }
    if (branchWorkbench?.vines.surface.active) { pointerDown = null; return; }
    if (branchWorkbench?.localAssembly.begin(event)) return;
    if (branchWorkbench?.assemblyGrowth.begin(event)) return;
    if (branchWorkbench?.unitEditor.begin(event)) return;
    if (branchWorkbench?.installation.pointerDown(event)) return;
    if (branchWorkbench?.stroke.begin(event) || branchWorkbench?.influence.begin(event) || branchWorkbench?.forms.begin(event) || branchWorkbench?.arrays.begin(event) || branchWorkbench?.deformation.begin(event) || branchWorkbench?.instances.begin(event)) return;
    if (branchWorkbench?.tools.begin(event)) return;
    if (generatorWorkspace?.beginRange(event)) return;
    if (spatialControls?.begin(event)) return;
    // Visible curve anchors take priority over an overlapping rotation ring.
    if (viewportTool === 'SELECT' && beginControlPointDrag(event)) return;
    if (bundle.begin(event)) return;
    if (sculpt.begin(event)) return;
    if (beginPruneStroke(event)) return;
    if (beginControlPointDrag(event)) return;
    pointerDown = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerleave',()=>{curveHoverPointer=null;});
  canvas.addEventListener('pointermove', (event) => { if(branchWorkbench?.trunkForm.enabled||branchWorkbench?.trunkForm.active){curveHoverPointer=null;return;}const rect=canvas.getBoundingClientRect();curveHoverPointer=event.buttons||event.shiftKey||event.ctrlKey?null:{x:event.clientX-rect.left,y:event.clientY-rect.top};if (branchWorkbench?.localAssembly.move(event)) return; if (branchWorkbench?.assemblyGrowth.move(event)) return; if (branchWorkbench?.unitEditor.move(event)) return; if (bundle.mounting) { bundle.move(event); return; } if (!branchWorkbench?.stroke.move(event) && !branchWorkbench?.influence.move(event) && !branchWorkbench?.forms.move(event) && !branchWorkbench?.arrays.move(event) && !branchWorkbench?.installation.move(event) && !branchWorkbench?.deformation.move(event) && !branchWorkbench?.instances.move(event) && !branchWorkbench?.tools.move(event) && !generatorWorkspace?.moveRange(event) && !spatialControls?.move(event) && !bundle.move(event) && !sculpt.move(event) && !movePruneStroke(event)) moveControlPointDrag(event); });
  canvas.addEventListener('pointerup', (event) => {
    if (event.button !== 0) return;
    if (branchWorkbench?.trunkForm.active) { pointerDown = null; return; }
    if (branchWorkbench?.trunkForm.enabled) {
      if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < 5) selectBranchFromViewport(event);
      pointerDown = null; return;
    }
    if (branchWorkbench?.vines.surface.active) { pointerDown = null; return; }
    if (branchWorkbench?.localAssembly.end(event)) { pointerDown = null; return; }
    if (branchWorkbench?.assemblyGrowth.end(event)) { pointerDown = null; return; }
    if (branchWorkbench?.unitEditor.end(event)) { pointerDown = null; return; }
    if (bundle.mounting) { bundle.end(event); pointerDown = null; return; }
    if (branchWorkbench?.stroke.end(event) || branchWorkbench?.influence.end(event) || branchWorkbench?.forms.end(event) || branchWorkbench?.arrays.end(event) || branchWorkbench?.deformation.end(event) || branchWorkbench?.instances.end(event) || branchWorkbench?.tools.end(event)) { pointerDown = null; return; }
    if (generatorWorkspace?.endRange(event)) { pointerDown = null; return; }
    if (spatialControls?.end(event)) { pointerDown = null; return; }
    if (bundle.end(event)) { pointerDown = null; return; }
    if (sculpt.end(event)) { pointerDown = null; return; }
    if (endPruneStroke(event)) { pointerDown = null; return; }
    if (endControlPointDrag(event)) { pointerDown = null; return; }
    if (event.button === 0 && pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < 5) selectBranchFromViewport(event);
    pointerDown = null;
  });
  canvas.addEventListener('pointercancel', (event) => { pointerDown=null;branchWorkbench?.trunkForm.cancel();branchWorkbench?.unitEditor.cancel(); if (bundle.mounting) { bundle.cancel(); return; } if (!branchWorkbench?.tools.cancel() && !generatorWorkspace?.cancelRange() && !spatialControls?.cancel() && !bundle.cancel() && !sculpt.cancel() && !cancelPruneStroke()) cancelControlPointDrag(event); });
  canvas.addEventListener('lostpointercapture', () => { branchWorkbench?.unitEditor.cancel(); branchWorkbench?.tools.cancel(); cancelPruneStroke(); cancelControlPointDrag(); });
  window.addEventListener('blur', () => { branchWorkbench?.trunkForm.cancel();branchWorkbench?.unitEditor.cancel(); branchWorkbench?.tools.cancel(); pointerDown = null; cancelPruneStroke(); cancelControlPointDrag(); });
  canvas.addEventListener('auxclick', (event) => { if (event.button === 1) event.preventDefault(); });
  canvas.addEventListener('contextmenu', (event) => { if(branchWorkbench?.trunkForm.enabled){event.preventDefault();branchWorkbench.trunkForm.cancel();return;}if(unitComb?.key({key:'Escape'})){event.preventDefault();return;} if (branchWorkbench?.tools.active || spatialControls?.active || generatorWorkspace?.rangeActive) { event.preventDefault(); setViewportTool('SELECT'); } else if (SCULPT_TOOLS.has(viewportTool)) { event.preventDefault(); brushSelectionMenu.open(event); } else if (viewportTool !== 'SELECT') { event.preventDefault(); setViewportTool('SELECT'); } });
  canvas.addEventListener('dblclick', (event) => { if(event.ctrlKey){event.preventDefault();return;} if (branchWorkbench?.trunkForm.enabled) {event.preventDefault();return;}if (branchWorkbench?.vines.surface.active) return; if (branchWorkbench?.unitEditor.enabled) return; if (branchWorkbench?.stroke.active || branchWorkbench?.influence.active || branchWorkbench?.forms.active || branchWorkbench?.arrays.active || branchWorkbench?.deformation.active || branchWorkbench?.instances.active) return; if (!branchWorkbench?.tools.active && !spatialControls?.active && !generatorWorkspace?.rangeActive && viewportTool === 'SELECT' && (branchWorkbench?.instances.doubleClick(event) || insertPointFromCurve(event))) event.preventDefault(); });
  $('saveProjectBtn').addEventListener('click', () => saveProject().catch((error) => showToast(error.message, true)));
  $('exportFormat').addEventListener('change', () => {
    updateExportFormat();
    const format=$('exportFormat').value==='FBX'?'FBX':'GLB',rigged=$('exportFormat').value==='GLB_SKINNED';
    if (asset)Object.assign(asset.settings,{export_format:format,export_rigged:rigged});
    if (committedSettings)Object.assign(committedSettings,{export_format:format,export_rigged:rigged});
  });
  $('pickOutputBtn').addEventListener('click', async () => {
    try {
      const result = await api('/api/pick-output', { current: $('outputPath').value });
      if (result.path) $('outputPath').value = result.path;
    } catch (error) { showToast(error.message, true); }
  });
  $('exportBtn').addEventListener('click', () => ($('exportFormat').value !== 'FBX' ? exportLod0Glb() : exportModels(stateVariantEntries(Math.trunc(number('seed'))))).catch((error) => { setStatus('导出失败', 'error'); showToast(error.message, true); setBusy(false); }));
  $('exportLod0GlbBtn').addEventListener('click', () => exportLod0Glb().catch((error) => { setStatus('导出失败', 'error'); showToast(error.message, true); setBusy(false); }));
  $('exportPveSkeletonBtn').addEventListener('click', () => exportPveSkeleton().catch((error) => { setStatus('PVE 骨架导出失败', 'error'); showToast(error.message, true); setBusy(false); }));
  $('exportPveCompleteBtn').addEventListener('click', () => exportPveComplete().catch((error) => { setStatus('PVE 完整单元枝包导出失败', 'error'); showToast(error.message, true); setBusy(false); }));
  $('exportStaticVegetationBtn').addEventListener('click', () => exportStaticVegetation().catch(error => { setStatus('静态植被导出失败', 'error'); showToast(error.message, true); }));
  $('batchExportBtn').addEventListener('click', () => {
    if (branchWorkbench?.mode === 'BRANCH') { branchWorkbench.candidates.open(); return; }
    const seeds = matrixVariants.length ? matrixVariants : Array.from({ length: Math.max(1, Math.round(number('batchCount'))) }, (_, index) => wrapSeed(Math.trunc(number('seed')) + index * Math.max(1, Math.round(number('batchSeedStep')))));
    exportModels(seeds).catch((error) => { setStatus('批量导出失败', 'error'); showToast(error.message, true); setBusy(false); });
  });
  $('snapshotBtn').addEventListener('click', () => saveSnapshot().catch((error) => showToast(error.message, true)));
  window.addEventListener('keydown', (event) => {
    if ($('branchVariantDialog')?.open) return;
    const curveTyping=event.target.isContentEditable||event.target.matches?.('input,textarea,select,[contenteditable="true"]');
    if(!curveTyping&&!branchWorkbench?.trunkForm.enabled&&!branchWorkbench?.trunkForm.active&&canEditSelectedBranch()&&currentCurvePoints().scope==='POINTS'
      &&(event.key==='Delete'||event.code==='Delete')&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      event.preventDefault();if(!event.repeat&&!event.isComposing&&!document.querySelector('dialog[open]')&&!pointDrag&&!bundle.active&&!keyboardTransform?.active&&!curvePointInteraction?.active)removeControlPoint();return;
    }
    if (unitComb?.key(event)) { event.preventDefault(); return; }
    if (branchWorkbench?.key(event)) { event.preventDefault(); return; }
    if (event.key === 'Escape' && generatorWorkspace?.cancelInteractions()) { event.preventDefault(); return; }
    if (event.key === 'Escape' && generatorWorkspace?.rangeActive) { generatorWorkspace.deactivateRange(); event.preventDefault(); return; }
    if (event.key === 'Escape' && (spatialControls?.cancel() || cancelAdvancedEdit())) { event.preventDefault(); return; }
    if (event.key === 'Escape' && spatialControls?.active) { spatialControls.deactivate(); event.preventDefault(); return; }
    if (event.key === 'Escape' && cancelParameterEdit()) { event.preventDefault(); parameterWorkspace?.cancelScrub(); return; }
    if (bundle.key(event)) { event.preventDefault(); return; }
    if (sculpt.key(event)) { event.preventDefault(); return; }
    if (event.key === 'Escape') {
      if (cancelControlPointDrag() || cancelPruneStroke()) { event.preventDefault(); return; }
      if (viewportTool !== 'SELECT') { event.preventDefault(); setViewportTool('SELECT'); return; }
      if(currentCurvePoints().scope==='POINTS'&&currentCurvePoints().indices.length){event.preventDefault();selectCurvePoints([]);return;}
    }
    if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); saveProject().catch((error) => showToast(error.message, true)); }
    const editingField = event.target.isContentEditable || event.target.matches?.('input, textarea, select, [contenteditable="true"]');
    const toolShortcut = { v: 'SELECT', c: 'COMB', b: 'GRAB' }[event.key.toLowerCase()];
    if (toolShortcut && !branchWorkbench?.trunkForm.enabled && !editingField && !event.defaultPrevented && !event.isComposing && !event.repeat
      && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && !document.querySelector('dialog[open]')
      && !pointDrag && !sculpt.active && !bundle.active && !pruneStroke && !advancedGesture && !settingsGesture
      && !branchWorkbench?.tools.active && !generatorWorkspace?.rangeActive
      && !spatialControls?.dragging && !branchWorkbench?.busy && $('busyOverlay').hidden && !asset?.group.userData.pending_rebuild) {
      event.preventDefault();
      // Use the same route as a click, including the pending-preview safeguard.
      if (viewportTool !== toolShortcut || toolShortcut === 'COMB' && unitSizeEffectSelected() || branchWorkbench?.vines.surface.active) document.querySelector(`.viewport-tool-rail [data-viewport-tool="${toolShortcut}"]`)?.click();
      return;
    }
    if (!editingField && event.ctrlKey && event.key.toLowerCase() === 'z') { event.preventDefault(); undoAuthoring(); return; }
    if (!editingField && event.ctrlKey && event.key.toLowerCase() === 'y') { event.preventDefault(); redoAuthoring(); return; }
    // Section shortcuts own this context. Unhandled/repeated/IME keys must not
    // fall through to deleting the carrier or editing its centerline.
    if (branchWorkbench?.trunkForm.enabled) return;
    if (!editingField && (event.key === 'Delete' || event.code === 'Delete') && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if(currentCurvePoints().scope==='POINTS'&&canEditSelectedBranch()){
        event.preventDefault();if(!event.repeat&&!event.isComposing&&!document.querySelector('dialog[open]')&&!pointDrag&&!bundle.active&&!keyboardTransform?.active&&!curvePointInteraction?.active)removeControlPoint();return;
      }
      if(!event.repeat&&!event.isComposing&&!document.querySelector('dialog[open]')&&branchWorkbench?.instances.selectionOwners().length){event.preventDefault();branchWorkbench.instances.deleteSelection();return;}
      event.preventDefault();
      if (!event.repeat && !event.isComposing && !document.querySelector('dialog[open]')) pruneSelectedBranch();
      return;
    }
    if (editingField || branchWorkbench?.tools.active || pointDrag || sculpt.active || bundle.active || spatialControls?.active || generatorWorkspace?.rangeActive || SELECTION_TOOLS.has(viewportTool) || TRANSFORM_TOOLS.has(viewportTool)) return;
    const action = curveShortcutAction(event);
    if (!action) return;
    const repeatable = ['PREVIOUS_POINT', 'NEXT_POINT'].includes(action);
    if (event.repeat && !repeatable) return;
    event.preventDefault();
    runCurveShortcut(action);
  });
}

async function flushWorkbench() {
  if(branchWorkbench?.unitBrushes?.pending)throw Error('请先松手确认单元枝笔刷，或按 Esc 取消当前笔划');
  branchWorkbench?.unitEditor.cancel();
  branchWorkbench?.skeletonThickness.flushPending();
  if (branchWorkbench?.trunkForm.flushPending() === false) throw Error('请先确认主干形体调节，或按 Esc 取消后再继续');
  branchWorkbench?.stroke.cancel(); branchWorkbench?.influence.cancel(); branchWorkbench?.forms.cancel(); branchWorkbench?.arrays.cancel();
  branchWorkbench?.deformation.cancel();
  commitAdvancedEdit(); commitParameterEdit();
  sculpt.cancel(); bundle.cancel(); cancelControlPointDrag(); cancelPruneStroke();
  if (asset?.group.userData.pending_rebuild) { clearTimeout(buildTimer); await generateModel(); }
}

function captureWorkbench({includeHistory=true}={}) {
  return { ...createProjectDocument(asset, leafSources, authoring),prefab_instances:prefabInstances, ...(includeHistory?{history:copy(history),future:copy(future)}:{}),
    views: branchWorkbench?.views.serialize(),
    selection: [...selectedBranchIds], pointIndex: selectedPointIndex,curve_point_selection:currentCurvePoints().scope==='POINTS'?currentCurvePoints():null, camera: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray(), protectTrunk: $('sculptProtectTrunk').checked };
}

async function restoreWorkbench(document, progress=async()=>{}) {
  windPreview?.stop();
  prefabInstances=normalizePrefabInstances(document.prefab_instances);
  editUiRefresh.invalidate();
  skeletonEditMode = false;
  generatorWorkspace?.reset(); spatialControls?.deactivate();
  cancelAdvancedEdit(); cancelParameterEdit(); sculpt.cancel(); bundle.reset(); cancelControlPointDrag(); cancelPruneStroke();
  clearTimeout(buildTimer); generationSnapshot = null;
  resetLeafTextureCache = true;
  // Release the previous project's undo payload before loading a new document.
  history = []; future = [];
  disposeLeafSources();
  leafSources = (document.leaf_meshes || []).map((item, index) => ({ ...item, id: item.id || `LEAF_${index + 1}`, geometry: deserializeGeometry(item.geometry) })).filter((item) => item.geometry);
  authoring = normalizeAuthoring(document.authoring, document.settings?.seed || DEFAULT_SETTINGS.seed);
  if(window.document.body.dataset.workbench==='TREE'){
    await progress(2,'统一骨架平滑走势与完整单元枝挂接');
    const upgrade=upgradeStructuralCurves(document.settings,authoring);authoring=upgrade.authoring;
    if(upgrade.upgraded.length)showToast(`已统一 ${upgrade.upgraded.length} 支骨架的平滑走势；原工程文件保持，保存后保留新走势`);
  }
  history = copy(document.history || []); future = copy(document.future || []);
  selectedBranchId = null; selectedBranchIds.clear(); selectedBranchExclusions.clear(); selectedPointIndex = -1;
  applySettings(document.settings || DEFAULT_SETTINGS); applyAuthoringToControls(); updateLeafSourceUi(); updateHistoryButtons();
  $('sculptProtectTrunk').checked = document.protectTrunk ?? !authoring.branch_shape;
  setViewportTool('SELECT');
  await progress(2,'生成枝干、装配单元枝与叶花果');
  await generateModel({ fit: !document.camera, throwOnError:true });
  setBranchSelection(document.selection || []); selectedPointIndex = document.pointIndex ?? -1;
  const savedPoints=document.curve_point_selection;
  if(savedPoints?.scope==='POINTS'&&asset.masterBranches.some(b=>b.stableId===savedPoints.owner)&&branchWorkbench?.instances.isEditable(savedPoints.owner)!==false){
    setBranchSelection([savedPoints.owner]);selectedPointIndex=curvePoints.select(selectedBranchId,Array.isArray(savedPoints.indices)?savedPoints.indices:[],savedPoints.primary,editableBranchPoints(selectedBranch()).length);
  }
  renderControlPoints();renderPointEditor();updateSelectionHelper();editContextPanel?.refresh(); bundle.refresh();
  if (document.camera) { camera.position.fromArray(document.camera); controls.target.fromArray(document.target); camera.up.fromArray(document.up || [0, 0, 1]); controls.update(); }
  branchWorkbench?.views.restore(document.views);
  if(nativeViewport.stats.available)await nativeViewport.waitForPresentation({onProgress:s=>progress(3,s.pendingResources?'准备 DX12 视口 · '+s.pendingResources.toLocaleString()+' 项资源待提交':'准备 DX12 视口 · 等待首帧画面')});
  committedSettings = collectSettings(); parameterWorkspace?.sync();
}

function branchThumbnail(helper, width = 192, height = 144) {
  const render=()=>renderPlantThumbnail(asset?.group,renderer,width,height);
  return branchWorkbench?.trunkForm.withFinalVisibility?.(render) ?? render();
}

async function projectThumbnail(width=400,height=300) {
  const current=asset;await waitForLeafTextures(current?.group);
  if(current!==asset)return '';
  return branchThumbnail(null,width,height);
}

function branchShapeThumbnail(shape) {
  const preview = buildBranchAsset({ ...collectSettings(), leaf_density: 0, wind_strength: 0 }, null, [], 0, normalizeAuthoring({ branch_shape: shape }));
  const target = new THREE.WebGLRenderTarget(192, 144); target.texture.colorSpace = THREE.SRGBColorSpace;
  const previous = renderer.getRenderTarget();
  try {
    const previewScene = new THREE.Scene(); previewScene.background = new THREE.Color(0x111916); previewScene.add(preview.group);
    previewScene.add(new THREE.HemisphereLight(0xe6f1fa, 0x536348, 2.5));
    const light = new THREE.DirectionalLight(0xffefd2, 3); light.position.set(2, -3, 5); previewScene.add(light);
    const sphere = new THREE.Box3().setFromObject(preview.group).getBoundingSphere(new THREE.Sphere()), radius = Math.max(0.01, sphere.radius) * 1.15;
    const view = new THREE.OrthographicCamera(-radius * 4 / 3, radius * 4 / 3, radius, -radius, 0.001, radius * 10);
    view.up.set(0, 0, 1); view.position.copy(sphere.center).add(new THREE.Vector3(1, -2, 1.2).normalize().multiplyScalar(radius * 3)); view.lookAt(sphere.center);
    renderer.setRenderTarget(target); renderer.render(previewScene, view);
    const pixels = new Uint8Array(192 * 144 * 4); renderer.readRenderTargetPixels(target, 0, 0, 192, 144, pixels);
    const output = document.createElement('canvas'); output.width = 192; output.height = 144;
    const ctx = output.getContext('2d'), data = ctx.createImageData(192, 144);
    for (let y = 0; y < 144; y++) data.data.set(pixels.subarray((143 - y) * 192 * 4, (144 - y) * 192 * 4), y * 192 * 4);
    ctx.putImageData(data, 0, 0); return output.toDataURL('image/jpeg', 0.86);
  } finally { renderer.setRenderTarget(previous); target.dispose(); disposeBranchAsset(preview); }
}

function previewWorkbenchCurve(id, knots, baseline, branches) {
  previewAdvancedEdit((a) => {
    a.overrides = structuredClone(baseline.overrides); a.sculpt_layers = structuredClone(baseline.sculpt_layers);
    const branch=branches.find(b=>b.stableId===id);if(branch)writeControlCurve(a,controlCurveOperation(branch,knots));
  });
}

async function initialize() {
  await nativeGeometryReady;
  buildLevelRuleControls();
  window.lucide?.createIcons();
  bindEvents();
  curvePointInteraction=bindCurvePointInteraction({canvas,controls,status:setStatus,
    canBegin:()=>viewportTool==='SELECT'&&controlPointRoot.visible&&canEditSelectedBranch()&&viewMode!=='SKELETON'&&!branchWorkbench?.trunkForm.enabled&&!branchWorkbench?.trunkForm.active&&!branchWorkbench?.unitEditor.enabled
      &&!pointDrag&&!bundle.active&&!sculpt.active&&!keyboardTransform?.active&&!advancedGesture&&!settingsGesture&&!pruneStroke&&!asset?.group.userData.pending_rebuild&&$('busyOverlay').hidden&&!document.querySelector('dialog[open]')
      &&![branchWorkbench?.tools,branchWorkbench?.stroke,branchWorkbench?.influence,branchWorkbench?.forms,branchWorkbench?.arrays,branchWorkbench?.deformation,branchWorkbench?.installation,branchWorkbench?.localAssembly].some(t=>t?.active)&&!spatialControls?.active&&!generatorWorkspace?.rangeActive,
    context:()=>{const b=selectedBranch();return b&&canEditSelectedBranch()?{id:b.stableId,points:b.points,knots:editableBranchPoints(b)}:null;},
    records:updateCurveHandleDisplay,
    prepareProjection:()=>{controlPointRoot.updateWorldMatrix(true,false);camera.updateMatrixWorld();const r=canvas.getBoundingClientRect();curvePointProjection={matrix:new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(controlPointRoot.matrixWorld),width:r.width,height:r.height};},
    project:p=>{const q=new THREE.Vector4(p.x,p.y,p.z,1).applyMatrix4(curvePointProjection.matrix),r=curvePointProjection;return{x:(q.x/q.w+1)*r.width/2,y:(1-q.y/q.w)*r.height/2,z:q.z/q.w,w:q.w};},
    select:selectCurvePoints,insert:insertCurvePointAt,
    gizmoOwns:()=>Boolean(bundle.debug.gizmo.enabled&&bundle.debug.gizmo.axis),
    click:selectBranchFromViewport,
  });
  bindTemporaryBranchSelection({ canvas, selection: bundle, status: setStatus,
    shouldHandle: event => !curvePointInteraction?.active&&!branchWorkbench?.trunkForm.enabled && !branchWorkbench?.trunkForm.active && !branchWorkbench?.unitEditor.enabled && !sculpt.adjusting && !sculpt.canSmoothBegin(event),
    beforeBegin: () => { pointerDown = null; sculpt.toolChanged(); },
    canBegin: () => {
      if (branchWorkbench?.trunkForm.enabled || branchWorkbench?.trunkForm.active || branchWorkbench?.unitBrushes.active || sculpt.active || unitComb?.active || keyboardTransform?.active || bundle.active || pointDrag || pruneStroke) return false;
      if ([branchWorkbench?.stroke, branchWorkbench?.influence, branchWorkbench?.forms, branchWorkbench?.arrays, branchWorkbench?.deformation, branchWorkbench?.installation].some(t => t?.active)
        || generatorWorkspace?.rangeActive || spatialControls?.active) {
        showToast('当前专用造型仍在编辑，请先应用或退出该造型，再临时框选'); return false;
      }
      return true;
    },
  });
  const syncEditScope = (source, target) => {
    sculpt.cancel(); clearPruneStroke(); $(target).value = $(source).value;
    if ($(source).value === 'ALL') selectedBranchExclusions.clear();
    if (source === 'branchEditScope') $('sculptSelection').dispatchEvent(new Event('input', { bubbles: true }));
    refreshBranchEditScope();
    bundle.drawOutline();
    unitComb?.refreshTargets();
    branchWorkbench?.refresh();editContextPanel?.refresh();
  };
  $('branchEditScope').addEventListener('change', () => syncEditScope('branchEditScope', 'sculptSelection'));
  $('sculptSelection').addEventListener('input', () => syncEditScope('sculptSelection', 'branchEditScope'));
  const advancedApi = { commitPreview, getAuthoring: () => authoring, getAsset: () => asset, transact: transactAuthoring,
    begin: beginAdvancedEdit, preview: previewAdvancedEdit, commit: commitAdvancedEdit, cancel: cancelAdvancedEdit, isEditing: () => Boolean(advancedGesture) };
  spatialControls = createSpatialControls({ ...advancedApi, canvas, camera, controls, modelRoot, setTool: setViewportTool });
  generatorWorkspace = createGeneratorWorkspace({ ...advancedApi, canvas, camera, controls, setTool: setViewportTool, modelRoot, getSelection: () => selectedBranchIds, setSelection: setBranchSelection, isVisible: (id) => bundle.isVisible(id), status: setStatus });
  branchWorkbench = createBranchWorkbench({ ...advancedApi, measure:(name,fn)=>performanceRecorder.measure(name,fn), canvas, camera, controls, modelRoot, scene, renderer, previewCurve: previewWorkbenchCurve, getSelection: () => selectedBranchId,
    requestUnitMode:()=>requestTreeSelectionMode('INSTANCE'),status:setStatus,
    getUnitInstances:()=>unitAssemblyPool().instances,getUnitBranches:()=>unitAssemblyPool().branches,
    getSkeletonEditMode: () => skeletonEditMode, setSkeletonEditMode,
    getTreeEditMode: () => treeUnitMode()?'UNIT':'BONE',
    getSelections: () => selectedBranchIds, getSelectionExclusions: () => selectedBranchExclusions, setSelections: setBranchSelection, selectionHelpers: [selectionHelper, controlPointRoot], isVisible:id=>bundle.isVisible(id),
    onTrunkFormModeChanged(){const enabled=branchWorkbench?.trunkForm?.enabled;controlPointRoot.visible=!enabled&&viewportTool==='SELECT';if(refreshingBranchSelection)return;updateSelectionHelper();renderControlPoints();refreshBranchEditScope();editContextPanel?.refresh();},
    isEditable: (id) => branchWorkbench?.instances.isEditable(id) ?? true,
    isTree: () => branchWorkbench?.mode === 'TREE',
    canDirectSelect: () => viewportTool === 'SELECT' && !branchWorkbench?.trunkForm.active && !branchWorkbench?.localAssembly.active && !branchWorkbench?.tools.active && !branchWorkbench?.installation.active && !branchWorkbench?.stroke.active && !branchWorkbench?.influence.active && !branchWorkbench?.forms.active && !branchWorkbench?.arrays.active && !branchWorkbench?.deformation.active && !branchWorkbench?.instances.active && !spatialControls?.active && !generatorWorkspace?.rangeActive,
    getSettings: collectSettings, getLeafSources: () => leafSources, select: selectBranch, setTool: setViewportTool, toast: showToast, flush: flushWorkbench, capture: captureWorkbench, restore: restoreWorkbench,
    getCompleteAsset:()=>asset?.skeletonOnly||asset?.settings.preview_lod>0?buildBranchAsset(collectSettings(),null,leafSources,0,authoring,{instanced:true}):asset,
    releaseCompleteAsset:disposeBranchAsset,
    canUsePrefab:()=>!keyboardTransform?.active&&!pointDrag&&!sculpt.active&&!bundle.active&&!advancedGesture&&!settingsGesture&&!spatialControls?.active&&!generatorWorkspace?.rangeActive&&!branchWorkbench?.busy,
    projectLoaded: origin => {unitComb?.resetReferences();projectSaver?.loaded(origin);},
    projectActivated: options => {if(options?.replacement)unitComb?.resetReferences();projectSaver?.activated(options);},
    hoverAssembly:hoverAssemblyUnits, showUnitHangReference, syncAssemblyScope:refreshBranchEditScope,
    isIsolated:()=>Boolean(bundle.debug.isolated),
    showAll:()=>{unitComb?.cancel();bundle.isolate(null);branchWorkbench.refresh();refreshBranchEditScope();editContextPanel?.refresh();},
    clearUnitExclusions:()=>{unitComb?.cancel();setBranchSelection(selectedBranchIds);},
    getUnitTargets:()=>treeUnitMode()?unitBrushRoots():new Set(),
    getUnitSelectionSummary:()=>treeUnitMode()?branchWorkbench?.assemblyLinks?.state.summary.text||'':'',
    async focusAssembly(ids,{criteria,locate=false,isolate=false,shift=false,ctrl=false,clear=false}={}) {
      if(keyboardTransform?.active||advancedGesture||selectionModeSwitch){showToast('请先确认或取消当前调整');return;}
      if(!treeUnitMode()||skeletonEditMode)await requestTreeSelectionMode('INSTANCE');
      if(!treeUnitMode()||branchWorkbench.mode!=='TREE')return;
      sculpt.cancel();
      if(isolate)bundle.isolate(null);
      if(criteria)ids=branchWorkbench.assemblyLinks.roots(criteria);
      const boundary=unitScopeBoundary();
      ids=ids.filter(id=>bundle.isVisible(id)||(boundary.ownedBranches.get(boundary.ownerOf(id)?.id)||[]).some(branch=>bundle.isVisible(branch.stableId)));
      if(!clear&&!ids.length){showToast('当前可见范围内没有这款单元枝；若已隔离，请先显示全部');return;}
      $('branchEditScope').value='DIRECT';$('sculptSelection').value='DIRECT';$('sculptSelection').dispatchEvent(new Event('input',{bubbles:true}));
      const next=clear?new Set():mergeUnitAssemblySelection(branchWorkbench.assemblyLinks.state.selectedRoots,ids,{shift,ctrl});
      setBranchSelection(next);
      if(isolate){bundle.isolate([...next]);branchWorkbench.refresh();}
      unitComb?.refreshTargets();bundle.drawOutline();editContextPanel?.refresh();
      if(locate&&next.size){const owners=unitScopeBoundary().owners,unitIds=new Set([...next].map(id=>owners.get(id)?.id)),box=new THREE.Box3();for(const b of asset.masterBranches)if(unitIds.has(owners.get(b.stableId)?.id))for(const point of b.points)box.expandByPoint(point);fitView(box);}
      setStatus(clear?'已清空单元枝选区':`已选 ${next.size} 支完整单元枝 · G/R/S 微调 · C 梳理`,'ready');
    },
    thumbnailDocument: document => renderBranchCandidate(document, renderer),
    exportCandidateDocuments,
    getOutputDirectory: () => $('outputPath').value.replace(/[^\\/]*$/, '') || '输出路径所在目录（请先设置）',
    updateSettings(label, patch, mutateAuthoring = null) {
      commitAdvancedEdit(); commitParameterEdit();
      const previous = snapshotProject(), next = snapshotAuthoring();
      if (mutateAuthoring) mutateAuthoring(next);
      applySettings({ ...collectSettings(), ...patch });
      if (equalData(previous.settings, collectSettings()) && equalData(previous.authoring, next)) return;
      pushHistory(previous); setAuthoring(next); committedSettings = collectSettings();
      parameterWorkspace?.sync(); showToast(label);
    },
    async applyPlantAssets(document) {
      const previous = snapshotProject(true);
      await restoreWorkbench({ ...document, history: [...history, previous].slice(-80), future: [] });
    },
    getPrefabContext:()=>({assets:prefabAssets,instances:prefabInstances,epoch:prefabEpoch}),
    changePrefabAssets,
    loadPrefabAssets(value){prefabAssets=normalizePrefabAssets(value);prefabEpoch++;},
    async applyBranchPrefab({document,root,prefab_assets,prefab_instance,rollbackLibrary}){
      const next=normalizeAuthoring(document.authoring),existing=new Set(leafSources.map(s=>s.id)),added=[];
      try{for(const item of document.leaf_meshes||[])if(!existing.has(item.id)){const geometry=deserializeGeometry(item.geometry);if(!geometry)throw Error('预制枝干的叶片来源无效');added.push({...structuredClone(item),geometry});}}
      catch(error){added.forEach(s=>s.geometry.dispose());throw error;}
      const previous=snapshotProject(true);leafSources.push(...added);generationSnapshot=null;
      try{
        if(added.length)updateLeafSourceUi();setAuthoring(next);clearTimeout(buildTimer);await generateModel({throwOnError:true});
        if(prefab_assets)prefabAssets=prefab_assets;if(prefab_instance)prefabInstances=[...prefabInstances,prefab_instance];prefabEpoch++;
        pushHistory(previous);setBranchSelection(new Set([root]));
      }catch(error){rollbackLibrary?.();restoreProject(previous);throw error;}
    },
    thumbnail: branchThumbnail, thumbnailShape: branchShapeThumbnail, fit: fitView, setLibrary: (library) => { authoring = { ...authoring, branch_library: copy(library) }; if (asset) scheduleBuild(0); } });
  barkMaterialControls = createBarkMaterialControls({
    container: document.querySelector('.viewport-tools'), canvas,
    getMode: () => branchWorkbench.mode, getAsset: () => asset, getAuthoring: () => authoring,
    getSelection: () => selectedBranchId, getSelections: () => selectedBranchIds,
    transact: transactAuthoring, store: createTrunkPresetStore('bark'), toast: showToast,
    isBusy: () => Boolean(branchWorkbench.busy || asset?.group.userData.pending_rebuild || branchWorkbench.trunkForm.active || advancedGesture || settingsGesture || ! $('busyOverlay').hidden),
    beforeOpen() {
      if (branchWorkbench.trunkForm.flushPending() === false) throw Error('请先确认主干形体调整，或按 Esc 取消');
      commitParameterEdit();
      branchWorkbench.trunkForm.deactivate();
      return true;
    },
  });
  document.addEventListener('tree-assembly-refreshed', () => barkMaterialControls?.refresh());
  unitComb=createUnitCombController({canvas,camera,controls,markerRoot:modelRoot,getAsset:()=>asset,getAuthoring:()=>authoring,getSettings:collectSettings,
    getUnitInstances:()=>unitAssemblyPool().instances,getUnitBranches:()=>unitAssemblyPool().branches,
    getSelectionExclusions:()=>selectedBranchExclusions,
    getTargetIds:()=>unitBrushRoots(),getScope:()=>$('branchEditScope').value==='ALL'?'ALL':'SELECTED',
    getSelectionSummary:()=>branchWorkbench.assemblyLinks.state.summary,
    selectionMode:()=>treeUnitMode()?'UNIT':'BONE',getInstanceEditor:()=>branchWorkbench.instances,
    isBlocked:()=>Boolean(branchWorkbench.trunkForm.enabled||sculpt.adjusting||keyboardTransform?.active||bundle.active||pointDrag||pruneStroke||advancedGesture||settingsGesture||branchWorkbench.busy||branchWorkbench.tools.active||spatialControls?.active||generatorWorkspace?.rangeActive||!$('busyOverlay').hidden),
    isVisible:id=>bundle.isVisible(id),transact:transactAuthoring,commitPreview,status:setStatus,
    showActiveUnits:(_entries,transforms,targets)=>{if(treeUnitMode())bundle.drawOutline(undefined,targets,transforms);},
  });
  leafResources = createLeafResources({ ...advancedApi, ...leafStyleApi, toast: showToast, flush: flushWorkbench, capture: captureWorkbench,
    async replaceLeaves(meshes, material) {
      if (!allowLeafStyleWrite()) return;
      const workspace = branchWorkbench?.mode;
      await flushWorkbench();
      if (!allowLeafStyleWrite() || branchWorkbench?.mode !== workspace) return;
      const next = (meshes || []).map((item) => ({ ...structuredClone(item), geometry: deserializeGeometry(item.geometry) })).filter((item) => item.geometry);
      disposeLeafSources(); leafSources = next;
      authoring.leaf_material = normalizeLeafMaterial(material); generationSnapshot = null;
      updateLeafSourceUi(); await generateModel(); leafResources.refresh();
    },
  });
  leafStyleBoundary = createLeafStyleBoundaryUi({ ...leafStyleApi,
    canEditSource: () => !!branchWorkbench?.instances.selectionOwners().length,
    editSource: () => $('instanceEditSource')?.click(),
  });
  const treeAssemblyLayout = prepareTreeAssemblyLayout();
  parameterWorkspace = createParameterWorkspace({
    begin: beginParameterEdit, preview: previewParameterEdit, commit: commitParameterEdit, cancel: cancelParameterEdit,
    defaults: Object.fromEntries(Object.entries(settingControls).map(([key, id]) => [id, DEFAULT_SETTINGS[key]]).concat([
      ['baseDiameter', DEFAULT_SETTINGS.base_radius * 200], ['tipDiameter', DEFAULT_SETTINGS.tip_radius * 200],
    ])),
  });
  ['architecture', 'bend', 'rootCount'].forEach((id) => $(id)?.closest('.parameter-section')?.classList.add('wb-tree-parameters'));
  arrangeCompanionPanels();
  treeAssemblyLayout.mount(branchWorkbench, () => authoring);
  if($('prefabInstanceSummary'))document.querySelector('.inspector-scroll').prepend($('prefabInstanceSummary'));
  localBranchEdit = bindLocalBranchEdit({begin:beginAdvancedEdit, preview:previewAdvancedEdit, commit:commitAdvancedEdit, cancel:cancelAdvancedEdit,
    authoring:()=>authoring, targets:()=>(selectedBranchIds.size ? [...selectedBranchIds] : selectedBranchId ? [selectedBranchId] : [])
      .filter(id=>!asset?.masterBranches.find(branch=>branch.stableId===id)?.symmetryGroup&&(branchWorkbench?.instances.isEditable(id)??true)),
    points:id=>editableBranchPoints(asset?.masterBranches.find(branch=>branch.stableId===id)).map(point=>point.toArray()),
    transact:transactAuthoring, refresh:renderBranchEditor});
  createBranchWorkflowUI();
  const workspaceNavigation = createWorkspaceNavigation();
  branchWorkbench.context.mount();
  document.addEventListener('tree-selection-kind',event=>requestTreeSelectionMode(event.detail));
  keyboardTransform = bindKeyboardTransform({canvas,camera,modelRoot,controls,status:setStatus,start: operation => {
    if(!asset||asset.group.userData.pending_rebuild||!$('busyOverlay').hidden||branchWorkbench?.trunkForm.enabled||branchWorkbench?.trunkForm.active||pointDrag||pointerDown||branchWorkbench?.assemblyGrowth.dragging||branchWorkbench?.localAssembly.active||bundle.active||sculpt.active||spatialControls?.active||generatorWorkspace?.rangeActive||branchWorkbench?.busy||branchWorkbench?.tools.active||branchWorkbench?.installation.active||branchWorkbench?.stroke.active||branchWorkbench?.influence.active||branchWorkbench?.forms.active||branchWorkbench?.arrays.active||branchWorkbench?.deformation.active||branchWorkbench?.instances.dragging)return null;
    if(branchWorkbench?.vines.surface.active)return null;
    if(branchWorkbench?.mode==='TREE' && branchWorkbench.instances.selectionOwners().length && !branchWorkbench.unitEditor.enabled){
      branchWorkbench.instances.deactivate();
      if(operation==='duplicate')return branchWorkbench.instances.keyboardDuplicate();
      if(operation==='radius'){setStatus('单元枝内部粗细请在枝条工作台编辑；S 可调整完整实例大小','ready');return null;}
      return branchWorkbench.instances.keyboardTransform(operation);
    }
    if(operation==='duplicate')return branchWorkbench?.unitEditor.enabled ? branchWorkbench.unitEditor.keyboardDuplicate() : bundle.keyboardDuplicate();
    if(operation==='radius' && branchWorkbench?.unitEditor.enabled){setStatus('Alt+S 调整枝干粗细，请先选择承重枝干','ready');return null;}
    return branchWorkbench?.unitEditor.enabled ? branchWorkbench.unitEditor.keyboardTransform(operation) : bundle.keyboardTransform(operation);
  }});
  importedTrunkContext=createImportedTrunkContext({asset:()=>asset,authoring:()=>authoring,selection:()=>selectedBranchIds,select:id=>setBranchSelection([id]),scale:axis=>{setViewportTool('SELECT');canvas.focus();keyboardTransform.begin('scale',{axis});},bend:()=>{$('sculptProtectTrunk').checked=false;setViewportTool('BEND_BRUSH');canvas.focus();},enable:id=>transactAuthoring('已启用树干柔性编辑',next=>{next.imported_trunks.mounts.find(m=>m.id===id).binding='FLEX';})});
  editContextPanel=createEditContext({canvas,state:()=>({mode:branchWorkbench.mode,editKind:treeUnitMode()?'UNIT':'BONE',trunkForm:branchWorkbench.trunkForm.enabled,skeletonEditing:skeletonEditMode,trunkFormContext:branchWorkbench.trunkForm.context,branch:selectedBranchId,count:selectedBranchIds.size,point:selectedPointIndex,pointScope:currentCurvePoints().scope,selectedPoints:currentCurvePoints().indices.length,points:editableBranchPoints(selectedBranch()).length,sample:!!(selectedBranch()?.unitOwner||selectedBranch()?.instanceId),unit:branchWorkbench.unitEditor.enabled,tool:viewportTool,densityThin:branchWorkbench?.unitBrushes?.density.debug.thin,densityScope:$('unitDensityScope')?.value,densityStrength:$('unitDensityStrength')?.value,scope:$('branchEditScope').value,unitSummary:treeUnitMode()?branchWorkbench.assemblyLinks.state.summary.text:'',orientation:$('unitCombOrientation').value,effect:$('unitBrushEffect').value})});
  document.addEventListener('unit-density-mode',()=>editContextPanel.refresh());
  $('unitCombOrientation').addEventListener('change',()=>{refreshBranchEditScope();editContextPanel.refresh();});
  $('unitBrushEffect').addEventListener('change',()=>{refreshBranchEditScope();editContextPanel.refresh();});
  setViewportTool('SELECT');
  updateOutputs();
  applyAuthoringToControls();
  updateLeafSourceUi();
  try {
    config = await api('/api/config');
    $('outputPath').value = config.output_fbx || '';
  } catch (error) {
    console.warn(error);
    $('outputPath').value = '程序化树枝单元.fbx';
  }
  await window.treeDuckAppearance?.ready;
  await branchWorkbench.ready;clearTimeout(buildTimer);
  const defaultTree = await loadDefaultTreeDocument();
  if (defaultTree) await branchWorkbench.load(migrateProjectDocument(defaultTree));
  else await generateModel({ fit: true });
  committedSettings = collectSettings();
  parameterWorkspace.sync();
  const captureForSave = async () => {
    await flushCompleteWorkbench();
    return { ...createProjectDocument(asset, leafSources, authoring),prefab_assets:portablePrefabAssets(prefabAssets),prefab_instances:prefabInstances,
      workspaces: branchWorkbench.serialize({ omitActive: branchWorkbench.mode === 'TREE' }),curve_point_selection:currentCurvePoints().scope==='POINTS'?currentCurvePoints():null,
      camera: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray() };
  };
  // Recovery captures committed data without leaving skeleton editing, cancelling
  // tool previews, or changing the user's camera and selection.
  const captureSession=async()=>({...createProjectDocument(asset,leafSources,authoring),settings:collectSettings(),prefab_assets:portablePrefabAssets(prefabAssets),prefab_instances:prefabInstances,
    workspaces:branchWorkbench.serialize({omitActive:branchWorkbench.mode==='TREE'}),curve_point_selection:currentCurvePoints().scope==='POINTS'?currentCurvePoints():null,
    camera:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray()});
  projectLoadFlow=createProjectLoadFlow();
  const projectLibrary = createProjectLibraryManager({
    name: () => collectSettings().object_name,
    toast: showToast,
    thumbnail: () => branchThumbnail(controlPointRoot, 512, 384),
    capture: captureForSave,
    thumbnailDocument:document=>{const doc=migrateProjectDocument(document);return renderBranchCandidate(doc.workspaces?.[String(doc.workspaces?.active||'').toLowerCase()]||doc,renderer);},
    save: options => projectSaver.open(options),
    dirty:()=>projectSession?.needsSave()??projectSaver?.dirty(),
    beforeOpen:()=>projectSession?.guard('',{confirmed:true}),
    openFlow:(name,operation)=>projectLoadFlow.run(name,operation),
    async load(document,progress) { await branchWorkbench.load(migrateProjectDocument(document),{progress});await projectSession?.loaded(); },
  });
  projectSaver = createProjectSavePanel({prefabs:()=>prefabAssets.items,prefabBusy:()=>branchWorkbench.prefabs.busy,
    installedCount:()=>branchWorkbench.assemblyLinks.state.summary.total,
    authoring:()=>authoring, settings:collectSettings, leaves:()=>leafSources, mode:()=>branchWorkbench.mode,
    asset:()=>asset, flush:flushCompleteWorkbench, capture:captureForSave, request:api, toast:showToast,
    thumbnail:()=>projectThumbnail(512,384), openLibrary:id=>document.dispatchEvent(new CustomEvent('resource-center-open',{detail:{scope:'library',type:'plant',key:'plant:'+id}})),
    saved(name,context){authoring.workbench={...authoring.workbench,project_save:context};
      applySettings({...collectSettings(),object_name:name});committedSettings=collectSettings();
      if(asset){asset.authoring.workbench={...asset.authoring.workbench,project_save:{...context}};asset.settings.object_name=name;}
      branchWorkbench.refresh();queueMicrotask(()=>projectSession?.saved());},
  });
  const authoringTokens=new WeakMap();let tokenId=0;
  const sessionToken=()=>{if(!authoringTokens.has(authoring))authoringTokens.set(authoring,++tokenId);return authoringTokens.get(authoring)+'|'+prefabEpoch+'|'+JSON.stringify(collectSettings())+'|'+branchWorkbench.mode+'|'+leafSources.map(s=>s.geometry?.uuid).join(',');};
  projectSession=createProjectSession({thumbnailDocument:document=>{const doc=migrateProjectDocument(document);return renderBranchCandidate(doc.workspaces?.[String(doc.workspaces?.active||'').toLowerCase()]||doc,renderer);},mode:()=>branchWorkbench.mode,origin:()=>projectSaver.origin(),thumbnail:()=>projectThumbnail(400,300),openLibrary:()=>document.dispatchEvent(new CustomEvent('resource-center-open',{detail:{scope:'library',type:'plant'}})),prepareSwitch:flushWorkbench,token:sessionToken,dirty:()=>projectSaver.dirty(),name:()=>collectSettings().object_name,toast:showToast,capture:captureSession,save:options=>projectSaver.open(options),blocked:()=>branchWorkbench.busy||branchWorkbench.prefabs.busy||branchWorkbench.localAssembly.active||branchWorkbench.treeRecipes.busy||projectLoadFlow.active||Boolean(advancedGesture||pointDrag||sculpt.active||bundle.active||keyboardTransform?.active)||Boolean(branchWorkbench.tools.active||branchWorkbench.stroke.active||branchWorkbench.influence.active||branchWorkbench.forms.active||branchWorkbench.arrays.active||branchWorkbench.deformation.active||branchWorkbench.installation.active||generatorWorkspace.rangeActive||spatialControls.active)||asset?.group.userData.pending_rebuild||!$('busyOverlay').hidden,open:(name,operation)=>projectLoadFlow.run(name,operation),load:(doc,progress,origin)=>branchWorkbench.load(migrateProjectDocument(doc),{progress,origin}),markRecovered:()=>projectSaver.markRecovered()});
  const packageCaptureAllowed=(allowWorkbench=false)=>(allowWorkbench||['TREE','VINE'].includes(branchWorkbench.mode))&&!Boolean(
    branchWorkbench.busy||branchWorkbench.prefabs.busy||projectLoadFlow.active||advancedGesture||settingsGesture||pointDrag||pruneStroke||sculpt.active||bundle.active||keyboardTransform?.active
    ||branchWorkbench.tools.dragging||branchWorkbench.stroke.dirty||branchWorkbench.stroke.pending||branchWorkbench.influence.dirty
    ||branchWorkbench.forms.dirty||branchWorkbench.forms.pending||branchWorkbench.arrays.dirty||branchWorkbench.arrays.pending||branchWorkbench.deformation.dirty||branchWorkbench.deformation.dragging
    ||branchWorkbench.installation.active||branchWorkbench.trunkForm.active||branchWorkbench.skeletonThickness.pending||branchWorkbench.localAssembly.active||branchWorkbench.treeRecipes.busy
    ||spatialControls.dragging||asset?.group.userData.pending_rebuild||!$('busyOverlay').hidden);
  const trunkStore=createTrunkModelStore();
  const projectTrunks=()=>authoring.imported_trunks?.assets||[];
  const portableTrunk=value=>({...value,calibration:structuredClone(value.calibration),guides:structuredClone(value.guides),binding:structuredClone(value.binding||{})});
  async function useTrunk(value){
    if(!packageCaptureAllowed(true))throw Error('请先完成当前调整，再以树干创建植物');
    if(!await projectSession.guard('以树干创建植物'))return false;
    const model=portableTrunk(value),{shape,mount}=importedTrunkShape(model);mount.binding='FLEX';
    const settings=normalizeSettings({...DEFAULT_SETTINGS,object_name:model.name,child_count:0,leaf_density:0,max_leaves:0,buds_enabled:false,fruit_enabled:false,wind_strength:0,branch_levels:3}),document={format:'ProceduralBranchProject',version:4,settings,authoring:normalizeAuthoring({branch_shape:shape,imported_trunks:{version:1,assets:[model],mounts:[mount]},recipe:{name:model.name,tags:['WHOLE_PLANT','FOLIAGE_ON_INSTANCES_ONLY']}},settings.seed),leaf_meshes:[]};
    await projectLoadFlow.run(model.name,async progress=>{await branchWorkbench.load(migrateProjectDocument(document),{progress});await projectSession.loaded();});return true;
  }
  async function saveProjectTrunk(value){
    if(!packageCaptureAllowed(true))throw Error('请先完成当前调整，再保存树干素材');const model=portableTrunk(value),existing=projectTrunks().find(a=>a.id===model.id);
    if(existing&&authoring.imported_trunks.mounts.some(m=>m.asset_id===model.id))model.id='TRUNK_'+crypto.randomUUID().replaceAll('-','');
    transactAuthoring('已保存项目树干素材',draft=>{const data=draft.imported_trunks||{version:1,assets:[],mounts:[]};if(!data.assets.some(a=>a.id===model.id)&&data.assets.length>=16)throw Error('当前项目最多保留 16 款树干素材');draft.imported_trunks={...data,assets:[...data.assets.filter(a=>a.id!==model.id),model]};},{bypassLayers:true});
  }
  const sculptReplacement=createSculptTrunkReplacementPreview({authoring:()=>authoring,async preview(next){if(!packageCaptureAllowed(true)||branchWorkbench.mode!=='TREE')throw Error('请返回整树并结束当前编辑');const document=createProjectDocument(asset,leafSources,structuredClone(authoring));const before=await renderBranchCandidate(document,renderer),after=await renderBranchCandidate({...document,authoring:next},renderer);return {before:before.image,after:after.image};},async apply(proposal){if(!packageCaptureAllowed(true))throw Error('请先结束当前编辑');transactAuthoring('已应用雕刻树干；原素材保留，可撤销',draft=>Object.assign(draft,proposal.authoring),{bypassLayers:true});}});
  const trunkPreparation=createTrunkPreparation({canReplace:value=>branchWorkbench.mode==='TREE'&&!!value&&sculptReplacementTargets(authoring,value).length>0,replace:value=>sculptReplacement.open(value),native:nativeViewport,toast:showToast,use:useTrunk,saveProject:saveProjectTrunk,async sculpt(value,context){
    await trunkPreparation.close({resume:false});await modelSculpt.open({model:value,onReturn:()=>trunkPreparation.open({model:value,...context}),onApply:next=>trunkPreparation.open({model:next,...context})});
  }});
  const modelSculpt=createModelSculpt({native:nativeViewport,toast:showToast,saveProject:saveProjectTrunk,continue:value=>trunkPreparation.open({model:value,onReturn:()=>resourceCenter.resume()})});
  async function openModelSculpt(record=null){
    if(!packageCaptureAllowed(true))throw Error('请先完成当前工程调整，再进入模型雕刻');
    const model=record?(record.inspection||(record.packageAsset?await readPackAsset(record.id):record.scope==='project'?projectTrunks().find(a=>a.id===record.id):await trunkStore.get(record.id,record.revision))):null;
    resourceCenter.close();await modelSculpt.open({model,onReturn:()=>resourceCenter.resume()});
  }
  async function openTrunkPreparation(record=null){
    if(branchWorkbench.busy||projectLoadFlow.active||!$('busyOverlay').hidden)throw Error('请等待当前工程处理完成');
    let model=null;if(record)model=record.inspection|| (record.packageAsset?(await readPackAsset(record.id)):record.scope==='project'?projectTrunks().find(a=>a.id===record.id):await trunkStore.get(record.id,record.revision));
    resourceCenter.close();await trunkPreparation.open({model,onReturn:()=>resourceCenter.resume()});
  }
  const plantPacks=createPlantPackWorkspace({toast:showToast,name:()=>collectSettings().object_name,canCapture:packageCaptureAllowed,trunks:projectTrunks,
    capture:async()=>{if(!packageCaptureAllowed())throw Error('请先确认或取消当前调整，再导出资源包');return captureSession();},thumbnail:()=>projectThumbnail(400,300),
    currentIdentity:()=>authoring.workbench?.project_save?.templateId||'plant-'+projectSession.draftId,
    readPrefab:id=>branchWorkbench.prefabs.store.get(id),prefabs:()=>branchWorkbench.prefabs.context,branches:()=>branchWorkbench.library,leafMaterial:()=>authoring.leaf_material,refreshLibraries:()=>branchWorkbench.refreshPackageLibraries(),
    canUse:type=>packageCaptureAllowed(true)&&(type!=='branch'&&type!=='prefab'||branchWorkbench.mode==='TREE'&&!skeletonEditMode),
    async use(type,value,record){
      if(type==='plant'){if(!await projectSession.guard(record.name))return false;await projectLoadFlow.run(record.name,async progress=>{await branchWorkbench.load(migrateProjectDocument(value),{progress});await projectSession.loaded();});}
      else if(type==='prefab'){const id=await branchWorkbench.prefabs.importToProject(record.alias);if(!id)return false;}
      else if(type==='branch'){await branchWorkbench.libraryManager.add(record.alias);if(!branchWorkbench.library.some(a=>a.id===record.alias))return false;}
      else if(type==='units')await branchWorkbench.plantUnits.openPack(record.alias,{source:'resource-center',onReturn:()=>resourceCenter.resume()});
      else if(type==='trunk')return useTrunk(value);
      else if(type==='material'){await createTrunkPresetStore(value.kind).put({name:value.name,shape:value.data,package_origins:value.package_origins});if(value.kind==='bark')await barkMaterialControls.open();else{showToast('已收入本机'+({detail:'树干细节',combination:'细节组合',profile:'细节轮廓',root:'板根形状'}[value.kind]||'配方')+'库，请在主干形体工具中选择作用位置');workspaceNavigation.revealControl('#trunkFormPanel');}}
    }
  });
  const resourceCenter=createResourceCenter({toast:showToast,projects:projectLibrary,packs:plantPacks,prefabs:branchWorkbench.prefabs,
    trunks:projectTrunks,prepareTrunk:openTrunkPreparation,inspectTrunk:openTrunkPreparation,sculptTrunk:openModelSculpt,
    branches:()=>branchWorkbench.library,
    canUse:type=>packageCaptureAllowed(true)&&(type!=='branch'&&type!=='prefab'||branchWorkbench.mode==='TREE'&&!skeletonEditMode),
    editBranch:id=>branchWorkbench.libraryManager.edit(id),
    readBranch:record=>branchWorkbench.inspectBranch(record.id,record.inspection||null),
    async prepareUnits(){if(branchWorkbench.busy||projectLoadFlow.active||!$('busyOverlay').hidden)throw Error('请等待当前工程处理完成，再进入叶花果整理');return branchWorkbench.plantUnits.openPreparation({beforeOpenPack:()=>resourceCenter.close(),onReturn:()=>resourceCenter.resume()});},
    async create(type){if(!packageCaptureAllowed(true))throw Error('请先完成当前调整');if(type==='trunk')return openTrunkPreparation();if(type==='units')return branchWorkbench.plantUnits.open({source:'resource-center',onReturn:()=>resourceCenter.resume()});if(type==='material')return barkMaterialControls.open();if(type==='plant')return projectSaver.open({mode:'NEW'});if(type==='prefab'){$('addBranchPrefabBtn').click();return;}return branchWorkbench.libraryManager.create();},
    async use(record){
      if(record.type==='trunk'){const model=record.packageAsset?await readPackAsset(record.id):record.scope==='project'?projectTrunks().find(a=>a.id===record.id):await trunkStore.get(record.id,record.revision);return useTrunk(model);}
      if(record.type==='prefab'){branchWorkbench.prefabs.beginPlacement(record.id,record.scope);return true;}
      if(record.type==='branch')return branchWorkbench.libraryManager.add(record.id);
      if(record.type==='units')return branchWorkbench.plantUnits.openPack(record.id,{source:'resource-center',onReturn:()=>resourceCenter.resume()});
      if(record.type==='plant'&&!record.packageAsset)return projectLibrary.use(record.id);
      if(record.packageAsset)return plantPacks.useAsset(record);
      const kind=record.key.startsWith('material:')?record.key.split(':')[1]:'bark';
      if(kind==='bark')await barkMaterialControls.open();else workspaceNavigation.revealControl('#trunkFormPanel');
      showToast('已打开对应工具，请选择「'+record.name+'」并明确应用位置');return true;
    }
  });
  createPanelGuides();
  sizeReference = createSizeReference({ scene, camera, controls, canvas, grid, ground, fit: fitView,
    getAsset: () => asset, getMode: () => branchWorkbench.mode, getSelectedBranch: () => selectedBranchId,
    isSkeletonOnly: () => skeletonEditMode, isMultiview: () => branchWorkbench.views.enabled,
    setGridVisible(visible) { gridVisible = visible; grid.visible = ground.visible = visible; $('toggleGridBtn').classList.toggle('active', visible); },
  });
  sizeReference.update(performance.now(), true);
  // Wind is a reversible GPU presentation pose; authored shapes stay at rest.
  const legacyWind=$('rootStiffness').closest('.parameter-section'),windAdvanced=document.createElement('details');
  windAdvanced.innerHTML='<summary>高级 · 原有风动权重设置</summary>';legacyWind.before(windAdvanced);windAdvanced.append(legacyWind);
  $('windStrength').closest('.range-field').hidden=true;
  windPreview=createWindPreview({canvas,markerRoot:modelRoot,getAsset:()=>asset,getAuthoring:()=>authoring,status:setStatus,
    save:values=>{authoring={...authoring,wind_preview:values};if(asset)asset.authoring=authoring;projectSaver?.activated();},
    async prepare(){
      if(branchWorkbench.busy||asset?.group.userData.pending_rebuild||advancedGesture||keyboardTransform?.active||sculpt.active||sculpt.adjusting||bundle.active||pointDrag||branchWorkbench.trunkForm.active||branchWorkbench.unitBrushes.active||branchWorkbench.tools.dragging||branchWorkbench.assemblyGrowth.dragging||branchWorkbench.views.enabled)throw Error('请先完成当前调整或关闭多视图，再播放风动');
      branchWorkbench.trunkForm.deactivate();
      if(skeletonEditMode)await setSkeletonEditMode(false);
      setViewportTool('SELECT');setBranchSelection([]);viewMode='SOLID';updateViewMode();
      document.querySelectorAll('.view-mode').forEach(b=>b.classList.toggle('active',b.dataset.view==='SOLID'));
    },
    blocked:()=>Boolean(branchWorkbench.busy||advancedGesture||keyboardTransform?.active||sculpt.active||bundle.active||pointDrag||document.body.classList.contains('resource-center-active')||branchWorkbench.views.enabled),
  });
  window.__branchForge = {
    performance:performanceRecorder,
    nativeViewport,
    geometryJobs,
    skeletonGeometryJobs,
    get geometryKernelState(){return geometryAcceleratorState();},
    get editUiPending() { return Boolean(editUiRefresh.pending); },
    get editTimings() { return editTimings; },
    sizeReference,
    get keyboardTransformActive() { return keyboardTransform?.active || false; },
    get skeletonEditMode() { return skeletonEditMode; },
    projectLibrary,projectSession,projectLoadFlow,
    plantPacks,resourceCenter,trunkPreparation,modelSculpt,
    renderer, scene, camera, controls, modelRoot, skeletonRoot,
    get asset() { return asset; },
    get leafGeometry() { return leafSources[0]?.geometry || null; },
    get leafSources() { return leafSources; },
    get authoring() { return authoring; },
    get sculptState() { return sculpt.debug; },
    get unitComb() { return unitComb; },
    get windPreview() { return windPreview; },
    get selectedCurvePoint() { return {branchId:selectedBranchId,index:selectedPointIndex}; },
    get curvePointSelection(){return currentCurvePoints();},
    get bundleState() { return bundle.debug; },
    get generatorState() { return { selected: generatorWorkspace.selected, overlay: generatorWorkspace.overlay, rangeRoot: generatorWorkspace.rangeRoot }; },
    get spatialState() { return spatialControls; },
    get workbench() { return branchWorkbench; },
    get barkMaterials() { return barkMaterialControls; },
    get historyState() { return { undo: history.length, redo: future.length }; },
    collectSettings, collectAuthoringFromControls, generateModel, createExportBundle, hierarchyTexturePayload,
  };
  const previewPath = new URLSearchParams(location.search).get('project');
  if (previewPath && /^previews\/[a-z0-9_.-]+\.branch\.json$/i.test(previewPath)) {
    const response = await fetch('/' + previewPath, { cache: 'no-store' });
    if (!response.ok) throw new Error('Cannot open preview project: ' + previewPath);
    const name = previewPath.split('/').at(-1);
    await loadProjectFile(new File([await response.blob()], name, { type: 'application/json' }));
  }
}

initialize().then(() => window.treeDuckUI?.ready()).catch((error) => {
  console.error(error);
  window.treeDuckUI?.error(error.message);
  setStatus('初始化失败', 'error');
  showToast(error.message, true);
});







