const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  const meta=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,''))).find(m=>m.species==='JASMINE');
  await page.evaluate(async id=>{const {migrateProjectDocument}=await import('/authoring-state.js');const doc=await(await fetch('/api/project-document?id='+encodeURIComponent(id))).json();await window.__branchForge.workbench.load(migrateProjectDocument(doc));},meta.id);
  await page.locator('#openBranchAssembly').click();await page.locator('[data-scale-asset]').first().fill('1.2');await page.locator('[data-scale-asset]').first().press('Tab');
  await page.waitForFunction(()=>Object.values(window.__branchForge.asset.authoring.workbench?.assembly_scale?.cards||{}).includes(1.2)&&!window.__branchForge.asset.group.userData.pending_rebuild);
  await page.locator('#fitViewBtn').click();await page.locator('.tree-assembly-advanced > summary').click();await page.locator('#wbAssemblyScale').scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const directory=path.resolve('.runtime/whole-sample/JASMINE');fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,'装配倍率界面.png')});assert.deepEqual(errors,[]);console.log('Scaled complete-sample preview captured without page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
