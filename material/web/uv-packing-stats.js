export function describePacking(packing){
 if(!packing)return '';
 const footprint=packing.reservedFootprint,search=packing.compactionSearch;let text='';
 if(Number.isInteger(packing.padding))text+='\n排布间距≥'+(packing.padding*2+1)+' px · 每侧扩色 '+packing.padding+' px';
 if(packing.islandPreservation)text+='\n保留原UV岛：'+packing.islandPreservation.before+' → '+packing.islandPreservation.after+'（逐面分组核验）';
 if(Number.isFinite(footprint))text+='\n含间距占用≈'+(footprint*100).toFixed(1)+'%（含轮廓栅格余量，非表面覆盖率）';
 if(search?.selected)text+='\n紧凑排布：未锁定岛密度 +'+((search.selectedScale/search.baselineScale-1)*100).toFixed(1)+'% · 保持岛形与安全间距';
 else if(search)text+='\n紧凑排布：保留较优结果 · 保持岛形与安全间距';
 return text;
}
