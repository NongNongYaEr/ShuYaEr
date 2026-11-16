const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/branch-combing');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const shape=(id,parent,points)=>({id,parent,points,length:3,start_radius:.035,end_radius:.015});
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'保长梳理验收',seed:42,leaf_density:8,child_count:0,branch_levels:4,wind_strength:0},authoring:{branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,.3],[0,0,.6],[0,0,1]]),shape('A','ROOT',[[0,0,1],[1,0,1.4],[1.7,0,2.2],[3,0,2.2]]),shape('A1','A',[[1,0,1.4],[1.4,0,1.8],[1.8,0,2.2],[2.2,0,2.6]]),shape('B','ROOT',[[0,.04,1],[1,.04,1.4],[2,.04,1.8],[3,.04,2.2]])]}}};
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>result.errors.push(e.message));await page.goto(process.argv[2]);console.log('PAGE');await page.waitForFunction(()=>window.__branchForge?.asset);
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 const load=async()=>{await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='保长梳理验收');await wait();await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(1.5,-9,1.5);f.camera.up.set(0,0,1);f.controls.target.set(1.5,0,1.5);f.controls.update();});};
 const snap=()=>page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
 const select=async id=>{await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'$')})}).click();};
 const tool=key=>page.locator('.viewport-tool-rail [data-viewport-tool="'+key+'"]').click();
 const point=async(id,t=.65)=>page.evaluate(({id,t})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),n=Math.min(b.points.length-2,Math.floor(t*(b.points.length-1))),p=b.points[n].clone().lerp(b.points[n+1],t*(b.points.length-1)-n),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);const v=f.asset.group.localToWorld(p).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},{id,t});
 const drag=async(a,b)=>{await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:12});await page.mouse.up();await wait();};


 const dist=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
 const len=pts=>pts.slice(1).reduce((n,p,i)=>n+dist(p,pts[i]),0);
 const sameLengths=(before,after)=>{assert.equal(before.length,after.length);for(let i=1;i<before.length;i++)assert.ok(Math.abs(dist(before[i],before[i-1])-dist(after[i],after[i-1]))<1e-7,`segment ${i} length`);};
 await load(); const before=await snap(); await select('A'); await page.locator('#branchEditScope').selectOption('DIRECT');await tool('COMB');
 assert.equal(await page.locator('#shapingContextTitle').textContent(),'保长梳理');
 assert.equal(await page.locator('#sculptLength').isDisabled(),true);
 await page.locator('#quick_sculptRadius').evaluate(e=>e.value='220');await page.locator('#quick_sculptRadius').dispatchEvent('input');
 await page.locator('#quick_sculptStrength').evaluate(e=>e.value='1');await page.locator('#quick_sculptStrength').dispatchEvent('input');
 await page.screenshot({path:path.join(out,'梳理前.png')});
 let p=await point('A',.7);await drag(p,[p[0],p[1]-90]); const after=await snap();
 assert.notDeepEqual(after.A,before.A); assert.deepEqual(after.A[0],before.A[0]);assert.deepEqual(after.B,before.B);assert.deepEqual(after.ROOT,before.ROOT);
 for(const id of Object.keys(before))sameLengths(before[id],after[id]);
 for(let i=0;i<before.A1.length;i++)for(let j=0;j<before.A1.length;j++)assert.ok(Math.abs(dist(after.A1[i],after.A1[j])-dist(before.A1[i],before.A1[j]))<1e-7);
 result.lengths={before:len(before.A),after:len(after.A)};result.checks.push('UI comb bends dense branch without stretching; root, sibling and child proportions preserved');
 await page.screenshot({path:path.join(out,'梳理后.png')});
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),before);await page.locator('#redoBtn').click();await wait();assert.deepEqual(await snap(),after);
 result.checks.push('undo and redo restore exact points');
 p=await point('A',.6);await page.mouse.move(...p);await page.mouse.down();await page.mouse.move(p[0]+50,p[1]-25,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();await wait();assert.deepEqual(await snap(),after);
 result.checks.push('Escape cancels preview without editing geometry');
 // Temporary box operations must retain the comb tool and not create an edit.
 const box=async(id,key)=>{const b=await point(id,.8);await page.keyboard.down(key);await page.mouse.move(b[0]-15,b[1]-15);await page.mouse.down();await page.mouse.move(b[0]+15,b[1]+15,{steps:4});await page.mouse.up();await page.keyboard.up(key);};
 await box('B','Shift');assert.ok((await page.evaluate(()=>window.__branchForge.bundleState.selected)).includes('B'));
 await box('B','Control');assert.ok(!(await page.evaluate(()=>window.__branchForge.bundleState.selected)).includes('B'));
 assert.equal(await page.locator('#viewport').getAttribute('data-viewport-tool'),'COMB');assert.deepEqual(await snap(),after);
 result.checks.push('Shift add and Ctrl subtract selection preserve comb tool without sculpting');
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='comb.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
 await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'梳理保存.branch.json');await download.saveAs(saved);await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='保长梳理验收');await wait();assert.deepEqual(await snap(),after);result.checks.push('actual saved file reload preserves combed curve and connected child');

 const camellia=path.resolve('assets/tree-template-library/template-ea396bae43d74f7fa42ed703724d053b.branch.json');await page.locator('#projectInput').setInputFiles(camellia);await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===577);await wait();
 const unitData=()=>page.evaluate(()=>JSON.stringify([window.__branchForge.authoring.branch_instances,window.__branchForge.authoring.branch_library]));const units=await unitData(); const originalFull=await snap();
 await page.locator('#skeletonEditModeBtn').click();await wait();await page.locator('#fitViewBtn').click();await select('P1');await page.locator('#branchEditScope').selectOption('SELECTED');await tool('COMB');
 await page.locator('#quick_sculptRadius').evaluate(e=>e.value='260');await page.locator('#quick_sculptRadius').dispatchEvent('input');
 const bones=await snap();p=await point('P1',.7);await drag(p,[p[0]+60,p[1]-50]);const combed=await snap();assert.notDeepEqual(combed.P1,bones.P1);
 for(const id of Object.keys(bones))sameLengths(bones[id],combed[id]);assert.equal(await unitData(),units);
 await page.locator('#skeletonEditModeBtn').click();await wait();assert.equal(await unitData(),units);const full=await snap();assert.deepEqual(Object.keys(full),Object.keys(originalFull));
 const protectedUnits=await page.evaluate(()=>window.__branchForge.asset.masterBranches.filter(b=>b.instanceId||b.unitOwner).map(b=>b.stableId));
 for(const id of protectedUnits){const a=full[id],b=originalFull[id];sameLengths(b,a);for(let i=1;i<a.length;i++)assert.ok(Math.abs(dist(a[i],a[0])-dist(b[i],b[0]))<1e-6,id);}
 await page.screenshot({path:path.join(out,'山茶梳理完整装配.png')});
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),originalFull);
 result.checks.push('actual camellia: selected subtree lengths preserved, all 577 sample units preserved after full assembly, undo exact');
 assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
