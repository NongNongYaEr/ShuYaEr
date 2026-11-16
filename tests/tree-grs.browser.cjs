const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/tree-grs');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const shape=(id,parent,points)=>({id,parent,points,attach:parent==='ROOT'?.8:parent==='A'?.5:0,length:3,start_radius:.035,end_radius:.015});
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'整树GRS验收',seed:42,leaf_density:8,child_count:0,branch_levels:4,wind_strength:0},authoring:{branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,.4],[.15,0,.7],[0,0,1]]),shape('A','ROOT',[[.09,0,.82],[1,0,1.4],[1.7,0,2.2],[3,0,2.2]]),shape('A1','A',[[1,0,1.4],[1.4,0,1.8],[1.8,0,2.2],[2.2,0,2.6]]),shape('B','ROOT',[[0,.04,1],[1,.04,1.4],[2,.04,1.8],[3,.04,2.2]])]}}};
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>result.errors.push(e.message));await page.goto(process.argv[2]);console.log('PAGE');await page.waitForFunction(()=>window.__branchForge?.asset);
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 const load=async()=>{await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='整树GRS验收');await wait();await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(1.5,-9,1.5);f.camera.up.set(0,0,1);f.controls.target.set(1.5,0,1.5);f.controls.update();});};
 const snap=()=>page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
 const select=async id=>{await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'$')})}).click();};
 const tool=key=>page.locator('.viewport-tool-rail [data-viewport-tool="'+key+'"]').click();
 const point=async(id,t=.65)=>page.evaluate(({id,t})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),n=Math.min(b.points.length-2,Math.floor(t*(b.points.length-1))),p=b.points[n].clone().lerp(b.points[n+1],t*(b.points.length-1)-n),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);const v=f.asset.group.localToWorld(p).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},{id,t});
 const drag=async(a,b)=>{await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:12});await page.mouse.up();await wait();};



 const dist=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
 const rigid=(a,b)=>{assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)for(let j=0;j<a.length;j++)assert.ok(Math.abs(dist(a[i],a[j])-dist(b[i],b[j]))<1e-7,`rigid distance ${i}/${j}`);};
 const idle=()=>page.waitForFunction(()=>!window.__branchForge.keyboardTransformActive);
 const apply=async(key,axis,value)=>{await page.keyboard.press(key);await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);if(axis)await page.keyboard.press(axis);if(value!==null)await page.keyboard.type(String(value));await page.keyboard.press('Enter');await idle();await wait();};
 const mount=()=>page.evaluate(async()=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId==='A'),p=f.asset.masterBranches.find(p=>p.id===b.parentId),{sampleLine}=await import('/tree-sculpt.js'),{mountDistanceAt}=await import('/branch-mount-drag.js');return {t:b.parentT,arc:mountDistanceAt(p.points,b.parentT),gap:b.points[0].distanceTo(sampleLine(p.points,b.parentT)),layers:f.authoring.sculpt_layers.length};});
 await load();await select('A');const before=await snap(),binding=await mount();let pointer=await point('A',.7);await page.mouse.move(...pointer);
 await apply('g','x',-.3);let moved=await snap(),mounted=await mount();
 assert.ok(Math.abs(mounted.arc-binding.arc+.3)<1e-7);assert.ok(mounted.gap<1e-7);rigid(before.A,moved.A);rigid(before.A1,moved.A1);assert.deepEqual(moved.B,before.B);assert.deepEqual(moved.ROOT,before.ROOT);
 result.checks.push('G numeric slides 0.3m on curved mother branch, ignores axis unlock, preserves whole bundle');
 const originalLayers=mounted.layers;await apply('g','',-.1);mounted=await mount();assert.equal(mounted.layers,originalLayers);assert.ok(Math.abs(mounted.arc-binding.arc+.4)<1e-7);
 // Independent root rotations must not depend on the old shared-center setting.
 for(const axis of ['x','y','z']){const a=await snap();await apply('r',axis,25);const b=await snap();assert.ok(dist(a.A[0],b.A[0])<1e-8);rigid(a.A,b.A);rigid(a.A1,b.A1);assert.notDeepEqual(a.A,b.A);assert.deepEqual(a.B,b.B);}
 result.checks.push('R X/Y/Z fixes actual branch root, keeps all internal distances, and composes rotations');
 const rotated=await snap();await apply('g','',.15);const after=await snap();rigid(rotated.A,after.A);rigid(rotated.A1,after.A1);assert.ok((await mount()).gap<1e-7);
 await page.screenshot({path:path.join(out,'整树GRS挂接旋转.png')});
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),rotated);await page.locator('#redoBtn').click();await wait();assert.deepEqual(await snap(),after);
 result.checks.push('G after rotation retains shape; undo/redo exact');
 const history=await page.evaluate(()=>window.__branchForge.historyState.undo);await page.keyboard.press('g');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);await page.keyboard.type('-.1');await page.keyboard.press('Escape');await idle();await wait();assert.deepEqual(await snap(),after);assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),history);
 await page.keyboard.press('r');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);await page.keyboard.type('40');await page.mouse.click(...await point('A',.7),{button:'right'});await idle();await wait();assert.deepEqual(await snap(),after);
 result.checks.push('Escape and right-click cancel without modifying history');
 // Moving the mouse uses a grab offset: the branch does not jump on G.
 const pointerShift=await page.evaluate(async()=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId==='A'),p=f.asset.masterBranches.find(p=>p.id===b.parentId),{sampleLine}=await import('/tree-sculpt.js'),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,false);const project=t=>{const v=f.asset.group.localToWorld(sampleLine(p.points,t)).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];};const a=project(b.parentT),z=project(.25);return {dx:z[0]-a[0],dy:z[1]-a[1]};});
 pointer=await point('A',.7);await page.mouse.move(...pointer);await page.keyboard.press('g');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);assert.ok((await page.locator('#keyboardTransformHint').textContent()).includes('沿当前母干'));await page.mouse.move(pointer[0]+pointerShift.dx,pointer[1]+pointerShift.dy,{steps:8});await page.mouse.click(pointer[0]+pointerShift.dx,pointer[1]+pointerShift.dy);await idle();await wait();assert.ok(Math.abs((await mount()).t-.25)<1e-6);rigid(after.A,(await snap()).A);
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),after);result.checks.push('mouse G follows projected mother path with no initial jump');
 await apply('s','',1.1);assert.notDeepEqual(await snap(),after);await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),after);result.checks.push('S remains explicit shape scaling and undoable');
 await select('ROOT');await page.keyboard.press('g');assert.equal(await page.evaluate(()=>window.__branchForge.keyboardTransformActive),false);assert.deepEqual(await snap(),after);await select('A');result.checks.push('trunk without carrier cannot accidentally use stretching G');
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='tree-grs.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
 await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'整树GRS保存.branch.json');await download.saveAs(saved);await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='整树GRS验收');await wait();assert.deepEqual(await snap(),after);result.checks.push('actual saved file reload preserves mounted and rotated bundle and connected child');


 const camellia=path.resolve('assets/tree-template-library/template-ea396bae43d74f7fa42ed703724d053b.branch.json');await page.locator('#projectInput').setInputFiles(camellia);await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===577);await wait();
 const unitData=()=>page.evaluate(()=>JSON.stringify([window.__branchForge.authoring.branch_instances,window.__branchForge.authoring.branch_library]));const units=await unitData(),originalFull=await snap();
 await page.locator('#skeletonEditModeBtn').click();await wait();await select('P1');await apply('g','',-.12);await apply('r','z',20);
 assert.equal(await unitData(),units);await page.locator('#skeletonEditModeBtn').click();await wait();assert.equal(await unitData(),units);const full=await snap();assert.deepEqual(Object.keys(full),Object.keys(originalFull));
 for(const id of Object.keys(full))rigid(originalFull[id],full[id]);
 await page.screenshot({path:path.join(out,'山茶GRS完整装配.png')});await page.locator('#undoBtn').click();await wait();await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),originalFull);
 result.checks.push('camellia skeleton G/R then full assembly: all 577 installed units retained, rigid lengths preserved, undo exact');
 assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
