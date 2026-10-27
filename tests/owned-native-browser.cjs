// A dedicated off-desktop WebView host, never an existing user browser/window.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
module.exports=async function openOwnedNative({out,executable,appRoot}={}){
 const root=path.resolve(appRoot||path.join(__dirname,'..'));out=path.resolve(out);assert(out.toLowerCase().startsWith((path.join(root,'.runtime')+path.sep).toLowerCase()));
 const port=await require('./native-test-port.cjs')(out),delay=ms=>new Promise(r=>setTimeout(r,ms));
 const host=spawn(executable||process.env.BRANCHFORGE_NATIVE_EXECUTABLE||path.join(root,'树鸭儿.exe'),[],{cwd:root,windowsHide:true,env:{...process.env,BRANCHFORGE_APP_ROOT:appRoot?'':root,BRANCHFORGE_DESKTOP_TEST_DIR:out,BRANCHFORGE_DEBUG_PORT:String(port)}});let exited=false,browser,page;
 host.on('exit',code=>{exited=true;fs.writeFileSync(path.join(out,'host-exit.json'),JSON.stringify({code}));});fs.writeFileSync(path.join(out,'host.json'),JSON.stringify({pid:host.pid,port,appRoot:root}));
 const close=async()=>{if(page&&!exited)try{await page.evaluate(()=>window.chrome.webview.postMessage(JSON.stringify({topic:'branchforge-native',action:'close-test-host'})));}catch{}for(let i=0;i<400&&!exited;i++)await delay(50);if(!exited)host.kill();};
 try{
  for(let i=0;i<100;i++){if(exited)throw Error('Owned native host exited before CDP');try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);break;}catch{await delay(300);}}
  assert(browser,'owned native host must provide its own CDP connection');page=browser.contexts()[0].pages()[0];await page.waitForFunction(()=>window.__branchForge?.nativeViewport.stats.active,null,{timeout:180000});await require('./native-test-port.cjs').assertOwnership(page,out);
  return {page,url:page.url(),close,pid:host.pid};
 }catch(error){await close();throw error;}
};
