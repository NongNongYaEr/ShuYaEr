import * as T from './vendor/three.module.min.js';
import {unitBranchIndex} from './unit-branch-boundary.js';
import {markNativeModelChanged} from './native-model-changes.js';

// Borrow display matrices only. Geometry, source models, authoring, selection
// and export data remain unchanged until the pen's single transaction commits.
export function createUnitErasePreview(asset){
 const index=unitBranchIndex(asset.masterBranches,asset.authoring.branch_instances),members=new Map(),saved=[],hidden=new Set(),zero=new T.Matrix4().makeScale(0,0,0),matrix=new T.Matrix4();
 const add=(id,record)=>{if(!index.byInstance.has(id))return;if(!members.has(id))members.set(id,[]);members.get(id).push(record);};
 asset.group.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.imported_trunk)return;
  const bindings=asset.editPreviewBindings?.(mesh)?.instances;
  if(mesh.isInstancedMesh&&bindings){for(let n=0;n<bindings.length;n++)add(bindings[n].id,{mesh,n});}
  else if(!mesh.isInstancedMesh){const id=index.ownerOf(mesh.userData.stable_id)?.id;if(id)add(id,{mesh,n:null});}
 });
 const dirty=meshes=>{if(!meshes.size)return;for(const mesh of meshes)if(mesh.isInstancedMesh)mesh.instanceMatrix.needsUpdate=true;markNativeModelChanged(asset);};
 const hide=ids=>{const changed=new Set();for(const id of ids){if(hidden.has(id))continue;hidden.add(id);for(const {mesh,n}of members.get(id)||[]){if(n===null){saved.push({id,mesh,n,visible:mesh.visible});mesh.visible=false;}else{mesh.getMatrixAt(n,matrix);saved.push({id,mesh,n,matrix:matrix.clone()});mesh.setMatrixAt(n,zero);mesh.instanceMatrix.addUpdateRange(n*16,16);}changed.add(mesh);}}dirty(changed);};
 return {hide,set(ids){const changed=new Set();for(let n=saved.length-1;n>=0;n--){const s=saved[n];if(ids.has(s.id))continue;if(s.n===null)s.mesh.visible=s.visible;else{s.mesh.setMatrixAt(s.n,s.matrix);s.mesh.instanceMatrix.addUpdateRange(s.n*16,16);}hidden.delete(s.id);changed.add(s.mesh);saved.splice(n,1);}for(const id of hidden)if(!ids.has(id))hidden.delete(id);dirty(changed);hide(ids);},
  restore(){const changed=new Set();for(const s of saved){if(s.n===null)s.mesh.visible=s.visible;else{s.mesh.setMatrixAt(s.n,s.matrix);s.mesh.instanceMatrix.addUpdateRange(s.n*16,16);}changed.add(s.mesh);}saved.length=0;hidden.clear();dirty(changed);},
  get count(){return hidden.size;}};
}
