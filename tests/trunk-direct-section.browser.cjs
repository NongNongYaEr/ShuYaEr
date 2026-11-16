const fs = require('fs'), path = require('path'), assert = require('node:assert/strict'), crypto = require('crypto');
const { chromium } = require(process.env.BRANCHFORGE_PLAYWRIGHT || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const out = path.resolve('.runtime/trunk-direct-section'); fs.mkdirSync(out, { recursive: true });
  const input = path.resolve('assets/tree-template-library/template-c75273b48abc49fbbfa602525f57c083.branch.json');
  const legacyInput = path.join(out, '旧V1_冻结验收.branch.json');
  const legacySourceHash = '18ce103c5199b194d305f99665e4d2ab2b4e4455996ff0dda58a5731f9d440fe';
  // Recorded with the real V1 kernel before the DIRECT implementation, from
  // the actual previous browser save; this is an independent compatibility
  // baseline, not a hash produced by the code currently under test.
  const legacyCarrierHash = 'da86643c41dcaf3be075dd062807009965e2058a44d9ce78e2566ccf0d402e43';
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), inputHash = hash(input);
  assert.ok(fs.existsSync(legacyInput), 'The frozen actual V1 save is required at ' + legacyInput);
  assert.equal(hash(legacyInput), legacySourceHash);
  const result = { checks: [], measurements: [], errors: [], shaderErrors: [], legacyInput, legacyCarrierHash }; let saveRequests = 0;
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  let page, target;
  const check = text => { result.checks.push(text); console.log('OK ' + text); };
  try {
    page = await browser.newPage({ viewport: { width: 1700, height: 1080 } }); page.setDefaultTimeout(180000);
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('request', request => { if (request.url().endsWith('/api/save-project')) saveRequests++; });
    page.on('console', message => { if (message.type() === 'error' && /shader|gl_invalid|compile|webglprogram/i.test(message.text())) result.shaderErrors.push(message.text()); });
    await page.route('**/api/project-session**', route => route.fulfill({ json: { success: true, items: [] } }));
    await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'), () => page.evaluate(() => document.getElementById('projectSessionPanel').close()));
    const ready = () => page.waitForFunction(() => {
      const f = window.__branchForge;
      return f?.asset && !document.getElementById('brandStartup') && !f.asset.group.userData.pending_rebuild
        && f.asset.authoring === f.authoring && !f.workbench.busy && document.getElementById('busyOverlay').hidden
        && !document.getElementById('projectLoadDialog').open;
    });
    const idle = async () => { await ready(); await page.waitForFunction(() => !window.__branchForge.workbench.trunkForm.active); };
    const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const load = async file => {
      await page.locator('#projectInput').setInputFiles(file);
      if (await page.locator('#projectSwitchConfirm[open]').isVisible()) await page.locator('#projectSwitchConfirm [data-confirm-accept]').click();
      const expected = JSON.parse(fs.readFileSync(file, 'utf8')).authoring?.workbench?.trunk_forms?.branches?.CAMPHOR_TRUNK || null;
      await page.waitForFunction(expected => JSON.stringify(window.__branchForge?.authoring?.workbench?.trunk_forms?.branches?.CAMPHOR_TRUNK || null) === JSON.stringify(expected), expected);
      await page.waitForFunction(() => window.__branchForge.authoring.branch_instances.length === 550); await idle();
      await page.locator('#trunkFormSelectRoot').click();
      target = await page.evaluate(() => window.__branchForge.selectedCurvePoint.branchId);
      assert.equal(target, 'CAMPHOR_TRUNK');
    };
    const focus = () => page.locator('#viewport').focus();
    const currentId = () => page.locator('#trunkSectionSelect').inputValue();
    const snapshot = () => page.evaluate(async id => {
      const f = window.__branchForge;
      const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))).map(n => n.toString(16).padStart(2, '0')).join('');
      let trunk; const units = [];
      f.asset.group.traverse(mesh => {
        if (mesh.userData.category === 'branch' && mesh.userData.stable_id === id) trunk = mesh;
        if (mesh.isInstancedMesh) units.push([Array.from(mesh.instanceMatrix.array), Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, value]) => [key, Array.from(value.array)])), Array.from(mesh.geometry.index?.array || [])]);
      });
      return { trunk: await digest(Array.from(trunk.geometry.attributes.position.array)), positions: trunk.geometry.attributes.position.count,
        units: await digest(units), instances: await digest(f.authoring.branch_instances), sources: await digest(f.authoring.branch_library),
        authoring: await digest(f.authoring), form: structuredClone(f.authoring.workbench.trunk_forms?.branches[id] || null),
        topVersion: f.authoring.workbench.trunk_forms?.version ?? null,
        branchIds: f.asset.masterBranches.map(branch => branch.stableId), selected: f.selectedCurvePoint.branchId,
        overrides: await digest(f.authoring.overrides), history: f.historyState.undo };
    }, target);
    const visibleSkin = () => page.evaluate(async id => {
      const f = window.__branchForge;
      const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))).map(n => n.toString(16).padStart(2, '0')).join('');
      const visible = object => { for (let current = object; current; current = current.parent) if (!current.visible) return false; return true; };
      let committed; f.asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === id) committed = object; });
      const overlays = []; f.workbench.trunkForm.root.traverse(object => {
        if (object.isMesh && object.geometry?.userData.radiusRings?.length && visible(object)) overlays.push(object);
      });
      const mesh = overlays.at(-1) || (visible(committed) ? committed : null);
      if (!mesh) throw new Error('No visible carrier or preview');
      return { hash: await digest(Array.from(mesh.geometry.attributes.position.array)), count: mesh.geometry.attributes.position.count,
        previewView: mesh.userData.trunk_form_preview_view || null, readonly: mesh.userData.trunk_form_preview_readonly || false,
        overlays: overlays.length, committedVisible: visible(committed) };
    }, target);
    const view = async mode => {
      await page.locator(`#trunkSectionDock [data-section-view="${mode}"]`).click(); await frame();
      assert.equal(await page.locator(`#trunkSectionDock [data-section-view="${mode}"]`).getAttribute('aria-pressed'), 'true');
    };
    const skinSamples = (actualVisible = false) => page.evaluate(async ({ id, actualVisible }) => {
      const THREE = await import('/vendor/three.module.min.js'), { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const { createDirectTrunkFormSampler } = await import('/trunk-form.js');
      const f = window.__branchForge; let mesh;
      f.asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === id) mesh = object; });
      if (actualVisible) {
        const effectiveVisible = object => { for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false; return true; };
        f.workbench.trunkForm.root.traverse(object => { if (object.isMesh && object.geometry?.userData.radiusRings?.length && effectiveVisible(object)) mesh = object; });
      }
      const rings = mesh.geometry.userData.radiusRings, positions = mesh.geometry.attributes.position;
      const form = f.authoring.workbench.trunk_forms?.branches?.[id], direct = form?.geometry_version === 2 ? createDirectTrunkFormSampler(form) : null;
      const sampleRing = r => {
        const points = r.points || Array.from({ length: r.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(positions, r.offset + i));
        return Array.from({ length: 96 }, (_, i) => { const u = i * points.length / 96, a = Math.floor(u); return points[a].clone().lerp(points[(a + 1) % points.length], u - a).toArray(); });
      };
      const radius = r => r.localRadius / (direct?.sectionAt(r.t).radius || 1);
      const axial = rings.map(r => ({ t: r.t, radius: radius(r), points: sampleRing(r) }));
      const dense = Array.from({ length: 201 }, (_, i) => {
        const r = interpolateSectionRing(rings, i / 200, positions); return { t: i / 200, radius: radius(r), points: sampleRing(r) };
      });
      return { axial, dense };
    }, { id: target, actualVisible });
    const analyticSamples = form => page.evaluate(async form => {
      const { createDirectTrunkFormSampler } = await import('/trunk-form.js'), sampler = createDirectTrunkFormSampler(form);
      return Array.from({ length: 201 }, (_, i) => {
        const t = i / 200, roll = sampler.sectionAt(t).roll * Math.PI / 180;
        return { t, radius: 1, points: Array.from({ length: 512 }, (_, angular) => {
          const angle = angular * Math.PI * 2 / 512, radius = sampler.radialAt(t, angle);
          return [Math.cos(angle + roll) * radius, Math.sin(angle + roll) * radius, 0];
        }) };
      });
    }, form);
    const difference = (a, b) => {
      let maximum = 0, maximumRelative = 0, worst = null, count = 0;
      for (const first of a) {
        const second = b.find(item => Math.abs(item.t - first.t) < 1e-9); if (!second) continue;
        first.points.forEach((point, angular) => {
          const distance = Math.hypot(...point.map((value, axis) => value - second.points[angular][axis]));
          const relative = distance / Math.max(1e-6, first.radius);
          if (relative > maximumRelative) { maximumRelative = relative; worst = { t: first.t, angular, distance, localRadius: first.radius }; }
          maximum = Math.max(maximum, distance); count++;
        });
      }
      assert.ok(count > 100, 'There must be shared surface samples');
      return { maximum, maximumRelative, worst, count };
    };
    const compareSkin = (label, before, after, limit = .01) => {
      const dense = difference(before.dense, after.dense), commonRings = difference(before.axial, after.axial);
      result.measurements.push({ label, dense, commonRings, limit });
      assert.ok(dense.maximumRelative <= limit + 1e-7, label + ' dense mesh deviation ' + dense.maximumRelative);
      assert.ok(commonRings.maximumRelative <= limit + 1e-7, label + ' shared-ring deviation ' + commonRings.maximumRelative);
    };
    const frameCarrier = async (t = .37, front = false) => page.evaluate(async ({ id, t, front }) => {
      const THREE = await import('/vendor/three.module.min.js'), { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const f = window.__branchForge; let mesh;
      f.asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === id) mesh = object; });
      mesh.updateWorldMatrix(true, false);
      const r = interpolateSectionRing(mesh.geometry.userData.radiusRings, t, mesh.geometry.attributes.position), center = new THREE.Vector3(...r.center).applyMatrix4(mesh.matrixWorld);
      f.controls.target.copy(center);
      if (front) {
        const distance = Math.max(3, r.localRadius * 7), axis = new THREE.Vector3(...r.tangent).transformDirection(mesh.matrixWorld), x = new THREE.Vector3(...r.x).transformDirection(mesh.matrixWorld);
        f.camera.position.copy(center).addScaledVector(axis, distance).addScaledVector(x, distance * .12);
      } else f.camera.position.copy(center).add(new THREE.Vector3(5, -11, 5));
      f.controls.update();
    }, { id: target, t, front });
    const moveDock = async () => {
      const header = await page.locator('#trunkSectionDock header strong').boundingBox();
      await page.mouse.move(header.x + 25, header.y + 10); await page.mouse.down(); await page.mouse.move(1260, 240, { steps: 6 }); await page.mouse.up();
    };
    const surfacePoint = approximateT => page.evaluate(async ({ id, approximateT }) => {
      const THREE = await import('/vendor/three.module.min.js'), { interpolateSectionRing } = await import('/trunk-section-interaction.js'), { skeletonBranches } = await import('/skeleton-thickness.js'), { sectionPositionFromSurfaceHit } = await import('/trunk-section-placement.js');
      const f = window.__branchForge, canvas = document.getElementById('viewport'), rect = canvas.getBoundingClientRect();
      const ids = new Set(skeletonBranches(f.asset.masterBranches).map(branch => branch.stableId)), carriers = []; let mesh;
      f.asset.group.traverse(object => {
        if (object.isMesh && !object.isInstancedMesh && object.visible && object.userData.category === 'branch' && ids.has(object.userData.stable_id)) carriers.push(object);
        if (object.userData.category === 'branch' && object.userData.stable_id === id) mesh = object;
      });
      mesh.updateWorldMatrix(true, false); f.camera.updateMatrixWorld(); const ray = new THREE.Raycaster();
      for (const offsetT of [0, -.008, .008, -.016, .016]) {
        const ring = interpolateSectionRing(mesh.geometry.userData.radiusRings, approximateT + offsetT, mesh.geometry.attributes.position);
        for (const offsetX of [0, -.25, .25, -.5, .5]) {
          const projected = new THREE.Vector3(...ring.center).addScaledVector(new THREE.Vector3(...ring.x), ring.localRadius * offsetX).applyMatrix4(mesh.matrixWorld).project(f.camera);
          const point = { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2 };
          if (projected.z < -1 || projected.z > 1 || document.elementFromPoint(point.x, point.y) !== canvas) continue;
          ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), f.camera); carriers.forEach(object => object.updateWorldMatrix(true, false));
          const hit = ray.intersectObjects(carriers, false)[0];
          if (hit?.object === mesh) return { ...point, t: sectionPositionFromSurfaceHit(mesh.geometry.userData.radiusRings, hit, mesh) };
        }
      }
      throw new Error('No visible current-carrier surface near ' + approximateT);
    }, { id: target, approximateT });
    const place = async t => {
      await view('FINAL');
      await frameCarrier(t); const point = await surfacePoint(t); await focus(); await page.mouse.move(point.x, point.y); await page.keyboard.press('n');
      assert.equal(await page.locator('#viewport').getAttribute('data-trunk-placement'), 'ADD');
      await page.mouse.move(point.x + 1, point.y); await page.mouse.move(point.x, point.y); await page.mouse.click(point.x, point.y); await idle();
      return currentId();
    };
    const edit = async (name, value) => { await page.locator('#' + name).fill(String(value)); await page.locator('#' + name).press('Enter'); await idle(); };
    const projectedSlide = destinationT => page.evaluate(async ({ id, destinationT }) => {
      const THREE = await import('/vendor/three.module.min.js'), { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const f = window.__branchForge, hs = f.workbench.trunkForm.root.children[1], rect = document.getElementById('viewport').getBoundingClientRect(); let mesh;
      f.asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === id) mesh = object; }); hs.updateWorldMatrix(true, true);
      const sid = document.getElementById('trunkSectionSelect').value, t = Number(document.getElementById('trunkSectionT').value) / 100;
      const project = local => { const p = local.clone().applyMatrix4(hs.matrixWorld).project(f.camera); return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 }; };
      const h = hs.children.find(object => object.isMesh && object.userData.id === sid && object.userData.action === 'SLIDE');
      return { start: project(h?.position || new THREE.Vector3(...interpolateSectionRing(mesh.geometry.userData.radiusRings, t, mesh.geometry.attributes.position).center)),
        end: project(new THREE.Vector3(...interpolateSectionRing(mesh.geometry.userData.radiusRings, destinationT, mesh.geometry.attributes.position).center)) };
    }, { id: target, destinationT });
    await page.goto(process.argv[2] || 'http://localhost:19916/'); await page.waitForFunction(() => window.__branchForge?.asset); await idle();
    await load(legacyInput); const legacy = await snapshot();
    assert.equal(legacy.topVersion, 1); assert.equal(legacy.trunk, legacyCarrierHash); assert.equal(legacy.positions, 6210);
    check('the actual saved V1 project renders the exact pre-DIRECT historical carrier hash, with all 550 complete units');
    await page.locator('#trunkFormMode').click(); await frameCarrier(); await moveDock();
    assert.equal(await page.locator('#trunkSectionDock [data-section-view="BASE"]').isDisabled(), true);
    assert.equal((await visibleSkin()).hash, legacy.trunk); assert.deepEqual(await snapshot(), legacy);
    await page.locator('#trunkDirectStart').click(); await frame(); await view('BASE');
    const trialBase = await visibleSkin(); assert.equal(trialBase.previewView, 'BASE');
    const requestsBeforeTrialSave = saveRequests; await focus(); await page.keyboard.press('Control+s');
    await page.waitForFunction(() => !document.getElementById('toast').hidden && /请先确认主干形体/.test(document.getElementById('toast').textContent));
    assert.equal(await page.locator('#projectSaveDialog').evaluate(dialog => dialog.open), false);
    assert.equal(saveRequests, requestsBeforeTrialSave); assert.deepEqual(await snapshot(), legacy);
    await view('FINAL'); const trialFinal = await visibleSkin(); assert.equal(trialFinal.previewView, 'FINAL');
    assert.deepEqual(await snapshot(), legacy); await view('BASE'); await page.locator('#trunkDirectCancel').click(); await idle();
    assert.deepEqual(await snapshot(), legacy); assert.equal((await visibleSkin()).hash, legacy.trunk);
    await focus(); await page.keyboard.press('Control+s'); await page.waitForSelector('#projectSaveDialog[open]');
    await page.locator('#psCancel').click(); assert.equal(saveRequests, requestsBeforeTrialSave); assert.deepEqual(await snapshot(), legacy);
    check('V1 keeps the exact old final surface; explicit DIRECT trial offers BASE/FINAL preview and cancel restores the original with no authoring or history changes');
    check('Ctrl+S refuses an unconfirmed conversion without opening a save dialog or writing; cancellation restores normal saving');
    await page.locator('#trunkDirectStart').click(); await frame(); await view('FINAL'); await page.locator('#trunkDirectConfirm').click(); await idle();
    const converted = await snapshot(); assert.equal(converted.topVersion, 2); assert.equal(converted.form.geometry_version, 2);
    assert.equal(converted.history, legacy.history + 1); assert.ok(converted.form.legacy_form);
    for (const key of ['units', 'instances', 'sources', 'branchIds', 'overrides']) assert.deepEqual(converted[key], legacy[key], key + ' conversion unchanged');
    await view('BASE'); const convertedBase = await visibleSkin(); assert.equal(convertedBase.readonly, true); assert.equal(convertedBase.previewView, 'BASE'); assert.deepEqual(await snapshot(), converted);
    await view('FINAL'); assert.equal((await visibleSkin()).hash, converted.trunk); assert.deepEqual(await snapshot(), converted);
    await view('BASE'); await focus(); await page.keyboard.press('v'); await idle();
    assert.equal((await visibleSkin()).hash, converted.trunk); assert.equal((await visibleSkin()).overlays, 0); assert.deepEqual(await snapshot(), converted);
    check('committed DIRECT BASE/FINAL toggling and mode exit restore the real final surface without changing authoring or history');
    await focus(); await page.keyboard.press('Control+z'); await idle(); assert.equal((await snapshot()).trunk, legacy.trunk); assert.deepEqual((await snapshot()).form, legacy.form);
    await page.keyboard.press('Control+y'); await idle(); assert.equal((await snapshot()).trunk, converted.trunk); assert.deepEqual((await snapshot()).form, converted.form);
    check('legacy DIRECT conversion is explicit and cancelable; confirmed conversion is one undo/redo and preserves source units');

    await load(input); const fresh = await snapshot(); assert.equal(fresh.form, null);
    await page.locator('#trunkFormMode').click(); await frameCarrier(.28); await moveDock();
    const firstId = await place(.28), firstPlaced = await snapshot();
    assert.equal(firstPlaced.form.geometry_version, 2); assert.equal(firstPlaced.topVersion, 2); assert.equal(firstPlaced.history, fresh.history + 1);
    assert.equal(firstPlaced.form.groove_depth, 0); assert.equal(firstPlaced.form.root_flare, 0); assert.equal(firstPlaced.form.asymmetry, 0);
    await edit('trunkSectionT', 28); await edit('trunkSectionRadius', 1.15); await edit('trunkSectionOval', 1.2); await edit('trunkSectionRoll', 12);
    await page.locator('[data-section-mode="PROFILE"]').click(); await frameCarrier(.28, true);
    const drag = await page.evaluate(async () => {
      const THREE = await import('/vendor/three.module.min.js'), { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const f = window.__branchForge, hs = f.workbench.trunkForm.root.children[1], canvas = document.getElementById('viewport'), rect = canvas.getBoundingClientRect(), sid = document.getElementById('trunkSectionSelect').value; let mesh;
      f.asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === f.selectedCurvePoint.branchId) mesh = object; }); hs.updateWorldMatrix(true, true);
      const ring = interpolateSectionRing(mesh.geometry.userData.radiusRings, .28, mesh.geometry.attributes.position), center = new THREE.Vector3(...ring.center);
      const project = local => { const p = local.clone().applyMatrix4(hs.matrixWorld).project(f.camera); return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2, z: p.z }; };
      for (const h of hs.children.filter(object => object.isMesh && object.userData.kind === 'profile' && object.userData.id === sid)) {
        const start = project(h.position), end = project(h.position.clone().sub(center).multiplyScalar(1.12).add(center));
        if (start.z >= -1 && start.z <= 1 && document.elementFromPoint(start.x, start.y) === canvas && document.elementFromPoint(end.x, end.y) === canvas) return { start, end, knotId: h.userData.knotId };
      }
      throw new Error('No visible direct contour point');
    });
    const beforeDrag = await snapshot(); await page.mouse.move(drag.start.x, drag.start.y); await page.mouse.down(); await page.mouse.move(drag.end.x, drag.end.y, { steps: 8 });
    await page.keyboard.press('Escape'); await page.mouse.up(); await idle(); assert.deepEqual(await snapshot(), beforeDrag);
    await page.mouse.move(drag.start.x, drag.start.y); await page.mouse.down(); await page.mouse.move(drag.end.x, drag.end.y, { steps: 8 }); await page.mouse.up(); await idle();
    const editedFirst = await snapshot(); assert.equal(editedFirst.history, beforeDrag.history + 1); assert.notEqual(editedFirst.trunk, beforeDrag.trunk);
    assert.ok(editedFirst.form.sections.find(section => section.id === firstId).profile.length >= 8);
    await focus(); await page.keyboard.press('Control+z'); await idle(); assert.deepEqual((await snapshot()).form, beforeDrag.form); assert.equal((await snapshot()).trunk, beforeDrag.trunk);
    await page.keyboard.press('Control+y'); await idle(); assert.equal((await snapshot()).trunk, editedFirst.trunk);
    const secondId = await place(.62); await edit('trunkSectionT', 62);
    await page.locator('[data-section-action="presets"]').click(); await page.locator('[data-section-preset-id="builtin-round"] button').click(); await idle(); await page.locator('[data-section-action="presets"]').click();
    await edit('trunkSectionRadius', .9); await edit('trunkSectionOval', .85); await edit('trunkSectionRoll', -9);
    const twoKeys = await snapshot();
    assert.equal(twoKeys.form.sections.length, 2); assert.notEqual(twoKeys.form.sections[0].radius, twoKeys.form.sections[1].radius); assert.notEqual(twoKeys.form.sections[0].oval, twoKeys.form.sections[1].oval);
    check('a fresh branch starts DIRECT; a modest visible contour drag plus two different radius/oval keys support cancel and exact undo/redo');

    await page.locator('#trunkSectionSelect').selectOption(firstId); await view('FINAL'); await frameCarrier(.43);
    const insertionBefore = await snapshot(), surfaceBefore = await skinSamples(), analyticBefore = await analyticSamples(insertionBefore.form), placedId = await place(.43);
    const insertionAfter = await snapshot(), surfaceAfter = await skinSamples();
    assert.equal(insertionAfter.history, insertionBefore.history + 1); assert.equal(insertionAfter.form.sections.length, 3);
    for (const id of [firstId, secondId]) assert.deepEqual(insertionAfter.form.sections.find(section => section.id === id), insertionBefore.form.sections.find(section => section.id === id));
    compareSkin('N captures the interpolated DIRECT section', surfaceBefore, surfaceAfter);
    const analytic = difference(analyticBefore, await analyticSamples(insertionAfter.form)); result.measurements.push({ label: 'N dense continuous DIRECT analytic contour', analytic, limit: .01 });
    assert.ok(analytic.maximumRelative <= .01 + 1e-7, 'N dense analytic deviation ' + analytic.maximumRelative);
    const captured = insertionAfter.form.sections.find(section => section.id === placedId); result.capture = captured;
    assert.ok(captured.profile?.length <= 32); assert.equal(insertionAfter.form.geometry_version, 2);
    await focus(); await page.keyboard.press('Control+z'); await idle(); assert.equal((await snapshot()).trunk, insertionBefore.trunk); assert.deepEqual((await snapshot()).form, insertionBefore.form);
    await page.keyboard.press('Control+y'); await idle(); assert.equal((await snapshot()).trunk, insertionAfter.trunk); assert.deepEqual((await snapshot()).form, insertionAfter.form);
    check('N inserts a captured editable interpolated key without a visible jump; dense mesh and shared axial rings remain within 1% of local base radius');
    await page.locator('#trunkSectionSelect').selectOption(firstId); await frameCarrier(.28); await focus();
    const cancelInsertionBefore = await snapshot(), currentBeforeCancel = await currentId(); await page.keyboard.press('n');
    const cancelPoint = await surfacePoint(.32); await page.mouse.move(cancelPoint.x, cancelPoint.y); await page.keyboard.press('Escape'); await idle();
    assert.deepEqual(await snapshot(), cancelInsertionBefore); assert.equal(await currentId(), currentBeforeCancel);

    const duplicateBefore = await snapshot(), duplicateSkinBefore = await skinSamples(), slide = await projectedSlide(.28);
    await focus(); await page.mouse.move(slide.start.x, slide.start.y); await page.keyboard.press('Shift+d'); await page.keyboard.press('Enter'); await idle();
    const duplicateId = await currentId(), duplicateAfter = await snapshot();
    assert.notEqual(duplicateId, firstId); assert.equal(duplicateAfter.history, duplicateBefore.history + 1);
    const original = duplicateBefore.form.sections.find(section => section.id === firstId), copy = duplicateAfter.form.sections.find(section => section.id === duplicateId);
    for (const key of ['t', 'radius', 'oval', 'roll', 'profile']) assert.deepEqual(copy[key], original[key], key + ' duplicate');
    compareSkin('a copy at the same station does not multiply its shape', duplicateSkinBefore, await skinSamples(), 1e-6);
    await page.locator('#trunkSectionSelect').selectOption(firstId);
    assert.match(await page.locator('#trunkSectionSelect').evaluate(select => select.selectedOptions[0].textContent), /重叠未生效/);
    assert.match(await page.locator('#sectionDockHint').textContent(), /最后项生效.*按 G/);
    for (const mode of ['PROFILE', 'TWIST', 'RADIUS']) assert.equal(await page.locator(`[data-section-mode="${mode}"]`).isDisabled(), true);
    for (const field of ['trunkSectionRadius', 'trunkSectionOval', 'trunkSectionRoll']) assert.equal(await page.locator('#' + field).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.root.children[1].children.filter(object => object.userData.kind === 'profile').length), 0);
    const uncover = await projectedSlide(.24); await focus(); await page.mouse.move(uncover.start.x, uncover.start.y); await page.keyboard.press('g');
    await page.mouse.move(uncover.end.x, uncover.end.y, { steps: 10 }); await page.keyboard.press('Enter'); await idle();
    assert.equal(await page.locator('#trunkSectionRadius').isDisabled(), false);
    assert.ok(await page.evaluate(id => window.__branchForge.workbench.trunkForm.root.children[1].children.some(object => object.userData.kind === 'profile' && object.userData.id === id), firstId));
    await focus(); await page.keyboard.press('Control+z'); await idle(); assert.deepEqual((await snapshot()).form, duplicateAfter.form);
    check('an older key covered at the same station clearly explains last-key precedence, disables ineffective shape tools, and G sliding restores its blue points and controls');
    await focus(); await page.keyboard.press('Control+z'); await idle(); assert.deepEqual((await snapshot()).form, duplicateBefore.form); assert.equal((await snapshot()).trunk, duplicateBefore.trunk);
    await page.locator('#trunkSectionSelect').selectOption(firstId); const movedBefore = await snapshot(), move = await projectedSlide(.34);
    await focus(); await page.mouse.move(move.start.x, move.start.y); await page.keyboard.press('Shift+d');
    await page.mouse.move(move.end.x, move.end.y, { steps: 10 }); await page.keyboard.press('Escape'); await idle(); assert.deepEqual(await snapshot(), movedBefore);
    await page.mouse.move(move.start.x, move.start.y); await page.keyboard.press('Shift+d'); await page.mouse.move(move.end.x, move.end.y, { steps: 10 }); await page.keyboard.press('Enter'); await idle();
    const moved = await snapshot(), movedId = await currentId(), movedCopy = moved.form.sections.find(section => section.id === movedId);
    assert.equal(moved.history, movedBefore.history + 1); assert.ok(Math.abs(movedCopy.t - .34) < .02);
    for (const key of ['radius', 'oval', 'roll', 'profile']) assert.deepEqual(movedCopy[key], original[key], key + ' sliding copy');
    assert.deepEqual(moved.form.sections.find(section => section.id === firstId), original);
    check('Shift+D at the same station cannot multiply the shape; the whole copied key then slides independently with one undo and cancel removes the complete proposal');

    await page.locator('#trunkFormPanel [data-trunk-subpanel="details"]').evaluate(detail => { detail.open = true; });
    await page.locator('#trunkFormPanel [data-trunk-preset="BUTTRESS"]').click(); await idle();
    const buttressState = await snapshot(); assert.ok(buttressState.form.buttresses.length > 0);
    await view('BASE'); assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.root.children[1].children.filter(object => object.userData.kind === 'buttress').length), 0);
    await view('FINAL');
    const rootHandles = await page.evaluate(async id => {
      const THREE = await import('/vendor/three.module.min.js'), { createTrunkFormPreviewGeometry } = await import('/branch-kernel.js'), { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const f = window.__branchForge, form = f.authoring.workbench.trunk_forms.branches[id], hs = f.workbench.trunkForm.root.children[1]; let mesh;
      f.asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === id) mesh = object; });
      const branch = f.asset.masterBranches.find(branch => branch.stableId === id), settings = f.collectSettings(), base = createTrunkFormPreviewGeometry(branch, settings, form, settings.preview_lod, { view: 'BASE' });
      const expected = (geometry, b) => {
        const ring = interpolateSectionRing(geometry.userData.radiusRings, 0, geometry.attributes.position), center = new THREE.Vector3(...ring.center), angle = b.angle * Math.PI / 180;
        const u = ((angle - (ring.angleOffset || 0)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) * ring.count / (2 * Math.PI), a = Math.floor(u);
        const p = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, ring.offset + a).lerp(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, ring.offset + (a + 1) % ring.count), u - a);
        return p.sub(center).multiplyScalar(1.25).add(center);
      };
      const handles = hs.children.filter(object => object.userData.kind === 'buttress').map(object => {
        const b = form.buttresses.find(b => b.id === object.userData.id), final = expected(mesh.geometry, b), hiddenBase = expected(base, b);
        return { id: b.id, error: object.position.distanceTo(final), baseDifference: object.position.distanceTo(hiddenBase), actual: object.position.toArray(), final: final.toArray() };
      }); base.dispose(); return handles;
    }, target);
    result.buttressHandles = rootHandles; assert.equal(rootHandles.length, buttressState.form.buttresses.length);
    assert.ok(rootHandles.every(handle => handle.error < 1e-6)); assert.ok(rootHandles.some(handle => handle.baseDifference > .05));
    assert.deepEqual(await snapshot(), buttressState);
    check('BASE hides final-only buttress controls; FINAL places each handle on the actual expanded final ring instead of the undeformed base ring');
    await page.locator('#trunkFormPanel [data-trunk-subpanel="details"]').evaluate(detail => { detail.open = true; });
    await edit('trunkGrooveDepth', .15);
    const beforeView = await snapshot(); await view('BASE'); const baseView = await visibleSkin();
    assert.equal(baseView.readonly, true); assert.equal(baseView.previewView, 'BASE'); assert.deepEqual(await snapshot(), beforeView);
    assert.notEqual(baseView.hash, beforeView.trunk, 'explicit final groove must have a real geometry difference from BASE');
    await page.screenshot({ path: path.join(out, 'DIRECT_基础截面.png') });
    await view('FINAL'); assert.equal((await visibleSkin()).hash, beforeView.trunk); assert.deepEqual(await snapshot(), beforeView);
    await page.screenshot({ path: path.join(out, 'DIRECT_最终表面.png') });
    await focus(); await page.keyboard.press('Control+s'); await page.waitForSelector('#projectSaveDialog[open]');
    await page.waitForFunction(() => document.getElementById('psPreview').complete && document.getElementById('psPreview').naturalWidth > 0);
    const finalThumbnail = await page.locator('#psPreview').getAttribute('src'); await page.locator('#psCancel').click();
    assert.deepEqual(await snapshot(), beforeView); await view('BASE');
    // Saving while looking at BASE must still serialize the committed FINAL
    // recipe, not the temporary mesh or stripped detail settings.
    const savedState = await snapshot();
    for (const key of ['units', 'instances', 'sources', 'branchIds', 'overrides']) assert.deepEqual(savedState[key], fresh[key], key + ' unchanged');
    await page.evaluate(() => {
      const original = window.fetch;
      window.fetch = async function (url, options) {
        if (url === '/api/save-project') {
          const prefix = await options.body.slice(0, 12).text(), line = prefix.indexOf('\n'), offset = line + 1 + Number(prefix.slice(0, line));
          const link = document.createElement('a'); link.href = URL.createObjectURL(options.body.slice(offset)); link.download = 'direct-section.branch.json'; link.click();
          return new Response(JSON.stringify({ success: true, path: 'direct-section.branch.json' }), { headers: { 'Content-Type': 'application/json' } });
        }
        return original.apply(this, arguments);
      };
    });
    await focus(); await page.keyboard.press('Control+s'); await page.waitForSelector('#projectSaveDialog[open]');
    await page.waitForFunction(() => document.getElementById('psPreview').complete && document.getElementById('psPreview').naturalWidth > 0);
    const baseThumbnail = await page.locator('#psPreview').getAttribute('src'); assert.equal(baseThumbnail, finalThumbnail, 'BASE save preview must photograph complete committed FINAL geometry');
    result.thumbnail = { baseHash: crypto.createHash('sha256').update(baseThumbnail).digest('hex'), finalHash: crypto.createHash('sha256').update(finalThumbnail).digest('hex') };
    fs.writeFileSync(path.join(out, '保存面板_FINAL植物预览.jpg'), Buffer.from(baseThumbnail.split(',')[1], 'base64'));
    const afterThumbnail = await visibleSkin(); assert.equal(afterThumbnail.readonly, true); assert.equal(afterThumbnail.previewView, 'BASE'); assert.equal(afterThumbnail.committedVisible, false);
    assert.deepEqual(await snapshot(), savedState);
    check('saving while viewing BASE generates the exact same complete FINAL plant thumbnail and then restores BASE visibility, authoring and history');
    await page.locator('[name="saveMode"][value="FILE"]').check();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#psSubmit').click()]);
    const saved = path.join(out, '香樟_DIRECT截面.branch.json'); await download.saveAs(saved); result.saved = saved;
    const savedDocument = JSON.parse(fs.readFileSync(saved, 'utf8'));
    assert.deepEqual(savedDocument.authoring.workbench.trunk_forms.branches[target], savedState.form);
    assert.equal(savedDocument.authoring.workbench.trunk_forms.version, 2);
    await page.reload(); await page.waitForFunction(() => window.__branchForge?.asset); await idle(); await load(saved);
    const reloaded = await snapshot();
    for (const key of ['trunk', 'units', 'instances', 'sources', 'form', 'branchIds']) assert.deepEqual(reloaded[key], savedState[key], key + ' fresh file reload');
    assert.equal((await visibleSkin()).hash, savedState.trunk); assert.equal((await visibleSkin()).overlays, 0);
    check('actual Ctrl+S while viewing BASE saves committed V2; full page restart/file reload reproduces exact FINAL carrier and all 550 complete-unit hashes');

    // An intentionally difficult editable contour exercises the real UI guard,
    // using actual file load and surface ray hit rather than stubbing commit.
    const extremeForm = await page.evaluate(async () => {
      const { createDirectTrunkForm, createTrunkSectionProfile } = await import('/trunk-form.js');
      const profile = () => createTrunkSectionProfile(8).map((p, i) => ({ ...p, radius: [1.3, .85, 1.05, 1.4, .72, 1.15, .91, 1.2][i] }));
      return createDirectTrunkForm({ sections: [{ id: 'EXTREME_A', t: .2, radius: 3, oval: 4, profile: profile() }, { id: 'EXTREME_B', t: .8, radius: .2, oval: .25, profile: profile() }] });
    });
    const extremeDocument = JSON.parse(fs.readFileSync(input, 'utf8'));
    extremeDocument.authoring.workbench.trunk_forms = { version: 2, branches: { CAMPHOR_TRUNK: extremeForm } };
    if (extremeDocument.workspaces?.tree?.authoring) extremeDocument.workspaces.tree.authoring.workbench.trunk_forms = structuredClone(extremeDocument.authoring.workbench.trunk_forms);
    const extremePath = path.join(out, '超过捕获上限_验收夹具.branch.json'); fs.writeFileSync(extremePath, JSON.stringify(extremeDocument));
    await load(extremePath); await page.locator('#trunkFormMode').click(); await view('FINAL'); await frameCarrier(.46); await moveDock();
    const difficultPoint = await surfacePoint(.46), difficultCapture = await page.evaluate(async t => (await import('/trunk-form.js')).sampleDirectTrunkSection(window.__branchForge.authoring.workbench.trunk_forms.branches.CAMPHOR_TRUNK, t), difficultPoint.t);
    assert.ok(difficultCapture.capture_error?.relative_error > .01); result.rejectedCapture = { t: difficultPoint.t, error: difficultCapture.capture_error };
    const extremeBefore = await snapshot(), extremeSelected = await currentId(); await focus(); await page.mouse.move(difficultPoint.x, difficultPoint.y); await page.keyboard.press('n');
    await page.mouse.move(difficultPoint.x + 1, difficultPoint.y); await page.mouse.move(difficultPoint.x, difficultPoint.y); await page.mouse.click(difficultPoint.x, difficultPoint.y); await frame();
    assert.equal(await page.locator('#viewport').getAttribute('data-trunk-placement'), 'ADD');
    assert.match(await page.locator('#trunkFormStatus').textContent(), /超过 1%.*暂不能确认/); assert.deepEqual(await snapshot(), extremeBefore);
    await page.keyboard.press('Enter'); await frame(); assert.equal(await page.locator('#viewport').getAttribute('data-trunk-placement'), 'ADD'); assert.deepEqual(await snapshot(), extremeBefore);
    await page.screenshot({ path: path.join(out, '捕获误差_拒绝确认.png') }); await page.keyboard.press('Escape'); await idle();
    assert.deepEqual(await snapshot(), extremeBefore); assert.equal(await currentId(), extremeSelected);
    check('an actual difficult surface capture above 1% visibly refuses left-click and Enter, leaves authoring/history intact, and Esc restores the selected source');
    assert.equal(hash(input), inputHash); assert.equal(hash(legacyInput), legacySourceHash);
    assert.deepEqual(result.errors, []); assert.deepEqual(result.shaderErrors, []);
    result.passed = true; console.log(JSON.stringify({ passed: true, checks: result.checks.length, measurements: result.measurements, target }));
  } catch (error) {
    result.failure = error.stack || error.message;
    if (page) await page.screenshot({ path: path.join(out, '失败现场.png') }).catch(() => {});
    throw error;
  } finally {
    await browser.close(); fs.writeFileSync(path.join(out, '验收.json'), JSON.stringify(result, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
