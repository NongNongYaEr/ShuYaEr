const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const workspace=path.resolve(__dirname,'..'),web=path.join(workspace,'web'),out=path.join(workspace,'.runtime/trunk-detail-size-ui');fs.mkdirSync(out,{recursive:true});
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
 const fixture=path.join(out,'香樟_厘米走势输入.branch.json');fs.writeFileSync(fixture,JSON.stringify(fixtureDoc));
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
  const cm=field=>dock.locator('[data-detail-cm="'+field+'"]');
  const setCm=async(field,value)=>{await cm(field).fill(String(value));await cm(field).press('Enter');};
  const measurements=()=>page.evaluate(async id=>{
    const {createTrunkFormPreviewGeometry}=await import('/branch-kernel.js'),{createTrunkDetailSizeMetric}=await import('/trunk-detail-size.js'),f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),form=f.authoring.workbench.trunk_forms.branches[id],s=f.collectSettings();let mesh;
    f.asset.group.traverse(o=>{if(o.userData.category==='branch'&&o.userData.stable_id===id)mesh=o;});mesh.updateWorldMatrix(true,false);
    const g=createTrunkFormPreviewGeometry(b,s,form,s.preview_lod,{view:'BASE'}),metric=createTrunkDetailSizeMetric(g,mesh.matrixWorld),result=form.details.map(d=>({width:metric.measure(d,'width'),height:metric.measure(d,'height')}));g.dispose();return result;
  },target);
  const near=(a,b)=>assert.ok(Math.abs(a-b)<.004,a+' ~= '+b);
  await dock.locator('[data-detail-kind="GROOVE"]').click();await setCm('width',3);await setCm('height',2);
  assert.deepEqual(await snap(),baseline);assert.equal(await page.locator('#trunkFormPanel [data-detail-cm="width"]').inputValue(),'3');check('cm settings prepare the next stroke without modifying the project or history');
  let p=await surface();await page.mouse.move(p.x-4,p.y+40);await page.mouse.down();await page.mouse.move(p.x+3,p.y-40,{steps:10});await page.mouse.up();await idle();const stroke=await snap();
  assert.equal(stroke.form.details.length,1);assert.ok(stroke.form.details[0].path.length>=3);assert.ok(stroke.form.details[0].width<8);assert.ok(stroke.form.details[0].height<.02);const measured=await measurements();near(measured[0].width,3);near(measured[0].height,2);assert.equal(stroke.history,baseline.history+1);
  check('actual small stroke uses cm conversion below old limits and creates visible editable path nodes');
  const node=()=>page.evaluate(()=>{
    const f=window.__branchForge,c=document.getElementById('viewport'),r=c.getBoundingClientRect(),root=f.workbench.trunkForm.root,m=root.getObjectByName('TrunkDetailMarkers');m.updateWorldMatrix(true,true);f.camera.updateMatrixWorld();
    const knots=m.children.filter(o=>o.userData.detailPathId),middle=knots.filter(o=>o.userData.pathIndex>0&&o.userData.pathIndex<Math.max(...knots.map(k=>k.userData.pathIndex))).sort((a,b)=>Math.abs(a.userData.pathIndex-5)-Math.abs(b.userData.pathIndex-5));
    for(const marker of middle){const p=marker.position.clone().applyMatrix4(m.matrixWorld).project(f.camera),x=r.left+(p.x+1)*r.width/2,y=r.top+(1-p.y)*r.height/2;if(p.z>=-1&&p.z<=1&&document.elementFromPoint(x,y)===c)return{x,y,index:marker.userData.pathIndex};}
    throw Error('no visible middle path node');
  });
  let n=await node();await page.mouse.click(n.x,n.y);await idle();assert.deepEqual(await snap(),stroke);check('clicking one path node selects it without changing geometry or adding undo');
  n=await node();await page.mouse.move(n.x,n.y);await page.mouse.down();await page.mouse.move(n.x+6,n.y-9,{steps:3});await page.keyboard.press('Escape');await page.mouse.up();await idle();assert.deepEqual(await snap(),stroke);
  check('real node-drag Escape restores exact original path, mesh and history');
  n=await node();await page.mouse.move(n.x,n.y);await page.mouse.down();await page.mouse.move(n.x+6,n.y-9,{steps:3});await page.mouse.up();await idle();const dragged=await snap(),oldDetail=stroke.form.details[0],newDetail=dragged.form.details[0];
  assert.equal(dragged.history,stroke.history+1);assert.equal(newDetail.path.length,oldDetail.path.length);assert.notDeepEqual(newDetail.path[n.index],oldDetail.path[n.index]);assert.equal(newDetail.path[n.index].pressure,oldDetail.path[n.index].pressure);
  for(let i=0;i<newDetail.path.length;i++)if(i!==n.index)assert.deepEqual(newDetail.path[i],oldDetail.path[i]);for(const key of ['id','type','enabled','t','angle','width','height','strength','seed'])assert.equal(newDetail[key],oldDetail[key]);
  await page.locator('#undoBtn').click();await idle();assert.equal((await snap()).trunk,stroke.trunk);await page.locator('#redoBtn').click();await idle();assert.equal((await snap()).trunk,dragged.trunk);
  check('drag changes exactly one existing node, keeps pressure and parameters, and supports exact undo/redo');
  await dock.locator('[data-detail-kind="KNOT"]').click();await setCm('width',4);await setCm('height',3);p=await surface();await page.mouse.click(p.x+5,p.y+30);await idle();let two=await snap();
  assert.equal(two.form.details.length,2);const dims=await measurements();near(dims[1].width,4);near(dims[1].height,3);assert.deepEqual(two.form.details[0],newDetail);check('point placement also converts cm at its actual landing position');
  await dock.locator('.trunk-detail-select').first().click();await dock.locator('.trunk-detail-select').nth(1).click({modifiers:['Shift']});await setCm('width',5);await idle();await setCm('height',4);await idle();two=await snap();
  const batch=await measurements();for(const d of batch){near(d.width,5);near(d.height,4);}assert.equal(await cm('width').inputValue(),'5');assert.equal(await cm('height').inputValue(),'4');check('mixed selection receives matching real cm sizes per landing position and both panels synchronize');
  await dock.locator('.trunk-detail-select').nth(1).click();await setCm('width',6);await idle();const remembered=await snap();
  await dock.locator('[data-detail-kind="KNOT"]').click();assert.equal(await cm('width').inputValue(),'6');assert.deepEqual(await snap(),remembered);await page.keyboard.press('Escape');await idle();await page.locator('#undoBtn').click();await idle();assert.deepEqual(await snap(),two);
  check('committed single-item cm sizing is remembered for the next same-type detail without an extra project edit');
  await dock.locator('.trunk-detail-select').first().click();await dock.locator('.trunk-detail-select').nth(1).click({modifiers:['Shift']});
  await cm('height').fill('6');await cm('height').fill('');await cm('height').press('Control+s');await frame();assert.equal(await page.locator('#projectSaveDialog[open]').isVisible(),false);assert.equal(await page.evaluate(()=>window.__branchForge.workbench.trunkForm.active),true);await cm('height').press('Escape');await idle();assert.deepEqual(await snap(),two);
  check('invalid cm edits block saving and Escape restores the preceding complete state');
  await dock.locator('.trunk-detail-select').first().click();await setCm('width',.01);await idle();const limited=await snap(),limitedDimensions=await measurements();near(limited.form.details[0].width,1);assert.ok(limitedDimensions[0].width>.01);assert.match(await dock.locator('[data-detail-cm-note]').textContent(),/实际|可用/);
  await page.locator('#undoBtn').click();await idle();assert.equal((await snap()).trunk,two.trunk);check('out-of-range cm request exposes the actual bounded width and remains undoable');
  for(const key of ['units','instances','sources'])assert.equal((await snap())[key],baseline[key]);check('all cm and node edits preserve all 550 complete-unit sources, geometry and transforms');
  await dock.locator('.trunk-detail-select').first().click();p=await surface();await page.screenshot({path:path.join(out,'01_厘米尺寸与走势点.png')});
  const savedBefore=await snap();
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const a=document.createElement('a');a.href=URL.createObjectURL(options.body.slice(offset));a.download='trunk-details.branch.json';a.click();return new Response(JSON.stringify({success:true,path:'detail-workflow-test.branch.json'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.locator('#viewport').focus();await page.keyboard.press('Control+s');await page.waitForSelector('#projectSaveDialog[open]');await page.locator('[name="saveMode"][value="FILE"]').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'香樟_厘米走势验证.branch.json');await download.saveAs(saved);report.saved=saved;
  await page.reload();await idle();await page.locator('#projectInput').setInputFiles(saved);if(await page.locator('#projectSwitchConfirm[open]').isVisible())await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();await page.waitForFunction(()=>window.__branchForge?.authoring.branch_instances.length===550);await idle();await page.locator('#trunkFormSelectRoot').click();const reloaded=await snap();
  for(const key of ['form','trunk','units','instances','sources','radial','rings','triangles'])assert.deepEqual(reloaded[key],savedBefore[key],key+' cold reload');check('actual save UI and fresh page file reload reproduce all detail paths and all 550 complete units');
  assert.equal(hash(input),beforeHash);assert.deepEqual(report.errors,[]);assert.deepEqual(report.shaderErrors,[]);report.passed=true;
 }catch(e){report.failure=e.stack;if(page)await page.screenshot({path:path.join(out,'失败现场.png')}).catch(()=>{});throw e;}
 finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'UI验收.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
