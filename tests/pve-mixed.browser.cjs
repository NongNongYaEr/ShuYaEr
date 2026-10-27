const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto'),{execFileSync}=require('child_process');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {fingerprintScene,fingerprintBinary}=require('./pve-geometry-audit.cjs');
(async()=>{
 const root=path.resolve('.runtime/pve-mixed-acceptance');fs.mkdirSync(root,{recursive:true});
 const source=path.resolve('导出/香樟_真实样本装配整株_最终A01.branch.json'),sourceBytes=fs.readFileSync(source),doc=JSON.parse(sourceBytes);
 const name='验收_混合次枝_'+crypto.randomUUID().slice(0,8),exportRoot=path.resolve('导出');
 const project=path.join(exportRoot,name+'.branch.json'),output=path.join(exportRoot,name+'_PVE_Complete');
 const result={checks:[],errors:[],name};
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1920,height:1080}});page.setDefaultTimeout(180000);page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.locator('#projectInput').setInputFiles(source);
  await page.waitForFunction(name=>window.__branchForge.collectSettings().object_name===name&&!window.__branchForge.workbench.busy,doc.settings.object_name);
  const before=await page.evaluate(()=>{const f=window.__branchForge;return {instances:f.authoring.branch_instances.length,leaves:f.asset.masterPlacements.length,organs:f.asset.treeOrgans.length,triangles:f.asset.report.triangles};});
  await page.locator('#brandExportOpen').click();await page.locator('#exportPveCompleteBtn').click();await page.waitForSelector('#projectSaveDialog[open]');await page.locator('#psName').fill(name);await page.locator('#psSubmit').click();
  await page.waitForSelector('#pveCompleteDialog[open]');await page.waitForFunction(()=>!document.getElementById('pveClose').disabled,{},{timeout:240000});
  assert.equal(await page.locator('#pveStage').textContent(),'校验完成',await page.locator('#pveDetail').textContent());
  await page.screenshot({path:path.join(root,'混合树完整枝包导出.png')});await page.locator('#pveClose').click();
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'complete_units.manifest.json'))),resolved=JSON.parse(fs.readFileSync(path.join(output,'whole.resolved.json')));
  assert.equal(manifest.units.length,7);assert.equal(manifest.merged_atlas.regions.length,2);
  assert.equal(resolved.summary.unit_instances,before.instances);assert.equal(resolved.summary.leaves,before.leaves);assert.equal(resolved.summary.organs,before.organs);assert.equal(resolved.summary.triangles,before.triangles);
  result.summary=resolved.summary;result.atlas=manifest.merged_atlas;result.checks.push('界面实际导出成功：7 类、550 实例；枝叶花果及三角面数量保持');
  const materials=new Map([doc.authoring.leaf_material,...doc.authoring.branch_library.map(a=>a.sample.authoring.leaf_material)].map(m=>[crypto.createHash('sha256').update(m.color||'').update('\0').update(m.normal||'').digest('hex'),m]));
  const audit=manifest.merged_atlas.regions.map(r=>({...r,color:materials.get(r.key).color}));
  const auditFile=path.join(root,'pixel-audit-input.json');fs.writeFileSync(auditFile,JSON.stringify(audit));
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/pve-atlas-audit.ps1'),'-InputFile',auditFile,'-AtlasFile',path.join(output,'leaf_atlas_color.png')],{windowsHide:true,timeout:60000});
  result.checks.push('合并后全部 2K/4K 原图 RGBA 像素一致，包括花果透明通道');
  const regions=manifest.merged_atlas.regions.map(r=>({...r,name:materials.get(r.key).color_name}));
  const expected=await page.evaluate(async({code,regions,layout})=>{
   const k=await import('/branch-kernel.js'),T=await import('/vendor/three.module.min.js'),f=window.__branchForge;
   const a=k.buildBranchAsset(f.collectSettings(),null,f.leafSources,0,f.authoring);
   const projectUv=(mesh,u,v)=>{
    if(!(mesh.material.name==='M_Leaf'||mesh.material.sampleLeafMaterial))return [u,v];
    const material=mesh.material.sampleLeafMaterial||f.authoring.leaf_material,region=regions.find(r=>r.name===material.color_name);
    if(!region)throw Error('Missing source texture');
    // Independently map top-left texture pixels into UE's UV convention.
    return [(region.x+u*region.width)/layout.width,1-(region.y+(1-v)*region.height)/layout.height];
   };
   try{return (0,eval)('('+code+')')(a,T,false,projectUv);}finally{k.disposeBranchAsset(a);}
  },{code:fingerprintScene.toString(),regions,layout:manifest.merged_atlas});
  assert.deepEqual(fingerprintBinary(resolved,fs.readFileSync(path.join(output,'whole.resolved.bin'))),expected);
  result.checks.push('全部三角面位置、法线、切线、绕序保持；叶片与花果 UV 对应各自图集分区');
  await page.evaluate(()=>window.__mixedOldAsset=window.__branchForge.asset);
  await page.locator('#projectInput').setInputFiles(project);
  await page.waitForFunction(()=>window.__branchForge.asset!==window.__mixedOldAsset&&!window.__branchForge.workbench.busy);
  const saved=JSON.parse(fs.readFileSync(project));assert.deepEqual(saved.authoring.branch_library,doc.authoring.branch_library);
  assert.deepEqual(saved.authoring.branch_instances,doc.authoring.branch_instances);
  assert.deepEqual(fs.readFileSync(source),sourceBytes);assert.deepEqual(result.errors,[]);
  result.checks.push('导出工程真实重载成功；素材与装配未被图集合并改写，用户原文件未变');result.passed=true;
 } finally {
  await browser.close();const archive=path.join(root,name);fs.mkdirSync(archive,{recursive:true});
  for(const from of [project,output]){assert.equal(path.dirname(from),exportRoot);assert.ok(path.basename(from).startsWith(name));if(fs.existsSync(from))fs.renameSync(from,path.join(archive,path.basename(from)));}
  fs.writeFileSync(path.join(root,'验收.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,checks:result.checks,errors:result.errors}));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
