import {cachedSurfaceAnalysis,rememberSurfaceAnalysis} from './surface-analysis-cache.js';
import {formDistributionKey} from './form-effects.js';
import {compileBurlEffects} from './burl-compilation.js';
import {isManualDecalPlacement} from './manual-decal-rules.js';
import {SurfaceEdgeFilter} from './surface-edge-filter.js';
import {edgeTreatmentActive} from './edge-treatment.js';
import {distributionNeedsGeometry,distributionNeedsStructure,distributionCoverage} from './distribution-modes.js';
import {buildSurfaceStructure,sampleSurfaceStructure} from './surface-structure.js';
import {analyzeSculptMaterial} from './sculpt-material-analysis.js';
import {prepareWeatheringAO,weatheringGeometry,weatheringCoverage} from './tree-weathering.js';
import {isFormEffect,formDependencies,formMaskWeight} from './form-effects.js';
import {buildBrushTopology,PixelMaskRasterizer} from './pixel-masks.js';
import {buildSurfaceGraph,evaluateRegions} from './surface-tools.js';
import {scopeWeight} from './region-scope.js';
import {estimateSurfaceCurvature} from './surface-curvature.js';
import {buildStableCurvature,sampleStableCurvature} from './stable-curvature.js';
import {createSurfaceRayScene,prepareStableAO} from './stable-surface-ao.js';
import {stableGeometry,stableCoverage,rootMossSupplement} from './stable-distribution.js';
import {SCENE_OVERLAY_RULE,sceneOverlayRule,sceneOverlayTarget} from './scene-overlay-rules.js';
import {IMAGE_DECAL_STYLE} from './image-decal-rules.js';
import {createSceneOverlayCoverage,sceneOverlayGeometry} from './scene-overlay-coverage.js';
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function combineDistribution(a,b,kind,w=1){if(kind==='replace')return a*(1-w)+b*w;if(kind==='add')return Math.max(a,b*w);if(kind==='intersect')return a*(1-w+b*w);if(kind==='subtract')return a*(1-b*w);throw Error('未知分布组合。');}
function noise(x,y,z,seed){const h=(a,b,c)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^Math.imul(c,2147483647)^Math.imul(seed+1,1274126177);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};const a=Math.floor(x),b=Math.floor(y),c=Math.floor(z);let u=x-a,v=y-b,w=z-c;u=u*u*(3-2*u);v=v*v*(3-2*v);w=w*w*(3-2*w);const mix=(a,b,t)=>a+(b-a)*t;return mix(mix(mix(h(a,b,c),h(a+1,b,c),u),mix(h(a,b+1,c),h(a+1,b+1,c),u),v),mix(mix(h(a,b,c+1),h(a+1,b,c+1),u),mix(h(a,b+1,c+1),h(a+1,b+1,c+1),u),v),w);}
export class SurfaceDependencyError extends Error{constructor(missing){super('分布数据未就绪：'+missing.map(x=>x.label).join('、'));this.name='SurfaceDependencyError';this.missing=missing;}}
export function distributionDependencies(surface,{hasAO=false,hasCurvature=false}={}){const list=[];for(const e of surface.effects.filter(e=>e.enabled&&e.opacity>0)){for(const type of e.type==='burl'&&!isManualDecalPlacement(e)&&e.params.burlCount>0?['ao','curvature']:e.distribution?[]:formDependencies(e.type==='burl'?'':e.type))if(type==='ao'&&!hasAO||type==='curvature'&&!hasCurvature)list.push({effectId:e.id,ruleId:null,type,label:e.name+' / '+(type==='ao'?'模型AO':'模型曲率')});const m=surface.masks.find(m=>m.id===e.maskRef);for(const r of m.items.filter(r=>r.enabled))if(r.type==='ao'&&!hasAO||r.type==='curvature'&&!hasCurvature)list.push({effectId:e.id,ruleId:r.id,type:r.type,label:e.name+' / '+(r.type==='ao'?'模型AO':'模型曲率')});}return list;}
export class SurfaceDistributionRasterizer{
 constructor(source,working,size,{padding=8,cacheBudget=96*1024*1024}={}){this.source=source;this.working=working;this.size=size;this.topology=buildBrushTopology(source);this.raster=new PixelMaskRasterizer(this.topology,working,size,{padding,channels:1});this.areaCache=new Map();this.cacheBudget=cacheBudget;this.cacheBytes=0;this.burlStore={contexts:new Map(),placements:new Map()};this.curvature=null;this.curvatureCache=new Map();this.graph=null;this.weatheringCache=new Map();this.stableStore={base:null,scene:null,analyses:new Map()};}
 cached(key){const c=this.resultCache?.get(key);if(!c)return null;this.resultCache.delete(key);this.resultCache.set(key,c);return c;}
 remember(key,values,edge=null){this.resultCache||=new Map();this.resultBytes||=0;const bytes=values.byteLength;if(bytes>32*1024*1024)return;const old=this.resultCache.get(key);if(old)this.resultBytes-=old.values.byteLength;this.resultCache.delete(key);while(this.resultCache.size&&(this.resultBytes+bytes>32*1024*1024||this.resultCache.size>=64)){const[k,c]=this.resultCache.entries().next().value;this.resultBytes-=c.values.byteLength;this.resultCache.delete(k);}this.resultCache.set(key,{values,edge});this.resultBytes+=bytes;}
 pad(values){for(let i=0;i<values.length;i++){const src=this.raster.nearest[i];if(src>=0&&src!==i)values[i]=values[src];}return values;}
 field(sample){const values=new Uint8Array(this.size*this.size);for(let face=0;face<this.raster.triangles.length;face++){const t=this.raster.triangles[face];if(t)this.raster.walk(t,t.bounds,(i,a,b,c)=>{values[i]=Math.round(clamp(sample(t,face,a,b,c))*255);});}return this.pad(values);}
 area(area,document){const size=this.size,count=size*size,scopeKey=JSON.stringify([area.scope,area.partId,area.partId&&document.parts.groups.find(p=>p.id===area.partId)?.faces]),rawKey=JSON.stringify([area.kind,area.mode,area.strokes,area.legacyPrecision,area.legacyPrecision==='vertex'?area.scope:null,document.actualHeightMeters]),old=this.areaCache.get(area.id);if(old?.rawKey===rawKey&&old.scopeKey===scopeKey){this.areaCache.delete(area.id);this.areaCache.set(area.id,old);return old.values;}
  let raw;if(old?.rawKey===rawKey)raw=old.raw;else if(area.kind==='surface'&&area.legacyPrecision==='vertex'){
   this.graph||=buildSurfaceGraph(this.source);const v=evaluateRegions(this.graph,[{layer:'moss',mode:area.mode,strokes:area.strokes,...(area.scope?{scope:area.scope}:{})}],document.actualHeightMeters);raw=this.field((t,f,a,b,c)=>{const ids=this.source.indices;return a*v[ids[f*3]*6]+b*v[ids[f*3+1]*6]+c*v[ids[f*3+2]*6];});
  }else if(area.kind==='surface'){
   const target=this.raster.maps[0];for(let i=0;i<count;i++)target[i*4]=area.mode==='painted'?0:255;
   for(const stroke of area.strokes){if(stroke.face>=this.raster.triangles.length)throw Error('区域笔触超出当前源模型。');this.raster.apply(stroke,0,document.actualHeightMeters);}
   raw=new Uint8Array(count);for(let i=0;i<count;i++)raw[i]=target[i*4];this.pad(raw);
  }else raw=new Uint8Array(count).fill(255);
  let values=raw;const faces=area.partId?new Set(document.parts.groups.find(p=>p.id===area.partId)?.faces||[]):null;
  if(area.scope&&area.legacyPrecision!=='vertex'||faces){values=raw.slice();for(let f=0;f<this.raster.triangles.length;f++){const t=this.raster.triangles[f];if(!t)continue;this.raster.walk(t,t.bounds,(i,a,b,c)=>{const y=(t.p[0][1]*a+t.p[1][1]*b+t.p[2][1]*c-this.topology.minY)/this.topology.height;values[i]=Math.round(raw[i]*(area.legacyPrecision==='vertex'?1:scopeWeight(area.scope,y))*(!faces||faces.has(f)?1:0));});}this.pad(values);}
  if(old){this.cacheBytes-=old.raw.byteLength+(old.values===old.raw?0:old.values.byteLength);this.areaCache.delete(area.id);}const bytes=raw.byteLength+(values===raw?0:values.byteLength);while(this.cacheBytes+bytes>this.cacheBudget&&this.areaCache.size){const[key,value]=this.areaCache.entries().next().value;this.cacheBytes-=value.raw.byteLength+(value.values===value.raw?0:value.values.byteLength);this.areaCache.delete(key);}this.areaCache.set(area.id,{rawKey,scopeKey,raw,values});this.cacheBytes+=bytes;return values;
 }
 prepareCurvature(document,radiusMeters=document.surface.analysis.curvature.radiusMeters){const key=JSON.stringify([document.actualHeightMeters,radiusMeters]);let value=this.curvatureCache.get(key);if(!value){value={key,...estimateSurfaceCurvature(this.source,{actualHeightMeters:document.actualHeightMeters,radiusMeters,topology:this.topology})};while(this.curvatureCache.size&&(this.curvatureCache.size>=8||[...this.curvatureCache.values()].reduce((n,v)=>n+v.convex.byteLength+v.concave.byteLength+v.signed.byteLength,0)+value.convex.byteLength+value.concave.byteLength+value.signed.byteLength>32*1024*1024))this.curvatureCache.delete(this.curvatureCache.keys().next().value);this.curvatureCache.set(key,value);}this.curvature=value;return value;}
 prepareWeathering(document,scale=1){const key=JSON.stringify([document.actualHeightMeters,scale]);let value=this.weatheringCache.get(key);if(!value){value=prepareWeatheringAO(this.source,document.actualHeightMeters,scale);while(this.weatheringCache.size>=2)this.weatheringCache.delete(this.weatheringCache.keys().next().value);this.weatheringCache.set(key,value);}return value;}
 prepareStable(document,recognitionCm=18){const store=this.stableStore,key=JSON.stringify([document.actualHeightMeters,recognitionCm]);let value=cachedSurfaceAnalysis(store.analyses,key);if(value)return value;store.base||=buildStableCurvature(this.source,{topology:this.topology});store.scene||=createSurfaceRayScene(this.source);const common={actualHeightMeters:document.actualHeightMeters},local=sampleStableCurvature(store.base,this.source,{...common,radiusMeters:recognitionCm/100}),wide=sampleStableCurvature(store.base,this.source,{...common,radiusMeters:recognitionCm/100*3}),ao=prepareStableAO(this.source,document.actualHeightMeters,recognitionCm,{scene:store.scene});value={local,wide,ao,metadata:{algorithm:'stable-tree-distribution-v1',actualHeightMeters:document.actualHeightMeters,recognitionCm,curvature:local.metadata,wideCurvature:wide.metadata,ao:ao.metadata}};rememberSurfaceAnalysis(store.analyses,key,value);return value;}
 prepareStructure(document){const store=this.stableStore;store.base||=buildStableCurvature(this.source,{topology:this.topology});if(store.structure?.metadata.actualHeightMeters!==document.actualHeightMeters)store.structure=buildSurfaceStructure(this.source,{base:store.base,topology:this.topology,actualHeightMeters:document.actualHeightMeters});return store.structure;}
 prepareSculpt(document){const store=this.stableStore;store.base||=buildStableCurvature(this.source,{topology:this.topology});if(store.sculpt?.actualHeightMeters!==document.actualHeightMeters)store.sculpt=analyzeSculptMaterial(this.source,store.base,{actualHeightMeters:document.actualHeightMeters});return store.sculpt;}
 sceneOverlayField(scene,document,ao){
  if(scene.style===IMAGE_DECAL_STYLE)return new Uint8Array(this.size*this.size).fill(255);
  const {min,max,normal,indices,pos,height}=this.source;
  const scale=document.actualHeightMeters/height;
  const point=(f,a,b,c,values,offset)=>[0,1,2].map(axis=>(values[indices[f*3]*3+axis]*a+values[indices[f*3+1]*3+axis]*b+values[indices[f*3+2]*3+axis]*c-(offset?.[axis]??0))*(offset?scale:1));
  const points=scene.points.map(({face,bary:[a,b,c]})=>{
   if(face*3+2>=indices.length)throw Error('场景叠加位置超出当前模型。');
   return {position:point(face,a,b,c,pos,min),normal:point(face,a,b,c,normal)};
  });
  const extent=max?max.map((value,axis)=>(value-min[axis])*scale):[document.actualHeightMeters,document.actualHeightMeters,document.actualHeightMeters];
  const geometry=sceneOverlayGeometry(scene.style)?this.prepareCurvature(document,.18):null;
  const sample=createSceneOverlayCoverage({...scene,points},{min:[0,0,0],max:extent,seed:5});
  return this.field((tri,f,a,b,c)=>{
   const src=tri.p[0],next=tri.p[1],last=tri.p[2];
   const x=(src[0]*a+next[0]*b+last[0]*c-min[0])*scale;
   const y=(src[1]*a+next[1]*b+last[1]*c-min[1])*scale;
   const z=(src[2]*a+next[2]*b+last[2]*c-min[2])*scale;
   const i=f*3,ia=indices[i],ib=indices[i+1],ic=indices[i+2];
   const nx=normal[ia*3]*a+normal[ib*3]*b+normal[ic*3]*c;
   const ny=normal[ia*3+1]*a+normal[ib*3+1]*b+normal[ic*3+1]*c;
   const nz=normal[ia*3+2]*a+normal[ib*3+2]*b+normal[ic*3+2]*c;
   const len=Math.hypot(nx,ny,nz)||1;
   const curve=geometry?geometry.convex[i]*a+geometry.convex[i+1]*b+geometry.convex[i+2]*c:0;
   const cavity=geometry?geometry.concave[i]*a+geometry.concave[i+1]*b+geometry.concave[i+2]*c:0;
   return sample(x,y,z,nx/len,ny/len,nz/len,curve,cavity,ao?ao[ia]*a+ao[ib]*b+ao[ic]*c:1);
  });
 }
 render(document,{ao=null,curvatureReady=false,preview=null,onProgress=()=>{}}={}){
  if(ao&&(ao.length!==this.source.pos.length/3||ao.some(v=>!Number.isFinite(v)||v<0||v>1)))throw Error('模型AO数据无效或与源模型不一致。');
  if(curvatureReady){onProgress('正在准备几何曲率…');this.prepareCurvature(document);}
  const s=document.surface,missing=distributionDependencies(s,{hasAO:!!ao,hasCurvature:curvatureReady});if(missing.length)throw new SurfaceDependencyError(missing);
  const context=JSON.stringify([document.actualHeightMeters,curvatureReady,document.surface.analysis,document.parts]),sameAO=!!ao===!!this.resultAO&&(!ao||ao.length===this.resultAO.length&&ao.every((v,i)=>v===this.resultAO[i]));
  if(context!==this.resultContext||!sameAO){this.resultCache=new Map();this.resultBytes=0;this.resultContext=context;this.resultAO=ao?.slice()||null;}
  this.performance={maskHits:0,effectHits:0,masksComputed:0,effectsComputed:0};const maskKeys=new Map();
  const count=this.size*this.size,areas=new Map(s.areas.map(a=>[a.id,a])),fields=new Map(),results=new Map(),isNeeded=new Set(s.effects.filter(e=>e.enabled&&e.opacity>0).map(e=>e.maskRef));let previewValues=null;
  const getArea=id=>{const a=areas.get(id);if(!a)throw Error('分布区域不存在。');const key='area:'+id;if(!fields.has(key))fields.set(key,this.area(a,document));return fields.get(key);};
  const evaluate=(r)=>{let key=JSON.stringify(r);if(fields.has(key))return fields.get(key);let b;
   if(r.type===SCENE_OVERLAY_RULE)b=this.sceneOverlayField(r.scene,document,ao);
   if(r.type==='legacy'||r.type==='area')return getArea(r.areaRef);
   if(r.type==='constant')b=new Uint8Array(count).fill(Math.round(r.params.value*255));
   if(r.type==='height')b=this.field((t,f,a,b,c)=>{
    const y=(t.p[0][1]*a+t.p[1][1]*b+t.p[2][1]*c-this.source.min[1])/this.source.height*document.actualHeightMeters;
    const {minMeters,maxMeters,featherMeters}=r.params;
    if(featherMeters===0)return y>=minMeters&&y<=maxMeters?1:0;
    const feather=Math.max(.0001,featherMeters);
    return smooth(minMeters-feather,minMeters,y)*(1-smooth(maxMeters,maxMeters+feather,y));
   });
   if(r.type==='noise')b=this.field((t,f,a,b,c)=>{const p=t.p[0].map((v,k)=>(v*a+t.p[1][k]*b+t.p[2][k]*c-this.source.min[k])/this.source.height*document.actualHeightMeters/r.params.sizeMeters),v=noise(p[0],p[1],p[2],r.params.seed);return smooth(r.params.threshold-r.params.softness,r.params.threshold+r.params.softness,v);});
   if(r.type==='orientation')b=this.field((t,f,a,b,c)=>{const ids=this.source.indices,normal=this.source.normal,n=[0,1,2].map(k=>normal[ids[f*3]*3+k]*a+normal[ids[f*3+1]*3+k]*b+normal[ids[f*3+2]*3+k]*c),length=Math.hypot(...n)||1,directions={up:[1,1],down:[1,-1],positiveX:[0,1],negativeX:[0,-1],positiveZ:[2,1],negativeZ:[2,-1]},[axis,sign]=directions[r.polarity];return smooth(r.params.threshold-r.params.softness,r.params.threshold+r.params.softness,n[axis]/length*sign);});
   if(r.type==='streaks')b=this.field((t,f,a,b,c)=>{const p=t.p[0].map((v,k)=>(v*a+t.p[1][k]*b+t.p[2][k]*c-this.source.min[k])/this.source.height*document.actualHeightMeters/(k===1?r.params.lengthMeters:r.params.widthMeters)),v=noise(p[0],p[1],p[2],r.params.seed)*.8+noise(p[0]*.5,p[1]*3,p[2]*.5,r.params.seed+19)*.2;return smooth(r.params.threshold-r.params.softness,r.params.threshold+r.params.softness,v);});
   if(r.type==='ao'){if(!ao||ao.length!==this.source.pos.length/3)throw Error('模型AO缺失或与源模型不一致。');b=this.field((t,f,a,b,c)=>{const ids=this.source.indices,v=ao[ids[f*3]]*a+ao[ids[f*3+1]]*b+ao[ids[f*3+2]]*c,value=r.polarity==='cavity'?1-v:v;return smooth(r.params.threshold-r.params.softness,r.params.threshold+r.params.softness,value);});}
   if(r.type==='curvature'){if(!curvatureReady)throw Error('模型曲率尚未准备。');const source=this.prepareCurvature(document)[r.polarity];b=this.field((t,f,a,b,c)=>{const v=source[f*3]*a+source[f*3+1]*b+source[f*3+2]*c;return smooth(r.params.threshold-r.params.softness,r.params.threshold+r.params.softness,v);});}
   if(r.type==='treeweather'){const p=r.params,sharedKey='weather:'+JSON.stringify([p.scale,p.rootHeightMeters,p.seed,p.density]);if(!fields.has(sharedKey)){const w=this.prepareWeathering(document,p.scale),local=this.prepareCurvature(document,.18*p.scale),wide=this.prepareCurvature(document,.54*p.scale),ids=this.source.indices,values=Array.from({length:6},()=>new Uint8Array(count));for(let f=0;f<this.raster.triangles.length;f++){const t=this.raster.triangles[f];if(!t)continue;this.raster.walk(t,t.bounds,(i,a,b,c)=>{const interpolate=(v,corner=false)=>v[corner?f*3:ids[f*3]]*a+v[corner?f*3+1:ids[f*3+1]]*b+v[corner?f*3+2:ids[f*3+2]]*c,position=t.p[0].map((v,k)=>(v*a+t.p[1][k]*b+t.p[2][k]*c-this.source.min[k])/this.source.height*document.actualHeightMeters),coverage=weatheringCoverage({position,...weatheringGeometry({short:interpolate(w.short),broad:interpolate(w.broad),signed:interpolate(local.signed,true),wideSigned:interpolate(wide.signed,true)})},{...p,role:null});for(let j=0;j<6;j++)values[j][i]=Math.round(coverage[j]*255);});}for(const v of values)this.pad(v);fields.set(sharedKey,values);}b=fields.get(sharedKey)[p.role];}
   if(r.type==='distribution'){const p=r.params,w=distributionNeedsGeometry(p)?this.prepareStable(document,p.recognitionCm):null,structure=distributionNeedsStructure(p)?this.prepareStructure(document):null;b=this.field((t,f,a,b,c)=>{const interpolate=v=>v[f*3]*a+v[f*3+1]*b+v[f*3+2]*c,position=t.p[0].map((v,k)=>(v*a+t.p[1][k]*b+t.p[2][k]*c-this.source.min[k])/this.source.height*document.actualHeightMeters),ids=this.source.indices,normal=[4,10].includes(p.mode)?[0,1,2].map(k=>this.source.normal[ids[f*3]*3+k]*a+this.source.normal[ids[f*3+1]*3+k]*b+this.source.normal[ids[f*3+2]*3+k]*c):null,len=normal?Math.hypot(...normal)||1:1,g=w?stableGeometry({...w.ao.sample(f,a,b,c),signed:interpolate(w.local.signed),wideSigned:interpolate(w.wide.signed)}):{};if(structure)Object.assign(g,sampleSurfaceStructure(structure,f,a,b,c,{direction:p.direction,flow:p.mode===8}));return distributionCoverage(position,normal?.map(x=>x/len),g,p);});}
   if(r.type==='treeauto'){
    const p=r.params,params={...p,role:null},options={openRootFallback:r.openRootFallback===true};
    const sharedKey='stable:'+JSON.stringify([params,options]);
    if(!fields.has(sharedKey)){
     const w=this.prepareStable(document,p.recognitionCm),values=Array.from({length:6},()=>new Uint8Array(count));
     if(options.openRootFallback){
      if(w.mossSupplement?.rootHeight!==p.rootHeightMeters){
       w.mossSupplement={rootHeight:p.rootHeightMeters,
        strength:rootMossSupplement(this.source,w,document.actualHeightMeters,p.rootHeightMeters)};
      }
      options.mossSupplement=w.mossSupplement.strength;
     }
     for(let f=0;f<this.raster.triangles.length;f++){
      const t=this.raster.triangles[f];
      if(!t)continue;
      this.raster.walk(t,t.bounds,(i,a,b,c)=>{
       const interpolate=v=>v[f*3]*a+v[f*3+1]*b+v[f*3+2]*c;
       const position=t.p[0].map((v,k)=>(v*a+t.p[1][k]*b+t.p[2][k]*c-this.source.min[k])/this.source.height*document.actualHeightMeters);
       const geometry=stableGeometry({...w.ao.sample(f,a,b,c),signed:interpolate(w.local.signed),wideSigned:interpolate(w.wide.signed)});
       const coverage=stableCoverage({position,...geometry},params,options);
       for(let j=0;j<6;j++)values[j][i]=Math.round(coverage[j]*255);
      });
     }
     for(const v of values)this.pad(v);
     fields.set(sharedKey,values);
    }
    b=fields.get(sharedKey)[p.role];
   }
   if(!b)throw Error('不支持的分布数据源。');fields.set(key,b);return b;
  };
  const previewRule=['input','step'].includes(preview?.kind)?preview.ruleId:null;
  const previewMask=s.effects.find(e=>e.id===preview?.effectId)?.maskRef;
  onProgress('正在计算各图层的覆盖分布…');
  for(const m of s.masks){const needsRule=previewRule&&m.items.some(r=>r.id===previewRule);if(!isNeeded.has(m.id)&&m.id!==previewMask&&!needsRule)continue;const key=JSON.stringify(['mask',m,s.areas.filter(a=>m.items.some(r=>[r.areaRef,r.addRef,r.eraseRef].includes(a.id)))]),cached=!needsRule&&this.cached(key);maskKeys.set(m.id,key);if(cached){this.performance.maskHits++;results.set(m.id,cached.values);continue;}this.performance.masksComputed++;const managed=m.items.some(x=>x.type==='distribution');let values=new Uint8Array(count).fill(Math.round(m.initial*255));for(const r of m.items){if(!r.enabled){if(preview?.ruleId===r.id){if(preview.kind==='step'||['levels','invert'].includes(r.type))previewValues=values.slice();else if(preview.kind==='input')previewValues=(r.type==='paint'?getArea(r.addRef):evaluate(r)).slice();}continue;}if(['levels','invert'].includes(r.type)&&preview?.ruleId===r.id&&preview.kind==='input')previewValues=values.slice();if(r.type==='paint'){const a=getArea(r.addRef),e=getArea(r.eraseRef);for(let i=0;i<count;i++)values[i]=Math.round((managed?values[i]:Math.max(values[i],a[i]*r.strength))*(1-e[i]/255*r.strength));if(preview?.ruleId===r.id&&preview.kind==='input')previewValues=a.slice();}
    else if(r.type==='invert'){for(let i=0;i<count;i++)values[i]=Math.round(values[i]*(1-r.strength)+(255-values[i])*r.strength);}
    else if(r.type==='levels'){for(let i=0;i<count;i++){const v=values[i]/255,n=clamp((v-.5)*r.params.contrast+.5+r.params.balance);values[i]=Math.round((v*(1-r.strength)+n*r.strength)*255);}}
    else{const b=evaluate(r);for(let i=0;i<count;i++)values[i]=Math.round(combineDistribution(values[i]/255,b[i]/255,r.combine,r.strength)*255);if(preview?.ruleId===r.id&&preview.kind==='input')previewValues=b.slice();}
    if(preview?.ruleId===r.id&&preview.kind==='step')previewValues=values.slice();
   }const result=this.pad(values);results.set(m.id,result);this.remember(key,result);}
  const washes=new Map();
  for(const effect of s.effects){
   if(!effect.enabled||effect.opacity<=0)continue;
   const rule=sceneOverlayRule(s,effect);
   if(!rule?.enabled||rule.scene.style!=='dust-wash')continue;
   const target=sceneOverlayTarget(s,effect,rule.scene);
   if(!target)continue;
   const modifiers=washes.get(target.id)||[];
   modifiers.push({key:maskKeys.get(effect.maskRef),values:results.get(effect.maskRef),opacity:effect.opacity});
   washes.set(target.id,modifiers);
  }
  const edgeProcessing=[];const maps=Array.from({length:4},()=>new Uint8Array(count*4).fill(255));for(const[slot,e]of s.effects.entries()){const removals=washes.get(e.id);const coverageKey=JSON.stringify(['effect',maskKeys.get(e.maskRef)||null,e.maskRef,e.scopeRef,s.areas.find(a=>a.id===e.scopeRef)||null,e.enabled&&e.opacity>0,e.edgeTreatment,formDistributionKey(e),removals?.map(({key,opacity})=>[key,opacity])]),cached=!(preview?.kind==='automatic'&&preview.effectId===e.id)&&this.cached(coverageKey);if(cached){this.performance.effectHits++;const target=maps[slot>>2];for(let i=0;i<count;i++)target[i*4+slot%4]=cached.values[i];if(cached.edge)edgeProcessing.push({effectId:e.id,...cached.edge,traceSamples:0,traceMisses:0});continue;}this.performance.effectsComputed++;const values=results.get(e.maskRef)||new Uint8Array(count).fill(255),scope=e.scopeRef?getArea(e.scopeRef):null,map=maps[slot>>2],channel=slot%4;let edgeMetadata=null;let automatic=null;if(isFormEffect(e.type)&&!e.distribution&&e.enabled&&e.opacity>0){
    const p=e.params,width=p.formWidthCm/100,curvature=this.prepareCurvature(document,width),broad=e.type==='ridge'?this.prepareCurvature(document,width*3):null,ids=this.source.indices;
    automatic=this.field((t,f,a,b,c)=>{const position=t.p[0].map((v,k)=>(v*a+t.p[1][k]*b+t.p[2][k]*c-this.source.min[k])/this.source.height*document.actualHeightMeters),v=ao[ids[f*3]]*a+ao[ids[f*3+1]]*b+ao[ids[f*3+2]]*c,convex=broad?Math.max(0,(curvature.signed[f*3]*a+curvature.signed[f*3+1]*b+curvature.signed[f*3+2]*c)-(broad.signed[f*3]*a+broad.signed[f*3+1]*b+broad.signed[f*3+2]*c)/3):curvature.convex[f*3]*a+curvature.convex[f*3+1]*b+curvature.convex[f*3+2]*c,concave=curvature.concave[f*3]*a+curvature.concave[f*3+1]*b+curvature.concave[f*3+2]*c;
     return formMaskWeight(e.type,{ao:v,convex,concave,noise:noise(position[0]/width,position[1]/width,position[2]/width,e.seed),heightMeters:position[1]},p);});
   }const filtering=e.enabled&&e.opacity>0&&edgeTreatmentActive(e.edgeTreatment);let coverage=values;if(filtering&&automatic){coverage=values.map((v,i)=>Math.round(v*automatic[i]/255));}if(filtering){const stage='正在沿面柔化「'+e.name+'」';onProgress(stage+'…');this.edgeFilter||=new SurfaceEdgeFilter(this.raster,this.working);const filtered=this.edgeFilter.process(coverage,e.edgeTreatment,document.actualHeightMeters,p=>onProgress(stage+' · '+Math.round(p*100)+'%'));coverage=filtered.values;edgeMetadata=filtered.metadata;edgeProcessing.push({effectId:e.id,...filtered.metadata});}
   const packed=new Uint8Array(count);
   for(let i=0;i<count;i++){
    let value=coverage[i]*(scope?scope[i]/255:1)*(automatic&&!filtering?automatic[i]/255:1);
    if(removals)for(const {values,opacity} of removals)value*=1-values[i]/255*opacity;
    map[i*4+channel]=packed[i]=Math.round(value);
   }
   this.remember(coverageKey,packed,edgeMetadata);
   if(automatic&&preview?.effectId===e.id&&preview.kind==='automatic')previewValues=automatic.slice();}
  if(preview?.kind==='area')previewValues=getArea(preview.areaId).slice();
  const analysis={weathering:[...this.weatheringCache.values()].map(v=>({...v.metadata,curvatureRadiiMeters:[.18*v.metadata.scale,.54*v.metadata.scale],microstructure:'aligned cached bark height wear (estimated relative height when normal-only); material shader',materialOrigin:'existing PBR moss atlas and procedural crust'})),ao:ao?{source:'source-vertex-ray-AO',vertices:ao.length}:null,curvature:curvatureReady?this.prepareCurvature(document).metadata:null,formEffects:s.effects.filter(e=>isFormEffect(e.type)).map(e=>({effectId:e.id,type:e.type,widthMeters:e.params.formWidthCm/100,dataOrigin:'source vertex ray AO and signed geometric curvature; convex ridge uses local-minus-broad response; no bark microcurvature'}))};
  analysis.stable=[...this.stableStore.analyses.values()].map(v=>v.metadata);analysis.edgeProcessing=edgeProcessing;analysis.structure=this.stableStore.structure?.metadata||null;analysis.runoff=this.stableStore.structure?[...this.stableStore.structure.flows.values()].map(v=>v.metadata):[];
  if(s.effects.some(e=>e.type==='burl'&&e.enabled&&e.opacity>0&&e.params.burlCount>0))onProgress('正在投射表面贴花…');
  const burls=compileBurlEffects(this.source,document,{ao,store:this.burlStore});analysis.burls=burls.analysis;
  return{performance:{...this.performance,resultCacheBytes:this.resultBytes||0},size:this.size,maps,sculptField:document.sculptMaterial?.local?this.prepareSculpt(document).field:null,burlCompilation:burls.compilation,preview:previewValues,slots:s.effects.map(e=>e.id),algorithm:edgeProcessing.some(e=>e.edgeVersion===2)?'surface-rule-stack-v6':edgeProcessing.length?'surface-rule-stack-v5':s.masks.some(m=>m.items.some(r=>['treeauto','distribution'].includes(r.type)))?'surface-rule-stack-v4':'surface-rule-stack-v3',analysis};
 }
}
