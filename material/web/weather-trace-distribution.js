import {RULE_TYPES,cloneMask,syncLegacySurface,validateSurface} from './surface-effects.js';
import {layerIsLocked,pruneSurfaceResources} from './surface-layers.js';

const fieldKeys={height:'maxMeters',size:'sizeMeters',width:'widthMeters',length:'lengthMeters',amount:'threshold',softness:'softness',seed:'seed'};
const ruleFor=(profile,key)=>key==='height'?profile.height:profile.pattern;
const isCentimeters=key=>key==='size'||key==='width';

function weatherTraceProfile(surface,effect){
 if(!surface||!effect||effect.coverageMode!=='rules'||effect.paint||effect.manualBrush||!['dirt','stain'].includes(effect.type))return null;
 const mask=surface.masks.find(m=>m.id===effect.maskRef);
 const rules=mask?.items.filter(r=>r.enabled&&r.strength>0&&!['paint','levels'].includes(r.type));
 if(!rules?.length)return null;
 const [first,second]=rules;
 if(effect.type==='dirt'&&rules.length===2&&first.type==='height'&&first.combine==='replace'&&second.type==='noise'&&second.combine==='intersect'){
  return{kind:'mud',mask,height:first,pattern:second};
 }
 if(effect.type==='stain'&&rules.length===1&&first.type==='streaks'&&first.combine==='replace'){
  return{kind:'streak',mask,pattern:first};
 }
 return null;
}

function fieldsFor(profile,treeHeight){
 const {kind,height,pattern}=profile;
 const field=(key,options={})=>{
  const rule=ruleFor(profile,key),parameter=fieldKeys[key],value=rule.params[parameter];
  return {...RULE_TYPES[rule.type].fields[parameter],key,value,...options};
 };
 const centimeters=(key,label,step,range)=>{
  const base=field(key),value=base.value*100;
  return {...base,label,value,min:base.min*100,max:base.max*100,step,unit:'cm',sliderMax:Math.max(range,value)};
 };
 const amount=field('amount',{label:'覆盖量',value:1-pattern.params.threshold});
 const mud=kind==='mud';
 const fields=mud?[
  field('height',{
   label:'影响高度',min:height.params.minMeters,max:Math.max(treeHeight,height.params.maxMeters),step:.01,slider:true,
  }),
  centimeters('size','泥斑尺寸',1,100),amount,
 ]:[
  centimeters('width','横向尺度',.1,30),field('length',{label:'纵向尺度',slider:true}),amount,
 ];
 return{kind,fields,advanced:[
  field('softness',{label:mud?'斑缘过渡':'条痕过渡',step:.001}),field('seed'),
 ]};
}

export function weatherTraceControls(document,effect){
 const profile=weatherTraceProfile(document?.surface,effect);
 return profile?fieldsFor(profile,document.actualHeightMeters):null;
}

export function editWeatherTrace(document,effectId,key,value){
 const next=structuredClone(document),surface=syncLegacySurface(next);
 const effect=surface.effects.find(e=>e.id===effectId);
 if(!effect||layerIsLocked(surface,effectId))throw Error('请选择并解锁沉积或流痕图层。');
 const profile=weatherTraceProfile(surface,effect);
 if(!profile)throw Error('当前图层没有可调的沉积或流痕规则。');
 const {fields,advanced}=fieldsFor(profile,next.actualHeightMeters);
 const field=[...fields,...advanced].find(f=>f.key===key);
 if(!field||!Number.isFinite(value)||value<field.min||value>field.max||key==='seed'&&!Number.isInteger(value))throw Error('当前沉积或流痕参数不可用或超出范围。');

 let rule=ruleFor(profile,key);
 if(surface.effects.some(e=>e.id!==effectId&&e.maskRef===effect.maskRef)){
  const ruleIndex=profile.mask.items.indexOf(rule);
  effect.maskRef=cloneMask(surface,effect.maskRef,{independentOwnedAreasFor:effectId});
  const mask=surface.masks.find(m=>m.id===effect.maskRef);
  mask.name=mask.name.slice(0,100);
  rule=mask.items[ruleIndex];
 }
 rule.params[fieldKeys[key]]=key==='amount'?1-value:isCentimeters(key)?value/100:value;
 delete effect.legacyBinding;
 surface.active=true;
 pruneSurfaceResources(surface);
 next.surface=validateSurface(surface,next);
 return next;
}
