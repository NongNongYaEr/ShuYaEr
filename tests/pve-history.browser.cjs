const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const artifacts=path.resolve('.runtime/pve-history-acceptance');fs.mkdirSync(artifacts,{recursive:true});
 const name='验收_历史备份开关_'+crypto.randomUUID().slice(0,8),exportRoot=path.resolve('导出'),project=path.join(exportRoot,name+'.branch.json'),output=path.join(exportRoot,name+'_PVE_Complete'),history=path.join(exportRoot,'历史备份',name+'_PVE_Complete');
 const input=path.join(exportRoot,'鸡爪槭_真实样本装配整株_最终.branch.json');
 const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const originalHash=sha(input),result={name,checks:[],errors:[],jobs:[]},requests=[];
 const digest=folder=>Object.fromEntries(fs.readdirSync(folder).map(n=>[n,sha(path.join(folder,n))]));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(180000);
  page.on('pageerror',e=>result.errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/api/export-pve-complete'))requests.push(r.postDataJSON());});
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.collectSettings().object_name==='鸡爪槭_真实样本装配整株_最终'&&!window.__branchForge.workbench.busy);
  async function run(keep,label){
   await page.locator('#brandExportOpen').click();await page.locator('#exportPveCompleteBtn').click();await page.waitForSelector('#projectSaveDialog[open]');
   assert.equal(await page.locator('#psPveKeepHistory').isChecked(),false);
   if(keep)await page.locator('#psPveKeepHistory').check();
   await page.locator('#psName').fill(name);await page.screenshot({path:path.join(artifacts,label+'-选项.png')});
   await page.locator('#psSubmit').click();await page.waitForSelector('#pveCompleteDialog[open]');await page.waitForFunction(()=>!document.getElementById('pveClose').disabled,{},{timeout:180000});
   assert.equal(await page.locator('#pveStage').textContent(),'校验完成',await page.locator('#pveDetail').textContent());
   await page.screenshot({path:path.join(artifacts,label+'-结果.png')});
   const job=fs.readdirSync('.runtime/pve-export-jobs').filter(f=>f.endsWith('.json')).map(f=>({id:f,...JSON.parse(fs.readFileSync(path.join('.runtime/pve-export-jobs',f),'utf8').replace(/^\uFEFF/,''))})).filter(j=>j.name===name).sort((a,b)=>b.started.localeCompare(a.started))[0];
   assert.equal(job.state,'succeeded');assert.equal(job.keep_history,keep);assert.deepEqual(job.maintenance_warnings,[]);assert.equal(requests.at(-1).keep_history,keep);
   result.jobs.push(job);await page.locator('#pveClose').click();return job;
  }
  await run(false,'默认关闭');assert.equal(fs.existsSync(history),false);const first=digest(output),savedSource=sha(project);
  result.checks.push('默认不勾选，未生成历史备份');
  const kept=await run(true,'勾选保留');assert.equal(path.dirname(kept.previous_dir),history);assert.deepEqual(digest(kept.previous_dir),first);
  const snapshots=fs.readdirSync(history).filter(n=>n.endsWith('.branch.json'));assert.equal(snapshots.length,1);assert.equal(sha(path.join(history,snapshots[0])),savedSource);
  const before=fs.readdirSync(history).sort();result.checks.push('勾选后旧完整包及旧工程副本均收进历史备份，内容哈希一致');
  const latest=await run(false,'再次默认关闭');assert.equal(latest.previous_dir,null);assert.deepEqual(fs.readdirSync(history).sort(),before);
  assert.equal(fs.readdirSync(exportRoot).some(n=>n.startsWith('.'+name)&&n.includes('.previous-')),false);
  result.checks.push('再次打开恢复默认关闭；更新成功后无新增历史备份或外层 previous 目录，已选保留的历史仍存在');
  assert.equal(sha(input),originalHash);assert.deepEqual(result.errors,[]);result.passed=true;
 }finally{
  await browser.close();
  // Archive only this test's generated paths, never user projects/packages.
  const recordRoot=path.join(artifacts,name);fs.mkdirSync(recordRoot,{recursive:true});
  for(const from of [project,output,history]){
   assert.ok(from.startsWith(exportRoot+path.sep)&&path.basename(from).startsWith(name));
   if(fs.existsSync(from))fs.renameSync(from,path.join(recordRoot,from===history?'历史备份':path.basename(from)));
  }
  fs.writeFileSync(path.join(artifacts,'验收.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,checks:result.checks,errors:result.errors}));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
