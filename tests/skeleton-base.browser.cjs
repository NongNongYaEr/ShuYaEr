const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const templateId=process.env.BRANCHFORGE_TEMPLATE_ID;
 const out=path.resolve('.runtime/skeleton-base-config',templateId||'');fs.mkdirSync(out,{recursive:true});const result={errors:[],checks:[]};
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(180000);page.on('pageerror',e=>result.errors.push(e.message));page.on('crash',()=>result.errors.push('renderer crash'));
  const meta=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,''))).find(m=>templateId?m.id===templateId:m.species==='PLATANUS'&&!m.userSaved);
  const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(meta.path)).digest('hex'),originalHash=hash();
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.evaluate(async id=>{const {migrateProjectDocument}=await import('/authoring-state.js');await window.__branchForge.workbench.load(migrateProjectDocument(await(await fetch('/api/project-document?id='+id)).json()));},meta.id);console.log('Loaded PLATANUS');
  const wait=()=>page.waitForFunction(()=>!document.getElementById('skeletonThicknessPanel').hasAttribute('aria-busy')&&!window.__branchForge.workbench.busy&&!window.__branchForge.asset.group.userData.pending_rebuild);
  const snapshot=()=>page.evaluate(async()=>{
   const f=window.__branchForge,a=f.asset,{branchRadiusAt}=await import('/branch-shaping.js');
   const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(v=>v.toString(16).padStart(2,'0')).join('');
   const meshes=[];a.group.traverse(o=>{if(o.isInstancedMesh)meshes.push({matrix:Array.from(o.instanceMatrix.array),attributes:Object.fromEntries(Object.entries(o.geometry.attributes).map(([k,v])=>[k,Array.from(v.array)]))});});
   return {unitHash:await digest([a.masterBranches.filter(b=>b.unitOwner||b.instanceId).map(b=>[b.stableId,b.points,b.startRadius,b.endRadius,b.radiusProfile,b.sections,b.parentRadius]),a.placements,a.treeOrgans,meshes]),
    instancesHash:await digest(f.authoring.branch_instances),bones:a.masterBranches.filter(b=>!b.instanceId).map(b=>({id:b.stableId,order:b.order,length:b.length,points:b.points,radii:[0,.25,.5,.75,1].map(t=>branchRadiusAt(b,a.settings,t))})),
    counts:{instances:f.authoring.branch_instances.length,leaves:a.placements.length,organs:a.treeOrgans.length,compiled:a.report.compiled_samples,atlas:a.materials.leaf.map.image.naturalWidth}};
  });
  await page.locator('[data-tab="structure"]').click();if(await page.locator('#treeSkeletonStructure .parameter-group-toggle').getAttribute('aria-expanded')==='false')await page.locator('#treeSkeletonStructure .parameter-group-toggle').click();await page.locator('#skeletonThicknessPanel').scrollIntoViewIfNeeded();
  const before=await snapshot();result.counts=before.counts;assert.ok(before.counts.instances>0);result.template=meta.name;
  const historyBefore=await page.evaluate(()=>window.__branchForge.historyState.undo);
  assert.equal(await page.locator('#skeletonThicknessApply').count(),0);
  await page.locator('#skeletonThicknessLevel').selectOption('2');
  assert.ok(Number(await page.locator('[data-skeleton-point="4"]').inputValue())<1,'legacy actual taper is visible');
  assert.match(await page.locator('#skeletonThicknessSource').textContent(),/保留原有枝形/);
  assert.deepEqual(await snapshot(),before,'merely opening the panel must not migrate geometry');
  for(let i=0;i<5;i++){const input=page.locator('[data-skeleton-point="'+i+'"]');await input.fill('1');await input.press('Enter');await wait();}
  const flat=await snapshot();assert.equal(flat.unitHash,before.unitHash);
  flat.bones.filter(b=>b.order===2).forEach(b=>b.radii.forEach(r=>assert.ok(Math.abs(r-b.radii[0])<1e-12,'all ones is uniform radius')));
  await page.locator('#skeletonThicknessHighlight').check();
  await page.screenshot({path:path.join(out,'全1等粗.png')});
  result.checks.push('legacy actual taper displayed without changing tree','all 1 gives uniform radius');
  await page.locator('#skeletonThicknessScale').fill('2');await page.locator('#skeletonThicknessScale').press('Enter');await wait();
  await page.locator('#skeletonThicknessHighlight').check();
  assert.equal(await page.evaluate(()=>{const f=window.__branchForge,root=f.workbench.skeletonThickness.root,ids=root.userData.branchIds;return root.visible&&ids.length>0&&ids.every(id=>{const b=f.asset.masterBranches.find(b=>b.stableId===id);return b.order===2&&!b.unitOwner&&!b.instanceId;});}),true);
  // Exercise the draggable curve, then enter exact values for deterministic verification.
  const canvas=page.locator('#skeletonThicknessCurve');await canvas.scrollIntoViewIfNeeded();const rect=await canvas.boundingBox();
  const dragHistory=await page.evaluate(()=>window.__branchForge.historyState.undo);
  await page.mouse.move(rect.x+502/520*rect.width,rect.y+(218-203/2)/250*rect.height);await page.mouse.down();await page.mouse.move(rect.x+502/520*rect.width,rect.y+35/250*rect.height,{steps:10});
  assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),dragHistory);
  await page.mouse.up();await wait();assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),dragHistory+1);
  assert.ok(Number(await page.locator('[data-skeleton-point="4"]').inputValue())>1.5);
  for(let i=0;i<5;i++){const input=page.locator(`[data-skeleton-point="${i}"]`);await input.fill(String([1,.8,.6,.4,.2][i]));await input.press('Tab');await wait();}
  const changed=await snapshot();
  assert.equal(changed.unitHash,before.unitHash);assert.equal(changed.instancesHash,before.instancesHash);assert.deepEqual(changed.counts,before.counts);
  let modified=0;changed.bones.forEach((b,n)=>{assert.deepEqual(b.points,before.bones[n].points);if(b.order===2){modified++;for(let j=0;j<5;j++)assert.ok(Math.abs(b.radii[j]/before.bones[n].radii[0]-2*[1,.8,.6,.4,.2][j])<.01);}else assert.deepEqual(b,before.bones[n]);});assert.ok(modified>0);
  result.checks.push('configuration has no Apply button','target highlight excludes units','drag commits once on release','numeric changes update automatically','only level 2 radii changed','installed unit geometry, transforms, branches, leaves and organs identical');console.log('Configuration updated; all installed units unchanged');
  const end=page.locator('[data-skeleton-point="4"]');await end.fill('5');await end.press('Enter');await wait();await end.fill('.2');await end.press('Enter');await wait();assert.deepEqual(await snapshot(),changed);result.checks.push('absolute replacement, no accumulation');
  await page.locator('#skeletonThicknessLevel').selectOption('1');assert.equal(await page.locator('#skeletonThicknessScale').inputValue(),'1');await page.locator('#skeletonThicknessLevel').selectOption('2');assert.equal(await end.inputValue(),'0.2');assert.equal(await page.locator('#skeletonThicknessScale').inputValue(),'2');
  const edits=await page.evaluate(()=>window.__branchForge.historyState.undo)-historyBefore;
  for(let i=0;i<edits;i++){await page.locator('#undoBtn').click();await wait();}assert.deepEqual(await snapshot(),before);
  for(let i=0;i<edits;i++){await page.locator('#redoBtn').click();await wait();}assert.deepEqual(await snapshot(),changed);result.checks.push('level switching keeps parameters','undo/redo');
  await page.locator('#skeletonThicknessPanel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'分级粗细面板.png')});
  const setBase=async(id,value)=>{const input=page.locator('#'+id);await input.fill(String(value));await input.press('Enter');await wait();};
  const diameter=b=>b.radii[0]*200;
  const unitsUnchanged=s=>{assert.equal(s.unitHash,before.unitHash);assert.equal(s.instancesHash,before.instancesHash);assert.deepEqual(s.counts,before.counts);s.bones.forEach((b,i)=>{assert.deepEqual(b.points,before.bones[i].points);if(b.order!==2)assert.deepEqual(b,before.bones[i]);});};
  await page.locator('#skeletonThicknessBaseMode').selectOption('UNIFORM');await wait();
  await setBase('skeletonBaseDiameter',4);await setBase('skeletonBaseVariation',0);
  const uniform=await snapshot();unitsUnchanged(uniform);uniform.bones.filter(b=>b.order===2).forEach(b=>assert.ok(Math.abs(diameter(b)-4)<1e-10));
  await setBase('skeletonBaseVariation',20);const varied=await snapshot();unitsUnchanged(varied);
  const sizes=varied.bones.filter(b=>b.order===2).map(diameter);assert.ok(Math.abs(Math.min(...sizes)-3.2)<1e-9);assert.ok(Math.abs(Math.max(...sizes)-4.8)<1e-9);
  await setBase('skeletonBaseDiameter',6);await setBase('skeletonBaseDiameter',4);assert.deepEqual(await snapshot(),varied);
  result.checks.push('absolute 4 cm overrides inherited sizes and old scale','variation 0 produces equal roots','20 percent is bounded to 3.2–4.8 cm','diameter replacement does not accumulate');
  await page.locator('#skeletonThicknessBaseMode').selectOption('LENGTH_GROUPS');await wait();
  await setBase('skeletonBaseSplit',2);await setBase('skeletonShortDiameter',2);await setBase('skeletonShortVariation',10);await setBase('skeletonLongDiameter',8);await setBase('skeletonLongVariation',20);
  const grouped=await snapshot();unitsUnchanged(grouped);
  for(const b of grouped.bones.filter(b=>b.order===2)){const [min,max]=b.length<2?[1.8,2.2]:[6.4,9.6];assert.ok(diameter(b)>=min-1e-9&&diameter(b)<=max+1e-9);}
  await setBase('skeletonShortDiameter',3);const shortEdit=await snapshot();unitsUnchanged(shortEdit);shortEdit.bones.forEach((b,i)=>{if(b.order!==2||b.length>=2)assert.deepEqual(b,grouped.bones[i]);});
  await setBase('skeletonShortDiameter',2);assert.deepEqual(await snapshot(),grouped);
  for(const filter of ['SHORT','LONG']){await page.locator('#skeletonBaseHighlight').selectOption(filter);assert.equal(await page.evaluate(filter=>{const f=window.__branchForge,ids=f.workbench.skeletonThickness.root.userData.branchIds;return ids.length>0&&ids.every(id=>{const b=f.asset.masterBranches.find(b=>b.stableId===id);return b.order===2&&!b.instanceId&&!b.unitOwner&&(filter==='SHORT'?b.length<2:b.length>=2);});},filter),true);}
  await page.locator('#skeletonBaseHighlight').selectOption('ALL');
  await setBase('skeletonBaseSplit',3);const split3=await snapshot();await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snapshot(),grouped);await page.locator('#redoBtn').click();await wait();assert.deepEqual(await snapshot(),split3);await setBase('skeletonBaseSplit',2);
  const invalid=page.locator('#skeletonShortDiameter');await invalid.fill('0');await invalid.press('Tab');assert.deepEqual(await snapshot(),grouped);await setBase('skeletonShortDiameter',2);
  await end.fill('.3');await end.press('Enter');await wait();
  await page.locator('#skeletonBaseControls').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'基部直径与分组.png')});
  result.checks.push('short and long groups have independent diameter bands','editing short group leaves long group unchanged','group highlights exclude units','split change undo/redo','invalid diameter does not mutate model');console.log('Absolute base sizes and groups passed');
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='skeleton.branch.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);return new Response(JSON.stringify({success:true,path:'test download'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  // Ctrl+S must capture valid text still focused in the field, without a blur.
  await page.locator('#skeletonShortDiameter').fill('2.5');await page.keyboard.press('Control+s');await page.waitForSelector('#projectSaveDialog[open]');await wait();
  const savedState=await snapshot();assert.equal(await page.evaluate(()=>window.__branchForge.authoring.workbench.skeleton_thickness.levels[2].curve[4]),.3);assert.equal(savedState.unitHash,before.unitHash);assert.equal(await page.evaluate(()=>window.__branchForge.authoring.workbench.skeleton_thickness.levels[2].base.short.diameter_cm),2.5);
  await page.locator('[name="saveMode"][value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'分级曲线重载.branch.json');await download.saveAs(saved);console.log('Saved actual project payload');
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(count=>window.__branchForge.authoring.branch_instances.length===count&&!window.__branchForge.workbench.busy,before.counts.instances);await wait();
  assert.deepEqual(await snapshot(),savedState);result.checks.push('Ctrl+S includes focused input','actual saved file reloaded after page restart');
  await page.locator('[data-tab="structure"]').click();if(await page.locator('#treeSkeletonStructure .parameter-group-toggle').getAttribute('aria-expanded')==='false')await page.locator('#treeSkeletonStructure .parameter-group-toggle').click();await page.locator('#skeletonThicknessLevel').selectOption('2');assert.equal(await page.locator('[data-skeleton-point="4"]').inputValue(),'0.3');
  assert.equal(await page.locator('#skeletonThicknessBaseMode').inputValue(),'LENGTH_GROUPS');assert.equal(await page.locator('#skeletonShortDiameter').inputValue(),'2.5');assert.equal(await page.locator('#skeletonLongDiameter').inputValue(),'8');await page.locator('#skeletonThicknessReset').click();await wait();assert.deepEqual(await snapshot(),before);result.checks.push('reset exactly restores original');
  assert.equal(hash(),originalHash);assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
