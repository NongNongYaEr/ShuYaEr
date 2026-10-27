const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/tree-root-scale');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const shape=(id,parent,points)=>({id,parent,points,attach:parent==='ROOT'?.8:parent==='A'?.5:0,length:3,start_radius:.035,end_radius:.015});
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'枝根缩放验收',seed:42,leaf_density:8,child_count:0,branch_levels:4,wind_strength:0},authoring:{branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,.4],[.15,0,.7],[0,0,1]]),shape('A','ROOT',[[.09,0,.82],[1,0,1.4],[1.7,0,2.2],[3,0,2.2]]),shape('A1','A',[[1,0,1.4],[1.4,0,1.8],[1.8,0,2.2],[2.2,0,2.6]]),shape('B','ROOT',[[0,.04,1],[1,.04,1.4],[2,.04,1.8],[3,.04,2.2]])]}}};
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>result.errors.push(e.message));await page.goto(process.argv[2]);console.log('PAGE');await page.waitForFunction(()=>window.__branchForge?.asset);
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 const load=async()=>{await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='枝根缩放验收');await wait();await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(1.5,-9,1.5);f.camera.up.set(0,0,1);f.controls.target.set(1.5,0,1.5);f.controls.update();});};
 const snap=()=>page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
 const select=async id=>{await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'$')})}).click();};
 const tool=key=>page.locator('.viewport-tool-rail [data-viewport-tool="'+key+'"]').click();
 const point=async(id,t=.65)=>page.evaluate(({id,t})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),n=Math.min(b.points.length-2,Math.floor(t*(b.points.length-1))),p=b.points[n].clone().lerp(b.points[n+1],t*(b.points.length-1)-n),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);const v=f.asset.group.localToWorld(p).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},{id,t});
 const drag=async(a,b)=>{await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:12});await page.mouse.up();await wait();};




 const dist=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
 const idle=()=>page.waitForFunction(()=>!window.__branchForge.keyboardTransformActive);
 const apply=async(axis,value)=>{await page.keyboard.press('s');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);if(axis)await page.keyboard.press(axis);await page.keyboard.type(String(value));await page.keyboard.press('Enter');await idle();await wait();};
 await load();await select('A');let before=await snap();await apply('',.65);const after=await snap(),origin=before.A[0];
 assert.deepEqual(after.A[0],origin);for(const id of ['A','A1'])for(let i=0;i<before[id].length;i++)assert.ok(dist(after[id][i],before[id][i].map((v,k)=>origin[k]+(v-origin[k])*.65))<1e-7);
 assert.deepEqual(after.B,before.B);assert.deepEqual(after.ROOT,before.ROOT);result.checks.push('S .65 uniformly scales only selected support subtree around its actual root');
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),before);await page.locator('#redoBtn').click();await wait();assert.deepEqual(await snap(),after);
 await page.keyboard.press('s');await page.waitForFunction(()=>window.__branchForge.keyboardTransformActive);await page.keyboard.type('1.5');await page.keyboard.press('Escape');await idle();assert.deepEqual(await snap(),after);
 await tool('BUNDLE_SCALE');assert.equal(await page.locator('#bundlePivot').isDisabled(),true);const gizmo=await page.evaluate(()=>window.__branchForge.bundleState.gizmo.object.position.toArray());assert.ok(dist(gizmo,origin)<1e-8);
 await page.locator('#bundleValueX').evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.matches('details'))p.open=true;});
 for(const [axis,value]of [['X',1.2],['Y',.8],['Z',1.1]])await page.locator('#bundleValue'+axis).fill(String(value));await page.locator('#applyBundleTransform').click();await wait();const numeric=await snap();for(const id of ['A','A1'])for(let i=0;i<after[id].length;i++)assert.ok(dist(numeric[id][i],after[id][i].map((v,k)=>origin[k]+(v-origin[k])*[1.2,.8,1.1][k]))<1e-7);
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),after);result.checks.push('scale gizmo is rooted and numeric XYZ uses same protected scale; undo redo and Escape exact');
 await page.screenshot({path:path.join(out,'枝根缩放.png')});
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='root-scale.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
 await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'枝根缩放保存.branch.json');await download.saveAs(saved);await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='枝根缩放验收');await wait();assert.deepEqual(await snap(),after);result.checks.push('actual saved file reload preserves rooted scale and connected child');



 const camellia=path.resolve('assets/tree-template-library/template-ea396bae43d74f7fa42ed703724d053b.branch.json');await page.locator('#projectInput').setInputFiles(camellia);await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===577);await wait();
 const unitData=()=>page.evaluate(()=>JSON.stringify([window.__branchForge.authoring.branch_instances,window.__branchForge.authoring.branch_library]));const units=await unitData();
 const detailed=()=>page.evaluate(()=>{const a=window.__branchForge.asset;return {branches:a.masterBranches.map(b=>({id:b.stableId,parent:a.masterBranches.find(p=>p.id===b.parentId)?.stableId,owner:b.unitOwner||b.instanceId,points:b.points.map(p=>p.toArray()),radii:[b.startRadius,b.endRadius]})),foliage:[...a.placements,...a.treeOrgans].map(p=>({id:p.stableId,branch:p.branchStableId,scale:p.scale,position:p.position.toArray()}))};});
 const original=await detailed(),base=await snap();await select('P1');await page.mouse.move(...await point('P1',.7));await apply('',.7);
 const scaled=await detailed();assert.equal(await unitData(),units);assert.equal(scaled.branches.length,original.branches.length);assert.equal(scaled.foliage.length,original.foliage.length);
 const affected=new Set(['P1']);let more=true;while(more){more=false;for(const b of original.branches)if(affected.has(b.parent)&&!affected.has(b.id)){affected.add(b.id);more=true;}}
 const root=base.P1[0];let protectedCount=0;
 for(let n=0;n<original.branches.length;n++){const a=original.branches[n],b=scaled.branches[n];assert.equal(a.id,b.id);for(let k=0;k<2;k++)assert.ok(Math.abs(a.radii[k]-b.radii[k])<1e-10);if(a.owner){protectedCount++;for(let i=0;i<a.points.length;i++)for(let j=0;j<a.points.length;j++)assert.ok(Math.abs(dist(a.points[i],a.points[j])-dist(b.points[i],b.points[j]))<1e-6,a.id+' internal size');}else if(affected.has(a.id)){for(let i=0;i<a.points.length;i++)assert.ok(dist(b.points[i],a.points[i].map((v,k)=>root[k]+(v-root[k])*.7))<1e-6,a.id+' skeleton scale');}else assert.deepEqual(b.points,a.points);}
 const maps=new Map(scaled.branches.map(b=>[b.id,b]));
 for(let n=0;n<original.foliage.length;n++){const a=original.foliage[n],b=scaled.foliage[n];assert.equal(a.id,b.id);assert.ok(Math.abs(a.scale-b.scale)<1e-9);const old=original.branches.find(v=>v.id===a.branch),next=maps.get(a.branch);if(old?.owner){assert.ok(Math.abs(dist(a.position,old.points[0])-dist(b.position,next.points[0]))<2e-5,a.id+' leaf/organ offset');}}
 assert.ok(protectedCount>0);result.checks.push('full camellia S: support subtree scales from root; all installed branch radii and internal distances, leaf/organ sizes and attachment offsets stay fixed');result.counts={instances:577,unitBranches:protectedCount,foliage:scaled.foliage.length};
 await page.screenshot({path:path.join(out,'山茶缩放完整装配.png')});
 await page.locator('#skeletonEditModeBtn').click();await wait();await page.locator('#skeletonEditModeBtn').click();await wait();assert.deepEqual(await detailed(),scaled);result.checks.push('skeleton-only and full preview rebuild agree exactly');
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),base);await page.locator('#skeletonEditModeBtn').click();await wait();await select('P1');await apply('x',.6);await page.locator('#skeletonEditModeBtn').click();await wait();const axis=await detailed();
 for(let n=0;n<original.branches.length;n++){const a=original.branches[n],b=axis.branches[n];if(a.owner)for(let i=1;i<a.points.length;i++)assert.ok(Math.abs(dist(a.points[0],a.points[i])-dist(b.points[0],b.points[i]))<1e-6);}
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),base);result.checks.push('axis S in skeleton mode retains assembled unit size after full rebuild and undo');
 assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
