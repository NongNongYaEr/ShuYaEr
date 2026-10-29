import * as T from './vendor/three.module.min.js';
import {buildBranchAsset,disposeBranchAsset,deserializeGeometry,branchInstanceFrame} from './branch-kernel.js';
import {compiledSampleAuthoring} from './compiled-branch-curves.js';
import {completeInstanceMatrix} from './branch-instance-matrix.js';
import {sampleLeafMaterial,sampleLeafMaterialName,syncLeafMaterialVariants} from './leaf-material-data.js';
import {resolveSampleMaterial} from './sample-materials.js';
import {applyLeafMaterial,waitForLeafTextures} from './leaf-resources.js';
import {assemblyScaleState,assemblyCardScale} from './assembly-scale.js';
import {compiledSamples,retainCompiledPrototype,releaseCompiledPrototype} from './compiled-sample-cache.js';

// One fixed source, shared geometry and a bounded instance buffer for the whole
// pen. Hover and pen previews never enter project geometry or exported assets.
export async function createUnitPaintPreview(item,authoring,modelRoot,{owner=null,includeHover=true,resolvedScale=false}={}){
 const geometries=[];let built,root,borrowed=null,disposed=false;const materials=[],batches=[];
 const dispose=()=>{if(disposed)return;disposed=true;root?.removeFromParent();batches.forEach(b=>b.dispose());materials.forEach(m=>m.dispose());if(borrowed)releaseCompiledPrototype(borrowed,disposeBranchAsset);if(built)disposeBranchAsset(built);geometries.forEach(g=>g.dispose());};
 try{
  const prototype=owner?.authoring===authoring&&owner.settings.preview_lod===0?compiledSamples(owner)?.records.get(JSON.stringify([item.id,item.revision,''])):null;
  let sourceMeshes;
  if(prototype&&!prototype.custom){borrowed=retainCompiledPrototype(prototype);sourceMeshes=prototype.meshes;}
  else{
  const texture=sampleLeafMaterial(item.sample,authoring.branch_library,authoring.leaf_material),sources=item.sample.leaf_meshes.map(s=>{const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);const own=resolveSampleMaterial(s,authoring,item.sample)||texture;return {...s,geometry,sampleLeafMaterial:own,sampleLeafMaterialName:sampleLeafMaterialName(s.id,own,authoring.leaf_material)};});
  built=buildBranchAsset({...item.sample.settings,wind_strength:0,preview_lod:0},null,sources,0,
   {...compiledSampleAuthoring(item.sample,item,authoring,item.shape,false),__sampleOrganMaterial:texture,__sampleBaseMaterial:authoring.leaf_material},
   {legacy:true,resolveSources:true,continuousBark:false});
  syncLeafMaterialVariants(built,applyLeafMaterial);await waitForLeafTextures(built.group);built.materialize?.();built.group.updateMatrixWorld(true);
  sourceMeshes=[];built.group.traverse(m=>{if(m.isMesh)sourceMeshes.push(m);});
  }
  root=new T.Group();root.name='UnitPaintTransient';root.visible=false;root.matrixAutoUpdate=false;modelRoot.add(root);
  const createSet=opacity=>{const group=new T.Group(),palette=new Map(),entries=[];root.add(group);
   const material=m=>{if(!palette.has(m)){const own=m.clone();own.transparent=true;own.opacity=opacity;own.depthWrite=false;materials.push(own);palette.set(m,own);}return palette.get(m);};
   for(const mesh of sourceMeshes){const batch=new T.InstancedMesh(mesh.geometry,Array.isArray(mesh.material)?mesh.material.map(material):material(mesh.material),129);batch.userData={...mesh.userData,unit_paint_preview:true};batch.count=0;batch.frustumCulled=false;batch.castShadow=false;batch.receiveShadow=false;group.add(batch);batches.push(batch);entries.push({batch,local:mesh.matrixWorld.clone()});}return entries;
  };
  const pen=createSet(.85),hover=includeHover?createSet(.44):[];
  let parentBranches=null,parents=null;const writes=new WeakMap(),matrix=new T.Matrix4();
  function write(entries,items,asset,hovering=false){
   if(parentBranches!==asset.masterBranches){parentBranches=asset.masterBranches;parents=new Map(parentBranches.map(b=>[b.stableId,b]));}
   let state=writes.get(entries);if(!state||state.asset!==asset||state.branches!==parentBranches){state={asset,branches:parentBranches,keys:[],count:0};writes.set(entries,state);}
   const changed=[];
   items.forEach(({instance,binding},n)=>{const key=hovering?JSON.stringify([instance.parent,instance.attach,instance.scale,instance.roll,instance.frame]):items[n];if(state.keys[n]===key)return;state.keys[n]=key;let parent=parents.get(instance.parent);if(binding)parent={...parent,trunkAttachments:new Map([[instance.id,binding]])};
    const scale=resolvedScale?1:assemblyScaleState(asset.authoring.workbench).overall*assemblyCardScale(asset.authoring.workbench,instance.shootRole,item.id);
    changed.push({n,matrix:completeInstanceMatrix({...instance,scale:instance.scale*scale},item.shape,parent,asset.settings,branchInstanceFrame)});});
   for(const {batch,local}of entries){batch.count=items.length;for(const change of changed){batch.setMatrixAt(change.n,matrix.copy(change.matrix).multiply(local));batch.instanceMatrix.addUpdateRange(change.n*16,16);}if(changed.length)batch.instanceMatrix.needsUpdate=true;}
   state.keys.length=items.length;state.count=items.length;
  }
  return {set(pending,target,asset){const targets=includeHover?(Array.isArray(target)?target:target?[target]:[]):[];asset.group.updateMatrix();root.matrix.copy(asset.group.matrix);root.matrixWorldNeedsUpdate=true;write(pen,pending,asset);if(includeHover)write(hover,targets,asset,true);root.visible=Boolean(pending.length||targets.length);},hide(){root.visible=false;},dispose,root,get borrowed(){return Boolean(borrowed);}};
 }catch(error){dispose();throw error;}
}
