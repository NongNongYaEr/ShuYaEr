const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/branch-radius');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const shape=(id,parent,points)=>({id,parent,points,knots:points,attach:parent==='ROOT'?1:.8,length:3,start_radius:.035,end_radius:.015});
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'枝束挂接验收',seed:42,leaf_density:0,child_count:0,branch_levels:4,wind_strength:0},authoring:{branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,.3],[0,0,.6],[0,0,1]]),shape('A','ROOT',[[0,0,1],[.6,0,1.2],[1.2,0,1.4],[1.8,0,1.5],[2.4,0,1.6],[3,0,1.7]]),shape('A1','A',[[1,0,1.4],[1.4,0,1.8],[1.8,0,2.2],[2.2,0,2.6]]),shape('B','ROOT',[[0,.04,1],[1,.04,1.4],[2,.04,1.8],[3,.04,2.2]])]}}};
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>result.errors.push(e.message));await page.goto(process.argv[2]);console.log('PAGE');await page.waitForFunction(()=>window.__branchForge?.asset);
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 const load=async()=>{await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='枝束挂接验收');await wait();await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(1.5,-9,1.5);f.camera.up.set(0,0,1);f.controls.target.set(1.5,0,1.5);f.controls.update();});};
 const snap=()=>page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
 const select=async id=>{await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'$')})}).click();};
 const tool=key=>page.locator('.viewport-tool-rail [data-viewport-tool="'+key+'"]').click();
 const point=async(id,t=.65)=>page.evaluate(({id,t})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),n=Math.min(b.points.length-2,Math.floor(t*(b.points.length-1))),p=b.points[n].clone().lerp(b.points[n+1],t*(b.points.length-1)-n),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);const v=f.asset.group.localToWorld(p).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},{id,t});
 const drag=async(a,b)=>{await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:12});await page.mouse.up();await wait();};




 const dist=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
 const idle=()=>page.waitForFunction(()=>!window.__branchForge.keyboardTransformActive);
 const apply=async(axis,value)=>{await page.keyboard.press('Alt+s');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);if(axis)await page.keyboard.press(axis);await page.keyboard.type(String(value));await page.keyboard.press('Enter');await idle();await wait();};
 const selectPoint=async(id,index)=>{
   const p=await page.evaluate(({id,index})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);f.camera.updateMatrixWorld(true);const v=f.asset.group.localToWorld(b.controlPoints[index].clone()).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},{id,index});
   await page.screenshot({path:path.join(out,'选点前.png')});
   await page.mouse.click(...p);await wait();
   assert.deepEqual(await page.evaluate(()=>window.__branchForge.selectedCurvePoint),{branchId:id,index});
   const data=await page.evaluate(()=>{const f=window.__branchForge,s=f.selectedCurvePoint;return {pivot:f.bundleState.gizmo.object?.position.toArray(),point:f.asset.masterBranches.find(b=>b.stableId===s.branchId).controlPoints[s.index].toArray()};});
   if(data.pivot)assert.ok(dist(data.pivot,data.point)<1e-8);
 };

 const radii=()=>page.evaluate(async()=>{const {branchRadiusAt}=await import('./branch-shaping.js');const a=window.__branchForge.asset;return Object.fromEntries(a.masterBranches.map(b=>[b.stableId,[0,.2,.4,.6,.8,1].map(t=>branchRadiusAt(b,a.settings,t))]));});
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
 await load();await select('A');await tool('SELECT');
 const original=await snap(),base=await radii();
 await apply('',2);const thick=await radii();assert.deepEqual(await snap(),original);
 for(const id of Object.keys(base))base[id].forEach((v,i)=>near(thick[id][i],v*(['A','A1'].includes(id)?2:1)));
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await radii(),base);
 await page.locator('#redoBtn').click();await wait();assert.deepEqual(await radii(),thick);
 await page.keyboard.press('Alt+s');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);await page.keyboard.type('0');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.__branchForge.keyboardTransformActive),true);await page.keyboard.press('Escape');await idle();assert.deepEqual(await radii(),thick);
 await page.keyboard.press('Alt+s');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);await page.mouse.move(1150,600,{steps:8});await page.keyboard.press('Escape');await idle();assert.deepEqual(await radii(),thick);
 result.checks.push('actual Alt+S whole branch: radius x2; length/shape unchanged; other branches unchanged; undo/redo/cancel and invalid zero');
 await selectPoint('A',2);await apply('',.5);const tail=await radii();assert.deepEqual(await snap(),original);
 for(const t of [0,1,2])near(tail.A[t],thick.A[t]);near(tail.A[5],thick.A[5]*.5);assert.ok(tail.A1[5]>=thick.A1[5]*.5 && tail.A1[5]<thick.A1[5]);assert.deepEqual(tail.B,thick.B);
 await page.screenshot({path:path.join(out,'控制点后段粗细.png')});
 result.checks.push('selected middle point Alt+S changes distal radii and child support only; fixed prefix');
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='radius.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
 await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'粗细保存.branch.json');await download.saveAs(saved);await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='枝束挂接验收');await wait();await select('A');assert.deepEqual(await snap(),original);assert.deepEqual(await radii(),tail);result.checks.push('actual save dialog and page reload retain radius edits and unchanged tree centerlines');

 const camellia=path.resolve('assets/tree-template-library/template-ea396bae43d74f7fa42ed703724d053b.branch.json');await page.locator('#projectInput').setInputFiles(camellia);await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===577);await wait();
 const fullState=()=>page.evaluate(async()=>{
  const a=window.__branchForge.asset,{skeletonBranches}=await import('./skeleton-thickness.js'),bones=new Set(skeletonBranches(a.masterBranches).map(b=>b.stableId)),meshes=[];
  a.group.traverse(m=>{if(m.isMesh && !(['branch','junction','marker'].includes(m.userData.category)&&bones.has(m.userData.stable_id||m.userData.branch_id)))meshes.push(m);});
  const buffers=[];for(const m of meshes)for(const attribute of [...Object.values(m.geometry.attributes),m.instanceMatrix].filter(Boolean)){const buf=attribute.array;buffers.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(buf.buffer,buf.byteOffset,buf.byteLength)))));}
  return {branches:a.masterBranches.map(b=>({id:b.stableId,points:b.points.map(p=>p.toArray()),parent:b.parentT})),foliage:[...a.placements,...a.treeOrgans].map(p=>({id:p.stableId,p:p.position.toArray(),d:p.direction.toArray(),s:p.scale})),buffers,units:JSON.stringify([a.authoring.branch_instances,a.authoring.branch_library])};
 });
 const fullBefore=await fullState(),fullRadii=await radii();await select('P1');await tool('SELECT');
 await page.evaluate(()=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId==='P1'),p=b.controlPoints[2];f.controls.target.copy(p);f.camera.up.set(0,0,1);f.camera.position.copy(p).add(p.clone().set(2,-4,2));f.controls.update();});
 await selectPoint('P1',2);await apply('',1.6);const fullAfter=await radii();near(fullAfter.P1[0],fullRadii.P1[0]);near(fullAfter.P1[5],fullRadii.P1[5]*1.6);
 assert.deepEqual(await fullState(),fullBefore);
 result.counts={instances:577,branches:fullBefore.branches.length,foliage:fullBefore.foliage.length};result.checks.push('full camellia: actual point Alt+S; support thickness changed; every centerline, foliage, sample mesh and instance buffer unchanged');
 await page.screenshot({path:path.join(out,'山茶后段粗细.png')});assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
