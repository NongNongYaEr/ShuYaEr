// Navigation only: keep the original controls, commands and editing transactions.
export function createWorkspaceNavigation() {
  const $ = id => document.getElementById(id);
  const panel = document.querySelector('.parameter-panel');
  const scroll = panel.querySelector('.parameter-scroll');
  const scope = panel.querySelector('.parameter-scope');
  const location = document.createElement('span'); location.className = 'workspace-location';
  location.textContent = scope.textContent; scope.replaceChildren(location);
  const directoryButton = document.createElement('button'); directoryButton.id = 'parameterDirectoryOpen';
  directoryButton.type = 'button'; directoryButton.textContent = '分组目录';
  directoryButton.setAttribute('aria-expanded', 'false'); directoryButton.setAttribute('aria-controls', 'parameterDirectory'); scope.append(directoryButton);
  const directory = document.createElement('div'); directory.id = 'parameterDirectory'; directory.setAttribute('popover', 'auto');
  directory.innerHTML = '<div class="directory-heading"><strong>当前分类 · 分组目录</strong><button type="button" aria-label="关闭分组目录" data-directory-close>×</button></div><input type="search" id="parameterDirectorySearch" placeholder="查找分组…" aria-label="查找分组"><div class="directory-actions"><button type="button" data-directory-expand>全部展开</button><button type="button" data-directory-collapse>全部收起</button></div><nav id="parameterDirectoryList" aria-label="跳转到参数分组"></nav><p class="directory-empty" hidden>当前分类没有匹配分组</p>';
  document.body.append(directory);
  const search = $('parameterSearch'); search.placeholder = '搜索参数 / 分组';
  const clear = document.createElement('button'); clear.id = 'parameterSearchClear'; clear.type = 'button'; clear.textContent = '×';
  clear.title = '清除搜索与收藏筛选'; clear.setAttribute('aria-label', clear.title); clear.hidden = true; search.after(clear);
  function clearSearch() {
    search.value = '';
    if ($('parameterFavorites').getAttribute('aria-pressed') === 'true') $('parameterFavorites').click();
    else search.dispatchEvent(new Event('input', {bubbles:true}));
    search.focus();
  }
  clear.addEventListener('click', clearSearch);
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !clear.hidden) { event.preventDefault(); event.stopPropagation(); clearSearch(); }
  });
  // Collapsed parameter groups still belong in the directory. Semantic hidden
  // controls and inactive workflow pages do not, even inside a closed group.
  function available(element) {
    for (let node = element; node && node !== scroll; node = node.parentElement) {
      if (node.classList.contains('parameter-group-body')) continue;
      if (node.hidden || getComputedStyle(node).display === 'none') return false;
    }
    return scroll.contains(element);
  }
  function entries() {
    return [...scroll.querySelectorAll('.parameter-group-toggle, details > summary, .branch-workflow-heading')]
      .filter(available).map(node => ({node, text:node.textContent.trim(), nested:node.matches('summary')})).filter(item => item.text);
  }
  function reveal(node) {
    const parents = [];
    for (let parent = node.parentElement; parent && parent !== scroll; parent = parent.parentElement) parents.unshift(parent);
    for (const parent of parents) {
      if (parent.matches('details')) parent.open = true;
      if (parent.classList.contains('parameter-section')) {
        const toggle = parent.querySelector(':scope > .parameter-group-header .parameter-group-toggle');
        if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
      }
    }
    if (node.matches('.parameter-group-toggle') && node.getAttribute('aria-expanded') === 'false') node.click();
    if (node.matches('summary')) node.parentElement.open = true;
    closeDirectory();
    node.scrollIntoView({block:'start'});
    if (node.matches('button, summary')) node.focus({preventScroll:true});
    node.animate([{backgroundColor:'var(--brand-soft)'},{backgroundColor:'transparent'}], {duration:1100});
  }
  function renderDirectory() {
    const query = $('parameterDirectorySearch').value.trim().toLowerCase();
    const list = $('parameterDirectoryList'); list.replaceChildren();
    for (const item of entries().filter(item => item.text.toLowerCase().includes(query))) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = item.text;
      button.classList.toggle('directory-child', item.nested); button.onclick = () => reveal(item.node); list.append(button);
    }
    directory.querySelector('.directory-empty').hidden = Boolean(list.childElementCount);
  }
  function closeDirectory() { if (directory.matches(':popover-open')) directory.hidePopover(); }
  directoryButton.onclick = () => {
    if (directory.matches(':popover-open')) { closeDirectory(); return; }
    const rect = scope.getBoundingClientRect();
    directory.style.left = `${rect.left + 8}px`; directory.style.top = `${rect.bottom + 4}px`;
    directory.style.width = `${Math.min(350, rect.width - 16)}px`;
    directory.style.maxHeight = `${Math.max(160, innerHeight - rect.bottom - 20)}px`;
    $('parameterDirectorySearch').value = ''; renderDirectory(); directory.showPopover(); $('parameterDirectorySearch').focus();
  };
  directory.addEventListener('toggle', () => directoryButton.setAttribute('aria-expanded', String(directory.matches(':popover-open'))));
  directory.querySelector('[data-directory-close]').onclick = closeDirectory;
  $('parameterDirectorySearch').oninput = renderDirectory;
  for (const [selector, expand] of [['[data-directory-expand]',true],['[data-directory-collapse]',false]]) {
    directory.querySelector(selector).onclick = () => {
      for (const {node} of entries()) {
        if (node.matches('.parameter-group-toggle') && (node.getAttribute('aria-expanded') === 'true') !== expand) node.click();
        if (node.matches('summary')) node.parentElement.open = expand;
      }
      renderDirectory();
    };
  }
  // Typing in UI search must never start a viewport transform.
  for (const type of ['keydown','keyup']) directory.addEventListener(type, event => event.stopPropagation());
  window.addEventListener('resize', closeDirectory);

  const tabLabels = {structure:'骨架',assembly:'单元枝',foliage:'叶花',edit:'造型',state:'预览',output:'输出'};
  const descriptions = {
    structure:['先搭好植物的骨架','调整主干、分枝层级、尺寸与粗细；单元枝在「单元枝」页装配。'],
    assembly:['左侧挑素材，右侧装到树上','把素材卡拖到右侧内部、中间或末端分区；松手更新植物，已用样本在右侧直接调整。'],
    foliage:['安排叶片与花果','先选择真实素材，再调整分布、尺寸和材质。'],
    edit:['从选择开始，按用途造型','左侧工具分组操作；点选枝干后可用 G / R / S，Alt+S 调整粗细。'],
    state:['检查最终表现','查看生长状态、季节与风动效果。'],
    output:['检查预算，再导出模型','设置输出位置与模型预算；顶部「导出模型」选择目标格式。'],
  };
  const tabs = [...panel.querySelectorAll('.parameter-tabs [data-tab]')];
  for (const tab of tabs) {
    const page = scroll.querySelector(`[data-page="${tab.dataset.tab}"]`);
    const intro = document.createElement('div'); intro.className = 'workspace-page-intro'; intro.dataset.intro = tab.dataset.tab;
    intro.innerHTML = '<strong></strong><p></p>'; page.prepend(intro);
    tab.addEventListener('click', () => { closeDirectory(); queueMicrotask(refreshLocation); });
  }
  panel.querySelector('.parameter-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const visibleTabs = tabs.filter(tab => !tab.hidden);
    const index = visibleTabs.indexOf(event.target.closest('[data-tab]')); if (index < 0) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? visibleTabs.length-1 : (index + (event.key === 'ArrowRight' ? 1 : visibleTabs.length-1)) % visibleTabs.length;
    visibleTabs[next].click(); visibleTabs[next].focus();
  });
  function refreshLocation() {
    const mode = document.body.dataset.workbench || 'TREE';
    const workbenchHeading = $('branchWorkbenchPanel')?.querySelector('.parameter-group-toggle span');
    if (workbenchHeading) workbenchHeading.textContent = mode === 'TREE' ? '单元枝素材' : '枝条工作台';
    for (const tab of tabs) {
      const key = tab.dataset.tab, label = mode === 'VINE' && key === 'structure' ? '生长' : tabLabels[key];
      tab.querySelector('span').textContent = label;
      tab.setAttribute('aria-current', tab.classList.contains('active') ? 'page' : 'false');
      const intro = scroll.querySelector(`[data-intro="${key}"]`);
      const copy = mode === 'VINE' && key === 'structure' ? ['先定生长范围，再调疏密','场景植被、贴面生长与藤形参数，可从分组目录直接跳转。'] : descriptions[key];
      intro.querySelector('strong').textContent = copy[0]; intro.querySelector('p').textContent = copy[1];
    }
    const searching = scroll.classList.contains('searching'); clear.hidden = !searching;
    if (searching) {
      const count = [...scroll.querySelectorAll('.parameter-section, .branch-workflow-search-unit')].filter(node => node.getClientRects().length && getComputedStyle(node).display !== 'none').length;
      location.textContent = `${search.value.trim() ? '搜索' : '收藏'} · ${count} 组结果`;
      $('parameterSearchEmpty').hidden = count > 0;
    } else if (mode === 'BRANCH') {
      location.textContent = '枝条工作台 · ' + (panel.querySelector('.branch-workflow-nav button.active')?.textContent || '创建');
    } else location.textContent = `${mode === 'VINE' ? '藤蔓植物' : '整树造型'} · ${panel.querySelector('.parameter-tabs button.active span')?.textContent || ''}`;
  }
  document.addEventListener('parameter-workspace-filter', () => queueMicrotask(refreshLocation));
  panel.querySelector('.branch-workflow-nav')?.addEventListener('click', () => { closeDirectory(); queueMicrotask(refreshLocation); });
  new MutationObserver(() => { closeDirectory(); queueMicrotask(refreshLocation); }).observe(document.body, {attributes:true, attributeFilter:['data-workbench']});

  const outliner = $('branchOutliner');
  const finder = document.createElement('div'); finder.className = 'outliner-finder';
  finder.innerHTML = '<input id="branchOutlinerSearch" type="search" aria-label="查找枝干编号" placeholder="查找枝干编号…"><button id="branchOutlinerSelected" type="button" title="只显示选中的枝干" aria-pressed="false">已选</button>';
  const noBranches = document.createElement('p'); noBranches.className = 'outliner-empty'; noBranches.textContent = '没有匹配的枝干'; noBranches.hidden = true;
  outliner.before(finder); outliner.after(noBranches);
  let selectedOnly = false;
  function filterBranches() {
    const query = $('branchOutlinerSearch').value.trim().toLowerCase(); let count = 0;
    for (const button of outliner.children) {
      const match = button.textContent.toLowerCase().includes(query) && (!selectedOnly || button.classList.contains('active'));
      button.hidden = !match; if (match) count++;
    }
    noBranches.hidden = count > 0;
  }
  $('branchOutlinerSearch').oninput = filterBranches;
  $('branchOutlinerSelected').onclick = () => { selectedOnly = !selectedOnly; $('branchOutlinerSelected').setAttribute('aria-pressed', String(selectedOnly)); filterBranches(); };
  new MutationObserver(filterBranches).observe(outliner, {childList:true});
  refreshLocation(); filterBranches();
  return {revealControl(selector) {
    const target = document.querySelector(selector);
    if (!target || !scroll.contains(target)) return false;
    clearSearch();
    const page = target.closest('[data-page]')?.dataset.page;
    if (document.body.dataset.workbench === 'BRANCH') {
      document.dispatchEvent(new CustomEvent('branch-workflow-show', {detail:page === 'foliage' ? 'ASSETS' : 'ADJUST'}));
    } else document.querySelector(`.parameter-tabs [data-tab="${page}"]`)?.click();
    const section = target.closest('.parameter-section');
    const node = section?.querySelector(':scope > .parameter-group-header .parameter-group-toggle') || target;
    reveal(node);
    if (target.matches('input,select,textarea')) target.focus({preventScroll:true});
    return true;
  }};
}
