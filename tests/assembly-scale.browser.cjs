// Run against an isolated local BranchForge server, never the user's open page.
const fs=require('fs'), path=require('path'), assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/whole-sample',process.env.BRANCHFORGE_TEST_SPECIES||'JASMINE'); fs.mkdirSync(out,{recursive:true});
 const result={checks:[],errors:[]};
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(180000);
  page.on('pageerror',e=>result.errors.push(e.message));page.on('crash',()=>result.errors.push('renderer crash'));
  page.on('console',message=>{if(message.type()==='error'&&/WebGLProgram|VALIDATE_STATUS|ERROR: 0:/.test(message.text()))result.errors.push(message.text());});
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  const metas=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,'')));
  const meta=metas.find(m=>m.species===(process.env.BRANCHFORGE_TEST_SPECIES||'JASMINE'));assert.ok(meta);
  await page.evaluate(async id=>{const {migrateProjectDocument}=await import('/authoring-state.js');const doc=await(await fetch('/api/project-document?id='+encodeURIComponent(id))).json();await window.__branchForge.workbench.load(migrateProjectDocument(doc));},meta.id);
  await page.locator('#openBranchAssembly').click();
  await page.locator('.tree-assembly-advanced > summary').click();
  const baseline=await page.evaluate(()=>window.__branchForge.authoring.branch_instances.map(i=>({id:i.id,asset_id:i.asset_id,linked:i.linked,scale:i.scale})));
  const modelStats=()=>page.evaluate(()=>{const a=window.__branchForge.asset;const {generation_ms,...report}=a.report;report.warnings=report.warnings.filter(w=>!w.startsWith('生成耗时 '));return {branches:a.masterBranches.length,leaves:a.placements.length,organs:a.treeOrgans.length,report};});
  result.baseline=await modelStats();
  const renderStats=()=>page.evaluate(()=>{const f=window.__branchForge;f.renderer.render(f.scene,f.camera);const geometries=new Set();let batches=0;f.asset.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.isInstancedMesh)batches++;});return {drawCalls:f.renderer.info.render.calls,batches,geometryBytes:[...geometries].reduce((n,g)=>n+Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0)+(g.index?.array.byteLength||0),0),generationMs:f.asset.report.generation_ms};});
  result.instanced=await renderStats();assert.ok(result.instanced.batches>0);
  await page.evaluate(()=>{window.__sampleScaleAsset=window.__branchForge.asset;window.__sampleScaleGeometry=[];window.__branchForge.asset.group.traverse(o=>{if(o.geometry)window.__sampleScaleGeometry.push(o.geometry.uuid);});});
  const card=page.locator('[data-scale-asset]').first(), assetId=await card.getAttribute('data-scale-asset');
  const read=()=>page.evaluate(()=>({instances:window.__branchForge.authoring.branch_instances.map(i=>({id:i.id,asset_id:i.asset_id,linked:i.linked,scale:i.scale})),state:window.__branchForge.authoring.workbench?.assembly_scale,leaves:window.__branchForge.asset.placements.length,library:window.__branchForge.workbench.library.length}));
  const wait=()=>page.waitForFunction(()=>!document.querySelector('.branch-workspace-bar').hasAttribute('aria-busy')&&!window.__branchForge.asset.group.userData.pending_rebuild);
  async function set(selector,value){await page.locator(selector).fill(String(value));await page.locator(selector).press('Tab');await wait();}
  const cardSelector=`[data-scale-asset="${assetId}"]`;
  function check(data,overall,one){for(const i of baseline){const actual=data.instances.find(n=>n.id===i.id);assert.ok(Math.abs(actual.scale-i.scale*overall*(i.linked&&i.asset_id===assetId?one:1))<1e-10,`${i.id} scale`);}}
  assert.equal(await page.locator('#wbAssemblyScale').inputValue(),'1');assert.equal(await card.inputValue(),'1');
  await set(cardSelector,5);check(await read(),1,5);result.checks.push('card 5 applies to every matching instance only');console.log(result.checks.at(-1));
  assert.equal(await page.evaluate(()=>window.__sampleScaleAsset===window.__branchForge.asset),true,'scale keeps the current compiled asset');
  assert.equal(await page.evaluate(()=>{const ids=[];window.__branchForge.asset.group.traverse(o=>{if(o.geometry)ids.push(o.geometry.uuid);});return JSON.stringify(ids)===JSON.stringify(window.__sampleScaleGeometry);}),true,'scale keeps geometry buffers');
  assert.equal((await modelStats()).leaves,result.baseline.leaves);assert.equal((await modelStats()).organs,result.baseline.organs);
  result.scaleUpdate=await renderStats();
  await set('#wbAssemblyScale',2);check(await read(),2,5);result.checks.push('global 2 composes with card 5');
  await page.locator('#undoBtn').click();await page.waitForFunction(()=>window.__branchForge.authoring.workbench.assembly_scale.overall===1);await wait();check(await read(),1,5);
  await page.locator('#redoBtn').click();await page.waitForFunction(()=>window.__branchForge.authoring.workbench.assembly_scale.overall===2);await wait();check(await read(),2,5);result.checks.push('undo and redo preserve control state');
  // Keep large atlas strings out of the Playwright protocol. Exercise the real
  // save serializer, downloading its payload instead of opening a native dialog.
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){
    if(url==='/api/save-project') {const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='scale-reload.branch.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);return new Response(JSON.stringify({success:true,path:'独立测试下载'}),{headers:{'Content-Type':'application/json'}});}
    return original.apply(this,arguments);
  };});
  await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);
  await download.saveAs(path.join(out,'倍率重载测试.branch.json'));
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.locator('#projectInput').setInputFiles(path.join(out,'倍率重载测试.branch.json'));
  await page.waitForFunction(()=>window.__branchForge.authoring.workbench?.assembly_scale?.overall===2&&!document.querySelector('.branch-workspace-bar').hasAttribute('aria-busy')&&window.__branchForge.asset.authoring.workbench?.assembly_scale?.overall===2);
  await page.locator('.tree-assembly-advanced > summary').click();
  check(await read(),2,5);assert.equal(await page.locator(cardSelector).inputValue(),'5');assert.equal(await page.locator('#wbAssemblyScale').inputValue(),'2');result.checks.push('actual save payload reopens after page reload with factors and resolved scales');
  await set(cardSelector,2);check(await read(),2,2);
  await set(cardSelector,1);await set('#wbAssemblyScale',1);check(await read(),1,1);result.restored=await modelStats();assert.deepEqual(result.restored,result.baseline);result.checks.push('5 to 2 to 1 restores original scales, geometry counts and validation report');
  await set(cardSelector,1.2);await page.locator('#fitViewBtn').click();await page.locator('#wbAssemblyScale').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'装配倍率界面.png')});
  const count=Number(await page.locator('#wbAssemblyTarget').inputValue());
  await page.locator('#wbAssemblyTarget').fill(String(count+3));await page.locator('#wbApplyAssemblyCount').click();await wait();
  const resized=await read();assert.equal(resized.instances.length,baseline.length+3);for(const i of resized.instances){const record=resized.state.records[i.id];assert.ok(record);assert.equal(i.scale,record.base*(i.linked&&i.asset_id===assetId?1.2:1));}result.checks.push('quantity increase inherits card multiplier');
  await page.locator('#wbUpdateSamples').click();await wait();const updated=await read();for(const i of updated.instances){const record=updated.state.records[i.id];assert.equal(i.scale,record.base*(i.linked&&i.asset_id===assetId?1.2:1));}result.checks.push('sample refresh retains multiplier');
  result.instancedComparison=await renderStats();await page.evaluate(()=>window.__branchForge.asset.materialize());result.expanded=await renderStats();
  assert.ok(result.instancedComparison.geometryBytes<result.expanded.geometryBytes/3);assert.ok(result.instancedComparison.drawCalls<result.expanded.drawCalls);
  assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 } finally {await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
