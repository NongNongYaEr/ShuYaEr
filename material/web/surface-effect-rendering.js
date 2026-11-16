import {emissionMaximum} from './emission-rules.js';
import{SURFACE_DECAL_STYLES}from'./surface-decal-styles.js';
import {burlBarkFusion} from './burl-effect.js';
import {COLOR_BLEND_MODES,defaultBlend} from './material-blend.js';
import {EFFECT_IDS} from './surface-effects.js';
import {effectSettings} from './surface-effects.js';
import {SCENE_OVERLAYS} from './scene-overlay-catalog.js';
import {sceneOverlayRule} from './scene-overlay-rules.js';
import {IMAGE_DECAL_STYLE} from './image-decal-rules.js';
import {packImageDecalAtlas,packImageDecalUniforms} from './image-decal-atlas.js';
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
export function setupSurfaceEffects(renderer,pass,bake=false){
 const packed=!!renderer.paintAtlasLayout&&(bake||!renderer.bakedPreviewActive||pass===8||pass===11||pass===12);renderer.uniform('uPaintPacked','i',+packed);renderer.uniform('uPaintUVRegion','4',renderer.paintUVRegion||[0,0,1,1]);if(packed){renderer.uniform('uPaintMaskRect','4',renderer.paintAtlasLayout.rects['mask:1']);}
 const s=renderer.surfaceStack,slots=renderer.surfaceMaskSlots;
 const active=!!s?.active&&!!slots&&s.effects.length===slots.length&&s.effects.every((e,i)=>e.id===slots[i]);
 // An authored stack without matching masks uses the empty stack shader path.
 // The zero count is reserved for the legacy six-layer material.
 renderer.uniform('uEffectCount','i',active?(s.effects.length||-1):s?.active?-1:0);
 renderer.uniform('uEffectSelected','i',active?Math.max(0,s.effects.findIndex(e=>e.id===renderer.selectedEffectId)):-1);renderer.uniform('uSurfacePreview','i',+(active&&pass===12&&!!renderer.surfacePreviewMap));
 renderer.uniform('uEmissionMaximum','f',active?emissionMaximum(s):0);if(!active)return;
 for(const[slot,e]of s.effects.entries()){
  const em=e.emission;renderer.uniform('uEffectEmission['+slot+']','4',em?.enabled?[...rgb(em.color),em.strength]:[0,0,0,0]);renderer.uniform('uEffectEmissionShape['+slot+']','4',em?[+(em.pattern==='bark-cavity'),em.threshold,em.softness,0]:[0,.5,.1,0]);
  const blend=e.blend||defaultBlend(),c=blend.conditions,index=id=>s.effects.findIndex(x=>x.id===id),mode=(list,v)=>list.indexOf(v);
  renderer.uniform('uBlendColor['+slot+']','4',[e.blend?Object.keys(COLOR_BLEND_MODES).indexOf(blend.color.mode):-1,blend.color.strength,blend.roughness.strength,blend.normal.strength]);
  for(const [name,value]of Object.entries({Channels:[mode(['normal','max','min','offset'],blend.roughness.mode),mode(['add','replace','keep'],blend.height.mode),mode(['material','min','multiply','keep'],blend.ao.mode),mode(['material','add','replace','keep'],blend.normal.mode)],Extra:[blend.height.strength,blend.ao.strength,blend.roughness.offset,0],Height:[mode(['off','cavity','ridge'],c.height),c.heightStrength,c.heightBalance,c.heightSoftness],HeightSource:[mode(['bark','lower','layer'],c.heightSource),index(c.sourceId),c.heightRangeMm,0],Limits:[c.dark,c.light,c.softness,mode(['all','bark','layer'],c.target)],Target:[index(c.targetId),+c.excludePaint,+c.excludeMoss,0]}))renderer.uniform('uBlend'+name+'['+slot+']','4',value);

  const a=e.paint?.adjustments,rect=renderer.paintAtlasLayout?.rects;renderer.uniform('uPaintAdjust['+slot+']','4',a&&rect?.[e.id+':0']?[e.paint.appearance==='moss-surface-v1'?2:1,a.normal,a.roughness,a.ao]:[0,1,0,1]);if(a&&rect?.[e.id+':0']){renderer.uniform('uPaintTint['+slot+']','3',rgb(a.tint));for(let map=0;map<3;map++)renderer.uniform('uPaintRects['+(slot*3+map)+']','4',rect[e.id+':'+map]);}
  const scene=sceneOverlayRule(s,e)?.scene;
  const p=effectSettings(e,renderer.settings),value=(k,fallback)=>p[k]??fallback;
  let data=[value('moss',.28),value('mossRough',.92),+value('mossEnabled',true),value('mossNormalStrength',1.2),value('mossThicknessMm',4)/1000,value('mossClumpCm',2.5)/100,value('mossPorosity',.6),value('mossFiberMm',1),value('mossAO',.65),+value('paintEnabled',true),value('paintHeight',.135),value('paintWear',.35),value('paintRough',.9),value('paintNormalStrength',.35),value('paintBarkNormal',1),value('paintAO',.25),value('paintCoverage',.9),value('paintDepthAmount',.65),value('paintDepthContrast',1.2),value('paintPeel',0),value('paintPeelSizeCm',30)/100,value('paintPeelEdge',.15),value('paintPeelDetail',.7),value('paintPeelChips',.35),value('lichen',.25),+value('lichenEnabled',false),value('dirt',.4),+value('dirtEnabled',false),value('wet',.3),+value('wetEnabled',false),value('variation',.22),value('scale',16),value('lichenRough',.95),value('lichenNormal',1),value('dirtRough',.94),value('dirtNormal',1),value('wetDarken',.42),value('wetRough',.28),0,0];
  if(EFFECT_IDS.indexOf(e.type)>=6){data=new Array(40).fill(0);for(const[i,k]of ['surfaceAmount','surfaceRoughness','surfaceNormalStrength','surfaceHeightMm','surfaceGrainCm','surfaceVariation','surfaceAO','surfaceBarkKeep','surfaceSaturation'].entries())data[i]=value(k,k==='surfaceAmount'||k==='surfaceNormalStrength'||k==='surfaceBarkKeep'?1:0);data[3]/=1000;data[4]/=100;}
  if(e.type==='burl'){data[11]=p.burlStyle;data[12]=SURFACE_DECAL_STYLES[p.burlStyle].reliefMode;data[9]=p.burlRings;data[10]=p.burlWarp;data[13]=burlBarkFusion(p);}
  if(scene?.style==='spray')p.surfaceColor=scene.params.color;
  if(scene?.style===IMAGE_DECAL_STYLE)packImageDecalUniforms(data,scene,renderer.imageDecalSource,renderer.actualHeightMeters,renderer.imageDecalRects);
  if(scene?.style==='bark-patch'){
   data[14]=SCENE_OVERLAYS['bark-patch'].fields.material.options.findIndex(([id])=>id===scene.params.material)+1;
   data[15]=scene.params.scale;
  }
  if(scene?.role==='main'&&['strap','tool-teeth','bite','saw'].includes(scene.style))data[3]=-scene.params.depth/1000;
  if(scene?.style==='strap'&&scene.role==='main')data[1]=.86-scene.params.amount*.39;
  if(scene?.style==='filler')data[3]=scene.params.depth/1000;
  if(scene?.style==='graft'&&scene.role==='rim')data[3]=scene.params.height/1000;
  if(scene?.style==='hollow-rim'&&scene.role==='main')data[1]=.87-scene.params.shine*.38;
  const weather=renderer.surfaceStack?.masks?.find(m=>m.id===e.maskRef)?.items.find(r=>['treeweather','treeauto'].includes(r.type)&&r.enabled&&r.strength>0);data[39]=!e.distribution&&weather?weather.params.role+1:0;
  renderer.uniform('uEffectConfig['+slot+']','4',[scene?.style!=='dust-wash'&&e.enabled&&(!e.paint||!!rect?.[e.id+':0'])&&(bake||!renderer.soloEffectId||renderer.soloEffectId===e.id||e.parentIds?.includes(renderer.soloEffectId))?e.opacity:0,+e.channels.color,+e.channels.roughness,+e.channels.height]);renderer.uniform('uEffectMeta['+slot+']','4',[EFFECT_IDS.indexOf(e.type),e.seed,+(e.channels.ao!==false),+(e.coverageMode==='rules')]);for(let i=0;i<10;i++)renderer.uniform('uEffectData['+(slot*10+i)+']','4',data.slice(i*4,i*4+4));
  let color=p.surfaceColor?rgb(p.surfaceColor):e.type==='moss'?rgb(p.mossColor):e.type==='paint'?rgb(p.paintColor):e.type==='lichen'?rgb(p.lichenColor):e.type==='dirt'?rgb(p.dirtColor):[1,1,1];if(e.coverageMode==='legacy'&&e.type==='lichen'&&p.lichenColor==='#97a173')color=[.59,.63,.45];if(e.coverageMode==='legacy'&&e.type==='dirt'&&p.dirtColor==='#291d11')color=[.16,.115,.065];renderer.uniform('uEffectColor['+slot+']','3',color);
 }
 const g=renderer.gl;for(const[target,unit]of[['maskMap2',11],['maskMap3',12]]){g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,renderer[target]);renderer.uniform('u'+target[0].toUpperCase()+target.slice(1),'i',unit);}
 if(pass===12&&renderer.surfacePreviewMap){g.activeTexture(g.TEXTURE0+10);g.bindTexture(g.TEXTURE_2D,renderer.surfacePreviewMap);}
}
export function stageSurfaceMasks(renderer,result){
 const g=renderer.gl,textures=[];const atlas=packImageDecalAtlas(result.maps[3],result.size,result.imageDecals,{maxTextureSize:g.getParameter(g.MAX_TEXTURE_SIZE)});let patches=null;try{for(const [index,mask] of result.maps.entries()){const {width,height,data}=index===3?atlas:{width:result.size,height:result.size,data:mask};const t=g.createTexture();textures.push(t);g.bindTexture(g.TEXTURE_2D,t);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);g.texImage2D(g.TEXTURE_2D,0,g.RGBA8,width,height,0,g.RGBA,g.UNSIGNED_BYTE,data);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);if(g.getError()!==g.NO_ERROR)throw Error('效果分布贴图载入失败，已保留旧预览。');}let preview=null;if(result.preview){preview=g.createTexture();textures.push(preview);g.bindTexture(g.TEXTURE_2D,preview);g.pixelStorei(g.UNPACK_ALIGNMENT,1);g.texImage2D(g.TEXTURE_2D,0,g.R8,result.size,result.size,0,g.RED,g.UNSIGNED_BYTE,result.preview);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);}if(g.getError()!==g.NO_ERROR)throw Error('分布预览贴图载入失败，已保留旧预览。');if(result.burlCompilation||renderer.localPatchCompilation?.origin==='burl-generator')patches=renderer.stageLocalPatches(result.burlCompilation||null);return{commit(){patches?.commit();renderer.imageDecalRects=atlas.rects;renderer.imageDecalSource=result.imageDecalSource??null;for(let i=0;i<4;i++){const key='maskMap'+i,old=renderer[key];renderer[key]=textures[i];if(old)g.deleteTexture(old);}if(renderer.surfacePreviewMap)g.deleteTexture(renderer.surfacePreviewMap);renderer.surfacePreviewMap=preview;renderer.paintSourceMask={data:result.maps[1],size:result.size,slots:result.slots.slice(),working:renderer.model,revision:(renderer.paintSourceMask?.revision||0)+1};renderer.surfaceMaskSlots=result.slots;renderer.pixelMaskSize=result.size;renderer.surfaceAnalysis=result.analysis;renderer.surfaceRuleAlgorithm=result.algorithm??null;renderer.dirty=true;},rollback(){patches?.rollback();for(const t of textures)g.deleteTexture(t);}};}catch(e){patches?.rollback();for(const t of textures)g.deleteTexture(t);throw e;}
}
