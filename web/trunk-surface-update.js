import {markNativeModelChanged} from './native-model-changes.js';
import * as THREE from './vendor/three.module.min.js';
import {equalData} from './branch-workbench-data.js';
import {normalizeTrunkForms} from './trunk-form.js';
import {refreshStructuralBarkMaterials} from './bark-material-update.js';
import {analyzeGroup} from './branch-kernel.js';

const withoutForms=a=>{const {workbench,...rest}=a;const {trunk_forms,...other}=workbench||{};return {...rest,workbench:other};};
const continuous=(asset,a)=>Boolean(asset.skeletonOnly||a.branch_library.length||Object.keys(a.workbench?.trunk_forms?.branches||{}).length);

// A trunk-form edit changes the carrier's surface, not its centreline, hierarchy
// or complete-unit placement. Stage every buffer before releasing the preview.
export function updateTrunkSurfaceResources(asset,previous,next,geometries,{beforeCommit=()=>{}}={}){
  if(!asset||!previous||!geometries?.size||!equalData(previous.settings,next.settings)
    ||!equalData(previous.leaf_sources,next.leaf_sources)
    ||!equalData(withoutForms(previous.authoring),withoutForms(next.authoring))
    ||continuous(asset,previous.authoring)!==continuous(asset,next.authoring))return false;
  const forms=normalizeTrunkForms(next.authoring.workbench?.trunk_forms).branches;
  const meshes=new Map();asset.group.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&o.userData.category==='branch')meshes.set(o.userData.stable_id,o);});
  const staged=[],surfaces=new Map();
  for(const [id,geometry] of geometries){
    const mesh=meshes.get(id),branch=asset.branches.find(b=>b.stableId===id),lookup=mesh?.geometry.getAttribute('uv1');
    if(!mesh||!branch||branch.instanceId||branch.unitOwner||branch.sourceAssetId||branch.copySnapshot||branch.localBundle||!lookup||!geometry.getAttribute('uv'))return false;
    const uv=new Float32Array(geometry.attributes.position.count*2),x=lookup.getX(0),y=lookup.getY(0);
    for(let n=0;n<uv.length;n+=2){uv[n]=x;uv[n+1]=y;}
    geometry.setAttribute('uv1',new THREE.BufferAttribute(uv,2));geometry.setAttribute('uv2',geometry.attributes.uv.clone());
    surfaces.set(id,geometry.userData.barkSurface);staged.push({id,mesh,geometry,old:null});
  }
  let extraWarnings=[];
  const committed=refreshStructuralBarkMaterials(asset,next,{forceIds:new Set(geometries.keys()),surfaceOverrides:surfaces,beforeCommit:()=>{
    beforeCommit();
    const oldWarnings=new Set(analyzeGroup(asset.group,next.settings,asset.geometryQualityCache).warnings);
    extraWarnings=asset.report.warnings.filter(w=>!oldWarnings.has(w));
    for(const record of staged){record.old=record.mesh.geometry;record.mesh.geometry=record.geometry;}
    if(staged.length)markNativeModelChanged(asset);
  }});
  if(!committed)return false;
  for(const b of [...asset.masterBranches,...asset.branches])if(surfaces.has(b.stableId)){
    if(forms[b.stableId])b.trunkForm=forms[b.stableId];else delete b.trunkForm;
    b.barkSurface=surfaces.get(b.stableId);
  }
  asset.syncTrunkSurfaceMetadata?.(forms,surfaces);
  const report=analyzeGroup(asset.group,next.settings,asset.geometryQualityCache);
  report.warnings.push(...extraWarnings);report.ok&&=!(asset.report.attachment_overlap_ratio>asset.report.attachment_overlap_limit);
  Object.assign(asset.report,report,{surface_update:{updated_branches:staged.length}});
  for(const {id,old}of staged){geometries.delete(id);old.dispose();}
  return true;
}
