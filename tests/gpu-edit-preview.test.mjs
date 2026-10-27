import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { buildBranchAsset, disposeBranchAsset, deserializeGeometry, normalizeSettings, createProjectDocument } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { createSculptSnapshot, advanceSculptSnapshot, createMeshPreview, createCpuMeshPreview, deformTree } from '../web/tree-sculpt.js';
import { createPVESkeleton, validatePVESkeleton } from '../web/pve-skeleton-export.js';
import { evaluateRootScale } from '../web/branch-root-scale.js';
import { nativeModelRevision } from '../web/native-model-changes.js';
import {withAxisTimes} from '../web/branch-axis.js';
const file=new URL('../次枝资产/全植物次枝成品V1/红叶石楠/红叶石楠_短弯细梢_红嫩叶_成品V1.branchasset.json',import.meta.url);
const source=JSON.parse(fs.readFileSync(file,'utf8')).asset;
const allocated=[],sources=[];test.afterEach(()=>{allocated.splice(0).forEach(disposeBranchAsset);sources.splice(0).forEach(s=>s.geometry.dispose());});
function fixture(instanced=true){
  const leaves=source.sample.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)}));sources.push(...leaves);
  const settings=normalizeSettings({seed:42,leaf_density:0,petiole_length:0,wind_strength:0,collision_avoidance:false});
  const authoring=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,1],[.2,0,2],[.1,0,3]],start_radius:.13,end_radius:.04}]},
    branch_library:[source],branch_instances:[0,1].map((n)=>({id:'I'+n,asset_id:source.id,parent:'ROOT',linked:true,attach:.35+n*.4,scale:.5+n*.2,radius_scale:.8+n*.4,angle:60,azimuth:n*77,variation:0,seed:42})),
    recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},tree_organs:{...source.sample.authoring.tree_organs,mode:'LEAVES'}},42);
  const build=()=>{const a=buildBranchAsset(settings,null,leaves,0,authoring,{instanced});allocated.push(a);return a;};return {build,authoring,leaves};
}
function compare(gpu,preview,cpu){
  const expected=new Map();cpu.group.traverse(m=>{if(m.isMesh)expected.set(m.name,m);});let vertices=0;
  gpu.group.traverse(mesh=>{
    if(!mesh.isMesh)return;const descriptors=gpu.editPreviewBindings?.(mesh)?.instances;
    for(let n=0;n<(mesh.isInstancedMesh?mesh.count:1);n++){
      const d=descriptors?.[n];let target;
      if(d&&mesh.userData.category==='branch'){const id=d.object().userData.stable_id;target=[...expected.values()].find(m=>m.userData.stable_id===id);}
      else target=expected.get(d?d.id+'_'+mesh.name.slice('复用_'.length):mesh.name);
      assert.ok(target,'matching expanded mesh '+mesh.name);const p=target.geometry.getAttribute('position'),normal=target.geometry.getAttribute('normal');
      for(let i=0;i<p.count;i++){
        const actual=preview.vertex(mesh,i,n).applyMatrix4(mesh.matrix),want=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(target.matrix);
        assert.ok(actual.distanceTo(want)<8e-5,`${mesh.name}:${n}:${i} distance=${actual.distanceTo(want)}`);
        if(normal){const actualNormal=preview.normal(mesh,i,n).applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrix)).normalize(),wantNormal=new THREE.Vector3().fromBufferAttribute(normal,i).applyMatrix3(new THREE.Matrix3().getNormalMatrix(target.matrix)).normalize();assert.ok(actualNormal.distanceTo(wantNormal)<.002);}
        vertices++;
      }
    }
  });assert.ok(vertices>1000);return vertices;
}

for(const [name,beforeTimes,afterTimes]of [
 ['nonuniform source',[0,.04,.91,1],null],
 ['nonuniform target',null,[0,.16,.72,1]],
 ['different nonuniform grids',[0,.04,.91,1],[0,.16,.72,1]],
 ['inserted target samples',[0,.04,.91,1],[0,.02,.17,.79,.96,1]],
])test('live GPU deformation matches the independent CPU preview with '+name,()=>{
 const f=fixture(),g=fixture(false);for(const x of [f,g])if(beforeTimes)x.authoring.branch_shape.branches[0].sample_times=beforeTimes;
 const gpu=f.build(),cpu=g.build(),snapshot=createSculptSnapshot(gpu.masterBranches),other=createSculptSnapshot(cpu.masterBranches),p=createMeshPreview(gpu,snapshot,{gpu:true}),c=createCpuMeshPreview(cpu,other),root=[...snapshot.values()].find(b=>b.stableId==='ROOT');
 const times=afterTimes||[0,1/3,2/3,1],points=times.map(t=>new THREE.Vector3(.35*Math.sin(t*2.1),.2*t,3*t));
 const after={...root,points:afterTimes?withAxisTimes(points,times):points};const updated=new Map(snapshot);updated.set(root.id,after);
 p.update(updated);c.update(updated);compare(gpu,p,cpu);p.update(snapshot);c.update(other);compare(gpu,p,cpu);p.restore();c.restore();
});
test('GPU palette agrees with expanded CPU vertices/normals for rigid roll, local sculpt and return to rest; shares real leaf/flower prototypes',()=>{
  const f=fixture(),gpu=f.build(),cpu=f.build(),snapshot=createSculptSnapshot(gpu.masterBranches),other=createSculptSnapshot(cpu.masterBranches);
  const original=createProjectDocument(gpu,f.leaves,f.authoring),saved=[];gpu.group.traverse(m=>{if(m.isMesh)saved.push([m,m.geometry,m.material,m.raycast,m.customDepthMaterial]);});
  const beforeMeshes=saved.length,originalRevision=nativeModelRevision(gpu),p=createMeshPreview(gpu,snapshot,{gpu:true}),c=createCpuMeshPreview(cpu,other),installedRevision=nativeModelRevision(gpu);
  assert(installedRevision>originalRevision,'installing cloned preview geometry invalidates the retained model');
  const nativeTextures=p.nativeTextures;assert.equal(nativeTextures.length,2);assert(Object.isFrozen(nativeTextures));
  assert.equal(p.stats.mode,'GPU');assert.equal(gpu.isInstancedAssembly,true);let count=0;gpu.group.traverse(m=>{if(m.isMesh)count++;});assert.equal(count,beforeMeshes);
  const matrix=new THREE.Matrix4().makeRotationZ(.65);matrix.setPosition(.3,-.2,.1);const ids=new Set(snapshot.keys());p.updateRigid(matrix,ids);c.updateRigid(matrix,ids);compare(gpu,p,cpu);
  assert.equal(p.nativeTextures,nativeTextures);assert.equal(nativeModelRevision(gpu),installedRevision,'palette updates do not invalidate unchanged model geometry');
  const weights=new Map([...snapshot].map(([id,b])=>[id,b.controlPoints.map((_,i)=>id===0&&i>0?.5:0)]));
  const updated=deformTree(snapshot,weights,new THREE.Vector3(.15,-.1,.08),'GRAB',{preserveLength:.85,strength:.5});
  p.update(updated);c.update(updated);compare(gpu,p,cpu);
  const unit=[...snapshot.values()].find(b=>b.instanceId==='I0'),partial=new Map(snapshot);partial.set(unit.id,{...unit,points:unit.points.map((v,i)=>v.clone().add(new THREE.Vector3(i*.002,0,0)))});
  p.update(partial);c.update(partial);compare(gpu,p,cpu);assert.equal(p.stats.updatedBranches,1);p.update(partial);assert.ok(p.stats.updatedFrames<p.stats.frames/2);
  p.update(snapshot);c.update(snapshot);compare(gpu,p,cpu);assert.equal(p.stats.updatedBranches,0);
  const savedDocument=createProjectDocument(gpu,f.leaves,f.authoring);savedDocument.saved_at=original.saved_at;
  const hash=doc=>createHash('sha256').update(JSON.stringify(doc)).digest('hex');assert.equal(hash(savedDocument),hash(original));p.restore();p.restore();c.restore();
  assert.equal(p.nativeTextures,null);assert(nativeModelRevision(gpu)>installedRevision,'restoring source geometry invalidates the installed preview');
  for(const [m,g,material,cast,depth]of saved){assert.equal(m.geometry,g);assert.equal(m.material,material);assert.equal(m.raycast,cast);assert.equal(m.customDepthMaterial,depth);assert.equal(m.geometry.hasAttribute('duckEditVertex'),false);}
  const repeated=createMeshPreview(gpu,createSculptSnapshot(gpu.masterBranches),{gpu:true});assert.equal(repeated.stats.cachedBindings,true);repeated.update(updated);repeated.restore();
  assert.equal(validatePVESkeleton(createPVESkeleton(gpu,f.leaves)).valid,true);
});

test('nonuniform carrier comb keeps complete installed followers on the same rigid mounts as the independent CPU path',()=>{
 const f=fixture(),g=fixture(false);for(const x of [f,g])x.authoring.branch_shape.branches[0].sample_times=[0,.04,.91,1];const gpu=f.build(),cpu=g.build(),snapshot=createSculptSnapshot(gpu.masterBranches),other=createSculptSnapshot(cpu.masterBranches),root=[...snapshot.values()].find(b=>b.stableId==='ROOT'),targets=new Set([root.stableId]),p=createMeshPreview(gpu,snapshot,{gpu:true,targets,rigidFollowers:true}),c=createCpuMeshPreview(cpu,other);
 const weights=new Map([...snapshot].map(([id,b])=>[id,b.controlPoints.map((_,i)=>id===root.id&&i>0?.7:0)])),options={preserveLength:.85,strength:.6,rigidUnitFollowers:new Set(['I0','I1']),worldRadius:2,center3d:new THREE.Vector3(.1,0,2)};
 const updated=deformTree(snapshot,weights,new THREE.Vector3(.4,-.2,.1),'COMB',options);assert.notEqual(updated.get(root.id),root);assert([...updated.values()].some(b=>b.sculptFollowMatrix));p.update(updated);c.update(updated);compare(gpu,p,cpu);p.restore();c.restore();
});

test('a branch first following its parent then hit by the brush leaves rigid preview mode and matches independent CPU vertices',()=>{
 const f=fixture(),gpu=f.build(),cpu=f.build(),snapshot=createSculptSnapshot(gpu.masterBranches),root=snapshot.get(0),unit=[...snapshot.values()].find(b=>b.instanceId==='I0'),targets=new Set([root.stableId,unit.stableId]),p=createMeshPreview(gpu,snapshot,{gpu:true,targets,rigidFollowers:true}),c=createCpuMeshPreview(cpu,snapshot);
 const first=deformTree(snapshot,new Map([[0,root.controlPoints.map((_,i)=>i?.7:0)]]),new THREE.Vector3(.15,-.1,.06),'COMB',{worldRadius:1,strength:.7});assert(first.get(unit.id).sculptFollowMatrix);const working=advanceSculptSnapshot(snapshot,first),weights=new Map([[unit.id,unit.controlPoints.map((_,i)=>i?.8:0)]]),after=deformTree(working,weights,new THREE.Vector3(-.1,.08,.05),'COMB',{worldRadius:.5,strength:.8});assert.equal(after.get(unit.id).sculptFollowMatrix,undefined);p.update(after);c.update(after);compare(gpu,p,cpu);p.restore();c.restore();
});
test('GPU preview supports exact point-dependent rigid transforms, transformed asset parent and lazy picking at displaced position',()=>{
  const f=fixture(false),gpu=f.build(),cpu=f.build();gpu.group.position.set(1,2,3);cpu.group.position.copy(gpu.group.position);
  const snapshot=createSculptSnapshot(gpu.masterBranches),p=createMeshPreview(gpu,snapshot,{gpu:true}),c=createCpuMeshPreview(cpu,snapshot);
  const transforms=new Map([...snapshot].map(([id])=>[id,{at:t=>({matrix:new THREE.Matrix4().makeTranslation(.1*t,0,0),normal:new THREE.Matrix3()})}]));p.update(snapshot,transforms);c.update(snapshot,transforms);compare(gpu,p,cpu);
  const translated=new THREE.Matrix4().makeTranslation(10,0,0);p.updateRigid(translated,new Set(snapshot.keys()));
  const mesh=gpu.branchMesh?.('ROOT')||gpu.group.getObjectByProperty('name','枝段_B001_L0');assert.ok(mesh);
  gpu.group.updateMatrixWorld(true);const target=p.vertex(mesh,0).applyMatrix4(mesh.matrixWorld),ray=new THREE.Raycaster(target.clone().add(new THREE.Vector3(0,-1,0)),new THREE.Vector3(0,1,0));
  assert.ok(ray.intersectObject(mesh).length>0,'raycaster sees GPU-displaced geometry');p.restore();c.restore();
});

test('scoped complete-unit binding skips unrelated source vertices without changing their positions or normals',()=>{
  const f=fixture(),gpu=f.build(),cpu=f.build(),snapshot=createSculptSnapshot(gpu.masterBranches),unit=[...snapshot.values()].find(b=>b.instanceId==='I0');
  const targets=new Set([unit.stableId]),ids=new Set([...snapshot.values()].filter(b=>b.instanceId==='I0').map(b=>b.id)),p=createMeshPreview(gpu,snapshot,{gpu:true,targets,rigid:true}),c=createCpuMeshPreview(cpu,snapshot);
  assert(p.stats.skippedVertices>1000);assert(p.stats.bindingVertices<p.stats.vertices);assert(p.stats.lookupVertices<p.stats.vertices);
  const matrix=new THREE.Matrix4().makeRotationY(.3);matrix.setPosition(.2,0,-.1);p.updateRigid(matrix,ids);c.updateRigid(matrix,ids);compare(gpu,p,cpu);p.restore();c.restore();
});

test('mixed installed batches share one identity lookup span and preserve every inactive whole unit',()=>{
  const f=fixture(),gpu=f.build(),cpu=f.build(),snapshot=createSculptSnapshot(gpu.masterBranches),targets=new Set([...snapshot.values()].filter(b=>b.instanceId==='I0').map(b=>b.stableId)),ids=new Set([...snapshot.values()].filter(b=>b.instanceId==='I0').map(b=>b.id));
  assert.equal(gpu.report.compiled_samples,1);const p=createMeshPreview(gpu,snapshot,{gpu:true,targets,rigid:true}),c=createCpuMeshPreview(cpu,snapshot);
  const matrix=new THREE.Matrix4().makeTranslation(.3,-.2,.1);p.updateRigid(matrix,ids);c.updateRigid(matrix,ids);compare(gpu,p,cpu);
  assert(p.stats.lookupVertices<=p.stats.vertices);assert.equal(p.stats.bindingVertices+p.stats.skippedVertices,p.stats.vertices);
  const lookup=p.textures[0].image.data;gpu.group.traverse(mesh=>{if(!mesh.__branchForgeNativeEdit)return;const descriptors=gpu.editPreviewBindings(mesh)?.instances;if(!descriptors)return;for(let n=0;n<descriptors.length;n++)if(descriptors[n].id==='I1')for(let v=0;v<mesh.geometry.attributes.position.count;v++)assert.equal(lookup[mesh.__branchForgeNativeEdit.offsets[n]+v],0,'inactive instance shader reads the identity frame');});
  p.restore();c.restore();
});

test('cached bindings invalidate on in-place instance uploads, source attributes, and mesh-local transforms',()=>{
  const f=fixture(),asset=f.build(),snapshot=createSculptSnapshot(asset.masterBranches);let mesh;asset.group.traverse(m=>{if(!mesh&&m.isInstancedMesh)mesh=m;});assert(mesh);
  const initial=createMeshPreview(asset,snapshot,{gpu:true});initial.restore();
  for(const mutate of [()=>{const matrix=new THREE.Matrix4();mesh.getMatrixAt(0,matrix);matrix.premultiply(new THREE.Matrix4().makeTranslation(.4,0,0));mesh.setMatrixAt(0,matrix);mesh.instanceMatrix.needsUpdate=true;},()=>{mesh.geometry.attributes.position.needsUpdate=true;},()=>{mesh.position.z+=.1;mesh.updateMatrix();}]){
    mutate();const p=createMeshPreview(asset,snapshot,{gpu:true});assert.equal(p.stats.cachedBindings,false);const g=mesh.geometry.getAttribute('position'),matrix=new THREE.Matrix4();mesh.getMatrixAt(0,matrix);
    const expected=new THREE.Vector3().fromBufferAttribute(g,0),center=mesh.geometry.getAttribute('sampleCenter');if(center){const radius=mesh.geometry.getAttribute('sampleRadius').getX(0);expected.sub(new THREE.Vector3().fromBufferAttribute(center,0)).multiplyScalar(radius).add(new THREE.Vector3().fromBufferAttribute(center,0));}expected.applyMatrix4(matrix);
    assert(p.vertex(mesh,0,0).distanceTo(expected)<1e-6);p.restore();
  }
});

test('pinning a formerly rigid follower invalidates its cached per-branch binding layout',()=>{
  const f=fixture(),asset=f.build(),snapshot=createSculptSnapshot(asset.masterBranches),options={gpu:true,targets:new Set(['ROOT']),rigidFollowers:true};
  const first=createMeshPreview(asset,snapshot,options),frames=first.stats.frames;first.restore();
  const follower=[...snapshot.values()].find(b=>b.instanceId==='I0');follower.pins.add(1);
  const pinned=createMeshPreview(asset,snapshot,options);assert.equal(pinned.stats.cachedBindings,false);assert(pinned.stats.frames>frames);pinned.restore();
});

test('incremental complete-placement palette matches CPU geometry, including in-place matrices and removed targets',()=>{
  const f=fixture(),gpu=f.build(),cpu=f.build(),snapshot=createSculptSnapshot(gpu.masterBranches);
  const p=createMeshPreview(gpu,snapshot,{gpu:true,rigid:true}),c=createCpuMeshPreview(cpu,snapshot);
  const ids=gpu.masterBranches.filter(b=>b.instanceId==='I0').map(b=>b.id),transforms=new Map();
  const matrix=new THREE.Matrix4().makeRotationX(.3).scale(new THREE.Vector3(1.1,1.1,1.1));matrix.setPosition(.1,-.2,.03);
  const normal=new THREE.Matrix3().getNormalMatrix(matrix);
  for(const id of ids)transforms.set(id,{matrix,normal});
  p.updateTransforms(transforms);c.update(snapshot,transforms);compare(gpu,p,cpu);
  assert.ok(p.stats.updatedFrames>0);const active=p.stats.updatedBranches;
  p.updateTransforms(transforms);assert.equal(p.stats.updatedFrames,0,'unchanged placement uploads no frames');assert.equal(p.stats.updatedBranches,active);
  matrix.premultiply(new THREE.Matrix4().makeRotationZ(-.2));
  normal.getNormalMatrix(matrix);
  p.updateTransforms(transforms);c.update(snapshot,transforms);compare(gpu,p,cpu);assert.ok(p.stats.updatedFrames>0,'mutating a shared matrix is detected');
  transforms.delete(ids[0]);p.updateTransforms(transforms);c.update(snapshot,transforms);compare(gpu,p,cpu);
  p.updateRigid(new THREE.Matrix4().makeTranslation(2,0,0),new Set(ids));
  p.updateTransforms(transforms);c.update(snapshot,transforms);compare(gpu,p,cpu);
  transforms.clear();p.updateTransforms(transforms);c.update(snapshot,transforms);compare(gpu,p,cpu);assert.equal(p.stats.updatedBranches,0);
  p.restore();c.restore();
});
test('unsupported material and texture budget use CPU fallback; disposing an active preview restores shared geometry',()=>{
  const f=fixture(),gpu=f.build();gpu.editPreviewTextureLimit=1;const snapshot=createSculptSnapshot(gpu.masterBranches),fallback=createMeshPreview(gpu,snapshot,{gpu:true});assert.equal(fallback.stats,undefined);fallback.restore();
  const next=f.build(),p=createMeshPreview(next,createSculptSnapshot(next.masterBranches),{gpu:true});assert.equal(p.stats.mode,'GPU');disposeBranchAsset(next);assert.equal(next.activeEditPreview,undefined);allocated.splice(allocated.indexOf(next),1);
});

test('scoped rigid followers match exact CPU sculpt, including leaves/flowers; changing scope invalidates bindings',()=>{
  const f=fixture(),gpu=f.build(),cpu=f.build(),snapshot=createSculptSnapshot(gpu.masterBranches),c=createCpuMeshPreview(cpu,snapshot);
  const p=createMeshPreview(gpu,snapshot,{gpu:true,targets:new Set(['ROOT']),rigidFollowers:true});
  const weights=new Map([...snapshot].map(([id,b])=>[id,b.controlPoints.map((_,i)=>id===0&&i>0?.5:0)]));
  const updated=deformTree(snapshot,weights,new THREE.Vector3(.15,-.1,.08),'GRAB',{preserveLength:.85,strength:.5});
  p.update(updated);c.update(updated);compare(gpu,p,cpu);const compactFrames=p.stats.frames;p.restore();c.restore();
  const full=createMeshPreview(gpu,snapshot,{gpu:true});assert.equal(full.stats.cachedBindings,false);assert.ok(full.stats.frames>compactFrames*2);full.restore();
  const scoped=createMeshPreview(gpu,snapshot,{gpu:true,targets:new Set(['I0.B001']),rigid:true});
  assert.equal(scoped.stats.cachedBindings,false);scoped.restore();
});

test('continuous brush incremental snapshots preserve exact deformation, pins and masks while sharing untouched branches',()=>{
  const f=fixture(),asset=f.build(),initial=createSculptSnapshot(asset.masterBranches),unit=[...initial.values()].find(b=>b.instanceId==='I0');
  unit.pins.add(1);unit.mask[2]=.4;
  let incremental=initial,reference=createSculptSnapshot([...initial.values()],Object.fromEntries([...initial.values()].map(b=>[b.stableId,{pinned_points:[...b.pins],sculpt_mask:b.mask}])));
  for(let sample=0;sample<8;sample++){
    const weights=new Map([...incremental].map(([id,b])=>[id,b.controlPoints.map((_,i)=>id===unit.id&&i>1?.5:0)]));
    const a=deformTree(incremental,weights,new THREE.Vector3(.005,-.002,0),'COMB',{strength:.5,worldRadius:.5});
    const b=deformTree(reference,weights,new THREE.Vector3(.005,-.002,0),'COMB',{strength:.5,worldRadius:.5});
    incremental=advanceSculptSnapshot(incremental,a);reference=createSculptSnapshot([...b.values()],Object.fromEntries([...b.values()].map(v=>[v.stableId,{pinned_points:[...v.pins],sculpt_mask:v.mask}])));
    for(const [id,branch]of incremental){const other=reference.get(id);assert.deepEqual(branch.points,other.points);assert.deepEqual(branch.controlPoints,other.controlPoints);assert.deepEqual(branch.pins,other.pins);assert.deepEqual(branch.mask,other.mask);assert.deepEqual(branch.sampleBindings,other.sampleBindings);}
    assert.equal(incremental.get(0),initial.get(0),'untouched supporting root remains shared');
  }
});

test('continuous carrier comb preserves full sample roll in GPU and CPU foliage/flower previews',async()=>{
  const {rigidSculptInstances}=await import('../web/sculpt-instance-follow.js');
  const f=fixture(),gpu=f.build(),cpu=f.build(),snapshot=createSculptSnapshot(gpu.masterBranches);
  const p=createMeshPreview(gpu,snapshot,{gpu:true,targets:new Set(['ROOT']),rigidFollowers:true}),c=createCpuMeshPreview(cpu,snapshot);
  const root=snapshot.get(0),weights=new Map([[0,root.controlPoints.map((_,i)=>i?.7:0)]]);
  let working=snapshot,updated;
  for(let n=0;n<6;n++){
    updated=deformTree(working,weights,new THREE.Vector3(.02,-.01,.005),'COMB',{strength:.8,worldRadius:1,rigidUnitFollowers:rigidSculptInstances(f.authoring)});
    working=advanceSculptSnapshot(working,updated);
  }
  assert.ok([...updated.values()].some(b=>b.instanceId&&b.sculptFollowMatrix));
  p.update(updated);c.update(updated);compare(gpu,p,cpu);
  p.update(snapshot);c.update(snapshot);compare(gpu,p,cpu);p.restore();c.restore();
});

test('scoped root scale keeps installed unit dimensions and renders their exact rigid attachment transforms',()=>{
  const f=fixture(),gpu=f.build(),cpu=f.build(),snapshot=createSculptSnapshot(gpu.masterBranches);
  const updated=new Map(evaluateRootScale([...snapshot.values()],{targets:['ROOT'],scale:[1.4,.8,1.2]},1,{}).map(b=>[b.id,b]));
  const transforms=new Map();for(const b of updated.values()){const old=snapshot.get(b.id);if((b.instanceId||b.unitOwner)&&b!==old&&b.mountMatrix){const matrix=b.mountMatrix.clone().multiply((old.mountMatrix||new THREE.Matrix4()).clone().invert());transforms.set(b.id,{matrix,normal:new THREE.Matrix3().getNormalMatrix(matrix)});}}
  const p=createMeshPreview(gpu,snapshot,{gpu:true,targets:new Set(['ROOT']),rigidUnits:true}),c=createCpuMeshPreview(cpu,snapshot);p.update(updated,transforms);c.update(updated,transforms);compare(gpu,p,cpu);
  for(const [id,b]of updated)if(b.instanceId||b.unitOwner){const old=snapshot.get(id);for(let i=1;i<b.points.length;i++)assert.ok(Math.abs(b.points[i].distanceTo(b.points[0])-old.points[i].distanceTo(old.points[0]))<1e-8);}
  p.restore();c.restore();
});

test('full 1126-unit camphor fits 4096 texture limits; scoped rigid preview matches full curve palette without expanding instances',()=>{
  const doc=JSON.parse(fs.readFileSync(new URL('../assets/tree-template-library/template-a5e7e5356aeeadd6663f025a8c156d39.branch.json',import.meta.url),'utf8'));
  const leaves=doc.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)}));sources.push(...leaves);
  const authoring=normalizeAuthoring(doc.authoring,doc.settings.seed),asset=buildBranchAsset(doc.settings,null,leaves,0,authoring,{instanced:true});allocated.push(asset);
  asset.editPreviewTextureLimit=4096;const snapshot=createSculptSnapshot(asset.masterBranches),root=[...snapshot.values()].find(b=>!b.instanceId&&!b.unitOwner&&b.parentId>=0);
  const {targets,ids}=(()=>{const targets=new Set([root.stableId]),ids=new Set([root.id]);let more=true;while(more){more=false;for(const b of snapshot.values())if(ids.has(b.parentId)&&!ids.has(b.id)){ids.add(b.id);more=true;}}return {targets,ids};})();
  const matrix=new THREE.Matrix4().makeRotationZ(.2);matrix.setPosition(.1,-.2,.05);
  const full=createMeshPreview(asset,snapshot,{gpu:true});assert.equal(full.stats.mode,'GPU');assert.ok(full.textures.every(t=>t.image.width<=4096&&t.image.height<=4096));
  full.updateRigid(matrix,ids);const checks=[];asset.group.traverse(m=>{if(!m.isMesh)return;for(const n of new Set([0,Math.floor((m.isInstancedMesh?m.count:1)/2)]))for(const i of [0,Math.floor(m.geometry.getAttribute('position').count/2)])checks.push({mesh:m,index:i,instance:n,vertex:full.vertex(m,i,n).toArray(),normal:full.normal(m,i,n)?.toArray()});});
  const fullFrames=full.stats.frames;full.restore();const compact=createMeshPreview(asset,snapshot,{gpu:true,targets,rigid:true});assert.equal(compact.stats.mode,'GPU');compact.updateRigid(matrix,ids);
  assert.ok(compact.stats.frames<fullFrames/100);assert.equal(asset.isInstancedAssembly,true);
  for(const c of checks){assert.ok(compact.vertex(c.mesh,c.index,c.instance).distanceTo(new THREE.Vector3(...c.vertex))<1e-5);if(c.normal)assert.ok(compact.normal(c.mesh,c.index,c.instance).distanceTo(new THREE.Vector3(...c.normal))<1e-5);}
  compact.restore();assert.equal(authoring.branch_instances.length,1126);
});
