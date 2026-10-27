const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/branch-delete');fs.mkdirSync(out,{recursive:true});const report={checks:[],errors:[]};
 const shape=(id,parent,points,attach)=>({id,parent,points,attach,length:2,start_radius:.06,end_radius:.015});
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'Delete整枝验收',seed:42,leaf_density:0,child_count:0,branch_levels:4,wind_strength:0},authoring:{branch_shape:{branches:[shape('R','',[[0,0,0],[0,0,1],[0,0,2],[0,0,3]],0),shape('A','R',[[0,0,1.8],[.6,0,2.1],[1.2,0,2.3],[2,0,2.5]],.6),shape('C','A',[[.6,0,2.1],[.8,0,2.5],[1.1,0,2.8]],1/3),shape('B','R',[[0,0,.9],[-.5,0,1.2],[-1,0,1.5]],.3)]}}};
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let page;
 try{
 page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='Delete整枝验收');await wait();
 const select=async(id,shift=false)=>page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'$')})}).click({modifiers:shift?['Shift']:[]});
 const snap=()=>page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
 const original=await snap();await select('A');await page.keyboard.press('End');await page.keyboard.press('Delete');await wait();const deleted=await snap();assert.deepEqual(Object.keys(deleted),['R','B']);assert.deepEqual(deleted.B,original.B);
 await page.screenshot({path:path.join(out,'Delete删除枝束.png')});await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),original);await page.locator('#redoBtn').click();await wait();assert.deepEqual(await snap(),deleted);await page.locator('#undoBtn').click();await wait();
 report.checks.push('select branch and its curve endpoint then Delete removes entire bundle, not a point; unrelated branch unchanged; undo/redo exact');
 await select('A');await select('B',true);await page.keyboard.press('Delete');await wait();assert.deepEqual(Object.keys(await snap()),['R']);await page.locator('#undoBtn').click();await wait();
 await select('R');const history=await page.evaluate(()=>window.__branchForge.historyState.undo);await page.keyboard.press('Delete');await wait();assert.deepEqual(await snap(),original);assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),history);
 await select('A');await page.locator('#localRadius').fill('1');await page.locator('#localRadius').press('Control+a');await page.locator('#localRadius').press('Delete');assert.deepEqual(await snap(),original);await page.locator('#localRadius').fill('1');await select('A');
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',code:'Delete',repeat:true,bubbles:true})));assert.deepEqual(await snap(),original);
 await page.locator('#branchEditScope').selectOption('ALL');await select('A');await page.keyboard.press('Delete');await wait();assert.deepEqual(await snap(),deleted);
 report.checks.push('multi-selection Delete; main root protected; focused numeric input only edits text; held-key repeats ignored; ALL brush scope still deletes only selected bundle');
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='delete.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
 await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'删除后保存.branch.json');await download.saveAs(saved);
 await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='Delete整枝验收');await wait();assert.deepEqual(await snap(),deleted);
 report.checks.push('actual save UI and file reload keep deleted branch and descendants absent');

 await page.locator('#projectInput').setInputFiles(path.resolve('assets/tree-template-library/template-ea396bae43d74f7fa42ed703724d053b.branch.json'));await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===577);await wait();
 const before=await snap(),records=await page.evaluate(()=>window.__branchForge.asset.masterBranches.map(b=>({id:b.stableId,parent:window.__branchForge.asset.masterBranches.find(p=>p.id===b.parentId)?.stableId}))),gone=new Set(['P1']);let changed=true;while(changed){changed=false;for(const b of records)if(gone.has(b.parent)&&!gone.has(b.id)){gone.add(b.id);changed=true;}}
 const units=await page.evaluate(()=>JSON.stringify([window.__branchForge.authoring.branch_instances,window.__branchForge.authoring.branch_library]));
 await page.locator('#skeletonEditModeBtn').click();await wait();await select('P1');await page.keyboard.press('Delete');await wait();await page.locator('#skeletonEditModeBtn').click();await wait();const after=await snap();
 for(const id of Object.keys(before)){if(gone.has(id))assert.ok(!after[id],id);else assert.deepEqual(after[id],before[id],id);}
 assert.equal(await page.evaluate(()=>JSON.stringify([window.__branchForge.authoring.branch_instances,window.__branchForge.authoring.branch_library])),units);
 assert.equal(await page.evaluate(()=>{const f=window.__branchForge,ids=new Set(f.asset.masterBranches.map(b=>b.stableId));return [...f.asset.placements,...f.asset.treeOrgans].filter(p=>!ids.has(p.branchStableId)).length;}),0);
 report.checks.push('real Camellia skeleton-mode Delete then full preview: removed carrier and all attached unit geometry absent, no floating foliage, unrelated bones and all source sample records unchanged');report.removedBranchSegments=gone.size;
 await page.screenshot({path:path.join(out,'山茶删除枝束.png')});assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
 }catch(e){if(page)await page.screenshot({path:path.join(out,'失败现场.png')});throw e;}
 finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
