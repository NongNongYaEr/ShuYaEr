const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve('.runtime/ui-layout');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const report={checks:[],errors:[]};
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(120000);
  page.on('pageerror',e=>report.errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.workbench.busy&&!f.asset.group.userData.pending_rebuild&&document.getElementById('busyOverlay').hidden});
  await page.goto(process.argv[2]);await ready();
  const stamp=()=>page.evaluate(()=>JSON.stringify({settings:window.__branchForge.collectSettings(),authoring:window.__branchForge.authoring,history:window.__branchForge.historyState}));
  const before=await stamp();
  for(const width of [2560,1600,1366,1080]){
   await page.setViewportSize({width,height:1000});
   const boxes=await page.evaluate(()=>['newBtn','saveProjectBtn','projectSaveState','openResourceCenter','undoBtn','redoBtn','brandExportOpen'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,x:r.x,y:r.y,w:r.width,h:r.height}}));
   const open=await page.locator('label[for=projectInput]').boundingBox();
   const cy=boxes[0].y+boxes[0].h/2;
   assert(Math.abs(open.y+open.height/2-cy)<1,'Open aligns with New');
   for(const r of boxes){assert(Math.abs(r.y+r.h/2-cy)<1,`${width}: ${r.id} aligned`);assert(r.x>=0&&r.x+r.w<=width,`${width}: ${r.id} contained`)}
   for(let i=1;i<boxes.length;i++)assert(boxes[i].x>=boxes[i-1].x+boxes[i-1].w-1,'Toolbar controls do not overlap');
   const badge=await page.locator('.viewport-badge').boundingBox(),view=await page.locator('.multiview-switch').boundingBox();
   assert(badge.x+badge.width<=view.x,'Viewport status does not overlap view buttons');
   await page.screenshot({path:path.join(out,`布局-${width}.png`)});
  }
  report.checks.push('2560/1600/1366/1080 顶部操作与状态居中、无重叠');
  await page.setViewportSize({width:1600,height:1000});
  await page.click('#saveProjectBtn');await page.waitForSelector('#projectSaveDialog[open]');await page.click('#psCancel');
  await page.click('#openResourceCenter');await page.click('#openProjectLibrary');await page.waitForSelector('#projectLibraryDialog[open]');
  await page.waitForFunction(()=>!document.getElementById('projectLibraryDialog').hasAttribute('aria-busy'));
  await page.waitForFunction(()=>!document.getElementById('projectLibraryDialog').hasAttribute('aria-busy'));await page.click('#plClose');await page.waitForSelector('#projectLibraryDialog',{state:'hidden'});
  await page.click('#brandExportOpen');await page.waitForSelector('#brandExportDialog[open]');await page.keyboard.press('Escape');
  assert.equal(await stamp(),before);report.checks.push('保存、工程库、导出入口正常，取消后工程与历史未变');
  const branch=page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:/^R1\.3$/})});
  await branch.click();
  for(const palette of ['graphite','cream','forest']){
   await page.evaluate(value=>window.treeDuckAppearance.set(value),palette);
   await page.screenshot({path:path.join(out,`面板-${palette}.png`)});
  }
  await page.evaluate(()=>window.treeDuckAppearance.set('graphite'));
  await page.click('#brandHome');await page.selectOption('#brandDensity','compact');await page.keyboard.press('Escape');
  await page.screenshot({path:path.join(out,'紧凑.png')});
  await page.reload();await ready();
  assert.equal(await page.locator('html').getAttribute('data-ui-density'),'compact');
  assert.equal(await page.locator('.project-save-group #projectSaveState').count(),1);
  report.checks.push('三套配色、紧凑密度及实际重载通过');
  for(const [id,mode] of [['branchWorkspaceBtn','BRANCH'],['vineWorkspaceBtn','VINE'],['treeWorkspaceBtn','TREE']]){
   await page.click('#'+id);await page.waitForFunction(mode=>window.__branchForge.workbench.mode===mode&&!window.__branchForge.workbench.busy,mode);await ready();
   await page.screenshot({path:path.join(out,`工作区-${mode}.png`)});
  }
  report.checks.push('枝条、藤蔓和整树工作区实际切换检查');
  assert.deepEqual(report.errors,[]);report.passed=true;
  fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
