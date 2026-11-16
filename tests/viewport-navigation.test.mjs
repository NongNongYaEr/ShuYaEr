import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { OrbitControls } from '../web/vendor/OrbitControls.js';
import { createViewportNavigationFrame, viewportNavigationAction } from '../web/viewport-navigation.js';

function fixture() {
  const camera = new PerspectiveCamera(38, 1.6, .01, 100);
  camera.position.set(0, 0, 6);
  const controls = new OrbitControls(camera);
  controls.domElement = {
    clientWidth:800, clientHeight:500,
    getBoundingClientRect:()=>({left:0,top:0,width:800,height:500}),
  };
  controls.enableDamping = true;
  controls.zoomToCursor = true;
  return {camera,controls,frame:createViewportNavigationFrame(controls)};
}

test('main viewport consumes the latest drag input once and settles without idle camera recomputation', () => {
  const {camera,controls,frame} = fixture();
  const update = controls.update.bind(controls);
  let calls = 0;
  controls.update = (...args) => { calls++; return update(...args); };
  controls._handleMouseDownRotate({clientX:300,clientY:240});
  controls._onPointerMove = event => controls._handleMouseMoveRotate(event);
  for (const x of [305,310,325,350]) frame.queueMove({clientX:x,clientY:240});
  frame.update(1000);
  assert.equal(calls, 1);
  assert.ok(camera.position.x < 0);
  for (let t = 1008; t < 2300; t += 8) frame.update(t);
  assert.ok(Math.abs(camera.position.distanceTo(controls.target)-6) < 1e-8);
  assert.ok(Math.abs(controls.getAzimuthalAngle() + Math.PI / 5) < 1e-8);
  const final = camera.position.toArray(), before = calls;
  for (let t = 2300; t < 2700; t += 8) frame.update(t);
  assert.equal(calls, before);
  assert.deepEqual(camera.position.toArray(), final);
});

test('time-based damping advances equally over the same time at two update rates', () => {
  function turn(rate) {
    const {controls,frame} = fixture();
    frame.update(1000);
    controls._rotateLeft(Math.PI/2);
    for (let i = 1; i <= rate/4; i++) frame.update(1000+i*1000/rate);
    return controls.getAzimuthalAngle();
  }
  assert.ok(Math.abs(turn(60)-turn(144)) < 1e-10);
});

test('batched wheel preserves mixed cursor anchors, direction reversals and zoom limits', () => {
  const batched = fixture(), original = fixture();
  for (const {controls} of [batched,original]) controls.minDistance = 5;
  const wheel = [
    {clientX:590,clientY:220,deltaY:-33,deltaMode:0},
    {clientX:590,clientY:220,deltaY:-33,deltaMode:0},
    {clientX:255,clientY:280,deltaY:35,deltaMode:0},
    {clientX:375,clientY:290,deltaY:-3,deltaMode:1},
  ];
  for (const event of wheel) {
    batched.frame.queueWheel(event);
    original.controls._handleMouseWheel(original.controls._customWheelEvent(event));
  }
  batched.frame.update(1000);
  assert.ok(batched.camera.position.distanceTo(original.camera.position) < 1e-10);
  assert.ok(batched.controls.target.distanceTo(original.controls.target) < 1e-10);
  const before = batched.camera.position.clone();
  batched.frame.queueWheel(wheel[0]);
  batched.controls.enabled = false;
  batched.frame.update(1010);
  batched.controls.enabled = true;
  batched.frame.update(1020);
  assert.ok(batched.camera.position.distanceTo(before) < 1e-12);
  assert.equal(viewportNavigationAction('blender',{button:1,shiftKey:true}), 'pan');
  assert.equal(viewportNavigationAction('max',{button:1,altKey:true}), 'orbit');
  assert.equal(viewportNavigationAction('maya',{button:2,altKey:true}), 'dolly');
});
