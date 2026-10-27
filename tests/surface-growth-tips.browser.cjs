const assert=require('node:assert/strict'),path=require('path');
module.exports=async(page,wait,report,out)=>{
 for(const[id,value]of [['growthRulerTop','10.091'],['growthStemWander','.6'],['growthRulerRagged','1'],['growthRulerClump','.35'],['growthRulerDepth','.3']]){
  await page.locator('#'+id).fill(value);await page.locator('#'+id).press('Tab');await wait();
 }
 const read=()=>page.evaluate(()=>{const f=window.__branchForge,all=f.asset.masterBranches,byId=new Map(all.map(b=>[b.id,b])),roots=all.filter(b=>b.stableId.startsWith('Z_ruler_')&&!byId.has(b.parentId));return {heights:roots.map(b=>b.points.at(-1).z),branches:JSON.stringify(all.filter(b=>b.stableId.startsWith('Z_ruler_')).map(b=>[b.stableId,b.points.map(p=>p.toArray())]))};});
 const staggered=await read();
 assert.ok(Math.max(...staggered.heights)-Math.min(...staggered.heights)>.3);assert.ok(Math.max(...staggered.heights)<=10.091+1e-6);
 await page.locator('#growthRulerRagged').fill('0');await page.locator('#growthRulerRagged').press('Tab');await wait();
 const flat=await read();assert.ok(flat.heights.every(z=>Math.abs(z-10.091)<1e-5));
 const capture=async name=>{await page.locator('#fitViewBtn').click();await page.mouse.move(930,450);await page.mouse.wheel(0,-1500);await page.waitForTimeout(500);await page.mouse.move(950,420);await page.mouse.down({button:'right'});await page.mouse.move(950,690,{steps:12});await page.mouse.up({button:'right'});await page.waitForTimeout(400);await page.screenshot({path:path.join(out,name)});};
 await capture('顶部齐平对照.png');
 await page.locator('#undoBtn').click();await wait();assert.deepEqual(await read(),staggered);
 await capture('顶部错落效果.png');
 report.tips={heightLimit:10.091,ragged:1,min:Math.min(...staggered.heights),max:Math.max(...staggered.heights),zeroRestoresPlane:true,undoExact:true};
};
if(require.main===module){process.env.BRANCHFORGE_CURVES_QA_OUTPUT='.runtime/surface-growth-tips';process.env.BRANCHFORGE_CURVES_QA_SETUP=__filename;require('./surface-route-curves.browser.cjs');}
