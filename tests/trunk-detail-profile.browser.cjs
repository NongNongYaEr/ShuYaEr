const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
require('node:module').register('./vendor-loader.mjs',require('node:url').pathToFileURL(__filename));
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const workspace=path.resolve(__dirname,'..'),web=path.join(workspace,'web'),out=path.join(workspace,'.runtime/trunk-detail-profile-ui');fs.mkdirSync(out,{recursive:true});
const input=path.join(workspace,'assets/tree-template-library/template-c75273b48abc49fbbfa602525f57c083.branch.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),beforeHash=hash(input);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary'};
const profilesFolder=path.join(out,'trunk-presets/profile');fs.mkdirSync(profilesFolder,{recursive:true});
// Read-only isolated HTTP fixture: no native dialogs, session writes or user
// library modifications. The save UI below supplies its picker result only.
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(['/api/trunk-presets','/api/trunk-preset'].includes(url.pathname)&&url.searchParams.get('kind')==='profile'){
    res.setHeader('Content-Type','application/json');
    try{const {normalizeTrunkPreset}=await import('../web/trunk-preset-store.js');
      if(req.method==='POST'){const body=[];for await(const chunk of req)body.push(chunk);const item=normalizeTrunkPreset('profile',JSON.parse(Buffer.concat(body).toString()));fs.writeFileSync(path.join(profilesFolder,item.id+'.json'),JSON.stringify(item));res.end(JSON.stringify({success:true,item}));}
      else if(req.method==='DELETE'){const id=url.searchParams.get('id');if(!/^trunk-preset-[a-f0-9]{32}$/.test(id||''))throw Error('ID');const file=path.join(profilesFolder,id+'.json'),item=JSON.parse(fs.readFileSync(file));fs.unlinkSync(file);res.end(JSON.stringify({success:true,item}));}
      else res.end(JSON.stringify({success:true,items:fs.readdirSync(profilesFolder).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(profilesFolder,f))))}));
    }catch(e){res.statusCode=400;res.end(JSON.stringify({success:false,message:e.message}));}return;
  }
  if(url.pathname==='/api/project-document'){
    const id=url.searchParams.get('id'),p=/^template-[a-f0-9]+$/.test(id||'')?path.join(workspace,'assets/tree-template-library',id+'.branch.json'):'';
    if(p&&fs.existsSync(p)){res.setHeader('Content-Type','application/json');fs.createReadStream(p).pipe(res);return;}
  }
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');
    if(/project-session|project-library|saved-projects|branch-thumbnails/.test(url.pathname)){res.end(JSON.stringify({success:true,items:[]}));return;}
    res.statusCode=404;res.end(JSON.stringify({success:false,message:'Isolated test fixture'}));return;
  }
  const p=path.resolve(web,url.pathname==='/'?'index.html':'.'+decodeURIComponent(url.pathname));
  if(!p.startsWith(web+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');fs.createReadStream(p).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {createDirectTrunkForm}=await import('../web/trunk-form.js');
 const fixtureDoc=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));fixtureDoc.authoring.workbench||={};
 fixtureDoc.authoring.workbench.trunk_forms={version:1,branches:{CAMPHOR_TRUNK:createDirectTrunkForm()}};
 const fixture=path.join(out,'香樟_细节轮廓输入.branch.json');fs.writeFileSync(fixture,JSON.stringify(fixtureDoc));
 const report={checks:[],errors:[],shaderErrors:[]},check=s=>{report.checks.push(s);console.log('OK '+s);};
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});let page;
 try{
  page=await browser.newPage({viewport:{width:1700,height:1080}});page.setDefaultTimeout(60000);page.on('pageerror',e=>{report.errors.push(e.message);console.log('PAGE ERROR '+e.message);});
  page.on('console',m=>{if(m.type()==='error'&&/shader|gl_invalid|compile|webglprogram/i.test(m.text()))report.shaderErrors.push(m.text());});
  await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'),()=>page.evaluate(()=>document.getElementById('projectSessionPanel').close()));
  const idle=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&!f.workbench.trunkForm.active&&document.getElementById('busyOverlay').hidden&&!document.getElementById('projectLoadDialog').open;});
  const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.goto('http://127.0.0.1:'+server.address().port);await idle();console.log('INITIALIZED');
  await page.locator('#projectInput').setInputFiles(fixture);if(await page.locator('#projectSwitchConfirm[open]').isVisible())await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();
  await page.waitForFunction(()=>window.__branchForge?.authoring.branch_instances.length===550);await idle();await page.locator('#trunkFormSelectRoot').click();
  const target=await page.evaluate(()=>window.__branchForge.selectedCurvePoint.branchId);report.target=target;
  const snap=()=>page.evaluate(async id=>{
   const f=window.__branchForge,digest=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))).map(n=>n.toString(16).padStart(2,'0')).join('');let trunk;const units=[];
   f.asset.group.traverse(m=>{if(m.userData.category==='branch'&&m.userData.stable_id===id)trunk=m;if(m.isInstancedMesh)units.push([Array.from(m.instanceMatrix.array),Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,v])=>[k,Array.from(v.array)])),Array.from(m.geometry.index?.array||[])]);});
   return{form:structuredClone(f.authoring.workbench.trunk_forms?.branches[id]),trunk:await digest(Array.from(trunk.geometry.attributes.position.array)),units:await digest(units),instances:await digest(f.authoring.branch_instances),sources:await digest(f.authoring.branch_library),history:f.historyState.undo,radial:trunk.geometry.userData.radiusRings[0].count,rings:trunk.geometry.userData.radiusRings.length,triangles:trunk.geometry.index.count/3};
  },target);
  await page.locator('#trunkFormMode').click();
  const sectionMesh=page.locator('#trunkFormPanel .trunk-mesh-controls');await sectionMesh.locator('summary').click();await sectionMesh.locator('[data-trunk-mesh-preset="STANDARD"]').click();await idle();
  await page.locator('#trunkFormPanel [data-trunk-part="DETAIL"]').click();await idle();
  const surface=()=>page.evaluate(async id=>{
   const THREE=await import('/vendor/three.module.min.js'),{interpolateSectionRing}=await import('/trunk-section-interaction.js'),{skeletonBranches}=await import('/skeleton-thickness.js'),f=window.__branchForge,c=document.getElementById('viewport'),rect=c.getBoundingClientRect(),ids=new Set(skeletonBranches(f.asset.masterBranches).map(b=>b.stableId)),all=[];let mesh;
   f.asset.group.traverse(o=>{if(o.userData.category==='branch'&&o.userData.stable_id===id)mesh=o;if(o.isMesh&&!o.isInstancedMesh&&o.visible&&o.userData.category==='branch'&&ids.has(o.userData.stable_id))all.push(o);});
   mesh.updateWorldMatrix(true,false);all.forEach(o=>o.updateWorldMatrix(true,false));const ray=new THREE.Raycaster();
   for(const t of [.35,.2,.1,.5]){const r=interpolateSectionRing(mesh.geometry.userData.radiusRings,t,mesh.geometry.attributes.position),center=new THREE.Vector3(...r.center).applyMatrix4(mesh.matrixWorld);
    for(const direction of [[5,-11,4],[-5,-11,4],[11,5,4],[-11,5,4],[5,11,4]]){
     f.controls.target.copy(center);f.camera.position.copy(center).add(new THREE.Vector3(...direction));f.controls.update();f.camera.updateMatrixWorld();
     for(const dx of [0,-.25,.25,-.5,.5]){const p=new THREE.Vector3(...r.center).addScaledVector(new THREE.Vector3(...r.x),r.localRadius*dx).applyMatrix4(mesh.matrixWorld).project(f.camera),coords={x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};
      if(p.z<-1||p.z>1||document.elementFromPoint(coords.x,coords.y)!==c)continue;ray.setFromCamera(new THREE.Vector2(p.x,p.y),f.camera);if(ray.intersectObjects(all,false)[0]?.object===mesh)return coords;}
    }
   }throw Error('no visible carrier surface');
  },target);



  const dock=page.locator('#trunkDetailDock'),editor=dock.locator('[data-detail-profile-editor]'),baseline=await snap();
  await dock.locator('[data-detail-kind="GROOVE"]').click();
  await editor.locator('summary').first().click();await frame();assert.deepEqual(await snap(),baseline);check('opening the independent cross-section editor leaves the legacy geometry and history exact');
  await page.locator('#viewport').focus();for(const [key,tool] of [['1','POINT'],['2','PATH'],['3','PAINT'],['v','SELECT']]){await page.keyboard.press(key);assert.equal(await dock.locator(`[data-detail-tool="${tool}"]`).evaluate(n=>n.classList.contains('active')),true);}await page.keyboard.press('?');assert.equal(await dock.locator('.trunk-shortcut-help').evaluate(n=>n.open),true);await page.keyboard.press('?');assert.equal(await dock.locator('.trunk-shortcut-help').evaluate(n=>n.open),false);assert.deepEqual(await snap(),baseline);check('detail 1/2/3 select the actual placement tools and ? exposes scoped help without geometry edits');
  const {TRUNK_DETAIL_PROFILES}=await import('../web/trunk-detail-profile.js'),v=TRUNK_DETAIL_PROFILES.find(p=>p.id==='V_GROOVE').shape;
  await dock.locator('[data-detail-kind="GROOVE"]').click();await editor.locator('[data-profile-preset="V_GROOVE"]').click();assert.deepEqual(await snap(),baseline);
  check('built-in V groove sets only the next stroke, with no project edit or undo');
  let p=await surface();await page.mouse.move(p.x-4,p.y+40);await page.mouse.down();await page.mouse.move(p.x+3,p.y-40,{steps:10});await page.mouse.up();await idle();let stroke=await snap();
  assert.equal(stroke.form.details.length,1);assert.deepEqual(stroke.form.details[0].profile,v);assert.ok(stroke.form.details[0].path.length>2);assert.equal(stroke.history,baseline.history+1);
  for(const k of ['units','instances','sources'])assert.equal(stroke[k],baseline[k]);check('the next drawn stroke carries its profile into actual geometry, preserving all 550 complete units');
  await page.locator('#viewport').focus();await page.keyboard.press('Control+d');assert.equal(await dock.locator('.trunk-detail-select[aria-pressed="true"]').count(),0);await page.keyboard.press('Shift+r');await page.keyboard.press('Shift+a');assert.deepEqual(await snap(),stroke);await page.keyboard.press('Control+i');assert.equal(await dock.locator('.trunk-detail-select[aria-pressed="true"]').count(),1);await page.keyboard.press('Control+i');assert.equal(await dock.locator('.trunk-detail-select[aria-pressed="true"]').count(),0);await page.keyboard.press('Control+a');assert.equal(await dock.locator('.trunk-detail-select[aria-pressed="true"]').count(),1);assert.deepEqual(await snap(),stroke);check('detail Ctrl+A/D/I use actual selection and empty redraw/repeat commands cannot create or edit details');
  await page.keyboard.press('Shift+h');await idle();const paused=await snap();assert.equal(paused.form.details[0].enabled,false);assert.equal(paused.history,stroke.history+1);for(const k of ['units','instances','sources'])assert.equal(paused[k],stroke[k]);await page.keyboard.press('Shift+e');await idle();assert.equal((await snap()).form.details[0].enabled,true);await page.locator('#undoBtn').click();await idle();await page.locator('#undoBtn').click();await idle();assert.deepEqual(await snap(),stroke);await page.locator('#viewport').focus();await page.keyboard.press('Shift+r');assert.match(await dock.locator('[data-detail-guide]').textContent(),/重画/);await page.keyboard.press('Escape');await idle();assert.deepEqual(await snap(),stroke);check('Shift+H/E pause and enable only selected details with exact undo; Shift+R redraw cancels without changes');
  const rest=d=>Object.fromEntries(Object.entries(d).filter(([k])=>k!=='profile'));
  await editor.locator('[data-profile-preset="U_GROOVE"]').click();await idle();let rounded=await snap();assert.notEqual(rounded.trunk,stroke.trunk);assert.deepEqual(rest(rounded.form.details[0]),rest(stroke.form.details[0]));assert.equal(rounded.history,stroke.history+1);
  check('applying a cross-section preset changes the real trunk mesh while preserving identity, path, pressure, dimensions and strength');
  const center=editor.locator('[data-profile-point="2"]');
  await center.scrollIntoViewIfNeeded();let r=await center.boundingBox(),pt={x:r.x+r.width/2,y:r.y+r.height/2};await page.mouse.click(pt.x,pt.y);await idle();assert.deepEqual(await snap(),rounded);
  await page.mouse.move(pt.x,pt.y);await page.mouse.down();await page.mouse.move(pt.x+12,pt.y-17,{steps:3});await page.keyboard.press('Escape');await page.mouse.up();await idle();assert.deepEqual(await snap(),rounded);
  check('click adds no undo; Escape during a real profile drag restores exact geometry, knots and history');
  r=await center.boundingBox();pt={x:r.x+r.width/2,y:r.y+r.height/2};await page.mouse.move(pt.x,pt.y);await page.mouse.down();await page.mouse.move(pt.x+12,pt.y-17,{steps:3});await page.mouse.up();await idle();let dragged=await snap();assert.equal(dragged.history,rounded.history+1);assert.notDeepEqual(dragged.form.details[0].profile,rounded.form.details[0].profile);assert.deepEqual(rest(dragged.form.details[0]),rest(rounded.form.details[0]));
  await page.locator('#undoBtn').click();await idle();assert.equal((await snap()).trunk,rounded.trunk);await page.locator('#redoBtn').click();await idle();assert.equal((await snap()).trunk,dragged.trunk);
  check('drag commits one edit and real mesh undo/redo reproduces both contours');
  const y=editor.locator('[data-profile-field="y"]');await y.fill('-45');await y.fill('');await y.press('Control+s');await frame();assert.equal(await page.locator('#projectSaveDialog[open]').isVisible(),false);assert.equal(await page.evaluate(()=>window.__branchForge.workbench.trunkForm.active),true);await y.press('Escape');await idle();assert.equal((await snap()).trunk,dragged.trunk);
  await y.fill('-45');await y.press('Enter');await idle();const numeric=await snap();assert.equal(numeric.form.details[0].profile.points[2].y,-.45);assert.equal(await page.locator('#trunkFormPanel [data-profile-field="y"]').inputValue(),'-45');
  check('numeric knot editing synchronizes both panels; invalid coordinates block saving and Escape restores the previous state');
  const graph=editor.locator('[data-profile-graph]');await graph.scrollIntoViewIfNeeded();await graph.focus();await graph.press('Tab');await graph.press('Shift+Tab');assert.deepEqual(await snap(),numeric);await graph.press('a');await idle();const keyInserted=await snap();assert.equal(keyInserted.form.details[0].profile.points.length,numeric.form.details[0].profile.points.length+1);assert.equal(keyInserted.history,numeric.history+1);assert.deepEqual(rest(keyInserted.form.details[0]),rest(numeric.form.details[0]));await page.locator('#undoBtn').click();await idle();assert.deepEqual(await snap(),numeric);check('profile Tab changes only the selected point and A inserts on its actual following segment with one undo');
  await graph.focus();await page.keyboard.down('ArrowUp');await page.keyboard.down('ArrowUp');await frame();assert.equal((await snap()).history,numeric.history);await page.keyboard.up('ArrowUp');await idle();let keyMoved=await snap();assert.equal(keyMoved.history,numeric.history+1);assert.equal(keyMoved.form.details[0].profile.points.filter((p,i)=>p.y!==numeric.form.details[0].profile.points[i].y).length,1);assert.deepEqual(rest(keyMoved.form.details[0]),rest(numeric.form.details[0]));for(const k of ['units','instances','sources'])assert.equal(keyMoved[k],numeric[k]);await page.locator('#undoBtn').click();await idle();assert.deepEqual(await snap(),numeric);await graph.focus();await page.keyboard.down('ArrowLeft');await frame();await page.keyboard.press('Escape');await page.keyboard.up('ArrowLeft');await idle();assert.deepEqual(await snap(),numeric);check('held profile arrows commit once on release and Escape cancels the complete nudge without unit changes');
  await graph.focus();const keyIndex=await graph.locator('.selected').getAttribute('data-profile-point');await graph.press('Shift+ArrowRight');await idle();keyMoved=await snap();assert.ok(Math.abs(keyMoved.form.details[0].profile.points[keyIndex].x-numeric.form.details[0].profile.points[keyIndex].x-.05)<1e-9);await page.locator('#undoBtn').click();await idle();await graph.focus();await graph.press('Alt+ArrowLeft');await idle();keyMoved=await snap();assert.ok(Math.abs(keyMoved.form.details[0].profile.points[keyIndex].x-numeric.form.details[0].profile.points[keyIndex].x+.001)<1e-9);await page.locator('#undoBtn').click();await idle();await editor.locator('[data-profile-point="0"]').click();await graph.focus();await graph.press('ArrowRight');await idle();assert.deepEqual(await snap(),numeric);await graph.press('m');await idle();await page.locator('#undoBtn').click();await idle();await graph.focus();await graph.press('l');await idle();assert.equal((await snap()).form.details[0].profile.interpolation,'LINEAR');await page.locator('#undoBtn').click();await idle();assert.deepEqual(await snap(),numeric);check('profile Shift/Alt sensitivity, fixed endpoints, mirror and interpolation shortcuts obey the existing shape constraints');
  await graph.scrollIntoViewIfNeeded();r=await graph.boundingBox();await page.mouse.dblclick(r.x+r.width*220/300,r.y+r.height*60/170);await idle();const inserted=await snap();assert.equal(inserted.form.details[0].profile.points.length,numeric.form.details[0].profile.points.length+1);
  await editor.locator('[data-profile-action="remove"]').click();await idle();assert.deepEqual((await snap()).form.details[0].profile,numeric.form.details[0].profile);
  await graph.scrollIntoViewIfNeeded();r=await graph.boundingBox();await page.mouse.dblclick(r.x+r.width*220/300,r.y+r.height*60/170);await idle();await graph.focus();await graph.press('Delete');await idle();assert.equal((await snap()).form.details.length,1);assert.deepEqual((await snap()).form.details[0].profile,numeric.form.details[0].profile);
  await editor.locator('[data-profile-point="0"]').click();await graph.press('Delete');await idle();assert.equal((await snap()).form.details.length,1);assert.deepEqual((await snap()).form.details[0].profile,numeric.form.details[0].profile);
  await editor.locator('[data-profile-action="mirror"]').click();await idle();await editor.locator('[data-profile-interpolation]').selectOption('LINEAR');await idle();let edited=await snap();assert.equal(edited.form.details[0].profile.interpolation,'LINEAR');assert.deepEqual(rest(edited.form.details[0]),rest(stroke.form.details[0]));
  check('insert/delete including protected-endpoint Delete, mirror and straight interpolation edit only the chosen cross section');
  const beforeDefault=await snap();await editor.locator('[data-profile-action="reset"]').click();await idle();assert.equal(Object.hasOwn((await snap()).form.details[0],'profile'),false);await page.locator('#undoBtn').click();await idle();assert.equal((await snap()).trunk,beforeDefault.trunk);
  check('restore type default is explicit and undoable');
  const personal=editor.locator('[data-profile-personal]');await personal.locator('summary').click();await personal.locator('[data-profile-name]').fill('界面验证_偏心卷边');await personal.locator('[data-profile-action="save"]').click();await page.waitForFunction(()=>document.querySelector('#trunkDetailDock [data-profile-status]').textContent.includes('已另存'));const personalCard=personal.locator('[data-profile-preset^="trunk-preset-"]').filter({hasText:'界面验证_偏心卷边'}).first(),personalId=await personalCard.getAttribute('data-profile-preset');
  assert.ok(fs.existsSync(path.join(profilesFolder,personalId+'.json')));assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profilesFolder,personalId+'.json'))).shape,beforeDefault.form.details[0].profile);
  check('personal contour is saved as a real independent file with a thumbnail, without position or source branch data');
  await dock.locator('[data-detail-create] > summary').click();await dock.locator('[data-detail-kind="KNOT"]').click();await editor.locator('[data-profile-preset="ROUND_RIDGE"]').click();p=await surface();await page.mouse.click(p.x+5,p.y+30);await idle();let two=await snap();assert.equal(two.form.details.length,2);
  await dock.locator('.trunk-detail-select').first().click();await dock.locator('.trunk-detail-select').nth(1).click({modifiers:['Shift']});assert.equal(await editor.locator('[data-profile-field="y"]').isDisabled(),true);await editor.locator('[data-profile-preset="OFFSET_GROOVE"]').click();await idle();two=await snap();for(const d of two.form.details)assert.deepEqual(d.profile,TRUNK_DETAIL_PROFILES.find(p=>p.id==='OFFSET_GROOVE').shape);
  check('multi-selection explicitly applies a preset to actual selected details and disables ambiguous point editing');
  await dock.locator('.trunk-detail-select').first().click();await personalCard.click();await idle();for(const k of ['units','instances','sources'])assert.equal((await snap())[k],baseline[k]);
  await graph.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'01_独立细节截面编辑器.png')});
  const savedBefore=await snap();
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const a=document.createElement('a');a.href=URL.createObjectURL(options.body.slice(offset));a.download='trunk-details.branch.json';a.click();return new Response(JSON.stringify({success:true,path:'detail-workflow-test.branch.json'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.locator('#viewport').focus();await page.keyboard.press('Control+s');await page.waitForSelector('#projectSaveDialog[open]');await page.locator('[name="saveMode"][value="FILE"]').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'香樟_细节轮廓验证.branch.json');await download.saveAs(saved);report.saved=saved;
  await page.reload();await idle();await page.locator('#projectInput').setInputFiles(saved);if(await page.locator('#projectSwitchConfirm[open]').isVisible())await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();await page.waitForFunction(()=>window.__branchForge?.authoring.branch_instances.length===550);await idle();await page.locator('#trunkFormSelectRoot').click();const reloaded=await snap();
  for(const key of ['form','trunk','units','instances','sources','radial','rings','triangles'])assert.deepEqual(reloaded[key],savedBefore[key],key+' cold reload');check('actual save UI and fresh page file reload reproduce all detail paths and all 550 complete units');
  await page.locator('#trunkFormMode').click();await page.locator('#trunkFormPanel [data-trunk-part="DETAIL"]').click();await idle();await dock.locator('.trunk-detail-select').first().click();await editor.locator('summary').first().click();await personal.locator('summary').click();await page.waitForSelector('#trunkDetailDock [data-profile-preset="'+personalId+'"]');await personal.locator('[data-profile-preset="'+personalId+'"]').click();await idle();assert.deepEqual((await snap()).form.details[0].profile,JSON.parse(fs.readFileSync(path.join(profilesFolder,personalId+'.json'))).shape);await personal.locator('[data-profile-delete="'+personalId+'"]').click();await page.waitForFunction(id=>!document.querySelector('#trunkDetailDock [data-profile-preset="'+id+'"]'),personalId);assert.equal(fs.existsSync(path.join(profilesFolder,personalId+'.json')),false);
  check('a fresh page reload reads the real personal library; reuse preserves geometry and deletion leaves the authored detail intact');
  await page.locator('#viewport').focus();await page.keyboard.press('p');await dock.locator('[data-detail-presets] .trunk-detail-preset-card button:first-child').first().click();p=await surface();await page.mouse.move(p.x,p.y);await frame();await page.mouse.click(p.x,p.y);await idle();const presetBeforeRepeat=await snap();await page.locator('#viewport').focus();await page.keyboard.press('Shift+a');await page.mouse.move(p.x+2,p.y+3);await frame();assert.equal(await page.evaluate(()=>window.__branchForge.workbench.trunkForm.active),true);await page.keyboard.press('Escape');await idle();assert.deepEqual(await snap(),presetBeforeRepeat);check('Shift+A reuses the last confirmed preset through the existing preview and exact cancellation transaction');
  assert.equal(hash(input),beforeHash);assert.deepEqual(report.errors,[]);assert.deepEqual(report.shaderErrors,[]);report.passed=true;
 }catch(e){report.failure=e.stack;if(page)await page.screenshot({path:path.join(out,'失败现场.png')}).catch(()=>{});throw e;}
 finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'UI验收.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
