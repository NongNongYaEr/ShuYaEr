const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.BRANCHFORGE_PLAYWRIGHT || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const [app, origin, output] = process.argv.slice(2);
  if (!app || !origin || !output) throw Error('app origin output required');
  fs.mkdirSync(output, { recursive: true });
  const report = { checks: [], pageErrors: [], failedLocalRequests: [] };
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.setDefaultTimeout(180000);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400) report.failedLocalRequests.push([response.status(), response.url()]); });
    await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'), () => page.evaluate(() => document.getElementById('projectSessionPanel').close()));
    const settled = () => page.waitForFunction(() => {
      const f = window.__branchForge;
      return f?.asset && !f.workbench.busy && document.getElementById('busyOverlay').hidden && !document.getElementById('brandStartup');
    });
    const get = async route => { const response = await page.request.get(origin + route); assert.equal(response.status(), 200, route); return response.json(); };
    const state = () => page.evaluate(() => {
      const f = window.__branchForge;
      return { mode: f.workbench.mode, name: f.collectSettings().object_name, instances: f.authoring.branch_instances.length,
        classes: f.authoring.branch_library.length, branches: f.asset.masterBranches?.length, triangles: f.asset.report.triangles };
    });
    const projects = await get('/api/project-library'), branches = await get('/api/branch-assets'), units = await get('/api/plant-units');
    assert.equal(projects.items.length, 28); assert.equal(branches.items.length, 164); assert.equal(units.items.length, 28);
    assert.ok(projects.items.every(item => !item.userSaved && item.batch === 'ALL_PLANT_SAMPLE_V2'));
    for (const project of projects.items) {
      const response = await page.request.get(origin + '/api/project-preview?id=' + project.id);
      assert.equal(response.status(), 200); assert.ok((await response.body()).length > 1000);
    }
    report.checks.push('164 complete-unit branches, 28 formal tree templates, 28 calibrated packs and all 28 previews load');
    for (const kind of ['detail', 'combination', 'bark']) {
      const result = await get('/api/trunk-presets?kind=' + kind); assert.equal(result.success, true);
    }
    report.checks.push('New detail/combination/bark preset services and validation CLI operate in the release directory');
    await page.goto(origin); await settled();
    assert.match(await page.locator('.brand-copy small').textContent(), /V0\.1\.1/);
    report.tree = await state(); assert.equal(report.tree.mode, 'TREE'); assert.match(report.tree.name, /香樟.*副本/);
    assert.equal(report.tree.instances, 1126); assert.equal(report.tree.classes, 6); assert.ok(report.tree.triangles > 10000);
    await page.screenshot({ path: path.join(output, '01_默认香樟完整软件.png') });
    report.checks.push('Actual startup builds the camphor sample with six complete-unit sources and 1126 instances');
    await page.click('#trunkFormSelectRoot'); await page.click('#trunkFormMode');
    await page.locator('#trunkFormPanel [data-trunk-part="DETAIL"]').click();
    assert.ok(await page.locator('#trunkFormPanel [data-detail-library="combination"]').isVisible());
    await page.click('#barkMaterialOpen'); await page.waitForSelector('#barkMaterialPanel[open]');
    assert.ok(await page.locator('.bark-material-card').count() >= 6);
    await page.locator('[data-bark-close]').click();
    report.checks.push('Current viewport detail workflow and six built-in bark material cards are accessible');
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()));
    await page.click('#saveProjectBtn'); await page.waitForSelector('#projectSaveDialog[open]');
    await page.locator('input[name="saveMode"][value="NEW"]').check(); await page.fill('#psName', 'V011_验收_香樟'); await page.click('#psSubmit');
    await page.waitForFunction(() => document.getElementById('psStatus').textContent.includes('已保存'));
    const saved = (await get('/api/project-library')).items.find(item => item.userSaved && item.name === 'V011_验收_香樟');
    assert.ok(saved); report.savedFile = path.join(app, saved.path);
    const document = JSON.parse(fs.readFileSync(report.savedFile, 'utf8'));
    assert.equal(document.format, 'ProceduralBranchProject'); assert.equal(document.version, 4);
    await page.reload(); await settled();
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()));
    await page.locator('#projectInput').setInputFiles(report.savedFile);
    if (await page.locator('#projectSwitchConfirm[open]').isVisible()) await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();
    await page.waitForFunction(() => window.__branchForge.collectSettings().object_name === 'V011_验收_香樟'); await settled();
    report.reloaded = await state(); assert.deepEqual(report.reloaded, { ...report.tree, name: 'V011_验收_香樟' });
    report.checks.push('Real save panel writes a version-4 project; a fresh page reload reopens it with identical tree/instance/mesh counts');
    await page.screenshot({ path: path.join(output, '02_香樟实际保存重开.png') });
    await page.click('#branchWorkspaceBtn'); await page.waitForFunction(() => window.__branchForge.workbench.mode === 'BRANCH'); await settled();
    report.branch = await page.evaluate(() => { const f = window.__branchForge; return { name: f.collectSettings().object_name, leafSources: f.leafSources.length, textured: !!f.authoring.leaf_material.color }; });
    assert.match(report.branch.name, /香樟_紧凑侧枝_混合_成品V1_副本/); assert.ok(report.branch.leafSources > 0 && report.branch.textured);
    report.checks.push('Branch workbench loads the camphor complete-unit sample with actual mesh and textures');
    await page.click('#vineWorkspaceBtn'); await page.waitForFunction(() => window.__branchForge.authoring.surface_growth?.mesh.name === 'QiaoDunTest.glb'); await settled();
    report.vine = await page.evaluate(() => ({ species: window.__branchForge.authoring.vine.species, model: window.__branchForge.authoring.surface_growth.mesh.name }));
    assert.equal(report.vine.species, 'IVY'); report.checks.push('Ivy workbench loads the bundled bridge-pier GLB');
    await page.screenshot({ path: path.join(output, '03_藤蔓示例.png') });
    assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.failedLocalRequests, []); report.passed = true;
  } catch (error) { report.failure = String(error); await page?.screenshot({ path: path.join(output, '失败现场.png'), timeout: 10000 }).catch(() => {}); throw error; }
  finally { await browser.close(); fs.writeFileSync(path.join(output, '软件验收.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
