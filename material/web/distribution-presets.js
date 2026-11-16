import {DISTRIBUTION_KEYS,distributionDefaults,validateDistributionParams} from './distribution-modes.js';
import {createRule,cloneMask,syncLegacySurface,validateSurface} from './surface-effects.js';
import {layerIsLocked,pruneSurfaceResources} from './surface-layers.js';
export function activeDistribution(s,e){return s.masks.find(m=>m.id===e.maskRef)?.items.find(r=>r.type==='distribution'&&r.enabled);}

const paintLineFilters=['paint','levels','invert'];
const paintLineMask=(s,e)=>s.masks.find(m=>m.id===e.maskRef);

export function paintLineRule(s,e){
 if(e.type!=='paint'||e.coverageMode!=='rules')return null;
 const generators=paintLineMask(s,e)?.items.filter(r=>r.enabled&&r.strength>0&&!paintLineFilters.includes(r.type))||[];
 if(generators.some(r=>r.type==='distribution'))return null;
 const heightIndex=generators.findIndex(r=>r.type==='height'&&r.combine==='replace'&&r.strength===1);
 if(heightIndex<0||generators.slice(heightIndex+1).some(r=>r.type==='height'||!['intersect','subtract'].includes(r.combine)))return null;
 return generators[heightIndex];
}

export function paintWearRule(s,e){
 const height=paintLineRule(s,e);
 if(!height)return null;
 const {items}=paintLineMask(s,e);
 const wear=items.slice(items.indexOf(height)+1).filter(r=>r.enabled&&r.combine==='subtract');
 const ridges=wear.filter(r=>r.type==='curvature'&&r.polarity==='convex');
 if(ridges.length)return ridges.length===1?ridges[0]:null;
 const patches=wear.filter(r=>r.type==='noise'&&r.strength>0);
 return patches.length===1?patches[0]:null;
}

function editPaintMask(document,id,edit){
 const d=structuredClone(document),s=syncLegacySurface(d),e=s.effects.find(e=>e.id===id);
 if(e?.type!=='paint'||e.paint||e.manualBrush||layerIsLocked(s,id))throw Error('请选择并解锁自动白漆图层。');
 if(s.effects.some(other=>other.id!==id&&other.maskRef===e.maskRef))e.maskRef=cloneMask(s,e.maskRef,{independentOwnedAreasFor:id});
 edit(d,s,e);
 delete e.legacyBinding;
 e.coverageMode='rules';
 s.active=true;
 pruneSurfaceResources(s);
 d.surface=validateSurface(s,d);
 return d;
}

export function editPaintLine(document,id,params,{tighten=false}={}){
 return editPaintMask(document,id,(d,s,e)=>{
  let rule=paintLineRule(s,e);
  if(rule){
   Object.assign(rule.params,params);
  }else{
   // A fully filled root gradient reaches half coverage at 72.5% of its upper height.
   const root=activeDistribution(s,e)?.params,legacy=e.coverageMode==='legacy';
   const fullRoot=root&&DISTRIBUTION_KEYS[root.mode]==='root'&&root.density===1&&root.cavityPreference===0;
   const height=fullRoot?root.rootHeightMeters*.725:d.actualHeightMeters*(legacy?e.params.paintHeight:.135);
   rule=createRule('height',{params:{minMeters:0,maxMeters:Math.min(height,d.actualHeightMeters),featherMeters:.015,...params}});
   const mask=paintLineMask(s,e),retained=mask.items.filter(r=>paintLineFilters.includes(r.type)||legacy&&r.type==='legacy');
   for(const r of retained)if(r.type==='legacy')r.combine='intersect';
   mask.items=[rule,...retained];
   mask.initial=1;
   if(e.publicDistribution?.id==='D11'&&e.publicDistribution.heightOwned&&e.blend)e.blend.conditions={...e.blend.conditions,...e.publicDistribution.previousHeight};
   delete e.publicDistribution;
   delete e.distribution;
  }
  if(tighten){
   rule.params.featherMeters=Math.min(rule.params.featherMeters,.015);
   delete e.edgeTreatment;
  }
 });
}

export function editPaintWear(document,id,{params,strength}){
 return editPaintMask(document,id,(_d,s,e)=>{
  const rule=paintWearRule(s,e);
  if(!rule)throw Error('当前白漆图层没有可调的磨损规则。');
  Object.assign(rule.params,params);
  if(strength!==undefined)rule.strength=strength;
 });
}

export function distributionState(document,id){const s=syncLegacySurface(document),e=s.effects.find(e=>e.id===id);if(!e)throw Error('请选择自动图层。');const r=activeDistribution(s,e);if(r)return{mode:DISTRIBUTION_KEYS[r.params.mode],params:structuredClone(r.params),custom:false};const old=s.masks.find(m=>m.id===e.maskRef)?.items.find(r=>['treeauto','treeweather'].includes(r.type)),mode=old?['groove','ridge','root','scattered','streaks','root'][old.params.role]:['ridge','groove','rootwet'].includes(e.type)?e.type==='ridge'?'ridge':e.type==='groove'?'groove':'root':'scattered',p=distributionDefaults(mode);if(old)Object.assign(p,{recognitionCm:old.params.recognitionCm??18*old.params.scale,patchCm:old.params.patchCm??28*old.params.scale,density:Math.min(1,old.params.density*(old.type==='treeweather'?.55:1)),seed:old.params.seed,rootHeightMeters:old.params.rootHeightMeters});return{mode:null,suggested:mode,params:p,custom:true};}
export function switchDistribution(document,id,mode,changes={}){
 const d=structuredClone(document),s=syncLegacySurface(d),e=s.effects.find(e=>e.id===id);if(!e||(e.paint||e.manualBrush)||layerIsLocked(s,id))throw Error('请选择并解锁自动图层。');if(!DISTRIBUTION_KEYS.includes(mode))throw Error('未知分布方式。');const previous=distributionState(d,id),memory=structuredClone(e.distribution?.memory||{});if(previous.mode)memory[previous.mode]=previous.params;
 if(e.publicDistribution&&previous.mode!==mode){if(e.publicDistribution.id==='D11'&&e.publicDistribution.heightOwned&&e.blend)e.blend.conditions={...e.blend.conditions,...e.publicDistribution.previousHeight};delete e.publicDistribution;}
 let params=memory[mode]||{...distributionDefaults(mode),...Object.fromEntries(['density','patchCm','recognitionCm','seed','edge'].map(k=>[k,previous.params[k]]))};params={...params,...changes,mode:DISTRIBUTION_KEYS.indexOf(mode)};if(mode==='uniform')params.density=1;params=validateDistributionParams(params);memory[mode]=params;
 if(s.effects.some(other=>other.id!==id&&other.maskRef===e.maskRef))e.maskRef=cloneMask(s,e.maskRef,{independentOwnedAreasFor:id});const m=s.masks.find(m=>m.id===e.maskRef),r=createRule('distribution',{params});m.items=[r,...m.items.filter(r=>['paint','levels','invert'].includes(r.type))];m.initial=1;m.name=e.name+' · 自动分布';
 if(s.areas.find(a=>a.id===e.scopeRef)?.presetOwned)e.scopeRef=null;e.distribution={version:1,memory};e.coverageMode='rules';delete e.legacyBinding;s.active=true;pruneSurfaceResources(s);d.surface=validateSurface(s,d);return d;
}
export function setDistributionScope(document,id,ref){const d=structuredClone(document),s=syncLegacySurface(d),e=s.effects.find(e=>e.id===id);if(!e||(e.paint||e.manualBrush)||layerIsLocked(s,id))throw Error('请解锁自动图层。');if(ref&&!s.areas.some(a=>a.id===ref))throw Error('作用范围不存在。');e.scopeRef=ref||null;delete e.legacyBinding;s.active=true;d.surface=validateSurface(s,d);return d;}
