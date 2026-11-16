const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const out=path.resolve('.runtime/project-confirm');fs.mkdirSync(out,{recursive:true});
 const report={checks:[],errors:[],nativeDialogs:0},browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const meta=fs.readdirSync('assets/tree-template-library').filter(n=>n.endsWith('.meta.json')).map(n=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',n),'utf8').replace(/^\uFEFF/,''))).find(m=>m.species==='JASMINE'&&!m.userSaved);
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(meta.path)).digest('hex'),sourceHash=hash();
 let page,catalog=[{...meta,managed:false,userSaved:false}],reads=0,deletes=0;
 try{
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(90000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',async d=>{report.nativeDialogs++;await d.dismiss();});
  await page.route('**/api/project-library',r=>r.fulfill({json:{items:catalog,errors:[]}}));
  await page.route('**/api/project-document?*',r=>{reads++;return r.continue();});
  await page.route('**/api/tree-template?*',r=>{if(r.request().method()!=='DELETE')return r.continue();deletes++;catalog=[];return r.fulfill({json:{success:true}});});
  const ready=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.getElementById('busyOverlay').hidden;});
  const settled=()=>page.waitForFunction(()=>!document.getElementById('projectLibraryDialog').hasAttribute('aria-busy'));
  const stamp=()=>page.evaluate(()=>{const f=window.__branchForge;return JSON.stringify({settings:f.collectSettings(),authoring:f.authoring,history:f.historyState,tool:f.viewportTool,selected:f.selectedCurvePoint});});
  await page.goto(process.argv[2]);await ready();const before=await stamp();
  await page.evaluate(()=>window.__branchForge.projectLibrary.open('legacy'));await settled();
  const confirm=page.locator('#projectLibraryConfirm'),accept=confirm.locator('[data-confirm-accept]'),cancel=confirm.locator('[data-confirm-cancel]');
  const open=async()=>{await page.locator(`.pl-card[data-id="${meta.id}"]`).dblclick();await confirm.waitFor({state:'visible'});};
  await open();assert.match(await confirm.locator('h2').textContent(),/打开旧工程/);assert.equal(await confirm.locator('[data-confirm-name]').textContent(),meta.name);
  await confirm.locator('img').evaluate(img=>img.decode());assert.equal(await cancel.evaluate(el=>document.activeElement===el),true);
  assert.equal(reads,0,'no project read before approval');await cancel.click();await settled();assert.equal(await stamp(),before);assert.equal(reads,0);assert(await page.locator('#projectLibraryDialog').isVisible());
  report.checks.push('双击真实旧工程卡片出现软件确认窗，默认焦点在取消；取消保留当前工程与样板库，不请求工程文件');
  await open();await page.keyboard.press('Enter');await confirm.waitFor({state:'hidden'});await settled();assert.equal(await stamp(),before);assert.equal(reads,0);
  await open();for(const key of ['g','r','s','Control+z'])await page.keyboard.press(key);assert.equal(await stamp(),before);await page.keyboard.press('Escape');await confirm.waitFor({state:'hidden'});await settled();assert.equal(reads,0);
  report.checks.push('Enter 默认取消、Esc 取消和造型/撤销快捷键隔离：当前模型与历史保持不变');
  for(const palette of ['graphite','cream','forest']){
   await page.evaluate(p=>window.treeDuckAppearance.set(p),palette);await open();
   const theme=await confirm.evaluate(el=>({background:getComputedStyle(el).backgroundColor,surface:getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),width:el.getBoundingClientRect().width}));
   const expected=await page.evaluate(value=>{const e=document.createElement('div');e.style.backgroundColor=value;document.body.append(e);const color=getComputedStyle(e).backgroundColor;e.remove();return color;},theme.surface);
   assert.equal(theme.background,expected);assert(theme.width<=480);await confirm.screenshot({path:path.join(out,'工程确认-'+palette+'.png')});await cancel.click();await settled();
  }
  await page.setViewportSize({width:390,height:700});await open();const bounds=await confirm.boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=700);assert(await accept.isVisible());assert(await cancel.isVisible());await confirm.screenshot({path:path.join(out,'工程确认-窄窗口.png')});await cancel.click();await settled();
  report.checks.push('石墨黄、奶油、森林主题使用各自颜色；窄窗口完整显示工程名、说明和按钮，IP插画真实加载');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.treeDuckAppearance.set('graphite'));
  await open();await accept.click();await page.locator('#projectLibraryDialog').waitFor({state:'hidden'});await ready();assert.equal(reads,1);assert(await page.evaluate(id=>window.__branchForge.authoring.workbench?.project_save?.templateId===id,meta.id));
  report.loaded=await page.evaluate(()=>({branches:window.__branchForge.asset.masterBranches.length,instances:window.__branchForge.authoring.branch_instances.length,leaves:window.__branchForge.asset.placements.length,organs:window.__branchForge.asset.treeOrgans.length}));assert(report.loaded.instances>0&&report.loaded.leaves>0);
  report.checks.push('点击继续打开后才请求真实工程，并实际载入茉莉完整整株、次枝、叶花果和样板来源');
  // Only synthetic catalog metadata and intercepted DELETE requests are used.
  catalog=[{...meta,managed:true,userSaved:true,name:'样板 <测试> & V2',version:2}];
  await page.evaluate(()=>window.__branchForge.projectLibrary.open('templates'));await settled();await page.click('#plDelete');await confirm.waitFor({state:'visible'});
  assert(await confirm.evaluate(el=>el.classList.contains('app-confirm-danger')));assert.equal(await confirm.locator('[data-confirm-name]').textContent(),'样板 <测试> & V2');assert.equal(await confirm.locator('[data-confirm-name] *').count(),0);await cancel.click();await settled();assert.equal(deletes,0);
  await page.click('#plDelete');await accept.click();await settled();assert.equal(deletes,1);assert.equal(hash(),sourceHash);report.checks.push('同库删除确认复用软件样式；取消不删除，确认只发一次请求，名称按纯文本显示；正式样板未写入');
  assert.equal(report.nativeDialogs,0);assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
 }catch(e){report.failure=String(e);await page?.screenshot({path:path.join(out,'失败现场.png'),timeout:5000}).catch(()=>{});throw e;}finally{fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
