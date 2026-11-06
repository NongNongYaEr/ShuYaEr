import {DEFAULT_UV_PADDING} from './uv-layout-policy.js';
export const PREPARATION_STEPS=[['inspect','读取与检查'],['optimize','按需减面'],['flow','榕根结构分析'],['uv','整块 UV'],['finish','进入材质工作台']];
export function modelPreparationOptions(raw={}){
 const v={height:10,target:50000,resolution:2048,padding:DEFAULT_UV_PADDING,route:'full',...raw};
 if(Object.keys(v).some(k=>!['height','target','resolution','padding','route'].includes(k))||!['full','material'].includes(v.route)||!Number.isFinite(v.height)||v.height<.1||v.height>200||!Number.isInteger(v.target)||v.target<100||v.target>50000||![1024,2048,4096].includes(v.resolution)||!Number.isInteger(v.padding)||v.padding<0||v.padding>32)throw Error('准备设置无效：树高0.1–200米，目标100–50000三角面。');
 return v;
}
const cancelled=()=>Object.assign(Error('已取消准备，处理前工程保持不变。'),{name:'AbortError'});
// Every stage works on a detached draft. Only publish() may replace the active
// project, after the model/UV/flow checks all succeed. This is not a button macro.
export async function prepareTreeAsset(input,raw,host){
 const options=modelPreparationOptions(raw),check=()=>{if(!host.current())throw cancelled();},report={steps:[],warnings:[]};let phase='inspect';
 const step=async(id,operation)=>{phase=id;check();host.phase(id);const started=performance.now(),value=await operation();if(id!=='finish')check();report.steps.push({id,seconds:(performance.now()-started)/1000});return value;};
 try{
  const original=await step('inspect',async()=>{const bytes=await host.read(input);check();const info=host.inspect(bytes),hash=await host.put(bytes);check();return{bytes,info,hash,name:input.name};});
  let reduced=await step('optimize',async()=>{
   if(options.route==='material'){if(original.info.triangles>250000)throw Error('只制作材质模式保留原面数；当前超过25万面材质工作预算，请选择高模完整处理。');return{bytes:original.bytes,name:original.name,skipped:true};}
   if(original.info.triangles<=options.target&&original.info.triangles<=250000)return{bytes:original.bytes,name:original.name,skipped:true};
   const result=await host.optimize(original,options);check();if(result.metadata.outputTriangles>250000)throw Error('保护约束下结果仍超过25万面，请在减面精修中调整。');return result;
  });
  let source=await host.parse(reduced.bytes,reduced.name);check();if(reduced.metadata&&source.indices.length/3!==reduced.metadata.outputTriangles)throw Error('减面模型与统计不一致，当前工程未替换。');
  if(options.route==='material'){await host.validatePreserved?.(source);check();}
  else if(host.repairInput){const clean=await host.repairInput({...reduced,source});check();if(reduced.metadata&&clean.geometryRepair)throw Error('减面结果出现退化面，请重新生成减面候选；原工程保持。');reduced={...reduced,...clean};source=clean.source;report.geometryRepair=clean.geometryRepair||null;}else if(!reduced.metadata&&!await host.repair(source,reduced.name))throw cancelled();check();
  const sourceHash=reduced.skipped&&!report.geometryRepair?original.hash:await host.put(reduced.bytes);check();const draft=host.document({source,sourceHash,originalHash:original.hash,optimization:reduced.metadata||null,name:reduced.name,options});
  const flow=await step('flow',()=>host.flow(source,draft,options));
  if(!flow?.field||draft.barkFlow?.version!==5||!draft.settings.directional||draft.settings.directionMode!==3)throw Error('榕根走势尚未完整准备，当前工程未替换。');
  const uv=await step('uv',()=>host.uv(source,draft,flow,options));
  if(!uv?.mesh||!uv.clearance?.safe&&!(options.route==='material'&&uv.preserved&&uv.clearance?.status==='measured'))throw Error('UV未通过安全检查，请在UV精修中检查；原工程保持。');
  if(options.route==='material'&&!uv.clearance.safe)report.warnings.push('原UV保留，原有间距/重叠风险将在导出清单中记录；未自动重新展开。');
  if(report.geometryRepair)report.warnings.push('已清理 '+report.geometryRepair.removedFaces+' 个零面积三角面，原模型保留。');report.route=options.route;report.inputTriangles=original.info.triangles;report.outputTriangles=source.indices.length/3;report.optimizationSkipped=!!reduced.skipped;report.flowReused=!!flow.reused;report.uvReused=!!uv.reused;report.uv=uv.statistics;
  if(reduced.metadata?.report?.targetReached===false)report.warnings.push(`为保留树形，实际保留 ${report.outputTriangles.toLocaleString()} 面，高于目标 ${options.target.toLocaleString()} 面。`);
  if(uv.mesh.packing?.treeStrips?.regionGrowth?.selected===false)report.warnings.push('大片展开未通过检查，已使用稳健展开。');
  const result=await step('finish',()=>host.publish({source,draft,flow:flow.field,mesh:uv.mesh,report,originalHash:original.hash}));return{...result,report};
 }catch(error){error.preparationStage=phase;throw error;}
}
