import {test} from 'node:test';import assert from 'node:assert/strict';
import {packOutlineCharts} from '../material/web/uv-outline-packing.js';
import {packUvCharts} from '../material/web/uv-constraints.js';
import {growUvBoundary} from '../material/web/uv-boundary-growth.js';
import {createUvDensityBudget} from '../material/web/uv-density-budget.js';
import {buildUvTopology,uvEdgeContinuous} from '../material/web/uv-topology.js';
import {extendUvAlongFlow,sewUvFragments} from '../material/web/tree-uv-fragments.js';
import {verifySurfacePreserved} from '../material/web/mesh-codec.js';
import {analyzeUV} from '../material/web/uv-analysis.js';
import {measureUvClearance,clearanceAtResolution} from '../material/web/uv-clearance.js';
import {prepareUvRevision,prepareUvWithFallback} from '../material/web/uv-processing.js';
import {describePacking} from '../material/web/uv-packing-stats.js';
import {uvLayoutOutput,preparationUvMode,assertUvIslandsPreserved} from '../material/web/uv-layout-policy.js';
import {modelPreparationOptions} from '../material/web/model-preparation.js';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {createDocument as serverDocument,validateDocument as serverValidate} from '../material/project-state.js';
function rectangles(count=8,angle=Math.PI/4){const pos=[],normal=[],uv=[],indices=[];for(let c=0;c<count;c++){const start=pos.length/3,cos=Math.cos(angle),sin=Math.sin(angle);for(const [u,v]of [[0,0],[.48,0],[.48,.04],[0,.04]]){pos.push(c+u,v,0);normal.push(0,0,1);uv.push(.2+u*cos-v*sin,.2+u*sin+v*cos);}indices.push(start,start+1,start+2,start,start+2,start+3);}return{pos:Float32Array.from(pos),normal:Float32Array.from(normal),uv:Float32Array.from(uv),indices:Uint32Array.from(indices)};}
const options={resolution:512,padding:3,quarterTurns:true,refinePacking:true};
test('树结构候选在切线阶段发现零面积 UV 时，从同一拓扑重新展开',async()=>{
 const input=rectangles(1,0),original=structuredClone(input),sourceIndices=Uint32Array.of(0,1,2,3),calls=[];
 const packed={...input,uv:new Float32Array(input.uv.length),sourceIndices};
 const result=await prepareUvWithFallback(input,{mode:'tree',revision:7,resolution:2048,padding:6},{
  trees:()=>({prepare:async()=>({mesh:null}),pack:async()=>packed,dispose:()=>calls.push('dispose')}),
  native:async(mesh,mode)=>{
   calls.push(mode);
   if(mode==='tangents'){
    assert(analyzeUV(mesh).zeroUvFaces>0);
    throw Error('UV input has zero-area triangles; use automatic unwrap');
   }
   assert.equal(mesh,input);
   return {...mesh,sourceIndices};
  }
 },{isCurrent:()=>true,onFallback:()=>calls.push('fallback')});
 assert.deepEqual(calls,['tangents','dispose','fallback','unwrap']);
 assert.deepEqual(input,original);
 assert.equal(result.uvMode,'unwrap');
 assert.equal(result.uvRevision,7);
 assert.equal(result.packing.resolution,2048);
 assert.equal(result.packing.padding,6);
 assert.equal(analyzeUV(result).zeroUvFaces,0);
 verifySurfacePreserved(input,result);
});
test('树结构自动重展只处理零面积 UV，任务取消后不会继续',async()=>{
 const zero=Error('UV input has zero-area triangles; use automatic unwrap'),other=Error('树结构规则不匹配');
 for(const [failure,current,expected] of [[zero,false,{name:'AbortError'}],[other,true,{message:other.message}]]){
  const trees=()=>({prepare:async()=>{throw failure;},dispose(){}});
  await assert.rejects(prepareUvWithFallback(rectangles(1),{mode:'tree',revision:1},{trees,native:assert.fail},{
   isCurrent:()=>current,onFallback:assert.fail
  }),expected);
 }
});
test('累计密度从首次优化前计算，切线顶点重编号后仍按面角匹配',()=>{
 const reference=rectangles(2,0),scaled=(mesh,factor)=>({...mesh,uv:Float32Array.from(mesh.uv,x=>x*factor)});
 const current=scaled(reference,1.22);
 const renumbered={...current,pos:current.pos.slice(),uv:current.uv.slice(),indices:current.indices.slice()};
 for(let axis=0;axis<3;axis++)[renumbered.pos[axis],renumbered.pos[axis+3]]=[renumbered.pos[axis+3],renumbered.pos[axis]];
 for(let corner=0;corner<renumbered.indices.length;corner++){
  const i=renumbered.indices[corner];
  if(i<2)renumbered.indices[corner]=1-i;
 }
 [renumbered.uv[0],renumbered.uv[2]]=[renumbered.uv[2],renumbered.uv[0]];
 [renumbered.uv[1],renumbered.uv[3]]=[renumbered.uv[3],renumbered.uv[1]];
 const budget=createUvDensityBudget(renumbered,reference);
 assert(budget.audit(scaled(renumbered,1.14)));
 assert.equal(budget.audit(scaled(renumbered,1.22)),null);
 assert(Math.abs(budget.audit(renumbered).beforeP99-1.22)<1e-6);
 assert.throws(()=>createUvDensityBudget({...current,indices:Uint32Array.from(current.indices).reverse()},reference),/不匹配/);
});
test('斜长岛紧凑排布提高实际面积，保持几何、岛数与实测间距',()=>{
 const mesh=rectangles(),before=packOutlineCharts(mesh,{...options,refinePacking:false}),next=packOutlineCharts(mesh,options),a=analyzeUV(before),b=analyzeUV(next);
 assert(b.summedUvTriangleArea>a.summedUvTriangleArea*1.05);assert.equal(b.islands,8);verifySurfacePreserved(mesh,next);
 assert(clearanceAtResolution(measureUvClearance(next),options).safe);assert(next.packing.compactionSearch.trials.every(t=>!t.error));
});
test('紧凑排布不改变相对密度规则或拉伸',()=>{
 const mesh=rectangles(3),result=packOutlineCharts(mesh,{...options,weights:{1:2,2:.5}}),area=id=>{let sum=0;for(let f=id*2;f<id*2+2;f++){const [a,b,c]=[0,1,2].map(k=>result.indices[f*3+k]*2);sum+=Math.abs((result.uv[b]-result.uv[a])*(result.uv[c+1]-result.uv[a+1])-(result.uv[b+1]-result.uv[a+1])*(result.uv[c]-result.uv[a]))*.5;}return sum;};
 assert(Math.abs(area(1)/area(2)-16)<.001);assert(analyzeUV(result).anisotropy.p95<1.001);
});
test('全部锁定的UV逐位保留，不强行移动或缩放',()=>{
 const mesh=rectangles(2,0);for(let i=4;i<8;i++)mesh.uv[i*2+1]+=.4;const before=mesh.uv.slice(),result=packOutlineCharts(mesh,{...options,pins:[0,1]});
 assert.deepEqual(result.uv,before);assert.deepEqual(mesh.uv,before);verifySurfacePreserved(mesh,result);
});
test('部分锁定保留原坐标，其他岛可以紧凑排布',()=>{
 const mesh=rectangles(4),result=packOutlineCharts(mesh,{...options,pins:[0]});for(let i=0;i<4;i++)assert.deepEqual([...result.uv.subarray(i*2,i*2+2)],[...mesh.uv.subarray(i*2,i*2+2)]);
 verifySurfacePreserved(mesh,result);assert(clearanceAtResolution(measureUvClearance(result),options).safe);
});
test('小模型排布稳定，输入网格不被修改',()=>{
 const mesh=rectangles(3),copy=structuredClone(mesh),a=packOutlineCharts(mesh,options),b=packOutlineCharts(mesh,options);assert.deepEqual(a.uv,b.uv);assert.deepEqual(mesh,copy);
});
test('不同输出规格保持基础像素安全间距',()=>{for(const resolution of [512,1024,2048]){const result=packOutlineCharts(rectangles(3),{...options,resolution});assert(clearanceAtResolution(measureUvClearance(result),{resolution,padding:3}).safe);}});
test('无锁定规则也使用紧凑重排，再重新计算Mikk切线',async()=>{
 const mesh=rectangles(3);let packed=false;const calls=[];
 await prepareUvRevision(mesh,{mode:'repack',revision:1}, {pack:async(input,opts)=>{packed=true;assert(opts.quarterTurns&&opts.refinePacking);return packOutlineCharts(input,{...opts,resolution:512,padding:3});},native:async(input,mode)=>{calls.push(mode);return {...input,sourceIndices:Uint32Array.from({length:input.pos.length/3},(_,i)=>i)};}});
 assert(packed);assert.deepEqual(calls,['tangents']);
});
test('间距占用不能冒充实际表面利用率',()=>{const text=describePacking({reservedFootprint:.85,compactionSearch:{selected:true,selectedScale:1.1,baselineScale:1}});assert(text.includes('85.0%'));assert(text.includes('非表面覆盖率'));assert(text.includes('10.0%'));});
test('只共用一个顶点的两个岛保持各自的刚性变换',()=>{
 const mesh={pos:Float32Array.from([0,0,0,1,0,0,0,1,0,-1,0,0,0,-1,0]),normal:Float32Array.from(Array.from({length:5},()=>[0,0,1]).flat()),uv:Float32Array.from([.5,.5,.9,.8,.8,.9,.1,.2,.2,.1]),indices:Uint32Array.from([0,1,2,0,3,4])};
 const result=packOutlineCharts(mesh,options);verifySurfacePreserved(mesh,result);assert.equal(analyzeUV(result).islands,2);assert.equal([...result.sourceIndices].filter(i=>i===0).length,2);assert(clearanceAtResolution(measureUvClearance(result),options).safe);
});
test('排布进度单调前进，完成时才到100%',()=>{
 const progress=[];packOutlineCharts(rectangles(2),{...options,onProgress:p=>progress.push(p)});assert.equal(progress.at(-1),1);for(let i=1;i<progress.length;i++)assert(progress[i]>=progress[i-1]);assert(progress.slice(0,-1).every(p=>p<1));
});
test('已有合法UV仅因输出规格或间距改变时只重排，不重新拆岛',()=>{
 const state={sameSource:true,hasWorking:true,diagnostic:{zeroUvFaces:0,outOfRangeFaces:0,overlap:0}};
 assert.equal(preparationUvMode({...state,sameOutput:false,clearanceSafe:false}),'repack');
 assert.equal(preparationUvMode({...state,sameOutput:true,clearanceSafe:false}),'repack');
 assert.equal(preparationUvMode({...state,sameOutput:true,clearanceSafe:true}),'reuse');
});
test('新来源、缺少工作UV或无效UV仍进入明确的展开流程',()=>{
 const state={sameSource:true,hasWorking:true,diagnostic:{zeroUvFaces:0,outOfRangeFaces:0,overlap:0},sameOutput:true,clearanceSafe:true};
 for(const change of [{sameSource:false},{hasWorking:false},{diagnostic:null},{diagnostic:{zeroUvFaces:1}},{diagnostic:{outOfRangeFaces:1}},{diagnostic:{overlap:.1}}])assert.equal(preparationUvMode({...state,...change}),'tree');
});
function joinedSquare(){return{pos:Float32Array.from([0,0,0,1,0,0,1,1,0,0,1,0]),normal:Float32Array.from([0,0,1,0,0,1,0,0,1,0,0,1]),uv:Float32Array.from([0,0,1,0,1,1,0,1]),indices:Uint32Array.from([0,1,2,0,2,3])};}
function cutSquare(){const a=joinedSquare();return{...a,pos:Float32Array.from([0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0]),uv:Float32Array.from([0,0,1,0,1,1,.1,.2,.8,.9,0,1]),indices:Uint32Array.from([0,1,2,3,4,5])};}
test('碎岛归并沿共享边接回，并保留各面角来源与分离法线',()=>{
 const mesh=cutSquare();
 mesh.uv=Float32Array.from([.05,.05,.35,.05,.35,.35,.55,.55,.85,.85,.55,.85]);
 mesh.normal=Float32Array.from([0,0,1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0]);
 const copy=structuredClone(mesh),sewn=sewUvFragments(mesh,options);
 assert.equal(sewn.stats.merges,1);
 verifySurfacePreserved(mesh,sewn.mesh);
 assert.equal(analyzeUV(sewn.mesh).islands,1);
 assert(clearanceAtResolution(measureUvClearance(sewn.mesh),options).safe);
 assert.deepEqual(mesh,copy);
});
test('顺纹接缝接回横切断面并保持原面积、法线和间距',()=>{
 const pos=[],normal=[],uv=[],indices=[],directions=[];
 for(const [start,end,x,y] of [[0,10,.08,.12],[10,12,.12,.42]]){
  const offset=pos.length/3;
  for(let i=start;i<=end;i++)for(let j=0;j<2;j++){
   pos.push(i,j,0);normal.push(0,0,1);uv.push(x+(i-start)*.05,y+j*.05);
  }
  for(let i=0;i<end-start;i++){
   const a=offset+i*2;
   indices.push(a,a+2,a+1,a+2,a+3,a+1);
   directions.push(1,0,0,1,0,0);
  }
 }
 const mesh={pos:Float32Array.from(pos),normal:Float32Array.from(normal),
  uv:Float32Array.from(uv),indices:Uint32Array.from(indices)};
 const sewn=extendUvAlongFlow(mesh,Float32Array.from(directions),options);
 assert.equal(sewn.stats.merges,1);
 verifySurfacePreserved(mesh,sewn.mesh);
 const before=analyzeUV(mesh),after=analyzeUV(sewn.mesh);
 assert.equal(after.islands,1);
 assert(after.summedUvTriangleArea>=before.summedUvTriangleArea);
 assert(clearanceAtResolution(measureUvClearance(sewn.mesh),options).safe);
 assert.equal(extendUvAlongFlow(mesh,Float32Array.from(directions,(_,i)=>i%3===1?1:0),options),null);
});
test('逐面UV分组守卫拒绝新增接缝或合并原有岛',()=>{
 const joined=joinedSquare(),cut=cutSquare();assert.throws(()=>assertUvIslandsPreserved(joined,cut),/UV岛分组/);assert.throws(()=>assertUvIslandsPreserved(cut,joined),/UV岛分组/);
});
test('逐面UV分组守卫不被相同岛总数下的重新切分蒙混',()=>{
 const a=rectangles(2,0),b=structuredClone(a);b.indices=Uint32Array.from([0,1,2,4,6,7,4,5,6,0,2,3]);assert.throws(()=>assertUvIslandsPreserved(a,b),/UV岛分组/);
});
test('刚性重排逐面保留原岛分组',()=>{
 const mesh=rectangles(3),packed=packOutlineCharts(mesh,options);assert.deepEqual(assertUvIslandsPreserved(mesh,packed),{before:3,after:3});
});
test('轮廓嵌套统一放大原岛，保持全部面组和基础扩色间距',()=>{
 const mesh=rectangles(48,0),output={...options,resolution:1024};
 for(let island=0;island<48;island++)for(let corner=0;corner<4;corner++){
  const i=(island*4+corner)*2;
  mesh.uv[i]=(mesh.uv[i]-.2)*.15+.03+(island%8)*.118;
  mesh.uv[i+1]=(mesh.uv[i+1]-.2)*.15+.03+Math.floor(island/8)*.145;
 }
 const before=analyzeUV(mesh),result=packUvCharts(mesh,output),after=analyzeUV(result);
 assert.equal(result.packing.outlineNesting.islands,48);
 assert.deepEqual(assertUvIslandsPreserved(mesh,result),{before:48,after:48});
 assert(after.summedUvTriangleArea>before.summedUvTriangleArea);
 assert(Math.abs(after.anisotropy.p95-before.anisotropy.p95)<.001);
 assert(clearanceAtResolution(measureUvClearance(result),output).safe);
 verifySurfacePreserved(mesh,result);
});
test('保缝提覆盖扩展空闲边界并逐边保留原UV接缝',()=>{
 const mesh=rectangles(2,0),output={resolution:1024,padding:3};
 for(let i=4;i<8;i++)mesh.uv[i*2+1]+=.23;
 const before=mesh.uv.slice(),start=analyzeUV(mesh),grown=growUvBoundary(mesh,{...output,maxIterations:4});
 assert(grown);
 assert(grown.packing.boundaryGrowth.after>start.summedUvTriangleArea);
 verifySurfacePreserved(mesh,grown);
 assert.deepEqual(mesh.uv,before);
 assert.deepEqual(assertUvIslandsPreserved(mesh,grown),{before:2,after:2});
 for(const edge of buildUvTopology(mesh).edges)
  assert.equal(uvEdgeContinuous(mesh,edge,0),uvEdgeContinuous(grown,edge,0));
 assert(clearanceAtResolution(measureUvClearance(grown),output).safe);
});
test('窄间距下继续提覆盖保留原分组及精确间距',()=>{
 const mesh=rectangles(2,0),output={resolution:1024,padding:3};
 for(let i=4;i<8;i++)mesh.uv[i*2+1]+=.04+7.18/output.resolution;
 const before=analyzeUV(mesh),grown=growUvBoundary(mesh,{...output,maxIterations:4,projectedMotion:true});
 assert(grown?.packing.boundaryGrowth.projectedMotion);
 assert(grown.packing.boundaryGrowth.after>before.summedUvTriangleArea);
 assert.deepEqual(assertUvIslandsPreserved(mesh,grown),{before:2,after:2});
 for(const edge of buildUvTopology(mesh).edges)
  assert.equal(uvEdgeContinuous(mesh,edge,0),uvEdgeContinuous(grown,edge,0));
 verifySurfacePreserved(mesh,grown);
 assert(clearanceAtResolution(measureUvClearance(grown),output).safe);
});
test('细长岛首次拉伸超限后可在原限制内继续提覆盖',()=>{
 const mesh=rectangles(1,0),output={resolution:1024,padding:3};
 for(let i=0;i<4;i++){
  mesh.pos[i*3+1]*=.3;
  mesh.uv[i*2+1]=.2+mesh.pos[i*3+1];
 }
 const before=analyzeUV(mesh),grown=growUvBoundary(mesh,{...output,maxIterations:1});
 assert(grown);
 const after=analyzeUV(grown);
 assert(after.summedUvTriangleArea>before.summedUvTriangleArea);
 assert(after.anisotropy.p95<=before.anisotropy.p95*1.15);
 for(const edge of buildUvTopology(mesh).edges)
  assert.equal(uvEdgeContinuous(mesh,edge,0),uvEdgeContinuous(grown,edge,0));
 verifySurfacePreserved(mesh,grown);
 assert(clearanceAtResolution(measureUvClearance(grown),output).safe);
});
test('保缝提覆盖拒绝修改锁定岛或已有展开保护',async()=>{
 const mesh=rectangles(2),services={native:()=>assert.fail('Called native'),pack:()=>assert.fail('Started packing')};
 for(const controls of [{rules:{pins:[0]}},{cutRules:{protectedFaces:[0]}}])
  await assert.rejects(()=>prepareUvRevision(mesh,{mode:'repack',revision:1,shapeCoverage:true,...controls},services),/无锁定岛/);
});
test('保形填空从贴边的旧布局提高覆盖率并保留接缝',()=>{
 const mesh=rectangles(2,0),output={resolution:2048,padding:3};
 for(let i=0;i<8;i++){
  mesh.uv[i*2]+=-.2+3.5/output.resolution;
  if(i>=4)mesh.uv[i*2+1]+=.23;
 }
 const before=analyzeUV(mesh),result=packUvCharts(mesh,{...output,contourFill:true});
 const after=analyzeUV(result);
 assert(after.summedUvTriangleArea>before.summedUvTriangleArea);
 assert(after.anisotropy.p95<=before.anisotropy.p95*1.0001);
 assert.equal(result.packing.contourFill.maxRelativeDensity,1.22);
 verifySurfacePreserved(mesh,result);
 assert.deepEqual(assertUvIslandsPreserved(mesh,result),{before:2,after:2});
 for(const edge of buildUvTopology(mesh).edges)
  assert.equal(uvEdgeContinuous(mesh,edge,0),uvEdgeContinuous(result,edge,0));
 assert(clearanceAtResolution(measureUvClearance(result),output).safe);
});
test('候选间距独立于当前工程，扩色大小与实测安全间距对应',()=>{
 const current={resolution:512,padding:12,includeModel:true},candidate=uvLayoutOutput(current,3);assert.equal(current.padding,12);assert.equal(candidate.padding,3);assert.equal(candidate.includeModel,true);assert.notEqual(candidate,current);
 const packed=packOutlineCharts(rectangles(8),{...options,resolution:512}),raw=measureUvClearance(packed);assert(clearanceAtResolution(raw,candidate).safe);assert.equal(clearanceAtResolution(raw,current).safe,false);
 assert.throws(()=>uvLayoutOutput(current,-1));assert.throws(()=>uvLayoutOutput(current,3.5));
});
test('新工程默认紧凑扩色，已有工程的宽间距设置原样保留',()=>{
 assert.equal(modelPreparationOptions().padding,3);assert.equal(modelPreparationOptions({padding:12}).padding,12);
 for(const [create,validate]of [[createDocument,validateDocument],[serverDocument,serverValidate]]){const doc=create({source:'a'.repeat(64),name:'test',settings:{}});assert.equal(doc.output.padding,3);doc.output.padding=12;assert.equal(validate(doc).output.padding,12);}
});
test('重排统计明确报告每侧扩色、最小岛距与分组保持',()=>{
 const s=describePacking({padding:3,islandPreservation:{before:654,after:654}});assert(s.includes('≥7 px'));assert(s.includes('每侧扩色 3 px'));assert(s.includes('654 → 654'));
});

test('碎岛精修保留超过 120 度的硬折接缝，仍可接回平坦相邻面', () => {
  const mesh = {
    pos: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, .866, .5]),
    normal: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, .5, -.866, 0, .5, -.866, 0, .5, -.866]),
    uv: Float32Array.from([.1, .1, .3, .1, .1, .3, .7, .7, .5, .7, .7, .5]),
    indices: Uint32Array.from([0, 1, 2, 3, 4, 5]),
  };
  const options = { resolution: 512, padding: 3, preserveHardFolds: true };
  assert.equal(sewUvFragments(mesh, options), null);
  assert.equal(sewUvFragments(mesh, { ...options, preserveHardFolds: false }).stats.merges, 1);
  mesh.pos.set([0, -1, 0], 15);
  const sewn = sewUvFragments(mesh, options);
  assert.equal(sewn.stats.merges, 1);
  verifySurfacePreserved(mesh, sewn.mesh);
});
