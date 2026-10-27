const fs = require('fs'), path = require('path'), assert = require('node:assert/strict'), crypto = require('crypto');
const { chromium } = require(process.env.BRANCHFORGE_PLAYWRIGHT || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const out = path.resolve('.runtime/trunk-section-points'); fs.mkdirSync(out, { recursive: true });
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
      return f?.asset && !document.getElementById('brandStartup') && !f.asset.group.userData.pending_rebuild
        && f.asset.authoring === f.authoring && !f.workbench.busy && !f.workbench.trunkForm.active
        && document.getElementById('busyOverlay').hidden && !document.getElementById('projectLoadDialog').open;
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
    const currentId = () => page.locator('#trunkSectionSelect').inputValue();
    const focus = () => page.locator('#viewport').focus();
    const base = await snapshot();
    await page.locator('#trunkFormMode').click();
    // These pointer calculations raycast the committed mesh. Select FINAL
    // explicitly because new DIRECT editing starts with a BASE-only overlay.
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
          if (ray.intersectObjects(carriers, false)[0]?.object === mesh) return point;
        }
      }
      throw new Error('No visible carrier surface near t=' + approximateT);
    }, { id: target, approximateT });
    const firstSurface = await surfacePoint(.36);
    await focus(); await page.keyboard.press('n');
    assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.root.children[1].children.filter(object => object.userData.kind === 'profile').length), 0);
    await page.mouse.move(firstSurface.x, firstSurface.y, { steps: 5 }); await page.mouse.click(firstSurface.x, firstSurface.y); await idle();
    const firstId = await currentId();
    await page.locator('#trunkSectionT').fill('36'); await page.locator('#trunkSectionT').press('Enter'); await idle();
    const secondSurface = await surfacePoint(.42); await focus(); await page.keyboard.press('n');
    await page.mouse.move(secondSurface.x, secondSurface.y, { steps: 5 }); await page.mouse.click(secondSurface.x, secondSurface.y); await idle();
    const secondId = await currentId();
    await page.locator('#trunkSectionT').fill('43'); await page.locator('#trunkSectionT').press('Enter'); await idle();
    await page.locator('[data-section-action="presets"]').click();
    await page.locator('[data-section-preset-id="builtin-fluted"] button').click(); await idle();
    await page.locator('[data-section-action="presets"]').click();
    await page.locator('#trunkSectionSelect').selectOption(firstId);
    assert.equal(await page.locator('[data-section-mode="SLIDE"]').getAttribute('aria-pressed'), 'true');

    const pointState = () => page.evaluate(() => {
      const hs = window.__branchForge.workbench.trunkForm.root.children[1];
      return hs.children.filter(object => object.isMesh && object.userData.kind === 'profile').map(object => {
        const uniforms = object.material.uniforms || {};
        return { id: object.userData.id, knotId: object.userData.knotId, radius: object.userData.pixelRadius ?? object.userData.radius ?? object.userData.screenRadius,
          uniformRadius: uniforms.markerRadius?.value ?? uniforms.pointRadius?.value ?? uniforms.radius?.value ?? uniforms.pixelRadius?.value,
          color: (uniforms.markerColor?.value || uniforms.pointColor?.value || uniforms.color?.value || object.material.color)?.getHex() };
      });
    });
    const initialPoints = await pointState(); assert.equal(initialPoints.length, 8);
    assert.ok(initialPoints.every(point => point.id === firstId && point.radius === 6 && point.uniformRadius === 6 && point.color === 0x55c5ff));
    const firstUnchanged = await snapshot(); assert.equal(firstUnchanged.form.sections.find(section => section.id === firstId).profile, undefined);
    check('a selected default SLIDE section immediately shows eight blue fixed-pixel contour points without writing a profile');
    const frameSection = async () => page.evaluate(async id => {
      const THREE = await import('/vendor/three.module.min.js'), { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const f = window.__branchForge; let mesh;
      f.asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === id) mesh = object; });
      mesh.updateWorldMatrix(true, false);
      const t = Number(document.getElementById('trunkSectionT').value) / 100;
      const ring = interpolateSectionRing(mesh.geometry.userData.radiusRings, t, mesh.geometry.attributes.position);
      const center = new THREE.Vector3(...ring.center).applyMatrix4(mesh.matrixWorld), axis = new THREE.Vector3(...ring.tangent).transformDirection(mesh.matrixWorld), x = new THREE.Vector3(...ring.x).transformDirection(mesh.matrixWorld);
      const distance = Math.max(3, ring.localRadius * 7);
      f.controls.target.copy(center); f.camera.position.copy(center).addScaledVector(axis, distance).addScaledVector(x, distance * .12); f.controls.update();
    }, target);
    const visiblePoint = (factor = 1.25) => page.evaluate(async ({ factor }) => {
      const THREE = await import('/vendor/three.module.min.js'), { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const f = window.__branchForge, hs = f.workbench.trunkForm.root.children[1], canvas = document.getElementById('viewport'), rect = canvas.getBoundingClientRect(), sid = document.getElementById('trunkSectionSelect').value; let mesh;
      f.asset.group.traverse(object => { if (object.userData.category === 'branch' && object.userData.stable_id === f.selectedCurvePoint.branchId) mesh = object; });
      hs.updateWorldMatrix(true, true);
      const ring = interpolateSectionRing(mesh.geometry.userData.radiusRings, Number(document.getElementById('trunkSectionT').value) / 100, mesh.geometry.attributes.position), center = new THREE.Vector3(...ring.center);
      const project = local => { const p = local.clone().applyMatrix4(hs.matrixWorld).project(f.camera); return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2, z: p.z }; };
      const markers = hs.children.filter(object => object.isMesh && object.userData.kind).map(object => ({ object, screen: project(object.position) }));
      for (const { object, screen } of markers) {
        if (object.userData.kind !== 'profile' || object.userData.id !== sid || screen.z < -1 || screen.z > 1 || document.elementFromPoint(screen.x, screen.y) !== canvas) continue;
        const nearest = Math.min(...markers.filter(other => other.object !== object).map(other => Math.hypot(other.screen.x - screen.x, other.screen.y - screen.y)));
        const end = project(object.position.clone().sub(center).multiplyScalar(factor).add(center));
        if (nearest > 22 && document.elementFromPoint(end.x, end.y) === canvas) return { start: screen, end, knotId: object.userData.knotId, nearest };
      }
      throw new Error('No isolated visible contour point in current section');
    }, { factor });
    await frameSection(); await focus(); const noMove = await visiblePoint();
    await page.mouse.move(noMove.start.x, noMove.start.y, { steps: 5 });
    const hovered = (await pointState()).find(point => point.knotId === noMove.knotId);
    assert.equal(hovered.color, 0xe6f7ff); assert.equal(hovered.uniformRadius, 7.5);
    await page.mouse.down();
    const active = (await pointState()).find(point => point.knotId === noMove.knotId);
    assert.equal(active.color, 0xff9a52); assert.equal(active.uniformRadius, 7.5);
    assert.equal(await page.locator('[data-section-mode="PROFILE"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#sectionFrontSvg circle[data-knot-id]').count(), 8);
    const frontActive = page.locator(`#sectionFrontSvg circle[data-knot-id="${noMove.knotId}"]`);
    assert.equal(await frontActive.getAttribute('data-dragging'), 'true');
    assert.equal(await frontActive.evaluate(circle => getComputedStyle(circle).fill), 'rgb(255, 154, 82)');
    await page.mouse.up(); await idle(); assert.deepEqual(await snapshot(), firstUnchanged);
    check('hover enlarges and lightens a blue point; press activates orange and synchronizes C/front view, while an unmoved click creates no edit or undo');

    const cancelBefore = await snapshot(), cancelledPoint = await visiblePoint(1.3);
    await page.mouse.move(cancelledPoint.start.x, cancelledPoint.start.y); await page.mouse.down();
    await page.mouse.move(cancelledPoint.end.x, cancelledPoint.end.y, { steps: 8 });
    assert.equal((await snapshot()).history, cancelBefore.history);
    await page.keyboard.press('Escape'); await page.mouse.up(); await idle();
    assert.deepEqual(await snapshot(), cancelBefore); assert.equal(await currentId(), firstId);
    check('Esc cancels an actual contour drag and restores the exact carrier, recipe and history');
    const beforeDrag = await snapshot(), draggedPoint = await visiblePoint(1.3);
    await page.mouse.move(draggedPoint.start.x, draggedPoint.start.y); await page.mouse.down();
    await page.mouse.move(draggedPoint.end.x, draggedPoint.end.y, { steps: 8 });
    assert.equal((await snapshot()).history, beforeDrag.history); await page.mouse.up(); await idle();
    const changed = await snapshot(), profile = changed.form.sections.find(section => section.id === firstId).profile;
    assert.equal(profile.length, 8); assert.ok(profile.find(knot => knot.id === draggedPoint.knotId).radius > 1.1);
    assert.notEqual(changed.trunk, beforeDrag.trunk); assert.equal(changed.history, beforeDrag.history + 1);
    await focus(); await page.keyboard.press('Control+z'); await idle();
    assert.deepEqual((await snapshot()).form, beforeDrag.form); assert.equal((await snapshot()).trunk, beforeDrag.trunk);
    await page.keyboard.press('Control+y'); await idle();
    assert.deepEqual((await snapshot()).form, changed.form); assert.equal((await snapshot()).trunk, changed.trunk);
    check('an actual blue-point drag changes the continuous profile and real carrier geometry once, and undo/redo restore exact shape');

    await page.locator('#trunkSectionSelect').selectOption(secondId);
    const secondPoints = await pointState(); assert.equal(secondPoints.length, 12); assert.ok(secondPoints.every(point => point.id === secondId));
    assert.equal(await page.locator('#sectionFrontSvg circle[data-knot-id]').count(), 12);
    assert.ok((await page.locator('#sectionFrontSvg circle[data-knot-id]').evaluateAll(circles => circles.map(circle => getComputedStyle(circle).fill))).every(fill => fill === 'rgb(85, 197, 255)'));
    await page.locator('#trunkSectionSelect').selectOption(firstId);
    assert.equal((await pointState()).length, 8); assert.ok((await pointState()).every(point => point.id === firstId));
    assert.equal(await page.locator('#sectionFrontSvg circle[data-knot-id]').count(), 8);
    assert.deepEqual(await snapshot(), changed);
    check('selecting another section replaces both viewport and front-view point sets with that section’s own 12/8 knots without edits');

    await frameSection(); const blank = await page.evaluate(() => {
      const canvas = document.getElementById('viewport'), rect = canvas.getBoundingClientRect();
      for (const x of [.2, .75, .3]) for (const y of [.2, .75, .3]) {
        const point = { x: rect.left + rect.width * x, y: rect.top + rect.height * y };
        if (document.elementFromPoint(point.x, point.y) === canvas) return point;
      }
      throw new Error('No unobstructed pointer position');
    });
    await page.mouse.move(blank.x, blank.y); await focus();
    for (const key of ['n', 'Shift+d']) {
      const modalBefore = await snapshot(); await page.keyboard.press(key);
      assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.active), true);
      assert.equal((await pointState()).length, 0);
      await page.keyboard.press('Escape'); await idle(); assert.deepEqual(await snapshot(), modalBefore); assert.equal(await currentId(), firstId);
    }
    check('N placement and Shift+D placement temporarily hide contour points and restore them without leaving an unconfirmed section');
    for (const [key, mode] of [['g', 'SLIDE'], ['r', 'TWIST'], ['s', 'RADIUS']]) {
      await page.mouse.move(blank.x, blank.y); await focus(); const transformBefore = await snapshot();
      await page.keyboard.press(key); assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.active), true);
      assert.equal(await page.locator(`[data-section-mode="${mode}"]`).getAttribute('aria-pressed'), 'true');
      await page.keyboard.press('Escape'); await idle(); assert.deepEqual(await snapshot(), transformBefore);
    }
    check('the direct contour points preserve G/R/S keyboard tools and their exact cancellation');

    await page.mouse.move(blank.x, blank.y); await page.locator('[data-section-mode="SLIDE"]').click(); await frameSection();
    const normal = await pointState(); assert.ok(normal.every(point => point.uniformRadius === 6 && point.radius === 6));
    await page.screenshot({ path: path.join(out, '蓝色截面点_近景.png') });
    const zoomBefore = await page.evaluate(() => { const f = window.__branchForge; return f.camera.position.clone().sub(f.controls.target).length(); });
    await page.evaluate(() => { const f = window.__branchForge; f.camera.position.sub(f.controls.target).multiplyScalar(2.5).add(f.controls.target); f.controls.update(); });
    const zoomAfter = await page.evaluate(() => { const f = window.__branchForge; return f.camera.position.clone().sub(f.controls.target).length(); });
    assert.ok(zoomAfter > zoomBefore * 2); assert.ok((await pointState()).every(point => point.uniformRadius === 6 && point.radius === 6));
    await page.screenshot({ path: path.join(out, '蓝色截面点_远景.png') }); assert.deepEqual(result.shaderErrors, []);
    result.pointStyle = { normal, hovered, active, zoomBefore, zoomAfter };
    check('zoom changes the world view while contour marker radii remain six CSS pixels, with no shader compilation errors');

    const savedState = await snapshot();
    for (const key of ['units', 'instances', 'sources', 'branchIds', 'overrides']) assert.deepEqual(savedState[key], base[key], key + ' unchanged');
    await page.evaluate(() => {
      const original = window.fetch;
      window.fetch = async function (url, options) {
        if (url === '/api/save-project') {
          const prefix = await options.body.slice(0, 12).text(), line = prefix.indexOf('\n'), offset = line + 1 + Number(prefix.slice(0, line));
          const link = document.createElement('a'); link.href = URL.createObjectURL(options.body.slice(offset)); link.download = 'section-points.branch.json'; link.click();
          return new Response(JSON.stringify({ success: true, path: 'section-points.branch.json' }), { headers: { 'Content-Type': 'application/json' } });
        }
        return original.apply(this, arguments);
      };
    });
    await focus(); await page.keyboard.press('Control+s'); await page.waitForSelector('#projectSaveDialog[open]');
    await page.locator('[name="saveMode"][value="FILE"]').check();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#psSubmit').click()]);
    const saved = path.join(out, '香樟_蓝色截面点.branch.json'); await download.saveAs(saved); result.saved = saved;
    await page.reload(); await page.waitForFunction(() => window.__branchForge?.asset); await idle();
    await page.locator('#projectInput').setInputFiles(saved);
    await page.waitForFunction(() => window.__branchForge.authoring.branch_instances.length === 550); await idle();
    await page.locator('#trunkFormSelectRoot').click(); const reloaded = await snapshot();
    for (const key of ['trunk', 'units', 'instances', 'sources', 'form', 'branchIds']) assert.deepEqual(reloaded[key], savedState[key], key + ' fresh file reload');
    check('all 550 complete-unit model/matrix/source hashes stay intact and the actual Ctrl+S download reloads exact edited profile/geometry after full restart');
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
