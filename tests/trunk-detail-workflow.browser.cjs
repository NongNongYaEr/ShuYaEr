const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const workspace=path.resolve(__dirname,'..'),web=path.join(workspace,'web'),out=path.join(workspace,'.runtime/trunk-detail-workflow-ui');fs.mkdirSync(out,{recursive:true});
const input=path.join(workspace,'assets/tree-template-library/template-c75273b48abc49fbbfa602525f57c083.branch.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),beforeHash=hash(input);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary'};
// Read-only isolated HTTP fixture: no native dialogs, session writes or user
// library modifications. The save UI below supplies its picker result only.
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
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
 const fixture=path.join(out,'香樟_细节流程输入.branch.json');fs.writeFileSync(fixture,JSON.stringify(fixtureDoc));
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

  const dock=page.locator('#trunkDetailDock'),baseline=await snap();
  const value=key=>dock.locator('[data-detail-value="'+key+'"]');
  const setValue=async(key,v)=>{await value(key).fill(String(v));await value(key).press('Enter');};
  await dock.locator('[data-detail-kind="KNOT"]').click();
  await setValue('width',12);await setValue('height',4);await setValue('strength',15);
  assert.deepEqual(await snap(),baseline);assert.equal(await page.locator('#trunkFormPanel [data-detail-value="width"]').inputValue(),'12');
  assert.match(await dock.locator('[data-detail-value-scope]').textContent(),/下一笔/);check('next-stroke settings mirror panels without authoring, geometry or undo changes');
  let p=await surface();await page.mouse.click(p.x,p.y);await idle();const first=await snap();
  assert.equal(first.form.details.length,1);const firstDetail=first.form.details[0];assert.equal(firstDetail.width,12);assert.equal(firstDetail.height,.04);assert.equal(firstDetail.strength,.15);assert.equal(first.history,baseline.history+1);
  check('point placement uses prepared small-detail values and one undo');
  await dock.locator('[data-detail-kind="KNOT"]').click();assert.equal(await value('width').inputValue(),'12');
  await setValue('width',16);await setValue('height',6);assert.deepEqual(await snap(),first);
  await dock.locator('[data-detail-continuous]').check();p=await surface();await page.mouse.click(p.x,p.y);await idle();await page.mouse.click(p.x+4,p.y+8);await idle();const three=await snap();
  assert.equal(three.form.details.length,3);assert.deepEqual(three.form.details[0],firstDetail);for(const d of three.form.details.slice(1)){assert.equal(d.width,16);assert.equal(d.height,.06);assert.equal(d.strength,.15);}
  assert.equal(three.history,first.history+2);assert.match(await dock.locator('[data-detail-value-scope]').textContent(),/下一笔/);check('per-type remembered settings and continuous placement keep existing details unchanged');
  await dock.locator('[data-detail-continuous]').uncheck();await dock.locator('[data-detail-tool="SELECT"]').click();
  await dock.locator('.trunk-detail-select').first().click();await dock.locator('[data-detail-action="redraw"]').click();p=await surface();
  await page.mouse.move(p.x-4,p.y+20);await page.mouse.down();await page.mouse.move(p.x+3,p.y-20,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();await idle();assert.deepEqual(await snap(),three);
  check('cancelling a real redraw gesture restores original path, geometry and history');
  await dock.locator('[data-detail-action="redraw"]').click();p=await surface();await page.mouse.move(p.x-4,p.y+20);await page.mouse.down();await page.mouse.move(p.x+3,p.y-20,{steps:5});await page.mouse.up();await idle();const redraw=await snap();
  assert.equal(redraw.form.details.length,3);assert.ok(redraw.form.details[0].path.length>=2);for(const k of ['id','type','width','height','strength','seed','enabled'])assert.equal(redraw.form.details[0][k],firstDetail[k]);assert.deepEqual(redraw.form.details.slice(1),three.form.details.slice(1));assert.equal(redraw.history,three.history+1);
  await page.locator('#undoBtn').click();await idle();assert.deepEqual((await snap()).form,three.form);await page.locator('#redoBtn').click();await idle();assert.deepEqual((await snap()).form,redraw.form);
  check('redraw replaces one existing path with parameters retained; undo and redo are exact');
  await dock.locator('[data-detail-action="all"]').click();assert.equal(await dock.locator('[data-detail-action="redraw"]').isDisabled(),true);
  await dock.locator('[data-detail-action="disable"]').click();await idle();assert.ok((await snap()).form.details.every(d=>!d.enabled));
  await dock.locator('[data-detail-action="enable"]').click();await idle();assert.equal((await snap()).trunk,redraw.trunk);check('dock batch pause and resume compare the same selected group without deleting it');
  await dock.locator('[data-detail-action="presets"]').click();await dock.locator('[data-detail-library="combination"]').click();
  const smallPreset=dock.getByRole('button',{name:'小疤与卷边',exact:true});await smallPreset.waitFor();const beforePreset=await snap();
  await smallPreset.click();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.__branchForge.workbench.trunkForm.active),true);assert.deepEqual(await snap(),beforePreset);
  p=await surface();await page.mouse.move(p.x,p.y);await frame();await page.keyboard.press('Escape');await idle();assert.deepEqual(await snap(),beforePreset);
  check('preset requires a valid surface; preview Escape changes neither project nor history');
  await smallPreset.click();p=await surface();await page.mouse.move(p.x,p.y);await frame();
  const markerIds=()=>page.evaluate(()=>window.__branchForge.workbench.trunkForm.root.getObjectByName('TrunkDetailMarkers').children.filter(o=>o.userData.detailPoint).map(o=>o.userData.detailId));
  const previewIds=await markerIds();await page.mouse.move(p.x+4,p.y+4);await frame();assert.deepEqual(await markerIds(),previewIds);
  await page.mouse.click(p.x+4,p.y+4);await idle();let placed=await snap();assert.equal(placed.form.details.length,5);assert.equal(placed.history,beforePreset.history+1);assert.equal(placed.form.details[3].type,'SCAR');assert.equal(placed.form.details[4].type,'FLARE');
  await page.locator('#undoBtn').click();await idle();assert.deepEqual((await snap()).form,beforePreset.form);await page.locator('#redoBtn').click();await idle();assert.deepEqual((await snap()).form,placed.form);
  check('mouse preset placement retains preview IDs and commits the entire combination in one undo');
  await dock.locator('[data-detail-action="repeat-preset"]').click();p=await surface();await page.mouse.click(p.x+3,p.y+20);await idle();const repeated=await snap();
  assert.equal(repeated.form.details.length,7);assert.deepEqual(repeated.form.details.slice(0,5),placed.form.details);assert.equal(repeated.history,placed.history+1);assert.notEqual(repeated.form.details[5].id,repeated.form.details[3].id);
  placed=repeated;check('repeat-combination places a fresh copy without reopening the library or modifying earlier groups');

  await dock.locator('.trunk-detail-select').nth(3).click();await dock.locator('.trunk-detail-select').nth(4).click({modifiers:['Shift']});
  await dock.locator('[data-detail-name]').fill('小疤组合_UI验证');await dock.locator('[data-detail-action="save"]').click();
  await dock.getByRole('button',{name:'小疤组合_UI验证',exact:true}).waitFor();assert.deepEqual(await snap(),placed);check('saving a selected combination creates a reusable personal preset without editing the project');
  const libraryCard=await dock.getByRole('button',{name:'小疤组合_UI验证',exact:true}).elementHandle();
  await dock.locator('[data-detail-kind="KNOT"]').click();await dock.locator('[data-detail-tool="POINT"]').click();p=await surface();await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+2,p.y+2);await frame();
  assert.ok(await libraryCard.evaluate(el=>el.isConnected));await page.keyboard.press('Escape');await page.mouse.up();await idle();assert.deepEqual(await snap(),placed);check('live strokes retain library DOM and cancelled strokes restore exact authored state');
  for(const key of ['units','instances','sources'])assert.equal((await snap())[key],baseline[key]);
  await page.screenshot({path:path.join(out,'01_细节操作与小组合.png')});
  const savedBefore=await snap();
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const a=document.createElement('a');a.href=URL.createObjectURL(options.body.slice(offset));a.download='trunk-details.branch.json';a.click();return new Response(JSON.stringify({success:true,path:'detail-workflow-test.branch.json'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.locator('#viewport').focus();await page.keyboard.press('Control+s');await page.waitForSelector('#projectSaveDialog[open]');await page.locator('[name="saveMode"][value="FILE"]').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'香樟_细节操作验证.branch.json');await download.saveAs(saved);report.saved=saved;
  await page.reload();await idle();await page.locator('#projectInput').setInputFiles(saved);if(await page.locator('#projectSwitchConfirm[open]').isVisible())await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();await page.waitForFunction(()=>window.__branchForge?.authoring.branch_instances.length===550);await idle();await page.locator('#trunkFormSelectRoot').click();const reloaded=await snap();
  for(const key of ['form','trunk','units','instances','sources','radial','rings','triangles'])assert.deepEqual(reloaded[key],savedBefore[key],key+' cold reload');check('actual save UI and fresh page file reload reproduce all detail paths and all 550 complete units');
  await page.locator('#trunkFormMode').click();await page.locator('#trunkFormPanel [data-trunk-part="DETAIL"]').click();await dock.locator('[data-detail-action="presets"]').click();await dock.locator('[data-detail-library="combination"]').click();
  await dock.getByRole('button',{name:'小疤组合_UI验证',exact:true}).waitFor();check('personal combination survives a full page restart and remains available for placement');
  assert.equal(hash(input),beforeHash);assert.deepEqual(report.errors,[]);assert.deepEqual(report.shaderErrors,[]);report.passed=true;
 }catch(e){report.failure=e.stack;if(page)await page.screenshot({path:path.join(out,'失败现场.png')}).catch(()=>{});throw e;}
 finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'UI验收.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
