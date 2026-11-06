import {projectSculptResponse} from './sculpt-response-field.js';
import {burlDistributionKey} from './burl-effect.js';
import {formDistributionKey} from './form-effects.js';
import {flattenLayerSurface} from './surface-layers.js';
import {SurfaceDistributionSession} from './surface-distribution-session.js';
import {syncLegacySurface} from './surface-effects.js';
import {distributionDependencies} from './surface-distribution.js';

// Owns derived data only. Authoring state is always supplied by the workbench.
export function createSurfaceWorkbench(api){
 let session=null,source=null,working=null,serial=0,acceptedKey=null,acceptedAuthoring=null,curvatureKey=null,preview=null,error=null,pending=false,disposed=false,weatheringKey=null,stableKey=null,metrics=null;
 const analysisKey=doc=>JSON.stringify([api.source()?.sourceSHA256,doc.actualHeightMeters,doc.surface.analysis.curvature.radiusMeters]);
 const runtime=()=>{const doc=api.document();return doc&&{...doc,settings:{...api.settings()},surface:{...flattenLayerSurface(syncLegacySurface({...doc,settings:api.settings()})),active:true}};};
 const authoringKey=doc=>JSON.stringify([doc.surface.masks,doc.surface.areas,doc.surface.effects.map(e=>[e.id,e.enabled,e.opacity>0,e.maskRef,e.scopeRef,e.edgeTreatment,formDistributionKey(e),burlDistributionKey(e)]),doc.sculptMaterial?.local,doc.surface.analysis,doc.parts,doc.actualHeightMeters,doc.resources.ao]);
 const sourceAO=doc=>doc.surface.effects.some(e=>e.type==='burl'&&!e.manualDecal&&e.enabled&&e.opacity>0&&e.params.burlCount>0)&&!doc.resources.ao?null:source.ao||null;
 const curvatureAvailable=doc=>curvatureKey===analysisKey(doc)||JSON.stringify(doc.surface.analysis.curvature.preparedFor)===JSON.stringify({sourceSHA256:api.source()?.sourceSHA256,actualHeightMeters:doc.actualHeightMeters,radiusMeters:doc.surface.analysis.curvature.radiusMeters});
 const maskKey=(doc,size,padding,view)=>JSON.stringify([doc.id,doc.surface.masks,doc.surface.areas,doc.surface.effects.map(e=>[e.id,e.enabled,e.opacity>0,e.maskRef,e.scopeRef,e.edgeTreatment,formDistributionKey(e),burlDistributionKey(e)]),doc.sculptMaterial?.local,doc.surface.analysis,doc.parts,doc.actualHeightMeters,doc.resources.ao,size,padding,view]);
 function reset(){serial++;session?.dispose();session=null;source=working=null;acceptedKey=null;acceptedAuthoring=null;preview=null;error=null;pending=false;weatheringKey=null;stableKey=null;metrics=null;}
 function bindInputs(){if(source!==api.source()){reset();source=api.source();working=api.working();}else if(working!==api.working()){if(session?.retarget){serial++;working=api.working();session.retarget(working);acceptedKey=acceptedAuthoring=null;preview=null;error=null;}else{reset();source=api.source();working=api.working();}}}
 async function update({size=1024,task=null,final=false}={}){
  if(disposed||!api.source()||!api.working()||!api.document())return;
  bindInputs();
  const doc=runtime(),view=final?null:preview,padding=Math.max(2,Math.ceil(doc.output.padding*size/doc.output.resolution)),key=maskKey(doc,size,padding,view),r=api.renderer();r.setSculptResponse(doc.sculptMaterial);
  if(key===acceptedKey){serial++;pending=false;error=null;r.setSurfaceStack(doc.surface);r.selectedEffectId=api.selectedEffect?.();r.dirty=true;return;}
  const requestSerial=++serial;const missing=distributionDependencies(doc.surface,{hasAO:!!sourceAO(doc),hasCurvature:curvatureAvailable(doc)});
  if(missing.length){pending=false;error=Object.assign(Error('请准备分布数据：'+missing.map(x=>x.label).join('、')),{missing});api.changed?.();throw error;}
  if(api.working().diagnostic?.outOfRangeFaces||api.working().diagnostic?.zeroUvFaces){pending=false;error=Error('当前UV无法生成表面分布，请先整理UV。');api.changed?.();throw error;}
  session||=(api.sessionFactory?api.sessionFactory(source,working):new SurfaceDistributionSession(source,working));const owner=session,revision=requestSerial;pending=true;error=null;api.changed?.();
  if(task)task.cancel=()=>{owner.dispose();if(session===owner){session=null;serial++;pending=false;api.changed?.();}};
  try{
   const result=await owner.request({document:doc,size,padding,ao:sourceAO(doc),curvatureReady:curvatureAvailable(doc),preview:view});
   if(disposed||revision!==serial||owner!==session||doc.id!==api.document()?.id||source!==api.source()||working!==api.working())throw Object.assign(Error('分布结果已被替换。'),{name:'AbortError'});
   if(task&&!api.accepts(task))throw Object.assign(Error('分布计算已取消。'),{name:'AbortError'});
   if(result.analysis?.stable?.length)stableKey=JSON.stringify([doc.id,source.sourceSHA256,doc.actualHeightMeters]);if(result.analysis?.weathering?.length)weatheringKey=JSON.stringify([doc.id,source.sourceSHA256,doc.actualHeightMeters]);r.setSurfaceMasks(result);if(result.sculptField)r.setSculptField(projectSculptResponse(source,working,result.sculptField),JSON.stringify([doc.id,result.sculptField.sourceSHA256,result.sculptField.actualHeightMeters]));r.setSculptResponse(doc.sculptMaterial);r.setSurfaceStack(runtime().surface);r.selectedEffectId=api.selectedEffect?.();acceptedKey=key;acceptedAuthoring=authoringKey(doc);metrics=result.performance||null;error=null;api.accepted?.(result);
  }catch(e){if(revision===serial&&e.name!=='AbortError')error=e;throw e;}finally{if(revision===serial){pending=false;api.changed?.();}}
 }
 return{
  update,reset,runtime,
  async analyzeSculpt(task){bindInputs();const doc=runtime(),identity=JSON.stringify([doc.id,source.sourceSHA256,doc.actualHeightMeters]);session||=(api.sessionFactory?api.sessionFactory(source,working):new SurfaceDistributionSession(source,working));const owner=session;if(task)task.cancel=()=>{owner.dispose();if(session===owner)session=null;};const result=await owner.request({document:doc,size:16,padding:2,analysisOnly:'sculpt'});if(disposed||owner!==session||identity!==JSON.stringify([api.document()?.id,api.source()?.sourceSHA256,api.document()?.actualHeightMeters])||task&&!api.accepts(task))throw Object.assign(Error('雕刻分析已取消或模型已改变。'),{name:'AbortError'});return result.sculpt;},
  syncMaterial(){const doc=runtime(),r=api.renderer();r?.setSculptResponse(doc?.sculptMaterial);if(doc&&acceptedAuthoring===authoringKey(doc)&&r?.surfaceMaskSlots?.join('|')===doc.surface.effects.map(e=>e.id).join('|')){r.setSurfaceStack(doc.surface);r.selectedEffectId=api.selectedEffect?.();r.dirty=true;}},
  setPreview(value){preview=value;return api.queue();},
  get preview(){return preview;},
  async prepareCandidate(next,task){bindInputs();const ownerSource=source,ownerWorking=working,identity=JSON.stringify([next.id,next.resources.source,next.actualHeightMeters]),candidate={...next,settings:{...api.settings()},surface:{...flattenLayerSurface(syncLegacySurface(next)),active:true}};session||=(api.sessionFactory?api.sessionFactory(source,working):new SurfaceDistributionSession(source,working));const owner=session;if(task)task.cancel=()=>{owner.dispose();if(session===owner){session=null;}};const size=1024,padding=Math.max(2,Math.ceil(next.output.padding*size/next.output.resolution));const result=await owner.request({document:candidate,size,padding,ao:sourceAO(candidate),curvatureReady:curvatureAvailable(next),preview:null});if(disposed||owner!==session||source!==ownerSource||source!==api.source()||working!==ownerWorking||working!==api.working()||identity!==JSON.stringify([api.document()?.id,api.document()?.resources.source,api.document()?.actualHeightMeters])||task&&!api.accepts(task))throw Object.assign(Error('候选分布已取消或模型已改变。'),{name:'AbortError'});return result;},
  async prepareWeathering(task){bindInputs();const doc=runtime(),identity=JSON.stringify([doc.id,api.source()?.sourceSHA256,doc.actualHeightMeters]);session||=(api.sessionFactory?api.sessionFactory(source,working):new SurfaceDistributionSession(source,working));const owner=session;if(task)task.cancel=()=>{owner.dispose();if(session===owner){session=null;weatheringKey=null;}};const result=await owner.request({document:doc,size:16,padding:2,analysisOnly:'weathering'});if(disposed||owner!==session||identity!==JSON.stringify([api.document()?.id,api.source()?.sourceSHA256,api.document()?.actualHeightMeters])||task&&!api.accepts(task))throw Object.assign(Error('形体分析已取消或模型已改变。'),{name:'AbortError'});weatheringKey=identity;return result;},
  async prepareStable(task,recognitionCm=18){bindInputs();const doc=runtime(),identity=JSON.stringify([doc.id,source.sourceSHA256,doc.actualHeightMeters]);session||=(api.sessionFactory?api.sessionFactory(source,working):new SurfaceDistributionSession(source,working));const owner=session;if(task)task.cancel=()=>{owner.dispose();if(session===owner){session=null;stableKey=null;}};const result=await owner.request({document:doc,size:16,padding:2,analysisOnly:'stable',recognitionCm});if(disposed||owner!==session||identity!==JSON.stringify([api.document()?.id,api.source()?.sourceSHA256,api.document()?.actualHeightMeters])||task&&!api.accepts(task))throw Object.assign(Error('形体分析已取消或模型已改变。'),{name:'AbortError'});stableKey=identity;return result;},
  prepareCurvature(){const doc=api.document();curvatureKey=analysisKey(doc);api.recordCurvature?.({sourceSHA256:api.source().sourceSHA256,actualHeightMeters:doc.actualHeightMeters,radiusMeters:doc.surface.analysis.curvature.radiusMeters});acceptedKey=null;return api.queue();},
  get state(){const doc=api.document();return{performance:metrics,stable:!!doc&&stableKey===JSON.stringify([doc.id,api.source()?.sourceSHA256,doc.actualHeightMeters]),weathering:!!doc&&weatheringKey===JSON.stringify([doc.id,api.source()?.sourceSHA256,doc.actualHeightMeters]),pending,error:error?.message||null,missing:error?.missing||[],aoVerified:!!doc?.resources.ao&&!!api.source()?.ao,ao:!!api.source()?.ao,curvature:!!doc&&curvatureAvailable(doc),curvatureMetadata:api.renderer()?.surfaceAnalysis?.curvature||null};},
  dispose(){disposed=true;reset();}
 };
}
