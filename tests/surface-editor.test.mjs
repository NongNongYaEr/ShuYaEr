import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {normalizeSurfaceGrowth} from '../web/surface-growth-data.js';
import {surfaceNavigation,walkSurface,createSurfaceGrowth} from '../web/surface-growth-geometry.js';
import {makePaintStamp,paintField,paintOverlay,trimSurfaceSamples,surfaceBlocked} from '../web/surface-paint.js';
import {zoneGrowth} from '../web/surface-zone-growth.js';
const V=(x,y,z=0)=>new THREE.Vector3(x,y,z);
const fixture=()=>normalizeSurfaceGrowth({mesh:{id:'coarse',name:'wall',position:[0,0,0,10,0,0,10,10,0,0,10,0,0,0,-.01,10,0,-.01,10,10,-.01],index:[0,1,2,0,2,3,4,5,6]}});
const stamp=(nav,p,r=.3,erase=false,strength=1)=>makePaintStamp(nav,{face:0,point:p},{radius:r,strength,softness:0,corners:false},erase,[0,0,1]);
const stroke=(sample,id='a')=>({id,samples:[sample]});
test('precise paint stays local on a 100m2 coarse surface and never reaches disconnected back face',()=>{const s=fixture(),nav=surfaceNavigation(s.mesh);s.region.strokes=[stroke(stamp(nav,[5,4,0]))];const f=paintField(s.region);assert.equal(f.weight(0,V(5,4)),1);assert.equal(f.weight(0,V(6,4)),0);assert.equal(f.weight(2,V(5,4,-.01)),0);const preview=paintOverlay(nav,s.region,[],[]);assert.ok(preview.area<.4&&preview.area>.1);assert.equal(s.mesh.index.length,9);});
test('brush strength is per stroke; local eraser leaves remote paint unchanged',()=>{const s=fixture(),nav=surfaceNavigation(s.mesh),a=stamp(nav,[5,4,0],.4,false,.5);s.region.strokes=[{id:'a',samples:[a,a,a]},stroke(stamp(nav,[7,4,0],.4,false,.5),'b')];assert.equal(paintField(s.region).weight(0,V(5,4)),.5);s.region.strokes.push(stroke(stamp(nav,[5,4,0],.1,true),'erase'));const f=paintField(s.region);assert.equal(f.weight(0,V(5,4)),0);assert.equal(f.weight(0,V(7,4)),.5);});
test('fine forbidden paint stops routes locally; erasing legacy forbidden mask reopens only the small patch',()=>{const s=fixture(),nav=surfaceNavigation(s.mesh);s.block_strokes=[stroke(stamp(nav,[5,4,0],.2))];let path=walkSurface(nav,{face:0,point:[4.5,4,0]},V(1,0),2,surfaceBlocked(s));assert.ok(path.at(-1).point[0]<4.85);s.blocked=[0];s.block_strokes=[stroke(stamp(nav,[5,4,0],.2,true))];const b=surfaceBlocked(s);assert.equal(b.atPoint(0,V(5,4)),false);assert.equal(b.atPoint(0,V(6,4)),true);});
test('independent regions retain stable records and connected side stems across other region edits',()=>{let s=fixture();const nav=surfaceNavigation(s.mesh);s.regions=[{...s.region,id:'one',strokes:[stroke(stamp(nav,[5,4,0],1.5))],coverage:1,fade:0,budget:80,length:1.4,density:8,clump:.8},{...s.region,id:'two',strokes:[stroke(stamp(nav,[8,6,0],1))]}];s=normalizeSurfaceGrowth(s);const vine={leaf_size:.08,stem:.004};const first=zoneGrowth(nav,s,s.regions[0],vine,walkSurface);assert.ok(first.branches.length>2);const children=first.branches.filter(b=>b.parent);assert.ok(children.length>0);for(const b of children){const parent=first.branches.find(p=>p.id===b.parent);assert.ok(parent.points.some(p=>new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...b.points[0]))<1e-8));}s.regions[1].coverage=.1;assert.equal(zoneGrowth(nav,s,s.regions[0],vine,walkSurface),first);const saved=normalizeSurfaceGrowth(JSON.parse(JSON.stringify(s)));assert.deepEqual(saved,s);assert.deepEqual(zoneGrowth(nav,saved,saved.regions[0],vine,walkSurface).branches,first.branches);});
test('path retraction follows bent route, keeps original input and respects per-route thickness',()=>{const path=[{face:0,point:[0,0,0]},{face:0,point:[2,0,0]},{face:0,point:[2,2,0]}];assert.deepEqual(trimSurfaceSamples(path,.75).at(-1).point,[2,1,0]);assert.deepEqual(path.at(-1).point,[2,2,0]);let s=fixture();s.guides=[{id:'a',anchors:[{face:0,point:[3,2,0]},{face:0,point:[6,2,0]}],trim:.5,config:{radius:.01,density:0}}];s=normalizeSurfaceGrowth(s);const result=createSurfaceGrowth(s,{stem:.004,leaf_size:.08},123);assert.equal(result.branches[0].start_radius,.01);assert.ok(Math.abs(result.branches[0].length-1.5)<1e-6);});

test('route configuration snapshot preserves geometry when global defaults change',()=>{
 let s=fixture();s.guides=[{id:'locked',locked:true,anchors:[{face:0,point:[4,3,0]}],config:{length:1.5,spread:.3,density:4,radius:.006,offset:.02,flip:false,auto_hang:false,seed:123}}];s=normalizeSurfaceGrowth(s);
 const before=createSurfaceGrowth(s,{stem:.004,leaf_size:.08},123).branches;
 assert.ok(before.length>1);s.length=8;s.spread=1;s.density=9;s.offset=.06;s.flip=true;
 assert.deepEqual(createSurfaceGrowth(s,{stem:.02,leaf_size:.08},999).branches,before);
});
test('eave path retraction follows rim and repaint restores an erased area including its fade',()=>{
 let s=fixture();s.guides=[{id:'rim',type:'EAVE',anchors:[{face:0,point:[2,0,0]},{face:0,point:[8,0,0]}]}];s=normalizeSurfaceGrowth(s);
 const full=createSurfaceGrowth(s,{stem:.004,leaf_size:.08},123).branches[0];assert.ok(full);
 s.guides[0].trim=.5;const half=createSurfaceGrowth(s,{stem:.004,leaf_size:.08},123).branches[0];assert.ok(Math.abs(half.length/full.length-.5)<.01);
 const nav=surfaceNavigation(s.mesh);s.region.strokes=[stroke(stamp(nav,[5,4,0],.4)),stroke(stamp(nav,[5,4,0],.3,true),'erase'),stroke(stamp(nav,[5,4,0],.3),'repaint')];const f=paintField(s.region);assert.equal(f.weight(0,V(5,4)),1);assert.ok(f.edgeDistance(0,V(5,4),.2)>.19);
});
test('legacy face-based region preserves its stable records and geometry across save reload',()=>{
 const s=fixture();s.region.faces=[0];s.region.coverage=.4;const vine={stem:.004,leaf_size:.08};const before=createSurfaceGrowth(s,vine,321).branches;assert.ok(before.length>0);assert.ok(before.every(b=>b.id.startsWith('A_')));
 const legacy=JSON.parse(JSON.stringify(s));delete legacy.regions;delete legacy.region.strokes;delete legacy.block_strokes;delete legacy.brush;
 assert.deepEqual(createSurfaceGrowth(normalizeSurfaceGrowth(legacy),vine,321).branches,before);
 const nav=surfaceNavigation(s.mesh);s.region.strokes=[stroke(stamp(nav,[5,4,0],.1,true),'local-erase')];const after=createSurfaceGrowth(s,vine,321).branches;assert.ok(after.some(b=>JSON.stringify(b)===JSON.stringify(before.find(x=>x.id===b.id))));
});

test('mixed scene vegetation follows precise region paint and masks without changing legacy placement IDs',async()=>{
 const {vegetationPlacements}=await import('../web/vegetation-placement.js');const {normalizeVegetation}=await import('../web/vegetation-data.js');
 const s=fixture(),nav=surfaceNavigation(s.mesh),config=normalizeVegetation({enabled:true,mode:'REGION',density:20,spacing:.03,weights:{GRASS:1}});
 s.region.strokes=[stroke(stamp(nav,[5,4,0],1))];s.region.coverage=1;s.region.fade=0;
 const before=vegetationPlacements(config,s);assert.ok(before.length>0);assert.ok(before.every(p=>V(...p.point).distanceTo(V(5,4))<1.01));
 s.block_strokes=[stroke(stamp(nav,[5,4,0],1.1))];assert.equal(vegetationPlacements(config,s).length,0);
});
