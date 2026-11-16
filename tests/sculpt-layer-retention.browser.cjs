const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve(process.env.BRANCHFORGE_LAYER_UI_ONLY==='1'?'.runtime/sculpt-layer-panel':'.runtime/sculpt-layer-retention');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const shape=(id,parent,points)=>({id,parent,points,knots:points,attach:parent==='ROOT'?1:.8,length:3,start_radius:.035,end_radius:.015});
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'枝束挂接验收',seed:42,leaf_density:0,child_count:0,branch_levels:4,wind_strength:0},authoring:{branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,.3],[0,0,.6],[0,0,1]]),shape('A','ROOT',[[0,0,1],[.6,0,1.2],[1.2,0,1.4],[1.8,0,1.5],[2.4,0,1.6],[3,0,1.7]]),shape('A1','A',[[1,0,1.4],[1.4,0,1.8],[1.8,0,2.2],[2.2,0,2.6]]),shape('B','ROOT',[[0,.04,1],[1,.04,1.4],[2,.04,1.8],[3,.04,2.2]])]}}};
 const layers=target=>Array.from({length:24},(_,i)=>({id:'OLDER_'+i,name:'已有编辑 '+i,enabled:i%7!==0,strength:i%3===0?.5:1,operation:{type:'RADIUS',targets:[target],point:0,factor:i%2?1.01:.99},branches:{}}));
 doc.authoring.sculpt_layers=layers('A');
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>result.errors.push(e.message));await page.goto(process.argv[2]);console.log('PAGE');await page.waitForFunction(()=>window.__branchForge?.asset);
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 const load=async()=>{await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='枝束挂接验收');await wait();await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(1.5,-9,1.5);f.camera.up.set(0,0,1);f.controls.target.set(1.5,0,1.5);f.controls.update();});};
 const snap=()=>page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
 const select=async id=>{await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'$')})}).click();};
 const tool=key=>page.locator('.viewport-tool-rail [data-viewport-tool="'+key+'"]').click();
 const point=async(id,t=.65)=>page.evaluate(({id,t})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),n=Math.min(b.points.length-2,Math.floor(t*(b.points.length-1))),p=b.points[n].clone().lerp(b.points[n+1],t*(b.points.length-1)-n),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);const v=f.asset.group.localToWorld(p).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},{id,t});
 const drag=async(a,b)=>{await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:12});await page.mouse.up();await wait();};




 const dist=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
 const idle=()=>page.waitForFunction(()=>!window.__branchForge.keyboardTransformActive);
 const apply=async(axis,value)=>{await page.keyboard.press('g');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);if(axis)await page.keyboard.press(axis);await page.keyboard.type(String(value));await page.keyboard.press('Enter');await idle();await wait();};
 const selectPoint=async(id,index)=>{
   const p=await page.evaluate(({id,index})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);f.camera.updateMatrixWorld(true);const v=f.asset.group.localToWorld(b.controlPoints[index].clone()).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},{id,index});
   await page.screenshot({path:path.join(out,'选点前.png')});
   await page.mouse.click(...p);await wait();
   assert.deepEqual(await page.evaluate(()=>window.__branchForge.selectedCurvePoint),{branchId:id,index});
   const data=await page.evaluate(()=>{const f=window.__branchForge,s=f.selectedCurvePoint;return {pivot:f.bundleState.gizmo.object?.position.toArray(),point:f.asset.masterBranches.find(b=>b.stableId===s.branchId).controlPoints[s.index].toArray()};});
   if(data.pivot)assert.ok(dist(data.pivot,data.point)<1e-8);
 };

 const layerData=()=>page.evaluate(()=>window.__branchForge.authoring.sculpt_layers);
 const count=async n=>assert.equal((await layerData()).length,n);
 const keyEdit=async(key,value)=>{await page.keyboard.press(key);await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);if(key==='r')await page.keyboard.press('y');await page.keyboard.type(String(value));await page.keyboard.press('Enter');await idle();await wait();};
 const state=()=>page.evaluate(async()=>{
  const a=window.__branchForge.asset,meshes=[];a.group.traverse(m=>{if(m.isMesh)meshes.push(m);});const buffers=[];
  for(const m of meshes)for(const attribute of [...Object.values(m.geometry.attributes),m.instanceMatrix].filter(Boolean)){const b=attribute.array;buffers.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b.buffer,b.byteOffset,b.byteLength)))));}
  const {createPVESkeleton}=await import('./pve-skeleton-export.js');
  return {branches:a.masterBranches.map(b=>({id:b.stableId,p:b.points.map(p=>p.toArray()),knots:b.controlPoints.map(p=>p.toArray()),radius:b.radiusEdits})),foliage:[...a.placements,...a.treeOrgans].map(p=>({id:p.stableId,p:p.position.toArray(),d:p.direction.toArray(),s:p.scale})),buffers,units:JSON.stringify([a.authoring.branch_instances,a.authoring.branch_library]),pve:createPVESkeleton(a)};
 });
 const saveReload=async name=>{
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const a=document.createElement('a');a.href=URL.createObjectURL(options.body.slice(offset));a.download='retained.branch.json';a.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  const before=await state(),layers=await layerData();await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,name+'.branch.json');await download.saveAs(saved);
  assert.equal(JSON.parse(fs.readFileSync(saved,'utf8')).authoring.sculpt_layers.length,layers.length);
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(n=>window.__branchForge.authoring.sculpt_layers.length===n,layers.length);await wait();
  assert.deepEqual(await layerData(),layers);assert.deepEqual(await state(),before);
 };
 await load();await select('A');await tool('SELECT');await count(24);await selectPoint('A',2);
 const oldLayers=await layerData(),before=await snap();
 const anchor=await page.evaluate(()=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId==='A'),r=document.querySelector('#viewport').getBoundingClientRect();f.camera.updateMatrixWorld();const p=b.controlPoints[2].clone().applyMatrix4(f.asset.group.matrixWorld).project(f.camera);return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];});
 await drag(anchor,[anchor[0]+18,anchor[1]-10]);await count(25);assert.notDeepEqual(await snap(),before);assert.deepEqual((await layerData()).slice(0,24),oldLayers);
 await page.locator('#undoBtn').click();await wait();await count(24);assert.deepEqual(await snap(),before);await page.locator('#redoBtn').click();await wait();await count(25);
 let previousShape=await state(),curveTail='';
 // Radius retains its own operation; consecutive control R/S/G replace the
 // same current-curve recipe, as required by the current point-edit workflow.
 for(const [key,value,n] of [['Alt+s',1.1,26],['r',10,27],['s',.95,27],['g',.01,27]]){
  await keyEdit(key,value);await count(n);const current=await state();assert.notDeepEqual(current,previousShape,key+' must actually change geometry');previousShape=current;
  assert.deepEqual((await layerData()).slice(0,24),oldLayers);
  if(key==='r')curveTail=(await layerData()).at(-1).id;
  if(key==='s'||key==='g')assert.equal((await layerData()).at(-1).id,curveTail);
 }
 assert.equal((await layerData()).filter(l=>l.operation?.type==='CONTROL_CURVE').length,2);
 result.checks.push('existing 24 layers: real point drag is layer 25; radius adds one layer while R/S/G update one current-curve recipe, without losing old records');
 await page.locator('[data-tab="edit"]').click();
 assert.equal(await page.locator('#sculptLayerList .sculpt-layer-row').count(),24);
 const beforeFold=await state(),history=await page.evaluate(()=>window.__branchForge.historyState.undo);
 const toggle=page.locator('#sculptLayersPanel .parameter-group-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();

 await page.locator('#sculptLayerList').getByRole('button',{name:'展开较早 24 条'}).click();assert.equal(await page.locator('#sculptLayerList .sculpt-layer-row').count(),27);
 await page.locator('#sculptLayerList').getByRole('button',{name:'折叠较早记录'}).click();assert.equal(await page.locator('#sculptLayerList .sculpt-layer-row').count(),24);
 assert.deepEqual(await state(),beforeFold);assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),history);
 assert.equal(await page.locator('#bakeSculptLayers').isDisabled(),true);assert.equal(await page.locator('#addSculptLayer').isDisabled(),false);
 await page.screenshot({path:path.join(out,'27层继续编辑.png')});await saveReload('27层保存重载');
 result.checks.push('actual layer panel expansion/collapse preserves all geometry, PVE and history; actual 27-layer save/reload is exact');
 if(process.env.BRANCHFORGE_LAYER_UI_ONLY==='1'){assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));return;}
 const camellia=JSON.parse(fs.readFileSync('assets/tree-template-library/template-ea396bae43d74f7fa42ed703724d053b.branch.json','utf8'));camellia.authoring.sculpt_layers=[...(camellia.authoring.sculpt_layers||[]),...layers('P1')];const file=path.join(out,'山茶24层.branch.json');fs.writeFileSync(file,JSON.stringify(camellia));
 await page.locator('#projectInput').setInputFiles(file);await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===577);await wait();await select('P1');await tool('SELECT');
 const n=(await layerData()).length;await keyEdit('s',1.02);await keyEdit('Alt+s',1.03);await count(n+2);await saveReload('山茶超过24层');
 result.checks.push('full camellia above 24: actual root S and Alt+S, save/reload preserves every mesh/instance buffer, point, foliage transform, source library and PVE skeleton');
 result.counts={camelliaLayers:n+2,instances:577};assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
