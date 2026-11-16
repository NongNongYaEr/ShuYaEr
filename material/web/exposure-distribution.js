import {DISTRIBUTION_FIELDS,DISTRIBUTION_KEYS} from './distribution-modes.js';
import {RULE_TYPES,cloneMask,syncLegacySurface,validateSurface} from './surface-effects.js';
import {layerIsLocked,pruneSurfaceResources} from './surface-layers.js';

const directions=[['up','向上 +Y'],['down','向下 −Y'],['positiveX','X 正向'],['negativeX','X 负向'],['positiveZ','Z 正向'],['negativeZ','Z 负向']];
const directionOptions=directions.map(([,label],value)=>[value,label]);
const managedKeys={direction:'direction',angle:'angle',amount:'density',width:'boundaryCm',size:'patchCm',softness:'edge',breakup:'breakup',seed:'seed'};

function exposureProfile(surface,effect){
 if(!surface||!effect||effect.coverageMode!=='rules'||effect.paint||effect.manualBrush)return null;
 const mask=surface.masks.find(m=>m.id===effect.maskRef);
 const rules=mask?.items.filter(r=>r.enabled&&(r.strength>0||r.type==='orientation')&&!['paint','levels'].includes(r.type));
 if(!rules?.length)return null;
 const [rule,pattern]=rules;
 if(rules.length===1&&rule.type==='distribution'&&rule.combine==='replace'){
  const kind=DISTRIBUTION_KEYS[rule.params.mode];
  if(kind==='orientation'||kind==='boundary')return{kind,mask,rule,managed:true};
 }
 if(rule.type!=='orientation'||rule.combine!=='replace')return null;
 if(rule.strength>0&&rules.length===2&&pattern.type==='noise'&&pattern.combine==='intersect')return{kind:'orientation',mask,rule,pattern};
 if(rules.length===1){
  // A zero base lets rule strength scale the existing orientation coverage.
  const strengthAmount=mask.initial===0&&!mask.items.slice(0,mask.items.indexOf(rule)).some(r=>r.enabled&&r.strength>0);
  if(rule.strength>0||strengthAmount)return{kind:'orientation',mask,rule,strengthAmount};
 }
 return null;
}

function managedFields({kind,rule}){
 const p=rule.params,empty=p.density===0,patternDisabled=empty||p.density===1;
 const field=(key,options={})=>{
  const parameter=managedKeys[key];
  return {...DISTRIBUTION_FIELDS[parameter],key,value:p[parameter],...options};
 };
 const amount=field('amount',{label:'覆盖量'});
 const pattern=[
  field('size',{slider:true,disabled:patternDisabled}),field('softness',{label:'斑缘过渡',disabled:patternDisabled}),
  field('breakup',{disabled:patternDisabled}),field('seed',{disabled:patternDisabled}),
 ];
 if(kind==='boundary')return{kind,fields:[field('width',{label:'影响宽度',step:.1,slider:true,disabled:empty})],advanced:[amount,...pattern]};
 return{kind,fields:[
  field('direction',{label:'朝向',options:directionOptions,disabled:empty}),
  field('angle',{slider:true,disabled:empty}),amount,
 ],advanced:pattern};
}

function fieldsFor(profile){
 if(profile.managed)return managedFields(profile);
 const {kind,rule,pattern,strengthAmount}=profile,orientationInactive=rule.strength===0;
 const fields=[
  {key:'direction',label:'朝向',value:directions.findIndex(([polarity])=>polarity===rule.polarity),options:directionOptions,min:0,max:5,disabled:orientationInactive},
  {key:'angle',label:'附着角度',value:Math.acos(rule.params.threshold)*180/Math.PI,min:0,max:180,step:1,unit:'°',slider:true,disabled:orientationInactive},
 ];
 const advanced=[{...RULE_TYPES.orientation.fields.softness,key:'directionSoftness',label:'朝向过渡',value:rule.params.softness,disabled:orientationInactive}];
 if(pattern){
  const {threshold,sizeMeters,softness,seed}=RULE_TYPES.noise.fields,size=pattern.params.sizeMeters*100;
  fields.push({...threshold,key:'amount',label:'覆盖量',value:1-pattern.params.threshold});
  advanced.push(
   {...sizeMeters,key:'size',value:size,min:sizeMeters.min*100,max:sizeMeters.max*100,step:1,unit:'cm',sliderMax:Math.max(100,size)},
   {...softness,key:'softness',label:'斑缘过渡',value:pattern.params.softness,step:.001},
   {...seed,key:'seed',value:pattern.params.seed},
  );
 }else if(strengthAmount){
  fields.push({key:'amount',label:'覆盖量',value:rule.strength,min:0,max:1,step:.01});
 }
 return{kind,fields,advanced};
}

export function exposureControls(document,effect){
 const profile=exposureProfile(document?.surface,effect);
 return profile?fieldsFor(profile):null;
}

function editProfile(profile,effect,key,value){
 const {rule,pattern,kind}=profile;
 if(profile.managed){
  rule.params[managedKeys[key]]=value;
  if(effect.distribution)effect.distribution.memory[kind]={...rule.params};
  return;
 }
 if(key==='direction')rule.polarity=directions[value][0];
 if(key==='angle')rule.params.threshold=Math.cos(value*Math.PI/180);
 if(key==='directionSoftness')rule.params.softness=value;
 if(key==='amount'){
  if(pattern)pattern.params.threshold=1-value;
  else rule.strength=value;
 }
 if(key==='size')pattern.params.sizeMeters=value/100;
 if(key==='softness'||key==='seed')pattern.params[key]=value;
}

export function editExposure(document,effectId,key,value){
 const next=structuredClone(document),surface=syncLegacySurface(next);
 const effect=surface.effects.find(e=>e.id===effectId);
 if(!effect||layerIsLocked(surface,effectId))throw Error('请选择并解锁朝向或边缘图层。');
 let profile=exposureProfile(surface,effect);
 if(!profile)throw Error('当前图层没有可调的朝向或开放边缘规则。');
 const {fields,advanced}=fieldsFor(profile);
 const field=[...fields,...advanced].find(f=>f.key===key);
 if(!field||field.disabled||!Number.isFinite(value)||value<field.min||value>field.max||['direction','seed'].includes(key)&&!Number.isInteger(value))throw Error('当前朝向或边缘参数不可用或超出范围。');

 if(surface.effects.some(e=>e.id!==effectId&&e.maskRef===effect.maskRef)){
  effect.maskRef=cloneMask(surface,effect.maskRef,{independentOwnedAreasFor:effectId});
  const mask=surface.masks.find(m=>m.id===effect.maskRef);
  mask.name=mask.name.slice(0,100);
  profile=exposureProfile(surface,effect);
 }
 editProfile(profile,effect,key,value);
 delete effect.legacyBinding;
 surface.active=true;
 pruneSurfaceResources(surface);
 next.surface=validateSurface(surface,next);
 return next;
}
