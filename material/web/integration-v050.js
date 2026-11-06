import {endpoint} from './service-adapter.js';
let current=null,busy=false,moduleBusy=true,cached=null,awaiting=null;
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
function sync(){let matched=false;try{matched=!!current&&snapshot()?.resources.source===current.source;}catch{}
 button.disabled=busy||moduleBusy||!matched;back.disabled=busy||moduleBusy;footer.querySelector('[data-prev]').disabled=button.disabled;
 for(const node of nav.querySelectorAll('button')){node.disabled=button.disabled;node.setAttribute('aria-current',node.dataset.stage===stage()?'step':'false');}
 button.textContent=awaiting?'正在转接…':stage()==='model'?'下一步：表面材质':stage()==='material'?'下一步：检查与保存':cached&&cached.signature===signature()?'进入自动骨架（复用已保存GLB）':'保存并进入自动骨架';
 if(componentMount)post({action:'material-component-state',stage:stage(),busy:button.disabled,message:message.textContent,nextLabel:button.textContent});
}
async function backToTrunk(){if(busy||moduleBusy)return;busy=true;sync();try{await window.treeMaterialModule.flushDraft();post({action:'show-plant',view:window.treeMaterialModule.getView?.()});}catch(error){label('草稿未保存：'+error.message);}finally{busy=false;sync();}}
back.onclick=backToTrunk;
footer.querySelector('[data-prev]').onclick=()=>window.treeMaterialModule.setStage(stage()==='export'?'material':'model');
for(const node of nav.querySelectorAll('[data-stage]'))node.onclick=()=>window.treeMaterialModule.setStage(node.dataset.stage);
nav.querySelector('[data-rig]').onclick=()=>{window.treeMaterialModule.setStage('export');label('先保存最终GLB，再直接进入现有自动骨架与绑定。');};
async function saveAndContinue(){if(busy||moduleBusy||!current)return;busy=true;sync();try{
 if(snapshot()?.resources.source!==current.source)throw Error('模型与当前树干会话不匹配，请返回树干整理。');
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
window.treeMaterialIntegration={async receive(value){
 if(busy)throw Error('当前树干正在交接');const previous=current,oldCache=cached;busy=true;current=null;cached=null;sync();label(value.resume?'正在恢复当前树干的材质编辑…':'正在准备当前树干…');
 try{
  const input=async kind=>{const response=await fetch(endpoint('integration-input/'+value.id)+(kind?'?kind='+kind:''));if(!response.ok)throw Error('树干输入读取失败');return response.arrayBuffer();};
  let result;
  if(!value.rebuild&&previous?.originKey&&previous.originKey===value.originKey&&snapshot()?.resources.source===previous.source){await window.treeMaterialModule.flushDraft();cached=oldCache;result={reused:true};}
  else if(!value.rebuild&&value.projectId){try{result=await window.treeMaterialModule.restoreProject(value.projectId);}catch(error){if(!value.resume)throw error;result=await window.treeMaterialModule.restoreBundle(await input('project'));}}
  else result=value.resume?await window.treeMaterialModule.restoreBundle(await input('project')):await window.treeMaterialModule.prepareModel(await input(),value.name,{height:value.height,target:value.target,resolution:value.resolution,padding:3,route:value.preparation==='material'?'material':'full'});
  current={...value,source:snapshot().resources.source};shell.querySelector('[data-trunk-title]').textContent=value.name.replace(/\.glb$/i,'');if(value.view)window.treeMaterialModule.setView?.(value.view);
  window.treeMaterialModule.setStage(value.stage==='export'?'export':'material');label(value.resume?'材质图层与笔触已恢复':value.preparation==='material'?'原面数与UV已保留，树皮走势与材质已就绪':'模型、结构UV与榕根走势已准备');
  for(const kind of ['','?kind=project'])await fetch(endpoint('integration-input/'+value.id)+kind,{method:'DELETE'}).catch(()=>{});return {projectId:snapshot().id,originKey:value.originKey,preparation:value.preparation==='material'?'material':'full',reused:!!result?.reused};
 }catch(error){current=previous;cached=oldCache;label('准备未完成：'+error.message+'；原草稿保留。');throw error;}finally{busy=false;sync();}
},async command(command,requestedStage){if(busy||moduleBusy)throw Error('请等待当前任务完成');if(command==='leave'){await window.treeMaterialModule.flushDraft();return {view:window.treeMaterialModule.getView?.()};}if(command==='stage'){await changeStage(requestedStage==='model'?'model':requestedStage==='export'?'export':'material');return {};}if(command==='next'){if(stage()==='export')await saveAndContinue();else await changeStage(stage()==='model'?'material':'export');sync();return {};}throw Error('未知的树干整理步骤');},complete(value){if(value.id!==awaiting)return false;awaiting=null;busy=false;label(value.ok?'检查点已交给自动骨架；材质编辑保留':'GLB已保存，转接失败：'+value.error+'。可重试，复用这份GLB。');sync();return true;},saveAndContinue,get state(){return {busy,current:current&&{...current},checkpoint:cached?.checkpoint||null,awaiting};}};
window.addEventListener('tree-material:busy',event=>{moduleBusy=!!event.detail.busy;sync();});
window.addEventListener('tree-material:ready',()=>{moduleBusy=false;sync();});
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-workspace-stage']});
const style=document.createElement('link');style.rel='stylesheet';style.href='/integration-v050.css';document.head.append(style);sync();
