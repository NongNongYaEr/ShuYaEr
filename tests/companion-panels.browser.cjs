const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve('.runtime/companion-panels');fs.mkdirSync(out,{recursive:true});const report={checks:[],errors:[]};
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});let page;
 try{
  page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.stack));
  const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
  const state=()=>page.evaluate(()=>JSON.stringify({authoring:window.__branchForge.authoring,history:window.__branchForge.historyState}));
  const tool=async key=>{const button=page.locator('.viewport-tool-rail [data-viewport-tool="'+key+'"]');const group=button.locator('xpath=ancestor::details');if(!await group.evaluate(e=>e.open))await group.locator(':scope > summary').click();if(!await button.evaluate(e=>e.classList.contains('active')))await button.click();};
  await page.goto(process.argv[2]);await wait();
  await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:/^R1\.1$/})}).click();
  assert(await page.locator('#localLeaves').isVisible());assert(!(await page.locator('#localLength').isVisible()));assert(!(await page.locator('#mountAttach').isVisible()));
  assert(!(await page.locator('#overrideProperties').isVisible()));const baseline=await state();
  await page.click('[data-tab="foliage"]');await page.locator('.parameter-scroll').evaluate(e=>e.scrollTop=70);
  const left=()=>page.evaluate(()=>({tab:document.querySelector('.parameter-tabs .active').dataset.tab,scroll:document.querySelector('.parameter-scroll').scrollTop}));const leftBefore=await left();
  await tool('COMB');assert.deepEqual(await left(),leftBefore);assert(await page.locator('.inspector-panel #quick_sculptRadius').isVisible());assert.equal(await page.locator('.parameter-panel #shapingContext').count(),0);
  await page.locator('#quick_sculptStrength').focus();await page.keyboard.press('End');assert.equal(await page.inputValue('#sculptStrength'),'1');
  await page.locator('#sculptQuickContext > details > summary').click();assert(await page.locator('#quick_sculptLength').isDisabled());
  await page.fill('#quick_sculptDepth','2.3');await page.locator('#quick_sculptDepth').press('Tab');assert.equal(await page.inputValue('#sculptDepth'),'2.3');
  assert.equal(await state(),baseline);await page.screenshot({path:path.join(out,'梳理-左右配合.png')});
  await tool('LEAF_ADD');assert(await page.locator('.inspector-panel #quick_leafBrushRadius').isVisible());await page.fill('#quick_leafBrushRadius','0.35');await page.locator('#quick_leafBrushRadius').press('Tab');assert.equal(await page.inputValue('#leafBrushRadius'),'0.35');
  await tool('BUNDLE_ROTATE');assert(await page.locator('#bundlePivot').isVisible());assert(!(await page.locator('#bundleValueX').isVisible()));await page.locator('#bundleNumericAdvanced > summary').click();assert(await page.locator('#bundleValueX').isVisible());
  await tool('SELECT');await page.click('[data-tab="edit"]');assert(!(await page.locator('#manualToolAlternatives').evaluate(e=>e.open)));
  await page.fill('#parameterSearch','柔顺度');assert(await page.locator('#sculptFlexibility').isVisible());await page.click('#parameterSearchClear');assert(!(await page.locator('#manualToolAlternatives').evaluate(e=>e.open)));
  await page.click('#assetTab');assert(!(await page.locator('.branch-outliner-section').isVisible()));await page.click('#contextTab');
  report.checks.push('选择配套优先、姿态与坐标默认折叠；切换梳理/补叶/变换保留左侧页签和滚动；右侧参数同步原控件且不产生编辑历史；高级搜索可见并还原折叠状态');

  const folder=path.resolve('次枝资产/全植物次枝成品V1/朴树');const name=fs.readdirSync(folder).find(n=>n.includes('短弯细梢')&&n.includes('混合')&&n.endsWith('.branchasset.json'));const unit=JSON.parse(fs.readFileSync(path.join(folder,name))).asset;
  const doc={format:'ProceduralBranchProject',version:4,...unit.sample,settings:{...unit.sample.settings,object_name:'侧栏配套验收',wind_strength:0,preview_lod:0},workspaces:{version:2,active:'BRANCH'}};
  const input=path.join(out,'侧栏配套.branch.json');fs.writeFileSync(input,JSON.stringify(doc));await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='侧栏配套验收');await wait();
  await page.click('#branchWorkflowADJUST');assert(await page.locator('#quickLeafSize').isVisible());assert(!(await page.locator('#quickLength').isVisible()));assert(await page.locator('.inspector-panel #ueKind').isVisible());
  const candidate=await page.evaluate(async()=>{
   const T=await import('/vendor/three.module.min.js'),f=window.__branchForge,a=f.asset,r=document.querySelector('#viewport').getBoundingClientRect(),ray=new T.Raycaster(),meshes=[];a.group.updateMatrixWorld(true);a.group.traverse(o=>{if(o.isMesh&&['branch','leaf','tree_organ'].includes(o.userData.category))meshes.push(o);});
   for(const mesh of meshes){if(mesh.userData.category!=='leaf')continue;const pos=mesh.geometry.attributes.position,idx=mesh.geometry.index;for(let n=0;n<idx.count;n+=9){const v=new T.Vector3();for(let k=0;k<3;k++)v.add(new T.Vector3().fromBufferAttribute(pos,idx.getX(n+k)));v.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld).project(f.camera);const x=r.left+(v.x+1)*r.width/2,y=r.top+(1-v.y)*r.height/2;if(x<r.left+130||x>r.right-35||y<r.top+110||y>r.bottom-100)continue;ray.setFromCamera(v,f.camera);const h=ray.intersectObjects(meshes,false)[0];if(!h||h.object.userData.category!=='leaf')continue;const uv=h.object.geometry.attributes.uv1,{width,height}=a.lookupTexture,i=h.face.a,id=a.elements[Math.floor(uv.getX(i)*width)+Math.floor(uv.getY(i)*height)*width]?.id;if(id)return{x,y,id};}}
  });assert(candidate);await page.mouse.click(candidate.x,candidate.y);await page.waitForFunction(id=>window.__branchForge.workbench.unitEditor.selection.includes(id),candidate.id);
  assert(await page.locator('#ueSource').isVisible());assert(await page.locator('#ueParent').isVisible());assert(!(await page.locator('#ueSize').isVisible()));assert(!(await page.locator('#currentBranchPanel').isVisible()));
  const oldScale=await page.evaluate(id=>window.__branchForge.asset.placements.find(p=>p.stableId===id).scale,candidate.id);
  await page.locator('#unitNumericAdvanced > summary').click();await page.fill('#ueSize','1.2');await page.locator('#ueSize').press('Tab');await wait();
  assert((await page.evaluate(id=>window.__branchForge.asset.placements.find(p=>p.stableId===id).scale,candidate.id))>oldScale*1.19);
  await page.click('#undoBtn');await wait();assert.equal(await page.evaluate(id=>window.__branchForge.asset.placements.find(p=>p.stableId===id).scale,candidate.id),oldScale);
  await page.locator('#unitNumericAdvanced > summary').click();await page.screenshot({path:path.join(out,'叶片-左生成右单元.png')});
  await page.selectOption('#ueKind','BRANCH');assert(await page.locator('#currentBranchPanel').isVisible());
  for(const mode of ['vineWorkspaceBtn','treeWorkspaceBtn','branchWorkspaceBtn']){await page.click('#'+mode);await wait();assert.equal(await page.locator('#ueKind').count(),1);assert.equal(await page.locator('#pointX').count(),1);assert.equal(await page.locator('#branchMountPanel').count(),1);}
  for(const width of [1366,1080]){await page.setViewportSize({width,height:900});await tool('COMB');const bounds=await page.locator('#shapingContext').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width);const body=await page.locator('.inspector-scroll').boundingBox();assert(body.height>200);await page.screenshot({path:path.join(out,width+'-工具配套.png')});}
  report.checks.push('真实叶片直接点选：左侧叶量/分布，右侧挂接/素材；底部数值编辑和撤销有效；三个工作区往返控件不丢失、不重复；窄窗口配套参数可用');
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
 }catch(e){if(page)await page.screenshot({path:path.join(out,'失败现场.png')});throw e;}finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
