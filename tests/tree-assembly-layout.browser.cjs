const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve('.runtime/tree-assembly-layout');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const report={checks:[],errors:[]};
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(120000);
  page.on('pageerror',e=>report.errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.getElementById('busyOverlay').hidden});
  const stamp=()=>page.evaluate(()=>{const f=window.__branchForge;return JSON.stringify({authoring:f.authoring,settings:f.collectSettings(),history:f.historyState,geometry:f.asset.masterBranches.map(b=>b.points.map(p=>p.toArray()))});});
  const checkCounts=async()=>{
   const data=await page.evaluate(()=>({total:window.__branchForge.authoring.branch_instances.length,text:document.getElementById('treeAssemblyTotal').textContent,zones:[...document.querySelectorAll('#wbAssemblyZones [data-assembly-role]')].map(el=>({role:el.dataset.assemblyRole,count:Number(el.dataset.count),actual:window.__branchForge.authoring.branch_instances.filter(i=>i.linked&&i.shootRole===el.dataset.assemblyRole).length}))}));
   assert.equal(data.text,`${data.total} 枝`);assert.equal(data.zones.length,3);data.zones.forEach(z=>assert.equal(z.count,z.actual));
  };
  await page.goto(process.argv[2]);await ready();await checkCounts();
  assert.equal(await page.locator('#treeAssemblyTotal').textContent(),'0 枝');
  const metas=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,'')));
  const meta=metas.find(m=>m.species==='JASMINE');assert(meta);
  await page.evaluate(async id=>{const {migrateProjectDocument}=await import('/authoring-state.js');const doc=await(await fetch('/api/project-document?id='+encodeURIComponent(id))).json();await window.__branchForge.workbench.load(migrateProjectDocument(doc));},meta.id);await ready();
  await checkCounts();const baseline=await stamp();
  assert.equal(await page.locator('#wbAssemblyZones').evaluate(el=>el.closest('.wb-assembly').inert),false,'loaded project unlocks the actual assembly controls');
  assert.equal(await page.locator('#branchWorkbenchPanel').evaluate(el=>el.closest('[data-page]').dataset.page),'assembly');
  assert.equal(await page.locator('#skeletonThicknessPanel').evaluate(el=>el.closest('[data-page]').dataset.page),'structure');
  assert.equal(await page.locator('.inspector-scroll').evaluate(el=>el.firstElementChild.id),'treeAssemblyOverview');
  assert.equal(await page.locator('[data-page="assembly"] #wbAssemblyZones').count(),0);
  assert.equal(await page.locator('#treeAssemblyOverview #wbAssemblyZones').count(),1);
  for(const role of ['MATURE','MIXED','YOUNG'])assert(await page.locator(`#treeAssemblyOverview [data-assembly-role="${role}"] .wb-assembly-card`).count()>0);
  await page.click('[data-tab="structure"]');await page.click('#treeAssemblyChoose');
  await page.waitForFunction(()=>document.querySelector('[data-tab="assembly"]').classList.contains('active'));
  await page.click('[data-tab="assembly"]');await page.evaluate(()=>document.querySelector('.parameter-scroll').scrollTop=0);
  await page.screenshot({path:path.join(out,'独立次枝页与当前装配.png')});
  await page.click('#assetTab');assert(await page.locator('#treeAssemblyOverview').isVisible());await page.click('#contextTab');
  await page.click('#browseBranchCatalog');await page.waitForSelector('.blm-card');await page.waitForFunction(()=>!document.getElementById('branchLibraryDialog').hasAttribute('aria-busy'));await page.click('#blmClose');
  assert.equal(await stamp(),baseline);report.checks.push('真实茉莉整株重载；三分区的实际卡片与控件只在右侧，左侧仅素材；浏览与导航不改工程、几何和历史');
  const added=await page.evaluate(()=>window.__branchForge.authoring.workbench.assembly_slots.YOUNG[0]);
  const zone=page.locator('[data-assembly-role="MATURE"]');
  const source=page.locator(`#wbAssetLibrary [data-asset="${added}"]`);
  const instanceSnapshot=()=>page.evaluate(()=>JSON.stringify(window.__branchForge.authoring.branch_instances));
  const beforeDrop=await instanceSnapshot();
  await source.dragTo(zone,{targetPosition:{x:18,y:14}});await ready();
  await page.waitForFunction(id=>window.__branchForge.authoring.workbench.assembly_slots.MATURE.includes(id),added);
  assert(await page.locator(`[data-assembly-role="MATURE"] [data-assembly-asset="${added}"]`).isVisible());
  assert(await page.evaluate(id=>window.__branchForge.asset.authoring.branch_instances.some(i=>i.shootRole==='MATURE'&&i.asset_id===id),added));
  const afterDrop=await instanceSnapshot();assert.notEqual(afterDrop,beforeDrop);await checkCounts();
  await page.click('#undoBtn');await ready();assert.equal(await instanceSnapshot(),beforeDrop);
  await page.click('#redoBtn');await ready();assert.equal(await instanceSnapshot(),afterDrop);
  const duplicate=await stamp();await source.dragTo(zone,{targetPosition:{x:18,y:14}});await ready();assert.equal(await stamp(),duplicate);
  await page.click(`[data-assembly-role="MATURE"] [data-remove-assembly="${added}"]`);await ready();
  assert.equal(await page.locator(`[data-assembly-role="MATURE"] [data-assembly-asset="${added}"]`).count(),0);
  assert(!await page.evaluate(id=>window.__branchForge.asset.authoring.branch_instances.some(i=>i.shootRole==='MATURE'&&i.asset_id===id),added));
  await page.click('#undoBtn');await ready();assert.equal(await instanceSnapshot(),afterDrop);
  await page.click('#undoBtn');await ready();assert.equal(await instanceSnapshot(),beforeDrop);
  await source.click();await page.locator('[data-assembly-role="MATURE"] .wb-assembly-drop').focus();await page.keyboard.press('Enter');await ready();
  assert.equal(await instanceSnapshot(),afterDrop);await page.click('#undoBtn');await ready();
  for(const role of ['MIXED','YOUNG']){
   const assetId=await page.evaluate(()=>window.__branchForge.authoring.workbench.assembly_slots.MATURE[0]);
   await page.locator(`#wbAssetLibrary [data-asset="${assetId}"]`).dragTo(page.locator(`[data-assembly-role="${role}"]`),{targetPosition:{x:18,y:14}});await ready();
   assert(await page.evaluate(({role,assetId})=>window.__branchForge.asset.authoring.branch_instances.some(i=>i.shootRole===role&&i.asset_id===assetId),{role,assetId}));
   await page.click('#undoBtn');await ready();assert.equal(await instanceSnapshot(),beforeDrop);
  }
  report.checks.push('真实跨栏拖放到三类分区标题均更新模型（含滚动到末端区）；逐卡移除实时生效；重复拖入不增加历史；撤销重做及键盘添加均通过');
  for(const viewport of [{width:1366,height:900},{width:1600,height:1000}]){
   await page.setViewportSize(viewport);await page.click('[data-tab="structure"]');
   assert(await page.locator('.parameter-tabs').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   assert(await page.locator('#treeAssemblyOverview').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  }
  await page.click('#skeletonEditModeBtn');await ready();assert((await page.locator('#treeAssemblyStatus').textContent()).includes('暂停'));await checkCounts();
  await page.click('#skeletonEditModeBtn');await ready();
  for(const mode of ['BRANCH','VINE']){
   await page.click(mode==='BRANCH'?'#branchWorkspaceBtn':'#vineWorkspaceBtn');await ready();
   assert(!await page.locator('[data-tab="assembly"]').isVisible());assert(!await page.locator('#treeAssemblyOverview').isVisible());
   if(mode==='BRANCH'){await page.click('#branchWorkflowASSETS');assert(await page.locator('#wbAssetLibrary').isVisible());}
   await page.click('#treeWorkspaceBtn');await ready();await checkCounts();
   await page.click('#openBranchAssembly');assert(await page.locator('#wbAssetLibrary').isVisible());
  }
  report.checks.push('窄窗口无横向溢出；骨架编辑暂停提示与数量保留；枝条/藤蔓工作区切换及恢复正常');
  await page.click('#openBranchAssembly');
  const beforeUse=await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring.branch_instances));
  await page.click('#browseBranchCatalog');await page.waitForSelector('.blm-card');
  await page.fill('#blmSearch','香樟');await page.waitForSelector('.blm-card');
  const chosen=await page.locator('.blm-card').first().getAttribute('data-id');await page.locator('.blm-card').first().click();
  const beforeLibrary=await page.evaluate(()=>window.__branchForge.workbench.library.map(a=>a.id));
  const beforeGeometry=await page.evaluate(()=>JSON.stringify(window.__branchForge.asset.masterBranches.map(b=>b.points.map(p=>p.toArray()))));
  assert(!await page.locator('#branchLibraryDialog').evaluate(el=>el.matches(':modal')));
  const targetBox=await page.locator('#wbAssetLibrary').boundingBox(),pickerBox=await page.locator('#branchLibraryDialog').boundingBox();
  assert(pickerBox.x>targetBox.x+targetBox.width,'picker leaves project list exposed');
  await page.locator('.blm-card').first().dragTo(page.locator('#wbAssetLibrary'),{targetPosition:{x:25,y:20}});
  await page.waitForFunction(id=>window.__branchForge.workbench.library.some(a=>a.id===id),chosen);await ready();
  assert(await page.locator('#branchLibraryDialog').isVisible());
  assert(await page.locator('#blmUseAssembly').isDisabled());
  const second=await page.locator('.blm-card').nth(1).getAttribute('data-id');await page.locator('.blm-card').nth(1).click();
  await page.click('#blmUseAssembly');await page.waitForFunction(id=>window.__branchForge.workbench.library.some(a=>a.id===id),second);await ready();
  assert(await page.evaluate(id=>window.__branchForge.workbench.library.some(a=>a.id===id),chosen),'second addition retains first unused sample');
  const countAfterAdd=await page.evaluate(()=>window.__branchForge.workbench.library.length);
  await page.locator(`.blm-card[data-id="${chosen}"]`).dragTo(page.locator('#wbAssetLibrary'),{targetPosition:{x:25,y:20}});await ready();
  assert.equal(await page.evaluate(()=>window.__branchForge.workbench.library.length),countAfterAdd);
  for(const viewport of [{width:1366,height:900},{width:1600,height:1000}]){
   await page.setViewportSize(viewport);
   assert(await page.locator('#branchLibraryDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   assert((await page.locator('#branchLibraryDialog').boundingBox()).x>=(await page.locator('.parameter-panel').boundingBox()).width);
  }
  await page.screenshot({path:path.join(out,'添加成品枝浮窗.png')});
  await page.click('#blmSearch');await page.keyboard.press('Escape');await page.waitForSelector('#branchLibraryDialog',{state:'hidden'});await ready();
  assert.equal(await page.evaluate(()=>window.__branchForge.workbench.mode),'TREE');
  assert.equal(await page.locator('#wbAssetLibrary .active').getAttribute('data-asset'),chosen);
  const addedIds=await page.evaluate(()=>window.__branchForge.workbench.library.map(a=>a.id));
  assert(beforeLibrary.every(id=>addedIds.includes(id)));assert(addedIds.includes(chosen)&&addedIds.includes(second));
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__branchForge.asset.masterBranches.map(b=>b.points.map(p=>p.toArray())))),beforeGeometry);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring.branch_instances)),beforeUse);
  await checkCounts();report.checks.push('非模态选材浮窗露出左侧列表；真实拖放与点击连续添加两款；重复拖入去重；Escape 关闭；两种窗口无溢出；添加保持几何与原装配不变');
  // Exercise the actual file-save serializer without writing to the user's library.
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){
    if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='catalog-reload.branch.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);return new Response(JSON.stringify({success:true,path:'独立测试下载'}),{headers:{'Content-Type':'application/json'}});}
    return original.apply(this,arguments);
  };});
  await page.click('#saveProjectBtn');await page.locator('#projectSaveDialog [value="FILE"]').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('#psSubmit')]);
  const savedPath=path.join(out,'新增素材重载测试.branch.json');await download.saveAs(savedPath);
  await page.reload();await ready();await page.locator('#projectInput').setInputFiles(savedPath);
  await page.waitForFunction(ids=>ids.every(id=>window.__branchForge.workbench.library.some(a=>a.id===id)),[chosen,second]);await ready();
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring.branch_instances)),beforeUse);
  await page.click('#browseBranchCatalog');await page.fill('#blmSearch','香樟');
  assert.equal(await page.locator(`.blm-card[data-id="${chosen}"] .blm-in-project`).textContent(),'已加入');
  await page.click('#blmClose');
  await page.locator(`#wbAssetLibrary [data-asset="${chosen}"]`).dragTo(page.locator('[data-assembly-role="MATURE"]'),{targetPosition:{x:18,y:14}});await ready();
  assert(await page.evaluate(id=>window.__branchForge.authoring.branch_instances.some(i=>i.shootRole==='MATURE'&&i.asset_id===id),chosen));
  await page.click('#undoBtn');await ready();assert.equal(await instanceSnapshot(),beforeUse);
  report.checks.push('实际保存文件并刷新页面重载，两款未装配的新增素材及标记均保留；重载后从左侧拖到右侧能生成真实次枝，撤销恢复原树');
  await page.click('[data-tab="structure"]');await page.screenshot({path:path.join(out,'骨架页与装配概览.png')});
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
 }finally{fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
