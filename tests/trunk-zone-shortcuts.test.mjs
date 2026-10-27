import test from 'node:test';
import assert from 'node:assert/strict';
import {trunkWorkflowShortcut} from '../web/trunk-workflow-ui.js';
import {scrubNumber} from '../web/trunk-number-drag.js';

test('workflow shortcuts require the active trunk context and preserve typing and dialogs',()=>{
  const event={altKey:true,key:'2',code:'Digit2'};
  assert.equal(trunkWorkflowShortcut(event,{enabled:true}),'CONTOUR');
  for(const options of [{},{enabled:true,typing:true},{enabled:true,dialogOpen:true}])assert.equal(trunkWorkflowShortcut(event,options),null);
});
test('workflow shortcuts preserve modifier combinations, key repeats and composition',()=>{
  for(const field of ['ctrlKey','metaKey','shiftKey','repeat','isComposing','defaultPrevented'])assert.equal(trunkWorkflowShortcut({altKey:true,key:'3',[field]:true},{enabled:true}),null);
  assert.equal(trunkWorkflowShortcut({key:'1'},{enabled:true}),null);
});
test('physical keys remain consistent across keyboard layouts and mesh has its own route',()=>{
  for(const [code,action] of [['Digit1','SHAPE'],['Digit2','CONTOUR'],['Digit3','DETAIL'],['KeyM','MESH']])assert.equal(trunkWorkflowShortcut({altKey:true,key:'unrelated',code},{enabled:true}),action);
  assert.equal(trunkWorkflowShortcut({altKey:true,key:'M'},{enabled:true}),'MESH');
});
test('scrubbing changes sensitivity without jumping when modifiers change mid gesture',()=>{
  let value=16;value=scrubNumber(value,8,{step:.125});assert.equal(value,17);
  value=scrubNumber(value,8,{step:.125,shift:true});assert.equal(value,22);
  value=scrubNumber(value,-8,{step:.125,alt:true});assert.equal(value,21.9);
});
test('scrubbing reverses immediately after reaching either bound without storing overflow',()=>{
  let value=scrubNumber(98,1000,{step:.125,min:0,max:100});assert.equal(value,100);
  value=scrubNumber(value,-16,{step:.125,min:0,max:100});assert.equal(value,98);
  value=scrubNumber(value,-1000,{step:.125,min:0,max:100});assert.equal(value,0);
  assert.equal(scrubNumber(value,8,{step:.125,min:0,max:100}),1);
});
