import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthoringDraft,readAuthoringDraft} from '../web/authoring-draft.js';

test('local authoring edits preserve unmodified records and leave the input and history independent',()=>{
 const source={layers:[{id:'old',branches:{trunk:{deltas:[[0,0,0],[1,2,3]]}}}],instances:[{id:'unit',scale:1}],metadata:{name:'tree'}},history=structuredClone(source),draft=createAuthoringDraft(source);
 draft.value.layers.push({id:'new',branches:{}});draft.value.instances[0].scale=2;
 const next=draft.finish();assert.deepEqual(source,history);assert.notEqual(next,source);assert.notEqual(next.layers,source.layers);assert.equal(next.layers[0],source.layers[0]);assert.notEqual(next.instances[0],source.instances[0]);assert.equal(next.metadata,source.metadata);assert.equal(next.instances[0].scale,2);
 next.layers[0].branches.trunk.deltas[0][0]=8;assert.equal(history.layers[0].branches.trunk.deltas[0][0],0);
});
test('reading and structuredClone of a draft do not turn unchanged data into an edit',()=>{
 const source={a:[{id:'a',nested:{n:3}},{id:'b',nested:{n:4}}]},draft=createAuthoringDraft(source);
 assert.equal(draft.value.a.find(v=>v.id==='b').nested.n,4);assert.deepEqual(structuredClone(draft.value),source);assert.equal(draft.finish(),source);
});
test('array splice, reordering, sparse assignments, deletion and object replacement match ordinary mutations',()=>{
 const mutations=[d=>d.rows.splice(1,1,{n:7}),d=>d.rows.reverse(),d=>{d.rows.length=1;},d=>{delete d.rows[0];d.rows[4]={n:9};},d=>{delete d.meta.name;d.meta.enabled=true;},d=>{d.rows={old:d.rows[1],copy:{...d.rows[0]}};},d=>Object.assign(d,{meta:{...d.meta,name:'new'}})];
 for(const mutate of mutations){const source={rows:[{n:1},{n:2},{n:3}],meta:{name:'before'}},expected=structuredClone(source),draft=createAuthoringDraft(source);mutate(expected);mutate(draft.value);assert.deepEqual(draft.finish(),expected);assert.deepEqual(source,{rows:[{n:1},{n:2},{n:3}],meta:{name:'before'}});}
});
test('draft paths keep independent JSON alias semantics and preserve own proto metadata',()=>{
 const item={value:1},source=JSON.parse('{"__proto__":{"note":"saved"},"x":{},"y":{}}');source.x=item;source.y=item;
 const draft=createAuthoringDraft(source);draft.value.x.value=2;draft.value.__proto__.note='changed';const result=draft.finish();assert.equal(result.y.value,1);assert.equal(source.x.value,1);assert.equal(Object.getPrototypeOf(result),Object.prototype);assert.equal(Object.hasOwn(result,'__proto__'),true);assert.equal(result.__proto__.note,'changed');assert.equal(source.__proto__.note,'saved');
});
test('a failed mutation leaves the live authoring untouched',()=>{
 const source={curve:{points:[[0,0,0],[1,2,3]]}},before=structuredClone(source),draft=createAuthoringDraft(source);
 assert.throws(()=>{draft.value.curve.points[1][2]=9;throw Error('cancel');});assert.deepEqual(source,before);
});
test('a non-JSON cycle is rejected before replacing the live document',()=>{
 const source={value:{n:1}},draft=createAuthoringDraft(source),cycle={};cycle.self=cycle;draft.value.extra=cycle;assert.throws(()=>draft.finish(),/acyclic JSON/);assert.deepEqual(source,{value:{n:1}});
});

test('current plain reads preserve untouched source data and do not finalize later edits',()=>{
 let accesses=0;const mesh=new Array(1000).fill(1);Object.defineProperty(mesh,0,{get(){accesses++;return 1;},enumerable:true,configurable:true});
 const source={library:[{mesh}],metadata:{name:'before'},rows:[{n:1},{n:2}]},draft=createAuthoringDraft(source);
 draft.value.metadata.name='first';const first=readAuthoringDraft(draft.value);assert.equal(first.library,source.library);assert.equal(first.metadata.name,'first');assert.equal(accesses,0);
 draft.value.metadata.name='second';draft.value.rows[1].n=9;const current=readAuthoringDraft(draft.value);assert.equal(current.metadata.name,'second');assert.equal(current.rows[1].n,9);assert.equal(first.metadata.name,'first');assert.equal(source.metadata.name,'before');assert.equal(source.rows[1].n,2);assert.equal(accesses,0);
 const final=draft.finish();assert.deepEqual(final,current);assert.equal(final.library,source.library);assert.equal(readAuthoringDraft(source),source);
});

test('current draft reads resolve reordered arrays, assigned draft references, deletion and own proto metadata',()=>{
 const mutations=[d=>d.rows.reverse(),d=>{d.rows.length=1;},d=>{delete d.rows[0];d.rows[4]={n:9};},d=>{d.rows={old:d.rows[1],copy:{...d.rows[0]}};},d=>{delete d.__proto__.note;d.__proto__.newNote='changed';}];
 for(const mutate of mutations){const source=JSON.parse('{"rows":[{"n":1},{"n":2}],"__proto__":{"note":"saved"}}'),expected=structuredClone(source),draft=createAuthoringDraft(source);mutate(expected);mutate(draft.value);const current=readAuthoringDraft(draft.value);assert.deepEqual(current,expected);assert.equal(Object.getPrototypeOf(current),Object.prototype);assert.deepEqual(draft.finish(),expected);assert.equal(source.__proto__.note,'saved');}
});

test('current draft reads reject cycles without poisoning the transaction',()=>{
 const source={value:{n:1}},draft=createAuthoringDraft(source);draft.value.value.self=draft.value;
 assert.throws(()=>readAuthoringDraft(draft.value),/acyclic JSON/);delete draft.value.value.self;draft.value.value.n=3;assert.equal(readAuthoringDraft(draft.value).value.n,3);assert.equal(draft.finish().value.n,3);assert.equal(source.value.n,1);
});
