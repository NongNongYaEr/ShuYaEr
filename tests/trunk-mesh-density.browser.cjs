const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const workspace=path.resolve(__dirname,'..'),web=path.join(workspace,'web'),out=path.join(workspace,'.runtime/trunk-mesh-ui');fs.mkdirSync(out,{recursive:true});
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
 const {createTrunkFormPreset}=await import('../web/trunk-form.js');
 const fixtureDoc=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));fixtureDoc.authoring.workbench||={};
 fixtureDoc.authoring.workbench.trunk_forms={version:1,branches:{CAMPHOR_TRUNK:createTrunkFormPreset('BUTTRESS')}};
 const fixture=path.join(out,'香樟_原采样输入.branch.json');fs.writeFileSync(fixture,JSON.stringify(fixtureDoc));
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
  console.log('CAMPHOR LOADED');await page.locator('[data-trunk-subpanel="details"] summary').click();await page.locator('[data-trunk-preset="BUTTRESS"]').click();await idle();if(!await page.evaluate(()=>window.__branchForge.workbench.trunkForm.enabled))await page.locator('#trunkFormMode').click();
  const baseline=await snap();
  const sectionMesh=page.locator('#trunkFormPanel .trunk-mesh-controls');await sectionMesh.locator('summary').click();await sectionMesh.locator('[data-trunk-mesh-preset="STANDARD"]').click();await idle();const standard=await snap();
  assert.equal(standard.form.mesh.radial_segments,128);assert.equal(standard.history,baseline.history+1);assert.notEqual(standard.trunk,baseline.trunk);
  for(const key of ['units','instances','sources'])assert.equal(standard[key],baseline[key]);check('550-unit camphor precision affects only the selected structural carrier');
  await sectionMesh.locator('[data-trunk-mesh-wire]').check();await frame();assert.deepEqual(await snap(),standard);
  assert.equal(await page.evaluate(()=>window.__branchForge.workbench.trunkForm.root.getObjectByName('TrunkMeshWire').children.length),1);check('wireframe changes viewing only, without history, geometry or source mutations');
  const radial=sectionMesh.locator('[data-trunk-mesh-value="radial_segments"]');await radial.fill('192');await radial.press('Enter');await idle();const custom=await snap();assert.equal(custom.form.mesh.radial_segments,192);assert.equal(custom.history,standard.history+1);
  await radial.fill('256');await radial.press('Escape');await idle();assert.deepEqual(await snap(),custom);assert.equal(await radial.inputValue(),'192');check('numeric precision previews cancel exactly and synchronize all three panels');
  await page.locator('#undoBtn').click();await idle();assert.equal((await snap()).trunk,standard.trunk);await page.locator('#redoBtn').click();await idle();assert.equal((await snap()).trunk,custom.trunk);check('one undo and redo restore exact grid and recipe');
  await page.locator('#trunkFormPanel [data-trunk-part="DETAIL"]').click();await page.locator('#trunkDirectConfirm').click();await idle();await page.locator('#trunkDetailDock').waitFor({state:'visible'});
  assert.deepEqual((await snap()).form.mesh,custom.form.mesh);check('explicit old-to-direct conversion keeps branch precision and legacy snapshot');
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
  await page.locator('#trunkDetailDock [data-detail-kind="SCAR"]').click();await page.locator('#trunkDetailDock [data-detail-tool="POINT"]').click();const point=await surface();await page.mouse.click(point.x,point.y);await idle();
  await page.locator('#trunkDetailDock [data-detail-value="width"]').fill('8');await page.locator('#trunkDetailDock [data-detail-value="width"]').press('Enter');await idle();
  await page.locator('#trunkDetailDock [data-detail-value="height"]').fill('2');await page.locator('#trunkDetailDock [data-detail-value="height"]').press('Enter');await idle();const refined=await snap();
  assert.equal(refined.form.details.length,1);assert.ok(refined.radial>192);assert.ok(refined.rings>129);for(const key of ['units','instances','sources'])assert.equal(refined[key],baseline[key]);check('minimum-size scar placement and parameters reach locally refined actual triangles');
  const detailMesh=page.locator('#trunkDetailDock .trunk-mesh-controls');await detailMesh.locator('summary').click();
  await detailMesh.locator('[data-trunk-mesh-value="segment_length"]').fill('6');await detailMesh.locator('[data-trunk-mesh-value="segment_length"]').press('Escape');await idle();assert.deepEqual(await snap(),refined);check('precision Escape also works inside the detail editor');
  await detailMesh.locator('[data-trunk-mesh-adaptive]').uncheck();await idle();const noAdaptive=await snap();assert.equal(noAdaptive.radial,192);assert.equal(noAdaptive.form.mesh.adaptive_details,false);
  await detailMesh.locator('[data-trunk-mesh-adaptive]').check();await idle();assert.equal((await snap()).trunk,refined.trunk);check('automatic refinement can be paused and resumed without changing detail recipes');
  await page.locator('#trunkFormPanel [data-trunk-part="SECTION"]').click();await frame();assert.equal(await page.locator('#trunkFormPanel .trunk-mesh-controls [data-trunk-mesh-wire]').isChecked(),true);
  await page.locator('#trunkFormPanel [data-trunk-view="FINAL"]').click();await frame();await page.screenshot({path:path.join(out,'01_本枝网格与线框.png')});
  await page.locator('#trunkFormPanel [data-trunk-part="DETAIL"]').click();await frame();await page.screenshot({path:path.join(out,'02_局部细节加密.png')});
  const savedBefore=await snap();
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const a=document.createElement('a');a.href=URL.createObjectURL(options.body.slice(offset));a.download='trunk-mesh.branch.json';a.click();return new Response(JSON.stringify({success:true,path:'mesh-test.branch.json'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.locator('#viewport').focus();await page.keyboard.press('Control+s');await page.waitForSelector('#projectSaveDialog[open]');await page.locator('[name="saveMode"][value="FILE"]').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'香樟_本枝精度验证.branch.json');await download.saveAs(saved);report.saved=saved;
  await page.reload();await idle();await page.locator('#projectInput').setInputFiles(saved);if(await page.locator('#projectSwitchConfirm[open]').isVisible())await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();await page.waitForFunction(()=>window.__branchForge?.authoring.branch_instances.length===550);await idle();await page.locator('#trunkFormSelectRoot').click();const reloaded=await snap();
  for(const key of ['form','trunk','units','instances','sources','radial','rings','triangles'])assert.deepEqual(reloaded[key],savedBefore[key],key+' cold reload');check('actual save UI file and fresh page reload reconstruct exact final mesh and all 550 whole units');
  report.geometry={baseline:{radial:baseline.radial,rings:baseline.rings,triangles:baseline.triangles},refined:{radial:refined.radial,rings:refined.rings,triangles:refined.triangles}};
  assert.equal(hash(input),beforeHash);assert.deepEqual(report.errors,[]);assert.deepEqual(report.shaderErrors,[]);report.passed=true;
 }catch(e){report.failure=e.stack;if(page)await page.screenshot({path:path.join(out,'失败现场.png')}).catch(()=>{});throw e;}
 finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'UI验收.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
