import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {copy} from '../web/branch-workbench-data.js';
import {createAuthoringDraft} from '../web/authoring-draft.js';
const fixture=()=>normalizeAuthoring({branch_instances:[{id:'unit',parent:'root',scale:1,linked:false}],sculpt_layers:[{id:'old',enabled:true,strength:1,branches:{root:{deltas:[[0,0,0],[.1,.2,.3]]}}}],active_sculpt_layer:'old',overrides:{root:{curve_knots:[[0,0,0],[0,0,1]]}},workbench:{trunk_forms:{version:1,branches:{}}}},37);

test('incremental normalization matches full validation for actual edits and retains all prior sculpt records',()=>{
 const mutations=[a=>a.sculpt_layers.push({id:'new',strength:3,branches:{root:{deltas:[[0,0,0],[1,2,3]]}}}),a=>{a.sculpt_layers[0].strength=-2;},a=>{a.overrides.root.curve_knots[1][0]=50;},a=>{a.overrides.new={length:-10,rotation:[1000,0,0]};},a=>{a.branch_instances[0].scale=10000;a.branch_instances.push({...a.branch_instances[0],id:'new unit'});},a=>{a.sculpt_layers.push(a.sculpt_layers[0]);a.branch_instances.push(a.branch_instances[0]);},a=>{a.sculpt_layers.length=0;},a=>{a.workbench.extra={saved:true};}];
 for(const mutation of mutations){const before=fixture(),snapshot=copy(before),draft=createAuthoringDraft(before);mutation(draft.value);const next=draft.finish(),incremental=normalizeAuthoring(next,37,before),full=normalizeAuthoring(copy(next),37);assert.deepEqual(incremental,full);assert.deepEqual(before,snapshot);}
});
test('unmodified canonical samples, placements, overrides and sculpt layers survive unrelated edits by identity',()=>{
 const before=fixture(),draft=createAuthoringDraft(before);draft.value.recipe.name='new';const next=normalizeAuthoring(draft.finish(),37,before);
 for(const key of ['branch_library','branch_instances','overrides','sculpt_layers'])assert.equal(next[key],before[key],key);
 assert.notEqual(next,before);assert.equal(next.recipe.name,'new');assert.equal(before.recipe.name,'未命名配方');
});
test('raw file normalization never trusts matching IDs or unvalidated object identities',()=>{
 const raw=fixture();raw.branch_instances[0].scale=10000;raw.sculpt_layers[0].strength=5;raw.overrides.root.length=-3;
 const parsed=normalizeAuthoring(raw,37);assert.notEqual(parsed.branch_instances[0],raw.branch_instances[0]);assert(parsed.branch_instances[0].scale<10000);assert.equal(parsed.sculpt_layers[0].strength,1);assert.notEqual(parsed.sculpt_layers[0],raw.sculpt_layers[0]);assert(parsed.overrides.root.length>=0);
});
test('an independent history snapshot stays unchanged across consecutive structurally shared edits',()=>{
 let live=fixture();const history=[];
 for(let i=0;i<4;i++){const baseline=live,snapshot=copy(live),draft=createAuthoringDraft(live);draft.value.branch_instances[0].scale+=.1;draft.value.sculpt_layers.push({id:'edit'+i,branches:{},enabled:true,strength:1});live=normalizeAuthoring(draft.finish(),37,baseline);history.push(snapshot);}
 assert.equal(history[0].branch_instances[0].scale,1);assert.equal(history[0].sculpt_layers.length,1);assert.equal(history[3].sculpt_layers.length,4);live.sculpt_layers[0].branches.root.deltas[0][0]=8;assert.equal(history[0].sculpt_layers[0].branches.root.deltas[0][0],0);
 for(const snapshot of history)assert.equal(snapshot.sculpt_layers[0].branches.root.deltas[0][0],0);
});
test('editing one large sculpt layer validates changed records and reuses untouched branch deltas',()=>{
 const before=fixture();before.sculpt_layers[0].branches.other=copy(before.sculpt_layers[0].branches.root);
 const draft=createAuthoringDraft(before);draft.value.sculpt_layers[0].branches.root.deltas[1][0]=200;
 const next=draft.finish(),normalized=normalizeAuthoring(next,37,before);assert.deepEqual(normalized,normalizeAuthoring(copy(next),37));assert.equal(normalized.sculpt_layers[0].branches.other,before.sculpt_layers[0].branches.other);assert.equal(normalized.sculpt_layers[0].branches.root.deltas[1][0],100);assert.equal(before.sculpt_layers[0].branches.root.deltas[1][0],.1);
});
test('layer strength changes preserve its original geometry records and operation',()=>{
 const before=fixture(),draft=createAuthoringDraft(before);draft.value.sculpt_layers[0].strength=.5;const next=normalizeAuthoring(draft.finish(),37,before);assert.equal(next.sculpt_layers[0].branches,before.sculpt_layers[0].branches);assert.equal(next.sculpt_layers[0].strength,.5);assert.equal(before.sculpt_layers[0].strength,1);
});
