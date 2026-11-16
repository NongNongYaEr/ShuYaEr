import {cloneMask,syncLegacySurface,validateSurface} from './surface-effects.js';
import {layerIsLocked,pruneSurfaceResources} from './surface-layers.js';
import {STABLE_FIELDS,STABLE_RULE} from './stable-distribution.js';

const shapeRoles={stain:0,dust:1,wet:4};
const shapeKeys={amount:'density',recognition:'recognitionCm',size:'patchCm',height:'rootHeightMeters',softness:'edge',seed:'seed'};

function shapeProfile(surface,effect){
 if(!surface||!effect||effect.coverageMode!=='rules'||effect.paint||effect.manualBrush)return null;
 const role=shapeRoles[effect.type];
 if(role===undefined)return null;
 const mask=surface.masks.find(m=>m.id===effect.maskRef);
 const rules=mask?.items.filter(r=>r.enabled&&r.strength>0&&!['paint','levels'].includes(r.type));
 if(rules?.length!==1)return null;
 const [rule]=rules;
 return rule.type===STABLE_RULE&&rule.combine==='replace'&&rule.params.role===role?{mask,rule}:null;
}

function fieldsFor(rule,treeHeight){
 const {params:p,openRootFallback}=rule;
 const seam=p.role===shapeRoles.wet,empty=p.density===0;
 // The wet seam fallback still thresholds its pattern below full density.
 const patternDisabled=empty||p.density===1&&!(seam&&openRootFallback===true);
 const field=(key,options={})=>{
  const param=shapeKeys[key];
  return {...STABLE_FIELDS[param],key,value:p[param],...options};
 };
 const fields=[field('amount',{label:'覆盖量'})];
 if(seam){
  const max=Math.min(STABLE_FIELDS.rootHeightMeters.max,Math.max(treeHeight,p.rootHeightMeters));
  fields.push(field('height',{label:'湿润高度',max,slider:true,disabled:empty}));
 }
 fields.push(field('recognition',{label:'识别尺度',slider:true,disabled:empty}));
 fields.push(field('size',{label:seam?'湿痕尺度':'斑块尺寸',slider:true,disabled:patternDisabled}));
 return{fields,advanced:[
  field('softness',{label:'斑缘过渡',disabled:patternDisabled}),
  field('seed',{disabled:patternDisabled}),
 ]};
}

export function shapeControls(document,effect){
 const profile=shapeProfile(document?.surface,effect);
 return profile?fieldsFor(profile.rule,document.actualHeightMeters):null;
}

export function editShape(document,effectId,key,value){
 const next=structuredClone(document),surface=syncLegacySurface(next);
 const effect=surface.effects.find(e=>e.id===effectId);
 if(!effect||layerIsLocked(surface,effectId))throw Error('请选择并解锁形体分布图层。');
 const profile=shapeProfile(surface,effect);
 if(!profile)throw Error('当前图层没有可调的形体分布规则。');
 const {fields,advanced}=fieldsFor(profile.rule,next.actualHeightMeters);
 const field=[...fields,...advanced].find(f=>f.key===key);
 if(!field||field.disabled||!Number.isFinite(value)||value<field.min||value>field.max)throw Error('当前形体分布参数不可用或超出范围。');

 let {rule}=profile;
 if(surface.effects.some(e=>e.id!==effectId&&e.maskRef===effect.maskRef)){
  const ruleIndex=profile.mask.items.indexOf(rule);
  effect.maskRef=cloneMask(surface,effect.maskRef,{independentOwnedAreasFor:effectId});
  const mask=surface.masks.find(m=>m.id===effect.maskRef);
  mask.name=mask.name.slice(0,100);
  rule=mask.items[ruleIndex];
 }
 rule.params[shapeKeys[key]]=value;
 delete effect.legacyBinding;
 surface.active=true;
 pruneSurfaceResources(surface);
 next.surface=validateSurface(surface,next);
 return next;
}
