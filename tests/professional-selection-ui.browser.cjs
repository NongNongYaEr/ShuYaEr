const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve('.runtime/professional-interaction-perf/selection-ui');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),report={checks:[],errors:[]};let page;
 try{
  const shape=(id,parent,points)=>({id,parent,points,knots:points,attach:.5,length:3,start_radius:.04,end_radius:.01});
  const fixture={format:'ProceduralBranchProject',version:4,settings:{object_name:'专业版点选缓存验收',leaf_density:0,child_count:0,wind_strength:0},authoring:{branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,2],[0,0,4]]),shape('A','ROOT',[[0,0,2],[1,0,3],[2,0,4]]),shape('B','ROOT',[[0,0,2],[-1,0,3],[-2,0,4]])]},sculpt_layers:Array.from({length:48},(_,i)=>({id:'L'+i,name:'保留造型'+i,enabled:true,strength:1,branches:{},operation:{type:'RADIUS',targets:['A'],point:0,factor:1.001}}))}};
  const input=path.join(out,'input.branch.json');fs.writeFileSync(input,JSON.stringify(fixture));page=await browser.newPage({viewport:{width:1700,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/api/project-session**',r=>r.fulfill({json:{success:true,items:[]}}));await page.goto(process.argv[2]);
  const idle=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&f.asset.authoring===f.authoring&&!f.asset.group.userData.pending_rebuild&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});await idle();
  await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset.settings.object_name==='专业版点选缓存验收');await idle();
  const select=id=>page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'$')})}).click();await select('A');
  const openStack=async()=>{if(await page.evaluate(()=>window.__branchForge.workbench.context.mode==='STACK'))return;const b=page.locator('#openShapeStack');await b.evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.matches('details'))p.open=true;});await b.click();};
  await page.evaluate(()=>{window.__selectionRow=document.querySelector('#retainedShapeStack .retained-operation');window.__selectionCard=document.querySelector('#wbAssetLibrary > *');});
  const rows=page.locator('#retainedShapeStack .retained-operation');assert.equal(await rows.count(),24);assert.equal(await rows.locator('.operation-targets select').count(),0);
  for(let i=0;i<8;i++){const id=i%2?'A':'B';await select(id);assert.equal(await page.evaluate(()=>window.__branchForge.selectedCurvePoint.branchId),id);}
  assert.equal(await page.evaluate(()=>document.querySelector('#retainedShapeStack .retained-operation')===window.__selectionRow),true);report.checks.push('repeated real selection updates the selected branch while retaining unrelated operation rows');
  await openStack();const detail=rows.first().locator('.operation-targets');await detail.locator('summary').click();await detail.locator('select').waitFor();assert.equal(await detail.locator('select option').count(),3);
  const history=await page.evaluate(()=>window.__branchForge.historyState.undo);await detail.locator('select').selectOption('B');await idle();assert.equal(await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers[24].operation.targets[0]),'B');assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),history+1);
  await page.locator('#undoBtn').click();await idle();assert.equal(await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers[24].operation.targets[0]),'A');report.checks.push('target choices populate on demand, real rebind commits once and undo invalidates the cached rows');
  await openStack();await page.locator('#retainedShapeStack').getByRole('button',{name:'展开较早 24 条'}).click();assert.equal(await rows.count(),48);
  await select('B');assert.equal(await rows.count(),48);await openStack();await page.locator('#retainedShapeStack').getByRole('button',{name:'折叠较早记录'}).click();assert.equal(await rows.count(),24);report.checks.push('expand and collapse survive selection refresh without losing retained operations');
  assert.equal(await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers.length),48);assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
 }catch(e){report.failure=e.stack;if(page)await page.screenshot({path:path.join(out,'failure.png')});throw e;}
 finally{await browser.close();fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
