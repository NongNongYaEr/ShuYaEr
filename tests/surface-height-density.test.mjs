import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CLIMB_DENSITY,normalizeHeightDensity,heightDensity} from '../web/surface-height-density.js';
import {normalizeGrowthRuler} from '../web/surface-growth-ruler-data.js';
import {canopyField} from '../web/surface-canopy-field.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {createSurfaceCanopy} from '../web/surface-canopy.js';

test('old rulers stay uniform; new profile clamps, interpolates and survives serialization',()=>{
 assert.deepEqual(normalizeGrowthRuler({}).height_density,[1,1,1,1,1]);
 assert.deepEqual(normalizeHeightDensity([-1,2,null,NaN,.3]),[0,1,1,1,.3]);
 const r=normalizeGrowthRuler({bottom:2,top:10,height_density:CLIMB_DENSITY});
 for(let i=0;i<5;i++)assert.equal(heightDensity(2+i*2,r),CLIMB_DENSITY[i]);
 assert.equal(heightDensity(-3,r),1);assert.equal(heightDensity(11,r),.05);
 assert.deepEqual(normalizeGrowthRuler(JSON.parse(JSON.stringify(r))),r);
});
test('height profile narrows coherent climbing patches and tapers depth without resizing blades',()=>{
 const r=normalizeGrowthRuler({bottom:0,top:12,height_density:CLIMB_DENSITY});
 const bands=[.3,3,6,9,11.7].map(z=>Array.from({length:1200},(_,i)=>canopyField(new THREE.Vector3((i%120)*.05,-.25+Math.floor(i/120)*.05,z),r)));
 const means=bands.map(b=>b.reduce((sum,f)=>sum+f.density,0)/b.length);
 assert.ok(means[0]>means[2]*1.4,JSON.stringify(means));assert.ok(means[2]>means[4]*3,JSON.stringify(means));
 const upper=bands[2];assert.ok(upper.filter(f=>f.mask===0).length>upper.length*.2);assert.ok(upper.some(f=>f.mask>.8));
 const p=new THREE.Vector3(.4,0,8),close=p.clone().add(new THREE.Vector3(.0001,0,0));assert.ok(Math.abs(canopyField(p,r).mask-canopyField(close,r).mask)<.005);
});
test('actual wall leaf generation is lower-heavy and respects zero/uniform/custom profiles and hard caps',()=>{
 const author=normalizeAuthoring({vine:{species:'IVY'},surface_growth:{mesh:{id:'height-wall',position:[-2,0,0,2,0,0,2,0,8,-2,0,8],index:[0,1,2,0,2,3]},growth_ruler:{bottom:0,top:8,coverage:1,leaf_budget:30000,height_density:CLIMB_DENSITY}}},45);
 const branches=Array.from({length:10},(_,i)=>({id:i,stableId:`Z_ruler_${i}`,order:1,points:[new THREE.Vector3(-1.8+i*.4,-.025,0),new THREE.Vector3(-1.8+i*.4,-.025,8)],surfaceNormals:[[0,-1,0],[0,-1,0]]}));
 author.attachment_layers[0].start=0;
 const settings={leaf_scale:.08,leaf_density:38,leaf_aspect:1,leaf_min_spacing:.01,petiole_length:.025,collision_avoidance:true};
 const generate=()=>createSurfaceCanopy(branches,settings,author,[],{leafDensity:1,leafScale:1},()=>true);
 const signature=a=>a.map(p=>[p.stableId,p.position.toArray(),p.scale]);
 const first=generate(),bins=[0,0,0,0];first.forEach(p=>bins[Math.min(3,Math.floor(p.position.z/2))]++);
 assert.ok(bins[0]>bins[3]*3,JSON.stringify(bins));assert.ok(bins[3]>0,JSON.stringify(bins));assert.ok(first.length<=30000);assert.ok(first.every(p=>p.scale<.1));
 assert.deepEqual(signature(first),signature(generate()));
 author.surface_growth.growth_ruler.height_density=[0,0,0,0,0];assert.equal(generate().length,0);
 author.surface_growth.growth_ruler.height_density=[1,1,1,1,1];assert.ok(generate().length>first.length);
});
