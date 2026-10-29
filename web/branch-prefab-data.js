import * as THREE from './vendor/three.module.min.js';
import {captureLinkedBranchDuplicate} from './linked-branch-duplicate.js';
import {selectionRoots} from './branch-selection.js';
import {appendBranchDuplicate,normalizeBranchDuplicate} from './branch-duplicate.js';
import {cloneAxis} from './branch-axis.js';
import {sampleLine,lineTangent} from './tree-sculpt.js';
import {instanceMatrix} from './branch-instance-edit.js';
import {instanceFromMatrix} from './branch-instance-operations.js';
import {resolveInstanceAsset,resolveInstanceShape,copy} from './branch-workbench-data.js';
import {sampleLeafMaterial} from './leaf-material-data.js';
import {resolveSampleMaterial} from './sample-materials.js';
import {barkMaterialForBranch} from './bark-materials.js';
import {createDefaultLeafGeometry,serializeGeometry} from './branch-kernel.js';
import {packageOrigins,collectPackageOrigins} from './asset-origins.js';

const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function defaultLeaf(settings,id,material,manual_only=false){const geometry=createDefaultLeafGeometry(settings.leaf_aspect);try{return {id,name:'内置阔叶',weight:1,orderMin:0,orderMax:3,season:'ANY',ageStage:'ANY',shootRole:'ANY',calibration:{scale:1,rotation:0,flip:false},geometry:serializeGeometry(geometry),sampleLeafMaterial:copy(material),...(manual_only?{manual_only:true}:{})};}finally{geometry.dispose();}}
const basis=(origin,z,reference)=>{
  z=z.clone().normalize();let x=reference.clone().addScaledVector(z,-reference.dot(z));
  if(x.lengthSq()<1e-8){x=new THREE.Vector3(Math.abs(z.z)<.9?0:1,0,Math.abs(z.z)<.9?1:0);x.addScaledVector(z,-x.dot(z));}
  x.normalize();return new THREE.Matrix4().makeBasis(x,new THREE.Vector3().crossVectors(z,x).normalize(),z).setPosition(origin);
};
function transformRecords(operation,matrix){
  for(const r of operation.records){
    for(const key of ['points','controlPoints'])r[key]=r[key].map(p=>new THREE.Vector3(...p).applyMatrix4(matrix).toArray());
    if(r.surfaceNormals)r.surfaceNormals=r.surfaceNormals.map(p=>new THREE.Vector3(...p).transformDirection(matrix).toArray());
    r.mountMatrix=matrix.clone().multiply(r.mountMatrix?new THREE.Matrix4().fromArray(r.mountMatrix):new THREE.Matrix4()).toArray();
  }
}
function portableAsset(asset,library,fallback){
  const result=copy(asset);
  for(const entry of [result,...result.versions||[]])if(entry.sample){
    entry.sample.authoring||={};entry.sample.authoring.leaf_material=copy(sampleLeafMaterial(entry.sample,library,fallback));entry.sample.material_asset_id='';
  }
  return result;
}

// The library stores an evaluated carrier, not its unrelated tree/history.
// Clean complete samples remain shared source instances; existing historical
// complete-unit snapshots retain their existing ownership boundary.
export function captureBranchPrefab(asset,document,selected,leafSources=[],{id,name}={}){
  if(asset.skeletonOnly)throw Error('保存预制枝干需要完整装配数据');
  const roots=selectionRoots(asset.masterBranches,new Set(selected));
  if(roots.length!==1)throw Error('请选中一支大枝干；下级枝干和完整单元枝会一起保存');
  const root=roots[0];if(root.unitOwner||root.instanceId||root.symmetryGroup)throw Error('请选择承重骨架上的整支枝干，单元枝请使用单元枝成品库');
  if(asset.authoring.imported_trunks?.mounts.some(m=>Object.values(m.guide_map).includes(root.stableId)))throw Error('导入树干请在树干整理台保存为树干素材；预制枝干用于保存挂接的大枝');
  const mother=asset.masterBranches.find(b=>b.id===root.parentId),tangent=lineTangent(root.points,0),reference=mother?lineTangent(mother.points,root.parentT):new THREE.Vector3(0,0,1);
  const local=basis(root.points[0],tangent,reference).invert();
  const captured=captureLinkedBranchDuplicate(asset,new Set([root.stableId]),'PFB',leafSources),{operation,copies,mapping}=captured;
  const byOld=new Map(asset.masterBranches.map(b=>[b.stableId,b])),byNew=new Map();
  transformRecords(operation,local);
  const forms={},bark={};
  for(const [old,next]of mapping){const b=byOld.get(old),r=operation.records.find(r=>r.id===next);if(!r)continue;
    if(!b.unitOwner&&!b.instanceId){r.properties.prefabCarrier=true;if(b.trunkForm)forms[next]=copy(b.trunkForm);const material=barkMaterialForBranch(asset.authoring,old);if(material)bark[next]=material;}
  }
  for(const r of operation.records)if(r.root){r.parent='';r.frame=null;r.parentT=0;}
  const proxies=[];appendBranchDuplicate(proxies,operation);proxies.forEach(b=>byNew.set(b.stableId,b));
  const originals=new Map(asset.authoring.branch_instances.map(i=>[i.id,i]));
  for(const item of copies){
    const old=[...mapping].find(([key,next])=>next.startsWith(item.id+'.')&&byOld.get(key)?.instanceId),original=originals.get(byOld.get(old?.[0])?.instanceId);
    if(!original)throw Error('预制枝干的单元枝来源不完整，请重载工程后再保存');
    const shape=resolveInstanceShape(original,asset.authoring.branch_library),parent=byNew.get(item.parent);
    if(!parent)throw Error('单元枝的母枝未包含在所选大枝干中');
    Object.assign(item,instanceFromMatrix(item,shape,parent,local.clone().multiply(instanceMatrix(original,shape,asset.masterBranches,asset.settings))));
    // A compiled unit inherits its carrier frame. Nested instances use that
    // same frame rather than the unit's complete source-model transform.
    for(const [oldId,newId]of mapping)if(newId.startsWith(item.id+'.')){
      const before=byOld.get(oldId);byNew.set(newId,{...before,stableId:newId,points:cloneAxis(before.points,p=>p.clone().applyMatrix4(local)),mountMatrix:parent.mountMatrix.clone(),mountFrames:null,mountFrameBinding:null});
    }
  }
  const needed=new Set([...copies.map(i=>i.asset_id),...operation.records.map(r=>r.sourceAssetId)].filter(Boolean));
  const library=asset.authoring.branch_library.filter(a=>needed.has(a.id)).map(a=>portableAsset(a,asset.authoring.branch_library,asset.authoring.leaf_material));
  const leafIds=new Set(operation.records.flatMap(r=>r.leaves||[]).map(u=>u.source_id)),organIds=new Set(operation.records.flatMap(r=>r.organs||[]).map(u=>u.source_id));
  const sourceCopy=s=>{const result={...copy(s),manual_only:true,sampleLeafMaterial:copy(resolveSampleMaterial(s,asset.authoring)||asset.authoring.leaf_material)};delete result.sampleLeafMaterialId;delete result.sampleLeafMaterialName;return result;};
  const leaves=(document.leaf_meshes||[]).filter(s=>leafIds.has(s.id)).map(sourceCopy),organs=(asset.authoring.tree_organs.units||[]).filter(s=>organIds.has(s.id)).map(sourceCopy);
  if(!leafSources.length&&operation.records.some(r=>(r.leaves||[]).some(u=>!u.source_id))){leaves.push(defaultLeaf(asset.settings,'PFB_DEFAULT_LEAF',asset.authoring.leaf_material,true));for(const r of operation.records)for(const u of r.leaves||[])if(!u.source_id)u.source_id='PFB_DEFAULT_LEAF';}
  return {kind:'branchforge-branch-prefab',version:1,id,name:String(name||'预制枝干').trim().slice(0,80),createdAt:Date.now(),
    operation,copies,library,leaf_meshes:leaves,organ_units:organs,forms,bark,settings:{...asset.settings,wind_strength:0,preview_lod:0},
    angle:mother?tangent.angleTo(reference):Math.PI/3,counts:{carriers:operation.records.filter(r=>!r.owner).length,units:copies.length+new Set(operation.records.map(r=>r.owner).filter(Boolean)).size}};
}

export function validateBranchPrefab(value){
  if(value?.kind!=='branchforge-branch-prefab'||value.version!==1||!Array.isArray(value.copies)||!Array.isArray(value.library))throw Error('预制枝干数据无效或版本不支持');
  const operation=normalizeBranchDuplicate(value.operation||{});
  if(!operation||operation.records.length!==value.operation.records.length||operation.targets.length!==1)throw Error('预制枝干骨架不完整');
  return value;
}
export function prefabPlacement(prefab,parent,attach,point=null){
  const origin=sampleLine(parent.points,attach),tangent=lineTangent(parent.points,attach);
  let radial=point?.clone().sub(origin)||new THREE.Vector3(1,0,0);radial.addScaledVector(tangent,-radial.dot(tangent));
  if(radial.lengthSq()<1e-8)radial=new THREE.Vector3(Math.abs(tangent.x)<.9?1:0,Math.abs(tangent.x)<.9?0:1,0).addScaledVector(tangent,-(Math.abs(tangent.x)<.9?tangent.x:tangent.y));
  radial.normalize();const angle=THREE.MathUtils.clamp(prefab.angle,.08,Math.PI-.08),direction=tangent.clone().multiplyScalar(Math.cos(angle)).addScaledVector(radial,Math.sin(angle));
  return basis(origin,direction,tangent);
}
const definition=a=>({shape:a.shape,sample:a.sample,versions:a.versions,revision:a.revision,leaf_source_ids:a.leaf_source_ids,organ_source_ids:a.organ_source_ids});
const sameModel=(a,b)=>JSON.stringify(a,(key,value)=>key==='package_origins'?undefined:value)===JSON.stringify(b,(key,value)=>key==='package_origins'?undefined:value);
// Pure, transactional insertion. All foreign identifiers are reconciled before
// changing the draft. Installing the same prefab again reuses the same assets.
export function insertBranchPrefab(document,prefab,{parent='',attach=0,matrix=new THREE.Matrix4(),parentTangent=null,surface=null,token}={}){
  validateBranchPrefab(prefab);const doc=copy(document),a=doc.authoring,operation=copy(prefab.operation),copies=copy(prefab.copies);
  const assetIds=new Map();a.branch_library||=[];
  for(const incoming of prefab.library){
    const matches=x=>sameModel(definition(portableAsset(x,a.branch_library,a.leaf_material)),definition(incoming));
    let current=a.branch_library.find(x=>x.id===incoming.id&&matches(x))||a.branch_library.find(matches);
    if(!current){let id=incoming.id,n=1;while(a.branch_library.some(x=>x.id===id))id=incoming.id.slice(0,110)+'_PFB'+n++;
      current={...copy(incoming),id};a.branch_library.push(current);
    }const origins=packageOrigins([...collectPackageOrigins(current),...collectPackageOrigins(incoming)]);if(origins.length&&current.sample)current.sample.package_origins=origins;assetIds.set(incoming.id,current.id);
  }
  const sourceDefinition=s=>{const {id,manual_only,sampleLeafMaterial,sampleLeafMaterialId,sampleLeafMaterialName,...data}=s;return {data,material:resolveSampleMaterial(s,a)||a.leaf_material};};
  const mergeSources=(source,target)=>{const ids=new Map();for(const incoming of source){const matches=s=>equal(sourceDefinition(s),sourceDefinition(incoming));let current=target.find(s=>s.id===incoming.id&&matches(s))||target.find(matches);if(!current){let id=incoming.id,n=1;while(target.some(x=>x.id===id))id=incoming.id.slice(0,110)+'_PFB'+n++;current={...copy(incoming),id};target.push(current);}ids.set(incoming.id,current.id);}return ids;};
  doc.leaf_meshes||=[];a.tree_organs||={units:[]};a.tree_organs.units||=[];
  // Adding an explicit-only imported source must not replace the implicit
  // default used by the destination tree's existing automatic foliage.
  if(prefab.leaf_meshes.length&&!doc.leaf_meshes.length)doc.leaf_meshes.push(defaultLeaf(doc.settings,'PFB_TREE_DEFAULT_LEAF',a.leaf_material));
  const leafIds=mergeSources(prefab.leaf_meshes,doc.leaf_meshes),organIds=mergeSources(prefab.organ_units,a.tree_organs.units);
  if(a.tree_organs.units.length>24)throw Error('安装后超过 24 种花果素材上限，请先整理当前工程的花果素材');
  const ids=new Map([...operation.records.map(r=>r.id),...operation.records.map(r=>r.owner).filter(Boolean),...copies.map(i=>i.id)].map(id=>[id,token+'_'+id]));
  const remap=id=>{if(!id)return '';if(ids.has(id))return ids.get(id);const prefix=[...ids.keys()].sort((x,y)=>y.length-x.length).find(p=>id.startsWith(p+'.')||id.startsWith(p+':'));return prefix?ids.get(prefix)+id.slice(prefix.length):id;};
  const root=remap(operation.targets[0]);transformRecords(operation,matrix);
  for(const r of operation.records){r.id=remap(r.id);r.parent=r.root?parent:remap(r.parent);r.owner=remap(r.owner);r.sourceAssetId=assetIds.get(r.sourceAssetId)||r.sourceAssetId;
    if(r.root){r.parentT=attach;r.frame=parent&&parentTangent?{position:new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),tangent:parentTangent.toArray(),...(surface?{position:surface.parent_position,trunk_anchor:surface.anchor,trunk_surface_matrix:surface.matrix.toArray()}: {})}:null;}
    for(const [key,sources,all]of [['leaves',leafIds,doc.leaf_meshes],['organs',organIds,a.tree_organs.units]])for(const u of r[key]||[]){u.id=remap(u.id);u.parent=remap(u.parent);u.source_id=sources.get(u.source_id)||u.source_id;if(u.source_id)u.source=all.findIndex(s=>s.id===u.source_id);if(u.metadata?.sourceAssetId)u.metadata.sourceAssetId=assetIds.get(u.metadata.sourceAssetId)||u.metadata.sourceAssetId;}
  }
  operation.targets=[root];
  for(const i of copies){i.id=remap(i.id);i.parent=remap(i.parent);i.asset_id=assetIds.get(i.asset_id)||i.asset_id;i.prefab_root=root;}
  const layerId=token+'_CONSTRUCT';a.sculpt_layers.push({id:layerId,name:'安装预制枝干 · '+prefab.name,enabled:true,strength:1,operation,branches:{}});a.active_sculpt_layer=layerId;a.branch_instances.push(...copies);
  a.workbench||={};
  for(const [key,values,version]of [['trunk_forms',prefab.forms,2],['bark_materials',prefab.bark,1]])if(Object.keys(values).length){a.workbench[key]||={version,branches:{}};for(const [id,value]of Object.entries(values))a.workbench[key].branches[remap(id)]=copy(value);}
  return {document:doc,root,operation,copies};
}
export function branchPrefabDocument(prefab){
  const doc={settings:{...prefab.settings,leaf_density:0},leaf_meshes:[],authoring:{branch_library:[],branch_instances:[],sculpt_layers:[],overrides:{PREFAB_EMPTY:{hidden:true}},branch_shape:{branches:[{id:'PREFAB_EMPTY',parent:'',points:[[0,0,0],[0,0,.01]],knots:[[0,0,0],[0,0,.01]],length:.01,start_radius:.0001,end_radius:.0001}]},recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY','DENSE_AUTHORED_SAMPLE_ASSEMBLY']},tree_organs:{units:[]}}};
  return insertBranchPrefab(doc,prefab,{token:'PREVIEW'}).document;
}
