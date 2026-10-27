import test from 'node:test';
import assert from 'node:assert/strict';
import {copy} from '../web/branch-workbench-data.js';
test('authoring snapshots preserve JSON semantics, own prototype-like keys and independent editable containers',()=>{
 const atlas='data:image/png;base64,'+'atlas'.repeat(10000),source=JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"name":"source"}},"items":[{"points":[[1,2,3]]}]}');source.atlas=atlas;source.missing=undefined;source.invalid=Infinity;source.array=[undefined,NaN];
 const snapshot=copy(source);assert.deepEqual(snapshot,JSON.parse(JSON.stringify(source)));assert.equal(Object.getPrototypeOf(snapshot),Object.prototype);assert.equal(Object.hasOwn(snapshot,'__proto__'),true);assert.equal({}.polluted,undefined);assert.equal(snapshot.atlas,atlas);
 snapshot.items[0].points[0][0]=9;snapshot.__proto__.polluted=false;snapshot.constructor.prototype.name='changed';
 assert.equal(source.items[0].points[0][0],1);assert.equal(source.__proto__.polluted,true);assert.equal(source.constructor.prototype.name,'source');
});
