import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitSewnUvIslands} from '../material/web/tree-uv-partial-packing.js';
import {verifySurfacePreserved} from '../material/web/mesh-codec.js';
import {clearanceAtResolution,measureUvClearance} from '../material/web/uv-clearance.js';
import {analyzeUV} from '../material/web/uv-analysis.js';

const options={resolution:2048,padding:3};
function model(pos,uv,indices){
 return {pos:Float32Array.from(pos),uv:Float32Array.from(uv),indices:Uint32Array.from(indices),
  normal:Float32Array.from({length:pos.length},(_,i)=>i%3===2?1:0)};
}
const pair=()=>model([0,0,0,1,0,0,0,1,0,2,0,0,3,0,0,2,1,0],
 [.1,.1,.24,.1,.1,.24,.4,.1,.45,.1,.4,.15],[0,1,2,3,4,5]);

test('partial fit evicts the smaller nearby blocker and holds unaffected coordinates',()=>{
 const base=pair(),sewn={...base,uv:base.uv.slice()};
 for(let i=3;i<6;i++)sewn.uv[i*2]-=.19;
 const baseUv=base.uv.slice(),sewnUv=sewn.uv.slice();
 const output=fitSewnUvIslands(base,sewn,[0,1],options);
 assert(output);
 assert.equal(output.packing.partialSewPacking.moved,1);
 assert.equal(output.packing.partialSewPacking.retained,1);
 assert.deepEqual(output.packing.pinnedIslands,[]);
 assert.deepEqual(output.packing.relativeDensityWeights,{});
 for(let c=0;c<3;c++)for(let axis=0;axis<2;axis++)assert.equal(output.uv[output.indices[c]*2+axis],base.uv[base.indices[c]*2+axis]);
 assert.deepEqual(base.uv,baseUv);
 assert.deepEqual(sewn.uv,sewnUv);
 assert(clearanceAtResolution(measureUvClearance(output),options).safe);
 assert(analyzeUV(output).summedUvTriangleArea>=analyzeUV(base).summedUvTriangleArea);
 verifySurfacePreserved(base,output);
});

test('partial fit rejects reversed individual UV face orientation and an expired deadline',()=>{
 const base=pair(),sewn={...base,uv:base.uv.slice()};
 for(let axis=0;axis<2;axis++)[sewn.uv[2+axis],sewn.uv[4+axis]]=[sewn.uv[4+axis],sewn.uv[2+axis]];
 assert.equal(fitSewnUvIslands(base,sewn,[0,1],options),null);
 assert.equal(fitSewnUvIslands(base,base,[0,1],{...options,deadline:Date.now()-1}),null);
});

test('partial fit rejects a new cut even if it has safe UV clearance',()=>{
 const base=model([0,0,0,1,0,0,1,1,0,0,1,0],[.1,.1,.3,.1,.3,.3,.1,.3],[0,1,2,0,2,3]);
 const sewn=model([0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0],
  [.1,.1,.3,.1,.3,.3,.1,.4,.3,.6,.1,.6],[0,1,2,3,4,5]);
 assert(clearanceAtResolution(measureUvClearance(sewn),options).safe);
 assert.equal(fitSewnUvIslands(base,sewn,[0,0],options),null);
});

test('partial fit handles atlas-border blockers with exact final spacing',()=>{
 const base=pair(),sewn={...base,uv:base.uv.slice()};
 for(let i=3;i<6;i++)sewn.uv[i*2]-=.41;
 const output=fitSewnUvIslands(base,sewn,[0,1],options);
 assert(output);
 assert(clearanceAtResolution(measureUvClearance(output),options).safe);
 assert.equal(output.packing.partialSewPacking.moved,1);
});

test('partial fit caps pathological broad-triangle grid insertions',()=>{
 const count=24,pos=[],uv=[],indices=[];
 for(let i=0;i<count;i++){
  const at=pos.length/3;
  pos.push(i*2,0,0,i*2+1,0,0,i*2,1,0);
  uv.push(-.9,-.9,1.9,-.9,-.9,1.9);
  indices.push(at,at+1,at+2);
 }
 const mesh=model(pos,uv,indices);
 assert.equal(fitSewnUvIslands(mesh,mesh,Int32Array.from({length:count},(_,i)=>i),options),null);
});
