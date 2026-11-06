import {test} from 'node:test';import assert from 'node:assert/strict';
import {SurfaceDistributionRasterizer} from '../material/web/surface-distribution.js';
import {analysisBytes,cachedSurfaceAnalysis,rememberSurfaceAnalysis,SURFACE_ANALYSIS_CACHE_BYTES} from '../material/web/surface-analysis-cache.js';
test('三种识别宽度往返复用真实曲率和双程AO，不重复发射射线；尺寸变更隔离',()=>{
 const pos=[],normal=[],uv=[],indices=[],n=4;for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){pos.push(x/n,y/n,.1*Math.sin(x/n*4));normal.push(0,0,1);uv.push(x/n,y/n);}for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x;indices.push(a,a+1,a+n+1,a+1,a+n+2,a+n+1);}const mesh={pos:Float32Array.from(pos),normal:Float32Array.from(normal),uv:Float32Array.from(uv),indices:Uint32Array.from(indices),height:1,min:[0,0,-.1],sourceSHA256:'a'.repeat(64)},r=new SurfaceDistributionRasterizer(mesh,mesh,16),d={actualHeightMeters:2};
 const first=r.prepareStable(d,12),sample=first.ao.sample(0,.2,.3,.5);r.prepareStable(d,18);r.prepareStable(d,24);const rays=r.stableStore.scene.evaluatedPoints,reused=r.prepareStable(d,12);assert.strictEqual(reused,first);assert.equal(r.stableStore.scene.evaluatedPoints,rays);assert.deepEqual(reused.ao.sample(0,.2,.3,.5),sample);assert.notStrictEqual(r.prepareStable({actualHeightMeters:3},12),first);
});
test('多尺度缓存按真实自适应补采样缓冲计费，限制32MiB与八项，命中更新最近使用',()=>{
 const cache=new Map();for(let i=0;i<8;i++)rememberSurfaceAnalysis(cache,i,{a:new Uint8Array(16)});cachedSurfaceAnalysis(cache,0);rememberSurfaceAnalysis(cache,8,{a:new Uint8Array(16)});assert(cache.has(0));assert(!cache.has(1));assert.equal(cache.size,8);
 const shared=new Uint8Array(1024),field={a:shared,patches:new Map([[1,{b:shared.subarray(4)}]])};assert.equal(analysisBytes(field),1024);rememberSurfaceAnalysis(cache,'large',{a:new Uint8Array(20*1024*1024)});rememberSurfaceAnalysis(cache,'large2',{patches:new Map([[0,{a:new Uint8Array(15*1024*1024)}]])});assert([...cache.values()].reduce((n,v)=>n+analysisBytes(v),0)<=SURFACE_ANALYSIS_CACHE_BYTES);assert(!cache.has('large'));assert(cache.has('large2'));
});
