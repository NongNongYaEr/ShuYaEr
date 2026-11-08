import {growSurfaceUvRegions,surfaceRegionIntegrity} from './tree-uv-regions.js';
import {absorbLocalUvPatches} from './tree-uv-local-patches.js';
import {extendUvAlongFlow,sewUvFragments} from './tree-uv-fragments.js';
import {polishTreeUvCharts} from './tree-uv-polish.js';
import {absorbTreeUvPatches} from './tree-uv-patches.js';
import {canonicalTreeUvInput,restoreTreeUvCorners} from './tree-uv-source.js';
import {planGuidedUnwrap,packGuidedUnwrap} from './uv-guides.js';
import {validateBarkFlow,SURFACE_FLOW_DEFAULTS,CONTINUITY_FLOW_DEFAULTS,BANYAN_FLOW_DEFAULTS} from './bark-flow-rules.js';
import {buildBarkStructure} from './bark-flow.js';
import {reuseBarkStructure} from './bark-structure-cache.js';
import {validateTreeUvOptions} from './tree-uv-rules.js';
import {createBranchSampler} from './branch-sampler.js';
import {assembleStructureCharts} from './tree-structure-stitch.js';
import {packTreeUnwrap} from './tree-uv.js';
import {analyzeUV} from './uv-analysis.js';
import {assertUvClearance,measureUvClearance} from './uv-clearance.js';
import {fitSewnUvIslands} from './tree-uv-partial-packing.js';
import {createUvDensityBudget} from './uv-density-budget.js';
export function prepareTreeStructure(mesh,flow,{actualHeightMeters=10,corrections=[],transition=1,scaleCm=35,onProgress=()=>{},structureCache=null}={}){
 const record=validateBarkFlow(flow,mesh.sourceSHA256);if(!record)throw Error('树结构UV需要匹配源模型的结构分析。');
 const analysis={...record,version:5,surface:record.surface||{...SURFACE_FLOW_DEFAULTS},continuity:record.continuity||{...CONTINUITY_FLOW_DEFAULTS},banyan:{...(record.banyan||BANYAN_FLOW_DEFAULTS),shapeScaleCm:scaleCm}};
 const cached=reuseBarkStructure(mesh,analysis,{actualHeightMeters,corrections,transition},structureCache);if(cached){onProgress({phase:'复用已验证的榕根表面方向',progress:1});return cached;}
 const field=buildBarkStructure(mesh,analysis,{actualHeightMeters,corrections,transition,progress:p=>onProgress({phase:'分析枝干与榕根表面方向',progress:p})});
 field.uvDirections=field.banyanDirections.slice();if(corrections.length)for(let f=0;f<mesh.indices.length/3;f++){const n=[0,0,0];for(let c=0;c<3;c++)for(let k=0;k<3;k++)n[k]+=field.growth[mesh.indices[f*3+c]*3+k];const length=Math.hypot(...n);if(length>1e-12)for(let k=0;k<3;k++)field.uvDirections[f*3+k]=n[k]/length;}
 return field;
}
export function planStructureUnwrap(input,{flow,treeOptions,actualHeightMeters=10,corrections=[],transition=1,structureCache=null,maxRegionSpan=null,...options},{source=input,onProgress=()=>{}}={}){
 const config=validateTreeUvOptions(treeOptions),record=validateBarkFlow(flow,input.sourceSHA256);if(!record)throw Error('树结构UV缺少对应的枝干分析。');const guided=planGuidedUnwrap(input,options),structure=guided.mesh?prepareTreeStructure(source,record,{actualHeightMeters,corrections,transition,scaleCm:config.structureScaleCm,onProgress,structureCache}):null;
 const canonical=canonicalTreeUvInput(guided,source);
 return{guided,config,record,structure,canonicalIndices:canonical?.expectedIndices,maxRegionSpan,actualHeightMeters,corrections,transition,algorithm:config.algorithm==='regions'?'structure-guided-local-patches-v10':'structure-guided-precision-pack-v8',input:canonical?.input||null};
}
function canRefineContinuity(plan){
 const {guided}=plan;
 return plan.config.refitJoins&&!guided.protectedSet.size&&!guided.seamIds.size&&
  !guided.faceWeights.some(weight=>weight!==1);
}
function packSmartTree(plan,nativeResult,onProgress){
 const candidates=[],rejected=[];
 const options={resolution:plan.guided.options.resolution,padding:plan.guided.options.padding};
 const variants=plan.guided.mesh&&plan.guided.input.indices.length/3<=50000?['structure','regions']:['structure'];
 // Scale the compact cap by the model height. A fixed length in meters would
 // make the same mesh split differently after a size calibration.
 const compactSpan=.4;
 if(variants.length>1&&structureExtent(plan)>compactSpan)variants.push('compact');
 const canSew=variants.length>1&&canRefineContinuity(plan);
 const comparisonEnd=canSew ? .76 : 1;
 for(const [index,name] of variants.entries()){
  const algorithm=name==='compact'?'regions':name;
  const config={...plan.config,algorithm};
  if(algorithm==='regions'&&config.profile==='balanced')config.profile='continuous';
  const variant={...plan,config,algorithm:algorithm==='regions'?'structure-guided-local-patches-v10':'structure-guided-precision-pack-v8',
   maxRegionSpan:name==='compact'?compactSpan:plan.maxRegionSpan};
  try{
   const packed=packStructureUnwrap(variant,nativeResult,{refineFragments:false,
    onProgress:p=>onProgress((index+p*.92)/variants.length*comparisonEnd)});
   const stats=analyzeUV(packed,{resolution:options.resolution,sampleSize:512});
   if(stats.overlap>0||stats.outOfRangeFaces||stats.zeroUvFaces)throw Error('发现重叠或无效UV');
   const clearance=assertUvClearance(measureUvClearance(packed),options);
   const diagnostic={algorithm:name,coverage:stats.summedUvTriangleArea,islands:stats.islands,
    ...(name==='compact'?{maxRegionSpan:compactSpan}:{}),
    stretchP95:stats.anisotropy.p95,gapPixels:clearance.gapPixels};
   candidates.push({packed,diagnostic});
  }catch(error){rejected.push({algorithm:name,reason:error.message});}
  onProgress((index+1)/variants.length*comparisonEnd);
 }
 if(!candidates.length)throw Error('智能展开没有通过间距和形变检查的候选。'+rejected.map(item=>item.reason).join('；'));
 const original=candidates.filter(item=>item.diagnostic.algorithm!=='compact');
 const minimumStretch=Math.min(...(original.length?original:candidates).map(item=>item.diagnostic.stretchP95??Infinity));
 const acceptable=item=>(item.diagnostic.stretchP95??Infinity)<=minimumStretch*1.12;
 const comparable=original.filter(acceptable);
 comparable.sort((a,b)=>{
  const gain=b.diagnostic.coverage-a.diagnostic.coverage;
  return Math.abs(gain)>.01?gain:a.diagnostic.islands-b.diagnostic.islands||gain;
 });
 const baseline=comparable[0],compact=candidates.find(item=>item.diagnostic.algorithm==='compact'&&acceptable(item));
 const useCompact=compact&&(!baseline||compact.diagnostic.coverage>=baseline.diagnostic.coverage+.005);
 const {packed:base,diagnostic}=useCompact?compact:baseline;
 let packed=base;
 if(canSew){
  packed=improveSmartTreeContinuity(base,plan,options,p=>onProgress(.76+p*.12));
  onProgress(.88);
  packed=improveLongitudinalContinuity(packed,plan,options,p=>onProgress(.88+p*.115));
 }
 packed.packing.treeStrips.options=plan.config;
 packed.packing.smartUnwrap={selected:diagnostic.algorithm,
  candidates:candidates.map(item=>item.diagnostic),rejected,compared:variants.length};
 onProgress(1);
 return packed;
}

function measureSmartAtlas(mesh,plan,options){
 const d=analyzeUV(mesh,{resolution:options.resolution,actualHeightMeters:plan.actualHeightMeters,includeFaces:true}),
  counts=new Uint32Array(d.islands);
 for(const island of d.faceIslands)counts[island]++;
 return {islands:d.islands,tiny:counts.filter(count=>count<=4).length,
  coverage:d.summedUvTriangleArea,stretchP95:d.anisotropy.p95,seamMeters:d.seamLengthMeters,
  mirroredFaces:d.mirroredFaces,valid:!d.overlap&&!d.outOfRangeFaces&&!d.zeroUvFaces};
}

function improveSmartTreeContinuity(base,plan,options,onProgress,allowedCoverageLoss=.015){
 try{
  const sewn=sewUvFragments(base,{...options,onProgress});
  if(!sewn)return base;
  const before=measureSmartAtlas(base,plan,options),after=measureSmartAtlas(sewn.mesh,plan,options);
  if(!after.valid||after.mirroredFaces!==before.mirroredFaces||after.islands>=before.islands||
     after.tiny>=before.tiny||after.seamMeters>=before.seamMeters||
     after.coverage<before.coverage-allowedCoverageLoss||after.stretchP95>before.stretchP95*1.03)return base;
  assertUvClearance(measureUvClearance(sewn.mesh),options);
  const {mesh,stats}=sewn,{treeStrips,method}=base.packing;
  mesh.sourceIndices=Uint32Array.from(mesh.sourceIndices,index=>base.sourceIndices[index]);
  mesh.packing={...mesh.packing,method,treeStrips:{...treeStrips,stripCharts:after.islands,
   mergedCharts:treeStrips.mergedCharts+stats.merges,regionIntegrity:null},
   fragmentSewing:{before,after,merges:stats.merges,absorbedFaces:stats.absorbedFaces}};
  return mesh;
 }catch{
  // Keep the verified atlas if the optional continuity pass fails.
  return base;
 }
}

function improveLongitudinalContinuity(base,plan,options,onProgress){
 const directions=plan.structure?.uvDirections;
 if(directions?.length!==base.indices.length)return base;
 try{
  const reinsert=options.partialPacking?(mesh,labels)=>fitSewnUvIslands(base,mesh,labels,
   {...options,topology:plan.guided.topology}):undefined;
  const sewn=extendUvAlongFlow(base,directions,{...options,reinsert,maxStretch:plan.config.maxStretch,onProgress});
  if(!sewn)return base;
  const {mesh,stats}=sewn;
  const prior=base.packing.longitudinalSew;
  const before=prior?.after||base.packing.fragmentSewing?.after||measureSmartAtlas(base,plan,options);
  const initial=prior?.before||before;
  const after=measureSmartAtlas(mesh,plan,options);
  if(!after.valid||after.mirroredFaces!==before.mirroredFaces||
     after.coverage<before.coverage||after.stretchP95>initial.stretchP95*1.045||
     after.islands>before.islands||after.tiny>before.tiny||after.seamMeters>=before.seamMeters)return base;
  const partial=mesh.packing.partialSewPacking;
  const longitudinalSew={before:initial,after,closedCuts:(prior?.closedCuts||0)+stats.closedCuts};
  if(partial){
   longitudinalSew.closedEdges=(prior?.closedEdges||0)+partial.closedEdges;
   longitudinalSew.localPasses=[...(prior?.localPasses||[]),partial];
  }
  const {treeStrips,method,fragmentSewing}=base.packing;
  mesh.sourceIndices=Uint32Array.from(mesh.sourceIndices,index=>base.sourceIndices[index]);
  mesh.packing={...mesh.packing,method,treeStrips:{...treeStrips,stripCharts:after.islands,
   mergedCharts:treeStrips.mergedCharts+before.islands-after.islands,regionIntegrity:null},
   fragmentSewing,longitudinalSew};
  return mesh;
 }catch{
  // The previous atlas already passed the standard UV checks.
  return base;
 }
}

function refineSmallFragments(base,plan,options,onProgress){
 if(base.atlas.charts<64)return base;
 try{
  const before=base.packing.longitudinalSew?.after||base.packing.fragmentSewing?.after||measureSmartAtlas(base,plan,options);
  if(before.tiny<16)return base;
  const deadline=Date.now()+8000;
  const reinsert=(mesh,labels)=>fitSewnUvIslands(base,mesh,labels,
   {...options,deadline,topology:plan.guided.topology});
  const sewn=sewUvFragments(base,{...options,maxMerges:64,deadline,reinsert,preserveHardFolds:true,onProgress});
  if(!sewn)return base;
  const {mesh,stats}=sewn,after=measureSmartAtlas(mesh,plan,options);
  if(!after.valid||after.mirroredFaces!==before.mirroredFaces||
     after.coverage<before.coverage||after.stretchP95>before.stretchP95*1.015||
     after.islands>=before.islands||after.tiny>=before.tiny||after.seamMeters>=before.seamMeters)return base;
  const {treeStrips,method,fragmentSewing,longitudinalSew}=base.packing;
  mesh.sourceIndices=Uint32Array.from(mesh.sourceIndices,index=>base.sourceIndices[index]);
  mesh.packing={...mesh.packing,method,treeStrips:{...treeStrips,stripCharts:after.islands,
   mergedCharts:treeStrips.mergedCharts+stats.merges,regionIntegrity:null},fragmentSewing,longitudinalSew,
   smallFragmentRefinement:{before,after,closedEdges:mesh.packing.partialSewPacking.closedEdges}};
  return mesh;
 }catch{
  return base;
 }
}

function refinePinnedFragments(base,plan,options,onProgress){
 if(base.atlas.charts<64)return base;
 try{
  const before=base.packing.smallFragmentRefinement?.after||base.packing.longitudinalSew?.after||
   base.packing.fragmentSewing?.after||measureSmartAtlas(base,plan,options);
  if(before.tiny<16)return base;
  const deadline=Date.now()+18000;
  const reinsert=(mesh,labels)=>fitSewnUvIslands(base,mesh,labels,
   {...options,deadline,topology:plan.guided.topology});
  const sewn=sewUvFragments(base,{...options,maxMerges:96,deadline,reinsert,preserveHardFolds:true,refitTiny:true,onProgress});
  if(!sewn?.stats.refitAccepted)return base;
  const {mesh,stats}=sewn,after=measureSmartAtlas(mesh,plan,options);
  const stretchLimit=Math.max(before.stretchP95,Math.min(1.6,before.stretchP95*1.023));
  if(!after.valid||after.mirroredFaces!==before.mirroredFaces||after.coverage<before.coverage||
     after.stretchP95>stretchLimit||after.islands>=before.islands||after.tiny>=before.tiny||
     after.seamMeters>=before.seamMeters||!createUvDensityBudget(base).audit(mesh))return base;
  const {treeStrips,method,fragmentSewing,longitudinalSew,smallFragmentRefinement}=base.packing;
  mesh.sourceIndices=Uint32Array.from(mesh.sourceIndices,index=>base.sourceIndices[index]);
  mesh.packing={...mesh.packing,method,treeStrips:{...treeStrips,stripCharts:after.islands,
   mergedCharts:treeStrips.mergedCharts+before.islands-after.islands,regionIntegrity:null},
   fragmentSewing,longitudinalSew,smallFragmentRefinement,
   pinnedFragmentRefinement:{before,after,closedEdges:mesh.packing.partialSewPacking.closedEdges,refitPatches:stats.refitAccepted}};
  return mesh;
 }catch{
  return base;
 }
}

function structureExtent(plan){
 return plan.maxRegionSpan??plan.config.structureScaleCm/100/plan.actualHeightMeters*plan.config.maxAspect*4;
}

export function packStructureUnwrap(plan,nativeResult,{onProgress=()=>{},refineFragments=true}={}){
 if(plan.config.algorithm==='smart')return packSmartTree(plan,nativeResult,onProgress);
 if(!plan.guided.mesh){const result=packGuidedUnwrap(plan.guided,null,{onProgress});result.packing={...result.packing,method:'tree-strips',treeStrips:{algorithm:plan.algorithm,options:plan.config,sourceSHA256:plan.record.sourceSHA256,...plan.metadata,protectedFaces:plan.guided.protectedSet.size,stripFaces:0,stripCharts:0}};return result;}
 const config=plan.config;const maxExtent=structureExtent(plan);let seed=restoreTreeUvCorners(plan.guided,nativeResult,plan.canonicalIndices),regionGrowth=null,regionPairs=0;if(config.algorithm==='regions'){const result=growSurfaceUvRegions(plan.guided,plan.structure,{maxStretch:config.maxStretch,densityRatio:config.densityRatio,maxExtent,spendPair:()=>{if(++regionPairs>2000000)throw Error('树结构UV缝合交叠检查超过预算。');},onProgress:p=>onProgress(p*.1)});regionGrowth={...result.stats,selected:result.ok,fallbackReason:result.reason||null};if(result.ok)seed=result.native;}let assembled=assembleStructureCharts(plan.guided,seed,plan.structure,{overlapTestOffset:regionPairs,maxAspect:config.maxAspect,densityRatio:config.densityRatio,maxExtent,frameSampler:createBranchSampler(plan.record),seamAngle:config.seamAngle,fill:config.profile==='continuous'?.08:config.profile==='uniform'?.18:.12,anchorTrials:6,refitJoins:config.refitJoins,largeRefit:true,conditionChains:true,sewBalance:{large:0,boundary:'adaptive'},maxStretch:config.maxStretch,onProgress:p=>onProgress(config.algorithm==='regions'?.1+p.progress*.18:p.progress*.28)});if(regionGrowth)assembled.stats.regionGrowth=regionGrowth;if(config.refitJoins){const before=assembled;assembled=polishTreeUvCharts(plan.guided,before,{densityRatio:config.densityRatio,maxStretch:config.maxStretch,spendPair:()=>{if(++before.stats.overlapTests>2000000)throw Error('树结构UV缝合交叠检查超过预算。');},onProgress:p=>onProgress(.28+p*.12)});}
 if(config.refitJoins){const before=assembled;assembled=absorbTreeUvPatches(plan.guided,before,{densityRatio:config.densityRatio,maxStretch:config.maxStretch,maxAspect:config.maxAspect,maxExtent,fill:config.profile==='continuous'?.08:config.profile==='uniform'?.18:.12,spendPair:()=>{if(++before.stats.overlapTests>2000000)throw Error('树结构UV缝合交叠检查超过预算。');},onProgress:p=>onProgress(.4+p*.1)});}
 if(config.algorithm==='regions'&&config.refitJoins){const before=assembled;assembled=absorbLocalUvPatches(plan.guided,before,{densityRatio:config.densityRatio,maxStretch:config.maxStretch,maxAspect:config.maxAspect,maxExtent,fill:config.profile==='continuous'?.08:config.profile==='uniform'?.18:.12,spendPair:()=>{if(++before.stats.overlapTests>2000000)throw Error('树结构UV缝合交叠检查超过预算。');},onProgress:p=>onProgress(.5+p*.05)});}
 if(config.algorithm==='regions')assembled.stats.regionIntegrity=surfaceRegionIntegrity(plan.guided,assembled,plan.actualHeightMeters);
 const fallback={mesh:null,faces:new Uint32Array(),vertices:new Uint32Array(),groups:new Uint32Array()},stats={...assembled.stats,protectedFaces:plan.guided.protectedSet.size,structure:{algorithm:plan.structure.summary.banyan.algorithm,shapeScaleCm:config.structureScaleCm,actualHeightMeters:plan.actualHeightMeters,transition:plan.transition,corrections:plan.corrections.length,materialIntegrationRequired:false,reusedAnalysis:!!plan.structure.structureReused,scope:'geometric direction evidence and source neighbors; not semantic branch labels'}};
 const refine=refineFragments&&config.algorithm==='regions'&&
  plan.guided.input.indices.length/3<=50000&&canRefineContinuity(plan);
 const packEnd=refine ? .78 : 1;
 const base=packTreeUnwrap({...plan,...assembled,stats,fallback},null,{quarterTurns:true,refinePacking:true,
  onProgress:p=>onProgress(config.algorithm==='regions'?.55+p*(packEnd-.55):.5+p*.5)});
 if(!refine)return base;
 onProgress(packEnd);
 const {resolution,padding}=plan.guided.options;
 const localFlow=resolution===2048&&padding===3;
 const fragmentEnd=localFlow ? .88 : 1;
 // Small coverage changes can come from a different packing grid. Keep
 // at least the original coverage minus 0.05 percentage points.
 const fragmented=improveSmartTreeContinuity(base,plan,{resolution,padding},p=>onProgress(packEnd+p*(fragmentEnd-packEnd)),.0005);
 if(!localFlow){onProgress(1);return fragmented;}
 onProgress(fragmentEnd);
 const options={resolution,padding,partialPacking:true,deadline:Date.now()+24000};
 const first=improveLongitudinalContinuity(fragmented,plan,options,p=>onProgress(fragmentEnd+p*.06));
 onProgress(.94);
 const change=first.packing.longitudinalSew;
 const second=first!==fragmented&&change.before.islands>=250&&change.before.islands-change.after.islands>=12;
 const result=second?improveLongitudinalContinuity(first,plan,options,p=>onProgress(.94+p*.04)):first;
 onProgress(.98);
 const cleaned=refineSmallFragments(result,plan,{resolution,padding},p=>onProgress(.98+p*.01));
 onProgress(.99);
 const refined=refinePinnedFragments(cleaned,plan,{resolution,padding},p=>onProgress(.99+p*.01));
 onProgress(1);
 return refined;
}
