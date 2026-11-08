import {collectUvCharts} from './uv-charts.js';
import {packOutlineCharts} from './uv-outline-packing.js';
import {improveUvNesting} from './uv-overlap-relax.js';
import {growUvBoundary} from './uv-boundary-growth.js';
import {analyzeUV} from './uv-analysis.js';
import {fillUvContourGaps} from './uv-contour-fill.js';
import {createUvDensityBudget} from './uv-density-budget.js';
export {collectUvCharts};
export function packUvCharts(mesh,options={}){
 const {pins=[],weights={},refinePacking,shapeCoverage,contourFill,onProgress=()=>{}}=options;
 const constrained=pins.length||Object.values(weights).some(weight=>weight!==1);
 if(contourFill){
  if(options.resolution!==2048||options.padding!==3)throw Error('保形填空目前支持 2K、每侧扩色 3 px。');
  if(constrained)throw Error('保形填空需要无锁定岛和密度权重。');
  const densityBudget=createUvDensityBudget(mesh,options.densityReference);
  const result=fillUvContourGaps(mesh,{...options,densityBudget});
  if(!result)throw Error('本轮没有找到满足间距和密度要求的保形填空候选。');
  return result;
 }
 if(shapeCoverage){
  if(constrained)throw Error('保缝提覆盖需要无锁定岛和密度权重。');
  const coverage=analyzeUV(mesh,{sampleSize:64}).summedUvTriangleArea;
  const densityBudget=createUvDensityBudget(mesh,options.densityReference);
  const anchorP95=analyzeUV(options.densityReference||mesh,{sampleSize:64}).anisotropy.p95;
  const p95Ceiling=Math.min(1.6,anchorP95*1.27);
  const continuation=coverage>=.68;
  const nearDensityLimit=options.resolution===2048&&options.padding===3&&densityBudget.beforeP99>=1.35;
  const profile=nearDensityLimit
   ?{targetCoverage:.704,projectedMotion:true,projectionPasses:12,boundaryStep:1.9,maxIterations:24,maxDurationMs:32000}
   :continuation
   ?{targetCoverage:.704,projectedMotion:true,maxIterations:55,maxDurationMs:32000}
   :{targetCoverage:.6805};
  const result=growUvBoundary(mesh,{...options,...profile,densityBudget,p95Ceiling});
  if(!result)throw Error('本轮没有找到满足间距、形变和累计密度要求的覆盖率提升。');
  return result;
 }
 if(!refinePacking||constrained)return packOutlineCharts(mesh,options);
 try{
  const result=improveUvNesting(mesh,{...options,onProgress:p=>onProgress(p*.45)});
  if(result){onProgress(1);return result;}
 }catch{
  // Keep the existing repacker available if the optional search cannot fit.
 }
 return packOutlineCharts(mesh,{...options,onProgress:p=>onProgress(.45+p*.55)});
}
