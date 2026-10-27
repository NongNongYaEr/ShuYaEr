import {MOUSE} from 'three';

export const VIEWPORT_NAVIGATION_HINT='中键旋转 · Shift＋中键平移 · 滚轮缩放';

// Keep authoring with the left button and use the editor's navigation everywhere.
// Ctrl/Meta/Shift + middle pan through OrbitControls' existing modifier handling.
export function configureViewportNavigation(controls){
  controls.enableDamping=true;
  controls.dampingFactor=.07;
  controls.screenSpacePanning=true;
  controls.zoomToCursor=true;
  controls.mouseButtons.LEFT=null;
  controls.mouseButtons.MIDDLE=MOUSE.ROTATE;
  controls.mouseButtons.RIGHT=null;
  const preventMiddle=event=>{if(event.button===1)event.preventDefault();};
  const element=controls.domElement;
  element.addEventListener('pointerdown',preventMiddle);
  element.addEventListener('auxclick',preventMiddle);
  return ()=>{element.removeEventListener('pointerdown',preventMiddle);element.removeEventListener('auxclick',preventMiddle);};
}

// Finish residual deltas before placing a camera for a new model or preset.
// Call before assigning the new camera/target, so fitting remains deterministic.
export function finishViewportNavigation(controls){
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;
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
