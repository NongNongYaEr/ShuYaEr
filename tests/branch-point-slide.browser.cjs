const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/branch-point-slide');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const shape=(id,parent,points)=>({id,parent,points,knots:points,attach:parent==='ROOT'?1:.8,length:3,start_radius:.035,end_radius:.015});
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'枝束挂接验收',seed:42,leaf_density:0,child_count:0,branch_levels:4,wind_strength:0},authoring:{branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,.3],[0,0,.6],[0,0,1]]),shape('A','ROOT',[[0,0,1],[.6,0,1.2],[1.2,0,1.4],[1.8,0,1.5],[2.4,0,1.6],[3,0,1.7]]),shape('A1','A',[[1,0,1.4],[1.4,0,1.8],[1.8,0,2.2],[2.2,0,2.6]]),shape('B','ROOT',[[0,.04,1],[1,.04,1.4],[2,.04,1.8],[3,.04,2.2]])]}}};
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
   await page.waitForFunction(()=>document.getElementById('editContext').textContent.includes('G 沿枝滑点'));assert.match(await page.locator('#editContext').textContent(),/R 转动后段.*S 缩放后段.*Alt\+S 后段粗细/);
   const data=await page.evaluate(()=>{const f=window.__branchForge,s=f.selectedCurvePoint;return {pivot:f.bundleState.gizmo.object?.position.toArray(),point:f.asset.masterBranches.find(b=>b.stableId===s.branchId).controlPoints[s.index].toArray()};});
   if(data.pivot)assert.ok(dist(data.pivot,data.point)<1e-8);
 };
 await load();await select('A');await tool('SELECT');await selectPoint('A',2);

 const knots=()=>page.evaluate(()=>window.__branchForge.asset.masterBranches.find(b=>b.stableId===window.__branchForge.selectedCurvePoint.branchId).controlPoints.map(p=>p.toArray()));
 const previewPoint=()=>page.evaluate(()=>{const f=window.__branchForge,s=f.selectedCurvePoint;let point=null;f.modelRoot.parent.traverse(o=>{if(o.userData.category==='control_point'&&o.userData.branch_id===s.branchId&&o.userData.point_index===s.index)point=o.position.toArray();});return point;});
 const before=await snap(),originalKnots=await knots(),history=await page.evaluate(()=>window.__branchForge.historyState.undo);
 await apply('',0);assert.deepEqual(await knots(),originalKnots);assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),history);
 await apply('',.2);const moved=await knots();assert.deepEqual(await snap(),before);assert.notDeepEqual(moved[2],originalKnots[2]);for(let i=0;i<moved.length;i++)if(i!==2)assert.deepEqual(moved[i],originalKnots[i]);
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await knots(),originalKnots);await page.locator('#redoBtn').click();await wait();assert.deepEqual(await knots(),moved);
 const count=await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers.length);await apply('',-.1);assert.equal(await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers.length),count);assert.deepEqual(await snap(),before);
 const current=await knots(),start=await page.evaluate(()=>{const f=window.__branchForge,s=f.selectedCurvePoint,p=f.asset.masterBranches.find(b=>b.stableId===s.branchId).controlPoints[s.index].clone(),r=document.querySelector('#viewport').getBoundingClientRect();f.camera.updateMatrixWorld();p.applyMatrix4(f.asset.group.matrixWorld).project(f.camera);return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];}),target=await point('A',.53);
 await page.mouse.move(...start);await page.keyboard.press('g');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);await page.mouse.move(...target,{steps:10});
 await page.waitForFunction(()=>document.querySelector('#keyboardTransformHint').textContent.includes('当前枝 A'));
 const visual=await previewPoint();assert.ok(dist(visual,current[2])>.03);assert.deepEqual(await snap(),before);await page.keyboard.press('Escape');await idle();assert.deepEqual(await knots(),current);assert.ok(dist(await previewPoint(),current[2])<1e-8);
 await page.mouse.move(...start);await page.keyboard.press('g');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);await page.mouse.move(...target,{steps:10});await page.keyboard.press('Enter');await idle();await wait();const mouseKnots=await knots();assert.notDeepEqual(mouseKnots[2],current[2]);assert.deepEqual(await snap(),before);
 await page.screenshot({path:path.join(out,'沿当前枝条滑动控制点.png')});
 await apply('',100);const edge=await knots();assert.ok(dist(edge[2],edge[3])>1e-5);assert.deepEqual(await snap(),before);await page.locator('#undoBtn').click();await wait();assert.deepEqual(await knots(),mouseKnots);
 result.checks.push('actual G numerical/mouse slide follows current branch; no geometry changes; neighbors remain ordered; zero input, cancellation, undo redo and consecutive merge');
 for(const key of ['r','s']){
  await page.keyboard.press(key);await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);if(key==='r')await page.keyboard.press('y');await page.keyboard.type(key==='r'?'20':'.8');await page.keyboard.press('Enter');await idle();await wait();
  assert.equal(await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers.at(-1).operation.type),key==='r'?'POINT_ROTATE':'POINT_SCALE');assert.notDeepEqual(await snap(),before);
  await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),before);assert.deepEqual(await knots(),mouseKnots);
 }
 result.checks.push('R and S after sliding operate from the new control point; undo restores exact geometry and handles');
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='point-slide.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
 await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'滑点保存.branch.json');await download.saveAs(saved);await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);if(await page.locator('#projectSwitchConfirm').isVisible())await page.click('#projectSwitchConfirm [data-confirm-accept]');await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='枝束挂接验收');await wait();await select('A');assert.deepEqual(await snap(),before);assert.deepEqual(await knots(),mouseKnots);result.checks.push('actual save dialog and page reload retain slid handles and unchanged tree geometry');
 const camellia=path.resolve('assets/tree-template-library/template-ea396bae43d74f7fa42ed703724d053b.branch.json');await page.locator('#projectInput').setInputFiles(camellia);if(await page.locator('#projectSwitchConfirm').isVisible())await page.click('#projectSwitchConfirm [data-confirm-accept]');await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===577);await wait();
 const fullState=()=>page.evaluate(async()=>{
  const a=window.__branchForge.asset,meshes=[];a.group.traverse(m=>{if(m.isMesh)meshes.push(m);});
  const buffers=[];for(const m of meshes)for(const attribute of [...Object.values(m.geometry.attributes),m.instanceMatrix].filter(Boolean)){const buf=attribute.array;buffers.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(buf.buffer,buf.byteOffset,buf.byteLength)))));}
  return {branches:a.masterBranches.map(b=>({id:b.stableId,points:b.points.map(p=>p.toArray()),r:[b.startRadius,b.endRadius],parent:b.parentT})),foliage:[...a.placements,...a.treeOrgans].map(p=>({id:p.stableId,p:p.position.toArray(),d:p.direction.toArray(),s:p.scale})),buffers,units:JSON.stringify([a.authoring.branch_instances,a.authoring.branch_library])};
 });
 const fullBefore=await fullState();await select('P1');await tool('SELECT');
 await page.evaluate(()=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId==='P1'),p=b.controlPoints[2];f.controls.target.copy(p);f.camera.up.set(0,0,1);f.camera.position.copy(p).add(p.clone().set(2,-4,2));f.controls.update();});
 await selectPoint('P1',2);const camelliaKnots=await knots();await apply('',.05);assert.notDeepEqual(await knots(),camelliaKnots);
 assert.deepEqual(await fullState(),fullBefore);result.counts={instances:577,branches:fullBefore.branches.length,foliage:fullBefore.foliage.length};result.checks.push('full camellia G: every branch, foliage transform, source instance and rendered mesh buffer hash unchanged');
 await page.screenshot({path:path.join(out,'山茶控制点沿枝滑动.png')});
 await page.click('#skeletonEditModeBtn');await page.waitForFunction(()=>window.__branchForge.skeletonEditMode&&window.__branchForge.asset.skeletonOnly);await wait();const editorBefore=await page.evaluate(()=>({camera:window.__branchForge.camera.position.toArray(),selection:window.__branchForge.selectedCurvePoint,history:window.__branchForge.historyState}));
 assert.equal(await page.evaluate(()=>window.__branchForge.projectSession.checkpoint(true)),true);assert.equal(await page.evaluate(()=>window.__branchForge.skeletonEditMode),true);assert.deepEqual(await page.evaluate(()=>({camera:window.__branchForge.camera.position.toArray(),selection:window.__branchForge.selectedCurvePoint,history:window.__branchForge.historyState})),editorBefore);result.checks.push('恢复草稿保存保持枝干编辑模式、相机、控制点与历史；操作提示区正确区分中间点后段 G/R/S/Alt+S');assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});

