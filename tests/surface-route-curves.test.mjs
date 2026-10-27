import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {curveSurfaceRoute} from '../web/surface-route-curves.js';
import {surfaceNavigation,walkSurface,createSurfaceGrowth} from '../web/surface-growth-geometry.js';
import {normalizeSurfaceGrowth} from '../web/surface-growth-data.js';
import {surfaceSegmentBlocked} from '../web/surface-growth-eaves.js';
const wall={id:'curved-wall',position:[-3,0,0,3,0,0,3,0,9,-3,0,9],index:[0,1,2,0,2,3]};
test('surface curves deviate smoothly from a straight route, stay on the support and keep endpoints',()=>{
 const nav=surfaceNavigation(wall),base=walkSurface(nav,{face:0,point:[0,0,.1]},new THREE.Vector3(0,0,1),8,new Set());
 const run=(seed=21)=>curveSurfaceRoute(nav,base,seed,'test',.35,1.5,walkSurface,new Set());const curved=run();
 assert.deepEqual(curved[0].point,base[0].point);assert.ok(new THREE.Vector3(...curved.at(-1).point).distanceTo(new THREE.Vector3(...base.at(-1).point))<1e-6);
 assert.ok(Math.max(...curved.map(p=>Math.abs(p.point[0])))>.1);
 assert.ok(curved.every(p=>nav.faces[p.face].triangle.closestPointToPoint(new THREE.Vector3(...p.point),new THREE.Vector3()).distanceTo(new THREE.Vector3(...p.point))<1e-6));
 for(let i=2;i<curved.length;i++){const a=new THREE.Vector3(...curved[i-1].point).sub(new THREE.Vector3(...curved[i-2].point)).normalize(),b=new THREE.Vector3(...curved[i].point).sub(new THREE.Vector3(...curved[i-1].point)).normalize();assert.ok(a.dot(b)>.9,'no random zigzag');}
 assert.deepEqual(run(),curved);assert.notDeepEqual(run(22),curved);assert.equal(curveSurfaceRoute(nav,base,21,'test',0,1.5,walkSurface,new Set()),base);
});
test('curved main/side strands retain parent junctions, no crossing at the wall/soffit, manual routes unchanged',()=>{
 const s=normalizeSurfaceGrowth({mesh:{id:'bend-soffit',position:[-2,0,0,2,0,0,2,0,4,-2,0,4,2,2,4,-2,2,4],index:[0,2,1,0,3,2,3,4,2,3,5,4]},guides:[{id:'kept',anchors:[{face:0,point:[1,0,.3]}]}],growth_ruler:{bottom:.02,top:4.05,budget:200,stem_wander:.3},auto_hang:true});
 const vine={stem:.004,leaf_size:.08},nav=surfaceNavigation(s.mesh),first=createSurfaceGrowth(s,vine,45).branches;
 assert.deepEqual(createSurfaceGrowth(normalizeSurfaceGrowth(JSON.parse(JSON.stringify(s))),vine,45).branches,first);
 for(const b of first.filter(b=>b.id.startsWith('Z_ruler'))){for(let i=1;i<b.points.length;i++)assert.equal(surfaceSegmentBlocked(nav,new THREE.Vector3(...b.points[i-1]),new THREE.Vector3(...b.points[i]),0),false,JSON.stringify({id:b.id,i,a:b.points[i-1],b:b.points[i]}));
  if(b.parent){const parent=first.find(p=>p.id===b.parent);assert.ok(parent.points.some(p=>new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...b.points[0]))<1e-6));}}
 s.growth_ruler.stem_wander=0;const straight=createSurfaceGrowth(s,vine,45).branches;
 assert.deepEqual(first.filter(b=>b.id.startsWith('S_')),straight.filter(b=>b.id.startsWith('S_')));
 assert.ok(first.some(b=>!b.parent&&b.id.startsWith('Z_ruler')&&JSON.stringify(b.points)!==JSON.stringify(straight.find(p=>p.id===b.id)?.points)));
});
