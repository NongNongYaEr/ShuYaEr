import {IMAGE_DECAL_STYLE} from './image-decal-rules.js';
import {isSceneProjector,MAX_SCENE_PATH_POINTS,sceneOverlayMembers,sceneOverlaySpec,sceneTargetChoices,validateSceneAnchor} from './scene-overlay-rules.js';
import {rasterizeSceneTextMask,requiresSceneTextMask,validateSceneSprayText} from './scene-overlay-text.js';

const normalizeAngle=value=>((value+180)%360+360)%360-180;

function meshPoint(source,anchor){
 const at=anchor.face*3;
 return [0,1,2].map(axis=>anchor.bary.reduce((sum,value,i)=>sum+source.pos[source.indices[at+i]*3+axis]*value,0));
}

export function createSceneOverlayEditor(api){
 let task=null,guide=false;
 const surface=()=>api.document()?.surface;
 const members=instance=>surface()?sceneOverlayMembers(surface(),instance):[];
 const current=instance=>members(instance)[0]?.rule.scene;
 const locked=instance=>!members(instance).length||members(instance).some(({effect})=>api.locked(effect.id));
 const ready=()=>api.active()&&!api.busy()&&!!api.source()&&!!api.document();
 const valid=()=>task&&ready()&&task.project===api.document().id&&task.source===api.document().resources.source&&!locked(task.instance);
 const hint=()=>!task?null:task.kind==='path'?'按住左键沿树面绘制路径 · 松开保存 · Esc 取消':
  task.kind==='pair'?(task.points.length?'点击树面选终点 · Esc 取消':'点击树面选起点 · Esc 取消'):
  task.kind==='tide'?'点击树面读取水位 · Esc 取消':task.kind==='rotate'?'移动鼠标旋转 · 左键或 Enter 确认 · Esc 取消':
   task.kind==='scale'?'移动鼠标缩放 · 左键或 Enter 确认 · Esc 取消':task.kind==='move'?'点击新的树面位置 · Esc 取消':'点击树面定位 · Esc 取消';

 function showGuide(){
  const renderer=api.renderer();
  if(!renderer?.setDecalPointOverlay)return;
  const state=task?.kind!=='path'&&task&&current(task.instance);
  const a=task?.previewParams?state?.points[0]:task?.previewAnchor;
  if(!state||!isSceneProjector(state.style)||!a){
   if(guide)renderer.setDecalPointOverlay(null);
   guide=false;
   return;
  }
  const p=task.previewParams??state.params;
  guide=true;
  renderer.setDecalPointOverlay({points:[],preview:{enabled:true,anchor:a,widthMeters:p.width*.01,heightMeters:p.height*.01,
   depthMeters:p.depth==null?Math.min(p.width,p.height)*.0035:p.depth*.01,rotation:p.rotation},source:api.source(),actualHeightMeters:api.document().actualHeightMeters});
 }

 function cancel(refresh=true){
  if(!task)return false;
  const path=task.kind==='path',drawing=task.drawing,renderer=api.renderer();
  task=null;
  if(path&&renderer.tool==='mask')renderer.tool='orbit';
  if(path&&drawing)renderer.cancelInteraction?.();
  showGuide();
  if(refresh)api.changed();
  return true;
 }

 function refresh(){
  if(task&&!valid())cancel(false);
  if(task)showGuide();
 }

 function start(instance,action){
  if(!ready()||locked(instance))return false;
  const scene=current(instance),kind=action??sceneOverlaySpec(scene.style).mode;
  if(kind==='auto')return false;
  cancel(false);
  api.prepare(kind==='path');
  const document=api.document(),renderer=api.renderer();
  const origin=renderer.lastPointer?.clientX??renderer.canvas.getBoundingClientRect().left+renderer.canvas.clientWidth*.5;
  task={kind,instance,project:document.id,source:document.resources.source,points:[],origin};
  if(kind==='scale'||kind==='rotate')task.previewParams={...scene.params};
  renderer.canvas.focus({preventScroll:true});
  api.changed();
  return true;
 }

 function commit(mutate){
  if(!valid())return cancel();
  const {instance}=task;
  cancel(false);
  try{api.update(instance,mutate);}catch(error){api.notify(error.message,true);api.changed();}
  return true;
 }

 function replacePoints(points){
  return commit(scene=>{scene.points=points;scene.source=points.length?api.document().resources.source:null;});
 }

 function pick(hit){
  if(!task||['path','rotate','scale'].includes(task.kind))return false;
  if(!valid())return cancel();
  try{
   const anchor=validateSceneAnchor(hit);
   if(task.kind==='tide'){
    const mesh=api.source(),y=meshPoint(mesh,anchor)[1];
    const height=Math.max(0,Math.min(200,(y-mesh.min[1])/mesh.height*api.document().actualHeightMeters));
    return commit(scene=>{scene.params.height=height;});
   }
   if(task.kind==='pair'&&!task.points.length){task.points.push(anchor);api.changed();return true;}
   if(task.kind==='pair'){
    const a=meshPoint(api.source(),task.points[0]),b=meshPoint(api.source(),anchor);
    if(Math.hypot(...a.map((v,i)=>v-b[i]))<api.source().height*1e-6){api.notify('终点需要与起点分开。',true);return true;}
   }
   return replacePoints([...task.points,anchor]);
  }catch(error){api.notify(error.message,true);return true;}
 }

 function paintStart(){
  if(task?.kind!=='path')return false;
  if(!valid())return cancel();
  task.drawing=true;
  task.points=[];
  task.last=null;
  task.spacing=Math.max(.002,(current(task.instance).params.width??current(task.instance).params.size??8)*.001);
  return true;
 }

 function paint(hit){
  if(task?.kind!=='path')return false;
  if(!valid())return cancel();
  if(!task.drawing)return true;
  try{
   const sample=validateSceneAnchor(hit),source=api.source(),position=meshPoint(source,sample);
   const scale=api.document().actualHeightMeters/source.height;
   if(task.last&&Math.hypot(...position.map((v,i)=>v-task.last[i]))*scale<task.spacing)return true;
   if(task.points.length===MAX_SCENE_PATH_POINTS){
    task.points=task.points.filter((_,i)=>i%2===0);
    task.spacing*=2;
   }
   task.points.push(sample);
   task.last=position;
  }catch(error){api.notify(error.message,true);}
  return true;
 }

 function paintEnd(){
  if(task?.kind!=='path')return false;
  task.drawing=false;
  return task.points.length?replacePoints(task.points):cancel();
 }

 function updateTransform(pointer){
  if(!valid()||!task.previewParams)return;
  const scene=current(task.instance),spec=sceneOverlaySpec(scene.style),dx=pointer.clientX-task.origin;
  if(task.kind==='rotate')task.previewParams.rotation=normalizeAngle(scene.params.rotation+dx*.45);
  else{
   const range=key=>[spec.fields[key].min/scene.params[key],spec.fields[key].max/scene.params[key]];
   const [lowWidth,highWidth]=range('width'),[lowHeight,highHeight]=range('height');
   const factor=Math.max(lowWidth,lowHeight,Math.min(highWidth,highHeight,Math.exp(dx*.006)));
   for(const key of ['width','height'])task.previewParams[key]=scene.params[key]*factor;
  }
  showGuide();
 }

 function confirmTransform(){
  if(!task?.previewParams)return false;
  const params=task.previewParams;
  return commit(scene=>{scene.params=params;});
 }

 function pointerAction(event){
  if(!task)return false;
  if(event.button===2){event.preventDefault();return cancel();}
  if(task.previewParams&&event.button===0){event.preventDefault();updateTransform(event);return confirmTransform();}
  return false;
 }

 function pointerMotion(event){
  if(!task||event.buttons||!valid())return false;
  if(task.previewParams){updateTransform(event);return true;}
  if(task.kind==='move'||task.kind==='point'&&isSceneProjector(current(task.instance).style)){
   task.previewAnchor=api.renderer().pick(event.clientX,event.clientY,{accelerated:true});
   showGuide();
  }
  return false;
 }

 function pointerLeave(){
  if(task?.previewAnchor){task.previewAnchor=null;showGuide();}
 }

 function key(event,inViewport){
  if(event.ctrlKey||event.metaKey||event.altKey)return false;
  const letter=event.key.toLowerCase();
  if(task&&letter==='escape')return cancel();
  if(task?.previewParams&&letter==='enter')return confirmTransform();
  if(!inViewport||event.shiftKey||!['g','r','s'].includes(letter))return false;
  const scene=api.selected();
  if(!isSceneProjector(scene?.style)||!scene.points.length||!ready()||locked(scene.instance))return false;
  if(!event.repeat)start(scene.instance,{g:'move',r:'rotate',s:'scale'}[letter]);
  return true;
 }

 function render(scene,parent){
  const spec=sceneOverlaySpec(scene.style),readonly=locked(scene.instance),mode=spec.mode;
  const pane=api.section('scene-overlay-'+scene.instance,spec.name,true,parent);
  pane.dataset.sceneOverlay=scene.style;
  if(scene.style===IMAGE_DECAL_STYLE&&api.imageURL){
   const {hash,name,width,height}=scene.image;
   const url=api.imageURL(hash);
   if(url){
    const preview=document.createElement('img');
    preview.src=url;
    preview.alt=name;
    preview.className='studio-image-decal-preview';
    preview.draggable=false;
    pane.append(preview);
   }
   const size=document.createElement('p'),tile=api.renderer()?.imageDecalRects?.get(hash);
   size.className='surface-note';
   size.dataset.imageDecalSize='';
   size.textContent=`源图 ${width} × ${height} px`;
   if(tile&&(tile[2]!==width||tile[3]!==height))size.textContent+=` · 当前投射 ${tile[2]} × ${tile[3]} px`;
   pane.append(size);
  }
  for(const [key,field]of Object.entries(spec.fields)){
   const set=(value,commit=true)=>{
    const text=field.kind==='text'?validateSceneSprayText(value,field.maxLength):null;
    const textMask=text!=null&&requiresSceneTextMask(text)?rasterizeSceneTextMask(text):null;
    api.update(scene.instance,record=>{
     record.params[key]=text??value;
     if(field.kind==='text'){
      if(textMask)record.textMask=textMask;
      else delete record.textMask;
     }
    },{commit});
   };
   const input=field.kind==='select'?api.select(pane,field.label,field.options,scene.params[key],set):
    api.field(pane,field.label,scene.params[key],set,{...field,live:false,slider:field.kind==='number'&&field.min===0&&field.max===1});
   input.dataset.sceneParam=key;
   if(field.kind==='text'){
    input.maxLength=256;
    input.title='最多 '+field.maxLength+' 个字符';
    input.dir='auto';
    input.spellcheck=false;
    const finish=input.onkeydown;
    input.onkeydown=event=>{
     if(!event.isComposing&&event.keyCode!==229)finish?.(event);
    };
   }
  }
  if(mode!=='auto'||scene.style==='tide'){
   const count=scene.points.length,actions=document.createElement('div');
   actions.className='studio-quick-actions';
   const label=mode==='path'?(count?'重绘路径':'绘制路径'):mode==='pair'?(count?'重选两点':'选择起点和终点'):
    mode==='point'?(count?'重新定位':'在模型上定位'):'从模型拾取水位';
   const begin=api.button(actions,label,()=>start(scene.instance,scene.style==='tide'?'tide':undefined));
   begin.dataset.scenePlace=mode;
   if(mode==='path'&&count>=3){
    const first=scene.points[0],last=scene.points.at(-1);
    if(first.face!==last.face||first.bary.some((v,i)=>v!==last.bary[i]))api.button(actions,'闭合路径',()=>{
     cancel(false);
     api.update(scene.instance,record=>{record.points=[...record.points.slice(0,MAX_SCENE_PATH_POINTS-1),record.points[0]];});
    });
   }
   if(count)api.button(actions,'清除定位',()=>{
    cancel(false);
    api.update(scene.instance,record=>{record.points=[];record.source=null;});
   });
   pane.append(actions);
   if(mode!=='auto'){
    const status=document.createElement('p');
    status.className='surface-note';
    status.textContent=task?.instance===scene.instance?hint():count?(mode==='path'?count+' 个已采样点':mode==='pair'?'已定位起点和终点':'已定位 · '+(isSceneProjector(scene.style)?'G 移动 / R 旋转 / S 缩放':'可重新定位')):'等待在模型上定位';
    status.dataset.sceneStatus='';
    pane.append(status);
   }
  }
  if(scene.style==='dust-wash'){
   const effect=members(scene.instance)[0]?.effect,choices=sceneTargetChoices(surface(),effect.id);
   const options=[['','自动 · 最近的下层灰尘'],...choices.map(layer=>[layer.id,layer.name])];
   const target=api.select(pane,'冲洗目标',options,scene.target??'',value=>api.update(scene.instance,record=>{
    if(value)record.target=value;
    else delete record.target;
   }));
   target.dataset.sceneWashTarget='';
   if(!choices.length){
    target.disabled=true;
    const note=document.createElement('small');
    note.textContent='下方需要一个灰尘图层。';
    pane.append(note);
   }
  }
  if(readonly)for(const input of pane.querySelectorAll('input,button,select'))input.disabled=true;
 }

 return{start,cancel,refresh,pick,paintStart,paint,paintEnd,pointerAction,pointerMotion,pointerLeave,key,render,
  get hint(){return hint();},get pathReady(){return task?.kind==='path';}};
}
