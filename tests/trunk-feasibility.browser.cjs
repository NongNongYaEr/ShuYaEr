const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const output=path.resolve('.runtime/trunk-feasibility/预览验收');fs.mkdirSync(output,{recursive:true});
 const result={passed:false,checks:[],errors:[]},browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>result.errors.push(e.message));
  const origin=process.argv[2]||'http://127.0.0.1:19905';await page.goto(origin);page.setDefaultTimeout(90000);
  const ready=name=>page.waitForFunction(name=>window.__trunkFeasibility?.state.active===name&&window.__trunkFeasibility?.state.current&&document.getElementById('caption').textContent!=='正在载入…',name);
  await ready('Grooved');
  for(const name of ['Baseline','Grooved','Buttress','Refined']){
   await page.locator(`[data-sample="${name}"]`).click();await ready(name);
   const state=await page.evaluate(()=>{const f=window.__trunkFeasibility,s=f.state,structuralIds=[];s.current.root.traverse(o=>{if(o.isMesh&&o.userData.category==='branch'&&/^(ROOT|HOST_[1-5])$/.test(o.userData.stable_id))structuralIds.push(o.userData.stable_id);});return{title:document.getElementById('caption').textContent,mode:s.active,triangles:s.trunk.geometry.index.count/3,box:s.trunk.geometry.boundingBox?.min.toArray(),options:s.options,data:s.current.data,visible:s.trunk.visible,structuralIds};});
   assert.equal(state.mode,name);assert.ok(state.triangles>0&&state.visible);assert.ok(!state.title.includes('失败'));
   assert.deepEqual(state.structuralIds.sort(),['HOST_1','HOST_2','HOST_3','HOST_4','HOST_5','ROOT']);
   await page.waitForTimeout(350);await page.screenshot({path:path.join(output,name+'-主干.png')});
   await page.locator('#fit').click();await page.waitForTimeout(350);await page.screenshot({path:path.join(output,name+'-整树.png')});
   assert.equal(await page.locator('#onlyTrunk').isChecked(),false);await page.locator('#onlyTrunk').check();
   if(['Grooved','Buttress'].includes(name)){
    const before=await page.evaluate(()=>Array.from(window.__trunkFeasibility.state.trunk.geometry.attributes.position.array));
    await page.locator('#grooveDepth').fill('0.1');await page.locator('#grooveDepth').dispatchEvent('input');
    const after=await page.evaluate(()=>Array.from(window.__trunkFeasibility.state.trunk.geometry.attributes.position.array));
    assert.ok(before.some((value,i)=>Math.abs(value-after[i])>1e-5));
    await page.locator('#reset').click();const reset=await page.evaluate(()=>Array.from(window.__trunkFeasibility.state.trunk.geometry.attributes.position.array));
    assert.equal(reset.length,before.length);assert.ok(reset.every((value,i)=>Math.abs(value-before[i])<1e-5));
    await page.locator('#wireframe').check();assert.equal(await page.evaluate(()=>window.__trunkFeasibility.state.trunk.material.wireframe),true);await page.locator('#wireframe').uncheck();
   }else assert.equal(await page.locator('#grooveDepth').isDisabled(),true);
   result.checks.push({name,triangles:state.triangles,actual_glb_loaded:true,controls_verified:true,structural_meshes:state.structuralIds});
  }
  await page.goto(origin+'/?sample=Buttress');await ready('Buttress');result.checks.push({actual_fresh_page_reload:true});
  const summaryPath=path.resolve('.runtime/trunk-feasibility/ue-summary.json');
  if(fs.existsSync(summaryPath)){
   const report=JSON.parse(fs.readFileSync(summaryPath,'utf8').replace(/^\uFEFF/,'')),sample=report.samples?.find(s=>s.name==='Buttress');
   const source=await page.evaluate(()=>window.__trunkFeasibility.state.current.data.validation.source_sha256);
   if(report.passed&&sample?.passed&&sample.source_sha256===source){
    await page.waitForFunction(()=>document.getElementById('validation').textContent.includes('UE / PVE 样本生成与重载通过'));
    result.checks.push({verified_ue_report_presented_for_matching_sample:true});
   }
  }
  assert.deepEqual(result.errors,[]);result.passed=true;
 }finally{await browser.close();fs.writeFileSync(path.join(output,'验收.json'),JSON.stringify(result,null,2));}
 process.stdout.write(JSON.stringify(result)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
