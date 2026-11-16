const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
require('node:module').register('./vendor-loader.mjs',require('node:url').pathToFileURL(__filename));
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const workspace=path.resolve(__dirname,'..'),web=path.join(workspace,'web'),out=path.join(workspace,'.runtime/trunk-section-point-nudge-ui');fs.mkdirSync(out,{recursive:true});
const input=path.join(workspace,'assets/tree-template-library/template-c75273b48abc49fbbfa602525f57c083.branch.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),beforeHash=hash(input);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary'};
const recordsFolder=path.join(out,'trunk-section-presets');fs.mkdirSync(recordsFolder,{recursive:true});
// Read-only isolated HTTP fixture: no native dialogs, session writes or user
// library modifications. The save UI below supplies its picker result only.
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(['/api/trunk-section-presets','/api/trunk-section-preset'].includes(url.pathname)){
    res.setHeader('Content-Type','application/json');try{const {normalizeTrunkSectionPreset}=await import('../web/trunk-section-presets.js');
      if(req.method==='POST'){const body=[];for await(const b of req)body.push(b);const item=normalizeTrunkSectionPreset(JSON.parse(Buffer.concat(body).toString()));fs.writeFileSync(path.join(recordsFolder,item.id+'.json'),JSON.stringify(item));res.end(JSON.stringify({success:true,item}));}
      else if(req.method==='DELETE'){const id=url.searchParams.get('id');if(!/^section-preset-[a-f0-9]{32}$/.test(id||''))throw Error('id');const file=path.join(recordsFolder,id+'.json'),item=JSON.parse(fs.readFileSync(file));fs.unlinkSync(file);res.end(JSON.stringify({success:true,item}));}
      else res.end(JSON.stringify({success:true,items:fs.readdirSync(recordsFolder).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(recordsFolder,f))))}));
    }catch(e){res.statusCode=400;res.end(JSON.stringify({success:false,message:e.message}));}return;
  }
  if(url.pathname==='/api/project-document'){
    const id=url.searchParams.get('id'),p=/^template-[a-f0-9]+$/.test(id||'')?path.join(workspace,'assets/tree-template-library',id+'.branch.json'):'';
    if(p&&fs.existsSync(p)){res.setHeader('Content-Type','application/json');fs.createReadStream(p).pipe(res);return;}
  }
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');
    if(/project-session|project-library|saved-projects|branch-thumbnails/.test(url.pathname)){res.end(JSON.stringify({success:true,items:[]}));return;}
    res.statusCode=404;res.end(JSON.stringify({success:false,message:'Isolated test fixture'}));return;
  }
  const p=path.resolve(web,url.pathname==='/'?'index.html':'.'+decodeURIComponent(url.pathname));
  if(!p.startsWith(web+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');fs.createReadStream(p).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {createDirectTrunkForm,createTrunkFormPreset}=await import('../web/trunk-form.js');
 const fixtureDoc=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));fixtureDoc.authoring.workbench||={};
 fixtureDoc.authoring.workbench.trunk_forms={version:1,branches:{CAMPHOR_TRUNK:createDirectTrunkForm({...createTrunkFormPreset('BUTTRESS'),sections:[{id:'RING_ONE',t:.16,radius:1,oval:1,roll:0,span:.18},{id:'RING_TWO',t:.6,radius:1,oval:1,roll:0,span:.18}]})}};
 fixtureDoc.authoring.workbench.trunk_forms.branches.CAMPHOR_TRUNK.sections[0].profile=Array.from({length:128},(_,i)=>({id:'LIMIT_'+i,angle:i*360/128,radius:1}));
 const fixture=path.join(out,'香樟_整圈褶皱输入.branch.json');fs.writeFileSync(fixture,JSON.stringify(fixtureDoc));
 const report={checks:[],errors:[],shaderErrors:[]},check=s=>{report.checks.push(s);console.log('OK '+s);};
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});let page;
 try{
  page=await browser.newPage({viewport:{width:1700,height:1080}});page.setDefaultTimeout(60000);page.on('pageerror',e=>{report.errors.push(e.message);console.log('PAGE ERROR '+e.message);});
  page.on('console',m=>{if(m.type()==='error'&&/shader|gl_invalid|compile|webglprogram/i.test(m.text()))report.shaderErrors.push(m.text());});
  await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'),()=>page.evaluate(()=>document.getElementById('projectSessionPanel').close()));
  const idle=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f?.asset&&!document.getElementById('brandStartup')&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&!f.workbench.trunkForm.active&&document.getElementById('busyOverlay').hidden&&!document.getElementById('projectLoadDialog').open;});
  const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.goto('http://127.0.0.1:'+server.address().port);await idle();console.log('INITIALIZED');
  await page.locator('#projectInput').setInputFiles(fixture);if(await page.locator('#projectSwitchConfirm[open]').isVisible())await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();
  await page.waitForFunction(()=>window.__branchForge?.authoring.branch_instances.length===550);await idle();await page.locator('#trunkFormSelectRoot').click();
  const target=await page.evaluate(()=>window.__branchForge.selectedCurvePoint.branchId);report.target=target;
  const snap=()=>page.evaluate(async id=>{
   const f=window.__branchForge,digest=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))).map(n=>n.toString(16).padStart(2,'0')).join('');let trunk;const units=[];
   f.asset.group.traverse(m=>{if(m.userData.category==='branch'&&m.userData.stable_id===id)trunk=m;if(m.isInstancedMesh)units.push([Array.from(m.instanceMatrix.array),Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,v])=>[k,Array.from(v.array)])),Array.from(m.geometry.index?.array||[])]);});
   return{form:structuredClone(f.authoring.workbench.trunk_forms?.branches[id]),trunk:await digest(Array.from(trunk.geometry.attributes.position.array)),units:await digest(units),instances:await digest(f.authoring.branch_instances),sources:await digest(f.authoring.branch_library),history:f.historyState.undo,radial:trunk.geometry.userData.radiusRings[0].count,rings:trunk.geometry.userData.radiusRings.length,triangles:trunk.geometry.index.count/3};
  },target);
  await page.locator('#trunkFormMode').click();
  const sectionMesh=page.locator('#trunkFormPanel .trunk-mesh-controls');await sectionMesh.locator('summary').click();await sectionMesh.locator('[data-trunk-mesh-preset="STANDARD"]').click();await idle();
  const baseline=await snap(),front=page.locator('#sectionFrontSvg');await page.locator('#trunkFormPanel [data-trunk-stage="CONTOUR"]').click();await frame();
  const pick=async()=>{await front.locator('[data-knot-id="LIMIT_0"]').click();await idle();await front.focus();};await pick();
  for(let i=0;i<30;i++)await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowLeft');await page.keyboard.up('ArrowLeft');await page.keyboard.up('ArrowRight');await idle();
  const turned=await snap();assert.ok(Math.abs(turned.form.sections[0].profile.find(p=>p.id==='LIMIT_0').angle-1.375)<1e-5,JSON.stringify(turned.form.sections[0].profile.find(p=>p.id==='LIMIT_0')));assert.equal(turned.history,baseline.history+1);
  for(const key of ['units','instances','sources'])assert.equal(turned[key],baseline[key]);await page.locator('#undoBtn').click();await idle();assert.deepEqual(await snap(),baseline);
  check('held angular nudges stop before the neighbor, reverse immediately, commit one undo and retain all complete source units');
  await pick();await page.keyboard.down('Shift');for(let i=0;i<30;i++)await page.keyboard.down('ArrowDown');await page.keyboard.up('Shift');await page.keyboard.down('ArrowUp');await page.keyboard.up('ArrowUp');await page.keyboard.up('ArrowDown');await idle();
  const pushed=await snap();assert.ok(Math.abs(pushed.form.sections[0].profile.find(p=>p.id==='LIMIT_0').radius-.011)<1e-5,JSON.stringify(pushed.form.sections[0].profile.find(p=>p.id==='LIMIT_0')));assert.equal(pushed.history,baseline.history+1);
  for(const key of ['units','instances','sources'])assert.equal(pushed[key],baseline[key]);await page.locator('#undoBtn').click();await idle();assert.deepEqual(await snap(),baseline);
  check('held radial nudges retain a positive contour and reverse immediately at the limit with one undo');
  assert.equal(hash(input),beforeHash);assert.deepEqual(report.errors,[]);assert.deepEqual(report.shaderErrors,[]);report.passed=true;
 }catch(e){report.failure=e.stack;if(page)await page.screenshot({path:path.join(out,'失败现场.png')}).catch(()=>{});throw e;}
 finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'UI验收.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
