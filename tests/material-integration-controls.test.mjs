import {test} from 'node:test';import assert from 'node:assert/strict';
test('组件在错误来源/忙碌时禁止保存，检查点或交接失败重试不重新烘焙',async()=>{
 const prior={window:globalThis.window,document:globalThis.document,MutationObserver:globalThis.MutationObserver};
 try{
  const listeners=new Map(),nodes=[];
  const element=tag=>{const node={tagName:tag.toUpperCase(),dataset:{},style:{setProperty(){}},classList:{add(){}},children:[],disabled:false,setAttribute(){},append(...x){this.children.push(...x);},prepend(...x){this.children.unshift(...x);},querySelector(selector){return this.children.find(x=>selector[0]==='#'?x.id===selector.slice(1):x.dataset[selector.slice(6,-1).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]!==undefined);},querySelectorAll(selector){return this.children.filter(x=>selector==='button'?x.tagName==='BUTTON':selector==='[data-stage]'?x.dataset.stage!==undefined:false);}};
   Object.defineProperty(node,'innerHTML',{set(value){this.children=[];for(const m of value.matchAll(/<(button|span|strong)\b([^>]*)>/g)){const child=element(m[1]);for(const attr of m[2].matchAll(/(id|data-[a-z-]+)(?:="([^"]*)")?/g)){if(attr[1]==='id')child.id=attr[2];else child.dataset[attr[1].slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=attr[2]||'';}this.children.push(child);}}});nodes.push(node);return node;};
  const body=element('body');body.dataset.workspaceStage='export';globalThis.document={createElement:element,body,head:{append(){}}};globalThis.MutationObserver=class{observe(){}};
  let source='source-a',bakes=0,saves=0,preparations=0,posts=[];
  globalThis.window={chrome:{webview:{postMessage:value=>posts.push(JSON.parse(value))}},addEventListener:(name,fn)=>listeners.set(name,fn),treeMaterialModule:{getSnapshot:()=>({id:'project',resources:{source}}),flushDraft:async()=>{},prepareModel:async()=>{preparations++;return {ready:true};},setStage:stage=>body.dataset.workspaceStage=stage,exportFinalGLB:async()=>{bakes++;return {model:'/exports/final.glb',manifest:'/exports/final.json'};},checkpoint:async()=>{if(++saves===1)throw Error('checkpoint disk failure');return {key:'a'.repeat(64),projectId:'project',finalSHA256:'b'.repeat(64),bundleSHA256:'c'.repeat(64)};}}};
  const oldFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(12)});
  try{
   await import('../material/web/integration-v050.js?controls-v2');const button=nodes.find(x=>x.id==='returnMaterialToPlant'),busy=value=>listeners.get('tree-material:busy')({detail:{busy:value}});
   busy(false);assert.equal(button.disabled,true);await window.treeMaterialIntegration.receive({id:'input',name:'Tree.glb',height:10,stage:'export',originKey:'same-geometry'});assert.equal(button.disabled,false);
   const resumed=await window.treeMaterialIntegration.receive({id:'input2',name:'Tree.glb',height:10,stage:'export',originKey:'same-geometry'});assert.equal(resumed.reused,true);assert.equal(preparations,1);
   busy(true);assert.equal(button.disabled,true);busy(false);source='other';busy(false);assert.equal(button.disabled,true);source='source-a';busy(false);
   await window.treeMaterialIntegration.saveAndContinue();assert.equal(bakes,1);assert.equal(window.treeMaterialIntegration.state.awaiting,null);
   await window.treeMaterialIntegration.saveAndContinue();assert.equal(bakes,1);assert.equal(saves,2);const first=posts.at(-1);assert.equal(first.action,'return-material');
   assert.equal(window.treeMaterialIntegration.complete({id:'stale',ok:true}),false);
   window.treeMaterialIntegration.complete({id:first.id,ok:false,error:'load failure'});await window.treeMaterialIntegration.saveAndContinue();assert.equal(posts.at(-1).id,first.id);assert.equal(bakes,1);assert.equal(saves,2);
   window.treeMaterialIntegration.complete({id:first.id,ok:true});assert.equal(window.treeMaterialIntegration.state.busy,false);
   await window.treeMaterialIntegration.command('stage','model');assert.equal(body.dataset.workspaceStage,'model');
   await window.treeMaterialIntegration.command('next');assert.equal(body.dataset.workspaceStage,'material');
   await window.treeMaterialIntegration.command('next');assert.equal(body.dataset.workspaceStage,'export');assert.equal(bakes,1);
  }finally{globalThis.fetch=oldFetch;}
 }finally{Object.assign(globalThis,prior);}
});
