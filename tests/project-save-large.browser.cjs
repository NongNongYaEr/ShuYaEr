const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/save-panel');fs.mkdirSync(out,{recursive:true});const result={errors:[]};let id;
 const origin=process.argv[2],browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(180000);page.on('pageerror',e=>{result.errors.push(e.message);console.log(e.message);});page.on('crash',()=>result.errors.push('renderer crash'));page.on('dialog',d=>d.accept());
  page.on('requestfailed',r=>{if(r.url().includes('/api/tree-template'))console.log('save request failed: '+r.failure()?.errorText);});
  page.on('request',r=>{if(r.url().includes('/api/tree-template'))console.log('save request sent');});
  page.on('console',m=>{if(m.text().startsWith('SAVE_STAGE'))console.log(m.text());});
  await page.goto(origin);await page.waitForFunction(()=>window.__branchForge?.asset);
  const meta=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,''))).find(m=>m.species==='PLATANUS'&&!m.userSaved);
  await page.evaluate(async item=>{const {migrateProjectDocument}=await import('/authoring-state.js'),{attachSaveContext,templateContext}=await import('/project-save-data.js');const doc=await(await fetch('/api/project-document?id='+item.id)).json();await window.__branchForge.workbench.load(attachSaveContext(migrateProjectDocument(doc),templateContext(item)));},meta);
  const stats=()=>page.evaluate(()=>{const f=window.__branchForge,a=f.asset;return {instances:f.authoring.branch_instances.length,branches:a.masterBranches.length,leaves:a.placements.length,organs:a.treeOrgans.length,library:f.workbench.library.length,compiled:a.report.compiled_samples,atlas:a.materials.leaf.map.image.naturalWidth};});
  result.before=await stats();await page.locator('#saveProjectBtn').click();await page.locator('#psName').fill('验收_二球悬铃木大样板');await page.locator('#psNotes').fill('1375 根次枝与 4K 图集保存重载验收');await page.screenshot({path:path.join(out,'大样板保存面板.png')});
  // Do not mirror a ~190 MB request body into the automation protocol.
  const protocol=await page.context().newCDPSession(page);await protocol.send('Network.disable');
  await page.evaluate(()=>new MutationObserver(()=>console.log('SAVE_STAGE '+document.getElementById('psStatus').textContent)).observe(document.getElementById('psStatus'),{childList:true,subtree:true}));
  await page.locator('#psSubmit').click();await page.waitForFunction(()=>document.getElementById('psView').hidden===false||document.getElementById('psStatus').textContent.includes('失败'));
  await protocol.send('Network.enable',{maxPostDataSize:1});
  const saveMessage=await page.locator('#psStatus').textContent();console.log(saveMessage);assert.equal(await page.locator('#psView').isVisible(),true,saveMessage);id=await page.evaluate(()=>window.__branchForge.authoring.workbench.project_save.templateId);
  result.saved=JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',id+'.meta.json'),'utf8').replace(/^\uFEFF/,''));
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.evaluate(id=>window.__branchForge.projectLibrary.open('templates',id),id);await page.locator(`[data-id="${id}"]`).dblclick();await page.locator('#projectLibraryConfirm [data-confirm-accept]').click();
  await page.waitForFunction(id=>window.__branchForge.authoring.workbench?.project_save?.templateId===id&&!window.__branchForge.workbench.busy,id);result.after=await stats();assert.deepEqual(result.after,result.before);assert.equal(result.after.instances,1375);assert.equal(result.after.atlas,4096);
  const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');result.heap=await cdp.send('Runtime.getHeapUsage');assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();if(id){const response=await fetch(origin+'api/tree-template?id='+id,{method:'DELETE'});assert.ok(response.ok);}fs.writeFileSync(path.join(out,'大样板验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
