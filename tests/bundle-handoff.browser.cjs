const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.BRANCHFORGE_PLAYWRIGHT||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('.runtime/bundle-handoff');fs.mkdirSync(out,{recursive:true});const result={checks:[],errors:[]};
 const shape=(id,parent,points)=>({id,parent,points,length:3,start_radius:.035,end_radius:.015});
 const doc={format:'ProceduralBranchProject',version:4,settings:{object_name:'沿枝路回缩验收',seed:42,leaf_density:0,child_count:0,branch_levels:4,wind_strength:0},authoring:{branch_shape:{branches:[shape('ROOT','',[[0,0,0],[0,0,.3],[0,0,.6],[0,0,1]]),shape('A','ROOT',[[0,0,1],[1,0,1.4],[1.7,0,2.2],[3,0,2.2]]),shape('A1','A',[[1,0,1.4],[1.4,0,1.8],[1.8,0,2.2],[2.2,0,2.6]]),shape('B','ROOT',[[0,.04,1],[1,.04,1.4],[2,.04,1.8],[3,.04,2.2]])]}}};
 const input=path.join(out,'fixture.branch.json');fs.writeFileSync(input,JSON.stringify(doc));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(60000);page.on('pageerror',e=>result.errors.push(e.message));await page.goto(process.argv[2]);console.log('PAGE');await page.waitForFunction(()=>window.__branchForge?.asset);
 const wait=()=>page.waitForFunction(()=>{const f=window.__branchForge;return f.asset&&!f.asset.group.userData.pending_rebuild&&f.asset.authoring===f.authoring&&!f.workbench.busy&&document.querySelector('#busyOverlay').hidden;});
 const load=async()=>{await page.locator('#projectInput').setInputFiles(input);await page.waitForFunction(()=>window.__branchForge.asset?.settings.object_name==='沿枝路回缩验收');await wait();await page.evaluate(()=>{const f=window.__branchForge;f.camera.position.set(1.5,-9,1.5);f.camera.up.set(0,0,1);f.controls.target.set(1.5,0,1.5);f.controls.update();});};
 const snap=()=>page.evaluate(()=>Object.fromEntries(window.__branchForge.asset.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())])));
 const select=async id=>{await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:new RegExp('^'+id+'$')})}).click();};
 const tool=key=>page.locator('.viewport-tool-rail [data-viewport-tool="'+key+'"]').click();
 const point=async(id,t=.65)=>page.evaluate(({id,t})=>{const f=window.__branchForge,b=f.asset.masterBranches.find(b=>b.stableId===id),n=Math.min(b.points.length-2,Math.floor(t*(b.points.length-1))),p=b.points[n].clone().lerp(b.points[n+1],t*(b.points.length-1)-n),r=document.querySelector('#viewport').getBoundingClientRect();f.asset.group.updateWorldMatrix(true,true);const v=f.asset.group.localToWorld(p).project(f.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},{id,t});
 const drag=async(a,b)=>{await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:12});await page.mouse.up();await wait();};


 await load();await select('A');await tool('BUNDLE_MOVE');const before=await snap();
 await page.locator('#bundleValueX').evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.matches('details'))p.open=true;});
 await page.locator('#bundleValueX').fill('.25');await page.locator('#bundleValueY').fill('0');await page.locator('#bundleValueZ').fill('.1');
 await page.evaluate(()=>{const f=window.__branchForge;window.__hash=()=>{let h=2166136261;f.asset.group.traverse(o=>{let a=o.geometry?.getAttribute('position')?.array;if(a&&f.asset.activeEditPreview){const values=new Float32Array(a.length);for(let i=0;i<a.length/3;i++){const p=f.asset.activeEditPreview.vertex(o,i);if(p)values.set([p.x,p.y,p.z],i*3);else values.set(a.subarray(i*3,i*3+3),i*3);}a=values;}if(a)for(const b of new Uint8Array(a.buffer,a.byteOffset,a.byteLength))h=Math.imul(h^b,16777619);});return h>>>0;};window.__oldHash=window.__hash();window.__frames=[];const render=f.renderer.render;f.renderer.render=function(scene,camera){if(scene===f.scene&&window.__watch&&f.asset.group.userData.pending_rebuild)window.__frames.push(window.__hash());return render.apply(this,arguments);};document.querySelector('#applyBundleTransform').addEventListener('click',()=>window.__watch=true);});
 await page.locator('#applyBundleTransform').click();await wait();const after=await snap();assert.notDeepEqual(after.A,before.A);assert.deepEqual(after.B,before.B);
 const frames=await page.evaluate(()=>({before:window.__oldHash,frames:window.__frames}));assert.ok(frames.frames.length);assert.ok(frames.frames.every(h=>h!==frames.before));result.handoff=frames;result.checks.push('branch-bundle numeric transform holds new preview for every pending render');
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await snap(),before);result.checks.push('bundle undo restores original geometry');assert.deepEqual(result.errors,[]);result.passed=true;console.log(JSON.stringify(result));
 }finally{await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
