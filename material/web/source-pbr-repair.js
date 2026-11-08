import {geometryRepairSummary,inspectGeometry} from './geometry-repair.js';

const JSON_CHUNK=0x4e4f534a,BIN_CHUNK=0x004e4942;
const align4=length=>Math.ceil(length/4)*4;
const indexFormats={5121:['getUint8',1],5123:['getUint16',2],5125:['getUint32',4]};

// Each parsed primitive owns an ordered range of faces, including reflected
// instances. Read indices in the original GLB's winding when rewriting it.
function retainedIndices(primitive,doc,bin,firstFace,faceCount,removed){
 const accessor=doc.accessors[primitive.indices],view=doc.bufferViews[accessor?.bufferView];
 const result=new Uint32Array((faceCount-removed.length)*3);
 let read=index=>index;
 if(primitive.indices!=null){
  const [method,width]=indexFormats[accessor.componentType],stride=view.byteStride??width;
  const offset=(view.byteOffset??0)+(accessor.byteOffset??0);
  read=index=>bin[method](offset+index*stride,true);
 }
 let out=0,drop=0;
 for(let face=0;face<faceCount;face++){
  if(firstFace+face===removed[drop]){drop++;continue;}
  for(let corner=0;corner<3;corner++)result[out++]=read(face*3+corner);
 }
 if(out!==result.length||drop!==removed.length)throw Error('退化面清理与原材质网格面序不一致。');
 return result;
}

export function repairSourcePbrGLB(buffer,source,report=inspectGeometry(source)){
 if(!report.removedFaces)return buffer;
 if(!report.outputTriangles)throw Error('所有三角面均已退化，无法保留原材质。');
 const doc=structuredClone(source.sourcePbr.doc),header=new DataView(buffer);
 let bin;
 const otherChunks=[];
 for(let at=12;at+8<=buffer.byteLength;){
  const length=header.getUint32(at,true),type=header.getUint32(at+4,true);
  if(type===BIN_CHUNK)bin=new Uint8Array(buffer,at+8,length);
  else if(type!==JSON_CHUNK)otherChunks.push(new Uint8Array(buffer,at,length+8));
  at+=length+8;
 }
 if(!bin)throw Error('原材质 GLB 缺少内嵌数据。');
 const binView=new DataView(buffer,bin.byteOffset,bin.byteLength);
 const groups=new Map(),appended=[];
 let used=0,length=bin.length;
 for(const record of source.sourcePbr.primitives){
  const {nodeIndex,meshIndex,primitiveIndex,firstIndex,indexCount}=record;
  const firstFace=firstIndex/3,faceCount=indexCount/3,start=used;
  while(used<report.faces.length&&report.faces[used]<firstFace+faceCount)used++;
  if(start===used)continue;
  const key=nodeIndex==null?'mesh-'+meshIndex:'node-'+nodeIndex;
  if(!groups.has(key))groups.set(key,{nodeIndex,meshIndex,replacements:new Map()});
  const primitive=doc.meshes[meshIndex].primitives[primitiveIndex];
  const indices=retainedIndices(primitive,doc,binView,firstFace,faceCount,report.faces.subarray(start,used));
  let replacement=null;
  if(indices.length){
   const bufferView=doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:indices.byteLength,target:34963})-1;
   const accessor=doc.accessors.push({bufferView,componentType:5125,count:indices.length,type:'SCALAR'})-1;
   replacement={...primitive,indices:accessor};
   appended.push(indices);
   length+=indices.byteLength;
  }
  groups.get(key).replacements.set(primitiveIndex,replacement);
 }
 if(used!==report.removedFaces)throw Error('未找到退化面对应的原材质网格。');

 // A node can share a glTF mesh with a reflected instance or with a node in
 // another scene. Clone the mesh for edits to a shared node.
 const owners=new Map(),emptyMeshes=new Set();
 for(const node of doc.nodes??[])if(node.mesh!=null)owners.set(node.mesh,(owners.get(node.mesh)||0)+1);
 for(const {nodeIndex,meshIndex,replacements} of groups.values()){
  const mesh=doc.meshes[meshIndex];
  const primitives=mesh.primitives.map((p,i)=>replacements.has(i)?replacements.get(i):p).filter(Boolean);
  if(!primitives.length){
   if(nodeIndex!=null)delete doc.nodes[nodeIndex].mesh;
   else emptyMeshes.add(meshIndex);
  }else if(nodeIndex!=null&&owners.get(meshIndex)>1){
   doc.nodes[nodeIndex].mesh=doc.meshes.push({...mesh,primitives})-1;
  }else{
   doc.meshes[meshIndex]={...mesh,primitives};
  }
 }
 if(emptyMeshes.size)doc.meshes=doc.meshes.filter((_,i)=>!emptyMeshes.has(i));
 doc.buffers[0].byteLength=length;
 doc.extras={...doc.extras,treeMaterialLab:{...doc.extras?.treeMaterialLab,
  geometryRepair:geometryRepairSummary(report,source.sourceSHA256)}};

 const json=new TextEncoder().encode(JSON.stringify(doc)),jsonLength=align4(json.length);
 const size=28+jsonLength+length+otherChunks.reduce((n,chunk)=>n+chunk.length,0);
 if(size>150_000_000)throw Error('原材质清理副本超过 150 MB，无法继续准备。');
 const out=new ArrayBuffer(size),v=new DataView(out),bytes=new Uint8Array(out);
 for(const [at,value] of [[0,0x46546c67],[4,2],[8,size],[12,jsonLength],[16,JSON_CHUNK],
  [20+jsonLength,length],[24+jsonLength,BIN_CHUNK]])v.setUint32(at,value,true);
 bytes.fill(32,20,20+jsonLength);
 bytes.set(json,20);
 let at=28+jsonLength;
 bytes.set(bin,at);
 at+=bin.length;
 for(const indices of appended)for(const index of indices){v.setUint32(at,index,true);at+=4;}
 for(const chunk of otherChunks){bytes.set(chunk,at);at+=chunk.length;}
 return out;
}
