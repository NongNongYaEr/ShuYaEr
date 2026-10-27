const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/curve-handle-picking');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
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
 const apply=async(axis,value)=>{await page.keyboard.press('g');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);if(axis)await page.keyboard.press(axis);await page.keyboard.type(String(value));await page.keyboard.press('Enter');await idle();await wait();};
 const selectPoint=async(id,index)=>{
   const p=await page.evaluate(({id,index})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);f.camera.updateMatrixWorld(true);const v=f.asset.group.localToWorld(b.controlPoints[index].clone()).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},{id,index});
   await page.screenshot({path:path.join(out,'选点前.png')});
   await page.mouse.click(...p);await wait();
   assert.deepEqual(await page.evaluate(()=>window.__branchForge.selectedCurvePoint),{branchId:id,index});
   const data=await page.evaluate(()=>{const f=window.__branchForge,s=f.selectedCurvePoint;return {pivot:f.bundleState.gizmo.object?.position.toArray(),point:f.asset.masterBranches.find(b=>b.stableId===s.branchId).controlPoints[s.index].toArray()};});
   if(data.pivot)assert.ok(dist(data.pivot,data.point)<1e-8);
 };

 const screenHandle=async(index)=>page.evaluate(index=>{
  const f=window.__branchForge,r=document.querySelector('#viewport').getBoundingClientRect();let h;
  f.modelRoot.traverse(o=>{if(o.userData.category==='control_point'&&o.userData.branch_id==='A'&&o.userData.point_index===index)h=o;});
  f.camera.updateMatrixWorld(true);h.updateWorldMatrix(true,false);const p=h.getWorldPosition(h.position.clone()),v=p.clone().project(f.camera),view=p.clone().applyMatrix4(f.camera.matrixWorldInverse);
  return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2,radius:h.geometry.parameters.radius*h.scale.x*f.camera.projectionMatrix.elements[5]/(-view.z)*r.height/2};
 },index);
 await load();await tool('SELECT');
 for(const distance of [9,30]){
  await select('A');await page.evaluate(d=>{const f=window.__branchForge;f.camera.position.set(1.5,-d,1.5);f.controls.target.set(1.5,0,1.5);f.controls.update();},distance);
  await page.waitForTimeout(100);const p=await screenHandle(2),before=await snap(),history=await page.evaluate(()=>window.__branchForge.historyState.undo);
  assert.ok(Math.abs(p.radius-5.5)<.1);await page.mouse.move(p.x,p.y+11);
  await page.waitForFunction(()=>document.querySelector('#viewport').dataset.curveHover==='控制点 3');
  await page.mouse.down();await page.mouse.move(p.x+2,p.y+11);await page.mouse.up();await wait();
  assert.deepEqual(await page.evaluate(()=>window.__branchForge.selectedCurvePoint),{branchId:'A',index:2});
  assert.deepEqual(await snap(),before);assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),history);
 }
 result.checks.push('near/far views retain 11px dot diameter; clicks 11px away select intended point, 2px jitter changes no geometry/history; hover highlights correct point');
 await select('A');const p=await screenHandle(2);await page.mouse.move(p.x,p.y+11);await page.mouse.down();await page.mouse.move(p.x+7,p.y+11);await page.waitForTimeout(100);
 const moved=await screenHandle(2);assert.ok(Math.abs(moved.x-p.x-7)<.5);assert.ok(Math.abs(moved.y-p.y)<.5);
 await page.keyboard.press('Escape');await page.mouse.up();await wait();const restored=await screenHandle(2);assert.ok(Math.abs(restored.x-p.x)<.1);
 result.checks.push('expanded-area dragging preserves grab offset (no jump), Escape restores curve');
 await selectPoint('A',2);
 for(const key of ['g','r','s','Alt+s']){await page.keyboard.press(key);await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);await page.keyboard.press('Escape');await idle();}
 await page.mouse.move(p.x,p.y);await page.screenshot({path:path.join(out,'远景控制点.png')});
 result.checks.push('selected point still starts G/R/S/Alt+S');
 assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
