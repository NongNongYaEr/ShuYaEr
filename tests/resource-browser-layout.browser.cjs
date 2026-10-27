const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function verifyResourceBrowserLayout(page,out){
 const checks=[],check=s=>{checks.push(s);console.log('PASS',s)},center=page.locator('#resourceCenterDialog');
 const stamp=()=>page.evaluate(()=>{const a=window.__branchForge;return JSON.stringify({authoring:a.authoring,history:a.historyState,selection:a.selectedCurvePoint,camera:a.camera.position.toArray(),target:a.controls.target.toArray()});});
 const before=await stamp();await page.setViewportSize({width:1700,height:1050});await page.evaluate(()=>window.__branchForge.resourceCenter.open({scope:'library',type:'units',collection:'all',clear:true}));await page.waitForFunction(()=>!document.getElementById('resourceCenterDialog').hasAttribute('aria-busy'));
 assert.equal(await center.locator('[data-view-title]').innerText(),'叶花果');assert.equal(await page.locator('#resourceGrid .rc-card').count(),29);await page.waitForFunction(()=>{const i=document.querySelector('.rc-browser-mascot');return i?.complete&&i.naturalWidth>0;});assert(await center.locator('.rc-browser-mascot').isVisible());
 const cards=page.locator('#resourceGrid .rc-card-main'),small=(await cards.first().boundingBox()).width;await center.locator('[data-card-size=large]').click();assert((await cards.first().boundingBox()).width>small+10);await center.locator('[data-card-size=standard]').click();check('populated leaf assets visibly show Tree Duck guidance, real pack counts and genuinely larger standard/large previews');
 for(const width of [2560,1750,1366,1080,820,640]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(80);
  assert(await center.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'browser fits '+width);
  const title=await center.locator('[data-view-title]').boundingBox(),button=await center.locator('#resourceCreate').boundingBox(),hero=await center.locator('.rc-browser-heading').boundingBox();assert(button&&button.x>=hero.x&&button.x+button.width<=hero.x+hero.width+1);assert(button.y>=title.y+title.height-1||button.x>=title.x+title.width-1,'category action does not cover title at '+width);
  if(width>=1080){const art=await center.locator('.rc-browser-mascot').boundingBox();assert(art&&art.x+art.width<=title.x+1,'left artwork precedes the category title');}else assert(!await center.locator('.rc-browser-mascot').isVisible());
  if(width===640)assert(await page.locator('#resourceGrid').evaluate(n=>n.clientHeight)>=220);
  assert.equal(await cards.locator('img.resource-illustration').count(),0);await page.screenshot({path:path.join(out,'日常资源浏览-'+width+'.png'),animations:'disabled'});
 }
 check('category headers, action buttons, mascot and asset grids fit six desktop/narrow sizes without covering content');
 await page.setViewportSize({width:1750,height:1000});await cards.first().click();assert.equal(await page.locator('#resourceDetails .rc-detail-kind').innerText(),'叶花果');assert(await page.locator('#resourceDetails').getByRole('button',{name:'检视全部单位',exact:true}).isVisible());await page.screenshot({path:path.join(out,'叶花果主界面-新排布.png'),animations:'disabled'});
 await page.locator('#resourceCenterDismiss').click();assert.equal(await stamp(),before);await page.setViewportSize({width:1700,height:1050});check('the redesigned details keep real asset type and inspection commands while preserving scene, history and camera');return checks;
};
