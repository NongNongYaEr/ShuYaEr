const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const out = path.resolve('.runtime/complete-instance-nested');
  fs.mkdirSync(out, { recursive: true });
  const report = { checks: [], errors: [] };
  const read = (species, style, color) => {
    const folder = path.resolve('次枝资产/全植物次枝成品V1', species);
    const name = fs.readdirSync(folder).find(n => n.includes(style) && n.includes(color) && n.endsWith('.branchasset.json'));
    return JSON.parse(fs.readFileSync(path.join(folder, name))).asset;
  };
  const outer = read('香樟', '短弯细梢', '混合'), inner = read('红叶石楠', '短弯细梢', '红嫩叶');
  const root = outer.shape.branches[0].id, nestedRoot = inner.shape.branches[0].id;
  const sources = [...new Map([...outer.sample.leaf_meshes, ...inner.sample.leaf_meshes].map(s => [s.id, s])).values()];
  const organs = [...new Map([...outer.sample.authoring.tree_organs.units, ...inner.sample.authoring.tree_organs.units].map(u => [u.id, u])).values()];
  // An old editable project may retain nested mounts and hand-added children.
  // The new TREE boundary protects these contents without discarding them.
  const document = {
    format: 'ProceduralBranchProject', version: 4,
    settings: { ...outer.sample.settings, object_name: '旧嵌套单元枝边界验收', wind_strength: 0, leaf_density: 0, max_triangles: 8000000, preview_lod: 0 },
    leaf_meshes: sources,
    authoring: {
      branch_shape: { branches: [{ id: 'ROOT', parent: '', points: [[0, 0, 0], [0, 0, 3]], length: 3, start_radius: .1, end_radius: .03 }] },
      branch_library: [outer, inner],
      branch_instances: [
        { id: 'ONE', parent: 'ROOT', asset_id: outer.id, linked: true, attach: .7, angle: 70, azimuth: 0, scale: 1.1, radius_scale: 1.3 },
        { id: 'TWO', parent: 'ROOT', asset_id: outer.id, linked: true, attach: .3, angle: 65, azimuth: 180, scale: 1 },
        { id: 'NESTED', parent: 'ONE.' + root, asset_id: inner.id, linked: true, attach: .55, angle: 45, azimuth: 30, scale: .55 }
      ],
      manual_branches: [{ id: 'HAND', parent: 'ONE.' + root, attach: .8, length: .16, radius: .002, angle: 48, azimuth: -32 }],
      recipe: { tags: ['SAMPLE_FOLIAGE_FROM_LIBRARY', 'FOLIAGE_ON_INSTANCES_ONLY'] },
      tree_organs: { ...inner.sample.authoring.tree_organs, units: organs }
    }
  };
  const file = path.join(out, 'fixture.branch.json');
  fs.writeFileSync(file, JSON.stringify(document));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  let page;
  const configure = async () => {
    page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    page.setDefaultTimeout(60000);
    page.on('pageerror', error => report.errors.push(error.stack));
    await page.route('**/api/project-session**', route => route.fulfill({ json: { success: true, items: [] } }));
    await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'), () => page.evaluate(() => window.document.getElementById('projectSessionPanel').close()));
  };
  const ready = () => page.waitForFunction(() => window.__branchForge?.asset && !window.document.getElementById('brandStartup'));
  const idle = () => page.waitForFunction(() => {
    const f = window.__branchForge;
    return f.asset && !f.asset.group.userData.pending_rebuild && f.asset.authoring === f.authoring && !f.workbench.busy
      && window.document.querySelector('#busyOverlay').hidden && !window.document.querySelector('#projectLoadDialog').open;
  });
  const load = async name => {
    await page.locator('#projectInput').setInputFiles(name);
    await page.waitForFunction(() => window.__branchForge.asset?.settings.object_name === '旧嵌套单元枝边界验收');
    await idle();
  };
  const snap = () => page.evaluate(async () => {
    const f = window.__branchForge, colors = new Set();
    f.asset.group.traverse(mesh => {
      if (!mesh.isMesh) return;
      for (const material of [mesh.material].flat()) {
        const color = material.sampleLeafMaterial?.color || (material.name === 'M_Leaf' ? f.authoring.leaf_material.color : '');
        if (color) colors.add(color);
      }
    });
    const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
      .map(n => n.toString(16).padStart(2, '0')).join('');
    const textureHashes = await Promise.all([...colors].map(digest));
    const library = await Promise.all(f.authoring.branch_library.map(async item => ({ id: item.id, revision: item.revision,
      source_hash: await digest(JSON.stringify({ shape: item.shape, sample: item.sample })) })));
    const pose = (p, source) => [p.stableId, p.branchStableId, p.position.toArray(), source, p.scale,
      p.direction?.toArray() || null, p.normal?.toArray() || null, p.twist ?? null, p.t ?? null, p.phase ?? null, p.random ?? null];
    return {
      instances: structuredClone(f.authoring.branch_instances), manual: structuredClone(f.authoring.manual_branches),
      internal_edits: structuredClone({ overrides: f.authoring.overrides, sculpt_layers: f.authoring.sculpt_layers,
        topology: f.authoring.topology, unit_editing: f.authoring.unit_editing, leaf_edits: f.authoring.leaf_edits }),
      wood: f.asset.masterBranches.map(b => [b.stableId, b.points.map(p => p.toArray()), b.startRadius, b.endRadius]),
      leaves: f.asset.masterPlacements.map(p => pose(p, f.leafSources[p.source]?.id)),
      organs: f.asset.treeOrgans.map(p => pose(p, f.authoring.tree_organs.units[p.source]?.id)),
      textures: textureHashes.sort(), library
    };
  });
  const select = id => page.locator('#branchOutliner button').filter({ has: page.locator('span', { hasText: new RegExp('^' + id.replaceAll('.', '\\.') + '$') }) }).click();
  try {
    await configure();
    await page.goto(process.argv[2] || 'http://localhost:19837');
    await ready(); await load(file);
    const before = await snap();
    assert.equal(before.instances.length, 3);
    assert.equal(before.manual.length, 1);
    assert.ok(before.wood.some(b => b[0] === 'HAND'));
    assert.ok(before.textures.length >= 2, 'both real plant atlases render in the old project');
    await page.locator('[data-tree-selection-kind="INSTANCE"]').click();
    const boundary = await page.evaluate(() => {
      const f = window.__branchForge, editor = f.workbench.instances;
      return f.asset.masterBranches.map(b => ({ id: b.stableId, canonical: editor.canonicalSelectionId(b.stableId),
        editable: editor.isEditable(b.stableId), selectable: editor.isSelectable(b.stableId) }));
    });
    for (const b of boundary.filter(b => b.id !== 'ROOT')) {
      const owner = b.id.startsWith('NESTED.') ? 'NESTED.' + nestedRoot : b.id.startsWith('TWO.') ? 'TWO.' + root : 'ONE.' + root;
      assert.equal(b.canonical, owner, b.id + ' selects its whole unit root');
      assert.equal(b.editable, false, b.id + ' cannot edit internal wood in TREE');
      assert.equal(b.selectable, b.id === owner, b.id + ' is selectable only as the unit root');
    }
    assert.ok(boundary.find(b => b.id === 'ROOT').editable, 'the supporting skeleton remains editable');
    assert.equal(await page.locator('#branchOutliner button').filter({ has: page.locator('span', { hasText: /^HAND$/ }) }).count(), 0);
    await select('ONE.' + root);
    assert.equal(await page.locator('#branchEditor').isVisible(), false);
    assert.equal(await page.locator('#branchEditor').getAttribute('inert'), '');
    assert.equal(await page.evaluate(() => window.__branchForge.workbench.unitEditor.enabled), false);
    const history = await page.evaluate(() => window.__branchForge.historyState);
    // Use a rendered leaf triangle whose ray resolves to ONE, rather than
    // selecting a runtime ID directly through a test hook.
    const hit = await page.evaluate(async () => {
      const T = await import('/vendor/three.module.min.js'), f = window.__branchForge;
      const bounds = window.document.querySelector('#viewport').getBoundingClientRect();
      const meshes = [];
      f.asset.group.updateMatrixWorld(true); f.camera.updateMatrixWorld();
      f.asset.group.traverse(mesh => { if (mesh.isMesh && mesh.visible && mesh.userData.category === 'leaf') meshes.push(mesh); });
      for (const mesh of meshes) {
        const geometry = mesh.geometry, ids = geometry.index?.array || Array.from({ length: geometry.attributes.position.count }, (_, i) => i);
        for (let n = 0; n < ids.length; n += 3) {
          const p = new T.Vector3();
          for (let k = 0; k < 3; k++) p.add(new T.Vector3().fromBufferAttribute(geometry.attributes.position, ids[n + k]));
          p.multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld).project(f.camera);
          if (Math.abs(p.x) > .97 || Math.abs(p.y) > .97 || p.z < -1 || p.z > 1) continue;
          const event = { clientX: bounds.left + (p.x + 1) * bounds.width / 2, clientY: bounds.top + (1 - p.y) * bounds.height / 2 };
          if (f.workbench.instances.hitOwner(event)?.id === 'ONE') return event;
        }
      }
      throw Error('No visible real leaf triangle resolves to the outer unit');
    });
    await page.mouse.dblclick(hit.clientX, hit.clientY);
    await idle();
    assert.equal(await page.evaluate(() => window.__branchForge.workbench.mode), 'TREE');
    assert.deepEqual(await page.evaluate(() => [...window.__branchForge.bundleState.selected]), ['ONE.' + root]);
    assert.equal(await page.evaluate(() => window.__branchForge.selectedCurvePoint.index), -1);
    assert.equal(await page.evaluate(() => window.__branchForge.workbench.unitEditor.enabled), false);
    assert.deepEqual(await page.evaluate(() => window.__branchForge.historyState), history);
    assert.deepEqual(await snap(), before);
    report.checks.push('TREE protects every installed and legacy HAND child; rendered-leaf double-click selects only the unit root without editing or entering BRANCH');

    await page.locator('#instanceEditSource').click();
    await page.waitForFunction(() => window.__branchForge.workbench.mode === 'BRANCH' && !window.__branchForge.workbench.busy);
    await idle();
    const draft = await snap();
    const draftState = await page.evaluate(() => ({ shape: structuredClone(window.__branchForge.authoring.branch_shape),
      metadata: structuredClone(window.__branchForge.authoring.workbench), mode: window.__branchForge.workbench.mode }));
    assert.equal(draftState.metadata.asset_id, outer.id);
    assert.ok(!draftState.metadata.source?.instance_id, 'source edit has no private instance apply-back link');
    assert.equal(draft.instances.length, 0, 'source model excludes NESTED and TREE mounts');
    assert.equal(draft.manual.length, 0, 'source model excludes the old HAND branch');
    assert.deepEqual(draft.wood.map(b => b[0]), outer.shape.branches.map(b => b.id));
    for (const source of outer.shape.branches) {
      const actual = draftState.shape.branches.find(b => b.id === source.id);
      assert.ok(actual, 'all source wood retained');
      assert.deepEqual(actual.points, source.points, 'instance world transform never baked into source');
      assert.equal(actual.start_radius, source.start_radius, 'instance radius_scale never baked into source');
      assert.equal(actual.end_radius, source.end_radius);
    }
    assert.ok(draft.leaves.length > 0, 'real source leaves remain in the workbench');
    assert.ok(draft.leaves.every(p => !p[1].includes('ONE.') && !p[1].includes('NESTED.') && p[1] !== 'HAND'));
    assert.equal(draft.textures.length, 1, 'source editor displays only the camphor unit atlas');
    assert.equal(await page.locator('#applyBranchBack').isVisible(), false, 'no one-instance absorption or apply-back action');
    report.checks.push('explicit source-edit button opens only the original camphor unit at source scale/radius, without nested photinia, HAND, or private apply-back');

    await page.locator('#treeWorkspaceBtn').click();
    await page.waitForFunction(() => window.__branchForge.workbench.mode === 'TREE' && !window.__branchForge.workbench.busy);
    await idle();
    const back = await snap();
    assert.deepEqual(back, before, 'returning from source editing preserves every old tree record, pose and atlas');
    fs.writeFileSync(path.join(out, 'poses.json'), JSON.stringify({ before, draft, back, boundary }));
    report.checks.push('return to TREE does not absorb nested/HAND content, change any of the three mounts, rewrite materials, or alter source geometry');
    const saved = path.join(out, 'saved.branch.json');
    const savedDoc = await page.evaluate(async () => {
      const f = window.__branchForge, { createProjectDocument } = await import('/branch-kernel.js');
      return { ...createProjectDocument(f.asset, f.leafSources, f.authoring), workspaces: f.workbench.serialize({ omitActive: true }) };
    });
    fs.writeFileSync(saved, JSON.stringify(savedDoc));
    report.saved_bytes = fs.statSync(saved).size; report.fixture_bytes = fs.statSync(file).size;
    assert.ok(report.saved_bytes < report.fixture_bytes * 5, 'parked source workbench must not duplicate full atlases per placement');
    await page.close(); await configure();
    await page.goto(process.argv[2] || 'http://localhost:19837'); await ready(); await load(saved);
    assert.deepEqual(await snap(), before, 'an independent new page loading the actual saved file retains old nested content exactly');
    assert.equal(await page.evaluate(() => window.__branchForge.workbench.mode), 'TREE');
    report.checks.push('actual saved file in an independent new page preserves all three instances, legacy HAND, exact wood/leaf/flower poses and both atlases');
    await page.screenshot({ path: path.join(out, '旧嵌套单元枝边界.png') });
    assert.deepEqual(report.errors, []); report.passed = true;
    console.log(JSON.stringify(report));
  } catch (error) {
    report.failure = error.stack;
    if (page && !page.isClosed()) try { await page.screenshot({ path: path.join(out, '失败.png') }); } catch {}
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, '验收.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
