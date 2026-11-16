import {MOUSE} from 'three';

export const viewportNavigationPresets=Object.freeze({
  blender:Object.freeze({label:'Blender',orbit:'中键拖动',pan:'Shift＋中键拖动',zoom:'滚轮'}),
  max:Object.freeze({label:'3ds Max',orbit:'Alt＋中键拖动',pan:'中键拖动',zoom:'滚轮'}),
  maya:Object.freeze({label:'Maya',orbit:'Alt＋左键拖动',pan:'Alt＋中键拖动',zoom:'Alt＋右键拖动或滚轮'}),
});

const storageKey='shuyaer.viewportNavigation';
const listeners=new Set();
const validMode=mode=>Object.hasOwn(viewportNavigationPresets,mode)?mode:'blender';
let mode='blender';
try{mode=validMode(globalThis.localStorage?.getItem(storageKey));}catch{}

function hintFor(mode){
  const {orbit,pan,zoom}=viewportNavigationPresets[mode];
  return `旋转 ${orbit} · 平移 ${pan} · 缩放 ${zoom}`;
}
export let VIEWPORT_NAVIGATION_HINT=hintFor(mode);

export function getViewportNavigationMode(){return mode;}

function updateViewportNavigationMode(value,persist=false){
  const next=validMode(value);
  if(next===mode)return;
  mode=next;
  VIEWPORT_NAVIGATION_HINT=hintFor(mode);
  if(persist){
    try{globalThis.localStorage?.setItem(storageKey,mode);}catch{}
  }
  globalThis.document?.querySelectorAll('[data-viewport-navigation-hint]').forEach(node=>{
    node.textContent=VIEWPORT_NAVIGATION_HINT;
  });
  for(const listener of listeners)listener(mode);
}

export function setViewportNavigationMode(value){
  updateViewportNavigationMode(value,true);
}

globalThis.window?.addEventListener('storage',event=>{
  if(event.key===storageKey)updateViewportNavigationMode(event.newValue);
});

export function subscribeViewportNavigation(listener){
  listeners.add(listener);
  listener(mode);
  return ()=>listeners.delete(listener);
}

export function viewportNavigationAction(preset,event){
  if(event.pointerType==='touch')return null;
  if(preset==='maya'){
    if(!event.altKey||event.ctrlKey||event.metaKey)return null;
    return ['orbit','pan','dolly'][event.button]??null;
  }
  if(event.button!==1)return null;
  if(preset==='max')return event.altKey?'orbit':'pan';
  return event.shiftKey||event.ctrlKey||event.metaKey?'pan':'orbit';
}

// The editing tools also receive canvas pointer events. Deliver the camera
// gesture to OrbitControls before those tools can start an edit.
export function configureViewportNavigation(controls,{plainOrbit=false,frame=null}={}){
  controls.enableDamping=true;
  controls.dampingFactor=.07;
  controls.screenSpacePanning=true;
  controls.zoomToCursor=true;
  controls.mouseButtons.LEFT=null;
  controls.mouseButtons.MIDDLE=null;
  controls.mouseButtons.RIGHT=null;
  const element=controls.domElement;
  const document=element.ownerDocument;
  const events=new AbortController();
  const options={capture:true,signal:events.signal};
  let pointer=null,button=null;
  const hit=event=>event.composedPath().includes(element);
  const consume=event=>{event.preventDefault();event.stopImmediatePropagation();};
  document.addEventListener('pointerdown',event=>{
    if(!hit(event)||event.defaultPrevented||pointer!==null)return;
    button=null;
    if(!controls.enabled||event.pointerType==='touch')return;
    const action=viewportNavigationAction(mode,event)||
      (plainOrbit&&mode==='blender'&&event.button===0?'orbit':null);
    if(!action){if(event.button===1)event.preventDefault();return;}
    frame?.flushWheel();
    pointer=event.pointerId;
    button=event.button;
    consume(event);
    const key=['LEFT','MIDDLE','RIGHT'][button];
    // OrbitControls swaps orbit and pan for Shift/Ctrl/Meta. The preset
    // has already resolved those modifiers, so compensate for that swap.
    const swapped=event.shiftKey||event.ctrlKey||event.metaKey;
    controls.mouseButtons[key]=action==='dolly'?MOUSE.DOLLY:
      ((action==='orbit')!==Boolean(swapped)?MOUSE.ROTATE:MOUSE.PAN);
    try{controls._onPointerDown(event);}finally{controls.mouseButtons[key]=null;}
  },options);
  document.addEventListener('pointermove',event=>{
    if(pointer!==event.pointerId)return;
    consume(event);
    if(frame)frame.queueMove(event);
    else controls._onPointerMove(event);
  },options);
  const release=event=>{
    if(pointer!==event.pointerId)return;
    frame?.flushMove(event.type!=='pointerup');
    pointer=null;
    consume(event);
    controls._onPointerUp(event);
  };
  document.addEventListener('pointerup',release,options);
  document.addEventListener('pointercancel',release,options);
  if(frame)element.addEventListener('wheel',event=>{
    if(event.defaultPrevented||!controls.enabled||!controls.enableZoom||controls._pointers.length)return;
    consume(event);
    frame.queueWheel(event);
  },{...options,passive:false});
  for(const type of ['click','dblclick','auxclick','contextmenu']){
    document.addEventListener(type,event=>{
      if(hit(event)&&button!==null&&event.button===button)consume(event);
      else if(type==='auxclick'&&hit(event)&&event.button===1)event.preventDefault();
    },options);
  }
  return ()=>events.abort();
}

// Finish residual deltas before placing a camera for a new model or preset.
// Call before assigning the new camera/target, so fitting remains deterministic.
export function finishViewportNavigation(controls){
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;
}

// Only the main viewport owns a continuous render loop. Batch its input before
// presentation so high-report-rate mice do not advance damping multiple times.
export function createViewportNavigationFrame(controls){
  const camera=controls.object;
  const position=camera.position.clone(),target=controls.target.clone(),up=camera.up.clone();
  const quaternion=camera.quaternion.clone();
  let zoom=camera.zoom,previousTime=null,move=null;
  const wheel=[];
  const remember=()=>{
    position.copy(camera.position);target.copy(controls.target);up.copy(camera.up);
    quaternion.copy(camera.quaternion);zoom=camera.zoom;
  };
  const externalChange=()=>!position.equals(camera.position)||!target.equals(controls.target)||
    !up.equals(camera.up)||!quaternion.equals(camera.quaternion)||zoom!==camera.zoom;
  const hasMotion=()=>controls._sphericalDelta.theta!==0||controls._sphericalDelta.phi!==0||controls._panOffset.lengthSq()>0;
  const settled=()=>Math.abs(controls._sphericalDelta.theta)<1e-5&&Math.abs(controls._sphericalDelta.phi)<1e-5&&
    controls._panOffset.lengthSq()<Math.max(1e-12,camera.position.distanceToSquared(controls.target)*1e-10);
  function flushMove(cancel=false){
    const event=move;move=null;
    if(!event||cancel||!controls.enabled)return false;
    controls._onPointerMove(event);
    return true;
  }
  function flushWheel(){
    if(!wheel.length)return false;
    const batches=wheel.splice(0);
    if(!controls.enabled||!controls.enableZoom)return false;
    // Apply ordered zoom steps at their original cursor anchors without
    // also advancing any remaining rotation/pan once per wheel event.
    const damping=controls.dampingFactor;
    controls.dampingFactor=0;
    controls.dispatchEvent({type:'start'});
    try{for(const event of batches)controls._handleMouseWheel(event);}
    finally{controls.dampingFactor=damping;controls.dispatchEvent({type:'end'});}
    return true;
  }
  return {
    queueMove(event){move=event;},
    queueWheel(event){
      const step=controls._customWheelEvent(event),last=wheel.at(-1);
      if(!step.deltaY)return;
      if(last?.clientX===step.clientX&&last.clientY===step.clientY&&Math.sign(last.deltaY)===Math.sign(step.deltaY))last.deltaY+=step.deltaY;
      else wheel.push(step);
    },
    flushMove,flushWheel,
    update(time){
      const elapsed=previousTime===null?1000/60:Math.max(1,Math.min(40,time-previousTime));
      previousTime=time;
      if(!controls.enabled){move=null;wheel.length=0;return;}
      controls.dampingFactor=1-Math.pow(.5,elapsed/(controls._pointers.length?22:44));
      const wheeled=flushWheel();
      if(!flushMove()){
        if(hasMotion()&&settled())finishViewportNavigation(controls);
        else if(hasMotion()||controls.autoRotate||(!wheeled&&externalChange()))controls.update(elapsed/1000);
      }
      remember();
    },
    finish(){move=null;wheel.length=0;finishViewportNavigation(controls);remember();},
  };
}

// Auxiliary views render on demand. Keep updating after release like the main
// viewport, so a sub-threshold orbit delta cannot reappear during the next pan.
export function createViewportNavigationTicker(controls,request){
  let remaining=0;
  const continueMotion=()=>{remaining=120;request();};
  controls.addEventListener('start',continueMotion);
  controls.addEventListener('end',continueMotion);
  return {
    update(){if(remaining===1)finishViewportNavigation(controls);else controls.update();if(remaining>0){remaining--;request();}},
    dispose(){remaining=0;controls.removeEventListener('start',continueMotion);controls.removeEventListener('end',continueMotion);},
  };
}
