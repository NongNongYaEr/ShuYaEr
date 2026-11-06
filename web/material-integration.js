import {materialHandoffGlb} from './material-handoff-glb.js';
import {readImportedTrunkGlb} from './imported-trunk-glb.js';
import {attachMaterialCheckpoint,base64Bytes,materialGeometryKey,digest} from './trunk-material-workflow.js';
export function createMaterialIntegration(api){
 let pending=null,busy=false;const post=value=>{if(!window.chrome?.webview)throw Error('请从树鸭儿桌面版打开树干整理。');window.chrome.webview.postMessage(JSON.stringify({topic:'shuyaer-v050',...value}));};
 async function send(model,options={}){if(busy||pending&&!pending.ready)throw Error('正在准备上一棵树干，请完成或取消后再传递。');busy=true;const previous=pending;let id;const preparation=options.preparation==='material'?'material':'full',rebuild=!!options.rebuild||!!options.materialSession&&(options.materialSession.preparation||'full')!==preparation;
 try{
  const prepared=await materialHandoffGlb(model);id=crypto.randomUUID();
  const upload=async(bytes,kind='')=>{const r=await fetch('/api/material-handoff?id='+id+(kind?'&kind='+kind:''),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes}),v=await r.json();if(!r.ok||!v.success)throw Error(v.message||'树干传递失败');};
  const compatible=!model.material_workflow||model.material_workflow.geometryKey===await materialGeometryKey(model)&&JSON.stringify(model.calibration)===JSON.stringify({base:[0,0,0],tip:[0,0,1],front:[0,1,0],scale:1});
  if(model.material_editable&&!compatible&&!rebuild)throw Error('网格或校准已变化，请使用“重新准备材质工作版本”；原材质数据保留。');
  await upload(prepared.bytes);const resume=!!model.material_editable&&compatible&&!rebuild;
  if(resume)await upload(base64Bytes(model.material_editable.base64),'project');
  pending={id,name:model.name,guides:structuredClone(model.guides),sourceSHA256:model.source.sha256,sessionId:options.sessionId||null,modelId:model.id,ready:false,previous};
  const origin={id:model.id,geometry:await materialGeometryKey(model),calibration:model.calibration},originKey=await digest(new TextEncoder().encode(JSON.stringify({sessionId:options.sessionId||null,...origin})));
  const saved=options.materialSession,legacyKey=saved&&saved.version!==2?await digest(new TextEncoder().encode(JSON.stringify(origin))):null,matches=saved&&(saved.originKey===originKey||saved.version!==2&&saved.originKey===legacyKey),projectId=!rebuild&&matches?saved.projectId:null;
  if(saved?.originKey&&!matches&&!model.material_editable&&!rebuild)throw Error('模型或校准已改变，请使用“重新准备材质工作版本”；原材质草稿保留。');
  post({action:'edit-material',id,name:model.name+'.glb',height:prepared.height,resume,originKey,projectId,rebuild:!!rebuild,target:options.target||50000,resolution:options.resolution||2048,stage:options.stage||'material',preparation,view:api.component?.view});return {id,height:prepared.height};
 }catch(error){pending=previous;if(id)for(const kind of ['', '&kind=project'])await fetch('/api/material-handoff?id='+id+kind,{method:'DELETE'}).catch(()=>{});throw error;}finally{busy=false;}}
 async function receive(value){if(busy)throw Error('请等待树干交接完成');if(!pending||value.inputId!==pending.id)throw Error('原树干会话已改变；已保存的材质GLB仍保留。');busy=true;
 try{
  if(!await api.canReceive(pending))throw Error('树干草稿已改变，未替换当前编辑。');
  const current=api.current?.();
  if(!current||current.model.id!==pending.modelId||current.draft.id!==pending.sessionId)throw Error('树干整理会话不匹配');
  if(current.model.material_workflow?.checkpointKey===value.checkpointKey)return {alreadyAccepted:true};
  const read=async(kind='')=>{const response=await fetch('/api/material-handoff?id='+encodeURIComponent(value.id)+(kind?'&kind='+kind:''));if(!response.ok)throw Error('材质检查点读取失败');return response.arrayBuffer();};
  const bytes=await read(),bundle=await read('project'),parsed=await readImportedTrunkGlb(bytes,{name:pending.name+'.glb',maxBytes:150000000});
  if(parsed.source.sha256!==value.finalSHA256)throw Error('最终GLB校验不一致，未进入骨架');
  const model=await attachMaterialCheckpoint(parsed,current.model,{sessionId:pending.sessionId,projectId:value.projectId,bundle,bundleSHA256:value.bundleSHA256,inputId:pending.id});
  model.material_workflow.checkpointKey=value.checkpointKey;
  await api.receive(model,pending);
  for(const kind of ['', '&kind=project'])await fetch('/api/material-handoff?id='+encodeURIComponent(value.id)+kind,{method:'DELETE'}).catch(()=>{});
  return {id:model.id,triangles:model.triangles,materials:model.materials.length,source:model.source.sha256};
 }catch(error){api.toast(error.message,true);throw error;}finally{busy=false;}}
 const result={send,receive,componentState:value=>api.component?.update(value),componentCommandSettled:(id,error)=>api.component?.settled(id,error),async notePrepared(id,session){if(pending?.id!==id)throw Error('树干准备会话已改变');await api.prepared?.(session,pending);return true;},settle(id,error=null){if(pending?.id!==id)return false;if(error)pending=pending.previous;else{pending.ready=true;delete pending.previous;}if(error)api.toast('材质准备未完成：'+error,true);return true;},async prepareClose(){if(result.transferPending)throw Error('树干转接尚未结束。');return api.prepareClose();},get transferPending(){return busy||Boolean(pending&&!pending.ready);},get pending(){return pending&&{...pending};}};
 window.treeDuckMaterialIntegration=result;return result;
}
