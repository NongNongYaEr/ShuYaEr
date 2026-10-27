// Reuse live DOM controls so folding/moving UI never writes authoring data.
export function arrangeCompanionPanels() {
  const $ = id => document.getElementById(id);
  const details = (id, title, parent) => {
    const node = document.createElement('details'); node.id = id; node.className = 'companion-advanced';
    const summary = document.createElement('summary'); summary.textContent = title; node.append(summary); parent.append(node); return node;
  };
  const grid = parent => { const node = document.createElement('div'); node.className = 'field-grid'; parent.append(node); return node; };
  const moveFields = (ids, parent) => ids.forEach(id => { const row = $(id)?.closest('label'); if (row) parent.append(row); });
  const note = (parent, text) => { const p = document.createElement('p'); p.className = 'companion-note'; p.textContent = text; parent.append(p); return p; };
  const context = $('contextProperties'), current = $('currentBranchPanel'), editor = $('branchEditor');
  const shortcuts = document.createElement('p'); shortcuts.className = 'companion-shortcuts'; shortcuts.innerHTML = '<kbd>G</kbd> 移动 <kbd>R</kbd> 旋转 <kbd>S</kbd> 缩放 <kbd>Alt S</kbd> 粗细'; editor.prepend(shortcuts);

  // Keep scope/isolation close to the object being edited, not in a duplicate
  // toolbar halfway down the left-side generation controls.
  const selection = document.createElement('div'); selection.id = 'selectionCompanion'; selection.className = 'selection-companion';
  current.insertBefore(selection, $('selectionEmpty'));
  const selectionActions = $('bundlePanel').querySelector('[aria-label="选择范围操作"]');
  const names = {ALL:'全选',NONE:'清空',INVERT:'反选',SUBTREE:'整束',GROW:'扩大',SHRINK:'缩小'};
  for (const button of selectionActions.children) { const span = document.createElement('span'); span.textContent = names[button.dataset.selectionAction]; button.append(span); }
  selection.append(selectionActions, $('isolateSelectionBtn'));
  const selectionMore = details('selectionScopeOptions', '范围与框选选项', selection);
  selectionMore.append($('regionOperation').closest('label'));
  // Move the original leaf amount and shape lock above transform coordinates.
  const applyMode = $('localApplyMode').closest('label'); applyMode.before(shortcuts);
  const common = grid(editor); moveFields(['localLeaves'], common);
  editor.insertBefore(common, applyMode.nextSibling);
  const primaryActions = document.createElement('div'); primaryActions.className = 'button-grid branch-auto-actions';
  ['resetBranchEdit','duplicateBranch','mirrorBranch','rebuildControlCurveBtn'].forEach(id => primaryActions.append($(id)));
  const flags = $('localLocked').closest('.switch-list'); common.after(flags, primaryActions);
  const autoHint = document.createElement('p'); autoHint.className = 'hint'; autoHint.textContent = '调节自动生效 · Esc 取消本次调节'; flags.before(autoHint);
  const oldButtons = $('pruneBranch').parentElement;

  const pointBlock = $('pointLabel').closest('.subtool-block'); pointBlock.id = 'pointCompanion'; pointBlock.hidden = true;
  primaryActions.after(pointBlock);
  const pointHint = pointBlock.querySelector('.hint');
  pointHint.textContent = '拖空白框选点，Shift 加选、Ctrl 点选切换；Ctrl 在线上单击加点。Delete 只删选点，端点和固定点保留；中键观察。';
  const pointExtra = details('pointNumericAdvanced', '精确坐标、点数与修剪', editor);
  const pointExtraGrid = grid(pointExtra);
  moveFields(['pointX','pointY','pointZ','tangentMode','tangentLength','curveKnotCount','curveSmoothStrength'], pointExtraGrid);
  const pointButtons = $('applyPointBtn').parentElement; pointExtra.append(pointButtons);
  const divider = $('curvePointStats').parentElement;
  pointExtra.append(divider, $('curveSimplifyTolerance').closest('.field-grid'), $('insertPointBtn').parentElement);
  const pointModes = details('pointModeAdvanced', '拖点方式 · 1–6', pointBlock);
  pointModes.append(pointBlock.querySelector('.curve-mode-toolbar'));

  const exact = details('branchNumericAdvanced', '精确数值 · 长度、粗细与姿态', editor);
  note(exact, '拖动时预览，松手自动生效；输入数值后回车或离开输入框完成。相对调整以本次操作前的数值为基准，Esc 取消。');
  moveFields(['localLength','localRadius','localBend','localRotX','localRotY','localRotZ','localOffsetZ'], grid(exact));
  const branchMore = details('branchCommandsAdvanced', '更多枝干操作与挂接数值', editor);
  branchMore.append(oldButtons, $('branchMountPanel'), $('reparentTarget').closest('.subtool-block'));
  // Remove only emptied layout shells; every input/button remains the original.
  for (const empty of editor.querySelectorAll('.field-grid:empty, .button-grid:empty')) empty.remove();
  const sources = $('overrideProperties');
  if (sources) details('selectionSourcesAdvanced', '参数来源与局部恢复', editor).append(sources);

  // Transform origin/root options accompany the selected transform tool; XYZ
  // entry remains available at the bottom of that panel.
  const transform = $('bundleTransformOptions'); transform.classList.add('companion-transform'); context.prepend(transform);
  const title = document.createElement('h3'); title.textContent = '变换配套'; transform.prepend(title);
  const transformNumeric = details('bundleNumericAdvanced', '精确输入变换量', transform);
  transformNumeric.append($('bundleNumericLabel').parentElement, $('bundleValueX').closest('.field-grid'), $('applyBundleTransform'));

  // The branch workbench's single-leaf editor belongs to selection properties;
  // generation rules and source asset palettes remain on the left.
  const units = $('unitEditorPanel'); units.classList.add('companion-units'); context.prepend(units);
  $('ueKind').closest('label').classList.add('unit-object-kind');
  const unitProps = $('ueProperties');
  const unitExact = details('unitNumericAdvanced', '精确位置、大小与朝向', unitProps);
  for (const row of [...unitProps.querySelectorAll(':scope > .field-grid')]) unitExact.append(row);
  const unitMore = details('unitCommandsAdvanced', '更多操作与快捷键说明', units);
  const preserve = new Set(['uePivot','ueStatus','ueSource','ueProperties','ueKind']);
  for (const child of [...units.children]) {
    if (child === unitMore || child.tagName === 'SUMMARY' || preserve.has(child.id) || [...preserve].some(id => child.contains($(id)))) continue;
    unitMore.append(child);
  }
  note(units, '直接点选叶片或花果；G / R / S 调整，柄根保持挂接枝干。');
  // Useful copy/reset actions stay visible; delete/move/rotate remain below.
  const unitActions = document.createElement('div'); unitActions.className = 'wb-row'; unitActions.append($('ueCopy'), $('ueReset')); unitMore.before(unitActions);
  // Repair requires a selected wooden branch, so it must remain reachable
  // when the leaf-only editing controls are hidden.
  const orphanPanel = $('ueOrphans').closest('details'); orphanPanel.classList.add('unit-orphans');
  units.append(orphanPanel);

  const quick = $('branchQuickPanel');
  const poseEnd = $('quickPoseApply').closest('.wb-row');
  const poseNodes = [];
  for (const child of [...quick.children]) { if (child.tagName !== 'SUMMARY') poseNodes.push(child); if (child === poseEnd) break; }
  const poseMore = details('quickPoseOptions', '更多 · 枝条姿态数值', quick); poseMore.append(...poseNodes);
  quick.querySelector(':scope > summary').textContent = '当前枝条 · 叶量与分布';

  // Duplicate tools and legacy full brush controls remain searchable in the
  // left page, but default to a single collapsed footer group.
  const editPage = document.querySelector('[data-page="edit"]');
  const advanced = details('manualToolAlternatives', '更多 · 工具按钮与完整参数', editPage);
  advanced.append($('bundlePanel'), $('sculptPanel'), $('leafBrushRadius').closest('.parameter-section'));
  note(advanced, '工具也可从视口工具栏使用；当前工具的配套选项显示在右侧。');
  let wasOpen = null;
  document.addEventListener('parameter-workspace-filter', event => {
    if (event.detail.searching) { if (wasOpen === null) wasOpen = advanced.open; advanced.open = true; }
    else if (wasOpen !== null) { advanced.open = wasOpen; wasOpen = null; }
  });
  let previousUnitMode = document.body.dataset.unitEditing;
  new MutationObserver(() => {
    const mode = document.body.dataset.unitEditing;
    if (mode !== previousUnitMode && mode === 'on') { $('contextTab').click(); units.open = true; document.querySelector('.inspector-scroll').scrollTop = 0; }
    if (mode !== 'on') $('contextCount').textContent = $('contextCount').dataset.branchCount || '0';
    previousUnitMode = mode;
  }).observe(document.body, {attributes:true, attributeFilter:['data-unit-editing']});
}
