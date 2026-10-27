import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnitSourceWorkflow, UNIT_SOURCE_APPLY_BACK_MESSAGE } from '../web/unit-source-workflow.js';
import { normalizeAuthoring } from '../web/authoring-state.js';

test('TREE source entry cannot capture a selected skeleton, including its installed or legacy manual descendants', async () => {
  let mode = 'TREE', owners = [], opened = [], hints = [];
  const workflow = createUnitSourceWorkflow({ getMode:()=>mode, selectionOwners:()=>owners, editSource:async instance=>opened.push(instance), toast:message=>hints.push(message) });
  const span = {}, open = {querySelector:()=>span}, back = {};
  workflow.refresh(open, back); assert.equal(open.disabled, true); assert.equal(span.textContent, '编辑源单元枝'); assert.equal(back.hidden, true); assert.equal(back.disabled, true);
  assert.equal(await workflow.open(), false); assert.equal(opened.length, 0); assert.match(hints[0], /承重骨架/);
  owners = [{id:'LEGACY_OWNER',unit_seed_owner:'ORIGINAL',asset_id:'REUSABLE'}]; workflow.refresh(open,back); assert.equal(open.disabled,false);
  assert.equal(await workflow.open(),true); assert.equal(opened[0],owners[0], 'pass the actual owner record; random alias never identifies the edited instance');
  owners=[{id:'BAKED_COPY',legacyPlacement:true,asset_id:'REUSABLE'}];workflow.refresh(open,back);assert.equal(open.disabled,true);
  assert.equal(await workflow.open(),false);assert.equal(opened.length,1,'virtual wood capture must not be opened as an incomplete source draft');
  mode='BRANCH';workflow.refresh(open,back);assert.equal(open.disabled,true);assert.equal(back.hidden,true);
});

test('legacy skeleton and instance source metadata remain readable, while every old apply-back call is rejected unchanged', () => {
  for (const source of [{root:'ROOT',parent:'P',ids:['ROOT','UNIT.R1','OLD_MANUAL'],attach:.5},{root:'UNIT.R1',instance_id:'UNIT',ids:['UNIT.R1'],attach:.5}]) {
    const authoring=normalizeAuthoring({workbench:{name:'旧草稿',source},branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[1,0,0]],knots:[[0,0,0],[1,0,0]],start_radius:.02,end_radius:.005}]}});
    const before=JSON.stringify(authoring),workflow=createUnitSourceWorkflow({getMode:()=> 'BRANCH',selectionOwners:()=>[],editSource(){throw Error('Must not open a source');},toast(){}});
    assert.deepEqual(authoring.workbench.source,source);
    assert.throws(()=>workflow.applyBack(),error=>error.message===UNIT_SOURCE_APPLY_BACK_MESSAGE);
    assert.equal(JSON.stringify(authoring),before);assert.deepEqual(normalizeAuthoring(JSON.parse(JSON.stringify(authoring))).workbench.source,source);
  }
});
