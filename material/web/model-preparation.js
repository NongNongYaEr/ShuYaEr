import {DEFAULT_UV_PADDING} from './uv-layout-policy.js';
import {inspectGeometry} from './geometry-repair.js';
export const PREPARATION_STEPS=[['inspect','读取与检查'],['optimize','按需减面'],['flow','榕根结构分析'],['uv','整块 UV'],['finish','进入材质工作台']];
export function modelPreparationOptions(raw={}){
 const v={height:10,target:50000,resolution:2048,padding:DEFAULT_UV_PADDING,route:'full',...raw};
 if(Object.keys(v).some(k=>!['height','target','resolution','padding','route'].includes(k))||!['full','staged','material','overlay'].includes(v.route)||!Number.isFinite(v.height)||v.height<.1||v.height>200||!Number.isInteger(v.target)||v.target<100||v.target>50000||![1024,2048,4096].includes(v.resolution)||!Number.isInteger(v.padding)||v.padding<0||v.padding>32)throw Error('准备设置无效：树高0.1–200米，目标100–50000三角面。');
 return v;
}
const cancelled=()=>Object.assign(Error('已取消准备，处理前工程保持不变。'),{name:'AbortError'});
const WORKING_TRIANGLE_LIMIT=250000;
function validateTopologyCheckpoint(checkpoint,staged){
 if(!staged||!['source','topology'].includes(checkpoint.kind)||typeof checkpoint.name!=='string'||
   !/^[a-f0-9]{64}$/.test(checkpoint.sourceHash)||!/^[a-f0-9]{64}$/.test(checkpoint.originalHash)||
   !Number.isInteger(checkpoint.inputTriangles)||!Number.isInteger(checkpoint.outputTriangles)||
   checkpoint.outputTriangles<1||checkpoint.outputTriangles>WORKING_TRIANGLE_LIMIT||
   checkpoint.outputTriangles>checkpoint.inputTriangles)
  throw Error('拓扑检查点无效，请重新准备模型。');
 return checkpoint;
}
// Every stage works on a detached draft. Only publish() may replace the active
// project, after the model/UV/flow checks all succeed. This is not a button macro.
export async function prepareTreeAsset(input,raw,host){
 const options=modelPreparationOptions(raw),check=()=>{if(!host.current())throw cancelled();},report={steps:[],warnings:[]};let phase='inspect',recovery=null,optimizationAttempted=false;
 const staged=options.route==='staged',optimize=staged||options.route==='full';
 const step=async(id,operation)=>{phase=id;check();host.phase(id);const started=performance.now(),value=await operation();if(id!=='finish')check();report.steps.push({id,seconds:(performance.now()-started)/1000});return value;};
 try{
  const checkpoint=input.checkpoint?validateTopologyCheckpoint(input.checkpoint,staged):null;
  const original=await step('inspect',async()=>{
   if(checkpoint){
    const bytes=await host.read({name:checkpoint.name,hash:checkpoint.sourceHash});check();
    return {bytes,name:checkpoint.name,hash:checkpoint.originalHash,info:{triangles:checkpoint.inputTriangles}};
   }
   const bytes=await host.read(input);check();const source=options.route==='overlay'?await host.parse(bytes,input.name):null,info=source?{triangles:source.indices.length/3}:host.inspect(bytes),hash=await host.put(bytes);check();return{bytes,info,hash,name:input.name,source};
  });
  if(!checkpoint&&optimize&&original.info.triangles>options.target&&original.info.triangles<=WORKING_TRIANGLE_LIMIT){
   recovery={kind:'source',name:original.name,sourceHash:original.hash,originalHash:original.hash,
    inputTriangles:original.info.triangles,outputTriangles:original.info.triangles,optimizationSkipped:true};
  }
  let reduced=await step('optimize',async()=>{
   if(checkpoint)return {bytes:original.bytes,name:original.name,skipped:checkpoint.optimizationSkipped,metadata:checkpoint.optimization};
   if(!optimize){if(original.info.triangles>WORKING_TRIANGLE_LIMIT)throw Error('保留原面数模式支持最多25万面。');return{bytes:original.bytes,name:original.name,skipped:true};}
   if(original.info.triangles<=options.target)return{bytes:original.bytes,name:original.name,skipped:true};
   optimizationAttempted=true;
   const result=await host.optimize(original,options);check();if(result.metadata.outputTriangles>WORKING_TRIANGLE_LIMIT)throw Error('保护约束下结果仍超过25万面，请在减面精修中调整。');return result;
  });
  let source=original.source||await host.parse(reduced.bytes,reduced.name);check();
  if(checkpoint&&(source.sourceSHA256!==checkpoint.sourceHash||source.indices.length/3!==checkpoint.outputTriangles))throw Error('拓扑检查点与已保存的模型不一致，请重新准备。');
  if(reduced.metadata&&source.indices.length/3!==reduced.metadata.outputTriangles)throw Error('减面模型与统计不一致，当前工程未替换。');
  if(reduced.metadata&&inspectGeometry(source).removedFaces)throw Error('减面结果出现退化面，请重新生成减面候选。');
  if(options.route==='overlay'){await host.validatePreserved?.(source,options);check();}
  if(checkpoint?.kind==='topology'){
   if(!reduced.metadata&&inspectGeometry(source).removedFaces)throw Error('拓扑检查点含退化面，请重新准备。');
   report.geometryRepair=checkpoint.geometryRepair||null;
  }else if(host.repairInput){
   const clean=await host.repairInput({...reduced,source},options);check();
   reduced={...reduced,...clean};source=clean.source;report.geometryRepair=clean.geometryRepair||null;
  }else if(optimize&&!reduced.metadata&&!await host.repair(source,reduced.name))throw cancelled();
  if(options.route==='material'){await host.validatePreserved?.(source,options);check();}
  check();
  const sourceHash=checkpoint?.kind==='topology'||reduced.skipped&&!report.geometryRepair?checkpoint?.sourceHash||original.hash:await host.put(reduced.bytes);check();const draft=host.document({source,sourceHash,originalHash:original.hash,optimization:reduced.metadata||null,name:reduced.name,options});
  if(checkpoint)report.warnings.push(checkpoint.kind==='source'?'已跳过减面并打开分步处理。':'已打开上次完成的拓扑，可继续整理 UV。');
  if(report.geometryRepair)report.warnings.push('已在工作副本清理 '+report.geometryRepair.removedFaces+' 个零面积三角面。');
  Object.assign(report,{route:options.route,inputTriangles:original.info.triangles,outputTriangles:source.indices.length/3,optimizationSkipped:!!reduced.skipped});
  if(reduced.metadata?.report?.targetReached===false)report.warnings.push(`为保留树形，实际保留 ${report.outputTriangles.toLocaleString()} 面，高于目标 ${options.target.toLocaleString()} 面。`);
  if(staged){
   const result=await step('finish',()=>host.publish({source,draft,mesh:source,report,originalHash:original.hash}));
   return {...result,report};
  }
  if(options.route==='full'){
   recovery={kind:'topology',name:reduced.name,sourceHash,originalHash:original.hash,optimization:reduced.metadata||null,
    inputTriangles:report.inputTriangles,outputTriangles:report.outputTriangles,optimizationSkipped:report.optimizationSkipped,geometryRepair:report.geometryRepair};
  }
  const flow=await step('flow',()=>host.flow(source,draft,options));
  if(options.route!=='overlay'&&(!flow?.field||draft.barkFlow?.version!==5||!draft.settings.directional||draft.settings.directionMode!==3))throw Error('榕根走势尚未完整准备，当前工程未替换。');
  if(flow?.warning)report.warnings.push(flow.warning);
  const uv=await step('uv',()=>host.uv(source,draft,flow,options));
  if(!uv?.mesh||!uv.clearance?.safe&&!(options.route==='material'&&uv.preserved&&uv.clearance?.status==='measured'))throw Error('UV未通过安全检查，请在UV精修中检查；原工程保持。');
  if(options.route==='material'&&!uv.clearance.safe)report.warnings.push('原UV保留，原有间距/重叠风险将在导出清单中记录；未自动重新展开。');
  if(uv.warning)report.warnings.push(uv.warning);
  Object.assign(report,{flowReused:!!flow?.reused,uvReused:!!uv.reused,uv:uv.statistics});
  if(uv.mesh.packing?.treeStrips?.regionGrowth?.selected===false)report.warnings.push('大片展开未通过检查，已使用稳健展开。');
  const result=await step('finish',()=>host.publish({source,draft,flow:flow?.field,mesh:uv.mesh,report,originalHash:original.hash}));return{...result,report};
 }catch(error){
  error.preparationStage=phase;
  if(error.name!=='AbortError'&&host.current()&&
    (recovery?.kind==='source'&&phase==='optimize'||recovery?.kind==='topology'&&(phase==='flow'||phase==='uv')))
   error.preparationCheckpoint=recovery;
  if(error.name!=='AbortError'&&host.current()&&phase==='optimize'&&optimizationAttempted&&!recovery)error.suggestOptimization=true;
  throw error;
 }
}
