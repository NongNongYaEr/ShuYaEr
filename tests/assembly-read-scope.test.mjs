import test from 'node:test';import assert from 'node:assert/strict';
import {protectedAssemblyInstances,withAssemblyReadScope} from '../web/assembly-distribution.js';
const make=()=>({branch_instances:[{id:'u',parent:'root',linked:true}],overrides:{},sculpt_layers:[],workbench:{},topology:{},leaf_edits:{},unit_editing:{}});
test('one read-only UI scope reuses protection while separate reads observe edits',()=>{
 const authoring=make();let first;withAssemblyReadScope(()=>{first=protectedAssemblyInstances(authoring);assert.equal(protectedAssemblyInstances(authoring),first);});authoring.branch_instances[0].assembly_locked=true;const next=protectedAssemblyInstances(authoring);assert.notEqual(next,first);assert(next.has('u'));assert(!first.has('u'));
});
test('nested read scopes and exceptions do not leave stale planning caches installed',()=>{
 const authoring=make();withAssemblyReadScope(()=>{const outer=protectedAssemblyInstances(authoring);withAssemblyReadScope(()=>assert.notEqual(protectedAssemblyInstances(authoring),outer));assert.equal(protectedAssemblyInstances(authoring),outer);});assert.throws(()=>withAssemblyReadScope(()=>{protectedAssemblyInstances(authoring);throw Error('close');}));authoring.overrides['u.child']={};assert(protectedAssemblyInstances(authoring).has('u'));
});
