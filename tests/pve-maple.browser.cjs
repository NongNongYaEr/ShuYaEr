const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {fingerprintScene,fingerprintBinary}=require('./pve-geometry-audit.cjs');
(async()=>{
 const root=path.resolve('.runtime/pve-maple-acceptance');fs.mkdirSync(root,{recursive:true});
 const name='鸡爪槭_真实样本装配整株_最终',project=path.resolve('导出',name+'.branch.json'),output=project.replace(/\.branch\.json$/,'_PVE_Complete');
 const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
 const original=path.join(root,'验收前工程.branch.json');fs.copyFileSync(project,original);let expectedSource=hash(project);
 const result={checks:[],errors:[],jobs:[],input_sha256:expectedSource};
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}});page.setDefaultTimeout(180000);page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.locator('#projectInput').setInputFiles(original);await page.waitForFunction(n=>window.__branchForge.collectSettings().object_name===n&&!window.__branchForge.workbench.busy,name);
  result.viewport=await page.evaluate(()=>{const f=window.__branchForge;return{instances:f.authoring.branch_instances.length,classes:f.authoring.branch_library.length,branches:f.asset.masterBranches.length,leaves:f.asset.masterPlacements.length,organs:f.asset.treeOrgans.length,triangles:f.asset.report.triangles,quality:f.asset.report.warnings};});
  const expected=await page.evaluate(async code=>{const k=await import('/branch-kernel.js'),T=await import('/vendor/three.module.min.js'),f=window.__branchForge;const a=k.buildBranchAsset(f.collectSettings(),null,f.leafSources,0,f.authoring);try{return (0,eval)('('+code+')')(a,T);}finally{k.disposeBranchAsset(a);}},fingerprintScene.toString());
  fs.writeFileSync(path.join(root,'界面逐实例指纹.json'),JSON.stringify(expected));
  for(let run=1;run<=2;run++){
   assert.equal(hash(project),expectedSource,'用户正在更新源工程，停止验收以保留新编辑');
   await page.locator('#brandExportOpen').click();await page.locator('#exportPveCompleteBtn').click();await page.waitForSelector('#projectSaveDialog[open]');await page.locator('#psSubmit').click();
   await page.waitForSelector('#pveCompleteDialog[open]');await page.waitForFunction(()=>!document.getElementById('pveClose').disabled,{},{timeout:240000});
   await page.screenshot({path:path.join(root,`界面导出${run}.png`)});
   assert.equal(await page.locator('#pveStage').textContent(),'校验完成',await page.locator('#pveDetail').textContent());
   assert.match(await page.locator('#pveDetail').textContent(),/造型质量提示/);
   const validation=JSON.parse(fs.readFileSync(path.join(output,'validation.json'))),resolved=JSON.parse(fs.readFileSync(path.join(output,'whole.resolved.json')));
   assert.ok(validation.valid);assert.ok(validation.quality_warnings.some(w=>w.includes('27.3%')));
   assert.equal(validation.sources,result.viewport.classes);assert.equal(validation.foliage_count,result.viewport.instances);
   assert.equal(resolved.summary.triangles,result.viewport.triangles);assert.equal(resolved.summary.leaves,result.viewport.leaves);assert.equal(resolved.summary.organs,result.viewport.organs);
   assert.deepEqual(fingerprintBinary(resolved,fs.readFileSync(path.join(output,'whole.resolved.bin'))),expected);
   expectedSource=hash(project);assert.equal(validation.source_sha256,expectedSource);
   result.checks.push(`第 ${run} 次实际界面导出通过，完整文件验证与逐实例三角面指纹一致，重叠提示保留`);
   result.jobs.push({log:await page.locator('#pveLog').textContent(),validation});
   await page.locator('#pveClose').click();
  }
  assert.deepEqual(result.jobs[0].validation.files['whole.resolved.bin'],result.jobs[1].validation.files['whole.resolved.bin']);
  const before=JSON.parse(fs.readFileSync(original)),after=JSON.parse(fs.readFileSync(project));
  // Saving changes save metadata/time, not the user's geometry or density.
  delete before.authoring.workbench.project_save;delete after.authoring.workbench.project_save;
  assert.deepEqual(after.authoring,before.authoring);assert.deepEqual(after.settings,before.settings);
  result.checks.push('原工程枝形、装配、密度与编辑配置未修改');assert.deepEqual(result.errors,[]);result.passed=true;
 }finally{await browser.close();fs.writeFileSync(path.join(root,'验收.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,checks:result.checks,viewport:result.viewport,errors:result.errors}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
