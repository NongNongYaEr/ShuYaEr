import * as T from './vendor/three.module.min.js';
import {GLTFExporter} from './vendor/GLTFExporter.js';
import {trunkCalibrationMatrix,trunkDimensions,validateTrunkGuides} from './imported-trunk-data.js';

// Use the currently edited geometry, not source.glb_base64 (which predates sculpting).
// All trunk primitives become one wood surface; original materials stay in the source draft.
export async function materialHandoffGlb(model){
 validateTrunkGuides(model.guides);const height=trunkDimensions(model).height;
 if(!(height>=.1&&height<=200))throw Error('材质工坊支持0.1–200米树高，请先校准尺寸。');
 const vertices=model.primitives.reduce((n,p)=>n+p.geometry.position.length/3,0),faces=model.primitives.reduce((n,p)=>n+p.geometry.index.length/3,0);
 if(vertices>2000000||faces>2000000)throw Error('材质工作副本支持最多200万顶点和200万三角面。');
 const pos=new Float32Array(vertices*3),normal=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),ids=new Uint32Array(faces*3);
 const matrix=new T.Matrix4().makeRotationX(-Math.PI/2).multiply(trunkCalibrationMatrix(model.calibration)),nm=new T.Matrix3().getNormalMatrix(matrix),v=new T.Vector3();let offset=0,index=0;
 for(const {geometry:g} of model.primitives){for(let i=0;i<g.position.length/3;i++){v.fromArray(g.position,i*3).applyMatrix4(matrix).toArray(pos,(offset+i)*3);v.fromArray(g.normal,i*3).applyMatrix3(nm).normalize().toArray(normal,(offset+i)*3);uv[(offset+i)*2]=g.uv?.[i*2]||0;uv[(offset+i)*2+1]=g.uv?.[i*2+1]||0;}for(const i of g.index)ids[index++]=offset+i;offset+=g.position.length/3;}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(pos,3));geometry.setAttribute('normal',new T.BufferAttribute(normal,3));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setIndex(new T.BufferAttribute(ids,1));
 const material=new T.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0}),mesh=new T.Mesh(geometry,material);mesh.name=model.name;
 try{const bytes=await new GLTFExporter().parseAsync(mesh,{binary:true});if(bytes.byteLength>150000000)throw Error('材质工作副本超过150MB，请先减少网格。');return {bytes,height};}finally{geometry.dispose();material.dispose();}
}

// Returned GLB is already in calibrated meters. Use an identity Z-up calibration.
export function carryMaterialTrunk(model,context){
 return {...model,name:context.name+' · 材质完成',calibration:{base:[0,0,0],tip:[0,0,1],front:[0,1,0],scale:1},guides:structuredClone(context.guides),binding:{},physical_size_confirmed:true,
  material_parent:{version:1,inputId:context.id,sourceSHA256:context.sourceSHA256,reviewRequired:true}};
}
