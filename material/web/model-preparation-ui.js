import {PREPARATION_STEPS,modelPreparationOptions} from './model-preparation.js';
const el=(tag,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;return e;};
export function createModelPreparationUI(host){
 const $=id=>document.getElementById(id),events=new AbortController(),moved=[];let disposed=false,phase=null,failedStage=null,lastRequest=null,recovery=null,alternateRoute=null,handoffRecovery=null,progress=null,message='',result=null,started=0,timer=null;
 const panel=el('section','preparation-panel');panel.id='modelPreparationPanel';panel.dataset.workspaceStage='model';panel.innerHTML=`<div class="preparation-title"><strong>模型准备</strong><span>一键 / 分步</span></div><p class="preparation-intro">可一键准备，也可在拓扑与 UV 节点单独导出。</p><div class="preparation-options"><label>处理方式<select id="prepareRoute"><option value="full">完整准备 · 中低模 / UV / 材质</option><option value="staged">分步处理 · 拓扑后暂停</option><option value="material">仅材质 · 保留面数与UV</option><option value="overlay">保留原材质 · 叠加效果</option></select></label><label>实际树高 · m<input id="prepareHeight" type="number" value="10" min="0.1" max="200" step="0.1"></label><label>目标三角面<select id="prepareTarget"><option value="15000">1.5 万 · 中景</option><option value="30000">3 万 · 通用</option><option value="50000" selected>5 万 · 近景</option></select></label><label>贴图规格<select id="prepareResolution"><option value="1024">1K</option><option value="2048" selected>2K</option><option value="4096">4K</option></select></label><label>UV间距<select id="preparePadding"><option value="3" selected>紧凑 · 每侧3px</option><option value="6">常规 · 每侧6px</option><option value="12">宽 · 每侧12px</option></select></label></div><button id="prepareImport" class="primary preparation-primary">导入并一键准备</button><input id="prepareFile" type="file" accept=".glb" hidden><button id="prepareCurrent" class="secondary preparation-current">准备当前模型</button><p id="prepareInputInfo" class="preparation-note">支持 GLB；已合适的面数、UV 和走势会自动跳过。</p><ol class="preparation-steps">${PREPARATION_STEPS.map(([id,title],i)=>`<li data-preparation-step="${id}"><span>${i+1}</span><div><b>${title}</b><small>等待</small></div></li>`).join('')}</ol><p class="preparation-note">处理前工程与原模型保留。失败或取消不会替换当前工程。</p><div class="preparation-secondary"><button id="prepareManualImport">仅导入</button><button id="prepareOpenOptimize">减面精修</button><button id="prepareOpenUv">UV 精修</button></div><section class="preparation-checkpoints" aria-label="分步操作与导出"><h3>分步操作与导出</h3><button id="prepareExportTopology" type="button">导出拓扑 GLB</button><button id="prepareAutoUv" type="button">自动拆分并排布 UV</button><button id="prepareExportUv" type="button">导出 UV GLB</button><small id="prepareCheckpointNote"></small></section>`;
 document.querySelector('.left-panel').prepend(panel);
 const inspector=el('section','preparation-inspector');inspector.id='preparationInspector';inspector.dataset.workspaceStage='model';inspector.innerHTML=`<div class="preparation-inspector-heading"><strong>准备方案</strong><button id="prepareOverview">概览</button></div><div id="prepareSummary"><p>自动完成检查、必要的减面、结构分析与 UV，然后进入材质工作台。</p><dl><div><dt>减面策略</dt><dd>仅处理超过目标的模型</dd></div><div><dt>UV 策略</dt><dd>整块展开 · 安全归并小碎岛</dd></div><div><dt>树皮走势</dt><dd>榕根表面走势</dd></div></dl><h3>当前模型</h3><p id="prepareModelName">尚未导入</p><div id="prepareModelMetrics" class="preparation-metrics"></div><button id="prepareCheckFlow" class="secondary full-width">检查 / 调整树皮走势</button><div id="prepareResultDetails" class="preparation-note"></div></div><div id="prepareOptimizeTools" hidden></div><div id="prepareUvTools" hidden></div>`;
 document.querySelector('.scroll-controls').prepend(inspector);
 for(const [node,target]of [[$('meshOptimizationPanel'),$('prepareOptimizeTools')],[$('treeUV').closest('details'),$('prepareUvTools')],[$('pinUVIsland').closest('details'),$('prepareUvTools')],[$('uvSeamTool').closest('details'),$('prepareUvTools')]]){const marker=document.createComment('preparation-tool-origin');node.before(marker);moved.push({node,marker});target.append(node);node.open=true;}
 const bar=el('section','preparation-result');bar.id='preparationResultBar';bar.hidden=true;bar.innerHTML=`<div><b id="preparationBarTitle"></b><span id="preparationBarMessage"></span></div><div class="preparation-result-actions"><span id="preparationElapsed"></span><button id="prepareCancel">取消准备</button><button id="prepareRetry" hidden>重新准备</button><button id="prepareUseCheckpoint" hidden>打开拓扑继续分步处理</button><button id="prepareRollback" hidden>返回处理前</button></div><progress id="preparationProgress" max="1" value="0"></progress>`;document.querySelector('.viewport-toolbar').before(bar);
 const listen=(id,event,fn)=>$(id).addEventListener(event,fn,{signal:events.signal});
 const options=()=>modelPreparationOptions({height:Number($('prepareHeight').value),target:Number($('prepareTarget').value),resolution:Number($('prepareResolution').value),padding:Number($('preparePadding').value),route:$('prepareRoute').value});
 const tools=which=>{for(const [id,key]of [['prepareSummary','overview'],['prepareOptimizeTools','optimize'],['prepareUvTools','uv']])$(id).hidden=which!==key;$('prepareOverview').hidden=which==='overview';};
 function sync(){if(disposed)return;const c=host.context();
  if(phase==='error'&&!c.busy&&lastRequest?.projectId!==c.project?.id){phase=null;lastRequest=recovery=alternateRoute=handoffRecovery=null;}
  const preserve=$('prepareRoute').value==='material',overlay=$('prepareRoute').value==='overlay',staged=$('prepareRoute').value==='staged';$('prepareTarget').closest('label').hidden=preserve||overlay;$('preparePadding').closest('label').hidden=preserve;$('prepareImport').textContent=overlay?'导入并保留原材质':preserve?'导入并分析材质':staged?'导入并开始拓扑减面':'导入并一键准备';$('prepareCurrent').textContent=staged?'拓扑减面当前模型':'准备当前模型';for(const li of panel.querySelectorAll('[data-preparation-step]')){const id=li.dataset.preparationStep;li.hidden=staged&&id==='flow';li.querySelector('b').textContent=staged&&id==='finish'?'分步导出':staged&&id==='optimize'?'拓扑减面':overlay&&id==='uv'?'准备独立烘焙UV':overlay&&id==='flow'?'锁定原始材质':(preserve||overlay)&&id==='optimize'?'保留原面数':preserve&&id==='uv'?'保留并校验原UV':PREPARATION_STEPS.find(([key])=>key===id)[1];}if(result&&result.projectId!==c.project?.id&&!c.busy){result=null;phase=null;}const active=!!phase&&phase!=='done'&&phase!=='error';$('prepareCurrent').disabled=c.busy||!c.project;$('prepareOpenOptimize').disabled=c.busy||!c.project||!!c.project.materialBase;$('prepareOpenUv').disabled=c.busy||!c.project||!!c.project.materialBase;$('prepareCheckFlow').disabled=c.busy||!c.project||!!c.project.materialBase;$('prepareOverview').disabled=c.busy;$('prepareCancel').disabled=!active||c.closing;$('prepareRollback').disabled=c.busy||!result?.rollback;$('prepareRollback').hidden=!result?.rollback;$('prepareCancel').hidden=!active;$('prepareRetry').hidden=phase!=='error';$('prepareRetry').disabled=c.busy;
  $('prepareExportTopology').disabled=c.busy||!c.model;
  $('prepareUseCheckpoint').hidden=phase!=='error'||(!recovery&&!alternateRoute);
  $('prepareUseCheckpoint').disabled=c.busy||c.closing||(!recovery&&!alternateRoute);
  $('prepareUseCheckpoint').textContent=alternateRoute==='full'?'改用完整处理':alternateRoute==='optimize'?'打开减面精修':recovery?.kind==='source'?'跳过减面，继续分步处理':'打开拓扑继续分步处理';
  $('prepareAutoUv').disabled=c.busy||!c.project||!!c.project.materialBase;
  $('prepareExportUv').disabled=c.busy||!c.uvReady;
  $('prepareCheckpointNote').textContent=c.uvReady
   ?'UV 已就绪。材质完成后，从「检查与保存」导出最终 GLB。'
   :'拓扑 GLB 仅包含网格。采用有效 UV 后可导出 UV GLB。';
  $('prepareModelName').textContent=c.project?.name||'尚未导入';$('prepareModelMetrics').textContent=c.model?`${(c.model.indices.length/3).toLocaleString()} 三角面 · ${c.model.diagnostic?.islands??'—'} 个 UV 岛`:'';
  $('prepareInputInfo').textContent=c.project?'准备当前模型会建立工作副本，原工程保留。':'支持 GLB；目标面数以内自动跳过减面。';
  const index=PREPARATION_STEPS.findIndex(([id])=>id===(phase==='error'?failedStage:phase));for(const li of panel.querySelectorAll('[data-preparation-step]')){const i=PREPARATION_STEPS.findIndex(([id])=>id===li.dataset.preparationStep),state=phase==='done'?(staged&&li.dataset.preparationStep==='uv'&&!c.uvReady?'waiting':'done'):phase==='error'?(i<index?'done':i===index?'error':'waiting'):i<index?'done':i===index?'running':'waiting';li.dataset.state=state;li.querySelector('small').textContent=state==='done'?'完成':state==='running'?'正在处理':state==='error'?'需要检查':'等待';}
  bar.hidden=!phase;$('preparationBarTitle').textContent=phase==='done'?(staged?'拓扑已就绪':'模型已准备好'):phase==='error'?'准备未完成':PREPARATION_STEPS.find(([id])=>id===phase)?.[1]||'';const details=message+(result?.report.warnings.length?' · '+result.report.warnings[0]:'');$('preparationBarMessage').textContent=details;$('preparationBarMessage').title=details;$('preparationProgress').hidden=!active;if(Number.isFinite(progress))$('preparationProgress').value=progress;else $('preparationProgress').removeAttribute('value');$('preparationProgress').setAttribute('aria-label','当前步骤进度');if(started)$('preparationElapsed').textContent=Math.floor((Date.now()-started)/1000)+' s';
 }
 async function start(file,request={}){
  const context=host.context();if(disposed||context.busy||context.closing)return;
  let values;
  try{
   values=request.options?modelPreparationOptions(request.options):options();
   if(request.options){
    $('prepareHeight').value=values.height;$('prepareTarget').value=values.target;$('prepareResolution').value=values.resolution;$('prepareRoute').value=values.route;
    if(!$('preparePadding').querySelector(`option[value="${values.padding}"]`))$('preparePadding').add(new Option('每侧'+values.padding+'px',values.padding));
    $('preparePadding').value=values.padding;
   }
  }catch(e){host.error(e.message);return;}
  const previousFailure=phase==='error'&&lastRequest?.file===file?{lastRequest,recovery,alternateRoute,failedStage,message}:null;
  if(handoffRecovery?.file!==file)handoffRecovery=null;
  lastRequest={file,values,projectId:context.project?.id};recovery=alternateRoute=null;started=Date.now();result=null;failedStage=null;phase='inspect';progress=null;
  message='原工程保留，正在建立工作副本…';tools('overview');sync();clearInterval(timer);timer=setInterval(sync,1000);
  try{
   const value=await host.run(file,values,request.checkpoint);
   if(value&&!disposed){
    result=value;phase='done';progress=1;
    const {route,inputTriangles,outputTriangles,warnings}=value.report;
    message=`${inputTriangles.toLocaleString()} → ${outputTriangles.toLocaleString()} 面 · ${route==='overlay'?'原材质与烘焙 UV 已就绪':route==='staged'?'拓扑可导出 · 下一步可自动拆排 UV':'UV 与榕根走势已就绪'}`;
    $('prepareResultDetails').textContent=warnings.join(' ');
    if(request.checkpoint)tools('uv');
    if(handoffRecovery&&handoffRecovery.file===file){
     const detail=handoffRecovery.checkpoint;handoffRecovery=null;
     window.dispatchEvent(new CustomEvent('tree-material:preparation-recovered',{detail}));
    }
    return value;
   }
  }catch(e){
   if(e.name==='AbortError'&&previousFailure){
    ({lastRequest,recovery,alternateRoute,failedStage,message}=previousFailure);phase='error';
   }else{
    failedStage=e.preparationStage||phase;phase=e.name==='AbortError'?null:'error';message=e.message;
    recovery=e.preparationCheckpoint||null;
    if(values.route==='material'&&e.suggestFullPreparation===true)alternateRoute='full';
    if(file&&host.openOptimizeFile&&e.suggestOptimization===true)alternateRoute='optimize';
    if(file&&request.throwOnError&&recovery&&!handoffRecovery)handoffRecovery={file,checkpoint:recovery};
    if(!disposed&&phase==='error')host.error(e.message);
   }
   if(request.throwOnError)throw e;
  }finally{if(phase!=='done'&&phase!=='error')phase=null;clearInterval(timer);timer=null;sync();}
 }
 listen('prepareImport','click',()=>$('prepareFile').click());listen('prepareFile','change',async e=>{const file=e.target.files[0];e.target.value='';if(file)await start(file);});listen('prepareCurrent','click',()=>start(null));listen('prepareRetry','click',()=>lastRequest&&start(lastRequest.file));listen('prepareCancel','click',host.cancel);listen('prepareManualImport','click',()=>$('modelFile').click());listen('prepareOpenOptimize','click',()=>tools('optimize'));listen('prepareOpenUv','click',()=>tools('uv'));listen('prepareOverview','click',()=>tools('overview'));listen('prepareCheckFlow','click',host.openFlow);listen('prepareRollback','click',async()=>{if(await host.rollback(result)){result=null;phase=null;message='';sync();}});
 function continueCheckpoint(){
  const context=host.context();
  if(phase!=='error'||!lastRequest||context.busy||context.closing)return;
  if(recovery)return start(lastRequest.file,{options:{...lastRequest.values,route:'staged'},checkpoint:recovery});
  if(alternateRoute==='full')return start(lastRequest.file,{options:{...lastRequest.values,route:'full'}});
  if(alternateRoute==='optimize'){tools('optimize');return host.openOptimizeFile(lastRequest.file).catch(e=>host.error(e.message));}
 }
 listen('prepareUseCheckpoint','click',continueCheckpoint);
 listen('prepareExportTopology','click',()=>host.exportMesh('topology'));listen('prepareExportUv','click',()=>host.exportMesh('uv'));
 listen('prepareAutoUv','click',()=>{tools('uv');return host.autoUV();});listen('prepareRoute','change',sync);tools('overview');return{importFile:start,continueCheckpoint,options,sync,phase(id){phase=id;progress=null;message=(PREPARATION_STEPS.find(([key])=>key===id)?.[1]||'正在处理')+'…';sync();},taskStatus(text,p){if(!phase||phase==='done'||phase==='error')return;message=text;progress=Number.isFinite(p)?Math.max(0,Math.min(1,p)):null;sync();},dispose(){disposed=true;events.abort();clearInterval(timer);for(const{node,marker}of moved){marker.replaceWith(node);}panel.remove();inspector.remove();bar.remove();}};
}
