import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import fs from 'node:fs';
import {createBranchInstanceEditor} from '../web/branch-instance-controller.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings,deserializeGeometry} from '../web/branch-kernel.js';

function mockDom(){
 const nodes=new Map();class Element extends EventTarget{constructor(){super();this.hidden=false;this.value='';this.dataset={};this.children=[];this.className='';}append(...v){this.children.push(...v);}set innerHTML(html){this.html=html;for(const m of html.matchAll(/id="([^"]+)"/g)){const node=new Element();node.value=m[1]==='instanceGhostOpacity'?'.75':m[1]==='instanceEditScope'?'LOCAL':'';nodes.set(m[1],node);}}get innerHTML(){return this.html;}getBoundingClientRect(){return {left:0,top:0,width:1000,height:1000};}hasPointerCapture(){return false;}setPointerCapture(){}releasePointerCapture(){}}
 const oldDocument=globalThis.document,oldWindow=globalThis.window;globalThis.document={createElement:()=>new Element(),getElementById:id=>nodes.get(id),querySelector:()=>new Element()};globalThis.window=new EventTarget();const canvas=new Element();canvas.parentElement=new Element();
 return {canvas,nodes,restore(){globalThis.document=oldDocument;globalThis.window=oldWindow;}};
}
test('instance scope follows reused geometry and yields to the live GPU preview',()=>{
 const dom=mockDom(),modelRoot=new THREE.Group(),camera=new THREE.PerspectiveCamera(45,1,.01,100);
 const shape={branches:[{id:'R1',parent:'',points:[[0,0,0],[1,0,0]],length:1,start_radius:.03,end_radius:.01}],connector:{position:[0,0,0],direction:[1,0,0]}};
 const item={id:'UNIT',name:'完整单元枝',revision:1,shape,sample:{settings:{leaf_density:0},authoring:{branch_shape:shape},leaf_meshes:[]}};
 const authoring=normalizeAuthoring({branch_library:[item],branch_instances:[{id:'I',asset_id:'UNIT',linked:true}]});
 const branch={id:0,stableId:'I.R1',instanceId:'I',parentId:-1,children:[],points:[new THREE.Vector3(),new THREE.Vector3(1,0,0)],length:1,startRadius:.03,endRadius:.01};
 const asset={group:new THREE.Group(),masterBranches:[branch]},selection=new Set(['I.R1']);modelRoot.add(asset.group);
 const api={canvas:dom.canvas,camera,modelRoot,controls:{enabled:true},getAsset:()=>asset,getAuthoring:()=>authoring,getSettings:()=>({}),getSelections:()=>selection,setTool(){},toast(){}};
 let editor;
 try{
  editor=createBranchInstanceEditor(api,{register(){},setMode(){}});const scope=editor.root.getObjectByName('单元枝编辑范围');editor.refresh();
  const positions=()=>Array.from(scope.children[0].geometry.getAttribute('position').array);
  assert.deepEqual(positions(),[0,0,0,1,0,0]);const initial=scope.children[0];editor.refresh();assert.equal(scope.children[0],initial,'unchanged scope reuses its geometry');
  asset.masterBranches=[{...branch,points:[new THREE.Vector3(),new THREE.Vector3(0,1,0)]}];editor.refresh();
  assert.deepEqual(positions(),[0,0,0,0,1,0],'same asset UUID and selected IDs must not retain old pose');
  editor.deactivate();assert.equal(scope.children.length,0,'switching to a brush removes the separate static instance scope');
  asset.activeEditPreview={};editor.refresh();assert.equal(scope.children.length,0,'refresh during held preview must not repaint CPU rest curves');
  delete asset.activeEditPreview;asset.masterBranches=[{...branch,points:[new THREE.Vector3(),new THREE.Vector3(0,0,1)]}];editor.refresh();
  assert.deepEqual(positions(),[0,0,0,0,0,1],'final model restores an outline at the committed pose');
 }finally{dom.restore();}
});
test('whole-instance modal preview is GPU local, Esc preserves document, confirm creates one transaction and selects the copy',()=>{
 const dom=mockDom(),folder=new URL('../次枝资产/全植物次枝成品V1/朴树/',import.meta.url),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json')),item=JSON.parse(fs.readFileSync(new URL(name,folder))).asset;
 const sources=item.sample.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)})),assets=[],modelRoot=new THREE.Group(),camera=new THREE.PerspectiveCamera(45,1,.01,100);camera.position.set(3,-4,3);camera.lookAt(0,0,1.5);camera.updateMatrixWorld();
 let authoring=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,3]],length:3,start_radius:.1,end_radius:.02}]},branch_library:[item],branch_instances:[{id:'I',asset_id:item.id,parent:'ROOT',attach:.5,linked:true,variation:0,seed:3}],recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},tree_organs:{...item.sample.authoring.tree_organs,mode:'LEAVES'}}),settings=normalizeSettings({...item.sample.settings,leaf_density:0}),asset,selection=new Set(['I.'+item.shape.branches[0].id]),transactions=0,builds=0,editor;const transactionOptions=[];
 const build=()=>{asset=buildBranchAsset(settings,null,sources,0,authoring,{instanced:true,resolveSources:true});assets.push(asset);modelRoot.clear();modelRoot.add(asset.group);builds++;};build();
 const api={canvas:dom.canvas,camera,modelRoot,controls:{enabled:true},getAsset:()=>asset,getAuthoring:()=>authoring,getSettings:()=>settings,getSelections:()=>selection,getSelection:()=>[...selection][0],setSelections(ids){selection=new Set(ids);editor?.refresh();},setTool(){},toast(msg){throw Error(msg);},transact(label,fn,options){transactions++;transactionOptions.push(options);fn(authoring);authoring=normalizeAuthoring(authoring);build();editor.refresh();},commitPreview(preview,fn){fn();preview.restore();return true;}};
 try{editor=createBranchInstanceEditor(api,{register(){},setMode(){}});editor.refresh();const baseline=JSON.stringify(authoring),original=asset,buildCount=builds;let materialized=0;asset.materialize=()=>{materialized++;throw Error('unexpected whole-tree materialization');};
 const delta={translation:new THREE.Vector3(),rotation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.3),scale:new THREE.Vector3(1,1,1),amount:.3},r=editor.keyboardTransform('rotate');assert.ok(r);r.update(delta,{});assert.equal(builds,buildCount);assert.equal(asset,original);assert.equal(materialized,0);assert.equal(JSON.stringify(authoring),baseline);assert.ok(asset.isInstancedAssembly);r.cancel();assert.equal(transactions,0);assert.equal(JSON.stringify(authoring),baseline);
 const hitLeaf=()=>{for(const p of asset.masterPlacements.slice(0,20)){camera.position.copy(p.position).add(new THREE.Vector3(.1,-.3,.2));camera.lookAt(p.position);camera.updateMatrixWorld();const hit=editor.hitOwner({clientX:500,clientY:500});if(hit?.id==='I')return true;}return false;};
 assert.ok(hitLeaf(),'compiled proxy leaf ray resolves its complete branch owner');const originalCast=new Map();asset.group.traverse(mesh=>{if(mesh.isInstancedMesh){originalCast.set(mesh,mesh.raycast);mesh.raycast=THREE.InstancedMesh.prototype.raycast;}});assert.ok(hitLeaf(),'standard batch ray with numeric instanceId resolves its complete branch owner');for(const [mesh,cast]of originalCast)mesh.raycast=cast;
 assert.ok(editor.doubleClick({clientX:500,clientY:500}));assert.equal(editor.localId,undefined);assert.equal(editor.enterLocal,undefined);assert.equal(editor.isEditable('ROOT'),true);assert.equal(editor.isEditable('I.'+item.shape.branches[0].id),false);assert.equal(editor.isSelectable('I.'+item.shape.branches[0].id),true);assert.equal(materialized,0);assert.ok(asset.isInstancedAssembly);
 // Clicking geometry or empty space must reach the selection handler even
 // while an instance tool is active. Only a real handle owns the gesture.
 for(const mode of ['SLIDE','ROTATE','SCALE']){editor.activate(mode);const empty={clientX:-5000,clientY:-5000,button:0,pointerId:1};assert.equal(editor.begin(empty),false,mode+' must not consume a missed handle');assert.equal(editor.end(empty),false,mode+' must not consume a selection click');assert.equal(transactions,0);}
 editor.deactivate();assert.ok(editor.selectHit({clientX:500,clientY:500,ctrlKey:true}));assert.equal(editor.selectionOwners().length,0,'Ctrl removes an existing selected instance');assert.ok(editor.selectHit({clientX:500,clientY:500,ctrlKey:true}));assert.equal(editor.selectionOwners().length,1,'Ctrl also adds a previously unselected instance');
 const duplicate=editor.keyboardDuplicate();assert.ok(duplicate);duplicate.update({...delta,amount:0},{start:{x:500,y:500},pointer:{x:500,y:500},numeric:''});assert.equal(JSON.stringify(authoring),baseline);duplicate.commit();assert.equal(transactions,1);assert.deepEqual(transactionOptions[0],{bypassLayers:true,deferControls:true});assert.equal(authoring.branch_instances.length,2);assert.equal(editor.selectionOwners().length,1);assert.notEqual(editor.selectionOwners()[0].id,'I');assert.ok(asset.isInstancedAssembly);assert.equal(materialized,0);
 editor.deleteSelection();assert.equal(transactions,2);assert.equal(authoring.branch_instances.length,1);assert.equal(editor.selectionOwners().length,0);
 }finally{assets.forEach(disposeBranchAsset);sources.forEach(s=>s.geometry.dispose());dom.restore();}
});

test('G/R/S skip true and array locks throughout families, preserve manual editing, and filter before parent-child deduplication',()=>{
 const dom=mockDom(),assets=[],modelRoot=new THREE.Group(),camera=new THREE.PerspectiveCamera(45,1,.01,100);
 const shape={branches:[{id:'R1',parent:'',attach:0,points:[[0,0,0],[.4,0,0]],length:.4,start_radius:.03,end_radius:.01}],connector:{position:[0,0,0],direction:[1,0,0]}};
 const item={id:'UNIT',name:'完整单元枝',revision:1,shape,sample:{settings:{leaf_density:0},authoring:{branch_shape:shape},leaf_meshes:[]}};
 let authoring=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,3]],length:3,start_radius:.1,end_radius:.02}]},branch_library:[item],
  branch_arrays:[{id:'G',asset_id:'UNIT',parent:'ROOT',locked:['CHILD']}],branch_instances:[
   {id:'P',asset_id:'UNIT',parent:'ROOT',attach:.5,linked:true},
   {id:'CHILD',asset_id:'UNIT',parent:'P.R1',attach:.7,linked:true,array_id:'G'},
   {id:'MANUAL',asset_id:'UNIT',parent:'ROOT',attach:.8,linked:true,assembly_manual:true}],
  overrides:{'MANUAL.R1':{locked:true}},recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']}});
 const settings=normalizeSettings({leaf_density:0});let asset,editor,selection=new Set(['P.R1']),transactions=0;const messages=[];
 const build=()=>{asset=buildBranchAsset(settings,null,[],0,authoring,{instanced:true,resolveSources:true});assets.push(asset);modelRoot.clear();modelRoot.add(asset.group);};build();
 const api={canvas:dom.canvas,camera,modelRoot,controls:{enabled:true},getAsset:()=>asset,getAuthoring:()=>authoring,getSettings:()=>settings,getSelections:()=>selection,getSelection:()=>[...selection][0],
  setSelections(ids){selection=new Set(ids);editor?.refresh();},setTool(){},toast:msg=>messages.push(msg),
  transact(label,fn){transactions++;fn(authoring);authoring=normalizeAuthoring(authoring);build();editor.refresh();},commitPreview(preview,fn){fn();preview.restore();return true;}};
 const delta={translation:new THREE.Vector3(),rotation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.3),scale:new THREE.Vector3(1,1,1),amount:.3};
 try{
  editor=createBranchInstanceEditor(api,{register(){},setMode(){}});editor.refresh();const baseline=JSON.stringify(authoring);
  for(const mode of ['translate','rotate','scale'])assert.equal(editor.keyboardTransform(mode),null,'a child array lock prevents '+mode+' of the parent');
  for(const mode of ['SLIDE','ROTATE','SCALE'])editor.activate(mode);
  assert.equal(transactions,0);assert.equal(JSON.stringify(authoring),baseline);assert.ok(messages.every(msg=>msg.includes('锁定')));
  assert.equal(dom.nodes.get('instanceRotate').disabled,true);assert.equal(dom.nodes.get('instanceEditSource').disabled,false,'a protected source remains readable');
  const copy=editor.keyboardDuplicate();assert.ok(copy,'copying a locked source remains allowed');copy.cancel();assert.equal(JSON.stringify(authoring),baseline);assert.equal(transactions,0);

  selection=new Set(['P.R1','MANUAL.R1']);editor.refresh();assert.equal(dom.nodes.get('instanceRotate').disabled,false,'unlocked members of a mixed selection stay usable');
  const parent=structuredClone(authoring.branch_instances.find(i=>i.id==='P')),child=structuredClone(authoring.branch_instances.find(i=>i.id==='CHILD'));
  const rotate=editor.keyboardTransform('rotate');assert.ok(rotate);rotate.update(delta,{});rotate.commit();assert.equal(transactions,1);
  assert.deepEqual(authoring.branch_instances.find(i=>i.id==='P'),parent);assert.deepEqual(authoring.branch_instances.find(i=>i.id==='CHILD'),child);
  assert.ok(authoring.branch_instances.find(i=>i.id==='MANUAL').frame,'manual preservation and a historical frozen-curve lock do not block complete-instance edits');

  authoring.branch_arrays[0].locked=[];authoring.branch_instances.find(i=>i.id==='P').assembly_locked=true;
  selection=new Set(['P.R1','CHILD.R1']);editor.refresh();const lockedParent=structuredClone(authoring.branch_instances.find(i=>i.id==='P'));
  const nested=editor.keyboardTransform('rotate');assert.ok(nested,'filter locked parent first, then keep its explicitly selected unlocked child');nested.update(delta,{});nested.commit();
  assert.equal(transactions,2);assert.deepEqual(authoring.branch_instances.find(i=>i.id==='P'),lockedParent);assert.ok(authoring.branch_instances.find(i=>i.id==='CHILD').frame);

  authoring.branch_instances.find(i=>i.id==='CHILD').assembly_locked=true;selection=new Set(['CHILD.R1']);editor.refresh();
  for(const mode of ['translate','rotate','scale'])assert.equal(editor.keyboardTransform(mode),null,'direct instance lock prevents '+mode);
  assert.equal(transactions,2);assert.equal(dom.nodes.get('instanceSlide').disabled,true);assert.equal(dom.nodes.get('instanceScale').disabled,true);
 }finally{assets.forEach(disposeBranchAsset);dom.restore();}
});
