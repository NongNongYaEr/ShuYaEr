const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/surface-workbench'),browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1680,height:1080}}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset?.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 try{
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.sizeReference);await page.locator('#projectInput').setInputFiles(path.join(out,'桥墩叶簇验收.branch.json'));await page.waitForFunction(()=>window.__branchForge.authoring.surface_growth?.growth_ruler);await wait();
  if(await page.locator('#surfaceGrowthPanel .parameter-group-toggle').getAttribute('aria-expanded')==='false')await page.locator('#surfaceGrowthPanel .parameter-group-toggle').click();
  assert.equal(await page.locator('#surfaceModelSettings').getAttribute('open'),null);assert.ok(!await page.locator('#surfaceBrush').isVisible());assert.ok(await page.locator('#surfaceLeafSize').isVisible());assert.equal(await page.locator('#surfaceLeafSize').inputValue(),'10');
  const before=await page.evaluate(()=>({count:window.__branchForge.asset.placements.filter(p=>p.canopy).length,manual:JSON.stringify(window.__branchForge.authoring.surface_growth.guides)}));
  await page.locator('#surfaceLeafSize').locator('..').locator('button.parameter-reset').click();await wait();assert.equal(await page.locator('#surfaceLeafSize').inputValue(),'17');assert.equal(await page.evaluate(()=>window.__branchForge.authoring.vine.leaf_size),.17);assert.equal(await page.evaluate(()=>window.__branchForge.asset.placements.filter(p=>p.canopy).length),before.count);
  await page.locator('#undoBtn').click();await wait();assert.equal(await page.locator('#surfaceLeafSize').inputValue(),'10');
  await page.locator('#surfaceEditScope').selectOption('ZONE');await page.locator('[data-surface-tool="REGION"]').click();assert.ok(await page.locator('#surfaceBrush').isVisible());await page.locator('#surfaceEditScope').selectOption('WHOLE');assert.ok(!await page.locator('#surfaceBrush').isVisible());assert.equal(await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring.surface_growth.guides)),before.manual);
  await page.locator('#fitViewBtn').click();await page.locator('#surfaceEditScope').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'最终工作台布局.png')});
  await page.locator('#surfaceStemGroup > summary').click();await page.locator('#surfaceStemGroup').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'独立藤干参数.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'界面最终复核.json'),JSON.stringify({passed:true,resetCentimeters:true,resetPreservesCount:true,undo:true,modelCollapsed:true,brushOnlyWhenPainting:true,manualPreserved:true,errors},null,2));console.log('Final layout, unit reset, undo and brush scope passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
