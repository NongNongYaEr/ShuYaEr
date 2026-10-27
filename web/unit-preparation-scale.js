import * as THREE from './vendor/three.module.min.js';
import {keyboardTransformDelta} from './keyboard-transform.js';

export function createPreparationScaleControl({host,camera,controls,getMesh,begin,onError}){
  const dialog=host.closest('dialog'),canvas=host.querySelector('canvas'),layer=document.createElement('div');layer.className='pup-scale-gizmo';layer.hidden=true;
  layer.innerHTML='<svg aria-hidden="true"><line data-scale-line/></svg><span data-scale-base title="固定底点，缩放时保持不动" aria-label="固定底点"></span><button type="button" data-scale-top aria-label="拖动上点，围绕底点等比缩放" title="拖动等比缩放；也可按 S"><i></i></button><span data-scale-label>拖动缩放 · S</span><div data-scale-hud role="status" hidden></div>';
  host.append(layer);const top=layer.querySelector('[data-scale-top]'),base=layer.querySelector('[data-scale-base]'),label=layer.querySelector('[data-scale-label]'),line=layer.querySelector('line'),hud=layer.querySelector('[data-scale-hud]');
  canvas.tabIndex=0;canvas.setAttribute('aria-label','叶花果三维视窗，S 等比缩放');
  let active=null,lastPointer=null,frame=0,swallow=null,blockContext=false,navigating=false,disposed=false;
  const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
  function points(){const mesh=getMesh();if(!mesh)return null;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();mesh.updateMatrixWorld(true);camera.updateMatrixWorld(true);const r=host.getBoundingClientRect(),origin=new THREE.Vector3().applyMatrix4(mesh.matrixWorld),tip=new THREE.Vector3(0,Math.max(1e-8,mesh.geometry.boundingBox.max.y),0).applyMatrix4(mesh.matrixWorld),project=p=>{const q=p.clone().project(camera);return {x:r.left+(q.x+1)*r.width/2,y:r.top+(1-q.y)*r.height/2,z:q.z};};return {mesh,r,origin,tip,a:project(origin),b:project(tip)};}
  function refresh(){
    if(disposed)return;const p=points();layer.hidden=!p;if(!p)return;const dx=p.b.x-p.a.x,dy=p.b.y-p.a.y,length=Math.hypot(dx,dy),factor=length<45?45/Math.max(length,1):1;
    let x=p.a.x-p.r.left+(length>1?dx*factor:0),y=p.a.y-p.r.top+(length>1?dy*factor:-45);x=Math.max(16,Math.min(p.r.width-16,x));y=Math.max(35,Math.min(p.r.height-16,y));
    const bx=p.a.x-p.r.left,by=p.a.y-p.r.top;base.style.left=bx+'px';base.style.top=by+'px';top.style.left=x+'px';top.style.top=y+'px';label.style.left=x+'px';label.style.top=Math.max(12,y-25)+'px';
    line.setAttribute('x1',bx);line.setAttribute('y1',by);line.setAttribute('x2',x);line.setAttribute('y2',y);layer.classList.toggle('scaling',!!active);hud.hidden=!active;
  }
  function pointerOnPlane(pointer,plane){const r=host.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((pointer.x-r.left)/r.width*2-1,1-(pointer.y-r.top)/r.height*2),camera);return ray.ray.intersectPlane(plane,new THREE.Vector3());}
  function render(){
    frame=0;if(!active)return;if(!active.adapter.valid()||!getMesh()){finish(false);return;}const a=active;let amount=1,invalid=false,limited=false;
    if(a.kind==='handle'){
      const hit=a.plane&&pointerOnPlane(a.pointer,a.plane);amount=hit&&a.grab!=null?1+hit.clone().sub(a.origin).dot(a.axis)/a.height-a.grab/a.height:1+((a.pointer.x-a.start.x)*a.screenAxis.x+(a.pointer.y-a.start.y)*a.screenAxis.y)/a.screenAxis.lengthSq();
    }else{
      const numeric=a.numeric.trim()?Number(a.numeric):null;invalid=!!a.numeric.trim()&&(!Number.isFinite(numeric)||numeric<=0);
      if(!invalid)amount=keyboardTransformDelta({mode:'scale',numeric:a.numeric,start:a.start,pointer:a.pointer,center:new THREE.Vector3(),camera,modelRoot:getMesh(),bounds:host.getBoundingClientRect(),uniform:true,scaleRange:[.001/a.adapter.initialSize,1/a.adapter.initialSize]}).amount;
      else amount=a.amount;
    }
    const rawSize=a.adapter.initialSize*amount,size=THREE.MathUtils.clamp(rawSize,.001,1);limited=Math.abs(size-rawSize)>1e-10||(a.kind==='keyboard'&&a.numeric.trim()&&!invalid&&Math.abs(Number(a.numeric)-size/a.adapter.initialSize)>1e-8);a.invalid=invalid;a.amount=size/a.adapter.initialSize;
    if(!invalid)a.adapter.update(size);refresh();hud.textContent=(a.kind==='handle'?'拖动等比缩放':'S 等比缩放')+' · 本次 ×'+a.amount.toFixed(3)+' · 最大边 '+(size*100).toFixed(2)+' cm\n'+(invalid?'请输入大于 0 的倍率；Esc 取消':a.kind==='handle'?'松开确认 · Esc／右键取消':'移动鼠标或输入倍率 · 左键／Enter 确认 · Esc／右键取消')+(limited?'\n已到大小边界：0.1～100 cm':'');hud.classList.toggle('invalid',invalid);
  }
  function finish(commit){
    if(!active)return false;if(commit){render();if(!active)return true;if(active.invalid)return true;}cancelAnimationFrame(frame);frame=0;const a=active;active=null;controls.enabled=a.controlsEnabled;
    if(a.pointerId!=null&&top.hasPointerCapture(a.pointerId))top.releasePointerCapture(a.pointerId);hud.hidden=true;layer.classList.remove('scaling');if(commit&&a.adapter.valid())a.adapter.commit();else a.adapter.cancel();refresh();return true;
  }
  function start(kind,event=null){
    if(active||disposed)return false;if(navigating){onError('先松开中键，再开始等比缩放');return false;}const adapter=begin(kind);if(!adapter)return false;const p=points();if(!p){adapter.cancel();return false;}
    const initial=event?{x:event.clientX,y:event.clientY}:lastPointer||{x:p.b.x,y:p.b.y},axis=p.tip.clone().sub(p.origin).normalize(),screenAxis=new THREE.Vector2(p.b.x-p.a.x,p.b.y-p.a.y);let plane=null,grab=null;
    if(screenAxis.length()>=30){const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),normal=new THREE.Vector3().crossVectors(axis,right).normalize();plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,p.origin);const hit=pointerOnPlane(initial,plane);grab=hit?.sub(p.origin).dot(axis)??null;}else screenAxis.set(0,-80);
    active={adapter,kind,start:initial,pointer:initial,numeric:'',amount:1,invalid:false,origin:p.origin,axis,height:p.tip.distanceTo(p.origin),plane,grab,screenAxis,controlsEnabled:controls.enabled,pointerId:kind==='handle'?event.pointerId:null};
    controls.enabled=false;canvas.focus({preventScroll:true});if(kind==='handle')top.setPointerCapture(event.pointerId);render();return true;
  }
  function down(e){
    lastPointer={x:e.clientX,y:e.clientY};if(active){if(e.target.closest?.('[data-scale-mode]'))return;if(!host.contains(e.target)){finish(false);return;}consume(e);if(e.button===2){blockContext=true;swallow=e.pointerId;finish(false);}else if(e.button===0&&active.kind==='keyboard'){swallow=e.pointerId;finish(true);}return;}
    if(e.button===0&&e.target.closest?.('[data-scale-top]')){consume(e);start('handle',e);return;}if(e.button===0&&e.target===canvas)canvas.focus({preventScroll:true});
  }
  function move(e){lastPointer={x:e.clientX,y:e.clientY};if(!active)return;consume(e);active.pointer=lastPointer;if(!frame)frame=requestAnimationFrame(render);}
  function up(e){if(swallow===e.pointerId){swallow=null;consume(e);return;}if(active?.kind==='handle'&&e.pointerId===active.pointerId){consume(e);active.pointer={x:e.clientX,y:e.clientY};finish(true);}}
  function key(e){
    const typing=e.isComposing||e.target?.isContentEditable||e.target?.matches?.('input,textarea,select');
    if(active){if(typing){finish(false);return;}if(['Control','Meta','Alt','Shift'].includes(e.key)){consume(e);return;}if(e.ctrlKey||e.metaKey||e.altKey){finish(false);if(e.key.toLowerCase()==='z')consume(e);return;}consume(e);if(e.key==='Escape')return void finish(false);if(e.key==='Enter')return void finish(true);if(active.kind!=='keyboard')return;if(/^[0-9.\-+]$/.test(e.key)){const n=active.numeric+e.key;if(/^[+-]?(?:[0-9]*\.?[0-9]*)$/.test(n))active.numeric=n;}else if(e.key==='Backspace')active.numeric=active.numeric.slice(0,-1);else return;render();return;}
    if(!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!e.repeat&&e.key.toLowerCase()==='s'&&start('keyboard'))consume(e);
  }
  function context(e){if(active||blockContext){consume(e);blockContext=false;finish(false);}}
  const cancel=()=>finish(false),navigationStart=()=>navigating=true,navigationEnd=()=>navigating=false;
  const click=e=>{if(e.detail===0&&!active)start('keyboard');};top.addEventListener('click',click);
  const wheel=e=>{if(active)consume(e);};const lost=e=>{if(active?.pointerId===e.pointerId)finish(false);};
  window.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',cancel,true);window.addEventListener('contextmenu',context,true);window.addEventListener('blur',cancel);window.addEventListener('resize',cancel,true);dialog.addEventListener('keydown',key,true);host.addEventListener('wheel',wheel,{capture:true,passive:false});top.addEventListener('lostpointercapture',lost);controls.addEventListener('start',navigationStart);controls.addEventListener('end',navigationEnd);
  return {refresh,start:()=>start('keyboard'),cancel,get active(){return !!active;},dispose(){cancel();disposed=true;cancelAnimationFrame(frame);window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',cancel,true);window.removeEventListener('contextmenu',context,true);window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel,true);dialog.removeEventListener('keydown',key,true);host.removeEventListener('wheel',wheel,true);top.removeEventListener('lostpointercapture',lost);top.removeEventListener('click',click);controls.removeEventListener('start',navigationStart);controls.removeEventListener('end',navigationEnd);layer.remove();}};
}
