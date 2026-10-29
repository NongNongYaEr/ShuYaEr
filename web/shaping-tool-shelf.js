export function organizeShapingTools(workflow = {}) {
  const rail = document.querySelector('.viewport-tool-rail'), buttons = [...rail.querySelectorAll('button')];
  const groups = [
    ['选择', ['SELECT', 'BOX_SELECT', 'LASSO_SELECT'], ['openBranchInfluence']],
    ['变换', ['BUNDLE_MOVE', 'BUNDLE_ROTATE', 'BUNDLE_SCALE'], ['openBranchPose']],
    ['梳理雕刻', ['GRAB', 'COMB', 'BEND_BRUSH', 'PUSH_PULL', 'SMOOTH_BRUSH', 'TWIST_BRUSH'], ['openBranchCage']],
    ['单元枝笔刷', [], ['unitPaintTool','unitDensityTool','unitSizeTool']],
    ['修剪生长', ['PRUNE', 'LINE_PRUNE', 'ERASE_BRANCH', 'GROW', 'RETRACT', 'FORK', 'SPREAD'], ['openBranchStroke', 'openLocalBranches']],
    ['粗细截面', ['THICKNESS'], ['openBranchVolume', 'openSectionContext', 'openJunctionContext']],
    ['路径层级', ['GUIDE', 'PROTECT', 'SIMPLIFY_BRUSH', 'REFINE_BRUSH'], ['openBranchGuide', 'openBranchSpace', 'openShapeStack']],
    ['装配风动', ['LEAF_ADD', 'LEAF_ERASE', 'WIND_SOFT', 'WIND_STIFF'], ['openBranchArray', 'openInstanceEditor', 'openBranchSymmetry']],
  ];
  const captions = {SELECT:'点选',BOX_SELECT:'框选',LASSO_SELECT:'套索',openBranchInfluence:'影响范围',BUNDLE_MOVE:'移动 G',BUNDLE_ROTATE:'旋转 R',BUNDLE_SCALE:'缩放 S',openBranchPose:'姿态',GRAB:'拉动',COMB:'梳理',BEND_BRUSH:'弯曲',PUSH_PULL:'推拉',SMOOTH_BRUSH:'平滑',TWIST_BRUSH:'扭转',openBranchCage:'笼形',PRUNE:'修剪',LINE_PRUNE:'划线剪',ERASE_BRANCH:'删除枝',GROW:'延长',RETRACT:'回缩',FORK:'分叉',SPREAD:'展开',openBranchStroke:'绘枝',openLocalBranches:'加枝',THICKNESS:'粗细',openBranchVolume:'体积',openSectionContext:'截面',openJunctionContext:'接点',GUIDE:'引导',PROTECT:'保护',SIMPLIFY_BRUSH:'简化',REFINE_BRUSH:'细分',openBranchGuide:'导向线',openBranchSpace:'空间',openShapeStack:'造型层',LEAF_ADD:'补叶',LEAF_ERASE:'擦叶',WIND_SOFT:'柔风',WIND_STIFF:'硬风',openBranchArray:'阵列',openInstanceEditor:'实例',openBranchSymmetry:'对称'};
  Object.assign(captions, {SELECT:'点选 V', COMB:'梳理 C', GRAB:'拉动 B'});
  Object.assign(captions,{unitPaintTool:'刷生成',unitDensityTool:'密度刷',unitSizeTool:'大小刷'});
  rail.replaceChildren();
  const heading = document.createElement('div'); heading.className = 'tool-catalog-heading';
  heading.innerHTML = '<span>造型工具</span><button type="button" id="expandShapingGroups" title="展开全部工具分组" aria-label="展开全部工具分组">全部</button>'; rail.append(heading);
  for (const [title, keys, ids] of groups) {
    const group = document.createElement('details'); group.className = 'shaping-tool-group'; group.open = ['选择','变换','梳理雕刻','单元枝笔刷'].includes(title);
    const summary = document.createElement('summary'); summary.textContent = title; summary.dataset.short = title.slice(0,2); summary.title = title; group.append(summary);
    const content = document.createElement('div'); content.className = 'shaping-tool-buttons'; group.append(content);
    buttons.filter((b) => keys.includes(b.dataset.viewportTool) || ids.includes(b.id)).forEach((b) => {
      if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', b.title);
      const caption = document.createElement('span'); caption.className = 'tool-caption'; caption.setAttribute('aria-hidden','true'); caption.textContent = captions[b.dataset.viewportTool] || captions[b.id] || b.title; b.append(caption);
      content.append(b);
    }); rail.append(group);
  }
  buttons.filter((b) => !rail.contains(b)).forEach((b) => rail.lastElementChild.lastElementChild.append(b));
  document.getElementById('expandShapingGroups').onclick = () => {
    const list = [...rail.querySelectorAll('details')], expand = list.some(group => !group.open);
    list.forEach(group => group.open = expand);
  };
  rail.addEventListener('toggle', () => {
    const collapsed = [...rail.querySelectorAll('details')].some(group => !group.open);
    const control = document.getElementById('expandShapingGroups');
    control.textContent = collapsed ? '全部' : '收起'; control.title = collapsed ? '展开全部工具分组' : '收起全部工具分组'; control.setAttribute('aria-label', control.title);
  }, true);
  // Shortcut keys and contextual commands also reveal the active tool group.
  new MutationObserver(records => {
    for (const {target} of records) if (target.matches('button.active')) {
      const group = target.closest('details'); if (group) group.open = true;
    }
  }).observe(rail,{subtree:true,attributes:true,attributeFilter:['class']});
  const quick = document.createElement('div'); quick.className = 'quick-shaping-tools'; quick.setAttribute('role', 'toolbar'); quick.setAttribute('aria-label', '常用造型工具'); rail.after(quick);
  for (const key of ['SELECT', 'openBranchStroke', 'openBranchInfluence', 'openBranchPose', 'openBranchVolume', 'openBranchArray']) {
    const original = buttons.find((b) => b.id === key || b.dataset.viewportTool === key); if (!original) continue;
    const shortcut = original.cloneNode(true); shortcut.removeAttribute('id'); shortcut.removeAttribute('data-viewport-tool'); shortcut.dataset.quickTool = key;
    shortcut.querySelector('.tool-caption')?.remove();
    shortcut.onclick = () => { original.closest('details').open = true; original.click(); };
    new MutationObserver(() => shortcut.classList.toggle('active', original.classList.contains('active'))).observe(original, { attributes: true, attributeFilter: ['class'] }); quick.append(shortcut);
  }
  const toggle = document.createElement('button'); toggle.id = 'toggleShapingCatalog'; toggle.title = '展开或收起全部工具'; toggle.setAttribute('aria-label', toggle.title); toggle.setAttribute('aria-expanded', 'true'); toggle.innerHTML = '<i data-lucide="panel-left-close"></i>'; toggle.onclick = () => { rail.hidden = !rail.hidden; toggle.setAttribute('aria-expanded', String(!rail.hidden)); }; quick.append(toggle);
  const dialog = document.createElement('dialog'); dialog.id = 'pendingToolDialog'; dialog.innerHTML = '<strong>当前造型尚未应用</strong><div class="wb-row"><button id="pendingToolApply"><i data-lucide="check"></i>应用后切换</button><button id="pendingToolDiscard"><i data-lucide="x"></i>放弃后切换</button><button id="pendingToolKeep"><i data-lucide="arrow-left"></i>继续编辑</button></div>'; document.body.append(dialog);
  let pending = null, bypass = false;
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button'); if (bypass || !target || target.closest('.quick-shaping-tools') || target === toggle || target.id === 'expandShapingGroups') return;
    const switching = target.closest('.viewport-tool-rail') || ['addChildBranch', 'wbAxis', 'wbSection', 'wbConnectorMove', 'wbConnectorRotate', 'treeWorkspaceBtn', 'branchWorkspaceBtn', 'vineWorkspaceBtn', 'saveProjectBtn', 'closeShapingContext'].includes(target.id);
    const tool = switching && workflow.preview?.(); if (!tool) return;
    e.preventDefault(); e.stopImmediatePropagation(); pending = { tool, target }; dialog.showModal();
  }, true);
  const finish = async (apply) => { if (!pending) return; const { tool, target } = pending; if (apply && (await tool.apply(false)) === false) { pending = null; dialog.close(); return; } if (!apply) tool.cancel(); pending = null; dialog.close(); await workflow.flush?.(); bypass = true; try { target.click(); } finally { bypass = false; } };
  document.getElementById('pendingToolApply').onclick = () => finish(true); document.getElementById('pendingToolDiscard').onclick = () => finish(false); document.getElementById('pendingToolKeep').onclick = () => { pending = null; dialog.close(); }; dialog.oncancel = () => pending = null;
  dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pending = null; dialog.close(); } });
  window.lucide?.createIcons({ nodes: [quick, dialog] });
}
