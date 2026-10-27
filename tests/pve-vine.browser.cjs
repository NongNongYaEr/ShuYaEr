const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {fingerprintScene,fingerprintBinary,collapseVineFingerprint}=require('./pve-geometry-audit.cjs');
(async()=>{
 const referenceOnly=process.env.BRANCHFORGE_PVE_REFERENCE_ONLY==='1';
 const output=path.resolve(referenceOnly?'.runtime/pve-vine-reference-acceptance':'.runtime/pve-vine-acceptance');fs.mkdirSync(output,{recursive:true});
 const original=path.resolve('.runtime/surface-defaults/新默认参数验收.branch.json'),name='常春藤_桥墩_PVE验收';
 const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),originalHash=digest(original);
 const project=path.resolve('导出',name+'.branch.json'),destination=path.resolve('导出',name+'_PVE_Complete');
 const previousGeometry=referenceOnly?Object.fromEntries(fs.readdirSync(destination).filter(n=>/\.(glb|bin|png)$/.test(n)).map(n=>[n,digest(path.join(destination,n))])):null;
 const result={checks:[],errors:[],jobs:[],source:original,source_sha256:originalHash};
 const closeData=(a,b)=>{
  if(typeof a==='number'&&typeof b==='number'){assert.ok(Math.abs(a-b)<=1e-12,`${a} != ${b}`);return;}
  if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.deepEqual(Object.keys(a),Object.keys(b));for(const key of Object.keys(a))closeData(a[key],b[key]);return;}
  assert.equal(a,b);
 };
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1680,height:1080},permissions:['clipboard-read','clipboard-write']});page.setDefaultTimeout(180000);
 page.on('pageerror',e=>result.errors.push(e.message));
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset?.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 const snapshot=()=>page.evaluate(async code=>{
  const f=window.__branchForge,k=await import('/branch-kernel.js'),T=await import('/vendor/three.module.min.js'),{createPVESkeleton}=await import('/pve-skeleton-export.js');
  const a=k.buildBranchAsset(f.collectSettings(),null,f.leafSources,0,f.authoring,{resolveSources:true});
  try {return {skeleton:createPVESkeleton(a,f.leafSources),fingerprints:(0,eval)('('+code+')')(a,T,true),
   triangles:a.report.triangles,leaves:a.masterPlacements.length,branches:a.masterBranches.length,organs:a.treeOrgans.length,
   supportTriangles:f.authoring.surface_growth.mesh.index.length/3};}finally{k.disposeBranchAsset(a);}
 },fingerprintScene.toString());
 const packageDigest=()=>Object.fromEntries(fs.readdirSync(destination).sort().map(file=>[file,digest(path.join(destination,file))]));
 let jobId;
 page.on('response',async r=>{if(r.url().endsWith('/api/export-pve-complete')&&r.ok())jobId=(await r.json()).job_id;});
 async function clickExport(label,succeed=true) {
  await page.locator('#brandExportOpen').click();await page.locator('#exportPveCompleteBtn').click();await page.waitForSelector('#projectSaveDialog[open]');
  assert.equal(await page.locator('#psPveKeepHistory').isChecked(),false);
  await page.locator('#psName').fill(name);await page.locator('#psSubmit').click();await page.waitForSelector('#pveCompleteDialog[open]');
  assert.equal(await page.locator('#exportPveCompleteBtn').isDisabled(),true);
  await page.screenshot({path:path.join(output,label+'-运行.png')});
  await page.waitForFunction(()=>!document.getElementById('pveClose').disabled,null,{timeout:300000});
  await page.screenshot({path:path.join(output,label+'-结果.png')});
  const stage=await page.locator('#pveStage').textContent(),detail=await page.locator('#pveDetail').textContent();
  result.checks.push({label,stage,detail});
  if(succeed) {assert.equal(stage,'校验完成',detail);assert.match(await page.locator('#pveSummary').textContent(),/类完整藤蔓.*装配实例.*段藤干.*片叶/);}
  else assert.match(stage,/导出失败.*发布完整包/,detail);
  const job=await (await page.request.get(process.argv[2]+'api/export-pve-status?id='+jobId)).json();result.jobs.push(job);return job;
 }
 function compare(expected,job) {
  const s=JSON.parse(fs.readFileSync(path.join(destination,'whole.pve-skeleton.json'))),r=JSON.parse(fs.readFileSync(path.join(destination,'whole.resolved.json')));
  // JS engine Math.pow can differ in the last double bit; GPU float32 geometry
  // below still has to match bit for bit, across every triangle.
  const d=JSON.parse(fs.readFileSync(path.join(destination,'complete_units.manifest.json'))).vine_detail.data;
  assert.equal(fs.existsSync(path.join(destination,'whole.vine-detail.json')),false);
  assert.equal(job.validation.files['whole.vine-detail.json'],undefined);
  closeData(d.branches,expected.skeleton.branches);closeData(d.foliage,expected.skeleton.foliage);assert.deepEqual(d.foliage_sources,expected.skeleton.foliage_sources);
  assert.equal(s.foliage.length,1);assert.equal(s.complete_unit_assembly.leaf_instances,0);assert.equal(s.complete_unit_assembly.organ_instances,0);
  assert.equal(s.complete_unit_assembly.baked_unit_leaves,expected.leaves);assert.match(s.foliage[0].id,/^UNIT_/);
  assert.equal(r.summary.triangles,expected.triangles);assert.equal(r.summary.leaves,expected.leaves);assert.equal(r.summary.organs,expected.organs);
  assert.deepEqual(fingerprintBinary(r,fs.readFileSync(path.join(destination,'whole.resolved.bin'))),collapseVineFingerprint(expected.fingerprints,s.branches[0].id,s.foliage[0].id));
  assert.equal(job.validation.source_sha256,digest(project));assert.equal(job.validation.support_mesh_exported,false);
  result.checks.push({exact:true,branches:expected.branches,leaves:expected.leaves,triangles:expected.triangles,supportTrianglesExcluded:expected.supportTriangles});
 }
 try {
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.locator('#projectInput').setInputFiles(original);await page.waitForFunction(()=>window.__branchForge.authoring.surface_growth?.growth_ruler);await wait();
  await page.locator('#fitViewBtn').click();await page.screenshot({path:path.join(output,'当前藤蔓.png')});
  const baseline=await snapshot();fs.writeFileSync(path.join(output,'界面几何指纹.json'),JSON.stringify(baseline));
  const first=await clickExport('首次导出');compare(baseline,first);await page.locator('#pveCopy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),path.join(destination,'whole.pve-skeleton.json'));
  await page.locator('#pveClose').click();
  if(referenceOnly){
   for(const [file,hash] of Object.entries(previousGeometry))assert.equal(digest(path.join(destination,file)),hash);
   assert.equal(digest(original),originalHash);assert.deepEqual(result.errors,[]);
   result.checks.push('重新点击界面导出；GLB、BIN、图集与修正前逐字节相同；不再生成或引用额外明细文件');
   result.passed=true;result.output=destination;return;
  }
  const second=await clickExport('再次导出');compare(baseline,second);assert.equal(second.previous_dir,null);
  for(const file of Object.keys(second.validation.files).filter(n=>!n.endsWith('.json')))assert.deepEqual(second.validation.files[file],first.validation.files[file]);
  const prior=packageDigest();await page.locator('#pveClose').click();
  // Exercise actual GUI edits and publication failure with an OS file lock.
  if(await page.locator('#surfaceGrowthPanel .parameter-group-toggle').getAttribute('aria-expanded')==='false')await page.locator('#surfaceGrowthPanel .parameter-group-toggle').click();
  for(const d of await page.locator('#surfaceLeafSize').locator('xpath=ancestor::details').all())if(await d.getAttribute('open')===null)await d.locator(':scope > summary').click();
  await page.locator('#surfaceLeafSize').fill('19');await page.locator('#surfaceLeafSize').press('Tab');await wait();const edited=await snapshot();
  const {spawn}=require('node:child_process'),locked=path.join(destination,'leaf_atlas_color.png').replaceAll("'","''");
  const locker=spawn('powershell.exe',['-NoProfile','-Command',`$f=[IO.File]::Open('${locked}',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);[Console]::WriteLine('LOCKED');[Console]::ReadLine()|Out-Null;$f.Dispose()`],{windowsHide:true});
  await new Promise((resolve,reject)=>{locker.stdout.on('data',d=>{if(d.toString().includes('LOCKED'))resolve();});locker.on('error',reject);locker.on('exit',c=>{if(c)reject(Error('lock helper '+c));});});
  try {await clickExport('占用失败',false);assert.deepEqual(packageDigest(),prior);result.checks.push('发布失败后旧包每个文件哈希完全不变');}
  finally {const exit=new Promise(resolve=>locker.on('exit',resolve));locker.stdin.end('\n');await exit;}
  await page.locator('#pveRetry').click();await page.waitForSelector('#projectSaveDialog[open]');await page.locator('#psSubmit').click();await page.waitForSelector('#pveCompleteDialog[open]');await page.waitForFunction(()=>!document.getElementById('pveClose').disabled,null,{timeout:300000});
  assert.equal(await page.locator('#pveStage').textContent(),'校验完成',await page.locator('#pveDetail').textContent());
  const updated=await(await page.request.get(process.argv[2]+'api/export-pve-status?id='+jobId)).json();result.jobs.push(updated);compare(edited,updated);assert.notEqual(updated.validation.files['whole.resolved.bin'].sha256,second.validation.files['whole.resolved.bin'].sha256);
  await page.screenshot({path:path.join(output,'修改后重试成功.png')});await page.locator('#pveClose').click();
  // Reload saved output, then restore baseline in the test-only delivery.
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(project);await page.waitForFunction(()=>window.__branchForge.authoring.vine?.leaf_size===.19);await wait();assert.deepEqual((await snapshot()).fingerprints,edited.fingerprints);
  await page.locator('#projectInput').setInputFiles(original);await page.waitForFunction(()=>window.__branchForge.authoring.vine?.leaf_size===.17);await wait();
  const final=await clickExport('恢复默认参数最终导出');compare(baseline,final);assert.equal(final.validation.files['whole.resolved.bin'].sha256,first.validation.files['whole.resolved.bin'].sha256);
  assert.equal(digest(original),originalHash);assert.deepEqual(result.errors,[]);result.passed=true;result.output=destination;
 } finally {await browser.close();fs.writeFileSync(path.join(output,'验收记录.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,checks:result.checks,errors:result.errors}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
