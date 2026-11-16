import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDefaultImportMaterial} from '../material/web/import-material-default.js';
import {withDefaultRootFallback} from '../material/web/default-material-style-a.js';
import {rootMossSupplement,stableCoverage} from '../material/web/stable-distribution.js';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {appendPaintRule} from '../material/web/surface-effects.js';

const roles=[2,4,5];
const rules=surface=>surface.masks.flatMap(mask=>mask.items).filter(rule=>rule.type==='treeauto');
const enabledRoles=surface=>rules(surface).filter(rule=>rule.openRootFallback).map(rule=>rule.params.role);
const fresh=()=>createDocument({source:'a'.repeat(64),name:'默认树皮',settings:{},actualHeightMeters:5});

test('fresh and reopened default material get open-root coverage on three lower effects',()=>{
 const doc=fresh();
 doc.surface=applyDefaultImportMaterial(doc);
 assert.deepEqual(enabledRoles(validateDocument(doc).surface),roles);

 const saved=structuredClone(doc.surface);
 for(const rule of rules(saved))delete rule.openRootFallback;
 const reopened=withDefaultRootFallback(saved);
 assert.deepEqual(enabledRoles(reopened),roles);
 assert.equal(withDefaultRootFallback(reopened),reopened);
 assert.deepEqual(enabledRoles(saved),[]);
 for(const rule of rules(reopened))delete rule.openRootFallback;
 assert.deepEqual(reopened,saved);
});

test('root migration keeps changed distribution rules, painted masks, and deliberate opt-out',()=>{
 const doc=fresh();
 const original=applyDefaultImportMaterial(doc);
 for(const rule of rules(original))delete rule.openRootFallback;
 rules(original).find(rule=>rule.params.role===2).params.density=.2;
 rules(original).find(rule=>rule.params.role===4).openRootFallback=false;
 const moss=original.effects.find(effect=>effect.type==='moss');
 const authored=appendPaintRule(original,moss.id,doc.resources.source).s;
 assert.equal(withDefaultRootFallback(authored),authored);
});

test('root fallback fills bare low bark with patches while retaining existing geometry support',()=>{
 const params={role:null,rootHeightMeters:1.85,density:.55};
 const open={position:[0,0,0],cavity:0,contact:0,shade:0,ridge:0,broad:1};
 const fallback={openRootFallback:true};
 const sample=Array.from({length:24},(_,i)=>({...open,position:[i*.08,.08,.04]}));
 const normal=sample.map(input=>stableCoverage(input,params));
 const fixed=sample.map(input=>stableCoverage(input,params,fallback));
 for(const role of roles){
  assert(normal.every(values=>values[role]===0));
  assert(fixed.some(values=>values[role]>.08));
  assert(fixed.some(values=>values[role]===0));
 }
 assert(fixed.some(values=>values[5]>.7));
 for(const role of [0,1,3])assert.deepEqual(fixed.map(values=>values[role]),normal.map(values=>values[role]));
 const higher={...open,position:[.04,2,.02],cavity:.25};
 assert.deepEqual(stableCoverage(higher,params,fallback),stableCoverage(higher,params));
 const sheltered={...open,position:[.04,.1,.02],cavity:1,contact:1,shade:1};
 assert.deepEqual(stableCoverage(sheltered,params,fallback),stableCoverage(sheltered,params));
 assert.deepEqual(stableCoverage(open,{...params,density:0},fallback),[0,0,0,0,0,0]);
});

test('default moss adds strong patches only when the root is open in physical surface area',()=>{
 const mesh={pos:new Float32Array([0,0,0,1,0,0,0,.5,0,0,3,0]),indices:new Uint32Array([0,1,2,1,3,2]),min:[0,0,0],height:3};
 const signed=new Float32Array(6);
 const analysis=(visibility)=>({local:{signed},wide:{signed},ao:{sample:()=>({short:visibility,broad:visibility})}});
 assert.equal(rootMossSupplement(mesh,analysis(1),3,1.85),1);
 assert.equal(rootMossSupplement(mesh,analysis(.1),3,1.85),0);
 const open={position:[1.6,.08,.04],cavity:0,contact:0,shade:0,ridge:0,broad:1};
 const params={role:5,rootHeightMeters:1.85,density:.55};
 assert.equal(stableCoverage(open,params,{openRootFallback:true,mossSupplement:0}),stableCoverage(open,params));
});
