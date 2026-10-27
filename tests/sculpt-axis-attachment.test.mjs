import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {axisTimes,withAxisTimes} from '../web/branch-axis.js';
import {createSculptSnapshot,deformTree,sculptOverrides,sampleLine,advanceSculptSnapshot} from '../web/tree-sculpt.js';
import {captureSculptLayer,applySculptLayers} from '../web/generator-geometry.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {buildBranchAsset,disposeBranchAsset} from '../web/branch-kernel.js';
import {createPVESkeleton,validatePVESkeleton} from '../web/pve-skeleton-export.js';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const v=p=>new THREE.Vector3(...p),near=(a,b,label)=>assert.ok(a.distanceTo(b)<1e-8,`${label}: ${a.toArray()} != ${b.toArray()}`);
const settings={leaf_density:0,child_count:0,wind_strength:0,junction_collar:false};
const fixture=()=>normalizeAuthoring({branch_shape:{branches:[
  {id:'R',points:[[0,0,0],[0,0,.12],[.5,0,1],[1,0,2]],knots:[[0,0,0],[0,0,.12],[.5,0,1],[1,0,2]],sample_times:[0,.02,.2,1],length:2.3,start_radius:.05,end_radius:.01},
  {id:'C',parent:'R',attach:.45,points:[[.65625,0,1.3125],[1,0,1.5],[2,0,1.6]],length:1.5,start_radius:.025,end_radius:.005},
  {id:'G',parent:'C',attach:.6,points:[[1.2,0,1.52],[1.5,.2,2]],length:.6,start_radius:.01,end_radius:.003},
]}});
const build=a=>buildBranchAsset(settings,null,[],0,a,{skeletonOnly:true});
const brush=(asset,delta=new THREE.Vector3(.4,0,.3))=>{
  const snapshot=createSculptSnapshot(asset.masterBranches,asset.authoring.overrides),root=asset.masterBranches[0];
  const updated=deformTree(snapshot,new Map([[root.id,root.controlPoints.map((_,i)=>i?1:0)]]),delta,'COMB',{strength:1,worldRadius:1});
  return {snapshot,updated,overrides:sculptOverrides(snapshot,updated,asset.authoring.overrides)};
};
function matches(asset,expected){
  const byId=new Map(asset.masterBranches.map(b=>[b.id,b]));
  for(const b of asset.masterBranches){
    const e=expected.get(b.id);assert.equal(b.points.length,e.points.length);
    b.points.forEach((p,i)=>near(p,e.points[i],b.stableId));
    b.controlPoints.forEach((p,i)=>near(p,e.controlPoints[i],b.stableId+' control'));
    assert.deepEqual(axisTimes(b.points),axisTimes(e.points));
    const p=byId.get(b.parentId);if(p)near(b.points[0],sampleLine(p.points,b.parentT),b.stableId+' attachment');
  }
}
test('uneven carrier keeps child and grandchild attached throughout continuous comb previews',()=>{
  const asset=build(fixture());try{
    const first=brush(asset),root=asset.masterBranches[0];
    assert.deepEqual(axisTimes(first.updated.get(root.id).points),axisTimes(root.points));
    let current=advanceSculptSnapshot(first.snapshot,first.updated);
    for(let n=0;n<8;n++){
      const next=deformTree(current,new Map([[root.id,root.controlPoints.map((_,i)=>i?1:0)]]),v([-.08,.03,.04]),'COMB',{strength:1});
      for(const b of next.values()){
        const parent=next.get(b.parentId);if(parent)near(b.points[0],sampleLine(parent.points,b.parentT),'preview attach');
        assert.deepEqual(axisTimes(b.points),axisTimes(current.get(b.id).points));
        for(let i=1;i<b.points.length;i++)assert.ok(Math.abs(b.points[i].distanceTo(b.points[i-1])-current.get(b.id).points[i].distanceTo(current.get(b.id).points[i-1]))<1e-9);
      }
      current=advanceSculptSnapshot(current,next);
    }
  }finally{disposeBranchAsset(asset);}
});
test('sculpt layer capture, same-layer accumulation and cold JSON rebuild exactly reproduce uneven previews',()=>{
  let a=fixture(),asset=build(a);try{
    for(let n=0;n<3;n++){
      const {updated,overrides}=brush(asset,v([n%2?-.25:.3,.08,.15]));
      const layer=a.sculpt_layers[0]||{id:'COMB',enabled:true,strength:1,branches:{}};
      captureSculptLayer(layer,asset.masterBranches,overrides);a.sculpt_layers=[layer];a=normalizeAuthoring(JSON.parse(JSON.stringify(a)));
      const rebuilt=build(a);matches(rebuilt,updated);disposeBranchAsset(asset);asset=rebuilt;
    }
    const full=buildBranchAsset(settings,null,[],0,a);try{
      const pve=createPVESkeleton(full);assert.ok(validatePVESkeleton(pve).valid);
      assert.deepEqual(pve.branches[0].points.map(p=>p.t),axisTimes(full.masterBranches[0].points));
      for(const b of pve.branches)for(const p of b.points)assert.deepEqual(Object.keys(p),['t','position_m','radius_m']);
    }finally{disposeBranchAsset(full);}
  }finally{disposeBranchAsset(asset);}
});
test('cached overrides without sculpture layers preserve their axis after actual normalized rebuild',()=>{
  const a=fixture(),asset=build(a);let rebuilt;try{
    const {updated,overrides}=brush(asset);a.overrides=overrides;a.curve_editor.affect_children=true;
    rebuilt=build(normalizeAuthoring(JSON.parse(JSON.stringify(a))));matches(rebuilt,updated);
    const invalid=JSON.parse(JSON.stringify(a));invalid.overrides.R.curve_sample_times=[0,.2,.1,1];assert.equal(normalizeAuthoring(invalid).overrides.R.curve_sample_times,null);
    invalid.overrides.R.curve_sample_times=[0,.02,.2,1];invalid.overrides.R.curve_knots[1][0]+=.1;assert.equal(normalizeAuthoring(invalid).overrides.R.curve_sample_times,null);
  }finally{disposeBranchAsset(asset);if(rebuilt)disposeBranchAsset(rebuilt);}
});
test('pinned control anchors the entire actual uneven prefix, not a uniform index approximation',()=>{
  const points=withAxisTimes([[0,0,0],[.1,0,.1],[.2,0,.3],[1,0,1],[2,0,2]].map(v),[0,.01,.02,.8,1]);
  const b={id:0,stableId:'R',parentId:-1,points,controlPoints:[points[0].clone(),points[2].clone(),points[4].clone()],startRadius:.05,length:3};
  const snap=createSculptSnapshot([b],{R:{pinned_points:[1]}}),updated=deformTree(snap,new Map([[0,[0,1,1]]]),v([.5,0,0]),'COMB',{strength:1});
  for(let i=0;i<=2;i++)near(updated.get(0).points[i],points[i],'pinned prefix');assert.ok(updated.get(0).points[4].distanceTo(points[4])>.01);
});
test('legacy layers remain uniform, while an omitted child entry follows a nonuniform carrier correctly',()=>{
  const a=fixture(),asset=build(a);try{
    const {overrides}=brush(asset),layer={id:'L',enabled:true,strength:.5,branches:{}};
    captureSculptLayer(layer,asset.masterBranches,{R:overrides.R});
    applySculptLayers(asset.masterBranches,[layer]);const [r,c]=asset.masterBranches;near(c.points[0],sampleLine(r.points,c.parentT),'implicit child');
    const legacy=normalizeAuthoring({sculpt_layers:[{id:'OLD',branches:{R:{parent:'',deltas:[[0,0,0],[1,0,0]],knot_deltas:[[0,0,0],[1,0,0]]}}}]}).sculpt_layers[0];
    assert.equal(legacy.branches.R.sample_times,undefined);applySculptLayers(asset.masterBranches,[legacy]);assert.equal(axisTimes(r.points),null);
  }finally{disposeBranchAsset(asset);}
});
test('complete and metadata PVE exports report actual parameterized attachments and reuse whole source models',()=>{
  const lib=JSON.parse(fs.readFileSync('次枝资产/全植物次枝成品V1/香樟/香樟_紧凑侧枝_深绿_成品V1.branchasset.json','utf8')).asset;
  const a=fixture();a.branch_library=[lib];a.branch_instances=[.45,.8].map((attach,i)=>({id:'UNIT'+i,asset_id:lib.id,linked:true,parent:'R',attach,scale:.3,angle:60,variation:0,seed:42}));
  a.recipe.tags=['WHOLE_PLANT','SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY'];
  const base=build(a);try{const {overrides}=brush(base),layer={id:'COMB',enabled:true,strength:1,branches:{}};captureSculptLayer(layer,base.masterBranches,overrides);a.sculpt_layers=[layer];}finally{disposeBranchAsset(base);}
  const folder=fs.mkdtempSync(path.resolve('.runtime/sculpt-axis-pve-')),input=path.join(folder,'input.branch.json');
  fs.writeFileSync(input,JSON.stringify({format:'ProceduralBranchProject',version:4,settings,authoring:normalizeAuthoring(a),leaf_meshes:lib.sample.leaf_meshes}));const original=fs.readFileSync(input);
  for(const mode of ['complete','metadata']){
    const out=path.join(folder,mode),args=['--experimental-loader','./tests/vendor-loader.mjs','scripts/export-pve-complete-units.mjs','--tool','.','--project',input,'--out',out,'--geometry',...(mode==='metadata'?['--metadata-only']:[])];
    const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:60000,maxBuffer:2000000,windowsHide:true});
    fs.writeFileSync(path.join(folder,mode+'.log'),result.stdout+result.stderr);assert.equal(result.status,0,result.stderr||result.stdout);
    const doc=JSON.parse(fs.readFileSync(path.join(out,'whole.pve-skeleton.json'),'utf8'));
    assert.equal(doc.complete_unit_assembly.unit_count,2);assert.equal(doc.complete_unit_assembly.source_mesh_count,1);
    assert.equal(doc.complete_unit_assembly.leaf_instances,0);assert.equal(doc.complete_unit_assembly.organ_instances,0);
    const branches=new Map(doc.branches.map(b=>[b.id,withAxisTimes(b.points.map(p=>v(p.position_m)),b.points.map(p=>p.t))]));let max=0;
    for(const f of doc.foliage)max=Math.max(max,v(f.position_m).distanceTo(sampleLine(branches.get(f.branch_id),f.branch_t)));
    assert.ok(max<1e-8);assert.ok(Math.abs(doc.complete_unit_assembly.max_unit_root_error_m-max)<1e-8);
  }
  assert.deepEqual(fs.readFileSync(input),original);
});
