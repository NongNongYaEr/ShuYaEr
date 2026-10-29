import * as T from './vendor/three.module.min.js';
import {mergeGeometries} from './vendor/surface/utils/BufferGeometryUtils.js';
import {pveGlbMatrix} from './pve-export.js';
import {createGlbRig} from './glb-rig.js';

// The caller supplies a dedicated complete export asset, not the live editor.
// Geometry is copied in its final pose before weights are attached. No sweep,
// source material edits, bind-pose rebuild or PVE schema changes occur here.
export function createSkinnedGlbScene(asset,{connector=null,maxBones=4096}={}){
 if(asset.group.userData.pending_rebuild)throw Error('请等待当前模型生成完成后再导出');
 if(asset.isInstancedAssembly)throw Error('骨骼导出需要完整导出网格，请先展开导出副本');
 asset.group.updateWorldMatrix(true,true);const frame=connector?pveGlbMatrix(connector):new T.Matrix4().makeRotationX(-Math.PI/2),inverseGroup=asset.group.matrixWorld.clone().invert(),rig=createGlbRig(asset,frame.clone().multiply(asset.group.matrixWorld),{maxBones}),scene=new T.Scene(),geometries=[],chunks=[],materials=[],groups=[];let merged=null,offset=0,displayColor=false;
 scene.name=asset.group.name;scene.add(rig.root);const position=new T.Vector3();
 try{asset.group.traverseVisible(object=>{if(!object.isMesh)return;if(object.isSkinnedMesh||object.isInstancedMesh||object.geometry.morphAttributes.position?.length)throw Error('骨骼导出副本含未展开的变形或实例网格');
  const src=object.geometry,attributes=src.attributes,count=attributes.position?.count;if(!count)return;const g=src.clone(),global=new T.Matrix4().multiplyMatrices(frame,object.matrixWorld);geometries.push(g);
  const joint=new Uint16Array(count*4),weight=new Float32Array(count*4),wind=new Float32Array(count*4),color=new Float32Array(count*4);color.fill(1);
  const slots=Array.isArray(object.material)?object.material:[object.material],slotIndices=slots.map(m=>{if(!materials.includes(m))materials.push(m);return materials.indexOf(m);}),colored=slots.some(m=>m.vertexColors);displayColor||=colored;
  for(let n=0;n<count;n++){
   position.fromBufferAttribute(attributes.position,n).applyMatrix4(object.matrixWorld).applyMatrix4(inverseGroup);const values=rig.vertex(object,n,position),total=values.reduce((s,v)=>s+v.weight,0);if(values.length>4||!Number.isFinite(total)||total<1e-12)throw Error('骨骼蒙皮权重无效');
   values.forEach((v,k)=>{if(!Number.isInteger(v.index)||v.index<0||v.index>=rig.bones.length||!Number.isFinite(v.weight)||v.weight<0)throw Error('骨骼蒙皮引用无效');joint[n*4+k]=v.index;weight[n*4+k]=v.weight/total;});
   const c=attributes.color;if(c){const values=[c.getX(n),c.getY(n),c.getZ(n),c.itemSize>3?c.getW(n):1];(colored?color:wind).set(values,n*4);}
  }
  for(const key of Object.keys(g.attributes))if(!['position','normal','tangent','uv','uv1','uv2'].includes(key))g.deleteAttribute(key);
  g.applyMatrix4(global);if(!g.getAttribute('normal'))g.computeVertexNormals();
  if(!g.getAttribute('tangent')){const a=new Float32Array(count*4);for(let n=0;n<count;n++){a[n*4]=1;a[n*4+3]=1;}g.setAttribute('tangent',new T.BufferAttribute(a,4));}
  for(const key of ['uv','uv1','uv2'])if(!g.getAttribute(key))g.setAttribute(key,new T.Float32BufferAttribute(new Float32Array(count*2),2));
  // Standardize component types across foreign GLBs before merging.
  for(const key of ['position','normal','tangent','uv','uv1','uv2']){const a=g.getAttribute(key),values=new Float32Array(a.count*a.itemSize);for(let n=0;n<a.count;n++)for(let k=0;k<a.itemSize;k++)values[n*a.itemSize+k]=a.getComponent(n,k);g.setAttribute(key,new T.BufferAttribute(values,a.itemSize));}
  g.setAttribute('skinIndex',new T.Uint16BufferAttribute(joint,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weight,4));g.setAttribute('_BRANCH_WIND',new T.Float32BufferAttribute(wind,4));g.setAttribute('color',new T.Float32BufferAttribute(color,4));
  if(!g.index)g.setIndex(Array.from({length:count},(_,n)=>n));const ranges=Array.isArray(object.material)&&src.groups.length?src.groups:[{start:0,count:g.index.count,materialIndex:0}];
  for(const r of ranges)groups.push({start:offset+r.start,count:r.count,materialIndex:slotIndices[r.materialIndex]});offset+=g.index.count;g.clearGroups();chunks.push(g);
 });
 if(!chunks.length)throw Error('当前没有可导出的模型');merged=mergeGeometries(chunks,false);if(!merged)throw Error('骨骼模型网格属性无法合并');geometries.push(merged);
 // A glTF primitive per source instance duplicates importer work and creates
 // hundreds of skinned sections. Reorder only indices into shared material
 // ranges; vertex data, skin weights and current geometry remain unchanged.
 const oldIndices=merged.index.array,reordered=new oldIndices.constructor(oldIndices.length);let next=0;
 for(let materialIndex=0;materialIndex<materials.length;materialIndex++){const start=next;for(const g of groups)if(g.materialIndex===materialIndex){reordered.set(oldIndices.subarray(g.start,g.start+g.count),next);next+=g.count;}if(next>start)merged.addGroup(start,next-start,materialIndex);}
 if(next!==oldIndices.length)throw Error('骨骼模型材质分组不完整');merged.setIndex(new T.BufferAttribute(reordered,1));if(!displayColor)merged.deleteAttribute('color');
 const mesh=new T.SkinnedMesh(merged,materials);mesh.name=asset.group.name;mesh.userData={branchforge_color_is_display:true,rigged:true};scene.add(mesh);scene.updateMatrixWorld(true);const skeleton=new T.Skeleton(rig.bones);mesh.bind(skeleton);mesh.normalizeSkinWeights();skeleton.update();mesh.computeBoundingBox();mesh.computeBoundingSphere();
 const report={...rig.report,vertices:merged.attributes.position.count,triangles:merged.index.count/3,materials:materials.length,bind_pose:'current_shape',unit:'meter',up:'Y'};
 scene.userData={generator:'BranchForge',rigging:report};let disposed=false;return {scene,mesh,skeleton,rig,report,dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());skeleton.dispose();scene.clear();}};
 }catch(error){geometries.forEach(g=>g.dispose());throw error;}
}
