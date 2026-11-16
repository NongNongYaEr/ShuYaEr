const fs = require('fs'), path = require('path'), assert = require('node:assert/strict'), crypto = require('crypto');
const { chromium } = require(process.env.BRANCHFORGE_PLAYWRIGHT || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const out = path.resolve('.runtime/trunk-section-placement'); fs.mkdirSync(out, { recursive: true });
  const input = path.resolve('assets/tree-template-library/template-c75273b48abc49fbbfa602525f57c083.branch.json');
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), sourceHash = hash(input);
  const result = { checks: [], errors: [], shaderErrors: [] };
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  let page;
  const check = text => { result.checks.push(text); console.log('OK ' + text); };
  try {
    page = await browser.newPage({ viewport: { width: 1700, height: 1080 } }); page.setDefaultTimeout(180000);
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /shader|gl_invalid|compile|webglprogram/i.test(message.text())) result.shaderErrors.push(message.text()); });
    await page.route('**/api/project-session**', route => route.fulfill({ json: { success: true, items: [] } }));
    await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'), () => page.evaluate(() => document.getElementById('projectSessionPanel').close()));
    const idle = () => page.waitForFunction(() => {
      const f = window.__branchForge;
      return f?.asset && !document.getElementById('brandStartup')
        && !f.asset.group.userData.pending_rebuild && f.asset.authoring === f.authoring
        && !f.workbench.busy && !f.workbench.trunkForm.active && document.getElementById('busyOverlay').hidden
        && !document.getElementById('projectLoadDialog').open;
    });
    await page.goto(process.argv[2] || 'http://localhost:19915/');
    await page.waitForFunction(() => window.__branchForge?.asset); await idle();
    await page.locator('#projectInput').setInputFiles(input);
    await page.waitForFunction(() => window.__branchForge.authoring.branch_instances.length === 550); await idle();
    await page.locator('#trunkFormSelectRoot').click();
    const target = await page.evaluate(() => window.__branchForge.selectedCurvePoint.branchId); result.target = target;
    const snapshot = () => page.evaluate(async id => {
      const f = window.__branchForge;
      const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))).map(n => n.toString(16).padStart(2, '0')).join('');
      let trunk; const units = [];
      f.asset.group.traverse(mesh => {
        if (mesh.userData.category === 'branch' && mesh.userData.stable_id === id) trunk = mesh;
        if (mesh.isInstancedMesh) units.push([Array.from(mesh.instanceMatrix.array), Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, value]) => [key, Array.from(value.array)])), Array.from(mesh.geometry.index?.array || [])]);
      });
      return { trunk: await digest(Array.from(trunk.geometry.attributes.position.array)), units: await digest(units),
        instances: await digest(f.authoring.branch_instances), sources: await digest(f.authoring.branch_library),
        form: structuredClone(f.authoring.workbench.trunk_forms?.branches[id] || null),
        branchIds: f.asset.masterBranches.map(branch => branch.stableId), selected: f.selectedCurvePoint.branchId,
        overrides: await digest(f.authoring.overrides), history: f.historyState.undo };
    }, target);
    const focus = () => page.locator('#viewport').focus();
    const currentId = () => page.locator('#trunkSectionSelect').inputValue();
    const before = await snapshot(), emptySectionSelection = await currentId();
    await page.locator('#trunkFormMode').click();
    // DIRECT initially offers a read-only BASE overlay. This compatibility
    // suite deliberately verifies cursor ray hits against committed FINAL.
    await page.locator('#trunkSectionDock [data-section-view="FINAL"]').click();
    await page.evaluate(async id => {
      const THREE = await import('/vendor/three.module.min.js'), { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const f = window.__branchForge; let mesh;
      f.asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === id) mesh = object; });
      mesh.updateWorldMatrix(true, false);
      const ring = interpolateSectionRing(mesh.geometry.userData.radiusRings, .37, mesh.geometry.attributes.position);
      const center = new THREE.Vector3(...ring.center).applyMatrix4(mesh.matrixWorld);
      f.controls.target.copy(center); f.camera.position.copy(center).add(new THREE.Vector3(5, -11, 5)); f.controls.update();
    }, target);
    const header = await page.locator('#trunkSectionDock header strong').boundingBox();
    await page.mouse.move(header.x + 25, header.y + 10); await page.mouse.down();
    await page.mouse.move(1260, 240, { steps: 6 }); await page.mouse.up();

    const surfacePoint = approximateT => page.evaluate(async ({ id, approximateT }) => {
      const THREE = await import('/vendor/three.module.min.js');
      const { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const { sectionPositionFromSurfaceHit } = await import('/trunk-section-placement.js');
      const { skeletonBranches } = await import('/skeleton-thickness.js');
      const f = window.__branchForge, canvas = document.getElementById('viewport'), rect = canvas.getBoundingClientRect();
      const ids = new Set(skeletonBranches(f.asset.masterBranches).map(branch => branch.stableId)), carriers = []; let mesh;
      f.asset.group.traverse(object => {
        if (object.isMesh && !object.isInstancedMesh && object.visible && object.userData.category === 'branch' && ids.has(object.userData.stable_id)) carriers.push(object);
        if (object.userData.category === 'branch' && object.userData.stable_id === id) mesh = object;
      });
      const ray = new THREE.Raycaster(); f.camera.updateMatrixWorld(); carriers.forEach(object => object.updateWorldMatrix(true, false));
      for (const offsetT of [0, -.008, .008, -.016, .016]) {
        const ring = interpolateSectionRing(mesh.geometry.userData.radiusRings, approximateT + offsetT, mesh.geometry.attributes.position);
        for (const offsetX of [0, -.25, .25, -.5, .5]) {
          const local = new THREE.Vector3(...ring.center).addScaledVector(new THREE.Vector3(...ring.x), ring.localRadius * offsetX);
          const projected = local.applyMatrix4(mesh.matrixWorld).project(f.camera);
          const point = { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2 };
          if (projected.z < -1 || projected.z > 1 || document.elementFromPoint(point.x, point.y) !== canvas) continue;
          ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), f.camera);
          const hit = ray.intersectObjects(carriers, false)[0];
          if (hit?.object !== mesh) continue;
          const t = sectionPositionFromSurfaceHit(mesh.geometry.userData.radiusRings, hit, mesh);
          if (t !== null) return { ...point, t, face: hit.face, position: hit.point.toArray() };
        }
      }
      throw new Error('No visible current-carrier surface near t=' + approximateT);
    }, { id: target, approximateT });
    const blankPoint = () => page.evaluate(async id => {
      const THREE = await import('/vendor/three.module.min.js'), f = window.__branchForge, canvas = document.getElementById('viewport'), rect = canvas.getBoundingClientRect();
      let mesh; f.asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === id) mesh = object; });
      mesh.updateWorldMatrix(true, false); f.camera.updateMatrixWorld(); const ray = new THREE.Raycaster();
      for (const x of [.2, .35, .65, .8]) for (const y of [.2, .35, .65, .8]) {
        const point = { x: rect.left + rect.width * x, y: rect.top + rect.height * y };
        if (document.elementFromPoint(point.x, point.y) !== canvas) continue;
        ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), f.camera);
        if (!ray.intersectObject(mesh, false).length) return point;
      }
      throw new Error('No empty viewport point');
    }, target);
    const blank = await blankPoint();
    await focus(); await page.mouse.move(blank.x, blank.y); await page.keyboard.press('n');
    assert.equal(await page.locator('#viewport').getAttribute('data-trunk-placement'), 'ADD');
    await page.mouse.click(blank.x, blank.y); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#viewport').getAttribute('data-trunk-placement'), 'ADD');
    assert.deepEqual(await snapshot(), before);
    await page.keyboard.press('Escape'); await idle(); assert.deepEqual(await snapshot(), before);
    assert.equal(await currentId(), emptySectionSelection);
    check('N waits for the actual current carrier; blank click/Enter do not add and Esc cancels the entire addition');

    const firstPoint = await surfacePoint(.31), previewPoint = await surfacePoint(.40);
    await focus(); await page.keyboard.press('n'); await page.mouse.move(firstPoint.x, firstPoint.y, { steps: 5 });
    assert.ok(Math.abs(Number(await page.locator('#trunkSectionT').inputValue()) / 100 - firstPoint.t) < 1e-5);
    await page.mouse.move(previewPoint.x, previewPoint.y, { steps: 5 });
    assert.ok(Math.abs(Number(await page.locator('#trunkSectionT').inputValue()) / 100 - previewPoint.t) < 1e-5);
    assert.deepEqual(await snapshot(), before);
    await page.mouse.move(firstPoint.x, firstPoint.y, { steps: 5 }); await page.mouse.click(firstPoint.x, firstPoint.y); await idle();
    const firstId = await currentId(), firstPlaced = await snapshot();
    assert.equal(firstPlaced.form.sections.length, 1); assert.equal(firstPlaced.history, before.history + 1);
    assert.ok(Math.abs(firstPlaced.form.sections[0].t - firstPoint.t) < 1e-5); assert.ok(Math.abs(firstPlaced.form.sections[0].t - .5) > .05);
    result.firstPlacement = { pointer: firstPoint, section: firstPlaced.form.sections[0] };
    check('N previews mouse placement continuously on the hit surface, then commits one undo at the clicked non-midpoint position');
    await focus(); await page.mouse.move(blank.x, blank.y); await page.keyboard.press('n');
    await page.mouse.move(previewPoint.x, previewPoint.y); await page.mouse.click(blank.x, blank.y, { button: 'right' }); await idle();
    assert.deepEqual(await snapshot(), firstPlaced); assert.equal(await currentId(), firstId);
    check('right-click cancels a moved N preview and restores the original active section');

    const secondPoint = await surfacePoint(.42);
    await page.locator('[data-section-action="add"]').click();
    assert.equal(await page.locator('#viewport').getAttribute('data-trunk-placement'), 'ADD');
    await page.mouse.move(secondPoint.x, secondPoint.y, { steps: 5 }); await page.mouse.click(secondPoint.x, secondPoint.y); await idle();
    const secondId = await currentId(), secondPlaced = await snapshot();
    assert.notEqual(secondId, firstId); assert.equal(secondPlaced.form.sections.length, 2);
    assert.ok(Math.abs(secondPlaced.form.sections.find(section => section.id === secondId).t - secondPoint.t) < 1e-5);
    assert.deepEqual(secondPlaced.form.sections.find(section => section.id === firstId), firstPlaced.form.sections[0]);
    check('the dock Add button shares cursor placement and leaves the earlier section unchanged');

    await page.locator('#trunkSectionSelect').selectOption(firstId);
    await page.locator('[data-section-action="presets"]').click();
    await page.locator('[data-section-preset-id="builtin-fluted"] button').click(); await idle();
    await page.locator('[data-section-action="presets"]').click();
    for (const [field, value] of [['trunkSectionRadius', '1.35'], ['trunkSectionOval', '1.25'], ['trunkSectionRoll', '27']]) {
      await page.locator('#' + field).fill(value); await page.locator('#' + field).press('Enter'); await idle();
    }
    // Adjacent DIRECT keys interpolate along the axis; the V1 influence span
    // is retained for compatibility but intentionally has no editable UI.
    assert.equal((await snapshot()).form.geometry_version, 2);
    assert.equal(await page.locator('#trunkSectionSpan').isVisible(), false);
    const shapeBefore = await snapshot(), originalSection = shapeBefore.form.sections.find(section => section.id === firstId);
    assert.ok(originalSection.profile.length >= 8);

    const projectedSlide = destinationT => page.evaluate(async ({ id, destinationT }) => {
      const THREE = await import('/vendor/three.module.min.js'), { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const f = window.__branchForge, hs = f.workbench.trunkForm.root.children[1], rect = document.getElementById('viewport').getBoundingClientRect(); let mesh;
      f.asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === id) mesh = object; });
      hs.updateWorldMatrix(true, true);
      const sid = document.getElementById('trunkSectionSelect').value;
      const sectionT = Number(document.getElementById('trunkSectionT').value) / 100;
      const project = local => { const p = local.clone().applyMatrix4(hs.matrixWorld).project(f.camera); return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 }; };
      const h = hs.children.find(object => object.isMesh && object.userData.id === sid && object.userData.action === 'SLIDE');
      const start = h ? h.position : new THREE.Vector3(...interpolateSectionRing(mesh.geometry.userData.radiusRings, sectionT, mesh.geometry.attributes.position).center);
      const end = new THREE.Vector3(...interpolateSectionRing(mesh.geometry.userData.radiusRings, destinationT, mesh.geometry.attributes.position).center);
      return { start: project(start), end: project(end) };
    }, { id: target, destinationT });
    for (const cancellation of ['Escape', 'right']) {
      await focus(); const points = await projectedSlide(.36); await page.mouse.move(points.start.x, points.start.y);
      await page.keyboard.press('Shift+d'); assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.active), true);
      assert.notEqual(await currentId(), firstId);
      await page.mouse.move(points.end.x, points.end.y, { steps: 8 }); assert.deepEqual(await snapshot(), shapeBefore);
      if (cancellation === 'right') await page.mouse.click(points.end.x, points.end.y, { button: 'right' }); else await page.keyboard.press('Escape');
      await idle(); assert.deepEqual(await snapshot(), shapeBefore); assert.equal(await currentId(), firstId);
    }
    check('Shift+D carries the whole section into slide mode; Esc and right-click remove the unconfirmed copy and restore the active source');
    await focus(); const destination = .47, projected = await projectedSlide(destination);
    await page.mouse.move(projected.start.x, projected.start.y); await page.keyboard.press('Shift+d');
    const copiedId = await currentId(); assert.notEqual(copiedId, firstId);
    await page.mouse.move(projected.end.x, projected.end.y, { steps: 12 });
    assert.deepEqual(await snapshot(), shapeBefore); await page.keyboard.press('Enter'); await idle();
    const copied = await snapshot(), copy = copied.form.sections.find(section => section.id === copiedId);
    assert.equal(copied.form.sections.length, shapeBefore.form.sections.length + 1);
    assert.ok(Math.abs(copy.t - destination) < .02); assert.notEqual(copy.t, originalSection.t);
    for (const key of ['radius', 'oval', 'roll', 'span', 'profile']) assert.deepEqual(copy[key], originalSection[key], key + ' cloned');
    assert.deepEqual(copied.form.sections.find(section => section.id === firstId), originalSection);
    assert.equal(copied.history, shapeBefore.history + 1); assert.notEqual(copied.trunk, shapeBefore.trunk);
    result.duplicate = { source: originalSection, copy };
    await focus(); await page.keyboard.press('Control+z'); await idle(); const undone = await snapshot();
    assert.deepEqual(undone.form, shapeBefore.form); assert.equal(undone.trunk, shapeBefore.trunk);
    await page.keyboard.press('Control+y'); await idle(); const redone = await snapshot();
    assert.deepEqual(redone.form, copied.form); assert.equal(redone.trunk, copied.trunk);
    check('Shift+D preserves profile/radius/oval/twist/span, changes only the new ID and position, and undo/redo restores exact geometry');

    await page.locator('#trunkSectionSelect').selectOption(copiedId);
    const ringPoint = await page.evaluate(async ({ id, sid }) => {
      const f = window.__branchForge, hs = f.workbench.trunkForm.root.children[1], canvas = document.getElementById('viewport'), rect = canvas.getBoundingClientRect();
      hs.updateWorldMatrix(true, true);
      const line = hs.children.find(object => object.userData.kind === 'section' && object.userData.id === sid && object.userData.polyline);
      const project = local => { const p = local.clone().applyMatrix4(hs.matrixWorld).project(f.camera); return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2, z: p.z }; };
      const handles = hs.children.filter(object => object.isMesh && object.userData.kind).map(object => project(object.position));
      const points = line.userData.polyline;
      for (let i = 0; i < points.length; i++) {
        const a = project(points[i]), b = project(points[(i + 1) % points.length]), p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (a.z < -1 || a.z > 1 || b.z < -1 || b.z > 1 || document.elementFromPoint(p.x, p.y) !== canvas) continue;
        const markerDistance = Math.min(...handles.map(h => Math.hypot(h.x - p.x, h.y - p.y)));
        if (markerDistance > 24) return { ...p, markerDistance, coreWidth: line.children[1].material.uniforms.lineWidth.value };
      }
      throw new Error('No visible section outline far from its marker for ' + sid);
    }, { id: target, sid: firstId });
    assert.equal(ringPoint.coreWidth, 2.5);
    const beforeSelect = await snapshot();
    await page.mouse.move(ringPoint.x, ringPoint.y, { steps: 5 });
    const hover = await page.evaluate(sid => {
      const line = window.__branchForge.workbench.trunkForm.root.children[1].children.find(object => object.userData.kind === 'section' && object.userData.id === sid && object.userData.polyline);
      return { width: line.children[1].material.uniforms.lineWidth.value, color: line.children[1].material.uniforms.lineColor.value.getHex() };
    }, firstId);
    assert.equal(hover.width, 3.5); assert.equal(hover.color, 0xe1fff1);
    await page.mouse.click(ringPoint.x, ringPoint.y); await idle();
    assert.equal(await currentId(), firstId); assert.deepEqual(await snapshot(), beforeSelect);
    const widths = await page.evaluate(({ firstId, copiedId }) => {
      const lines = window.__branchForge.workbench.trunkForm.root.children[1].children;
      return [firstId, copiedId].map(id => lines.find(object => object.userData.kind === 'section' && object.userData.id === id && object.userData.polyline).children[1].material.uniforms.lineWidth.value);
    }, { firstId, copiedId });
    assert.deepEqual(widths, [3.5, 2.5]); result.outlinePicking = { ringPoint, hover, widths };
    await page.screenshot({ path: path.join(out, '截面放置复制与加粗轮廓.png') });
    assert.deepEqual(result.shaderErrors, []);
    check('the full thicker outline can be hovered and selected away from every marker; active/hover 3.5px and inactive 2.5px shaders render without compile errors');

    const savedState = await snapshot();
    for (const key of ['units', 'instances', 'sources', 'branchIds', 'overrides']) assert.deepEqual(savedState[key], before[key], key + ' unchanged');
    check('all 550 complete-unit geometry/matrices, model sources, instance records and structural branches remain unchanged');
    await page.evaluate(() => {
      const original = window.fetch;
      window.fetch = async function (url, options) {
        if (url === '/api/save-project') {
          const prefix = await options.body.slice(0, 12).text(), line = prefix.indexOf('\n'), offset = line + 1 + Number(prefix.slice(0, line));
          const link = document.createElement('a'); link.href = URL.createObjectURL(options.body.slice(offset)); link.download = 'section-placement.branch.json'; link.click();
          return new Response(JSON.stringify({ success: true, path: 'section-placement.branch.json' }), { headers: { 'Content-Type': 'application/json' } });
        }
        return original.apply(this, arguments);
      };
    });
    await focus(); await page.keyboard.press('Control+s'); await page.waitForSelector('#projectSaveDialog[open]');
    await page.locator('[name="saveMode"][value="FILE"]').check();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#psSubmit').click()]);
    const saved = path.join(out, '香樟_截面放置与复制.branch.json'); await download.saveAs(saved); result.saved = saved;
    await page.reload(); await page.waitForFunction(() => window.__branchForge?.asset); await idle();
    await page.locator('#projectInput').setInputFiles(saved);
    await page.waitForFunction(() => window.__branchForge.authoring.branch_instances.length === 550); await idle();
    await page.locator('#trunkFormSelectRoot').click(); const reloaded = await snapshot();
    for (const key of ['trunk', 'units', 'instances', 'sources', 'form', 'branchIds']) assert.deepEqual(reloaded[key], savedState[key], key + ' after fresh file reload');
    check('the actual Ctrl+S project download survives a full page restart and file reload with exact section shape, placement and carrier geometry');
    assert.equal(hash(input), sourceHash); assert.deepEqual(result.errors, []); assert.deepEqual(result.shaderErrors, []);
    result.passed = true; console.log(JSON.stringify({ passed: true, checks: result.checks.length, target }));
  } catch (error) {
    result.failure = error.stack || error.message;
    if (page) await page.screenshot({ path: path.join(out, '失败现场.png') }).catch(() => {});
    throw error;
  } finally {
    await browser.close(); fs.writeFileSync(path.join(out, '验收.json'), JSON.stringify(result, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
