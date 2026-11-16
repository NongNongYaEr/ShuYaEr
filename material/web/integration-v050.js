import {endpoint} from './service-adapter.js';
import {getMaterialViewportNavigationMode,setMaterialViewportNavigationMode} from './blender-navigation.js';
let current=null,busy=false,moduleBusy=true,cached=null,awaiting=null,receiving=null;
const componentMount=!!window.__treeMaterialHostConfig?.componentMount;
const post=value=>window.chrome.webview.postMessage(JSON.stringify({topic:'shuyaer-v050',...value}));
document.body.classList.add('trunk-material-component');if(componentMount)document.body.classList.add('trunk-native-component');
const shell=document.createElement('header');shell.className='v050-trunk-heading';shell.innerHTML='<div><small>资源中心 / 树干整理</small><strong data-trunk-title>表面材质</strong></div><span data-trunk-message role="status">正在准备工作台…</span><button data-return>返回树干整理</button>';
const nav=document.createElement('nav');nav.className='v050-trunk-steps';nav.setAttribute('aria-label','树干整理流程');nav.innerHTML='<button data-stage="model">01 模型准备</button><button data-stage="material">02 表面材质</button><button data-stage="export">03 检查与保存</button><button data-rig>04 自动骨架与绑定</button>';
const footer=document.createElement('footer');footer.className='v050-trunk-footer';footer.innerHTML='<span>当前树干 · 材质数据随检查点保留</span><button data-prev>上一步</button><button id="returnMaterialToPlant" class="primary">下一步：检查与保存</button>';
document.body.prepend(shell,nav);document.body.append(footer);
const button=footer.querySelector('#returnMaterialToPlant'),back=shell.querySelector('[data-return]'),message=shell.querySelector('[data-trunk-message]');
const label=text=>{message.textContent=text;};
const stage=()=>document.body.dataset.workspaceStage||'material';
const snapshot=()=>window.treeMaterialModule.getSnapshot();
const signature=()=>JSON.stringify(snapshot());
function sourceMatches(){try{return !!current?.source&&snapshot()?.resources?.source===current.source;}catch{return false;}}
const sourceChanged='材质来源与当前树干不匹配。请返回树干整理后重新打开材质。';
function sync(){
 const canAdvance=sourceMatches(),locked=busy||moduleBusy;
 button.disabled=locked||!canAdvance;back.disabled=locked;footer.querySelector('[data-prev]').disabled=button.disabled;
 for(const node of nav.querySelectorAll('button')){node.disabled=button.disabled;node.setAttribute('aria-current',node.dataset.stage===stage()?'step':'false');}
 button.textContent=awaiting?'正在转接…':stage()==='model'?'下一步：表面材质':stage()==='material'?'下一步：检查与保存':canAdvance&&cached&&cached.signature===signature()?'进入自动骨架（复用已保存GLB）':'保存并进入自动骨架';
 if(componentMount)post({action:'material-component-state',stage:stage(),busy:locked,canAdvance,message:!locked&&!canAdvance&&!current?.recovery?sourceChanged:message.textContent,nextLabel:button.textContent});
}
async function backToTrunk(){if(busy||moduleBusy)return;busy=true;sync();try{await window.treeMaterialModule.flushDraft();post({action:'show-plant',view:window.treeMaterialModule.getView?.()});}catch(error){label('草稿未保存：'+error.message);}finally{busy=false;sync();}}
back.onclick=backToTrunk;
footer.querySelector('[data-prev]').onclick=()=>window.treeMaterialModule.setStage(stage()==='export'?'material':'model');
for(const node of nav.querySelectorAll('[data-stage]'))node.onclick=()=>window.treeMaterialModule.setStage(node.dataset.stage);
nav.querySelector('[data-rig]').onclick=()=>{window.treeMaterialModule.setStage('export');label('先保存最终GLB，再直接进入现有自动骨架与绑定。');};
async function saveAndContinue(){if(busy||moduleBusy||!current)return;busy=true;sync();try{
 if(!sourceMatches())throw Error(sourceChanged);
 if(!cached||cached.signature!==signature()){
  label('正在保存最终GLB与可编辑材质…');const result=await window.treeMaterialModule.exportFinalGLB();
  cached={result,checkpoint:null,signature:signature(),id:crypto.randomUUID()};
 }
 if(!cached.checkpoint)cached.checkpoint=await window.treeMaterialModule.checkpoint(cached.result);
 awaiting=cached.id;label('GLB已保存，正在进入自动骨架…');sync();
 post({action:'return-material',id:cached.id,inputId:current.id,model:cached.result.model,name:current.name,checkpointKey:cached.checkpoint.key,projectId:cached.checkpoint.projectId,finalSHA256:cached.checkpoint.finalSHA256,bundleSHA256:cached.checkpoint.bundleSHA256});
}catch(error){busy=false;awaiting=null;label('未完成：'+error.message+'；已保存结果保留。');sync();}}
async function changeStage(requested){busy=true;label(requested==='export'?'正在准备检查与保存…':requested==='model'?'正在准备模型工具…':'正在准备表面材质工具…');sync();try{await new Promise(resolve=>(globalThis.requestAnimationFrame||setTimeout)(resolve));window.treeMaterialModule.setStage(requested);label(requested==='export'?'检查模型与贴图，保存后继续自动骨架':requested==='model'?'模型、UV与走势；材质图层保留':'编辑当前树干的基础材质与叠加图层');}finally{busy=false;sync();}}
button.onclick=()=>{if(stage()==='model')window.treeMaterialModule.setStage('material');else if(stage()==='material')window.treeMaterialModule.setStage('export');else saveAndContinue();};
window.treeMaterialIntegration={
 get navigationMode(){return getMaterialViewportNavigationMode();},
 setViewportNavigationMode:setMaterialViewportNavigationMode,
 async receive(value){
 setMaterialViewportNavigationMode(value.navigationMode);
 const preparation=value.stage==='staged'?'staged':['material','overlay'].includes(value.preparation)?value.preparation:'full';
 if(busy)throw Error('当前树干正在交接');
 const previous=current,oldCache=cached,controller=new AbortController(),{signal}=controller;
 let finish;const done=new Promise(resolve=>{finish=resolve;});
 const request={id:value.id,controller,done,preparing:false};receiving=request;
 busy=true;current=null;cached=null;
 try{
  sync();label(value.resume?'正在恢复当前树干的材质编辑…':'正在准备当前树干…');
  const input=async kind=>{const response=await fetch(endpoint('integration-input/'+value.id)+(kind?'?kind='+kind:''),{signal});if(!response.ok)throw Error('树干输入读取失败');return response.arrayBuffer();};
  const restoreInput=async()=>{const bytes=await input('project');signal.throwIfAborted();return window.treeMaterialModule.restoreBundle(bytes);};
  let result;
  if(!value.rebuild&&previous?.originKey&&previous.source&&previous.originKey===value.originKey&&snapshot()?.resources.source===previous.source){await window.treeMaterialModule.flushDraft();cached=oldCache;result={reused:true};}
  else if(!value.rebuild&&value.projectId){try{result=await window.treeMaterialModule.restoreProject(value.projectId);}catch(error){signal.throwIfAborted();if(!value.resume)throw error;result=await restoreInput();}}
  else if(value.resume)result=await restoreInput();
  else{
   const bytes=await input();signal.throwIfAborted();request.preparing=true;
   try{result=await window.treeMaterialModule.prepareModel(bytes,value.name,{height:value.height,target:value.target,resolution:value.resolution,padding:3,route:preparation});}
   finally{request.preparing=false;}
  }
  signal.throwIfAborted();
  current={...value,source:snapshot().resources.source};shell.querySelector('[data-trunk-title]').textContent=value.name.replace(/\.glb$/i,'');if(value.view)window.treeMaterialModule.setView?.(value.view);
  const restoredTopology=(value.projectId||result?.reused)&&!snapshot().resources.working;
  window.treeMaterialModule.setStage(preparation==='staged'||restoredTopology?'model':value.stage==='export'?'export':'material');
  const removedFaces=result?.geometryRepair?.removedFaces;
  label(preparation==='staged'||restoredTopology?'分步处理 · 可导出拓扑，或继续整理 UV':value.resume?'材质图层与笔触已恢复':preparation==='overlay'?'原材质已保留，可添加雪与苔藓':preparation==='material'?(removedFaces?`已清理 ${removedFaces} 个零面积面 · 原 UV 已保留`:'原面数与UV已保留，树皮走势与材质已就绪'):'模型、结构UV与榕根走势已准备');
  for(const kind of ['','?kind=project'])void fetch(endpoint('integration-input/'+value.id)+kind,{method:'DELETE',signal:AbortSignal.timeout(5000)}).catch(()=>{});
  return {projectId:snapshot().id,originKey:value.originKey,preparation,reused:!!result?.reused};
 }catch(error){
  if(signal.aborted)error=signal.reason;
  const recovery=error.preparationCheckpoint;
  if(componentMount&&preparation==='full'&&error.name!=='AbortError'&&['source','topology'].includes(recovery?.kind)){
   current={...value,source:null,recovery};
   shell.querySelector('[data-trunk-title]').textContent=value.name.replace(/\.glb$/i,'');
   window.treeMaterialModule.setStage('model');
   label(error.message+'。可在「模型准备」继续分步处理，或返回树干整理。');
   return {recovery:true};
  }
  current=previous;cached=oldCache;label(error.name==='AbortError'?error.message:'准备未完成：'+error.message+'；原草稿保留。');throw error;
 }finally{receiving=null;busy=false;finish();sync();}
},async cancelReceive(id){
 const request=receiving;
 if(!request||request.id!==id)return false;
 request.controller.abort(new DOMException('已取消超时的材质准备，原草稿保留。','AbortError'));
 if(request.preparing)window.treeMaterialModule.cancel();
 await request.done;
 return true;
},async command(command,requestedStage){
 if(busy||moduleBusy)throw Error('请等待当前任务完成');
 if(command==='leave'){await window.treeMaterialModule.flushDraft();return {view:window.treeMaterialModule.getView?.()};}
 if(!sourceMatches())throw Error(sourceChanged);
 if(command==='stage'){await changeStage(requestedStage==='model'?'model':requestedStage==='export'?'export':'material');return {};}
 if(command==='next'){if(stage()==='export')await saveAndContinue();else await changeStage(stage()==='model'?'material':'export');sync();return {};}
 throw Error('未知的树干整理步骤');
},complete(value){if(value.id!==awaiting)return false;awaiting=null;busy=false;label(value.ok?'检查点已交给自动骨架；材质编辑保留':'GLB已保存，转接失败：'+value.error+'。可重试，复用这份GLB。');sync();return true;},saveAndContinue,get state(){return {busy,current:current&&{...current},checkpoint:cached?.checkpoint||null,awaiting};}};
window.addEventListener('tree-material:busy',event=>{moduleBusy=!!event.detail.busy;sync();});
window.addEventListener('tree-material:ready',()=>{moduleBusy=false;sync();});
window.addEventListener('tree-material:preparation-recovered',event=>{
 if(!current?.recovery||event.detail!==current.recovery)return;
 const document=snapshot();
 if(!document?.id||!document.resources?.source)return;
 current={...current,source:document.resources.source,recovery:null};
 label(document.resources.working?'UV 与走势已就绪，可继续表面材质。':'已打开模型，可导出拓扑或继续整理 UV。');
 post({action:'material-preparation-recovered',id:current.id,originKey:current.originKey,projectId:document.id});
 sync();
});
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-workspace-stage']});
const style=document.createElement('link');style.rel='stylesheet';style.href='/integration-v050.css';document.head.append(style);sync();
if(window.chrome?.webview)post({action:'viewport-navigation-ready'});
