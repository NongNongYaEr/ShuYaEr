const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
(async()=>{
 const out=path.resolve('.runtime/workflow-polish');fs.mkdirSync(out,{recursive:true});
 const report={checks:[],errors:[],nativeDialogs:0},browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});let page;
 const metas=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,''))),meta=metas.find(m=>m.species==='JASMINE'&&!m.userSaved);
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(meta.path)).digest('hex'),originalHash=hash();
 try{
  page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(180000);page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',async d=>{report.nativeDialogs++;await d.dismiss();});
  await page.route('**/api/branch-asset',r=>r.request().method()==='GET'?r.continue():r.abort());
  const ready=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.getElementById('busyOverlay').hidden;});
  await page.goto(process.argv[2]);await ready();assert(await page.locator('#recentProjectsBtn').isVisible());assert.match(await page.locator('#editContext').textContent(),/未选择/);
  await page.evaluate(()=>{window.loadStages=[];new MutationObserver(()=>{const active=document.querySelector('#projectLoadDialog li[data-state=active]');if(active&&!window.loadStages.includes(active.textContent))window.loadStages.push(active.textContent);}).observe(document.getElementById('projectLoadDialog'),{attributes:true,childList:true,subtree:true});});
  await page.evaluate(id=>window.__branchForge.projectLibrary.open('templates',id),meta.id);await page.waitForFunction(()=>!document.getElementById('projectLibraryDialog').hasAttribute('aria-busy'));
  await page.locator(`.pl-card[data-id="${meta.id}"]`).dblclick();await page.click('#projectLibraryConfirm [data-confirm-accept]');await page.locator('#projectLibraryDialog').waitFor({state:'hidden'});await ready();
  assert.deepEqual(await page.evaluate(()=>window.loadStages),['读取工程','整理素材与预览','生成植物模型','完成载入']);report.checks.push('实际读取完整茉莉工程，依次显示四个真实加载阶段');
  const card=page.locator('.wb-assembly-card').first(),assetId=await card.getAttribute('data-assembly-asset'),role=await card.locator('..').getAttribute('data-assembly-role');
  const count=await page.evaluate(({assetId,role})=>window.__branchForge.authoring.branch_instances.filter(i=>i.asset_id===assetId&&i.shootRole===role&&i.linked).length,{assetId,role});
  await card.locator('.wb-card-actions button').filter({hasText:'定位'}).click();assert.equal(await page.evaluate(()=>window.__branchForge.bundleState.selected.length),count);assert.match(await page.locator('#editContext').textContent(),new RegExp(count+' 根枝条'));assert(await card.evaluate(c=>c.classList.contains('is-focused')));
  const before=await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring));await card.locator('.wb-card-actions button').filter({hasText:'隔离'}).click();assert(await page.evaluate(()=>window.__branchForge.bundleState.isolated?.length>0));await page.click('#isolateSelectionBtn');assert.equal(await page.evaluate(()=>window.__branchForge.bundleState.isolated),null);assert.equal(await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring)),before);
  report.checks.push('样本卡定位选中准确实例，隔离/恢复仅改变视图，不修改植物或装配');
  await page.evaluate(({assetId,role})=>{const f=window.__branchForge,a=f.workbench.library.find(a=>a.id===assetId);a.revision++;f.authoring.branch_library.find(a=>a.id===assetId).revision=a.revision;f.workbench.refresh();},{assetId,role});assert.match(await card.locator('small').first().textContent(),/待更新/);report.checks.push('卡片显示实际装配版本，库新版显示待更新');
  await page.screenshot({path:path.join(out,'操作对象与装配联动.png')});
  // Restore actual metadata and select a different existing project sample.
  await page.evaluate(id=>{const f=window.__branchForge,a=f.workbench.library.find(a=>a.id===id);a.revision--;f.authoring.branch_library.find(a=>a.id===id).revision=a.revision;f.workbench.refresh();},assetId);
  const nextId=await page.evaluate(id=>window.__branchForge.workbench.library.find(a=>a.id!==id).id,assetId);
  const placement=await page.evaluate(()=>window.__branchForge.authoring.branch_instances.map(({asset_id,pinned_revision,...i})=>i));
  await page.locator(`#wbAssetLibrary [data-asset="${nextId}"]`).click();await card.locator('.wb-card-actions button').filter({hasText:'替换'}).click();await ready();
  await page.waitForFunction(({id,role})=>!window.__branchForge.authoring.branch_instances.some(i=>i.linked&&i.asset_id===id&&i.shootRole===role),{id:assetId,role});
  assert.deepEqual(await page.evaluate(()=>window.__branchForge.authoring.branch_instances.map(({asset_id,pinned_revision,...i})=>i)),placement);report.checks.push('替换仅改变目标分区指定样本，实例数量、挂点与姿态保持');
  await page.click('#browseBranchCatalog');await page.fill('#blmSearch','茉莉');await page.click('#blmRefreshThumbnail');await page.waitForFunction(()=>!document.getElementById('branchLibraryDialog').hasAttribute('aria-busy'));assert(await page.locator('#blmPreview img').count());await page.locator('#blmPreview img').evaluate(img=>img.decode());await page.click('#blmClose');report.checks.push('库刷新所选缩略图真实渲染，未写正式次枝库');
  const scale=page.locator('[data-scale-asset]').first();await scale.fill('1.13');await scale.press('Tab');await ready();await page.waitForFunction(()=>document.getElementById('projectSaveState').dataset.dirty==='true');
  assert.equal(await page.evaluate(()=>window.__branchForge.projectSession.checkpoint(true)),true);
  const draft=await page.evaluate(async()=>{const f=window.__branchForge,items=(await(await fetch('/api/project-session')).json()).items;return items.find(i=>i.id===f.projectSession.draftId);});assert.equal(draft.kind,'draft');
  const expected=await page.evaluate(()=>{const f=window.__branchForge;return {instances:f.authoring.branch_instances,scales:f.authoring.workbench.assembly_scale,leaves:f.asset.placements.length,organs:f.asset.treeOrgans.length,material:f.authoring.leaf_material};});
  await page.evaluate(async id=>{await fetch('/api/project-session/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,active:false})});window.__branchForge.projectSession.dispose();},draft.id);await page.close();
  page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(180000);page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',async d=>{report.nativeDialogs++;await d.dismiss();});await page.goto(process.argv[2]);await ready();assert(await page.locator('#projectSessionPanel').isVisible());
  await page.locator('#projectSessionPanel button').filter({hasText:'恢复草稿 · 茉莉'}).click();await page.waitForFunction(()=>document.getElementById('projectSwitchConfirm').open||Object.values(window.__branchForge.authoring.workbench?.assembly_scale?.cards||{}).includes(1.13));if(await page.locator('#projectSwitchConfirm').isVisible())await page.click('#projectSwitchConfirm [data-confirm-accept]');await page.waitForFunction(()=>Object.values(window.__branchForge.authoring.workbench?.assembly_scale?.cards||{}).includes(1.13));await ready();await page.waitForFunction(()=>!document.getElementById('projectLoadDialog').open);
  const actual=await page.evaluate(()=>{const f=window.__branchForge;return {instances:f.authoring.branch_instances,scales:f.authoring.workbench.assembly_scale,leaves:f.asset.placements.length,organs:f.asset.treeOrgans.length,material:f.authoring.leaf_material};});assert.deepEqual(actual,expected);assert.equal(await page.locator('#projectSaveState').getAttribute('data-dirty'),'true');report.checks.push('新浏览器会话真实恢复草稿，次枝、倍率、材质、叶花果数量一致，恢复后标记未保存');
  if(!await page.locator('#projectSessionPanel').isVisible())await page.click('#recentProjectsBtn');await page.locator('#projectSessionPanel').waitFor({state:'visible'});await page.screenshot({path:path.join(out,'最近工程与恢复.png')});await page.click('[data-session-close]');
  // Failure before mutation and retry use the same read/build flow.
  let tries=0;await page.evaluate(async()=>{window.retried=false;const f=window.__branchForge;try{await f.projectLoadFlow.run('验收失败重试',async progress=>{await progress(0,'读取测试数据');if(!window.retried){window.retried=true;throw Error('测试文件暂不可用');}await progress(1);await progress(2);});}catch{}});assert.match(await page.locator('#projectLoadDialog p').textContent(),/读取工程失败/);await page.click('[data-load-retry]');await page.locator('#projectLoadDialog').waitFor({state:'hidden'});report.checks.push('失败保留阶段与原因，重试重新执行读取流程');
  assert.equal(hash(),originalHash);assert.equal(report.nativeDialogs,0);assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
 }catch(error){report.failure=String(error);await page?.screenshot({path:path.join(out,'失败现场.png'),timeout:5000}).catch(()=>{});throw error;}
 finally{fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});




