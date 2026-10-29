import { createAppConfirm } from './app-confirm.js';
import { bakeDuplicateUnits } from './branch-duplicate.js';
import { DISTRIBUTION } from './distribution-config.js';
import { loadSurfaceExample } from './surface-example.js';
import { loadIvyAssets, withIvyAssets } from './builtin-plant-assets.js';
import { createUnitEditor } from './unit-editor.js';
import { createUnitRulesUI } from './unit-rules-ui.js';
import { createUnitSourceWorkflow } from './unit-source-workflow.js';
import { createUnitAssemblyUI } from './unit-assembly-ui.js';
import { buildUnitAssemblySelection } from './unit-assembly-selection.js';
import * as THREE from 'three';
import { DEFAULT_SETTINGS } from './branch-kernel.js';
import { normalizeAuthoring } from './authoring-state.js';
import { blankBranchShape, captureBranchShape, copy, normalizeBranchLibrary, nextAssetVersion, resolveInstanceShape, resolveInstanceAsset } from './branch-workbench-data.js';
import { createWorkbenchTools } from './branch-workbench-tools.js';
import { createShapingContext } from './shaping-context.js';
import { createBranchInstallation } from './branch-installation.js';
import { createBranchMultiview } from './branch-multiview.js';
import { normalizeJunction, branchRadiusAt } from './branch-shaping.js';
import { createBranchDeformation } from './branch-deformation-controller.js';
import { createBranchInstanceEditor } from './branch-instance-controller.js';
import { reframeInstanceEdits, instanceEditBase } from './branch-instance-edit.js';
import { createBranchSymmetryEditor } from './branch-symmetry-controller.js';
import { createAssetVersions } from './branch-asset-versions.js';
import { createBranchFormTools } from './branch-form-controller.js';
import { createBranchArrayEditor } from './branch-array-controller.js';
import { organizeShapingTools } from './shaping-tool-shelf.js';
import { createBranchStroke } from './branch-stroke-controller.js';
import { createBranchInfluence } from './branch-influence-controller.js';
import { createVineWorkspace } from './vine-workspace.js';
import { vinePreset } from './vine-data.js';
import { TREE_SPECIES, TREE_BRANCH_STYLES, treeSpeciesStyles, createTreeSpeciesDocument } from './tree-species-library.js';
import { loadTreeSpeciesAssets, withTreeSpeciesAssets } from './tree-species-assets.js';
import { TREE_ORGAN_MODES } from './tree-organ-data.js';
import { createBranchQuickControls } from './branch-quick-controls.js';
import { createBranchVariantWorkspace } from './branch-variant-workspace.js';
import { createPlantUnitWorkspace } from './plant-unit-workspace.js';
import { normalizeFoliageUnit } from './foliage-unit-data.js';
import { ASSEMBLY_ZONES, normalizeAssemblySlots, inferAssemblySlots, addAssemblyAsset, assignAssemblyInstances, seedAssemblyInstances, countAssemblyInstances, resizeAssemblyInstances } from './branch-assembly.js';
import { recoverLegacyBranchAsset } from './legacy-branch-recovery.js';
import { createBranchLibraryManager } from './branch-library-manager.js';
import { createBranchAssetStore } from './branch-asset-store.js';
import {packageOrigins,collectPackageOrigins} from './asset-origins.js';
import { assemblyScaleState, assemblyCardScale, applyAssemblyScale, sampleThicknessAdjustments, restoreSampleThickness, INSTANCE_SCALE_MIN, INSTANCE_SCALE_MAX } from './assembly-scale.js';
import { createSkeletonThicknessControls } from './skeleton-thickness-controls.js';
import { createTrunkFormControls } from './trunk-form-controls.js';
import { redistributeAssembly, recordGeneratedPlacements, isAutomaticPlacement } from './assembly-distribution.js';
import { applyGrowthRules } from './assembly-growth.js';
import { createAssemblyGrowthControls } from './assembly-growth-controls.js';
import { createLocalAssemblyControls } from './local-assembly-controls.js';
import { assemblyProtection, assemblyBranchLimit } from './local-assembly-data.js';
import { createTreeRecipeWorkspace } from './tree-recipe-workspace.js';
import { createAssetOrganizer } from './asset-organizer.js';
import { captureCompleteInstanceDraft, captureCompleteDraftShape } from './complete-instance-draft.js';
import { importSampleMaterials, remapSampleMaterial } from './sample-materials.js';
import { createAssemblyGroupControls } from './assembly-group-controls.js';
import { resetBranchInstanceEdits } from './branch-instance-operations.js';
import {createBranchPrefabWorkspace} from './branch-prefab-assets.js';
import {createUnitBrushTools} from './unit-brush-tools.js';

const uid = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const $ = (id) => document.getElementById(id);
const icon = (name) => `<i data-lucide="${name}"></i>`;
const button = (id, name, label) => `<button type="button" id="${id}" title="${label}" aria-label="${label}">${icon(name)}</button>`;
const numeric = (id, label, value, min, max, step) => `<label>${label}<input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
// All workspaces share the active project's library. Save that library once in
// the enclosing project; load() restores it into every parked workspace.
const cloneDocument = (doc) => { const { history, future, selection, pointIndex, authoring, ...rest } = doc; const { branch_library, ...localAuthoring } = authoring; return copy({ ...rest, authoring: localAuthoring }); };

export function createBranchWorkbench(api) {
  let mode = 'TREE'; let parked = { TREE: null, BRANCH: null, VINE: null }; let busy = false; let selectedAsset = ''; let selectedInstance = ''; let library = []; let ready;
  let trunkOwnsSkeletonMode = false;
  const confirmAction=createAppConfirm('branchActionConfirm');
  const assetStorage = createBranchAssetStore();
  const organizer = createAssetOrganizer();
  const store = { list: () => assetStorage.list(), remove: id => assetStorage.remove(id), put: item => assetStorage.put(portableAsset(item)) };
  const bar = document.createElement('nav'); bar.className = 'branch-workspace-bar'; bar.setAttribute('aria-label', '建模工作区');
  bar.innerHTML = `<div class="branch-workspace-modes"><button id="treeWorkspaceBtn" class="active">${icon('trees')}<span>整树造型</span></button><button id="branchWorkspaceBtn">${icon('git-branch')}<span>枝条工作台</span></button></div><span id="branchWorkspaceState">整树</span><button id="openBranchAssembly" title="单元枝装配 · 选择素材、配置数量与挂接位置">${icon('library')}<span>单元枝装配 <b id="branchAssemblyCount">0</b></span></button><button id="extractBranchBtn">${icon('git-branch')}<span>编辑源单元枝</span></button>`;
  document.querySelector('.topbar').after(bar);
  const selectionModes=document.createElement('div');selectionModes.id='treeSelectionModes';selectionModes.className='branch-workspace-modes';
  selectionModes.setAttribute('aria-label','调整对象');
  selectionModes.innerHTML='<button type="button" data-tree-selection-kind="SKELETON" class="active" aria-pressed="true" title="主枝干：调整承重骨架、控制点和树形，单元枝整体跟随">主枝干</button><button type="button" data-tree-selection-kind="INSTANCE" aria-pressed="false" title="单元枝：G/R/S 整支微调；C 梳理批量转向，内部样式保持">单元枝</button>';
  $('branchEditScopeBar').prepend(selectionModes);
  selectionModes.addEventListener('click',event=>{const button=event.target.closest('[data-tree-selection-kind]');if(button)document.dispatchEvent(new CustomEvent('tree-selection-kind',{detail:button.dataset.treeSelectionKind}));});
  const skeletonEditButton = document.createElement('button'); skeletonEditButton.id = 'skeletonEditModeBtn';
  bar.querySelector('.branch-workspace-modes').after(skeletonEditButton);
  const managerButton=document.createElement('button');managerButton.id='openBranchLibraryManager';managerButton.innerHTML=`${icon('library-big')}<span>单元枝成品库</span>`;bar.querySelector('.branch-workspace-modes').after(managerButton);
  const vineButton = document.createElement('button'); vineButton.id = 'vineWorkspaceBtn'; vineButton.innerHTML = `${icon('sprout')}<span>藤蔓植物</span>`; bar.querySelector('.branch-workspace-modes').append(vineButton);
  const section = document.createElement('section'); section.className = 'parameter-section generator-workspace branch-workbench'; section.id = 'branchWorkbenchPanel';
  section.innerHTML = `<h2>枝条工作台</h2><div class="wb-row wb-branch-only"><button id="newBranchDraft">${icon('file-plus-2')}新建单枝</button><button id="applyBranchBack">${icon('corner-up-left')}应用回原树</button></div>
    <div class="wb-branch-only"><div class="wb-tools">
    ${button('wbAxis', 'spline', '绘制主轴')}${button('wbSection', 'circle-dot', '调节截面')}${button('wbGrab', 'hand', '抓取雕刻')}${button('wbSmooth', 'waves', '平滑雕刻')}${button('wbSelect', 'mouse-pointer-2', '选择与曲线编辑')}
    </div><div class="wb-row"><label>绘制平面<select id="wbPlane"><option value="XZ">前视 XZ</option><option value="XY">俯视 XY</option><option value="YZ">侧视 YZ</option></select></label>${button('wbView', 'scan', '对齐到绘制平面')}</div>
    <div class="wb-section-controls" hidden><label>沿枝位置<input id="wbSectionT" type="range" min="0" max="1" step="0.01" value="0.45"></label><div class="wb-row">${numeric('wbDiameter', '局部直径（cm）', 4, 0.02, 100, 0.1)}${button('wbRadiusReset', 'rotate-ccw', '重置局部粗细')}</div></div>
    <details><summary>连接点与根部</summary><div class="wb-tools">${button('wbConnectorMove', 'move-3d', '移动连接点')}${button('wbConnectorRotate', 'rotate-3d', '旋转连接方向')}${button('wbConnectorReset', 'locate-fixed', '连接点归根')}</div><label class="wb-check"><input id="wbLockRoot" type="checkbox" checked>锁定根部</label><label>整支悬垂参考<select id="wbHangDirection"><option value="">未标定</option><option value="-Z">下方 −Z</option><option value="Z">上方 +Z</option><option value="X">前方 +X</option><option value="-X">后方 −X</option><option value="Y">左侧 +Y</option><option value="-Y">右侧 −Y</option><option value="CUSTOM" disabled>已标定自定义方向</option></select></label><p class="vine-note">选择完整模型希望朝下的一侧；视口箭头显示参考。树上「沿枝翻转」会整体滚转此模型。保存素材版本后，明确更新装配才使用新参考。</p></details>
    <details><summary>造型参考图</summary><div class="wb-row"><button id="wbReferenceLoad">${icon('image-plus')}导入参考图</button>${button('wbReferenceRemove', 'trash-2', '移除参考图')}</div><input id="wbReferenceFile" type="file" accept="image/png,image/jpeg,image/webp" hidden><label class="wb-check"><input id="wbReferenceVisible" type="checkbox" checked>显示参考图</label><label>透明度<input id="wbReferenceOpacity" type="range" min="0.05" max="1" step="0.05" value="0.45"></label><div class="field-grid">${numeric('wbReferenceSize', '高度（m）', 2, 0.1, 30, 0.1)}${numeric('wbReferenceX', 'X（m）', 0.7, -30, 30, 0.05)}${numeric('wbReferenceY', 'Y（m）', 0, -30, 30, 0.05)}${numeric('wbReferenceZ', 'Z（m）', 0.7, -30, 30, 0.05)}</div></details></div>
    <label class="wb-branch-only">素材名称<input id="wbAssetName" type="text" value="造型枝条" maxlength="80"></label><div class="wb-row wb-branch-only"><button id="wbSaveAsset">${icon('save')}保存素材</button><button id="wbSaveReturn">${icon('corner-up-left')}保存并返回整树</button><button id="wbSaveCopy">${icon('copy-plus')}另存新素材</button></div>
    <div class="wb-library-heading"><strong>枝条素材库</strong><div class="wb-tools">${button('wbImportAsset', 'upload', '导入枝条素材')}${button('wbExportAsset', 'download', '导出选中素材')}${button('wbDeleteAsset', 'trash-2', '删除素材')}</div></div><input id="wbAssetFile" type="file" accept=".json" hidden><input id="wbAssetSearch" type="search" placeholder="搜索枝条素材" aria-label="搜索枝条素材"><div id="wbAssetLibrary" class="wb-library"></div><div class="wb-row"><button id="wbEditAsset">${icon('pencil')}打开素材</button><button id="wbExportSampleGlb">${icon('box')}导出树枝样本 GLB</button></div><div class="wb-row"><button id="wbRenameAsset">${icon('text-cursor-input')}重命名</button></div>
    <div class="wb-tree-only wb-assembly"><div class="wb-library-heading"><strong>整树 · 三类枝条装配</strong><button id="wbAssemblyJumpCount" type="button">单元枝 <b id="wbAssemblyCurrent">0</b> · 调数量</button></div><p class="vine-note">拖动左侧素材卡到区间；每区可放多个样本，末尾会保留空槽。双击卡片编辑，保存后点更新才应用新版。</p><div id="wbAssemblyZones"></div><div class="wb-assembly-count"><label>目标单元枝数量<input id="wbAssemblyTarget" type="number" min="0" max="1600" step="1" value="0"></label><button id="wbApplyAssemblyCount" type="button">应用数量</button></div><p class="vine-note">数量控制增减整树上的单元枝实例；每张卡片仍是可编辑的枝条样本。增加数量受枝干预算限制。</p><button id="wbUpdateSamples" type="button">${icon('refresh-cw')}更新树枝样本</button></div>
    <div class="wb-tree-only"><details open><summary>安装枝条</summary><label>安装方式<select id="wbInstallMode"><option value="COPY">独立副本</option><option value="LINK">关联实例</option></select></label><label>挂接位置<input id="wbInstallT" type="range" min="0.02" max="0.98" step="0.01" value="0.65"></label><div class="field-grid">${numeric('wbInstallAngle', '分枝角（°）', 45, 0, 180, 1)}${numeric('wbInstallAzimuth', '绕枝角（°）', 0, -180, 180, 1)}${numeric('wbInstallRoll', '滚转（°）', 0, -180, 180, 1)}${numeric('wbInstallScale', '整体缩放', 1, 0.05, 5, 0.05)}${numeric('wbInstallVariation', '缩放变化', 0, 0, 0.8, 0.05)}${numeric('wbInstallSeed', '变化种子', 1, 1, 2147483646, 1)}</div><button id="wbInstall">${icon('git-pull-request-arrow')}安装到选中枝</button><label>已安装枝条<select id="wbInstances"><option value="">未选择实例</option></select></label><div class="wb-tools">${button('wbUnlink', 'unlink', '转为独立副本')}${button('wbRemoveInstance', 'trash-2', '删除安装实例')}</div></details></div>`;
  document.querySelector('[data-page="structure"]').prepend(section);
  bar.append($('applyBranchBack'));
  const skeletonEditNote = document.createElement('p'); skeletonEditNote.id = 'skeletonEditModeNote'; skeletonEditNote.className = 'vine-note'; skeletonEditNote.hidden = true;
  skeletonEditNote.textContent = '枝干编辑中：仅计算承重骨架，单元枝及叶花果暂不装配、更新。安装配置保留；返回整树预览时统一恢复。保存或导出会自动恢复完整装配。';
  const skeletonThickness = createSkeletonThicknessControls({...api,isTree:()=>mode==='TREE'},section);
  const trunkForm = createTrunkFormControls({...api,isTree:()=>mode==='TREE',isBusy:()=>busy,
    onTrunkWorkspaceOpened:()=>switchTrunkPreview(true),
    onTrunkWorkspaceFinished:()=>switchTrunkPreview(false)});
  // Enter the existing lightweight editor, preserving the complete unit models
  // and installation records. Only restore a pause that this workspace owns.
  async function switchTrunkPreview(entering) {
    if (entering && api.getSkeletonEditMode()) return;
    if (!entering && !trunkOwnsSkeletonMode) return;
    if (busy) return;
    const previousOwnership = trunkOwnsSkeletonMode;
    busy = true; bar.setAttribute('aria-busy', 'true'); refresh();
    try {
      await api.setSkeletonEditMode(entering);
      trunkOwnsSkeletonMode = entering;
    } catch (error) {
      trunkOwnsSkeletonMode = previousOwnership;
      if (entering) trunkForm.deactivate();
      api.toast(error.message, true);
    } finally { busy = false; bar.removeAttribute('aria-busy'); refresh(); }
  }
  section.prepend(skeletonEditNote);
  const quickControls = createBranchQuickControls({ ...api, isBranch: () => mode === 'BRANCH', isBusy: () => busy }, section);
  const candidateWorkspace = createBranchVariantWorkspace({ ...api, isBranch: () => mode === 'BRANCH' }, section);
  const plantUnits = createPlantUnitWorkspace({ ...api, isBranch: () => mode === 'BRANCH', startUnitDrag: (...args) => unitEditor.unitDrop.start(...args) }, section);
  const unitEditor = createUnitEditor({...api,isBranch:()=>mode==='BRANCH',isBusy:()=>busy},section);
  const unitRules = createUnitRulesUI({...api,isBranch:()=>mode==='BRANCH',isBusy:()=>busy},section);
  const assemblyGrowth = createAssemblyGrowthControls({...api,isTree:()=>mode==='TREE',canUse:()=>!busy&&!api.getSkeletonEditMode()});
  const localAssembly = createLocalAssemblyControls({...api,isTree:()=>mode==='TREE',isBusy:()=>busy,library:()=>library});
  const treeRecipes = createTreeRecipeWorkspace({isTree:()=>mode==='TREE',canUse:()=>!busy&&!localAssembly.active,getSettings:api.getSettings,flush:api.flush,capture:()=>api.capture({includeHistory:false}),thumbnail:api.thumbnailDocument,export:api.exportCandidateDocuments,toast:api.toast,
    async apply(doc){localAssembly.cancel();localAssembly.stop();library=normalizeBranchLibrary(doc.authoring.branch_library);syncParkedLibraries();await api.applyPlantAssets(doc);refresh();}});
  const prefabs=createBranchPrefabWorkspace({...api,isTree:()=>mode==='TREE',canUse:()=>api.canUsePrefab()&&!busy&&!localAssembly.active&&!installation.active&&!trunkForm.active&&!instances.active&&!stroke.active&&!influence.active&&!forms.active&&!arrays.active&&!deformation.active,
    async apply(inserted){const previous=library;library=normalizeBranchLibrary(inserted.document.authoring.branch_library);syncParkedLibraries();await api.applyBranchPrefab({...inserted,rollbackLibrary:()=>{library=previous;syncParkedLibraries();}});refresh();}});
  $('unitEditorPanel').after($('unitRulesPanel'));
  const sectionControls = section.querySelector('.wb-section-controls'); let context = null;
  const tools = createWorkbenchTools({ ...api, isBranch: () => mode === 'BRANCH', onDiameter: (value) => { if (document.activeElement !== $('wbDiameter')) $('wbDiameter').value = value.toFixed(2); },
    onSection: (t) => { $('wbSectionT').value = t; context?.refresh(); },
    onTool: (tool) => { [['wbAxis', 'AXIS'], ['wbSection', 'SECTION'], ['wbConnectorMove', 'CONNECT_MOVE'], ['wbConnectorRotate', 'CONNECT_ROTATE']].forEach(([id, name]) => $(id).classList.toggle('active', name === tool)); sectionControls.hidden = tool !== 'SECTION'; context?.setMode(tool); } });
  context = createShapingContext(api, tools, sectionControls);
  const deformation = createBranchDeformation(api, context);
  const forms = createBranchFormTools(api, context, deformation);
  const arrays = createBranchArrayEditor({ ...api, library: () => library, selectedAsset: assetById, ensureAssets:ensureGroupAssets }, context);
  const groupControls=createAssemblyGroupControls({...api,isTree:()=>mode==='TREE',isBusy:()=>busy,library:()=>library,selectedAsset:assetById,ensureAssets:ensureGroupAssets,openAdvanced:id=>arrays.open?.(id)});
  const stroke = createBranchStroke(api, context);
  const influence = createBranchInfluence(api, context);
  const instances = createBranchInstanceEditor({ ...api, isTree:()=>mode==='TREE', editSource:editUnitSource }, context);
  const sourceWorkflow = createUnitSourceWorkflow({ getMode:()=>mode, selectionOwners:()=>instances.selectionOwners(), editSource:editUnitSource, toast:api.toast });
  const symmetry = createBranchSymmetryEditor(api, context);
  const versions = createAssetVersions({ ...api, library: () => library, selectedAsset: assetById,
    selectedInstance: () => api.getAuthoring().branch_instances.find((i) => api.getSelection()?.startsWith(i.id + '.')),
    allInstances: () => ['TREE', 'BRANCH', 'VINE'].flatMap((key) => (key === mode ? api.getAuthoring().branch_instances : parked[key]?.authoring.branch_instances || []).map((i) => ({ ...i, workspace: key === 'TREE' ? '整树' : '工作台' }))), restoreVersion });
  const views = createBranchMultiview({ ...api, busy: () => busy || deformation.active || forms.active || arrays.active || stroke.active || influence.active || instances.dragging, isEditable: (id) => instances.isEditable(id), reference: () => tools.reference });
  const installOptions = document.createElement('div'); installOptions.className = 'wb-install-options';
  const assemblyScaleControls = document.createElement('div'); assemblyScaleControls.className = 'wb-assembly-scale';
  assemblyScaleControls.innerHTML = `${numeric('wbAssemblyScale', '全部单元枝倍率', 1, 0.1, 10, 'any')}<small>完整单元枝连同叶花果一起缩放，数量不变。整体 × 样本倍率；1 保持基准尺寸。输入后按回车或离开输入框应用。</small><small id="wbThicknessStatus"></small><button id="wbRestoreSampleThickness" type="button">全部恢复样本粗细</button>`;
  $('wbAssemblyZones').before(assemblyScaleControls);
  $('wbAssemblyScale').required = true;
  $('wbAssemblyScale').onchange = run(async () => { const input = $('wbAssemblyScale'); if (input.reportValidity()) await setAssemblyScale({ overall: input.valueAsNumber }); });
  $('wbAssemblyScale').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } };
  $('wbRestoreSampleThickness').onclick = run(() => resetSampleThickness());
  $('wbInstallScale').min = INSTANCE_SCALE_MIN; $('wbInstallScale').max = INSTANCE_SCALE_MAX; $('wbInstallScale').step = 'any';
  $('wbInstallMode').options[0].textContent='冻结当前素材版本';$('wbInstallMode').options[1].textContent='使用最新素材版本';
  $('wbUnlink').title='手工保留并冻结当前完整素材版本';
  installOptions.innerHTML = `<label class="wb-check"><input id="wbAutoMatch" type="checkbox">自动匹配安装粗度</label><label class="wb-check"><input id="wbInstallBlend" type="checkbox">自然连接过渡</label><button id="wbPreviewInstall">${icon('scan-eye')}预览安装</button>`;
  $('wbInstall').before(installOptions);
  const installation = createBranchInstallation({ ...api, isTree: () => mode === 'TREE' && !api.getSkeletonEditMode(), values: () => ({ ...installValues(), junction: $('wbInstallBlend').checked ? normalizeJunction({}) : null }),
    linked: () => true, pinnedRevision:item=>$('wbInstallMode').value==='LINK'?0:item.revision, ensureAssets:ensureGroupAssets, matchRadius: () => $('wbAutoMatch').checked, assetById: (id) => library.find((a) => a.id === id),
    clearInstanceSelection: () => { selectedInstance = ''; }, installed: (id) => { selectedInstance = id; refresh(); }, setAttach: (value) => { $('wbInstallT').value = value; } });
  const unitBrushes=createUnitBrushTools({...api,isTree:()=>mode==='TREE',isBusy:()=>busy,selectedAsset:assetById,
    unitMode:()=>api.getTreeEditMode()==='UNIT'?Promise.resolve():api.requestUnitMode(),toastStatus:api.status,async ensureSource(id){if(busy)throw Error('工作区正在更新，请稍后再刷生成');busy=true;try{await ensureManagedAsset(id,true);await ensureGroupAssets([id]);await api.flush();}finally{busy=false;refresh();}}},context);
  const assemblyLinks = createUnitAssemblyUI({ ...api, isTree:()=>mode==='TREE', isBusy:()=>busy, library:()=>library,
    async editSource(assetId, role, instanceId) { const instance=api.getAuthoring().branch_instances.find(i=>instanceId?i.id===instanceId:i.asset_id===assetId&&(role==='EXTRA'?!i.linked||!['MATURE','MIXED','YOUNG'].includes(i.shootRole):i.shootRole===role)); if(instance)await editUnitSource(instance);else await openAsset(library.find(item=>item.id===assetId)); } });
  const hangDirections={X:[1,0,0],'-X':[-1,0,0],Y:[0,1,0],'-Y':[0,-1,0],Z:[0,0,1],'-Z':[0,0,-1]};
  $('wbHangDirection').onchange=()=>{if(mode!=='BRANCH'||busy||$('wbHangDirection').value==='CUSTOM')return;const value=hangDirections[$('wbHangDirection').value];api.transact('标定完整单元枝悬垂方向',a=>{if(!a.branch_shape?.connector)return;if(value)a.branch_shape.connector.hang_direction=[...value];else delete a.branch_shape.connector.hang_direction;},{bypassLayers:true});};
  const toolbar = document.createElement('div'); toolbar.className = 'shaping-viewport-tools';
  toolbar.innerHTML = `${button('openSectionContext', 'circle-dot', '连续截面')}${button('openJunctionContext', 'git-merge', '连接塑形')}`;
  document.querySelector('.viewport-tool-rail').append(toolbar);
  function run(action) { return async () => { if (busy) return; busy = true; bar.setAttribute('aria-busy', 'true'); try { await ready; await action(); } catch (error) { api.toast(error.message, true); } finally { busy = false; bar.removeAttribute('aria-busy'); refresh(); } }; }
  const bind = (id, action) => $(id).addEventListener('click', run(action));
  bind('skeletonEditModeBtn', async () => {
    skeletonEditButton.disabled = true;
    trunkForm.deactivate(); trunkOwnsSkeletonMode = false;
    tools.activate(''); context.cancel(); views.cancel(); instances.deactivate();
    await api.setSkeletonEditMode(!api.getSkeletonEditMode());
    document.querySelector('[data-tab="structure"]').click();
  });
  const speciesPanel=document.createElement('details');speciesPanel.id='treeSpeciesLibrary';
  speciesPanel.innerHTML=`<summary>植物 · 形态与素材库</summary><p class="vine-note">以下为新建参数。新建会替换工作台草稿，请先保存已有草稿。</p>
    <div class="field-grid"><label>植物<select id="treeSpeciesKind">${[['TREE','乔木'],['SHRUB','灌木'],['POTTED','观叶植物']].map(([category,label])=>`<optgroup label="${label}">${Object.entries(TREE_SPECIES).filter(([id])=>!DISTRIBUTION.treeSpecies||DISTRIBUTION.treeSpecies.includes(id)).filter(([,v])=>(v.category||'TREE')===category).sort((a,b)=>a[1].folder.localeCompare(b[1].folder)).map(([k,v])=>`<option value="${k}">${v.name}${v.pending?' · 待单元':''}</option>`).join('')}</optgroup>`).join('')}</select></label><label>新建形态<select id="treeSpeciesStyle">${Object.entries(TREE_BRANCH_STYLES).map(([k,v])=>`<option value="${k}" ${k==='SIDE'?'selected':''}>${v}</option>`).join('')}</select></label>${numeric('treeSpeciesSeed','随机种子',12037,1,2147483646,1)}</div>
    <p id="treeSpeciesNote" class="vine-note"></p>
    <div id="treeSpeciesFormControls" hidden><p class="vine-note">新建尺寸（米），点击新建后生效。株距为目标值，随总长度适配；长篱最多 12 株。</p><div class="field-grid">${numeric('treeSpeciesFormHeight','高度',.8,.3,3,.05)}${numeric('treeSpeciesFormWidth','宽度',.9,.25,3,.05)}<span id="treeSpeciesHedgeLength">${numeric('treeSpeciesFormLength','绿篱长度',3,.5,10,.1)}</span><span id="treeSpeciesHedgeSpacing">${numeric('treeSpeciesFormSpacing','株距',.6,.2,1.5,.05)}</span></div></div>
    <div id="treeSpeciesFoliageControls" hidden><p class="vine-note">新建复叶：单片小叶会沿连续叶轴组成一个完整单元。</p><div class="field-grid">${numeric('treeSpeciesFoliagePairs','小叶对数',5,2,9,1)}${numeric('treeSpeciesFoliageSpread','展开角（°）',55,20,85,1)}<label class="wb-check"><input id="treeSpeciesFoliageTerminal" type="checkbox" checked>保留顶生小叶（奇数羽状）</label></div></div>
    <button id="treeSpeciesCreate">新建该植物</button><button id="treeSpeciesReplace">当前枝条换成品素材</button>
    <div id="treeCurrentFoliageControls" hidden><p class="vine-note">当前工程 · 复叶微调，修改后立即生效，可撤销。</p><div class="field-grid">${numeric('treeCurrentFoliagePairs','小叶对数',5,2,9,1)}${numeric('treeCurrentFoliageSpread','展开角（°）',55,20,85,1)}<label class="wb-check"><input id="treeCurrentFoliageTerminal" type="checkbox" checked>保留顶生小叶</label></div></div>
    <div id="treeOrganControls" hidden><p id="treeOrganLabel" class="vine-note"></p><div class="field-grid"><label>花果状态<select id="treeOrganMode">${Object.entries(TREE_ORGAN_MODES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>${numeric('treeOrganAmount','花果密度',.65,0,1,.05)}${numeric('treeOrganScale','花果大小倍率',1,.1,4,.1)}</div></div><a id="treeSpeciesReference" target="_blank" rel="noopener">查看叶片与配套单元参考图</a>`;
  section.querySelector('.wb-library-heading').before(speciesPanel);
  const growthInfo=document.createElement('details');growthInfo.id='treeSpeciesGrowthInfo';
  growthInfo.innerHTML='<summary>该植物的枝型特点</summary><p id="treeSpeciesGrowthNote" class="vine-note"></p><button id="treeSpeciesSkeletonView" type="button">查看当前枝干骨架</button><p><a href="/assets/references/植物枝型预设V3/00_枝型目录.html" target="_blank" rel="noopener">对比全部 48 类枝型</a></p>';
  speciesPanel.append(growthInfo);
  $('treeSpeciesSkeletonView').onclick=()=>document.querySelector('[data-view="SKELETON"]').click();
  const formHint=document.createElement('p');formHint.id='treeSpeciesFormHint';formHint.className='vine-note';
  $('treeSpeciesFormControls').prepend(formHint);
  function formInfo(){
    const ball=$('treeSpeciesStyle').value==='BALL';
    const height=Number($('treeSpeciesFormHeight').value),width=Number($('treeSpeciesFormWidth').value);
    formHint.textContent=ball?`高度是株高，宽度是冠幅；只改高度会变成椭球。想整体放大，请同时增大高度和宽度。${height>width*1.5?' 当前为明显的竖长椭球。':''}`:'高度控制篱高，宽度控制篱厚；长度与株距决定连续排列。';
  }
  $('treeSpeciesFormHeight').addEventListener('input',formInfo);
  $('treeSpeciesFormWidth').addEventListener('input',formInfo);
  function speciesStyleInfo(){
    const style=$('treeSpeciesStyle').value;
    const spec=TREE_SPECIES[$('treeSpeciesKind').value];
    $('treeSpeciesGrowthNote').textContent=(spec.growth?.summary||'')+(['BALL','HEDGE'].includes(style)?' 当前选择人工修剪形态，外轮廓由高度和冠幅控制。':' 主枝、侧枝与细梢分别生成；叶片素材可后续替换。');
    $('treeSpeciesFormControls').hidden=!['BALL','HEDGE'].includes(style);
    $('treeSpeciesHedgeLength').hidden=style!=='HEDGE';
    $('treeSpeciesHedgeSpacing').hidden=style!=='HEDGE';
    formInfo();
  }
  function speciesInfo(){
    const s=TREE_SPECIES[$('treeSpeciesKind').value],style=$('treeSpeciesStyle').value,styles=treeSpeciesStyles(s);
    $('treeSpeciesStyle').innerHTML=Object.entries(styles).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
    $('treeSpeciesStyle').value=Object.hasOwn(styles,style)?style:Object.hasOwn(styles,'SIDE')?'SIDE':Object.keys(styles)[0];
    $('treeSpeciesNote').textContent=s.pending?`${s.note||''} 待真实单元：可先新建结构预览，叶片、复叶或针簇为程序几何示意。`:(s.note||'');
    $('treeSpeciesCreate').textContent=s.pending?'新建结构预览':'新建该植物';
    $('treeSpeciesReplace').textContent=`替换为「${s.name}」成品素材`;
    $('treeSpeciesReplace').title='使用“创建”中选择的植物，保留当前枝干造型';
    $('treeSpeciesReference').href=s.batch===3?`/assets/references/道路植物第三批_12类/${s.folder}_综合单元.png`:(s.batch===2||s.organMode)?`/assets/references/植物综合第二批_30类/${s.folder}_综合单元.png`:`/assets/references/中国树种第一批/${s.folder}/${s.folder}_叶片单元.png`;
    const foliage=normalizeFoliageUnit(s.foliageUnit);
    $('treeSpeciesFoliageControls').hidden=foliage.mode!=='PINNATE';
    $('treeSpeciesFoliagePairs').value=foliage.pairs;$('treeSpeciesFoliageSpread').value=foliage.spread;$('treeSpeciesFoliageTerminal').checked=foliage.terminal;
    speciesStyleInfo();
  }
  $('treeSpeciesStyle').onchange=speciesStyleInfo;
  $('treeSpeciesKind').onchange=speciesInfo;speciesInfo();
  bind('treeSpeciesCreate',async()=>{
    const id=$('treeSpeciesKind').value,spec=TREE_SPECIES[id],style=$('treeSpeciesStyle').value;
    const controls=['treeSpeciesSeed',...(['BALL','HEDGE'].includes(style)?['treeSpeciesFormHeight','treeSpeciesFormWidth']:[]),...(style==='HEDGE'?['treeSpeciesFormLength','treeSpeciesFormSpacing']:[]),...(!$('treeSpeciesFoliageControls').hidden?['treeSpeciesFoliagePairs','treeSpeciesFoliageSpread']:[])];
    for(const control of controls)if(!$(control).value||!$(control).checkValidity()){ $(control).reportValidity();throw new Error('请填写有效的新建参数'); }
    const options={};
    if(['BALL','HEDGE'].includes(style))options.plant_form={style,height:Number($('treeSpeciesFormHeight').value),width:Number($('treeSpeciesFormWidth').value),length:Number($('treeSpeciesFormLength').value),spacing:Number($('treeSpeciesFormSpacing').value),roughness:.1};
    if(normalizeFoliageUnit(spec.foliageUnit).mode==='PINNATE')options.foliage_unit={...normalizeFoliageUnit(spec.foliageUnit),pairs:Number($('treeSpeciesFoliagePairs').value),spread:Number($('treeSpeciesFoliageSpread').value),terminal:$('treeSpeciesFoliageTerminal').checked};
    const doc=createTreeSpeciesDocument(id,style,$('treeSpeciesSeed').value,options);
    if(spec.pending){await switchMode('BRANCH',doc);api.toast('已新建结构预览；真实叶片与配套单元待导入，当前为程序几何示意');return;}
    const owner=api.getAuthoring(),pack=await loadTreeSpeciesAssets(id);
    if(api.getAuthoring()!==owner) throw new Error('工程已切换，请重新新建树种枝条');
    await switchMode('BRANCH',withTreeSpeciesAssets(doc,pack));api.toast(`已创建单元枝条，${pack.leaf_meshes.length} 种真实叶片自动混合使用${pack.organ_meshes?.length?'，花果已接入':''}`);
  });
  bind('treeSpeciesReplace',async()=>{
    const owner=api.getAuthoring(),id=owner.recipe.tags.find(t=>TREE_SPECIES[t]);
    if(mode!=='BRANCH'||!owner.recipe.tags.includes('CN_TREE_STARTER')||!id) throw new Error('请先打开中国树种枝条工程');
    if(TREE_SPECIES[id].pending)throw new Error('参考图已备好，等待该植物单元模型接入；当前可继续编辑结构预览');
    const pack=await loadTreeSpeciesAssets(id);
    if(api.getAuthoring()!==owner) throw new Error('工程已切换，请重新替换叶片');
    await api.flush();await api.applyPlantAssets(withTreeSpeciesAssets(api.capture(),pack));
    api.toast('已替换当前树种的成品素材，枝条造型已保留；可撤销');
  });
  for(const [control,key] of [['treeCurrentFoliagePairs','pairs'],['treeCurrentFoliageSpread','spread'],['treeCurrentFoliageTerminal','terminal']]){
    $(control).onchange=()=>{
      if(mode!=='BRANCH'){refresh();return;}
      const input=$(control);if(input.type!=='checkbox'&&(!input.value||!input.checkValidity())){input.reportValidity();return;}
      api.transact('调整当前复叶单元',a=>{
        if(a.foliage_unit?.mode==='PINNATE')a.foliage_unit=normalizeFoliageUnit({...a.foliage_unit,[key]:key==='terminal'?input.checked:Number(input.value)});
      },{bypassLayers:true});
    };
  }
  for(const [control,key] of [['treeOrganMode','mode'],['treeOrganAmount','amount'],['treeOrganScale','scale']]){
    $(control).onchange=()=>{if(mode!=='BRANCH'){refresh();return;}api.transact('调整树种花果',a=>{
      if(a.tree_organs?.units.length)a.tree_organs[key]=key==='mode'?$(control).value:Number($(control).value);
    },{bypassLayers:true});};
  }
  function assetById() { return library.find((item) => item.id === selectedAsset); }
  function syncParkedLibraries() {
    for (const key of ['TREE', 'BRANCH', 'VINE']) if (parked[key]) parked[key].authoring.branch_library = copy(library);
  }
  function publishLibraries() {
    syncParkedLibraries();
    api.setLibrary(library);
  }
  function blank(shape = blankBranchShape(), name = '造型枝条', metadata = {}, liftToGround = true) {
    shape = copy(shape);
    const floor = Math.min(...shape.branches.flatMap((b) => b.points.map((p) => p[2] - b.start_radius * 2)));
    const lift = liftToGround ? Math.max(0, 0.35 - floor) : 0;
    shape.branches.forEach((b) => [...b.points, ...b.knots].forEach((p) => { p[2] += lift; }));
    shape.connector.position[2] += lift;
    return { settings: { ...DEFAULT_SETTINGS, object_name: name, architecture: 'HORIZONTAL', length: 1.4, child_count: 0, branch_levels: 4, leaf_density: 0, wind_strength: 0, preview_lod: 0 },
      authoring: normalizeAuthoring({ branch_shape: shape, branch_library: library, workbench: metadata }), leaf_meshes: [], history: [], future: [], selection: [shape.branches[0].id], protectTrunk: false };
  }
  function treeDocument() { return mode === 'TREE' ? api.capture() : parked.TREE; }
  function materialForSample(sample, treeOverride = null) {
    return sample?.authoring?.leaf_material || library.find((item) => item.id === sample?.material_asset_id)?.sample?.authoring?.leaf_material
      || treeOverride?.authoring?.leaf_material || (mode === 'TREE' ? api.getAuthoring().leaf_material : parked.TREE?.authoring?.leaf_material);
  }
  function portableAsset(item) {
    const result=copy(item);
    for(const entry of [result,...(result.versions||[])]) if(entry.sample){
      entry.sample.authoring ||= {};
      if(!entry.sample.authoring.leaf_material)entry.sample.authoring.leaf_material=copy(materialForSample(entry.sample)||api.getAuthoring().leaf_material);
      entry.sample.material_asset_id='';
    }
    return result;
  }
  function sampleFromDocument(doc, leafIds = null) {
    const { branch_library, branch_instances, workbench, ...sampleAuthoring } = doc.authoring;
    const authoring = copy(sampleAuthoring);
    const completePrivate = workbench?.source?.instance_id || authoring.recipe?.tags?.includes('FROZEN_COMPLETE_SAMPLE');
    const sharedMaterial = treeDocument()?.authoring?.leaf_material;
    let material_asset_id = '';
    const sameMaterial = material => material && authoring.leaf_material && Object.keys(material).length === Object.keys(authoring.leaf_material).length && Object.keys(material).every(key => material[key] === authoring.leaf_material[key]);
    // A complete local sample is self-contained, including its BASE material
    // references. Ordinary library samples retain the existing sharing rules.
    if (!completePrivate && sameMaterial(sharedMaterial)) delete authoring.leaf_material;
    else if (!completePrivate) {
      const sharedAsset = authoring.leaf_material?.color && library.find((item) => item.id !== workbench?.asset_id && sameMaterial(item.sample?.authoring?.leaf_material));
      if (sharedAsset) { delete authoring.leaf_material; material_asset_id = sharedAsset.id; }
    }
    const selected = leafIds?.length ? new Set(leafIds) : null;
    const origins=packageOrigins([...(workbench?.package_origins||[]),...collectPackageOrigins(authoring)]);
    return { settings: copy(doc.settings), authoring, material_asset_id, leaf_meshes: copy((doc.leaf_meshes || []).filter((source) => !selected || selected.has(source.id))),...(origins.length?{package_origins:origins}:{}) };
  }
  function documentForAsset(item, treeOverride = null) {
    const tree = treeOverride || (mode === 'TREE' ? {
      settings: api.getSettings(), authoring: api.getAuthoring(),
      leaf_meshes: item.sample?.leaf_meshes?.length || !item.leaf_source_ids?.length ? [] : api.capture().leaf_meshes,
    } : parked.TREE);
    const doc = blank(copy(item.shape), item.name, { asset_id: item.id, name: item.name }, false);
    const sample = item.sample || recoverLegacyBranchAsset(item, tree).sample;
    const sources = sample?.leaf_meshes?.length ? sample.leaf_meshes : (tree?.leaf_meshes || []).filter((source) => item.leaf_source_ids.includes(source.id));
    const sourceAuthoring = sample?.authoring || {};
    const treeOrgans = tree?.authoring?.tree_organs;
    const organs = sourceAuthoring.tree_organs ? { ...sourceAuthoring.tree_organs,
      units: sourceAuthoring.tree_organs.units?.length ? sourceAuthoring.tree_organs.units : (treeOrgans?.units || []).filter((unit) => item.organ_source_ids.includes(unit.id)) }
      : (treeOrgans ? { ...treeOrgans, units: treeOrgans.units.filter((unit) => item.organ_source_ids.includes(unit.id)) } : null);
    doc.settings = { ...doc.settings, ...(sample?.settings || {}), object_name: item.name, child_count: 0, branch_levels: 4, preview_lod: 0 };
    doc.authoring = normalizeAuthoring({ ...sourceAuthoring, branch_shape: doc.authoring.branch_shape, branch_library: library,
      leaf_material: materialForSample(sample, tree) || tree?.authoring?.leaf_material,
      tree_organs: organs || sourceAuthoring.tree_organs,
      workbench: { asset_id: item.id, name: item.name,...(collectPackageOrigins(sample).length||tree?.authoring?.workbench?.package_origins?.length?{package_origins:packageOrigins([...collectPackageOrigins(sample),...(tree?.authoring?.workbench?.package_origins||[])])}:{}) } });
    doc.leaf_meshes = copy(sources);
    return doc;
  }
  // Persist both renderer and sample revisions so old project images can be
  // regenerated once, including after material/flower rendering fixes.
  const thumbnailRenderVersion = 'sample-leaf-organ-v2';
  const staleThumbnail = item => item.sample && (!item.thumbnail || item.thumbnail_render_version !== thumbnailRenderVersion || item.thumbnail_revision !== item.revision);
  async function sampleThumbnail(item, treeOverride = null, strict = false) {
    try {
      const preview = await api.thumbnailDocument(documentForAsset(item, treeOverride));
      if (preview.image) {
        const image = new Image(); image.src = preview.image; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 144;
        const source = document.createElement('canvas'); source.width = image.naturalWidth; source.height = image.naturalHeight;
        const sourceContext = source.getContext('2d'); sourceContext.drawImage(image, 0, 0);
        const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
        const background = [pixels[0], pixels[1], pixels[2]];
        let left = source.width, top = source.height, right = -1, bottom = -1;
        for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
          const offset = (y * source.width + x) * 4;
          const contrast = Math.abs(pixels[offset] - background[0]) + Math.abs(pixels[offset + 1] - background[1]) + Math.abs(pixels[offset + 2] - background[2]);
          if (pixels[offset + 3] > 16 && contrast > 25) {
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
          }
        }
        const context = canvas.getContext('2d');
        context.fillStyle = `rgb(${background.join(',')})`; context.fillRect(0, 0, canvas.width, canvas.height);
        if (right >= left && bottom >= top) {
          const width = right - left + 1, height = bottom - top + 1;
          const scale = Math.min((canvas.width - 18) / width, (canvas.height - 18) / height);
          context.drawImage(image, left, top, width, height,
            (canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2, width * scale, height * scale);
        } else context.drawImage(image, 0, 0, canvas.width, canvas.height);
        item.thumbnail_render_version = thumbnailRenderVersion;
        item.thumbnail_revision = item.revision;
        return canvas.toDataURL('image/jpeg', 0.82);
      }
    } catch (error) { if(strict)throw error;console.warn('样本预览失败，暂时保留原缩略图', error); }
    if(strict)throw Error('没有生成有效预览图，请重试');
    return item.thumbnail || api.thumbnailShape(item.shape);
  }
  function currentSlots() {
    const a = api.getAuthoring(), stored = a.workbench?.assembly_slots;
    const installed=inferAssemblySlots(a.branch_instances,library);
    if(!stored)return installed;
    const slots=normalizeAssemblySlots(stored,library);
    for(const role of Object.keys(slots))for(const assetId of installed[role])if(!slots[role].includes(assetId))slots[role].push(assetId);
    return slots;
  }
  function syncAssemblyScale(a, patch = {}) {
    const branches = api.getAsset().masterBranches;
    const blockedIds=buildUnitAssemblySelection({instances:a.branch_instances,branches,library,
      arrays:a.branch_arrays,selection:[],isUnitMode:true}).blockedIds;
    const edited = new Set([
      ...Object.entries(a.overrides || {}).filter(([,value]) => value.curve_knots?.length || value.frozen_points?.length).map(([id]) => id),
      ...a.sculpt_layers.flatMap(layer => [...Object.keys(layer.branches), ...(layer.operation?.targets || [])]),
    ].map(id => id.split('.')[0]));
    applyAssemblyScale(a, patch, (before, after) => {
      if (edited.has(before.id)) reframeInstanceEdits(a, before, after, resolveInstanceShape(before, library), branches, api.getSettings());
    },{blockedIds});
  }
  async function setAssemblyScale(patch) {
    if (mode !== 'TREE') return;
    await api.flush();
    api.transact('调整装配单元枝倍率', a => syncAssemblyScale(a, patch), { bypassLayers: true });
    await api.flush(); refresh();
  }
  async function ensureGroupAssets(ids) {
    await api.flush();const doc=api.capture(),leaves=new Map((doc.leaf_meshes||[]).map(s=>[s.id,s])),organs=new Map(doc.authoring.tree_organs.units.map(u=>[u.id,u]));
    let changed=false;
    for(const id of ids){const sample=library.find(a=>a.id===id)?.sample;if(!sample)continue;
      const imported=importSampleMaterials(doc.authoring,sample);changed||=imported.changed;
      for(const s of sample.leaf_meshes||[])if(!leaves.has(s.id)){leaves.set(s.id,copy(remapSampleMaterial(s,imported.references)));changed=true;}
      for(const u of sample.authoring?.tree_organs?.units||[])if(!organs.has(u.id)){organs.set(u.id,copy(remapSampleMaterial(u,imported.references)));changed=true;}
    }
    if(changed){doc.leaf_meshes=[...leaves.values()];doc.authoring.tree_organs.units=[...organs.values()];await api.restore(doc);}
  }
  async function resetSampleThickness(assetId = null) {
    if (mode !== 'TREE') return;
    await api.flush();
    const count = sampleThicknessAdjustments(api.getAuthoring(), assetId).length;
    if (!count) return;
    api.transact('恢复成品样本粗细', a => restoreSampleThickness(a, assetId), { bypassLayers: true });
    await api.flush(); refresh();
    api.toast(`已恢复 ${count} 根单元枝的样本粗细；整体尺寸、叶花果和局部编辑保留，可撤销`);
  }
  function revealAssembly() {
    if (mode !== 'TREE') return;
    document.querySelector('[data-tab="assembly"]')?.click();
    const toggle = section.querySelector('.parameter-group-toggle');
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
    requestAnimationFrame(() => { section.scrollIntoView({ block: 'start' }); $('treeAssemblyOverview')?.scrollIntoView({ block: 'start' }); });
  }
  async function updateAssembly(slots, roles = ASSEMBLY_ZONES.map((zone) => zone.role), refreshLinked = false, onlyAsset = null) {
    if (mode !== 'TREE') return;
    await api.flush();
    if (refreshLinked) {
      const used = new Set(onlyAsset?[onlyAsset]:Object.values(slots).flat());
      for (const item of library) if (used.has(item.id) && item.sample)
        item.thumbnail = await sampleThumbnail(item);
      syncParkedLibraries();
    }
    const doc = api.capture();
    doc.authoring.branch_library = copy(library);
    const previousIds = new Set(doc.authoring.branch_instances.map(i => i.id));
    const previousAutomatic = new Set(doc.authoring.branch_instances.filter(i => isAutomaticPlacement(doc.authoring, i)).map(i => i.id));
    doc.authoring.workbench = { ...doc.authoring.workbench, assembly_slots: normalizeAssemblySlots(slots, library) };
    if (!doc.authoring.branch_instances.length && Object.values(doc.authoring.workbench.assembly_slots).some((zone) => zone.length)) {
      const first = library.find((item) => Object.values(doc.authoring.workbench.assembly_slots).some((zone) => zone.includes(item.id)));
      const remaining = Math.max(0, 11000 - api.getAsset().masterBranches.length);
      const limit = Math.min(120, Math.floor(remaining / Math.max(1, first?.shape.branches.length || 1)));
      doc.authoring.branch_instances = seedAssemblyInstances(api.getAsset().masterBranches, doc.authoring.workbench.assembly_slots, library, limit);
      if (!doc.authoring.branch_instances.length) throw new Error('当前树形没有可用的单元枝挂接点，请先生成主枝结构');
    }
    // Updating linked versions is not a new distribution operation. In
    // particular, preserve authored ratios and independent instance choices.
    if (!refreshLinked) {
      doc.authoring.branch_instances = assignAssemblyInstances(doc.authoring.branch_instances, doc.authoring.workbench.assembly_slots, library, roles, doc.authoring);
      recordGeneratedPlacements(doc.authoring, doc.authoring.branch_instances.filter(i => !previousIds.has(i.id) || previousAutomatic.has(i.id)).map(i => i.id));
      applyGrowthRules(doc.authoring, api.getAsset().masterBranches);
    }
    const protection = assemblyProtection(doc.authoring);
    for(const instance of doc.authoring.branch_instances)if(protection.get(instance.id)&&instance.linked&&doc.authoring.workbench.assembly_slots[instance.shootRole]&&!doc.authoring.workbench.assembly_slots[instance.shootRole].includes(instance.asset_id))doc.authoring.workbench.assembly_slots[instance.shootRole].push(instance.asset_id);
    if (refreshLinked) for (const instance of doc.authoring.branch_instances) {
      const item = library.find((asset) => asset.id === instance.asset_id);
      if (instance.linked && item && !protection.get(instance.id) && (!onlyAsset || instance.asset_id===onlyAsset&&roles.includes(instance.shootRole))) instance.pinned_revision = item.revision;
    }
    if (doc.authoring.workbench.assembly_scale) syncAssemblyScale(doc.authoring);
    const leaves = new Map((doc.leaf_meshes || []).map((source) => [source.id, source]));
    const organs = new Map((doc.authoring.tree_organs?.units || []).map((unit) => [unit.id, unit]));
    for (const assetId of Object.values(doc.authoring.workbench.assembly_slots).flat()) {
      const sample = library.find((item) => item.id === assetId)?.sample;
      if (!sample) continue;
      const imported=importSampleMaterials(doc.authoring,sample);
      for (const source of sample.leaf_meshes || []) leaves.set(source.id, copy(remapSampleMaterial(source,imported.references)));
      for (const unit of sample.authoring?.tree_organs?.units || []) organs.set(unit.id, copy(remapSampleMaterial(unit,imported.references)));
      // Each complete sample retains its own atlas. Never replace the tree palette
      // when adding a sample from another plant.
    }
    doc.leaf_meshes = [...leaves.values()];
    if (doc.authoring.tree_organs) doc.authoring.tree_organs.units = [...organs.values()];
    await api.applyPlantAssets(doc);
    api.toast(refreshLinked ? '树枝样本与缩略图已更新' : '三类样本枝已应用到整树实例');
  }
  async function setAssemblyCount(target) {
    if (mode !== 'TREE') return;
    await api.flush();
    const slots = currentSlots(), doc = api.capture(), branchCount = api.getAsset().masterBranches.length;
    const previousIds = new Set(doc.authoring.branch_instances.map(i => i.id));
    const tags = doc.authoring.recipe?.tags || [];
    const branchLimit = tags.includes('DENSE_AUTHORED_SAMPLE_ASSEMBLY') ? 11000
      : tags.includes('DENSE_AUTHORED_CROWN') ? 3200 : 2200;
    doc.authoring.workbench = { ...doc.authoring.workbench, assembly_slots: normalizeAssemblySlots(slots, library) };
    doc.authoring.branch_instances = resizeAssemblyInstances(doc.authoring.branch_instances, slots, library,
      target, api.getAsset().masterBranches, branchLimit, branchCount, doc.authoring);
    recordGeneratedPlacements(doc.authoring, doc.authoring.branch_instances.filter(i => !previousIds.has(i.id)).map(i => i.id));
    redistributeAssembly(doc.authoring, api.getAsset().masterBranches, slots);
    applyGrowthRules(doc.authoring, api.getAsset().masterBranches);
    if (doc.authoring.workbench.assembly_scale) syncAssemblyScale(doc.authoring);
    await api.applyPlantAssets(doc);
    api.toast(`整树单元枝已调整为 ${countAssemblyInstances(doc.authoring.branch_instances, slots)} 个`);
  }
  function assemblyRoots(assetId,role) {
    const instances=api.getAuthoring().branch_instances.filter(i=>i.linked&&i.asset_id===assetId&&i.shootRole===role);
    const branches=api.getAsset().masterBranches,byId=new Map(branches.map(b=>[b.id,b]));
    return instances.flatMap(i=>branches.filter(b=>b.stableId.startsWith(i.id+'.')&&!byId.get(b.parentId)?.stableId.startsWith(i.id+'.')).map(b=>b.stableId));
  }
  async function replaceAssembly(assetId,role,nextId=selectedAsset) {
    if(!nextId || nextId===assetId || !library.some(a=>a.id===nextId))throw Error('先在左侧选择一款不同的单元枝，再点击替换');
    await api.flush();const doc=api.capture(),next=library.find(a=>a.id===nextId);
    const protection=assemblyProtection(doc.authoring),changed=[];
    for(const i of doc.authoring.branch_instances)if(i.linked&&i.asset_id===assetId&&i.shootRole===role&&!protection.get(i.id)){i.asset_id=nextId;i.pinned_revision=next.revision;changed.push(i.id);}
    if(!changed.length)throw Error('该样本的实例均受保护；请在局部装配查看保护原因');
    recordGeneratedPlacements(doc.authoring,changed);
    const slots=currentSlots();slots[role]=[...new Set(slots[role].map(id=>id===assetId?nextId:id))];
    if(doc.authoring.branch_instances.some(i=>i.asset_id===assetId&&i.shootRole===role)&&!slots[role].includes(assetId))slots[role].push(assetId);
    doc.authoring.workbench={...doc.authoring.workbench,assembly_slots:slots};
    const leaves=new Map((doc.leaf_meshes||[]).map(source=>[source.id,source]));
    const organs=new Map((doc.authoring.tree_organs?.units||[]).map(unit=>[unit.id,unit]));
    const imported=importSampleMaterials(doc.authoring,next.sample);
    for(const source of next.sample?.leaf_meshes||[])leaves.set(source.id,copy(remapSampleMaterial(source,imported.references)));
    for(const unit of next.sample?.authoring?.tree_organs?.units||[])organs.set(unit.id,copy(remapSampleMaterial(unit,imported.references)));
    doc.leaf_meshes=[...leaves.values()];if(doc.authoring.tree_organs)doc.authoring.tree_organs.units=[...organs.values()];
    await api.applyPlantAssets(doc);api.toast('已替换这个分区的样本，保留挂点与数量；可撤销');refresh();
  }
  async function openAsset(item) { if (item) await switchMode('BRANCH', documentForAsset(item)); }
  async function editUnitSource(instance) {
    if(mode!=='TREE'||!instance)return;
    await api.flush();
    const item=resolveInstanceAsset({...instance,linked:true},library);
    if(item){
      selectedAsset=item.id;
      await openAsset(item);
      api.toast(`已打开源单元枝 ${item.name} · V${item.revision}；在工作台保存版本后，再明确更新整树装配`);
      return;
    }
    // Old unlinked units may only have an embedded model. Recover a standalone
    // source draft in BRANCH without retaining the one-instance apply-back link.
    const draft=captureCompleteInstanceDraft(api.getAsset(),instance,api.capture(),api.getLeafSources());
    draft.authoring.workbench={...draft.authoring.workbench,source:null,asset_id:''};
    await switchMode('BRANCH',draft);
    api.toast('已打开旧版内嵌单元枝草稿；保存为单元素材后，可从库明确选择装配');
  }
  async function regenerateAssembly() {
    if (mode !== 'TREE' || api.getSkeletonEditMode()) return false;
    await api.flush();
    const next = { ...api.getAuthoring(), branch_instances: api.getAuthoring().branch_instances.map(i=>({...i})) };
    const result = redistributeAssembly(next, api.getAsset().masterBranches, currentSlots());
    const growth = applyGrowthRules(next, api.getAsset().masterBranches);
    if (!result.moved.length && !growth.moved.length) return false;
    api.transact('重新生成单元枝分布', a => { a.branch_instances = next.branch_instances; a.workbench = next.workbench; }, { bypassLayers: true });
    await api.flush();
    api.toast(`已重新分配 ${result.moved.length} 个自动单元枝，覆盖遗漏末梢；总数与样本尺寸不变，可撤销`);
    return true;
  }
  async function vineDraft(source) {
    let draft = {
      settings: { ...DEFAULT_SETTINGS, object_name: '岩壁垂挂', leaf_color: '#628a43', bark_color: '#5d6540', season_progress: 0, wind_strength: .12, radial_segments: 5, max_leaves: 6000, max_triangles: 180000 },
      authoring: normalizeAuthoring({ vine: { ...vinePreset('EDGE'), species: source?.authoring?.vine?.species, leaf_preset: source?.authoring?.vine?.leaf_preset }, flowering: { ...source?.authoring?.flowering, regions: {}, removed: [] }, leaf_material: source?.authoring?.leaf_material, profiles: { leaf_density: [1, 1, .65] }, attachment_layers: [{ id: 'ATTACH_LEAVES', type: 'LEAF', enabled: true, order_min: 0, order_max: 3, start: 0, end: 1, density: 1, scale: 1 }] }),
      leaf_meshes: copy(source?.leaf_meshes || []), protectTrunk: false,
    };
    if (DISTRIBUTION.surfaceExample) {
      const surface = await loadSurfaceExample();
      draft = withIvyAssets(draft, await loadIvyAssets(), true);
      draft.authoring.surface_growth = surface;
      draft.settings.object_name = '桥墩常春藤';
    }
    return draft;
  }
  async function switchMode(next, replacement = null) {
    if(prefabs.busy){api.toast('预制正在整理或安装，请完成后再切换工作区');return;}
    trunkOwnsSkeletonMode = false;
    trunkForm.deactivate();
    groupControls.cancel();
    localAssembly.cancel();localAssembly.stop();
    assemblyGrowth.deactivate();
    unitEditor.deactivate();
    vines.cancel();
    symmetry.deactivate(); versions.close();
    deformation.cancel(); instances.deactivate();
    installation.cancel(); views.cancel(); context.cancel(); tools.activate(''); await api.setSkeletonEditMode(false); await api.flush(); parked[mode] = api.capture();
    if (replacement) parked[next] = replacement;
    if (!parked[next]) {
      parked[next] = next === 'VINE' ? await vineDraft(parked[mode]) : next === 'TREE' ? { settings: { ...DEFAULT_SETTINGS }, authoring: normalizeAuthoring(), leaf_meshes: [] } : await defaultBranchDraft();
    }
    mode = next; document.body.dataset.workbench = mode;
    parked[next].authoring.branch_library = copy(library);
    await api.restore(parked[next]);
    api.projectActivated?.({replacement:!!replacement});
    if(next==='BRANCH')document.dispatchEvent(new CustomEvent('branch-workflow-show',{detail:replacement?'ADJUST':'CREATE'}));
    $('wbAssetName').value = api.getAuthoring().workbench?.name || api.getSettings().object_name;
    document.querySelector('[data-tab="structure"]').click();
    const toggle = section.querySelector('.parameter-group-toggle');
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
    document.querySelector('.parameter-scroll').scrollTop = 0;
    refresh();
    const vineToggle = document.querySelector('#vinePanel .parameter-group-toggle'); if (next === 'VINE' && vineToggle?.getAttribute('aria-expanded') === 'false') vineToggle.click();
    if (next === 'VINE' && api.getAuthoring().surface_growth) vines.surface.fit();
  }
  async function defaultBranchDraft() {
    if (!DISTRIBUTION.defaultBranch) return blank();
    await ready;
    const item = normalizeBranchLibrary([await assetStorage.get(DISTRIBUTION.defaultBranch)])[0];
    if (!item) throw new Error('默认香樟单元枝读取失败，请检查内置成品库');
    const doc = documentForAsset(item);
    doc.settings.object_name = `${item.name}_副本`;
    doc.authoring.workbench = { name: doc.settings.object_name, asset_id: '' };
    return doc;
  }
  async function newDraft() { await switchMode('BRANCH', await defaultBranchDraft()); }
  async function extract() {
    return sourceWorkflow.open();
  }
  function captureDraft() {
    if(api.getAuthoring().workbench?.source?.instance_id)return captureCompleteDraftShape(api.getAsset(),api.getAuthoring());
    const asset = api.getAsset(); const captured = captureBranchShape(asset.masterBranches, asset.masterBranches[0]?.stableId, true);
    const original = api.getAuthoring().branch_shape?.connector;
    if (original) {
      const origin = new THREE.Vector3(...captured.source.frame.position);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...captured.source.frame.direction), new THREE.Vector3(1, 0, 0));
      captured.shape.connector = { ...original, position: new THREE.Vector3(...original.position).sub(origin).applyQuaternion(q).toArray(), direction: new THREE.Vector3(...original.direction).applyQuaternion(q).toArray() };
      if(original.hang_direction)captured.shape.connector.hang_direction=new THREE.Vector3(...original.hang_direction).applyQuaternion(q).normalize().toArray();
    }
    return captured.shape;
  }
  async function saveAsset(asCopy = false) {
    if (mode !== 'BRANCH') return;
    await api.flush(); const metadata = api.getAuthoring().workbench || {};
    const previous = !asCopy && !String(metadata.asset_id||'').startsWith('PACK_') && library.find((a) => a.id === metadata.asset_id);
    if (!previous && library.length >= 100) throw new Error('素材库已达到 100 项，请先导出并整理素材');
    const name = $('wbAssetName').value.trim() || '造型枝条', shape = captureDraft(), thumbnail = api.thumbnailShape(shape);
    const sample = sampleFromDocument(api.capture());
    bakeDuplicateUnits(api.getAsset(),sample.authoring,shape,api.getLeafSources());
    sample.authoring.branch_shape = copy(shape);
    sample.authoring.overrides = {}; sample.authoring.sculpt_layers = []; sample.authoring.manual_branches = [];
    sample.authoring.branch_arrays = []; sample.authoring.influence_regions = []; sample.authoring.symmetry_groups = [];
    sample.authoring.modifiers = []; sample.authoring.topology = { reparent: {}, attach: {}, suppressed: [], operations: [] };
    const organs = sample.authoring.tree_organs;
    const baseline = previous?.sample?.settings || treeDocument()?.settings || sample.settings;
    const densityRatio = (sample.settings.leaf_density || 0) / Math.max(0.001, baseline.leaf_density || sample.settings.leaf_density || 1);
    const scaleRatio = (sample.settings.leaf_scale || 1) / Math.max(0.001, baseline.leaf_scale || sample.settings.leaf_scale || 1);
    const organBaseline = previous?.sample?.authoring?.tree_organs || treeDocument()?.authoring?.tree_organs;
    const changes = { sample, leaf_source_ids: sample.leaf_meshes.map((source) => source.id),
      leaf_density_multiplier: Math.max(0.05, Math.min(4, (previous?.leaf_density_multiplier || 1) * densityRatio)),
      leaf_scale_multiplier: Math.max(0.1, Math.min(4, (previous?.leaf_scale_multiplier || 1) * scaleRatio)),
      organ_mode: organs?.units?.length ? organs.mode : '', organ_source_ids: (organs?.units || []).map((unit) => unit.id),
      organ_amount: organs?.amount ?? previous?.organ_amount ?? 0.65,
      organ_max_count: organs?.max_count ?? previous?.organ_max_count ?? 0,
      organ_scale: Math.max(0.1, Math.min(4, (previous?.organ_scale || 1) * ((organs?.scale || 1) / Math.max(0.001, organBaseline?.scale || organs?.scale || 1)))),
      organ_terminal_only: organs?.terminal_branches_only ?? previous?.organ_terminal_only ?? false };
    const item = previous ? nextAssetVersion(previous, shape, thumbnail, name, changes) :
      { id: uid('ASSET'), name, revision: 1, shape, thumbnail, versions: [], leaf_density_multiplier: 1, leaf_scale_multiplier: 1, ...changes };
    item.thumbnail = await sampleThumbnail(item);
    if (previous && !await versions.confirmUpdate(previous, item)) return false;
    await store.put(item);
    if (previous && parked.TREE) for (const instance of parked.TREE.authoring.branch_instances || [])
      if (instance.linked && instance.asset_id === previous.id && !instance.pinned_revision) instance.pinned_revision = previous.revision;
    library = [...library.filter((a) => a.id !== item.id), item]; selectedAsset = item.id;
    api.transact('保存枝条素材', (a) => { a.workbench = { ...a.workbench, asset_id: item.id, name: item.name }; }, { bypassLayers: true });
    publishLibraries(); api.toast(`已保存 ${item.name} · 版本 ${item.revision}`); return true;
  }
  async function restoreVersion(id, revision) {
    const previous = library.find((a) => a.id === id), version = previous?.versions.find((v) => v.revision === revision); if (!version) return;
    const updated = nextAssetVersion(previous, copy(version.shape), version.thumbnail || api.thumbnailShape(version.shape));
    updated.thumbnail = await sampleThumbnail(updated);
    if (!await versions.confirmUpdate(previous, updated)) return;
    await store.put(updated); library = library.map((a) => a.id === id ? updated : a); publishLibraries(); await api.flush(); refresh(); api.toast(`已恢复为 v${updated.revision}`);
  }
  const installValues = () => ({ attach: +$('wbInstallT').value, angle: +$('wbInstallAngle').value, azimuth: +$('wbInstallAzimuth').value, roll: +$('wbInstallRoll').value, scale: +$('wbInstallScale').value, variation: +$('wbInstallVariation').value, seed: +$('wbInstallSeed').value });
  async function install() {
    if (api.getSkeletonEditMode()) throw Error('枝干编辑中已暂停单元枝安装，请先返回整树预览');
    const item = assetById(); if (!item) throw new Error('请先选择枝条素材');
    await api.flush(); const parent = api.getSelection(); if (!parent) throw new Error('请先在整树中选择挂接枝条');
    if(api.getAsset().masterBranches.find(b=>b.stableId===parent)?.importedTrunkHost){installation.begin(item);api.toast('请在导入树干表面点选安装，右键或 Esc 取消');return;}
    const instanceId = uid('INST');
    const estimated = api.getAsset().masterBranches.length + item.shape.branches.length;
    const limit=assemblyBranchLimit(api.getAuthoring());
    if (api.getAuthoring().branch_instances.length>=1600 || estimated > limit) throw new Error(`安装后超过当前 ${limit} 枝段或1600支成品预算，请减少数量后再安装`);
    const values = installValues(); if ($('wbAutoMatch').checked) { const branch = api.getAsset().masterBranches.find((b) => b.stableId === parent); values.scale = Math.max(0.05, Math.min(5, branchRadiusAt(branch, api.getSettings(), values.attach) * 0.65 / item.shape.branches[0].start_radius)); }
    await ensureGroupAssets([item.id]);
    api.transact('安装枝条素材', (a) => { a.branch_instances.push({ id: instanceId, asset_id: item.id, linked: true, pinned_revision:$('wbInstallMode').value==='LINK'?0:item.revision, assembly_manual:true, shape: copy(item.shape), parent, ...values, junction: $('wbInstallBlend').checked ? normalizeJunction({}) : null }); if (a.workbench?.assembly_scale) syncAssemblyScale(a); }, { bypassLayers: true });
    selectedInstance = instanceId; await api.flush(); api.select(`${instanceId}.${item.shape.branches[0].id}`); api.toast('枝条已安装，可继续调节挂接参数');
  }
  async function applyBack() {
    return sourceWorkflow.applyBack();
  }
  let installedOptionsSignature = '';
  function refresh({ placementOnly = false, selectionOnly = false } = {}) {
    const measure=(name,fn)=>api.measure?api.measure('selection.workbench.'+name,fn):fn();
    placementOnly = placementOnly && mode === 'TREE';
    const skeletonEditing = api.getSkeletonEditMode();
    if (!placementOnly) {
      const authored = api.getAuthoring().branch_library;
      if (JSON.stringify(authored.map(a=>[a.id,a.name,a.revision])) !== JSON.stringify(library.map(a=>[a.id,a.name,a.revision]))) library=normalizeBranchLibrary(authored);
      if (mode !== 'TREE') libraryManager.closePicker();
      selectionModes.hidden=mode!=='TREE';selectionModes.inert=busy;
      skeletonEditButton.hidden = mode !== 'TREE'; skeletonEditButton.disabled = busy;
      skeletonEditButton.textContent = skeletonEditing ? '返回整树预览' : '枝干编辑';
      skeletonEditButton.classList.toggle('active', skeletonEditing);
      skeletonEditButton.setAttribute('aria-pressed', String(skeletonEditing));
      skeletonEditNote.hidden = !skeletonEditing;
      $('wbAssemblyZones').closest('.wb-assembly').inert = skeletonEditing || busy;
      $('wbInstall').closest('.wb-tree-only').inert = skeletonEditing;
      measure('skeletonThickness',()=>skeletonThickness.refresh());
      measure('trunkForm',()=>trunkForm.refresh());
      measure('libraryManager',()=>libraryManager.refresh());
      measure('plantUnits',()=>plantUnits.refresh());
      measure('candidateWorkspace',()=>candidateWorkspace.refresh());
      measure('quickControls',()=>quickControls.refresh());
      measure('unitEditor',()=>unitEditor.refresh()); measure('unitRules',()=>unitRules.refresh());
      measure('assemblyGrowth',()=>assemblyGrowth.refresh());
      measure('localAssembly',()=>localAssembly.refresh());
      measure('treeRecipes',()=>treeRecipes.refresh());
      measure('prefabs',()=>prefabs.refresh());
      measure('groupControls',()=>groupControls.refresh());
      const foliage=normalizeFoliageUnit(api.getAuthoring().foliage_unit);
      $('treeCurrentFoliageControls').hidden=mode!=='BRANCH'||foliage.mode!=='PINNATE';
      if(foliage.mode==='PINNATE'){
        if(document.activeElement!==$('treeCurrentFoliagePairs'))$('treeCurrentFoliagePairs').value=foliage.pairs;
        if(document.activeElement!==$('treeCurrentFoliageSpread'))$('treeCurrentFoliageSpread').value=foliage.spread;
        $('treeCurrentFoliageTerminal').checked=foliage.terminal;
      }
      const organs=api.getAuthoring().tree_organs;
      $('treeOrganControls').hidden=mode!=='BRANCH'||!organs?.units.length;
      if(organs?.units.length){
        $('treeOrganLabel').textContent=`当前枝条：${TREE_SPECIES[organs.species]?.name||'树种'} · 花果与叶片共用材质`;
        for(const option of $('treeOrganMode').options)option.disabled=option.value!=='LEAVES'&&!organs.units.some(u=>option.value==='MIXED'?['FLOWER','BUD','FRUIT'].includes(u.role):option.value==='FRUIT'?u.role==='FRUIT':['FLOWER','BUD'].includes(u.role));
        $('treeOrganMode').value=organs.mode;
        if(document.activeElement!==$('treeOrganAmount'))$('treeOrganAmount').value=organs.amount;
        if(document.activeElement!==$('treeOrganScale'))$('treeOrganScale').value=organs.scale;
      }
      measure('vines',()=>vines.refresh());
      measure('tools',()=>tools.refresh()); measure('context',()=>context.refresh()); measure('deformation',()=>deformation.refresh()); measure('forms',()=>forms.refresh()); measure('arrays',()=>arrays.refresh()); measure('stroke',()=>stroke.refresh()); measure('influence',()=>influence.refresh()); measure('instances',()=>instances.refresh()); measure('symmetry',()=>symmetry.refresh()); measure('versions',()=>versions.refresh());
    }
    $('treeWorkspaceBtn').classList.toggle('active', mode === 'TREE'); $('branchWorkspaceBtn').classList.toggle('active', mode === 'BRANCH');
    $('vineWorkspaceBtn').classList.toggle('active', mode === 'VINE');
    sourceWorkflow.refresh($('extractBranchBtn'), $('applyBranchBack'));
    $('branchWorkspaceState').textContent = mode === 'TREE' ? (skeletonEditing ? '枝干编辑 · 单元枝暂停' : '整树') : (api.getAuthoring().workbench?.name || '枝条草稿');
    const mounted=api.getAuthoring().branch_instances;
    const modelTypes=new Set(mounted.map(i=>`${i.asset_id||i.id}@${i.pinned_revision||library.find(a=>a.id===i.asset_id)?.revision||1}`)).size;
    $('branchAssemblyCount').textContent = `${modelTypes} 类 / ${mounted.length} 个`;
    $('openBranchAssembly').title = '当前植物已安装的单元枝数量；打开独立单元枝页选择素材与配置装配';
    $('openBranchAssembly').hidden = mode !== 'TREE';
    if (mode === 'VINE') $('branchWorkspaceState').textContent = '藤蔓 · 共享叶片';
    if (!placementOnly && !selectionOnly) {
      const filter = $('wbAssetSearch').value.toLowerCase(); const list = $('wbAssetLibrary'); list.replaceChildren();
      for (const item of library.filter((a) => a.name.toLowerCase().includes(filter))) {
        const b = document.createElement('button'); b.className = 'wb-asset'; b.classList.toggle('active', selectedAsset === item.id); b.dataset.asset = item.id; b.title = item.name; b.setAttribute('aria-pressed', String(selectedAsset === item.id));
        b.draggable = mode === 'TREE' && !skeletonEditing;
        b.ondragstart = (e) => { e.dataTransfer.setData('application/x-branchforge-asset', item.id); e.dataTransfer.effectAllowed = 'copy'; document.body.classList.add('assembly-dragging'); };
        b.ondragend = (e) => { document.body.classList.remove('assembly-dragging'); document.querySelectorAll('.wb-assembly-zone.drag-over').forEach(row => row.classList.remove('drag-over')); if (e.dataTransfer.dropEffect === 'none') installation.cancel(); };
        if (item.thumbnail) { const img = document.createElement('img'); img.src = item.thumbnail; img.alt = ''; b.append(img); }
        const label = document.createElement('span'); label.textContent = item.name; const meta = document.createElement('small'); meta.textContent = `${selectedAsset===item.id&&mode==='TREE'?'待添加 · ':''}${item.shape.branches.length} 枝段 · v${item.revision}`; b.append(label, meta);
        b.onclick = () => { selectedAsset = item.id; refresh(); };
        b.ondblclick = run(() => openAsset(item)); list.append(b);
      }
      if (!list.children.length) { const empty = document.createElement('p'); empty.textContent = filter ? '没有匹配的素材' : '暂无枝条素材'; list.append(empty); }
      ['wbExportAsset', 'wbExportSampleGlb', 'wbDeleteAsset', 'wbEditAsset', 'wbRenameAsset', 'wbInstall', 'wbPreviewInstall'].forEach((key) => $(key).disabled = !assetById());
    }
    if(!selectionOnly){
    const zones = $('wbAssemblyZones'); zones.replaceChildren();
    if (mode === 'TREE') {
      const slots = currentSlots();
      const protection = assemblyProtection(api.getAuthoring());
      const scaleState = assemblyScaleState(api.getAuthoring().workbench);
      const thicknessChanges = sampleThicknessAdjustments(api.getAuthoring());
      $('wbThicknessStatus').textContent = thicknessChanges.length
        ? `${thicknessChanges.length} 根单元枝有额外粗细调整，其中 ${thicknessChanges.filter(i => i.radius_scale < 1).length} 根被缩细。恢复后按样本比例显示，长度与叶花果大小不变；可撤销。`
        : '成品单元枝没有额外粗细调整。局部手工造型仍保留。';
      $('wbRestoreSampleThickness').disabled = !thicknessChanges.length;
      if (document.activeElement !== $('wbAssemblyScale')) $('wbAssemblyScale').value = scaleState.overall;
      const assemblyCount = countAssemblyInstances(api.getAuthoring().branch_instances, slots);
      $('wbAssemblyCurrent').textContent = String(assemblyCount);
      const targetInput = $('wbAssemblyTarget');
      targetInput.max = String(1600 - api.getAuthoring().branch_instances.length + assemblyCount);
      if (document.activeElement !== targetInput) targetInput.value = String(assemblyCount);
      for (const zone of ASSEMBLY_ZONES) {
        const row = document.createElement('div'); row.className = 'wb-assembly-zone'; row.dataset.assemblyRole = zone.role;
        const title = document.createElement('strong');
        const zoneCount = api.getAuthoring().branch_instances.filter((instance) => instance.linked && instance.shootRole === zone.role && slots[zone.role].includes(instance.asset_id)).length;
        row.dataset.count = String(zoneCount);
        title.textContent = `${zone.label} · ${zoneCount} 枝`; row.append(title);
        for (const assetId of slots[zone.role]) {
          const item = library.find((asset) => asset.id === assetId); if (!item) continue;
          const card = document.createElement('div'); card.className = 'wb-assembly-card'; card.dataset.assemblyAsset = assetId;
          if (item.thumbnail) { const image = document.createElement('img'); image.src = item.thumbnail; image.alt = `${item.name}的枝叶缩略图`; card.append(image); }
          else { const empty = document.createElement('div'); empty.className = 'wb-assembly-placeholder'; empty.textContent = '暂无预览'; card.append(empty); }
          const name = document.createElement('span'); name.className = 'wb-assembly-name';
          const caption = document.createElement('span'); caption.className = 'wb-assembly-title'; caption.textContent = item.name; name.append(caption);
          const leafCount = item.sample?.leaf_meshes?.length || item.leaf_source_ids.length;
          const sampleTags = item.sample?.authoring?.recipe?.tags || [];
          const provenance = sampleTags.includes('PLATANUS_AUTHORED_ATLAS_VISIBLE_V12') ? '成品Blender贴图'
            : sampleTags.includes('PLATANUS_PREPARED_BLENDER_UNITS_V10') ? '成品Blender单元'
            : sampleTags.includes('PLATANUS_ORIGINAL_BLENDER_LEAF_MESH_V9') ? 'Blender原叶网格'
            : sampleTags.includes('PLATANUS_LAMINA_CALIBRATED_V8') ? 'Blender叶片派生LOD' : '叶片单元';
          const count = api.getAuthoring().branch_instances.filter(i => i.linked && i.shootRole === zone.role && i.asset_id === assetId).length;
          const protectedCount = api.getAuthoring().branch_instances.filter(i=>i.linked&&i.shootRole===zone.role&&i.asset_id===assetId&&protection.get(i.id)).length;
          const revisions=[...new Set(api.getAuthoring().branch_instances.filter(i=>i.linked&&i.shootRole===zone.role&&i.asset_id===assetId).map(i=>i.pinned_revision||item.revision))];
          const pending=revisions.some(revision=>revision<item.revision);
          const meta = document.createElement('small'); meta.textContent = `已用 ${count} 枝 · V${revisions.join('/')||item.revision}${pending?' → V'+item.revision+' 待更新':''}${protectedCount?' · 保护 '+protectedCount:''}`;meta.classList.toggle('version-pending',pending); meta.title = `${item.shape.branches.length}枝段 · ${leafCount}款${provenance}${protectedCount?'；保护实例不参与自动替换/更新':''}`; name.append(meta);
          if (provenance === 'Blender叶片派生LOD') meta.title = '源自 BlenderAsset/植物综合第二批/二球悬铃木单元.blend；整树使用保留原叶形、UV和贴图的简化网格';
          if (provenance === 'Blender原叶网格') meta.title = '取自旧的二球悬铃木_侧枝_成品.branch.json；与成品 Blender 单元的叶片拓扑、UV 和图集一致';
          if (provenance === '成品Blender单元') meta.title = '直接采用 BlenderAsset/TreeSpecies_Builtin_v2/08_二球悬铃木/二球悬铃木_成品单元.blend 对应的内置叶、花、果网格与 4K 图集';
          if (provenance === '成品Blender贴图') meta.title = '成品 Blender 叶、花、果网格与 4K 图集；三类叶色保留图集的纹理和叶脉';
          name.title = `${item.name} · 双击编辑样本枝`; name.tabIndex = 0; name.setAttribute('role', 'button');
          name.ondblclick = run(() => openAsset(item)); name.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); run(() => openAsset(item))(); } }; card.append(name);
          const scaleLabel = document.createElement('label'); scaleLabel.className = 'wb-card-scale'; scaleLabel.textContent = '样本倍率';
          const scaleInput = document.createElement('input'); scaleInput.type = 'number'; scaleInput.min = '0.1'; scaleInput.max = '10'; scaleInput.step = 'any';
          scaleInput.value = assemblyCardScale(api.getAuthoring().workbench, zone.role, assetId); scaleInput.dataset.scaleAsset = assetId; scaleInput.required = true;
          scaleInput.setAttribute('aria-label', `${zone.label} ${item.name} 本区倍率`); scaleLabel.textContent='本区倍率';
          scaleInput.onchange = run(async () => { if (!scaleInput.reportValidity() || scaleInput.value === '') return; await setAssemblyScale({ zoneCards: { [zone.role]: { [assetId]: scaleInput.valueAsNumber } } }); });
          scaleInput.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); scaleInput.blur(); } };
          scaleLabel.append(scaleInput);
          if (slots[zone.role].length > 1) {
            const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = '移出该区间'; remove.setAttribute('aria-label', `从${zone.label}移除${item.name}`); remove.dataset.removeAssembly = assetId;
            remove.onclick = run(async () => { const next = currentSlots(); next[zone.role] = next[zone.role].filter((id) => id !== assetId); await updateAssembly(next, [zone.role]); }); card.append(remove);
          }
          card.append(scaleLabel);
          const adjusted = sampleThicknessAdjustments(api.getAuthoring(), assetId);
          if (adjusted.length) {
            const thickness = document.createElement('details'); thickness.className = 'wb-card-thickness';
            const summary = document.createElement('summary'); summary.textContent = '粗细调整与恢复'; thickness.append(summary);
            const info = document.createElement('small');
            const values = adjusted.map(i => i.radius_scale);
            info.textContent = `${adjusted.length} 根额外粗细 ×${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}`;
            const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = '恢复样本粗细'; restore.dataset.restoreThickness = assetId;
            restore.title = '清除该样本所有关联实例的额外粗细倍率，保留整体缩放、叶花果和局部造型；可撤销';
            restore.onclick = run(() => resetSampleThickness(assetId));
            thickness.append(info, restore); card.append(thickness);
          }
          const actions=document.createElement('div');actions.className='wb-card-actions';
          for(const [label,action,hint] of [['替换',run(()=>replaceAssembly(assetId,zone.role)),'先选择左侧成品卡，再替换本分区这个样本，保留数量和位置']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.title=hint;b.onclick=action;actions.append(b);}
          if(pending){const update=document.createElement('button');update.textContent='更新';update.title='仅更新本分区这个样本，其他装配版本保留';update.onclick=run(()=>updateAssembly(currentSlots(),[zone.role],true,assetId));actions.append(update);}
          card.append(actions);row.append(card);
        }
        const target = document.createElement('div'); target.className = 'wb-assembly-drop'; target.textContent = '＋ 拖入或点击添加样本';
        target.tabIndex = 0; target.setAttribute('role', 'button'); target.title = '拖入素材卡；也可以先点选素材卡，再点击这里添加';
        const add = async assetId => {
          if (!assetId || !library.some(item => item.id === assetId)) throw new Error('请先在左侧素材库选择一张枝条卡片');
          if (currentSlots()[zone.role].includes(assetId)) { api.toast('这个样本已在该分区，可直接调整卡片倍率'); return; }
          const next = addAssemblyAsset(currentSlots(), zone.role, assetId, library); await updateAssembly(next, [zone.role]);
        };
        target.onclick = run(() => add(selectedAsset));
        target.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); target.click(); } };
        const accepts = event => !busy && !api.getSkeletonEditMode() && event.dataTransfer?.types.includes('application/x-branchforge-asset');
        row.ondragover = event => { if (accepts(event)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; row.classList.add('drag-over'); } };
        row.ondragleave = event => { if (!row.contains(event.relatedTarget)) row.classList.remove('drag-over'); };
        row.ondrop = event => {
          if (!accepts(event)) return;
          event.preventDefault(); event.stopPropagation(); row.classList.remove('drag-over'); document.body.classList.remove('assembly-dragging'); installation.cancel();
          const assetId = event.dataTransfer.getData('application/x-branchforge-asset'); run(() => add(assetId))();
        };
        row.append(target); zones.append(row);
      }
    }
    }
    assemblyLinks.refresh();
    if (placementOnly) {
      // Derive assembly scope once before the current instance/tool summaries.
      // Complete-model placement changes no source library or workbench tools.
      groupControls.refresh(); instances.refresh();
      // COMB is refreshed by the assembly notification below, including changes
      // announced directly by group controls. Avoid refreshing that panel twice.
      if (context.mode !== 'COMB') context.refresh();
    }
    api.syncAssemblyScope?.();
    document.dispatchEvent(new Event('tree-assembly-refreshed'));
    if (api.isEditing()) return;
    const installedInstances = api.getAuthoring().branch_instances || [];
    selectedInstance = installedInstances.find((i) => api.getSelection()?.startsWith(i.id + '.'))?.id || '';
    const select = $('wbInstances');
    const names = new Map(library.map(item => [item.id, item.name]));
    const optionsSignature = JSON.stringify(installedInstances.map(instance => [instance.id, names.get(instance.asset_id) || '枝簇', instance.linked]));
    // Sculpting changes poses, not this list. Keep its options and batch actual
    // additions/removals so a large tree doesn't rebuild hundreds of rows twice.
    if (optionsSignature !== installedOptionsSignature) {
      select.replaceChildren(new Option('未选择实例', ''), ...installedInstances.map(instance =>
        new Option(`${names.get(instance.asset_id) || '枝簇'} · ${instance.linked ? '关联' : '副本'}`, instance.id)));
      installedOptionsSignature = optionsSignature;
    }
    select.value = selectedInstance;
    const current = installedInstances.find((i) => i.id === selectedInstance);$('wbInstallT').disabled=Boolean(current?.trunk_anchor);$('wbInstallT').title=current?.trunk_anchor?'表面挂点请按 G 拖到树干表面调整':'沿母枝调整挂接位置';
    if (current) for (const [key, field] of Object.entries({ attach: 'T', angle: 'Angle', azimuth: 'Azimuth', roll: 'Roll', scale: 'Scale', variation: 'Variation', seed: 'Seed' })) $('wbInstall' + field).value = current[key];
    $('wbUnlink').disabled = !current?.linked; $('wbRemoveInstance').disabled = !current;
    if (mode === 'BRANCH') {
      const reference=api.getAuthoring().branch_shape?.connector?.hang_direction;
      $('wbHangDirection').value=reference?Object.keys(hangDirections).find(key=>hangDirections[key].every((v,index)=>Math.abs(v-reference[index])<1e-6))||'CUSTOM':'';
      api.showUnitHangReference?.(reference);
      $('wbLockRoot').checked = api.getAuthoring().curve_editor.lock_root;
      const ref = currentReference(api.getAuthoring());
      if (ref) { $('wbReferenceVisible').checked = ref.visible !== false; for (const [key, field] of Object.entries({ opacity: 'Opacity', size: 'Size', x: 'X', y: 'Y', z: 'Z' })) $('wbReference' + field).value = ref[key]; }
    }
    else api.showUnitHangReference?.(null);
  }
  function activate(tool) { api.setTool('SELECT'); tools.activate(tool); }
  function currentReference(a) { return a.workbench?.references?.[$('wbPlane').value] || (a.workbench?.reference?.plane === $('wbPlane').value ? a.workbench.reference : null); }
  bind('openSectionContext', () => activate('SECTION'));
  bind('openJunctionContext', () => { api.setTool('SELECT'); context.setMode('JUNCTION'); });
  bind('wbPreviewInstall', () => installation.begin(assetById()));
  bind('treeWorkspaceBtn', () => mode !== 'TREE' && switchMode('TREE')); bind('branchWorkspaceBtn', () => mode !== 'BRANCH' && switchMode('BRANCH'));
  bind('openBranchAssembly', revealAssembly);
  bind('openBranchLibraryManager', () => libraryManager.open());
  bind('wbAssemblyJumpCount', () => $('wbAssemblyTarget').scrollIntoView({ block: 'center', behavior: 'smooth' }));
  bind('vineWorkspaceBtn', () => mode !== 'VINE' && switchMode('VINE'));
  bind('extractBranchBtn', extract); bind('newBranchDraft', newDraft); bind('applyBranchBack', applyBack);
  bind('wbSaveAsset', () => saveAsset()); bind('wbSaveReturn', async () => { if (await saveAsset()) { await switchMode('TREE'); revealAssembly(); } }); bind('wbSaveCopy', () => saveAsset(true)); bind('wbInstall', install);
  bind('wbEditAsset', () => openAsset(assetById()));
  bind('wbUpdateSamples', async () => updateAssembly(currentSlots(), ASSEMBLY_ZONES.map((zone) => zone.role), true));
  bind('wbApplyAssemblyCount', async () => setAssemblyCount($('wbAssemblyTarget').valueAsNumber));
  bind('wbExportSampleGlb', async () => {
    const item = assetById(); if (!item) return;
    const result = await api.exportCandidateDocuments([{ id: item.id, name: `${item.name}_树枝样本`, document: documentForAsset(item) }]);
    if (result[0]?.error) throw new Error(result[0].error);
  });
  async function renameAsset(item,name) {
    name=name?.trim();if(!item||!name)throw Error('请输入成品名称');
    const updated={...item,name:name.slice(0,80)};await store.put(updated);library=library.map(a=>a.id===item.id?updated:a);publishLibraries();refresh();
  }
  bind('wbRenameAsset', async () => {
    const item = assetById(); if (!item) return;
    const name = await confirmAction({title:'重命名枝条素材',name:item.name,message:'更新素材名称，已装配的枝条造型保留。',input:item.name,accept:'保存名称'}); if (!name) return;
    await renameAsset(item,name);
  });
  async function deleteAsset(item) { if (!item) return;if(String(item.id).startsWith('PACK_'))throw Error('包内原件使用固定版本，请在资源包管理中移除登记，或另存副本');
    // Other cards may share this card's atlas. Detach those material references
    // before removing their owner so editing them later keeps the actual texture.
    for(const other of library.filter(a=>a.id!==item.id)) if([other,...(other.versions||[])].some(v=>v.sample?.material_asset_id===item.id)){
      const portable=portableAsset(other);await store.put(portable);library=library.map(a=>a.id===other.id?portable:a);
    }
    await store.remove(item.id); library = library.filter((a) => a.id !== item.id);
    const detach = (a) => { a.branch_instances.forEach((i) => { if (i.asset_id === item.id && i.linked) { i.shape = copy(resolveInstanceShape(i, [item])); i.linked = false; i.pinned_revision = 0; } }); };
    api.transact('删除素材并保留安装副本', detach, { bypassLayers: true }); for (const key of ['TREE', 'BRANCH', 'VINE']) if (parked[key]) detach(parked[key].authoring); publishLibraries(); selectedAsset = '';refresh(); api.toast('素材已删除，已有安装保留为独立副本'); }
  bind('wbDeleteAsset', async () => {const item=assetById();if(item&&await confirmAction({title:'删除枝条素材？',name:item.name,message:'原始文件保留，当前安装的枝条保留为副本。',accept:'删除素材',danger:true}))await deleteAsset(item);});
  function exportAsset(item) { if (!item) return; const exported = portableAsset(item);
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'BranchForgeBranchAsset', version: 1, asset: exported })], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${item.name.replace(/[<>:"/\\|?*]/g, '_')}.branchasset.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  bind('wbExportAsset', () => exportAsset(assetById()));
  bind('wbImportAsset', () => $('wbAssetFile').click());
  $('wbAssetFile').multiple=true;
  $('wbAssetFile').addEventListener('change', run(async () => { const files = Array.from($('wbAssetFile').files); $('wbAssetFile').value = '';const failures=[];let imported=0;
    for(const file of files)try{ await importAssetFile(file);imported++; }catch(error){failures.push(`${file.name}：${error.message}`);}
    if(files.length){const message=`已导入 ${imported} 款${failures.length?'；'+failures.join('；'):''}`;api.toast(message,!!failures.length);libraryManager.notify(message);}
  }));
  async function importAssetFile(file) { if (file.size > 120000000) throw new Error('素材文件超过 120 MB'); const parsed = JSON.parse(await file.text()); let candidate;
    if (parsed.format === 'BranchForgeBranchAsset' && parsed.version === 1) candidate = parsed.asset;
    else if (parsed.format === 'ProceduralBranchProject' && parsed.authoring?.branch_shape) {
      const organs = parsed.authoring.tree_organs;
      candidate = { id: uid('ASSET'), name: parsed.settings?.object_name || file.name.replace(/\.branch\.json$/i, ''), revision: 1,
        shape: parsed.authoring.branch_shape, versions: [], sample: sampleFromDocument(parsed),
        leaf_density_multiplier: (parsed.settings?.leaf_density || 0) / Math.max(0.001, treeDocument()?.settings?.leaf_density || parsed.settings?.leaf_density || 1),
        leaf_scale_multiplier: (parsed.settings?.leaf_scale || 1) / Math.max(0.001, treeDocument()?.settings?.leaf_scale || parsed.settings?.leaf_scale || 1),
        leaf_source_ids: (parsed.leaf_meshes || []).map((source) => source.id),
        organ_mode: organs?.units?.length ? organs.mode : '', organ_source_ids: (organs?.units || []).map((unit) => unit.id),
        organ_amount: organs?.amount, organ_max_count: organs?.max_count,
        organ_scale: (organs?.scale || 1) / Math.max(0.001, treeDocument()?.authoring?.tree_organs?.scale || organs?.scale || 1),
        organ_terminal_only: organs?.terminal_branches_only };
    } else throw new Error('请选择枝条素材或单枝 .branch.json 工程');
    const item = normalizeBranchLibrary([candidate])[0]; if (!item) throw new Error('素材缺少有效枝条几何'); if (library.length >= 100) throw new Error('素材库已达到 100 项'); if (library.some((a) => a.id === item.id)) item.id = uid('ASSET');
    if (staleThumbnail(item)) item.thumbnail = await sampleThumbnail(item);
    await store.put(item); library.push(item); selectedAsset = item.id; publishLibraries(); }
  $('wbAssetSearch').addEventListener('input', refresh);
  for (const [id, tool] of [['wbAxis', 'AXIS'], ['wbSection', 'SECTION'], ['wbConnectorMove', 'CONNECT_MOVE'], ['wbConnectorRotate', 'CONNECT_ROTATE']]) bind(id, () => activate(tool));
  bind('wbGrab', () => api.setTool('GRAB')); bind('wbSmooth', () => api.setTool('SMOOTH_BRUSH')); bind('wbSelect', () => api.setTool('SELECT'));
  $('wbPlane').onchange = () => { tools.setPlane($('wbPlane').value); refresh(); }; bind('wbView', () => tools.view($('wbPlane').value));
  $('wbSectionT').oninput = () => { tools.setSection($('wbSectionT').value); context.refresh(); };
  $('wbDiameter').oninput = () => { if ($('wbDiameter').value === '' || !$('wbDiameter').validity.valid) return; api.begin(); tools.setRadius(+$('wbDiameter').value); };
  $('wbDiameter').onchange = () => api.commit();
  bind('wbRadiusReset', () => { if (tools.getBranch()?.sections?.length) { api.begin(); tools.setSectionValue('radius', 1); api.commit(); } else api.transact('重置截面粗细', (a) => { const id = api.getSelection() || api.getAsset()?.masterBranches[0]?.stableId; if (a.overrides[id]) a.overrides[id].radius_profile = null; }, { bypassLayers: true }); });
  $('wbLockRoot').onchange = () => api.transact('根部锁定', (a) => { a.curve_editor.lock_root = $('wbLockRoot').checked; a.branch_shape.connector.locked = a.curve_editor.lock_root; });
  bind('wbConnectorReset', () => api.transact('连接点归根', (a) => { const branch = api.getAsset().masterBranches[0]; a.branch_shape.connector.position = branch.points[0].toArray(); a.branch_shape.connector.direction = branch.points[1].clone().sub(branch.points[0]).normalize().toArray(); }, { bypassLayers: true }));
  $('wbInstances').onchange = () => { selectedInstance = $('wbInstances').value; const current = api.getAuthoring().branch_instances.find((i) => i.id === selectedInstance); if (current) api.select(`${current.id}.${(current.shape || assetById()?.shape)?.branches[0].id || 'R1'}`); refresh(); };
  let numericBaseline = null;
  for (const suffix of ['T', 'Angle', 'Azimuth', 'Roll', 'Scale', 'Variation', 'Seed']) {
    const input = $('wbInstall' + suffix); input.oninput = () => {
      if (installation.active) { if (suffix === 'T') installation.pending.attach = +input.value; installation.update(); return; }
      if (!selectedInstance || input.value === '' || !input.validity.valid) return;
      const instance = api.getAuthoring().branch_instances.find((i) => i.id === selectedInstance);
      if (!numericBaseline || !api.isEditing()) numericBaseline = { authoring: copy(api.getAuthoring()), instance: copy(instance), branches: api.getAsset().masterBranches, baseBranches: instanceEditBase(api.getAuthoring(), instance.id, api.getAsset().masterBranches, api.getSettings()) };
      api.begin(); try { api.preview((a) => { const i = a.branch_instances.find((b) => b.id === selectedInstance); if (!i) return;
        const values={...installValues(),frame:null};if(numericBaseline.instance.trunk_anchor){values.attach=numericBaseline.instance.attach;values.frame=copy(numericBaseline.instance.frame);const normal=new THREE.Vector3(...values.frame.direction),axis=new THREE.Vector3(...values.frame.parent_tangent).normalize(),across=new THREE.Vector3().crossVectors(axis,normal);if(across.lengthSq()<1e-10)across.set(1,0,0);normal.applyAxisAngle(across.normalize(),THREE.MathUtils.degToRad(values.angle-numericBaseline.instance.angle)).applyAxisAngle(axis,THREE.MathUtils.degToRad(values.azimuth-numericBaseline.instance.azimuth));values.frame.direction=normal.normalize().toArray();}const changed=Object.entries(values).some(([key,value])=>JSON.stringify(value)!==JSON.stringify(numericBaseline.instance[key]));
        const next = { ...numericBaseline.instance, ...values, ...(changed?{assembly_refined:true}:{}) }, shape = resolveInstanceShape(i, library);
        a.overrides = copy(numericBaseline.authoring.overrides); a.sculpt_layers = copy(numericBaseline.authoring.sculpt_layers);
        reframeInstanceEdits(a, numericBaseline.instance, next, shape, numericBaseline.branches, api.getSettings(), numericBaseline.baseBranches); Object.assign(i, next);
      }); } catch (error) { api.cancel(); numericBaseline = null; api.toast(error.message, true); }
    }; input.onchange = () => { api.commit(); numericBaseline = null; };
  }
  ['wbAutoMatch', 'wbInstallBlend', 'wbInstallMode'].forEach((id) => $(id).addEventListener('change', () => installation.update()));
  bind('wbUnlink', () => api.transact('手工保留完整枝条', (a) => { const i = a.branch_instances.find((b) => b.id === selectedInstance); if (i) { i.shape = copy(resolveInstanceShape(i, library)); i.assembly_manual=true; i.pinned_revision ||= library.find(item=>item.id===i.asset_id)?.revision||1; } }, { bypassLayers: true }));
  bind('wbRemoveInstance', () => instances.deleteSelection());
  bind('wbReferenceLoad', () => $('wbReferenceFile').click());
  $('wbReferenceFile').addEventListener('change', run(async () => {
    const file = $('wbReferenceFile').files[0]; $('wbReferenceFile').value = ''; if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20000000) throw new Error('请选择不超过 20 MB 的 PNG、JPEG 或 WebP 图片');
    const bitmap = await createImageBitmap(file); const image = document.createElement('canvas'); const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height)); image.width = Math.round(bitmap.width * scale); image.height = Math.round(bitmap.height * scale); image.getContext('2d').drawImage(bitmap, 0, 0, image.width, image.height); bitmap.close();
    const data = image.toDataURL('image/jpeg', 0.86);
    api.transact('导入参考图', (a) => { a.workbench ||= {}; a.workbench.references ||= {}; a.workbench.reference = { image: data, name: file.name, aspect: image.width / image.height, visible: true, opacity: 0.45, size: 2, x: 0.7, y: 0, z: 0.7, plane: $('wbPlane').value }; a.workbench.references[$('wbPlane').value] = copy(a.workbench.reference); }, { bypassLayers: true });
  }));
  bind('wbReferenceRemove', () => api.transact('移除参考图', (a) => { if (a.workbench?.references) delete a.workbench.references[$('wbPlane').value]; if (a.workbench?.reference?.plane === $('wbPlane').value) delete a.workbench.reference; }, { bypassLayers: true }));
  for (const [key, suffix] of Object.entries({ visible: 'Visible', opacity: 'Opacity', size: 'Size', x: 'X', y: 'Y', z: 'Z' })) {
    const input = $('wbReference' + suffix); input.oninput = () => { if (!currentReference(api.getAuthoring()) || (input.type !== 'checkbox' && (input.value === '' || !input.validity.valid))) return; api.begin(); api.preview((a) => { currentReference(a)[key] = input.type === 'checkbox' ? input.checked : +input.value; }); tools.refresh(); }; input.onchange = () => api.commit();
  }
  const vines = createVineWorkspace({ ...api, isActive: () => mode === 'VINE', open: (doc) => switchMode('VINE', copy(doc)) });
  const catalogLoaded=new Set();
  const managedAsset=async id=>library.find(a=>a.id===id)||normalizeBranchLibrary([await assetStorage.get(id)])[0];
  async function ensureManagedAsset(id, retain = false){
    let item=await managedAsset(id);if(!item)throw Error('素材已不存在，请重新打开成品库');
    if(staleThumbnail(item))item.thumbnail=await sampleThumbnail(item);
    if(!library.some(a=>a.id===id)){
      const referenced=new Set();
      for(const a of [api.getAuthoring(),...Object.values(parked).map(d=>d?.authoring)].filter(Boolean)){
        for(const instance of a.branch_instances||[])referenced.add(instance.asset_id);
        for(const assetId of Object.values(a.workbench?.assembly_slots||{}).flat())referenced.add(assetId);
      }
      for(const owner of library)for(const version of [owner,...(owner.versions||[])])if(version.sample?.material_asset_id)referenced.add(version.sample.material_asset_id);
      // Browsing the global catalog should not permanently accumulate every
      // opened card in the current project's 100-slot embedded library.
      if(!retain)library=library.filter(a=>!catalogLoaded.has(a.id)||referenced.has(a.id));
      if(library.length>=100)throw Error('当前工程已使用 100 款素材，请先移除不用的工程素材；全局成品库仍可继续查阅');
      library.push(item);if(!retain)catalogLoaded.add(id);publishLibraries();
    }
    if(retain)catalogLoaded.delete(id);
    selectedAsset=id;return item;
  }
  async function openManagedAsset(id){
    await openAsset(await ensureManagedAsset(id));
  }
  const libraryManager = createBranchLibraryManager({
    organizer, async inspectAsset(id){const item=await managedAsset(id);return {item,workspaces:['TREE','BRANCH','VINE'].flatMap(key=>{const a=key===mode?api.getAuthoring():parked[key]?.authoring;if(!a)return [];const instances=a.branch_instances.filter(i=>i.asset_id===id);return instances.length?[{workspace:key,count:instances.length,revisions:[...new Set(instances.map(i=>i.pinned_revision))]}]:[];})};},
    library:()=>[...library,...assetStorage.catalog.filter(a=>!library.some(b=>b.id===a.id))],storage:()=>assetStorage.kind,
    refreshThumbnail:async id=>{const item=await managedAsset(id);if(!item)throw Error('素材已不存在');item.thumbnail=await sampleThumbnail(item,null,true);await assetStorage.cacheThumbnail(item);const local=library.find(a=>a.id===id);if(local){Object.assign(local,item);syncParkedLibraries();api.setLibrary(library);}else{const summary=assetStorage.catalog.find(a=>a.id===id);if(summary)summary.thumbnail=item.thumbnail;}refresh();},
    edit:openManagedAsset,
    contains:id=>library.some(a=>a.id===id),
    canUse:()=>mode==='TREE'&&!busy&&!api.getSkeletonEditMode(),
    use:async id=>{
      if(mode!=='TREE'||busy||api.getSkeletonEditMode())throw Error('请先返回整树预览，再选择装配素材');
      busy=true;
      try {
        await api.flush();await ensureManagedAsset(id,true);await organizer.use(id);
        $('wbAssetSearch').value='';revealAssembly();
        api.toast('已加入当前工程；从左侧拖到右侧分区，即可装配到树上');
      } finally {busy=false;refresh();requestAnimationFrame(()=>$('wbAssetLibrary').querySelector('.active')?.scrollIntoView({block:'nearest'}));}
    },
    create:async()=>{if(mode==='BRANCH'&&!await confirmAction({title:'新建单元枝？',name:'当前工作台草稿',message:'新建会替换当前草稿，请先保存需要保留的修改。',accept:'新建单元枝'}))return false;await newDraft();document.dispatchEvent(new CustomEvent('branch-workflow-show',{detail:'CREATE'}));speciesPanel.open=true;return true;},
    import:()=>$('wbAssetFile').click(),export:async id=>exportAsset(await managedAsset(id)),
    rename:async(id,name)=>renameAsset(await managedAsset(id),name),remove:async id=>deleteAsset(await managedAsset(id)),
    persist:async()=>{for(const item of library.filter(a=>!String(a.id).startsWith('PACK_')))await store.put(item);api.toast('本机素材已保存；包内原件继续使用固定版本');}
  });
  document.addEventListener('branch-catalog-pick',()=>{
    if(mode!=='TREE'||busy)return;
    if(api.getSkeletonEditMode()){api.toast('请先返回整树预览，再添加单元枝');return;}
    revealAssembly();libraryManager.open({picker:true});
  });
  const catalogTarget=$('wbAssetLibrary'), catalogType='application/x-branchforge-catalog';
  const acceptsCatalog=e=>mode==='TREE'&&!busy&&!api.getSkeletonEditMode()&&Array.from(e.dataTransfer.types).includes(catalogType);
  catalogTarget.addEventListener('dragover',e=>{if(acceptsCatalog(e)){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';catalogTarget.classList.add('catalog-over');}});
  catalogTarget.addEventListener('dragleave',e=>{if(!catalogTarget.contains(e.relatedTarget))catalogTarget.classList.remove('catalog-over');});
  catalogTarget.addEventListener('drop',e=>{
    catalogTarget.classList.remove('catalog-over');document.body.classList.remove('catalog-dragging');
    if(!acceptsCatalog(e))return;e.preventDefault();e.stopPropagation();
    const id=e.dataTransfer.getData(catalogType);if(id)libraryManager.add(id);
  });
  document.body.dataset.workbench = mode;
  organizeShapingTools({ preview: () => [stroke, influence, forms, arrays, deformation].find((tool) => tool.active && tool.dirty), flush: () => api.flush() });
  ready = Promise.all([store.list(),organizer.ready.catch(error=>api.toast(`收藏与标签记录暂不可用：${error.message}`,true))]).then(([items]) => { library = normalizeBranchLibrary(items); publishLibraries(); refresh(); }).catch((error) => { api.toast(`本地素材库不可用：${error.message}`, true); });
  window.lucide?.createIcons({ nodes: [bar, section] });
  return { ready, unitEditor, unitRules, tools, views, installation, unitBrushes, context, deformation, forms, arrays, stroke, influence, instances, symmetry, versions, refresh, newDraft, get mode() { return mode; }, get busy() { return busy; }, get library() { return library; },
    async inspectBranch(id,sourceItem=null){
      const item=sourceItem||await managedAsset(id);if(!item)throw Error('这款单元枝暂时无法读取，请刷新后重试');
      // A catalog source can share an atlas with another catalog source that is
      // absent from this project. Resolve that reference without installing it.
      let sample=item.sample,inspection=item;const visited=new Set();
      while(sample&&!sample.authoring?.leaf_material&&sample.material_asset_id){
        const ownerId=sample.material_asset_id;if(visited.has(ownerId))throw Error('单元枝共享材质引用存在循环');visited.add(ownerId);
        const owner=library.find(entry=>entry.id===ownerId)||await assetStorage.get(ownerId);
        if(!owner?.sample)throw Error('单元枝引用的共享材质已缺失，请重新导入完整素材');sample=owner.sample;
        if(!sample.authoring?.leaf_material&&!sample.material_asset_id)throw Error('单元枝引用的共享材质已缺失，请重新导入完整素材');
      }
      if(visited.size)inspection={...item,sample:{...item.sample,material_asset_id:'',authoring:{...item.sample.authoring,leaf_material:sample.authoring.leaf_material}}};
      const document=documentForAsset(inspection),owned=item.sample?.authoring?.branch_library||[];
      if(owned.length)document.authoring.branch_library=[...owned,...document.authoring.branch_library.filter(entry=>!owned.some(source=>source.id===entry.id))];return {item,document};
    },
    vines, candidates: candidateWorkspace, plantUnits, skeletonThickness, trunkForm, assemblyGrowth, localAssembly, groupControls, treeRecipes, prefabs, organizer, regenerateAssembly, assemblyLinks,libraryManager,
    async refreshPackageLibraries(){await assetStorage.refreshPackages();await prefabs.reload();await plantUnits.reload();refresh();},
    async newVineDraft() { await api.flush(); await switchMode('VINE', await vineDraft(api.capture())); },
    serialize({ omitActive = false } = {}) { const docs = { ...parked, [mode]: omitActive ? null : api.capture({includeHistory:false}) }; return { version: 2, active: mode, tree: docs.TREE ? cloneDocument(docs.TREE) : null, branch: docs.BRANCH ? cloneDocument(docs.BRANCH) : null, vine: docs.VINE ? cloneDocument(docs.VINE) : null }; },
    async load(project, {progress=async()=>{},origin={}}={}) {
      unitBrushes.reset();
      groupControls.cancel();
      if (busy||prefabs.busy) throw new Error('工作区或预制操作进行中，请完成后再载入');
      trunkOwnsSkeletonMode = false;
      libraryManager.closePicker();
      assemblyGrowth.deactivate();
      localAssembly.cancel();localAssembly.stop();
      unitEditor.deactivate(); skeletonThickness.resetInputs(); trunkForm.resetInputs();
      busy = true;
      try {
      api.loadPrefabAssets(project.prefab_assets);prefabs.projectChanged();
      await ready; symmetry.deactivate(); versions.close(); deformation.cancel(); instances.deactivate(); installation.cancel(); views.cancel(); context.cancel(); tools.activate(''); const saved = project.workspaces;
      vines.cancel(); mode = saved?.active === 'VINE' && saved.vine ? 'VINE' : saved?.active === 'BRANCH' && (saved.branch || project.authoring?.branch_shape) ? 'BRANCH' : project.authoring?.vine && !saved ? 'VINE' : 'TREE'; parked = { TREE: saved?.tree || null, BRANCH: saved?.branch || null, VINE: saved?.vine || null };
      const embedded = normalizeBranchLibrary([...(parked.TREE?.authoring?.branch_library || []), ...(parked.BRANCH?.authoring?.branch_library || []), ...(project.authoring?.branch_library || [])]);
      // A file load replaces the project; previous trees stay in the disk catalog.
      // Retaining their full sample payloads here made each load grow the heap.
      library = embedded; catalogLoaded.clear(); selectedAsset = ''; selectedInstance = '';
      document.body.dataset.workbench = mode;
      const active = parked[mode] || project;
      const treeSource = parked.TREE || (mode === 'TREE' ? active : null);
      const embeddedIds = new Set(embedded.map((item) => item.id));
      if (treeSource) for (const item of library) if (embeddedIds.has(item.id) && !item.sample)
        Object.assign(item, recoverLegacyBranchAsset(item, treeSource));
      const stale=library.filter(item=>embeddedIds.has(item.id)&&staleThumbnail(item));
      await progress(1,`整理 ${library.length} 款单元枝素材`);
      for (let n=0;n<stale.length;n++){await progress(1,`更新预览 ${n+1} / ${stale.length}`);stale[n].thumbnail=await sampleThumbnail(stale[n],treeSource);}
      syncParkedLibraries();
      active.authoring = { ...active.authoring, branch_library: library }; await api.restore(active,progress); parked[mode] = null; refresh();
      if (mode === 'TREE' && embedded.length) revealAssembly();
      if(mode==='BRANCH')document.dispatchEvent(new CustomEvent('branch-workflow-show',{detail:'ADJUST'}));
      api.projectLoaded?.(origin);
      } finally { busy = false; refresh(); }
    },
    key(event) { if (groupControls.key(event)) return true; if (localAssembly.key(event)) return true; if (unitEditor.key(event)) return true; if (vines.key(event)) return true; if (document.querySelector('#pendingToolDialog[open]')) return true; if (stroke.key(event) || influence.key(event) || forms.key(event) || arrays.key(event) || deformation.key(event) || instances.key(event) || installation.key(event)) return true; if (event.key === 'Escape' && (views.cancel() || context.cancel())) return true; if (event.key !== 'Escape' || !tools.active) return false; if (!tools.cancel()) tools.activate(''); return true; },
  };
}


