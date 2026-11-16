const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve('.runtime/brand-ui');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const report={checks:[],errors:[]};
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(120000);page.on('pageerror',e=>report.errors.push(e.message));
 // Hold the actual module request to inspect loading UI without faking readiness.
 let release;const gate=new Promise(r=>release=r);
 await page.route('**/app.js',async route=>{await gate;await route.continue()});
 await page.goto(process.argv[2],{waitUntil:'commit'});await page.waitForSelector('#brandStartup');await page.screenshot({path:path.join(out,'启动.png')});release();
 await page.waitForFunction(()=>window.__branchForge?.asset&&!document.getElementById('brandStartup'));
 await page.locator('.brand-mark').evaluate(img=>img.decode());
 assert.equal(await page.title(),'树鸭儿 · 植物创作工坊');report.checks.push('真实初始化完成后关闭启动页');
 const stamp=()=>page.evaluate(()=>JSON.stringify({settings:window.__branchForge.collectSettings(),authoring:window.__branchForge.authoring,history:window.__branchForge.historyState}));
 const before=await stamp();
 await page.screenshot({path:path.join(out,'整树.png')});
 await page.click('#brandHome');await page.screenshot({path:path.join(out,'欢迎.png')});
 const scene='#brandHomeDialog .brand-scene';
 const transform=await page.locator(scene).evaluate(el=>getComputedStyle(el,'::before').transform);
 await page.waitForFunction(({scene,transform})=>getComputedStyle(document.querySelector(scene),'::before').transform!==transform,{scene,transform});
 await page.click('#brandHomeDialog .brand-motion-toggle');
 assert.equal(await page.locator(scene).evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
 await page.selectOption('#brandDensity','compact');await page.keyboard.press('g');assert.equal(await stamp(),before);await page.keyboard.press('Escape');assert(!await page.locator('#brandHomeDialog').isVisible());
 await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset&&!document.getElementById('brandStartup'));assert.equal(await page.locator('html').getAttribute('data-ui-density'),'compact');
 assert.equal(await page.locator('html').getAttribute('data-brand-motion'),'off');
 await page.click('#brandHome');await page.click('#brandHomeDialog .brand-motion-toggle');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.dataset.brandMotion==='off');
 assert(await page.locator('#brandHomeDialog .brand-motion-toggle').isDisabled());
 assert.equal(await page.locator(scene).evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.keyboard.press('Escape');
 assert.equal(await page.locator(scene).evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
 report.checks.push('插画实际动效、开关重载记忆、关闭欢迎页停止及减少动态设置');
 await page.click('#brandHome');await page.selectOption('#brandDensity','comfortable');await page.keyboard.press('Escape');report.checks.push('欢迎页隔离快捷键、Esc关闭、界面密度重载保持');
 await page.click('#brandExportOpen');await page.screenshot({path:path.join(out,'导出.png')});
 for(const id of ['exportBtn','exportPveSkeletonBtn','exportPveCompleteBtn','exportStaticVegetationBtn'])assert(await page.locator('#'+id).isVisible());
 await page.click('#exportPveCompleteBtn');await page.waitForSelector('#projectSaveDialog[open]');assert(!await page.locator('#brandExportDialog').isVisible());await page.click('#psCancel');report.checks.push('完整导出选项保留、PVE保存接续和取消');
 await page.click('#saveProjectBtn');await page.waitForSelector('#projectSaveDialog[open]');await page.screenshot({path:path.join(out,'保存.png')});await page.keyboard.press('Escape');
 await page.click('#openResourceCenter');await page.click('#openProjectLibrary');await page.waitForSelector('#projectLibraryDialog[open]');await page.waitForSelector('.pl-card');await page.screenshot({path:path.join(out,'工程库.png')});await page.waitForFunction(()=>!document.getElementById('projectLibraryDialog').hasAttribute('aria-busy'));await page.click('#plClose');
 await page.click('#openResourceCenter');await page.click('#openBranchLibraryManager');await page.waitForSelector('#branchLibraryDialog[open]');await page.waitForSelector('.blm-card');await page.screenshot({path:path.join(out,'次枝库.png')});await page.click('#blmClose');
 await page.click('#openResourceCenter');await page.click('#openPlantUnitWorkbench');await page.waitForSelector('#plantUnitDialog[open]');await page.screenshot({path:path.join(out,'叶花果素材.png')});await page.keyboard.press('Escape');
 report.checks.push('真实工程库、次枝库、叶花果素材和保存界面');
 for(const [id,mode,name] of [['branchWorkspaceBtn','BRANCH','枝条'],['vineWorkspaceBtn','VINE','藤蔓'],['treeWorkspaceBtn','TREE','整树返回']]){
  await page.click('#brandHome');await page.click('[data-launch="'+id+'"]');await page.waitForFunction(mode=>window.__branchForge.workbench.mode===mode&&!window.__branchForge.workbench.busy&&document.getElementById('busyOverlay').hidden,mode);
  await page.screenshot({path:path.join(out,name+'.png')});
 }
 report.checks.push('欢迎入口实际切换枝条、藤蔓、整树工作区');
 for(const width of [1366,1080]){
  await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(out,'布局-'+width+'.png')});
  const bounds=await page.locator('#brandExportOpen').boundingBox();assert(bounds.x+bounds.width<=width);const viewport=await page.locator('#viewport').boundingBox();assert(viewport.width>=240);assert(viewport.height>300);
  for(const id of ['toggleGridBtn','fitViewBtn','branchEditScope']){const r=await page.locator('#'+id).boundingBox();assert(r.x>=viewport.x&&r.x+r.width<=viewport.x+viewport.width+1,id+' stays within viewport');}
 }
 report.checks.push('1366/1080像素顶部操作和有效视口');
 // Acceptance output must not overwrite production resources held by a running desktop app.
 const icon=await browser.newPage({viewport:{width:256,height:256},deviceScaleFactor:1});await icon.goto(process.argv[2]+'brand/tree-duck-v5-256.png');await icon.screenshot({path:path.join(out,'图标-256.png'),omitBackground:true});await icon.close();
 assert.deepEqual(report.errors,[]);report.passed=true;fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
