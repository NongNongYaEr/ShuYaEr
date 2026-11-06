import * as T from './vendor/three.module.min.js';
import {flattenSculptModel,createSculptKernel} from './model-sculpt-kernel.js';
import {sculptTopology} from './model-sculpt-topology.js';

export function createTrunkWeightBrush({host,canvas,camera,controls,root,getState,commit,sample,setRadius,setDrawing,onError}){
 const cursor=document.createElement('div');cursor.className='trunk-weight-cursor';cursor.hidden=true;host.append(cursor);
 const abort=new AbortController(),options={capture:true,signal:abort.signal},caster=new T.Raycaster();
 const dialog=host.closest('dialog');
 let surface=null,stroke=null,last=null,frame=0,pending=null;
 const consume=event=>{event.preventDefault();event.stopImmediatePropagation();};

 function getSurface(model){
  if(surface?.primitives!==model.primitives){
   const input=flattenSculptModel(model.primitives),topology=sculptTopology(input.position,input.index);
   surface={primitives:model.primitives,input,topology,kernel:createSculptKernel(input,topology)};
  }
  return surface;
 }
 function showCursor(point,state){
  const rect=host.getBoundingClientRect();
  cursor.hidden=!point||!state?.enabled||point.x<rect.left||point.y<rect.top||point.x>rect.right||point.y>rect.bottom;
  if(cursor.hidden)return;
  Object.assign(cursor.style,{left:`${point.x-rect.left}px`,top:`${point.y-rect.top}px`,width:`${state.radius*2}px`,height:`${state.radius*2}px`});
 }
 function hit(point,state){
  const rect=host.getBoundingClientRect(),{kernel}=getSurface(state.model);
  caster.setFromCamera(new T.Vector2((point.x-rect.left)/rect.width*2-1,1-(point.y-rect.top)/rect.height*2),camera);
  const inverse=root.matrixWorld.clone().invert(),ray=caster.ray.clone().applyMatrix4(inverse),origin=ray.origin.toArray();
  const result=kernel.raycast(origin,ray.direction.toArray());
  if(!result)return null;
  const position=new T.Vector3(...result.point),world=position.clone().applyMatrix4(root.matrixWorld);
  const depth=world.clone().sub(camera.position).dot(camera.getWorldDirection(new T.Vector3()));
  const radius=2*depth*Math.tan(T.MathUtils.degToRad(camera.fov/2))*state.radius/rect.height*new T.Vector3().setFromMatrixScale(inverse).x;
  return {...result,origin,radius};
 }
 function dab(point,state){
  const target=hit(point,state);if(!target)return;
  const {kernel}=surface;
  const towardEye=new T.Vector3(...target.origin).sub(new T.Vector3(...target.point)).normalize().toArray();
  for(const {g} of kernel.region(target.vertex,target.point,target.radius,{front:towardEye})){
   if(stroke.groups.has(g))continue;
   const vector=new T.Vector3(...kernel.pos(g)).sub(new T.Vector3(...target.origin)),distance=vector.length();
   if(distance>0&&kernel.occluded(target.origin,vector.multiplyScalar(1/distance).toArray(),distance-Math.max(1e-7,target.radius*.015)))continue;
   stroke.groups.add(g);
  }
 }
 function paint(){
  frame=0;if(!stroke||!pending)return;
  const point=pending;pending=null;
  const {state,previous}=stroke;
  const distance=Math.hypot(point.x-previous.x,point.y-previous.y),steps=Math.min(8,Math.max(1,Math.ceil(distance/Math.max(2,state.radius*.45))));
  for(let i=1;i<=steps;i++)dab({x:T.MathUtils.lerp(previous.x,point.x,i/steps),y:T.MathUtils.lerp(previous.y,point.y,i/steps)},state);
  stroke.previous=point;
 }
 function end(apply){
  if(!stroke)return;
  cancelAnimationFrame(frame);if(apply)paint();frame=0;pending=null;
  const current=stroke;stroke=null;controls.enabled=current.enabled;
  if(canvas.hasPointerCapture(current.id))canvas.releasePointerCapture(current.id);
  setDrawing(false);
  if(!apply||!current.groups.size)return;
  const {input,topology}=surface,vertices=new Map();
  for(const group of current.groups)for(let k=topology.membersAt[group];k<topology.membersAt[group+1];k++){
   const vertex=topology.members[k],range=input.ranges.find(r=>vertex>=r.start&&vertex<r.start+r.count);
   if(!vertices.has(range.id))vertices.set(range.id,new Map());
   vertices.get(range.id).set(vertex-range.start,current.target);
  }
  commit(vertices);
 }
 function down(event){
  const state=getState();if(!state?.enabled||event.button!==0||stroke)return;
  consume(event);canvas.focus({preventScroll:true});
  last={x:event.clientX,y:event.clientY};showCursor(last,state);
  try{
   if(event.ctrlKey||event.metaKey){
    const target=hit(last,state);if(!target)return;
    const range=surface.input.ranges.find(r=>target.vertex>=r.start&&target.vertex<r.start+r.count);
    sample(range.id,target.vertex-range.start);return;
   }
   getSurface(state.model);
   stroke={id:event.pointerId,enabled:controls.enabled,state,previous:last,groups:new Set(),target:event.shiftKey?null:state.target};
   controls.enabled=false;setDrawing(true);canvas.setPointerCapture(event.pointerId);dab(last,state);
  }catch(error){end(false);onError(error.message);}
 }
 canvas.addEventListener('pointerdown',down,options);
 canvas.addEventListener('pointermove',event=>{
  last={x:event.clientX,y:event.clientY};showCursor(last,getState());
  if(stroke?.id!==event.pointerId)return;
  consume(event);pending=last;if(!frame)frame=requestAnimationFrame(()=>{try{paint();}catch(error){end(false);onError(error.message);}});
 },options);
 canvas.addEventListener('pointerup',event=>{
  if(stroke?.id!==event.pointerId)return;
  consume(event);pending={x:event.clientX,y:event.clientY};
  try{end(true);}catch(error){end(false);onError(error.message);}
 },options);
 canvas.addEventListener('pointerleave',()=>{last=null;cursor.hidden=true;},options);
 for(const event of ['pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>end(false),options);
 window.addEventListener('blur',()=>{end(false);cursor.hidden=true;},options);
 dialog.addEventListener('keydown',event=>{
  const state=getState();if(!state?.enabled||event.target!==canvas)return;
  if(event.key==='Escape'&&stroke){consume(event);end(false);}
  if(!stroke&&['[',']'].includes(event.key)){
   consume(event);setRadius(state.radius+(event.key==='['?-5:5));showCursor(last,getState());
  }
 },options);
 return {refresh(){showCursor(last,getState());},get active(){return !!stroke;},reset(){end(false);surface=null;cursor.hidden=true;},dispose(){end(false);abort.abort();cursor.remove();}};
}
