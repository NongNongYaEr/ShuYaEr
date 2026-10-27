import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import fs from 'node:fs';
import {buildBranchAsset,disposeBranchAsset,deserializeGeometry} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {normalizeSurfaceGrowth} from '../web/surface-growth-data.js';
import {leafBladeArea} from '../web/surface-canopy.js';
import {surfaceNavigation} from '../web/surface-growth-geometry.js';
import {surfaceSegmentBlocked} from '../web/surface-growth-eaves.js';

const pack=JSON.parse(fs.readFileSync(new URL('../web/assets/plants/ivy-v1.json',import.meta.url)));
const sources=pack.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)}));
const settings={seed:45,leaf_scale:.08,max_leaves:80,max_triangles:1000000,radial_segments:4,collision_avoidance:true};
function authoring(top=2.2){return normalizeAuthoring({vine:{species:'IVY',leaf_size:.08},surface_growth:{mesh:{id:'canopy-wall',position:[-1,0,0,1,0,0,1,0,2.4,-1,0,2.4,1,1,2.4,-1,1,2.4],index:[0,1,2,0,2,3,3,4,2,3,5,4]},growth_ruler:{bottom:.02,top,leaf_budget:1600,coverage:.9,budget:180}},profiles:{leaf_scale:[1,1,1]}},settings.seed);}
const build=(a,fast=true)=>buildBranchAsset(settings,null,sources,0,a,{instanced:fast});

test('leaf size, density, spacing and coherent gaps act independently and persist',()=>{
 const a=authoring();a.surface_growth.growth_ruler.leaf_budget=10000;a.vine.foliage=18;
 const assets=[];const make=change=>{const copy=JSON.parse(JSON.stringify(a));change?.(copy);const asset=build(copy);assets.push(asset);return asset;};
 const leaves=asset=>asset.placements.filter(p=>p.canopy),geometry=asset=>asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())]);
 try{
  const base=make(),big=make(b=>b.vine.leaf_size=.16),dense=make(b=>b.vine.foliage=50),spaced=make(b=>b.surface_growth.growth_ruler.leaf_spacing=.12),gaps=make(b=>b.surface_growth.growth_ruler.leaf_gap_ratio=.65),empty=make(b=>b.surface_growth.growth_ruler.leaf_gap_ratio=1);
  assert.ok(leaves(base).length>50);
  assert.deepEqual(leaves(big).map(p=>[p.stableId,p.position.toArray()]),leaves(base).map(p=>[p.stableId,p.position.toArray()]));
  leaves(big).forEach((p,i)=>assert.ok(Math.abs(p.scale/leaves(base)[i].scale-2)<1e-9));
  assert.ok(leaves(dense).length>leaves(base).length*1.3);
  assert.ok(leaves(spaced).length<leaves(base).length*.7);
  const pts=leaves(spaced);for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)assert.ok(pts[i].position.distanceTo(pts[j].position)>=.12-1e-9);
  assert.ok(leaves(gaps).length<leaves(base).length*.8);assert.equal(leaves(empty).length,0);
  for(const asset of assets)assert.deepEqual(geometry(asset),geometry(base),'leaf editing preserves automatic and manual branch skeleton');
  const restored=build(normalizeAuthoring(JSON.parse(JSON.stringify(gaps.authoring)),settings.seed));assets.push(restored);
  assert.deepEqual(leaves(restored).map(p=>[p.stableId,p.position.toArray()]),leaves(gaps).map(p=>[p.stableId,p.position.toArray()]));
 }finally{assets.forEach(disposeBranchAsset);}
});
test('surface canopy uses measured real blade area, independent of small-vine leaf cap',()=>{
 const original=JSON.stringify(pack.leaf_meshes),a=authoring(),asset=build(a);
 try{const leaves=asset.placements.filter(p=>p.canopy);assert.ok(leaves.length>settings.max_leaves*5);assert.ok(leaves.length<=1600);assert.ok(leafBladeArea(sources,.08)>.001);assert.equal(leafBladeArea(sources,.16)/leafBladeArea(sources,.08),4);
  assert.ok(leaves.every(p=>p.scale>=.08*asset.state.leafScale*.78-1e-6&&p.scale<=.08*asset.state.leafScale*1.22+1e-6),JSON.stringify({min:Math.min(...leaves.map(p=>p.scale)),max:Math.max(...leaves.map(p=>p.scale)),state:asset.state,layers:a.attachment_layers}));assert.ok(leaves.every(p=>p.direction.dot(p.normal)>.1&&p.direction.dot(p.normal)<.5));
  const nav=surfaceNavigation(a.surface_growth.mesh);assert.ok(leaves.every(p=>!surfaceSegmentBlocked(nav,p.canopyRoot,p.position,0)),'fine stems remain outside the support');
  const batches=asset.group.getObjectsByProperty('isInstancedMesh',true);assert.ok(batches.length<=12);assert.ok(batches.reduce((n,b)=>n+b.geometry.attributes.position.count,0)<1500,'real geometry is shared, not copied per leaf');assert.equal(JSON.stringify(pack.leaf_meshes),original);
 }finally{disposeBranchAsset(asset);}
});
test('canopy height, exclusion, zero budget and roundtrip preserve deterministic placement',()=>{
 const a=authoring(),first=build(a),round=build(JSON.parse(JSON.stringify(a))),low=build(authoring(.8));
 const sig=b=>b.placements.filter(p=>p.canopy).map(p=>[p.stableId,...p.position.toArray(),p.branchStableId,p.scale]);
 try{assert.deepEqual(sig(first),sig(round));assert.ok(low.placements.filter(p=>p.canopy).every(p=>p.position.z<.8));const blocked=authoring();blocked.surface_growth.blocked=[0,1];const off=build(blocked);try{assert.equal(off.placements.filter(p=>p.canopy).length,0);}finally{disposeBranchAsset(off);}
 const zero=authoring();zero.surface_growth.growth_ruler.leaf_budget=0;const empty=build(zero);try{assert.equal(empty.placements.filter(p=>p.canopy).length,0);}finally{disposeBranchAsset(empty);}
 assert.deepEqual(normalizeSurfaceGrowth(a.surface_growth),a.surface_growth);
 }finally{[first,round,low].forEach(disposeBranchAsset);}
});
test('instanced canopy matches expanded export vertices, source IDs and hierarchy; buffers release once',()=>{
 const a=authoring();a.surface_growth.growth_ruler.leaf_budget=120;const fast=build(a),full=build(a,false);
 try{assert.deepEqual(fast.placements.map(p=>[p.stableId,p.position.toArray(),p.scale]),full.placements.map(p=>[p.stableId,p.position.toArray(),p.scale]));
  const lookup=(asset,g,i)=>asset.elements[Math.floor(g.attributes.uv1.getX(i)*asset.lookupTexture.width)+Math.floor(g.attributes.uv1.getY(i)*asset.lookupTexture.height)*asset.lookupTexture.width];
  const batches=fast.group.getObjectsByProperty('isInstancedMesh',true).filter(m=>m.userData.canopy_instances);
  for(const batch of batches){const matrix=new THREE.Matrix4();for(const copy of [0,batch.count-1]){batch.getMatrixAt(copy,matrix);const id=fast.elements[batch.userData.instance_elements[copy]].id;let found=false;
    full.group.traverse(mesh=>{if(mesh.userData.category!=='leaf'||mesh.userData.source_index!==batch.userData.source_index)return;const g=mesh.geometry;for(let i=0;i<g.attributes.position.count;i++){if(lookup(full,g,i)?.id!==id)continue;const offset=batch.name.startsWith('M_Leaf_')?8:0;for(let j=0;j<batch.geometry.attributes.position.count;j++){const expected=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i+offset+j),actual=new THREE.Vector3().fromBufferAttribute(batch.geometry.attributes.position,j).applyMatrix4(matrix);assert.ok(actual.distanceTo(expected)<1e-5);}found=true;break;}});assert.ok(found);
  }}
  let released=0;const all=fast.group.getObjectsByProperty('isInstancedMesh',true);all.forEach(o=>o.addEventListener('dispose',()=>released++));fast.materialize();assert.equal(released,all.length);assert.equal(fast.group.getObjectsByProperty('isInstancedMesh',true).length,0);assert.equal(fast.placements.length,full.placements.length);
 }finally{disposeBranchAsset(fast);disposeBranchAsset(full);}
});

test('automatic hanging reuses the existing switch and keeps its root connected beneath the soffit',()=>{
 const a=authoring(2.6);a.surface_growth.auto_hang=true;const asset=build(a);
 try{const hangs=asset.masterBranches.filter(b=>b.vineRole==='SURFACE_HANG');assert.ok(hangs.length>0);
  const nav=surfaceNavigation(a.surface_growth.mesh);for(const b of hangs){const parent=asset.masterBranches.find(p=>p.id===b.parentId);assert.ok(parent);assert.ok(parent.points.some(p=>p.distanceTo(b.points[0])<1e-5));assert.ok(b.points.at(-1).z<b.points[0].z);
   for(let i=1;i<b.points.length;i++)assert.equal(surfaceSegmentBlocked(nav,b.points[i-1],b.points[i],0),false);
  }
 }finally{disposeBranchAsset(asset);}
});

test('independent recipe controls preserve stems, legacy results and diagnostic accounting',()=>{
 const a=authoring();a.surface_growth.growth_ruler.leaf_budget=4000;const assets=[];
 const make=(raw,change)=>{const copy=structuredClone(raw);change?.(copy);const asset=build(copy);assets.push(asset);return asset;};
 const signature=asset=>asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())]);
 const leaves=asset=>asset.placements.filter(p=>p.canopy).map(p=>[p.stableId,p.position.toArray(),p.scale,p.branchStableId]);
 try{
  const legacy=make(a),oldRaw=structuredClone(a);for(const k of ['recipe_version','main_density','side_density','distribution','stem_seed','leaf_seed','gap_seed'])delete oldRaw.surface_growth.growth_ruler[k];const old=make(oldRaw);assert.deepEqual(leaves(old),leaves(legacy));assert.deepEqual(signature(old),signature(legacy));
  const modern=structuredClone(a);modern.surface_growth.growth_ruler.recipe_version=2;
  const base=make(modern),half=make(modern,x=>x.surface_growth.growth_ruler.height_density=[.5,.5,.5,.5,.5]),sparse=make(modern,x=>x.vine.foliage=8),reroll=make(modern,x=>x.surface_growth.growth_ruler.leaf_seed+=101),gaps=make(modern,x=>x.surface_growth.growth_ruler.leaf_gap_ratio=.5);
  for(const asset of [half,sparse,reroll,gaps])assert.deepEqual(signature(asset),signature(base));assert.ok(leaves(half).length<leaves(base).length);assert.notDeepEqual(leaves(reroll),leaves(base));
  const noSides=make(modern,x=>x.surface_growth.growth_ruler.side_density=0);assert.ok(noSides.masterBranches.length<base.masterBranches.length);assert.deepEqual(noSides.masterBranches.filter(b=>!b.stableId.includes('.B')).map(b=>[b.stableId,b.points.map(p=>p.toArray())]),base.masterBranches.filter(b=>!b.stableId.includes('.B')).map(b=>[b.stableId,b.points.map(p=>p.toArray())]));
  for(const asset of [base,half,sparse,reroll,gaps]){const report=asset.report.surface_canopy,values=Object.values(report.stages);for(let i=1;i<values.length;i++)assert.ok(values[i]<=values[i-1]);assert.equal(report.stages.output,leaves(asset).length);assert.equal(report.budgetRemoved,report.stages.spacing-report.stages.output);}
  const round=make(normalizeAuthoring(JSON.parse(JSON.stringify(modern)),settings.seed));assert.deepEqual(leaves(round),leaves(base));
  const expanded=build(modern,false);assets.push(expanded);assert.deepEqual(leaves(expanded),leaves(base));assert.deepEqual(signature(expanded),signature(base));
 }finally{assets.forEach(disposeBranchAsset);}
});
