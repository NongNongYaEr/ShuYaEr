const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/skeleton-edit');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const metas=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,'')));
 const meta=metas.filter(m=>m.species==='PLATANUS'&&m.userSaved&&m.name.includes('最终')).sort((a,b)=>fs.statSync(b.path).mtimeMs-fs.statSync(a.path).mtimeMs)[0];assert.ok(meta,'latest user PLATANUS');
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(meta.path)).digest('hex');const originalHash=hash();result.source={name:meta.name,path:meta.path,hash:originalHash};
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(180000);page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.locator('#projectInput').setInputFiles(meta.path);
  await page.waitForFunction(name=>window.__branchForge.asset?.settings.object_name===name&&!window.__branchForge.workbench.busy,meta.name);
  const wait=()=>page.waitForFunction(()=>window.__branchForge.asset&&!window.__branchForge.asset.group.userData.pending_rebuild&&!window.__branchForge.workbench.busy&&document.querySelector('#busyOverlay').hidden);
  const snapshot=()=>page.evaluate(async()=>{
   const f=window.__branchForge,a=f.asset,{skeletonBranches}=await import('/skeleton-thickness.js'),{branchRadiusAt}=await import('/branch-shaping.js');
   const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))).map(n=>n.toString(16).padStart(2,'0')).join('');
   const bones=skeletonBranches(a.masterBranches),boneIds=new Set(bones.map(b=>b.stableId)),geometry=new Set(),meshes=[];
   a.group.updateMatrixWorld(true);a.group.traverse(o=>{if(o.geometry)geometry.add(o.geometry);if(o.isMesh&&!boneIds.has(o.userData.stable_id))meshes.push(o);});
   const unitGeometry=[];for(const o of meshes){const attrs={};for(const [k,v] of Object.entries(o.geometry.attributes))attrs[k]=await hash(v.array);unitGeometry.push([attrs,o.geometry.index?await hash(o.geometry.index.array):null,o.isInstancedMesh?await hash(o.instanceMatrix.array):o.matrixWorld.toArray()]);}
   f.renderer.render(f.scene,f.camera);
   return {mode:f.skeletonEditMode,instances:f.authoring.branch_instances.length,leaves:a.placements.length,organs:a.treeOrgans.length,branches:a.masterBranches.length,
    instanceHash:await hash(JSON.stringify(f.authoring.branch_instances)),libraryHash:await hash(JSON.stringify(f.authoring.branch_library)),unitGeometryHash:await hash(JSON.stringify(unitGeometry)),
    unitPoseHash:await hash(JSON.stringify([a.masterBranches.filter(b=>!boneIds.has(b.stableId)).map(b=>[b.stableId,b.points,b.startRadius,b.endRadius,b.sections]),a.placements,a.treeOrgans])),
    bones:bones.map(b=>({id:b.stableId,order:b.order,points:b.points.map(v=>v.toArray()),radii:[0,.25,.5,.75,1].map(t=>branchRadiusAt(b,a.settings,t))})),
    performance:{generationMs:a.report.generation_ms,triangles:f.renderer.info.render.triangles,drawCalls:f.renderer.info.render.calls,geometryBytes:[...geometry].reduce((n,g)=>n+Object.values(g.attributes).reduce((s,v)=>s+v.array.byteLength,0)+(g.index?.array.byteLength||0),0),textures:f.renderer.info.memory.textures}};
  });
  const before=await snapshot();result.before=before.performance;result.counts={instances:before.instances,leaves:before.leaves,organs:before.organs,branches:before.branches};console.log('Loaded',result.counts);
  const toggle=async()=>{await page.locator('#skeletonEditModeBtn').click();await wait();};
  await toggle();const light=await snapshot();result.editMode=light.performance;
  assert.equal(light.mode,true);assert.equal(light.leaves,0);assert.equal(light.organs,0);assert.equal(light.branches,before.bones.length);assert.deepEqual(light.bones,before.bones);
  assert.equal(light.instanceHash,before.instanceHash);assert.equal(light.libraryHash,before.libraryHash);assert.ok(light.performance.geometryBytes<before.performance.geometryBytes);
  assert.equal(await page.locator('.wb-assembly').evaluate(e=>e.inert),true);
  if(await page.locator('#treeSkeletonStructure .parameter-group-toggle').getAttribute('aria-expanded')==='false')await page.locator('#treeSkeletonStructure .parameter-group-toggle').click();await page.locator('#skeletonThicknessPanel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'枝干编辑.png')});result.checks.push('UI switch skips units, leaves and organs, preserves exact skeleton and document');
  await page.locator('#skeletonThicknessLevel').selectOption('2');
  const tip=page.locator('[data-skeleton-point="4"]'),oldValue=Number(await tip.inputValue()),newValue=oldValue<.8?.9:.3;
  const start=Date.now();await tip.fill(String(newValue));await tip.press('Enter');await wait();result.editLatencyMs=Date.now()-start;
  const edited=await snapshot();assert.notDeepEqual(edited.bones,light.bones);assert.equal(edited.leaves,0);assert.equal(edited.instanceHash,before.instanceHash);
  await page.locator('#undoBtn').click();await wait();assert.deepEqual((await snapshot()).bones,light.bones);
  await page.locator('#redoBtn').click();await wait();assert.deepEqual((await snapshot()).bones,edited.bones);result.checks.push('radius edits, undo and redo run only on skeleton');
  await toggle();const restored=await snapshot();result.restored=restored.performance;
  assert.deepEqual(restored.bones,edited.bones);for(const k of ['instances','leaves','organs','branches','instanceHash','libraryHash','unitPoseHash','unitGeometryHash'])assert.equal(restored[k],before[k],k);
  await page.screenshot({path:path.join(out,'恢复整树.png')});result.checks.push('restored tree keeps every completed-unit mesh, transform, leaf and organ unchanged after radius edit');
  // Save through the real panel/serializer; redirect only filesystem transport to a test download.
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='skeleton-edit.branch.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await toggle();await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__branchForge.skeletonEditMode),false);
  await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'枝干编辑重载.branch.json');await download.saveAs(saved);
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(name=>window.__branchForge.asset?.settings.object_name===name&&!window.__branchForge.workbench.busy,meta.name);
  const reloaded=await snapshot();for(const k of ['instances','leaves','organs','branches','instanceHash','libraryHash','unitPoseHash','unitGeometryHash'])assert.equal(reloaded[k],restored[k],'reload '+k);assert.deepEqual(reloaded.bones,edited.bones);
  result.checks.push('saving in edit mode restores full assembly; actual file reload preserves edits and units');
  await toggle();
  const primary=before.bones.find(b=>b.order===1).id;
  await page.locator('#branchOutliner button').filter({has:page.locator('span').filter({hasText:new RegExp('^'+primary+'$')})}).click();
  await page.locator('#openBranchArray').click();assert.equal(await page.evaluate(()=>window.__branchForge.workbench.arrays.active),false);
  await page.locator('#openBranchPose').click();
  assert.equal(await page.evaluate(()=>{const g=window.__branchForge.workbench.forms.ghost;return g?.skeletonOnly&&g.placements.length===0&&g.treeOrgans.length===0&&!g.masterBranches.some(b=>b.instanceId);}),true);
  await page.locator('#formCancel').click();result.checks.push('array installation blocked and pose-tool preview also skips complete samples');
  await page.locator('[data-tab="edit"]').click();await page.locator('#branchNumericAdvanced > summary').click();await page.locator('#localRotZ').fill('15');await page.locator('#localRotZ').press('Tab');await wait();
  const bent=await snapshot();assert.notDeepEqual(bent.bones,edited.bones);assert.equal(bent.leaves,0);
  await toggle();const bentFull=await snapshot();assert.deepEqual(bentFull.bones,bent.bones);assert.equal(bentFull.instanceHash,before.instanceHash);assert.notEqual(bentFull.unitPoseHash,restored.unitPoseHash);
  await page.locator('#undoBtn').click();await wait();assert.deepEqual((await snapshot()).bones,edited.bones);
  result.checks.push('single main-branch rotation edits only skeleton; returning preview updates attachment poses without changing installation settings');
  for(let n=0;n<2;n++){await toggle();await toggle();}const repeated=await snapshot();assert.equal(repeated.unitGeometryHash,restored.unitGeometryHash);assert.equal(repeated.performance.textures,restored.performance.textures);result.repeated=repeated.performance;
  result.checks.push('repeated transitions do not accumulate geometry or GPU textures');assert.equal(hash(),originalHash);assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
