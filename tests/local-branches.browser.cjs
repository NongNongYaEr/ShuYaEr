const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/local-branches');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const shape=(id,parent,points,attach)=>({id,parent,points,attach,length:2,start_radius:.05,end_radius:.01});
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'局部枝束验收',seed:42,leaf_density:0,child_count:0,branch_levels:4,wind_strength:0},authoring:{branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,1],[0,0,2],[0,0,3]],0),shape('A','ROOT',[[0,0,1.8],[.6,0,2.1],[1.2,0,2.3],[2,0,2.5]],.6),shape('B','ROOT',[[0,0,.9],[-.5,0,1.2],[-1,0,1.5]],.3)]}}};
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 let page;
 try{
 page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>result.errors.push(e.message));await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 const preview=()=>page.waitForFunction(()=>{const s=window.__branchForge.workbench.stroke;return !s.pending&&s.ghost&&s.session?.planned&&!document.querySelector('#strokeApply').disabled;});
 const select=async id=>page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'(?: · 手工)?$')})}).click();
 const snap=()=>page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
 const change=async(id,value)=>{await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Tab');await preview();};
 const apply=async()=>{await page.locator('#strokeApply').click();await wait();};
 await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='局部枝束验收');await wait();
 await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(2,-8,3);f.camera.up.set(0,0,1);f.controls.target.set(.4,0,1.6);f.controls.update();});
 const initial=await snap();await select('A');await page.locator('#addChildBranch').click();await preview();
 assert.equal(await page.evaluate(()=>window.__branchForge.workbench.stroke.session.planned.stats.total),4);
 assert.equal(await page.evaluate(()=>window.__branchForge.authoring.manual_branches.length),0,'preview must not mutate');
 await page.locator('#localBranchLevels').selectOption('2');await preview();await change('localBranchSeed',42);assert.equal(await page.evaluate(()=>window.__branchForge.workbench.stroke.session.planned.stats.total),12);
 await page.screenshot({path:path.join(out,'局部下级分枝预览.png')});await apply();
 const first=await snap(),config=await page.evaluate(()=>window.__branchForge.authoring.local_branch_groups[0]);assert.equal(Object.keys(first).length,15);for(const id of Object.keys(initial))assert.deepEqual(first[id],initial[id]);
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),initial);await page.locator('#redoBtn').click();await wait();assert.deepEqual(await snap(),first);
 await select('A');await page.locator('#addChildBranch').click();await preview();assert.equal(await page.locator('#localBranchSeed').inputValue(),'42');await change('localBranchCount',5);await apply();
 const more=await snap();for(const id of Object.keys(first))assert.deepEqual(more[id],first[id]);
 await select('A');await page.locator('#addChildBranch').click();await preview();await change('localBranchCount',0);await page.keyboard.press('Escape');await wait();assert.deepEqual(await snap(),more);
 result.checks.push('UI preview and confirmation; 4 children plus second level; stable identities when increasing count; undo/redo; cancel without mutation');

 // Draw a new leading branch using real pointer events, with automatic children.
 await select('B');await page.locator('#addChildBranch').click();await preview();await page.locator('#strokeMode').selectOption('FORK');await page.locator('#strokeContinuous').uncheck();
 const anchor=await page.evaluate(()=>{const f=window.__branchForge,s=f.workbench.stroke;const p=s.marker.position.clone();f.modelRoot.updateWorldMatrix(true,true);f.modelRoot.localToWorld(p);p.project(f.camera);const r=document.querySelector('#viewport').getBoundingClientRect();return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];});
 await page.mouse.move(...anchor);await page.mouse.down();await page.mouse.move(anchor[0]+20,anchor[1]-50,{steps:8});await page.mouse.move(anchor[0]+50,anchor[1]-120,{steps:10});await page.mouse.up();await preview();
 const newRoot=await page.evaluate(()=>window.__branchForge.workbench.stroke.session.planned.targetId);await apply();assert.ok((await snap())[newRoot]);assert.equal(await page.evaluate(()=>window.__branchForge.authoring.local_branch_groups.length),2);
 await select(newRoot);await page.locator('#addChildBranch').click();await preview();await change('localBranchCount',0);await apply();assert.equal(await page.evaluate(id=>window.__branchForge.authoring.manual_branches.filter(b=>b.parent===id).length,newRoot),0);assert.ok((await snap())[newRoot]);
 result.checks.push('real mouse draws a new branch with automatic children; count zero removes only generated children and retains leading branch');

 // Actual file-save UI and full reload, not just serialize in memory.
 const savedGeometry=await snap();const savedConfig=await page.evaluate(()=>window.__branchForge.authoring.local_branch_groups);
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='local.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
 await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'局部枝束保存.branch.json');await download.saveAs(saved);
 await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='局部枝束验收');await wait();assert.deepEqual(await snap(),savedGeometry);assert.deepEqual(await page.evaluate(()=>window.__branchForge.authoring.local_branch_groups),savedConfig);
 await select('A');await page.locator('#addChildBranch').click();await preview();assert.equal(await page.locator('#localBranchCount').inputValue(),'5');await page.keyboard.press('Escape');
 result.checks.push('actual saved engineering file reload preserves geometry and editable local configuration');

 // User edits a generated branch with the existing property panel. A later
 // quantity reduction must preserve it and the branch bundle it supports.
 await select(config.id+'_1');await page.locator('#branchNumericAdvanced > summary').click();await page.locator('#localRadius').fill('1.5');await page.locator('#localRadius').press('Tab');await wait();const protectedBefore=await snap();
 await select('A');await page.locator('#addChildBranch').click();await preview();await change('localBranchCount',0);
 assert.equal(await page.evaluate(()=>window.__branchForge.workbench.stroke.session.planned.stats.protected),4);
 await apply();const protectedAfter=await snap();for(const id of [config.id+'_1',config.id+'_1_1',config.id+'_1_2',config.id+'_1_3'])assert.deepEqual(protectedAfter[id],protectedBefore[id]);
 assert.ok(!protectedAfter[config.id+'_2']);await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),protectedBefore);
 result.checks.push('existing UI manual thickness edit protects generated branch and children from count reduction; reduction undo restores other branches');

 const camellia=path.resolve('assets/tree-template-library/template-ea396bae43d74f7fa42ed703724d053b.branch.json');await page.locator('#projectInput').setInputFiles(camellia);await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===577);await wait();
 const units=await page.evaluate(()=>JSON.stringify([window.__branchForge.authoring.branch_instances,window.__branchForge.authoring.branch_library]));
 const foliage=()=>page.evaluate(()=>{const a=window.__branchForge.asset;return Object.fromEntries(['placements','treeOrgans'].map(key=>[key,a[key].map(p=>({id:p.stableId,branch:p.branchStableId,position:p.position.toArray(),direction:p.direction.toArray(),scale:p.scale}))]));});
 const oldFoliage=await foliage(),fullBefore=await snap();await page.locator('#skeletonEditModeBtn').click();await wait();await select('P1');await page.locator('#addChildBranch').click();await preview();await change('localBranchCount',4);await apply();await page.locator('#skeletonEditModeBtn').click();await wait();
 const fullAfter=await snap();for(const id of Object.keys(fullBefore))assert.deepEqual(fullAfter[id],fullBefore[id],id);
 assert.equal(await page.evaluate(()=>JSON.stringify([window.__branchForge.authoring.branch_instances,window.__branchForge.authoring.branch_library])),units);
 const newFoliage=await foliage();assert.deepEqual(newFoliage,oldFoliage);assert.equal(Object.keys(fullAfter).length,Object.keys(fullBefore).length+4);
 result.camellia={units:577,leaves:newFoliage.placements.length,organs:newFoliage.treeOrgans.length,added:4};result.checks.push('real Camellia skeleton mode local generation then full preview: every preexisting bone and sample/foliage record unchanged');
 await page.screenshot({path:path.join(out,'山茶局部增枝.png')});
 assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }catch(e){if(page){await page.screenshot({path:path.join(out,'失败现场.png')});console.error(await page.locator('#strokeState').textContent().catch(()=>''));}throw e;}
 finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});

