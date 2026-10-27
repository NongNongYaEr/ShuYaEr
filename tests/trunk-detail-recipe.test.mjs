import test from 'node:test';
import assert from 'node:assert/strict';
import {captureTrunkDetailRecipe} from '../web/trunk-detail-recipe.js';
import {createTrunkDetail} from '../web/trunk-details.js';
import {trunkDetailShortcut} from '../web/trunk-detail-controls.js';
test('sampling carries a cloned cross-section and seed with measured physical sizes, never placement, enablement or path',()=>{
 const d=createTrunkDetail('SCAR',{id:'ORIGINAL',enabled:false,t:.7,angle:63,strength:.17,width:23,height:.11,seed:19,path:[{t:.6,angle:50},{t:.8,angle:65}],profile:{version:1,points:[{x:-1,y:0},{x:0,y:-.6},{x:1,y:0}]}}),before=structuredClone(d),sample=captureTrunkDetailRecipe(d,{measure:(_,field)=>field==='width'?8:4});
 assert.equal(sample.tool,'PATH');assert.deepEqual(sample.sizes,{width:8,height:4});assert.equal(sample.recipe.seed,19);assert.deepEqual(sample.recipe.profile,d.profile);
 for(const k of ['id','enabled','t','angle','path'])assert.equal(k in sample.recipe,false);sample.recipe.profile.points[1].y=.3;assert.deepEqual(d,before);
});
test('point sampling keeps normalized proportions when real measurement is absent or invalid',()=>{
 const d=createTrunkDetail('KNOT',{width:10,height:.2});assert.equal(captureTrunkDetailRecipe(d).tool,'POINT');assert.deepEqual(captureTrunkDetailRecipe(d,{measure:()=>NaN}).sizes,{});assert.equal(captureTrunkDetailRecipe({type:'BAD'}),null);
});
test('T is scoped to the detail editor with the same text, modifier, repeat and IME protection as editing shortcuts',()=>{
 const enabled={enabled:true};assert.equal(trunkDetailShortcut({key:'t'},enabled),'SAMPLE');assert.equal(trunkDetailShortcut({code:'KeyT'},enabled),'SAMPLE');assert.equal(trunkDetailShortcut({key:'t'}),null);
 for(const flag of ['defaultPrevented','isComposing','repeat','ctrlKey','shiftKey','altKey','metaKey'])assert.equal(trunkDetailShortcut({key:'t',[flag]:true},enabled),null);
 for(const flag of ['typing','dialogOpen'])assert.equal(trunkDetailShortcut({key:'t'},{...enabled,[flag]:true}),null);
});
