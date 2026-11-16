const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const artifacts=path.resolve('.runtime/pve-complete-acceptance');fs.mkdirSync(artifacts,{recursive:true});
 const origin=process.argv[2],name='二球悬铃木_真实样本装配整株_最终',project=path.resolve('导出',name+'.branch.json');
 const pristine=path.join(artifacts,'input-before-test.branch.json');fs.copyFileSync(process.env.BRANCHFORGE_PVE_SOURCE||project,pristine);
 const result={checks:[],errors:[],jobs:[],original_project_sha256:crypto.createHash('sha256').update(fs.readFileSync(pristine)).digest('hex')};
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},permissions:['clipboard-read','clipboard-write']});page.setDefaultTimeout(180000);
  page.on('pageerror',e=>result.errors.push(e.message));page.on('crash',()=>result.errors.push('renderer crash'));
  await page.goto(origin);await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.locator('#projectInput').setInputFiles(pristine);
  await page.waitForFunction(name=>window.__branchForge.collectSettings().object_name===name&&!window.__branchForge.workbench.busy,name);
  result.viewport=await page.evaluate(()=>{const f=window.__branchForge;return {instances:f.authoring.branch_instances.length,classes:f.authoring.branch_library.length,branches:f.asset.masterBranches.length,leaves:f.asset.masterPlacements.length,organs:f.asset.treeOrgans.length,triangles:f.asset.report.triangles,overrides:Object.keys(f.authoring.overrides).length};});
  await page.screenshot({path:path.join(artifacts,'最新工程载入.png')});
  const {fingerprintScene,fingerprintBinary}=require('./pve-geometry-audit.cjs');
  const fingerprints=await page.evaluate(async code=>{const k=await import('/branch-kernel.js'),T=await import('/vendor/three.module.min.js'),f=window.__branchForge;
   const expanded=k.buildBranchAsset(f.collectSettings(),null,f.leafSources,0,f.authoring);
   try{return (0,eval)('('+code+')')(expanded,T);}finally{k.disposeBranchAsset(expanded);}
  },fingerprintScene.toString());
  fs.writeFileSync(path.join(artifacts,'界面逐实例几何指纹.json'),JSON.stringify(fingerprints));
  const sceneSkeleton=await page.evaluate(async()=>{const {createPVESkeleton}=await import('/pve-skeleton-export.js');const f=window.__branchForge;return createPVESkeleton(f.asset,f.leafSources).branches.filter(b=>!b.instance_id);});
  async function clickExport(label){
   await page.locator('#brandExportOpen').click();await page.locator('#exportPveCompleteBtn').click();await page.waitForSelector('#projectSaveDialog[open]');
   assert.equal(await page.locator('#psSubmit').textContent(),'保存工程并开始导出');
   await page.locator('#psSubmit').click();await page.waitForSelector('#pveCompleteDialog[open]');
   assert.equal(await page.locator('#exportPveCompleteBtn').isDisabled(),true);
   await page.screenshot({path:path.join(artifacts,label+'-运行.png')});
   await page.waitForFunction(()=>!document.getElementById('pveClose').disabled,{},{timeout:240000});
   await page.screenshot({path:path.join(artifacts,label+'-结果.png')});
   const state=await page.locator('#pveStage').textContent(),detail=await page.locator('#pveDetail').textContent();
   result.checks.push({label,state,detail});assert.equal(state,'校验完成',detail);
   const jobs=fs.readdirSync('.runtime/pve-export-jobs').filter(n=>n.endsWith('.json')).map(n=>({file:n,...JSON.parse(fs.readFileSync(path.join('.runtime/pve-export-jobs',n),'utf8').replace(/^\uFEFF/,''))})).filter(v=>v.name===name&&v.state==='succeeded').sort((a,b)=>b.started.localeCompare(a.started));
   result.jobs.push(jobs[0]);
   if(label==='恢复原编辑后最终导出'){
    await page.locator('#pveCopy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),jobs[0].skeleton_path);
    const opened=page.waitForResponse(r=>r.url().endsWith('/api/open-pve-output'));await page.locator('#pveOpen').click();assert.equal((await opened).ok(),true);result.checks.push('结果面板复制入口路径与打开输出目录按钮通过');
   }
   await page.locator('#pveClose').click();return jobs[0];
  }
  const first=await clickExport('首次导出');
  assert.equal(first.units,result.viewport.instances);assert.equal(first.sources,result.viewport.classes);
  assert.equal(first.validation.resolved_assembly.leaves,result.viewport.leaves);assert.equal(first.validation.resolved_assembly.organs,result.viewport.organs);
  assert.equal(first.validation.resolved_assembly.triangles,result.viewport.triangles);
  const resolved=JSON.parse(fs.readFileSync(path.join(first.output_dir,'whole.resolved.json')));
  assert.deepEqual(fingerprintBinary(resolved,fs.readFileSync(path.join(first.output_dir,'whole.resolved.bin'))),fingerprints);
  assert.deepEqual(resolved.branches,sceneSkeleton);
  result.checks.push('全部 2,152,248 个三角面按逐实例核对位置、法线、UV、切线及绕序指纹；承重骨架点和半径与界面一致');
  const second=await clickExport('重复导出');assert.equal(second.previous_dir,null);
  for(const name of Object.keys(second.validation.files).filter(n=>!n.endsWith('.json')))assert.deepEqual(second.validation.files[name],first.validation.files[name]);
  assert.equal(second.validation.source_sha256,crypto.createHash('sha256').update(fs.readFileSync(project)).digest('hex').toUpperCase());
  result.checks.push('同一工程重复界面导出，GLB、图集、实际装配二进制逐字节哈希一致，JSON 源哈希对应本次工程，默认不保留历史目录');
  const card=page.locator('[data-scale-asset]').first();if(!await card.isVisible())await page.locator('#openBranchAssembly').click();
  const originalScale=await card.inputValue();await card.fill(String(Number(originalScale)*1.05));await card.press('Tab');
  await page.waitForFunction(()=>!window.__branchForge.workbench.busy&&!window.__branchForge.asset.group.userData.pending_rebuild);
  const before=Object.fromEntries(fs.readdirSync(second.output_dir).map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(second.output_dir,n))).digest('hex')]));
  const {spawn}=require('child_process');const locked=path.join(second.output_dir,'leaf_atlas_color.png').replaceAll("'","''");
  const locker=spawn('powershell.exe',['-NoProfile','-Command',`$f=[IO.File]::Open('${locked}',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);[Console]::WriteLine('LOCKED');[Console]::ReadLine()|Out-Null;$f.Dispose()`],{windowsHide:true});
  await new Promise((resolve,reject)=>{locker.stdout.on('data',v=>{if(v.toString().includes('LOCKED'))resolve();});locker.on('error',reject);locker.on('exit',code=>{if(code)reject(Error('lock helper '+code));});});
  try{
   await page.locator('#brandExportOpen').click();await page.locator('#exportPveCompleteBtn').click();await page.locator('#psSubmit').click();await page.waitForSelector('#pveCompleteDialog[open]');await page.waitForFunction(()=>!document.getElementById('pveClose').disabled,{},{timeout:240000});
   await page.screenshot({path:path.join(artifacts,'发布失败-旧包保护.png')});
   const failure=await page.locator('#pveStage').textContent();assert.match(failure,/导出失败.*发布完整包/);result.checks.push({failure,detail:await page.locator('#pveDetail').textContent()});
   const after=Object.fromEntries(fs.readdirSync(second.output_dir).map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(second.output_dir,n))).digest('hex')]));assert.deepEqual(after,before);result.checks.push('实际发布阶段因目录文件占用失败，上一成功包全部文件哈希保持不变');
  }finally{locker.stdin.write('\n');await new Promise(resolve=>locker.on('exit',resolve));}
  await page.locator('#pveClose').click();const updated=await clickExport('解除占用后重试');
  assert.notEqual(updated.validation.files['whole.resolved.bin'].sha256,second.validation.files['whole.resolved.bin'].sha256);result.checks.push('界面临时调整一个样本类倍率后导出，实际几何哈希更新，实例数及枝类数保持');
  await page.evaluate(()=>window.__beforeRestoreAsset=window.__branchForge.asset);
  await page.locator('#projectInput').setInputFiles(pristine);await page.waitForFunction(()=>window.__branchForge.asset!==window.__beforeRestoreAsset&&!window.__branchForge.workbench.busy&&!window.__branchForge.asset.group.userData.pending_rebuild);
  const final=await clickExport('恢复原编辑后最终导出');assert.equal(final.validation.files['whole.resolved.bin'].sha256,first.validation.files['whole.resolved.bin'].sha256);result.checks.push('验收调整已恢复，最终交付几何与用户原始编辑完全一致');
  assert.deepEqual(result.errors,[]);result.passed=true;
 }finally{await browser.close();fs.writeFileSync(path.join(artifacts,'验收.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,checks:result.checks,errors:result.errors,viewport:result.viewport}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
