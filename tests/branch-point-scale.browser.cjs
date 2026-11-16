const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/branch-point-scale');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
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
 const apply=async(axis,value)=>{await page.keyboard.press('s');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);if(axis)await page.keyboard.press(axis);await page.keyboard.type(String(value));await page.keyboard.press('Enter');await idle();await wait();};
 const selectPoint=async(id,index)=>{
   const p=await page.evaluate(({id,index})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);f.camera.updateMatrixWorld(true);const v=f.asset.group.localToWorld(b.controlPoints[index].clone()).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},{id,index});
   await page.screenshot({path:path.join(out,'选点前.png')});
   await page.mouse.click(...p);await wait();
   assert.deepEqual(await page.evaluate(()=>window.__branchForge.selectedCurvePoint),{branchId:id,index});
   const data=await page.evaluate(()=>{const f=window.__branchForge,s=f.selectedCurvePoint;return {pivot:f.bundleState.gizmo.object?.position.toArray(),point:f.asset.masterBranches.find(b=>b.stableId===s.branchId).controlPoints[s.index].toArray()};});
   if(data.pivot)assert.ok(dist(data.pivot,data.point)<1e-8);
 };
 await load();await select('A');await tool('SELECT');await selectPoint('A',2);
 const before=await snap(),oldKnots=await page.evaluate(()=>window.__branchForge.asset.masterBranches.find(b=>b.stableId==='A').controlPoints.map(p=>p.toArray()));
 await apply('',.6);const after=await snap(),origin=before.A[2];
 for(let i=0;i<=2;i++)assert.deepEqual(after.A[i],before.A[i]);
 for(let i=3;i<after.A.length;i++)assert.ok(dist(after.A[i],before.A[i].map((x,k)=>origin[k]+(x-origin[k])*.6))<1e-7);
 for(let i=0;i<after.A1.length;i++)assert.ok(dist(after.A1[i],before.A1[i].map((x,k)=>origin[k]+(x-origin[k])*.6))<1e-7);
 assert.deepEqual(after.ROOT,before.ROOT);assert.deepEqual(after.B,before.B);
 const knots=await page.evaluate(()=>window.__branchForge.asset.masterBranches.find(b=>b.stableId==='A').controlPoints.map(p=>p.toArray()));
 assert.equal(knots.length,oldKnots.length);for(let i=0;i<=2;i++)assert.deepEqual(knots[i],oldKnots[i]);
 assert.equal(await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers.at(-1).operation.type),'POINT_SCALE');
 await page.screenshot({path:path.join(out,'中点后段缩放.png')});
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),before);await page.locator('#redoBtn').click();await wait();assert.deepEqual(await snap(),after);
 await page.mouse.move(...await point('A',.7));await page.keyboard.press('s');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);await page.keyboard.press('x');await page.keyboard.type('1.3');await page.keyboard.press('Escape');await idle();assert.deepEqual(await snap(),after);
 result.checks.push('actual middle-point click then S .6: prefix and unrelated branches fixed, distal skeleton scaled, handles recalculated; undo redo and Escape');
 await tool('BUNDLE_SCALE');assert.equal(await page.locator('#bundlePivot').isDisabled(),true);
 const pivot=await page.evaluate(()=>window.__branchForge.bundleState.gizmo.object.position.toArray());assert.ok(dist(pivot,origin)<1e-8);
 await page.locator('#bundleValueX').evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.matches('details'))p.open=true;});
 for(const axis of ['X','Y','Z'])await page.locator('#bundleValue'+axis).fill(axis==='X'?'1.4':'1');
 await page.locator('#applyBundleTransform').click();await wait();assert.equal(await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers.at(-1).operation.type),'POINT_SCALE');
 const numeric=await snap();for(let i=0;i<=2;i++)assert.deepEqual(numeric.A[i],before.A[i]);assert.notDeepEqual(numeric.A,after.A);
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),after);await tool('SELECT');
 await selectPoint('A',3);await page.keyboard.press('r');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);await page.keyboard.press('y');await page.keyboard.type('-15');await page.keyboard.press('Enter');await idle();await wait();
 assert.equal(await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers.at(-1).operation.type),'POINT_ROTATE');
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),after);
 let previous=after;result.checks.push('scale gizmo uses selected point; numeric axis scale and subsequent R at recalculated control point work');
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='point-scale.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
 await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'中点缩放保存.branch.json');await download.saveAs(saved);await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='枝束挂接验收');await wait();assert.deepEqual(await snap(),previous);result.checks.push('actual save dialog and page reload reproduce every branch point');
 // Root selection keeps the established whole-bundle R behavior.
 await select('A');await tool('SELECT');await page.mouse.move(...await point('A',.6));await apply('',1.1);assert.equal(await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers.at(-1).operation.type),'ROOT_SCALE');
 const camellia=path.resolve('assets/tree-template-library/template-ea396bae43d74f7fa42ed703724d053b.branch.json');await page.locator('#projectInput').setInputFiles(camellia);await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===577);await wait();
 const units=await page.evaluate(()=>JSON.stringify([window.__branchForge.authoring.branch_instances,window.__branchForge.authoring.branch_library]));
 const expected=await page.evaluate(async()=>{
   const THREE=await import('/vendor/three.module.min.js'),{evaluatePointScale}=await import('/branch-point-scale.js');
   const f=window.__branchForge,a=f.asset,op={type:'POINT_SCALE',root:'P1',point:2,scale:[.6,.6,.6]},after=evaluatePointScale(a.masterBranches,op),matrices=new Map();
   for(let i=0;i<after.length;i++){const b=after[i],old=a.masterBranches[i];if(b!==old&&b.stableId!=='P1'&&b.mountMatrix)matrices.set(b.stableId,b.mountMatrix.clone().multiply((old.mountMatrix||new THREE.Matrix4()).clone().invert()));}
   return {branches:after.map(b=>({id:b.stableId,points:b.points.map(p=>p.toArray()),radii:[b.startRadius,b.endRadius]})),foliage:[...a.placements,...a.treeOrgans].map(p=>({id:p.stableId,scale:p.scale,position:matrices.has(p.branchStableId)?p.position.clone().applyMatrix4(matrices.get(p.branchStableId)).toArray():p.position.toArray()}))};
 });
 await page.locator('#skeletonEditModeBtn').click();await wait();await select('P1');await tool('SELECT');
 // Camera is fitted around the selected branch; do not touch the user's editor.
 await page.evaluate(()=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId==='P1'),p=b.controlPoints[2];f.controls.target.copy(p);f.camera.up.set(0,0,1);f.camera.position.copy(p).add(p.clone().set(2,-4,2));f.controls.update();});
 await selectPoint('P1',2);await apply('',.6);await page.locator('#skeletonEditModeBtn').click();await wait();
 const actual=await page.evaluate(()=>{const a=window.__branchForge.asset;return {branches:a.masterBranches.map(b=>({id:b.stableId,points:b.points.map(p=>p.toArray()),radii:[b.startRadius,b.endRadius]})),foliage:[...a.placements,...a.treeOrgans].map(p=>({id:p.stableId,scale:p.scale,position:p.position.toArray()}))};});
 assert.equal(actual.branches.length,expected.branches.length);for(let j=0;j<actual.branches.length;j++){const b=actual.branches[j],e=expected.branches[j];assert.equal(b.id,e.id);for(let i=0;i<b.points.length;i++)assert.ok(dist(b.points[i],e.points[i])<2e-5,b.id+' point '+i+' error '+dist(b.points[i],e.points[i]));for(let i=0;i<2;i++)assert.ok(Math.abs(b.radii[i]-e.radii[i])<1e-9);}
 assert.equal(actual.foliage.length,expected.foliage.length);for(let i=0;i<actual.foliage.length;i++){const a=actual.foliage[i],e=expected.foliage[i];assert.equal(a.id,e.id);assert.ok(Math.abs(a.scale-e.scale)<1e-9);assert.ok(dist(a.position,e.position)<2e-5,a.id+' foliage '+dist(a.position,e.position));}
 assert.equal(await page.evaluate(()=>JSON.stringify([window.__branchForge.authoring.branch_instances,window.__branchForge.authoring.branch_library])),units);
 result.counts={instances:577,branches:actual.branches.length,foliage:actual.foliage.length};result.checks.push('real camellia: skeleton-point S then full assembly; all branch points, radii, foliage positions and sizes match rigid local follow; library and instance data unchanged');
 await page.screenshot({path:path.join(out,'山茶中点缩放完整装配.png')});
 assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
