import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSurfaceGrowth } from '../web/surface-growth-data.js';
import { normalizeGrowthRuler } from '../web/surface-growth-ruler-data.js';
import { surfaceNavigation, walkSurface, createSurfaceGrowth } from '../web/surface-growth-geometry.js';
import { growthRulerFaces, createRulerGrowth, clipGrowthPath } from '../web/surface-growth-ruler.js';
const fixture=()=>normalizeSurfaceGrowth({mesh:{id:'wall-soffit',position:[-2,0,0,2,0,0,2,0,4,-2,0,4,2,3,4,-2,3,4,8,0,2,9,0,2,8,0,3],index:[0,1,2,0,2,3,3,4,2,3,5,4,6,7,8]},growth_ruler:{bottom:.02,top:2,coverage:1,budget:400}});
const vine={stem:.004,leaf_size:.08};
test('height ruler is absent from old projects and retains finite ordered values through roundtrip',()=>{assert.equal(normalizeSurfaceGrowth({...fixture(),growth_ruler:undefined}).growth_ruler,null);const r=normalizeGrowthRuler({bottom:5,top:2,budget:9e9});assert.ok(r.top>r.bottom);assert.equal(r.budget,2400);const s=fixture();assert.deepEqual(normalizeSurfaceGrowth(JSON.parse(JSON.stringify(s))),s);});
test('ruler reaches connected soffit but never paints a floating disconnected surface',()=>{const s=fixture(),nav=surfaceNavigation(s.mesh);assert.deepEqual(growthRulerFaces(nav,.02).sort(),[0,1,2,3]);s.growth_ruler.top=4.05;const result=createRulerGrowth(nav,s,vine,walkSurface);assert.ok(result.branches.some(b=>b.points.some(p=>p[1]>.5&&p[2]>3.8)));assert.ok(result.branches.every(b=>b.points.every(p=>p[0]<3)));});
test('raising and retracting restores exact geometry without changing manual routes or the support',()=>{const s=fixture(),nav=surfaceNavigation(s.mesh),original=JSON.stringify(s.mesh);s.guides=[{id:'manual',anchors:[{face:0,point:[1,0,1]}],trim:1}];const low=createSurfaceGrowth(s,vine,123).branches;assert.ok(low.some(b=>b.id.startsWith('Z_ruler_')));const manual=low.filter(b=>b.id.startsWith('S_manual'));s.growth_ruler.top=4.05;const high=createSurfaceGrowth(s,vine,123).branches;assert.deepEqual(high.filter(b=>b.id.startsWith('S_manual')),manual);assert.ok(high.length>low.length);assert.ok(low.filter(b=>b.id.startsWith('Z_ruler_')).every(b=>b.points.every(p=>p[2]<=2+1e-6)));s.growth_ruler.top=2;assert.deepEqual(createSurfaceGrowth(s,vine,123).branches,low);assert.equal(JSON.stringify(s.mesh),original);s.growth_ruler.enabled=false;assert.deepEqual(createSurfaceGrowth(s,vine,123).branches,manual);});
test('height clipping preserves thickness and splits crossing paths without long cut shortcuts',()=>{const b={points:[[0,0,0],[1,0,3],[2,0,0]],surfaceNormals:[[0,1,0],[0,1,0],[0,1,0]]};const result=clipGrowthPath(b,.5,2);assert.equal(result.length,2);assert.ok(result.every(r=>r.points.every(p=>p[2]>=.5&&p[2]<=2)));assert.deepEqual(b.points[1],[1,0,3]);});

test('every automatic main starts at the base, with attached laterals rather than floating patches',()=>{
 const s=fixture();s.growth_ruler.top=4.05;const result=createRulerGrowth(surfaceNavigation(s.mesh),s,vine,walkSurface),roots=result.branches.filter(b=>!b.parent);
 assert.ok(roots.length>2);assert.ok(roots.every(b=>Math.abs(b.points[0][2]-s.growth_ruler.bottom)<.025));assert.ok(roots.every(b=>b.length>3.8));
 const children=result.branches.filter(b=>b.parent);assert.ok(children.length>0);
 for(const child of children){const parent=result.branches.find(b=>b.id===child.parent);assert.ok(parent);assert.ok(parent.points.some(p=>Math.hypot(...p.map((v,i)=>v-child.points[0][i]))<1e-7));assert.equal(child.role,'SURFACE_AREA','share foliage budget over all vines');}
});

test('a start ruler below the mesh still roots on its lowest connected surface',()=>{const s=fixture();s.growth_ruler.bottom=-.2;const nav=surfaceNavigation(s.mesh),result=createRulerGrowth(nav,s,vine,walkSurface);assert.ok(result.branches.length>0);assert.ok(result.branches.filter(b=>!b.parent).every(b=>Math.abs(b.points[0][2]-.025)<.001));});

test('sloped support roots survive the small height shift caused by surface clearance',()=>{const s=normalizeSurfaceGrowth({mesh:{id:'sloped',position:[-2,0,0,2,0,0,2,-2,4,-2,-2,4],index:[0,1,2,0,2,3]},growth_ruler:{bottom:.5,top:3.5,coverage:1,budget:200}}),result=createRulerGrowth(surfaceNavigation(s.mesh),s,vine,walkSurface);assert.ok(result.branches.some(b=>!b.parent&&b.length>2));assert.ok(result.branches.every(b=>b.points.every(p=>p[2]>=.5-1e-6)));});
