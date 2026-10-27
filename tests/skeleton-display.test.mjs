import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.min.js';
import {createSkeletonDisplay} from '../web/skeleton-display.js';

test('batched skeleton preserves segment positions, endpoint radii/colors and isolated branch membership',()=>{
 const branch=(id,points,children=[])=>({stableId:id,points:points.map(p=>new THREE.Vector3(...p)),children,endRadius:.01});
 const branches=[branch('A',[[0,0,0],[1,0,0],[1,1,0]],['B']),branch('B',[[1,1,0],[2,2,1]])],before=JSON.stringify(branches),display=createSkeletonDisplay(branches,new THREE.LineBasicMaterial()),[lines,parents,ends]=display.children;
 assert.equal(display.children.length,3);assert.deepEqual([...lines.geometry.index.array],[0,1,2,3,4,5]);assert.deepEqual([...lines.geometry.attributes.position.array],[0,0,0,1,0,0,1,0,0,1,1,0,1,1,0,2,2,1]);assert.equal(parents.count,1);assert.equal(ends.count,1);
 const m=new THREE.Matrix4();ends.getMatrixAt(0,m);assert(Math.abs(m.elements[0]-.015)<1e-8);assert.deepEqual(m.elements.slice(12,15),[2,2,1]);assert.equal(ends.material.color.getHex(),0xe3b84b);
 display.userData.setVisibleIds(new Set(['B']));assert.deepEqual([...lines.geometry.index.array],[4,5]);assert.equal(parents.count,0);assert.equal(ends.count,1);const index=lines.geometry.index;display.userData.setVisibleIds(new Set(['B']));assert.equal(lines.geometry.index,index);
 display.userData.setVisibleIds(new Set());assert.equal(lines.visible,false);assert.equal(ends.visible,false);display.userData.setVisibleIds(null);assert.equal(parents.count,1);assert.equal(ends.count,1);assert.equal(JSON.stringify(branches),before);display.userData.dispose();
});

test('large skeleton retains a fixed number of render objects and empty scenes remain valid',()=>{
 const material=new THREE.LineBasicMaterial(),branches=Array.from({length:7000},(_,i)=>({stableId:String(i),points:[new THREE.Vector3(i,0,0),new THREE.Vector3(i,0,1)],children:[],endRadius:.001}));
 const display=createSkeletonDisplay(branches,material);assert.equal(display.children.filter(o=>o.visible).length,2);assert.equal(display.children[2].count,7000);assert.equal(display.children[0].geometry.index.count,14000);display.userData.dispose();
 const empty=createSkeletonDisplay([],material);assert(empty.children.every(o=>!o.visible));empty.userData.dispose();material.dispose();
});
