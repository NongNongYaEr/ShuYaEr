// Real toolbar/shortcut regression in an owned, off-desktop DX12 host.
// Optional argv[2]: read-only user project, copied to this test's private area.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.runtime/model-sculpt-brush-switch',String(Date.now()));
const report={checks:[],errors:[]};let host,page;
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{fs.mkdirSync(out,{recursive:true});
 const original=process.argv[2]&&path.resolve(process.argv[2]),fixture=path.join(out,'fixture.branch.json');let originalHash;
 if(original){originalHash=hash(original);fs.copyFileSync(original,fixture);report.original={path:original,sha256:originalHash};}
 else{
  const dir=path.join(root,'次枝资产/全植物次枝成品V1/红叶石楠'),name=fs.readdirSync(dir).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));
  const item=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8').replace(/^\uFEFF/,'')).asset;
  fs.writeFileSync(fixture,JSON.stringify({format:'ProceduralBranchProject',version:4,settings:{...item.sample.settings,leaf_density:0,wind_strength:0,preview_lod:0,max_triangles:8000000},leaf_meshes:item.sample.leaf_meshes,authoring:{branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,2],[0,0,4]],length:4,start_radius:.08,end_radius:.025}]},branch_library:[item],branch_instances:[{id:'ONE',attach:.75,azimuth:0},{id:'TWO',attach:.25,azimuth:180}].map(i=>({...i,parent:'ROOT',asset_id:item.id,linked:true,angle:75,scale:1})),recipe:{tags:['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY']},tree_organs:item.sample.authoring.tree_organs}}));
 }
 const check=s=>{report.checks.push(s);console.log('PASS '+s);};
 try{
  host=await require('./owned-native-browser.cjs')({out});page=host.page;page.setDefaultTimeout(90000);page.on('pageerror',e=>report.errors.push(e.stack));
  await page.setViewportSize({width:1700,height:1100});
  await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'),()=>page.evaluate(()=>document.getElementById('projectSessionPanel').close()));
  const idle=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!f.workbench.busy&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&document.getElementById('busyOverlay').hidden&&!document.getElementById('projectLoadDialog').open;});
  const load=async()=>{const prior=await page.evaluate(()=>window.__branchForge.asset.group.uuid),cdp=await page.context().newCDPSession(page);try{const {root:doc}=await cdp.send('DOM.getDocument'),{nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'#projectInput'});await cdp.send('DOM.setFileInputFiles',{nodeId,files:[fixture]});}finally{await cdp.detach();}await page.waitForFunction(id=>window.__branchForge.asset.group.uuid!==id,prior);await idle();};
  const data=()=>page.evaluate(async()=>{const f=window.__branchForge,digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(f.authoring)));return {sha256:Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join(''),history:f.historyState,selected:f.workbench.instances.selectionOwners().map(i=>i.id).sort(),scope:document.getElementById('branchEditScope').value,count:f.authoring.branch_instances.length};});
  const state=()=>page.evaluate(()=>({tool:document.getElementById('viewport').dataset.viewportTool,effect:document.getElementById('unitBrushEffect').value,quick:document.getElementById('quick_unitBrushEffect').value,comb:document.querySelector('.viewport-tool-rail [data-viewport-tool="COMB"]').getAttribute('aria-pressed'),size:document.getElementById('unitSizeTool').getAttribute('aria-pressed'),title:document.getElementById('shapingContextTitle').textContent,status:document.getElementById('statusText').textContent}));
  const comb=page.locator('.viewport-tool-rail [data-viewport-tool="COMB"]'),select=page.locator('.viewport-tool-rail [data-viewport-tool="SELECT"]');
  const key=async k=>{await page.locator('#viewport').focus();await page.keyboard.press(k);};
  const expectComb=async()=>{await page.waitForFunction(()=>document.querySelector('.viewport-tool-rail [data-viewport-tool="COMB"]').getAttribute('aria-pressed')==='true'&&document.getElementById('unitSizeTool').getAttribute('aria-pressed')==='false');const s=await state();assert.equal(s.tool,'COMB');assert.equal(s.effect,'TURN');assert.equal(s.quick,'TURN');assert.match(s.title,/整支转向/);assert.match(s.status,/单元枝/);};
  const size=async()=>{await page.locator('#unitSizeTool').click();await page.waitForFunction(()=>document.getElementById('unitSizeTool').getAttribute('aria-pressed')==='true');assert.equal((await state()).effect,'SCALE');};
  await idle();await load();await page.locator('#branchEditScopeBar [data-tree-selection-kind="INSTANCE"]').click();await page.locator('#branchEditScope').selectOption('DIRECT');
  const before=await data();assert(before.count>0);assert.deepEqual(before.selected,[]);
  for(const [label,act]of [
   ['size → Comb click',async()=>{await size();await comb.click();}],
   ['size → Select → Comb click',async()=>{await size();await select.click();await comb.click();}],
   ['size → C',async()=>{await size();await key('c');}],
   ['size → Select → C',async()=>{await size();await select.click();await key('c');}],
  ]){await act();await expectComb();check(label+' restores the real TURN brush, matching button, quick field and panel');}
  const active=await state();await key('c');assert.deepEqual(await state(),active);check('C is idempotent once actual Comb is active');
  await comb.click();assert.equal((await state()).tool,'SELECT');await comb.click();await expectComb();check('active Comb click still toggles to Select and can reopen');
  for(const id of ['unitDensityTool','unitPaintTool']){await size();await page.locator('#'+id).click();await comb.click();await expectComb();check(id+' → Comb clears a lingering size effect');}
  for(const viewport of [{width:1544,height:871},{width:1366,height:768},{width:1700,height:1100}]){await page.setViewportSize(viewport);await select.click();await comb.click();await expectComb();}check('Comb is clickable at the reported viewport size and two other desktop sizes');
  const rect=await page.locator('#viewport').boundingBox();await page.mouse.move(rect.x+rect.width*.6,rect.y+rect.height*.4);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.6+30,rect.y+rect.height*.4-20,{steps:6});await page.mouse.up();
  assert.deepEqual(await data(),before);check('switches and empty DIRECT-scope stroke keep selection, authoring, history and every unit unchanged');
  await page.screenshot({path:path.join(out,'梳理切换.png')});
  await page.reload({waitUntil:'domcontentloaded'});await idle();await load();await page.locator('#branchEditScopeBar [data-tree-selection-kind="INSTANCE"]').click();await page.locator('#branchEditScope').selectOption('DIRECT');await size();await select.click();await key('c');await expectComb();
  const cold=await data();assert.equal(cold.sha256,before.sha256);assert.equal(cold.count,before.count);check('cold reload can switch after size again without changing project data');
  await page.waitForFunction(()=>{const s=window.__branchForge.nativeViewport.stats;return s.active&&!s.inFlight&&!s.pendingResources&&!s.lastError&&s.native.asset_identity===window.__branchForge.asset.group.uuid;});
  const audit=await page.evaluate(()=>window.__branchForge.nativeViewport.auditModel());assert(audit.checked&&!audit.mismatch);report.audit=audit;check('actual DX12 model audit agrees after switching and cold reload');
  assert.deepEqual(report.errors,[]);if(original)assert.equal(hash(original),originalHash);report.passed=report.checks.length;
 }catch(e){report.failure=e.stack;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('REPORT '+out);await host?.close();await require('./sculpt-test-cleanup.cjs')(out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
