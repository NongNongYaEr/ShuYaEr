// Root presets contain reusable shape only. Identity, mount direction and all
// carrier/section/surface/assembly data stay with the destination project.
export const TRUNK_ROOT_SHAPE_FIELDS=Object.freeze({length:[0,6],height:[.025,1],width:[4,90],strength:[0,2]});
export function normalizeTrunkRootPresetShape(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1)throw Error('板根形状预设版本不受支持');
  const shape={version:1};
  for(const [key,[min,max]]of Object.entries(TRUNK_ROOT_SHAPE_FIELDS)){
    const value=raw[key];if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('板根形状参数无效：'+key);
    shape[key]=value;
  }
  return shape;
}
export function captureTrunkRootPreset(root){return normalizeTrunkRootPresetShape({version:1,...root});}
export function applyTrunkRootPreset(roots,ids,raw){
  const {version,...shape}=normalizeTrunkRootPresetShape(raw),chosen=new Set(ids);
  return roots.map(root=>chosen.has(root.id)?{...root,...shape}:root);
}
export const TRUNK_ROOT_PRESETS=Object.freeze([
  ['compact','收敛板根',1.2,.22,18],['wide','宽展开',2.8,.32,36],['long','细长伸出',3.8,.28,12],
  ['tall','长沿干过渡',2.1,.58,22],['low','低位展开',2.8,.15,32],['subtle','轻微起伏',.65,.24,24],
].map(([id,name,length,height,width])=>Object.freeze({id:'builtin-root-'+id,name,shape:Object.freeze({version:1,length,height,width,strength:1}),builtin:true})));

export function rootPresetSummary(shape){return '伸出 ×'+Number(shape.length.toFixed(2))+' · 展开 '+Number(shape.width.toFixed(1))+'° · 沿干 '+Number((shape.height*100).toFixed(1))+'%';}
