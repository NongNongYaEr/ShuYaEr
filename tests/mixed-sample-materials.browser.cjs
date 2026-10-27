const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve('.runtime/mixed-sample-materials');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const report={checks:[],errors:[]};
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(180000);page.on('pageerror',e=>report.errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.getElementById('busyOverlay').hidden});
  await page.goto(process.argv[2]);await ready();
  const metas=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,'')));
  await page.evaluate(async id=>{const {migrateProjectDocument}=await import('/authoring-state.js');await window.__branchForge.workbench.load(migrateProjectDocument(await(await fetch('/api/project-document?id='+encodeURIComponent(id))).json()));},metas.find(m=>m.species==='CAMPHOR').id);await ready();
  await page.evaluate(()=>{const f=window.__branchForge;window.materialBaseline={palette:JSON.stringify(f.authoring.leaf_material),instances:JSON.stringify(f.authoring.branch_instances.filter(i=>i.shootRole!=='YOUNG'))};});
  await page.click('#openBranchAssembly');await page.click('#browseBranchCatalog');await page.fill('#blmSearch','红叶石楠');
  const id=await page.locator('.blm-card').filter({hasText:'红嫩'}).first().getAttribute('data-id');assert(id);
  await page.locator(`.blm-card[data-id="${id}"]`).click();await page.click('#blmUseAssembly');
  await page.waitForFunction(id=>window.__branchForge.workbench.library.some(a=>a.id===id),id);await ready();await page.click('#blmClose');
  await page.locator(`#wbAssetLibrary [data-asset="${id}"]`).dragTo(page.locator('[data-assembly-role="YOUNG"]'),{targetPosition:{x:18,y:14}});await ready();
  console.log('Mixed plants assembled');
  const inspect=()=>page.evaluate(()=>{const f=window.__branchForge,mats=new Set();f.asset.group.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.sampleLeafMaterial)mats.add(m);});return {paletteUnchanged:JSON.stringify(f.authoring.leaf_material)===window.materialBaseline.palette,otherZonesUnchanged:JSON.stringify(f.authoring.branch_instances.filter(i=>i.shootRole!=='YOUNG'))===window.materialBaseline.instances,atlasCount:new Set([...mats].map(m=>m.sampleLeafMaterial.color)).size,correct:[...mats].every(m=>m.map?.image?.src===m.sampleLeafMaterial.color&&m.alphaTest===m.sampleLeafMaterial.cutoff&&m.roughness===m.sampleLeafMaterial.roughness),names:[...new Set([...mats].map(m=>m.sampleLeafMaterial.color_name))]};});
  const state=await inspect();assert(state.paletteUnchanged);assert(state.otherZonesUnchanged);assert(state.correct);assert.equal(state.atlasCount,2);report.preview=state;
  await page.waitForFunction(()=>{let loaded=true;window.__branchForge.asset.group.traverse(o=>{if(o.isMesh&&o.material?.sampleLeafMaterial)loaded&&=!!o.material.map?.image?.complete});return loaded});
  await page.click('#fitViewBtn');await page.screenshot({path:path.join(out,'香樟与红叶石楠混装.png')});
  report.checks.push('真实香樟整树末端添加红叶石楠：两个图集分别绑定，内部和中间分区实例、整树材质均保持不变');
  console.log('Preview atlas ownership verified');
  const checkOrgans=()=>page.evaluate(()=>{const records=[];window.__branchForge.asset.group.traverse(o=>{if(o.isMesh&&o.userData.category==='tree_organ'){const m=o.material;records.push({name:o.name,atlas:m.sampleLeafMaterial?.color_name,correct:!!m.sampleLeafMaterial&&m.map?.image?.src===m.sampleLeafMaterial.color});}});return records;});
  report.organs=await checkOrgans();assert(report.organs.length>0);assert(report.organs.every(o=>o.correct));assert(report.organs.some(o=>o.atlas.includes('PHOTINIA')));
  // Inspect an actual flower instance close-up, not just the distant canopy.
  await page.evaluate(async()=>{
   const f=window.__branchForge,T=await import('three'),p=f.asset.treeOrgans.find(p=>p.sourceAssetId?.includes('PHOTINIA'));if(!p)throw Error('Missing Photinia flower');
   const forward=f.camera.position.clone().sub(f.controls.target).normalize();f.controls.target.copy(p.position);f.camera.position.copy(p.position).addScaledVector(forward,.65);f.camera.lookAt(p.position);f.controls.update();
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  });
  await page.screenshot({path:path.join(out,'红叶石楠花簇近景.png')});
  // Test expanded/legacy geometry and actual embedded GLB textures with one
  // instance of each plant, retaining the real calibrated meshes and PNGs.
  report.export=await page.evaluate(async id=>{
   const f=window.__branchForge,{buildBranchAsset,disposeBranchAsset}=await import('/branch-kernel.js');
   const {syncLeafMaterialVariants}=await import('/leaf-material-data.js'),{bindGlbTextures,exportGlb}=await import('/glb-export.js');
   const a={...f.authoring,branch_instances:[f.authoring.branch_instances.find(i=>i.asset_id===id),f.authoring.branch_instances.find(i=>i.asset_id!==id)]};
   const results=[];
   for(const legacy of [false,true]){
    const built=buildBranchAsset(f.collectSettings(),null,f.leafSources,0,a,{legacy});
    try{await bindGlbTextures(built.materials.leaf,a.leaf_material);await Promise.all(syncLeafMaterialVariants(built,(m,raw)=>bindGlbTextures(m,raw,new Map())));
     const mats=new Set(),organs=[];built.group.traverse(o=>{if(o.isMesh&&o.material?.sampleLeafMaterial)mats.add(o.material);if(o.isMesh&&o.userData.category==='tree_organ')organs.push(!!o.material.sampleLeafMaterial&&o.material.map?.image?.src===o.material.sampleLeafMaterial.color);});
     const bytes=await exportGlb(built.group,{}),buffer=bytes instanceof ArrayBuffer?bytes:bytes.buffer;
     const view=new DataView(buffer),len=view.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,len)));
     const leafMaterials=(json.materials||[]).filter(m=>m.name==='M_Leaf'||m.name.startsWith('M_Leaf_'));
     results.push({legacy,organsCorrect:organs.length>0&&organs.every(Boolean),atlasCount:new Set([...mats].map(m=>m.map?.image?.src)).size,allCorrect:[...mats].every(m=>m.map?.image?.src===m.sampleLeafMaterial.color),textureCount:new Set(leafMaterials.map(m=>m.pbrMetallicRoughness?.baseColorTexture?.index)).size,images:json.images?.length});
    }finally{disposeBranchAsset(built);}
   }return results;
  },id);
  for(const result of report.export){assert(result.allCorrect);assert(result.organsCorrect);assert.equal(result.atlasCount,2);assert(result.textureCount>=2);assert(result.images>=2);}
  report.checks.push('实例化完整样本与普通几何路径均保留各自材质；实际 GLB 包含两个独立叶片贴图');
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='mixed.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立测试下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.click('#saveProjectBtn');await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.click('#psSubmit')]);
  const saved=path.join(out,'混装重载.branch.json');await download.saveAs(saved);
  await page.reload();await ready();await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(id=>window.__branchForge.authoring.branch_instances.some(i=>i.asset_id===id),id);await ready();
  const reloaded=await page.evaluate(()=>{const maps=new Set();let correct=true;window.__branchForge.asset.group.traverse(o=>{const m=o.material;if(m?.sampleLeafMaterial){maps.add(m.sampleLeafMaterial.color);correct&&=m.map?.image?.src===m.sampleLeafMaterial.color;}});return {count:maps.size,correct};});assert.equal(reloaded.count,2);assert(reloaded.correct);
  report.checks.push('保存真实工程文件、刷新应用并重新载入，两种植物仍各用各自贴图');
  assert((await checkOrgans()).every(o=>o.correct));
  const old=JSON.parse(fs.readFileSync(saved,'utf8'));
  const sample=old.authoring.branch_library.find(a=>a.id===id).sample;
  old.authoring.leaf_material=sample.authoring.leaf_material||old.authoring.branch_library.find(a=>a.id===sample.material_asset_id).sample.authoring.leaf_material;
  const oldPath=path.join(out,'旧版串色工程.branch.json');fs.writeFileSync(oldPath,JSON.stringify(old));
  await page.locator('#projectInput').setInputFiles(oldPath);
  await page.waitForFunction(name=>window.__branchForge.authoring.leaf_material.color_name===name,old.authoring.leaf_material.color_name);await ready();
  await page.waitForFunction(()=>{const maps=new Set();let correct=true;window.__branchForge.asset.group.traverse(o=>{const m=o.material;if(m?.sampleLeafMaterial){maps.add(m.sampleLeafMaterial.color);correct&&=m.map?.image?.src===m.sampleLeafMaterial.color;}});return correct&&maps.size===2});
  report.checks.push('模拟旧版被最后加入的红叶石楠覆盖全局贴图的已保存工程，重载后按成品样本恢复两套正确贴图');
  const generic=JSON.parse(fs.readFileSync(saved,'utf8'));
  generic.authoring.recipe.tags=generic.authoring.recipe.tags.filter(t=>t!=='SAMPLE_FOLIAGE_FROM_LIBRARY');
  generic.authoring.branch_instances=[generic.authoring.branch_instances.find(i=>i.asset_id!==id),generic.authoring.branch_instances.find(i=>i.asset_id===id)];
  generic.settings.leaf_density=8;
  const genericPath=path.join(out,'普通生成树混装.branch.json');fs.writeFileSync(genericPath,JSON.stringify(generic));
  await page.locator('#projectInput').setInputFiles(genericPath);
  await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===2&&!window.__branchForge.authoring.recipe.tags.includes('SAMPLE_FOLIAGE_FROM_LIBRARY'));await ready();
  const genericMaterials=await page.evaluate(()=>{const f=window.__branchForge;const maps=new Set(),owners=[];f.asset.group.traverse(o=>{const m=o.material;if(m?.sampleLeafMaterial){maps.add(m.sampleLeafMaterial.color);owners.push(m.map?.image?.src===m.sampleLeafMaterial.color);}});return {count:maps.size,correct:owners.length>0&&owners.every(Boolean)};});
  assert.equal(genericMaterials.count,2);assert(genericMaterials.correct);
  const genericOrgans=await checkOrgans();assert(genericOrgans.length>0);assert(genericOrgans.every(o=>o.correct));
  report.checks.push('花果单元逐网格检查实际图集：预览、普通几何、GLB、实际重载都保持红叶石楠花簇的原图集；已核对近景');
  report.checks.push('无成品样本配方标记的普通生成/旧工程实际重载：香樟和红叶石楠均绑定各自贴图');
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
 }finally{fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
