import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {leafGapMask} from '../web/surface-canopy-field.js';
import {normalizeGrowthRuler} from '../web/surface-growth-ruler-data.js';
test('leaf gaps form continuous patches, scale separately, and old projects add no holes',()=>{
 const old=normalizeGrowthRuler({});assert.equal(old.leaf_gap_ratio,0);assert.equal(old.leaf_spacing,.018);
 const r=normalizeGrowthRuler({leaf_gap_ratio:.55,leaf_gap_size:.6}),values=[];
 for(let x=0;x<12;x+=.01){const p=new THREE.Vector3(x,0,1);values.push(leafGapMask(p,r));assert.equal(leafGapMask(p,old),1);assert.equal(leafGapMask(p,{...r,leaf_gap_ratio:1}),0);}
 assert.ok(values.some(v=>v===0)&&values.some(v=>v===1));
 assert.ok(values.slice(1).filter((v,i)=>Math.abs(v-values[i])<.1).length>values.length*.9);
 const p=new THREE.Vector3(.3,.7,1.1);assert.equal(leafGapMask(p,r),leafGapMask(p.clone().multiplyScalar(2),{...r,leaf_gap_size:1.2}));
 assert.deepEqual(normalizeGrowthRuler(JSON.parse(JSON.stringify(r))),r);
});
