const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// Headless, isolated project sessions. The only written projects are generated
// fixtures under .runtime; source libraries and the user's active app are untouched.
(async () => {
  const out = path.resolve('.runtime/unit-instance-selection');
  fs.mkdirSync(out, { recursive: true });
  const report = { checks: [], errors: [] };
  const folder = path.resolve('次枝资产/全植物次枝成品V1/红叶石楠');
  const name = fs.readdirSync(folder).find(n => n.includes('短弯细梢') && n.includes('混合') && n.endsWith('.branchasset.json'));
  assert(name, 'real complete Photinia unit with leaves and flowers exists');
  const raw = JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8').replace(/^\uFEFF/, ''));
  const item = raw.asset || raw;
  const wood = (id, parent, points) => ({ id, parent, points, attach: .5, length: 4, start_radius: .08, end_radius: .025 });
  const fixture = {
    format: 'ProceduralBranchProject', version: 4,
    settings: { ...item.sample.settings, object_name: '树上单元枝点选验收', wind_strength: 0, leaf_density: 0, max_triangles: 8000000, preview_lod: 0 },
    leaf_meshes: item.sample.leaf_meshes,
    authoring: {
      branch_shape: { branches: [wood('ROOT', '', [[0, 0, 0], [0, 0, 2], [0, 0, 4]])] },
      branch_library: [item],
      branch_instances: [
        { id: 'ONE', parent: 'ROOT', attach: .75, asset_id: item.id, linked: true, angle: 75, azimuth: 0, scale: 1 },
        { id: 'TWO', parent: 'ROOT', attach: .25, asset_id: item.id, linked: true, angle: 75, azimuth: 180, scale: 1 }
      ],
      recipe: { tags: ['SAMPLE_FOLIAGE_FROM_LIBRARY', 'FOLIAGE_ON_INSTANCES_ONLY'] },
      tree_organs: item.sample.authoring.tree_organs
    }
  };
  const fixturePath = path.join(out, 'fixture.branch.json');
  fs.writeFileSync(fixturePath, JSON.stringify(fixture));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => report.errors.push(error.stack));
    await page.route('**/api/project-session**', route => route.fulfill({ json: { success: true, items: [] } }));
    await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'), () => page.evaluate(() => document.getElementById('projectSessionPanel').close()));
    const ready = () => page.waitForFunction(() => {
      const f = window.__branchForge;
      return f?.asset && !document.getElementById('brandStartup') && !f.asset.group.userData.pending_rebuild
        && f.asset.authoring === f.authoring && !f.workbench.busy && document.getElementById('busyOverlay').hidden
        && !document.getElementById('projectLoadDialog').open;
    });
    const owners = () => page.evaluate(() => window.__branchForge.workbench.instances.selectionOwners().map(i => i.id));
    const instances = () => page.evaluate(() => structuredClone(window.__branchForge.authoring.branch_instances));
    const load = async file => {
      const previous = await page.evaluate(() => window.__branchForge.asset.group.uuid);
      await page.locator('#projectInput').setInputFiles(file);
      await page.waitForFunction(uuid => window.__branchForge?.asset?.group.uuid !== uuid, previous);
      await ready();
    };
    await page.goto(process.argv[2] || 'http://localhost:19837');
    await ready();
    await load(fixturePath);
    await page.waitForFunction(() => window.__branchForge.asset.settings.object_name === '树上单元枝点选验收');
    assert.equal(await page.evaluate(() => window.__branchForge.asset.isInstancedAssembly), true);
    await page.evaluate(() => {
      const f = window.__branchForge;
      f.camera.position.set(0, -8, 2); f.camera.up.set(0, 0, 1);
      f.controls.target.set(0, 0, 2); f.controls.enableDamping = false; f.controls.update();
    });
    // Find frontmost real triangles independently of the production hitOwner.
    // Ray hits use compiled proxy meshes, so no materialization is needed here.
    const target = (id, category) => page.evaluate(async ({ id, category }) => {
      const T = await import('/vendor/three.module.min.js'), f = window.__branchForge;
      const rect = document.getElementById('viewport').getBoundingClientRect(), meshes = [], descriptors = new Map(), candidates = [];
      f.asset.group.updateWorldMatrix(true, true); f.camera.updateMatrixWorld();
      f.asset.group.traverse(mesh => {
        if (!mesh.isMesh) return;
        for (let parent = mesh; parent; parent = parent.parent) if (!parent.visible) return;
        meshes.push(mesh);
        for (const descriptor of f.asset.editPreviewBindings?.(mesh)?.instances || []) {
          const proxy = descriptor.object(); descriptors.set(proxy, descriptor);
          if (descriptor.id === id && proxy.userData.category === category) candidates.push(proxy);
        }
      });
      for (const mesh of candidates) {
        const g = mesh.geometry, index = g.index, positions = g.getAttribute('position');
        const count = index?.count || positions.count;
        for (let n = 0; n + 2 < count; n += 3) {
          const p = new T.Vector3();
          for (let k = 0; k < 3; k++) p.add(new T.Vector3().fromBufferAttribute(positions, index ? index.getX(n + k) : n + k));
          p.multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld).project(f.camera);
          if (p.x <= -.94 || p.x >= .94 || p.y <= -.88 || p.y >= .88) continue;
          const x = rect.left + (p.x + 1) * rect.width / 2, y = rect.top + (1 - p.y) * rect.height / 2;
          if (document.elementFromPoint(x, y) !== document.getElementById('viewport')) continue;
          const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(p.x, p.y), f.camera);
          const hit = ray.intersectObjects(meshes, false).find(h => descriptors.has(h.object));
          if (descriptors.get(hit?.object)?.id === id && hit.object.userData.category === category) return { x, y };
        }
      }
      throw Error(`No frontmost ${category} triangle for ${id}`);
    }, { id, category });
    const clickUnit = async (id, category = 'leaf') => {
      const p = await target(id, category); await page.mouse.click(p.x, p.y);
      await page.waitForFunction(expected => window.__branchForge.workbench.instances.selectionOwners().map(i => i.id).join() === expected, id);
      assert.deepEqual(await owners(), [id]);
    };
    const blank = () => page.evaluate(async () => {
      const T = await import('/vendor/three.module.min.js'), f = window.__branchForge;
      const canvas = document.getElementById('viewport'), rect = canvas.getBoundingClientRect(), meshes = [];
      f.asset.group.traverse(mesh => { if (mesh.isMesh && mesh.visible) meshes.push(mesh); });
      for (const px of [-.93, .93, -.75, .75]) for (const py of [-.65, -.25, .25, .65]) {
        const x = rect.left + (px + 1) * rect.width / 2, y = rect.top + (1 - py) * rect.height / 2;
        if (document.elementFromPoint(x, y) !== canvas) continue;
        const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(px, py), f.camera);
        if (!ray.intersectObjects(meshes, false).length) return { x, y };
      }
      throw Error('No unobstructed blank viewport point');
    });
    const clear = async () => { const p = await blank(); await page.mouse.click(p.x, p.y); assert.deepEqual(await owners(), []); };

    await page.locator('#treeAssemblySelect').click();
    await ready();
    assert.equal(await page.locator('[data-tree-selection-kind="INSTANCE"]').evaluate(e => e.classList.contains('active')), true);
    for (const category of ['branch', 'leaf', 'tree_organ']) { await clickUnit('ONE', category); await clear(); }
    assert.equal(await page.evaluate(() => window.__branchForge.asset.isInstancedAssembly), true);
    report.checks.push('right assembly Select button enables direct complete-unit picking from compiled wood, leaves and flowers without flattening GPU models');

    await page.locator('#skeletonEditModeBtn').click(); await ready();
    assert.equal(await page.evaluate(() => window.__branchForge.skeletonEditMode), true);
    await page.locator('#treeAssemblySelect').click(); await ready();
    assert.equal(await page.evaluate(() => window.__branchForge.skeletonEditMode), false);
    await clickUnit('TWO', 'branch');
    await page.locator('.view-mode[data-view="SKELETON"]').click();
    assert.equal(await page.evaluate(() => window.__branchForge.modelRoot.visible), false);
    await page.locator('#treeAssemblySelect').click(); await ready();
    assert.equal(await page.evaluate(() => window.__branchForge.modelRoot.visible), true);
    await clickUnit('ONE');
    report.checks.push('Select button exits both paused skeleton editing and skeleton-only viewport, restoring full visible unit models before picking');

    for (const button of ['instanceSlide', 'instanceRotate', 'instanceScale']) {
      await clickUnit('ONE', 'leaf'); await page.locator('#' + button).click();
      assert.equal(await page.evaluate(() => window.__branchForge.workbench.instances.active), true);
      await clickUnit('TWO', 'leaf'); await clear();
    }
    report.checks.push('active Slide/Rotate/Scale handles allow ordinary clicks on another unit and blank-space clearing');

    await clickUnit('ONE', 'branch');
    const initial = await instances();
    await page.keyboard.press('s'); await page.waitForFunction(() => window.__branchForge.keyboardTransformActive);
    await page.keyboard.type('1.2'); await page.keyboard.press('Enter'); await ready();
    assert.equal((await instances()).find(i => i.id === 'ONE').scale, 1.2);
    assert.deepEqual((await instances()).find(i => i.id === 'TWO'), initial.find(i => i.id === 'TWO'));
    const scaled = await instances();
    await page.keyboard.press('r'); await page.keyboard.type('20'); await page.keyboard.press('Enter'); await ready();
    assert.notDeepEqual((await instances()).find(i => i.id === 'ONE'), scaled.find(i => i.id === 'ONE'));
    const rotated = await instances();
    await page.keyboard.press('g'); await page.keyboard.type('.1'); await page.keyboard.press('Enter'); await ready();
    assert.notEqual((await instances()).find(i => i.id === 'ONE').attach, rotated.find(i => i.id === 'ONE').attach);
    assert.deepEqual((await instances()).find(i => i.id === 'TWO'), initial.find(i => i.id === 'TWO'));
    report.checks.push('directly selected unit responds to keyboard G/R/S as a whole, leaving the other installed unit untouched');

    await page.locator('#instanceSlide').click();
    const drag = await page.evaluate(async () => {
      const { sampleLine } = await import('/tree-sculpt.js'), f = window.__branchForge;
      const rect = document.getElementById('viewport').getBoundingClientRect();
      const instance = f.authoring.branch_instances.find(i => i.id === 'ONE');
      const parent = f.asset.masterBranches.find(b => b.stableId === instance.parent);
      const ring = f.workbench.instances.root.children.find(o => o.isMesh);
      const project = p => { const v = p.clone().project(f.camera); return { x: rect.left + (v.x + 1) * rect.width / 2, y: rect.top + (1 - v.y) * rect.height / 2 }; };
      f.workbench.instances.root.updateWorldMatrix(true, true);
      return { start: project(ring.getWorldPosition(ring.position.clone())), end: project(f.asset.group.localToWorld(sampleLine(parent.points, Math.min(.95, instance.attach + .08)))) };
    });
    const beforeDrag = await instances();
    await page.mouse.move(drag.start.x, drag.start.y); await page.mouse.down();
    await page.mouse.move(drag.end.x, drag.end.y, { steps: 12 }); await page.mouse.up(); await ready();
    assert.notEqual((await instances()).find(i => i.id === 'ONE').attach, beforeDrag.find(i => i.id === 'ONE').attach);
    assert.deepEqual((await instances()).find(i => i.id === 'TWO'), initial.find(i => i.id === 'TWO'));
    report.checks.push('click-through fix preserves real root-handle dragging and its whole-unit attachment change');

    // Load the dense formal tree read-only into this isolated browser. Reload first
    // to avoid discarding an edited fixture through a switch confirmation dialog.
    await page.reload(); await ready();
    await load(path.resolve('初始样本/全植物新次枝装配V2/香樟/工程.branch.json'));
    await page.waitForFunction(() => window.__branchForge.authoring.branch_instances.length > 500); await ready();
    await page.locator('#treeAssemblySelect').click(); await ready();
    const dense = await page.evaluate(async () => {
      const T = await import('/vendor/three.module.min.js'), f = window.__branchForge;
      const rect = document.getElementById('viewport').getBoundingClientRect(), meshes = [], descriptors = new Map();
      f.asset.group.updateWorldMatrix(true, true); f.camera.updateMatrixWorld();
      f.asset.group.traverse(mesh => {
        if (!mesh.isMesh || !mesh.visible) return;
        meshes.push(mesh);
        for (const descriptor of f.asset.editPreviewBindings?.(mesh)?.instances || []) descriptors.set(descriptor.object(), descriptor);
      });
      // The calibrated source units occupy small gaps in a large canopy. Aim
      // at an actual leaf triangle, rather than assuming a coarse screen grid
      // happens to intersect one of those tiny models.
      for(const [proxy] of descriptors){
        if(proxy.userData.category!=='leaf')continue;
        const geometry=proxy.geometry,positions=geometry.getAttribute('position'),index=geometry.index;
        if(!positions||positions.count<3)continue;
        const center=new T.Vector3();for(let k=0;k<3;k++)center.add(new T.Vector3().fromBufferAttribute(positions,index?index.getX(k):k));
        center.multiplyScalar(1/3).applyMatrix4(proxy.matrixWorld).project(f.camera);
        const px=center.x,py=center.y;
        if(px<-.94||px>.94||py<-.88||py>.88)continue;
        const x = rect.left + (px + 1) * rect.width / 2, y = rect.top + (1 - py) * rect.height / 2;
        if (document.elementFromPoint(x, y) !== document.getElementById('viewport')) continue;
        const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(px, py), f.camera);
        const hit = ray.intersectObjects(meshes, false).find(h => descriptors.has(h.object));
        if (hit) return { x, y, id: descriptors.get(hit.object).id, category: hit.object.userData.category, count: f.authoring.branch_instances.length };
      }
      throw Error('No visible dense camphor leaf triangle; descriptors='+descriptors.size+', meshes='+meshes.length+', GPU='+f.asset.isInstancedAssembly);
    });
    const started = Date.now(); await page.mouse.click(dense.x, dense.y);
    await page.waitForFunction(id => window.__branchForge.workbench.instances.selectionOwners().some(i => i.id === id), dense.id);
    report.dense = { ...dense, click_ms: Date.now() - started };
    assert.deepEqual(await owners(), [dense.id]);
    assert.equal(await page.evaluate(() => window.__branchForge.asset.isInstancedAssembly), true);
    report.checks.push('dense real camphor tree unit is selected by actual viewport click with compiled GPU assembly retained');
    await page.screenshot({ path: path.join(out, '树上单元枝点选.png') });
    assert.deepEqual(report.errors, []); report.passed = true; console.log(JSON.stringify(report));
  } catch (error) {
    report.failure = error.stack;
    if (page && !page.isClosed()) try { await page.screenshot({ path: path.join(out, '失败.png') }); } catch {}
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, '验收.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
