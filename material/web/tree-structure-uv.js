import {growSurfaceUvRegions,surfaceRegionIntegrity} from './tree-uv-regions.js';
import {absorbLocalUvPatches} from './tree-uv-local-patches.js';
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
export function prepareTreeStructure(mesh,flow,{actualHeightMeters=10,corrections=[],transition=1,scaleCm=35,onProgress=()=>{},structureCache=null}={}){
 const record=validateBarkFlow(flow,mesh.sourceSHA256);if(!record)throw Error('树结构UV需要匹配源模型的结构分析。');
 const analysis={...record,version:5,surface:record.surface||{...SURFACE_FLOW_DEFAULTS},continuity:record.continuity||{...CONTINUITY_FLOW_DEFAULTS},banyan:{...(record.banyan||BANYAN_FLOW_DEFAULTS),shapeScaleCm:scaleCm}};
 const cached=reuseBarkStructure(mesh,analysis,{actualHeightMeters,corrections,transition},structureCache);if(cached){onProgress({phase:'复用已验证的榕根表面方向',progress:1});return cached;}
 const field=buildBarkStructure(mesh,analysis,{actualHeightMeters,corrections,transition,progress:p=>onProgress({phase:'分析枝干与榕根表面方向',progress:p})});
 field.uvDirections=field.banyanDirections.slice();if(corrections.length)for(let f=0;f<mesh.indices.length/3;f++){const n=[0,0,0];for(let c=0;c<3;c++)for(let k=0;k<3;k++)n[k]+=field.growth[mesh.indices[f*3+c]*3+k];const length=Math.hypot(...n);if(length>1e-12)for(let k=0;k<3;k++)field.uvDirections[f*3+k]=n[k]/length;}
 return field;
}
export function planStructureUnwrap(input,{flow,treeOptions,actualHeightMeters=10,corrections=[],transition=1,structureCache=null,...options},{source=input,onProgress=()=>{}}={}){
 const config=validateTreeUvOptions(treeOptions),record=validateBarkFlow(flow,input.sourceSHA256);if(!record)throw Error('树结构UV缺少对应的枝干分析。');const guided=planGuidedUnwrap(input,options),structure=guided.mesh?prepareTreeStructure(source,record,{actualHeightMeters,corrections,transition,scaleCm:config.structureScaleCm,onProgress,structureCache}):null;
 const canonical=canonicalTreeUvInput(guided,source);
 return{guided,config,record,structure,canonicalIndices:canonical?.expectedIndices,actualHeightMeters,corrections,transition,algorithm:config.algorithm==='regions'?'structure-guided-local-patches-v10':'structure-guided-precision-pack-v8',input:canonical?.input||null};
}
export function packStructureUnwrap(plan,nativeResult,{onProgress=()=>{}}={}){
 if(!plan.guided.mesh){const result=packGuidedUnwrap(plan.guided,null,{onProgress});result.packing={...result.packing,method:'tree-strips',treeStrips:{algorithm:plan.algorithm,options:plan.config,sourceSHA256:plan.record.sourceSHA256,...plan.metadata,protectedFaces:plan.guided.protectedSet.size,stripFaces:0,stripCharts:0}};return result;}
 const config=plan.config;let seed=restoreTreeUvCorners(plan.guided,nativeResult,plan.canonicalIndices),regionGrowth=null,regionPairs=0;if(config.algorithm==='regions'){const result=growSurfaceUvRegions(plan.guided,plan.structure,{maxStretch:config.maxStretch,densityRatio:config.densityRatio,maxExtent:config.structureScaleCm/100/plan.actualHeightMeters*config.maxAspect*4,spendPair:()=>{if(++regionPairs>2000000)throw Error('树结构UV缝合交叠检查超过预算。');},onProgress:p=>onProgress(p*.1)});regionGrowth={...result.stats,selected:result.ok,fallbackReason:result.reason||null};if(result.ok)seed=result.native;}let assembled=assembleStructureCharts(plan.guided,seed,plan.structure,{overlapTestOffset:regionPairs,maxAspect:config.maxAspect,densityRatio:config.densityRatio,maxExtent:config.structureScaleCm/100/plan.actualHeightMeters*config.maxAspect*4,frameSampler:createBranchSampler(plan.record),seamAngle:config.seamAngle,fill:config.profile==='continuous'?.08:config.profile==='uniform'?.18:.12,anchorTrials:6,refitJoins:config.refitJoins,largeRefit:true,conditionChains:true,sewBalance:{large:0,boundary:'adaptive'},maxStretch:config.maxStretch,onProgress:p=>onProgress(config.algorithm==='regions'?.1+p.progress*.18:p.progress*.28)});if(regionGrowth)assembled.stats.regionGrowth=regionGrowth;if(config.refitJoins){const before=assembled;assembled=polishTreeUvCharts(plan.guided,before,{densityRatio:config.densityRatio,maxStretch:config.maxStretch,spendPair:()=>{if(++before.stats.overlapTests>2000000)throw Error('树结构UV缝合交叠检查超过预算。');},onProgress:p=>onProgress(.28+p*.12)});}
 if(config.refitJoins){const before=assembled;assembled=absorbTreeUvPatches(plan.guided,before,{densityRatio:config.densityRatio,maxStretch:config.maxStretch,maxAspect:config.maxAspect,maxExtent:config.structureScaleCm/100/plan.actualHeightMeters*config.maxAspect*4,fill:config.profile==='continuous'?.08:config.profile==='uniform'?.18:.12,spendPair:()=>{if(++before.stats.overlapTests>2000000)throw Error('树结构UV缝合交叠检查超过预算。');},onProgress:p=>onProgress(.4+p*.1)});}
 if(config.algorithm==='regions'&&config.refitJoins){const before=assembled;assembled=absorbLocalUvPatches(plan.guided,before,{densityRatio:config.densityRatio,maxStretch:config.maxStretch,maxAspect:config.maxAspect,maxExtent:config.structureScaleCm/100/plan.actualHeightMeters*config.maxAspect*4,fill:config.profile==='continuous'?.08:config.profile==='uniform'?.18:.12,spendPair:()=>{if(++before.stats.overlapTests>2000000)throw Error('树结构UV缝合交叠检查超过预算。');},onProgress:p=>onProgress(.5+p*.05)});}
 if(config.algorithm==='regions')assembled.stats.regionIntegrity=surfaceRegionIntegrity(plan.guided,assembled,plan.actualHeightMeters);
 const fallback={mesh:null,faces:new Uint32Array(),vertices:new Uint32Array(),groups:new Uint32Array()},stats={...assembled.stats,protectedFaces:plan.guided.protectedSet.size,structure:{algorithm:plan.structure.summary.banyan.algorithm,shapeScaleCm:config.structureScaleCm,actualHeightMeters:plan.actualHeightMeters,transition:plan.transition,corrections:plan.corrections.length,materialIntegrationRequired:false,reusedAnalysis:!!plan.structure.structureReused,scope:'geometric direction evidence and source neighbors; not semantic branch labels'}};
 return packTreeUnwrap({...plan,...assembled,stats,fallback},null,{quarterTurns:true,refinePacking:true,onProgress:p=>onProgress(config.algorithm==='regions'?.55+p*.45:.5+p*.5)});
}
