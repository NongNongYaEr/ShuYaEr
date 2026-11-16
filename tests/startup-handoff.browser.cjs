const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve('.runtime/startup-handoff');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const report={checks:[],errors:[]};
 try{
  for(const mode of ['desktop','browser','legacy']){
   const desktop=mode!=='browser',legacy=mode==='legacy';
   const page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
   if(desktop)await page.addInitScript(legacy=>{
    window.__treeDuckDesktopStartup=true;window.startupMessages=[];
    window.chrome.webview={postMessage(message){window.startupMessages.push({message,asset:!!window.__branchForge?.asset,busy:!document.getElementById('busyOverlay')?.hidden,splash:!!document.getElementById('brandStartup')});}};
    if(legacy){
     const matches=Element.prototype.matches;
     Element.prototype.matches=function(selector){
      if(selector===':popover-open') throw new DOMException('Unsupported selector','SyntaxError');
      return matches.call(this,selector);
     };
     const supports=CSS.supports;
     CSS.supports=function(...args){return args[0]==='selector(:popover-open)' ? false : supports.apply(this,args);};
     HTMLElement.prototype.showPopover=undefined;
     HTMLElement.prototype.hidePopover=undefined;
    }
   },legacy);
   let release;const gate=new Promise(r=>release=r);
   await page.route('**/app.js',async route=>{await gate;await route.continue()});
   await page.goto(process.argv[2],{waitUntil:'commit'});
   await page.waitForFunction(()=>!!window.treeDuckUI);
   assert.equal(await page.locator('#brandStartup').isVisible(),!desktop);
   if(desktop)assert(!(await page.evaluate(()=>window.startupMessages)).some(x=>x.message==='tree-duck:startup-ready'));
   release();await page.waitForFunction(()=>window.__branchForge?.asset&&!document.getElementById('brandStartup'));
   if(desktop){
    await page.waitForFunction(()=>window.startupMessages.some(x=>x.message==='tree-duck:startup-ready'));
    const messages=await page.evaluate(()=>window.startupMessages);
    const ready=messages.filter(x=>x.message==='tree-duck:startup-ready');assert.equal(ready.length,1);assert(ready[0].asset);assert(!ready[0].busy);assert(!ready[0].splash);
    await page.evaluate(()=>{window.treeDuckUI.ready();window.treeDuckUI.ready()});
    assert.equal(await page.evaluate(()=>window.startupMessages.filter(x=>x.message==='tree-duck:startup-ready').length),1);
    if(!legacy)fs.writeFileSync(path.join(out,'desktop-messages.json'),JSON.stringify(messages,null,2));
   }
   if(legacy){
    await page.click('[data-tab="structure"]');
    const button=page.locator('#parameterDirectoryOpen'),directory=page.locator('#parameterDirectory');
    const assertOpen=async open=>{
     assert.equal(await directory.isVisible(),open);
     assert.equal(await button.getAttribute('aria-expanded'),String(open));
    };
    await assertOpen(false);
    await button.click();await assertOpen(true);
    assert.equal(await page.locator(':focus').getAttribute('id'),'parameterDirectorySearch');
    await page.fill('#parameterDirectorySearch','主枝尺寸');
    assert.equal(await page.locator('#parameterDirectoryList button').count(),1);
    await page.keyboard.press('Escape');await assertOpen(false);
    assert.equal(await page.locator(':focus').getAttribute('id'),'parameterDirectoryOpen');
    await button.click();await assertOpen(true);
    await page.click('#parameterSearch');await assertOpen(false);
    report.checks.push('不支持 Popover API 和选择器时，桌面工作台正常就绪，目录可打开、搜索、用 Esc 或点击外部关闭');
   }else await page.screenshot({path:path.join(out,desktop?'桌面就绪.png':'浏览器就绪.png')});
   await page.close();
  }
  report.checks.push('桌面初始化等待期间无第二层网页开屏；真实模型就绪后仅发一次切换通知','浏览器独立打开保留开屏，真实初始化后退出');
  const failure=await browser.newPage();await failure.addInitScript(()=>{window.__treeDuckDesktopStartup=true;window.startupMessages=[];window.chrome.webview={postMessage(message){window.startupMessages.push(message)}};});
  await failure.route('**/app.js',route=>route.fulfill({contentType:'application/javascript',body:'window.treeDuckUI.error("startup-test-error");window.treeDuckUI.ready();'}));
  await failure.goto(process.argv[2]);await failure.waitForFunction(()=>window.startupMessages.some(x=>x.includes('startup-test-error')));
  assert(!(await failure.evaluate(()=>window.startupMessages)).includes('tree-duck:startup-ready'));await failure.close();
  report.checks.push('初始化失败通知原生层，禁止错误后切入工作台');
  assert.deepEqual(report.errors,[]);report.passed=true;fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
