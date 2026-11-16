import test from 'node:test';
import assert from 'node:assert/strict';
import {packSourceOverlayUv} from '../material/web/source-overlay-uv-repair.js';
import {assertUvClearance,measureUvClearance,strictUvCharts} from '../material/web/uv-clearance.js';
import {verifySurfacePreserved} from '../material/web/mesh-codec.js';
import {prepareUvWithFallback} from '../material/web/uv-processing.js';

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

test('两种展开都产生零面积 UV 时，修整已有 UV 并验证间距；保留用户接缝和锁定岛',async()=>{
 const mesh={pos:vertices,normal:normals,indices:Uint32Array.of(0,1,2,2,1,3),uv:Float32Array.of(.1,.1,.8,.1,.1,.8,.1,.1,.9,.9)};
 const options={resolution:1024,padding:3,revision:1},calls=[],sourceUv=mesh.uv.slice();
 const zero=()=>Error('UV input has zero-area triangles; use automatic unwrap');
 const services={
  trees:()=>({prepare:async()=>{throw zero();},dispose(){}}),
  guides:()=>({prepare:async()=>{throw zero();},dispose(){}}),
  native:async(input,mode)=>{
   if(mode==='unwrap')throw zero();
   assert.equal(mode,'tangents');
   return {...input,sourceIndices:Uint32Array.from({length:input.pos.length/3},(_,i)=>i)};
  },
  pack:async(input,settings)=>{
   assert.equal(input,mesh);
   assert(settings.repairSourceOverlap);
   return packSourceOverlayUv(input,settings);
  }
 };
 const lifecycle={isCurrent:()=>true,onFallback:step=>calls.push(step)};
 for(const mode of ['tree','unwrap']){
  calls.length=0;
  const packed=await prepareUvWithFallback(mesh,{...options,mode},services,lifecycle);
  const expected=mode==='tree'?['unwrap','repair-existing']:['repair-existing'];
  assert.deepEqual(calls,expected);
  assert.equal(packed.uvMode,'unwrap');
  assert.equal(packed.packing.sourceOverlayRepair.separatedFaces,1);
  assert(assertUvClearance(measureUvClearance(packed),options).safe);
  assert(verifySurfacePreserved(mesh,packed));
  assert.deepEqual(mesh.uv,sourceUv);
  for(const guarded of [{rules:{pins:[0]}},{cutRules:{protectedFaces:[0]}}]){
   calls.length=0;
   await assert.rejects(prepareUvWithFallback(mesh,{...options,mode,...guarded},services,lifecycle),/自动展开仍有零面积 UV/);
   assert.deepEqual(calls,mode==='tree'?['unwrap']:[]);
  }
 }
});
