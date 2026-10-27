import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {growthFrontier} from '../web/surface-growth-frontier.js';
import {canopyField} from '../web/surface-canopy-field.js';
import {normalizeGrowthRuler} from '../web/surface-growth-ruler-data.js';
import {normalizeSurfaceGrowth} from '../web/surface-growth-data.js';
import {surfaceNavigation,walkSurface} from '../web/surface-growth-geometry.js';
import {createRulerGrowth} from '../web/surface-growth-ruler.js';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
test('frontier is a broad continuous shared envelope independent of branch/face and vertical position',()=>{
 const r=normalizeGrowthRuler({bottom:0,top:10,canopy_ragged:2,frontier_span:1.6}),values=[];
 for(let x=-4;x<4;x+=.01){const p=V(x,0,2),h=growthFrontier(p,r);values.push(h);assert.equal(growthFrontier(V(x,0,9),r),h);assert.equal(canopyField(p,r).frontier,h);}
 assert.ok(Math.max(...values)-Math.min(...values)>1.4);
 assert.ok(values.slice(1).every((h,i)=>Math.abs(h-values[i])<.04),'neighbors share a smooth hill rather than per-strand jumps');
 const wide={...r,frontier_span:3.2};for(let x=-3;x<3;x+=.2)assert.equal(growthFrontier(V(x*2,0,0),wide),growthFrontier(V(x,0,0),r));
 assert.deepEqual(normalizeGrowthRuler(JSON.parse(JSON.stringify(wide))),wide);
});
test('both leafy coverage and bare stems stop at the same spatial peaks and valleys',()=>{
 const mesh={id:'envelope-wall',position:[-3,0,0,3,0,0,3,0,13,-3,0,13],index:[0,1,2,0,2,3]};
 const s=normalizeSurfaceGrowth({mesh,growth_ruler:{bottom:0,top:10,canopy_ragged:2,frontier_span:1.6,budget:400}}),nav=surfaceNavigation(mesh),r=s.growth_ruler;
 const run=()=>createRulerGrowth(nav,s,{stem:.004},walkSurface).branches;
 const branches=run();assert.ok(branches.length>100);
 for(const b of branches){for(let i=1;i<b.points.length;i++){const a=V(...b.points[i-1]),end=V(...b.points[i]);for(let j=0;j<=10;j++){const p=a.clone().lerp(end,j/10);assert.ok(p.z<=growthFrontier(p,r,13)+1e-5);}}
  if(!b.parent){const p=V(...b.points.at(-1));assert.ok(Math.abs(p.z-growthFrontier(p,r,13))<1e-5);}}
 const before=JSON.stringify(branches);r.top=11;run();r.top=10;assert.equal(JSON.stringify(run()),before);
 r.frontier_span=2.7;assert.notEqual(JSON.stringify(run()),before);
});
