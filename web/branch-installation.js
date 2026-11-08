import * as THREE from 'three';
import { buildBranchAsset, disposeBranchAsset, deserializeGeometry, branchInstanceFrame } from './branch-kernel.js';
import { copy } from './branch-workbench-data.js';
import { branchRadiusAt } from './branch-shaping.js';
import { applyAssemblyScale, assemblyScaleState, assemblyCardScale } from './assembly-scale.js';
import { completeInstanceMatrix } from './branch-instance-matrix.js';
import { sampleLeafMaterial, sampleLeafMaterialName, syncLeafMaterialVariants } from './leaf-material-data.js';
import { applyLeafMaterial, waitForLeafTextures } from './leaf-resources.js';
import { resolveSampleMaterial } from './sample-materials.js';
import { assemblyBranchLimit } from './local-assembly-data.js';
import {pickImportedTrunkAttachment} from './imported-trunk-picker.js';
import {branchMountAt} from './branch-mount-frame.js';
import {lineTangent,nearestParameter,sampleLine} from './tree-sculpt.js';

function branchSurfaceTarget(hit,branch,attach,point,inverseWorld) {
  const meshMatrix=hit.object.matrixWorld.clone();
  if(hit.object.isInstancedMesh&&hit.instanceId!==undefined){
    const instanceMatrix=new THREE.Matrix4();
    hit.object.getMatrixAt(hit.instanceId,instanceMatrix);
    meshMatrix.multiply(instanceMatrix);
  }
  meshMatrix.premultiply(inverseWorld);
  const direction=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(meshMatrix));
  const surfaceDirection=direction.clone();
  const position=point.clone(),center=sampleLine(branch.points,attach),tangent=lineTangent(branch.points,attach);
  const mount=branchMountAt(branch,attach);
  if(mount){
    const inverse=mount.clone().invert();
    position.applyMatrix4(inverse);center.applyMatrix4(inverse);
    direction.transformDirection(inverse);tangent.transformDirection(inverse);
  }
  return {parent:branch.stableId,attach,trunk_anchor:null,
    frame:{position:position.toArray(),direction:direction.toArray(),parent_tangent:tangent.toArray(),parent_position:center.toArray()},
    surface_frame:{position:point,direction:surfaceDirection}};
}

export function pickBranchPlacementTarget(event,{canvas,camera,asset,authoring,ray,surface=false,cast}) {
  if(!asset)return null;
  const rect = canvas.getBoundingClientRect();
  const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
  if(surface&&!(x>=0&&x<=1&&y>=0&&y<=1))return null;
  camera.updateWorldMatrix(true,false);
  ray.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),camera);
  return (cast||createBranchPlacementRaycast({asset,authoring,surface}))(ray);
}

export function createBranchPlacementRaycast({asset,authoring,surface=false}) {
  const meshes=[];
  const byStable=new Map(asset.masterBranches.map(branch=>[branch.stableId,branch]));
  const byId=new Map(asset.masterBranches.map(branch=>[branch.id,branch]));
  const indexed=new Map();
  let unindexed=null;
  asset.group.updateWorldMatrix(true,true);
  asset.group.traverseVisible(o=>{if(o.isMesh&&(o.userData.category==='branch'||surface&&o.userData.category==='junction'))meshes.push(o);});
  const inverseWorld=asset.group.matrixWorld.clone().invert();
  function carrierMeshes(carrier){
    if(!unindexed){
      unindexed=[];
      const mounts=new Map(authoring?.imported_trunks?.mounts?.map(mount=>[mount.id,Object.values(mount.guide_map)])||[]);
      for(const mesh of meshes){
        const data=mesh.userData,bindings=mesh.isInstancedMesh?asset.editPreviewBindings?.(mesh)?.instances:null;
        const owners=data.imported_trunk?mounts.get(data.trunk_mount_id)
          :bindings?bindings.map(binding=>binding.stableId||binding.object().userData.stable_id)
          :[data.stable_id||byId.get(data.branch_id)?.stableId];
        if(!owners?.length||owners.some(id=>!id)){unindexed.push(mesh);continue;}
        for(const id of new Set(owners)){
          if(!indexed.has(id))indexed.set(id,[]);
          indexed.get(id).push(mesh);
        }
      }
    }
    const candidates=indexed.get(carrier.stableId)||[];
    return unindexed.length?[...candidates,...unindexed]:candidates;
  }
  return (ray,{carrier,nearPoint}={})=>{
    const hits=ray.intersectObjects(carrier?carrierMeshes(carrier):meshes,false);
    if(nearPoint)hits.sort((a,b)=>a.point.distanceToSquared(nearPoint)-b.point.distanceToSquared(nearPoint));
    for(const hit of hits){
      if(hit.object.userData.imported_trunk){
        if(carrier&&!carrier.importedTrunkHost)continue;
        const target=pickImportedTrunkAttachment(asset,authoring,hit);
        if(!carrier||target?.parent===carrier.stableId)return target;
        continue;
      }
      const data=hit.object.userData;
      const descriptor=hit.object.isInstancedMesh&&asset.editPreviewBindings?.(hit.object)?.instances?.[hit.instanceId];
      const branchData=descriptor?.object().userData||data;
      const branch=branchData.stable_id?byStable.get(branchData.stable_id):byId.get(branchData.branch_id);
      if(carrier&&branch!==carrier)continue;
      if(!branch){if(surface)return null;continue;}
      if(surface&&branch.importedTrunkHost)return null;
      const point=hit.point.clone().applyMatrix4(inverseWorld),t=nearestParameter(branch.points,point);
      if(surface)return branchSurfaceTarget(hit,branch,t,point,inverseWorld);
      return {parent:branch.stableId,attach:THREE.MathUtils.clamp(t,.02,.98),trunk_anchor:null,frame:null,surface_frame:null};
    }
    return null;
  };
}

export function createBranchInstallation(api) {
  const { canvas, camera, modelRoot } = api; const ray = new THREE.Raycaster(); const ghostRoot = new THREE.Group(); ghostRoot.name = 'BranchPlacementPreview'; modelRoot.add(ghostRoot);
  const bar = document.createElement('div'); bar.id = 'branchPlacementBar'; bar.hidden = true;
  bar.innerHTML = `<span id="placementTarget">未选择挂接枝</span><label><input id="placementContinuous" type="checkbox">连续安装</label><button id="placementConfirm" title="确认安装" aria-label="确认安装"><i data-lucide="check"></i></button><button id="placementCancel" title="取消安装" aria-label="取消安装"><i data-lucide="x"></i></button>`;
  canvas.parentElement.append(bar);
  let pending = null, ghost = null, timer = null, generation = 0, committing = false, sourceGeometries=[];
  function clearGhost() { if (ghost) { ghostRoot.remove(ghost.group); disposeBranchAsset(ghost); ghost = null; }sourceGeometries.forEach(g=>g.dispose());sourceGeometries=[]; }
  function cancel() { if (!pending) return false; pending = null; generation++; clearTimeout(timer); timer = null; clearGhost(); bar.hidden = true; document.body.classList.remove('branch-placement-active'); return true; }
  const hit = event => pickBranchPlacementTarget(event,{canvas,camera,ray,asset:api.getAsset(),authoring:api.getAuthoring()});
  function values() {
    const result = { ...api.values(), attach: pending.attach };
    if(pending.trunk_anchor){result.trunk_anchor=pending.trunk_anchor;result.frame=pending.frame;}
    if (api.matchRadius()) { const parent = api.getAsset().masterBranches.find((b) => b.stableId === pending.parent); const root = pending.asset.shape.branches[0]; if (parent) result.scale = Math.max(0.05, Math.min(5, branchRadiusAt(parent, api.getSettings(), pending.attach) * 0.65 / root.start_radius)); }
    return result;
  }
  function rebuild() {
    timer = null; if (!pending?.parent) return;
    if(api.getAsset().masterBranches.find(b=>b.stableId===pending.parent)?.importedTrunkHost&&!pending.trunk_anchor){clearGhost();bar.querySelector('#placementTarget').textContent='请在导入树干表面选取挂点';return;}
    const authoring = api.getAuthoring(); const item = { id: 'PLACEMENT_PREVIEW', asset_id: pending.asset.id, shape: pending.asset.shape, parent: pending.parent, ...values() };
    item.linked = api.linked();
    if (authoring.workbench?.assembly_scale) {const state=assemblyScaleState(authoring.workbench);item.scale*=state.overall*(item.linked?assemblyCardScale(authoring.workbench,item.shootRole || 'ANY',item.asset_id):1);}
    if(!ghost){
      const sample=pending.asset.sample,local=sample?.authoring||{},texture=sampleLeafMaterial(sample,authoring.branch_library,authoring.leaf_material);
      const sources=(sample?.leaf_meshes||[]).map(s=>{const geometry=deserializeGeometry(s.geometry);sourceGeometries.push(geometry);const ownTexture=resolveSampleMaterial(s,local,sample)||texture;return {...s,geometry,sampleLeafMaterial:ownTexture,sampleLeafMaterialName:sampleLeafMaterialName(s.id,ownTexture,authoring.leaf_material)};});
      // Match the installed complete unit's own palette, including wood. The
      // ghost owns these materials; leaf textures bound below remain borrowed
      // from the shared cache and are not disposed with its private bark grain.
      ghost=buildBranchAsset({...api.getSettings(),...(sample?.settings||{}),wind_strength:0,preview_lod:0},null,sources,0,{...local,branch_shape:copy(pending.asset.shape),branch_library:[],branch_instances:[],__sampleOrganMaterial:texture,__sampleBaseMaterial:authoring.leaf_material,leaf_material:texture,tree_organs:{...local.tree_organs,units:local.tree_organs?.units?.length?local.tree_organs.units:authoring.tree_organs.units.filter(u=>pending.asset.organ_source_ids.includes(u.id))},recipe:{...local.recipe,tags:(local.recipe?.tags||[]).filter(t=>!['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY'].includes(t))}});
      syncLeafMaterialVariants(ghost,applyLeafMaterial);
      ghost.group.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.transparent=true;m.opacity=.62;m.depthWrite=false;}});
      const built=ghost;built.group.visible=false;
      waitForLeafTextures(built.group).then(()=>{if(ghost===built)built.group.visible=true;});
      ghost.group.matrixAutoUpdate=false;ghostRoot.add(ghost.group);
    }
    let parent=api.getAsset().masterBranches.find(b=>b.stableId===pending.parent);
    if(pending.surface_binding)parent={...parent,trunkAttachments:new Map([[item.id,pending.surface_binding]])};
    ghost.group.matrix.copy(completeInstanceMatrix(item,pending.asset.shape,parent,api.getSettings(),branchInstanceFrame));ghost.group.matrixWorldNeedsUpdate=true;
    bar.querySelector('#placementTarget').textContent = `${pending.asset.name} → ${pending.parent} · ${Math.round(pending.attach * 100)}%`;
  }
  function update() { if (!pending) return; clearTimeout(timer); timer = setTimeout(() => { try { rebuild(); } catch (error) { api.toast(error.message, true); cancel(); } }, 70); }
  function begin(asset, target = null) {
    if (!asset || !api.isTree()) return false;
    cancel(); api.setTool('SELECT'); api.clearInstanceSelection(); pending = { asset: copy(asset), parent: target?.parent || api.getSelection(), attach: target?.attach ?? api.values().attach,...(target||{}) }; bar.hidden = false; document.body.classList.add('branch-placement-active');
    if (!pending.parent) bar.querySelector('#placementTarget').textContent = '未选择挂接枝'; else update(); return true;
  }
  async function confirm() {
    if (committing || !pending?.parent) return;
    committing = true; const revision = generation; const current = { ...pending }; const settings = values();
    try {
      await api.flush(); if (!pending || revision !== generation) return;
      if (!api.getAsset().masterBranches.some((b) => b.stableId === current.parent)) throw new Error('挂接枝已被移除');
      if(api.getAsset().masterBranches.find(b=>b.stableId===current.parent)?.importedTrunkHost&&!current.trunk_anchor)throw Error('请先在导入树干的真实表面点选挂点');
      const limit=assemblyBranchLimit(api.getAuthoring());
      if (api.getAuthoring().branch_instances.length>=1600 || api.getAsset().masterBranches.length + current.asset.shape.branches.length > limit) throw new Error(`安装后超过当前${limit}枝段或1600支成品预算`);
      await api.ensureAssets?.([current.asset.id]);if(!pending||revision!==generation)return;
      const instanceId = `INST_${crypto.randomUUID().replaceAll('-', '')}`;
      api.transact('安装单元枝', (a) => { a.branch_instances.push({ id: instanceId, asset_id: current.asset.id, linked: api.linked(),pinned_revision:api.pinnedRevision?.(current.asset)||0,assembly_manual:true, shape: copy(current.asset.shape), parent: current.parent, ...settings }); if (a.workbench?.assembly_scale) applyAssemblyScale(a); }, { bypassLayers: true });
      if (!bar.querySelector('#placementContinuous').checked) cancel(); else { clearGhost(); pending.parent = ''; bar.querySelector('#placementTarget').textContent = '未选择挂接枝'; }
      await api.flush(); api.select(`${instanceId}.${current.asset.shape.branches[0].id}`); api.installed(instanceId);
    } catch (error) { api.toast(error.message, true); } finally { committing = false; }
  }
  canvas.addEventListener('dragover', (event) => { if (!api.isTree() || !event.dataTransfer.types.includes('application/x-branchforge-asset')) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; const target = hit(event); if (pending && target) { Object.assign(pending, target); api.setAttach(target.attach); update(); } });
  canvas.addEventListener('drop', (event) => { if (!api.isTree()) return; const item = api.assetById(event.dataTransfer.getData('application/x-branchforge-asset')); if (!item) return; event.preventDefault(); const target = hit(event); begin(item, target); });
  bar.querySelector('#placementConfirm').onclick = confirm; bar.querySelector('#placementCancel').onclick = cancel;
  return { begin, cancel, update, confirm, root: ghostRoot, get active() { return Boolean(pending); }, get pending() { return pending; },
    move(event) { if (!pending || committing) return false; if (event.buttons === 4) return true; const target = hit(event); if (target && (target.parent !== pending.parent || Math.abs(target.attach - pending.attach) > 0.002 || target.trunk_anchor&&(!pending.surface_frame||target.surface_frame.position.distanceTo(pending.surface_frame.position)>.002))) { Object.assign(pending, target); api.setAttach(target.attach); update(); } return true; },
    pointerDown(event) { if (!pending || event.button !== 0) return false; const target = hit(event); if (target) { Object.assign(pending, target); confirm(); } return true; },
    key(event) { if (!pending) return false; if (event.key === 'Escape') { cancel(); return true; } if (event.key === 'Enter' && !event.target.matches?.('input,select,textarea')) { confirm(); return true; } return false; },
  };
}
