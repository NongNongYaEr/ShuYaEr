import test from 'node:test';
import assert from 'node:assert/strict';
import {BURL_SCATTER_DEFAULTS,generateBurlScatter,prepareBurlScatter} from '../material/web/burl-scatter.js';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {addEffect} from '../material/web/surface-effects.js';
import {createLayerGroup} from '../material/web/surface-layers.js';
import {createSurfaceWorkbench} from '../material/web/surface-workbench.js';

const sourceSHA256='e'.repeat(64),actualHeightMeters=3;

function wall(){
 const pos=[],normal=[],indices=[],side=36;
 for(let y=0;y<=side;y++)for(let x=0;x<=side;x++){
  pos.push(x/side*3,y/side*3,0);
  normal.push(0,0,1);
 }
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const a=y*(side+1)+x,next=a+side+1;
  indices.push(a,a+1,next,a+1,next+1,next);
 }
 return {
  pos:Float32Array.from(pos),normal:Float32Array.from(normal),indices:Uint32Array.from(indices),
  min:[0,0,0],height:actualHeightMeters,sourceSHA256,
 };
}

test('数量增加保留已有确定性选点，换种子和尺寸生成可区别的贴花',()=>{
 const mesh=wall(),context=prepareBurlScatter(mesh,{actualHeightMeters,recognitionMeters:.36});
 const generate=params=>generateBurlScatter(mesh,{...BURL_SCATTER_DEFAULTS,...params},{actualHeightMeters,context});
 const original=generate({});
 assert.equal(original.summary.placed,4);
 assert.equal(original.summary.reasonCode,undefined);
 assert.deepEqual(generate({}).placements,original.placements);
 const larger=generate({count:6});
 assert.equal(larger.summary.placed,6);
 assert.deepEqual(larger.placements.slice(0,4),original.placements);
 const resized=generate({minSizeCm:36,maxSizeCm:58});
 assert(resized.placements.every(p=>p.widthMeters>=.36&&p.widthMeters<=.58));
 assert.notDeepEqual(resized.placements,original.placements);
 assert.notDeepEqual(generate({seed:18}).placements.map(p=>p.anchor),original.placements.map(p=>p.anchor));
});

test('不足原因区分源表面为空、范围无候选以及区域或间距受限',()=>{
 const mesh=wall(),context=prepareBurlScatter(mesh,{actualHeightMeters});
 const generate=(params={},options={})=>generateBurlScatter(mesh,{...BURL_SCATTER_DEFAULTS,...params},{actualHeightMeters,context,...options});
 const noSurface=generate({minHeightMeters:4,maxHeightMeters:5});
 assert.equal(noSurface.summary.placed,0);
 assert.equal(noSurface.summary.reasonCode,'no-eligible-surface');
 const noCenters=generate({},{eligible:()=>false});
 assert.equal(noCenters.summary.placed,0);
 assert.equal(noCenters.summary.reasonCode,'no-eligible-centers');
 const crowded=generate({count:8,minSizeCm:100,maxSizeCm:120,spacing:4});
 assert(crowded.summary.placed<8);
 assert.equal(crowded.summary.reasonCode,'surface-or-spacing');
 const zero=generate({count:0});
 assert.equal(zero.summary.placed,0);
 assert.equal(zero.summary.reasonCode,undefined);
});

function workbenchFixture(){
 const doc=createDocument({source:sourceSHA256,actualHeightMeters,name:'贴花状态测试',settings:{}});
 Object.assign(doc.surface,{effects:[],masks:[],areas:[],layers:[]});
 const scatter=addEffect(doc.surface,'burl'),group=createLayerGroup(scatter.s,[scatter.id]);
 doc.surface=group.s;
 doc.resources.ao='a'.repeat(64);
 doc.surface.analysis.curvature.preparedFor={sourceSHA256,actualHeightMeters,
  radiusMeters:doc.surface.analysis.curvature.radiusMeters};
 const source={sourceSHA256,ao:Float32Array.of(.65,.95,1)},requests=[];
 let working={};
 const renderer={setSculptResponse(){},setSurfaceMasks(){},setSurfaceStack(){}};
 const workbench=createSurfaceWorkbench({
  document:()=>doc,settings:()=>doc.settings,source:()=>source,working:()=>working,renderer:()=>renderer,
  sessionFactory:()=>({dispose(){},request({document}){
   return new Promise(resolve=>requests.push({document,resolve}));
  }}),
 });
 return {doc,workbench,requests,id:scatter.id,groupId:group.id,replaceWorking(){working={};}};
}

test('散布面板当前数量只来自匹配工程参数和模型的已接受分析',async()=>{
 const {doc,workbench,requests,id,groupId,replaceWorking}=workbenchFixture();
 const effect=doc.surface.effects.find(e=>e.id===id),group=doc.surface.layers.find(n=>n.id===groupId);
 const state=()=>workbench.burlPlacement(id);
 const finish=(index,result)=>requests[index].resolve({analysis:{burls:result?[result]:[]}});
 const unaccepted={active:true,accepted:false,result:null};
 assert.equal(workbench.burlPlacement('missing'),null);
 assert.deepEqual(state(),unaccepted);

 const first=workbench.update();
 assert.deepEqual(state(),unaccepted);
 const baseline={effectId:id,requested:4,placed:4};
 finish(0,baseline);
 await first;
 assert.deepEqual(state(),{active:true,accepted:true,result:baseline});

 effect.params.burlCount=5;
 assert.deepEqual(state(),unaccepted);
 const stale=workbench.update();
 const rejected=assert.rejects(stale,{name:'AbortError'});
 effect.params.burlCount=6;
 const current=workbench.update();
 finish(1,{effectId:id,requested:5,placed:5});
 await rejected;
 assert.deepEqual(state(),unaccepted);
 const partial={effectId:id,requested:6,placed:3,reasonCode:'surface-or-spacing'};
 finish(2,partial);
 await current;
 assert.deepEqual(state(),{active:true,accepted:true,result:partial});

 group.enabled=false;
 assert.deepEqual(state(),{active:false,accepted:false,result:null});
 const hidden=workbench.update();
 finish(3,null);
 await hidden;
 assert.deepEqual(state(),{active:false,accepted:true,result:null});
 group.enabled=true;
 effect.params.burlCount=0;
 assert.equal(state().active,false);
 const empty=workbench.update();
 finish(4,null);
 await empty;
 assert.deepEqual(state(),{active:false,accepted:true,result:null});

 effect.params.burlCount=4;
 const restored=workbench.update();
 finish(5,baseline);
 await restored;
 assert.deepEqual(state(),{active:true,accepted:true,result:baseline});
 replaceWorking();
 assert.deepEqual(state(),unaccepted);
 workbench.dispose();
});

test('隐藏的贴花数量仍计入同一工程的八个名额',()=>{
 const {doc,id}=workbenchFixture(),second=addEffect(doc.surface,'burl');
 doc.surface=second.s;
 const hidden=doc.surface.effects.find(e=>e.id===second.id);
 hidden.enabled=false;
 assert.equal(validateDocument(doc).surface.effects.reduce((sum,e)=>sum+e.params.burlCount,0),8);
 doc.surface.effects.find(e=>e.id===id).params.burlCount=5;
 assert.throws(()=>validateDocument(doc),/最多8个/);
});
