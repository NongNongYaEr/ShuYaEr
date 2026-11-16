import {SCENE_OVERLAYS} from './scene-overlay-catalog.js';
import {IMAGE_DECAL_SPEC,IMAGE_DECAL_STYLE,validateImageDecal} from './image-decal-rules.js';
import {requiresSceneTextMask,validateSceneSprayText,validateSceneTextMask} from './web/scene-overlay-text.js';

export const SCENE_OVERLAY_RULE='scene-overlay';
export const MAX_SCENE_PATH_POINTS=96;
const idPattern=/^[a-zA-Z0-9_-]{1,64}$/;
const sourcePattern=/^[0-9a-f]{64}$/;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);

export function sceneOverlaySpec(style){
 return style===IMAGE_DECAL_STYLE?IMAGE_DECAL_SPEC:Object.hasOwn(SCENE_OVERLAYS,style)?SCENE_OVERLAYS[style]:null;
}

export const isSceneProjector=style=>style==='spray'||style===IMAGE_DECAL_STYLE;

export function sceneOverlayDefaults(style){
 const spec=sceneOverlaySpec(style);
 if(!spec)throw Error('不支持的场景叠加效果。');
 return Object.fromEntries(Object.entries(spec.fields).map(([key,field])=>[key,field.value]));
}

export function validateSceneAnchor(anchor){
 const {face,bary}=anchor||{};
 if(!Number.isInteger(face)||face<0||face>=2000000||!Array.isArray(bary)||bary.length!==3||
   bary.some(value=>!Number.isFinite(value)||value<0||value>1)||Math.abs(bary.reduce((a,b)=>a+b,0)-1)>1e-4){
  throw Error('叠加位置与源表面不一致。');
 }
 return {face,bary:[...bary]};
}

export function validateSceneOverlay(raw,source){
 if(!object(raw)||raw.version!==1||!sceneOverlaySpec(raw.style)||!idPattern.test(raw.instance??'')||
   !object(raw.params)||!Array.isArray(raw.points))throw Error('场景叠加数据无效。');
 const {style,role,instance}=raw,spec=sceneOverlaySpec(style),params=sceneOverlayDefaults(style);
 const cap={auto:0,point:1,pair:2,path:MAX_SCENE_PATH_POINTS}[spec.mode];
 if(!spec.coatings.some(coating=>coating.role===role)||raw.points.length>cap||
   raw.points.length&&(!sourcePattern.test(raw.source)||raw.source!==source)){
  throw Error('场景叠加类型或定位来源无效。');
 }
 for(const [key,value] of Object.entries(raw.params)){
  const field=Object.hasOwn(spec.fields,key)&&spec.fields[key];
  if(!field||
   field.kind==='number'&&(!Number.isFinite(value)||value<field.min||value>field.max)||
   field.kind==='color'&&(typeof value!=='string'||!/^#[a-f0-9]{6}$/i.test(value))||
   field.kind==='select'&&!field.options.some(([option])=>option===value)){
   throw Error('场景叠加参数无效：'+key);
  }
  params[key]=field.kind==='text'?validateSceneSprayText(value,field.maxLength):value;
 }
 const scene={version:1,style,role,instance,params,points:raw.points.map(validateSceneAnchor),source:raw.points.length?source:null};
 if(style===IMAGE_DECAL_STYLE)scene.image=validateImageDecal(raw.image);
 if(style==='spray'&&raw.textMask!=null)scene.textMask=validateSceneTextMask(raw.textMask,params.text);
 if(style==='spray'&&requiresSceneTextMask(params.text)&&!scene.textMask)throw Error('喷漆文字缺少保存的字形，请重新输入。');
 if(raw.target!=null){
  if(style!=='dust-wash'||typeof raw.target!=='string'||!idPattern.test(raw.target))throw Error('冲洗目标图层无效。');
  scene.target=raw.target;
 }
 return scene;
}

export function sceneOverlayRule(surface,effect){
 return surface.masks?.find(mask=>mask.id===effect?.maskRef)?.items.find(rule=>rule.type===SCENE_OVERLAY_RULE)??null;
}

export function sceneOverlayMembers(surface,instance){
 const members=[];
 for(const effect of surface.effects){
  const rule=sceneOverlayRule(surface,effect);
  if(rule?.scene.instance===instance)members.push({effect,rule});
 }
 return members;
}

export function sceneTargetChoices(surface,effectId){
 const at=surface.effects.findIndex(effect=>effect.id===effectId);
 return at<0?[]:surface.effects.slice(0,at).filter(effect=>effect.type==='dust');
}

export function sceneOverlayTarget(surface,effect,scene){
 const possible=sceneTargetChoices(surface,effect.id);
 return scene.target?possible.find(target=>target.id===scene.target):possible.at(-1);
}

