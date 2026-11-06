import {FORM_EFFECT_TYPES} from './form-effects.js';
import {BURL_EFFECT_TYPE} from './burl-effect.js';
const n=(label,min,max,step,value,unit='')=>({kind:'number',label,min,max,step,value,unit,group:'material'}),color=(label,value)=>({kind:'color',label,value,group:'material'});
function material(name,kind,defaults){return{name,layerKind:kind,channels:['color','roughness','height','ao'],fields:{surfaceColor:color('颜色',defaults.color),surfaceRoughness:n('粗糙度',.05,1,.01,defaults.rough),surfaceNormalStrength:n('自身法线',0,4,.05,1),surfaceHeightMm:n('自身起伏',0,10,.01,defaults.height,'mm'),surfaceGrainCm:n('表面颗粒尺寸',.05,20,.05,defaults.grain,'cm'),surfaceVariation:n('颗粒变化',0,1,.01,.4),surfaceAO:n('自身微AO',0,1,.05,.35),surfaceBarkKeep:n('保留下方凹凸',0,1,.05,defaults.keep),surfaceAmount:n('材质覆盖强度',0,1,.01,defaults.amount)}};}
export const EXTRA_EFFECT_TYPES={
 algae:material('薄藻膜','material',{color:'#415b36',rough:.76,height:.06,grain:.6,keep:.9,amount:.65}),
 dust:material('积尘粉化','material',{color:'#b6a58a',rough:.96,height:.22,grain:.4,keep:.85,amount:.8}),
 stain:{name:'水流污痕',layerKind:'adjustment',channels:['color','roughness'],fields:{surfaceColor:color('污痕色调','#68533c'),surfaceRoughness:n('粗糙度',.05,1,.01,.72),surfaceGrainCm:n('表面变化尺寸',.05,20,.05,2,'cm'),surfaceVariation:n('深浅变化',0,1,.01,.5),surfaceAmount:n('污痕浓度',0,1,.01,.55)}},
 bleach:{name:'日晒褪色',layerKind:'adjustment',channels:['color','roughness'],fields:{surfaceColor:color('漂浅色调','#c8bca1'),surfaceRoughness:n('干燥粗糙度',.05,1,.01,.92),surfaceAmount:n('褪色程度',0,1,.01,.45),surfaceSaturation:n('去色程度',0,1,.01,.4)}},
 cork:material('疤皮修补','detail',{color:'#74503a',rough:.91,height:2.5,grain:2.4,keep:.25,amount:1}),
 ...FORM_EFFECT_TYPES,burl:BURL_EFFECT_TYPE
};
