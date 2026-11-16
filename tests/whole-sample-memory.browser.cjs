const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/whole-sample');fs.mkdirSync(out,{recursive:true});const result={loads:[],errors:[]};
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-precise-memory-info']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(240000);
  page.on('pageerror',e=>result.errors.push(e.message));page.on('crash',()=>result.errors.push('renderer crash'));
  page.on('console',message=>{if(message.type()==='error'&&/WebGLProgram|VALIDATE_STATUS|ERROR: 0:/.test(message.text()))result.errors.push(message.text());});
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__branchForge?.asset);
  const cdp=await page.context().newCDPSession(page);
  const metas=fs.readdirSync('assets/tree-template-library').filter(f=>f.endsWith('.meta.json')).map(f=>JSON.parse(fs.readFileSync(path.join('assets/tree-template-library',f),'utf8').replace(/^\uFEFF/,'')));
  for(const species of ['PLATANUS','JASMINE','PLATANUS','GINKGO','PLATANUS']){
   const meta=metas.find(m=>m.species===species);assert.ok(meta);
   const data=await page.evaluate(async id=>{
    const {migrateProjectDocument}=await import('/authoring-state.js');const f=window.__branchForge;
    const doc=await(await fetch('/api/project-document?id='+encodeURIComponent(id))).json();await f.workbench.load(migrateProjectDocument(doc));
    await new Promise(r=>setTimeout(r,1000));f.renderer.render(f.scene,f.camera);
    let batches=0;const geometries=new Set();f.asset.group.traverse(o=>{if(o.isInstancedMesh)batches++;if(o.geometry)geometries.add(o.geometry);});
    return {library:f.workbench.library.length,instances:f.authoring.branch_instances.length,branches:f.asset.masterBranches.length,leaves:f.asset.placements.length,organs:f.asset.treeOrgans.length,
     compiled:f.asset.report.compiled_samples,batches,drawCalls:f.renderer.info.render.calls,triangles:f.asset.report.triangles,generationMs:f.asset.report.generation_ms,
     geometryBytes:[...geometries].reduce((n,g)=>n+Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0)+(g.index?.array.byteLength||0),0),
     gpu:{...f.renderer.info.memory},atlas:{width:f.asset.materials.leaf.map?.image?.naturalWidth,height:f.asset.materials.leaf.map?.image?.naturalHeight}};
   },meta.id);
   await cdp.send('HeapProfiler.collectGarbage');data.heap=await cdp.send('Runtime.getHeapUsage');data.species=species;result.loads.push(data);console.log(JSON.stringify(data));
   if(species==='PLATANUS'){assert.equal(data.instances,1375);assert.equal(data.compiled,6);assert.equal(data.library,6);assert.ok(data.batches>0);assert.equal(data.atlas.width,4096);}
  }
  const large=result.loads.filter(v=>v.species==='PLATANUS');for(const row of large.slice(1)){for(const key of ['branches','leaves','organs','triangles','geometryBytes'])assert.equal(row[key],large[0][key]);assert.ok(row.gpu.textures<=large[0].gpu.textures+1);}
  assert.ok(large.at(-1).heap.backingStorageSize<=large[0].heap.backingStorageSize*1.15+8*1024*1024);
  assert.deepEqual(result.errors,[]);await page.screenshot({path:path.join(out,'二球悬铃木共享实例.png')});result.passed=true;
 }finally{await browser.close();fs.writeFileSync(path.join(out,'连续载入验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
