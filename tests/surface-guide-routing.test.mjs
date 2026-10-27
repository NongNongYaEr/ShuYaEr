import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { surfaceNavigation, surfaceRoute } from '../web/surface-growth-geometry.js';
import { relaxGuideRoute, guideRouteLength, isLocalGuideRoute } from '../web/surface-guide-routing.js';
import { simplifyGuideAnchors } from '../web/surface-guide-shape.js';
const wall={id:'route-wall',position:[-4,0,0,4,0,0,4,0,8,-4,0,8],index:[0,1,2,0,2,3]};
const folded={id:'route-fold',position:[-4,0,0,4,0,0,4,0,4,-4,0,4,-4,4,4,4,4,4],index:[0,1,2,0,2,3,3,2,5,3,5,4]};
const V=p=>new THREE.Vector3(...p);
test('guide routes cross a flat triangulated wall without detouring through shared-edge midpoints',()=>{
 const nav=surfaceNavigation(wall),a={face:1,point:[-3,0,7]},b={face:0,point:[-2,0,1]},raw=surfaceRoute(nav,a,b),original=structuredClone(raw),smooth=relaxGuideRoute(nav,raw);
 assert.ok(guideRouteLength(raw)>V(a.point).distanceTo(V(b.point))*1.2);
 assert.ok(Math.abs(guideRouteLength(smooth)-V(a.point).distanceTo(V(b.point)))<1e-4);
 assert.deepEqual(raw,original);assert.deepEqual(smooth[0],a);assert.deepEqual(smooth.at(-1),b);
});
test('relaxed routes stay in their connected triangles around roof/wall corners',()=>{
 const nav=surfaceNavigation(folded),a={face:0,point:[2,0,1]},b={face:2,point:[2,3,4]},smooth=relaxGuideRoute(nav,surfaceRoute(nav,a,b));
 assert.ok(Math.abs(guideRouteLength(smooth)-6)<.002);
 for(let i=1;i<smooth.length;i++) { const first=smooth[i-1],last=smooth[i],face=nav.faces[first.nextFace??first.face].triangle;for(let k=0;k<=10;k++){const p=V(first.point).lerp(V(last.point),k/10);assert.ok(face.closestPointToPoint(p,new THREE.Vector3()).distanceTo(p)<1e-6);} }
 assert.ok(isLocalGuideRoute(smooth,a,b));
 assert.deepEqual(surfaceRoute(nav,a,b,new Set([2])),[]);
});
test('nearby screen hits that require a long trip around the surface are rejected',()=>{
 const a={face:0,point:[0,0,0]},b={face:1,point:[0,.1,0]};
 assert.equal(isLocalGuideRoute([a,{face:0,point:[0,0,4]},b],a,b),false);
 assert.equal(isLocalGuideRoute([],a,b),false);
});
test('control simplification preserves both sides of a roof corner even with a large tolerance',()=>{
 const nav=surfaceNavigation(folded),anchors=[{face:0,point:[2,0,1]},{face:0,point:[2,0,3.99]},{face:2,point:[2,.01,4]},{face:2,point:[2,3,4]}];
 assert.deepEqual(simplifyGuideAnchors(anchors,10,nav),anchors);
});

