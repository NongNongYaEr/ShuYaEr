import test from 'node:test';
import assert from 'node:assert/strict';
import {packProjectionRecovery} from '../material/web/uv-projection-recovery.js';
import {prepareUvWithFallback} from '../material/web/uv-processing.js';
import {analyzeUV} from '../material/web/uv-analysis.js';
import {assertUvClearance,measureUvClearance} from '../material/web/uv-clearance.js';
import {verifySurfacePreserved} from '../material/web/mesh-codec.js';

test('通用重展失败且无原 UV 时，备用展开分隔投影相叠的表面并保持每个面角',async()=>{
 const input={
  pos:Float32Array.of(0,0,0,1,0,0,0,1,0,0,0,.02,1,0,.02,0,1,.02),
  normal:Float32Array.from({length:18},(_,i)=>i%3===2?1:0),
  uv:new Float32Array(12),
  indices:Uint32Array.of(0,1,2,3,4,5)
 };
 const options={mode:'unwrap',resolution:1024,padding:6,revision:2};
 const steps=[];
 const result=await prepareUvWithFallback(input,options,{
  pack:assert.fail,
  projectUv:async(mesh,values)=>packProjectionRecovery(mesh,values),
  native:async(mesh,mode)=>{
   if(mode==='unwrap')throw Error('UV input has zero-area triangles; use automatic unwrap');
   assert.equal(mode,'tangents');
   return {...mesh,sourceIndices:Uint32Array.from({length:mesh.pos.length/3},(_,i)=>i)};
  }
 },{isCurrent:()=>true,onFallback:step=>steps.push(step)});
 assert.deepEqual(steps,['projection']);
 assert.equal(result.packing.method,'projection-recovery');
 assert.equal(result.packing.projectionRecovery.islands,2);
 assert.equal(result.uvRevision,2);
 const diagnostic=analyzeUV(result);
 assert.equal(diagnostic.zeroUvFaces,0);
 assert.equal(diagnostic.outOfRangeFaces,0);
 assert.equal(diagnostic.overlap,0);
 assert(verifySurfacePreserved(input,result));
 assert(assertUvClearance(measureUvClearance(result),options).safe);
 assert.deepEqual(input.uv,new Float32Array(12));
});
