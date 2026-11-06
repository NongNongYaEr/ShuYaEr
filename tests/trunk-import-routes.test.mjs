import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeTrunkRoute,trunkRoutePlan} from '../web/trunk-import-route.js';
import {prepareTreeAsset,modelPreparationOptions} from '../material/web/model-preparation.js';
import {MaterialUpdateFeedbackState,ProcessingFeedbackState} from '../material/web/processing-feedback.js';
test('三种导入方式具有不同执行计划，兼容旧版选择',()=>{
 const rig=trunkRoutePlan('rig'),material=trunkRoutePlan('material'),full=trunkRoutePlan('full');assert(!rig.material&&!rig.optimize&&!rig.unwrap);assert(material.material&&!material.optimize&&!material.unwrap);assert(full.material&&full.optimize&&full.unwrap);assert.equal(normalizeTrunkRoute('keep'),'rig');assert.equal(normalizeTrunkRoute('new'),'full');assert.throws(()=>normalizeTrunkRoute('other'));
});
function hostFixture({triangles=20000,safe=true}={}){
 const calls=[],mesh={indices:new Uint32Array(triangles*3),uv:Float32Array.from([.1,.2,.3,.4]),pos:Float32Array.from([1,2,3])},bytes=new Uint8Array([1,2,3]);let published;
 const host={current:()=>true,phase:id=>calls.push(id),read:async()=>bytes,inspect:()=>({triangles}),put:async()=> 'a'.repeat(64),parse:async()=>mesh,validatePreserved:async()=>calls.push('validate-preserved'),repairInput:async value=>{calls.push('repair');return{...value,source:mesh};},optimize:async value=>{calls.push('reduce');return{bytes:value.bytes,name:value.name,metadata:{outputTriangles:triangles}};},document:()=>({settings:{},barkFlow:null}),flow:async(source,doc)=>{doc.barkFlow={version:5};doc.settings={directional:true,directionMode:3};return{field:{}};},uv:async(source,doc,flow,options)=>{calls.push(options.route==='material'?'keep-uv':'unwrap');return{mesh:source,preserved:options.route==='material',clearance:{status:'measured',safe},statistics:{}};},publish:async value=>{published=value;return{projectId:'test'};}};return{host,calls,mesh,bytes,get published(){return published;}};
}
test('只制作材质即使超过目标面数，也不减面、不修网格、不重新拆UV',async()=>{
 const f=hostFixture(),before=structuredClone(f.mesh),result=await prepareTreeAsset({name:'Tree.glb'},{route:'material',target:15000},f.host);assert(!f.calls.includes('reduce'));assert(!f.calls.includes('repair'));assert(!f.calls.includes('unwrap'));assert(f.calls.includes('validate-preserved'));assert.deepEqual(f.mesh,before);assert.equal(result.report.outputTriangles,20000);assert.equal(result.report.route,'material');assert(result.report.optimizationSkipped);
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
