const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const [app,url,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});const report={checks:[],errors:[],failed:[],trees:[]};let page;
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(180000);page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)report.failed.push([r.status(),r.url()]);});
  await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'),()=>page.evaluate(()=>document.querySelector('#projectSessionPanel').close()));
  const get=async route=>{const r=await page.request.get(url+route);assert.equal(r.status(),200);return r.json();};
  const library=await get('/api/project-library');assert.equal(library.items.length,4);assert.deepEqual(library.items.map(x=>x.species).sort(),['AZALEA','CAMPHOR','JASMINE','PITTOSPORUM']);
  assert.equal((await get('/api/branch-assets')).items.length,36);assert.equal((await get('/api/plant-units')).items.length,6);
  await page.goto(url);await page.waitForFunction(()=>window.__branchForge?.asset&&!document.querySelector('#brandStartup'));
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  assert.deepEqual((await page.locator('#treeSpeciesKind option').evaluateAll(xs=>xs.map(x=>x.value))).sort(),['AZALEA','CAMPHOR','JASMINE','PITTOSPORUM']);
  console.log('Catalog and startup passed');
  for(const item of library.items){
   console.log('Loading tree',item.species);
   await page.evaluate(id=>window.__branchForge.projectLibrary.open('templates',id),item.id);await page.click('#plOpen');await page.click('#projectLibraryConfirm [data-confirm-accept]');
   await page.waitForFunction(()=>!document.querySelector('#projectLibraryDialog').open&&!window.__branchForge.workbench.busy);
   const state=await page.evaluate(()=>{const f=window.__branchForge;return {name:f.collectSettings().object_name,instances:f.authoring.branch_instances.length,triangles:f.asset.report.triangles};});assert.ok(state.instances>0&&state.triangles>1000);report.trees.push(state);
  }
  report.checks.push('四类整株样板逐一实际载入成功；36 次枝 / 6 校准包；植物新建列表只显示四类树木');
  console.log('Tree reloads passed; creating bridge vine');
  await page.click('#vineWorkspaceBtn');await page.waitForFunction(()=>window.__branchForge.authoring.surface_growth?.mesh.name==='QiaoDunTest.glb'&&!window.__branchForge.workbench.busy);
  const surface=()=>page.evaluate(()=>{const f=window.__branchForge,s=f.authoring.surface_growth;return {name:s?.mesh.name,triangles:s?.mesh.index.length/3,vertices:s?.mesh.position.length/3,species:f.authoring.vine.species,leafCount:f.leafSources.length,leaves:f.asset.placements.length,blooms:f.asset.blooms.length};});
  report.defaultModel=await surface();assert.equal(report.defaultModel.triangles,416);assert.equal(report.defaultModel.species,'IVY');assert.equal(report.defaultModel.leafCount,6);
  await page.screenshot({path:path.join(out,'01_默认桥墩.png')});
  await page.evaluate(()=>document.getElementById('growthRulerStart').click());await page.waitForFunction(()=>window.__branchForge.asset.placements.length>20&&!window.__branchForge.workbench.busy);
  report.ivy=await surface();await page.screenshot({path:path.join(out,'02_桥墩常春藤实际生长.png')});report.checks.push('首次进入藤蔓自动载入原始桥墩，启用生长尺后真实常春藤成功贴面生成');
  console.log('Bridge ivy passed; saving');
  await page.click('#saveProjectBtn');await page.locator('[name="saveMode"][value="NEW"]').check();await page.fill('#psName','Lite_桥墩常春藤_重载验收');await page.click('#psSubmit');await page.waitForFunction(()=>document.querySelector('#psStatus').textContent.includes('已保存'));
  const saved=(await get('/api/project-library')).items.find(x=>x.name==='Lite_桥墩常春藤_重载验收');assert.ok(saved);report.savedId=saved.id;report.savedFile=saved.path;
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset&&!document.querySelector('#brandStartup'));await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  await page.locator('#projectInput').setInputFiles(path.join(app,saved.path));await page.waitForFunction(()=>window.__branchForge.authoring.surface_growth?.growth_ruler&&!window.__branchForge.workbench.busy&&window.__branchForge.asset.placements.length>20);
  assert.deepEqual(await surface(),report.ivy);report.checks.push('保存并重启页面重新载入，桥墩、常春藤和叶片数量一致');
  const exported=await page.evaluate(async()=>{const f=window.__branchForge,{exportGlb}=await import('/glb-export.js');const b=await exportGlb(f.asset.group);return {bytes:b.byteLength,magic:Array.from(new Uint8Array(b,0,4)),hasReference:!!f.asset.group.getObjectByName('SurfaceReferenceOnly')};});assert.deepEqual(exported.magic,[103,108,84,70]);assert.equal(exported.hasReference,false);report.glb=exported;
  await page.evaluate(()=>document.getElementById('surfaceRemove').click());await page.waitForFunction(()=>!window.__branchForge.authoring.surface_growth);await page.click('#treeWorkspaceBtn');await page.click('#vineWorkspaceBtn');assert.equal(await page.evaluate(()=>window.__branchForge.authoring.surface_growth),null);
  await page.locator('#plantKind').selectOption('BOUGAINVILLEA');await page.waitForFunction(()=>window.__branchForge.authoring.flowering.asset_preset==='BOUGAINVILLEA_V1'&&window.__branchForge.asset.blooms.length>0&&!window.__branchForge.workbench.busy);
  report.bougainvillea=await surface();assert.equal(report.bougainvillea.leafCount,5);assert.ok(report.bougainvillea.blooms>0);
  await page.evaluate(()=>document.getElementById('fitViewBtn').click());await page.screenshot({path:path.join(out,'03_三角梅实际生长.png')});report.checks.push('移除承载模型后可切换独立三角梅，五款真实叶片与花序正常生成');
  await page.evaluate(()=>document.getElementById('surfaceExample').click());await page.waitForFunction(()=>window.__branchForge.authoring.surface_growth?.mesh.name==='QiaoDunTest.glb'&&!window.__branchForge.workbench.busy);assert.equal((await surface()).species,'IVY');
  report.checks.push('普通 GLB 导出不含承载参考物；手动移除不会切换工作区后重现；载入示例按钮可恢复桥墩及常春藤');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);report.passed=true;
 }catch(e){report.failure=String(e);await page?.screenshot({path:path.join(out,'失败.png'),timeout:10000}).catch(()=>{});throw e;}
 finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})().catch(e=>{console.error(e);process.exitCode=1;});
