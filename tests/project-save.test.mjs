import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSaveMode,templateContext,attachSaveContext,prepareSaveDocument,saveContext } from '../web/project-save-data.js';
import { sendProjectSave } from '../web/project-save-request.js';

test('source templates default to new copies; user templates default to updating the current version',()=>{
 const source=templateContext({id:'official',name:'朴树',managed:true,version:1});
 assert.equal(defaultSaveMode('TREE',source),'NEW');assert.equal(defaultSaveMode('TREE',{}),'FILE');
 assert.equal(defaultSaveMode('TREE',{...source,userSaved:true}),'CURRENT');assert.equal(defaultSaveMode('BRANCH',{...source,userSaved:true}),'FILE');
 assert.equal(defaultSaveMode('TREE',{...source,userSaved:true,lastMode:'FILE'}),'FILE');
 assert.throws(()=>prepareSaveDocument({},{name:'树',mode:'VERSION',context:source}),/新样板/);
});

test('current saves keep identity, family and version, rotate concurrency token and reuse document buffers',()=>{
 const context=templateContext({id:'current',familyId:'family',version:3,name:'树',userSaved:true,saveToken:'loaded-token'}),geometry=[1,2,3];
 const doc={settings:{object_name:'树'},authoring:{},leaf_meshes:[{geometry}],workspaces:{active:'TREE',tree:{settings:{},authoring:{}}}};
 const saved=prepareSaveDocument(doc,{name:'修改后的树',mode:'CURRENT',id:'current',context});
 assert.equal(saved.document,doc);assert.equal(saved.context.templateId,'current');assert.equal(saved.context.familyId,'family');assert.equal(saved.context.version,3);assert.notEqual(saved.context.saveToken,context.saveToken);
 assert.deepEqual(saveContext(doc.authoring),saveContext(doc.workspaces.tree.authoring));assert.equal(doc.leaf_meshes[0].geometry,geometry);assert.equal(context.saveToken,'loaded-token');
 assert.throws(()=>prepareSaveDocument(doc,{name:'树',mode:'CURRENT',id:'other',context}),/重新打开/);
 assert.throws(()=>prepareSaveDocument(doc,{name:'树',mode:'CURRENT',id:'current',context:{...context,saveToken:''}}),/重新打开/);
 assert.throws(()=>prepareSaveDocument(doc,{name:'树',mode:'CURRENT',id:'current',context:{...context,userSaved:false}}),/新样板/);
 assert.equal(templateContext({mtimeMs:123}).saveToken,'legacy-123');
});

test('save preparation preserves existing geometry, atlases and inactive workspaces without duplicating buffers',()=>{
 const geometry=[1,2,3],atlas='data:image/png;base64,'+'A'.repeat(1000000),inactive={settings:{object_name:'停放的整树'},authoring:{}};
 const doc={settings:{object_name:'次枝'},authoring:{leaf_material:{color:atlas}},leaf_meshes:[{geometry}],workspaces:{active:'BRANCH',tree:inactive,branch:{settings:{object_name:'次枝'},authoring:{},leaf_meshes:[{geometry}]}}};
 const saved=prepareSaveDocument(doc,{name:'新次枝',notes:'已调叶片',species:'CELTIS',mode:'FILE',context:{}});
 assert.equal(saved.document,doc);assert.equal(doc.leaf_meshes[0].geometry,geometry);assert.equal(doc.authoring.leaf_material.color,atlas);
 assert.equal(doc.settings.object_name,'新次枝');assert.equal(doc.workspaces.branch.settings.object_name,'新次枝');assert.equal(inactive.settings.object_name,'停放的整树');
 assert.equal(saveContext(doc.authoring).notes,'已调叶片');assert.deepEqual(saveContext(doc.authoring),saveContext(doc.workspaces.branch.authoring));
});

test('new templates fork their family and version saves preserve the original family',()=>{
 const context={templateId:'old',familyId:'family',version:3,userSaved:true,sourceName:'树'};
 const document=()=>({settings:{object_name:'树'},authoring:{workbench:{assembly_scale:{overall:2}}}});
 const next=prepareSaveDocument(document(),{name:'树新版',mode:'VERSION',id:'new',context});
 assert.equal(next.context.familyId,'family');assert.equal(next.context.version,4);assert.equal(context.version,3);
 assert.equal(next.document.authoring.workbench.assembly_scale.overall,2);
 const copy=prepareSaveDocument(document(),{name:'独立树',mode:'NEW',id:'copy',context});assert.equal(copy.context.familyId,'copy');assert.equal(copy.context.version,1);
 const loaded=attachSaveContext(document(),templateContext({id:'new',familyId:'family',version:4,name:'树新版',userSaved:true}));assert.equal(saveContext(loaded.authoring).templateId,'new');
});

test('blank names and oversized notes are rejected before saving',()=>{
 for(const name of ['', '  ', '树'.repeat(121)])assert.throws(()=>prepareSaveDocument({}, {name,context:{}}),/名称/);
 assert.throws(()=>prepareSaveDocument({}, {name:'树',notes:'字'.repeat(2001),context:{}}),/备注/);
});

test('save upload carries UTF-8 metadata and unchanged project bytes without an escaped outer document',async()=>{
 const original=globalThis.fetch,project=JSON.stringify({name:'朴树',atlas:'data:image/png;base64,'+'A'.repeat(1000000)});
 try{
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'/api/tree-template');assert.ok(options.body instanceof Blob);assert.equal(options.headers['X-BranchForge-Save'],'1');
   const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),bytes=Number(prefix.slice(0,line)),start=line+1;
   assert.deepEqual(JSON.parse(await options.body.slice(start,start+bytes).text()),{name:'朴树新样板',notes:'中文备注 🌿'});
   assert.equal(await options.body.slice(start+bytes).text(),project);assert.ok(options.body.size<new TextEncoder().encode(project).length+150);
   return new Response(JSON.stringify({success:true,item:{id:'test'}}));
  };
  assert.equal((await sendProjectSave('/api/tree-template',{name:'朴树新样板',notes:'中文备注 🌿'},project)).item.id,'test');
  globalThis.fetch=async()=>new Response(JSON.stringify({success:false,message:'磁盘不可写'}),{status:500});
  await assert.rejects(sendProjectSave('/api/tree-template',{},project),/磁盘不可写/);
 }finally{globalThis.fetch=original;}
});
