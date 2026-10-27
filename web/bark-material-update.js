import {markNativeModelChanged} from './native-model-changes.js';
import {equalData} from './branch-workbench-data.js';
import {skeletonBranches} from './skeleton-thickness.js';
import {normalizeBarkMaterial,createBarkSurfaceMaterial} from './bark-materials.js';

const withoutBark=a=>{const {workbench,...rest}=a;const {bark_materials,...other}=workbench||{};return {...rest,workbench:other};};
const dispose=m=>{for(const key of ['map','normalMap','roughnessMap'])m[key]?.dispose();m.dispose();};

// Resource-only transaction: never rebuild geometry or mutate complete sources.
export function updateBarkMaterialResources(asset,previous,next,{beforeCommit=()=>{}}={}){
  if(!asset||!previous||!next||!equalData(previous.settings,next.settings)
    ||!equalData(previous.leaf_sources,next.leaf_sources)
    ||equalData(previous.authoring.workbench?.bark_materials,next.authoring.workbench?.bark_materials)
    ||!equalData(withoutBark(previous.authoring),withoutBark(next.authoring)))return false;
  return refreshStructuralBarkMaterials(asset,next,{beforeCommit});
}

// Replacing a swept surface can change its real perimeter without changing the
// saved material recipe. Refresh only those carriers' physical texture repeats.
export function refreshStructuralBarkMaterials(asset,next,{beforeCommit=()=>{},forceIds=new Set(),surfaceOverrides=new Map()}={}){
  const started=performance.now(),rendered=new Map(asset.branches.map(b=>[b.stableId,b]));
  const structural=new Set(skeletonBranches(asset.masterBranches).filter(b=>!b.sourceAssetId&&!b.sourceInstanceId).map(b=>b.stableId));
  const surfaceById=new Map(),targets=[];
  asset.group.traverse(o=>{if(o.isMesh&&structural.has(o.userData.stable_id)&&['branch','junction'].includes(o.userData.category)){
    targets.push(o);if(o.userData.category==='branch')surfaceById.set(o.userData.stable_id,o.geometry.userData.barkSurface);
  }});
  if(!targets.length)return false;
  const assignments=next.authoring.workbench?.bark_materials,recipes=new Map(),palette=new Map(),changes=[];
  try{
    for(const mesh of targets){
      const id=mesh.userData.stable_id,branch=rendered.get(id);if(!branch)throw Error('树皮更新缺少对应枝干');
      const raw=assignments?.version===1?(Object.hasOwn(assignments.branches||{},id)?assignments.branches[id]:assignments.default):null;
      let record=recipes.get(raw);if(raw&&!record){record={recipe:normalizeBarkMaterial(raw),id:recipes.size};recipes.set(raw,record);}
      const original=mesh.userData.originalMaterial||mesh.material;
      if(record&&!forceIds.has(id)&&equalData(original.userData?.bark_material,record.recipe))continue;
      const surface=surfaceOverrides.has(id)?surfaceOverrides.get(id):surfaceById.get(id),key=record?[record.id,branch.startRadius,Boolean(surface),surface?.referencePerimeter].join(':'):'legacy';
      let material=palette.get(key);
      if(!material){material=record?createBarkSurfaceMaterial(record.recipe,{branch,settings:next.settings,continuousBark:!!surface,referencePerimeter:surface?.referencePerimeter}):asset.materials.bark;palette.set(key,material);}
      changes.push({mesh,material});
    }
    beforeCommit();
  }catch(error){for(const m of new Set(palette.values()))if(m!==asset.materials.bark)dispose(m);throw error;}
  for(const {mesh,material}of changes){mesh.material=material;if(mesh.userData.originalMaterial)mesh.userData.originalMaterial=material;}
  if(changes.length)markNativeModelChanged(asset);
  const used=new Set();asset.group.traverse(o=>{if(o.isMesh)for(const m of [o.material,o.userData.originalMaterial].filter(Boolean).flat())used.add(m);});
  const owned=new Set([...(asset.unitBarkMaterials||[]),...[...palette.values()].filter(m=>m!==asset.materials.bark)]);
  asset.unitBarkMaterials=[...owned].filter(m=>used.has(m));for(const m of owned)if(!used.has(m))dispose(m);
  asset.authoring=next.authoring;asset.settings=next.settings;asset.group.userData.pending_rebuild=false;
  asset.report.bark_update={updated_meshes:changes.length,palette_materials:palette.size,ms:performance.now()-started};return true;
}
