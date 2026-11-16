const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve('.runtime/brand-palettes');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const report={checks:[],errors:[],contrast:{}};
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(90000);page.on('pageerror',e=>report.errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>window.__branchForge?.asset&&!document.getElementById('brandStartup'));
 await page.goto(process.argv[2]);await ready();
 // Settings, branch points and serialized authoring must never change on a palette switch.
 const state=()=>page.evaluate(()=>{const f=window.__branchForge;return JSON.stringify({authoring:f.authoring,settings:f.collectSettings(),history:f.historyState,branches:f.asset.masterBranches.map(b=>b.points.map(p=>p.toArray()))});});
 const before=await state();
 for(const [palette,name] of [['graphite','石墨黄'],['cream','奶油白'],['forest','森林绿']]){
  await page.click('#brandAppearanceOpen');await page.click('[data-palette-choice="'+palette+'"]');assert.equal(await page.locator('html').getAttribute('data-palette'),palette);
  await page.keyboard.press('g');await page.keyboard.press('r');assert.equal(await state(),before);await page.screenshot({path:path.join(out,name+'-外观.png')});await page.keyboard.press('Escape');
  await page.screenshot({path:path.join(out,name+'-工作台.png')});
  const contrast=await page.evaluate(()=>{
   const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number),lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   const root=getComputedStyle(document.documentElement),panel=document.querySelector('.parameter-panel');
   const resolve=v=>{const e=document.createElement('span');e.style.color=v;panel.append(e);const c=rgb(getComputedStyle(e).color);e.remove();return lum(c)};
   const bg=resolve(root.getPropertyValue('--surface'));
   return Object.fromEntries(['--text','--muted','--label','--accent-text'].map(k=>{const fg=resolve(root.getPropertyValue(k));return[k,(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)]}));
  });report.contrast[palette]=contrast;for(const [k,v] of Object.entries(contrast))assert(v>=4.5,palette+' '+k+' contrast '+v);
  await page.click('#brandExportOpen');await page.screenshot({path:path.join(out,name+'-导出.png')});await page.keyboard.press('Escape');
  await page.click('#openResourceCenter');await page.click('#openProjectLibrary');await page.waitForSelector('.pl-card');await page.screenshot({path:path.join(out,name+'-工程库.png')});await page.waitForFunction(()=>!document.getElementById('projectLibraryDialog').hasAttribute('aria-busy'));await page.click('#plClose');
  await page.click('#openResourceCenter');await page.click('#openPlantUnitWorkbench');await page.waitForSelector('#plantUnitDialog[open]');await page.screenshot({path:path.join(out,name+'-叶花果.png')});await page.keyboard.press('Escape');
 }
 report.checks.push('三套配色立即生效；切换不改变工程、几何和历史','主要文字/辅助文字/字段标签/强调文字与面板底色对比度>=4.5','三套实际导出、工程库与叶花果显示');
 await page.reload();await ready();assert.equal(await page.locator('html').getAttribute('data-palette'),'forest');
 await page.click('#brandHome');await page.click('#brandHomeAppearance');await page.click('[data-palette-choice="cream"]');await page.keyboard.press('Escape');assert(await page.locator('#brandHomeDialog').isVisible());await page.screenshot({path:path.join(out,'奶油白-欢迎页.png')});await page.keyboard.press('Escape');
 await page.click('#branchWorkspaceBtn');await page.waitForFunction(()=>window.__branchForge.workbench.mode==='BRANCH'&&!window.__branchForge.workbench.busy);await page.screenshot({path:path.join(out,'奶油白-枝条.png')});
 await page.click('#vineWorkspaceBtn');await page.waitForFunction(()=>window.__branchForge.workbench.mode==='VINE'&&!window.__branchForge.workbench.busy);await page.screenshot({path:path.join(out,'奶油白-藤蔓.png')});
 await page.setViewportSize({width:1080,height:900});await page.screenshot({path:path.join(out,'奶油白-1080.png')});const b=await page.locator('#brandExportOpen').boundingBox();assert(b.x+b.width<=1080);
 report.checks.push('配色重载记忆；欢迎页嵌套外观面板Esc返回','浅色枝条/藤蔓/1080布局');assert.deepEqual(report.errors,[]);report.passed=true;
 fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
