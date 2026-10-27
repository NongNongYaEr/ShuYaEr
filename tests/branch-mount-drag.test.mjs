import test from 'node:test';
import assert from 'node:assert/strict';
import {projectedMountParameter, mountDistanceAt, slideMountParameter} from '../web/branch-mount-drag.js';
import * as THREE from 'three';
const p=(x,y,w=1,z=0)=>({x,y,w,z});
test('mount drag follows the projected curved carrier and clamps to its ends',()=>{
 const points=[p(0,100),p(20,50),p(0,0)];
 assert.ok(Math.abs(projectedMountParameter(points,10,75)-.25)<1e-12);
 assert.equal(projectedMountParameter(points,0,150),0);
 assert.equal(projectedMountParameter(points,0,-100),1);
 assert.equal(projectedMountParameter([p(0,0),p(0,0)],1,1,.6),.6);
});
test('mount drag resolves perspective interpolation and overlapping screen segments',()=>{
 assert.ok(Math.abs(projectedMountParameter([p(0,0,1),p(100,0,2)],50,0)-1/3)<1e-12);
 const overlap=[p(0,0),p(100,0),p(0,0)];
 assert.equal(projectedMountParameter(overlap,50,0,.8),.75);
 assert.equal(projectedMountParameter([p(0,0,-1),p(100,0,-1)],50,0,.4),.4);
});

test('typed mount distance follows true arc length over unequal and zero-length segments',()=>{
 const points=[[0,0,0],[0,0,1],[0,0,1],[3,0,1],[3,0,3]].map(p=>new THREE.Vector3(...p));
 const start=.125, moved=slideMountParameter(points,start,2.5);
 assert.ok(Math.abs(mountDistanceAt(points,moved)-mountDistanceAt(points,start)-2.5)<1e-12);
 assert.ok(Math.abs(slideMountParameter(points,moved,-2.5)-start)<1e-12);
 assert.equal(slideMountParameter(points,start,-100),0);assert.equal(slideMountParameter(points,start,100),1);
 assert.equal(slideMountParameter([points[0],points[0]],.4,1),.4);
});
