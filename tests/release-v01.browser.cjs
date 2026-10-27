const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const [app,origin,output]=process.argv.slice(2);if(!app||!origin||!output)throw Error('app origin output required');fs.mkdirSync(output,{recursive:true});
 const report={checks:[],pageErrors:[],failedLocalRequests:[]};let page;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(180000);
  page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)report.failedLocalRequests.push([r.status(),r.url()]);});
  const get=async route=>{const r=await page.request.get(origin+route);assert.equal(r.status(),200,route);return r.json();};
  const projects=await get('/api/project-library'),branches=await get('/api/branch-assets'),units=await get('/api/plant-units');
  assert.equal(projects.items.length,28);assert.ok(projects.items.every(i=>!i.userSaved&&i.batch==='ALL_PLANT_SAMPLE_V2'));
  assert.equal(branches.items.length,164);assert.equal(units.items.length,28);
  for(const p of projects.items){const r=await page.request.get(origin+'/api/project-preview?id='+p.id);assert.equal(r.status(),200);assert.ok((await r.body()).length>1000);}
  report.checks.push('164 次枝 / 28 正式样板 / 28 校准单元；28 张样板预览均可独立读取，无个人样板');
  await page.goto(origin);await page.waitForFunction(()=>window.__branchForge?.asset&&!document.querySelector('#brandStartup'));
  assert.match(await page.locator('.brand-copy small').textContent(),/V0.1/);await page.screenshot({path:path.join(output,'01_首次启动.png')});
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  const camphor=projects.items.find(x=>x.species==='CAMPHOR');assert.ok(camphor);
  await page.evaluate(id=>window.__branchForge.projectLibrary.open('templates',id),camphor.id);
  assert.equal(await page.locator('#plGrid .pl-card').count(),28);
  await page.screenshot({path:path.join(output,'02_正式样板库.png')});
  await page.click('#plOpen');await page.locator('#projectLibraryConfirm button').filter({hasText:'创建副本'}).click();
  await page.waitForFunction(()=>!document.querySelector('#projectLibraryDialog').open&&!window.__branchForge.workbench.busy&&window.__branchForge.authoring.branch_instances.length>100);
  const state=()=>page.evaluate(()=>{const f=window.__branchForge;return {name:f.collectSettings().object_name,instances:f.authoring.branch_instances.length,classes:f.authoring.branch_library.length,branches:f.asset.masterBranches?.length,leaves:f.asset.masterPlacements?.length,triangles:f.asset.report.triangles};});
  report.camphor=await state();assert.ok(report.camphor.triangles>10000);report.checks.push('从正式样板卡片实际载入香樟，网格与次枝装配生成成功');
  await page.screenshot({path:path.join(output,'03_香樟实际载入.png')});
  // Exercise the real save dialog, using a new file in this release's generated output.
  await page.click('#saveProjectBtn');await page.waitForSelector('#projectSaveDialog[open]');
  await page.locator('input[name="saveMode"][value="NEW"]').check();
  await page.fill('#psName','V01_发布验收_香樟');
  await page.locator('#psSubmit').click();
  await page.waitForFunction(()=>document.querySelector('#psStatus')?.textContent.includes('已保存'),null,{timeout:180000});
  report.checks.push('发布目录下通过保存面板另存工程成功');
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  const saved=(await get('/api/project-library')).items.find(x=>x.userSaved&&x.name==='V01_发布验收_香樟');assert.ok(saved);
  report.savedFile=saved.path;report.savedId=saved.id;
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset&&!document.querySelector('#brandStartup'));
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  await page.locator('#projectInput').setInputFiles(path.join(app,saved.path));
  await page.waitForFunction(()=>!window.__branchForge.workbench.busy&&window.__branchForge.authoring.branch_instances.length>100);
  assert.deepEqual(await state(),{...report.camphor,name:'V01_发布验收_香樟'});report.checks.push('页面重启后重新读取刚保存的工程，树名、枝数、装配数和三角面数量一致');
  // Export genuine geometry through the bundled browser GLB exporter.
  const glb=await page.evaluate(async()=>{const f=window.__branchForge,{exportGlb}=await import('/glb-export.js');const result=await exportGlb(f.asset.group);return {type:typeof result,bytes:result.byteLength,magic:Array.from(new Uint8Array(result,0,4))};});
  report.glb=glb;assert.ok(glb.bytes>10000);assert.deepEqual(glb.magic,[103,108,84,70]);report.checks.push('实际香樟网格生成有效 GLB 二进制');
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.failedLocalRequests,[]);report.passed=true;
 }catch(e){report.failure=String(e);await page?.screenshot({path:path.join(output,'失败现场.png'),timeout:10000}).catch(()=>{});throw e;}
 finally{await browser.close();fs.writeFileSync(path.join(output,'验收.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})().catch(e=>{console.error(e);process.exitCode=1;});
