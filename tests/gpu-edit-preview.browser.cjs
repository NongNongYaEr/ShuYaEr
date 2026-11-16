const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/gpu-edit-preview');fs.mkdirSync(out,{recursive:true});const report={checks:[],errors:[],shaderErrors:[]};
 const assetFile='次枝资产/全植物次枝成品V1/红叶石楠/红叶石楠_短弯细梢_红嫩叶_成品V1.branchasset.json',source=JSON.parse(fs.readFileSync(assetFile,'utf8')).asset;
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'GPU编辑验收',seed:42,leaf_density:0,child_count:0,wind_strength:0,petiole_length:0},leaf_meshes:source.sample.leaf_meshes,
  authoring:{branch_shape:{branches:[{id:'TRUNK',parent:'',points:[[0,0,0],[0,0,1],[0,0,2]],length:2,start_radius:.18,end_radius:.09},{id:'ROOT',parent:'TRUNK',attach:.6,points:[[0,0,1.2],[.4,0,1.8],[.9,0,2.4],[1.4,0,3]],length:3,start_radius:.07,end_radius:.025}]},branch_library:[source],
   branch_instances:[0,1,2,3].map(n=>({id:'I'+n,parent:'ROOT',asset_id:source.id,linked:true,attach:.2+n*.2,scale:.6,radius_scale:.8+n*.1,angle:60,azimuth:n*77,seed:42,variation:0})),
   recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},tree_organs:{...source.sample.authoring.tree_organs,mode:'LEAVES'}}};
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});let page;
 try{
  page=await browser.newPage({viewport:{width:1440,height:950}});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|VALIDATE|WebGLProgram|GL_INVALID/i.test(m.text()))report.shaderErrors.push(m.text().slice(0,1200));});
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  const idle=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
  await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='GPU编辑验收');await idle();
  const snap=()=>page.evaluate(()=>window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray()),b.startRadius,b.endRadius]));
  const initial=await snap();
  report.renderComparison=await page.evaluate(async()=>{
   const f=window.__branchForge,T=await import('/vendor/three.module.min.js'),{createSculptSnapshot,createMeshPreview,createCpuMeshPreview}=await import('/tree-sculpt.js');
   const s=createSculptSnapshot(f.asset.masterBranches),matrix=new T.Matrix4().makeRotationZ(.55);matrix.setPosition(.35,0,.05);const ids=new Set(s.keys());
   const gpu=createMeshPreview(f.asset,s,{gpu:true});gpu.updateRigid(matrix,ids);f.renderer.render(f.scene,f.camera);
   const gl=f.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,read=()=>{const bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;},a=read();
   // Exercise sparse texture rows after the first upload, including a return
   // to rest before repaint and a second displacement.
   const root=new Set([[...s.values()].find(b=>b.stableId==='ROOT').id]);gpu.updateRigid(matrix,root);f.renderer.render(f.scene,f.camera);
   gpu.updateRigid(new T.Matrix4().makeTranslation(.2,0,0),root);f.renderer.render(f.scene,f.camera);const sparseBytes=gpu.stats.uploadBytes;
   gpu.update(s);gpu.updateRigid(matrix,ids);f.renderer.render(f.scene,f.camera);
   const mode=gpu.stats.mode,instanced=f.asset.isInstancedAssembly,textureBytes=gpu.textures[1].image.data.byteLength;gpu.restore();
   const cpu=createCpuMeshPreview(f.asset,s);cpu.updateRigid(matrix,ids);f.renderer.render(f.scene,f.camera);const b=read();let differs=0,sum=0,max=0;
   for(let i=0;i<a.length;i+=4){const delta=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));if(delta>8)differs++;sum+=delta;max=Math.max(max,delta);}
   cpu.restore();return {mode,instanced,sparseBytes,textureBytes,differingPixelRatio:differs/(w*h),meanDifference:sum/(w*h),maxDifference:max,programs:f.renderer.info.programs.length,runnable:f.renderer.info.programs.every(p=>!p.diagnostics||p.diagnostics.runnable)};
  });
  assert.equal(report.renderComparison.mode,'GPU');assert.equal(report.renderComparison.instanced,true);assert.equal(report.renderComparison.runnable,true);assert.ok(report.renderComparison.sparseBytes<report.renderComparison.textureBytes);assert.ok(report.renderComparison.differingPixelRatio<.025,JSON.stringify(report.renderComparison));
  report.checks.push('actual GPU shader + radial thickness + leaf/flower materials + shadow rendering agree with CPU reference pixels');
  // Reload the real file to recover the shared instance batches after CPU comparison.
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='GPU编辑验收');await idle();
  await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:/^ROOT$/})}).click();
  const undo=await page.evaluate(()=>window.__branchForge.historyState.undo);
  await page.keyboard.press('r');await page.keyboard.press('z');await page.keyboard.type('25');await page.waitForFunction(()=>window.__branchForge.asset.activeEditPreview?.stats.updatedFrames>0);
  assert.equal(await page.evaluate(()=>window.__branchForge.asset.activeEditPreview.stats.mode),'GPU');assert.equal(await page.evaluate(()=>window.__branchForge.asset.isInstancedAssembly),true);assert.deepEqual(await snap(),initial);
  await page.screenshot({path:path.join(out,'GPU枝根旋转预览.png')});await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.__branchForge.keyboardTransformActive);assert.deepEqual(await snap(),initial);assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),undo);assert.equal(await page.evaluate(()=>window.__branchForge.asset.activeEditPreview),undefined);
  await page.keyboard.press('r');await page.keyboard.press('z');await page.keyboard.type('25');await page.keyboard.press('Enter');await idle();const edited=await snap();assert.notDeepEqual(edited,initial);assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),undo+1);
  await page.keyboard.press('Control+z');await idle();assert.deepEqual(await snap(),initial);await page.keyboard.press('Control+y');await idle();assert.deepEqual(await snap(),edited);
  report.checks.push('real R gesture uses GPU instances; Escape restores; Enter commits once; exact undo/redo');
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='gpu.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'GPU编辑保存.branch.json');await download.saveAs(saved);
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='GPU编辑验收');await idle();assert.deepEqual(await snap(),edited);assert.ok(!fs.readFileSync(saved,'utf8').includes('duckEditVertex'));report.checks.push('actual project save, page reload and file reimport reproduce all branch curves and radii; no GPU-only attributes saved');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.shaderErrors,[]);report.passed=true;console.log(JSON.stringify(report));
 }catch(e){if(page)await page.screenshot({path:path.join(out,'失败现场.png')});throw e;}finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
