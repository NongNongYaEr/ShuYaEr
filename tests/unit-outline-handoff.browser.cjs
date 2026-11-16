const fs = require('fs'), path = require('path'), assert = require('node:assert/strict'), crypto = require('crypto');
const { chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// Instrument only an isolated test page. The generation Promise's first rAF is
// delayed once after pointerup so real render frames cover the preview handoff.
// Main animate/render and input continue normally; no production file is edited.
(async () => {
 const url = process.argv[2] || 'http://localhost:19840', phase = process.argv.includes('--after') ? 'after' : 'before';
 const out = path.resolve(process.env.BRANCHFORGE_HANDOFF_OUTPUT||'.runtime/unit-outline-handoff'); fs.mkdirSync(out, { recursive: true });
 const fixed = JSON.parse(fs.readFileSync('.runtime/unit-edit-performance/fixed-inputs.json', 'utf8'));
 const files = { dense: path.resolve('初始样本/全植物新次枝装配V2/香樟/工程.branch.json'), legacy: path.resolve('.runtime/unit-box-selection/真实草稿只读副本.branch.json') };
 const sha = value => crypto.createHash('sha256').update(value).digest('hex'), originalHashes = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, sha(fs.readFileSync(f))]));
 assert.deepEqual(originalHashes, fixed.sourceHashes);
 const report = { phase, cases: [], errors: [], sourceWrites: [], blockedWrites: [], methodology: 'Real C mouse gestures and renderer.render observations. For asynchronous rebuilds one native generation Promise rAF is delayed 450ms, main render loop unchanged. Synchronous complete-instance commits require no pending frame and are checked on their first rendered committed frame. Positions derived independently from final GPU matrices and rest points; Float32 tolerance 1e-5m.' };
 const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true }); let page;
 const idle = () => page.waitForFunction(() => { const f = window.__branchForge; return f?.asset && !document.getElementById('brandStartup') && !f.asset.group.userData.pending_rebuild && f.asset.authoring === f.authoring && !f.workbench.busy && !f.editUiPending && document.getElementById('busyOverlay').hidden && !document.getElementById('projectLoadDialog').open; });
 const field = (id, v) => page.locator('#' + id).evaluate((e, v) => { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
 async function open() {
  page = await browser.newPage({ viewport: fixed.viewport }); page.setDefaultTimeout(120000); page.on('pageerror', e => report.errors.push(e.stack));
  if (phase === 'before') for (const name of fs.readdirSync(path.join(out, 'before-source')).filter(n => n.endsWith('.js'))) await page.route('**/' + name, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(out, 'before-source', name)) }));
  await page.route('**/api/project-session**', r => r.fulfill({ json: { success: true, items: [] } }));
  await page.route('**/api/branch-thumbnails**', r => { if (r.request().method() === 'GET') return r.continue(); report.blockedWrites.push(r.request().url()); return r.fulfill({ json: { success: true } }); });
  for (const pattern of ['**/api/branch-asset**', '**/api/save-project']) await page.route(pattern, r => { if (r.request().method() === 'GET') return r.continue(); report.sourceWrites.push(r.request().url()); return r.fulfill({ status: 409, json: { success: false, error: 'isolated outline acceptance cannot publish or save sources' } }); });
  await page.addLocatorHandler(page.locator('#projectSessionPanel[open]'), () => page.evaluate(() => document.getElementById('projectSessionPanel').close()));
  await page.goto(url); await idle();
 }
 async function load(file, camera) {
  const uuid = await page.evaluate(() => window.__branchForge.asset.group.uuid); await page.locator('#projectInput').setInputFiles(file);
  await page.waitForFunction(uuid => window.__branchForge.asset.group.uuid !== uuid || [...document.querySelectorAll('dialog[open] button')].some(b => b.textContent.trim() === '直接打开'), uuid);
  const confirm = page.getByRole('button', { name: '直接打开', exact: true }); if (await confirm.isVisible()) await confirm.click();
  await page.waitForFunction(uuid => window.__branchForge.asset.group.uuid !== uuid, uuid); await idle();
  await page.evaluate(c => { const f = window.__branchForge; f.controls.enableDamping = false; f.camera.position.fromArray(c.position); f.camera.up.fromArray(c.up); f.controls.target.fromArray(c.target); f.camera.zoom = c.zoom; f.camera.updateProjectionMatrix(); f.controls.update(); f.camera.updateMatrixWorld(); }, camera);
  await page.locator('#branchEditScopeBar [data-tree-selection-kind="INSTANCE"]').click(); await page.locator('#branchEditScope').selectOption('DIRECT');
 }
 const selectRoots = async roots => { for (let i = 0; i < roots.length; i++) await page.locator('#branchOutliner button').filter({ has: page.locator('span', { hasText: new RegExp('^' + roots[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).click(i ? { modifiers: ['Shift'] } : {}); };
 const summary = () => page.evaluate(async () => { const f = window.__branchForge, encode = async x => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(x))))).join(','); return { summary: structuredClone(f.workbench.assemblyLinks.state.summary), history: f.historyState, instances: structuredClone(f.authoring.branch_instances), source: await encode(f.authoring.branch_library), layers: structuredClone(f.authoring.sculpt_layers), counts: [f.asset.masterBranches.length, f.asset.masterPlacements.length, f.asset.treeOrgans.length], gpu: f.asset.isInstancedAssembly }; });
 async function observe() {
  await page.evaluate(() => {
   const f = window.__branchForge, originalRender = f.renderer.render.bind(f.renderer), originalRaf = window.requestAnimationFrame.bind(window);
   const p = window.__outlineHandoff = { recording: false, armed: false, gateCount: 0, frames: [], events: [], expected: null, rest: null, preview: null, error: null,owner:f.asset.group.uuid,commitAt:null };
   const outlines = () => {
    const group = f.modelRoot.getObjectByName('枝束选择轮廓'), result = {};
    if (!group?.visible) return result;
    for (const line of group.children) if (line.visible && line.geometry?.getAttribute('position')) for(const range of line.userData.branch_ranges||[]){const p=line.geometry.attributes.position.array,positions=Array.from(p.slice(range.offset*3,range.offset*3+3));for(let n=1;n<range.count;n+=2)positions.push(...p.slice((range.offset+n)*3,(range.offset+n+1)*3));result[range.id]={positions,transform:null};}
    return result;
   };
   const scope = () => { const group = f.modelRoot.getObjectByName('单元枝编辑范围'); let visible = Boolean(group); for(let parent=group;parent;parent=parent.parent)visible &&= parent.visible; const positions=[];for(const line of group?.children||[])if(line.visible&&line.geometry?.getAttribute('position'))positions.push(...line.geometry.getAttribute('position').array);return{visible:visible&&positions.length>0,positions,children:group?.children.length||0}; };
   const scopeExpected = (lines, cpu = false) => { const positions=[];for(const b of f.asset?.masterBranches||[])if(lines?.[b.stableId]){const points=cpu?b.points.flatMap(p=>[Math.fround(p.x),Math.fround(p.y),Math.fround(p.z)]):lines[b.stableId].positions;for(let i=3;i<points.length;i+=3)positions.push(...points.slice(i-3,i+3));}return{positions}; };
   const scopeDifference = (current, expected) => {if(!current.visible)return{max:0,mismatch:false,hidden:true};if(current.positions.length!==expected.positions.length)return{max:null,mismatch:true};let max=0;for(let i=0;i<current.positions.length;i++)max=Math.max(max,Math.abs(current.positions[i]-expected.positions[i]));return{max,mismatch:false,hidden:false};};
   const difference = (current, expected) => { let max = 0, mismatch = false; if (!expected || Object.keys(current).length !== Object.keys(expected).length) return { max: null, mismatch: true }; for (const [id, next] of Object.entries(current)) { const previous = expected[id]?.positions; if (!previous || previous.length !== next.positions.length) { mismatch = true; continue; } for (let i = 0; i < previous.length; i++) max = Math.max(max, Math.abs(previous[i] - next.positions[i])); } return { max, mismatch }; };
   const preview = () => {
    const active = f.asset?.activeEditPreview, samples = [];
    if (active) f.asset.group.traverse(mesh => { if (!mesh.isMesh || !mesh.geometry?.hasAttribute('duckEditVertex') || samples.length >= 12) return; for (let n = 0; n < Math.min(3, mesh.geometry.getAttribute('position').count); n++) { const value = active.vertex(mesh, n, 0); if (value) samples.push([mesh.uuid, n, value.toArray()]); } });
    return { active: Boolean(active), textures: active?.textures.map(t => t.uuid) || [], samples };
   };
   p.outlines = outlines; p.scope=scope;p.scopeExpected=scopeExpected;p.scopeDifference=scopeDifference;p.previewState = preview; p.difference = difference;
   p.bindPreview = () => { const active=f.asset.activeEditPreview,original=active.updateTransforms.bind(active),axes=new Set(Object.keys(outlines())),bases=f.asset.masterBranches.filter(b=>axes.has(b.stableId)).map(b=>({id:b.id,stableId:b.stableId,points:b.points.map(p=>p.clone())}));p.gpuUpdates=0;
    active.updateTransforms=function(transforms){const result=original(transforms);p.gpuUpdates++;p.expected={};for(const b of bases){const matrix=transforms.get(b.id)?.matrix;p.expected[b.stableId]={positions:b.points.flatMap(base=>{const point=matrix?base.clone().applyMatrix4(matrix):base;return[Math.fround(point.x),Math.fround(point.y),Math.fround(point.z)];}),transform:matrix?.elements.slice()||null};}p.expectedScope=scopeExpected(p.expected);p.preview=preview();return result;};
   };
   const originalEnd=f.unitComb.end.bind(f.unitComb);f.unitComb.end=function(event){try{return originalEnd(event);}finally{p.commitAt=performance.now();p.events.push({event:'pointerup-controller-complete',t:p.commitAt});}};
   window.requestAnimationFrame = function (callback) {
    if (p.armed && !p.gateCount && f.asset?.group.userData.pending_rebuild && /\[native code\]/.test(Function.prototype.toString.call(callback))) {
     p.gateCount++; p.events.push({ event: 'generation-promise-gated', t: performance.now(), pending: true });
     return originalRaf(t => setTimeout(() => { p.events.push({ event: 'generation-promise-released', t: performance.now() }); callback(t); }, 450));
    }
    return originalRaf(callback);
   };
   f.renderer.render = function (scene, camera) {
    if (p.recording && scene === f.scene && camera === f.camera) {
     try {
      const current = outlines(), pending = Boolean(f.asset?.group.userData.pending_rebuild), gpu = preview(),secondary=scope();
      const entry = { t: performance.now(), pending, asset: f.asset?.group.uuid, active: f.unitComb.active, lines: Object.keys(current), transforms: Object.values(current).filter(l => l.transform).length, difference: difference(current, p.expected), restDifference: difference(current, p.rest), scope:{visible:secondary.visible,vertices:secondary.positions.length/3,difference:scopeDifference(secondary,p.expectedScope)}, preview: gpu, gpuFinalPreviewMatches:JSON.stringify(gpu)===JSON.stringify(p.preview) };
      p.frames.push(entry); if (p.frames.length > 150) p.frames.shift();
     } catch (error) { p.error = error.stack; }
    }
    return originalRender(scene, camera);
   };
  });
 }
 async function stroke(name, point, radius) {
  const before = await summary(); assert.equal(before.summary.selected, 4); assert.equal(before.summary.editable, 4);
  await page.locator('#viewport').focus(); await page.keyboard.press('c'); await page.locator('#unitBrushEffect').selectOption('TURN');
  await field('sculptRadius', radius); await field('sculptStrength', .95); await field('sculptHardness', 1); await page.locator('#unitBrushHitMode').selectOption('THROUGH');
  await page.mouse.move(point.x, point.y); await observe();
  await page.evaluate(() => { const p = window.__outlineHandoff; p.rest = p.outlines(); });
  await page.mouse.down(); await page.waitForFunction(() => window.__branchForge.unitComb.active);
  await page.evaluate(()=>window.__outlineHandoff.bindPreview());
  await page.mouse.move(point.x + 160, point.y - 100, { steps: 12 }); await page.waitForTimeout(100);
  const last = await page.evaluate(() => { const f = window.__branchForge, p = window.__outlineHandoff, d = f.unitComb.debug;p.preview = p.previewState(); p.recording = true; p.armed = true; p.events.push({ event: 'last-preview-before-pointerup', t: performance.now() });const scope=p.scope(); return { units: d.units, targets: d.targets, mode: d.preview?.mode, movement: p.difference(p.expected, p.rest), lines: Object.keys(p.expected), transforms: Object.values(p.expected).filter(l => l.transform).length,scope:{visible:scope.visible,vertices:scope.positions.length/3,difference:p.scopeDifference(scope,p.expectedScope)} }; });
  assert.equal(last.units, 4, 'all four selected complete units actually turn'); assert.equal(last.mode, 'GPU'); assert.ok(last.movement.max > .02, 'yellow axes visibly turn, not a zero-movement handoff'); assert.ok(last.transforms > 0);
  await page.screenshot({ path: path.join(out, phase + '-' + name + '-preview.png') });
  await page.mouse.up();
  if(phase==='after'&&name==='dense'){await idle();await page.waitForFunction(()=>{const p=window.__outlineHandoff;return p.commitAt!==null&&p.frames.some(f=>f.t>=p.commitAt&&!f.pending);});await page.screenshot({path:path.join(out,phase+'-'+name+'-committed.png')});}
  else{await page.waitForFunction(() => window.__outlineHandoff.gateCount === 1 && window.__outlineHandoff.frames.some(f => f.pending));await page.screenshot({ path: path.join(out, phase + '-' + name + '-pending.png') }); await idle();}
  await page.waitForTimeout(80);
  const capture = await page.evaluate(() => { const f = window.__branchForge, p = window.__outlineHandoff; p.recording = false; const final = p.outlines(), finalCpu = {}; for (const id of Object.keys(final)) { const b = f.asset.masterBranches.find(b => b.stableId === id); finalCpu[id] = b ? { positions: b.points.flatMap(point => [Math.fround(point.x), Math.fround(point.y), Math.fround(point.z)]) } : null; }const scope=p.scope(); return { lastPreview: p.expected, rest: p.rest, frames: p.frames, events: p.events, gateCount: p.gateCount, observerError: p.error, final, finalCpu, finalCpuDifference: p.difference(final, finalCpu), finalPreviewDifference: p.difference(final, p.expected),scope:{...scope,difference:p.scopeDifference(scope,p.scopeExpected(p.expected,true))}, preview: p.preview, status: document.getElementById('statusText').textContent }; });
  const after = await summary(); assert.equal(after.history.undo, before.history.undo + 1); assert.equal(after.source, before.source); assert.deepEqual(after.counts, before.counts);
  if (name === 'dense') { const changed = after.instances.filter((i, n) => JSON.stringify(i) !== JSON.stringify(before.instances[n])).map(i => i.id); assert.deepEqual(changed.sort(), [...fixed.dense.ids].sort()); assert.equal(after.gpu, true);if(phase==='before')assert.match(capture.status, /INSTANCE_TRANSFORMS/);else{const immediate=await page.evaluate(()=>{const f=window.__branchForge,p=window.__outlineHandoff;return{immediate:f.editTimings.generation?.immediate,sameAsset:f.asset.group.uuid===p.owner,authoringCurrent:f.asset.authoring===f.authoring,firstCommitted:p.frames.find(f=>f.t>=p.commitAt&&!f.pending)};});assert.equal(immediate.immediate,true);assert.equal(immediate.sameAsset,true);assert.equal(immediate.authoringCurrent,true);assert.equal(immediate.firstCommitted.difference.mismatch,false);assert.equal(immediate.firstCommitted.difference.max,0);report.immediate=immediate;} }
  else { assert.deepEqual(after.instances, before.instances); assert.equal(after.layers.length, before.layers.length + 1); assert.deepEqual(after.layers.at(-1).operation.records.map(r => r.owner).sort(), [...fixed.legacyRegion.ids].sort()); }
  const pending = capture.frames.filter(f => f.pending), wrong = pending.filter(f => f.difference.mismatch || f.difference.max > 1e-5), wrongScope=pending.filter(f=>f.scope.difference.mismatch||f.scope.difference.max>1e-5),lostPreview = pending.filter(f => !f.preview.active);
  await page.locator('#viewport').focus();await page.keyboard.press('v');await page.waitForTimeout(60);const afterV=await page.evaluate(()=>{const f=window.__branchForge,p=window.__outlineHandoff,scope=p.scope(),lines=p.outlines(),cpu={};for(const id of Object.keys(lines)){const b=f.asset.masterBranches.find(b=>b.stableId===id);cpu[id]={positions:b.points.flatMap(point=>[Math.fround(point.x),Math.fround(point.y),Math.fround(point.z)])};}return{scopeVisible:scope.visible,mainDifference:p.difference(lines,cpu)};});
  // V legitimately clears the secondary range. A real range-control input,
  // even at the same value, exercises its cache against the latest runtime graph.
  await page.locator('#instanceGhostOpacity').evaluate(e=>e.dispatchEvent(new Event('input',{bubbles:true})));await page.waitForTimeout(50);
  const selectedScope=await page.evaluate(()=>{const p=window.__outlineHandoff,scope=p.scope();return{visible:scope.visible,vertices:scope.positions.length/3,difference:p.scopeDifference(scope,p.scopeExpected(p.expected,true))};});
  const afterRange=await summary();assert.deepEqual(afterRange.instances,after.instances);assert.deepEqual(afterRange.layers,after.layers);assert.equal(afterRange.source,after.source);assert.deepEqual(afterRange.history,after.history);assert.equal(afterRange.summary.selected,4);
  const result = { name, last, gateCount: capture.gateCount, pendingFrames: pending.length, wrongPendingFrames: wrong.length, maximumPendingError: Math.max(0, ...pending.map(f => f.difference.max || 0)), batchedGeometryPendingFrames: pending.length, gpuPreviewLostFrames: lostPreview.length,gpuFinalPreviewDriftFrames:pending.filter(f=>!f.gpuFinalPreviewMatches).length,scopeWrongPendingFrames:wrongScope.length,scopeMaximumPendingError:Math.max(0,...pending.map(f=>f.scope.difference.max||0)),scopeFinal:capture.scope.difference,afterV,scopeRestoredFromRealRangeInput:selectedScope, finalCpuDifference: capture.finalCpuDifference, finalPreviewDifference: capture.finalPreviewDifference, events: capture.events, status: capture.status };
  fs.writeFileSync(path.join(out, phase + '-' + name + '-frames.json'), JSON.stringify(capture, null, 2)); report.cases.push(result); console.log(name, JSON.stringify(result));
  assert.equal(capture.observerError, null);if(phase==='after'&&name==='dense'){assert.equal(capture.gateCount,0,'synchronous normal placement does not wait for generation rAF');assert.equal(pending.length,0,'immediate complete-instance commit renders no pending frame');}else assert.ok(pending.length >= 1, 'at least one actual pending renderer frame observed'); assert.equal(lostPreview.length, 0, 'GPU final preview survives every pending frame');assert.equal(result.gpuFinalPreviewDriftFrames,0,'GPU texture identity and sampled displaced vertices retain final pointerup update'); assert.equal(capture.finalCpuDifference.mismatch, false); assert.equal(capture.finalCpuDifference.max, 0, 'final outline exactly equals latest master points converted to Float32'); assert.equal(capture.finalPreviewDifference.mismatch, false); assert.ok(capture.finalPreviewDifference.max < 1e-5, 'rebuilt latest model preserves the preview pose');
  assert.equal(afterV.mainDifference.mismatch,false);assert.equal(afterV.mainDifference.max,0,'V main selection outline matches latest CPU points without changing selection');
  if (phase === 'after') {assert.equal(wrong.length, 0, 'yellow axes must retain last displayed preview on EVERY pending rendered frame');assert.equal(wrongScope.length,0,'visible instance-edit scope must follow final preview, or be hidden in C');assert.equal(capture.scope.difference.mismatch,false);assert.ok(capture.scope.difference.max<=1e-5,'no visible stale scope after latest model replacement');assert.equal(selectedScope.visible,true,'range control restores selected instance scope');assert.equal(selectedScope.difference.mismatch,false);assert.equal(selectedScope.difference.max,0,'selected scope uses latest master points after same-asset fast reuse');}
  await page.screenshot({ path: path.join(out, phase + '-' + name + '-final.png') });
 }
 try {
  await open(); await load(files.dense, fixed.denseCamera); await selectRoots(fixed.dense.roots); await stroke('dense', fixed.dense.point, 700); await page.close();
  await open(); await load(files.legacy, fixed.legacyCamera); const r = fixed.legacyRegion; await page.locator('#viewport').focus(); await page.keyboard.down('Shift'); await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(r.x + r.width, r.y + r.height, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Shift'); await idle(); assert.equal((await summary()).summary.legacySelected, 4); await stroke('legacy', { x: r.x + r.width / 2, y: r.y + r.height / 2 }, 1200);
  assert.deepEqual(report.errors, []); assert.deepEqual(report.sourceWrites, []); assert.deepEqual(Object.fromEntries(Object.entries(files).map(([k, f]) => [k, sha(fs.readFileSync(f))])), originalHashes);
  report.reproduced = report.cases.some(c => c.wrongPendingFrames > 0||c.scopeWrongPendingFrames>0||c.scopeRestoredFromRealRangeInput.difference.mismatch||c.scopeRestoredFromRealRangeInput.difference.max>1e-5); if (phase === 'before') assert.equal(report.reproduced, true, 'baseline must reproduce the yellow-outline handoff regression'); report.passed = true;
 } catch (error) { report.failure = error.stack; await page?.screenshot({ path: path.join(out, phase + '-failure.png') }).catch(() => {}); throw error; }
 finally { await browser.close(); report.browserClosed = true; fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(report, null, 2)); }
 console.log(JSON.stringify({ phase, passed: report.passed, reproduced: report.reproduced, cases: report.cases, report: path.join(out, phase + '.json') }));
})().catch(error => { console.error(error); process.exitCode = 1; });
