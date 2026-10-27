const $ = id => document.getElementById(id);
const stages = [['CREATE', '创建'], ['ADJUST', '调整'], ['ASSEMBLE', '装配'], ['ASSETS', '素材'], ['EXPORT', '导出']];
const route = {CREATE:'structure', ADJUST:'edit', ASSEMBLE:'foliage', ASSETS:'foliage', EXPORT:'output'};

// The original nodes are moved, not copied. Their listeners, live values and
// conditionally hidden controls continue to belong to their existing editors.
export function createBranchWorkflowUI() {
  const panel = document.querySelector('.parameter-panel'), scroll = panel?.querySelector('.parameter-scroll');
  if (!panel || !scroll) return {refresh() {}, show() {}};
  let stage = 'CREATE', active = false, searching = false, routing = false;
  const placements = new Map(), openStates = new Map(), searchOpenStates = new Map();
  const nav = document.createElement('nav'); nav.id = 'branchWorkflowNav'; nav.className = 'branch-workflow-nav';
  nav.setAttribute('aria-label', '枝条制作流程'); nav.hidden = true;
  const host = document.createElement('div'); host.id = 'branchWorkflow'; host.className = 'branch-workflow branch-workbench'; host.hidden = true;
  const pages = new Map();
  for (const [key, label] of stages) {
    const button = document.createElement('button'); button.type = 'button'; button.id = `branchWorkflow${key}`;
    button.dataset.workflowStage = key; button.textContent = label;
    button.setAttribute('aria-controls', `branchWorkflowPage${key}`);
    nav.append(button);
    const page = document.createElement('section'); page.id = `branchWorkflowPage${key}`;
    page.className = 'branch-workflow-stage'; page.dataset.workflowPage = key;
    page.setAttribute('role', 'region'); page.setAttribute('aria-labelledby', button.id);
    const heading = document.createElement('h2'); heading.className = 'branch-workflow-heading'; heading.textContent = label;
    page.append(heading); host.append(page); pages.set(key, page);
    button.addEventListener('click', () => show(key));
  }
  panel.querySelector('.parameter-tabs').before(nav); scroll.prepend(host);
  const advanced = (key, id, title) => {
    const details = document.createElement('details'); details.id = id; details.className = 'branch-workflow-advanced';
    const summary = document.createElement('summary'); summary.textContent = title; details.append(summary); pages.get(key).append(details);
    return details;
  };
  const drawing = advanced('ADJUST', 'branchWorkflowDrawing', '高级 · 绘制、雕刻与连接点');
  const adjustment = advanced('ADJUST', 'branchWorkflowAdjustment', '高级 · 结构、叶片与状态');
  const materials = advanced('ASSETS', 'branchWorkflowMaterials', '高级 · 导入叶片、贴图与分布');
  const exporting = advanced('EXPORT', 'branchWorkflowExportOptions', '高级 · 预览预算、通道与配方');

  function move(node, destination, {search = false, title = ''} = {}) {
    if (!node || placements.has(node) || node === destination || node.contains(destination)) return;
    const marker = document.createComment(`branch-workflow:${node.id || node.tagName}`);
    node.before(marker);
    let wrapper = null;
    if (search) {
      wrapper = document.createElement('div'); wrapper.className = 'branch-workflow-search-unit';
      wrapper.dataset.workflowSearch = title; wrapper.dataset.workflowFavorite = 'branchWorkbenchPanel';
      wrapper.append(node); destination.append(wrapper);
    } else destination.append(node);
    placements.set(node, {marker, wrapper});
  }
  function primary(node, key, title) {
    move(node, pages.get(key), {search:true, title});
    // Keep primary controls before their optional advanced groups.
    const wrapper = placements.get(node)?.wrapper;
    if (wrapper) pages.get(key).insertBefore(wrapper, pages.get(key).querySelector(':scope > .branch-workflow-advanced'));
  }
  function organize() {
    const body = $('branchWorkbenchPanel')?.querySelector(':scope > .parameter-group-body');
    if (!body) return;
    // Current-project controls live next to quick adjustments, not next to the
    // new-project selectors. Hidden state is still managed by the workbench.
    for (const id of ['treeCurrentFoliageControls', 'treeOrganControls']) {
      const node = $(id);
      if (node && !placements.has(node)) move(node, adjustment, {search:true, title:'当前复叶与花果'});
    }
    const replace = $('treeSpeciesReplace');
    if (replace && !placements.has(replace)) primary(replace, 'ASSETS', '替换当前植物素材');
    for (const node of [...body.children]) {
      if (node.classList.contains('wb-tree-only')) continue;
      if (node.id === 'branchUnitAssemblyPanel') primary(node, 'ASSEMBLE', '叶花果资产 植物共享材质 单元装配');
      else if (['unitEditorPanel','unitRulesPanel'].includes(node.id)) primary(node, 'ADJUST', '叶花果 单元 编辑 挂点 移动 旋转 生成 规则');
      else if (node.id === 'branchQuickPanel') primary(node, 'ADJUST', '当前枝条 常用参数 姿态 叶片');
      else if (node.id === 'treeSpeciesLibrary' || node.id === 'branchVariantPanel' || node.querySelector('#newBranchDraft')) {
        primary(node, 'CREATE', node.id === 'branchVariantPanel' ? '生成候选 套装 变体' : '创建植物 树种 乔木 灌木 盆栽');
        if (node.id === 'treeSpeciesLibrary' && !openStates.has(node)) {openStates.set(node, node.open);node.open = true;}
      } else if (node.classList.contains('wb-library-heading') || ['wbAssetFile','wbAssetSearch','wbAssetLibrary'].includes(node.id)
        || node.querySelector('#wbAssetName, #wbSaveAsset, #wbSaveCopy, #wbEditAsset, #wbRenameAsset')) {
        primary(node, 'ASSETS', '枝条素材 保存 导入 导出');
      } else move(node, drawing, {search:true, title:'高级绘制 参考图 连接点'});
    }
    // A candidate panel may be installed after the initial workbench wrap.
    if ($('branchVariantPanel') && !placements.has($('branchVariantPanel'))) primary($('branchVariantPanel'), 'CREATE', '生成候选');
    const output = $('outputPath')?.closest('.parameter-section');
    if (output && !placements.has(output)) {
      move(output, pages.get('EXPORT'));
      pages.get('EXPORT').insertBefore(output, exporting);
    }
    for (const page of [...scroll.querySelectorAll('.tab-page')]) {
      if (placements.has(page)) continue;
      if (page.dataset.page === 'output') move(page, exporting);
      else if (page.dataset.page === 'foliage') move(page, materials);
      else move(page, page.dataset.page === 'edit' ? drawing : adjustment);
    }
  }
  function restore() {
    for (const [node, {marker, wrapper}] of [...placements].reverse()) {
      if (marker.parentNode) marker.replaceWith(node);
      wrapper?.remove();
    }
    placements.clear();
    for (const [node, wasOpen] of searchOpenStates) if (node.isConnected) node.open = wasOpen;
    searchOpenStates.clear();
    for (const [node, wasOpen] of openStates) node.open = wasOpen;
    openStates.clear();
    host.querySelectorAll('[data-search-hidden]').forEach(n => n.removeAttribute('data-search-hidden'));
  }
  function applyStage() {
    host.dataset.stage = stage;
    host.dataset.searching = String(searching);
    for (const button of nav.querySelectorAll('button')) {
      const current = button.dataset.workflowStage === stage;
      button.classList.toggle('active', current);
      if (current) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
      button.tabIndex = current ? 0 : -1;
    }
    const scope = panel.querySelector('.parameter-scope');
    if (active && scope) (scope.querySelector('.workspace-location') || scope).textContent = searching ? '跨流程搜索 · 清除搜索返回当前步骤' : `枝条工作台 · ${stages.find(([key]) => key === stage)[1]}`;
  }
  function updateSearchDetails() {
    if (searching) {
      for (const details of host.querySelectorAll('details')) {
        if (details.id === 'manualToolAlternatives') continue; // Its search state is owned by companion-panels.
        if (!searchOpenStates.has(details)) searchOpenStates.set(details, details.open);
        details.open = true;
      }
    } else {
      for (const [details, wasOpen] of searchOpenStates) if (details.isConnected) details.open = wasOpen;
      searchOpenStates.clear();
    }
  }
  function refresh() {
    const enabled = document.body.dataset.workbench === 'BRANCH';
    if (enabled && !active) {
      active = true; document.body.dataset.branchWorkflow = 'on'; nav.hidden = false; host.hidden = false; organize();
      // Re-evaluate existing search text after its source controls moved.
      $('parameterSearch')?.dispatchEvent(new Event('input', {bubbles:true}));
    } else if (!enabled && active) {
      active = false; restore(); nav.hidden = true; host.hidden = true; delete document.body.dataset.branchWorkflow;
      $('parameterSearch')?.dispatchEvent(new Event('input', {bubbles:true}));
    } else if (enabled) organize();
    searching = scroll.classList.contains('searching'); updateSearchDetails(); applyStage();
  }
  function show(value) {
    const key = String(value).toUpperCase();
    if (!pages.has(key)) return false;
    stage = key; refresh();
    if (active) {
      routing = true;
      try {document.querySelector(`[data-tab="${route[key]}"]`)?.click();} finally {routing = false;}
      searching = scroll.classList.contains('searching'); updateSearchDetails(); applyStage(); scroll.scrollTop = 0;
    }
    return true;
  }
  nav.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index = stages.findIndex(([key]) => key === stage);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? stages.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : stages.length - 1)) % stages.length;
    show(stages[next][0]); $(`branchWorkflow${stages[next][0]}`).focus();
  });
  document.addEventListener('parameter-workspace-filter', () => {
    if (!active) return;
    searching = scroll.classList.contains('searching'); updateSearchDetails(); applyStage();
  });
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    // Existing commands click their old tab for editor side effects. They must
    // not change the user's current workflow step.
    if (!routing && document.body.dataset.workbench === 'BRANCH') queueMicrotask(refresh);
  }));
  document.addEventListener('branch-quick-edit', () => show('ADJUST'));
  document.addEventListener('branch-workflow-show', event => show(event.detail));
  new MutationObserver(refresh).observe(document.body, {attributes:true, attributeFilter:['data-workbench']});
  refresh();
  return {refresh, show};
}
