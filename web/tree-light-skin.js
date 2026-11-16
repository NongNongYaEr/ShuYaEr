import * as T from './vendor/three.module.min.js';
import {trunkSurfaceIndex} from './v080-lights/surface.js';
import {proceduralLightCarriers} from './tree-light-carriers.js';

// Reuse the skinned bark directly underneath each ring. Every vertex in a ring
// gets the same interpolated weights so the tube keeps its circular section.
export function createTreeLightSkin(asset,barkWeights){
  const record=asset.authoring.tree_lights;
  const procedural=record.kind==='procedural';
  const meshes=procedural?proceduralLightCarriers(asset).wood:[];
  if(!procedural)asset.group.traverseVisible(mesh=>{
    if(mesh.isMesh&&mesh.userData.trunk_mount_id===record.mount&&mesh.userData.imported_trunk)meshes.push(mesh);
  });
  const inverse=asset.group.matrixWorld.clone().invert(),point=new T.Vector3(),matrix=new T.Matrix4();
  const primitives=meshes.map(mesh=>{
    matrix.multiplyMatrices(inverse,mesh.matrixWorld);
    const position=mesh.geometry.attributes.position;
    const result=new Float32Array(position.count*3);
    for(let i=0;i<position.count;i++)point.fromBufferAttribute(position,i).applyMatrix4(matrix).toArray(result,i*3);
    return {position:result,index:mesh.geometry.index.array};
  });
  const surface=trunkSurfaceIndex(T,{primitives,matrix:new T.Matrix4().toArray()});
  const cache=new WeakMap(),center=new T.Vector3(),opposite=new T.Vector3(),bary=new T.Vector3();
  const limit=record.params.radius+record.params.gap*5+.01;

  return (mesh,vertex)=>{
    let rings=cache.get(mesh);
    if(!rings){rings=[];cache.set(mesh,rings);}
    const size=mesh.userData.treeLightStrip.ringSize,ring=Math.floor(vertex/size);
    if(rings[ring])return rings[ring];
    const pos=mesh.geometry.attributes.position,first=ring*size;
    center.fromBufferAttribute(pos,first).add(opposite.fromBufferAttribute(pos,first+(size-1)/2)).multiplyScalar(.5)
      .applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
    const hit=surface.closest(center,limit);
    if(!hit)throw Error('灯带和树皮已脱离，请先在灯带面板点「立即更新」再导出。');
    const {triangle,primitive,face}=hit.face,bark=meshes[primitive];
    triangle.getBarycoord(hit.position,bary);
    const combined=new Map();
    for(let corner=0;corner<3;corner++){
      const factor=bary.getComponent(corner);
      if(factor<=1e-9)continue;
      const index=bark.geometry.index.getX(face*3+corner);
      const position=point.fromBufferAttribute(bark.geometry.attributes.position,index).applyMatrix4(bark.matrixWorld).applyMatrix4(inverse);
      for(const {index:bone,weight} of barkWeights(bark,index,position)){
        combined.set(bone,(combined.get(bone)||0)+factor*weight);
      }
    }
    rings[ring]=[...combined].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([index,weight])=>({index,weight}));
    return rings[ring];
  };
}
