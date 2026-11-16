const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/my-projects');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const name='验收_我的工程_'+crypto.randomUUID().slice(0,8),file=path.resolve('导出',name+'.branch.json');
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(180000);page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset&&!window.__branchForge.workbench.busy);
  // Exercise the real saved-file backend via export-copy saving, bypassing only the native file chooser.
  await page.route('**/api/save-project',async route=>{const response=await page.request.post(process.argv[2]+'api/save-pve-project',{headers:{'X-BranchForge-Save':'1','Content-Type':'application/octet-stream'},data:route.request().postDataBuffer(),timeout:180000});await route.fulfill({status:response.status(),body:await response.body(),contentType:'application/json'});});
  await page.locator('#saveProjectBtn').click();await page.locator('[name="saveMode"][value="FILE"]').check();await page.locator('#psName').fill(name);await page.locator('#psSubmit').click();await page.waitForFunction(()=>document.getElementById('psStatus').textContent.includes('已保存工程'));await page.locator('#psCancel').click();
  const original=JSON.parse(fs.readFileSync(file));assert.equal(original.settings.object_name,name);
  await page.locator('#recentProjectsBtn').click();await page.waitForFunction(()=>document.getElementById('sessionCount').textContent.includes('已保存'));
  await page.locator('#sessionSearch').fill(name);await page.waitForFunction(()=>document.querySelectorAll('.session-card').length===1);
  assert.equal(await page.locator('.session-card img').count(),1);assert.match(await page.locator('#sessionPath').textContent(),new RegExp(name));assert.equal(await page.locator('#sessionKind').inputValue(),'');
  await page.screenshot({path:path.join(out,'保存后找到工程.png')});
  await page.locator('#sessionKind').selectOption('VINE');assert.equal(await page.locator('.session-card').count(),0);await page.locator('#sessionKind').selectOption('TREE');assert.equal(await page.locator('.session-card').count(),1);
  result.checks.push('真实保存后立即进入已保存列表，预览、搜索、类型筛选与实际路径可用');
  for(const width of [1600,1080,768]){await page.setViewportSize({width,height:950});const layout=await page.evaluate(()=>{const p=document.getElementById('projectSessionPanel'),r=p.getBoundingClientRect();return {inside:r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight,overflow:p.scrollWidth>p.clientWidth};});assert.equal(layout.inside,true);assert.equal(layout.overflow,false);}
  await page.setViewportSize({width:1600,height:1050});
  original.settings.object_name='验收_磁盘文件已更新';fs.writeFileSync(file,JSON.stringify(original));
  await page.locator('[data-session-open]').click();await page.waitForFunction(()=>window.__branchForge.collectSettings().object_name==='验收_磁盘文件已更新'&&!window.__branchForge.workbench.busy);assert.equal(await page.locator('#projectSessionPanel').isVisible(),false);
  await page.locator('#currentProject').click();assert.match(await page.locator('#currentProjectDialog').textContent(),new RegExp(name));await page.locator('#currentProjectDialog button').click();result.checks.push('从卡片读取磁盘最新工程，当前工程信息保留真实文件路径');
  await page.locator('#objectName').evaluate(e=>{e.value='验收_当前未保存修改';e.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>document.getElementById('projectSaveState').dataset.dirty==='true');
  const editing=await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring));await page.locator('#recentProjectsBtn').click();await page.locator('#sessionSearch').fill(name);await page.locator('[data-session-open]').click();await page.locator('#projectSwitchConfirm [data-confirm-cancel]').click();
  assert.equal(await page.locator('#projectSessionPanel').isVisible(),true);assert.equal(await page.evaluate(()=>window.__branchForge.collectSettings().object_name),'验收_当前未保存修改');assert.equal(await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring)),editing);await page.locator('[data-session-close]').click();
  await page.locator('#objectName').evaluate(e=>{e.value='验收_磁盘文件已更新';e.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>document.getElementById('projectSaveState').dataset.dirty==='false');result.checks.push('取消工程切换保留当前未保存编辑，并返回工程浏览面板');
  await page.locator('#recentProjectsBtn').click();await page.locator('#sessionSearch').fill(name);await page.locator('[data-session-tab="recent"]').click();assert.ok(await page.locator('.session-card').count()>=1);await page.locator('[data-session-tab="saved"]').click();
  fs.renameSync(file,file+'.moved');await page.locator('[data-session-refresh]').click();await page.waitForFunction(()=>document.getElementById('sessionHint').textContent.includes('已移动'));assert.equal(await page.locator('[data-session-open]').isDisabled(),true);fs.renameSync(file+'.moved',file);await page.locator('[data-session-refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-session-open]').disabled);result.checks.push('最近快照单独浏览；移动文件提示并禁止错误打开，恢复位置后刷新可用');
  await page.locator('[data-session-close]').click();await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset&&!window.__branchForge.workbench.busy);await page.locator('#recentProjectsBtn').click();await page.locator('#sessionSearch').fill(name);await page.waitForFunction(()=>document.querySelectorAll('.session-card').length===1);result.checks.push('页面重载后仍能浏览保存文件，不依赖浏览器缓存');
  await page.screenshot({path:path.join(out,'我的工程面板.png')});assert.deepEqual(result.errors,[]);result.passed=true;
 }finally{await browser.close();if(fs.existsSync(file)){assert.equal(path.dirname(file),path.resolve('导出'));assert.ok(path.basename(file).startsWith(name));fs.renameSync(file,path.join(out,name+'.branch.json'));}fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
})().catch(e=>{console.error(e);process.exitCode=1;});
