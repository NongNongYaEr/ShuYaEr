const $ = id => document.getElementById(id);

// Move the original controls before the parameter/search system registers them.
// The inspector hosts the original live assembly controls, not a second copy.
export function prepareTreeAssemblyLayout() {
  const page = document.querySelector('[data-page="assembly"]');
  const workbenchPanel = $('branchWorkbenchPanel');
  page.append(workbenchPanel);
  workbenchPanel.querySelector('h2').textContent = '单元枝素材';

  const skeleton = document.createElement('section');
  skeleton.id = 'treeSkeletonStructure';
  skeleton.className = 'parameter-section generator-workspace wb-tree-only';
  skeleton.innerHTML = '<h2>骨架粗细与锥度</h2>';
  skeleton.append($('skeletonThicknessPanel'));
  document.querySelector('[data-page="structure"]').append(skeleton);

  const heading = workbenchPanel.querySelector('.wb-library-heading');
  heading.querySelector('strong').textContent = '当前工程 · 单元枝素材';
  const browse = document.createElement('button');
  browse.id = 'browseBranchCatalog'; browse.type = 'button';
  browse.className = 'tree-catalog-browse wb-tree-only';
  browse.textContent = '＋ 添加单元枝';
  browse.onclick = () => document.dispatchEvent(new Event('branch-catalog-pick'));
  heading.before(browse);

  const install = $('wbInstall').closest('details');
  install.open = false;
  install.querySelector('summary').textContent = '高级 · 手动安装与实例';
  const versions = $('assetVersionPanel');
  versions.open = false;
  const maintenance = document.createElement('details'); maintenance.className = 'wb-asset-maintenance';
  maintenance.innerHTML = '<summary>高级 · 编辑素材、导出与版本</summary>';
  maintenance.append($('wbEditAsset').parentElement, $('wbRenameAsset').parentElement, versions);
  workbenchPanel.append(maintenance);
  workbenchPanel.append($('treeSpeciesLibrary'));
  const scale = workbenchPanel.querySelector('.wb-assembly-scale');
  const advanced = document.createElement('details'); advanced.className = 'tree-assembly-advanced';
  advanced.innerHTML = '<summary>尺寸倍率与样本粗细</summary>';
  // Keep the frequently used zones/count above the less frequent corrections.
  scale.before(advanced); advanced.append(scale);
  $('wbAssemblyZones').parentElement.append(advanced);

  return { mount(workbench, getAuthoring) {
    const overview = document.createElement('section');
    overview.id = 'treeAssemblyOverview'; overview.className = 'tree-assembly-overview branch-workbench';
    overview.setAttribute('aria-label', '当前植物装配');
    overview.innerHTML = '<div class="tree-assembly-heading"><h3>当前植物装配</h3><span id="treeAssemblyTotal"></span></div><p id="treeAssemblyStatus" role="status"></p><div class="tree-assembly-actions"><button type="button" id="treeAssemblyChoose" title="打开左侧素材库，拖入下方分区装配">素材库 · 添加装配</button><button type="button" id="treeAssemblySelect" aria-pressed="false" title="点选树上的木枝、叶片或花果，G 移动、R 旋转、S 整体缩放；枝干编辑模式会自动恢复整树">点选 · 微调单元枝</button></div><p class="tree-assembly-pick-hint">点下方图片选本区同款，或点树上的某一支。G/R/S 微调 · C 整支梳理；左侧选材仅用于添加。</p>';
    const assembly = $('wbAssemblyZones').closest('.wb-assembly');
    const oldHeading = assembly.querySelector('.wb-library-heading');
    oldHeading.querySelector('strong').remove();
    oldHeading.before($('wbAssemblyJumpCount')); oldHeading.remove();
    assembly.querySelector(':scope > .vine-note').remove();
    $('wbAssemblyJumpCount').hidden = true;
    $('wbAssemblyZones').before(assembly.querySelector('.wb-assembly-count'));
    const quantityHelp = assembly.querySelector(':scope > .vine-note');
    if (quantityHelp) assembly.querySelector('.tree-assembly-advanced').append(quantityHelp);
    // Move exactly once. IDs, handlers and all original assembly transactions survive.
    overview.append($('structureAssemblyGroups'));
    overview.append(assembly);
    const fillHeading=document.createElement('h3');fillHeading.textContent='冠层填充 · 三类单元枝';fillHeading.className='tree-assembly-fill-heading';assembly.prepend(fillHeading);
    overview.append($('localAssemblyPanel'));
    document.querySelector('.inspector-scroll').prepend(overview);
    const tab = document.querySelector('[data-tab="assembly"]');
    $('treeAssemblyChoose').onclick = () => $('openBranchAssembly').click();
    $('treeAssemblySelect').onclick = () => document.dispatchEvent(new CustomEvent('tree-selection-kind', {detail:'INSTANCE'}));
    function refresh() {
      const tree = workbench.mode === 'TREE';
      overview.hidden = !tree; tab.hidden = !tree;
      if (!tree && tab.classList.contains('active')) document.querySelector('[data-tab="structure"]').click();
      if (!tree) return;
      const authoring = getAuthoring();
      const membership=workbench.assemblyLinks?.state;
      const instances = membership ? membership.instances.filter(i=>!i.legacyPlacement) : authoring.branch_instances || [];
      const skeletonOnly = $('skeletonEditModeBtn').getAttribute('aria-pressed') === 'true';
      const shown = [...$('wbAssemblyZones').children].reduce((n, row) => n + Number(row.dataset.count || 0), 0);
      const other = instances.length - shown;
      const legacyCount=workbench.assemblyLinks?.state.legacy?.total||0;
      const models=new Set(instances.map(i=>`${i.asset_id||i.id}@${i.pinned_revision||authoring.branch_library.find(a=>a.id===i.asset_id)?.revision||1}`));
      $('treeAssemblyTotal').textContent = `${models.size} 类 · ${instances.length} 个${legacyCount?` · 旧副本 ${legacyCount} 个`:''}`;
      $('treeAssemblyTotal').title='类数是完整单元枝源模型种类；个数是整树中的装配实例数量；旧完整副本另外计数，保持原造型与来源。';
      overview.setAttribute('aria-busy', String(workbench.busy));
      $('treeAssemblyStatus').textContent = skeletonOnly ? '枝干编辑中 · 单元枝暂停显示，装配保留'
        : workbench.busy ? '正在更新当前植物…'
        : instances.length ? `拖入即装配 · 可撤销${other > 0 ? ` · 另有 ${other} 枝独立或未分区实例` : ''}${membership?.summary.unresolved?` · ${membership.summary.unresolved} 条未生成记录不计入`:''}`
        : legacyCount ? '保留旧完整副本 · 可框选后用 C 整体调整'
          : '尚未装配 · 从左侧拖入一个样本开始';
    }
    document.addEventListener('tree-assembly-refreshed', refresh);
    new MutationObserver(refresh).observe(document.body, {attributes:true, attributeFilter:['data-workbench']});
    refresh();
  }};
}
