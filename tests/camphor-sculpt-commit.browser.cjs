const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/camphor-sculpt');fs.mkdirSync(out,{recursive:true});
 const report={checks:[],errors:[],shaderErrors:[],phase:process.env.CAMPHOR_PROFILE_PHASE||'after'};
 const input=path.resolve('assets/tree-template-library/template-c75273b48abc49fbbfa602525f57c083.branch.json');
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});let page;
 try{
  page=await browser.newPage({viewport:{width:1440,height:950}});page.setDefaultTimeout(120000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|VALIDATE|WebGLProgram|GL_INVALID/i.test(m.text()))report.shaderErrors.push(m.text().slice(0,1200));});
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  const idle=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
  await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===550);await idle();
  console.log('CAMPhOR LOADED');
  await page.evaluate(()=>{
   window.__releaseProfile={};
   const wb=window.__branchForge.workbench;
   for(const [name,component] of Object.entries(wb))if(component&&typeof component.refresh==='function'){
    const original=component.refresh;
    component.refresh=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{window.__releaseProfile[name]=(window.__releaseProfile[name]||0)+performance.now()-t;}};
   }
  });
  const snap=()=>page.evaluate(()=>{const a=window.__branchForge.asset;return {branches:a.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray()),b.startRadius,b.endRadius]),leaves:a.masterPlacements.map(p=>[p.stableId,p.source,p.position.toArray(),p.scale]),organs:a.treeOrgans.map(p=>[p.stableId,p.source,p.position.toArray(),p.scale])};});
  const initial=await snap();
  report.asset=await page.evaluate(()=>{const f=window.__branchForge,gl=f.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');let meshes=0,instances=0;f.asset.group.traverse(m=>{if(m.isMesh){meshes++;if(m.isInstancedMesh)instances+=m.count;}});return {branches:f.asset.masterBranches.length,units:f.authoring.branch_instances.length,meshes,instances,maxTexture:gl.getParameter(gl.MAX_TEXTURE_SIZE),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'};});
  const id=await page.evaluate(()=>window.__branchForge.asset.masterBranches.find(b=>!b.unitOwner&&!b.instanceId&&b.parentId>=0).stableId);
  await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'$')})}).click();
  await page.evaluate(()=>{window.__editMeasure={frames:[],longTasks:[],renders:[],last:0};new PerformanceObserver(list=>window.__editMeasure.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask'});const f=window.__branchForge,render=f.renderer.render;f.renderer.render=function(){const t=performance.now(),m=window.__editMeasure;if(m.watching&&m.last)m.frames.push(t-m.last);if(m.watching)m.last=t;const result=render.apply(this,arguments);if(m.committing&&f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.asset.activeEditPreview)m.finalGeometryFrames=(m.finalGeometryFrames||0)+1;if(m.watching)m.renders.push(performance.now()-t);return result;};});
  const clock=()=>page.evaluate(()=>performance.now());
  let start=await clock();await page.keyboard.press('r');report.rotateBeginMs=(await clock())-start;
  report.preview=await page.evaluate(()=>({mode:window.__branchForge.asset.activeEditPreview?.stats.mode||'CPU',stats:window.__branchForge.asset.activeEditPreview?.stats}));
  console.log('PREVIEW',JSON.stringify(report.preview));
  await page.keyboard.press('z');await page.keyboard.type('15');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.evaluate(()=>{const m=window.__editMeasure;m.watching=true;m.last=0;});
  start=await clock();for(let n=0;n<12;n++){await page.keyboard.press('Backspace');await page.keyboard.press(n%2?'5':'6');}report.rotateInputsMs=(await clock())-start;
  report.frameIntervals=await page.evaluate(()=>{const m=window.__editMeasure;m.watching=false;return {frames:m.frames,renders:m.renders,longTasks:m.longTasks};});
  await page.keyboard.press('Escape');await idle();assert.deepEqual(await snap(),initial);report.checks.push('full 550-unit camphor rotation preview cancels exactly');
  {
   assert.equal(report.preview.mode,'GPU');
   const tool=page.locator('.viewport-tool-rail [data-viewport-tool="COMB"]');await tool.evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.matches('details'))p.open=true;});await tool.click();await page.locator('#branchEditScope').selectOption('DIRECT');
   await page.locator('#quick_sculptRadius').evaluate(e=>e.value='220');await page.locator('#quick_sculptRadius').dispatchEvent('input');
   await page.evaluate(id=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),p=b.points[Math.floor(b.points.length*.7)].clone().applyMatrix4(f.asset.group.matrixWorld);f.controls.target.copy(p);f.camera.position.copy(p).add({x:0,y:-15,z:3});f.controls.update();},id);
   const pointer=await page.evaluate(id=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),p=b.points[Math.floor(b.points.length*.7)].clone(),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);p.applyMatrix4(f.asset.group.matrixWorld).project(f.camera);return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];},id);
   await page.evaluate(p=>{window.__combPointer=p;},pointer);
   await page.mouse.move(...pointer);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.evaluate(()=>{window.__commitOwner=window.__branchForge.asset;window.__commitOutliner=document.querySelector('#branchOutliner button.active');window.__commitIcon=document.querySelector('#saveProjectBtn svg');window.__commitOption=document.querySelector('#wbInstances option:nth-child(2)');window.__commitBuffers=[];window.__branchForge.asset.group.traverse(m=>{if(m.isInstancedMesh)window.__commitBuffers.push([m,m.geometry,m.material]);});});
   start=await clock();await page.mouse.down();report.combBeginMs=(await clock())-start;
   const combState=await page.evaluate(()=>({mode:window.__branchForge.asset.activeEditPreview?.stats.mode,status:document.querySelector('#statusText')?.textContent,selection:document.querySelector('#branchEditScopeCount')?.textContent,hit:document.elementFromPoint(window.__combPointer[0],window.__combPointer[1])?.outerHTML.slice(0,200)}));
   assert.equal(combState.mode,'GPU',JSON.stringify({pointer,...combState}));
   await page.evaluate(()=>{const m=window.__editMeasure;m.frames=[];m.renders=[];m.longTasks=[];m.last=0;m.watching=true;});
   start=await clock();for(let n=1;n<=12;n++)await page.mouse.move(pointer[0]+n*2,pointer[1]-n*3);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));report.combInputsMs=(await clock())-start;
   report.combPreview=await page.evaluate(()=>({stats:{...window.__branchForge.asset.activeEditPreview.stats},updateMs:window.__branchForge.sculptState.previewMs,frames:window.__editMeasure.frames,renders:window.__editMeasure.renders,longTasks:window.__editMeasure.longTasks}));
   assert.ok(report.combPreview.stats.updatedBranches>0,'camphor brush actually deforms a branch');
   await page.evaluate(()=>{window.__editMeasure.watching=false;window.__editMeasure.longTasks=[];window.__releaseProfile={};window.__editMeasure.committing=true;window.__editMeasure.finalGeometryFrames=0;});
   await page.evaluate(()=>{window.__editMeasure.coverFrames=0;const f=window.__branchForge,render=f.renderer.render;f.renderer.render=function(...args){if(window.__editMeasure.committing){const e=document.querySelector('#busyOverlay'),css=getComputedStyle(e);if(!e.hidden&&css.backgroundColor!=='rgba(0, 0, 0, 0)')window.__editMeasure.coverFrames++;}return render.apply(this,args);};});
   start=await clock();await page.mouse.up();await idle();report.commitWallMs=(await clock())-start;let edited=await snap();assert.notDeepEqual(edited,initial);
   report.commit=await page.evaluate(()=>{const f=window.__branchForge,a=f.asset;return {sameAsset:a===window.__commitOwner,sameInstanceOption:document.querySelector('#wbInstances option:nth-child(2)')===window.__commitOption,finalGeometryFrames:window.__editMeasure.finalGeometryFrames,sameSampleBuffers:window.__commitBuffers.every(([m,g,material])=>m.geometry===g&&m.material===material&&m.parent),sameOutliner:document.querySelector('#branchOutliner button.active')===window.__commitOutliner,sameIcon:document.querySelector('#saveProjectBtn svg')===window.__commitIcon,newIconsReady:!document.querySelector('i[data-lucide]'),stats:a.report.support_update,compiled:a.report.compiled_samples,longTasks:window.__editMeasure.longTasks,timings:f.editTimings,panels:window.__releaseProfile};});console.log('COMMIT',JSON.stringify(report.commit));
   if(report.phase==='sculpt-after'||report.phase.startsWith('brush-workflow-after')){assert.equal(report.commit.sameAsset,true);assert.equal(report.commit.sameSampleBuffers,true);assert.equal(report.commit.sameOutliner,true);assert.equal(report.commit.sameIcon,true);assert.equal(report.commit.newIconsReady,true);assert.ok(report.commit.stats.reused_samples>0);report.checks.push('commit retains completed sample meshes, atlases, outliner rows and rendered icons');}
   report.commit.coverFrames=await page.evaluate(()=>window.__editMeasure.coverFrames);
   console.log('COVER_FRAMES',report.commit.coverFrames);
   if(report.phase.includes('flash-after')){assert.equal(report.commit.coverFrames,0);report.checks.push('no painted dark loading cover during real camphor sculpt commit');}
   if(report.phase.includes('release-final')){assert.equal(report.commit.sameInstanceOption,true);assert.ok(report.commit.finalGeometryFrames>=1);report.checks.push('final geometry renders before panel synchronization while instance selector options remain stable');}
   await page.evaluate(async()=>{const f=window.__branchForge,{analyzeGroup}=await import('./branch-kernel.js'),fresh=analyzeGroup(f.asset.group,f.asset.settings);for(const key of ['vertices','triangles','invalid_vertices','degenerate_faces','missing_uv','missing_normals','missing_tangents','material_slots'])if(fresh[key]!==f.asset.report[key])throw Error('quality cache mismatch: '+key);});report.checks.push('cached sample quality matches full current mesh scan');
   await page.evaluate(()=>window.__editMeasure.committing=false);
   await page.keyboard.press('Control+z');await idle();assert.deepEqual(await snap(),initial);await page.keyboard.press('Control+y');await idle();assert.deepEqual(await snap(),edited);report.checks.push('camphor commit, undo and redo reproduce all curves and radii');
   if(report.phase==='sculpt-after'||report.phase.startsWith('brush-workflow-after')){
    const first=edited,owner=await page.evaluate(()=>{window.__secondOwner=window.__branchForge.asset;return true;});
    const secondPointer=await page.evaluate(id=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),r=document.querySelector('#viewport').getBoundingClientRect(),p=b.points[Math.floor(b.points.length*.7)].clone().applyMatrix4(f.asset.group.matrixWorld).project(f.camera);return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];},id);
    await page.mouse.move(...secondPointer);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.mouse.down();
    for(let n=1;n<=12;n++)await page.mouse.move(secondPointer[0]-n*2,secondPointer[1]-n*3);
    start=await clock();await page.mouse.up();await idle();report.secondCommitMs=(await clock())-start;
    assert.equal(await page.evaluate(()=>window.__branchForge.asset===window.__secondOwner),true);edited=await snap();assert.notDeepEqual(edited,first);
    await page.keyboard.press('Control+z');await idle();assert.deepEqual(await snap(),first);await page.keyboard.press('Control+y');await idle();assert.deepEqual(await snap(),edited);
    report.checks.push('second real camphor brush reuses samples and restores exact intermediate undo state');
   }
   await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='camphor.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立香樟验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
   await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'香樟编辑保存.branch.json');await download.saveAs(saved);
   await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===550);await idle();assert.deepEqual(await snap(),edited);report.checks.push('actual camphor file save, page reload and import retain full edited assembly');
   if(report.phase.includes('release-race')){
    await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'$')})}).click();
    const tool=page.locator('.viewport-tool-rail [data-viewport-tool="COMB"]');await tool.evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.matches('details'))p.open=true;});await tool.click();await page.locator('#branchEditScope').selectOption('DIRECT');
    const pointer=await page.evaluate(id=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),p=b.points[Math.floor(b.points.length*.7)].clone().applyMatrix4(f.asset.group.matrixWorld);f.controls.target.copy(p);f.camera.position.copy(p).add({x:0,y:-15,z:3});f.controls.update();const r=document.querySelector('#viewport').getBoundingClientRect();p.project(f.camera);return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];},id);
    await page.evaluate(()=>{const f=window.__branchForge,before=f.authoring,original=f.renderer.render;window.__releaseRaceHit=false;f.renderer.render=function(...args){const result=original.apply(this,args);if(!window.__releaseRaceHit&&f.authoring!==before&&f.asset.authoring===f.authoring&&f.asset.group.userData.pending_rebuild&&!f.asset.activeEditPreview){window.__releaseRaceHit=true;document.querySelector('#undoBtn').click();}return result;};});
    await page.mouse.move(...pointer);await page.mouse.down();await page.mouse.move(pointer[0]+25,pointer[1]-30,{steps:10});await page.mouse.up();await page.waitForFunction(()=>window.__releaseRaceHit);await idle();
    assert.deepEqual(await snap(),edited);assert.equal(await page.evaluate(()=>window.__branchForge.historyState.redo),1);
    report.checks.push('undo between final geometry and panel synchronization supersedes the stale commit without losing the loaded tree');
   }
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.shaderErrors,[]);report.passed=true;console.log(JSON.stringify({...report,frameIntervals:undefined}));
 }catch(e){if(page)await page.screenshot({path:path.join(out,'失败现场.png')});throw e;}finally{await browser.close();fs.writeFileSync(path.join(out,report.phase+'.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
