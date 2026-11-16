const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// Isolated, headless real pointer workflows. Formal libraries are read-only;
// generated projects and evidence stay in .runtime.
(async()=>{
 const out=path.resolve('.runtime/unit-comb-workflow');fs.mkdirSync(out,{recursive:true});const report={checks:[],errors:[]};
 const folder=path.resolve('次枝资产/全植物次枝成品V1/红叶石楠'),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));
 const item=JSON.parse(fs.readFileSync(path.join(folder,name),'utf8').replace(/^\uFEFF/,'')).asset;
 const doc={format:'ProceduralBranchProject',version:4,settings:{...item.sample.settings,object_name:'单元枝模式与梳理验收',wind_strength:0,leaf_density:0,max_triangles:8000000,preview_lod:0},leaf_meshes:item.sample.leaf_meshes,
  authoring:{branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,2],[0,0,4]],attach:.5,length:4,start_radius:.08,end_radius:.025}]},branch_library:[item],
   branch_instances:[{id:'ONE',parent:'ROOT',attach:.75,asset_id:item.id,linked:true,angle:75,azimuth:0,scale:1},{id:'TWO',parent:'ROOT',attach:.25,asset_id:item.id,linked:true,angle:75,azimuth:180,scale:1}],
   recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},tree_organs:item.sample.authoring.tree_organs}};
 const file=path.join(out,'fixture.branch.json'),saved=path.join(out,'saved.branch.json');fs.writeFileSync(file,JSON.stringify(doc));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let page;
 try{
  page=await browser.newPage({viewport:{width:1700,height:1100}});page.setDefaultTimeout(120000);page.on('pageerror',e=>report.errors.push(e.stack));
  await page.route('**/api/project-session**',r=>r.fulfill({json:{success:true,items:[]}}));
  await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'),()=>page.evaluate(()=>document.getElementById('projectSessionPanel').close()));
  const idle=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.getElementById('busyOverlay').hidden&&!document.getElementById('projectLoadDialog').open;});
  const load=async file=>{const old=await page.evaluate(()=>window.__branchForge.asset.group.uuid);await page.locator('#projectInput').setInputFiles(file);await page.waitForFunction(old=>window.__branchForge.asset.group.uuid!==old,old);await idle();};
  const snap=()=>page.evaluate(async()=>{const f=window.__branchForge,hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(f.authoring.branch_library)));return{
   instances:structuredClone(f.authoring.branch_instances),overrides:structuredClone(f.authoring.overrides),layers:structuredClone(f.authoring.sculpt_layers),source:Array.from(new Uint8Array(hash)).join(','),
   bones:f.asset.masterBranches.filter(b=>!b.instanceId&&!b.unitOwner).map(b=>[b.stableId,b.points.map(p=>p.toArray())]),
   wood:f.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray()),b.startRadius,b.endRadius]),
   leaves:f.asset.masterPlacements.map(p=>[p.stableId,p.branchStableId,p.position.toArray(),p.source,p.scale]),organs:f.asset.treeOrgans.map(p=>[p.stableId,p.branchStableId,p.position.toArray(),p.source,p.scale]),
   history:f.historyState,group:f.asset.group.uuid,gpu:f.asset.isInstancedAssembly};});
  const point=()=>page.evaluate(()=>{const f=window.__branchForge,r=document.getElementById('viewport').getBoundingClientRect(),b=f.asset.masterBranches.find(b=>b.instanceId==='ONE'||b.unitOwner==='ONE'),p=b.points[Math.floor(b.points.length*.5)].clone().applyMatrix4(f.asset.group.matrixWorld).project(f.camera);return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};});
  const field=async(id,value)=>{
   // Unit hit mode is independent of the skeleton sculpt hit mode. Keep this
   // regression explicitly THROUGH instead of silently inheriting AUTO's
   // surface-only behavior for ALL scope.
   if(id==='sculptScope'&&await page.evaluate(()=>window.__branchForge.workbench.mode==='TREE'&&document.querySelector('#branchEditScopeBar [data-tree-selection-kind="INSTANCE"]')?.getAttribute('aria-pressed')==='true'))id='unitBrushHitMode';
   await page.locator('#'+id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);
  };
  const stroke=async(cancel=false)=>{const p=await point();await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForFunction(()=>window.__branchForge.unitComb.active);await page.mouse.move(p.x+60,p.y-40,{steps:12});await page.waitForTimeout(45);if(cancel)await page.keyboard.press('Escape');await page.mouse.up();await idle();};
  const placementInvariant=(a,b)=>{for(const before of a.instances){const after=b.instances.find(i=>i.id===before.id);for(const key of ['id','parent','attach','asset_id','linked','pinned_revision','scale','radius_scale'])assert.deepEqual(after[key],before[key],key+' remains fixed');}assert.equal(b.source,a.source);assert.deepEqual(b.overrides,a.overrides);assert.deepEqual(b.layers,a.layers);assert.deepEqual(b.bones,a.bones);assert.equal(b.gpu,true);};
  const geometryNear=(a,b)=>{assert.equal(a.wood.length,b.wood.length);const near=(x,y)=>{assert.equal(x.length,y.length);x.forEach((v,i)=>Array.isArray(v)?near(v,y[i]):typeof v==='number'?assert.ok(Math.abs(v-y[i])<1e-8):assert.equal(v,y[i]));};near(a.wood,b.wood);near(a.leaves,b.leaves);near(a.organs,b.organs);};
  await page.goto(process.argv[2]||'http://localhost:19837');await idle();await load(file);
  await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(0,-8,2);f.camera.up.set(0,0,1);f.controls.target.set(0,0,2);f.controls.enableDamping=false;f.controls.update();});
  const unitButton=page.locator('#branchEditScopeBar [data-tree-selection-kind="INSTANCE"]'),boneButton=page.locator('#branchEditScopeBar [data-tree-selection-kind="SKELETON"]');
  await unitButton.click();assert.equal(await unitButton.getAttribute('aria-pressed'),'true');await page.locator('#viewport').focus();await page.keyboard.press('c');
  assert.equal(await page.locator('#viewport').getAttribute('data-viewport-tool'),'COMB');assert.match(await page.locator('#shapingContextTitle').innerText(),/单元枝/);assert.equal(await page.locator('#quick_sculptFlexibility').isVisible(),false);
  await page.locator('#branchEditScope').selectOption('ALL');await field('sculptRadius',600);await field('sculptStrength',.9);await field('sculptScope','THROUGH');await field('sculptHardness',.3);
  const initial=await snap(),p=await point();await page.mouse.move(p.x,p.y);await page.waitForFunction(()=>!document.getElementById('unitCombOverlay').hasAttribute('hidden'));assert.match(await page.locator('#unitCombFeedback').innerText(),/命中 2 支/);
  await page.screenshot({path:path.join(out,'视口模式与单元枝梳理.png')});
  report.checks.push('viewport mode switch exposes complete-unit mode; C shares brush and ALL scope, rigid-only parameters are clear');
  await page.mouse.down();await page.waitForFunction(()=>window.__branchForge.unitComb.active);await page.mouse.move(p.x+60,p.y-40,{steps:12});await page.waitForTimeout(80);
  const live=await snap();assert.deepEqual(live,initial);const debug=await page.evaluate(()=>({units:window.__branchForge.unitComb.debug.units,preview:window.__branchForge.unitComb.debug.preview}));assert.equal(debug.units,2);assert.equal(debug.preview.mode,'GPU');assert.ok(debug.preview.updatedFrames>0);
  await page.mouse.up();await idle();const combed=await snap();placementInvariant(initial,combed);assert.notDeepEqual(combed.instances,initial.instances);assert.equal(combed.history.undo,initial.history.undo+1);assert.notDeepEqual(combed.wood,initial.wood);assert.notDeepEqual(combed.leaves,initial.leaves);assert.notDeepEqual(combed.organs,initial.organs);
  report.checks.push('one real brush drag previews two complete models on GPU without touching authoring; release commits one undo and leaves bones/source/size/root intact');
  await stroke(true);const cancelled=await snap();assert.deepEqual(cancelled,combed);
  await page.locator('#viewport').focus();await page.keyboard.press('Control+z');await idle();geometryNear(await snap(),initial);assert.deepEqual((await snap()).instances,initial.instances);
  await page.keyboard.press('Control+y');await idle();geometryNear(await snap(),combed);assert.deepEqual((await snap()).instances,combed.instances);
  report.checks.push('Escape restores the entire preview; one undo/redo restores actual wood, leaves and flowers');
  const hover=await point();await page.mouse.move(hover.x,hover.y);await page.keyboard.press('f');assert.equal(await page.locator('#brushAdjustHud').isVisible(),true);assert.equal(await page.locator('#unitCombOverlay').isVisible(),false);await page.mouse.move(hover.x-70,hover.y);assert.equal(await page.locator('#unitCombOverlay').isVisible(),false,'changing F radius retains only the adjustment HUD');await page.keyboard.press('Escape');assert.equal(+await page.locator('#sculptRadius').inputValue(),600);
  await page.mouse.move(hover.x,hover.y);await page.keyboard.press('Shift+f');assert.equal(await page.locator('#brushAdjustHud').isVisible(),true);await page.mouse.move(hover.x-30,hover.y);await page.keyboard.press('Enter');assert.ok(Math.abs(+await page.locator('#sculptStrength').inputValue()-.8)<1e-8);assert.equal(await page.evaluate(()=>window.__branchForge.unitComb.active),false);
  report.checks.push('F and Shift+F use the existing workflow and never start a unit stroke or alter project history');
  // Shared outliner selection is a real UI action. The brush then receives only ONE.
  await page.locator('#viewport').focus();await page.keyboard.press('v');
  const root=await page.evaluate(()=>{const f=window.__branchForge;return f.asset.masterBranches.find(b=>b.instanceId==='ONE'||b.unitOwner==='ONE').stableId;});
  await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+root.replaceAll('.','\\.')+'$')})}).click();
  await page.locator('#branchEditScope').selectOption('DIRECT');await page.locator('#viewport').focus();await page.keyboard.press('c');const oneBefore=await snap();await stroke();const oneAfter=await snap();placementInvariant(oneBefore,oneAfter);assert.notDeepEqual(oneAfter.instances[0],oneBefore.instances[0]);assert.deepEqual(oneAfter.instances[1],oneBefore.instances[1]);
  report.checks.push('DIRECT scope combs selected ONE only and preserves unselected TWO exactly');
  // A mode change cancels an in-flight preview, even if triggered by a UI event.
  const c=await point();await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(c.x+35,c.y-20,{steps:6});await page.waitForFunction(()=>window.__branchForge.unitComb.active);
  await boneButton.evaluate(e=>e.click());await page.mouse.up();await idle();assert.equal(await page.evaluate(()=>window.__branchForge.unitComb.active),false);assert.deepEqual((await snap()).instances,oneAfter.instances);assert.equal(await page.locator('#viewport').getAttribute('data-viewport-tool'),'COMB');assert.match(await page.locator('#shapingContextTitle').innerText(),/主枝干/);
  await unitButton.click();await page.locator('#branchEditScope').selectOption('ALL');assert.equal(await page.locator('#viewport').getAttribute('data-viewport-tool'),'COMB');
  const outlinerStart=await point();await page.mouse.move(outlinerStart.x,outlinerStart.y);await page.mouse.down();await page.mouse.move(outlinerStart.x+25,outlinerStart.y-15,{steps:4});
  await page.waitForFunction(()=>window.__branchForge.unitComb.active);
  await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:/^ROOT$/})}).evaluate(e=>e.click());await page.mouse.up();await idle();
  assert.equal(await page.evaluate(()=>window.__branchForge.unitComb.active),false);assert.deepEqual((await snap()).instances,oneAfter.instances);
  await unitButton.click();await page.locator('#branchEditScope').selectOption('ALL');
  report.checks.push('switching targets cancels in-flight unit preview and retains C, with matching bone/unit hints');
  // Save through the actual UI capture/request. Substitute only the OS chooser.
  let savedDoc;await page.route('**/api/save-project',async route=>{const body=route.request().postDataBuffer(),newline=body.indexOf(10),bytes=Number(body.subarray(0,newline).toString());savedDoc=JSON.parse(body.subarray(newline+1+bytes).toString('utf8'));fs.writeFileSync(saved,JSON.stringify(savedDoc));await route.fulfill({json:{success:true,path:saved}});});
  await page.locator('#saveProjectBtn').click();await page.locator('input[name="saveMode"][value="FILE"]').check();await page.locator('#psSubmit').click();await page.waitForFunction(()=>document.getElementById('psStatus').textContent.startsWith('已保存工程'));await page.locator('#psCancel').click();assert.ok(savedDoc);assert.deepEqual(savedDoc.authoring.branch_instances,oneAfter.instances);
  await page.reload();await idle();await load(saved);const reloaded=await snap();geometryNear(reloaded,oneAfter);assert.deepEqual(reloaded.instances,oneAfter.instances);assert.equal(reloaded.source,oneAfter.source);
  const plan=await page.evaluate(async()=>{const f=window.__branchForge,{resolvePveExportPlan}=await import('/pve-export-plan.js'),p=resolvePveExportPlan(f.asset,f.authoring);return p.units.map(u=>({variant:u.variantRequired,id:u.sourceInstance.asset_id}));});assert.equal(plan.length,2);assert.equal(new Set(plan.map(u=>u.id)).size,1);assert.ok(plan.every(u=>u.variant===false));
  report.checks.push('actual save UI/file/fresh reload preserves complete-unit geometry and reuses one PVE source class for two poses');
  await page.locator('#branchWorkspaceBtn').click();await page.waitForFunction(()=>window.__branchForge.workbench.mode==='BRANCH');await idle();
  assert.equal(await unitButton.isVisible(),false);assert.equal(await page.locator('.viewport-tool-rail [data-viewport-tool="GRAB"]').isDisabled(),false);
  await page.locator('#treeWorkspaceBtn').click();await page.waitForFunction(()=>window.__branchForge.workbench.mode==='TREE');await idle();geometryNear(await snap(),reloaded);
  report.checks.push('switching to the source workbench restores internal sculpt tools, then returns to unchanged tree units');
  // Read-only formal camphor in this isolated page; exercise the actual dense GPU path.
  await page.reload();await idle();await load(path.resolve('初始样本/全植物新次枝装配V2/香樟/工程.branch.json'));
  await page.evaluate(()=>{
   const p=window.__unitCombRegressionPerf={phase:'setup',frames:[],longTasks:[],previous:performance.now(),raf:0,observer:null};
   if(PerformanceObserver.supportedEntryTypes?.includes('longtask')){
    p.observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())p.longTasks.push({phase:p.phase,duration:entry.duration});});
    p.observer.observe({type:'longtask'});
   }
   const frame=now=>{p.frames.push({phase:p.phase,duration:now-p.previous});p.previous=now;p.raf=requestAnimationFrame(frame);};p.raf=requestAnimationFrame(frame);
  });
  const setupStarted=Date.now();await unitButton.click();await page.locator('#viewport').focus();await page.keyboard.press('c');await page.locator('#branchEditScope').selectOption('ALL');await field('sculptRadius',240);await field('sculptStrength',.65);await field('sculptScope','THROUGH');report.dense_setup_ms=Date.now()-setupStarted;
  assert.equal(await page.locator('#unitBrushHitMode').inputValue(),'THROUGH');assert.equal(await page.evaluate(()=>window.__branchForge.unitComb.debug.options.depthMode),'THROUGH');
  const denseState=()=>page.evaluate(()=>{const f=window.__branchForge;return{instances:structuredClone(f.authoring.branch_instances),source:f.authoring.branch_library.map(a=>[a.id,a.revision,JSON.stringify(a.shape)]),bones:f.asset.masterBranches.filter(b=>!b.instanceId&&!b.unitOwner).map(b=>[b.stableId,b.points.map(p=>p.toArray())]),overrides:JSON.stringify(f.authoring.overrides),layers:JSON.stringify(f.authoring.sculpt_layers),history:f.historyState,gpu:f.asset.isInstancedAssembly};});
  const denseBefore=await denseState();assert.equal(denseBefore.instances.length,1126);
  report.dense_parameters=await page.evaluate(()=>{const f=window.__branchForge,o=f.unitComb.debug.options;return{effect:o.effect,orientation:o.orientation,depthMode:o.depthMode,radius_px:o.radius,strength:o.strength,hardness:o.hardness,scope:document.getElementById('branchEditScope').value,instances:f.authoring.branch_instances.length,source_models:f.authoring.branch_library.length,wood_branches:f.asset.masterBranches.length,leaf_anchors:f.asset.masterPlacements.length,organ_anchors:f.asset.treeOrgans.length,viewport:[innerWidth,innerHeight]};});
  const densePoint=await page.evaluate(()=>{const f=window.__branchForge,c=document.getElementById('viewport'),r=c.getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);f.camera.updateMatrixWorld();for(const b of f.asset.masterBranches){if(!b.instanceId&&!b.unitOwner)continue;const v=b.points[Math.floor(b.points.length/2)].clone().applyMatrix4(f.asset.group.matrixWorld).project(f.camera);const x=r.left+(v.x+1)*r.width/2,y=r.top+(1-v.y)*r.height/2;if(v.z>=-1&&v.z<=1&&x>r.left+r.width*.3&&x<r.right-50&&y>r.top+150&&y<r.bottom-140&&document.elementFromPoint(x,y)===c)return{x,y};}throw Error('No unobstructed real camphor unit line');});
  await page.evaluate(()=>window.__unitCombRegressionPerf.phase='hover');const hoverStarted=Date.now();await page.mouse.move(densePoint.x,densePoint.y);report.dense_hover_ms=Date.now()-hoverStarted;
  await page.evaluate(()=>window.__unitCombRegressionPerf.phase='begin');const started=Date.now();await page.mouse.down();await page.waitForFunction(()=>window.__branchForge.unitComb.active);report.dense_begin_ms=Date.now()-started;
  await page.evaluate(()=>window.__unitCombRegressionPerf.phase='drag');const dragStarted=Date.now();await page.mouse.move(densePoint.x+45,densePoint.y-32,{steps:10});await page.waitForTimeout(80);report.dense_drag_ms=Date.now()-dragStarted;const denseDebug=await page.evaluate(()=>({units:window.__branchForge.unitComb.debug.units,targets:window.__branchForge.unitComb.debug.targets,preview:window.__branchForge.unitComb.debug.preview}));assert.ok(denseDebug.units>1);assert.equal(denseDebug.preview.mode,'GPU');assert.ok(denseDebug.preview.updatedFrames>0);
  // Capturing a dense GPU screenshot can stall readback. Keep that evidence
  // operation separate from real brush frame/long-task measurements.
  await page.evaluate(()=>window.__unitCombRegressionPerf.phase='evidence');await page.screenshot({path:path.join(out,'香樟大面积单元枝梳理.png')});await page.evaluate(()=>window.__unitCombRegressionPerf.phase='commit');const commitStarted=Date.now();await page.mouse.up();await idle();report.dense_commit_ms=Date.now()-commitStarted;report.dense_edit_timings=await page.evaluate(()=>window.__branchForge.editTimings);const denseAfter=await denseState();assert.equal(denseAfter.gpu,true);assert.deepEqual(denseAfter.source,denseBefore.source);assert.deepEqual(denseAfter.bones,denseBefore.bones);assert.equal(denseAfter.overrides,denseBefore.overrides);assert.equal(denseAfter.layers,denseBefore.layers);assert.equal(denseAfter.history.undo,denseBefore.history.undo+1);assert.notDeepEqual(denseAfter.instances,denseBefore.instances);
  report.dense_preview=denseDebug;await page.evaluate(()=>window.__unitCombRegressionPerf.phase='undo');const undoStarted=Date.now();await page.locator('#viewport').focus();await page.keyboard.press('Control+z');await idle();report.dense_undo_ms=Date.now()-undoStarted;assert.deepEqual((await denseState()).instances,denseBefore.instances);
  report.dense_frame_stats=await page.evaluate(()=>{
   const p=window.__unitCombRegressionPerf;cancelAnimationFrame(p.raf);p.observer?.disconnect();
   const phases={};for(const phase of ['setup','hover','begin','drag','evidence','commit','undo']){
    const values=p.frames.filter(frame=>frame.phase===phase).map(frame=>frame.duration).sort((a,b)=>a-b),tasks=p.longTasks.filter(task=>task.phase===phase).map(task=>task.duration);
    phases[phase]={frames:values.length,median_ms:values[Math.floor(values.length*.5)]??null,p95_ms:values[Math.floor(values.length*.95)]??null,max_ms:values.at(-1)??null,long_task_count:tasks.length,long_task_max_ms:tasks.length?Math.max(...tasks):0};
   }delete window.__unitCombRegressionPerf;return phases;
  });
  report.checks.push('real camphor 1126 instances support broad GPU combing with unchanged six source models and structural bones; one undo restores placements');
  assert.deepEqual(report.errors,[]);report.passed=report.checks.length;fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){report.failure=error.stack;fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));try{await page?.screenshot({path:path.join(out,'失败.png')});}catch{}throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
