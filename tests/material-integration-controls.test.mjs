import {test} from 'node:test';import assert from 'node:assert/strict';
import {createTrunkMaterialComponent} from '../web/trunk-material-component.js';
test('组件在错误来源/忙碌时禁止保存，检查点或交接失败重试不重新烘焙',async()=>{
 const prior={window:globalThis.window,document:globalThis.document,MutationObserver:globalThis.MutationObserver};
 try{
  const listeners=new Map(),nodes=[];
  const element=tag=>{const node={tagName:tag.toUpperCase(),dataset:{},style:{setProperty(){}},classList:{add(){}},children:[],disabled:false,setAttribute(){},append(...x){this.children.push(...x);},prepend(...x){this.children.unshift(...x);},querySelector(selector){return this.children.find(x=>selector[0]==='#'?x.id===selector.slice(1):x.dataset[selector.slice(6,-1).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]!==undefined);},querySelectorAll(selector){return this.children.filter(x=>selector==='button'?x.tagName==='BUTTON':selector==='[data-stage]'?x.dataset.stage!==undefined:false);}};
   Object.defineProperty(node,'innerHTML',{set(value){this.children=[];for(const m of value.matchAll(/<(button|span|strong)\b([^>]*)>/g)){const child=element(m[1]);for(const attr of m[2].matchAll(/(id|data-[a-z-]+)(?:="([^"]*)")?/g)){if(attr[1]==='id')child.id=attr[2];else child.dataset[attr[1].slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=attr[2]||'';}this.children.push(child);}}});nodes.push(node);return node;};
  const body=element('body');body.dataset.workspaceStage='export';globalThis.document={createElement:element,body,head:{append(){}}};globalThis.MutationObserver=class{observe(){}};
  let source='source-a',working='working-a',project='project',prepareError=null,bakes=0,saves=0,preparations=0,flushes=0,posts=[];
  globalThis.window={__treeMaterialHostConfig:{componentMount:true},chrome:{webview:{postMessage:value=>posts.push(JSON.parse(value))}},addEventListener:(name,fn)=>listeners.set(name,fn),treeMaterialModule:{getSnapshot:()=>({id:project,resources:{source,working}}),flushDraft:async()=>{flushes++;},prepareModel:async()=>{preparations++;if(prepareError)throw prepareError;return {ready:true};},setStage:stage=>body.dataset.workspaceStage=stage,exportFinalGLB:async()=>{bakes++;return {model:'/exports/final.glb',manifest:'/exports/final.json'};},checkpoint:async()=>{if(++saves===1)throw Error('checkpoint disk failure');return {key:'a'.repeat(64),projectId:project,finalSHA256:'b'.repeat(64),bundleSHA256:'c'.repeat(64)};}}};
  const oldFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(12)});
  try{
   await import('../material/web/integration-v050.js?controls-v2');const button=nodes.find(x=>x.id==='returnMaterialToPlant'),busy=value=>listeners.get('tree-material:busy')({detail:{busy:value}});
   busy(false);assert.equal(button.disabled,true);await window.treeMaterialIntegration.receive({id:'input',name:'Tree.glb',height:10,stage:'export',originKey:'same-geometry'});assert.equal(button.disabled,false);
   const resumed=await window.treeMaterialIntegration.receive({id:'input2',name:'Tree.glb',height:10,stage:'export',originKey:'same-geometry'});assert.equal(resumed.reused,true);assert.equal(preparations,1);
   busy(true);assert.equal(button.disabled,true);assert.equal(posts.at(-1).busy,true);
   source='other';busy(false);assert.equal(button.disabled,true);
   assert.equal(posts.at(-1).busy,false);assert.equal(posts.at(-1).canAdvance,false);
   assert.match(posts.at(-1).message,/返回树干整理/);
   await assert.rejects(window.treeMaterialIntegration.command('next'),/材质来源/);
   await window.treeMaterialIntegration.command('leave');assert.equal(flushes,2);
   source='source-a';busy(false);assert.equal(posts.at(-1).canAdvance,true);
   await window.treeMaterialIntegration.saveAndContinue();assert.equal(bakes,1);assert.equal(window.treeMaterialIntegration.state.awaiting,null);
   await window.treeMaterialIntegration.saveAndContinue();assert.equal(bakes,1);assert.equal(saves,2);const first=posts.at(-1);assert.equal(first.action,'return-material');
   assert.equal(window.treeMaterialIntegration.complete({id:'stale',ok:true}),false);
   window.treeMaterialIntegration.complete({id:first.id,ok:false,error:'load failure'});await window.treeMaterialIntegration.saveAndContinue();assert.equal(posts.at(-1).id,first.id);assert.equal(bakes,1);assert.equal(saves,2);
   window.treeMaterialIntegration.complete({id:first.id,ok:true});assert.equal(window.treeMaterialIntegration.state.busy,false);
   await window.treeMaterialIntegration.command('stage','model');assert.equal(body.dataset.workspaceStage,'model');
   await window.treeMaterialIntegration.command('next');assert.equal(body.dataset.workspaceStage,'material');
   await window.treeMaterialIntegration.command('next');assert.equal(body.dataset.workspaceStage,'export');assert.equal(bakes,1);
   const integration=window.treeMaterialIntegration;
   const abandoned={kind:'source'};
   prepareError=Object.assign(Error('减面未完成'),{preparationCheckpoint:abandoned});
   assert.deepEqual(await integration.receive({id:'abandon',name:'Tree.glb',height:10,originKey:'abandoned-tree'}),{recovery:true});
   assert.equal(body.dataset.workspaceStage,'model');assert.equal(posts.at(-1).busy,false);
   assert.equal(posts.at(-1).canAdvance,false);assert.match(posts.at(-1).message,/减面未完成/);
   assert.equal(integration.state.current.source,null);
   await integration.command('leave');
   assert.equal(project,'project');assert.equal(source,'source-a');
   assert.equal(posts.some(message=>message.action==='material-preparation-recovered'),false);

   const topology={kind:'topology'};
   prepareError=Object.assign(Error('UV 未完成'),{preparationCheckpoint:topology});
   assert.deepEqual(await integration.receive({id:'recover',name:'Tree.glb',height:10,originKey:'recover-tree'}),{recovery:true});
   const recovered=detail=>listeners.get('tree-material:preparation-recovered')({detail});
   recovered(abandoned);assert.equal(integration.state.current.source,null);
   source='source-recovered';working=null;project='project-recovered';
   recovered(topology);
   assert.equal(integration.state.current.source,source);
   assert.deepEqual(posts.findLast(message=>message.action==='material-preparation-recovered'),{
    topic:'shuyaer-v050',action:'material-preparation-recovered',id:'recover',originKey:'recover-tree',projectId:'project-recovered'
   });
   assert.equal(posts.at(-1).canAdvance,true);
   working='working-recovered';
   await integration.command('stage','export');
   await integration.saveAndContinue();
   assert.equal(bakes,2);
   const output=posts.at(-1);
   assert.equal(output.action,'return-material');assert.equal(output.inputId,'recover');
   assert.equal(output.projectId,'project-recovered');
   integration.complete({id:output.id,ok:true});

   let startPreparation,finishPreparation,cancelledPreparations=0;
   const preparationStarted=new Promise(resolve=>{startPreparation=resolve;});
   window.treeMaterialModule.prepareModel=()=>new Promise(resolve=>{finishPreparation=resolve;startPreparation();});
   window.treeMaterialModule.cancel=()=>{cancelledPreparations++;finishPreparation({ready:true});};
   const timedOut=integration.receive({id:'timed-out',name:'Tree.glb',height:10,originKey:'slow-tree'});
   const rejected=assert.rejects(timedOut,{name:'AbortError'});
   await preparationStarted;
   assert.equal(await integration.cancelReceive('old-input'),false);
   assert.equal(cancelledPreparations,0);
   assert.equal(await integration.cancelReceive('timed-out'),true);
   await rejected;
   assert.equal(cancelledPreparations,1);
   assert.equal(integration.state.current.id,'recover');
   assert.equal(integration.state.busy,false);
   assert.equal(await integration.cancelReceive('timed-out'),false);
   const reopened=await integration.receive({id:'later',name:'Tree.glb',height:10,originKey:'recover-tree'});
   assert.equal(reopened.reused,true);
   assert.equal(integration.state.current.id,'later');
  }finally{globalThis.fetch=oldFetch;}
 }finally{Object.assign(globalThis,prior);}
});

test('嵌入材质来源不匹配时仍可保存草稿并返回树干整理', async t => {
 const prior={window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver};
 t.after(()=>Object.assign(globalThis,prior));
 const posts=[],statuses=[],buttons=[];
 const button=(dataset={})=>({dataset,setAttribute(){}});
 const footer={append(...items){buttons.push(...items);}};
 const nodes=new Map(['project','library','use','replace-sculpt','import','name','close','material-version'].map(key=>['[data-'+key+']',button()]));
 nodes.set('.trunk-footer',footer);nodes.set('.trunk-layout',{});
 const flow=['model','material','export','rig'].map(value=>button({flow:value}));
 const dialog={open:false,classList:{toggle(){}},dataset:{},querySelector:selector=>nodes.get(selector),querySelectorAll:()=>flow};
 globalThis.document={createElement:()=>button()};
 globalThis.window={chrome:{webview:{postMessage:value=>posts.push(JSON.parse(value))}},addEventListener(){}};
 globalThis.ResizeObserver=class{observe(){}};

 const component=createTrunkMaterialComponent({dialog,render(){},status:message=>statuses.push(message)});
 const [previous,next]=buttons;
 component.update({active:true,stage:'export',busy:false,canAdvance:false});
 assert.equal(previous.textContent,'返回树干整理');
 assert.equal(previous.disabled,false);
 assert.equal(nodes.get('[data-close]').disabled,false);
 assert.equal(next.disabled,true);
 assert(flow.every(item=>item.disabled));

 const failed=previous.onclick();
 assert.equal(posts.at(-1).command,'leave');
 component.settled(posts.at(-1).id,'草稿暂时无法保存');
 await failed;
 assert.match(statuses.at(-1),/草稿暂时无法保存/);
 assert.equal(previous.disabled,false);

 const retry=previous.onclick();
 component.settled(posts.at(-1).id);
 await retry;
 component.update({busy:true});
 assert.equal(previous.disabled,true);
 component.update({busy:false,canAdvance:true});
 assert.equal(next.disabled,false);
 assert.equal(previous.textContent,'上一步：表面材质');
});
