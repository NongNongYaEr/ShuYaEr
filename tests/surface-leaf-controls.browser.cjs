const assert=require('node:assert/strict'),path=require('path'),hash=s=>require('crypto').createHash('sha256').update(s).digest('hex');
module.exports=async(page,wait,report,out)=>{
 const set=async(id,v)=>{for(const d of await page.locator('#'+id).locator('xpath=ancestor::details').all())if(await d.getAttribute('open')===null)await d.locator(':scope > summary').click();await page.locator('#'+id).fill(String(['surfaceLeafSize','surfaceLeafSpacing'].includes(id)?v*100:v));await page.locator('#'+id).press('Tab');await wait();};
 const read=()=>page.evaluate(()=>{const f=window.__branchForge,a=f.asset,leaves=a.placements.filter(p=>p.canopy);return {count:leaves.length,size:a.settings.leaf_scale,vine:f.authoring.vine,r:f.authoring.surface_growth.growth_ruler,points:JSON.stringify(leaves.map(p=>[p.stableId,p.position.toArray()])),skeleton:JSON.stringify(a.masterBranches.map(b=>[b.stableId,b.points.map(p=>p.toArray())]))};});
 const base=await read();await set('surfaceLeafSize',.1);const big=await read();assert.equal(big.size,.1);assert.equal(big.points,base.points);assert.equal(big.skeleton,base.skeleton);assert.equal(await page.locator('#vine_leaf_size').inputValue(),'0.1');
 await set('surfaceLeafDensity',18);const sparse=await read();assert.ok(sparse.count<big.count);assert.equal(sparse.skeleton,base.skeleton);assert.equal(await page.locator('#vine_foliage').inputValue(),'18');
 await set('surfaceLeafDensity',38);await set('surfaceLeafSpacing',.1);const spaced=await read();assert.ok(spaced.count<big.count*.7);assert.equal(spaced.skeleton,base.skeleton);
 await set('surfaceLeafSpacing',.04);const beforeGaps=await read();await set('surfaceLeafGapRatio',.35);const holes=await read();assert.ok(holes.count<beforeGaps.count);assert.equal(holes.skeleton,base.skeleton);
 await set('surfaceLeafGapSize',1.2);const largeHoles=await read();assert.notEqual(hash(largeHoles.points),hash(holes.points));
 await set('surfaceLeafGapRatio',1);assert.equal((await read()).count,0);await page.locator('#undoBtn').click();await wait();assert.equal((await read()).points,largeHoles.points);
 await page.locator('#fitViewBtn').click();await page.mouse.move(940,635);await page.mouse.wheel(0,-1900);await page.waitForTimeout(500);await page.locator('#surfaceLeafPanel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'叶片大小与疏密.png')});
 report.leafControls={size:.1,baseline:base.count,sparse:sparse.count,spaced:spaced.count,gaps:largeHoles.count,allEmpty:true,undoExact:true,skeletonUnchanged:true,legacyControlsSynced:true};
};
if(require.main===module){process.env.BRANCHFORGE_CURVES_QA_OUTPUT='.runtime/surface-leaf-controls';process.env.BRANCHFORGE_CURVES_QA_SETUP=__filename;require('./surface-route-curves.browser.cjs');}
