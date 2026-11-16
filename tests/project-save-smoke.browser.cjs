const assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];let exports=0;page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/export-pve-complete'))exports++;});
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.locator('#brandExportOpen').click();await page.locator('#exportPveCompleteBtn').click();await page.waitForSelector('#projectSaveDialog[open]');
  assert.equal(await page.locator('[name="saveMode"]:checked').inputValue(),'FILE');assert.ok(await page.locator('[name="saveMode"][value="NEW"]').isDisabled());assert.ok(await page.locator('[name="saveMode"][value="VERSION"]').isDisabled());
  await page.locator('#psCancel').click();await page.waitForFunction(()=>!document.getElementById('projectSaveDialog').open);assert.equal(exports,0);
  await page.keyboard.press('Control+s');await page.waitForSelector('#projectSaveDialog[open]');assert.ok(await page.locator('[name="saveMode"][value="NEW"]').isEnabled());
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('projectSaveDialog').open);assert.deepEqual(errors,[]);console.log('PASS: PVE save-only panel cancellation, Ctrl+S, Escape');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
