const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/sample-thickness');fs.mkdirSync(out,{recursive:true});const result={errors:[]};
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(180000);page.on('pageerror',e=>result.errors.push(e.message));
  const meta=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,''))).find(m=>m.species==='PLATANUS'&&!m.userSaved);
  const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(meta.path)).digest('hex'),originalHash=hash();
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.evaluate(async id=>{const {migrateProjectDocument}=await import('/authoring-state.js');await window.__branchForge.workbench.load(migrateProjectDocument(await(await fetch('/api/project-document?id='+id)).json()));},meta.id);
  const wait=()=>page.waitForFunction(()=>!window.__branchForge.workbench.busy&&!window.__branchForge.asset.group.userData.pending_rebuild);
  const snapshot=()=>page.evaluate(()=>{const f=window.__branchForge,a=f.asset;return {instances:f.authoring.branch_instances.map(i=>({id:i.id,asset:i.asset_id,scale:i.scale,radius:i.radius_scale})),leaves:a.placements.length,organs:a.treeOrgans.length,compiled:a.report.compiled_samples,atlas:a.materials.leaf.map.image.naturalWidth};});
  const before=await snapshot();result.before={instances:before.instances.length,thin:before.instances.filter(i=>i.radius<1).length,min:Math.min(...before.instances.map(i=>i.radius)),leaves:before.leaves,organs:before.organs};
  await page.evaluate(()=>{const a=window.__branchForge.asset;window.__thicknessBefore={radii:Object.fromEntries(a.masterBranches.map(b=>[b.stableId,b.startRadius])),axes:JSON.stringify(a.masterBranches.map(b=>b.points)),leaves:JSON.stringify(a.placements.map(p=>[p.position,p.scale])),organs:JSON.stringify(a.treeOrgans.map(p=>[p.position,p.scale]))};});
  await page.locator('#openBranchAssembly').click();await page.locator('.tree-assembly-advanced > summary').click();await page.locator('#wbThicknessStatus').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'恢复前.png')});
  const first=page.locator('[data-restore-thickness]').first(),assetId=await first.getAttribute('data-restore-thickness');
  await first.locator('..').locator(':scope > summary').click();await first.click();await wait();const single=await snapshot();
  for(const old of before.instances)assert.equal(single.instances.find(i=>i.id===old.id).radius,old.asset===assetId?1:old.radius);
  await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snapshot(),before);
  await page.locator('#redoBtn').click();await wait();assert.deepEqual(await snapshot(),single);
  await page.locator('#wbRestoreSampleThickness').click();await wait();const restored=await snapshot();assert.ok(restored.instances.every(i=>i.radius===1));
  assert.deepEqual(restored.instances.map(i=>i.scale),before.instances.map(i=>i.scale));assert.equal(restored.leaves,before.leaves);assert.equal(restored.organs,before.organs);assert.equal(restored.compiled,6);
  const unchanged=await page.evaluate(()=>{const a=window.__branchForge.asset,b=window.__thicknessBefore;return {axes:JSON.stringify(a.masterBranches.map(v=>v.points))===b.axes,leaves:JSON.stringify(a.placements.map(p=>[p.position,p.scale]))===b.leaves,organs:JSON.stringify(a.treeOrgans.map(p=>[p.position,p.scale]))===b.organs};});assert.deepEqual(unchanged,{axes:true,leaves:true,organs:true});
  assert.ok(await page.locator('#wbRestoreSampleThickness').isDisabled());await page.locator('#wbThicknessStatus').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'恢复后.png')});
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='restored.branch.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);return new Response(JSON.stringify({success:true,path:'test download'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.locator('#saveProjectBtn').click();await page.locator('[name="saveMode"][value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'恢复粗细重载.branch.json');await download.saveAs(saved);
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===1375&&!window.__branchForge.workbench.busy);await wait();
  assert.deepEqual(await snapshot(),restored);assert.equal(hash(),originalHash);assert.deepEqual(result.errors,[]);result.after={instances:restored.instances.length,leaves:restored.leaves,organs:restored.organs,compiled:restored.compiled,atlas:restored.atlas};result.checks=['card scope','undo/redo','restore all','same axes/leaves/organs/scales','actual save and page reload','formal source unchanged'];result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
