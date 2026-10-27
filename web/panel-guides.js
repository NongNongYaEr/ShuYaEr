// Decorative artwork and readable instructions only; editor actions stay in their owners.
export function createPanelGuides() {
  function image(asset, className) {
    const art = document.createElement('img'); art.className = className;
    art.src = `/brand/guide-${asset}-v1.png`; art.alt = ''; art.setAttribute('aria-hidden', 'true');
    art.width = 240; art.height = 160; art.draggable = false; art.decoding = 'async';
    return art;
  }
  function illustrate(header, asset, className) {
    header.classList.add('panel-guide-hero', className);
    header.append(image(asset, 'panel-guide-art'));
  }
  function steps(parent, items, label) {
    const list = document.createElement('ol'); list.className = 'panel-guide-steps'; list.setAttribute('aria-label', label);
    for (const [index, text] of items.entries()) {
      const item = document.createElement('li');
      const number = document.createElement('span'); number.className = 'panel-guide-step-number'; number.textContent = index + 1; number.setAttribute('aria-hidden','true');
      item.append(number, document.createTextNode(text)); list.append(item);
    }
    parent.append(list);
    return list;
  }
  const exporter = document.querySelector('#brandExportDialog .brand-dialog-heading');
  illustrate(exporter, 'export', 'panel-guide-export');
  const caption = document.querySelector('#brandExportDialog > .brand-caption');
  caption.textContent = '工程留在这里继续编辑，导出把植物带到其他创作软件。';
  exporter.firstElementChild.append(caption);
  steps(exporter.firstElementChild, ['选用途', '确认格式', '导出资产'], '导出步骤');
  const purposes = [
    ['通用模型', '用于其他建模软件或常规网格导入。'],
    ['UE · PVE 流程', '首选 UE/PVE 完整单元枝包；旧版骨架数据不含完整单元枝模型。'],
    ['常春藤 / 贴面植物', '用于 UE 静态植被工作台，共享叶片与材质。'],
  ];
  document.querySelectorAll('#brandExportDialog .brand-export-card').forEach((card, index) => {
    const tag = document.createElement('span'); tag.className = 'panel-guide-purpose'; tag.textContent = purposes[index][0]; card.prepend(tag);
    const hint = document.createElement('p'); hint.className = 'panel-guide-choice'; hint.textContent = purposes[index][1];
    card.querySelector('p').after(hint);
    const actions = document.createElement('div'); actions.className = 'panel-guide-export-actions';
    for (const control of card.querySelectorAll(':scope > button, :scope > select')) actions.append(control);
    card.append(actions);
  });

  const library = document.querySelector('#branchLibraryDialog > header');
  illustrate(library, 'branches', 'panel-guide-library');
  library.querySelector('p').textContent = '挑一支合适的单元枝，用到当前整树，或进入枝条工作台精修。';
  steps(library.firstElementChild, ['筛选植物与配色', '点选查看预览', '选作素材或双击编辑'], '单元枝使用步骤');
  const note = document.createElement('p'); note.className = 'panel-guide-library-note';
  note.innerHTML = '<strong>想把它用到整树上？</strong><span>在整树预览中点击「选作当前树的装配素材」，再到左侧「单元枝」页拖入分区。右侧顶部随时查看当前装配。</span>';
  document.querySelector('#branchLibraryDialog .blm-body aside').append(note);

  const projects = document.querySelector('#projectLibraryDialog > header');
  illustrate(projects, 'projects', 'panel-guide-destination');
  const projectSteps = steps(projects.firstElementChild, [], '工程库使用步骤');
  function projectGuide() {
    const templates = document.getElementById('plTemplates').classList.contains('accent');
    projects.querySelector('p').textContent = templates
      ? '从完整树型开始，创建可编辑副本；自己的工程可按版本继续编辑。'
      : '查找已有工程，核对植物、类型和来源，再打开继续创作。';
    const list = steps(document.createElement('div'), templates
      ? ['筛选植物与类型', '点选查看版本', '创建副本或打开']
      : ['查找已有工程', '核对来源与内容', '打开继续编辑'], '工程库使用步骤');
    projectSteps.replaceChildren(...list.children);
  }
  new MutationObserver(projectGuide).observe(projects.querySelector('h2'), {childList:true});
  projectGuide();

  const units = document.querySelector('#plantUnitDialog > .pu-header');
  if(!units.closest('.pu-workbench-v2')){
    illustrate(units, 'units', 'panel-guide-destination');
    steps(units.firstElementChild, ['选择植物套装', '预览单元与尺寸', '加入单元枝组合'], '叶花果工作台步骤');
  }

  function inlineGuide(section, title, caption, note) {
    const guide = document.createElement('div'); guide.className = 'panel-guide-inline';
    const copy = document.createElement('div');
    const heading = document.createElement('strong'); heading.textContent = title;
    const description = document.createElement('p'); description.textContent = caption;
    copy.append(heading, description);
    const help = document.createElement('p'); help.className = 'panel-guide-inline-note'; help.textContent = note;
    guide.append(copy, image('materials', 'panel-guide-inline-art'), help);
    (section.querySelector(':scope > .parameter-group-body') || section).prepend(guide);
  }
  inlineGuide(document.getElementById('leafResourcePanel'), '给叶片添上质感', '贴图决定细节，材质调节表面表现。', '先选叶片套装或导入贴图，再调透明裁切与粗糙度。');
  inlineGuide(document.querySelector('.color-section'), '调出植物的色彩', '分别设置树皮、叶片与花果的颜色。', '颜色调节作用于当前植物；贴图与单元包仍在各自素材页管理。');
}
