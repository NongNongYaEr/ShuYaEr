export function describePacking(packing){
 if(!packing)return '';
 const footprint=packing.reservedFootprint,search=packing.compactionSearch;let text='';
 if(Number.isInteger(packing.padding))text+='\n排布间距≥'+(packing.padding*2+1)+' px · 每侧扩色 '+packing.padding+' px';
 if(packing.islandPreservation)text+='\n保留原UV岛：'+packing.islandPreservation.before+' → '+packing.islandPreservation.after+'（逐面分组核验）';
 if(Number.isFinite(footprint))text+='\n含间距占用≈'+(footprint*100).toFixed(1)+'%（含轮廓栅格余量，非表面覆盖率）';
 if(packing.smartUnwrap){
  const smart=packing.smartUnwrap,labels={structure:'稳健树结构',regions:'表面大片',compact:'紧凑分片'};
  text+='\n智能展开 · '+labels[smart.selected]+' · '+smart.candidates.map(c=>labels[c.algorithm]+' '+(c.coverage*100).toFixed(1)+'% / '+c.islands+' 岛').join('、');
 }
 if(packing.fragmentSewing){
  const {before,after}=packing.fragmentSewing;
  text+='\n碎岛归并 · '+before.islands+' → '+after.islands+' 岛 · 4 面以内 '+before.tiny+' → '+after.tiny+' 个';
 }
 if(packing.longitudinalSew){
  const {before,after,closedCuts,closedEdges,localPasses}=packing.longitudinalSew;
  text+='\n顺纹接缝 · '+before.islands+' → '+after.islands+' 岛';
  text+=localPasses?' · 接回 '+closedEdges+' 条接缝边':' · 接回岛内断缝 '+closedCuts+' 处';
 }
 if(packing.smallFragmentRefinement){
  const {before,after,closedEdges}=packing.smallFragmentRefinement;
  text+='\n碎岛精修 · '+before.islands+' → '+after.islands+' 岛 · 4 面以内 '+before.tiny+' → '+after.tiny+' 个 · 接回 '+closedEdges+' 条接缝边';
 }
 if(packing.pinnedFragmentRefinement){
  const {before,after,closedEdges}=packing.pinnedFragmentRefinement;
  text+='\n补片局部展平 · '+before.islands+' → '+after.islands+' 岛 · 4 面以内 '+before.tiny+' → '+after.tiny+' 个 · 接回 '+closedEdges+' 条接缝边';
 }
 if(packing.outlineNesting){
  const {before,after,islands}=packing.outlineNesting;
  text+='\n轮廓嵌套 · '+(before*100).toFixed(2)+'% → '+(after*100).toFixed(2)+'% · 保留 '+islands+' 岛';
 }
 if(packing.boundaryGrowth){
  const {before,after,islands,beforeP95,afterP95}=packing.boundaryGrowth;
  text+='\n保缝提覆盖 · '+(before*100).toFixed(2)+'% → '+(after*100).toFixed(2)+'% · 保留 '+islands+' 岛';
  text+='\n岛内展平拉伸 P95 · '+beforeP95.toFixed(2)+' → '+afterP95.toFixed(2);
 }
 if(packing.contourFill){
  const {before,after,islands,maxRelativeDensity}=packing.contourFill;
  text+='\n保形填空 · '+(before*100).toFixed(2)+'% → '+(after*100).toFixed(2)+'% · 保留 '+islands+' 岛';
  text+='\n保留岛形 · 单岛像素密度最多 +'+((maxRelativeDensity-1)*100).toFixed(0)+'%';
 }
 if(packing.densityBudget){
  const {beforeP99,afterP99,limit}=packing.densityBudget;
  text+='\n相对首次优化前的像素密度 P99 · '+beforeP99.toFixed(2)+'× → '+afterP99.toFixed(2)+'× · 目标上限 '+limit.toFixed(2)+'×';
 }
 if(search?.selected)text+='\n紧凑排布：未锁定岛密度 +'+((search.selectedScale/search.baselineScale-1)*100).toFixed(1)+'% · 保持岛形与安全间距';
 else if(search)text+='\n紧凑排布：保留较优结果 · 保持岛形与安全间距';
 return text;
}
