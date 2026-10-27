import test from 'node:test';
import assert from 'node:assert/strict';
import {trunkContourShortcut} from '../web/trunk-contour-shortcuts.js';
import {trunkDetailShortcut} from '../web/trunk-detail-controls.js';
import {insertTrunkDetailProfilePointAfter,TRUNK_DETAIL_PROFILES,createTrunkDetailProfileSampler} from '../web/trunk-detail-profile.js';
const contour={enabled:true,focused:true},detail={enabled:true};

test('contour extras require graph focus and preserve typing, dialogs and composition',()=>{
  for(const e of [{key:'a',ctrlKey:true},{key:'1'},{key:'+'},{key:'o'}]){
    assert.equal(trunkContourShortcut(e),null);
    for(const patch of [{focused:false},{enabled:false},{typing:true},{dialogOpen:true}])assert.equal(trunkContourShortcut(e,{...contour,...patch}),null);
    for(const field of ['isComposing','defaultPrevented','metaKey','altKey'])assert.equal(trunkContourShortcut({...e,[field]:true},contour),null);
  }
});
test('contour modifiers claim only scoped selection and preserve saving and browser zoom',()=>{
  for(const [key,action] of [['a','ALL'],['d','CLEAR'],['i','INVERT']]){assert.equal(trunkContourShortcut({key,ctrlKey:true},contour),action);assert.equal(trunkContourShortcut({key,ctrlKey:true,shiftKey:true},contour),null);}
  for(const key of ['s','z','y','c','v','+','=','-','0'])assert.equal(trunkContourShortcut({key,ctrlKey:true},contour),null);
  assert.equal(trunkContourShortcut({key:'+',shiftKey:true},contour),'ZOOM_IN');
  assert.equal(trunkContourShortcut({key:'h',shiftKey:true},contour),null);
});
test('recognized contour repeats remain claimed so the caller can block conflicting whole-tree routes',()=>{
  for(const [key,action] of [['1','SOFT'],['2','POINT'],['e','EXPAND'],['h','HEIGHT'],['o','OFFSET'],['w','WORLD_POINTS'],['=','ZOOM_IN'],['-','ZOOM_OUT'],['0','FIT']])assert.equal(trunkContourShortcut({key,repeat:true},contour),action);
  assert.equal(trunkContourShortcut({code:'NumpadAdd'},contour),'ZOOM_IN');
});

test('point focus is scoped to the graph and never claims typing or modified shortcuts',()=>{
 assert.equal(trunkContourShortcut({key:'f'},contour),'FOCUS_POINTS');
 assert.equal(trunkContourShortcut({code:'KeyF'},contour),'FOCUS_POINTS');
 for(const patch of [{focused:false},{enabled:false},{typing:true},{dialogOpen:true}])assert.equal(trunkContourShortcut({key:'f'},{...contour,...patch}),null);
 for(const field of ['ctrlKey','metaKey','shiftKey','altKey','isComposing','defaultPrevented'])assert.equal(trunkContourShortcut({key:'f',[field]:true},contour),null);
});
test('new detail actions preserve editing scope, modifiers and repeat guards',()=>{
  const events=[['1','POINT'],['2','PATH'],['3','PAINT'],['Home','FOCUS']].map(([key,action])=>[{key},action]);
  events.push(...[['d','CLEAR'],['i','INVERT']].map(([key,action])=>[{key,ctrlKey:true},action]));
  events.push(...[['r','REDRAW'],['a','REPEAT_PRESET'],['e','ENABLE'],['h','DISABLE']].map(([key,action])=>[{key,shiftKey:true},action]));
  for(const [e,action] of events){assert.equal(trunkDetailShortcut(e,detail),action);for(const patch of [{},{...detail,typing:true},{...detail,dialogOpen:true}])assert.equal(trunkDetailShortcut(e,patch),null);for(const field of ['repeat','isComposing','defaultPrevented','metaKey'])assert.equal(trunkDetailShortcut({...e,[field]:true},detail),null);}
});
test('profile insertion follows the actual selected segment and retains all old points',()=>{
  const p=TRUNK_DETAIL_PROFILES.find(p=>p.id==='ROLLED_EDGE').shape;
  for(const index of [0,2,p.points.length-1]){const next=insertTrunkDetailProfilePointAfter(p,index),i=Math.min(index,p.points.length-2),x=(p.points[i].x+p.points[i+1].x)/2;assert.equal(next.points.length,p.points.length+1);assert.equal(next.points[i+1].x,x);assert.equal(next.points[i+1].y,createTrunkDetailProfileSampler(p)(x));assert.deepEqual(next.points.filter((_,j)=>j!==i+1),p.points);}
  assert.equal(insertTrunkDetailProfilePointAfter(p,-1),null);assert.equal(insertTrunkDetailProfilePointAfter(p,1.5),null);
});
test('profile insertion refuses full or too narrow contours without altering the input',()=>{
  const narrow={version:1,points:[{x:-1,y:0},{x:-.98,y:-1},{x:1,y:0}]},copy=structuredClone(narrow);
  assert.equal(insertTrunkDetailProfilePointAfter(narrow,0),null);assert.deepEqual(narrow,copy);
  const full={version:1,points:Array.from({length:25},(_,i)=>({x:-1+i/12,y:i===0||i===24?0:.5}))};assert.equal(insertTrunkDetailProfilePointAfter(full,12),null);
});
