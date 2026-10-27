import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { combCurve } from '../web/branch-combing.js';
import { createSculptSnapshot, deformTree, sculptOverrides, sampleLine } from '../web/tree-sculpt.js';
import { buildBranchAsset, disposeBranchAsset } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';

const vec = a => a.map(p => new THREE.Vector3(...p));
const near = (a,b) => assert.ok(a.distanceTo(b) < 1e-8);
function lengths(before,after) {
  assert.equal(after.length,before.length);
  for(let i=1;i<before.length;i++) assert.ok(Math.abs(before[i].distanceTo(before[i-1])-after[i].distanceTo(after[i-1]))<1e-8,`segment ${i} stretched`);
}
test('comb repeatedly rotates actual dense curve without stretching, including opposing strokes',()=>{
  const original=Array.from({length:91},(_,i)=>new THREE.Vector3(Math.sin(i*.04)*.8,i*.015,i*.04));
  let points=original;
  for(let n=0;n<160;n++) points=combCurve(points,points.map((_,i)=>Math.sin(i/(points.length-1)*Math.PI)**2),new THREE.Vector3(.1,0,n<80?0:-.12),{strength:1,worldRadius:1});
  near(points[0],original[0]); lengths(original,points);assert.ok(points.at(-1).distanceTo(original.at(-1))>.5);
  const straight=vec([[0,0,0],[0,0,1],[0,0,2]]);
  const reversed=combCurve(straight,[0,1,1],new THREE.Vector3(0,0,-1),{strength:1});
  lengths(straight,reversed);assert.ok(reversed.at(-1).distanceTo(straight.at(-1))>.1);
  assert.deepEqual(combCurve(straight,[1,1,1],new THREE.Vector3()),straight);
});
const branch=(id,parentId,points,extra={})=>({id,stableId:'B'+id,parentId,parentT:.5,controlPoints:points,points,startRadius:.04,endRadius:.009,...extra});
test('comb fixes root, carries child rigidly, protects sibling and preserves radii and stable IDs',()=>{
  const bs=[branch(0,-1,vec([[0,0,0],[.2,0,1],[.5,0,2],[.8,0,3]])),branch(1,0,vec([[.35,0,1.5],[1,0,1.5],[1.4,.2,2]])),branch(2,-1,vec([[5,0,0],[5,0,1]]))];
  const s=createSculptSnapshot(bs),a=deformTree(s,new Map([[0,[0,1,1,1]]]),new THREE.Vector3(.4,0,0),'COMB',{strength:1,preserveLength:0});
  near(a.get(0).points[0],s.get(0).points[0]);assert.equal(a.get(2),s.get(2));
  near(a.get(1).points[0],sampleLine(a.get(0).points,.5));
  for(const b of a.values()){const old=s.get(b.id);lengths(old.points,b.points);assert.equal(b.startRadius,old.startRadius);assert.equal(b.endRadius,old.endRadius);assert.equal(b.stableId,old.stableId);}
  for(let i=0;i<bs[1].points.length;i++)for(let j=0;j<bs[1].points.length;j++)assert.ok(Math.abs(bs[1].points[i].distanceTo(bs[1].points[j])-a.get(1).points[i].distanceTo(a.get(1).points[j]))<1e-8);
});
test('pinned and fully masked prefix stays fixed while free tail can comb; pinned descendants anchor parents',()=>{
  const b=branch(0,-1,vec([[0,0,0],[.1,0,1],[.2,0,2],[.3,0,3],[.4,0,4]]));
  for(const protection of [{pinned_points:[2]},{sculpt_mask:[0,0,1,0,0]}]){
    const s=createSculptSnapshot([b],{B0:protection}),a=deformTree(s,new Map([[0,[0,1,1,1,1]]]),new THREE.Vector3(.3,0,0),'COMB');
    for(let i=0;i<=2;i++)near(a.get(0).points[i],s.get(0).points[i]);
    assert.ok(a.get(0).points[4].distanceTo(b.points[4])>.01);lengths(b.points,a.get(0).points);
  }
  const s=createSculptSnapshot([b,branch(1,0,vec([[.2,0,2],[1,0,2],[2,0,2]]))],{B1:{pinned_points:[1]}});
  const a=deformTree(s,new Map([[0,[0,1,1,1,1]]]),new THREE.Vector3(.3,0,0),'COMB');assert.deepEqual(a,s);
});
test('actual build and serialized reload retain combed dense lengths and attached child',()=>{
  const shape=(id,parent,points)=>({id,parent,points,attach:.5,length:3,start_radius:.04,end_radius:.009});
  const authoring=normalizeAuthoring({branch_shape:{branches:[shape('R','',[[0,0,0],[.2,0,1],[.6,.1,2],[.8,0,3]]),shape('C','R',[[.3,0,1.5],[1,0,1.8],[1.3,0,2]])]}});
  const settings={leaf_density:0,child_count:0,branch_levels:4,wind_strength:0};
  const base=buildBranchAsset(settings,null,null,0,authoring),s=createSculptSnapshot(base.masterBranches),r=base.masterBranches[0];
  const a=deformTree(s,new Map([[r.id,r.controlPoints.map((_,i)=>i?1:0)]]),new THREE.Vector3(.3,0,0),'COMB',{strength:1,preserveLength:0});
  authoring.overrides={...authoring.overrides,...sculptOverrides(s,a)};authoring.curve_editor.affect_children=true;
  const rebuilt=buildBranchAsset(settings,null,null,0,normalizeAuthoring(JSON.parse(JSON.stringify(authoring))));
  for(const b of rebuilt.masterBranches){const expected=a.get(b.id);b.points.forEach((p,i)=>near(p,expected.points[i]));lengths(s.get(b.id).points,b.points);}
  disposeBranchAsset(base);disposeBranchAsset(rebuilt);
});
