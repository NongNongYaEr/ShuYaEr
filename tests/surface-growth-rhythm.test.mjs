import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {walkSideShoot} from '../web/surface-growth-rhythm.js';
import {surfaceNavigation,walkSurface,createSurfaceGrowth} from '../web/surface-growth-geometry.js';
import {normalizeSurfaceGrowth} from '../web/surface-growth-data.js';
const mesh={id:'rhythm-wall',position:[-10,0,0,10,0,0,10,0,10,-10,0,10],index:[0,1,2,0,2,3]};

test('side shoots turn gradually toward parent growth while staying on the support',()=>{
 const nav=surfaceNavigation(mesh),start={face:0,point:[1,0,.2]},blocked=new Set();
 const route=walkSideShoot(nav,start,new THREE.Vector3(0,0,1),{sign:1,lean:.45},1.8,walkSurface,blocked);
 const v=i=>new THREE.Vector3(...route[i].point),first=v(1).sub(v(0)).normalize(),last=v(route.length-1).sub(v(route.length-2)).normalize();
 assert.ok(last.z-first.z>.25,'tip bends upward instead of extending a constant diagonal');
 for(const s of route)assert.ok(nav.faces[s.face].triangle.closestPointToPoint(new THREE.Vector3(...s.point),new THREE.Vector3()).distanceTo(new THREE.Vector3(...s.point))<1e-5);
 assert.deepEqual(route[0].point,start.point);
});

test('generated vines have varied fork spacing, lengths and local thickness, reproducibly',()=>{
 const s=normalizeSurfaceGrowth({mesh,growth_ruler:{bottom:0,top:10,budget:600,stem_wander:.28}}),vine={stem:.004,leaf_size:.08};
 const run=()=>createSurfaceGrowth(s,vine,32).branches.filter(b=>b.id.startsWith('Z_ruler'));
 const branches=run(),mains=branches.filter(b=>!b.parent),sides=branches.filter(b=>b.parent);
 assert.deepEqual(run(),branches);assert.ok(mains.length>5&&sides.length>50);
 assert.ok(Math.max(...mains.map(b=>b.start_radius))/Math.min(...mains.map(b=>b.start_radius))>1.2);
 assert.ok(sides.some(b=>b.length<.5)&&sides.some(b=>b.length>1.2));
 for(const b of sides){const parent=branches.find(p=>p.id===b.parent);assert.ok(b.start_radius<parent.start_radius*.6);}
 const gaps=mains.flatMap(m=>{const children=sides.filter(b=>b.parent===m.id).sort((a,b)=>a.attach-b.attach);return children.slice(1).map((b,i)=>(b.attach-children[i].attach)*m.length);});
 const mean=gaps.reduce((sum,n)=>sum+n,0)/gaps.length;
 assert.ok(Math.sqrt(gaps.reduce((sum,n)=>sum+(n-mean)**2,0)/gaps.length)/mean>.08,'population of fork intervals is not uniform');
});

test('leaf-sparse upper vines retain lateral and second generation branches within budget',()=>{
 const s=normalizeSurfaceGrowth({mesh,growth_ruler:{bottom:0,top:10,budget:600,height_density:[1,.8,.4,.1,0]}}),vine={stem:.004,leaf_size:.08};
 const branches=createSurfaceGrowth(s,vine,32).branches.filter(b=>b.id.startsWith('Z_ruler'));
 const byId=new Map(branches.map(b=>[b.id,b])),mains=branches.filter(b=>!b.parent);
 assert.ok(branches.length<=600);
 const upper=branches.filter(b=>b.parent&&b.points[0][2]>6&&b.points[0][2]<9.8);
 assert.ok(upper.length>40,'upper skeleton has many forks despite sparse leaves');
 assert.ok(upper.filter(b=>byId.get(b.parent)?.parent).length>15,'real grandchildren, not independent scatter');
 for(const main of mains.filter(b=>b.length>9))assert.ok(branches.some(b=>b.parent===main.id&&b.points[0][2]>7),'each long main reaches upper forks');
 for(const b of branches.filter(b=>b.parent))assert.ok(byId.get(b.parent).points.some(p=>new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...b.points[0]))<1e-6));
 s.growth_ruler.height_density=[0,0,0,0,0];
 assert.deepEqual(createSurfaceGrowth(s,vine,32).branches.filter(b=>b.id.startsWith('Z_ruler')),branches,'leaf density must not thin the skeleton');
});
