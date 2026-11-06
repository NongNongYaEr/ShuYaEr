import {createRule,syncLegacySurface,validateSurface} from './surface-effects.js';
import {layerIsLocked,pruneSurfaceResources} from './surface-layers.js';

export const GENERATION_MODES={procedural:'全树规则',selection:'指定区域',painted:'涂区生成'};
export const GENERATION_PRESETS={
 scattered:{name:'自然斑块',description:'按物理尺寸散布，保留斑块之间的树皮。',types:['noise']},
 root:{name:'根部生长',description:'在下段高度内生成自然斑块。',types:['height','noise']},
 cavity:{name:'凹处聚集',description:'根据模型 AO 的遮蔽位置聚集，需要先准备 AO。',types:['ao','noise'],dependency:'ao'},
 upper:{name:'朝上附着',description:'优先附着在朝上的表面。',types:['orientation','noise']},
 streaks:{name:'纵向流痕',description:'沿模型竖直方向生成连续条流。',types:['streaks','noise']},
 uniform:{name:'均匀覆盖',description:'填满指定范围，材质自身的微细节仍然保留。',types:['constant']}
};
const uuid=()=>crypto.randomUUID(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function presetFor(type){return ['paint','dirt','wet'].includes(type)?'root':type==='stain'?'streaks':type==='dust'?'upper':type==='aging'?'uniform':'scattered';}
export function generationState(document,effectId){
 const s=syncLegacySurface(document),e=s.effects.find(e=>e.id===effectId);if(!e)throw Error('图层不存在。');
 const m=s.masks.find(m=>m.id===e.maskRef),a=s.areas.find(a=>a.id===e.scopeRef),items=m.items;
 const found=Object.entries(GENERATION_PRESETS).find(([,v])=>items.length===v.types.length&&items.every((r,i)=>r.type===v.types[i]&&r.enabled&&r.strength===1&&r.combine===(i?'intersect':'replace')));
 const noise=items.find(r=>r.type==='noise'),height=items.find(r=>r.type==='height'),scope=a?.scope;
 return{mode:a?(a.kind==='surface'&&a.mode==='painted'?'painted':'selection'):'procedural',preset:found?.[0]||presetFor(e.type),custom:!found||e.coverageMode==='legacy',
  density:noise?1-noise.params.threshold:.55,sizeMeters:noise?.params.sizeMeters||.25,softness:noise?.params.softness||.12,seed:noise?.params.seed??e.seed,
  rootHeightMeters:height?.params.maxMeters||document.actualHeightMeters*(e.type==='paint'?.135:.25),
  rangeRef:a?.kind==='height'?'height':a?.kind==='part'?'part:'+a.partId:a?'area:'+a.id:'height',
  minMeters:(scope?.min||0)*document.actualHeightMeters,maxMeters:(scope?.max??.25)*document.actualHeightMeters,featherMeters:(scope?.feather??.025)*document.actualHeightMeters,
  paintAreaId:a?.kind==='surface'&&a.mode==='painted'?a.id:null};
}
function checkedNumber(v,min,max,label,integer=false){if(!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))throw Error(label+'超出范围。');return v;}
const otherAreaUsers=(s,id,owner)=>s.effects.some(e=>e.id!==owner&&(e.scopeRef===id||s.masks.find(m=>m.id===e.maskRef)?.items.some(r=>[r.areaRef,r.addRef,r.eraseRef].includes(id))));
export function prepareGenerationPaint(document,effectId){
 const s=syncLegacySurface(document),e=s.effects.find(e=>e.id===effectId);if(!e||layerIsLocked(s,e.id))throw Error('请先解锁图层或父级组。');const a=s.areas.find(a=>a.id===e.scopeRef&&a.kind==='surface'&&a.mode==='painted');if(!a)throw Error('请先创建手绘生成范围。');
 if(!otherAreaUsers(s,a.id,e.id)&&(!a.ownedBy||a.ownedBy===e.id))return document;
 const copy={...structuredClone(a),id:uuid(),name:e.name+' · 生成范围'};delete copy.ownedBy;delete copy.legacyPrecision;s.areas.push(copy);e.scopeRef=copy.id;delete e.legacyBinding;s.active=true;const d=structuredClone(document);d.surface=validateSurface(s,d);return d;
}
export function applyGeneration(document,effectId,config){
 const d=structuredClone(document),s=syncLegacySurface(d),e=s.effects.find(e=>e.id===effectId);if(!e)throw Error('图层不存在。');if(layerIsLocked(s,e.id))throw Error('请先解锁图层或父级组。');
 const p=GENERATION_PRESETS[config.preset];if(!p||!GENERATION_MODES[config.mode])throw Error('生成方式或预设无效。');
 const size=checkedNumber(config.sizeMeters,.01,10,'斑块尺寸'),density=checkedNumber(config.density,0,1,'覆盖密度'),softness=checkedNumber(config.softness,.001,.5,'边缘过渡'),seed=checkedNumber(config.seed,0,10000,'随机种子',true);
 let m=s.masks.find(m=>m.id===e.maskRef);if(s.effects.some(other=>other.id!==e.id&&other.maskRef===m.id)){m={id:uuid(),name:e.name+' · 生成分布',initial:1,items:[]};s.masks.push(m);e.maskRef=m.id;}
 delete e.legacyBinding;e.coverageMode='rules';s.active=true;const previousScope=e.scopeRef;e.scopeRef=null;
 if(config.mode==='selection'){
  let a;const ref=config.rangeRef;
  if(ref==='height'){
   const h=d.actualHeightMeters,min=checkedNumber(config.minMeters,0,h,'选区下边界'),max=checkedNumber(config.maxMeters,0,h,'选区上边界'),feather=checkedNumber(config.featherMeters,0,h*.25,'选区柔边');if(max<=min)throw Error('选区上边界需要高于下边界。');
   a={id:uuid(),name:e.name+' · 高度选区',kind:'height',sourceSHA256:d.resources.source,strokes:[],scope:{kind:'height',min:min/h,max:max/h,feather:feather/h},partId:null,ownedBy:e.id};s.areas.push(a);
  }else if(typeof ref==='string'&&ref.startsWith('part:')){
   const part=d.parts.groups.find(p=>p.id===ref.slice(5));if(!part?.faces.length)throw Error('请选择有源面的模型部位。');a={id:uuid(),name:part.name,kind:'part',sourceSHA256:d.resources.source,strokes:[],scope:null,partId:part.id,ownedBy:e.id};s.areas.push(a);
  }else if(typeof ref==='string'&&ref.startsWith('area:')){
   a=s.areas.find(a=>a.id===ref.slice(5));if(!a||a.ownedBy&&a.ownedBy!==e.id)throw Error('生成选区已不存在或属于其它图层。');
  }else throw Error('请先指定生成选区。');
  e.scopeRef=a.id;
 }
 if(config.mode==='painted'){
  let a=s.areas.find(a=>a.id===(config.paintAreaId||previousScope)&&a.kind==='surface'&&a.mode==='painted');
  if(!a||otherAreaUsers(s,a.id,e.id)||a.ownedBy&&a.ownedBy!==e.id){a=a?{...structuredClone(a),id:uuid(),name:e.name+' · 生成范围'}:{id:uuid(),name:e.name+' · 生成范围',kind:'surface',sourceSHA256:d.resources.source,mode:'painted',strokes:[],scope:null,partId:null};delete a.ownedBy;delete a.legacyPrecision;s.areas.push(a);}
  e.scopeRef=a.id;
 }
 const noise=()=>createRule('noise',{combine:'intersect',params:{sizeMeters:size,threshold:1-density,softness,seed}}),items=[];
 if(config.preset==='scattered')items.push({...noise(),combine:'replace'});
 if(config.preset==='root'){const max=checkedNumber(config.rootHeightMeters,.01,d.actualHeightMeters,'生长高度');items.push(createRule('height',{combine:'replace',params:{minMeters:0,maxMeters:max,featherMeters:clamp(max*.06,.01,.2)}}),noise());}
 if(config.preset==='cavity')items.push(createRule('ao',{combine:'replace',params:{threshold:.25,softness:.15}}),noise());
 if(config.preset==='upper')items.push(createRule('orientation',{combine:'replace'}),noise());
 if(config.preset==='streaks')items.push(createRule('streaks',{combine:'replace',params:{widthMeters:clamp(size*.15,.005,2),lengthMeters:clamp(size*5,.05,20),threshold:.42,softness,seed}}),noise());
 if(config.preset==='uniform')items.push(createRule('constant',{combine:'replace'}));
 m.name=e.name+' · 生成分布';m.initial=1;m.items=items;pruneSurfaceResources(s);d.surface=validateSurface(s,d);return d;
}
