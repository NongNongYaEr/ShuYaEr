export const COATING_ALGORITHM_VERSION=18;
export const LAYER_IDS=['moss','paint','lichen','dirt','wet','aging'];
export const LAYER_NAMES={moss:'苔藓',paint:'白漆',lichen:'地衣',dirt:'根部泥污',wet:'湿痕',aging:'色差'};
export const LAYER_CHANNELS={aging:['color'],wet:['color','roughness'],moss:['color','roughness','height','ao'],paint:['color','roughness','height','ao'],lichen:['color','roughness','height'],dirt:['color','roughness','height']};
export function defaultLayers({legacy=false}={}){return(legacy?['aging','moss','lichen','dirt','wet','paint']:['aging','paint','moss','lichen','dirt','wet']).map(id=>({id,enabled:true,locked:false,opacity:1,seed:0,channels:{color:true,roughness:LAYER_CHANNELS[id].includes('roughness'),height:LAYER_CHANNELS[id].includes('height'),ao:LAYER_CHANNELS[id].includes('ao')}}));}
export function validateLayers(raw){
  if(!Array.isArray(raw)||raw.length!==LAYER_IDS.length||new Set(raw.map(l=>l?.id)).size!==LAYER_IDS.length)throw Error('材质图层数量或顺序无效。');
  for(const l of raw)if(!LAYER_IDS.includes(l.id)||typeof l.enabled!=='boolean'||typeof l.locked!=='boolean'||!Number.isFinite(l.opacity)||l.opacity<0||l.opacity>1||!Number.isInteger(l.seed)||l.seed<0||l.seed>10000||!l.channels||l.channels.ao!==undefined&&typeof l.channels.ao!=='boolean'||['color','roughness','height'].some(c=>typeof l.channels[c]!=='boolean'))throw Error('材质图层参数无效。');
  return structuredClone(raw);
}
const keys={aging:['variation'],moss:['mossEnabled','moss','mossColor','mossRough','mossNormalStrength','mossFiberMm','mossPorosity','mossThicknessMm','mossClumpCm','mossAO'],paint:['paintEnabled','paintHeight','paintWear','paintColor','paintRough','paintNormalStrength','paintBarkNormal','paintAO','paintCoverage','paintDepthAmount','paintDepthContrast','paintPeel','paintPeelSizeCm','paintPeelEdge','paintPeelDetail','paintPeelChips'],lichen:['lichenEnabled','lichen'],dirt:['dirtEnabled','dirt'],wet:['wetEnabled','wet']};
export function applyLayerLocks(previous,next,layers){const result={...next};for(const layer of layers||[])if(layer.locked)for(const key of keys[layer.id])result[key]=previous[key];return result;}
export function mergeRecipeLayers(current,incoming){const next=validateLayers(incoming),locked=new Set(current.filter(l=>l.locked).map(l=>l.id)),free=next.filter(l=>!locked.has(l.id));return current.map(l=>l.locked?structuredClone(l):free.shift());}
