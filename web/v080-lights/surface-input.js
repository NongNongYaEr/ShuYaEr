import * as THREE from '../vendor/three.module.min.js';

export function treeLightSurfaceInput({tree,wood,guides,ground}){
  const bounds=new THREE.Box3(),point=new THREE.Vector3();
  const primitives=wood.map(mesh=>{
    const local=mesh.geometry.attributes.position,position=new Float32Array(local.count*3);
    for(let i=0;i<local.count;i++){
      point.fromBufferAttribute(local,i).applyMatrix4(mesh.matrixWorld);
      bounds.expandByPoint(point);
      point.toArray(position,i*3);
    }
    return {position,index:mesh.geometry.index.array.slice()};
  });
  const scale=tree.group.getWorldScale(new THREE.Vector3()).x;
  const worldGuides=guides.map(({id,parent,branch})=>({id,parent,
    start_radius:branch.startRadius*scale,end_radius:branch.endRadius*scale,
    points:branch.points.map(v=>v.clone().applyMatrix4(tree.group.matrixWorld).toArray())}));
  return {mesh:{matrix:new THREE.Matrix4().toArray(),primitives},guides:worldGuides,height:bounds.max.z-ground};
}
