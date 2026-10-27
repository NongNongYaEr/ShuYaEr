import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {canopyField,canopySurfaceFrames} from '../web/surface-canopy-field.js';
import {normalizeGrowthRuler} from '../web/surface-growth-ruler-data.js';
import {surfaceNavigation} from '../web/surface-growth-geometry.js';
import {createSurfaceCanopy} from '../web/surface-canopy.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {surfaceSegmentBlocked} from '../web/surface-growth-eaves.js';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
function corner(concave=false){return {id:`corner-${concave}`,position:[-2,0,0,0,0,0,0,0,3,-2,0,3,0,concave?-2:2,0,0,concave?-2:2,3],index:[0,1,2,0,2,3,1,4,5,1,5,2]};}
test('convex edge frames meet continuously, including the neighboring coplanar triangle; no diagonal ridges',()=>{
 const nav=surfaceNavigation(corner()),frames=canopySurfaceFrames(nav,false,new Set());
 const a=frames[0](V(0,0,1),.2),b=frames[3](V(0,0,1),.2);
 assert.ok(a.position.distanceTo(b.position)<1e-8);assert.ok(a.normal.distanceTo(b.normal)<1e-8);assert.ok(a.corner&&b.corner);
 const near=V(-.01,0,2.99);assert.ok(frames[1](near,.2).position.distanceTo(frames[0](near,.2).position)<1e-8);
 const flat=V(-1,0,1.5);assert.deepEqual(frames[0](flat,.2).position.toArray(),[-1,-.2,1.5]);
 const concave=surfaceNavigation(corner(true)),inner=canopySurfaceFrames(concave,false,new Set());assert.equal(inner[0](V(0,0,1),.2).corner,false);
 const blocked=canopySurfaceFrames(nav,false,new Set([2,3]));assert.equal(blocked[0](V(0,0,1),.2).corner,false);
});
test('clump depth and irregular frontier are persistent, nonperiodic and continuous across faces',()=>{
 const r=normalizeGrowthRuler({bottom:0,top:5,canopy_depth:.4,canopy_clump:.65,canopy_ragged:1.1});
 const points=Array.from({length:400},(_,i)=>V((i%20)*.13,0,Math.floor(i/20)*.13));
 const values=points.map(p=>canopyField(p,r));const depths=values.map(v=>v.depth);
 assert.ok(Math.max(...depths)-Math.min(...depths)>.25);assert.ok(Math.max(...values.map(v=>v.frontier))-Math.min(...values.map(v=>v.frontier))>.6);
 assert.deepEqual(values,points.map(p=>canopyField(p,normalizeGrowthRuler(JSON.parse(JSON.stringify(r))))));
 assert.ok(Math.abs(canopyField(V(1,0,1),r).depth-canopyField(V(1.00001,0,1),r).depth)<.0001);
 assert.notDeepEqual(values,points.map(p=>canopyField(p,{...r,seed:r.seed+1})));
});
test('leaves wrap a convex corner using safe cross-face attachments without changing real scale',()=>{
 const a=normalizeAuthoring({vine:{species:'IVY'},surface_growth:{mesh:corner(),growth_ruler:{bottom:.02,top:2.9,coverage:1,leaf_budget:5000}}},45);
 // One strand on each face. The leaf near the corner must no longer require a coplanar strand.
 const branches=[{id:0,stableId:'Z_ruler_test',points:[V(-.08,-.025,.02),V(-.08,-.025,2.9)],surfaceNormals:[[0,-1,0],[0,-1,0]],order:1}];
 const nav=surfaceNavigation(a.surface_growth.mesh),leaves=createSurfaceCanopy(branches,{leaf_scale:.08,leaf_density:38,leaf_aspect:1,leaf_min_spacing:.01,petiole_length:.025,collision_avoidance:true},a,[],{leafDensity:1,leafScale:1},()=>true);
 const around=leaves.filter(p=>p.position.x>0&&p.position.y>.04);
 assert.ok(around.length>20,`corner leaves ${around.length}`);
 assert.ok(leaves.every(p=>!surfaceSegmentBlocked(nav,p.canopyRoot,p.position.clone().addScaledVector(p.direction,.025),0)));
 assert.ok(leaves.every(p=>p.scale<.1));
});
