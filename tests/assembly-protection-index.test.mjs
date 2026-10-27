import test from 'node:test';
import assert from 'node:assert/strict';
import { protectedAssemblyInstances } from '../web/assembly-distribution.js';
test('protection resolves every nested owner and exact dot boundary, across all edit sources',()=>{
  const ids=['A','AB','A.NEST','B','C','D','E','F','G','H','I','J','K','L'];
  const a={branch_instances:ids.map(id=>({id,parent:'R',scale:1})),workbench:{},overrides:{'A.NEST.R':{},'UNKNOWN.R':{}},
    sculpt_layers:[{branches:{'B.R':{}},operation:{targets:['C.R']}}],manual_branches:[{parent:'D.R'}],
    topology:{reparent:{'E.R':'F.R'},suppressed:['G.R']},leaf_edits:{added:[{parent:'H.R'}],removed:['I.R']},
    unit_editing:{overrides:{'J.R':{}},removed:['K.R'],added:[{parent:'L.R'}]}};
  assert.deepEqual([...protectedAssemblyInstances(a)].sort(),ids.filter(id=>id!=='AB').sort());
  a.branch_instances.find(i=>i.id==='AB').parent='A.NEST.R';assert.equal(protectedAssemblyInstances(a).has('AB'),false);
  a.branch_instances.find(i=>i.id==='AB').assembly_locked=true;assert.equal(protectedAssemblyInstances(a).has('AB'),true);
});
