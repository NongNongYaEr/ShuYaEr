const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/branch-click');fs.mkdirSync(out,{recursive:true});const report={checks:[],errors:[]};
 const shape=(id,parent,points,attach)=>({id,parent,points,attach,length:2,start_radius:.08,end_radius:.035});
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'点击加枝验收',seed:42,leaf_density:0,child_count:0,branch_levels:4,wind_strength:0},authoring:{branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,1],[0,0,2],[0,0,3]],0),shape('A','ROOT',[[0,0,1.8],[.6,0,2.1],[1.2,0,2.3],[2,0,2.5]],.6),shape('B','ROOT',[[0,0,.9],[-.5,0,1.2],[-1,0,1.5]],.3)]}}};
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let page;
 try{
 page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='点击加枝验收');await wait();
 await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(2,-8,3);f.camera.up.set(0,0,1);f.controls.target.set(.4,0,1.6);f.controls.update();});
 const snap=()=>page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
 const count=()=>page.evaluate(()=>window.__branchForge.authoring.manual_branches.length);
 const point=async(id,t)=>page.evaluate(({id,t})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),k=t*(b.points.length-1),i=Math.min(Math.floor(k),b.points.length-2),p=b.points[i].clone().lerp(b.points[i+1],k-i);f.asset.group.updateWorldMatrix(true,true);f.asset.group.localToWorld(p);p.project(f.camera);const r=document.querySelector('#viewport').getBoundingClientRect();return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];},{id,t});
 const original=await snap(),history=await page.evaluate(()=>window.__branchForge.historyState.undo);
 await page.locator('#openLocalBranches').click();assert.equal(await page.locator('#strokeMode').inputValue(),'CLICK');assert.equal(await page.evaluate(()=>window.__branchForge.workbench.stroke.clicking),true);
 await page.locator('#localBranchCount').fill('3');await page.locator('#localBranchLevels').selectOption('2');
 const camera=await page.evaluate(()=>window.__branchForge.camera.position.toArray());await page.mouse.click(...await point('A',.55));await wait();
 assert.equal(await count(),10);const first=await snap();for(const id of Object.keys(original))assert.deepEqual(first[id],original[id]);assert.ok((await page.evaluate(()=>window.__branchForge.camera.position.toArray())).every((v,i)=>Math.abs(v-camera[i])<1e-7));
 const added=await page.evaluate(()=>{const a=window.__branchForge.authoring;return a.manual_branches.find(b=>b.parent==='A');});assert.ok(Math.abs(added.attach-.55)<.035);assert.equal(await page.evaluate(()=>window.__branchForge.workbench.stroke.clicking),true);
 await page.mouse.click(...await point('B',.5));await wait();assert.equal(await count(),20);const twice=await snap();assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),history+2);
 await page.locator('#strokeMode').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'左侧点击加枝工具.png')});
 report.checks.push('arm left tool without selection; actual clicks on two different branches add independent bundles at clicked attachment; automatic two-level children; one undo per click; camera and old bones unchanged');

 const blank=await page.evaluate(()=>{const r=document.querySelector('#viewport').getBoundingClientRect();return [r.right-70,r.top+250];});await page.mouse.click(...blank);await wait();assert.deepEqual(await snap(),twice);
 const p=await point('ROOT',.2);await page.mouse.move(...p);await page.mouse.down();await page.mouse.move(p[0]+30,p[1]+20,{steps:5});await page.mouse.up();await wait();assert.deepEqual(await snap(),twice);
 await page.mouse.move(...p);await page.mouse.down();await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>window.__branchForge.workbench.stroke.clicking),false);assert.deepEqual(await snap(),twice);
 await page.locator('#openLocalBranches').click();await page.mouse.move(...p);await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();assert.deepEqual(await snap(),twice);
 await page.keyboard.press('Control+z');await wait();assert.deepEqual(await snap(),first);await page.keyboard.press('Control+y');await wait();assert.deepEqual(await snap(),twice);
 report.checks.push('blank click, drag, Escape and window blur do not add; Ctrl+Z while tool idle immediately undoes last click; redo restores');

 await page.locator('#openLocalBranches').click();await page.locator('#localBranchEnabled').uncheck();await page.mouse.click(...await point('ROOT',.25));await wait();assert.equal(await count(),21);const final=await snap();
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='click.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
 await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'点击加枝保存.branch.json');await download.saveAs(saved);
 await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='点击加枝验收');await wait();assert.deepEqual(await snap(),final);
 report.checks.push('disable children adds one leading branch; actual save panel and file reload preserve every branch point and local recipes');assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
 }catch(e){if(page){await page.screenshot({path:path.join(out,'失败现场.png')});console.error(await page.locator('#strokeState').textContent().catch(()=>''));}throw e;}
 finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});

