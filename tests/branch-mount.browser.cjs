const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/branch-mount');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const shape=(id,parent,points)=>({id,parent,points,length:3,start_radius:.035,end_radius:.015});
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'枝束挂接验收',seed:42,leaf_density:0,child_count:0,branch_levels:4,wind_strength:0},authoring:{branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,.3],[0,0,.6],[0,0,1]]),shape('A','ROOT',[[0,0,1],[1,0,1.4],[1.7,0,2.2],[3,0,2.2]]),shape('A1','A',[[1,0,1.4],[1.4,0,1.8],[1.8,0,2.2],[2.2,0,2.6]]),shape('B','ROOT',[[0,.04,1],[1,.04,1.4],[2,.04,1.8],[3,.04,2.2]])]}}};
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>result.errors.push(e.message));await page.goto(process.argv[2]);console.log('PAGE');await page.waitForFunction(()=>window.__branchForge?.asset);
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 const load=async()=>{await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='枝束挂接验收');await wait();await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(1.5,-9,1.5);f.camera.up.set(0,0,1);f.controls.target.set(1.5,0,1.5);f.controls.update();});};
 const snap=()=>page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
 const select=async id=>{await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'$')})}).click();};
 const tool=key=>page.locator('.viewport-tool-rail [data-viewport-tool="'+key+'"]').click();
 const point=async(id,t=.65)=>page.evaluate(({id,t})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),n=Math.min(b.points.length-2,Math.floor(t*(b.points.length-1))),p=b.points[n].clone().lerp(b.points[n+1],t*(b.points.length-1)-n),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);const v=f.asset.group.localToWorld(p).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},{id,t});
 const drag=async(a,b)=>{await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:12});await page.mouse.up();await wait();};


 await load();await select('A');await tool('BUNDLE_MOVE');const before=await snap();
 const set=async(id,value)=>{await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Enter');await wait();};
 await set('mountAttach',35);await set('mountAzimuth',50);await set('mountElevation',25);const after=await snap();
 assert.notDeepEqual(after.A,before.A);assert.deepEqual(after.B,before.B);assert.deepEqual(after.ROOT,before.ROOT);
 const dist=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));for(const id of ['A','A1'])for(let i=1;i<before[id].length;i++)assert.ok(Math.abs(dist(before[id][0],before[id][i])-dist(after[id][0],after[id][i]))<1e-7);
 assert.equal(await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers.filter(l=>l.operation?.type==='MOUNT').length),1);
 const undo=await page.evaluate(()=>window.__branchForge.historyState.undo);await set('mountElevation',25);assert.equal(await page.evaluate(()=>window.__branchForge.historyState.undo),undo);assert.deepEqual(await snap(),after);
 await page.locator('#undoBtn').click();await wait();assert.equal(await page.locator('#mountElevation').inputValue(),'0');await page.locator('#redoBtn').click();await wait();assert.deepEqual(await snap(),after);
 await page.screenshot({path:path.join(out,'挂接参数与枝束.png')});result.checks.push('UI location/yaw/elevation, rigid subtree, untouched sibling, merged layer, no-op, undo/redo');
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async function(url,options){if(url==='/api/save-project'){const prefix=await options.body.slice(0,12).text(),line=prefix.indexOf('\n'),offset=line+1+Number(prefix.slice(0,line));const link=document.createElement('a');link.href=URL.createObjectURL(options.body.slice(offset));link.download='retract.branch.json';link.click();return new Response(JSON.stringify({success:true,path:'独立验收下载'}),{headers:{'Content-Type':'application/json'}});}return original.apply(this,arguments);};});
 await page.locator('#saveProjectBtn').click();await page.locator('#projectSaveDialog [value="FILE"]').check();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#psSubmit').click()]);const saved=path.join(out,'挂接保存.branch.json');await download.saveAs(saved);await page.reload();await page.waitForFunction(()=>window.__branchForge?.asset);await page.locator('#projectInput').setInputFiles(saved);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='枝束挂接验收');await wait();assert.deepEqual(await snap(),after);result.checks.push('actual save and reload preserves mount parameters and geometry');

 assert.equal(await page.evaluate(()=>window.__branchForge.authoring.sculpt_layers.at(-1).operation.azimuth),50);
 await select('A');await tool('BUNDLE_MOVE');await page.locator('#bundleValueX').fill('.2');await page.locator('#applyBundleTransform').click();await wait();
 const sculpted=await snap();assert.notDeepEqual(sculpted.A,after.A);assert.deepEqual(sculpted.B,after.B);
 await set('mountAzimuth',75);const remounted=await snap();for(const id of ['A','A1'])for(let i=1;i<sculpted[id].length;i++)assert.ok(Math.abs(dist(sculpted[id][0],sculpted[id][i])-dist(remounted[id][0],remounted[id][i]))<1e-7);assert.deepEqual(remounted.B,sculpted.B);
 await set('mountAzimuth',50);const back=await snap();for(const id of ['A','A1'])for(let i=0;i<sculpted[id].length;i++)assert.ok(dist(back[id][i],sculpted[id][i])<1e-7);
 result.checks.push('continue shaping after mount, mount again rigidly, parameter return preserves intervening edits');
 const camellia=path.resolve('assets/tree-template-library/template-ea396bae43d74f7fa42ed703724d053b.branch.json');await page.locator('#projectInput').setInputFiles(camellia);await page.waitForFunction(()=>window.__branchForge.authoring.branch_instances.length===577);await wait();
 const units=await page.evaluate(()=>JSON.stringify([window.__branchForge.authoring.branch_instances,window.__branchForge.authoring.branch_library]));
 const foliage=()=>page.evaluate(()=>{const a=window.__branchForge.asset;return Object.fromEntries(['placements','treeOrgans'].map(key=>[key,a[key].map(p=>({id:p.stableId,branch:p.branchStableId,position:p.position.toArray(),direction:p.direction.toArray(),scale:p.scale}))]));});const foliageBefore=await foliage();
 const fullBefore=await snap();const records=await page.evaluate(()=>window.__branchForge.asset.masterBranches.map(b=>({id:b.stableId,parent:window.__branchForge.asset.masterBranches.find(p=>p.id===b.parentId)?.stableId,r:[b.startRadius,b.endRadius]})));
 const affected=new Set(['P1']);let more=true;while(more){more=false;for(const r of records)if(affected.has(r.parent)&&!affected.has(r.id)){affected.add(r.id);more=true;}}
 await page.locator('#skeletonEditModeBtn').click();await wait();await select('P1');await tool('BUNDLE_MOVE');await set('mountAttach',30);await set('mountAzimuth',45);await set('mountElevation',20);
 const matrix=await page.evaluate(()=>window.__branchForge.asset.masterBranches.find(b=>b.stableId==='P1').mountMatrix.toArray());
 await page.locator('#skeletonEditModeBtn').click();await wait();const fullAfter=await snap();
 assert.equal(await page.evaluate(()=>JSON.stringify([window.__branchForge.authoring.branch_instances,window.__branchForge.authoring.branch_library])),units);
 const transform=p=>[0,1,2].map(k=>matrix[k]*p[0]+matrix[4+k]*p[1]+matrix[8+k]*p[2]+matrix[12+k]);
 for(const r of records){assert.ok(fullAfter[r.id],r.id);for(let i=0;i<fullBefore[r.id].length;i++){const want=affected.has(r.id)?transform(fullBefore[r.id][i]):fullBefore[r.id][i];assert.ok(dist(want,fullAfter[r.id][i])<2e-5,r.id+' point '+i+' rigid transform mismatch '+dist(want,fullAfter[r.id][i]));}}
 const radii=await page.evaluate(()=>window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.startRadius,b.endRadius]));for(let i=0;i<radii.length;i++){assert.equal(radii[i][0],records[i].id);for(let k=0;k<2;k++)assert.ok(Math.abs(radii[i][k+1]-records[i].r[k])<1e-10);}
 const foliageAfter=await foliage();for(const key of ['placements','treeOrgans']){assert.equal(foliageBefore[key].length,foliageAfter[key].length);for(let i=0;i<foliageBefore[key].length;i++){const old=foliageBefore[key][i],current=foliageAfter[key][i];assert.equal(current.id,old.id);assert.ok(Math.abs(current.scale-old.scale)<1e-9);const moved=affected.has(old.branch),position=moved?transform(old.position):old.position,direction=moved?[0,1,2].map(k=>matrix[k]*old.direction[0]+matrix[4+k]*old.direction[1]+matrix[8+k]*old.direction[2]):old.direction;assert.ok(dist(current.position,position)<2e-5);assert.ok(dist(current.direction,direction)<2e-5);}}
 result.foliage={leaves:foliageAfter.placements.length,organs:foliageAfter.treeOrgans.length};
 result.checks.push('real camellia: skeleton mode mount then full preview, every affected point follows the same rigid matrix, all 577 units/library and radii unchanged');
 await page.screenshot({path:path.join(out,'山茶挂接预览.png')});
 assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
