// Isolated real UI regression. Optional input must be a separate, read-only copy.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const base=path.join(__dirname,'trunk-workspace-library.browser.cjs');
let source=fs.readFileSync(base,'utf8').replace('.runtime/trunk-workspace-library-ui',process.env.BRANCHFORGE_TRUNK_OUTPUT||'.runtime/trunk-preview-consistency');
if(process.env.BRANCHFORGE_TRUNK_FIXTURE){
 source=source.replace("path.join(workspace,'assets/tree-template-library/template-c75273b48abc49fbbfa602525f57c083.branch.json')",JSON.stringify(path.resolve(process.env.BRANCHFORGE_TRUNK_FIXTURE)));
 const ds=source.indexOf('const doc=JSON.parse'),de=source.indexOf(' const fixture=',ds);
 source=source.slice(0,ds)+"const doc=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\\uFEFF/,''));\n"+source.slice(de);
}else source=source.replace(" const fixture=", " doc.authoring.workbench.trunk_forms.branches.CAMPHOR_TRUNK.mesh={version:1,radial_segments:128,segment_length:.04,detail_samples:12,adaptive_details:true};\n const fixture=");
const start=source.indexOf("  await page.locator('#trunkFormMode').click();"),end=source.indexOf('  assert.equal(hash(input),beforeHash);');
source=source.slice(0,start)+String.raw`
  await page.locator('#trunkFormMode').click();await idle();await frame();
  const dock=page.locator('#trunkSectionDock'),front=page.locator('#sectionFrontSvg');
  await dock.locator('[data-section-nav="next"]').click();await frame();const baseline=await snap();
  const rememberLive=async()=>{await page.waitForFunction(()=>{const t=window.__branchForge.workbench.trunkForm,s=t.previewStats;let live=false;t.root.traverse(o=>{if(o.userData.trunk_form_preview_readonly===false)live=true;});return live&&!s?.active&&!s?.queued;});return page.evaluate(id=>{
   const f=window.__branchForge;let live;f.workbench.trunkForm.root.traverse(m=>{if(m.userData.trunk_form_preview_target===id&&m.userData.trunk_form_preview_readonly===false)live=m;});
   if(!live)throw Error('missing active edit mesh');if(live.userData.trunk_form_preview_view!=='FINAL')throw Error('edit preview lost full skin');
   const g=live.geometry;window.__trunkLiveSkin={rings:g.userData.radiusRings,positions:g.attributes.position.array};
   g.computeBoundingBox();return{view:live.userData.trunk_form_preview_view,vertices:g.attributes.position.count,rings:g.userData.radiusRings.length,bounds:[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()],budget:g.userData.trunkMeshSampling?.vertex_limit};
  },target);};
  const compareConfirmed=()=>page.evaluate(id=>{
   const f=window.__branchForge,live=window.__trunkLiveSkin;let m;f.asset.group.traverse(o=>{if(o.isMesh&&o.userData.category==='branch'&&o.userData.stable_id===id)m=o;});
   const g=m.geometry,positions=g.attributes.position.array;let shared=0,error=0;
   for(const a of live.rings){const b=g.userData.radiusRings.find(r=>Math.abs(r.t-a.t)<1e-12);if(!b)continue;
    if(a.count!==b.count||JSON.stringify(a.sampleAngles)!==JSON.stringify(b.sampleAngles))throw Error('angular grid changed at confirmation');
    for(let j=0;j<a.count*3;j++)error=Math.max(error,Math.abs(live.positions[a.offset*3+j]-positions[b.offset*3+j]));shared++;
   }
   const root=g.userData.radiusRings[0],old=live.rings[0];let rootError=0;for(let j=0;j<root.count*3;j++)rootError=Math.max(rootError,Math.abs(live.positions[old.offset*3+j]-positions[root.offset*3+j]));
   g.computeBoundingBox();delete window.__trunkLiveSkin;return{shared,error,rootError,vertices:g.attributes.position.count,bounds:[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()]};
  },target);
  const verify=async name=>{const result=await compareConfirmed();assert.ok(result.shared>=65,JSON.stringify(result));assert.ok(result.error<=1e-5,JSON.stringify(result));assert.equal(result.rootError,0);report[name]=result;check(name+': preview and confirmed root skin agree at shared physical samples');};
  const worldPoint=()=>page.evaluate(async()=>{
   const THREE=await import('/vendor/three.module.min.js'),f=window.__branchForge,c=document.getElementById('viewport'),rect=c.getBoundingClientRect();
   f.controls.target.set(0,0,3);f.camera.position.set(12,-17,13);f.controls.update();f.camera.updateMatrixWorld();f.workbench.trunkForm.root.updateWorldMatrix(true,true);
   let at;f.workbench.trunkForm.root.traverse(m=>{if(m.userData.kind==='profile'&&!at){const p=m.getWorldPosition(new THREE.Vector3()).project(f.camera),q={x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};if(document.elementFromPoint(q.x,q.y)===c)at=q;}});if(!at)throw Error('no visible main point');return at;
  });
  await page.setViewportSize({width:1700,height:1080});await frame();const at=await worldPoint();await frame();
  await page.mouse.move(at.x,at.y);await page.mouse.down();await page.mouse.move(at.x+12,at.y-8,{steps:3});await frame();
  report.mainPreview=await rememberLive();assert.ok(report.mainPreview.vertices<=48000);assert.equal((await snap()).history,baseline.history);await page.screenshot({path:path.join(out,'01_树上拖动中.png')});
  await page.mouse.up();await idle();await frame();await verify('mainDrag');const main=await snap();assert.equal(main.history,baseline.history+1);assert.notEqual(main.trunk,baseline.trunk);for(const k of ['instances','sources'])assert.equal(main[k],baseline[k]);
  assert.deepEqual(main.form.buttresses,baseline.form.buttresses);assert.deepEqual(main.form.details,baseline.form.details);check('direct tree drag commits one undo step and retains buttresses, details and complete units');
  await page.screenshot({path:path.join(out,'02_松手确认后.png')});
  await front.locator('[data-knot-id]').first().click();await front.focus();await front.press('g');await front.press('x');await front.press('2');await frame();
  const cancelled=await rememberLive();assert.equal(cancelled.view,'FINAL');await front.press('Escape');await idle();assert.deepEqual(await snap(),main);check('cancelling the next preview restores exact mesh and undo history');
  await dock.locator('[data-trunk-stage="CONTOUR"]').click();await frame();const child=await front.evaluate(n=>Array.from(n.querySelectorAll('[data-knot-id]')).map(p=>{const r=p.getBoundingClientRect();return{node:p,x:r.left+r.width/2,y:r.top+r.height/2};}).find(p=>document.elementFromPoint(p.x,p.y)===p.node));assert.ok(child,'no unobscured child point');await page.mouse.click(child.x,child.y);assert.equal(await front.locator('.selected[data-knot-id]').count(),1);await front.focus();await front.press('g');await front.press('x');await front.press('2');await frame();
  report.childPreview=await rememberLive();assert.ok(report.childPreview.vertices<=48000);await front.press('Enter');await idle();await frame();await verify('childDrag');const edited=await snap();assert.equal(edited.history,main.history+1);assert.notEqual(edited.trunk,main.trunk);assert.deepEqual(edited.form.sections[1].profile_coarse,main.form.sections[1].profile_coarse);for(const k of ['instances','sources'])assert.equal(edited[k],baseline[k]);
  await page.locator('#undoBtn').click();await idle();assert.deepEqual(await snap(),main);await page.locator('#undoBtn').click();await idle();assert.deepEqual(await snap(),baseline);check('main and child edits undo independently back to the original tree');
  await page.locator('#redoBtn').click();await idle();await page.locator('#redoBtn').click();await idle();assert.deepEqual(await snap(),edited);check('redo reconstructs the confirmed skin without changing complete unit sources');
  await dock.locator('[data-workflow-done]').click();await idle();const completeSaved=await snap();assert.equal(completeSaved.units,completeInput.units);for(const k of ['instances','sources'])assert.equal(completeSaved[k],completeInput[k]);check('finishing restores the unchanged complete unit geometry and assembly');
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const a=document.createElement('a');a.href=URL.createObjectURL(options.body.slice(offset));a.download='trunk-preview-consistency.branch.json';a.click();return new Response(JSON.stringify({success:true,path:'preview-consistency-test.branch.json'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.locator('#viewport').focus();await page.keyboard.press('Control+s');await page.waitForSelector('#projectSaveDialog[open]');await page.locator('[name="saveMode"][value="FILE"]').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'香樟_拖动预览一致性验证.branch.json');await download.saveAs(saved);report.saved=saved;
  const savedDoc=JSON.parse(fs.readFileSync(saved,'utf8'));report.completeUnits=savedDoc.authoring.branch_instances.length;assert.equal(report.completeUnits,doc.authoring.branch_instances.length);assert.deepEqual(savedDoc.authoring.workbench.trunk_forms.branches[target],edited.form);assert.doesNotMatch(JSON.stringify(savedDoc.authoring),/trunk_form_preview|interactive_preview|__trunkLiveSkin/);
  await page.reload();await idle();await openFile(saved);const cold=await snap();for(const k of ['form','trunk','units','instances','sources'])assert.deepEqual(cold[k],completeSaved[k]);check('actual file save and fresh page reload retain confirmed mesh, complete units and source reuse');
`+source.slice(end);
source=source.replace('report.failure=e.stack;',"report.failure=e.stack;console.error(e.stack);");
const mod=new Module(base,module);mod.filename=base;mod.paths=module.paths;mod._compile(source,base);
