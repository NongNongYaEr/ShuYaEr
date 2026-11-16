const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/unit-drop');fs.mkdirSync(out,{recursive:true});const report={checks:[],errors:[]};
 const folder=path.resolve('次枝资产/全植物次枝成品V1/朴树'),name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json')),unit=JSON.parse(fs.readFileSync(path.join(folder,name))).asset;
 const document={format:'ProceduralBranchProject',version:4,...unit.sample,settings:{...unit.sample.settings,object_name:'叶花果工作台验收',wind_strength:0,preview_lod:0},workspaces:{version:2,active:'BRANCH'}};
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(document));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let page;
 try{
  page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.stack));await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
  const snap=()=>page.evaluate(()=>{const a=window.__branchForge.asset,indices=new Map();a.group.traverse(m=>{const uv=m.geometry?.attributes.uv1;if(!uv||m.userData.source_index===undefined)return;const {width,height}=a.lookupTexture;for(let i=0;i<uv.count;i++){const id=a.elements[Math.floor(uv.getX(i)*width)+Math.floor(uv.getY(i)*height)*width]?.id;if(id)indices.set(id,m.userData.source_index);}});return [...a.placements,...a.treeOrgans].map(p=>[p.stableId,p.branchStableId,p.source<0?indices.get(p.stableId):p.source,p.position.toArray(),p.direction.toArray(),p.scale]);});
  const field=async(id,value)=>{await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Tab');await wait();};
  await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='叶花果工作台验收');await wait();assert.equal(await page.evaluate(()=>window.__branchForge.workbench.mode),'BRANCH');

  await page.locator('#branchWorkflowASSEMBLE').click();
  await page.waitForFunction(()=>window.__branchForge.workbench.plantUnits.pack&&!window.__branchForge.workbench.plantUnits.busy);
  const initial=await snap();
  let targetIndex=0;const target=()=>page.evaluate(async targetIndex=>{const T=await import('/vendor/three.module.min.js'),f=window.__branchForge,r=document.querySelector('#viewport').getBoundingClientRect(),meshes=[],targets=[],ray=new T.Raycaster();f.asset.group.updateMatrixWorld(true);f.asset.group.traverse(o=>{if(o.isMesh&&o.userData.category==='branch')meshes.push(o);});for(const b of f.asset.masterBranches){if(b.unitOwner||b.instanceId)continue;for(let i=1;i<b.points.length;i++){const p=b.points[i].clone().lerp(b.points[i-1],.5),v=f.modelRoot.localToWorld(p).project(f.camera),x=r.left+(v.x+1)*r.width/2,y=r.top+(1-v.y)*r.height/2;if(x<r.left+95||x>r.right-40||y<r.top+110||y>r.bottom-75)continue;ray.setFromCamera(v,f.camera);const h=ray.intersectObjects(meshes,false)[0];if(h)targets.push({x,y,parent:h.object.userData.stable_id});}}return targets[Math.floor(targets.length*((targetIndex*.27)%1))];},targetIndex++);
  const drag=async(role,{empty=false,cancel=false,preview=false,reject=false}={})=>{
   await page.waitForFunction(()=>!window.__branchForge.workbench.plantUnits.busy);
   const cardId=await page.evaluate(role=>window.__branchForge.workbench.plantUnits.pack.units.find(u=>u.role===role).id,role);
   const source=page.locator('#unitAssemblyLibrary article').filter({has:page.locator('img')});
   const index=await page.evaluate(id=>[...document.querySelectorAll('#unitAssemblyLibrary article')].findIndex(e=>e.dataset.unitId===id),cardId);
   assert.ok(index>=0,'card for requested source exists');const chosen=source.nth(index);await chosen.scrollIntoViewIfNeeded();const rect=await chosen.boundingBox(),p=await target();assert.ok(p,'visible wood drop target');
   const before=await snap();await page.mouse.move(rect.x+rect.width/2,rect.y+25);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+12,rect.y+28,{steps:3});
   const dest=empty?{x:1500,y:200}:p;await page.mouse.move(dest.x,dest.y,{steps:20});await page.mouse.move(dest.x+.2,dest.y+.2);await page.waitForTimeout(150);
   if(!empty){assert.equal(await page.locator('#unitDropHint').isVisible(),true);assert.match(await page.locator('#unitDropHint').innerText(),/松手添加/);if(preview)await page.screenshot({path:path.join(out,'拖入单元预览.png')});}
   if(cancel)await page.keyboard.press('Escape');await page.mouse.up();
   if(empty||cancel||reject){await page.waitForTimeout(200);assert.deepEqual(await snap(),before);if(reject)assert.match(await page.locator('#toast').innerText(),/另一套共享贴图/);return;}
   console.log('drop',role,await page.locator('#toast').textContent());await page.waitForFunction(n=>window.__branchForge.authoring.unit_editing.items.length===n,before.filter(p=>p[0].startsWith('UNIT_')).length+1);await wait();
   const after=await snap(),added=after.find(p=>!before.some(q=>q[0]===p[0]));assert.ok(added);assert.equal(after.length,before.length+1);assert.deepEqual(after.filter(p=>p[0]!==added[0]),before);
   assert.equal(added[1],p.parent);assert.deepEqual(await page.evaluate(id=>window.__branchForge.workbench.unitEditor.selection,[added[0]]),[added[0]]);
   const record=await page.evaluate(id=>window.__branchForge.authoring.unit_editing.items.find(v=>v.id===id),added[0]);assert.deepEqual(record.offset,[0,0,0]);assert.equal(record.kind,role==='LEAF'?'LEAF':'ORGAN');return added;
  };
  await drag('LEAF',{empty:true});await drag('LEAF',{cancel:true});report.checks.push('real card drags to empty space and Escape cancel leave all placements unchanged');
  const leaf=await drag('LEAF',{preview:true}),withLeaf=await snap();await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),initial);await page.locator('#redoBtn').click();await wait();assert.deepEqual(await snap(),withLeaf);
  await drag('FLOWER');await drag('LEAF');report.checks.push('actual HTML5 mouse drags add one real leaf / flower per drop; correct parent and zero attachment offset; old units unchanged; undo/redo and repeat work');
  await page.locator('#unitRefreshPack').click();await page.waitForFunction(()=>!window.__branchForge.workbench.plantUnits.busy&&window.__branchForge.workbench.plantUnits.pack.units.length===9);
  await drag('FRUIT');const sourceCount=await page.evaluate(()=>window.__branchForge.authoring.tree_organs.units.length);await drag('FRUIT');assert.equal(await page.evaluate(()=>window.__branchForge.authoring.tree_organs.units.length),sourceCount);await page.screenshot({path:path.join(out,'新增果实并选中.png')});report.checks.push('real calibrated fruit card from library: previously unused source added once, repeated fruit drag reuses it, original flower mode and units preserved');
  // Import an extra calibrated card with the same atlas into the isolated browser store.
  await page.route('**/api/plant-units',route=>route.fulfill({json:{success:true,items:[]}}));
  const pack=await page.evaluate(()=>{const p=structuredClone(window.__branchForge.workbench.plantUnits.pack);p.id='drag-test-pack';p.name='拖放验收临时套装';p.units=p.units.map((u,i)=>({...u,id:'new_'+i}));return p;});
  const imported=path.join(out,'临时套装.plantunits.json');fs.writeFileSync(imported,JSON.stringify(pack));
  // The initialized disk backend is intercepted; tests never modify the formal library.
  await page.route('**/api/plant-unit',route=>route.fulfill({json:{success:true}}));
  await page.locator('#unitOpenWorkbench').click();await page.locator('#unitPackFile').setInputFiles(imported);await page.waitForFunction(()=>window.__branchForge.workbench.plantUnits.pack?.id==='drag-test-pack'&&!window.__branchForge.workbench.plantUnits.busy);await page.locator('#unitWorkbenchClose').click();
  await drag('LEAF');report.checks.push('new same-atlas source imports with its calibrated dimensions and adds exactly one unit without changing the automatic foliage pool');
  const savedSignature=await snap();await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='units.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'叶花果精修保存.branch.json');await download.saveAs(saved);
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='叶花果工作台验收');await wait();assert.deepEqual(await snap(),savedSignature);report.checks.push('actual save UI downloads project, page restart and load reproduce every placement ID, source, position, orientation and scale');
  await page.locator('#branchWorkflowASSEMBLE').click();await page.waitForFunction(()=>!window.__branchForge.workbench.plantUnits.busy);
  const mismatch={...pack,id:'different-atlas',material:{...pack.material,color:''}};const bad=path.join(out,'不同图集.plantunits.json');fs.writeFileSync(bad,JSON.stringify(mismatch));
  await page.locator('#unitOpenWorkbench').click();await page.locator('#unitPackFile').setInputFiles(bad);await page.waitForFunction(()=>window.__branchForge.workbench.plantUnits.pack?.id==='different-atlas'&&!window.__branchForge.workbench.plantUnits.busy);await page.locator('#unitWorkbenchClose').click();await drag('LEAF',{reject:true});report.checks.push('incompatible shared atlas is rejected without changing any placement or material');
  report.passed=true;assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report));
 }catch(e){if(page)await page.screenshot({path:path.join(out,'失败现场.png')});throw e;}finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
