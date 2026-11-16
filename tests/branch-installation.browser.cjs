const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// Actual library sample, actual install controls and native browser pointer events.
// All generated fixtures and screenshots stay separate from the material baseline.
(async () => {
  const out = path.resolve('.runtime/branch-installation');
  fs.mkdirSync(out, { recursive: true });
  const report = { checks: [], errors: [], failures: [] };
  const libraryDir = 'assets/branch-asset-library';
  const metadata = fs.readdirSync(libraryDir).filter(n => n.endsWith('.meta.json')).map(file => ({ file, ...JSON.parse(fs.readFileSync(path.join(libraryDir, file), 'utf8').replace(/^\uFEFF/, '')) }));
  const meta = metadata.find(m => m.name.includes('红叶石楠') && m.name.includes('短弯') && m.name.includes('混合') && m.organCount > 0);
  assert(meta, 'real mixed Photinia sample exists');
  const raw = JSON.parse(fs.readFileSync(path.join(libraryDir, meta.file.replace('.meta.json', '.branchasset.json')), 'utf8'));
  const sample = raw.asset || raw;
  const wood = (id, parent, points) => ({ id, parent, points, attach: .5, length: 3, start_radius: .11, end_radius: .035 });
  const fixture = {
    format: 'ProceduralBranchProject', version: 4,
    settings: { object_name: '完整枝安装预览验收', seed: 42, leaf_density: 0, child_count: 0, branch_levels: 4, wind_strength: 0, preview_lod: 0 },
    authoring: {
      branch_shape: { branches: [wood('ROOT', '', [[0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 3]]), wood('SIDE', 'ROOT', [[0, 0, 1.5], [1, 0, 1.7], [2, 0, 1.8]])] },
      branch_library: [sample], recipe: { tags: ['SAMPLE_FOLIAGE_FROM_LIBRARY'] },
      workbench: { assembly_scale: { overall: 1.4, cards: { [sample.id]: 1.25 }, records: {} } }
    }
  };
  const fixturePath = path.join(out, 'fixture.branch.json');
  fs.writeFileSync(fixturePath, JSON.stringify(fixture));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  let page;
  const check = (condition, message) => { if (!condition) report.failures.push(message); };
  try {
    page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    page.setDefaultTimeout(90000);
    page.on('pageerror', e => report.errors.push(e.stack));
    await page.route('**/api/project-session**', route => route.fulfill({ json: { success: true, items: [] } }));
    await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'), () => page.evaluate(() => document.getElementById('projectSessionPanel').close()));
    const ready = () => page.waitForFunction(() => {
      const f = window.__branchForge;
      return f?.asset && !document.getElementById('brandStartup') && !f.asset.group.userData.pending_rebuild && f.asset.authoring === f.authoring && !f.workbench.busy && document.querySelector('#busyOverlay').hidden;
    });
    const state = () => page.evaluate(() => {
      const f = window.__branchForge, geometries = [];
      f.asset.group.traverse(o => { if (o.isMesh) geometries.push(o.geometry.uuid); });
      return { authoring: JSON.parse(JSON.stringify(f.authoring)), history: f.historyState, main: f.asset.group.uuid, geometries, sourceIds: f.leafSources.map(s => s.id), branches: f.asset.masterBranches.map(b => ({ id: b.stableId, parent: b.parentStableId, points: b.points.map(p => p.toArray()) })) };
    });
    await page.goto(process.argv[2] || 'http://localhost:19837');
    await ready();
    await page.locator('#projectInput').setInputFiles(fixturePath);
    await page.waitForFunction(() => window.__branchForge.asset?.settings.object_name === '完整枝安装预览验收');
    await ready();
    await page.locator('#openBranchAssembly').click();
    await ready();
    await page.locator(`#wbAssetLibrary [data-asset="${sample.id}"]`).click();
    await page.locator('details').filter({ has: page.locator('#wbInstallMode') }).locator('summary').click();
    await page.locator('#wbInstallMode').selectOption('COPY');
    await page.locator('#wbInstallScale').fill('.8');
    await page.locator('#wbInstallAngle').fill('65');
    await page.locator('#wbInstallAzimuth').fill('0');
    await page.locator('#wbInstallRoll').fill('12');
    await page.locator('#wbAutoMatch').uncheck();
    await page.locator('#wbInstallBlend').uncheck();
    await page.locator('#branchOutliner button').filter({ has: page.locator('span', { hasText: /^ROOT(?: · 手工)?$/ }) }).click();
    await page.evaluate(() => {
      const f = window.__branchForge;
      f.camera.position.set(1.5, -7, 1.5); f.camera.up.set(0, 0, 1);
      f.controls.target.set(1.5, 0, 1.5); f.controls.enableDamping = false; f.controls.update();
    });
    // Keep detailed snapshots in the browser, returning small fingerprints only.
    await page.evaluate(() => {
      window.__installationSnapshot = (installedId = '') => {
        const f = window.__branchForge, installation = f.workbench.installation;
        const hash = value => { const s = typeof value === 'string' ? value : JSON.stringify(value); let h = 2166136261; for (let n = 0; n < s.length; n++) h = Math.imul(h ^ s.charCodeAt(n), 16777619); return (h >>> 0).toString(16); };
        const material = m => ({ name: m.name, color: m.color?.getHexString(), roughness: m.roughness, alphaTest: m.alphaTest,
          atlas: m.sampleLeafMaterial ? hash([m.sampleLeafMaterial.color, m.sampleLeafMaterial.normal]) : null,
          map: !!m.map, normalMap: !!m.normalMap, mapReady: !!m.map?.image?.width, normalReady: !!m.normalMap?.image?.width });
        const records = [], add = (o, key) => {
          if (!o.isMesh) return;
          const p = o.geometry.getAttribute('position');
          records.push({ key, uuid: o.geometry.uuid, position: hash(Array.from(p.array)), count: p.count, indexCount: o.geometry.index?.count || 0, material: (Array.isArray(o.material) ? o.material : [o.material]).map(material) });
        };
        if (!installedId) installation.root.children[0]?.traverse(o => add(o, [o.userData.category, o.userData.stable_id || '', o.name].join('|')));
        else f.asset.group.traverse(o => {
          const binding = o.isMesh && f.asset.editPreviewBindings?.(o);
          if (binding?.instances) {
            for (const entry of binding.instances) if (entry.id === installedId) { const proxy = entry.object(); add(proxy, [proxy.userData.category, (proxy.userData.stable_id || '').replace(installedId + '.', ''), o.name.replace(/^复用_/, '')].join('|')); }
          } else if (o.userData?.stable_id?.startsWith(installedId + '.')) add(o, [o.userData.category, o.userData.stable_id.slice(installedId.length + 1), o.name].join('|'));
        });
        records.sort((a, b) => a.key.localeCompare(b.key));
        return { group: installation.root.children[0]?.uuid || null, matrix: installation.root.children[0]?.matrix.toArray() || null, records };
      };
      window.__installationPoint = (id, t) => {
        const f = window.__branchForge, b = f.asset.masterBranches.find(b => b.stableId === id);
        const v = t * (b.points.length - 1), n = Math.min(b.points.length - 2, Math.floor(v));
        const p = b.points[n].clone().lerp(b.points[n + 1], v - n);
        f.asset.group.localToWorld(p); p.project(f.camera);
        const r = f.renderer.domElement.getBoundingClientRect();
        return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
      };
      window.__installationMother = () => {
        const unique = new Map();
        window.__branchForge.asset.group.traverse(o => {
          if (!o.isMesh) return;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) unique.set(m.uuid, m);
        });
        return [...unique.values()].map(m => ({ uuid: m.uuid, name: m.name, opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite,
          maps: ['map', 'normalMap'].map(slot => ({ slot, uuid: m[slot]?.uuid || null, width: m[slot]?.image?.width || 0, height: m[slot]?.image?.height || 0 })) })).sort((a, b) => a.uuid.localeCompare(b.uuid));
      };
      window.__installationWatch = () => {
        window.__installationUnwatch?.();
        const textures = new Set();
        window.__branchForge.asset.group.traverse(o => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const slot of ['map', 'normalMap']) if (m[slot]) textures.add(m[slot]); });
        window.__installationDisposed = 0;
        const onDispose = () => { window.__installationDisposed++; };
        for (const t of textures) t.addEventListener('dispose', onDispose);
        window.__installationUnwatch = () => { for (const t of textures) t.removeEventListener('dispose', onDispose); };
      };
    });
    const preview = () => page.evaluate(() => window.__installationSnapshot());
    const waitGhost = () => page.waitForFunction(() => window.__branchForge.workbench.installation.root.children.length === 1);
    const begin = async () => { await page.locator('#wbPreviewInstall').click(); await waitGhost(); };
    const waitPreviewTextures = async () => {
      try {
        await page.waitForFunction(() => window.__installationSnapshot().records.filter(r => r.key.startsWith('leaf|') || r.key.startsWith('tree_organ|')).every(r => r.material.every(m => m.mapReady)), null, { timeout: 5000 });
      } catch { check(false, 'real leaf and organ textures are bound in the installation preview'); }
    };
    const placementUI = async label => {
      assert(await page.locator('#branchPlacementBar').isVisible());
      assert(await page.locator('.quick-shaping-tools').isHidden(), 'preview hides the overlapping quick tool dock');
      const visible = await page.locator('#placementTarget').evaluate(span => {
        const r = span.getBoundingClientRect(), hit = document.elementFromPoint(Math.min(r.right - 2, r.left + 12), r.top + r.height / 2);
        return { text: span.textContent, width: r.width, unobscured: hit === span || span.contains(hit) };
      });
      assert(visible.width > 30 && visible.unobscured, label + ' target label can be read without overlay');
      assert(await page.locator('#placementConfirm').isVisible() && await page.locator('#placementCancel').isVisible());
    };
    const baseline = await state();
    const mother = await page.evaluate(() => { window.__installationWatch(); return window.__installationMother(); });
    await begin();
    await waitPreviewTextures();
    await placementUI('single view');
    let initialPreview = await preview();
    assert(initialPreview.records.length > 0);
    check(initialPreview.records.some(m => m.key.startsWith('leaf|')), 'preview has real sample leaf meshes');
    check(initialPreview.records.some(m => m.key.startsWith('tree_organ|')), 'preview has real sample flower meshes');
    report.previewInitially = initialPreview;
    for (const t of [.24, .4, .58, .76]) {
      const old = await preview(), point = await page.evaluate(t => window.__installationPoint('ROOT', t), t);
      await page.mouse.move(point.x, point.y, { steps: 5 });
      await page.waitForFunction(previous => {
        const g = window.__branchForge.workbench.installation.root.children[0];
        return g && JSON.stringify(g.matrix.toArray()) !== JSON.stringify(previous);
      }, old.matrix);
      const now = await preview(), current = await state();
      assert.equal(now.group, initialPreview.group, 'pointer moves reuse cached ghost');
      assert.deepEqual(now.records.map(m => m.uuid), initialPreview.records.map(m => m.uuid), 'pointer moves reuse geometry UUIDs');
      assert.equal(current.main, baseline.main, 'pointer moves do not rebuild the whole model');
      assert.deepEqual(current.geometries, baseline.geometries);
      assert.deepEqual(current.authoring, baseline.authoring);
      assert.deepEqual(current.history, baseline.history);
      assert.deepEqual(await page.evaluate(() => window.__installationMother()), mother, 'ghost materials never mutate mother opacity or texture bindings');
    }
    await page.screenshot({ path: path.join(out, '安装预览.png') });
    await page.locator('#placementCancel').click();
    await page.waitForFunction(() => !window.__branchForge.workbench.installation.active);
    const cancelled = await state();
    assert.deepEqual(cancelled.authoring, baseline.authoring); assert.deepEqual(cancelled.history, baseline.history);
    assert.equal((await preview()).group, null);
    assert.deepEqual(await page.evaluate(() => window.__installationMother()), mother);
    assert.equal(await page.evaluate(() => window.__installationDisposed), 0, 'cancelling preview does not dispose shared mother textures');
    await page.evaluate(() => window.__installationUnwatch());
    assert(await page.locator('.quick-shaping-tools').isVisible(), 'cancel restores the quick tool dock');
    report.checks.push('真实预览按钮与鼠标挂接 ROOT；连续移动只更新矩阵，ghost 与几何 UUID、主模型和文档不变；取消不写撤销');
    await page.locator('#toggleBranchMultiview').click();
    await page.waitForFunction(() => window.__branchForge.workbench.views.enabled);
    await begin(); await waitPreviewTextures(); await placementUI('four views');
    await page.screenshot({ path: path.join(out, '四视图安装预览.png') });
    await page.locator('#placementCancel').click();
    assert(await page.locator('.quick-shaping-tools').isVisible());
    await page.locator('#toggleBranchMultiview').click();
    await page.waitForFunction(() => !window.__branchForge.workbench.views.enabled);
    assert.deepEqual((await state()).history, baseline.history);
    report.checks.push('普通视口与四视图预览目标文字、确认取消按钮无遮挡；取消恢复快捷工具，视图切换不改历史');
    await begin();
    await waitPreviewTextures();
    const finalPreview = await preview();
    const target = await page.evaluate(() => { const p = window.__branchForge.workbench.installation.pending; return { parent: p.parent, attach: p.attach }; });
    await page.locator('#placementConfirm').click();
    await page.waitForFunction(() => window.__branchForge.authoring.branch_instances.length === 1);
    await ready();
    const installed = await state(), instance = installed.authoring.branch_instances[0];
    assert.equal(instance.parent, target.parent); assert.equal(instance.attach, target.attach);
    assert.equal(instance.assembly_manual, true); assert.equal(instance.pinned_revision, sample.revision); assert.equal(instance.linked, true);
    assert(Math.abs(instance.scale - .8 * 1.4 * 1.25) < 1e-10, 'overall and card scale apply once');
    assert.equal(installed.history.undo, baseline.history.undo + 1, 'installation and hydration are one undo');
    assert.deepEqual(instance.shape, sample.shape);
    assert.deepEqual(sample.leaf_source_ids.filter(id => !installed.sourceIds.includes(id)), []);
    assert.deepEqual(sample.organ_source_ids.filter(id => !installed.authoring.tree_organs.units.some(u => u.id === id)), []);
    const content = await page.evaluate(async id => {
      const f = window.__branchForge, i = f.authoring.branch_instances.find(i => i.id === id);
      const { completeInstanceMatrix } = await import('/branch-instance-matrix.js');
      const { branchInstanceFrame } = await import('/branch-kernel.js');
      return { matrix: completeInstanceMatrix(i, i.shape, f.asset.masterBranches.find(b => b.stableId === i.parent), f.asset.settings, branchInstanceFrame).toArray(),
        branches: f.asset.masterBranches.filter(b => b.instanceId === id).length,
        leaves: f.asset.placements.filter(p => p.stableId?.startsWith(id + '.')).map(p => ({ id: p.stableId, source: f.leafSources[p.source]?.id, scale: p.scale })),
        organs: f.asset.treeOrgans.filter(p => p.sourceInstanceId === id).map(p => ({ id: p.stableId, source: f.authoring.tree_organs.units[p.source]?.id, scale: p.scale, asset: p.sourceAssetId })) };
    }, instance.id);
    assert.deepEqual(content.matrix, finalPreview.matrix, 'preview and final installation mount matrix are identical');
    assert(content.branches === sample.shape.branches.length && content.leaves.length > 0 && content.organs.length > 0);
    assert(content.leaves.every(p => sample.leaf_source_ids.includes(p.source)));
    assert(content.organs.every(p => sample.organ_source_ids.includes(p.source) && p.asset === sample.id));
    await page.waitForFunction(id => window.__installationSnapshot(id).records.filter(r => r.key.startsWith('leaf|')).every(r => r.material.every(m => m.mapReady)), instance.id);
    const finalMeshes = await page.evaluate(id => window.__installationSnapshot(id), instance.id);
    report.previewBeforeCommit = finalPreview; report.installed = { instance: { id: instance.id, asset: instance.asset_id, manual: instance.assembly_manual, pinned: instance.pinned_revision, scale: instance.scale }, content, meshes: finalMeshes };
    const canonical = r => ({ key: r.key, position: r.position, count: r.count, indexCount: r.indexCount });
    check(JSON.stringify(finalPreview.records.map(canonical)) === JSON.stringify(finalMeshes.records.map(canonical)), 'preview and installed sample geometry are identical');
    for (const p of finalPreview.records) {
      const actual = finalMeshes.records.find(r => r.key === p.key);
      check(!!actual, `installed counterpart exists for ${p.key}`);
      if (actual) check(JSON.stringify(p.material) === JSON.stringify(actual.material), `preview material differs from actual sample material: ${p.key}`);
    }
    await page.screenshot({ path: path.join(out, '确认安装.png') });
    report.checks.push('确认一支完整混合红叶石楠：整体 × 卡片倍率、手工与冻结版本标记、真实叶花来源和尺寸、挂接矩阵、一次撤销');
    await page.locator('#undoBtn').click(); await ready();
    const undone = await state();
    assert.deepEqual(undone.authoring.branch_instances, baseline.authoring.branch_instances);
    assert.deepEqual(undone.branches, baseline.branches);
    await page.locator('#redoBtn').click(); await ready();
    assert.deepEqual((await state()).authoring.branch_instances, installed.authoring.branch_instances);
    report.checks.push('Ctrl+Z 对应撤销按钮一次恢复安装前木质内容，重做恢复完整实例');

    // A compiled sample branch is a legitimate parent for another complete sample.
    await page.locator('details').filter({ has: page.locator('#wbInstallMode') }).evaluate(d => { d.open = true; });
    await page.locator('#branchOutliner button').filter({ has: page.locator('span', { hasText: /^ROOT(?: · 手工)?$/ }) }).click();
    const texturedMother = await page.evaluate(() => { window.__installationWatch(); return window.__installationMother(); });
    await begin(); await waitPreviewTextures();
    assert.deepEqual(await page.evaluate(() => window.__installationMother()), texturedMother);
    await page.locator('#placementCancel').click();
    assert.deepEqual(await page.evaluate(() => window.__installationMother()), texturedMother);
    assert.equal(await page.evaluate(() => window.__installationDisposed), 0, 'cancelling a second preview preserves the installed sample shared atlas');
    await page.evaluate(() => window.__installationUnwatch());
    report.checks.push('母树材质 opacity/透明/深度与贴图 UUID 不受预览影响；取消两次不 dispose 树皮与已安装花叶图集');
    await begin();
    const candidates = await page.evaluate(id => {
      const f = window.__branchForge;
      return f.asset.masterBranches.filter(b => b.instanceId === id).flatMap(b => [.25, .5, .75].map(t => ({ id: b.stableId, t, ...window.__installationPoint(b.stableId, t) }))).filter(p => {
        const r = f.renderer.domElement.getBoundingClientRect(); return p.x > r.left + 10 && p.x < r.right - 10 && p.y > r.top + 10 && p.y < r.bottom - 10;
      });
    }, instance.id);
    let nestedTarget;
    for (const candidate of candidates) {
      await page.mouse.move(candidate.x, candidate.y);
      const pending = await page.evaluate(() => { const p = window.__branchForge.workbench.installation.pending; return { parent: p.parent, attach: p.attach }; });
      if (pending.parent.startsWith(instance.id + '.')) { nestedTarget = pending; break; }
    }
    check(!!nestedTarget, 'native pointer raycast can target a compiled sample branch');
    if (nestedTarget) {
      await page.waitForFunction(parent => document.getElementById('placementTarget').textContent.includes(parent), nestedTarget.parent);
      const nestedPreview = await preview(), nestedHistory = (await state()).history;
      await page.locator('#placementConfirm').click();
      await page.waitForFunction(() => window.__branchForge.authoring.branch_instances.length === 2); await ready();
      const nested = await state(), second = nested.authoring.branch_instances.find(i => i.id !== instance.id);
      assert.equal(second.parent, nestedTarget.parent); assert.equal(second.assembly_manual, true); assert.equal(second.pinned_revision, sample.revision);
      assert.equal(nested.history.undo, nestedHistory.undo + 1);
      assert(await page.evaluate(id => window.__branchForge.asset.masterBranches.some(b => b.instanceId === id), second.id));
      const nestedMatrix = await page.evaluate(async id => {
        const f = window.__branchForge, i = f.authoring.branch_instances.find(i => i.id === id);
        const { completeInstanceMatrix } = await import('/branch-instance-matrix.js');
        const { branchInstanceFrame } = await import('/branch-kernel.js');
        return completeInstanceMatrix(i, i.shape, f.asset.masterBranches.find(b => b.stableId === i.parent), f.asset.settings, branchInstanceFrame).toArray();
      }, second.id);
      assert.deepEqual(nestedMatrix, nestedPreview.matrix, 'nested preview and installed parent transform agree');
      assert.deepEqual(nested.authoring.branch_instances.find(i => i.id === instance.id), instance, 'installing nested content preserves its complete parent instance');
      report.nested = { parent: second.parent, attach: second.attach, preview: nestedPreview.matrix, matrix: nestedMatrix, id: second.id };
      await page.locator('#undoBtn').click(); await ready();
      assert.deepEqual((await state()).authoring.branch_instances, installed.authoring.branch_instances);
      report.checks.push('实际鼠标命中 compiled 成品枝内部木质枝，再安装完整次枝；手工/版本标记及一次撤销保持');
    } else await page.locator('#placementCancel').click();
    check(report.errors.length === 0, 'no browser page errors');
    assert.deepEqual(report.failures, [], 'installation preview acceptance');
    report.passed = true;
    console.log(JSON.stringify({ passed: true, checks: report.checks, sample: sample.name, counts: { branches: content.branches, leaves: content.leaves.length, organs: content.organs.length }, nestedParent: report.nested?.parent, report: path.join(out, '验收.json') }));
  } catch (e) {
    report.error = e.stack;
    if (page) await page.screenshot({ path: path.join(out, '失败.png') });
    throw e;
  } finally {
    fs.writeFileSync(path.join(out, '验收.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
