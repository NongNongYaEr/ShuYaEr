import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importedTrunkFixture} from './imported-trunk-fixture.mjs';
import {readImportedTrunkGlb} from '../web/imported-trunk-glb.js';
import {prepareImportedTrunk} from '../web/imported-trunk-runtime.js';
import {checkTrunkRig} from '../web/trunk-rig-readiness.js';

const fixture=async()=>({...prepareImportedTrunk(await readImportedTrunkGlb(await importedTrunkFixture())),material_workflow:{version:1,geometryKey:'fixture',needsSkeleton:true,rigConfirmed:false}});

test('应用骨架后自动检查并解除发布守卫，旧草稿无需手动确认',async()=>{
 const model=await fixture();let checks=0;
 const ready=await checkTrunkRig(model,{automatic:true,check:()=>checks++});
 assert.equal(checks,1);assert.equal(model.material_workflow.rigConfirmed,false);
 assert.equal(ready.material_workflow.rigConfirmed,true);assert.equal(ready.material_workflow.needsSkeleton,false);
 assert.equal(ready.material_workflow.rigValidation.automatic,true);
 assert.match(ready.material_workflow.rigValidation.key,/^[a-f0-9]{64}$/);
});

test('同一绑定重复保存复用检查，旧布尔标记不能代替实际检查',async()=>{
 const model=await fixture();model.material_workflow.rigConfirmed=true;let checks=0;
 const ready=await checkTrunkRig(model,{automatic:true,check:()=>checks++});
 const again=await checkTrunkRig(ready,{check:()=>checks++});
 assert.equal(checks,1);assert.equal(again,ready);assert.equal(again.material_workflow.rigValidation.automatic,true);
});

test('控制点、校准、网格归属及雕刻变化分别触发重新检查',async()=>{
 const ready=await checkTrunkRig(await fixture(),{check:()=>{}});
 for(const edit of [m=>m.guides[0].points[1][0]+=.01,m=>m.calibration.scale*=1.1,m=>m.binding={primitive_guides:{[m.primitives[0].id]:[m.guides[0].id]}},m=>m.sculpt={version:1,primitives:[]}]){
  const changed=structuredClone(ready);edit(changed);let checks=0;
  const next=await checkTrunkRig(changed,{check:()=>checks++});
  assert.equal(checks,1);assert.notEqual(next.material_workflow.rigValidation.key,ready.material_workflow.rigValidation.key);
 }
});

test('检查失败保留原骨架且不写通过标记，下一次可重试',async()=>{
 const model=await fixture();
 await assert.rejects(checkTrunkRig(model,{check:()=>{throw Error('无效绑定');}}),/检查未通过：无效绑定/);
 assert.equal(model.material_workflow.rigConfirmed,false);
 const ready=await checkTrunkRig(model,{check:()=>{}});assert.equal(ready.material_workflow.rigConfirmed,true);
});

test('异步检查过期后不能放行另一棵树干',async()=>{
 const model=await fixture();let current=model;
 await assert.rejects(checkTrunkRig(model,{current:()=>current,check:()=>{current={...model};}}),/树干已变化/);
 assert.equal(model.material_workflow.rigConfirmed,false);
});

test('沿用原材质通过相同检查，不伪造材质制作会话',async()=>{
 const model=await fixture();delete model.material_workflow;let checked=false;
 assert.equal(await checkTrunkRig(model,{check:()=>{checked=true;}}),model);
 assert(checked);assert.equal(model.material_workflow,undefined);
});
