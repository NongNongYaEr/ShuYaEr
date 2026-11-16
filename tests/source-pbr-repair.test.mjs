import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectGeometry} from '../material/web/geometry-repair.js';
import {parseSourcePbrGLB} from '../material/web/source-pbr.js';
import {repairSourcePbrGLB} from '../material/web/source-pbr-repair.js';
import {prepareRepairedUVSource,rebindRepairedMaterialProject,survivingFaceMap} from '../material/web/geometry-repair-workspace.js';
import {restoreWorkingMesh} from '../material/web/working-mesh.js';
import {createDocument} from '../material/web/project-state.js';

function fixture({allDegenerate=false,unindexed=false}={}){
 const chunks=[],bufferViews=[],accessors=[];
 let length=0;
 const add=bytes=>{
  const view=bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.byteLength})-1;
  const chunk=new Uint8Array(Math.ceil(bytes.byteLength/4)*4);
  chunk.set(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength));
  chunks.push(chunk);
  length+=chunk.length;
  return view;
 };
 const attribute=(data,type,components)=>accessors.push({
  bufferView:add(data),componentType:type==='SCALAR'?5123:5126,count:data.length/components,type
 })-1;
 const positions=allDegenerate?[0,0,0,1,1,0,2,2,0]:[0,0,0,1,0,0,0,1,0];
 if(unindexed)positions.push(...positions.slice(0,3),...positions.slice(3,6),...positions.slice(3,6));
 const vertexCount=positions.length/3;
 const uv=[0,0,1,0,0,1];
 if(unindexed)uv.push(0,0,1,0,1,0);
 const attrs={POSITION:attribute(Float32Array.from(positions),'VEC3',3),
  NORMAL:attribute(Float32Array.from({length:positions.length},(_,i)=>i%3===2?1:0),'VEC3',3),
  TEXCOORD_0:attribute(Float32Array.from(uv),'VEC2',2),
  TEXCOORD_1:attribute(Float32Array.from(uv,u=>u*.5+.25),'VEC2',2)};
 const indices=attribute(Uint16Array.of(0,1,2,0,1,1),'SCALAR',1);
 const primitive={attributes:attrs,material:0,extras:{branchforgeSourcePrimitiveId:'source-part'},...(!unindexed&&{indices})};
 const degenerate=attribute(Uint16Array.of(0,1,1),'SCALAR',1);
 const parts=[primitive,{attributes:attrs,indices:degenerate,material:1}];
 assert.equal(accessors[attrs.POSITION].count,vertexCount);
 const color=Uint8Array.of(1,2,3,4,5,6,7,8,9),normal=Uint8Array.of(7,9,11,13,15);
 const imageViews=[add(color),add(normal)];
 const materials=[{name:'原材质',doubleSided:true,pbrMetallicRoughness:{
  baseColorTexture:{index:0,texCoord:1,extensions:{KHR_texture_transform:{offset:[.4,.2]}}},roughnessFactor:.76,metallicFactor:.24},
  normalTexture:{index:1,scale:.82}},{name:'只有退化面'}];
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]},{nodes:[2]}],
  nodes:[{mesh:0},{mesh:0,translation:[3,0,0],scale:[-1,1,1]},{mesh:0}],meshes:[{primitives:parts}],
  buffers:[{byteLength:length}],bufferViews,accessors,materials,
  textures:[{sampler:0,source:0},{sampler:0,source:1}],samplers:[{wrapS:33071,magFilter:9728}],
  images:imageViews.map(bufferView=>({bufferView,mimeType:'image/png'}))};
 const json=new TextEncoder().encode(JSON.stringify(doc)),jsonLength=Math.ceil(json.length/4)*4;
 const buffer=new ArrayBuffer(28+jsonLength+length),view=new DataView(buffer),bytes=new Uint8Array(buffer);
 for(const [at,value] of [[0,0x46546c67],[4,2],[8,buffer.byteLength],[12,jsonLength],[16,0x4e4f534a],
  [20+jsonLength,length],[24+jsonLength,0x004e4942]])view.setUint32(at,value,true);
 bytes.fill(32,20,20+jsonLength);
 bytes.set(json,20);
 let at=28+jsonLength;
 for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 return buffer;
}

const bin=buffer=>new Uint8Array(buffer,28+new DataView(buffer).getUint32(12,true));

for(const unindexed of [false,true])test('原材质修复保留贴图和材质定义，镜像实例仅清理确切零面积面 '+(unindexed?'非索引':'索引'),async()=>{
 const bytes=fixture({unindexed}),source=await parseSourcePbrGLB(bytes,'原材质.glb');
 const report=inspectGeometry(source);
 assert.equal(report.removedFaces,4);
 const output=repairSourcePbrGLB(bytes,source,report),repaired=await parseSourcePbrGLB(output,'原材质.glb');
 assert.equal(inspectGeometry(repaired).removedFaces,0);
 assert.deepEqual(repaired.sourcePbr.primitives.map(p=>[p.nodeIndex,p.id,p.materialIndex,p.indexCount]),[
  [0,'source-part',0,3],[1,'source-part',0,3]
 ]);
 assert.deepEqual([...repaired.indices],[0,1,2,...(unindexed?[6,8,7]:[3,5,4])]);
 assert.deepEqual(bin(output).subarray(0,bin(bytes).length),bin(bytes));
 for(const key of ['materials','images','textures','samplers'])assert.deepEqual(repaired.sourcePbr.doc[key],source.sourcePbr.doc[key]);
 assert.deepEqual(repaired.sourcePbr.doc.meshes[0],source.sourcePbr.doc.meshes[0]);
 assert.equal(repaired.sourcePbr.doc.nodes[2].mesh,0);
 assert.equal(repaired.sourcePbr.doc.extras.treeMaterialLab.geometryRepair.originalSHA256,source.sourceSHA256);
 assert.notEqual(repaired.sourceSHA256,source.sourceSHA256);
 assert.equal(repairSourcePbrGLB(output,repaired),output);
});

test('所有三角面退化时明确拒绝',async()=>{
 const bytes=fixture({allDegenerate:true}),source=await parseSourcePbrGLB(bytes,'全部退化.glb');
 assert.throws(()=>repairSourcePbrGLB(bytes,source),/所有三角面均已退化/);
});

test('旧原材质工程删除整段退化网格后，仍保留有效材质槽和工作 UV 面角',async()=>{
 const source=await parseSourcePbrGLB(fixture(),'旧原材质.glb');
 const working=await restoreWorkingMesh(source,{...source,uv:Float32Array.from(source.uv,x=>.2+.6*x),chartIds:new Int32Array(source.pos.length/3)},{mode:'unwrap',revision:1});
 const report=inspectGeometry(source),removed=new Set(report.faces);
 const keptCorners=(mesh,uv,filter=false)=>Array.from(mesh.indices)
  .filter((_,corner)=>!filter||!removed.has(Math.floor(corner/3))).map(i=>[uv[i*2],uv[i*2+1]]);
 const cleaned=await prepareRepairedUVSource(source,working,report,{mode:'unwrap',revision:1});
 assert.deepEqual(keptCorners(cleaned.input,cleaned.input.uv),keptCorners(working,working.uv,true));
 assert.deepEqual(keptCorners(cleaned.source,cleaned.source.extraAttributes.TEXCOORD_1.data),keptCorners(source,source.extraAttributes.TEXCOORD_1.data,true));
 const document=createDocument({source:source.sourceSHA256,name:source.name,settings:{}});
 document.materialBase={version:1,kind:'source-pbr',affectedSlots:[0,1]};
 const repaired=rebindRepairedMaterialProject(document,cleaned.source,survivingFaceMap(report));
 assert.deepEqual(repaired.materialBase.affectedSlots,[0]);
 assert.deepEqual(document.materialBase.affectedSlots,[0,1]);
 assert.deepEqual(cleaned.source.sourcePbr.doc.materials,source.sourcePbr.doc.materials);
});
