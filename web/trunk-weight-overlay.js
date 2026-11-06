import * as T from './vendor/three.module.min.js';
import {trunkSourceBinding} from './imported-trunk-binding.js';
import {FIXED_TRUNK_ROOT,trunkWeightRepairs} from './trunk-weight-data.js';

export function createTrunkWeightOverlay(root,refresh){
 const materials=new Map(),palette={base:new T.Color('#364975'),guide:new T.Color('#f4a75c'),issue:new T.Color('#ef486f'),fixed:new T.Color('#50dfbd'),applied:new T.Color('#89e665')};
 let overlayMaterial=null,boundModel=null,binding=null,previous=null;
 function source(model){
  if(boundModel!==model){binding=trunkSourceBinding(model);boundModel=model;}
  return binding;
 }
 function clear(model){
  if(materials.size){
   for(const [mesh,material] of materials){
    mesh.material=material;
    const color=model?.primitives.find(p=>p.id===mesh.userData.trunkPrimitive)?.geometry.color;
    if(color)mesh.geometry.setAttribute('color',new T.Float32BufferAttribute(color,color.length/mesh.geometry.attributes.position.count));
    else mesh.geometry.deleteAttribute('color');
   }
   materials.clear();refresh();
  }
  overlayMaterial?.dispose();overlayMaterial=null;previous=null;boundModel=null;binding=null;
 }
 function render(model,state,force=false){
  if(!model||!state)return clear(model);
  const key=[model,state.guide,state.scan,state.applied];
  if(!force&&previous?.every((value,index)=>value===key[index]))return;
  const {guides,primitives}=source(model),repairs=trunkWeightRepairs(model);
  overlayMaterial??=new T.MeshStandardMaterial({color:'#ffffff',roughness:.88,side:T.DoubleSide,vertexColors:true});
  const target=guides.findIndex(g=>g.id===state.guide);
  for(const mesh of root.children){
   const id=mesh.userData.trunkPrimitive,p=primitives.find(p=>p.id===id),manual=repairs.get(id),issues=state.scan?.flagged.get(id),applied=state.applied?.get(id);
   if(!p)continue;
   if(!materials.has(mesh))materials.set(mesh,mesh.material);
   const rgb=new Float32Array(p.guideIndices.length*3);
   for(let i=0;i<p.guideIndices.length;i++){
    const color=issues?.has(i)?palette.issue:applied?.has(i)?palette.applied:manual?.get(i)===FIXED_TRUNK_ROOT?palette.fixed:p.guideIndices[i]===target?palette.guide:palette.base;
    color.toArray(rgb,i*3);
   }
   mesh.material=overlayMaterial;
   mesh.geometry.setAttribute('color',new T.BufferAttribute(rgb,3));
  }
  previous=key;refresh();
 }
 return {render,clear,sample(model,id,index){
  const data=source(model),primitive=data.primitives.find(p=>p.id===id);
  return data.guides[primitive?.guideIndices[index]]?.id;
 }};
}
