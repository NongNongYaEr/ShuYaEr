import {parseGLB} from './model.js';
import {encodeMeshInput} from './mesh-codec.js';
import {writeGLB} from './glb-writer.js';
import {inspectGeometry,filterGeometryIndices,geometryRepairSummary} from './geometry-repair.js';
import {inspectOptimizationGLB,decodeOptimizationResult,compactOptimizationMesh} from './mesh-optimization.js';
let source,original,candidate,settings,report;
const send=(id,data,transfer=[])=>self.postMessage({id,...data},transfer);
self.onmessage=async({data})=>{const{id,kind}=data;try{
 if(kind==='load'){
  inspectOptimizationGLB(data.bytes);original=data.bytes;source=await parseGLB(original,data.name);const geometry=inspectGeometry(source);if(geometry.removedFaces){source.indices=filterGeometryIndices(source.indices,geometry);source.geometryRepair=geometryRepairSummary(geometry,source.sourceSHA256);}source.sourceBytes=null;source.original=null;source.extraAttributes={};const input=encodeMeshInput(source);send(id,{info:{sourceSHA256:source.sourceSHA256,sourceName:data.name,triangles:source.indices.length/3,vertices:source.pos.length/3,normalRepair:source.normalRepair||null,geometryRepair:source.geometryRepair||null},input},[input.buffer]);
 }else if(kind==='result'){
  if(!source)throw Error('高模已卸载。');const decoded=decodeOptimizationResult(data.bytes,source.indices.length/3);report=decoded.report;settings=data.options;candidate=report.outputTriangles<=250000?compactOptimizationMesh(source,decoded.indices,settings):null;let proxy=data.preview===false?null:source.indices.length/3<=180000?compactOptimizationMesh(source,source.indices,{preserveUV:false}):decoded.proxyIndices.length?compactOptimizationMesh(source,decoded.proxyIndices):null;
  const transfers=m=>m?[m.pos,m.normal,m.uv,m.tangent,m.ao,m.indices,m.sourceVertices].map(a=>a.buffer):[];
  // Keep the candidate in this worker for export; previews own independent data.
  const preview=data.preview!==false&&report.outputTriangles<=180000?structuredClone(candidate):null;send(id,{report,candidate:preview,proxy},[...transfers(preview),...transfers(proxy)]);
 }else if(kind==='export'){
  if(!candidate)throw Error('尚无减面候选。');const bytes=writeGLB(candidate,{name:data.name||'Tree optimized'});send(id,{bytes,...(data.adopt?{original}:{}),metadata:{version:1,sourceSHA256:source.sourceSHA256,sourceName:source.name,inputTriangles:source.indices.length/3,outputTriangles:candidate.indices.length/3,options:settings,report,...(source.geometryRepair?{sourceGeometryRepair:source.geometryRepair}:{})}},[bytes.buffer,...(data.adopt?[original]:[])]);
 }else throw Error('未知优化操作。');
}catch(error){send(id,{error:error.message});}};
