import test from 'node:test';
import { createRuntimeTestDirectory } from './runtime-test-directory.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import * as k from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { normalizeShapeOperation } from '../web/shape-operation-data.js';
import { createBranchCage } from '../web/branch-deformation.js';
import { createSculptSnapshot } from '../web/tree-sculpt.js';
import { cloneBranchInstances, moveInstanceToCarrier, rotateInstance, applyInstanceFamilyPlacement } from '../web/branch-instance-operations.js';
import { resolvePveExportPlan } from '../web/pve-export-plan.js';
import { validatePackage } from '../scripts/pve-package.mjs';

const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const names=['紧凑侧枝_深绿','紧凑侧枝_混合','紧凑侧枝_嫩绿','短弯细梢_深绿','短弯细梢_混合','短弯细梢_嫩绿'];
test('six real camphor unit classes stay six full models after rigid placement, two-level nested installation, copying, freezing and protected support operations', {timeout:180000}, t => {
  const library=names.map(name=>read(path.join('次枝资产/全植物次枝成品V1/香樟',`香樟_${name}_成品V1.branchasset.json`)).asset);
  const sources=[...new Map(library.flatMap(item=>item.sample.leaf_meshes).map(source=>[source.id,source])).values()];
  const a=normalizeAuthoring({branch_shape:{branches:[
    {id:'ROOT',parent:'',points:[[0,0,0],[0,0,4],[.3,0,8]],length:8,start_radius:.15,end_radius:.08},
    {id:'HOST',parent:'ROOT',attach:.5,points:[[0,0,4],[1,1,4.3],[3,1,5]],length:3,start_radius:.08,end_radius:.03}]},
    branch_library:library,branch_instances:library.map((item,n)=>({id:'I'+n,asset_id:item.id,linked:true,pinned_revision:item.revision,
      parent:'ROOT',attach:.1+n*.13,scale:1,variation:0,roll:n*17})),leaf_material:library[0].sample.authoring.leaf_material,
    recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}});
  const settings=k.normalizeSettings({...library[0].sample.settings,object_name:'6类单元枝验收',leaf_density:0,max_triangles:8000000,preview_lod:0});
  const local=sources.map(source=>({...source,geometry:k.deserializeGeometry(source.geometry)})),assets=[];
  const folder=createRuntimeTestDirectory(t, 'pve-six-unit-classes-');
  const build=legacy=>{const result=k.buildBranchAsset(settings,null,local,0,a,legacy?{legacy:true}:{});assets.push(result);return result;};
  const exportPackage=name=>{
    const file=path.join(folder,name+'.branch.json'),out=path.join(folder,name+'_PVE_Complete');
    fs.writeFileSync(file,JSON.stringify({format:'ProceduralBranchProject',version:4,settings,authoring:a,leaf_meshes:sources}));
    const cli=spawnSync(process.execPath,['--experimental-loader','./tests/vendor-loader.mjs','./scripts/export-pve-complete-units.mjs',
      '--tool','.','--project',file,'--out',out,'--geometry'],{encoding:'utf8',timeout:120000,maxBuffer:2000000,windowsHide:true});
    fs.writeFileSync(path.join(folder,name+'.log'),cli.stdout+cli.stderr);assert.equal(cli.status,0,cli.stderr||cli.stdout);
    const validation=validatePackage(out,fs.readFileSync(file));assert.equal(validation.valid,true);assert.deepEqual(validation.errors,[]);
    return {out,validation,manifest:read(path.join(out,'complete_units.manifest.json')),skeleton:read(path.join(out,'whole.pve-skeleton.json'))};
  };
  try {
    const original=build(), baseline=exportPackage('baseline');
    const cloned=cloneBranchInstances(a,[a.branch_instances[0]],()=> 'DUPLICATED',original.masterBranches);assert.equal(cloned.copies[0].asset_id,library[0].id);
    let asset=build();
    for(const id of ['I1','DUPLICATED']) {
      const before=structuredClone(a.branch_instances.find(i=>i.id===id)),shape=a.branch_library.find(item=>item.id===before.asset_id).shape;
      const parent=asset.masterBranches.find(b=>b.stableId===before.parent),host=asset.masterBranches.find(b=>b.stableId==='HOST');
      let after=moveInstanceToCarrier(before,host,parent,settings,.23,shape);
      after=rotateInstance(after,host,settings,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(.3,.8,.2).normalize(),.43),shape);
      after.scale*=1.37;applyInstanceFamilyPlacement(a,before,after,shape,asset.masterBranches,settings);asset=build();
    }
    const frozen=a.branch_instances.find(i=>i.id==='I2');frozen.linked=false;frozen.shape=structuredClone(a.branch_library.find(item=>item.id===frozen.asset_id).shape);
    const parentShape=a.branch_library.find(item=>item.id===a.branch_instances.find(i=>i.id==='DUPLICATED').asset_id).shape;
    const nestedSource=a.branch_library.find(item=>item.id===a.branch_instances[4].asset_id),nestedRoot=nestedSource.shape.branches.find(b=>!b.parent).id;
    a.branch_instances.push({...structuredClone(a.branch_instances[4]),id:'NESTED',parent:'DUPLICATED.'+parentShape.branches.find(b=>!b.parent).id,attach:.65,scale:.6});
    a.branch_instances.push({...structuredClone(a.branch_instances[5]),id:'NESTED_2',parent:'NESTED.'+nestedRoot,attach:.7,scale:.4});
    const structural=asset.masterBranches.filter(b=>!b.instanceId&&!b.unitOwner),cage=createBranchCage(createSculptSnapshot(structural),new Set(['ROOT']));
    const ops=[{type:'CAGE',rest:cage.rest.map(p=>p.toArray()),nodes:cage.nodes.map((p,n)=>p.clone().add(new THREE.Vector3(.05*n,.025*n,.01*n)).toArray()),axis:cage.axis},
      {type:'GUIDE',guide:[[0,0,0],[.6,.4,4],[1.3,.2,8]],anchor:[0,0,0],strengths:[0,.35,.6]},
      {type:'SPACE',center:[0,0,3.5],radius:.5,voidEnabled:true,spacingEnabled:false,minOrder:0,amount:.3},
      {type:'POSE',mode:'TWIST',twist:25,preserveLength:true},
      {type:'VOLUME',stamps:[{branch:'ROOT',t:.5,width:.1,amount:.2},{branch:'I0.R1',t:.5,width:.4,amount:1}]}];
    a.sculpt_layers=ops.map((op,n)=>({id:'PROTECTED_'+n,name:op.type,enabled:true,strength:1,branches:{},
      operation:normalizeShapeOperation({...op,targets:['ROOT'],protect_units:true})}));
    const loaded=normalizeAuthoring(JSON.parse(JSON.stringify(a)));Object.assign(a,loaded);
    const final=build(), legacy=build(true),plan=resolvePveExportPlan(final,a),legacyPlan=resolvePveExportPlan(legacy,a);
    assert.equal(plan.units.length,9);assert.equal(legacyPlan.units.length,9);
    assert.ok(plan.units.every(unit=>!unit.variantRequired),'no placement-only variant');
    assert.ok(legacyPlan.units.every(unit=>!unit.variantRequired),'frozen source equality also reuses in expanded legacy path');
    for(const unit of plan.units) {
      const other=legacyPlan.units.find(u=>u.id===unit.id),inverse=unit.transform.clone().invert(),otherInverse=other.transform.clone().invert();
      assert.equal(unit.branches.length,other.branches.length);
      for(let n=0;n<unit.branches.length;n++)for(let p=0;p<unit.branches[n].points.length;p++) {
        const error=unit.branches[n].points[p].clone().applyMatrix4(inverse).distanceTo(other.branches[n].points[p].clone().applyMatrix4(otherInverse));
        assert.ok(error<1e-6,'compiled/legacy full-unit local shape '+unit.id);
      }
    }
    const edited=exportPackage('placed_protected'),expected=library.map(item=>item.id).sort();
    assert.equal(edited.manifest.units.length,6);assert.deepEqual(edited.manifest.units.map(unit=>unit.id).sort(),expected);
    assert.equal(edited.skeleton.foliage.length,9);assert.ok(edited.skeleton.foliage.every(i=>i.id.startsWith('UNIT_')));
    for(const [id,parent] of [['NESTED','DUPLICATED'],['NESTED_2','NESTED']]) {
      const mount=edited.skeleton.foliage.find(i=>i.id==='UNIT_'+id),unit=plan.units.find(u=>u.id===id);
      assert.equal(mount.parent_unit_id,'UNIT_'+parent);assert.equal(mount.parent_unit_branch_id,unit.parent.stableId);assert.equal(mount.parent_unit_t,unit.root.parentT);
      assert.equal(mount.branch_id,'HOST','old structural host remains valid through two nested levels');
      assert.ok(new THREE.Vector3(...mount.position_m).distanceTo(new THREE.Vector3().applyMatrix4(unit.transform))<1e-8);
    }
    const resolved=read(path.join(edited.out,'whole.resolved.json'));
    assert.equal(resolved.summary.branches,final.masterBranches.length);assert.equal(resolved.summary.leaves,final.masterPlacements.length);assert.equal(resolved.summary.organs,final.treeOrgans.length);
    assert.equal(resolved.summary.triangles,final.report.triangles,'every wood and leaf triangle appears once');
    assert.equal(new Set(resolved.chunks.filter(chunk=>chunk.instance_index>=0).map(chunk=>chunk.instance_index)).size,9);
    assert.equal(edited.skeleton.complete_unit_assembly.leaf_instances,0);assert.equal(edited.skeleton.complete_unit_assembly.organ_instances,0);
    assert.ok(edited.skeleton.complete_unit_assembly.baked_unit_leaves>0);
    for(const unit of edited.manifest.units) {
      const old=baseline.manifest.units.find(u=>u.id===unit.id);
      assert.equal(unit.glb_sha256,old.glb_sha256,'source model unchanged '+unit.id);assert.equal(unit.triangles,old.triangles);assert.ok(!unit.variant_kind);
      const bytes=fs.readFileSync(path.join(edited.out,unit.glb)),json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
      assert.equal(json.meshes.length,1);assert.equal(json.nodes.length,1);assert.ok(json.meshes[0].primitives.length>=2,'one full model retains wood and leaf material groups');
    }
    const independent=a.branch_instances.find(i=>i.id==='I2');
    independent.shape=structuredClone(independent.shape);
    independent.shape.branches[0].points.at(-1)[1]+=.1;
    independent.shape.branches[0].knots.at(-1)[1]+=.1;
    assert.equal(resolvePveExportPlan(build(),a).units.find(u=>u.id==='I2').variantRequired,true,'legacy genuinely different frozen shape remains a complete variant');
    fs.writeFileSync(path.join(folder,'验收.json'),JSON.stringify({passed:true,classes:6,unit_instances:9,nested_levels:2,baseline:baseline.validation,placed_protected:edited.validation},null,2));
    console.log('6类完整单元枝导出验收: '+folder);
  } finally {assets.forEach(k.disposeBranchAsset);local.forEach(source=>source.geometry.dispose());}
});
