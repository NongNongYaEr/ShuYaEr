import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrunkPointSelectionMemory} from '../web/trunk-point-selection-memory.js';
test('separate branches, circles and layers restore exact real selections and primary points',()=>{
 const m=createTrunkPointSelectionMemory();m.remember('A|S1|BASE',['p1','p2'],'p2');m.remember('A|S1|FINAL',['c3'],'c3');m.remember('A|S2|BASE',['p3'],'p3');m.remember('B|S1|BASE',['p4'],'p4');
 assert.deepEqual(m.restore('A|S1|BASE',['p1','p2','p3']),{ids:['p1','p2'],primary:'p2'});assert.deepEqual(m.restore('A|S1|FINAL',['c3']),{ids:['c3'],primary:'c3'});assert.deepEqual(m.restore('A|S2|BASE',['p3']),{ids:['p3'],primary:'p3'});assert.deepEqual(m.restore('B|S1|BASE',['p4']),{ids:['p4'],primary:'p4'});
});
test('clear and committed deletion do not revive selections on return or undo',()=>{
 const m=createTrunkPointSelectionMemory();m.remember('A',['p1','p2'],'p1');m.prune(()=>['p2']);assert.deepEqual(m.restore('A',['p1','p2']),{ids:['p2'],primary:'p2'});m.remember('A',[],'');assert.deepEqual(m.restore('A',['p1','p2']),{ids:[],primary:''});m.remember('A',['p2'],'p2');m.prune(()=>null);assert.deepEqual(m.restore('A',['p1','p2']),{ids:[],primary:''});
});
test('memory is bounded, filters duplicates and stale IDs, and is cleared on project load',()=>{
 const m=createTrunkPointSelectionMemory(2),ids=['a','a','stale'];m.remember('one',ids,'stale');ids.push('b');assert.deepEqual(m.restore('one',['a','b']),{ids:['a'],primary:'a'});m.remember('two',['b'],'b');m.remember('three',['c'],'c');assert.deepEqual(m.restore('one',['a']),{ids:[],primary:''});m.clear();assert.deepEqual(m.restore('three',['c']),{ids:[],primary:''});
});
