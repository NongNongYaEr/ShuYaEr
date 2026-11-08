import test from 'node:test';
import assert from 'node:assert/strict';
import {packSourceOverlayUv} from '../material/web/source-overlay-uv-repair.js';
import {assertUvClearance,measureUvClearance,strictUvCharts} from '../material/web/uv-clearance.js';
import {verifySurfacePreserved} from '../material/web/mesh-codec.js';

const vertices=new Float32Array([0,0,0,1,0,0,0,1,0,1,1,0,2,0,0]);
const normals=new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1,0,0,1]);

test('叠加工作 UV 将折叠面移至独立岛并保持源面角',()=>{
 const mesh={pos:vertices,normal:normals,indices:new Uint32Array([0,1,2,2,1,3]),uv:new Float32Array([.1,.1,.8,.1,.1,.8,.1,.1,.9,.9])};
 const original=mesh.uv.slice(),options={resolution:1024,padding:3};
 assert.equal(measureUvClearance(mesh).overlaps.count,1);
 const result=packSourceOverlayUv(mesh,options);
 assert.equal(result.packing.sourceOverlayRepair.separatedFaces,1);
 assert.equal(measureUvClearance(result).overlaps.count,0);
 assertUvClearance(measureUvClearance(result),options);
 assert.equal(verifySurfacePreserved(mesh,result),true);
 assert.deepEqual(mesh.uv,original);
});

test('隔离中间面后重新识别分开的区域',()=>{
 const mesh={pos:vertices,normal:normals,indices:new Uint32Array([0,1,2,2,1,3,3,1,4]),uv:new Float32Array([.1,.1,.5,.1,.1,.5,.5,.5,.9,.1])};
 assert.equal(strictUvCharts(mesh).count,1);
 assert.equal(strictUvCharts(mesh,{isolatedFaces:new Set([1])}).count,3);
 assert.equal(strictUvCharts(mesh,{faceGroups:new Uint32Array([0,1,1])}).count,2);
});
