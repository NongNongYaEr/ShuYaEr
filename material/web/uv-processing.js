import {analyzeBarkFlow} from './bark-flow-analysis.js';
import {validateTreeUvOptions} from './tree-uv-rules.js';
import {planStructureUnwrap,packStructureUnwrap} from './tree-structure-uv.js';
import {applyUvResult} from './working-mesh.js';
import {planGuidedUnwrap,packGuidedUnwrap} from './uv-guides.js';
import {hasCutRules} from './uv-guide-rules.js';
import {planTreeUnwrap,packTreeUnwrap,treeGuideMetadata} from './tree-uv.js';
import {assertUvIslandsPreserved} from './uv-layout-policy.js';
import {analyzeUV} from './uv-analysis.js';
export const hasUvConstraints=rules=>!!(rules?.pins?.length||Object.values(rules?.weights||{}).some(v=>Math.abs(v-1)>1e-6));
const collapsedUvError='UV input has zero-area triangles; use automatic unwrap';
const unwrapFailed=failure=>Error('自动展开仍有零面积 UV，已保留原工程。请调整减面参数后重试，或选用分步处理检查 UV。',{cause:failure});
export async function prepareUvWithFallback(input,options,dependencies,{isCurrent,onFallback}){
  let failure;
  const modes=options.mode==='tree'?['tree','unwrap']:[options.mode];
  for(const mode of modes){
    if(mode!==options.mode)onFallback('unwrap');
    try{
      return await prepareUvRevision(input,{...options,mode},dependencies);
    }catch(error){
      if(error.message!==collapsedUvError)throw error;
      if(!isCurrent())throw Object.assign(Error('任务已取消。'),{name:'AbortError'});
      failure=error;
    }
  }
  if(hasUvConstraints(options.rules)||hasCutRules(options.cutRules)){
    throw Error('自动展开仍有零面积 UV。请在 UV 精修中检查指定接缝、保护面或锁定岛后重试。',{cause:failure});
  }
  if(typeof dependencies.pack!=='function')throw unwrapFailed(failure);
  const original=analyzeUV(input,{sampleSize:64});
  if(!original.zeroUvFaces&&!original.outOfRangeFaces){
    onFallback('repair-existing');
    try{return await prepareUvRevision(input,{...options,mode:'unwrap',repairSourceOverlap:true},dependencies);}
    catch(error){
      if(error.name==='AbortError'||!isCurrent())throw error;
      failure=error;
    }
  }
  if(!dependencies.projectUv)throw unwrapFailed(failure);
  onFallback('projection');
  try{
    const packed=await dependencies.projectUv(input,options);
    if(!isCurrent())throw Object.assign(Error('任务已取消。'),{name:'AbortError'});
    return await finishPacked(input,packed,{...options,mode:'unwrap'},dependencies.native);
  }catch(error){
    if(error.name==='AbortError')throw error;
    throw Error('备用展开未通过检查。可降低扩色、提高贴图分辨率，或先保留拓扑再调整减面。'+
      (error.message===collapsedUvError?'':error.message),{cause:error});
  }
}
async function finishPacked(input,packed,{mode,revision},native){const intermediate=await applyUvResult(input,packed,{mode,revision});intermediate.tangentMethod='pending';const mikk=await native(intermediate,'tangents'),result=await applyUvResult(intermediate,mikk,{mode,revision});result.chartIds=Int32Array.from(mikk.sourceIndices,i=>packed.chartIds[i]);result.atlas=packed.atlas;result.packing={...packed.packing,requiresMikk:false,tangentMethod:'MikkTSpace'};return result;}
export async function prepareUvRevision(input,{mode,revision,resolution=2048,padding=12,rules=null,cutRules=null,flow=null,treeOptions=null,actualHeightMeters=10,corrections=[],transition=1,structureCache=null,shapeCoverage=false,contourFill=false,densityReference=null,repairSourceOverlap=false},{native,pack,guides=null,trees=null}){
  if(repairSourceOverlap){
    if(mode!=='unwrap'||typeof pack!=='function')throw Error('当前入口无法修复原材质工作 UV。');
    const packed=await pack(input,{resolution,padding,repairSourceOverlap:true});
    return finishPacked(input,packed,{mode,revision},native);
  }
  if(mode==='tree'){const config=validateTreeUvOptions(treeOptions),options={resolution,padding,rules,cutRules,flow,treeOptions:config,actualHeightMeters,corrections,transition,structureCache};let plan;const session=trees?trees(input,options):{prepare:async()=>{const record=flow||analyzeBarkFlow(input,{quality:config.quality,algorithm:config.algorithm!=='legacy'?'banyan':'legacy'});plan=(config.algorithm!=='legacy'?planStructureUnwrap:planTreeUnwrap)(input,{...options,flow:record});plan.metadata=await treeGuideMetadata(plan.record);return{mesh:config.algorithm!=='legacy'?plan.input:plan.fallback.mesh};},pack:async result=>(config.algorithm!=='legacy'?packStructureUnwrap:packTreeUnwrap)(plan,result),dispose(){}};try{const prepared=await session.prepare(),unwrapped=prepared.mesh?await native(prepared.mesh,'unwrap'):null,packed=await session.pack(unwrapped);return await finishPacked(input,packed,{mode,revision},native);}finally{session.dispose();}}
  if(mode==='unwrap'&&(hasUvConstraints(rules)||hasCutRules(cutRules))){const options={resolution,padding,rules,cutRules};let plan;const session=guides?guides(input,options):{prepare:async()=>{plan=planGuidedUnwrap(input,options);return{mesh:plan.mesh};},pack:async result=>packGuidedUnwrap(plan,result),dispose(){}};try{const prepared=await session.prepare(),unwrapped=prepared.mesh?await native(prepared.mesh,'unwrap'):null,packed=await session.pack(unwrapped);return await finishPacked(input,packed,{mode,revision},native);}finally{session.dispose();}}
  if(shapeCoverage||contourFill){
    const label=contourFill?'保形填空':'保缝提覆盖';if(mode!=='repack'||typeof pack!=='function')throw Error('当前入口无法运行'+label+'。');
    if(hasUvConstraints(rules)||cutRules?.protectedFaces?.length)throw Error(label+'需要无锁定岛、密度权重和展开保护。');
  }
  if(mode==='repack'&&(hasUvConstraints(rules)||typeof pack==='function')){
    const packed=await pack(input,{resolution,padding,pins:rules?.pins||[],weights:rules?.weights||{},quarterTurns:true,refinePacking:true,...(shapeCoverage?{shapeCoverage:true}:{}),...(contourFill?{contourFill:true}:{}),...(densityReference?{densityReference}:{})});const result=await finishPacked(input,packed,{mode,revision},native);result.packing.islandPreservation=assertUvIslandsPreserved(input,result);return result;
  }
  const result=await applyUvResult(input,await native(input,mode),{mode:mode==='tangents'?'original':mode,revision});result.packing={method:mode==='tangents'?'original':'xatlas',resolution,padding,requiresMikk:false};return result;
}
export function runConstraintWorker(mesh,options,{onProgress=()=>{},setCancel=()=>{}}={}){const worker=new Worker('./uv-constraints-worker.js',{type:'module'});return new Promise((resolve,reject)=>{let settled=false;const finish=(error,result)=>{if(settled)return;settled=true;worker.terminate();if(error)reject(error);else resolve(result);};setCancel(()=>finish(Object.assign(Error('任务已取消。'),{name:'AbortError'})));worker.onmessage=({data})=>{if(data.error)finish(Error(data.error));else if(data.done)finish(null,data.result);else onProgress(data.progress);};worker.onerror=e=>finish(Error(e.message||'UV约束重排失败。'));worker.postMessage({mesh:{pos:mesh.pos,normal:mesh.normal,uv:mesh.uv,indices:mesh.indices,...(options.repairSourceOverlap&&mesh.faceGroups?{faceGroups:mesh.faceGroups}:{})},options});});}
