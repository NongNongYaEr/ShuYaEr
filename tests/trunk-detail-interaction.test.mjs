import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrunkDetail } from '../web/trunk-details.js';
import { transformTrunkDetailSelection, trunkDetailShortcut } from '../web/trunk-detail-controls.js';

const enabled={enabled:true};
const detail=(id,t,angle,path=[])=>createTrunkDetail('SCAR',{id,t,angle,path,width:30,height:.12,strength:.25,seed:7});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} ≈ ${b}`);

test('detail commands only operate inside the explicit detail editor',()=>{
  for(const [key,action] of [['a','ADD'],['g','SLIDE'],['r','TURN'],['s','SIZE'],['c','PAINT'],['v','SELECT'],['Delete','REMOVE'],['f','BRUSH_SIZE'],['p','PRESETS']]){
    assert.equal(trunkDetailShortcut({key}),null);
    assert.equal(trunkDetailShortcut({key},enabled),action);
    assert.equal(trunkDetailShortcut({key,repeat:true},enabled),null);
    assert.equal(trunkDetailShortcut({key},{...enabled,typing:true}),null);
    assert.equal(trunkDetailShortcut({key},{...enabled,dialogOpen:true}),null);
  }
  assert.equal(trunkDetailShortcut({key:'n'},enabled),null,'N remains a section-only command');
  assert.equal(trunkDetailShortcut({key:'D',shiftKey:true},enabled),'DUPLICATE');
  assert.equal(trunkDetailShortcut({code:'KeyD',shiftKey:true},enabled),'DUPLICATE');
  assert.equal(trunkDetailShortcut({key:'x',code:'KeyD',shiftKey:true},enabled),null);
  assert.equal(trunkDetailShortcut({key:'F',shiftKey:true},enabled),'STRENGTH');
  assert.equal(trunkDetailShortcut({key:'P',shiftKey:true},enabled),'SAVE_PRESET');
  assert.equal(trunkDetailShortcut({key:'Enter'},enabled),null);
  assert.equal(trunkDetailShortcut({key:'Enter'},{...enabled,active:true}),'CONFIRM');
});

test('detail shortcuts preserve global saving and undo, text input and platform combinations',()=>{
  for(const key of ['s','z','y','c','v','p','Delete','Escape','Enter'])for(const modifier of ['ctrlKey','metaKey'])assert.equal(trunkDetailShortcut({key,[modifier]:true},{...enabled,active:true}),null);
  assert.equal(trunkDetailShortcut({key:'a',ctrlKey:true},enabled),'ALL');
  assert.equal(trunkDetailShortcut({key:'a',ctrlKey:true,shiftKey:true},enabled),null);
  const typing={...enabled,active:true,typing:true};
  assert.equal(trunkDetailShortcut({key:'Escape'},typing),'CANCEL');
  for(const blocker of ['shiftKey','altKey','ctrlKey','metaKey','isComposing','defaultPrevented','repeat'])assert.equal(trunkDetailShortcut({key:'Escape',[blocker]:true},typing),null);
});

test('batch slide clamps the group once, preserving path spacing and every unselected feature',()=>{
  const raw=[detail('a',.2,350,[{t:.15,angle:348},{t:.4,angle:355}]),detail('b',.7,10,[{t:.5,angle:5},{t:.9,angle:15}]),detail('c',.5,90)];
  const source=structuredClone(raw),ids=new Set(['a','b']);
  const output=transformTrunkDetailSelection(raw,ids,{t:.4});
  near(output[0].t,.3);near(output[1].t,.8);near(output[1].path[1].t,1);near(output[0].path[0].t,.25);
  near(output[1].t-output[0].t,raw[1].t-raw[0].t);
  assert.deepEqual(output[2],raw[2]);assert.deepEqual(raw,source,'preview math does not modify authoring');
  const down=transformTrunkDetailSelection(raw,ids,{t:-.8});near(down[0].path[0].t,0);near(down[1].t,.55);
});

test('batch turn follows the angular seam while preserving type, identity, seed and complete paths',()=>{
  const raw=[detail('a',.3,350,[{t:.2,angle:355},{t:.4,angle:5}]),detail('b',.6,15),detail('c',.8,270)];
  const out=transformTrunkDetailSelection(raw,new Set(['a','b']),{angle:25});
  near(out[0].angle,15);near(out[0].path[0].angle,20);near(out[0].path[1].angle,30);near(out[1].angle,40);
  for(let i=0;i<2;i++){assert.equal(out[i].id,raw[i].id);assert.equal(out[i].type,raw[i].type);assert.equal(out[i].seed,raw[i].seed);assert.equal(out[i].strength,raw[i].strength);}
  assert.deepEqual(out[2],raw[2]);
});

test('range scaling includes relative combination placement and paths rather than only each width',()=>{
  const raw=[detail('a',.35,350,[{t:.3,angle:345},{t:.4,angle:355}]),detail('b',.65,10,[{t:.6,angle:5},{t:.7,angle:15}]),detail('c',.2,180)];
  const out=transformTrunkDetailSelection(raw,new Set(['a','b']),{scale:1.5});
  near(out[0].t,.275);near(out[1].t,.725);near(out[0].path[0].t,.2);near(out[1].path[1].t,.8);
  near(out[0].angle,345);near(out[1].angle,15);near(out[0].width,45);near(out[0].height,.18);assert.deepEqual(out[2],raw[2]);
  const large=transformTrunkDetailSelection(raw,new Set(['a','b']),{scale:100});near(large[0].path[0].t,0);near(large[1].path[1].t,1);
  assert.deepEqual(transformTrunkDetailSelection(raw,new Set(),{scale:2}),raw);
});
