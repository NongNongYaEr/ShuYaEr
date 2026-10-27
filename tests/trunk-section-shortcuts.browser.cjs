const fs = require('fs'), path = require('path'), assert = require('node:assert/strict'), crypto = require('crypto');
const { chromium } = require(process.env.BRANCHFORGE_PLAYWRIGHT || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const out = path.resolve('.runtime/trunk-section-shortcuts'); fs.mkdirSync(out, { recursive: true });
  const result = { checks: [], errors: [] }, input = path.resolve('assets/tree-template-library/template-c75273b48abc49fbbfa602525f57c083.branch.json');
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), sourceHash = hash(input);
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  let page;
  const check = text => { result.checks.push(text); console.log('OK ' + text); };
  try {
    page = await browser.newPage({ viewport: { width: 1700, height: 1080 } }); page.setDefaultTimeout(180000);
    page.on('pageerror', e => result.errors.push(e.message));
    await page.route('**/api/project-session**', r => r.fulfill({ json: { success: true, items: [] } }));
    await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'), () => page.evaluate(() => document.getElementById('projectSessionPanel').close()));
    const idle = () => page.waitForFunction(() => {
      const f = window.__branchForge;
      return f?.asset && !document.getElementById('brandStartup') && !f.asset.group.userData.pending_rebuild
        && f.asset.authoring === f.authoring && !f.workbench.busy && !f.workbench.trunkForm.active
        && document.getElementById('busyOverlay').hidden && !document.getElementById('projectLoadDialog').open;
    });
    await page.goto(process.argv[2] || 'http://localhost:19915/'); await page.waitForFunction(() => window.__branchForge?.asset); await idle();
    await page.locator('#projectInput').setInputFiles(input);
    await page.waitForFunction(() => window.__branchForge.authoring.branch_instances.length === 550); await idle();
    await page.locator('#trunkFormSelectRoot').click();
    const target = await page.evaluate(() => window.__branchForge.selectedCurvePoint.branchId); result.target = target;
    const snapshot = () => page.evaluate(async id => {
      const f = window.__branchForge;
      const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))).map(n => n.toString(16).padStart(2, '0')).join('');
      let trunk; const units = [];
      f.asset.group.traverse(m => {
        if (m.userData.category === 'branch' && m.userData.stable_id === id) trunk = m;
        if (m.isInstancedMesh) units.push([Array.from(m.instanceMatrix.array), Object.fromEntries(Object.entries(m.geometry.attributes).map(([k, v]) => [k, Array.from(v.array)])), Array.from(m.geometry.index?.array || [])]);
      });
      return { trunk: await digest(Array.from(trunk.geometry.attributes.position.array)), units: await digest(units),
        instances: await digest(f.authoring.branch_instances), sources: await digest(f.authoring.branch_library),
        form: structuredClone(f.authoring.workbench.trunk_forms?.branches[id] || null),
        overrides: await digest(f.authoring.overrides), branchIds: f.asset.masterBranches.map(b => b.stableId),
        selected: f.selectedCurvePoint.branchId, history: f.historyState.undo };
    }, target);
    const canvasFocus = () => page.locator('#viewport').focus();
    const safePointer = async () => {
      await canvasFocus(); const bounds = await page.locator('#viewport').boundingBox();
      const point = [bounds.x + bounds.width * .55, bounds.y + bounds.height * .55];
      await page.mouse.move(...point); return point;
    };
    const placeNewSection = async () => {
      // N now begins surface placement. Frame the real carrier first and
      // choose a visible point on it rather than waiting on an active modal.
      const point = await page.evaluate(async id => {
        const THREE = await import('/vendor/three.module.min.js');
        const { interpolateSectionRing } = await import('/trunk-section-interaction.js');
        const f = window.__branchForge, rect = document.getElementById('viewport').getBoundingClientRect(), carriers = [];
        let mesh;
        f.asset.group.traverse(m => {
          if (!m.isMesh || m.isInstancedMesh || !m.visible || m.userData.category !== 'branch') return;
          carriers.push(m); if (m.userData.stable_id === id) mesh = m;
        });
        mesh.parent.updateWorldMatrix(true, true);
        const rings = mesh.geometry.userData.radiusRings, positions = mesh.geometry.attributes.position;
        const center = new THREE.Vector3(...interpolateSectionRing(rings, .4, positions).center).applyMatrix4(mesh.parent.matrixWorld);
        f.controls.target.copy(center); f.camera.position.copy(center).add({ x: 3, y: -6, z: 2 }); f.controls.update(); f.camera.updateMatrixWorld();
        const ray = new THREE.Raycaster(); carriers.forEach(m => m.updateWorldMatrix(true, false));
        for (const t of [.4, .35, .45, .25, .55, .15, .65]) {
          const p = new THREE.Vector3(...interpolateSectionRing(rings, t, positions).center).applyMatrix4(mesh.parent.matrixWorld).project(f.camera);
          if (Math.abs(p.x) > .9 || Math.abs(p.y) > .8 || p.z < -1 || p.z > 1) continue;
          ray.setFromCamera(new THREE.Vector2(p.x, p.y), f.camera);
          if (ray.intersectObjects(carriers, false)[0]?.object !== mesh) continue;
          return [rect.left + (p.x + 1) * rect.width / 2, rect.top + (1 - p.y) * rect.height / 2];
        }
        throw new Error('No visible carrier surface found for N fixture');
      }, target);
      await canvasFocus(); await page.keyboard.press('n');
      await page.mouse.move(...point); await page.mouse.click(...point); await idle();
    };
    const currentId = () => page.locator('#trunkSectionSelect').inputValue();
    const currentSection = async () => { const state = await snapshot(), id = await currentId(); return state.form.sections.find(s => s.id === id); };
    const base = await snapshot();
    await page.locator('#trunkFormMode').click();
    // This keyboard compatibility suite raycasts the committed carrier.
    // New DIRECT editing defaults to a temporary BASE overlay, so explicitly
    // select FINAL before the existing real-surface N fixture setup.
    await page.locator('#trunkSectionDock [data-section-view="FINAL"]').click(); await safePointer();
    await page.keyboard.press('Delete'); await idle(); assert.deepEqual(await snapshot(), base);
    check('Delete with no section leaves the carrier, selection and history intact');
    await placeNewSection(); const firstId = await currentId();
    await page.locator('#trunkSectionT').fill('30'); await page.locator('#trunkSectionT').press('Enter'); await idle();
    await placeNewSection(); const secondId = await currentId();
    await page.locator('#trunkSectionT').fill('75'); await page.locator('#trunkSectionT').press('Enter'); await idle(); await canvasFocus();
    const beforeCycle = await snapshot();
    await page.keyboard.press('PageUp'); assert.equal(await currentId(), firstId);
    await page.keyboard.press(']'); assert.equal(await currentId(), secondId);
    await page.keyboard.press('['); assert.equal(await currentId(), firstId);
    await page.keyboard.press('PageDown'); assert.equal(await currentId(), secondId);
    await page.keyboard.press('PageUp'); assert.equal(await currentId(), firstId);
    assert.deepEqual(await snapshot(), beforeCycle);
    check('N adds explicitly; PageUp/PageDown and bracket keys cycle along the branch without edits');
    await page.evaluate(id => {
      const f = window.__branchForge, b = f.asset.masterBranches.find(b => b.stableId === id), p = b.points[Math.round((b.points.length - 1) * .4)].clone();
      f.controls.target.copy(p); f.camera.position.copy(p).add({ x: 3, y: -6, z: 2 }); f.controls.update();
    }, target);
    const beforeS = await snapshot(), start = await safePointer();
    await page.keyboard.press('s'); assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.active), true);
    await page.mouse.move(start[0] + 45, start[1], { steps: 8 });
    assert.equal((await snapshot()).history, beforeS.history);
    await page.mouse.click(start[0] + 45, start[1]); await idle(); const afterS = await snapshot();
    assert.ok(Math.abs(afterS.form.sections.find(s => s.id === firstId).radius - 1.45) < 1e-5);
    assert.equal(afterS.history, beforeS.history + 1); assert.equal(afterS.selected, target);
    check('S adjusts radius from the last pointer, click commits exactly once and preserves selection');
    await canvasFocus(); await page.keyboard.press('Control+z'); await idle(); assert.deepEqual((await snapshot()).form, beforeS.form);
    await page.keyboard.press('Control+y'); await idle(); assert.deepEqual((await snapshot()).form, afterS.form);
    assert.equal((await snapshot()).trunk, afterS.trunk);
    check('Ctrl+Z/Y retain global exact undo/redo after section keyboard gestures');

    // Compute the same real section frame and handle projection used by the
    // production controller; the mouse remains at its own screen position.
    const projectedGesture = (action, destinationT) => page.evaluate(async ({ action, destinationT }) => {
      const THREE = await import('/vendor/three.module.min.js');
      const { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const f = window.__branchForge, hs = f.workbench.trunkForm.root.children[1], rect = document.getElementById('viewport').getBoundingClientRect();
      f.workbench.trunkForm.root.updateWorldMatrix(true, true);
      let mesh; f.asset.group.traverse(m => { if (m.userData.category === 'branch' && m.userData.stable_id === f.selectedCurvePoint.branchId) mesh = m; });
      const sectionId = document.getElementById('trunkSectionSelect').value,
        s = f.authoring.workbench.trunk_forms.branches[f.selectedCurvePoint.branchId].sections.find(s => s.id === sectionId),
        r = interpolateSectionRing(mesh.geometry.userData.radiusRings, s.t, mesh.geometry.attributes.position),
        h = hs.children.find(o => o.isMesh && o.userData.action === action && o.userData.id === sectionId);
      const project = p => { p = p.clone().applyMatrix4(hs.matrixWorld).project(f.camera); return [rect.left + (p.x + 1) * rect.width / 2, rect.top + (1 - p.y) * rect.height / 2]; };
      const destination = action === 'SLIDE'
        ? new THREE.Vector3(...interpolateSectionRing(mesh.geometry.userData.radiusRings, destinationT, mesh.geometry.attributes.position).center)
        : h.position.clone().sub(new THREE.Vector3(...r.center)).applyAxisAngle(new THREE.Vector3(...r.tangent), Math.PI / 6).add(new THREE.Vector3(...r.center));
      return { start: project(h.position), end: project(destination) };
    }, { action, destinationT });
    const beforeG = await snapshot(), gStart = await safePointer(); await page.keyboard.press('g');
    const g = await projectedGesture('SLIDE', .46);
    await page.mouse.move(gStart[0] + g.end[0] - g.start[0], gStart[1] + g.end[1] - g.start[1], { steps: 10 });
    await page.keyboard.press('Enter'); await idle(); const afterG = await snapshot();
    assert.ok(Math.abs(afterG.form.sections.find(s => s.id === firstId).t - .46) < .02);
    assert.equal(afterG.history, beforeG.history + 1); assert.equal(afterG.selected, target);
    check('G slides the actual curved branch section; Enter confirms one history entry');
    await page.evaluate(async id => {
      const THREE = await import('/vendor/three.module.min.js'), { interpolateSectionRing } = await import('/trunk-section-interaction.js');
      const f = window.__branchForge; let mesh;
      f.asset.group.traverse(m => { if (m.userData.category === 'branch' && m.userData.stable_id === id) mesh = m; });
      const sid = document.getElementById('trunkSectionSelect').value, s = f.authoring.workbench.trunk_forms.branches[id].sections.find(s => s.id === sid), r = interpolateSectionRing(mesh.geometry.userData.radiusRings, s.t, mesh.geometry.attributes.position);
      mesh.parent.updateWorldMatrix(true, false);
      const center = new THREE.Vector3(...r.center).applyMatrix4(mesh.parent.matrixWorld), axis = new THREE.Vector3(...r.tangent).transformDirection(mesh.parent.matrixWorld), x = new THREE.Vector3(...r.x).transformDirection(mesh.parent.matrixWorld);
      f.controls.target.copy(center); f.camera.position.copy(center).addScaledVector(axis, 5).addScaledVector(x, .4); f.controls.update();
    }, target);
    const beforeR = await snapshot(), rStart = await safePointer(); await page.keyboard.press('r'); const r = await projectedGesture('TWIST');
    await page.mouse.move(rStart[0] + r.end[0] - r.start[0], rStart[1] + r.end[1] - r.start[1], { steps: 10 });
    await page.keyboard.press('Enter'); await idle(); const afterR = await snapshot();
    assert.ok(Math.abs(afterR.form.sections.find(s => s.id === firstId).roll - beforeR.form.sections.find(s => s.id === firstId).roll - 30) < 1);
    assert.notEqual(afterR.trunk, beforeR.trunk); assert.equal(afterR.history, beforeR.history + 1);
    check('R follows the 3D rotation ring and twists the local section by 30 degrees');
    for (const confirmation of ['Escape', 'right']) {
      const before = await snapshot(), p = await safePointer(); await page.keyboard.press('s');
      await page.mouse.move(p[0] + 30, p[1], { steps: 5 });
      if (confirmation === 'right') await page.mouse.click(p[0] + 30, p[1], { button: 'right' });
      else await page.keyboard.press('Escape');
      await idle(); assert.deepEqual(await snapshot(), before); assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.enabled), true);
    }
    const noMovement = await snapshot(); await safePointer(); await page.keyboard.press('Alt+s'); await page.keyboard.press('Enter'); await idle(); assert.deepEqual(await snapshot(), noMovement);
    check('Escape/right-click cancellation and unmoved Alt+S confirmation preserve the exact model and history');

    const beforeTab=await snapshot(),tabPointer=await safePointer();await page.keyboard.press('s');await page.mouse.move(tabPointer[0]+20,tabPointer[1]);await page.keyboard.press('Tab');await idle();assert.deepEqual(await snapshot(),beforeTab);
    check('moving keyboard focus away from the viewport cancels the unconfirmed section gesture');

    await canvasFocus(); await page.keyboard.press('c');
    assert.equal(await page.locator('[data-section-mode="PROFILE"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.enabled), true);
    const beforeFocus = await page.evaluate(() => { const f = window.__branchForge; return f.camera.position.clone().sub(f.controls.target).toArray(); });
    await page.keyboard.press('f');
    const afterFocus = await page.evaluate(() => { const f = window.__branchForge; return f.camera.position.clone().sub(f.controls.target).toArray(); });
    afterFocus.forEach((n, i) => assert.ok(Math.abs(n - beforeFocus[i]) < 1e-8));
    const offscreenBefore=await snapshot(),savedCamera=await page.evaluate(()=>{const f=window.__branchForge,saved={position:f.camera.position.toArray(),target:f.controls.target.toArray()},offset=f.camera.position.clone().setFromMatrixColumn(f.camera.matrixWorld,0).multiplyScalar(1000);f.camera.position.add(offset);f.controls.target.add(offset);f.controls.update();return saved;});
    await page.keyboard.press('g');assert.equal(await page.evaluate(()=>window.__branchForge.workbench.trunkForm.active),false);assert.deepEqual(await snapshot(),offscreenBefore);assert.match(await page.locator('#trunkFormStatus').textContent(),/按 F 定位/);
    const offscreenDepth=await page.evaluate(()=>{const f=window.__branchForge,hs=f.workbench.trunkForm.root.children[1],h=hs.children.find(o=>o.isMesh&&o.userData.action==='SLIDE');hs.updateWorldMatrix(true,false);return h.position.clone().applyMatrix4(hs.matrixWorld).project(f.camera).z;});assert.ok(offscreenDepth>=-1&&offscreenDepth<=1,'offscreen protection also checks x/y, not only camera depth');
    await page.evaluate(saved=>{const f=window.__branchForge;f.camera.position.fromArray(saved.position);f.controls.target.fromArray(saved.target);f.controls.update();},savedCamera);
    check('a section beyond the screen edge cannot start an invisible transform; F guidance is shown');
    await page.keyboard.press('p'); await page.locator('#sectionPresetLibrary').waitFor({ state: 'visible' });
    await page.keyboard.press('Shift+p'); assert.equal(await page.evaluate(() => document.activeElement.id), 'sectionPresetName');
    await page.locator('#sectionPresetName').fill('临时输入'); const beforeTyping = await snapshot();
    await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); await page.keyboard.type('cp');
    assert.equal(await page.locator('#sectionPresetName').inputValue(), 'cp'); assert.deepEqual(await snapshot(), beforeTyping);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sectionPresetLibrary').isVisible(), false); assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.enabled), true);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'viewport');
    check('C stays in section outline mode; F preserves direction; P/Shift+P open the library and typing is protected');

    const beforeDialog = await snapshot(); await page.locator('#openResourceCenter').click();
    await page.keyboard.press('g'); await page.keyboard.press('Delete'); await page.keyboard.press('c');
    assert.deepEqual(await snapshot(), beforeDialog); assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.active), false);
    await page.locator('#resourceCenterDismiss').click();
    check('real resource dialog blocks section and carrier shortcuts');
    await page.locator('#localLocked').evaluate(input => { for (let parent = input.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true; });
    await page.locator('#localLocked').check(); await idle(); await canvasFocus(); const locked = await snapshot();
    await page.keyboard.press('Delete'); await page.keyboard.press('g'); await page.keyboard.press('n'); await idle();
    assert.deepEqual(await snapshot(), locked); assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.active), false);
    await page.keyboard.press('Control+z'); await idle();
    check('locked carrier consumes Delete/G/N without pruning or changing its section');

    await canvasFocus(); const beforeRemove = await snapshot(); await page.keyboard.press('Delete'); await idle(); const afterRemove = await snapshot();
    assert.equal(afterRemove.form.sections.length, 1); assert.equal(afterRemove.form.sections[0].id, secondId);
    assert.deepEqual(afterRemove.branchIds, beforeRemove.branchIds); assert.equal(afterRemove.history, beforeRemove.history + 1);
    await page.keyboard.press('Control+z'); await idle(); assert.deepEqual((await snapshot()).form, beforeRemove.form);
    check('Delete removes only the active section and Ctrl+Z restores it');
    await canvasFocus(); await page.keyboard.press('v'); assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.enabled), false);
    await page.keyboard.press('c'); assert.equal(await page.locator('[data-viewport-tool="COMB"]').first().getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('v');
    await page.locator('#trunkFormMode').click(); await canvasFocus(); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__branchForge.workbench.trunkForm.enabled), false);
    check('V/Escape exit section mode and existing outside-mode C/V remain available');
    await page.locator('#trunkFormMode').click(); await canvasFocus(); await page.keyboard.press('c');
    const savedState = await snapshot();
    for (const key of ['units', 'instances', 'sources']) assert.equal(savedState[key], base[key], key + ' unchanged');
    check('all 550 complete-unit geometry, matrices, source models and instance records stay unchanged');
    await page.screenshot({ path: path.join(out, '截面快捷键编辑.png') });
    await page.evaluate(() => {
      const original = window.fetch;
      window.fetch = async function (url, options) {
        if (url === '/api/save-project') {
          const prefix = await options.body.slice(0, 12).text(), line = prefix.indexOf('\n'), offset = line + 1 + Number(prefix.slice(0, line));
          const a = document.createElement('a'); a.href = URL.createObjectURL(options.body.slice(offset)); a.download = 'section-shortcuts.branch.json'; a.click();
          return new Response(JSON.stringify({ success: true, path: 'section-shortcuts.branch.json' }), { headers: { 'Content-Type': 'application/json' } });
        }
        return original.apply(this, arguments);
      };
    });
    await page.keyboard.press('Control+s'); await page.waitForSelector('#projectSaveDialog[open]');
    await page.locator('[name="saveMode"][value="FILE"]').check();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#psSubmit').click()]);
    const saved = path.join(out, '香樟_截面快捷键.branch.json'); await download.saveAs(saved); result.saved = saved;
    await page.reload(); await page.waitForFunction(() => window.__branchForge?.asset); await idle();
    await page.locator('#projectInput').setInputFiles(saved);
    await page.waitForFunction(() => window.__branchForge.authoring.branch_instances.length === 550); await idle();
    await page.locator('#trunkFormSelectRoot').click(); const reloaded = await snapshot();
    for (const key of ['trunk', 'units', 'instances', 'sources', 'form', 'branchIds']) assert.deepEqual(reloaded[key], savedState[key], key + ' fresh reload');
    check('Ctrl+S actual downloaded project survives full page restart and file reload exactly');
    assert.equal(hash(input), sourceHash); assert.deepEqual(result.errors, []); result.passed = true;
    console.log(JSON.stringify({ passed: true, checks: result.checks.length, target }));
  } catch (error) {
    result.failure = error.stack || error.message;
    if (page) await page.screenshot({ path: path.join(out, '失败现场.png') }).catch(() => {});
    throw error;
  } finally {
    await browser.close(); fs.writeFileSync(path.join(out, '验收.json'), JSON.stringify(result, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
