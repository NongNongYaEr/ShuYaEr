const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.runtime/model-sculpt-visibility/'+Date.now()),delay=n=>new Promise(r=>setTimeout(r,n));
(async()=>{fs.mkdirSync(out,{recursive:true});let host;const reports=[],errors=[];try{
 host=await require('./owned-native-browser.cjs')({out});const page=host.page;page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.__branchForge?.modelSculpt);
 await page.locator('#openResourceCenter').click();await page.locator('#resourceModelSculpt').click();const panel=page.locator('#modelSculptDialog');
 for(const name of ['测试复杂树.glb','测试复杂树2.glb']){
  await panel.locator('[data-file]').setInputFiles(path.join(process.env.BRANCHFORGE_SCULPT_MODEL_DIR||path.join(root,'测试树干'),name));await page.waitForFunction(()=>window.__branchForge.modelSculpt.view&&document.querySelector('#modelSculptDialog').dataset.busy==='false');
  await page.evaluate(()=>window.__branchForge.nativeViewport.waitForPresentation());const {png,result}=await require('./native-viewport-visibility.cjs')(page);assert.equal(await page.locator('.app-shell').evaluate(e=>getComputedStyle(e).visibility),'hidden');
  for(const display of ['source','result']){await panel.locator('[data-display="'+display+'"]').click();await require('./native-viewport-visibility.cjs')(page);}
  const audit=await page.evaluate(()=>window.__branchForge.nativeViewport.auditModel());assert(audit.checked&&!audit.mismatch);reports.push({name,visibility:result,audit});
  if(name==='测试复杂树.glb'){
   fs.writeFileSync(out+'/界面透明层.png',png);const nativePath=out+'/native-capture.png';if(fs.existsSync(nativePath))fs.unlinkSync(nativePath);await page.evaluate(()=>window.chrome.webview.postMessage(JSON.stringify({topic:'branchforge-native',action:'capture'})));for(let n=0;n<50&&!fs.existsSync(nativePath);n++)await delay(100);assert(fs.existsSync(nativePath));
   const data=await page.evaluate(async({ui,native,rect})=>{const load=async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();return image;},[overlay,model]=await Promise.all([load(ui),load(native)]),c=document.createElement('canvas');c.width=overlay.width;c.height=overlay.height;const ctx=c.getContext('2d');ctx.fillStyle='#171d1b';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(model,rect.x*rect.scale,rect.y*rect.scale,rect.width*rect.scale,rect.height*rect.scale);ctx.drawImage(overlay,0,0);return c.toDataURL('image/png').split(',')[1];},{ui:png.toString('base64'),native:fs.readFileSync(nativePath).toString('base64'),rect:result.rect});fs.writeFileSync(out+'/DX12与界面合成校验.png',Buffer.from(data,'base64'));
  }
 }
 await panel.locator('[data-close]').click();assert.equal(await page.locator('.app-shell').evaluate(e=>getComputedStyle(e).visibility),'visible');assert.equal(await page.evaluate(()=>document.body.classList.contains('model-sculpt-active')),false);assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({passed:true,reports,returnedToAuthoring:true,errors},null,2));console.log('PASS two real models, transparent viewport/backdrop, source/result comparison, native audit and restored main UI');
 }finally{await host?.close();await require('./sculpt-test-cleanup.cjs')(out);}
})().catch(e=>{fs.writeFileSync(out+'/failure.txt',e.stack);console.error(e.stack);process.exitCode=1;});
