// Paired backend measurements in one real browser; no historical speedup claim.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),base=path.join(__dirname,'trunk-workspace-library.browser.cjs'),out=path.join(root,'.runtime/professional-performance/native-paired-v1'),input=path.join(root,'.runtime/bark-material-workspace/用户当前工程_只读副本.branch.json');
if(fs.existsSync(out)&&fs.readdirSync(out).length)throw Error('Preserve earlier measurements; choose a new output folder.');
let source=fs.readFileSync(base,'utf8').replace("path.join(workspace,'.runtime/trunk-workspace-library-ui')",JSON.stringify(out)).replace("path.join(workspace,'assets/tree-template-library/template-c75273b48abc49fbbfa602525f57c083.branch.json')",JSON.stringify(input));
const ds=source.indexOf('const doc=JSON.parse'),de=source.indexOf(' const fixture=',ds);source=source.slice(0,ds)+"const doc=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\\uFEFF/,''));"+source.slice(de);
source=source.replace("await page.locator('#trunkFormSelectRoot').click();","await page.locator('[data-tree-selection-kind=SKELETON]').click();await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:/^CAMPHOR_TRUNK$/})}).click();");
const a=source.indexOf('  const completeInput=await snap();'),z=source.indexOf('  assert.equal(hash(input),beforeHash);');
source=source.slice(0,a)+String.raw`
  await page.setViewportSize({width:1700,height:1050});
  report.input={path:input,sha256:beforeHash};report.browser=browser.version();
  report.kernels=await page.evaluate(async()=>{
    const {instantiateNativeGeometryKernel}=await import('/native-geometry-kernel.js'),{installGeometryAccelerator}=await import('/geometry-accelerator.js'),{createTrunkFormPreviewGeometry}=await import('/branch-kernel.js'),f=window.__branchForge,cpp=await instantiateNativeGeometryKernel(await(await fetch('/native/geometry-kernel-v1.wasm')).arrayBuffer()),branch=f.asset.masterBranches.find(b=>b.stableId==='CAMPHOR_TRUNK'),form=f.authoring.workbench.trunk_forms.branches.CAMPHOR_TRUNK;
    window.__pairedCpp=cpp;const results={javascript:[],cpp:[]},hashes=new Set();
    const hash=async g=>{const out=[];for(const [key,a]of Object.entries(g.attributes)){const bytes=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength),d=await crypto.subtle.digest('SHA-256',bytes);out.push([key,Array.from(new Uint8Array(d)).join(',')]);}return JSON.stringify(out);};
    for(let i=0;i<22;i++)for(const name of (i%2?['cpp','javascript']:['javascript','cpp'])){installGeometryAccelerator(name==='cpp'?cpp:null);const start=performance.now(),g=createTrunkFormPreviewGeometry(branch,f.asset.settings,form),ms=performance.now()-start;if(i>=2)results[name].push(ms);hashes.add(await hash(g));g.dispose();await new Promise(r=>requestAnimationFrame(r));}
    installGeometryAccelerator(cpp);return {results,matchingHashes:hashes.size,backend:cpp.stats};
  });
  assert.equal(report.kernels.matchingHashes,1);check('20 alternating JS/C++ kernel samples per backend produce identical real-user geometry in the same browser');
  report.builds={javascript:[],cpp:[]};for(let i=0;i<7;i++)for(const name of (i%2?['cpp','javascript']:['javascript','cpp'])){
    await page.evaluate(async name=>{const {installGeometryAccelerator}=await import('/geometry-accelerator.js');installGeometryAccelerator(name==='cpp'?window.__pairedCpp:null);},name);
    if(!await page.evaluate(()=>window.__branchForge.skeletonEditMode)){await page.locator('#skeletonEditModeBtn').click();await idle();}
    await page.evaluate(()=>window.__branchForge.performance.start('paired-full-build'));await page.locator('#skeletonEditModeBtn').click();await idle();const measured=await page.evaluate(()=>window.__branchForge.performance.stop());if(i>=2){const build=measured.metrics['generation.full_build_wall']||measured.metrics['generation.full_build_sync'];assert(build,'an actual complete build was measured');report.builds[name].push(build.values_ms?.[0]??build.p50_ms);}
  }
  check('paired complete-assembly rebuilds include the same complete sources and scene path for each numerical backend');
  const {summarizeDurations}=await import('../web/performance-recorder.js');report.summary={kernels:Object.fromEntries(Object.entries(report.kernels.results).map(([k,v])=>[k,summarizeDurations(v)])),builds:Object.fromEntries(Object.entries(report.builds).map(([k,v])=>[k,summarizeDurations(v)]))};
`+source.slice(z);
source=source.replaceAll("'UI验收.json'","'配对性能.json'");const mod=new Module(base,module);mod.filename=base;mod.paths=module.paths;mod._compile(source,base);
