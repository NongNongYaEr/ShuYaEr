import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {normalizeSurfaceGrowth} from '../web/surface-growth-data.js';
import {surfaceNavigation,walkSurface} from '../web/surface-growth-geometry.js';
import {createRulerGrowth} from '../web/surface-growth-ruler.js';
import {growthFrontier} from '../web/surface-growth-frontier.js';
const mesh={id:'tips-wall',position:[-3,0,0,3,0,0,3,0,13,-3,0,13],index:[0,1,2,0,2,3]};
test('height ruler makes staggered connected tips; zero ragged restores exact cutting plane',()=>{
 const s=normalizeSurfaceGrowth({mesh,growth_ruler:{bottom:0,top:10.091,canopy_ragged:1,budget:600}}),nav=surfaceNavigation(mesh),vine={stem:.004};
 const run=()=>createRulerGrowth(nav,s,vine,walkSurface).branches;
 const first=run(),roots=first.filter(b=>!b.parent),tips=roots.map(b=>b.points.at(-1)[2]);
 assert.ok(Math.max(...tips)-Math.min(...tips)>.3);
 assert.ok(first.every(b=>b.points.every(p=>p[2]<=10.091+1e-8)));
 for(const b of first.filter(b=>b.parent)){const parent=first.find(p=>p.id===b.parent);assert.ok(parent);assert.ok(parent.points.some(p=>new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...b.points[0]))<1e-6));}
 s.growth_ruler.top=11;run();s.growth_ruler.top=10.091;assert.deepEqual(run(),first);
 assert.deepEqual(createRulerGrowth(nav,normalizeSurfaceGrowth(JSON.parse(JSON.stringify(s))),vine,walkSurface).branches,first);
 s.growth_ruler.canopy_ragged=0;const flat=run().filter(b=>!b.parent);assert.ok(flat.every(b=>Math.abs(b.points.at(-1)[2]-10.091)<1e-6));
 s.growth_ruler.top=13.1;const complete=run();s.growth_ruler.canopy_ragged=1;assert.deepEqual(run(),complete,'full height preserves soffit routes');
});
test('raising the ruler advances every tip without resampling its stagger',()=>{
 const point=new THREE.Vector3(.3,0,5),r={bottom:0,top:1,canopy_ragged:1,canopy_clump:.35,seed:123};
 let previous=-Infinity;for(let top=1;top<13.2;top+=.01){r.top=top;const next=growthFrontier(point,r,13);assert.ok(next>previous);previous=next;}
});
