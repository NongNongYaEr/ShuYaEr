import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewHandoff } from '../web/preview-handoff.js';
test('accepted preview is retained until its owner is replaced, then released once',()=>{
 const h=createPreviewHandoff(),owner={},other={};let restored=0;
 h.commit(owner,{restore(){restored++;}},()=>true);
 assert.equal(restored,0);assert.ok(h.active);h.release(other);assert.equal(restored,0);
 h.release(owner);h.release(owner);assert.equal(restored,1);assert.equal(h.active,false);
});
test('rejected, unchanged and throwing commits restore immediately',()=>{
 const h=createPreviewHandoff();let restored=0;const p={restore(){restored++;}};
 assert.equal(h.commit({},p,()=>false),false);assert.equal(restored,1);assert.equal(h.active,false);
 assert.throws(()=>h.commit({},p,()=>{throw Error('rejected');}),/rejected/);assert.equal(restored,2);assert.equal(h.active,false);
});
test('generation failure can release retained resources without keeping another model',()=>{
 const h=createPreviewHandoff();let restored=0;
 h.commit({}, {restore(){restored++;}},()=>true);h.release();assert.equal(restored,1);assert.equal(h.active,false);
});
