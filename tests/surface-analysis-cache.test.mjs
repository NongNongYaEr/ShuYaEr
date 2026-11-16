import {test} from 'node:test';import assert from 'node:assert/strict';
import {SurfaceDistributionRasterizer} from '../material/web/surface-distribution.js';
import {analysisBytes,cachedSurfaceAnalysis,rememberSurfaceAnalysis,SURFACE_ANALYSIS_CACHE_BYTES} from '../material/web/surface-analysis-cache.js';
import {SurfaceDistributionSession} from '../material/web/surface-distribution-session.js';
import {createDocument} from '../material/web/project-state.js';
test('三种识别宽度往返复用真实曲率和双程AO，不重复发射射线；尺寸变更隔离',()=>{
 const pos=[],normal=[],uv=[],indices=[],n=4;for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){pos.push(x/n,y/n,.1*Math.sin(x/n*4));normal.push(0,0,1);uv.push(x/n,y/n);}for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x;indices.push(a,a+1,a+n+1,a+1,a+n+2,a+n+1);}const mesh={pos:Float32Array.from(pos),normal:Float32Array.from(normal),uv:Float32Array.from(uv),indices:Uint32Array.from(indices),height:1,min:[0,0,-.1],sourceSHA256:'a'.repeat(64)},r=new SurfaceDistributionRasterizer(mesh,mesh,16),d={actualHeightMeters:2};
 const first=r.prepareStable(d,12),sample=first.ao.sample(0,.2,.3,.5);r.prepareStable(d,18);r.prepareStable(d,24);const rays=r.stableStore.scene.evaluatedPoints,reused=r.prepareStable(d,12);assert.strictEqual(reused,first);assert.equal(r.stableStore.scene.evaluatedPoints,rays);assert.deepEqual(reused.ao.sample(0,.2,.3,.5),sample);assert.notStrictEqual(r.prepareStable({actualHeightMeters:3},12),first);
});
test('多尺度缓存按真实自适应补采样缓冲计费，限制32MiB与八项，命中更新最近使用',()=>{
 const cache=new Map();for(let i=0;i<8;i++)rememberSurfaceAnalysis(cache,i,{a:new Uint8Array(16)});cachedSurfaceAnalysis(cache,0);rememberSurfaceAnalysis(cache,8,{a:new Uint8Array(16)});assert(cache.has(0));assert(!cache.has(1));assert.equal(cache.size,8);
 const shared=new Uint8Array(1024),field={a:shared,patches:new Map([[1,{b:shared.subarray(4)}]])};assert.equal(analysisBytes(field),1024);rememberSurfaceAnalysis(cache,'large',{a:new Uint8Array(20*1024*1024)});rememberSurfaceAnalysis(cache,'large2',{patches:new Map([[0,{a:new Uint8Array(15*1024*1024)}]])});assert([...cache.values()].reduce((n,v)=>n+analysisBytes(v),0)<=SURFACE_ANALYSIS_CACHE_BYTES);assert(!cache.has('large'));assert(cache.has('large2'));
});
test('查看规则输入仍复用各效果的最终覆盖，只有选中的规则蒙版重新求值',()=>{
 const mesh={pos:Float32Array.of(0,0,0,1,0,0,0,1,0),normal:Float32Array.of(0,0,1,0,0,1,0,0,1),uv:Float32Array.of(0,0,1,0,0,1),indices:Uint32Array.of(0,1,2),height:1,min:[0,0,0],sourceSHA256:'a'.repeat(64)};
 const d=createDocument({source:mesh.sourceSHA256,name:'覆盖缓存',settings:{},actualHeightMeters:1});
 for(const [index,e] of d.surface.effects.entries())e.enabled=index<2;
 const target=d.surface.effects[0],mask=d.surface.masks.find(m=>m.id===target.maskRef);
 mask.items=[{id:'input-rule',type:'constant',enabled:true,strength:1,combine:'replace',params:{value:.25}}];
 target.edgeTreatment={version:2,blurCm:8,spreadCm:0,amount:1,resolution:256};
 const raster=new SurfaceDistributionRasterizer(mesh,mesh,16,{padding:1});
 const first=raster.render(d);
 const preview=raster.render(d,{preview:{kind:'input',effectId:target.id,ruleId:'input-rule'}});
 assert(preview.preview.some(v=>v===64));
 assert.deepEqual(preview.maps,first.maps);
 assert.equal(preview.performance.masksComputed,1);
 assert.equal(preview.performance.effectsComputed,0);
 assert.equal(preview.analysis.edgeProcessing[0].traceSamples,0);
});
test('覆盖计算阶段消息不结束任务，迟到的进度不串到下一次请求',async()=>{
 const mesh={pos:new Float32Array(0),normal:new Float32Array(0),indices:new Uint32Array(0),uv:new Float32Array(0),min:[0,0,0],height:1};
 const sent=[],worker={postMessage:data=>sent.push(data),terminate(){}},seen=[];
 const session=new SurfaceDistributionSession(mesh,mesh,{workerFactory:()=>worker});
 const first=session.request({size:1024},{onProgress:stage=>seen.push(stage)});
 const next=session.request({size:1024},{onProgress:stage=>seen.push(stage)});
 worker.onmessage({data:{id:1,stage:'第一层柔化 10%'}});
 assert.equal(sent.length,1);
 worker.onmessage({data:{id:1,maps:[]}});
 worker.onmessage({data:{id:1,stage:'迟到的进度'}});
 worker.onmessage({data:{id:2,stage:'第二层柔化 10%'}});
 worker.onmessage({data:{id:2,maps:[]}});
 assert.equal((await first).id,1);
 assert.equal((await next).id,2);
 assert.deepEqual(seen,['第一层柔化 10%','第二层柔化 10%']);
 session.dispose();
});
