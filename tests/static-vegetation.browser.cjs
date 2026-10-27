const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {fingerprintScene}=require('./pve-geometry-audit.cjs');
(async()=>{
 const output=path.resolve('.runtime/static-vegetation-acceptance');fs.mkdirSync(output,{recursive:true});
 const original=path.resolve('导出/常春藤_桥墩_PVE验收.branch.json'),name='常春藤_桥墩_静态植被验收';
 const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),originalHash=digest(original);
 const project=path.resolve('导出',name+'.branch.json'),destination=path.resolve('导出',name+'_UE_Static');
 const result={checks:[],errors:[],jobs:[],source:original,source_sha256:originalHash};
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1760,height:1080},permissions:['clipboard-read','clipboard-write']});page.setDefaultTimeout(180000);
 page.on('pageerror',e=>result.errors.push(e.message));
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset?.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 const snapshot=()=>page.evaluate(async code=>{
  const f=window.__branchForge,k=await import('/branch-kernel.js'),T=await import('/vendor/three.module.min.js');
  const a=k.buildBranchAsset(f.collectSettings(),null,f.leafSources,0,f.authoring,{resolveSources:true});
  try{return {fingerprints:(0,eval)('('+code+')')(a,T,true),triangles:a.report.triangles,leaves:a.masterPlacements.length,branches:a.masterBranches.length,supportTriangles:f.authoring.surface_growth.mesh.index.length/3};}finally{k.disposeBranchAsset(a);}
 },fingerprintScene.toString());
 const packageDigest=()=>Object.fromEntries(fs.readdirSync(destination).sort().map(file=>[file,digest(path.join(destination,file))]));
 let jobId;
 page.on('response',async r=>{if(r.url().endsWith('/api/export-static-vegetation')&&r.ok())jobId=(await r.json()).job_id;});
 async function finish(label,succeed=true){
  await page.waitForSelector('#staticVegetationDialog[open]');assert.equal(await page.locator('#exportStaticVegetationBtn').isDisabled(),true);
  await page.screenshot({path:path.join(output,label+'-运行.png')});
  await page.waitForFunction(()=>!document.getElementById('svClose').disabled,null,{timeout:300000});
  await page.screenshot({path:path.join(output,label+'-结果.png')});
  const stage=await page.locator('#svStage').textContent(),detail=await page.locator('#svDetail').textContent();result.checks.push({label,stage,detail});
  assert.equal(stage,succeed?'校验完成':'导出失败 · 发布完整包',detail);
  if(succeed)assert.match(detail,/待 UE 导入验证/);
  const job=await(await page.request.get(process.argv[2]+'api/export-pve-status?id='+jobId)).json();result.jobs.push(job);return job;
 }
 async function clickExport(label,succeed=true,interruptStatus=false){
  if(interruptStatus)await page.route('**/api/export-pve-status?*',route=>route.abort());
  await page.locator('#brandExportOpen').click();await page.locator('#exportStaticVegetationBtn').click();await page.waitForSelector('#projectSaveDialog[open]');
  assert.equal(await page.locator('#psPveKeepHistory').isChecked(),false);assert.match(await page.locator('#psDestination').textContent(),/_UE_Static/);
  await page.locator('#psName').fill(name);await page.locator('#psSubmit').click();
  if(interruptStatus){
   await page.waitForSelector('#staticVegetationDialog[open]');
   await page.waitForFunction(()=>!document.getElementById('svClose').disabled);
   assert.match(await page.locator('#svDetail').textContent(),/无法读取状态/);
   assert.equal(await page.locator('#svRetry').textContent(),'恢复查询运行状态');
   const pending=jobId;await page.unroute('**/api/export-pve-status?*');
   await page.locator('#svRetry').click();await page.waitForFunction(()=>!document.getElementById('svClose').disabled);
   assert.equal(jobId,pending);assert.equal(await page.locator('#psSubmit').isVisible(),false);
   assert.equal(await page.locator('#svStage').textContent(),'校验完成');
   result.checks.push('状态查询中断后恢复同一任务，没有重复保存或启动导出');
   await page.screenshot({path:path.join(output,label+'-结果.png')});
   const job=await(await page.request.get(process.argv[2]+'api/export-pve-status?id='+jobId)).json();result.jobs.push(job);return job;
  }
  return finish(label,succeed);
 }
 const check=(expected,job)=>{
  assert.equal(job.validation.valid,true);assert.equal(job.validation.ue_import_verified,false);
  assert.equal(job.triangles,expected.triangles);assert.equal(job.leaves,expected.leaves);assert.equal(job.branches,expected.branches);
  assert.equal(job.validation.source_sha256,digest(project));assert.equal(job.entry_path,path.join(destination,'vegetation.usda'));
  assert.equal(job.prototypes,6);assert.equal(job.shared_leaves,expected.leaves);assert.ok(job.stored_triangles<job.triangles);
 };
 try{
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.locator('#projectInput').setInputFiles(original);await page.waitForFunction(()=>window.__branchForge.authoring.surface_growth?.growth_ruler);await wait();
  await page.locator('#fitViewBtn').click();await page.screenshot({path:path.join(output,'界面-当前藤蔓.png')});
  const expected=await snapshot();fs.writeFileSync(path.join(output,'界面几何指纹.json'),JSON.stringify(expected));
  const first=await clickExport('首次导出',true,true);check(expected,first);
  await page.locator('#svCopy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),path.join(destination,'vegetation.usda'));await page.locator('#svClose').click();
  const second=await clickExport('再次导出');check(expected,second);assert.equal(second.previous_dir,null);assert.equal(second.validation.files['vegetation.usda'].sha256,first.validation.files['vegetation.usda'].sha256);
  await page.locator('#svClose').click();const prior=packageDigest();
  if(await page.locator('#surfaceGrowthPanel .parameter-group-toggle').getAttribute('aria-expanded')==='false')await page.locator('#surfaceGrowthPanel .parameter-group-toggle').click();
  for(const d of await page.locator('#surfaceLeafSize').locator('xpath=ancestor::details').all())if(await d.getAttribute('open')===null)await d.locator(':scope > summary').click();
  await page.locator('#surfaceLeafSize').fill('19');await page.locator('#surfaceLeafSize').press('Tab');await wait();const edited=await snapshot();
  const {spawn}=require('node:child_process'),locked=path.join(destination,'vegetation.usda').replaceAll("'","''");
  const locker=spawn('powershell.exe',['-NoProfile','-Command',`$f=[IO.File]::Open('${locked}',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);[Console]::WriteLine('LOCKED');[Console]::ReadLine()|Out-Null;$f.Dispose()`],{windowsHide:true});
  await new Promise((resolve,reject)=>{locker.stdout.on('data',d=>{if(d.toString().includes('LOCKED'))resolve();});locker.on('error',reject);});
  try{await clickExport('文件占用失败',false);assert.deepEqual(packageDigest(),prior);result.checks.push('发布失败后旧包所有文件哈希不变');}
  finally{const exit=new Promise(resolve=>locker.on('exit',resolve));locker.stdin.end('\n');await exit;}
  await page.locator('#svRetry').click();await page.waitForSelector('#projectSaveDialog[open]');await page.locator('#psSubmit').click();
  const retry=await finish('修改后重试');check(edited,retry);assert.notEqual(retry.validation.files['vegetation.usda'].sha256,first.validation.files['vegetation.usda'].sha256);await page.locator('#svClose').click();
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(project);await page.waitForFunction(()=>window.__branchForge.authoring.vine?.leaf_size===.19);await wait();assert.deepEqual((await snapshot()).fingerprints,edited.fingerprints);result.checks.push('重新加载保存的 19 cm 叶片工程，全部三角面指纹相同');
  await page.locator('#projectInput').setInputFiles(original);await page.waitForFunction(()=>window.__branchForge.authoring.vine?.leaf_size===.17);await wait();
  const final=await clickExport('最终默认参数导出');check(expected,final);assert.equal(final.validation.files['vegetation.usda'].sha256,first.validation.files['vegetation.usda'].sha256);
  assert.equal(digest(original),originalHash);assert.deepEqual(result.errors,[]);result.passed=true;result.output=destination;
 }finally{await browser.close();fs.writeFileSync(path.join(output,'验收记录.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,checks:result.checks,errors:result.errors,output:destination}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
