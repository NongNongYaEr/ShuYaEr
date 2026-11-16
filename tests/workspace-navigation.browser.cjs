const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve('.runtime/workspace-navigation');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const report={checks:[],errors:[]};
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(90000);page.on('pageerror',e=>report.errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>window.__branchForge?.asset&&!document.getElementById('brandStartup')&&!window.__branchForge.workbench.busy);
  await page.goto(process.argv[2]);await ready();
  const state=()=>page.evaluate(()=>JSON.stringify({authoring:window.__branchForge.authoring,settings:window.__branchForge.collectSettings(),history:window.__branchForge.historyState}));
  const before=await state();assert.equal(await page.locator('html').getAttribute('data-palette'),'graphite');
  await page.screenshot({path:path.join(out,'整树-参数与工具.png')});
  await page.click('#parameterDirectoryOpen');assert(await page.locator('#parameterDirectory').isVisible());
  await page.screenshot({path:path.join(out,'整树-分组目录.png')});
  await page.locator('#parameterDirectoryList button',{hasText:'主枝尺寸'}).first().click();
  assert.equal(await page.locator('#mainSizePanel .parameter-group-toggle').getAttribute('aria-expanded'),'true');
  assert(await page.locator('#length').isVisible());assert(!(await page.locator('#parameterDirectory').isVisible()));
  await page.click('#parameterDirectoryOpen');await page.click('[data-directory-collapse]');
  assert.equal(await page.locator('#mainSizePanel .parameter-group-toggle').getAttribute('aria-expanded'),'false');
  await page.fill('#parameterDirectorySearch','主枝尺寸');assert.equal(await page.locator('#parameterDirectoryList button').count(),1);
  await page.locator('#parameterDirectoryList button').click();
  await page.fill('#parameterSearch','不存在的参数XYZ');await page.waitForFunction(()=>!document.getElementById('parameterSearchEmpty').hidden);
  await page.keyboard.press('Escape');assert.equal(await page.inputValue('#parameterSearch'),'');
  await page.fill('#parameterSearch','基部直径');assert(await page.locator('#length').isVisible());await page.click('#parameterSearchClear');
  await page.click('[data-tab="state"]');await page.keyboard.press('Home');assert(await page.locator('[data-tab="structure"]').evaluate(e=>e.classList.contains('active')));
  await page.click('#parameterFavorites');await page.click('#parameterSearchClear');
  assert.equal(await state(),before);report.checks.push('默认石墨黄；目录跳转、展开收起、搜索无结果与Esc清除、分类键盘导航不修改工程');
  await page.fill('#branchOutlinerSearch','不存在');assert.equal(await page.locator('#branchOutliner button:visible').count(),0);
  await page.fill('#branchOutlinerSearch','R1.1');assert(await page.locator('#branchOutliner button:visible').count()>0);
  await page.locator('#branchOutliner button:visible').first().click();await page.click('#branchOutlinerSelected');
  assert.equal(await page.locator('#branchOutliner button:visible').count(),1);await page.fill('#branchOutlinerSearch','');await page.click('#branchOutlinerSelected');
  await page.click('#expandShapingGroups');assert.equal(await page.locator('.shaping-tool-group:not([open])').count(),0);
  await page.locator('.viewport-tool-rail [data-viewport-tool="COMB"]').click();
  assert(await page.locator('.viewport-tool-rail [data-viewport-tool="COMB"]').evaluate(e=>e.classList.contains('active')));
  await page.locator('.viewport-tool-rail [data-viewport-tool="SELECT"]').click();
  report.checks.push('层级树按编号过滤与已选过滤；新工具分组沿用梳理与选择操作');
  for(const [mode,id,label] of [['BRANCH','branchWorkspaceBtn','枝条'],['VINE','vineWorkspaceBtn','藤蔓'],['TREE','treeWorkspaceBtn','整树返回']]){
   await page.click('#'+id);await page.waitForFunction(m=>window.__branchForge.workbench.mode===m&&!window.__branchForge.workbench.busy,mode);
   await page.click('#parameterDirectoryOpen');assert(await page.locator('#parameterDirectoryList button').count()>0);
   await page.screenshot({path:path.join(out,label+'-目录.png')});
   await page.locator('#parameterDirectoryList button').first().click();
   if(mode==='BRANCH'){
    await page.click('#branchWorkflowADJUST');await page.click('#parameterDirectoryOpen');assert(await page.locator('#parameterDirectoryList').textContent());await page.keyboard.press('Escape');
   }
   if(mode==='VINE'){
    await page.click('#parameterDirectoryOpen');await page.fill('#parameterDirectorySearch','叶片');assert(await page.locator('#parameterDirectoryList button').count()>0);await page.locator('#parameterDirectoryList button').first().click();
   }
   await page.screenshot({path:path.join(out,label+'-工作台.png')});
  }
  assert.equal(await page.locator('#length').count(),1);assert.equal(await page.locator('#branchWorkbenchPanel').count(),1);
  report.checks.push('整树/枝条/藤蔓目录按实际可用分组生成；枝条流程移位后再返回没有丢失或重复控件');
  for(const width of [1366,1080]){
   await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(out,width+'-布局.png')});
   const exportBox=await page.locator('#brandExportOpen').boundingBox();assert(exportBox.x+exportBox.width<=width);
   const view=await page.locator('.viewport-area').boundingBox();assert(view.width>=240&&view.height>300);
   await page.click('#parameterDirectoryOpen');const dir=await page.locator('#parameterDirectory').boundingBox();assert(dir.x>=0&&dir.x+dir.width<=width&&dir.y+dir.height<=900);await page.keyboard.press('Escape');
  }
  await page.reload();await ready();assert.equal(await page.locator('html').getAttribute('data-palette'),'graphite');
  assert.deepEqual(report.errors,[]);report.passed=true;fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
