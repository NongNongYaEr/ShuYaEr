import {pickCurveHandle} from './curve-handle-picking.js';
import {curvePointBoxHits,projectedCurveHit} from './curve-point-selection.js';

const plusCursor='url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="13" cy="13" r="10" fill="#142820" stroke="#93ffd6" stroke-width="2"/><path d="M7 13h12M13 7v12" stroke="#fff" stroke-width="2"/></svg>')+'") 13 13, crosshair';
export function bindCurvePointInteraction(api){
  const {canvas,controls}=api;let gesture=null,last=null,ctrl=false,hover=null;
  const box=document.createElement('div');box.id='curvePointMarquee';box.hidden=true;box.style.cssText='position:absolute;pointer-events:none;border:1px solid #79d9ff;background:#54bfff20;z-index:105;box-sizing:border-box;';
  const hint=document.createElement('span');hint.id='curveInsertHint';hint.hidden=true;hint.textContent='＋';hint.title='Ctrl + 单击添加控制点';hint.style.cssText='position:absolute;pointer-events:none;width:18px;height:18px;border-radius:50%;border:1px solid #a4ffe0;background:#143327;color:white;text-align:center;font:bold 17px/17px sans-serif;z-index:106;';canvas.parentElement.append(box,hint);
  const consume=e=>{e.preventDefault();e.stopImmediatePropagation();},local=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  function clearHint(){hover=null;hint.hidden=true;delete canvas.dataset.curveInsert;canvas.style.cursor='';}
  function updateHint(){
    clearHint();if(!ctrl||!last||gesture||!api.canBegin())return;
    const context=api.context(),records=api.records();if(!context||context.knots.length>=64||pickCurveHandle(records,last.x,last.y))return;
    api.prepareProjection?.();const hit=projectedCurveHit(context.points,api.project,last.x,last.y);if(!hit)return;
    hover=hit;hint.hidden=false;hint.style.left=canvas.offsetLeft+hit.x+10+'px';hint.style.top=canvas.offsetTop+hit.y-20+'px';canvas.style.cursor=plusCursor;canvas.dataset.curveInsert='true';
  }
  function cancel(){if(!gesture)return false;const g=gesture;gesture=null;box.hidden=true;controls.enabled=g.controls;if(canvas.hasPointerCapture(g.id))canvas.releasePointerCapture(g.id);clearHint();return true;}
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||!api.canBegin())return;last=local(e);ctrl=e.ctrlKey;
    const context=api.context();if(!context)return;const hit=pickCurveHandle(api.records(),last.x,last.y);
    if(hit){
      if((e.shiftKey||e.ctrlKey)&&hit.object.userData.category==='control_point'){
        consume(e);api.select([hit.object.userData.point_index],hit.object.userData.point_index,e.ctrlKey?'TOGGLE':'ADD');
        gesture={id:e.pointerId,owner:context.id,start:last,mode:'CLICK',controls:controls.enabled};controls.enabled=false;canvas.setPointerCapture(e.pointerId);
      }return;
    }
    if(!e.ctrlKey&&!e.shiftKey&&api.gizmoOwns(e))return;
    consume(e);if(e.ctrlKey)api.prepareProjection?.();const insert=e.ctrlKey&&projectedCurveHit(context.points,api.project,last.x,last.y);
    gesture={id:e.pointerId,owner:context.id,start:last,end:last,mode:insert?'INSERT':'PENDING',insert,controls:controls.enabled,operation:e.ctrlKey?'SUBTRACT':e.shiftKey?'ADD':'REPLACE'};
    controls.enabled=false;canvas.setPointerCapture(e.pointerId);clearHint();
  },true);
  canvas.addEventListener('pointermove',e=>{
    last=local(e);ctrl=e.ctrlKey;
    if(!gesture){if(!e.buttons)updateHint();return;}
    if(gesture.id!==e.pointerId)return;consume(e);gesture.end=last;
    if(gesture.mode==='CLICK')return;
    if(Math.hypot(last.x-gesture.start.x,last.y-gesture.start.y)>=4)gesture.mode='BOX';
    if(gesture.mode==='BOX'){
      const a=gesture.start,b=last;box.hidden=false;box.style.left=canvas.offsetLeft+Math.min(a.x,b.x)+'px';box.style.top=canvas.offsetTop+Math.min(a.y,b.y)+'px';box.style.width=Math.abs(a.x-b.x)+'px';box.style.height=Math.abs(a.y-b.y)+'px';
    }
  },true);
  canvas.addEventListener('pointerup',e=>{
    if(!gesture||gesture.id!==e.pointerId||e.button!==0)return;consume(e);const g=gesture,context=api.context();cancel();
    if(!context||context.id!==g.owner)return;
    if(g.mode==='BOX')api.select(curvePointBoxHits(api.records(),g.start,local(e)),null,g.operation);
    else if(g.mode==='INSERT')api.insert(g.insert);
    else if(g.mode==='PENDING')api.click(e);
  },true);
  canvas.addEventListener('pointerleave',()=>{last=null;clearHint();});
  canvas.addEventListener('pointercancel',cancel,true);canvas.addEventListener('lostpointercapture',cancel,true);
  window.addEventListener('keydown',e=>{if(e.key==='Control'){ctrl=true;updateHint();}if(e.key==='Escape'&&gesture){consume(e);cancel();api.status('已取消控制点框选','ready');}},true);
  window.addEventListener('keyup',e=>{if(e.key==='Control'){ctrl=false;clearHint();}},true);
  window.addEventListener('blur',()=>{cancel();ctrl=false;last=null;clearHint();});
  return {cancel,get active(){return !!gesture;},get hovering(){return !!hover;},clear:clearHint};
}
