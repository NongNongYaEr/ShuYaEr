export const LEAF_STYLE_MESSAGE = '单元枝的叶花果、贴图和内部样式请在枝条工作台编辑；保存素材版本后，再明确更新整树装配。';

export function canEditLeafStyle(api = {}) {
  return !(api.isTree ? api.isTree() : globalThis.document?.body?.dataset.workbench === 'TREE');
}

export function requireLeafStyleEditing(api = {}) {
  if (canEditLeafStyle(api)) return true;
  api.toast?.(LEAF_STYLE_MESSAGE, true);
  return false;
}

const colors = new Set(['leafColor', 'autumnColor', 'budColor', 'fruitColor']);
export function isLeafStyleControl(control) {
  return !!control && (colors.has(control.id) || !!control.closest?.('.leaf-style-internal'));
}

export function restoreLeafStyleControls(settings, bindings, getControl) {
  for (const [key, id] of Object.entries(bindings)) {
    const control = getControl(id);
    if (!isLeafStyleControl(control) || settings[key] === undefined) continue;
    if (control.type === 'checkbox') control.checked = !!settings[key]; else control.value = settings[key];
  }
}

// The existing controls and saved data remain in place. Only their authoring
// boundary changes, so BRANCH/VINE and old project loading retain their behavior.
export function createLeafStyleBoundaryUi(api) {
  const page = document.querySelector('[data-page="foliage"]');
  for (const node of [...page.children]) if (!['leafResourcePanel', 'flowerResourcePanel'].includes(node.id)) node.classList.add('leaf-style-internal');
  const style = document.createElement('style');
  style.textContent = 'body[data-workbench="TREE"] .leaf-style-internal{display:none!important}#treeLeafStyleBoundary{border-left:3px solid var(--accent,#e7c552)}#treeLeafStyleBoundary[hidden]{display:none!important}';
  document.head.append(style);
  const panel = document.createElement('section'); panel.id = 'treeLeafStyleBoundary'; panel.className = 'parameter-section';
  panel.innerHTML = '<h2>叶花果随单元枝装配</h2><p class="vine-note">整树保留每个单元枝的完整模型。叶花果的布局、尺寸和贴图，在源单元枝工作台中编辑；保存新版本后，再明确更新装配。</p><button id="treeLeafStyleEditSource" type="button">编辑所选单元枝的源模型 →</button><p id="treeLeafStyleSelectionHint" class="vine-note"></p><p class="vine-note">下方共享库可浏览、保存和管理；套装应用与贴图调整请在枝条工作台或藤蔓工作区完成。旧工程已有样式和遮罩会继续读取。</p>';
  page.prepend(panel);
  const button = document.getElementById('treeLeafStyleEditSource');
  button.onclick = () => { if (!api.isTree() || !api.canEditSource()) return; api.editSource(); };
  function refresh() {
    const tree = api.isTree(); panel.hidden = !tree;
    button.disabled = !tree || !api.canEditSource();
    document.getElementById('treeLeafStyleSelectionHint').textContent = button.disabled ? '先在视口切换到「单元枝」并选中要编辑的实例。' : '已选中单元枝；打开源模型不会直接修改整树实例。';
    for (const id of colors) { const input = document.getElementById(id); if (input) { input.disabled = tree; input.title = tree ? LEAF_STYLE_MESSAGE : ''; } }
  }
  new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ['data-workbench'] });
  refresh(); return { refresh };
}
