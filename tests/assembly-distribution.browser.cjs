const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/assembly-distribution');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const source=path.resolve('assets/tree-template-library/template-ea396bae43d74f7fa42ed703724d053b.branch.json');
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),originalHash=hash();
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(180000);page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  await page.locator('#projectInput').setInputFiles(source);await page.waitForFunction(()=>window.__branchForge?.asset?.settings.object_name==='山茶_真实样本装配整株_最终A01'&&!window.__branchForge.workbench.busy);
  const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&document.querySelector('#busyOverlay').hidden;});
  const snapshot=()=>page.evaluate(async()=>{
   const f=window.__branchForge,a=f.asset;
   const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,'0')).join('');
   const {createPVESkeleton,validatePVESkeleton}=await import('/pve-skeleton-export.js'),{findAssemblyGaps}=await import('/assembly-coverage.js');
   const branchOwners=new Map(a.masterBranches.map(b=>[b.id,b.instanceId||b.unitOwner]));
   const units={};for(const i of f.authoring.branch_instances) units[i.id]=[[],[],[]];
   for(const b of a.masterBranches){const owner=b.instanceId||b.unitOwner;if(units[owner])units[owner][0].push([b.stableId,b.points,b.startRadius,b.endRadius,b.radiusProfile,b.sections]);}
   for(const p of a.placements){const owner=branchOwners.get(p.branchId);if(units[owner])units[owner][1].push(p);}
   for(const p of a.treeOrgans){const owner=branchOwners.get(p.branchId);if(units[owner])units[owner][2].push(p);}
   const unitHashes={};for(const [id,data] of Object.entries(units))unitHashes[id]=await digest(data);
   return {count:f.authoring.branch_instances.length,leaves:a.placements.length,organs:a.treeOrgans.length,branches:a.masterBranches.length,
    library:await digest(f.authoring.branch_library),overrides:await digest([f.authoring.overrides,f.authoring.sculpt_layers]),
    placements:f.authoring.branch_instances.map(({id,parent,attach,frame,asset_id,scale,radius_scale,angle,azimuth,roll,seed,variation,shootRole})=>({id,parent,attach,frame,asset_id,scale,radius_scale,angle,azimuth,roll,seed,variation,shootRole})),
    unitHashes,gaps:findAssemblyGaps(a.masterBranches,f.authoring.branch_instances).map(g=>g.branch.stableId),valid:validatePVESkeleton(createPVESkeleton(a,f.leafSources)).valid};
  });
  const before=await snapshot();console.log('CAMELLIA',before.count,'gaps',before.gaps.length);result.beforeCounts=[before.count,before.leaves,before.organs,before.branches];result.beforeGaps=before.gaps;
  assert.equal(await page.locator('#coverageApply').count(),0,'no extra repair feature');
  await page.locator('#fitViewBtn').click();await page.screenshot({path:path.join(out,'正常生成前.png')});
  await page.locator('#buildBtn').click();await page.waitForFunction(()=>window.__branchForge.authoring.workbench.assembly_distribution);await wait();
  const after=await snapshot();result.afterCounts=[after.count,after.leaves,after.organs,after.branches];result.afterGaps=after.gaps;
  assert.deepEqual(result.afterCounts,result.beforeCounts);assert.equal(after.gaps.length,0);assert.equal(after.library,before.library);assert.equal(after.overrides,before.overrides);assert.ok(after.valid);
  const moved=[];for(let n=0;n<before.placements.length;n++){
   const old=before.placements[n],next=after.placements[n];for(const key of ['id','asset_id','scale','radius_scale','angle','azimuth','roll','seed','variation','shootRole'])assert.deepEqual(next[key],old[key],key);
   if(old.parent===next.parent){assert.deepEqual(next,old);assert.equal(after.unitHashes[old.id],before.unitHashes[old.id]);}
   else moved.push({id:old.id,from:old.parent,to:next.parent});
  }
  result.moved=moved;assert.equal(moved.length,before.gaps.length);assert.ok(moved.some(i=>i.to.startsWith('CAMELLIA_CROWN_S7_')));assert.ok(moved.some(i=>i.to.startsWith('CAMELLIA_CROWN_S6_')));
  await page.screenshot({path:path.join(out,'正常生成后.png')});result.checks.push('ordinary Generate repairs crown gaps at unchanged count/classes/sizes; every unmoved unit is identical');
  await page.locator('#buildBtn').click();await wait();assert.deepEqual(await snapshot(),after);result.checks.push('repeated Generate is stable');
  await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snapshot(),before);
  await page.locator('#redoBtn').click();await wait();assert.deepEqual(await snapshot(),after);result.checks.push('one undo/redo restores the placement operation');
  await page.locator('#skeletonEditModeBtn').click();await wait();await page.locator('#buildBtn').click();await wait();assert.equal(await page.evaluate(()=>window.__branchForge.skeletonEditMode),true);
  await page.locator('#skeletonEditModeBtn').click();await wait();assert.deepEqual(await snapshot(),after);result.checks.push('skeleton mode does not redistribute or reinstall samples');
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='distribution.branch.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
  await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'山茶_正常生成验收.branch.json');await download.saveAs(saved);
  await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);
  await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='山茶_真实样本装配整株_最终A01'&&!window.__branchForge.workbench.busy);assert.deepEqual(await snapshot(),after);
  await page.locator('#buildBtn').click();await wait();assert.deepEqual(await snapshot(),after);result.checks.push('real saved file reload preserves distribution and remains stable on Generate');
  assert.equal(hash(),originalHash);assert.deepEqual(result.errors,[]);result.sourceHash=originalHash;result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
