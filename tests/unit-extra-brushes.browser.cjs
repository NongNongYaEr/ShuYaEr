const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// Headless, isolated real UI gestures. Formal source assets are read-only;
// save/thumbnail requests are captured rather than sent to the native server.
(async()=>{
 const out=path.resolve('.runtime/unit-extra-brushes');fs.mkdirSync(out,{recursive:true});
 const report={checks:[],errors:[],sourceWrites:[],thumbnailWrites:0},url=process.argv[2]||'http://localhost:19837';
 const folder=path.resolve('次枝资产/全植物次枝成品V1/红叶石楠');
 const name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));
 assert(name,'real mixed complete Photinia source exists');
 const source=JSON.parse(fs.readFileSync(path.join(folder,name),'utf8').replace(/^\uFEFF/,'')).asset;
 const fixture={format:'ProceduralBranchProject',version:4,
  settings:{...source.sample.settings,object_name:'完整单元枝五种笔刷验收',leaf_density:0,wind_strength:0,preview_lod:0,max_triangles:8000000},
  leaf_meshes:source.sample.leaf_meshes,
  authoring:{branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,2],[0,0,4]],length:4,start_radius:.08,end_radius:.025}]},
   branch_library:[source],branch_instances:[
    {id:'ONE',attach:.28,angle:75,azimuth:0,roll:10,scale:1,seed:42},
    {id:'TWO',attach:.48,angle:70,azimuth:150,roll:20,scale:.85,seed:43},
    {id:'THREE',attach:.68,angle:65,azimuth:260,roll:-15,scale:.9,seed:44},
    {id:'LOCKED',attach:.85,angle:75,azimuth:0,roll:0,scale:1,seed:45,assembly_locked:true},
   ].map(i=>({...i,parent:'ROOT',asset_id:source.id,linked:true,pinned_revision:source.revision,variation:0})),
   recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},tree_organs:source.sample.authoring.tree_organs}};
 const input=path.join(out,'真实完整枝小工程.branch.json'),saved=path.join(out,'五种整支笔刷保存.branch.json');
 fs.writeFileSync(input,JSON.stringify(fixture));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 let page,savedDoc;
 const near=(a,b,epsilon=1e-7)=>{
  if(Array.isArray(a)){assert.equal(a.length,b.length);a.forEach((v,n)=>near(v,b[n],epsilon));}
  else if(typeof a==='number')assert.ok(Math.abs(a-b)<epsilon,`${a} ≈ ${b}`);
  else assert.deepEqual(a,b);
 };
 const dot=(a,b)=>a.reduce((sum,v,n)=>sum+v*b[n],0);
 const direction=(point,origin)=>{const d=point.map((v,n)=>v-origin[n]),length=Math.hypot(...d);assert(length>1e-9);return d.map(v=>v/length);};
 const rotationAngle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(dot(a,b))))*180/Math.PI;
 const repeatRecords=(actual,expected)=>{
  let drift=0;
  const compare=(a,b)=>{
   assert.equal(typeof a,typeof b);
   if(typeof a==='number'){assert.ok(Number.isFinite(a)&&Number.isFinite(b));drift=Math.max(drift,Math.abs(a-b));assert.ok(Math.abs(a-b)<=1e-9,'seed repeat numeric drift exceeds projection roundoff');}
   else if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a),Object.keys(b));for(const key of Object.keys(a))compare(a[key],b[key]);}
   else assert.deepEqual(a,b);
  };
  compare(actual,expected);return drift;
 };
 const ids=['ONE','TWO','THREE'];
 async function newPage(){
  const p=await browser.newPage({viewport:{width:1700,height:1100}});p.setDefaultTimeout(90000);
  p.on('pageerror',error=>report.errors.push(error.stack));
  await p.route('**/api/project-session**',route=>route.fulfill({json:{success:true,items:[]}}));
  await p.route('**/api/branch-thumbnails**',route=>{
   if(route.request().method()==='GET')return route.continue();report.thumbnailWrites++;return route.fulfill({json:{success:true}});
  });
  await p.route('**/api/branch-asset**',route=>{
   if(route.request().method()==='GET')return route.continue();
   report.sourceWrites.push({url:route.request().url(),method:route.request().method()});return route.fulfill({status:409,json:{success:false,error:'验收禁止改写正式源素材'}});
  });
  await p.route('**/api/save-project',async route=>{
   const body=route.request().postDataBuffer(),newline=body.indexOf(10),metaBytes=Number(body.subarray(0,newline).toString());
   savedDoc=JSON.parse(body.subarray(newline+1+metaBytes).toString('utf8'));fs.writeFileSync(saved,JSON.stringify(savedDoc));
   await route.fulfill({json:{success:true,path:saved}});
  });
  await p.addLocatorHandler(p.locator('#projectSessionPanel[open]'),()=>p.evaluate(()=>document.getElementById('projectSessionPanel').close()));
  return p;
 }
 const idle=()=>page.waitForFunction(()=>{
  const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.asset.group.userData.pending_rebuild
   &&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.getElementById('busyOverlay').hidden&&!document.getElementById('projectLoadDialog').open;
 });
 const load=async file=>{const uuid=await page.evaluate(()=>window.__branchForge.asset.group.uuid);await page.locator('#projectInput').setInputFiles(file);await page.waitForFunction(id=>window.__branchForge.asset.group.uuid!==id,uuid);await idle();};
 const snapshot=()=>page.evaluate(async()=>{
  const f=window.__branchForge,THREE=await import('/vendor/three.module.min.js');
  const {resolveInstanceShape}=await import('/branch-workbench-data.js'),{evaluatedInstanceFrame}=await import('/branch-instance-operations.js');
  f.asset.group.updateWorldMatrix(true,true);
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).join(',');
  const units=Object.fromEntries(f.authoring.branch_instances.map(i=>{
   const shape=resolveInstanceShape(i,f.authoring.branch_library),frame=evaluatedInstanceFrame(i,shape,f.asset.masterBranches,f.asset.settings);
   const root=f.asset.masterBranches.find(b=>b.instanceId===i.id&&b.stableId===i.id+'.'+shape.branches.find(b=>!b.parent).id);
   const position=frame.position.clone().applyMatrix4(f.asset.group.matrixWorld),matrix=f.asset.group.matrixWorld.clone().multiply(frame.matrix);
   const q=new THREE.Quaternion();matrix.decompose(new THREE.Vector3(),q,new THREE.Vector3());
   return [i.id,{root:position.toArray(),rootLocal:frame.position.toArray(),axis:root.points.at(-1).clone().applyMatrix4(f.asset.group.matrixWorld).sub(position).normalize().toArray(),quaternion:q.normalize().toArray()}];
  }));
  return {instances:structuredClone(f.authoring.branch_instances),units,source:await hash(f.authoring.branch_library),document:await hash(f.authoring),
   selection:f.workbench.instances.selectionOwners().map(i=>i.id).sort(),references:structuredClone(f.unitComb.debug.references),
   overrides:structuredClone(f.authoring.overrides),layers:structuredClone(f.authoring.sculpt_layers),history:f.historyState,
   bones:f.asset.masterBranches.filter(b=>!b.instanceId&&!b.unitOwner).map(b=>[b.stableId,b.points.map(p=>p.toArray()),b.startRadius,b.endRadius]),
   wood:f.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray()),b.startRadius,b.endRadius,b.length]),
   leaves:f.asset.masterPlacements.map(p=>[p.stableId,p.position.toArray(),p.direction.toArray(),p.source,p.scale]),
   organs:f.asset.treeOrgans.map(p=>[p.stableId,p.position.toArray(),p.direction.toArray(),p.source,p.scale])};
 });
 const unchangedContents=(before,after,allowSize=false)=>{
  assert.equal(after.source,before.source);assert.deepEqual(after.overrides,before.overrides);assert.deepEqual(after.layers,before.layers);assert.deepEqual(after.bones,before.bones);
  assert.deepEqual(after.selection,before.selection,'brush never substitutes a selection');
  for(const item of before.instances){
   const next=after.instances.find(i=>i.id===item.id);
   for(const key of ['id','asset_id','parent','attach','linked','pinned_revision','radius_scale',...(allowSize?[]:['scale'])])assert.deepEqual(next[key],item[key]);
   near(after.units[item.id].root,before.units[item.id].root);
  }
  assert.deepEqual(after.instances.find(i=>i.id==='LOCKED'),before.instances.find(i=>i.id==='LOCKED'),'locked instance remains unchanged');
  near(after.wood.filter(b=>b[0].startsWith('LOCKED.')),before.wood.filter(b=>b[0].startsWith('LOCKED.')));
  near(after.leaves.filter(p=>p[0].startsWith('LOCKED.')),before.leaves.filter(p=>p[0].startsWith('LOCKED.')));
  near(after.organs.filter(p=>p[0].startsWith('LOCKED.')),before.organs.filter(p=>p[0].startsWith('LOCKED.')));
 };
 const angleLimited=(before,after)=>{for(const id of ids)assert.ok(rotationAngle(before.units[id].quaternion,after.units[id].quaternion)<=25+1e-5,`${id} exceeds per-stroke 25° limit`);};
 const screenPoint=(id='ONE',t=.55)=>page.evaluate(({id,t})=>{
  const f=window.__branchForge,c=document.getElementById('viewport'),r=c.getBoundingClientRect();
  const branch=id==='ROOT'?f.asset.masterBranches.find(b=>b.stableId==='ROOT'):f.asset.masterBranches.find(b=>b.instanceId===id||b.unitOwner===id);
  const sample=t*(branch.points.length-1),n=Math.min(branch.points.length-2,Math.floor(sample));
  f.asset.group.updateWorldMatrix(true,true);f.camera.updateMatrixWorld();
  const p=branch.points[n].clone().lerp(branch.points[n+1],sample-n).applyMatrix4(f.asset.group.matrixWorld).project(f.camera);
  return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
 },{id,t});
 const field=async(id,value)=>page.locator('#'+id).evaluate((element,v)=>{
  element.value=String(v);element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
 },value);
 const effect=async value=>{
  await page.locator('#unitBrushEffect').selectOption(value);assert.equal(await page.locator('#quick_unitBrushEffect').inputValue(),value);
  assert.equal(await page.locator('#unitCombOrientationRow').isVisible(),value==='TURN');
  for(const [id,shown] of [['unitBrushSample',['ALIGN']],['unitBrushCenter',['SPREAD']],['unitBrushAngleLimit',['SPREAD','JITTER']],['unitBrushSizeLimit',['SCALE']],['unitBrushSeed',['JITTER']]])
   assert.equal(await page.locator('#'+id).isVisible(),shown.includes(value),`${id} visibility follows ${value}`);
 };
 const stroke=async({sign=1,cancel=false,at=null}={})=>{
  const p=at||await screenPoint();await page.mouse.move(p.x,p.y);await page.mouse.down();
  await page.waitForFunction(()=>window.__branchForge.unitComb.active);
  await page.mouse.move(p.x+sign*150,p.y-35,{steps:24});await page.waitForTimeout(70);
  if(cancel)await page.keyboard.press('Escape');await page.mouse.up();await idle();
 };
 const undo=async()=>{await page.locator('#viewport').focus();await page.keyboard.press('Control+z');await idle();};
 const sameGeometry=(before,after)=>{assert.deepEqual(after.instances,before.instances);near(after.wood,before.wood);near(after.leaves,before.leaves);near(after.organs,before.organs);};
 function uniformSize(before,after,grow){
  unchangedContents(before,after,true);
  let changed=0;
  for(const id of ids){
   const prior=before.instances.find(i=>i.id===id),next=after.instances.find(i=>i.id===id),factor=next.scale/prior.scale;
   assert.ok(grow?factor>=1-1e-8&&factor<=1.2+1e-6:factor<=1+1e-8&&factor>=.8-1e-6,`${id} exceeds 20% size limit`);
   if(Math.abs(factor-1)>1e-7)changed++;
   near(after.units[id].axis,before.units[id].axis);near(after.units[id].quaternion,before.units[id].quaternion);
   const root=before.units[id].rootLocal,scalePoint=p=>p.map((v,n)=>root[n]+(v-root[n])*factor);
   const branches=before.wood.filter(b=>b[0].startsWith(id+'.')),updated=after.wood.filter(b=>b[0].startsWith(id+'.'));
   assert.equal(updated.length,branches.length);
   for(let n=0;n<branches.length;n++){assert.equal(updated[n][0],branches[n][0]);near(updated[n][1],branches[n][1].map(scalePoint));near(updated[n][2],branches[n][2]*factor);near(updated[n][3],branches[n][3]*factor);near(updated[n][4],branches[n][4]*factor);}
   for(const kind of ['leaves','organs']){
    const original=before[kind].filter(p=>p[0].startsWith(id+'.')),scaled=after[kind].filter(p=>p[0].startsWith(id+'.'));
    assert.equal(scaled.length,original.length);assert.ok(original.length>0,`real ${kind} present on ${id}`);
    for(let n=0;n<original.length;n++){assert.equal(scaled[n][0],original[n][0]);near(scaled[n][1],scalePoint(original[n][1]));near(scaled[n][2],original[n][2]);assert.equal(scaled[n][3],original[n][3]);near(scaled[n][4],original[n][4]*factor);}
   }
  }
  assert.ok(changed>0,'size brush actually changes complete units');
 }
 try{
  page=await newPage();await page.goto(url);await idle();await load(input);
  await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(0,-7,2);f.camera.up.set(0,0,1);f.controls.target.set(0,0,2);f.controls.enableDamping=false;f.controls.update();});
  await page.locator('#branchEditScopeBar [data-tree-selection-kind="INSTANCE"]').click();await page.locator('#viewport').focus();await page.keyboard.press('c');
  await page.locator('#branchEditScope').selectOption('ALL');await field('sculptRadius',650);await field('sculptStrength',1);await field('sculptHardness',1);await field('sculptScope','THROUGH');
  await field('unitBrushAngleLimit',25);await field('unitBrushSizeLimit',20);await field('unitBrushSeed',1);
  assert.ok(await page.locator('#unitBrushEffect').isVisible(),'effect selector visible in complete-unit C brush context');
  const initial=await snapshot();assert.equal(initial.instances.length,4);assert.ok(initial.leaves.length&&initial.organs.length,'actual source wood/leaves/flowers render');

  await effect('TURN');await page.locator('#unitCombOrientation').selectOption('DRAG');await stroke();
  const turned=await snapshot();unchangedContents(initial,turned);assert.equal(turned.history.undo,initial.history.undo+1);assert.notDeepEqual(turned.instances,initial.instances);
  report.turn={before:initial.units,after:turned.units};await undo();sameGeometry(initial,await snapshot());
  report.checks.push('TURN retains its existing real mouse combing behavior, changes whole instances only, protects the locked unit, and creates exactly one undo');

  await effect('ALIGN');const beforeSample=await snapshot(),samplePoint=await screenPoint('ONE');
  await page.locator('#unitBrushSample').click();await page.waitForFunction(()=>window.__branchForge.unitComb.debug.picking==='SAMPLE');
  await page.mouse.click(samplePoint.x,samplePoint.y);await idle();
  const sampled=await snapshot();assert.equal(sampled.document,beforeSample.document);assert.deepEqual(sampled.history,beforeSample.history);assert.deepEqual(sampled.selection,beforeSample.selection);
  assert.ok(sampled.references.sampleDirectionWorld,'actual click captured a world-space complete axis');near(sampled.references.sampleDirectionWorld,beforeSample.units.ONE.axis,1e-6);
  await stroke();const aligned=await snapshot();unchangedContents(beforeSample,aligned);
  for(const id of ['TWO','THREE'])assert.ok(dot(aligned.units[id].axis,sampled.references.sampleDirectionWorld)>dot(beforeSample.units[id].axis,sampled.references.sampleDirectionWorld)+1e-6,`${id} aligns closer to the sampled complete axis`);
  assert.equal(aligned.history.undo,beforeSample.history.undo+1);await undo();sameGeometry(initial,await snapshot());
  report.align={reference:sampled.references.sampleDirectionWorld,before:beforeSample.units,after:aligned.units};
  report.checks.push('actual sample button + mouse pick captures one complete model axis without changing selection/document/history; ALIGN moves other complete models closer while preserving roots and sizes');

  await effect('SPREAD');await page.locator('#unitBrushSpreadMode').selectOption('OUT');const beforeCenter=await snapshot();
  await page.locator('#unitBrushCenter').click();await page.waitForFunction(()=>window.__branchForge.unitComb.debug.picking==='CENTER');
  const centerPoint=await screenPoint('ROOT',.06);await page.mouse.click(centerPoint.x,centerPoint.y);await idle();
  const centered=await snapshot();assert.equal(centered.document,beforeCenter.document);assert.deepEqual(centered.history,beforeCenter.history);assert.deepEqual(centered.selection,beforeCenter.selection);assert.ok(centered.references.centerPointWorld);
  await stroke();const spread=await snapshot();unchangedContents(beforeCenter,spread);angleLimited(beforeCenter,spread);
  for(const id of ids){const target=direction(beforeCenter.units[id].root,centered.references.centerPointWorld);assert.ok(dot(spread.units[id].axis,target)>dot(beforeCenter.units[id].axis,target)+1e-6,`${id} spreads away from fixed center`);}
  near(spread.references.centerPointWorld,centered.references.centerPointWorld);assert.equal(spread.history.undo,beforeCenter.history.undo+1);
  await page.screenshot({path:path.join(out,'取样轴与固定中心散开.png')});await undo();sameGeometry(initial,await snapshot());
  await page.locator('#unitBrushSpreadMode').selectOption('IN');const beforeIn=await snapshot();await stroke();const gathered=await snapshot();
  unchangedContents(beforeIn,gathered);angleLimited(beforeIn,gathered);
  for(const id of ids){const target=direction(centered.references.centerPointWorld,beforeIn.units[id].root);assert.ok(dot(gathered.units[id].axis,target)>dot(beforeIn.units[id].axis,target)+1e-6,`${id} gathers toward fixed center`);}
  near(gathered.references.centerPointWorld,centered.references.centerPointWorld);assert.equal(gathered.history.undo,beforeIn.history.undo+1);await undo();sameGeometry(initial,await snapshot());
  report.spread={center:centered.references.centerPointWorld,before:beforeCenter.units,out:spread.units,in:gathered.units};
  report.checks.push('actual fixed-center pick remains transient; OUT spreads away and IN gathers toward that fixed point, each with a 25° cap per stroke and one undo');

  await effect('SCALE');await page.locator('#unitBrushSizeMode').selectOption('GROW');const beforeGrow=await snapshot();await stroke();
  const grown=await snapshot();uniformSize(beforeGrow,grown,true);assert.equal(grown.history.undo,beforeGrow.history.undo+1);await undo();sameGeometry(initial,await snapshot());
  await page.locator('#unitBrushSizeMode').selectOption('SHRINK');const beforeShrink=await snapshot();await stroke();const shrunk=await snapshot();uniformSize(beforeShrink,shrunk,false);await undo();sameGeometry(initial,await snapshot());
  report.scale={before:beforeGrow.instances,grown:grown.instances,shrunk:shrunk.instances};
  report.checks.push('GROW and SHRINK scale every real wood point/radius/length and leaf/flower position/size uniformly around its own root, preserve axes and source IDs, respect 20% per-stroke limit and locked instance');

  await effect('JITTER');await field('unitBrushSeed',1);const jitterStart=await snapshot(),jitterPoint=await screenPoint();await stroke({at:jitterPoint});
  const firstJitter=await snapshot();unchangedContents(jitterStart,firstJitter);angleLimited(jitterStart,firstJitter);assert.notDeepEqual(firstJitter.instances,jitterStart.instances);await undo();sameGeometry(initial,await snapshot());
  await stroke({at:jitterPoint});const repeatedJitter=await snapshot(),repeatDrift=repeatRecords(repeatedJitter.instances,firstJitter.instances);near(repeatedJitter.wood,firstJitter.wood,1e-9);near(repeatedJitter.leaves,firstJitter.leaves,1e-9);near(repeatedJitter.organs,firstJitter.organs,1e-9);await undo();
  const beforeShuffle=await snapshot(),oldSeed=await page.locator('#unitBrushSeed').inputValue();await page.locator('#unitBrushShuffle').click();
  const newSeed=await page.locator('#unitBrushSeed').inputValue(),afterShuffle=await snapshot();assert.notEqual(newSeed,oldSeed);assert.equal(afterShuffle.document,beforeShuffle.document);assert.deepEqual(afterShuffle.history,beforeShuffle.history);assert.deepEqual(afterShuffle.selection,beforeShuffle.selection);
  await stroke({at:jitterPoint});const shuffled=await snapshot();assert.notDeepEqual(shuffled.instances,firstJitter.instances,'different transient seed produces a different whole-unit arrangement');unchangedContents(beforeShuffle,shuffled);angleLimited(beforeShuffle,shuffled);
  report.jitter={seed1:firstJitter.instances,repeated:repeatedJitter.instances,maxNumericRoundoff:repeatDrift,newSeed,shuffled:shuffled.instances};
  report.checks.push('fixed-seed JITTER repeats identities exactly and every saved numeric value/actual wood/leaf/flower pose within 1e-9 projection roundoff; shuffle changes transient seed only and its next stroke changes the arrangement');

  await stroke({cancel:true});const cancelled=await snapshot();sameGeometry(shuffled,cancelled);assert.deepEqual(cancelled.history,shuffled.history);
  await undo();await page.locator('#viewport').focus();await page.keyboard.press('Control+y');await idle();const redone=await snapshot();sameGeometry(shuffled,redone);
  await effect('ALIGN');const beforePickCancel=await snapshot();await page.locator('#unitBrushSample').click();await page.locator('#viewport').focus();await page.keyboard.press('Escape');
  const afterPickCancel=await snapshot();assert.equal(await page.evaluate(()=>window.__branchForge.unitComb.debug.picking),'');assert.equal(afterPickCancel.document,beforePickCancel.document);assert.deepEqual(afterPickCancel.history,beforePickCancel.history);
  report.checks.push('Escape cancels the entire live brush without new undo; undo/redo restores complete contents; Escape also cancels reference picking without modifying the project');

  // Keep a real size edit and then a real rotation edit in the delivered save.
  // Earlier grow/shrink and seed checks deliberately returned to the baseline.
  await effect('SCALE');await page.locator('#unitBrushSizeMode').selectOption('GROW');const beforeFinalSize=await snapshot();await stroke();
  const finalSize=await snapshot();uniformSize(beforeFinalSize,finalSize,true);
  await effect('JITTER');await field('unitBrushSeed',1);await stroke();const finalState=await snapshot();
  unchangedContents(finalSize,finalState);angleLimited(finalSize,finalState);assert.notDeepEqual(finalState.instances,finalSize.instances);
  assert.ok(ids.some(id=>finalState.instances.find(i=>i.id===id).scale>initial.instances.find(i=>i.id===id).scale+1e-7),'saved state retains a complete size edit');
  report.savedState={instances:finalState.instances,units:finalState.units};
  await page.screenshot({path:path.join(out,'整支扰动笔刷与三支实例.png')});

  await page.locator('#saveProjectBtn').click();await page.locator('input[name="saveMode"][value="FILE"]').check();await page.locator('#psSubmit').click();
  await page.waitForFunction(()=>document.getElementById('psStatus').textContent.startsWith('已保存工程'));await page.locator('#psCancel').click();
  assert(savedDoc,'actual save UI posted complete project bytes');assert.deepEqual(savedDoc.authoring.branch_instances,finalState.instances);
  await page.close();page=await newPage();await page.goto(url);await idle();await load(saved);
  const reloaded=await snapshot();sameGeometry(finalState,reloaded);assert.equal(reloaded.source,finalState.source);assert.deepEqual(reloaded.references,{sampleDirectionWorld:null,sampleOriginWorld:null,centerPointWorld:null},'transient references reset on fresh project load');
  const plan=await page.evaluate(async()=>{const f=window.__branchForge,{resolvePveExportPlan}=await import('/pve-export-plan.js');return resolvePveExportPlan(f.asset,f.authoring).units.map(unit=>({id:unit.id,source:unit.sourceInstance.asset_id,variant:unit.variantRequired}));});
  assert.equal(plan.length,4);assert.equal(new Set(plan.map(p=>p.source)).size,1);assert.ok(plan.every(p=>p.variant===false));assert.equal(plan[0].source,source.id);
  report.pve=plan;report.checks.push('actual saved bytes reopen in a fresh browser context with exact complete wood/leaves/flowers; four instances still reuse one source PVE model with no private variants or loose leaf/flower units');
  assert.deepEqual(report.sourceWrites,[]);assert.deepEqual(report.errors,[]);report.passed=true;
  console.log(JSON.stringify({passed:true,checks:report.checks,pve:plan,report:path.join(out,'验收.json')},null,2));
 }catch(error){report.failure=error.stack;try{await page?.screenshot({path:path.join(out,'失败.png')});}catch{}throw error;}
 finally{fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
