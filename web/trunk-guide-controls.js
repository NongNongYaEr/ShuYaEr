import * as T from './vendor/three.module.min.js';
import {guidePointKey,guidePointsInRectangle} from './trunk-guide-selection.js';

export function createTrunkGuideControls({host,camera,controls,getState,select,selectMany,selectTargets,pickAttachment,isVisible,setSelectionMode,begin,refreshView,onError,canBox=()=>true}){
 const layer=document.createElement('div');layer.className='trunk-guide-controls';layer.setAttribute('aria-label','控制骨架点');host.append(layer);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('trunk-guide-lines');svg.setAttribute('aria-hidden','true');layer.append(svg);
 const rectangle=document.createElement('div');rectangle.className='trunk-guide-rectangle';rectangle.hidden=true;rectangle.innerHTML='<span></span>';layer.append(rectangle);
 const nodes=new Map(),lines=new Map();
 let active=null,frame=0,disposed=false,swallow=null,blockContext=false,segments=[],projectedPoints=[],hover=null,previous=null;
 const consume=e=>{e.preventDefault();e.stopImmediatePropagation();},operation=e=>e.ctrlKey||e.metaKey?'subtract':e.shiftKey?'add':'replace';
 const attribute=(node,key,value)=>{if(node.getAttribute(key)!==String(value))node.setAttribute(key,String(value));};
 function planePoint(pointer,plane){const r=host.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((pointer.x-r.left)/r.width*2-1,1-(pointer.y-r.top)/r.height*2),camera);return ray.ray.intersectPlane(plane,new T.Vector3());}
 function segmentPoint(s,t){
  const u=t*s.a.w/((1-t)*s.b.w+t*s.a.w);
  return s.start.map((v,i)=>v+(s.end[i]-v)*u);
 }
 const occluded=()=>onError('这处骨架被前方木干挡住。开启「透选」后可以选中。');
 function segmentAt(x,y,state,report=false){
  const hits=[];
  for(const s of segments){
   const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,length=dx*dx+dy*dy;
   if(length<1e-6)continue;
   const t=T.MathUtils.clamp(((x-s.a.x)*dx+(y-s.a.y)*dy)/length,0,1);
   const distance=Math.hypot(x-s.a.x-t*dx,y-s.a.y-t*dy);
   if(distance<=8)hits.push({...s,distance,t,depth:s.a.z+(s.b.z-s.a.z)*t});
  }
  hits.sort((a,b)=>Math.abs(a.distance-b.distance)>2?a.distance-b.distance:a.depth-b.depth);
  const found=hits.find(s=>state.through||isVisible(segmentPoint(s,s.t)));
  if(report&&!found&&hits.length)occluded();
  return found;
 }
 function segmentInRect(s,r){
  let start=0,end=1;
  for(const [a,b,min,max] of [[s.a.x,s.b.x,r.left,r.right],[s.a.y,s.b.y,r.top,r.bottom]]){
   const d=b-a;
   if(!d){if(a<min||a>max)return null;continue;}
   const x=(min-a)/d,y=(max-a)/d;
   start=Math.max(start,Math.min(x,y));end=Math.min(end,Math.max(x,y));
   if(start>end)return null;
  }
  return (start+end)/2;
 }
 function pointAt(pointer,state,button,radius=13){
  refresh();
  const r=host.getBoundingClientRect(),x=pointer.x-r.left,y=pointer.y-r.top;
  const hits=[];
  for(const point of projectedPoints){
   const distance=Math.hypot(point.x-x,point.y-y);
   if(distance<=radius)hits.push({point,distance,preferred:nodes.get(guidePointKey(point))===button});
  }
  hits.sort((a,b)=>a.distance-b.distance||Number(b.preferred)-Number(a.preferred)||a.point.z-b.point.z);
  return {point:hits.find(({point})=>state.through||isVisible(point.position))?.point,blocked:hits.length>0};
 }
 function refresh(){
  if(disposed)return;
  const state=getState();
  layer.hidden=!state;
  if(!state){previous=null;return;}
  const r=host.getBoundingClientRect();
  camera.updateMatrixWorld(true);
  const renderState=[state.model.guides,state.selection,state.clickOnly?state.selected:state.targets,state.target,state.affected,state.interactive,state.endpointsOnly,state.selectionMode,state.joints,
   state.selected?.guide,state.selected?.index,hover?.guide,hover?.index,r.width,r.height,...camera.matrixWorld.elements,...camera.projectionMatrix.elements];
  if(previous&&renderState.every((value,i)=>value===previous[i]))return;
  previous=renderState;
  const live=new Set(),keys=new Set(state.selection.map(guidePointKey));
  attribute(svg,'viewBox','0 0 '+r.width+' '+r.height);
  layer.classList.toggle('readonly',state.interactive===false);
  layer.classList.toggle('rig-joints',!!state.joints);
  layer.dataset.target=state.target;
  const liveLines=new Set(),targets=new Set(state.targets.map(guidePointKey));
  segments=[];projectedPoints=[];
  for(const guide of state.model.guides){
   liveLines.add(guide.id);let line=lines.get(guide.id);if(!line){line=document.createElementNS(ns,'g');line.dataset.guideLine=guide.id;for(const name of ['outline','base','selection','hover']){const path=document.createElementNS(ns,'path');path.classList.add('trunk-guide-line-'+name);line.append(path);}svg.append(line);lines.set(guide.id,line);}
   const screen=guide.points.map(p=>{
    const v=new T.Vector3(...p).applyMatrix4(camera.matrixWorldInverse),w=-v.z;
    v.applyMatrix4(camera.projectionMatrix);
    return {x:(v.x+1)*r.width/2,y:(1-v.y)*r.height/2,z:v.z,w,visible:v.z>=-1&&v.z<=1};
   });
   let path='',highlight='',hoverPath='';
   for(let i=1;i<screen.length;i++){
    const a=screen[i-1],b=screen[i];if(!a.visible||!b.visible)continue;
    const segment='M'+a.x.toFixed(2)+','+a.y.toFixed(2)+'L'+b.x.toFixed(2)+','+b.y.toFixed(2);
    const index=i-1;
    segments.push({guide:guide.id,index,a,b,start:guide.points[index],end:guide.points[i]});
    path+=segment;
    const targetIndex=state.target==='branch'?0:index;
    if(state.target==='point'?keys.has(guide.id+':'+index)&&keys.has(guide.id+':'+i):targets.has(guide.id+':'+targetIndex))highlight+=segment;
    if(hover?.guide===guide.id&&(state.target==='branch'||hover.index===index))hoverPath+=segment;
   }
   attribute(line.children[0],'d',path);attribute(line.children[1],'d',path);attribute(line.children[2],'d',highlight);attribute(line.children[3],'d',hoverPath);
   line.classList.toggle('active-guide',guide.id===state.selected?.guide);
   line.classList.toggle('delete-guide',!!state.affected?.has(guide.id));
   const showAll=!state.endpointsOnly&&(state.interactive===false||['box','auto'].includes(state.selectionMode)||guide.id===state.selected?.guide||(state.selection||[]).some(p=>p.guide===guide.id));
   for(const index of showAll?guide.points.map((_,i)=>i):[0,guide.points.length-1]){
    const key=guide.id+':'+index;live.add(key);let button=nodes.get(key);if(!button){button=document.createElement('button');button.type='button';button.dataset.guidePoint=String(index);button.dataset.guideId=guide.id;button.innerHTML='<i></i><span></span>';layer.append(button);nodes.set(key,button);}
    const title=(guide.parent?'控制枝 '+guide.id:'主控制枝')+' · '+(index===0?'根点':index===guide.points.length-1?'端点':'控制点 '+index);
    const primary=state.selected?.guide===guide.id&&state.selected.index===index;
    const current=keys.has(key)||state.joints===true&&primary;
    // Inspection picks projected joints on the canvas, after the rotation rings.
    button.disabled=!!state.joints;
    attribute(button,'aria-label',title+(state.joints?'，试转关节':'，拖动移动'));attribute(button,'aria-pressed',String(current));button.title=title+(state.joints?' · 点选后按 R 试转':' · Shift 补选 / Ctrl 减选 · 拖动选区');const caption=(index===0?'根点':index===guide.points.length-1?'端点':'点 '+index)+(current?' · 已选中':'');if(button.querySelector('span').textContent!==caption)button.querySelector('span').textContent=caption;button.classList.toggle('active-guide',guide.id===state.selected?.guide);button.classList.toggle('selected',current);button.classList.toggle('primary',primary);button.classList.toggle('endpoint',index===0||index===guide.points.length-1);
    const p=screen[index];button.hidden=state.target!=='point'&&state.interactive&&!state.joints||!p.visible||p.x<0||p.x>r.width||p.y<0||p.y>r.height;button.style.left=p.x+'px';button.style.top=p.y+'px';
    if(!button.hidden)projectedPoints.push({...p,guide:guide.id,index,position:guide.points[index]});
   }
  }
  for(const [id,line]of lines)if(!liveLines.has(id)){line.remove();lines.delete(id);}for(const [key,button]of nodes)if(!live.has(key)){button.remove();nodes.delete(key);}host.classList.toggle('trunk-box-selecting',state.interactive!==false&&state.selectionMode==='box');
 }
 function boxRect(a){const r=host.getBoundingClientRect(),x=p=>Math.max(0,Math.min(r.width,p.x-r.left)),y=p=>Math.max(0,Math.min(r.height,p.y-r.top));return {left:Math.min(x(a.start),x(a.pointer)),right:Math.max(x(a.start),x(a.pointer)),top:Math.min(y(a.start),y(a.pointer)),bottom:Math.max(y(a.start),y(a.pointer))};}
 function boxItems(a,state,checkDepth){
  const rect=boxRect(a);
  const visible=point=>!checkDepth||state.through||isVisible(point);
  if(state.target==='point'){
   const guides=new Map(state.model.guides.map(g=>[g.id,g]));
   return guidePointsInRectangle(state.model,camera,host.getBoundingClientRect(),rect).filter(p=>visible(guides.get(p.guide).points[p.index]));
  }
  const items=new Map();
  for(const s of segments){
   const t=segmentInRect(s,rect);
   const item={guide:s.guide,index:state.target==='branch'?0:s.index};
   const key=guidePointKey(item);
   if(t!==null&&!items.has(key)&&visible(segmentPoint(s,t)))items.set(key,item);
  }
  return [...items.values()];
 }
 function render(){frame=0;if(!active)return;const a=active;if(a.kind==='box'){const rect=boxRect(a),state=getState();rectangle.hidden=state?.clickOnly||Math.hypot(a.pointer.x-a.start.x,a.pointer.y-a.start.y)<4;Object.assign(rectangle.style,{left:rect.left+'px',top:rect.top+'px',width:rect.right-rect.left+'px',height:rect.bottom-rect.top+'px'});rectangle.querySelector('span').textContent=(a.operation==='subtract'?'减选':a.operation==='add'?'补选':'框选')+' '+({point:'控制点',segment:'骨架段',branch:'控制枝'}[state?.target]||'');return;}
  if(Math.hypot(a.pointer.x-a.start.x,a.pointer.y-a.start.y)<3&&!a.adapter)return;const point=planePoint(a.pointer,a.plane);if(!point)return;if(!a.adapter){a.adapter=begin(a.guide,a.index);if(!a.adapter)return void finish(false);controls.enabled=false;}
  try{a.adapter.update(point.sub(a.grab).add(a.origin).toArray());refreshView();refresh();}catch(error){onError(error.message);finish(false);}
 }
 function finish(commit){if(!active)return false;if(commit)render();if(!active)return true;cancelAnimationFrame(frame);frame=0;const a=active;active=null;controls.enabled=a.enabled;if(a.button.hasPointerCapture(a.id))a.button.releasePointerCapture(a.id);rectangle.hidden=true;
  if(a.kind==='box'){
   const state=getState();
   if(commit&&state){
    const dragged=Math.hypot(a.pointer.x-a.start.x,a.pointer.y-a.start.y)>=4;
    if(dragged&&!state.attaching&&!state.clickOnly){
     const items=boxItems(a,state,true);
     if(!items.length&&!state.through&&boxItems(a,state,false).length)occluded();
     if(state.target==='point')selectMany(items,a.operation);else selectTargets(items,a.operation);
    }else if(!dragged){
     if(state.target==='point'){
      const {point,blocked}=pointAt(a.start,state,a.pointButton);
      if(point)select(point.guide,point.index,a.operation,false);
      else{if(blocked)occluded();if(a.operation==='replace')selectMany([]);}
     }else{
      const joint=state.joints&&pointAt(a.start,state,null,8).point;
      if(joint){
       const guide=state.model.guides.find(g=>g.id===joint.guide);
       selectTargets([{guide:joint.guide,index:Math.min(joint.index,guide.points.length-2)}],a.operation);
      }else{
       const r=host.getBoundingClientRect(),s=segmentAt(a.pointer.x-r.left,a.pointer.y-r.top,state,true);
      if(s&&state.attaching)pickAttachment({guide:s.guide,index:s.index,t:s.t*s.a.w/((1-s.t)*s.b.w+s.t*s.a.w)});
      else if(!state.attaching)selectTargets(s?[{guide:s.guide,index:state.target==='branch'?0:s.index}]:[],a.operation);
      }
     }
    }
   }
   if(state?.selectionMode==='box')setSelectionMode('auto');
  }else if(a.adapter){if(commit)a.adapter.commit();else a.adapter.cancel();}
  else if(commit)select(a.guide,a.index,'replace',false);
  refresh();return true;
 }
 function down(e){const button=e.target.closest?.('[data-guide-point]');if(e.button!==0||!button||!layer.contains(button)||active)return;const state=getState();if(!state||state.interactive===false)return;consume(e);
  const start={x:e.clientX,y:e.clientY},{point,blocked}=pointAt(start,state,button);
  if(!point){if(operation(e)==='replace')selectMany([]);if(blocked)occluded();return;}
  const {guide,index,position}=point;if(select(guide,index,operation(e),true)===false)return;
  const canvas=host.querySelector('canvas'),origin=new T.Vector3(...position),plane=new T.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new T.Vector3()),origin);active={kind:'point',guide,index,origin,start,pointer:start,plane,grab:planePoint(start,plane)||origin.clone(),enabled:controls.enabled,button:canvas,id:e.pointerId,adapter:null};controls.enabled=false;canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});refresh();
 }
 const boxDown=e=>{
  const canvas=host.querySelector('canvas'),button=e.target.closest?.('[data-guide-point]');
  if(e.button!==0||active||e.target!==canvas&&!button)return;
  const state=getState(),mode=operation(e);
  if(!state||state.interactive===false||button&&mode==='replace'&&state.selectionMode!=='box'||!canBox(e))return;
  consume(e);
  const start={x:e.clientX,y:e.clientY};
  active={kind:'box',start,pointer:start,operation:mode,enabled:controls.enabled,button:canvas,id:e.pointerId,pointButton:button};
  controls.enabled=false;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);render();
 };
 const move=e=>{
  if(!active){
   const state=getState(),r=host.getBoundingClientRect();
   hover=state?.interactive&&state.target!=='point'&&!e.buttons&&host.contains(e.target)?segmentAt(e.clientX-r.left,e.clientY-r.top,state):null;
   return;
  }
  if(active.id!==e.pointerId)return;
  consume(e);active.pointer={x:e.clientX,y:e.clientY};if(!frame)frame=requestAnimationFrame(render);
 },up=e=>{if(swallow===e.pointerId){swallow=null;return consume(e);}if(active?.id===e.pointerId&&e.button===0){consume(e);active.pointer={x:e.clientX,y:e.clientY};finish(true);}},cancel=()=>finish(false),key=e=>{if(!active)return;if(e.key==='Escape'){consume(e);finish(false);}else if(e.key==='Enter'){consume(e);finish(true);}},right=e=>{if(active&&e.button===2){consume(e);swallow=e.pointerId;blockContext=true;finish(false);}},context=e=>{if(active||blockContext){consume(e);blockContext=false;finish(false);}};
 layer.addEventListener('pointerdown',down);host.addEventListener('pointerdown',boxDown,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointerdown',right,true);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);host.addEventListener('contextmenu',context,true);host.closest('dialog').addEventListener('keydown',key,true);
 return {refresh,cancel,get active(){return !!active;},dispose(){cancel();disposed=true;cancelAnimationFrame(frame);layer.removeEventListener('pointerdown',down);host.removeEventListener('pointerdown',boxDown,true);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointerdown',right,true);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);host.removeEventListener('contextmenu',context,true);host.closest('dialog').removeEventListener('keydown',key,true);host.classList.remove('trunk-box-selecting');layer.remove();}};
}
