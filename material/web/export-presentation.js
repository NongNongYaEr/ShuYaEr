import {assertRecordedPadding} from './uv-padding-contract.js';

export const EXPORT_VIEW_MODES=['overview','model','maps'];
export function exportViewMode(value){return EXPORT_VIEW_MODES.includes(value)?value:'overview';}
export const isOnlyMissingAO=surface=>!!surface?.missing?.length&&surface.missing.every(item=>item.type==='ao');
const hasOriginalUV=model=>!!model?.sourceUvSHA256&&model.uvSHA256===model.sourceUvSHA256;
export function exportUvState(project,model,diagnostic=model?.diagnostic){
 if(diagnostic?.zeroUvFaces||diagnostic?.outOfRangeFaces||diagnostic?.clearance?.status==='invalid')return 'invalid';
 if(!(diagnostic?.overlap>.001))return 'ready';
 if(!hasOriginalUV(model))return 'invalid';
 const accepted=project?.acceptedSourceUvOverlap;
 return accepted?.source===model.sourceSHA256&&accepted?.uv===model.uvSHA256?'accepted-overlap':'confirm-overlap';
}
function uvSpacingIssue(project,model){
 if(project?.uvPacking&&project.output){
  try{assertRecordedPadding(project.uvPacking,project.output);}
  catch(error){return error.message;}
 }
 const clearance=model?.diagnostic?.clearance;
 if(clearance?.status!=='measured'||clearance.safe||hasOriginalUV(model))return null;
 return clearance.intraIslandOverlapPairs
  ?'UV 岛内存在重叠。请自动重展，或调整接缝后重新生成。'
  :'当前扩色超过实测 UV 安全间距。可降低每侧扩色，或重新排布并采用新 UV。';
}
function uvRecovery(project,detail){
 if(project.materialBase)return{action:'overlay-uv',label:'重新准备烘焙 UV',detail:detail+' 在模型准备中重新准备原材质叠加的烘焙 UV。'};
 return{action:'uv',label:'打开 UV 整理',detail};
}
export function exportReadiness({project,model,surface={},busy=false,aoReady=false,geometryNeedsRepair=false,compatibilityError=null}={}){
 const uvState=exportUvState(project,model),invalidUV=uvState==='invalid';
 const spacingIssue=!geometryNeedsRepair&&!invalidUV&&uvSpacingIssue(project,model);
 const missingAO=isOnlyMissingAO(surface),materialError=compatibilityError||(!missingAO&&surface.error)||null;
 let recovery=null;
 if(!project||!model)recovery={action:'model',label:'打开模型准备',detail:'请先导入并准备模型，再生成最终 GLB。'};
 else if(compatibilityError)recovery={action:'material',label:'检查材质图层',detail:compatibilityError};
 else if(!geometryNeedsRepair){
  if(invalidUV)recovery=uvRecovery(project,'当前 UV 有零面积、越界或重叠。请整理并采用有效 UV 后再导出。');
  else if(spacingIssue)recovery=uvRecovery(project,spacingIssue);
  else if(materialError)recovery=surface.missing?.length
   ?{action:'distribution',label:'准备材质数据',detail:materialError}
   :{action:'material',label:'检查材质分布',detail:materialError};
 }
 return{
  canExport:!busy&&!surface.pending&&!recovery,
  recovery,invalidUV,uvError:!geometryNeedsRepair&&(invalidUV||!!spacingIssue),materialError,
  model:!model?'请先准备模型':(model.indices.length/3).toLocaleString()+' 三角面',
  uv:geometryNeedsRepair?'检测到退化面 · 导出时确认清理':invalidUV?'存在无效或重叠 UV':spacingIssue?'UV 间距需整理':
   uvState==='confirm-overlap'?'原 UV 有重叠 · 导出时确认':uvState==='accepted-overlap'?'已接受原 UV 重叠 · 可导出':model?'UV 可用 · 导出时核验间距':'尚未就绪',
  material:compatibilityError?'当前图形模式限制材质导出':missingAO?'导出时准备模型 AO':materialError?'材质分布需处理':surface.pending?'正在更新材质':'材质已就绪',
  ao:aoReady?'几何 AO 已就绪':'首次导出自动计算',
  microdetail:project?.microdetail?.enabled===true
 };
}
export function finalGLBRequest(options){return options?.finalGLB===true;}
