import {RULE_TYPES,cloneMask,syncLegacySurface,validateSurface} from './surface-effects.js';
import {layerIsLocked,pruneSurfaceResources} from './surface-layers.js';
import {STABLE_FIELDS} from './stable-distribution.js';

const correctionTypes=['paint','levels'];
const stableKeys={height:'rootHeightMeters',amount:'density',size:'patchCm',recognition:'recognitionCm',seed:'seed'};

function attachmentProfile(surface,effect){
 if(!surface||!effect||!['moss','lichen'].includes(effect.type)||effect.coverageMode!=='rules'||effect.paint||effect.manualBrush)return null;
 const mask=surface.masks.find(m=>m.id===effect.maskRef);
 const generators=mask?.items.filter(r=>r.enabled&&r.strength>0&&!correctionTypes.includes(r.type));
 if(!generators?.length)return null;
 const [first,second]=generators;
 if(!second&&first.combine==='replace'){
  if(first.type==='treeauto'&&first.params.role===5&&effect.type==='moss')return{kind:'root',rule:first,mask};
  if(first.type==='noise')return{kind:'scattered',rule:first,mask};
 }
 if(generators.length===2&&effect.type==='moss'&&first.type==='ao'&&first.combine==='add'&&second.type==='noise'&&second.combine==='intersect'){
  const area=surface.areas.find(a=>a.id===effect.scopeRef&&a.kind==='height');
  return{kind:'root',rule:second,mask,area};
 }
 return null;
}

function fieldsFor({kind,rule,area},treeHeight){
 const p=rule.params;
 if(rule.type==='treeauto'){
  const inactive=p.density===0;
  const plainFull=p.density===1&&rule.openRootFallback!==true;
  return{kind,heightInScope:false,fields:[
   {...STABLE_FIELDS.rootHeightMeters,key:'height',label:'附着高度',value:p.rootHeightMeters,max:Math.min(STABLE_FIELDS.rootHeightMeters.max,Math.max(treeHeight,p.rootHeightMeters)),slider:true,disabled:inactive},
   {...STABLE_FIELDS.density,key:'amount',label:'覆盖量',value:p.density},
   {...STABLE_FIELDS.patchCm,key:'size',value:p.patchCm,slider:true,disabled:inactive||plainFull},
  ],advanced:[
   {...STABLE_FIELDS.recognitionCm,key:'recognition',value:p.recognitionCm,slider:true,disabled:inactive},
   {...STABLE_FIELDS.seed,key:'seed',value:p.seed,disabled:inactive||plainFull},
  ]};
 }

 const sizeCm=p.sizeMeters*100;
 const {sizeMeters,softness,threshold}=RULE_TYPES.noise.fields;
 const fields=[
  {...threshold,key:'amount',label:'覆盖量',value:1-p.threshold},
  {...sizeMeters,key:'size',value:sizeCm,min:sizeMeters.min*100,max:sizeMeters.max*100,step:1,unit:'cm',sliderMax:Math.max(100,sizeCm)},
 ];
 if(area){
  const value=area.scope.max*treeHeight;
  fields.unshift({key:'height',label:'附着高度',value,min:Math.min(value,area.scope.min*treeHeight+.01),max:treeHeight,step:.01,unit:'m',slider:true});
 }else{
  fields.push({...softness,key:'softness',label:'斑缘过渡',value:p.softness,step:.001});
 }
 return{kind,fields,heightInScope:!!area};
}

export function attachmentControls(document,effect){
 const profile=attachmentProfile(document?.surface,effect);
 return profile?fieldsFor(profile,document.actualHeightMeters):null;
}

function editAttachmentHeight(surface,effect,area,value,treeHeight){
 const usedByLayer=surface.effects.some(e=>e.id!==effect.id&&e.scopeRef===area.id);
 const usedByRule=surface.masks.some(m=>m.items.some(r=>[r.areaRef,r.addRef,r.eraseRef].includes(area.id)));
 const ownedByOther=area.ownedBy&&area.ownedBy!==effect.id;
 if(usedByLayer||usedByRule||ownedByOther){
  area={...structuredClone(area),id:crypto.randomUUID(),ownedBy:effect.id};
  surface.areas.push(area);
  effect.scopeRef=area.id;
 }
 area.scope.max=value/treeHeight;
 area.presetOwned=false;
}

export function editAttachment(document,effectId,key,value){
 const next=structuredClone(document),surface=syncLegacySurface(next);
 const effect=surface.effects.find(e=>e.id===effectId);
 if(!effect||layerIsLocked(surface,effectId))throw Error('请选择并解锁自然附着图层。');
 const profile=attachmentProfile(surface,effect);
 if(!profile)throw Error('当前图层没有可调的自然附着规则。');
 const {fields,advanced=[]}=fieldsFor(profile,next.actualHeightMeters);
 const field=[...fields,...advanced].find(f=>f.key===key);
 if(!field||field.disabled||!Number.isFinite(value)||value<field.min||value>field.max)throw Error('当前附着参数不可用或超出范围。');

 if(key==='height'&&profile.area){
  editAttachmentHeight(surface,effect,profile.area,value,next.actualHeightMeters);
 }else{
  let rule=profile.rule;
  if(surface.effects.some(e=>e.id!==effectId&&e.maskRef===effect.maskRef)){
   const ruleIndex=profile.mask.items.indexOf(rule);
   effect.maskRef=cloneMask(surface,effect.maskRef,{independentOwnedAreasFor:effectId});
   const mask=surface.masks.find(m=>m.id===effect.maskRef);
   mask.name=mask.name.slice(0,100);
   rule=mask.items[ruleIndex];
  }
  if(rule.type==='treeauto')rule.params[stableKeys[key]]=value;
  else if(key==='amount')rule.params.threshold=1-value;
  else if(key==='size')rule.params.sizeMeters=value/100;
  else rule.params.softness=value;
 }
 delete effect.legacyBinding;
 surface.active=true;
 pruneSurfaceResources(surface);
 next.surface=validateSurface(surface,next);
 return next;
}
