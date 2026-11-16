const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/guide-bundles');fs.mkdirSync(out,{recursive:true});
 const wall=path.join(out,'坡壁走势验收.obj');fs.writeFileSync(wall,'v -4 0 0\nv 4 0 0\nv 4 0 8\nv -4 0 8\nf 1 2 3\nf 1 3 4\n');
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),page=await browser.newPage({viewport:{width:1680,height:1080}}),report={checks:[],errors:[]};page.setDefaultTimeout(90000);page.on('pageerror',e=>report.errors.push(e.message));
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset?.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 const show=async id=>{for(const detail of await page.locator('#'+id).locator('xpath=ancestor::details').all())if(await detail.getAttribute('open')===null)await detail.locator(':scope > summary').click();};
 const read=()=>page.evaluate(()=>{const f=window.__branchForge;return {guides:f.authoring.surface_growth.guides,branches:f.asset.masterBranches.map(b=>({id:b.stableId,points:b.points.map(p=>p.toArray())})),leaves:f.asset.placements.length};});
 const project=points=>page.evaluate(async points=>{const T=await import('/vendor/three.module.min.js'),f=window.__branchForge,r=document.querySelector('#viewport').getBoundingClientRect();return points.map(p=>{const v=new T.Vector3(...p).project(f.camera);return {x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};});},points);
 const draw=async points=>{await page.locator('#surfaceGuidePanel [data-action="draw"]').click();const p=await project(points);await page.mouse.move(p[0].x,p[0].y);await page.mouse.down();for(const q of p.slice(1))await page.mouse.move(q.x,q.y,{steps:14});await page.mouse.up();await wait();};
 const saved=path.join(out,'多走势藤群.branch.json');
 await page.route('**/api/project-session**',route=>route.fulfill({json:{success:true,items:[]}}));
 // Exercise the actual save serializer while replacing only the OS file chooser.
 await page.route('**/api/save-project',async route=>{const payload=route.request().postDataBuffer(),line=payload.indexOf(10),length=Number(payload.subarray(0,line).toString());fs.writeFileSync(saved,payload.subarray(line+1+length));await route.fulfill({json:{success:true,path:saved}});});
 await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'),()=>page.evaluate(()=>document.getElementById('projectSessionPanel').close()));
 try{
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset&&!document.getElementById('brandStartup'));await page.click('#vineWorkspaceBtn');await wait();
  if(await page.locator('#surfaceGrowthPanel .parameter-group-toggle').getAttribute('aria-expanded')==='false')await page.locator('#surfaceGrowthPanel .parameter-group-toggle').click();
  await page.locator('#surfaceFile').setInputFiles(wall);await page.waitForFunction(()=>window.__branchForge.authoring.surface_growth?.mesh.name==='坡壁走势验收.obj');await wait();
  await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(0,-14,4);f.controls.target.set(0,0,4);f.camera.far=Math.max(f.camera.far,100);f.camera.lookAt(f.controls.target);f.camera.updateProjectionMatrix();f.controls.update();});console.log('Imported wall, starting drawing');
  await draw([[-2,0,7],[-2.3,0,5.5],[-1.2,0,4],[-1.5,0,1.3]]);let state=await read();assert.equal(state.guides.length,1);assert.ok(state.guides[0].anchors.length<20);assert.equal(state.guides[0].bundle.count,3);assert.ok(state.leaves>0);
  await draw([[1,0,7],[1.5,0,5],[1,0,2]]);state=await read();assert.equal(state.guides.length,2);const a=state.guides[0].id,b=state.guides[1].id,other=state.branches.filter(x=>x.id.startsWith('S_'+b));assert.ok(other.length);
  report.checks.push('真实鼠标绘制两条不同走势，生成独立藤群及叶片，手绘点已简化');
  await page.locator(`[data-guide="${a}"]`).click();await page.fill('#guideBundleWidth','1.2');await page.locator('#guideBundleWidth').press('Tab');await wait();state=await read();assert.equal(state.guides[0].bundle.width,1.2);assert.deepEqual(state.branches.filter(x=>x.id.startsWith('S_'+b)),other);
  await page.click('#undoBtn');await wait();assert.equal((await read()).guides[0].bundle.width,.45);await page.click('#redoBtn');await wait();assert.equal((await read()).guides[0].bundle.width,1.2);
  const insert=(await project([state.guides[0].anchors[0].point.map((v,i)=>(v+state.guides[0].anchors[1].point[i])/2)]))[0];const controlCount=state.guides[0].anchors.length;await page.mouse.dblclick(insert.x,insert.y);await wait();state=await read();assert.equal(state.guides[0].anchors.length,controlCount+1);report.checks.push('参数撤销/重做与视口双击添加控制点生效');
  const control=await page.evaluate(()=>{const f=window.__branchForge,r=document.querySelector('#viewport').getBoundingClientRect(),dot=f.scene.getObjectByName('SurfaceRouteControls').children.find(o=>o.userData.point===1);const v=dot.position.clone().project(f.camera);return {point:dot.position.toArray(),x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};});
  const dest=(await project([[control.point[0]+.45,0,control.point[2]]]))[0];const before=JSON.stringify(state.guides[0].anchors);await page.mouse.move(control.x,control.y);await page.mouse.down();await page.mouse.move(dest.x,dest.y,{steps:12});await page.mouse.up();await wait();state=await read();assert.notEqual(JSON.stringify(state.guides[0].anchors),before);assert.deepEqual(state.branches.filter(x=>x.id.startsWith('S_'+b)),other);
  report.checks.push('右侧宽度自动生效；实际拖动控制点改变走势，另一束保持不变');
  const handle=await page.evaluate(()=>{const f=window.__branchForge,r=document.querySelector('#viewport').getBoundingClientRect(),dot=f.scene.getObjectByName('SurfaceRouteControls').children.find(o=>o.userData.width);const v=dot.position.clone().project(f.camera);return {point:dot.position.toArray(),x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};});
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+35,handle.y,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();await wait();assert.equal((await read()).guides[0].bundle.width,1.2);
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+35,handle.y,{steps:8});await page.mouse.up();await wait();assert.notEqual((await read()).guides[0].bundle.width,1.2);
  report.checks.push('菱形手柄实际拖动调整宽度，Esc取消保留原值');
  await page.check('#guideBundleLocked');await wait();assert.ok(await page.locator('#guideBundleWidth').isDisabled());await page.uncheck('#guideBundleLocked');await wait();
  await page.uncheck('#guideBundleEnabled');await wait();assert.deepEqual((await read()).branches,other);await page.check('#guideBundleEnabled');await wait();
  await page.locator('#surfaceGuidePanel [data-action="copy"]').click();await wait();assert.equal((await read()).guides.length,3);await page.locator('#surfaceGuidePanel [data-action="delete"]').click();await wait();assert.equal((await read()).guides.length,2);
  report.checks.push('锁定、停用、恢复、复制和删除通过右侧卡片操作生效');
  await page.locator(`[data-guide="${a}"]`).click();await page.screenshot({path:path.join(out,'走势藤群_编辑界面.png')});
  const savedState=(await read()).guides;await page.click('#saveProjectBtn');await page.locator('#projectSaveDialog [value="FILE"]').check();await page.click('#psSubmit');await page.waitForFunction(()=>document.getElementById('psStatus').textContent.includes('已保存工程'));console.log('Interactive edits and serialized file save passed');
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset&&!document.getElementById('brandStartup'));await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.authoring.surface_growth?.mesh.name==='坡壁走势验收.obj');await wait();assert.deepEqual((await read()).guides,savedState);report.checks.push('真实保存文件、页面重启及工程重新载入保留所有走势/宽度/配置');
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(e){report.failure=String(e);await page.screenshot({path:path.join(out,'失败.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
})().catch(e=>{console.error(e);process.exitCode=1;});
