const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.BRANCHFORGE_PLAYWRIGHT || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const [url, out] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const report = { errors: [], failedRequests: [], checks: [] };
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(120000);
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('response', r => { if (r.url().startsWith(url) && r.status() >= 400) report.failedRequests.push([r.status(), r.url()]); });
    const settled = () => page.waitForFunction(() => window.__branchForge?.asset && !window.__branchForge.workbench.busy && document.getElementById('busyOverlay').hidden && !document.getElementById('brandStartup'));
    await page.goto(url);
    await settled();
    report.tree = await page.evaluate(() => ({ mode: window.__branchForge.workbench.mode, name: window.__branchForge.collectSettings().object_name, instances: window.__branchForge.authoring.branch_instances.length }));
    assert.equal(report.tree.mode, 'TREE');
    assert.match(report.tree.name, /香樟.*副本/);
    assert.equal(report.tree.instances, 1126);
    await page.screenshot({ path: path.join(out, '单文件释放后_香樟整树.png') });
    report.checks.push('从单EXE实际释放的资源启动：正式香樟整树副本与1126枝实例');
    await page.click('#branchWorkspaceBtn');
    await page.waitForFunction(() => window.__branchForge.workbench.mode === 'BRANCH');
    await settled();
    report.branch = await page.evaluate(() => ({ name: window.__branchForge.collectSettings().object_name, leaves: window.__branchForge.leafSources.length, textured: !!window.__branchForge.authoring.leaf_material.color }));
    assert.match(report.branch.name, /香樟_紧凑侧枝_混合_成品V1_副本/);
    assert.ok(report.branch.leaves > 0 && report.branch.textured);
    report.checks.push('默认香樟次枝真实网格与贴图在新运行目录正常加载');
    await page.click('#vineWorkspaceBtn');
    await page.waitForFunction(() => window.__branchForge.authoring.surface_growth?.mesh.name === 'QiaoDunTest.glb');
    await settled();
    report.vine = await page.evaluate(() => ({ species: window.__branchForge.authoring.vine.species, model: window.__branchForge.authoring.surface_growth.mesh.name }));
    assert.equal(report.vine.species, 'IVY');
    report.checks.push('常春藤及内置桥墩示例正常加载');
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedRequests, []);
    report.passed = true;
  } catch (error) {
    report.failure = String(error);
    throw error;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, '浏览器验收.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
