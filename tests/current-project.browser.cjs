const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/current-project');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(90000);page.on('pageerror',e=>result.errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.workbench.busy&&!f.asset.group.userData.pending_rebuild&&document.getElementById('busyOverlay').hidden;});
  await page.goto(process.argv[2]);await ready();
  const shape={id:'ROOT',parent:'',points:[[0,0,0],[0,0,.5],[0,0,1],[0,0,1.5]],length:1.5,start_radius:.05,end_radius:.01};
  const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'我的香樟试验树',leaf_density:0,child_count:0,branch_levels:1},authoring:{branch_shape:{branches:[shape]}}};
  const input=path.join(out,'香樟_上午修改.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
  await page.locator('#projectInput').setInputFiles(input);await ready();await page.waitForFunction(()=>document.getElementById('currentProjectName').textContent==='我的香樟试验树');
  assert.match(await page.locator('#currentProjectMeta').textContent(),/整树 · 工程文件/);
  await page.click('#currentProject');await page.waitForSelector('#currentProjectDialog[open]');assert.match(await page.locator('#currentProjectDialog dl').textContent(),/香樟_上午修改.branch.json/);
  assert.match(await page.locator('#currentProjectDialog dl').textContent(),/已载入/);await page.keyboard.press('Escape');
  result.checks.push('actual file opening shows the current document name, workspace and selected filename');
  const longName='香樟 · 东侧庭院版本 · 连续雕刻后的最终方案 · 已校准叶花果';
  await page.locator('#objectName').evaluate((e,name)=>{e.value=name;e.dispatchEvent(new Event('input',{bubbles:true}));},longName);await ready();
  await page.waitForFunction(name=>document.getElementById('currentProjectName').textContent===name&&document.getElementById('projectSaveState').dataset.dirty==='true',longName);
  assert.match(await page.title(),/^\* /);
  for(const width of [2560,1600,1366,1080]){
   await page.setViewportSize({width,height:1000});
   const boxes=await page.evaluate(()=>['newBtn','saveProjectBtn','projectSaveState','openResourceCenter','undoBtn','redoBtn','currentProject','brandExportOpen'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,x:r.x,y:r.y,w:r.width,h:r.height};}));
   const cy=boxes[0].y+boxes[0].h/2;
   for(const b of boxes){assert.ok(b.x>=0&&b.x+b.w<=width+1,`${width}: ${b.id} stays inside toolbar`);assert.ok(Math.abs(b.y+b.h/2-cy)<1,`${width}: ${b.id} vertically aligned`);}
   for(let n=1;n<boxes.length;n++)assert.ok(boxes[n].x>=boxes[n-1].x+boxes[n-1].w-1,`${width}: toolbar does not overlap`);
   await page.screenshot({path:path.join(out,`工程信息-${width}.png`)});
  }
  await page.setViewportSize({width:1600,height:1000});result.checks.push('long names, unsaved indication and toolbar alignment at 2560/1600/1366/1080');
  const authoringBefore=await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring));
  await page.click('#currentProject');assert.match(await page.locator('#currentProjectDialog dl').textContent(),/未保存/);await page.click('#currentProjectDialog button');assert.equal(await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring)),authoringBefore);
  await page.click('#saveProjectBtn');await page.waitForSelector('#projectSaveDialog[open]');await page.fill('#psName','香樟 · 夜间修改');await page.click('#psCancel');assert.equal(await page.locator('#currentProjectName').textContent(),longName);
  // A real downloaded serialization, without driving the native file picker or writing a shared library.
  await page.evaluate(()=>{const fetch=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){
   const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),start=line+1+Number(prefix.slice(0,line));
   const a=document.createElement('a');a.href=URL.createObjectURL(options.body.slice(start));a.download='另存的香樟.branch.json';a.click();
   return new Response(JSON.stringify({success:true,path:'Z:/独立验收/另存的香樟.branch.json'}));
  }return fetch.apply(this,arguments);};});
  await page.click('#saveProjectBtn');await page.locator('[name=saveMode][value=FILE]').check();await page.fill('#psName','香樟 · 夜间修改');
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('#psSubmit')]);const saved=path.join(out,'另存的香樟.branch.json');await download.saveAs(saved);
  await page.waitForFunction(()=>document.getElementById('projectSaveState').dataset.dirty==='false');assert.equal(await page.locator('#currentProjectName').textContent(),'香樟 · 夜间修改');await page.click('#psCancel');
  await page.click('#currentProject');assert.match(await page.locator('#currentProjectDialog dl').textContent(),/Z:\/独立验收\/另存的香樟.branch.json/);assert.match(await page.locator('#currentProjectDialog dl').textContent(),/已保存/);await page.keyboard.press('Escape');
  await page.click('#branchWorkspaceBtn');await ready();assert.match(await page.locator('#currentProjectMeta').textContent(),/次枝/);await page.click('#treeWorkspaceBtn');await ready();
  await page.waitForFunction(()=>document.getElementById('currentProjectName').textContent==='香樟 · 夜间修改');assert.match(await page.locator('#currentProject').getAttribute('title'),/Z:\/独立验收/);
  result.checks.push('cancel leaves name unchanged; successful Save As updates name and actual returned path; workspace switch restores identity');
  await page.reload();await ready();await page.locator('#projectInput').setInputFiles(saved);await ready();await page.waitForFunction(()=>document.getElementById('currentProjectName').textContent==='香樟 · 夜间修改');assert.match(await page.locator('#currentProject').getAttribute('title'),/另存的香樟.branch.json/);
  const meta=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,''))).find(i=>i.species==='JASMINE'&&!i.userSaved);
  await page.evaluate(async item=>{const {migrateProjectDocument}=await import('/authoring-state.js'),{attachSaveContext,templateContext}=await import('/project-save-data.js');const doc=await(await fetch('/api/project-document?id='+item.id)).json();await window.__branchForge.workbench.load(attachSaveContext(migrateProjectDocument(doc),templateContext(item)));},meta);await ready();
  assert.equal(await page.locator('#currentProjectName').textContent(),meta.name);assert.ok((await page.locator('#currentProjectMeta').textContent()).includes('样板副本 · V'+(meta.version||1)));assert.match(await page.locator('#currentProject').getAttribute('title'),new RegExp(meta.path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await page.click('#currentProject');assert.match(await page.locator('#currentProjectDialog dl').textContent(),/来源样板/);await page.keyboard.press('Escape');
  await page.click('#newBtn');await ready();await page.waitForFunction(()=>document.getElementById('currentProjectMeta').textContent.includes('新建工程'));
  assert.ok(!(await page.locator('#currentProject').getAttribute('title')).includes(meta.path));assert.match(await page.locator('#projectSaveState').textContent(),/未保存/);
  result.checks.push('actual saved file reload, formal jasmine template name/version/source and new-project source reset');
  assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
