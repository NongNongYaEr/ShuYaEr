import {runBarkFlowWorker} from './bark-flow-session.js';
import {validateBarkFlow,SURFACE_FLOW_DEFAULTS,CONTINUITY_FLOW_DEFAULTS,BANYAN_FLOW_DEFAULTS} from './bark-flow-rules.js';

// Import defaults are independent of the previous model's experimental controls.
export async function prepareImportedBarkFlow(mesh,doc,{isCurrent=()=>true,setCancel,onProgress,run=runBarkFlowWorker}={}){
 if(doc.barkFlow)throw Error('导入默认走势不能覆盖已有工程走势。');
 const cancelled=()=>Object.assign(Error('模型导入已取消。'),{name:'AbortError'});
 try{
  if(!isCurrent())throw cancelled();
  const result=await run(mesh,{options:{algorithm:'banyan',quality:'fine',surface:{...SURFACE_FLOW_DEFAULTS},continuity:{...CONTINUITY_FLOW_DEFAULTS},banyan:{...BANYAN_FLOW_DEFAULTS}},corrections:doc.directionCorrections,actualHeightMeters:doc.actualHeightMeters,transition:doc.flowTransition},{setCancel,onProgress});
  if(!isCurrent())throw cancelled();
  const flow=validateBarkFlow(result.flow,mesh.sourceSHA256);
  if(flow?.version!==5||!result.field)throw Error('榕根表面走势未完整生成。');
  doc.barkFlow=flow;
  doc.settings={...doc.settings,directional:true,directionMode:3};
  return {field:result.field,warning:null};
 }catch(error){
  if(error.name==='AbortError'||!isCurrent())throw cancelled();
  // A model outside the analysis budget can still be imported and edited.
  doc.settings={...doc.settings,directional:true,directionMode:2};
  return {field:null,warning:'榕根表面走势未启用：'+error.message+' 当前使用表面近似方向，可在树皮走势中重新分析。'};
 }
}
