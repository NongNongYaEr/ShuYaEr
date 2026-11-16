// Uses a separate off-desktop native host and separate project/session storage.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.BRANCHFORGE_COMB_OUTPUT||'.runtime/comb-attachment-fix/native');
const input=path.resolve(process.argv[2]||'.runtime/branch-junction-fix/当前工程_只读副本.branch.json');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={checks:[],errors:[],strokes:[],inputHash:digest(input)};
function compare(actual,expected){
 assert.deepEqual(Object.keys(actual),Object.keys(expected));let max=0;
 for(const id of Object.keys(expected)){
  assert.deepEqual(actual[id].times,expected[id].times,id+' parameters');
  for(const key of ['points','knots']){
   assert.equal(actual[id][key].length,expected[id][key].length,id+' '+key);
   actual[id][key].forEach((p,i)=>{max=Math.max(max,Math.hypot(...p.map((x,k)=>x-expected[id][key][i][k])));});
  }
 }
 assert.ok(max<1e-7,'preview/commit distance '+max);return max;
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const child=spawn(path.join(root,'.runtime/native-editor/BranchForgeNativeTest.exe'),[],{cwd:root,windowsHide:true,env:{...process.env,BRANCHFORGE_APP_ROOT:root,BRANCHFORGE_DESKTOP_TEST_DIR:out,BRANCHFORGE_DEBUG_PORT:String(port)}});
 let exited=false,browser,page;child.on('exit',code=>{exited=true;report.hostExit=code;});
 try{
  for(let i=0;i<100;i++){if(exited)throw Error('Test host exited before CDP');try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);break;}catch{await delay(300);}}
  assert.ok(browser,'isolated native CDP ready');page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(120000);
  page.on('pageerror',e=>report.errors.push(e.message));
  const idle=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&f.asset.authoring===f.authoring&&!f.asset.group.userData.pending_rebuild&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden&&!document.querySelector('#projectLoadDialog').open;});
  const native=async()=>{
   await page.waitForFunction(()=>{const s=window.__branchForge?.nativeViewport.stats;return s&&(s.lastError||s.active&&!s.pendingResources);},null,{timeout:30000});
   const {submittedRevision,sceneSession,lastError}=await page.evaluate(()=>window.__branchForge.nativeViewport.stats);assert.equal(lastError,'');
   await page.waitForFunction(({submittedRevision,sceneSession})=>{const s=window.__branchForge.nativeViewport.stats;return s.native.scene_session===sceneSession&&s.native.revision>=submittedRevision;},{submittedRevision,sceneSession},{timeout:30000});
  };
  const capture=async name=>{
   await native();const file=path.join(out,'native-capture.png'),stamp=fs.existsSync(file)?fs.statSync(file).mtimeMs:0;
   await page.evaluate(()=>window.chrome.webview.postMessage(JSON.stringify({topic:'branchforge-native',action:'capture'})));
   for(let i=0;i<100;i++){if(fs.existsSync(file)&&fs.statSync(file).mtimeMs>stamp)break;await delay(50);}
   assert.ok(fs.statSync(file).mtimeMs>stamp);fs.copyFileSync(file,path.join(out,name+'.png'));
  };
  const open=async file=>{
   await page.locator('#projectInput').setInputFiles(file);
   if(await page.locator('#projectSwitchConfirm[open]').isVisible())await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();await idle();
  };
  await idle();await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'),()=>page.evaluate(()=>document.querySelector('#projectSessionPanel').close()));
  await open(input);await page.evaluate(()=>{const f=window.__branchForge;f.nativeViewport.setDlss(false);f.controls.enableDamping=false;f.asset.settings.wind_strength=0;});await native();
  const install=()=>page.evaluate(()=>{
   window.__combSerialize=list=>Object.fromEntries([...list].filter(b=>!b.instanceId&&!b.unitOwner).map(b=>[b.stableId,{points:b.points.map(p=>p.toArray()),knots:b.controlPoints.map(p=>p.toArray()),times:b.points.axisTimes||null}]));
   window.__combUnits=()=>{const f=window.__branchForge;return JSON.stringify([f.authoring.branch_library,f.authoring.branch_instances]);};
  });
  await install();const units=await page.evaluate(()=>window.__combUnits());report.completeUnits=await page.evaluate(()=>window.__branchForge.authoring.branch_instances.length);
  const originalUnits=await page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.filter(b=>b.instanceId||b.unitOwner).map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
  await page.locator('[data-tree-selection-kind="SKELETON"]').click();await page.locator('#skeletonEditModeBtn').click();await idle();
  assert.equal(await page.evaluate(()=>window.__branchForge.asset.skeletonOnly),true);console.log('Loaded real skeleton with',report.completeUnits,'complete units retained');
  const snap=()=>page.evaluate(()=>window.__combSerialize(window.__branchForge.asset.masterBranches));
  const initial=await snap();let edited=initial;
  const select=()=>page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:/^CAMPHOR_PRIMARY_5$/})}).click();
  await select();await page.locator('#branchEditScope').selectOption('DIRECT');
  const tool=page.locator('.viewport-tool-rail [data-viewport-tool="COMB"]');await tool.evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.matches('details'))p.open=true;});await tool.click();
  for(const [id,value]of [['quick_sculptRadius','190'],['quick_sculptStrength','1']]){await page.locator('#'+id).evaluate((e,value)=>e.value=value,value);await page.locator('#'+id).dispatchEvent('input');}
  const position=()=>page.evaluate(()=>{
   const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId==='CAMPHOR_PRIMARY_5'),p=b.points[Math.floor(b.points.length*.68)].clone();
   f.asset.group.updateWorldMatrix(true,true);f.asset.group.localToWorld(p);f.controls.target.copy(p);f.camera.position.copy(p).add({x:0,y:-20,z:5});f.controls.update();
   const r=document.querySelector('#viewport').getBoundingClientRect();p.project(f.camera);return[r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];
  });
  const attachments=()=>page.evaluate(async()=>{
   const {sampleLine}=await import('/tree-sculpt.js'),f=window.__branchForge,byId=new Map(f.asset.masterBranches.map(b=>[b.id,b]));let gap=0,meshError=0,rings=0;
   for(const b of byId.values()){const p=byId.get(b.parentId);if(p&&!b.instanceId&&!b.unitOwner)gap=Math.max(gap,b.points[0].distanceTo(sampleLine(p.points,b.parentT)));}
   const b=f.asset.masterBranches.find(b=>b.stableId==='CAMPHOR_PRIMARY_5');
   f.asset.group.traverse(o=>{if(o.isMesh&&o.userData.stable_id===b.stableId)for(const r of o.geometry.userData.radiusRings||[]){rings++;const target=sampleLine(b.points,r.t);meshError=Math.max(meshError,Math.hypot(...r.center.map((x,i)=>x-target.getComponent(i))));}});
   return{gap,meshError,rings,worker:f.skeletonGeometryJobs.stats,native:f.nativeViewport.stats};
  });
  const p0=await position();await capture('before');
  for(let n=0;n<2;n++){
   const p=n?await position():p0,before=edited;await page.mouse.move(...p);await page.mouse.down();
   assert.ok(await page.evaluate(()=>Boolean(window.__branchForge.sculptState?.updated)),'actual carrier brush active');
   await page.evaluate(()=>{const preview=window.__branchForge.asset.activeEditPreview,update=preview.update;window.__combExpected=null;preview.update=function(updated){window.__combExpected=window.__combSerialize(updated.values());return update.apply(this,arguments);};});
   await page.mouse.move(p[0]+(n?-45:55),p[1]-38,{steps:12});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   if(n===0)await capture('preview');await page.mouse.up();await idle();await native();
   const expected=await page.evaluate(()=>window.__combExpected);assert.ok(expected);edited=await snap();assert.notDeepEqual(edited,before);
   const max=compare(edited,expected),state=await attachments();assert.ok(state.gap<1e-7,JSON.stringify(state));assert.ok(state.rings>0);assert.ok(state.meshError<1e-6,'actual mesh centre follows committed axis');
   assert.equal(await page.evaluate(()=>window.__combUnits()),units);report.strokes.push({maxPreviewCommitDistance:max,...state});
   await capture('confirmed-'+n);await page.locator('#undoBtn').click();await idle();compare(await snap(),before);await page.locator('#redoBtn').click();await idle();compare(await snap(),edited);
   console.log('Passed stroke',n+1,'preview/commit, actual mesh, undo and redo');
  }
  report.checks.push('two real DX12 comb strokes reproduce preview, retain actual mesh centres and exact undo/redo');
  const cancelPoint=await position();await page.mouse.move(...cancelPoint);await page.mouse.down();await page.mouse.move(cancelPoint[0]+40,cancelPoint[1]+30,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();await idle();compare(await snap(),edited);report.checks.push('Escape restores exact committed geometry');
  await page.locator('#skeletonEditModeBtn').click();await idle();await native();assert.equal(await page.evaluate(()=>window.__combUnits()),units);compare(await snap(),edited);
  const currentUnits=await page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.filter(b=>b.instanceId||b.unitOwner).map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
  assert.deepEqual(Object.keys(currentUnits),Object.keys(originalUnits));let rigidError=0;
  const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
  for(const id of Object.keys(currentUnits)){const a=currentUnits[id],b=originalUnits[id];assert.equal(a.length,b.length);for(let i=1;i<a.length;i++)rigidError=Math.max(rigidError,Math.abs(distance(a[i],a[0])-distance(b[i],b[0])));}
  assert.ok(rigidError<1e-7);report.rigidError=rigidError;report.checks.push('full assembly retains all whole-unit records, source models and rigid branch proportions');await capture('full-tree');
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));window.__combSaved=await options.body.slice(offset).text();return new Response(JSON.stringify({success:true,path:'comb-acceptance.branch.json'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();await page.locator('#psSubmit').click();await page.waitForFunction(()=>Boolean(window.__combSaved));
  const saved=path.join(out,'native-editor-confirmed.branch.json');fs.writeFileSync(saved,await page.evaluate(()=>window.__combSaved));
  await page.reload();await idle();await install();
  await page.evaluate(async()=>{const r=await fetch('/api/acceptance/saved-project');if(!r.ok)throw Error('Acceptance save unavailable');const d=new DataTransfer();d.items.add(new File([await r.blob()],'comb-cold.branch.json',{type:'application/json'}));const e=document.querySelector('#projectInput');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));});
  if(await page.locator('#projectSwitchConfirm[open]').isVisible())await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();await idle();await native();
  compare(await snap(),edited);assert.equal(await page.evaluate(()=>window.__combUnits()),units);await capture('cold-reload');
  report.checks.push('actual file save and cold page reload reproduce edited support curves and whole-unit sources');
  assert.equal(digest(input),report.inputHash);assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({checks:report.checks,completeUnits:report.completeUnits,passed:true}));
 }catch(e){report.error=e.stack;if(page)try{await page.screenshot({path:path.join(out,'failure.png')});fs.writeFileSync(path.join(out,'failure-state.json'),JSON.stringify(await page.evaluate(()=>({native:window.__branchForge?.nativeViewport.stats,status:document.querySelector('#status')?.textContent})),null,2));}catch{}throw e;}
 finally{
  if(page&&!exited)try{await page.evaluate(()=>window.chrome.webview.postMessage(JSON.stringify({topic:'branchforge-native',action:'close-test-host'})));}catch{}
  for(let i=0;i<50&&!exited;i++)await delay(50);if(!exited)child.kill();fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
