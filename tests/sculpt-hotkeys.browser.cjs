const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const {chromium} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const out = path.resolve('.runtime/sculpt-hotkeys'); fs.mkdirSync(out, {recursive:true});
  const report = {checks:[], errors:[]};
  const input = path.join(out, 'fixture.branch.json');
  fs.writeFileSync(input, JSON.stringify({format:'ProceduralBranchProject', version:4,
    settings:{object_name:'雕刻快捷键验收', seed:42, leaf_density:0, child_count:0, wind_strength:0},
    authoring:{branch_shape:{branches:[
      {id:'ROOT', parent:'', points:[[0,0,0],[0,0,.4],[0,0,.8],[0,0,1]], length:1, start_radius:.08, end_radius:.04},
      {id:'A', parent:'ROOT', points:[[0,0,1],[1,0,1.4],[1.7,0,2.2],[3,0,2.4]], length:3, start_radius:.06, end_radius:.025}
    ]}}}));
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  let page;
  try {
    page = await browser.newPage({viewport:{width:1600,height:1050}}); page.setDefaultTimeout(60000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(process.argv[2]); await page.waitForFunction(() => window.__branchForge?.asset);
    const load = async () => {
      await page.locator('#projectInput').setInputFiles(input);
      await page.waitForFunction(() => {const f = window.__branchForge; return f.asset?.settings.object_name === '雕刻快捷键验收' && !f.asset.group.userData.pending_rebuild && f.asset.authoring === f.authoring && !f.workbench.busy && document.querySelector('#busyOverlay').hidden;});
      await page.locator('#branchOutliner button').filter({has:page.locator('span',{hasText:/^A$/})}).click();
      await page.locator('#viewport').focus();
    };
    const tool = () => page.locator('#viewport').getAttribute('data-viewport-tool');
    const state = () => page.evaluate(() => ({authoring:JSON.stringify(window.__branchForge.authoring), history:window.__branchForge.historyState, selected:[...window.__branchForge.bundleState.selected].sort()}));
    await load(); const baseline = await state();
    for (const [key, expected] of [['c','COMB'],['b','GRAB'],['v','SELECT'],['C','COMB'],['B','GRAB'],['V','SELECT']]) {
      // Uppercase from CapsLock is still a plain shortcut, without Shift.
      if (key === key.toUpperCase()) await page.evaluate(key => window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})), key);
      else await page.keyboard.press(key);
      assert.equal(await tool(), expected); assert.deepEqual(await state(), baseline);
      assert.equal(await page.locator(`.viewport-tool-rail [data-viewport-tool="${expected}"]`).getAttribute('aria-pressed'), 'true');
    }
    await page.keyboard.press('c');
    assert.deepEqual(await page.evaluate(() => window.__branchForge.scene.getObjectByName('枝束选择轮廓').children.flatMap(line => line.userData.branch_ranges||[]).map(r=>r.id)), ['A']);
    assert.match(await page.locator('.viewport-tool-rail [data-viewport-tool="COMB"]').innerText(), /梳理 C/);
    report.checks.push('V/C/B and CapsLock switch the actual tools, synchronize captions/active state and retain selection/document/history; brush outline appears immediately');
    for (const key of ['Control+b','Control+c','Control+v','Alt+b','Shift+v','Meta+c']) {await page.keyboard.press(key); assert.equal(await tool(), 'COMB');}
    await page.evaluate(() => {
      document.querySelector('#viewport').dispatchEvent(new KeyboardEvent('keydown',{key:'b',bubbles:true,repeat:true}));
      document.querySelector('#viewport').dispatchEvent(new KeyboardEvent('keydown',{key:'v',bubbles:true,isComposing:true}));
    }); assert.equal(await tool(),'COMB');
    await page.locator('#parameterSearch').fill(''); await page.locator('#parameterSearch').pressSequentially('vcb');
    assert.equal(await tool(),'COMB'); assert.equal(await page.locator('#parameterSearch').inputValue(),'vcb');
    await page.locator('#parameterSearch').fill(''); await page.locator('#viewport').focus();
    await page.evaluate(() => {const field = document.createElement('div'); field.id='hotkeyEditable'; field.contentEditable='true'; document.body.append(field); field.focus();});
    await page.keyboard.type('vcb'); assert.equal(await tool(),'COMB'); await page.locator('#hotkeyEditable').evaluate(e=>e.remove());
    await page.evaluate(() => {const dialog=document.createElement('dialog'); dialog.id='hotkeyDialog'; document.body.append(dialog); dialog.showModal();});
    await page.keyboard.press('v'); assert.equal(await tool(),'COMB'); await page.locator('#hotkeyDialog').evaluate(e=>{e.close();e.remove();});
    report.checks.push('text/contenteditable/composition/repeat/modifier combinations and open dialogs cannot switch tools');
    await page.locator('#viewport').focus(); await page.keyboard.press('v'); await page.keyboard.press('g');
    await page.waitForFunction(() => window.__branchForge.keyboardTransformActive);
    for (const key of ['b','c','v']) await page.keyboard.press(key);
    assert.equal(await tool(),'SELECT'); assert.equal(await page.evaluate(()=>window.__branchForge.keyboardTransformActive),true);
    await page.keyboard.press('Escape'); assert.deepEqual(await state(),baseline);
    await page.evaluate(() => {const f=window.__branchForge; f.camera.position.set(1,-9,1.5);f.camera.up.set(0,0,1);f.controls.target.set(1,0,1.5);f.controls.update();});
    await page.keyboard.press('b');
    const point = await page.evaluate(() => {const f=window.__branchForge, b=f.asset.masterBranches.find(b=>b.stableId==='A'),r=document.querySelector('#viewport').getBoundingClientRect(),p=b.points[2].clone().applyMatrix4(f.asset.group.matrixWorld).project(f.camera); return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];});
    await page.mouse.move(...point); await page.mouse.down(); await page.mouse.move(point[0]+25,point[1]-25,{steps:6});
    assert.ok(await page.evaluate(()=>window.__branchForge.sculptState));
    for (const key of ['c','v']) {await page.keyboard.press(key);assert.equal(await tool(),'GRAB');}
    await page.keyboard.press('Escape'); await page.mouse.up(); assert.deepEqual(await state(),baseline);
    await page.keyboard.press('c'); assert.equal(await tool(),'COMB');
    report.checks.push('active G gesture and live sculpt drag are not cancelled by tool keys; Escape restores the original project, then switching resumes');
    await page.reload(); await page.waitForFunction(()=>window.__branchForge?.asset); await load();
    for (const [key,expected] of [['b','GRAB'],['c','COMB'],['v','SELECT']]) {await page.keyboard.press(key); assert.equal(await tool(),expected);}
    report.checks.push('actual page restart and project reimport retain all three hotkeys');
    assert.deepEqual(report.errors,[]); report.passed=true; console.log(JSON.stringify(report));
  } finally {if(page && !report.passed) await page.screenshot({path:path.join(out,'失败现场.png')}); await browser.close();fs.writeFileSync(path.join(out,'验收.json'),JSON.stringify(report,null,2));}
})().catch(error => {console.error(error);process.exitCode=1;});
