import {test} from 'node:test';import assert from 'node:assert/strict';
import {NativePresentationFence,waitForNativePresentation} from '../web/native-presentation.js';
test('静止视口的刷新需求不会被上一帧回执覆盖',()=>{
 const fence=new NativePresentationFence();const target=fence.request(42);assert.equal(target,43);assert(fence.needsSubmission(42));assert(!fence.needsSubmission(43));
});
test('拒绝/合并回执不满足刷新需求，后续接受的新帧才满足',()=>{
 const fence=new NativePresentationFence();fence.request(42);assert(fence.needsSubmission(42));assert(fence.needsSubmission(42));assert(!fence.needsSubmission(44));assert.equal(fence.request(44),45);assert(fence.needsSubmission(44));fence.reset();assert(!fence.needsSubmission(0));
});
const ready=(revision=43)=>({active:true,wanted:true,presentationAllowed:true,lastError:'',native:{frames:20,asset_identity:'tree',scene_session:'session',revision}});
test('等待实际显示的同一模型/会话的新帧，接受回执不等于显示完成',async()=>{
 let now=0,state=ready(42),steps=0;const result=await waitForNativePresentation({read:()=>state,current:()=>true,asset:'tree',session:'session',revision:43,now:()=>now,sleep:async ms=>{now+=ms;steps++;if(steps===1)state={...ready(50),native:{...ready(50).native,asset_identity:'old-tree'}};else if(steps===2)state={...ready(50),native:{...ready(50).native,scene_session:'old-session'}};else state=ready(43);}});assert(result.presentationReady);assert.equal(steps,3);
});
test('画面等待超时不制造永久渲染错误，重试可用已保存模型成功',async()=>{
 let now=0,state={...ready(42),active:false};const options={read:()=>state,current:()=>true,asset:'tree',session:'session',revision:43,timeout:100,now:()=>now,sleep:async ms=>now+=ms};const first=await waitForNativePresentation(options);assert(first.presentationTimedOut);assert.equal(state.lastError,'');state=ready(43);const second=await waitForNativePresentation(options);assert(second.presentationReady);assert.equal(second.lastError,'');
});
test('真实设备错误和来源切换不会被当作新模型首帧',async()=>{
 const bad=await waitForNativePresentation({read:()=>({...ready(),lastError:'device error'}),current:()=>true,asset:'tree',session:'session'});assert.equal(bad.presentationReady,false);assert.equal(bad.lastError,'device error');const stale=await waitForNativePresentation({read:()=>ready(),current:()=>false,asset:'tree',session:'session'});assert(stale.presentationSuperseded);assert.equal(stale.presentationReady,false);
});
