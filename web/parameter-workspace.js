const $ = (id) => document.getElementById(id);
const icon = (name) => `<i data-lucide="${name}"></i>`;
const storageKey = 'branchforge.parameter-workspace.v1';

export function createParameterWorkspace({ begin, preview, commit, cancel, defaults }) {
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { /* Preferences are optional. */ }
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) preferences = {};
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* Editing works without storage. */ } };
  const scroll = document.querySelector('.parameter-scroll');
  const sections = [];
  const numeric = [];
  let scrub = null;
  let favoritesOnly = false;
  let selectionKey = '';
  const createButton = (name, title) => {
    const button = document.createElement('button'); button.type = 'button'; button.title = title;
    button.setAttribute('aria-label', title); button.innerHTML = icon(name); return button;
  };

  // Move the existing editor, keeping its controls and event handlers intact.
  const inspector = document.querySelector('.inspector-scroll');
  const context = document.createElement('div'); context.id = 'contextProperties';
  const assets = document.createElement('div'); assets.id = 'assetProperties'; assets.hidden = true;
  const outliner = document.querySelector('.branch-outliner-section');
  const surfaceGuides = $('surfaceGuidePanel');
  [...inspector.children].forEach((section) => { if (section !== outliner && section !== surfaceGuides) assets.append(section); });
  const current = $('selectedBranchLabel').closest('section'); current.id = 'currentBranchPanel';
  if (surfaceGuides) context.append(surfaceGuides);
  context.append(current); inspector.append(context, outliner, assets);
  const header = document.querySelector('.inspector-header');
  header.querySelector('h2').textContent = '属性与检查';
  const tabs = document.createElement('div'); tabs.className = 'inspector-tabs';
  tabs.innerHTML = '<button id="contextTab" class="active">当前选择 <span id="contextCount">0</span></button><button id="assetTab">资产检查</button>';
  header.append(tabs);
  function showContext(value) {
    context.hidden = !value; assets.hidden = value;
    outliner.hidden = !value;
    $('contextTab').classList.toggle('active', value); $('assetTab').classList.toggle('active', !value);
    $('contextTab').setAttribute('aria-selected', String(value)); $('assetTab').setAttribute('aria-selected', String(!value));
  }
  $('contextTab').addEventListener('click', () => showContext(true));
  $('assetTab').addEventListener('click', () => showContext(false));
  $('selectionEmpty').textContent = '未选择枝条';

  const toolbar = document.createElement('div'); toolbar.className = 'parameter-search';
  toolbar.innerHTML = `${icon('search')}<input id="parameterSearch" type="search" placeholder="搜索参数" aria-label="搜索参数"><button id="parameterFavorites" title="只显示收藏分组" aria-label="只显示收藏分组">${icon('star')}</button>`;
  document.querySelector('.parameter-panel').insertBefore(toolbar, scroll);
  const empty = document.createElement('div'); empty.id = 'parameterSearchEmpty'; empty.textContent = '未找到匹配参数'; empty.hidden = true; scroll.append(empty);

  // Keep the silhouette controls together; detail and UV parameters remain available below.
  const size = $('length').closest('section'); size.id = 'mainSizePanel';
  const detail = document.createElement('section'); detail.className = 'parameter-section'; detail.id = 'branchDetailPanel';
  detail.innerHTML = '<h2>截面与表面细节</h2><div class="field-grid"></div>';
  [...size.querySelector('.field-grid').children].forEach((label) => {
    if (!label.querySelector('#length, #baseDiameter, #tipDiameter')) detail.querySelector('.field-grid').append(label);
  });
  detail.append(size.querySelector('.switch-list')); size.after(detail);
  $('childCount').closest('section').id = 'branchRulesPanel';
  $('length').closest('.field-grid').classList.add('parameter-sample');
  $('childCount').closest('.field-grid').classList.add('parameter-sample');

  for (const [index, section] of [...scroll.querySelectorAll('.parameter-section')].entries()) {
    if (section.classList.contains('legacy-authoring')) continue;
    const heading = section.querySelector('h2');
    if (!heading) continue;
    const title = heading.textContent;
    const id = section.id || `parameterGroup${index}`;
    section.id = id;
    const originalHeader = heading.parentElement.classList.contains('section-title') ? heading.parentElement : heading;
    const header = document.createElement('div'); header.className = 'parameter-group-header';
    const toggle = document.createElement('button'); toggle.className = 'parameter-group-toggle';
    toggle.innerHTML = `${icon('chevron-down')}<span>${title}</span>`;
    toggle.setAttribute('aria-controls', `${id}Body`);
    const star = createButton('star', `收藏${title}`); star.className = 'parameter-group-star';
    const reset = createButton('rotate-ccw', `重置${title}`); reset.className = 'parameter-group-reset';
    header.append(toggle, star);
    const resetControls = [...section.querySelectorAll('input[id],select[id]')].filter((input) => defaults[input.id] !== undefined);
    if (resetControls.length) header.append(reset);
    const body = document.createElement('div'); body.id = `${id}Body`; body.className = 'parameter-group-body';
    const badge = originalHeader.querySelector?.('span'); if (badge) { badge.classList.add('parameter-group-badge'); body.append(badge); }
    originalHeader.remove(); body.append(...section.childNodes); section.append(header, body);
    const usuallyOpen = ['叶花果随单元枝装配', '单元枝素材', '生成层级', '枝条配置', '主枝尺寸', '生长姿态', '分叉规则', '枝束选择与变换', '树势雕刻', '叶片网格', '分布规则', '生长状态', '预览与模型预算', '输出位置'].includes(title);
    const record = { section, body, toggle, star, title, id, closed: preferences.closed?.[id] ?? !usuallyOpen, favorite: Boolean(preferences.favorites?.[id]), text: `${title} ${body.textContent}`.toLowerCase() };
    sections.push(record);
    toggle.addEventListener('click', () => {
      record.closed = !record.closed; preferences.closed = { ...preferences.closed, [id]: record.closed }; save(); filter();
    });
    star.addEventListener('click', () => { record.favorite = !record.favorite; preferences.favorites = { ...preferences.favorites, [id]: record.favorite }; save(); filter(); });
    reset.addEventListener('click', () => {
      begin(); resetControls.forEach((input) => { if (input.type === 'checkbox') input.checked = defaults[input.id]; else input.value = defaults[input.id]; });
      preview(); commit(); sync();
    });
  }

  function filter() {
    const query = $('parameterSearch').value.trim().toLowerCase(); const searching = Boolean(query || favoritesOnly);
    scroll.classList.toggle('searching', searching);
    let count = 0;
    sections.forEach((record) => {
      record.text = `${record.title} ${record.toggle.textContent} ${record.body.textContent}`.toLowerCase();
      const match = (!query || record.text.includes(query)) && (!favoritesOnly || record.favorite);
      record.section.hidden = !match;
      record.body.hidden = record.closed && !searching;
      record.toggle.setAttribute('aria-expanded', String(!record.body.hidden));
      record.star.classList.toggle('active', record.favorite); record.star.setAttribute('aria-pressed', String(record.favorite));
      const workflowHidden = document.body.dataset.branchWorkflow === 'on'
        && record.section.matches('#branchWorkbenchPanel, .wb-tree-parameters, #generatorPanel, #spatialControlsPanel, #branchRulesPanel, #mainSizePanel');
      if (match && !workflowHidden) count++;
    });
    // Workflow stages move live controls out of their original group. Search
    // those moved units too, using a separate attribute so workbench-managed
    // hidden states (flowers, hedge dimensions, unavailable tools) remain intact.
    if (document.body.dataset.branchWorkflow === 'on') {
      for (const unit of scroll.querySelectorAll('.branch-workflow-search-unit')) {
        const text = `${unit.dataset.workflowSearch || ''} ${unit.textContent}`.toLowerCase();
        const favorite = sections.find(record => record.id === unit.dataset.workflowFavorite)?.favorite || false;
        const match = (!query || text.includes(query)) && (!favoritesOnly || favorite);
        unit.dataset.searchHidden = String(!match);
        if (match) count++;
      }
    }
    empty.hidden = !searching || count > 0;
    $('parameterFavorites').classList.toggle('active', favoritesOnly);
    $('parameterFavorites').setAttribute('aria-pressed', String(favoritesOnly));
    document.dispatchEvent(new CustomEvent('parameter-workspace-filter', {detail:{query, searching}}));
  }
  $('parameterSearch').addEventListener('input', filter);
  $('parameterFavorites').addEventListener('click', () => { favoritesOnly = !favoritesOnly; filter(); });
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    $('parameterSearch').value = ''; favoritesOnly = false; filter();
    (scope.querySelector('.workspace-location') || scope).textContent = document.body.dataset.workbench === 'VINE' ? '藤蔓植物 · 当前素材' : document.body.dataset.workbench === 'BRANCH' ? '枝条造型 · 当前枝簇' : button.dataset.tab === 'edit' ? '造型编辑 · 当前工具 / 当前选择' : button.dataset.tab === 'output' ? '资产输出 · 整树' : '生成参数 · 整树';
  }));

  function valueAt(input, value) {
    const min = input.min === '' ? -Infinity : Number(input.min); const max = input.max === '' ? Infinity : Number(input.max);
    const step = Number(input.step) || 1;
    return Number(Math.min(max, Math.max(min, Math.round(value / step) * step)).toFixed(6));
  }
  function dispatch(input, type) { input.dispatchEvent(new Event(type, { bubbles: true })); }
  for (const input of document.querySelectorAll('.parameter-panel input[type="number"], #currentBranchPanel input[type="number"]')) {
    if (input.closest('#bundlePanel, #sculptPanel, .generator-workspace, .legacy-authoring')) continue;
    const label = input.closest('label');
    if (!label || input.hidden) continue;
    const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!textNode) continue;
    const name = textNode.textContent.trim();
    input.setAttribute('aria-label', name);
    const scrubber = document.createElement('span'); scrubber.className = 'parameter-scrub'; scrubber.textContent = name;
    scrubber.title = '左右拖动调节，Shift 微调'; textNode.replaceWith(scrubber);
    const field = document.createElement('div'); field.className = 'parameter-number'; input.before(field); field.append(input);
    const global = defaults[input.id] !== undefined;
    const baseline = global ? Number(Number(defaults[input.id]).toFixed(6)) : input.defaultValue;
    const reset = createButton('rotate-ccw', `重置${name}`); reset.className = 'parameter-reset'; field.append(reset);
    const record = { input, field, baseline, slider: null }; numeric.push(record);
    reset.addEventListener('click', () => { if (global) begin(); input.value = baseline; dispatch(input, 'input'); dispatch(input, 'change'); sync(); });
    if (input.min !== '' && input.max !== '' && Number(input.max) <= 1000 && !['mainSegments', 'radialSegments'].includes(input.id)) {
      const slider = document.createElement('input'); slider.type = 'range'; slider.className = 'parameter-slider';
      slider.min = input.min; slider.max = input.max; slider.step = input.step; slider.value = input.value;
      slider.setAttribute('aria-label', `${name}滑条`); slider.dataset.parameter = input.id; label.append(slider); record.slider = slider;
      let origin = null, cancelled = false;
      slider.addEventListener('pointerdown', () => { origin = input.value; cancelled = false; if (global) begin(); });
      slider.addEventListener('input', () => { if (cancelled) return; input.value = slider.value; dispatch(input, 'input'); sync(); });
      slider.addEventListener('change', () => { if (!cancelled) dispatch(input, 'change'); cancelled = false; origin = null; sync(); });
      slider.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { cancelled = origin !== null; if (global) cancel(); else if (input.dataset.liveBranch) dispatch(input, 'parameter-edit-cancel'); else if (origin !== null) input.value = origin; sync(); event.preventDefault(); }
      });
      slider.addEventListener('pointercancel', () => { cancelled = true; if (input.dataset.liveBranch) dispatch(input, 'parameter-edit-cancel'); });
    }
    scrubber.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || input.disabled) return;
      event.preventDefault();
      if (global) begin();
      scrub = { input, scrubber, pointerId: event.pointerId, x: event.clientX, value: Number(input.value) || 0, original: input.value, moved: false, global };
      scrubber.setPointerCapture(event.pointerId);
    });
    scrubber.addEventListener('pointermove', (event) => {
      if (!scrub || scrub.input !== input) return;
      const dx = event.clientX - scrub.x;
      if (Math.abs(dx) < 3 && !scrub.moved) return;
      scrub.moved = true;
      input.value = valueAt(input, scrub.value + dx * (Number(input.step) || 1) * (event.shiftKey ? 0.1 : 1));
      dispatch(input, 'input'); sync();
    });
    scrubber.addEventListener('pointerup', () => {
      if (!scrub || scrub.input !== input) return;
      const completed = scrub; scrub = null;
      if (completed.moved) dispatch(input, 'change'); else if (global) commit();
      scrubber.releasePointerCapture(completed.pointerId); sync();
    });
    scrubber.addEventListener('lostpointercapture', () => { if (scrub?.input === input) cancelScrub(); });
  }
  function cancelScrub() {
    if (!scrub) { sync(); return; }
    const previous = scrub; scrub = null;
    if (previous.global) cancel(); else if (previous.input.dataset.liveBranch) dispatch(previous.input, 'parameter-edit-cancel'); else { previous.input.value = previous.original; dispatch(previous.input, 'input'); }
    if (previous.scrubber.hasPointerCapture(previous.pointerId)) previous.scrubber.releasePointerCapture(previous.pointerId);
    sync();
  }
  window.addEventListener('blur', () => { cancelScrub(); cancel(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') cancelScrub(); });

  const scope = document.createElement('div'); scope.className = 'parameter-scope'; scope.textContent = '生成参数 · 整树';
  toolbar.after(scope);
  const handle = document.createElement('div'); handle.className = 'parameter-resizer'; handle.role = 'separator'; handle.tabIndex = 0;
  handle.setAttribute('aria-label', '调整参数面板宽度'); handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-valuemin', '280'); handle.setAttribute('aria-valuemax', '460');
  document.querySelector('.parameter-panel').append(handle);
  let resizing = null;
  function width(value) {
    const size = Math.min(460, Math.max(280, value)); preferences.width = size;
    document.documentElement.style.setProperty('--panel-left', `${size}px`); handle.setAttribute('aria-valuenow', String(size));
  }
  if (preferences.width) width(preferences.width);
  handle.addEventListener('pointerdown', (event) => { resizing = { x: event.clientX, width: document.querySelector('.parameter-panel').clientWidth }; handle.setPointerCapture(event.pointerId); });
  handle.addEventListener('pointermove', (event) => { if (resizing) width(resizing.width + event.clientX - resizing.x); });
  handle.addEventListener('pointerup', () => { resizing = null; save(); });
  handle.addEventListener('lostpointercapture', () => { resizing = null; });
  handle.addEventListener('keydown', (event) => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { width((preferences.width || 326) + (event.key === 'ArrowRight' ? 10 : -10)); save(); event.preventDefault(); } });

  function sync() {
    numeric.forEach(({ input, field, baseline, slider }) => {
      field.classList.toggle('modified', input.value !== '' && Math.abs(Number(input.value) - Number(baseline)) > 1e-6);
      field.classList.toggle('mixed', input.value === '' && input.placeholder === '混合值');
      if (slider) { slider.value = input.value || baseline; slider.style.setProperty('--value', `${(Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min)) * 100}%`); }
    });
  }
  filter(); sync(); window.lucide?.createIcons();
  return {
    sync, cancelScrub,
    selectionChanged(count, key) {
      if (key !== selectionKey) { if (count) showContext(true); selectionKey = key; }
      $('contextCount').dataset.branchCount = String(count);
      if (document.body.dataset.unitEditing !== 'on') $('contextCount').textContent = String(count);
    },
  };
}
