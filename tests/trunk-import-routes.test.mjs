import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeTrunkRoute,trunkRoutePlan} from '../web/trunk-import-route.js';
import {prepareTreeAsset,modelPreparationOptions} from '../material/web/model-preparation.js';
import {MaterialUpdateFeedbackState,ProcessingFeedbackState} from '../material/web/processing-feedback.js';
import {inspectGeometry,prepareGeometryImport} from '../material/web/geometry-repair.js';
import {digest,parseGLB} from '../material/web/model.js';
import {analyzeUV} from '../material/web/uv-analysis.js';
import {filteredCheckpointMesh,prepareRepairedUVSource,rebindRepairedMaterialProject,remapUVIslandRules,survivingFaceMap} from '../material/web/geometry-repair-workspace.js';
import {restoreWorkingMesh} from '../material/web/working-mesh.js';
import {writeGLB} from '../material/web/glb-writer.js';
import {runBatchQueue} from '../material/web/batch-queue.js';
import {buildUvTopology,validateGuideSource} from '../material/web/uv-topology.js';
import {repackFixture} from './imported-trunk-fixture.mjs';
test('三种导入方式具有不同执行计划，兼容旧版选择',()=>{
 const rig=trunkRoutePlan('rig'),material=trunkRoutePlan('material'),full=trunkRoutePlan('full');assert(!rig.material&&!rig.optimize&&!rig.unwrap);assert(material.material&&!material.optimize&&!material.unwrap);assert(full.material&&full.optimize&&full.unwrap);assert.equal(normalizeTrunkRoute('keep'),'rig');assert.equal(normalizeTrunkRoute('new'),'full');assert.throws(()=>normalizeTrunkRoute('other'));
});
function hostFixture({triangles=20000,safe=true}={}){
 const calls=[],mesh={indices:Uint32Array.from({length:triangles*3},(_,corner)=>corner%3),uv:Float32Array.of(.1,.2,.3,.4,.1,.4),pos:Float32Array.of(0,0,0,1,0,0,0,1,0)},bytes=new Uint8Array([1,2,3]);let published;
 const host={current:()=>true,phase:id=>calls.push(id),read:async()=>bytes,inspect:()=>({triangles}),put:async()=> 'a'.repeat(64),parse:async()=>mesh,validatePreserved:async()=>calls.push('validate-preserved'),repairInput:async value=>{calls.push('repair');return{...value,source:mesh};},optimize:async value=>{calls.push('reduce');return{bytes:value.bytes,name:value.name,metadata:{outputTriangles:triangles}};},document:()=>({settings:{},barkFlow:null}),flow:async(source,doc)=>{doc.barkFlow={version:5};doc.settings={directional:true,directionMode:3};return{field:{}};},uv:async(source,doc,flow,options)=>{calls.push(options.route==='material'?'keep-uv':'unwrap');return{mesh:source,preserved:options.route==='material',clearance:{status:'measured',safe},statistics:{}};},publish:async value=>{published=value;return{projectId:'test'};}};return{host,calls,mesh,bytes,get published(){return published;}};
}
test('只制作材质的干净网格即使超过目标面数，也不减面或重新拆UV',async()=>{
 const f=hostFixture(),before=structuredClone(f.mesh),result=await prepareTreeAsset({name:'Tree.glb'},{route:'material',target:15000},f.host);assert(!f.calls.includes('reduce'));assert(!f.calls.includes('unwrap'));assert(f.calls.includes('validate-preserved'));assert.deepEqual(f.mesh,before);assert.equal(result.report.geometryRepair,null);assert.equal(result.report.outputTriangles,20000);assert.equal(result.report.route,'material');assert(result.report.optimizationSkipped);
});

function repairFixture(confirm,{validUV=true,degenerateOnlyVertex=false,degenerateFirst=false}={}){
 const fixture=hostFixture({triangles:2}),buffers=[],bufferViews=[],accessors=[];
 let offset=0;
 function attribute(data,type,count,componentType=5126){
  const chunk=Buffer.from(data.buffer),bufferView=bufferViews.push({buffer:0,byteOffset:offset,byteLength:chunk.length})-1;
  buffers.push(chunk);offset+=chunk.length;
  return accessors.push({bufferView,type,count,componentType})-1;
 }
 const count=degenerateOnlyVertex?4:3;
 const attributes={
  POSITION:attribute(Float32Array.of(0,0,0,1,0,0,0,1,0,...(degenerateOnlyVertex?[.5,0,0]:[])),'VEC3',count),
  NORMAL:attribute(Float32Array.of(0,0,1,0,0,1,0,0,1,...(degenerateOnlyVertex?[0,0,0]:[])),'VEC3',count),
  TEXCOORD_0:attribute(Float32Array.of(.1,.1,.9,.1,validUV ? .1 : 1.1,.9,...(degenerateOnlyVertex?[.5,.1]:[])),'VEC2',count),
 };
 const kept=[0,1,2],deleted=[0,1,degenerateOnlyVertex?3:1];
 const indices=attribute(Uint16Array.of(...(degenerateFirst?[...deleted,...kept]:[...kept,...deleted])),'SCALAR',6,5123);
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes,indices}]}],buffers:[{byteLength:offset}],bufferViews,accessors};
 const packed=repackFixture({json,bin:Buffer.concat(buffers)});
 const bytes=Uint8Array.from(packed).buffer,stored=[];
 fixture.host.read=async()=>bytes;
 fixture.host.parse=parseGLB;
 fixture.host.put=async value=>{stored.push(value);return digest(value);};
 fixture.host.repairInput=async value=>prepareGeometryImport(value.bytes,value.name,{source:value.source,confirm});
 fixture.host.validatePreserved=async source=>{
  const uv=analyzeUV(source);
  if(!source.hasSourceUV||uv.zeroUvFaces||uv.outOfRangeFaces||uv.overlap>.001)throw Error('原UV无效');
 };
 return {fixture,bytes,stored};
}

test('仅材质确认清理零面积面后校验原 UV，保留原文件和有效面',async()=>{
 let confirmations=0;
 const {fixture,bytes,stored}=repairFixture((source,name)=>{
  confirmations++;
  assert.equal(name,'Tree.glb');
  assert.equal(source.geometryRepair.removedFaces,1);
  return true;
 });
 const original=await parseGLB(bytes,'Tree.glb');
 assert.equal(analyzeUV(original).zeroUvFaces,1);
 const result=await prepareTreeAsset({name:'Tree.glb'},{route:'material'},fixture.host);
 const {mesh,originalHash}=fixture.published;
 assert.equal(confirmations,1);
 assert.deepEqual(mesh.indices,original.indices.slice(0,3));
 assert.deepEqual(mesh.pos,original.pos);
 assert.deepEqual(mesh.uv,original.uv);
 assert.equal(await digest(bytes),originalHash);
 assert.notEqual(mesh.sourceSHA256,originalHash);
 assert.equal(stored.length,2);
 assert.equal(result.report.geometryRepair.removedFaces,1);
 assert.equal(result.report.outputTriangles,1);
 assert(result.report.optimizationSkipped);
 assert(!fixture.calls.includes('reduce')&&!fixture.calls.includes('unwrap'));
});

test('仅退化面引用的无效法线不会在清理确认前拦住导入',async()=>{
 const {bytes}=repairFixture(()=>true,{degenerateOnlyVertex:true});
 await assert.rejects(parseGLB(bytes,'Tree.glb'),/相邻三角面全部退化/);
 let confirmations=0;
 const result=await prepareGeometryImport(bytes,'Tree.glb',{confirm:source=>{
  confirmations++;
  assert.equal(source.geometryRepair.removedFaces,1);
  return true;
 }});
 assert.equal(confirmations,1);
 assert.equal(result.source.indices.length,3);
 assert.equal(inspectGeometry(result.source).removedFaces,0);
 assert.notEqual(result.source.sourceSHA256,await digest(bytes));
});

test('修复旧工程的 UV 候选保留工作 UV 和原工程，并重映射保留的面引用',async()=>{
 const {bytes}=repairFixture(()=>true,{degenerateFirst:true});
 const source=await parseGLB(bytes,'Tree.glb');
 const working=await restoreWorkingMesh(source,{...source,uv:Float32Array.of(.2,.2,.7,.2,.2,.7),chartIds:Int32Array.of(0,0,0)},{mode:'repack',revision:1});
 working.diagnostic=analyzeUV(working,{includeFaces:true});
 const geometry=inspectGeometry(source),faces=survivingFaceMap(geometry);
 assert.deepEqual([...faces],[-1,0]);
 const repaired=await prepareRepairedUVSource(source,working,geometry,{mode:'repack',revision:1});
 assert.equal(repaired.input.uvMode,'repack');
 assert.deepEqual(repaired.input.uv,working.uv);
 assert.notDeepEqual(repaired.input.uv,repaired.source.uv);
 assert.deepEqual([...repaired.input.indices],[0,1,2]);
 assert.deepEqual([...working.indices],[0,1,1,0,1,2]);
 const island=working.diagnostic.faceIslands[1];
 assert.deepEqual(remapUVIslandRules({pins:[island],weights:{[island]:2}},working,repaired.input,faces),{pins:[0],weights:{0:2}});
 const original={sourceName:source.name,resources:{source:source.sourceSHA256,working:'uv',ao:'ao'},output:{},parts:{groups:[{faces:[0,1],origin:'old'}]},regions:[{strokes:[{face:0},{face:1}]}],surface:{areas:[{strokes:[{face:1}]}],analysis:{curvature:{}},effects:[{paint:{strokes:[{dabs:[{face:1}]}]},manualDecal:{anchor:{face:1}}}]},uvCutRules:{seams:[{face:1}],protectedFaces:[0,1]},directionCorrections:[],barkFlow:null};
 const copy=rebindRepairedMaterialProject(original,repaired.source,faces);
 assert.equal(copy.resources.source,repaired.source.sourceSHA256);
 assert.equal(copy.resources.ao,null);
 assert.deepEqual(copy.parts.groups[0],{faces:[0]});
 assert.deepEqual(copy.regions[0].strokes,[{face:0}]);
 assert.equal(copy.surface.effects[0].paint.strokes[0].dabs[0].face,0);
 assert.equal(copy.surface.effects[0].manualDecal.anchor.face,0);
 assert.deepEqual(copy.uvCutRules.protectedFaces,[0]);
 assert.equal(original.resources.source,source.sourceSHA256);
 assert.deepEqual(original.parts.groups[0].faces,[0,1]);
});

test('拓扑和 UV 检查点仅在导出副本删除退化面并维持实际高度',async()=>{
 const {bytes}=repairFixture(()=>true);
 const source=await parseGLB(bytes,'Tree.glb');
 const clean=await filteredCheckpointMesh(source,inspectGeometry(source));
 for(const geometryOnly of [true,false]){
  const exported=await parseGLB(writeGLB(clean,{actualHeightMeters:2,geometryOnly}).buffer,'checkpoint.glb');
  assert.equal(exported.height,2);
  assert.equal(exported.indices.length,3);
  assert.equal(inspectGeometry(exported).removedFaces,0);
  if(!geometryOnly)assert.deepEqual(exported.uv,source.uv);
 }
 assert.equal(source.indices.length,6);
});

test('修复副本移除已变成边界的接缝，保留仍为内部边的接缝和保护范围',async()=>{
 const mesh={
  pos:Float32Array.of(0,0,0,1,0,0,0,1,0,.5,0,0,-1,0,0),
  normal:Float32Array.from({length:15},(_,i)=>i%3===2?1:0),
  uv:Float32Array.of(.5,.2,.9,.2,.5,.8,.7,.2,.1,.2),
  tangent:Float32Array.from({length:20},(_,i)=>i%4===0||i%4===3?1:0),
  indices:Uint32Array.of(1,0,3,0,1,2,0,2,4),height:1,
 };
 const source=await parseGLB(writeGLB(mesh).buffer,'Tree.glb');
 const doc={sourceName:source.name,resources:{source:source.sourceSHA256},output:{},parts:{groups:[]},regions:[],
  surface:{areas:[],effects:[],analysis:{curvature:{}}},directionCorrections:[],
  uvCutRules:{seams:[{face:1,edge:0},{face:2,edge:0}],protectedFaces:[0,1,2]},
 };
 assert.equal(validateGuideSource(buildUvTopology(source),doc.uvCutRules),true);
 const report=inspectGeometry(source);
 const {source:clean}=await prepareRepairedUVSource(source,source,report);
 const copy=rebindRepairedMaterialProject(doc,clean,survivingFaceMap(report));
 const reopened=await parseGLB(clean.sourceBytes,copy.sourceName);
 assert.deepEqual(copy.uvCutRules,{seams:[{face:1,edge:0}],protectedFaces:[0,1]});
 assert.equal(validateGuideSource(buildUvTopology(reopened),copy.uvCutRules),true);
 assert.deepEqual(doc.uvCutRules,{seams:[{face:1,edge:0},{face:2,edge:0}],protectedFaces:[0,1,2]});
});

test('减面候选仅在存在并保留原 UV 时输出 TEXCOORD_0',async()=>{
 const {bytes}=repairFixture(()=>true);
 const source=await parseGLB(bytes,'Tree.glb');
 const geometryOnly=writeGLB(source,{geometryOnly:true}).buffer;
 const report=new TextEncoder().encode(JSON.stringify({version:1,inputTriangles:1,outputTriangles:1,candidateIndices:3,proxyIndices:0}));
 const result=new Uint8Array(4+report.length+12),view=new DataView(result.buffer);
 view.setUint32(0,report.length,true);result.set(report,4);
 for(let i=0;i<3;i++)view.setUint32(4+report.length+i*4,i,true);
 let reply;
 const previousSelf=globalThis.self;
 const worker={postMessage(data){reply=data;}};
 globalThis.self=worker;
 try{
  await import('../material/web/mesh-optimization-worker.js');
  const call=async(kind,data)=>{
   await worker.onmessage({data:{id:1,kind,...data}});
   assert.equal(reply.error,undefined);
   return reply;
  };
  for(const [input,preserveUV,hasSourceUV] of [[bytes,true,true],[bytes,false,false],[geometryOnly,true,false]]){
   await call('load',{bytes:input,name:'Tree.glb'});
   await call('result',{bytes:result,options:{preserveUV},preview:false});
   const output=await call('export',{name:'Optimized.glb'});
   const mesh=await parseGLB(output.bytes.buffer,'Optimized.glb');
   assert.equal(mesh.hasSourceUV,hasSourceUV);
   assert.deepEqual(mesh.indices,Uint32Array.of(0,1,2));
   if(hasSourceUV)assert.deepEqual(mesh.uv,source.uv);
  }
 }finally{
  if(previousSelf===undefined)delete globalThis.self;
  else globalThis.self=previousSelf;
 }
});

test('仅材质取消清理或保留面 UV 无效时，不发布工作副本',async()=>{
 const declined=repairFixture(()=>false);
 await assert.rejects(prepareTreeAsset({name:'Tree.glb'},{route:'material'},declined.fixture.host),{name:'AbortError'});
 assert.equal(declined.stored.length,1);
 assert(!declined.fixture.published);
 const invalid=repairFixture(()=>true,{validUV:false});
 await assert.rejects(prepareTreeAsset({name:'Tree.glb'},{route:'material'},invalid.fixture.host),/原UV无效/);
 assert.equal(invalid.stored.length,1);
 assert(!invalid.fixture.published);
});
test('只制作材质保留原间距并记录风险，不替换为重新展开',async()=>{
 const f=hostFixture({safe:false}),result=await prepareTreeAsset({name:'Tree.glb'},{route:'material'},f.host);assert(result.report.warnings.some(s=>s.includes('原UV保留')));assert(!f.calls.includes('unwrap'));assert(f.published);
});
test('只制作材质超过工作预算直接提示，不暗中转为减面',async()=>{
 const f=hostFixture({triangles:250001});await assert.rejects(prepareTreeAsset({name:'Tree.glb'},{route:'material'},f.host),/保留原面数/);assert(!f.calls.includes('reduce'));assert(!f.published);
});
test('完整流程仍按目标减面和展开，不接受不安全的新UV',async()=>{
 const f=hostFixture({safe:false});await assert.rejects(prepareTreeAsset({name:'Tree.glb'},{route:'full',target:15000},f.host),/UV未通过/);assert(f.calls.includes('reduce'));assert(f.calls.includes('unwrap'));assert(!f.published);
});
test('完整流程 UV 失败后可显式打开已校验的拓扑检查点，无须重新减面',async()=>{
 const f=hostFixture({safe:false}),reducedBytes=Uint8Array.of(4,5,6),originalHash='a'.repeat(64),sourceHash='b'.repeat(64);
 const reducedMesh={...f.mesh,indices:f.mesh.indices.slice(0,45000),sourceSHA256:sourceHash};
 f.host.read=async({hash})=>hash===sourceHash?reducedBytes:f.bytes;
 f.host.parse=async bytes=>bytes===reducedBytes?reducedMesh:{...f.mesh,sourceSHA256:originalHash};
 f.host.put=async bytes=>bytes===reducedBytes?sourceHash:originalHash;
 f.host.repairInput=async value=>value;
 const optimization={outputTriangles:15000};
 f.host.optimize=async()=>{f.calls.push('reduce');return {bytes:reducedBytes,name:'Reduced.glb',metadata:optimization};};
 let checkpoint;
 await assert.rejects(prepareTreeAsset({name:'Tree.glb'},{route:'full',target:15000},f.host),error=>{
  assert.equal(error.preparationStage,'uv');checkpoint=error.preparationCheckpoint;return true;
 });
 assert(!f.published);
 assert.equal(checkpoint.kind,'topology');
 assert.equal(checkpoint.sourceHash,sourceHash);
 const stale={...checkpoint,sourceHash:'c'.repeat(64)};
 await assert.rejects(prepareTreeAsset({checkpoint:stale},{route:'staged',target:15000},f.host),/检查点与已保存的模型不一致/);
 assert(!f.published);
 const result=await prepareTreeAsset({checkpoint},{route:'staged',target:15000},f.host);
 assert.equal(f.published.mesh,reducedMesh);
 assert.equal(f.published.originalHash,originalHash);
 assert.equal(result.report.inputTriangles,20000);
 assert.equal(result.report.outputTriangles,15000);
 assert.equal(result.report.route,'staged');
 assert.equal(result.report.uv,undefined);
 assert.equal(f.calls.filter(call=>call==='reduce').length,1);
 assert.equal(f.calls.filter(call=>call==='unwrap').length,1);
});
test('减面失败可保留容量内的原模型，取消和超出容量时不提供跳过减面',async()=>{
 const sourceHash='a'.repeat(64),f=hostFixture();
 f.host.parse=async()=>({...f.mesh,sourceSHA256:sourceHash});
 f.host.repairInput=async value=>value;
 f.host.optimize=async()=>{f.calls.push('reduce');throw Error('减面超时');};
 let checkpoint;
 await assert.rejects(prepareTreeAsset({name:'Tree.glb'},{target:15000},f.host),error=>{
  assert.match(error.message,/减面超时/);checkpoint=error.preparationCheckpoint;return true;
 });
 assert(!f.published);assert.equal(checkpoint.kind,'source');
 const result=await prepareTreeAsset({checkpoint},{route:'staged',target:15000},f.host);
 assert(result.report.optimizationSkipped);
 assert.deepEqual(f.published.mesh.uv,f.mesh.uv);
 assert.equal(f.calls.filter(call=>call==='reduce').length,1);
 for(const [triangles,error]of [[20000,Object.assign(Error('取消'),{name:'AbortError'})],[250001,Error('减面超时')]]){
  const other=hostFixture({triangles});other.host.optimize=async()=>{throw error;};
  await assert.rejects(prepareTreeAsset({name:'Tree.glb'},{target:15000},other.host),failure=>{
   assert.equal(failure.preparationCheckpoint,undefined);
   assert.equal(failure.suggestOptimization,triangles>250000?true:undefined);
   return true;
  });
  assert(!other.published);
 }
});
test('减面后产生退化面的候选在确认清理前拒绝，保留原工程',async()=>{
 const {fixture}=repairFixture(()=>assert.fail('减面候选不应询问清理'));
 fixture.host.inspect=()=>({triangles:20000});
 await assert.rejects(prepareTreeAsset({name:'Tree.glb'},{route:'full',target:100},fixture.host),/减面结果出现退化面/);
 assert(!fixture.published);
});

test('批量跳过未同意修复的模型后继续，整个队列可正常结束',async()=>{
 const items=[{id:'skip',name:'skip.glb'},{id:'next',name:'next.glb'}],visited=[];
 const report=await runBatchQueue(items,{process(item){
  visited.push(item.id);
  return item.id==='skip'?{skipped:true,reason:'未确认清理退化面'}:{committed:true};
 }});
 assert.deepEqual(visited,['skip','next']);
 assert.equal(report.state,'complete');
 assert.equal(report.items[0].state,'skipped');
 assert.equal(report.items[0].error,'未确认清理退化面');
 assert.deepEqual(report.counts,{complete:1,failed:0,cancelled:0,skipped:1});
 const cancelled=await runBatchQueue(items,{process(){throw Object.assign(Error('已取消'),{name:'AbortError'});}});
 assert.equal(cancelled.state,'cancelled');
 assert.deepEqual(cancelled.counts,{complete:0,failed:0,cancelled:1,skipped:1});
});
test('保留模型校验失败或处理中取消，不发布工作副本',async()=>{
 const f=hostFixture();f.host.validatePreserved=async()=>{throw Error('原UV无效');};await assert.rejects(prepareTreeAsset({name:'Tree.glb'},{route:'material'},f.host),/原UV无效/);assert(!f.published);const g=hostFixture();g.host.current=()=>false;await assert.rejects(prepareTreeAsset({name:'Tree.glb'},{route:'material'},g.host),{name:'AbortError'});assert(!g.published);assert.throws(()=>modelPreparationOptions({route:'rig'}));
});
test('材质loading只由最新任务结束，连续调参保留累计耗时',()=>{
 let now=0;const s=new MaterialUpdateFeedbackState(()=>now),a=Promise.resolve(),b=Promise.resolve(),t1=s.begin(a,'正在更新');now=1800;const t2=s.begin(b,'正在更新覆盖');assert.equal(s.finish(t1),false);assert(s.snapshot.pending);assert.equal(s.snapshot.seconds,1);now=3500;assert(s.finish(t2));assert.equal(s.snapshot.status,'done');assert.equal(s.snapshot.seconds,3);
});
test('同一合并任务不重复开始；失败、释放和迟到任务均保持正确状态',()=>{
 const s=new MaterialUpdateFeedbackState(()=>0),p=Promise.resolve(),t=s.begin(p,'材质');assert.equal(s.begin(p,'覆盖'),t);assert.equal(s.snapshot.message,'覆盖');assert(s.finish(t,'资源失败'));assert.equal(s.snapshot.status,'error');const late=s.begin(p,'下一任务');s.dispose();assert.equal(s.finish(late),false);assert.equal(s.snapshot.pending,false);
});
test('仅材质准备不会显示正在减面或正在展开UV的错误进度',()=>{
 const s=new ProcessingFeedbackState(()=>0);s.begin({kind:'model preparation',preparationRoute:'material'});s.stage('optimize');assert.equal(s.snapshot.title,'正在校验原模型');s.stage('uv');assert.equal(s.snapshot.title,'正在校验原 UV');assert(s.snapshot.detail.includes('保留现有UV'));
});
