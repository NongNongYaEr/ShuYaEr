import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {buildBrushTopology,PixelMaskRasterizer} from '../material/web/pixel-masks.js';
import {SurfaceEdgeFilter} from '../material/web/surface-edge-filter.js';

function fixture() {
  // Faces 0 and 1 share a folded 3D edge and have separate UV charts.
  // Face 2 is disconnected, with its own fully covered chart.
  const source={
    pos:new Float32Array([0,0,0, 1,0,0, 0,1,0, 1,1,.7, 4,0,0, 5,0,0, 4,1,0]),
    indices:new Uint32Array([0,1,2, 1,3,2, 4,5,6])
  };
  const working={
    pos:Float32Array.from([...source.indices].flatMap(index=>[...source.pos.subarray(index*3,index*3+3)])),
    uv:new Float32Array([.02,.02,.47,.02,.02,.47, .54,.02,.98,.02,.54,.47, .02,.54,.47,.54,.02,.98]),
    indices:Uint32Array.from(source.indices,(_,index)=>index)
  };
  const raster=new PixelMaskRasterizer(buildBrushTopology(source),working,64,{padding:2,channels:1});
  raster.prepareSmoothing();
  const coverage=Uint8Array.from(raster.nearest,index=>{
    const face=raster.owners[index];
    if(face===0)return 20+index%73;
    if(face===1)return 155+index%59;
    return face===2?255:0;
  });
  return {filter:new SurfaceEdgeFilter(raster,working,{pathCacheBudget:65536}),coverage};
}

const params={resolution:256,blurCm:19,spreadCm:6,amount:.9};
const digest=values=>createHash('sha256').update(values).digest('hex');

test('Gaussian smoothing and spread preserve coverage across a folded UV seam',()=>{
  const {filter,coverage}=fixture(),progress=[];
  const result=filter.process(coverage,{...params,version:2},1,value=>progress.push(value));

  assert.equal(digest(result.values),'c6325d6d542469040ed76cc638f046b4ff87f79c6ebe2993921a99d5aec2355c');
  assert.equal(result.metadata.traceSamples,119712);
  assert.equal(result.metadata.traceMisses,13773);
  assert.equal(progress.length,10);
  assert.equal(progress.at(-1),1);
  for(let i=0;i<progress.length;i++){
    assert.ok(Math.abs(progress[i]-(i+1)/10)<.005);
  }

  const warm=filter.process(coverage,{...params,version:2},1,()=>assert.fail('Cached filtering emitted progress'));
  assert.deepEqual(warm.values,result.values);
  assert.equal(warm.metadata.traceSamples,0);

  const revised=coverage.map(value=>255-value);
  const reusedPaths=filter.process(revised,{...params,version:2},1);
  const rebuiltPaths=fixture().filter.process(revised,{...params,version:2},1);
  assert.deepEqual(reusedPaths,rebuiltPaths);
});

test('legacy edge treatment preserves smoothing and spread output',()=>{
  const {filter,coverage}=fixture();
  const result=filter.process(coverage,{...params,version:1},1,()=>assert.fail('Legacy filtering emitted Gaussian progress'));

  assert.equal(digest(result.values),'3db19da348c0da0c67ddb3ab613041bc87bf2f2ed20336c12438f1687a8d038c');
  assert.equal(result.metadata.traceSamples,59856);
  assert.equal(result.metadata.traceMisses,4482);
});
