const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// Real UI/pointer/save workflows in an isolated headless context. The source
// library is read-only; every write endpoint below is intercepted into .runtime.
(async()=>{
 const out=path.resolve('.runtime/unit-assembly-orientation');fs.mkdirSync(out,{recursive:true});
 const report={checks:[],errors:[],sourceWrites:[],thumbnailWrites:0},url=process.argv[2]||'http://localhost:19837';
 const folder=path.resolve('次枝资产/全植物次枝成品V1/红叶石楠');
 const file=fs.readdirSync(folder).find(name=>name.includes('短弯细梢')&&name.includes('混合')&&name.endsWith('.branchasset.json'));
 assert.ok(file,'read-only complete real sample exists');
 const original=JSON.parse(fs.readFileSync(path.join(folder,file),'utf8').replace(/^\uFEFF/,'')).asset;
 const calibrated=structuredClone(original);calibrated.id='TEST_ORIENT_CALIBRATED';calibrated.name='整支参考已标定';calibrated.versions=[];calibrated.revision=1;calibrated.shape.connector.hang_direction=[0,0,1];
 const raw=structuredClone(original);raw.id='TEST_ORIENT_UNCALIBRATED';raw.name='整支参考未标定';raw.versions=[];raw.revision=1;delete raw.shape.connector.hang_direction;
 const fixture={format:'ProceduralBranchProject',version:4,settings:{...original.sample.settings,object_name:'完整单元枝方向验收',wind_strength:0,leaf_density:0,max_triangles:8000000,preview_lod:0},leaf_meshes:original.sample.leaf_meshes,
  authoring:{branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,2],[0,0,4]],length:4,start_radius:.08,end_radius:.025}]},branch_library:[calibrated,raw],
   branch_instances:[{id:'ONE',parent:'ROOT',attach:.72,asset_id:calibrated.id,linked:true,angle:75,azimuth:0,scale:1,variation:0,seed:42},
    {id:'TWO',parent:'ROOT',attach:.36,asset_id:calibrated.id,linked:true,angle:75,azimuth:180,scale:1,variation:0,seed:43},
    {id:'RAW',parent:'ROOT',attach:.54,asset_id:raw.id,linked:true,angle:75,azimuth:0,scale:1,variation:0,seed:44}],
   recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},tree_organs:original.sample.authoring.tree_organs}};
 const input=path.join(out,'完整实例方向.branch.json'),saved=path.join(out,'整支翻转保存.branch.json');fs.writeFileSync(input,JSON.stringify(fixture));
 const draft={format:'ProceduralBranchProject',version:4,workspaces:{version:2,active:'BRANCH'},settings:{object_name:'非规范朝向参考标定',wind_strength:0,leaf_density:0,child_count:0,preview_lod:0},
  authoring:{branch_shape:{connector:{position:[1,2,.5],direction:[0,1,0],locked:true},branches:[{id:'DRAFT_ROOT',parent:'',points:[[1,2,.5],[1,2.4,.7],[1,3,1]],length:1.2,start_radius:.06,end_radius:.02}]},workbench:{name:'参考方向标定验收',asset_id:''}}};
 const draftFile=path.join(out,'非规范朝向草稿.branch.json');fs.writeFileSync(draftFile,JSON.stringify(draft));
 let page,storedSource,savedDoc;
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const near=(a,b,epsilon=1e-8)=>{if(Array.isArray(a)){assert.equal(a.length,b.length);a.forEach((v,n)=>near(v,b[n],epsilon));}else if(typeof a==='number')assert.ok(Math.abs(a-b)<epsilon,`${a} ≈ ${b}`);else assert.deepEqual(a,b);};
 async function newPage(){
  const p=await browser.newPage({viewport:{width:1700,height:1100}});p.setDefaultTimeout(90000);p.on('pageerror',error=>report.errors.push(error.stack));
  await p.route('**/api/project-session**',route=>route.fulfill({json:{success:true,items:[]}}));
  await p.route('**/api/branch-thumbnails**',route=>{if(route.request().method()==='GET')return route.continue();report.thumbnailWrites++;return route.fulfill({json:{success:true}});});
  await p.route('**/api/branch-asset',async route=>{
   if(route.request().method()==='GET')return route.continue();
   assert.equal(route.request().method(),'POST','no deletion of source assets');storedSource=route.request().postDataJSON();
   report.sourceWrites.push({id:storedSource.id,name:storedSource.name,revision:storedSource.revision});
   fs.writeFileSync(path.join(out,'标定完整源.branchasset.json'),JSON.stringify({asset:storedSource}));await route.fulfill({json:{success:true}});
  });
  await p.route('**/api/save-project',async route=>{
   const body=route.request().postDataBuffer(),newline=body.indexOf(10),metaBytes=Number(body.subarray(0,newline).toString());
   savedDoc=JSON.parse(body.subarray(newline+1+metaBytes).toString('utf8'));fs.writeFileSync(saved,JSON.stringify(savedDoc));
   await route.fulfill({json:{success:true,path:saved}});
  });
  await p.addLocatorHandler(p.locator('#projectSessionPanel[open]'),()=>p.evaluate(()=>document.getElementById('projectSessionPanel').close()));
  return p;
 }
 const idle=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.getElementById('busyOverlay').hidden&&!document.getElementById('projectLoadDialog').open;});
 const load=async file=>{const old=await page.evaluate(()=>window.__branchForge.asset.group.uuid);await page.locator('#projectInput').setInputFiles(file);await page.waitForFunction(id=>window.__branchForge.asset.group.uuid!==id,old);await idle();};
 const snapshot=()=>page.evaluate(async()=>{
  const f=window.__branchForge,{prepareUnitCombEntries}=await import('/unit-instance-combing.js'),THREE=await import('/vendor/three.module.min.js');
  f.asset.group.updateWorldMatrix(true,true);const entries=prepareUnitCombEntries({authoring:f.authoring,branches:f.asset.masterBranches,settings:f.asset.settings,scope:'ALL'});
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(f.authoring.branch_library)));
  const units=entries.map(entry=>{
   const root=f.asset.masterBranches.find(b=>b.stableId===entry.rootId),axis=entry.longAxis.clone().transformDirection(f.asset.group.matrixWorld),down=new THREE.Vector3(0,0,-1);
   let reference=null,projectionDown=null;
   if(entry.shape.connector.hang_direction){reference=new THREE.Vector3(...entry.shape.connector.hang_direction).transformDirection(entry.frame.matrix).transformDirection(f.asset.group.matrixWorld);
    const side=reference.clone().addScaledVector(axis,-reference.dot(axis)),target=down.clone().addScaledVector(axis,-down.dot(axis));
    if(side.lengthSq()>1e-12&&target.lengthSq()>1e-12)projectionDown=side.normalize().dot(target.normalize());}
   return {id:entry.id,axis:axis.toArray(),downDot:axis.dot(down),reference:reference?.toArray(),projectionDown,
    root:entry.frame.position.clone().applyMatrix4(f.asset.group.matrixWorld).toArray(),tip:root.points.at(-1).clone().applyMatrix4(f.asset.group.matrixWorld).toArray()};
  });
  return {instances:structuredClone(f.authoring.branch_instances),source:Array.from(new Uint8Array(bytes)).join(','),overrides:structuredClone(f.authoring.overrides),layers:structuredClone(f.authoring.sculpt_layers),units,
   bones:f.asset.masterBranches.filter(b=>!b.instanceId&&!b.unitOwner).map(b=>[b.stableId,b.points.map(p=>p.toArray())]),
   wood:f.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray()),b.startRadius,b.endRadius]),
   leaves:f.asset.masterPlacements.map(p=>[p.stableId,p.position.toArray(),p.direction.toArray(),p.source,p.scale]),
   organs:f.asset.treeOrgans.map(p=>[p.stableId,p.position.toArray(),p.direction.toArray(),p.source,p.scale]),history:f.historyState};
 });
 const units=state=>Object.fromEntries(state.units.map(unit=>[unit.id,unit]));
 const invariant=(before,after)=>{
  assert.equal(after.source,before.source);assert.deepEqual(after.overrides,before.overrides);assert.deepEqual(after.layers,before.layers);assert.deepEqual(after.bones,before.bones);
  for(const instance of before.instances){const next=after.instances.find(i=>i.id===instance.id);for(const key of ['id','asset_id','parent','attach','linked','pinned_revision','scale','radius_scale'])assert.deepEqual(next[key],instance[key]);near(units(after)[instance.id].root,units(before)[instance.id].root);}
 };
 const point=()=>page.evaluate(()=>{
  const f=window.__branchForge,c=document.getElementById('viewport'),r=c.getBoundingClientRect(),b=f.asset.masterBranches.find(b=>b.instanceId==='ONE'||b.unitOwner==='ONE');
  f.asset.group.updateWorldMatrix(true,true);f.camera.updateMatrixWorld();
  const v=b.points[Math.floor(b.points.length*.5)].clone().applyMatrix4(f.asset.group.matrixWorld).project(f.camera);
  return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
 });
 const setField=async(id,value)=>page.locator('#'+id).evaluate((element,v)=>{element.value=String(v);element.dispatchEvent(new Event('input',{bubbles:true}));},value);
 const configure=async(direction)=>{
  await page.locator('#branchEditScopeBar [data-tree-selection-kind="INSTANCE"]').click();await page.locator('#viewport').focus();await page.keyboard.press('c');
  await page.locator('#branchEditScope').selectOption('ALL');await page.locator('#unitCombOrientation').selectOption(direction);
  await setField('sculptRadius',300);await setField('sculptStrength',.95);await setField('sculptScope','THROUGH');await setField('sculptHardness',.9);
 };
 const stroke=async(sign=1,cancel=false)=>{
  const p=await point();await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForFunction(()=>window.__branchForge.unitComb.active);
  await page.mouse.move(p.x+sign*150,p.y-sign*25,{steps:24});await page.waitForTimeout(65);
  if(cancel)await page.keyboard.press('Escape');await page.mouse.up();await idle();
 };
 const camera=async(reverse=false)=>page.evaluate(reverse=>{const f=window.__branchForge;f.camera.position.set(0,reverse?8:-8,2);f.camera.up.set(0,0,1);f.controls.target.set(0,0,2);f.controls.enableDamping=false;f.controls.update();},reverse);
 try{
  page=await newPage();await page.goto(url);await idle();await load(input);await camera();await configure('DOWN');
  assert.equal(await page.locator('#unitCombOrientationRow').isVisible(),true);
  const initial=await snapshot();assert.equal(initial.instances.length,3);assert.ok(initial.leaves.length&&initial.organs.length,'complete real wood/leaf/flower sample is present');
  await stroke(1);const forward=await snapshot();invariant(initial,forward);assert.equal(forward.history.undo,initial.history.undo+1);
  for(const id of ['ONE','TWO','RAW'])assert.ok(units(forward)[id].downDot>units(initial)[id].downDot,'DOWN points each complete axis closer to world -Z');
  await page.locator('#viewport').focus();await page.keyboard.press('Control+z');await idle();near((await snapshot()).wood,initial.wood);
  await stroke(-1);const reverse=await snapshot();invariant(initial,reverse);
  for(const id of ['ONE','TWO','RAW'])assert.ok(units(reverse)[id].downDot>units(initial)[id].downDot,'reversed stroke still has the world-down target');
  report.down={initial:initial.units,forward:forward.units,reversed:reverse.units};
  report.checks.push('real DOWN strokes and reversed strokes move complete unit axes toward world -Z; roots, dimensions, sources and skeleton remain exact; one stroke is one undo');
  await page.locator('#viewport').focus();await page.keyboard.press('Control+z');await idle();await camera(true);
  await stroke(1);const otherView=await snapshot();invariant(initial,otherView);assert.ok(units(otherView).ONE.downDot>units(initial).ONE.downDot);
  report.checks.push('opposite camera view retains the physical world-down target');
  await page.locator('#viewport').focus();await page.keyboard.press('Control+z');await idle();await camera();await configure('ROLL');
  const rollStart=await snapshot();await page.mouse.move((await point()).x,(await point()).y);
  await page.waitForFunction(()=>document.getElementById('unitCombFeedback').textContent.includes('未标定悬垂方向'));
  assert.match(await page.locator('#unitCombFeedback').innerText(),/2 支受影响/);
  for(const sign of [1,-1,1]){const before=await snapshot();await stroke(sign);const after=await snapshot();invariant(before,after);
   for(const id of ['ONE','TWO']){near(units(after)[id].axis,units(before)[id].axis);near(units(after)[id].tip,units(before)[id].tip);assert.ok(units(after)[id].projectionDown>units(before)[id].projectionDown,'calibrated model side turns downward without turning the long axis');}
   assert.deepEqual(after.instances.find(i=>i.id==='RAW'),before.instances.find(i=>i.id==='RAW'),'missing reference is skipped');assert.equal(after.history.undo,before.history.undo+1);
  }
  const rolled=await snapshot();assert.ok(units(rolled).ONE.projectionDown>.65,'successive complete rolls converge to the hanging reference facing downward');
  assert.notDeepEqual(rolled.leaves,rollStart.leaves);assert.notDeepEqual(rolled.organs,rollStart.organs);
  await page.screenshot({path:path.join(out,'整支翻转与未标定提示.png')});
  report.roll={initial:rollStart.units,after:rolled.units};report.checks.push('ROLL uses calibrated complete-source reference, fixes root/tip/long axis and skips the uncalibrated complete source with an explicit workbench hint');
  await stroke(-1,true);const cancelled=await snapshot();assert.deepEqual(cancelled.instances,rolled.instances);near(cancelled.wood,rolled.wood);assert.deepEqual(cancelled.history,rolled.history);
  await page.locator('#viewport').focus();await page.keyboard.press('Control+z');await idle();await page.keyboard.press('Control+y');await idle();const redone=await snapshot();assert.deepEqual(redone.instances,rolled.instances);near(redone.wood,rolled.wood);
  report.checks.push('Escape cancels a whole roll preview; undo/redo restores complete wood, leaves and flowers');
  await page.locator('#saveProjectBtn').click();await page.locator('input[name="saveMode"][value="FILE"]').check();await page.locator('#psSubmit').click();
  await page.waitForFunction(()=>document.getElementById('psStatus').textContent.startsWith('已保存工程'));await page.locator('#psCancel').click();
  assert.ok(savedDoc);assert.deepEqual(savedDoc.authoring.branch_instances,rolled.instances);
  await page.close();page=await newPage();await page.goto(url);await idle();await load(saved);
  const reloaded=await snapshot();assert.deepEqual(reloaded.instances,rolled.instances);assert.equal(reloaded.source,rolled.source);near(reloaded.wood,rolled.wood);near(reloaded.leaves,rolled.leaves);near(reloaded.organs,rolled.organs);
  const plan=await page.evaluate(async()=>{const f=window.__branchForge,{resolvePveExportPlan}=await import('/pve-export-plan.js');return resolvePveExportPlan(f.asset,f.authoring).units.map(unit=>({id:unit.sourceInstance.id,source:unit.sourceInstance.asset_id,variant:unit.variantRequired}));});
  assert.equal(plan.length,3);assert.equal(new Set(plan.map(item=>item.source)).size,2);assert.ok(plan.every(item=>item.variant===false));
  assert.equal(plan.find(item=>item.id==='ONE').source,plan.find(item=>item.id==='TWO').source);
  report.pve=plan;report.checks.push('actual save UI generated bytes reload in a fresh browser context; three complete instances reuse two source models with zero private PVE variants');
  await load(draftFile);assert.equal(await page.evaluate(()=>window.__branchForge.workbench.mode),'BRANCH');
  assert.equal(await page.locator('#unitCombOrientationRow').isVisible(),false);
  for(const details of await page.locator('details').filter({has:page.locator('#wbHangDirection')}).all())
   if(!await details.evaluate(e=>e.open))await details.locator(':scope > summary').click();
  const draftBefore=await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring.branch_shape.branches));
  await page.locator('#wbHangDirection').selectOption('Z');await idle();
  assert.deepEqual(await page.evaluate(()=>window.__branchForge.authoring.branch_shape.connector.hang_direction),[0,0,1]);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring.branch_shape.branches)),draftBefore);
  const calibration=await page.evaluate(async()=>{
   const f=window.__branchForge,THREE=await import('/vendor/three.module.min.js'),{captureBranchShape}=await import('/branch-workbench-data.js');
   const captured=captureBranchShape(f.asset.masterBranches,f.asset.masterBranches[0].stableId,true);
   const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...captured.source.frame.direction),new THREE.Vector3(1,0,0));
   const arrows=[];f.modelRoot.traverse(o=>{if(o.line?.material?.color?.getHex()===0x86c7bc&&o.cone)arrows.push({position:o.position.toArray(),direction:new THREE.Vector3(0,1,0).applyQuaternion(o.quaternion).toArray()});});
   return {expected:new THREE.Vector3(0,0,1).applyQuaternion(q).normalize().toArray(),frame:captured.source.frame,arrows};
  });
  assert.equal(calibration.arrows.length,1);near(calibration.arrows[0].position,[1,2,.5]);near(calibration.arrows[0].direction,[0,0,1]);
  await page.screenshot({path:path.join(out,'工作台完整模型悬垂参考箭头.png')});
  await page.locator('#branchWorkflowASSETS').click();await page.locator('#wbAssetName').fill('方向标定生成测试素材');await page.locator('#wbSaveCopy').click();
  await page.waitForFunction(()=>!window.__branchForge.workbench.busy);assert.ok(storedSource,'actual source save request was captured');
  near(storedSource.shape.connector.hang_direction,calibration.expected);near(storedSource.sample.authoring.branch_shape.connector.hang_direction,calibration.expected);
  assert.notDeepEqual(storedSource.shape.connector.hang_direction,[0,0,1],'noncanonical source normalization rotates the direction instead of copying raw XYZ');
  report.calibration={...calibration,saved:storedSource.shape.connector.hang_direction};
  const sourceReload={format:'ProceduralBranchProject',version:4,workspaces:{version:2,active:'BRANCH'},settings:{...storedSource.sample.settings,object_name:'已标定源真实重载'},leaf_meshes:storedSource.sample.leaf_meshes,
   authoring:{...storedSource.sample.authoring,branch_shape:storedSource.shape,branch_library:[storedSource],workbench:{name:storedSource.name,asset_id:storedSource.id}}};
  const reloadSourceFile=path.join(out,'标定源重载.branch.json');fs.writeFileSync(reloadSourceFile,JSON.stringify(sourceReload));
  await page.close();page=await newPage();await page.goto(url);await idle();await load(reloadSourceFile);
  near(await page.evaluate(()=>window.__branchForge.authoring.branch_shape.connector.hang_direction),calibration.expected);
  assert.equal(await page.locator('#wbHangDirection').inputValue(),'CUSTOM');
  report.checks.push('BRANCH UI sets a complete-model reference arrow without changing geometry; actual save/captureDraft rotates the vector into normalized source coordinates and a fresh context reload preserves it');
  assert.equal(report.sourceWrites.length,1,'one generated source request, no formal library writes');assert.deepEqual(report.errors,[]);report.passed=true;
  console.log(JSON.stringify({passed:true,checks:report.checks,pve:report.pve,report:path.join(out,'验收.json')},null,2));
 }catch(error){report.failure=error.stack;try{await page?.screenshot({path:path.join(out,'失败.png')});}catch{}throw error;}
 finally{fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
