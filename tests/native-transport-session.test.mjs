import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeTransportSession} from '../web/native-transport-session.js';

test('restarts reject prior statuses, errors, acknowledgements and shared mappings before and after the new handshake',()=>{
 const s=createNativeTransportSession('view'),old=s.id;assert.equal(s.message({action:'status',transportSession:old}),false);
 assert.equal(s.shared({version:1,transportSession:old}),true);assert.equal(s.message({action:'ack',transportSession:old}),true);
 const current=s.restart();assert.notEqual(current,old);assert(s.waiting);
 for(const action of ['status','error','ack'])assert.equal(s.message({action,transportSession:old}),false);
 assert.equal(s.shared({transportSession:old}),false);assert(s.waiting);
 assert.equal(s.shared(JSON.stringify({version:1,transportSession:current})),true);assert(!s.waiting);
 for(const action of ['status','error','ack']){assert.equal(s.message({action,transportSession:old}),false);assert.equal(s.message({action,transportSession:current}),true);}
 assert.equal(s.shared({transportSession:old}),false);
});

test('a current initialization error is still visible while messages without the negotiated correlation are rejected',()=>{
 const s=createNativeTransportSession('view');assert.equal(s.message({action:'error',transportSession:s.id}),true);
 assert(s.shared({transportSession:s.id}));assert.equal(s.message({action:'status'}),false);s.restart();
 assert.equal(s.shared({version:1}),false);assert.equal(s.message({action:'error',transportSession:s.id}),true);assert(s.waiting);
});

test('older shells retain the packet ABI and wait for the replacement mapping before accepting their statuses',()=>{
 const s=createNativeTransportSession('view');assert(s.shared({version:1}));assert(s.message({action:'status'}));
 s.restart();assert.equal(s.message({action:'status'}),false);assert.equal(s.message({action:'ack'}),false);
 assert(s.shared({version:1}));assert(s.message({action:'status'}));
});
