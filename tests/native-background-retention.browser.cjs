const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=process.cwd(),out=path.resolve(process.env.BRANCHFORGE_NATIVE_OUTPUT||'.runtime/native-background-retention'),input=path.resolve('.runtime/edit-response-perf/input/latest.branch.json');assert(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});fs.copyFileSync(input,path.join(out,'native-editor-confirmed.branch.json'));
const report={code:Object.fromEntries(["web/app.js","web/native-viewport.js","web/native-model-cache.js","web/skeleton-background-geometry.js","web/complete-sample-assembly.js","web/branch-kernel.js","native/BranchGeneratorDesktop.cs","release-config.json"].map(file=>[file,crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")])),hostEntrySha256:crypto.createHash("sha256").update(fs.readFileSync(process.env.BRANCHFORGE_NATIVE_EXECUTABLE||path.join(root,"树鸭儿.exe"))).digest("hex"),inputHash:crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'),runs:[],errors:[]};let owner,page;
(async()=>{try{owner=await require(path.join(root,'tests/owned-native-browser.cjs'))({out});page=owner.page;page.setDefaultTimeout(180000);page.on('pageerror',e=>report.errors.push(e.message));await page.evaluate(()=>{const f=window.__branchForge,api=f.performance,begin=api.begin.bind(api);window.__preparationSpans=[];api.begin=function(name){const span=begin(name);if(!span||name!=='generation.background_geometry_wall')return span;const totals=()=>{const m=api.snapshot().metrics;return Object.fromEntries(['native.object_scan','native.world_matrices','native.overlay'].map(k=>[k,{ms:m[k]?.total_ms||0,samples:m[k]?.samples||0}]));},before=totals(),end=span.end.bind(span);span.end=function(...args){const after=totals();window.__preparationSpans.push({before,after});return end(...args);};return span;};});await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'),()=>page.evaluate(()=>document.getElementById('projectSessionPanel').close()));
const idle=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&f.asset.authoring===f.authoring&&!f.asset.group.userData.pending_rebuild&&!f.workbench.busy&&!f.editUiPending&&document.getElementById('busyOverlay').hidden&&!document.getElementById('projectLoadDialog').open;},null,{timeout:180000});
const native=async()=>{await page.waitForFunction(()=>{const f=window.__branchForge,s=f.nativeViewport.stats;return s.lastError||s.active&&!s.pendingResources&&!s.inFlight&&s.native.asset_identity===f.asset.group.uuid;},null,{timeout:180000,polling:37});assert.equal(await page.evaluate(()=>window.__branchForge.nativeViewport.stats.lastError),'');};
await page.evaluate(async()=>{const response=await fetch('/api/acceptance/saved-project'),files=new DataTransfer();files.items.add(new File([await response.blob()],'historical-unit.branch.json',{type:'application/json'}));const i=document.getElementById('projectInput');i.files=files.files;i.dispatchEvent(new Event('change',{bubbles:true}));});if(await page.locator('#projectSwitchConfirm[open]').isVisible())await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();await idle();await page.evaluate(()=>{const f=window.__branchForge;f.asset.settings.wind_strength=0;f.controls.enableDamping=false;});await native();
await page.locator('[data-tree-selection-kind="INSTANCE"]').click();const target=await page.evaluate(()=>{const f=window.__branchForge,i=f.authoring.branch_instances.find(i=>i.id==='FIN_0002');return {id:i.id,root:f.asset.masterBranches.find(b=>b.instanceId===i.id).stableId};});report.target=target;const locator=page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+target.root.replaceAll('.','\\.')+'$')})});assert.equal(await locator.count(),1);await locator.click();await page.locator('#branchEditScope').selectOption('DIRECT');await page.locator('#viewport').focus();
const fingerprint=()=>page.evaluate(async()=>{const f=window.__branchForge,h=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))).map(v=>v.toString(16).padStart(2,'0')).join('');return {authoring:await h(f.authoring),sources:await h(f.authoring.branch_library),units:f.authoring.branch_instances.length,layers:f.authoring.sculpt_layers.length};});const before=await fingerprint();report.backgroundJobsBefore=await page.evaluate(()=>window.__branchForge.skeletonGeometryJobs.stats);
const measure=async(label,run)=>{await page.evaluate(label=>(window.__preparationSpans=[],window.__branchForge.performance.start(label)),label);const started=Date.now();await run();await idle();await native();const result=await page.evaluate(()=>{const f=window.__branchForge;return {preparation:window.__preparationSpans,profile:f.performance.stop(),edit:f.editTimings,native:f.nativeViewport.stats};});report.runs.push({label,wallMs:Date.now()-started,...result});fs.writeFileSync(path.join(out,'benchmark.json'),JSON.stringify(report,null,2));console.log(label,report.runs.at(-1).wallMs);};
await measure('historical-one-rotate',async()=>{await page.keyboard.press('r');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);await page.keyboard.type('15');await page.keyboard.press('Enter');});const rotated=await fingerprint();assert.notEqual(rotated.authoring,before.authoring);assert.equal(rotated.sources,before.sources);assert.equal(rotated.units,before.units);
await measure('historical-one-undo',()=>page.locator('#undoBtn').click());assert.deepEqual(await fingerprint(),before);await measure('historical-one-redo',()=>page.locator('#redoBtn').click());assert.deepEqual(await fingerprint(),rotated);await measure('historical-one-restore',()=>page.locator('#undoBtn').click());assert.deepEqual(await fingerprint(),before);assert(report.runs.every(run=>run.profile.counters.historical_graph_scoped===1&&run.profile.counters.historical_graph_evaluated_owners===1),'actual final history evaluates only the changed historical owner');report.backgroundJobsAfter=await page.evaluate(()=>window.__branchForge.skeletonGeometryJobs.stats);assert.equal(report.backgroundJobsAfter.submitted,report.backgroundJobsBefore.submitted,"unit-only historical edits do not submit redundant skeleton jobs");
// Complete real worker output is held only by this test while the old displayed
// owner is independently scanned twice. Exercise both cancellation and commit.
await page.evaluate(()=>{
 const f=window.__branchForge,client=f.skeletonGeometryJobs,run=client.run.bind(client);
 window.__backgroundControl={run,length:document.getElementById('length').value,owner:f.asset.group.uuid,cancel:true,audits:[]};
 client.run=async function(job){
  const result=await run(job),c=window.__backgroundControl,owner=f.asset.group.uuid;
  const first=await f.nativeViewport.auditModel(),second=await f.nativeViewport.auditModel();
  c.audits.push({owner,held:f.asset.group.uuid===owner,pending:f.asset.group.userData.pending_rebuild,first,second});
  if(c.cancel){c.cancel=false;throw new DOMException('Owned test cancellation after real worker output','AbortError');}
  return result;
 };
 f.performance.start('background-owner-cancellation');
 document.getElementById('length').value=Number(window.__backgroundControl.length)+(Number(window.__backgroundControl.length)<11?.1:-.1);
 f.asset.group.userData.pending_rebuild=true;
 window.__cancelledBuild=f.generateModel({throwOnError:true}).then(()=>({resolved:true}),error=>({name:error.name,message:error.message}));
});
report.cancelledPreparation=await page.evaluate(async()=>await window.__cancelledBuild);
assert.equal(report.cancelledPreparation.name,'AbortError');
report.afterCancellationAudit=await page.evaluate(()=>window.__branchForge.nativeViewport.auditModel());
assert.equal(report.afterCancellationAudit.checked,false,'cancelled preparation must release its native owner lease');
assert.equal(report.afterCancellationAudit.reason,'no-managed-model','ordinary pending owners still require the normal scan');
report.cancelledProfile=await page.evaluate(()=>window.__branchForge.performance.stop());
assert(report.cancelledProfile.events.some(e=>e.metadata?.outcome==='CANCELLED'));
assert.equal(await page.evaluate(()=>window.__branchForge.asset.group.uuid),await page.evaluate(()=>window.__backgroundControl.owner));
assert.deepEqual(await fingerprint(),before);
await page.evaluate(async()=>{const f=window.__branchForge;f.asset.group.userData.pending_rebuild=true;await f.generateModel({throwOnError:true});});
await idle();await native();
assert.notEqual(await page.evaluate(()=>window.__branchForge.asset.group.uuid),await page.evaluate(()=>window.__backgroundControl.owner));
assert.deepEqual(await fingerprint(),before);
await page.evaluate(async()=>{const f=window.__branchForge;document.getElementById('length').value=window.__backgroundControl.length;f.asset.group.userData.pending_rebuild=true;await f.generateModel({throwOnError:true});});
await idle();await native();
report.controlledBackgroundAudits=await page.evaluate(()=>window.__backgroundControl.audits);
assert.equal(report.controlledBackgroundAudits.length,3);
assert(report.controlledBackgroundAudits.every(a=>a.held&&a.pending&&a.second.checked&&!a.second.mismatch),'held and cancelled real worker jobs must preserve the exact displayed model');
report.restoredAudit=await page.evaluate(()=>window.__branchForge.nativeViewport.auditModel());
assert(report.restoredAudit.checked&&!report.restoredAudit.mismatch);
assert.deepEqual(await fingerprint(),before);
report.restoredLength=await page.evaluate(()=>document.getElementById('length').value);
assert.equal(report.restoredLength,await page.evaluate(()=>window.__backgroundControl.length));
await page.evaluate(()=>{window.__branchForge.skeletonGeometryJobs.run=window.__backgroundControl.run;delete window.__backgroundControl;delete window.__cancelledBuild;});
assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;if(page)try{await page.screenshot({path:path.join(out,'failure.png')});}catch{}throw error;}finally{await owner?.close();fs.writeFileSync(path.join(out,'benchmark.json'),JSON.stringify(report,null,2));}})().catch(error=>{console.error(error);process.exitCode=1;});
