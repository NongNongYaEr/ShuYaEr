const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve('.runtime/branch-thumbnails');fs.mkdirSync(out,{recursive:true});
 const report={checks:[],errors:[]},browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});let page;
 try{
  page=await browser.newPage({viewport:{width:2048,height:1100}});page.setDefaultTimeout(180000);
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/api/branch-asset',r=>r.request().method()==='GET'?r.continue():r.abort());
  await page.addInitScript(()=>{window.thumbnailRenders=0;const original=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(type,...args){if(type==='image/jpeg'&&this.width===192&&this.height===144)window.thumbnailRenders++;return original.call(this,type,...args);};});
  const ready=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.getElementById('busyOverlay').hidden;});
  await page.goto(process.argv[2]);await ready();
  const metas=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,'')));
  await page.evaluate(async id=>{const {migrateProjectDocument}=await import('/authoring-state.js');const doc=migrateProjectDocument(await(await fetch('/api/project-document?id='+encodeURIComponent(id))).json());window.oldThumbnails=Object.fromEntries(doc.authoring.branch_library.map(a=>[a.id,a.thumbnail]));window.thumbnailRenders=0;await window.__branchForge.workbench.load(doc);},metas.find(m=>m.species==='CAMPHOR').id);await ready();
  report.initial=await page.evaluate(()=>({renders:window.thumbnailRenders,assets:window.__branchForge.workbench.library.map(a=>({changed:a.thumbnail!==window.oldThumbnails[a.id],valid:a.thumbnail_render_version==='sample-leaf-organ-v2'&&a.thumbnail_revision===a.revision}))}));
  assert.equal(report.initial.renders,report.initial.assets.length);assert(report.initial.assets.every(a=>a.valid));
  report.checks.push('旧香樟工程的已有缩略图全部识别失效，并按完整样本重画');
  console.log('Old project thumbnails rendered');
  await page.click('#openBranchAssembly');await page.click('#browseBranchCatalog');await page.fill('#blmSearch','红叶石楠');
  const id=await page.locator('.blm-card').filter({hasText:'红嫩'}).first().getAttribute('data-id');assert(id);
  const oldPhotinia=await page.locator(`.blm-card[data-id="${id}"] img`).getAttribute('src');
  await page.locator(`.blm-card[data-id="${id}"]`).click();await page.click('#blmUseAssembly');await ready();
  await page.waitForFunction(id=>window.__branchForge.workbench.library.some(a=>a.id===id&&a.thumbnail_render_version==='sample-leaf-organ-v2'),id);
  await page.click('#blmClose');await page.locator(`#wbAssetLibrary [data-asset="${id}"]`).dragTo(page.locator('[data-assembly-role="YOUNG"]'),{targetPosition:{x:18,y:14}});await ready();
  const image=await page.evaluate(id=>window.__branchForge.workbench.library.find(a=>a.id===id).thumbnail,id);
  report.catalogImageAlreadyCurrent=image===oldPhotinia;
  fs.writeFileSync(path.join(out,'红叶石楠旧缩略图.jpg'),Buffer.from(oldPhotinia.split(',')[1],'base64'));
  fs.writeFileSync(path.join(out,'红叶石楠新缩略图.jpg'),Buffer.from(image.split(',')[1],'base64'));
  console.log('Photinia added, thumbnail captured');
  const snap=()=>page.evaluate(async()=>{const f=window.__branchForge,data={branches:f.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())]),leaves:f.asset.placements.map(p=>[p.stableId,p.position.toArray(),p.scale]),palette:f.authoring.leaf_material,allocation:f.authoring.branch_instances.map(i=>[i.id,i.asset_id,i.linked])};const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');});
  const before=await snap();
  console.log('Geometry captured');
  await page.click('#browseBranchCatalog');await page.fill('#blmSearch','红叶石楠');
  // Same asset revision, different cached image: all mounted cards must repaint.
  await page.evaluate(id=>{const f=window.__branchForge,a=f.workbench.library.find(a=>a.id===id),canvas=document.createElement('canvas');canvas.width=192;canvas.height=144;canvas.getContext('2d').fillRect(0,0,192,144);a.thumbnail=canvas.toDataURL();f.workbench.refresh();window.thumbnailRenders=0;},id);
  assert.notEqual(await page.locator(`.blm-card[data-id="${id}"] img`).getAttribute('src'),image);
  console.log('Same revision stale cache reflected in open catalog');
  // The non-modal catalog covers the right panel; keyboard activation lets us
  // verify that an already-open catalog updates without closing/reopening it.
  await page.locator('#wbUpdateSamples').focus();await page.keyboard.press('Enter');await ready();
  assert.equal(await snap(),before,'thumbnail refresh must preserve current geometry and tree palette');
  report.refreshCount=await page.evaluate(()=>window.thumbnailRenders);assert.equal(report.refreshCount,7);
  for(const selector of [`#wbAssetLibrary [data-asset="${id}"] img`,`[data-assembly-asset="${id}"] img`,`.blm-card[data-id="${id}"] img`])assert.equal(await page.locator(selector).getAttribute('src'),image);
  report.checks.push('更新树枝样本在同一版本重新渲染；左侧、右侧及已打开成品库同步，几何与整树材质保持不变');
  await page.click('#blmClose');await page.locator(`[data-assembly-asset="${id}"]`).screenshot({path:path.join(out,'末端样本卡片.png')});
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='thumbnails.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立测试下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.click('#saveProjectBtn');await page.locator('#projectSaveDialog [value="FILE"]').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('#psSubmit')]);const saved=path.join(out,'缩略图实际重载.branch.json');await download.saveAs(saved);
  await page.reload();await ready();await page.evaluate(()=>window.thumbnailRenders=0);await page.locator('#projectInput').setInputFiles(saved);
  await page.waitForFunction(id=>window.__branchForge.authoring.branch_instances.some(i=>i.asset_id===id),id);await ready();
  assert.equal(await page.evaluate(()=>window.thumbnailRenders),0,'fresh saved thumbnails must not rerender on reload');
  assert.equal(await page.locator(`[data-assembly-asset="${id}"] img`).getAttribute('src'),image);assert.equal(await snap(),before);
  report.checks.push('实际保存并重载工程：新图与缓存标记保留，零重复重绘，模型与材质不变');
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
 }catch(error){report.failure=String(error);await page?.screenshot({path:path.join(out,'失败现场.png'),timeout:5000}).catch(()=>{});throw error;}finally{fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
