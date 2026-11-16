import { getViewportNavigationMode, subscribeViewportNavigation, viewportNavigationPresets } from './viewport-navigation.js';
import { wikiCategories } from './help-wiki-content.js';
import { workspaceHelpPicture } from './help-wiki-home-window-media.js';
import { wikiImageMarkers } from './help-wiki-markers.js';

const media = new URL('./help-wiki-assets/', import.meta.url);
const entries = wikiCategories.flatMap(category => category.groups.flatMap(group =>
  group.articles.map(article => ({ ...article, category, group }))));
const articles = new Map(entries.map(article => [article.id, article]));
const treeCases = entries.filter(article => article.caseInput);
const readingStateKey = 'shuyaer.wiki.reading';

const featured = [
  ['viewport-navigation', 'mouse'],
  ['import-trunk', 'box'],
  ['tree-lights', 'lightbulb'],
  ['staged-model', 'layers-3'],
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function icon(name) {
  const node = element('i');
  node.dataset.lucide = name;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function button(label, className, iconName) {
  const node = element('button', className);
  node.type = 'button';
  if (iconName) node.append(icon(iconName));
  if (label) node.append(element('span', '', label));
  return node;
}

function instruction(tag, text) {
  const node = element(tag);
  let cursor = 0;
  for (const match of text.matchAll(/「[^」]+」/gu)) {
    node.append(document.createTextNode(text.slice(cursor, match.index)), element('strong', 'wiki-control-label', match[0]));
    cursor = match.index + match[0].length;
  }
  node.append(document.createTextNode(text.slice(cursor)));
  return node;
}

const fold = value => value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
const searchIndex = entries.map(article => {
  const sections = article.sections.flatMap(section => [
    section.title, section.text, ...(section.items || []),
    ...(section.steps || []).flatMap(step => [step.title, step.text, ...(step.actions || []), step.check]),
  ]).filter(Boolean);
  const passages = [article.summary, ...sections, article.callout].filter(Boolean);
  return {
    article,
    title: fold(article.title),
    keywords: fold([article.keywords, article.caseInput, article.category.title, article.group.title].join(' ')),
    passages: passages.map(text => ({ text, terms: fold(text) })),
  };
});

function searchArticles(query) {
  const words = query.split(/\s+/u).map(fold).filter(Boolean);
  if (!words.length) return [];
  return searchIndex.flatMap(entry => {
    const scores = words.map(word => entry.title.includes(word) ? 8
      : entry.keywords.includes(word) ? 4
      : entry.passages.some(passage => passage.terms.includes(word)) ? 1 : 0);
    if (scores.includes(0)) return [];
    const matching = entry.passages.find(passage => words.some(word => passage.terms.includes(word)));
    return [{ article: entry.article, excerpt: matching?.text || entry.article.summary, score: scores.reduce((sum, score) => sum + score, 0) }];
  }).sort((a, b) => b.score - a.score);
}

function makeNavigation() {
  const wrapper = element('div', 'wiki-table-scroll');
  const table = element('table', 'help-wiki-navigation');
  table.innerHTML = '<caption>视口操作预设</caption><thead><tr><th scope="col">模式</th><th scope="col">旋转</th><th scope="col">平移</th><th scope="col">缩放</th></tr></thead>';
  const body = table.createTBody();
  for (const [id, preset] of Object.entries(viewportNavigationPresets)) {
    const row = body.insertRow();
    row.dataset.wikiPreset = id;
    const label = element('th', '', preset.label);
    label.scope = 'row';
    row.append(label);
    for (const value of [preset.orbit, preset.pan, preset.zoom]) row.insertCell().textContent = value;
  }
  wrapper.append(table);
  return wrapper;
}

function markersFor(figure) {
  const markers = wikiImageMarkers[figure.src] || [];
  return figure.markers ? figure.markers.map(index => markers[index - 1]).filter(Boolean) : markers;
}

function markedImage(figure, lazy) {
  const photo = element('span', 'wiki-photo');
  const img = element('img');
  img.src = new URL(figure.src, media).href;
  img.alt = figure.alt;
  if (figure.width && figure.height) {
    img.width = figure.width;
    img.height = figure.height;
  }
  if (lazy) {
    img.loading = 'lazy';
    img.decoding = 'async';
  }
  photo.append(img);

  markersFor(figure).forEach(({ x, y, w, h }, index) => {
    const mark = element('span', 'wiki-photo-mark');
    mark.setAttribute('aria-hidden', 'true');
    mark.style.left = x + '%';
    mark.style.top = y + '%';
    mark.style.width = w + '%';
    mark.style.height = h + '%';
    if (x < 4) mark.classList.add('at-left');
    if (y < 4) mark.classList.add('at-top');
    mark.append(element('span', 'wiki-mark-number', String(index + 1)));
    photo.append(mark);
  });
  return { photo, img };
}

function markerLegend(figure) {
  const markers = markersFor(figure);
  if (!markers.length) return null;
  const list = element('ol', 'wiki-photo-legend');
  list.setAttribute('aria-label', '图中圈号');
  for (const [index, { label }] of markers.entries()) {
    const item = element('li');
    item.append(element('span', 'wiki-legend-number', String(index + 1)), element('span', '', label));
    list.append(item);
  }
  return list;
}

function createViewer() {
  const dialog = element('dialog', 'help-wiki-viewer');
  dialog.setAttribute('aria-labelledby', 'helpWikiImageTitle');
  dialog.innerHTML = '<header><h2 id="helpWikiImageTitle"></h2><button type="button" data-zoom aria-pressed="false">原始大小</button><button type="button" data-close aria-label="关闭大图"><i data-lucide="x" aria-hidden="true"></i></button></header><div class="wiki-viewer-scroll" tabindex="0" aria-label="大图"></div><div class="wiki-viewer-legend" hidden></div>';
  document.body.append(dialog);
  const title = dialog.querySelector('h2');
  const scroll = dialog.querySelector('.wiki-viewer-scroll');
  const legend = dialog.querySelector('.wiki-viewer-legend');
  const zoom = dialog.querySelector('[data-zoom]');
  const close = dialog.querySelector('[data-close]');
  let trigger = null;
  let current = null;

  function fitPhoto() {
    if (!current || !dialog.open) return;
    const { figure, photo, img } = current;
    const width = img.naturalWidth || figure.width;
    const height = img.naturalHeight || figure.height;
    if (!width || !height) return;
    const padding = 20;
    const full = dialog.classList.contains('is-full-size');
    const fit = Math.min(width, scroll.clientWidth - padding, (scroll.clientHeight - padding) * width / height);
    photo.style.width = (full ? width : Math.max(1, fit)) + 'px';
  }

  function setZoom(full) {
    dialog.classList.toggle('is-full-size', full);
    zoom.textContent = full ? '适合窗口' : '原始大小';
    zoom.setAttribute('aria-pressed', String(full));
    fitPhoto();
    scroll.scrollTo(0, 0);
  }

  new ResizeObserver(fitPhoto).observe(scroll);
  close.onclick = () => dialog.close();
  zoom.onclick = () => setZoom(!dialog.classList.contains('is-full-size'));
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => {
    trigger?.focus();
    trigger = null;
    current = null;
    scroll.replaceChildren();
    legend.replaceChildren();
  });
  return (figure, source) => {
    trigger = source;
    title.textContent = figure.caption || figure.alt;
    const { photo, img } = markedImage(figure, false);
    current = { figure, photo, img };
    scroll.replaceChildren(photo);
    img.addEventListener('load', fitPhoto, { once: true });
    const labels = markerLegend(figure);
    legend.hidden = !labels;
    if (labels) legend.replaceChildren(labels);
    dialog.showModal();
    setZoom(false);
    close.focus();
  };
}

export function mountHelpWikiReader() {
  const manual = element('main', 'help-wiki');
  manual.id = 'helpWiki';
  manual.setAttribute('aria-labelledby', 'helpWikiTitle');
  manual.innerHTML = `
    <header class="wiki-header">
      <div class="wiki-heading"><span class="wiki-mark"><i data-lucide="book-open" aria-hidden="true"></i></span><h2 id="helpWikiTitle">使用手册</h2></div>
      <div class="wiki-search"><i data-lucide="search" aria-hidden="true"></i><input type="search" placeholder="搜索快捷键、功能或教程" aria-label="搜索快捷键、功能或教程" autocomplete="off"><button type="button" data-clear aria-label="清空搜索" hidden><i data-lucide="x" aria-hidden="true"></i></button></div>
      <button type="button" class="wiki-close" data-close aria-label="关闭使用手册"><i data-lucide="x" aria-hidden="true"></i></button>
    </header>
    <div class="wiki-layout">
      <button type="button" class="wiki-menu-toggle" aria-controls="wikiSidebar" aria-expanded="false"><i data-lucide="list" aria-hidden="true"></i><span>目录</span></button>
      <nav class="wiki-sidebar" id="wikiSidebar" aria-label="手册目录"></nav>
      <div class="wiki-reader" tabindex="-1"><div class="wiki-page"></div><aside class="wiki-toc" aria-label="本页目录" hidden></aside></div>
    </div>`;
  document.body.append(manual);
  const viewImage = createViewer();
  const sidebar = manual.querySelector('.wiki-sidebar');
  const reader = manual.querySelector('.wiki-reader');
  const page = manual.querySelector('.wiki-page');
  const toc = manual.querySelector('.wiki-toc');
  const search = manual.querySelector('input');
  const clear = manual.querySelector('[data-clear]');
  const mobileMenu = manual.querySelector('.wiki-menu-toggle');
  const refreshIcons = () => window.lucide?.createIcons();
  let readingState;
  try { readingState = JSON.parse(localStorage.getItem(readingStateKey)); } catch {}
  let selected = articles.get(readingState?.articleId) || null;
  let outline = [];
  let caseReturn = null;
  let saveTimer;
  search.value = typeof readingState?.query === 'string' ? readingState.query : '';

  function saveReadingState() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(readingStateKey, JSON.stringify({
        articleId: selected?.id || null,
        query: search.value,
        scrollTop: reader.scrollTop,
      }));
    } catch {}
  }

  function makeFigure(figure) {
    const wrapper = element('figure', 'wiki-figure');
    const trigger = button('', 'wiki-figure-open');
    trigger.setAttribute('aria-label', '查看大图：' + figure.alt);
    if (figure.width) trigger.style.setProperty('--wiki-image-width', figure.width + 'px');
    const { photo, img } = markedImage(figure, true);
    const enlarge = element('span', 'wiki-enlarge', '放大');
    enlarge.prepend(icon('expand'));
    trigger.append(photo, enlarge);
    trigger.onclick = () => viewImage(figure, trigger);
    img.addEventListener('error', () => { wrapper.hidden = true; });
    const caption = element('figcaption');
    const description = element('div', 'wiki-photo-caption');
    const type = figure.kind === 'illustration' ? '示意图' : '软件截图';
    description.append(element('strong', '', type), element('span', '', figure.caption || figure.alt));
    caption.append(description);
    wrapper.append(trigger, caption);
    const labels = markerLegend(figure);
    if (labels) caption.append(labels);
    return wrapper;
  }

  function setMobileMenu(expanded) {
    mobileMenu.setAttribute('aria-expanded', String(expanded));
    sidebar.classList.toggle('is-open', expanded);
  }

  mobileMenu.onclick = () => setMobileMenu(mobileMenu.getAttribute('aria-expanded') !== 'true');

  function openHome() {
    selected = null;
    caseReturn = null;
    search.value = '';
    setMobileMenu(false);
    render(true);
    saveReadingState();
  }

  function openArticle(id, returnTo = null) {
    selected = articles.get(id);
    caseReturn = returnTo;
    search.value = '';
    setMobileMenu(false);
    render(true);
    saveReadingState();
  }

  const home = button('首页', 'wiki-nav-home', 'house');
  home.onclick = openHome;
  sidebar.append(home);
  const navLinks = new Map();
  for (const category of wikiCategories) {
    const area = element('section', 'wiki-nav-category');
    const heading = element('h3', '', category.title);
    heading.prepend(icon(category.id === 'controls' ? 'keyboard' : 'workflow'));
    area.append(heading);
    for (const group of category.groups) {
      const details = element('details', 'wiki-nav-group');
      const summary = element('summary', '', group.title);
      summary.prepend(icon('chevron-right'));
      details.append(summary);
      details.open = category.id === 'controls' || group === category.groups[0];
      for (const article of group.articles) {
        const link = button(article.title, 'wiki-nav-article');
        link.onclick = () => openArticle(article.id);
        details.append(link);
        navLinks.set(article.id, { link, details });
      }
      area.append(details);
    }
    sidebar.append(area);
  }

  function syncNavigation(isSearch) {
    home.setAttribute('aria-current', !selected && !isSearch ? 'page' : 'false');
    for (const [id, { link, details }] of navLinks) {
      const current = !isSearch && selected?.id === id;
      link.setAttribute('aria-current', current ? 'page' : 'false');
      if (current) details.open = true;
    }
  }

  function addHeading(tag, title, parent) {
    const heading = element(tag, '', title);
    if (tag === 'h1') heading.tabIndex = -1;
    parent.append(heading);
    return heading;
  }

  function renderTreeCases() {
    const section = element('section', 'wiki-case-start');
    addHeading('h2', '整树实战', section);
    section.append(element('p', '', '按手头的素材选一条路线，跟着做完一棵树。'));
    const grid = element('div', 'wiki-case-grid');
    for (const article of treeCases) {
      const card = button('', 'wiki-case-card');
      card.dataset.wikiCase = article.id;
      const cover = element('img', 'wiki-case-cover');
      cover.src = new URL(article.comparison.before.src, media).href;
      cover.alt = '';
      cover.loading = 'lazy';
      cover.addEventListener('error', () => { cover.hidden = true; });
      const copy = element('span', 'wiki-case-copy');
      copy.append(element('small', '', article.caseInput), element('strong', '', article.title), icon('arrow-up-right'));
      card.append(cover, copy);
      card.onclick = () => openArticle(article.id);
      grid.append(card);
    }
    section.append(grid);
    page.append(section);
  }

  function renderHome() {
    const hero = element('section', 'wiki-hero');
    const intro = element('div', 'wiki-hero-intro');
    addHeading('h1', '植物工坊使用手册', intro);
    intro.append(element('p', '', '查找常用快捷键，或跟着图文教程完成整树造型、装配和导出。'));
    const start = button('制作第一棵树', 'wiki-start', 'arrow-right');
    start.onclick = () => openArticle(treeCases[0]?.id || 'first-tree');
    intro.append(start);
    const art = element('img', 'wiki-hero-art');
    art.src = new URL('workflow-illustration.webp', media).href;
    art.alt = '同一棵树从控制骨架、木枝造型到树冠与灯带的制作阶段';
    art.addEventListener('error', () => { art.hidden = true; });
    hero.append(intro, art);
    page.append(hero);

    const guide = element('details', 'wiki-workspace-help');
    guide.append(element('summary', '', '边操作边看手册'));
    const guideSteps = element('ol', 'wiki-steps');
    for (const text of [
      '点工作台顶部的「帮助」，在右侧打开独立手册。打开后可以直接点回工作台，继续编辑模型或调整参数。',
      '拖动手册的标题栏移开窗口，拖动边缘或右下角调整大小。用「目录」或搜索找教程，点截图上的「放大」看圈选细节。',
      '用手册右上的关闭按钮暂时收起。在同一次使用中，再点工作台的「帮助」会回到当前教程和阅读位置。',
    ]) guideSteps.append(instruction('li', text));
    guide.append(guideSteps, makeFigure({
      ...workspaceHelpPicture,
      alt: 'DX12 整树工作台和右侧独立的使用手册窗口',
      caption: '树鸭儿开发版中同时打开的工作台和手册。圈出了入口、标题栏、窗口边缘、搜索和关闭按钮。',
    }));
    page.append(guide);

    if (treeCases.length) renderTreeCases();

    const quick = element('section', 'wiki-quick');
    addHeading('h2', treeCases.length ? '常用专题' : '从这里开始', quick);
    const grid = element('div', 'wiki-quick-grid');
    for (const [id, glyph] of featured) {
      const article = articles.get(id);
      if (!article) continue;
      const card = button('', 'wiki-quick-card', glyph);
      const text = element('span', 'wiki-quick-copy');
      text.append(element('strong', '', article.title), element('span', '', article.summary));
      card.append(text, icon('arrow-up-right'));
      card.onclick = () => openArticle(id);
      grid.append(card);
    }
    quick.append(grid);
    page.append(quick);
  }

  function renderSearch(query) {
    addHeading('h1', '搜索教程', page);
    const results = searchArticles(query);
    const feedback = element('p', 'wiki-search-feedback', results.length
      ? '找到 ' + results.length + ' 篇文章'
      : '没有找到匹配的文章。可以试试「灯带」「PVE」或「Ctrl+Alt」。');
    feedback.setAttribute('role', 'status');
    page.append(feedback);
    const list = element('div', 'wiki-search-results');
    for (const { article, excerpt } of results) {
      const row = button('', 'wiki-search-result');
      row.append(element('small', '', article.category.title + ' / ' + article.group.title),
        element('strong', '', article.title), element('span', '', excerpt));
      row.onclick = () => openArticle(article.id);
      list.append(row);
    }
    page.append(list);
  }

  function updatePreset(mode) {
    for (const row of page.querySelectorAll('[data-wiki-preset]')) {
      const current = row.dataset.wikiPreset === mode;
      row.classList.toggle('is-current', current);
      row.querySelector('th').textContent = viewportNavigationPresets[row.dataset.wikiPreset].label + (current ? '（当前）' : '');
    }
  }

  function renderRelated(ids, item) {
    const links = element('nav', 'wiki-step-related');
    links.setAttribute('aria-label', '专项教程');
    const returnTo = { articleId: selected.id, stepId: item.id, previous: caseReturn };
    for (const id of ids) {
      const related = articles.get(id);
      if (!related || id === returnTo.articleId) continue;
      const link = button(related.title, 'wiki-related-link', 'book-open');
      link.onclick = () => openArticle(id, returnTo);
      links.append(link);
    }
    if (links.childElementCount) item.append(links);
  }

  function articleSection(section, index) {
    const node = element('section', 'wiki-article-section');
    const title = addHeading('h2', section.title, node);
    title.id = 'wiki-section-' + index;
    title.tabIndex = -1;
    if (section.text) node.append(element('p', '', section.text));
    if (section.items?.length) {
      const list = element('ul', 'wiki-article-list');
      for (const item of section.items) list.append(element('li', '', item));
      node.append(list);
    }
    if (section.steps?.length) {
      const steps = element('ol', 'wiki-steps');
      for (const [stepIndex, step] of section.steps.entries()) {
        const item = element('li');
        if (step.title) addHeading('h3', step.title, item);
        if (step.text) item.append(instruction('p', step.text));
        if (step.actions?.length) {
          const actions = element('ul', 'wiki-step-actions');
          for (const action of step.actions) actions.append(instruction('li', action));
          item.append(actions);
        }
        if (step.figure) item.append(makeFigure(step.figure));
        if (step.check) {
          const check = element('p', 'wiki-step-check');
          check.append(icon('circle-check'), instruction('span', step.check));
          item.append(check);
        }
        if (step.related?.length) {
          item.id = 'wiki-step-' + index + '-' + stepIndex;
          item.tabIndex = -1;
          renderRelated(step.related, item);
        }
        steps.append(item);
      }
      node.append(steps);
    }
    if (section.figure) node.append(makeFigure(section.figure));
    return { node, title };
  }

  function renderComparison(comparison) {
    const section = element('section', 'wiki-case-comparison');
    addHeading('h2', '起点与成品', section);
    const grid = element('div', 'wiki-case-comparison-grid');
    for (const [label, figure] of [['起点', comparison.before], ['成品', comparison.after]]) {
      const entry = element('div');
      addHeading('h3', label, entry);
      entry.append(makeFigure(figure));
      grid.append(entry);
    }
    section.append(grid);
    page.append(section);
  }

  function renderArticle(article) {
    if (caseReturn) {
      const { articleId, stepId, previous } = caseReturn;
      const backToStep = button('返回实战步骤', 'wiki-case-return', 'arrow-left');
      backToStep.onclick = () => {
        openArticle(articleId, previous);
        const step = document.getElementById(stepId);
        step?.focus({ preventScroll: true });
        step?.scrollIntoView({ block: 'start' });
        updateOutline();
      };
      page.append(backToStep);
    }
    const crumb = element('div', 'wiki-crumb');
    const back = button('首页', 'wiki-crumb-home');
    back.onclick = openHome;
    crumb.append(back, icon('chevron-right'), element('span', '', article.category.title),
      icon('chevron-right'), element('span', '', article.group.title));
    page.append(crumb);
    addHeading('h1', article.title, page);
    page.append(element('p', 'wiki-summary', article.summary));
    if (article.comparison) renderComparison(article.comparison);
    if (article.navigation) {
      page.append(makeNavigation());
      updatePreset(getViewportNavigationMode());
    }
    if (article.figure) page.append(makeFigure(article.figure));
    if (article.callout) {
      const note = element('aside', 'wiki-note');
      note.append(icon('info'), element('p', '', article.callout));
      page.append(note);
    }

    const inline = element('details', 'wiki-inline-toc');
    const inlineJumps = element('nav');
    inlineJumps.setAttribute('aria-label', '本页目录');
    if (article.sections.length > 1) {
      inline.append(element('summary', '', '本页目录'), inlineJumps);
      page.append(inline);
    }
    toc.append(element('h2', '', '本页目录'));
    const jumps = element('nav');
    for (const [index, section] of article.sections.entries()) {
      const { node, title } = articleSection(section, index);
      page.append(node);
      const links = [jumps, inlineJumps].map(nav => {
        const jump = button(section.title, 'wiki-toc-jump');
        jump.onclick = () => {
          if (nav === inlineJumps) inline.open = false;
          title.focus({ preventScroll: true });
          title.scrollIntoView({ block: 'start' });
          updateOutline();
        };
        nav.append(jump);
        return jump;
      });
      outline.push({ title, links });
    }
    toc.append(jumps);
    toc.hidden = outline.length < 2;

    const categoryEntries = entries.filter(item => item.category === article.category);
    const index = categoryEntries.indexOf(article);
    const adjacent = element('nav', 'wiki-adjacent');
    adjacent.setAttribute('aria-label', '相邻文章');
    for (const [label, item, glyph] of [
      ['上一篇', categoryEntries[index - 1], 'arrow-left'],
      ['下一篇', categoryEntries[index + 1], 'arrow-right'],
    ]) {
      if (!item) continue;
      const link = button('', 'wiki-adjacent-link', glyph);
      const copy = element('span');
      copy.append(element('small', '', label), element('strong', '', item.title));
      link.append(copy);
      link.onclick = () => openArticle(item.id);
      adjacent.append(link);
    }
    if (adjacent.childElementCount) page.append(adjacent);
  }

  function updateOutline() {
    if (!outline.length) return;
    const start = reader.getBoundingClientRect().top + 88;
    const active = outline.findLast(item => item.title.getBoundingClientRect().top <= start);
    for (const { links, title } of outline) {
      for (const jump of links) jump.setAttribute('aria-current', title === active?.title ? 'location' : 'false');
    }
  }

  function render(focusHeading = false) {
    const query = search.value.trim();
    clear.hidden = !search.value;
    outline = [];
    toc.replaceChildren();
    toc.hidden = true;
    page.replaceChildren();
    if (query) renderSearch(query);
    else if (selected) renderArticle(selected);
    else renderHome();
    syncNavigation(Boolean(query));
    reader.scrollTop = 0;
    updateOutline();
    if (!query) refreshIcons();
    if (focusHeading) page.querySelector('h1')?.focus({ preventScroll: true });
  }

  search.addEventListener('input', () => {
    render();
    saveReadingState();
  });
  search.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      page.querySelector('.wiki-search-result')?.click();
    }
  });
  clear.onclick = () => {
    search.value = '';
    render();
    saveReadingState();
    search.focus();
  };
  reader.addEventListener('scroll', () => {
    updateOutline();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveReadingState, 160);
  }, { passive: true });
  window.addEventListener('pagehide', saveReadingState);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveReadingState();
  });
  subscribeViewportNavigation(updatePreset);

  const closeReader = () => {
    saveReadingState();
    if (window.__shuyaerHelpReaderHost) window.chrome.webview.postMessage('shuyaer-help:close');
    else window.close();
  };
  manual.querySelector('[data-close]').onclick = closeReader;
  manual.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      if (search.value) clear.click();
      else closeReader();
    }
  });
  render();
  if (Number.isFinite(readingState?.scrollTop)) reader.scrollTop = readingState.scrollTop;
  updateOutline();
}
