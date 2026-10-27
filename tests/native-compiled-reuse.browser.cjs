// Extend the actual cooperative-edit run with borrowed-resource lifetime,
// repeated history, ordinary save/cold reload and actual model pixel checks.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const base=path.join(__dirname,'native-cooperative-build.browser.cjs');let source=fs.readFileSync(base,'utf8');
const preview=fs.readFileSync(path.join(__dirname,'native-preview-retention.browser.cjs'),'utf8'),captureStart=preview.indexOf('  const capture=async name=>'),captureEnd=preview.indexOf('  const authoring=',captureStart);assert(captureStart>0&&captureEnd>captureStart);
const marker="console.log('PASS full-tree cooperative build: real camera/frames, held preview, full model audits and superseded-result cleanup');";assert(source.includes(marker));
source=source.replace(marker,preview.slice(captureStart,captureEnd)+String.raw`
  assert(response.profile.counters.compiled_samples_reused>400,'the actual editor must retain unchanged complete samples');
  assert(response.profile.counters.compiled_samples_built<200);
  const retireCurrent=()=>page.evaluate(()=>{const a=window.__branchForge.asset;(window.__retiredHistoryModels??=[]).push({owner:new WeakRef(a),group:new WeakRef(a.group)});});
  const pressure=[];for(let cycle=0;cycle<4;cycle++){
    await retireCurrent();
    await page.locator('#undoBtn').click();await idle();await native();assert.equal((await fingerprint()).authoring,baseline.authoring);
    await retireCurrent();
    await page.locator('#redoBtn').click();await idle();await native();assert.deepEqual(await fingerprint(),confirmed);
    const sample=await page.evaluate(()=>{const f=window.__branchForge,s=f.nativeViewport.stats.native;return {geometry:s.geometry_resources,textures:s.texture_resources,buffers:s.buffer_resources,materials:s.material_records,memory:s.video_memory_usage,budget:s.video_memory_budget};});pressure.push(sample);
  }
  const counts=s=>[s.geometry,s.textures,s.buffers,s.materials];assert(pressure.every(s=>JSON.stringify(counts(s))===JSON.stringify(counts(pressure[0]))),'repeated redo must release retired source geometry, palettes and GPU records');assert(pressure.every(s=>s.memory<s.budget));
  const cdp=await page.context().newCDPSession(page),heap=[];let retiredModelsCollected=false;
  for(let attempt=0;attempt<4;attempt++){await page.evaluate(()=>new Promise(r=>setTimeout(r,0)));await cdp.send('HeapProfiler.collectGarbage');await page.evaluate(()=>new Promise(r=>setTimeout(r,0)));retiredModelsCollected=await page.evaluate(()=>window.__retiredHistoryModels.length===8&&window.__retiredHistoryModels.every(r=>!r.owner.deref()&&!r.group.deref()));heap.push({attempt,collected:retiredModelsCollected,...await cdp.send('Runtime.getHeapUsage')});if(retiredModelsCollected)break;}
  assert(retiredModelsCollected,'actual repeated history must collect retired full owners and scenes while authored history and reused prototypes remain live');
  const modelPixels=await capture('confirmed-model'),camera=await page.evaluate(()=>{const f=window.__branchForge;return {position:f.camera.position.toArray(),target:f.controls.target.toArray(),up:f.camera.up.toArray(),zoom:f.camera.zoom,near:f.camera.near,far:f.camera.far};});
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));window.__compiledSavedDocument=await options.body.slice(offset).text();return new Response(JSON.stringify({success:true,path:'compiled-confirmed.branch.json'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.locator('#viewport').focus();await page.keyboard.press('Control+s');await page.waitForSelector('#projectSaveDialog[open]');await page.locator('[name="saveMode"][value="FILE"]').check();await page.locator('#psSubmit').click();await page.waitForFunction(()=>Boolean(window.__compiledSavedDocument));
  const saved=await page.evaluate(()=>window.__compiledSavedDocument);fs.writeFileSync(path.join(out,'native-editor-confirmed.branch.json'),saved);const document=JSON.parse(saved);assert.equal(document.authoring.branch_instances.length,863);assert.doesNotMatch(JSON.stringify(document.authoring),/compiledSampleGeometries|compiledSampleMaterials|reusedCompiledMaterials|transportSession/);
  await page.reload();await idle();await require('./native-test-port.cjs').assertOwnership(page,out);
  await page.evaluate(async()=>{const response=await fetch('/api/acceptance/saved-project'),files=new DataTransfer();files.items.add(new File([await response.blob()],'compiled-confirmed.branch.json',{type:'application/json'}));const input=document.getElementById('projectInput');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));});if(await page.locator('#projectSwitchConfirm[open]').isVisible())await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();await idle();
  await page.evaluate(camera=>{const f=window.__branchForge;f.asset.settings.wind_strength=0;f.controls.enableDamping=false;f.nativeViewport.setDlss(false);f.camera.up.fromArray(camera.up);f.camera.position.fromArray(camera.position);f.camera.zoom=camera.zoom;f.camera.near=camera.near;f.camera.far=camera.far;f.controls.target.fromArray(camera.target);f.controls.update();f.camera.updateProjectionMatrix();},camera);await native();
  const cold=await fingerprint();assert.deepEqual(cold,confirmed);const coldAudit=await page.evaluate(()=>window.__branchForge.nativeViewport.auditModel());assert(coldAudit.checked&&!coldAudit.mismatch);
  const coldPixels=await capture('cold-model'),png=require('./png-pixels.cjs');assert.deepEqual(png(coldPixels).data,png(modelPixels).data,'saved cold rebuild must reproduce the borrowed-geometry and retained-texture GPU pixels');assert.deepEqual(failures,[]);
  fs.writeFileSync(path.join(out,'compiled-reuse-acceptance.json'),JSON.stringify({passed:true,cache:response.profile.counters,pressure,retiredModelsCollected,heap,confirmed,cold,coldAudit,sourcePixelsRestored:true,final:await page.evaluate(()=>window.__branchForge.nativeViewport.stats)},null,2));console.log('PASS compiled reuse: repeated actual history releases resources and full owners; ordinary save/cold reload reproduces the exact document, graph and GPU model pixels');
`);
const mod=new Module(base,module);mod.filename=base;mod.paths=module.paths;mod._compile(source,base);
