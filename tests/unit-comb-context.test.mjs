import test from 'node:test';
import assert from 'node:assert/strict';
import { editContext } from '../web/edit-context.js';

test('unit brush hint follows target mode and scope even with no individual selection',()=>{
  const all=editContext({mode:'TREE',editKind:'UNIT',tool:'COMB',count:0,scope:'ALL'});
  assert.match(all.object,/单元枝梳理/);assert.match(all.scope,/全部单元枝/);assert.doesNotMatch(all.scope,/先选择/);assert.match(all.keys,/F 半径/);
  assert.match(editContext({mode:'TREE',editKind:'UNIT',tool:'COMB',count:0,scope:'DIRECT'}).scope,/先点选单元枝/);
  assert.match(editContext({mode:'TREE',editKind:'UNIT',tool:'COMB',count:2,scope:'SELECTED'}).scope,/所选单元枝及下级/);
  assert.doesNotMatch(editContext({mode:'TREE',editKind:'BONE',tool:'COMB',count:0,scope:'ALL'}).object,/单元枝梳理/);
});
