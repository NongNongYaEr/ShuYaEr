import {createTrunkRootUi} from './trunk-root-ui.js';
import {trunkSelectionContext} from './trunk-root-edit.js';
import {isTrunkRootBase} from './trunk-root-base.js';
import { createTrunkSectionProfile, sampleTrunkSectionProfile, createDirectTrunkForm, createDirectTrunkFormSampler } from './trunk-form.js';
import { createTrunkSectionPresetStore } from './trunk-section-preset-store.js';
import {WHOLE_TRUNK_CONTOUR_PRESETS} from './trunk-whole-contour.js';
import {TRUNK_MAIN_PRESETS,TRUNK_CHILD_PRESETS} from './trunk-shape-catalog.js';
import {trunkWorkflowMarkup,updateTrunkWorkflow,TRUNK_WORKFLOW_LABELS} from './trunk-workflow-ui.js';
import {createTrunkNumberDrag} from './trunk-number-drag.js';
import {trunkContourShortcut} from './trunk-contour-shortcuts.js';
import {createTrunkShortcutHelp} from './trunk-shortcut-help.js';
import {createTrunkPointCursor} from './trunk-point-cursor.js';
import {trunkSectionContext} from './trunk-section-reference.js';
import {createTrunkSectionRangeUi} from './trunk-section-range-ui.js';
import {createTrunkPresetPreferences,filterTrunkPresetRecords,trunkPresetFilterMarkup} from './trunk-preset-library-ui.js';

// A small viewport work surface: its front view stays usable when the real
// section plane is edge-on. The controller owns authoring and undo, not this UI.
export function createTrunkSectionDock(api) {
  const node = document.createElement('section');
  node.id = 'trunkSectionDock'; node.hidden = true;
  node.setAttribute('aria-label', '视口局部截面编辑');
  node.innerHTML = `<header><strong>${TRUNK_WORKFLOW_LABELS.SHAPE}</strong><span id="sectionDockTarget"></span><button id="sectionEditorExpand" title="放大轮廓编辑区，不改变树形">放大编辑</button><button data-section-action="focus" title="F · 将当前截面移到视口中心，保持观察方向">树上定位 <kbd>F</kbd></button><button data-section-action="exit" title="V · 完成主干编辑；自动暂停的单元枝会恢复" aria-label="完成主干编辑（V），自动暂停的单元枝会恢复">×</button></header>
    ${trunkWorkflowMarkup('section')}
    <p class="trunk-workflow-guide">先用约 7–12 个主点调大体起伏，再用密集子点修局部凹凸；两层都能增删点。</p>
    <div id="sectionChooseTarget" class="trunk-workflow-notice">先在树上点选一根承重枝干，或<button data-section-action="select-root">从主干开始</button></div>
    <details class="section-workflow-advanced"><summary>查看对比与旧版兼容</summary><div class="section-dock-kind"><span id="sectionRecipeKind"></span><button data-section-action="direct" title="先试用相邻截面直接过渡，预览后确认；旧工程不会自动转换">预览新版截面</button></div>
    <div id="sectionLegacyHelp" class="trunk-workflow-notice">这根枝干使用旧版形体。已有纵沟仍在「原有表面效果」中调节；点击「${TRUNK_WORKFLOW_LABELS.DETAIL}」可预览升级，确认后进入编辑。<button data-section-action="surface">调节原有表面效果</button></div>
    <div class="section-dock-view" role="group" aria-label="当前枝干查看方式，不修改工程"><button data-section-view="BASE" title="查看基础轮廓">只看基础轮廓</button><button data-section-view="FINAL" title="保存和导出始终使用完整效果">查看完整效果</button></div></details>
    <div class="section-navigator" role="group" aria-label="当前截面"><button data-section-nav="previous" title="[ / PageUp · 切到靠根一圈" aria-keyshortcuts="[ PageUp">靠根 <kbd>[</kbd></button><select id="sectionDockSelect" aria-label="在图窗切换截面"></select><button data-section-nav="next" title="] / PageDown · 切到靠梢一圈" aria-keyshortcuts="] PageDown">靠梢 <kbd>]</kbd></button></div>
    <div id="sectionHeightTrack" class="section-height-track" role="group" aria-label="沿枝截面位置轨道"><span>靠根 → 靠梢</span><div id="sectionHeightMarks"></div><small>点标记切圈 · 拖标记移动整圈 · Esc 取消</small></div>
    <div class="section-quick-fields" role="group" aria-label="当前截面快捷参数"><label>高度 %<input data-section-field="t" type="number" min="0" max="100" step="any"></label><label>粗细倍率<input data-section-field="radius" type="number" min="0.2" max="3" step="any"></label><label>扭转 °<input data-section-field="roll" type="number" min="-180" max="180" step="any"></label></div>
    <small class="trunk-zone-shortcuts">Alt+1 / 2 / 3 切分区 · 拖参数标签微调 · Shift 大步 / Alt 精调</small>
    <div id="sectionWholeControls" hidden><div class="whole-pull-tools" role="group" aria-label="当前层点的移动范围"><button data-whole-tool="SOFT" title="打大体时手动开启柔和推拉：带动附近未选点，浅色显示受影响范围">带动邻点 <kbd>1</kbd></button><button data-whole-tool="POINT" title="默认精确移动：只移动所选点；多选时拖任一已选点移动选区，也可按 G">只动选点 <kbd>2</kbd></button><label>带动范围<select id="sectionWholeReach"><option value="12">窄</option><option value="18">中</option><option value="30">宽</option><option value="45">很宽</option></select></label><label class="whole-world-points-toggle"><input id="sectionWholeWorldPoints" type="checkbox">树上点 <kbd>W</kbd></label></div><details class="whole-sampling-options"><summary>编辑点密度</summary><div class="whole-display-options"><label>加密到<select id="sectionWholePoints"><option value="64">64 点</option><option value="96">96 点</option><option value="128">128 点</option></select></label><button id="sectionWholeDensify" title="补足编辑点，保留已有点；下一次实际编辑后保存">增加编辑点</button></div><small>折角自动提供编辑点；调整密度不改造型，实际编辑后保存。网格精度在底部单独调整。</small></details></div>
    <small id="sectionDirectEditingHint" hidden title="旧版兼容编辑使用新版截面连接，外形可能变化；只进入或选点不写工程，首次实际改动与转换合为一步撤销。">可直接编辑 · 首次改动保存新版截面 · Ctrl+Z 恢复</small>
    <div id="sectionDirectPreview" class="trunk-workflow-notice" data-trunk-conversion-controls hidden><strong data-conversion-title>检查新版截面</strong><small data-conversion-help>当前是旧版截面，升级可能改变圈间过渡。先对照原形，确认后才进入编辑；取消保留原工程。</small><div class="section-conversion-views" role="group" aria-label="原形与升级预览对照"><button data-conversion-view="ORIGINAL" aria-keyshortcuts="Q">看原形 <kbd>Q</kbd></button><button data-conversion-view="PREVIEW" aria-keyshortcuts="Q">升级预览 <kbd>Q</kbd></button></div><small data-conversion-view-status role="status"></small><div><button data-section-action="confirm-direct">确认使用新版截面</button><button data-section-action="cancel-direct">取消，保留原样</button></div></div>
    <div class="section-dock-tools" role="toolbar" aria-label="局部截面工具">
      <button data-section-mode="SLIDE" title="Alt+G · 沿枝滑动整圈，选点保持">整圈滑动 <kbd>Alt+G</kbd></button><button data-section-mode="PROFILE" title="C · 打开截面正视窗；拖动蓝点编辑轮廓">点编辑 <kbd>C</kbd></button><button data-section-mode="TWIST" title="Alt+R · 扭转整圈，选点保持">整圈扭转 <kbd>Alt+R</kbd></button><button data-section-mode="RADIUS" title="Alt+S · 调整整圈粗细，选点保持">整圈粗细 <kbd>Alt+S</kbd></button>
    </div><div class="section-dock-actions">
      <button data-section-action="add" title="N · 在当前本枝上移动鼠标，左键放置新截面；Esc / 右键取消">放置 <kbd>N</kbd></button><button data-section-action="duplicate" title="Shift+D · 复制当前截面形状，再沿本枝滑动放置；Esc / 右键取消整次复制">复制 <kbd>⇧D</kbd></button><button data-section-action="remove" title="Delete · 删除当前截面，保留枝干">删除 <kbd>Del</kbd></button><button data-section-action="presets" title="P · 展开或收起预设库；Shift+P · 展开并聚焦名称，输入后 Enter 保存">预设库 <kbd>P</kbd></button>
    </div><p id="sectionDockHint"></p><small class="section-dock-shortcuts" title="PageUp / PageDown 也可切换截面；名称输入后 Enter 保存"><kbd>[</kbd> / <kbd>]</kbd> 前后截面 · <kbd>Shift+P</kbd> 命名预设</small>
    <div id="sectionFrontView" hidden><div class="section-front-heading"><span id="sectionFrontHeading">截面正视 · 蓝点改轮廓</span><button data-section-action="round">还原轮廓</button></div>
      <div class="section-point-tools" role="group" aria-label="轮廓控制点快捷编辑"><span id="sectionPointSelection" role="status">先选蓝点</span><button data-point-action="previous" title="Shift+Tab · 上一点">‹</button><button data-point-action="next" title="Tab · 下一点">›</button><button data-point-action="move" title="G · 在截面平面内移动所选点，左键 / Enter 确认，Esc 取消" aria-keyshortcuts="G">移动 <kbd>G</kbd></button><button data-point-action="add" title="A / Insert · 单选后加点；也可 Shift 点击或双击黄线">加点 <kbd>A</kbd></button><button data-point-action="remove" title="Delete / Backspace · 删除全部所选控制点，至少保留三个点">删点 <kbd>Del</kbd></button></div>
      <div class="section-selection-tools" role="group" aria-label="轮廓点选区"><span class="section-selection-hint">左键拖空白框选</span><button data-point-select="ALL">全选点</button><button data-point-select="CLEAR">清空</button><span>Shift 加选 · Ctrl 减选</span></div>
      <div class="section-point-offset"><label><span>所选点推拉 %</span><input id="sectionPointOffset" type="number" min="-99.9" max="200" step="any" value="0" aria-label="所选轮廓点径向偏移增量百分比"></label><small id="sectionPointOffsetHint">先选点，再输入或拖标签；确认后归零。</small></div>
      <div class="section-front-navigation" role="group" aria-label="轮廓窗口缩放"><button data-front-nav="out" aria-label="缩小轮廓窗口">−</button><span id="sectionFrontZoom">100%</span><button data-front-nav="in" aria-label="放大轮廓窗口">＋</button><button data-front-nav="fit" title="Home · 图窗内恢复适应">适应窗口</button><span>F 选点 · Home 整圈 · 中键平移</span></div>
      <svg id="sectionFrontSvg" viewBox="0 0 260 190" role="img" tabindex="0" aria-label="蓝色点调整截面轮廓，悬停变亮，正在拖动的点为橙色；拖点自动进入轮廓工具，松手确认，Esc 取消"></svg>
      <small id="sectionFrontHelp">蓝点只改轮廓，拖动自动进入轮廓工具；橙点正在拖动。松手确认，Esc 取消。</small>
      <small class="section-point-shortcuts">Shift 点击黄线 ＋ · Alt 点击蓝点 − · 拖空白框选 · Delete 删选点 · G 移动 · Esc 取消</small>
    </div>
    <div id="sectionPresetLibrary" hidden><div class="section-preset-save"><input id="sectionPresetName" maxlength="80" placeholder="截面名称" aria-label="新截面预设名称"><button id="sectionPresetSave">保存当前截面</button></div><p id="sectionPresetStorage"></p><div id="sectionPresetCards"></div><p id="sectionPresetStatus" role="status"></p><small id="sectionPresetScope">套用仅替换当前截面形状；沿枝位置和过渡范围保留。</small></div>
    <footer class="trunk-workflow-footer"><button data-workflow-mesh>网格精度 / 线框</button><button data-workflow-next>下一步 · ${TRUNK_WORKFLOW_LABELS.CONTOUR} →</button><button data-workflow-done>完成调整</button></footer>`;
  api.canvas.parentElement.append(node);
  const toolbar=document.createElement('div');toolbar.className='trunk-dock-toolbar';node.prepend(toolbar);toolbar.append(node.querySelector('header'),node.querySelector('.trunk-workflow-steps'));
  const sectionTarget=document.createElement('button');sectionTarget.type='button';sectionTarget.dataset.objectTarget='SECTION';sectionTarget.textContent='截面';sectionTarget.title='返回截面参数，板根继续显示；也可直接点树上的截面';sectionTarget.onclick=()=>api.setRegion('SECTION');node.querySelector('.section-navigator').prepend(sectionTarget);
  const selectionContext=document.createElement('div');selectionContext.id='sectionSelectionContext';selectionContext.className='trunk-selection-context';selectionContext.setAttribute('role','status');selectionContext.innerHTML='<span data-context-constraint></span><span data-context-pivot></span>';toolbar.append(selectionContext);
  const frontSurface=node.querySelector('#sectionFrontView'),sectionTools=node.querySelector('.section-dock-tools');
  node.insertBefore(frontSurface,sectionTools);
  const pointToolbar=document.createElement('div');pointToolbar.className='section-point-toolbar';
  const pointTools=frontSurface.querySelector('.section-point-tools');
  pointTools.querySelector('[data-point-action="move"]').insertAdjacentHTML('afterend','<button data-point-action="rotate" aria-keyshortcuts="R">旋转 <kbd>R</kbd></button><button data-point-action="scale" aria-keyshortcuts="S">缩放 <kbd>S</kbd></button>');
  const pointMore=document.createElement('details');pointMore.className='section-point-more';
  pointMore.innerHTML='<summary title="全选、反选、清空、切点与数值推拉">更多 ▾</summary><div class="section-point-menu"><strong>选区</strong></div>';
  const pointMenu=pointMore.querySelector('.section-point-menu');
  pointMenu.append(frontSurface.querySelector('.section-selection-tools'));
  const cycleTools=document.createElement('div');cycleTools.className='section-point-cycle';cycleTools.innerHTML='<span>切换当前点</span>';
  for(const action of ['previous','next']){const b=pointTools.querySelector(`[data-point-action="${action}"]`);b.innerHTML=action==='previous'?'上一点 <kbd>⇧Tab</kbd>':'下一点 <kbd>Tab</kbd>';cycleTools.append(b);}
  pointMenu.append(cycleTools,frontSurface.querySelector('.section-point-offset'));
  pointMenu.insertAdjacentHTML('beforeend','<div class="section-contour-transfer"><strong>轮廓复用 · 作用于当前整圈</strong><div><button data-contour-copy aria-keyshortcuts="Control+Shift+C">复制形状 <kbd>⌃⇧C</kbd></button><button data-contour-paste aria-keyshortcuts="Control+Shift+V">套用形状 <kbd>⌃⇧V</kbd></button></div><small data-contour-source>先复制轮廓，再切到目标截面套用。</small></div>');
  pointMenu.insertBefore(pointMenu.querySelector('.section-contour-transfer'),cycleTools);
  pointTools.append(pointMore);pointToolbar.append(pointTools);
  frontSurface.prepend(pointToolbar);
  for(const selector of ['.section-front-heading','.section-front-navigation','#sectionFrontSvg','#sectionFrontHelp','.section-point-shortcuts'])frontSurface.append(frontSurface.querySelector(selector));
  frontSurface.prepend(frontSurface.querySelector('.section-front-heading'));
  frontSurface.insertAdjacentHTML('beforeend','<div class="section-contour-preview" hidden role="status"><span>轮廓试用 · 目标位置与尺寸保持</span><div><button data-contour-confirm>确认 Enter</button><button data-contour-cancel>取消 Esc</button></div></div>');
  frontSurface.querySelector('.section-front-navigation').prepend(node.querySelector('#sectionWholeControls'));
  const properties=document.createElement('details');properties.className='section-circle-properties';properties.innerHTML='<summary><strong>整圈属性</strong><span id="sectionCircleSummary"></span><kbd>H</kbd></summary>';
  properties.append(node.querySelector('#sectionHeightTrack'),node.querySelector('.section-quick-fields'),node.querySelector('.trunk-zone-shortcuts'),sectionTools);
  frontSurface.after(properties);
  toolbar.append(node.querySelector('.section-navigator'));
  node.querySelector('.section-navigator').append(node.querySelector('[data-section-action="presets"]'));
  const ringTransport=document.createElement('div');ringTransport.className='section-ring-transport';ringTransport.innerHTML='<button data-select-ring aria-pressed="false" title="选中整圈后，G 沿干移动、R 旋转、S 缩放；再次点击返回点编辑">选整圈</button><button data-section-action="slide" aria-keyshortcuts="Alt+G" title="Alt+G · 沿树干移动当前整圈；保留点选区和图窗，Enter 确认，Esc 取消">移圈 <kbd>Alt+G</kbd></button>';
  ringTransport.append(node.querySelector('[data-section-field="t"]').closest('label'),node.querySelector('[data-section-action="round"]'));toolbar.append(ringTransport);ringTransport.querySelector('[data-section-action="slide"]').onclick=()=>api.moveRing();ringTransport.querySelector('[data-select-ring]').onclick=()=>{(api.state().selectionScope==='RING'?api.selectPointScope:api.selectRing)();svg.focus({preventScroll:true});};
  const alongBranch=document.createElement('details');alongBranch.className='section-along-branch';alongBranch.innerHTML='<summary><span id="sectionAlongSummary">沿干位置</span><span>展开定位／移圈</span></summary>';alongBranch.append(node.querySelector('#sectionHeightTrack'));toolbar.after(alongBranch);
  const alongToggle=document.createElement('button');alongToggle.type='button';alongToggle.dataset.sectionTrackToggle='true';alongToggle.textContent='沿干';alongToggle.title='展开沿干位置：点击切圈，拖动移圈';alongToggle.setAttribute('aria-expanded','false');alongBranch.id='sectionAlongBranch';alongToggle.setAttribute('aria-controls',alongBranch.id);node.querySelector('[data-section-action="presets"]').before(alongToggle);
  alongToggle.onclick=()=>{const state=api.state();if(!state.active)alongBranch.open=!alongBranch.open;};alongBranch.addEventListener('toggle',()=>alongToggle.setAttribute('aria-expanded',String(alongBranch.open)));
  const loftControls=document.createElement('div');loftControls.className='trunk-workflow-notice';loftControls.innerHTML='<span data-loft-mode>本枝层间过渡：直线</span><button data-loft-preview title="预览本枝截面之间的平顺连接，保留每圈控制点；Enter 确认，Esc 取消">平顺层间过渡</button><div data-loft-confirmation class="section-loft-confirmation" hidden><span>本枝层间过渡试用</span><button data-loft-confirm>确认 Enter</button><button data-loft-cancel>取消 Esc</button></div>';alongBranch.append(loftControls);const loftConfirmation=loftControls.querySelector('[data-loft-confirmation]');toolbar.append(loftConfirmation);loftControls.querySelector('[data-loft-preview]').onclick=()=>api.previewLoft();loftConfirmation.querySelector('[data-loft-confirm]').onclick=()=>api.confirmLoft();loftConfirmation.querySelector('[data-loft-cancel]').onclick=()=>api.cancel();
  const referenceControls=document.createElement('div');referenceControls.className='section-reference-controls';referenceControls.innerHTML='<label title="按各圈局部基底展开，保持真实尺寸与扭转；仅显示参考，不参与点编辑"><input id="sectionNeighbourReferences" type="checkbox">邻圈对照</label><span class="section-reference-scope">编辑：当前圈</span><span id="sectionReferenceLegend" hidden><span data-reference-label="ROOT"></span><span data-reference-label="TIP"></span></span>';frontSurface.querySelector('#sectionFrontSvg').before(referenceControls);
  const repair=document.createElement('div');repair.className='trunk-workflow-notice';repair.hidden=true;repair.id='sectionDeletedArcsRepair';repair.innerHTML='<span>旧删点区段尚未重连。</span><button data-section-action="reconnect" title="只重连此前删过点的区段，保留其他造型；可撤销">重连已删区段</button>';referenceControls.before(repair);repair.querySelector('button').onclick=()=>api.reconnect();
  const library=node.querySelector('#sectionPresetLibrary');
  library.insertAdjacentHTML('afterbegin',`<strong class="trunk-preset-type">整圈形状 · 仅当前截面</strong>${trunkPresetFilterMarkup('section-preset','搜索整圈形状')}<div class="section-preset-scope-tabs"><button data-preset-scope="ALL">全部形状</button><button data-preset-scope="FINAL">子点细形</button><button data-preset-scope="BASE">主点大形</button></div><div class="section-preset-preview" hidden role="status"><span id="sectionPresetPreviewName"></span><button data-preset-confirm>确认 Enter</button><button data-preset-cancel>取消 Esc</button></div>`);
  const categoryFilter=document.createElement('label');categoryFilter.className='section-preset-category';categoryFilter.innerHTML='<span>用途</span><select data-section-preset-category aria-label="整圈预设用途"><option value="ALL">全部用途</option>'+['常规干形','纵向起伏','偏心轮廓','根盘板根','细褶精修','个人预设'].map(name=>'<option>'+name+'</option>').join('')+'</select><small id="sectionPresetCount"></small>';library.querySelector('.section-preset-scope-tabs').after(categoryFilter);categoryFilter.querySelector('select').onchange=e=>{presetCategory=e.target.value;renderPresets();};
  const editWorkspace=document.createElement('div');editWorkspace.className='section-edit-workspace';frontSurface.before(editWorkspace);editWorkspace.append(frontSurface,library);
  properties.after(node.querySelector('.whole-sampling-options'),node.querySelector('.section-workflow-advanced'));
  const management=document.createElement('details');management.className='section-management-zone';management.setAttribute('aria-label','整圈截面管理');
  management.innerHTML='<summary class="trunk-zone-heading"><strong>截面管理</strong><span>作用于整圈</span></summary>';
  management.append(node.querySelector('.section-dock-actions'),node.querySelector('#sectionDockHint'),node.querySelector('.section-dock-shortcuts'));
  properties.after(management);
  new ResizeObserver(()=>node.style.setProperty('--section-toolbar-height',toolbar.getBoundingClientRect().height-10+'px')).observe(toolbar);
  const shortcutKeys={SLIDE:'Alt+G',PROFILE:'C',TWIST:'Alt+R',RADIUS:'Alt+S',add:'N',duplicate:'Shift+D',remove:'Delete',focus:'F',exit:'V',presets:'P Shift+P'};
  node.querySelectorAll('[data-section-mode],[data-section-action]').forEach(button=>{const keys=shortcutKeys[button.dataset.sectionMode||button.dataset.sectionAction];if(keys)button.setAttribute('aria-keyshortcuts',keys);});
  const $ = id => node.querySelector('#' + id), store = createTrunkSectionPresetStore();
  const shortcutHelp=createTrunkShortcutHelp(node),rootHelp=shortcutHelp;
  function closePointMore(focus=false){if(!pointMore.open)return false;pointMore.open=false;if(focus)svg.focus({preventScroll:true});return true;}
  function fitPointMenu(){if(!pointMore.open)return;const top=pointMenu.getBoundingClientRect().top,bottom=node.querySelector('.trunk-workflow-footer').getBoundingClientRect().top;pointMenu.style.maxHeight=Math.max(96,Math.min(360,bottom-top-8))+'px';}
  pointMore.querySelector('summary').addEventListener('click',e=>{if(api.state().active){e.preventDefault();return;}pointCursor.hide();requestAnimationFrame(fitPointMenu);});
  window.addEventListener('pointerdown',e=>{if(pointMore.open&&!pointMore.contains(e.target))closePointMore();},true);
  window.addEventListener('blur',()=>closePointMore());
  const invertButton=document.createElement('button');invertButton.dataset.pointSelect='INVERT';invertButton.textContent='反选';node.querySelector('[data-point-select="CLEAR"]').before(invertButton);
  const selectKeys={ALL:'Ctrl+A',CLEAR:'Ctrl+D',INVERT:'Ctrl+I'};
  node.querySelectorAll('[data-point-select]').forEach(b=>{const key=selectKeys[b.dataset.pointSelect];if(key){b.setAttribute('aria-keyshortcuts',key);b.insertAdjacentHTML('beforeend',' <kbd>'+key.replace('Ctrl+','⌃')+'</kbd>');b.title=key+' · '+b.textContent.trim()+(b.title?'；'+b.title:'');}});
  for(const [selector,key,title] of [['#sectionEditorExpand','E','放大 / 收起编辑窗'],['#sectionWholeWorldPoints','W','显示 / 隐藏树上蓝点'],['#sectionPointOffset','O','聚焦所选点推拉增量'],['[data-section-field="t"]','H','聚焦高度输入'],['[data-whole-tool="SOFT"]','1','带动邻点：柔和推拉附近未选点'],['[data-whole-tool="POINT"]','2','只动选点：未选点保持'],['[data-front-nav="in"]','+','放大图窗'],['[data-front-nav="out"]','-','缩小图窗'],['[data-front-nav="fit"]','Home 0','适应窗口']]){const n=node.querySelector(selector);n.setAttribute('aria-keyshortcuts',key);n.title=key+' · '+title+'（图窗内）';}
  const hints = {
    SLIDE: '蓝点改轮廓，黄色中心点滑动；C 打开正视窗，Shift+D 复制放置。',
    PROFILE: '拖动蓝点只改轮廓；悬停变亮，拖动变橙。松手确认，Esc 取消。',
    TWIST: '拖动黄色旋转环端点扭转；侧视时也可在正视小窗拖动。',
    RADIUS: '向右拖截面端点变粗，向左变细；松手确认。',
  };
  let frontDrag = null, dockDrag = null, extent = 1, libraryOpen = false, libraryScroll = 0, presets = [], libraryBusy = false, loaded = false, renderedPresets = null, renderedState = '';
  let frontPan=null,frontHover='',frontKey='',extentNeedsFit=true,expanded=false,lastScope='BASE',frontBox=null,heightDrag=null;
  const referencePreferenceKey='branchforge.trunk-section-reference.v1';
  let showReferences=false;try{showReferences=localStorage.getItem(referencePreferenceKey)==='true';}catch{}
  $('sectionNeighbourReferences').onchange=()=>{if(api.state().active){$('sectionNeighbourReferences').checked=showReferences;return;}showReferences=$('sectionNeighbourReferences').checked;try{localStorage.setItem(referencePreferenceKey,String(showReferences));}catch{}update();svg.focus({preventScroll:true});};
  const frontViews=new Map();
  const frontView={zoom:1,x:130,y:95};
  const nudgeKeys=new Set();
  let frontPress=null,lastTap=null,ignoreNativeDoubleUntil=0,lastFrontPointer=null;
  const preferences=createTrunkPresetPreferences('section');
  let presetQuery='',presetFilter='ALL',presetScope='ALL',presetCategory='ALL',preferenceVersion=0;
  const preferenceChange=async action=>{try{await action();preferenceVersion++;renderPresets();}catch(e){$('sectionPresetStatus').textContent=e.message;}};
  node.querySelector('[data-section-preset-search]').oninput=e=>{presetQuery=e.target.value;renderPresets();};
  node.querySelector('[data-section-preset-filter]').onchange=e=>{presetFilter=e.target.value;renderPresets();};
  node.querySelectorAll('[data-preset-scope]').forEach(b=>b.onclick=()=>{presetScope=b.dataset.presetScope;renderPresets();});
  node.querySelector('[data-preset-confirm]').onclick=()=>api.confirmPreset();
  node.querySelector('[data-preset-cancel]').onclick=()=>api.cancel();
  const pointCursor=createTrunkPointCursor();
  window.addEventListener('pointerdown',e=>{if(!e.target?.closest?.('#sectionFrontSvg')){if(isPendingLineRepeat(e))return;lastTap=null;pointCursor.hide();if(frontDrag?.keyboard)api.cancel();}},true);
  const builtinShapes = [
    { id: 'builtin-round', name: '圆形', shape: { radius: 1, oval: 1, roll: 0 } },
    { id: 'builtin-oval', name: '椭圆', shape: { radius: 1, oval: 1.55, roll: 0 } },
    { id: 'builtin-fluted', name: '三瓣轮廓', shape: { radius: 1, oval: 1, roll: 0,
      profile: createTrunkSectionProfile(12).map((p, i) => ({ ...p, radius: 1 + .28 * Math.cos(i / 12 * Math.PI * 6) })) } },
    ...WHOLE_TRUNK_CONTOUR_PRESETS,
    ...TRUNK_MAIN_PRESETS,...TRUNK_CHILD_PRESETS,
  ];
  node.addEventListener('pointerdown', e => e.stopPropagation());
  const header = node.querySelector('header');
  header.title = '拖动标题栏移动工具窗 · 双击回到默认位置';
  header.addEventListener('dblclick',e=>{if(e.target.closest('button,input,select,textarea,label,a,summary,[contenteditable]')||dockDrag)return;for(const key of ['left','top','right','bottom'])node.style[key]='';});
  function dockPosition(left, top) {
    const parent = api.canvas.parentElement.getBoundingClientRect(), bounds = node.getBoundingClientRect();
    node.style.left = Math.max(8, Math.min(parent.width - bounds.width - 8, left)) + 'px';
    node.style.top = Math.max(8, Math.min(parent.height - bounds.height - 8, top)) + 'px';
    node.style.right = node.style.bottom = 'auto';
  }
  header.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button,input,select,textarea,label,a,summary,[contenteditable]')) return;
    const parent = api.canvas.parentElement.getBoundingClientRect(), bounds = node.getBoundingClientRect();
    dockDrag = { x: e.clientX, y: e.clientY, left: bounds.left - parent.left, top: bounds.top - parent.top };
    header.setPointerCapture(e.pointerId); e.preventDefault();
  });
  header.addEventListener('pointermove', e => { if (dockDrag) dockPosition(dockDrag.left + e.clientX - dockDrag.x, dockDrag.top + e.clientY - dockDrag.y); });
  header.addEventListener('pointerup', () => { dockDrag = null; });
  header.addEventListener('pointercancel', () => { dockDrag = null; });
  new ResizeObserver(() => { if (!node.hidden && node.style.left && !dockDrag) dockPosition(parseFloat(node.style.left), parseFloat(node.style.top)); }).observe(node);
  node.querySelector('[data-contour-copy]').onclick=()=>{closePointMore();api.copyContour();svg.focus({preventScroll:true});};
  node.querySelector('[data-contour-paste]').onclick=()=>{closePointMore();api.pasteContour();svg.focus({preventScroll:true});};
  node.querySelector('[data-contour-confirm]').onclick=()=>api.confirmPaste();
  node.querySelector('[data-contour-cancel]').onclick=()=>api.cancel();
  node.querySelectorAll('[data-section-mode]').forEach(b => b.onclick = () => api.setMode(b.dataset.sectionMode));
  node.querySelectorAll('[data-section-view]').forEach(b => b.onclick = () => api.setView(b.dataset.sectionView));
  node.querySelectorAll('[data-contour-scope]').forEach(b=>b.onclick=()=>b.dataset.contourScope==='FINAL'&&!api.state().section?api.editWhole():api.setContourScope(b.dataset.contourScope));
  $('sectionWholePoints').onchange=()=>api.setWholePointCount($('sectionWholePoints').value);
  $('sectionWholeDensify').onclick=()=>api.setWholePointCount($('sectionWholePoints').value);
  node.querySelectorAll('[data-whole-tool]').forEach(b=>b.onclick=()=>api.setWholeOptions({tool:b.dataset.wholeTool}));
  $('sectionWholeReach').onchange=()=>api.setWholeOptions({reach:Number($('sectionWholeReach').value)});
  $('sectionWholeWorldPoints').onchange=()=>api.setWholeOptions({worldPoints:$('sectionWholeWorldPoints').checked});
  $('sectionEditorExpand').onclick=()=>{if(frontDrag||frontPan)return;expanded=!expanded;update();requestAnimationFrame(()=>{if(node.style.left)dockPosition(parseFloat(node.style.left),parseFloat(node.style.top));});};
  node.querySelectorAll('[data-point-action]').forEach(b=>b.onclick=()=>{closePointMore();const action=b.dataset.pointAction;if(api.state().selectionScope==='RING'&&['move','rotate','scale'].includes(action)){api.transformRing({move:'SLIDE',rotate:'TWIST',scale:'RADIUS'}[action]);return;}if(action==='add')api.addPoint();else if(action==='remove')api.removePoint();else if(['move','rotate','scale'].includes(action))beginPointMove({move:'MOVE',rotate:'ROTATE',scale:'SCALE'}[action]);else api.cyclePoint(action==='previous'?-1:1);svg.focus({preventScroll:true});});
  node.querySelector('[data-section-action="direct"]').onclick = () => api.beginDirect();
  node.querySelector('[data-section-action="sections"]').onclick = () => api.selectPart('SECTION');
  node.querySelector('[data-section-action="details"]').onclick = () => api.selectPart('DETAIL');
  node.querySelector('[data-section-action="surface"]').onclick = () => api.showSurface();
  node.querySelector('[data-section-action="select-root"]').onclick = () => api.selectRoot();
  node.querySelector('[data-section-action="confirm-direct"]').onclick = () => api.confirmDirect();
  node.querySelector('[data-section-action="cancel-direct"]').onclick = () => api.cancel();
  node.querySelectorAll('[data-conversion-view]').forEach(b=>b.onclick=()=>{const state=api.state();if((b.dataset.conversionView==='ORIGINAL')!==state.conversionOriginal)api.compareConversion();});
  node.querySelector('[data-section-action="add"]').onclick = () => api.add();
  node.querySelector('[data-section-action="duplicate"]').onclick = () => api.duplicate();
  node.querySelector('[data-section-action="remove"]').onclick = () => api.remove();
  node.querySelector('[data-section-action="exit"]').onclick = () => api.exit();
  node.querySelector('[data-section-action="focus"]').onclick = () => api.focus();
  node.querySelector('[data-section-action="round"]').onclick = () => api.round();
  node.querySelector('[data-section-action="presets"]').onclick = () => togglePresets();
  node.querySelectorAll('[data-trunk-stage]').forEach(b=>b.onclick=()=>api.workflow(b.dataset.trunkStage));
  $('sectionDockSelect').onchange=()=>{if(api.selectSection($('sectionDockSelect').value))svg.focus({preventScroll:true});};
  const quickFields=[...node.querySelectorAll('[data-section-field]')];
  quickFields.forEach(input=>{
    input.oninput=()=>api.editSectionField(input.dataset.sectionField,input.value);
    input.onchange=()=>{if(input.value===''||!input.checkValidity())return;api.flush();};
    // Browsers omit change when typing restores the starting value. Finish
    // this field's preview on blur as well, so it cannot block the next tool.
    input.addEventListener('blur',()=>{if(api.state().sectionField===input.dataset.sectionField&&input.value!==''&&input.checkValidity())api.flush();});
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.onchange();}else if(e.key==='Escape'){e.preventDefault();api.cancel();}};
  });
  createTrunkNumberDrag({inputs:quickFields,canStart:()=>{const s=api.state();return s.enabled&&s.editable&&!s.active;},step:input=>({t:.125,radius:.00625,roll:.125})[input.dataset.sectionField],cancel:()=>api.cancel()});
  const pointOffset=$('sectionPointOffset');
  pointOffset.oninput=()=>{if(pointOffset.value!==''&&pointOffset.checkValidity())api.offsetPoints(Number(pointOffset.value));};
  pointOffset.onchange=()=>{if(pointOffset.value!==''&&pointOffset.checkValidity())api.finishFront();};
  pointOffset.addEventListener('blur',()=>{if(api.pointState().offsetActive&&pointOffset.value!==''&&pointOffset.checkValidity())api.finishFront();});
  pointOffset.onkeydown=e=>{if(e.isComposing)return;if(e.key==='Enter'){e.preventDefault();pointOffset.onchange();}else if(e.key==='Escape'){e.preventDefault();api.cancel();}};
  createTrunkNumberDrag({inputs:[pointOffset],canStart:()=>{const s=api.state(),p=api.pointState();return s.enabled&&s.editable&&!s.active&&p.selectedCount>0;},step:()=>.125,cancel:()=>api.cancel()});
  node.querySelectorAll('[data-point-select]').forEach(b=>b.onclick=()=>{closePointMore();const mode=b.dataset.pointSelect;if(mode==='ALL')api.selectPoints((api.frontData()?.knots||[]).map(p=>p.id));else if(mode==='CLEAR')api.selectPoints([]);else if(mode==='INVERT'){const selected=new Set(api.pointState().ids);api.selectPoints((api.frontData()?.knots||[]).filter(p=>!selected.has(p.id)).map(p=>p.id));}update();svg.focus({preventScroll:true});});
  node.querySelectorAll('[data-section-nav]').forEach(b=>b.onclick=e=>{const s=api.state(),context=trunkSectionContext(s.sections,s.section?.id),next=b.dataset.sectionNav==='next'?context.next:context.previous;if(next&&api.selectSection(next.id,{mode:e.ctrlKey?'SUBTRACT':e.shiftKey?'ADD':'REPLACE'}))svg.focus({preventScroll:true});});
  node.querySelector('[data-workflow-next]').onclick=()=>api.workflow(api.state().stage==='CONTOUR'?'DETAIL':'CONTOUR');
  node.querySelector('[data-workflow-mesh]').onclick=()=>api.inspectMesh();node.querySelector('[data-workflow-done]').onclick=()=>api.exit();
  node.querySelector('[data-workflow-mesh]').title='Alt+M · 打开本枝网格精度';node.querySelector('[data-workflow-mesh]').setAttribute('aria-keyshortcuts','Alt+M');
  function openPresets({ focusName = false } = {}) {
    const state = api.state();
    if (!state.enabled || !state.section || state.keyboard) return false;
    closePointMore();
    const wasOpen = libraryOpen;if(!wasOpen)libraryScroll=node.scrollTop;
    libraryOpen = true; update();
    if (focusName) { $('sectionPresetName').focus(); $('sectionPresetName').select(); }
    if (!wasOpen || !loaded) refreshLibrary();
    return true;
  }
  function closePresets() {
    if (!libraryOpen) return false;
    if(api.state().presetPreview)api.cancel();
    libraryOpen = false; update();node.scrollTop=libraryScroll;return true;
  }
  function back() {
    if(shortcutHelp.close())return true;
    if(api.state().region==='ROOT')return rootUi.closePresets();
    if(closePointMore(true)||closePresets())return true;
    if(alongBranch.open){alongBranch.open=false;svg.focus({preventScroll:true});return true;}
    if(api.state().selectionScope==='RING'){api.selectPoints([]);return true;}
    if(api.pointState().selected){frontHover='';api.selectPoint('');return true;}
    return false;
  }
  function togglePresets() {
    if (libraryOpen) { closePresets(); return false; }
    return openPresets();
  }
  async function refreshLibrary() {
    if (libraryBusy) return;
    libraryBusy = true; renderPresets();
    try { presets = await store.list(); loaded = true; $('sectionPresetStorage').textContent = store.backend;await preferences.load();preferenceVersion++; }
    catch (e) { $('sectionPresetStatus').textContent = '预设读取失败：' + e.message; }
    finally { libraryBusy = false; renderPresets(); }
  }
  function thumbnail(shape) {
    const points = [], profile = shape.profile || [], direct = shape.geometry_version === 2;
    const sampler = direct ? createDirectTrunkFormSampler(createDirectTrunkForm({ geometry_version: 2, sections: [{ ...shape, id: 'THUMBNAIL', t: .5 }] })) : null;
    for (let i = 0; i < 80; i++) {
      const a = i / 80 * Math.PI * 2, r = direct ? sampler.radialAt(.5, a) : sampleTrunkSectionProfile(profile, a), roll = (shape.roll || 0) * Math.PI / 180;
      const x = Math.cos(a) * r * (direct ? 1 : shape.oval), y = Math.sin(a) * r / (direct ? 1 : shape.oval);
      points.push([x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll)]);
    }
    const size = Math.max(1, ...points.flatMap(p => p.map(Math.abs))), xy = points.map(p => `${40 + p[0] / size * 29},${35 - p[1] / size * 29}`).join(' ');
    return `<svg viewBox="0 0 80 70" aria-hidden="true"><polygon points="${xy}" fill="#4b593d" stroke="#ffd84d" stroke-width="1.5"/></svg>`;
  }
  function renderPresets() {
    const state=api.state(),nextState=[libraryBusy,Boolean(state.editable),Boolean(state.section),Boolean(state.active),Boolean(state.presetPreview),Boolean(state.direct),Boolean(state.covered),presetQuery,presetFilter,presetScope,presetCategory,preferenceVersion].join('|');
    if(renderedPresets===presets&&renderedState===nextState)return;
    renderedPresets=presets;renderedState=nextState;
    const container = $('sectionPresetCards'),scroll=container.scrollTop; container.replaceChildren();
    node.querySelectorAll('[data-preset-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.presetScope===presetScope)));
    const records=[...builtinShapes,...presets].map(r=>({...r,scope:r.shape.profile_scope==='FINAL'?'FINAL':'BASE',scopeLabel:r.shape.profile_scope==='FINAL'?'子点细形':'主点大形',category:r.category||(r.shape.profile_scope==='FINAL'?'细褶精修':r.id==='builtin-fluted'?'纵向起伏':r.id.startsWith('builtin-')?'常规干形':'个人预设')}));
    const visible=filterTrunkPresetRecords(records,{query:presetQuery,mode:presetFilter,scope:presetScope,category:presetCategory},preferences.data);$('sectionPresetCount').textContent=visible.length+' / '+records.length+' 项';
    for (const item of visible) {
      const card = document.createElement('div'); card.className = 'section-preset-card'; card.dataset.sectionPresetId = item.id;
      const button = document.createElement('button'); button.type = 'button'; button.innerHTML = thumbnail(item.shape);
      const label = document.createElement('span'); label.textContent = item.name; button.append(label); button.title = '套用到当前截面：' + item.name + (item.shape.profile_scope === 'FINAL' ? '（带褶皱的整圈轮廓）' : item.shape.geometry_version === 2 ? '（直接截面大轮廓）' : '');
      const scopeLabel=document.createElement('small');scopeLabel.textContent=item.scopeLabel+(item.category?' · '+item.category:'');button.append(scopeLabel);button.title='试用到当前截面：'+item.name+' · '+scopeLabel.textContent+'；Enter 确认，Esc 取消';
      button.disabled = libraryBusy || !state.editable || !state.section || state.active&&!state.presetPreview || state.covered;
      button.onclick = () => { const applied = api.previewPreset(item); $('sectionPresetStatus').textContent = applied === false ? item.shape.geometry_version === 2 && !api.state().direct ? '这是直接截面预设；先关闭预设库，试用并确认「开始直接截面」，再套用。' : '暂不能试用：请结束当前调节，或检查当前位置的轮廓拟合限制。' : '试用「' + item.name + '」 · 确认后写入工程'; };
      card.append(button);
      const star=document.createElement('button');star.type='button';star.className='trunk-preset-favorite';star.textContent=preferences.data.favorites.includes(item.id)?'★':'☆';star.setAttribute('aria-label','收藏 '+item.name);star.setAttribute('aria-pressed',String(preferences.data.favorites.includes(item.id)));star.onclick=()=>preferenceChange(()=>preferences.toggle(item.id));card.append(star);
      if (!item.id.startsWith('builtin-')) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'section-preset-remove'; remove.textContent = '×'; remove.title = '移除此预设'; remove.disabled = libraryBusy;
        remove.onclick = async () => {
          libraryBusy = true; renderPresets();
          try { await store.remove(item.id); presets = presets.filter(p => p.id !== item.id);await preferenceChange(()=>preferences.remove(item.id)); $('sectionPresetStatus').textContent = '已移除预设；工程中的截面保留。'; }
          catch (e) { $('sectionPresetStatus').textContent = '移除失败：' + e.message; }
          finally { libraryBusy = false; renderPresets(); }
        };
        card.append(remove);
      }
      container.append(card);
    }
    if(!container.childElementCount){const empty=document.createElement('p');empty.className='trunk-preset-empty';empty.textContent=presetFilter==='RECENT'?'确认使用后会出现在这里。':presetFilter==='FAVORITES'?'点击卡片星标收藏，或调整搜索条件。':'没有匹配的预设。';container.append(empty);}
    $('sectionPresetSave').disabled = libraryBusy || !state.editable || !state.section || state.active;
    container.scrollTop=scroll;
  }
  $('sectionPresetSave').onclick = async () => {
    if ($('sectionPresetSave').disabled || libraryBusy || !api.flush()) return;
    const state = api.state(), s = state.section; if (!s) return;
    const name = $('sectionPresetName').value.trim();
    if (!name) { $('sectionPresetStatus').textContent = '先为截面起个名称。'; $('sectionPresetName').focus(); return; }
    libraryBusy = true; renderPresets();
    try {
      const shape=state.contourScope==='FINAL'?api.capturePreset():{ ...(state.direct ? { geometry_version: 2 } : {}), radius: s.radius, oval: s.oval, roll: s.roll, ...(s.profile ? { profile: structuredClone(s.profile) } : {}),...(s.profile_coarse?{profile_coarse:structuredClone(s.profile_coarse)}:{}) };
      const saved = await store.put({ name, shape });
      presets = [...presets.filter(p => p.id !== saved.id), saved];
      $('sectionPresetStorage').textContent = store.backend; $('sectionPresetStatus').textContent = '已保存「' + saved.name + '」，可在其他工程套用。';
    } catch (e) { $('sectionPresetStatus').textContent = '保存失败：' + e.message; }
    finally { libraryBusy = false; renderPresets(); }
  };
  $('sectionPresetName').addEventListener('keydown', e => {
    if (e.isComposing || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePresets(); api.canvas.focus({preventScroll:true}); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault(); e.stopPropagation();
    if (!$('sectionPresetSave').disabled) $('sectionPresetSave').click();
  });
  function svgPoint(e,matrix=$('sectionFrontSvg').getScreenCTM().inverse()) {
    const svg = $('sectionFrontSvg'), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(matrix);
  }
  function frontPoint(e) {
    const v=svgPoint(e);
    return { x: (v.x - 130) / 74 * extent, y: (95 - v.y) / 74 * extent };
  }
  const rootUi=createTrunkRootUi(node,api);node.insertBefore(rootUi.node,editWorkspace);toolbar.insertBefore(rootUi.navigator,ringTransport);toolbar.append(selectionContext);
  const svg = $('sectionFrontSvg');
  const rangeControls=createTrunkSectionRangeUi({node,alongBranch,api,focusPoints:()=>svg.focus({preventScroll:true})});
  let frontLayoutFrame=null;
  function ensureFrontVisible(){
    const state=api.state();if(state.range?.open||state.region==='ROOT'){node.classList.remove('graph-scroll-toolbar');return;}
    // Preparation is a decision about a changed surface; keep its explanation
    // above the read-only graph instead of auto-scrolling it under the toolbar.
    if(state.conversion){node.classList.remove('graph-scroll-toolbar');node.scrollTop=0;return;}
    if(node.hidden||$('sectionFrontView').hidden||frontDrag||frontPan||frontBox||heightDrag)return;
    const r=svg.getBoundingClientRect(),bounds=node.getBoundingClientRect(),bottom=node.querySelector('.trunk-workflow-footer').getBoundingClientRect().top-8,pointHeight=pointToolbar.getBoundingClientRect().height;
    // A short, narrow circle editor cannot pin the entire navigation header
    // above a 200px graph. Let that header scroll; point tools and footer stay
    // available, and the full contour can move clear of the sticky footer.
    const scrollToolbar=state.selectionScope==='RING'&&!expanded&&r.height>bottom-(bounds.top+toolbar.getBoundingClientRect().height+pointHeight+20);
    node.classList.toggle('graph-scroll-toolbar',scrollToolbar);
    const top=scrollToolbar?bounds.top+pointHeight+12:toolbar.getBoundingClientRect().bottom+pointHeight+8;
    if(libraryOpen&&expanded){const start=editWorkspace.getBoundingClientRect().top,offset=start-top;if(offset<0&&r.bottom-offset<=bottom){node.scrollTop+=offset;return;}}
    if(r.height>bottom-top)return;
    if(r.bottom>bottom)node.scrollTop+=r.bottom-bottom;
    else if(r.top<top)node.scrollTop-=top-r.top;
  }
  function queueFrontLayout(){if(frontLayoutFrame!==null)return;frontLayoutFrame=requestAnimationFrame(()=>{frontLayoutFrame=null;ensureFrontVisible();});}
  // Returning from a property field must reveal the graph below both sticky
  // toolbars before the next keyboard or pointer selection starts.
  svg.addEventListener('focus',()=>requestAnimationFrame(()=>{if(document.activeElement===svg)ensureFrontVisible();}));
  function rememberFrontView(){if(!frontKey||extentNeedsFit)return;if(frontViews.size>=256&&!frontViews.has(frontKey))frontViews.delete(frontViews.keys().next().value);frontViews.set(frontKey,{view:{...frontView},extent});}
  function updateHeightTrack(state,items){
    const marks=$('sectionHeightMarks');$('sectionHeightTrack').hidden=!items.length;
    const groups=[];for(const s of items){const last=groups.at(-1);if(last&&Math.abs(last[0].t-s.t)<1e-10)last.push(s);else groups.push([s]);}
    const key=JSON.stringify(groups.map(g=>g.map(s=>s.id)));
    if(!heightDrag&&marks.dataset.groups!==key){marks.dataset.groups=key;marks.replaceChildren(...groups.map(group=>{const b=document.createElement('button');b.type='button';b.dataset.heightIds=JSON.stringify(group.map(s=>s.id));return b;}));}
    const lanes=[],gap=54/Math.max(80,marks.clientWidth);
    for(const b of marks.querySelectorAll('button')){
      const ids=JSON.parse(b.dataset.heightIds),s=items.find(p=>p.id===(heightDrag?.button===b?heightDrag.id:ids.includes(state.section?.id)?state.section.id:ids[0]));if(!s)continue;
      let lane=lanes.findIndex(t=>s.t-t>=gap);if(lane<0)lane=lanes.length;lanes[lane]=s.t;
      b.dataset.heightId=s.id;b.style.left=(s.t*100)+'%';b.style.top=(lane*28)+'px';b.textContent=(s.t*100).toFixed(1)+'%'+(ids.length>1?' ×'+ids.length:'');
      b.title=`${s.id} · 沿枝 ${(s.t*100).toFixed(1)}%`+(ids.length>1?' · 重叠位置，点击切换同高截面':' · 点击单选，Shift 加选 / Ctrl 减选，拖动移圈');b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(state.selectionScope==='RING'?(state.selectedSectionIds||[]).includes(s.id):s.id===state.section?.id));b.classList.toggle('primary-circle',s.id===state.section?.id);b.disabled=!state.editable||state.active&&heightDrag?.button!==b;
    }
    marks.style.height=(Math.max(1,lanes.length)*28+4)+'px';
  }
  const heightMarks=$('sectionHeightMarks');
  heightMarks.addEventListener('pointerdown',e=>{
    const b=e.target.closest('[data-height-id]'),s=api.state();if(!b||e.button!==0||s.active||!s.editable)return;
    const id=b.dataset.heightId,t=s.sections.find(p=>p.id===id)?.t;if(!Number.isFinite(t))return;if(e.shiftKey||e.ctrlKey){api.selectSection(id,{mode:e.ctrlKey?'SUBTRACT':'ADD'});svg.focus({preventScroll:true});e.preventDefault();return;}if(!api.selectSection(id))return;
    b.focus({preventScroll:true});heightDrag={id,t,value:t,x:e.clientX,lastX:e.clientX,width:heightMarks.getBoundingClientRect().width,button:b,pointerId:e.pointerId,started:false,wasCurrent:s.section?.id===id};b.setPointerCapture(e.pointerId);update();e.preventDefault();
  });
  heightMarks.addEventListener('pointermove',e=>{
    const g=heightDrag;if(!g||g.pointerId!==e.pointerId)return;if(!g.started&&Math.abs(e.clientX-g.x)<3)return;g.started=true;
    g.value=Math.max(0,Math.min(1,g.value+(e.clientX-g.lastX)/Math.max(1,g.width)));g.lastX=e.clientX;api.editSectionField('t',g.value*100);e.preventDefault();
  });
  heightMarks.addEventListener('pointerup',e=>{const g=heightDrag;if(!g||g.pointerId!==e.pointerId)return;heightDrag=null;if(g.started)api.flush();else if(g.wasCurrent){const ids=JSON.parse(g.button.dataset.heightIds),i=ids.indexOf(g.id);if(ids.length>1)api.selectSection(ids[(i+1)%ids.length]);}update();e.preventDefault();});
  heightMarks.addEventListener('pointercancel',()=>{if(!heightDrag)return;if(heightDrag.started)api.cancel();else{heightDrag=null;update();}});
  heightMarks.addEventListener('lostpointercapture',()=>{if(!heightDrag)return;if(heightDrag.started)api.cancel();else{heightDrag=null;update();}});
  heightMarks.addEventListener('focusout',e=>{if(heightDrag&&!heightMarks.contains(e.relatedTarget)){if(heightDrag.started)api.cancel();else{heightDrag=null;update();}}});
  function viewBox(){svg.setAttribute('viewBox',`${frontView.x-130/frontView.zoom} ${frontView.y-95/frontView.zoom} ${260/frontView.zoom} ${190/frontView.zoom}`);$('sectionFrontZoom').textContent=Math.round(frontView.zoom*100)+'%';}
  function fitFront(){if(frontDrag||frontPan||frontBox)return;Object.assign(frontView,{zoom:1,x:130,y:95});extentNeedsFit=true;viewBox();drawFront(api.state());}
  function zoomFront(factor,anchor={x:130,y:95}){
    if(frontDrag||frontPan||frontBox)return;const before=frontView.zoom,next=Math.max(.5,Math.min(24,before*factor));
    frontView.x=anchor.x-(anchor.x-frontView.x)*before/next;frontView.y=anchor.y-(anchor.y-frontView.y)*before/next;frontView.zoom=next;viewBox();drawFront(api.state());
  }
  const focusButton=document.createElement('button');focusButton.dataset.frontNav='selection';focusButton.innerHTML='选点 <kbd>F</kbd>';focusButton.title='F · 图中定位所选点；未选点时看整圈';focusButton.setAttribute('aria-keyshortcuts','F');
  node.querySelector('[data-front-nav="fit"]').before(focusButton);
  function frontCoord(p){return {x:130+p.x/extent*74,y:95-p.y/extent*74};}
  function focusFrontSelection(){
    const state=api.state();if(state.active||frontDrag||frontPan||frontBox||state.mode!=='PROFILE')return false;
    const ids=new Set(api.pointState().ids),all=api.frontData()?.knots||[],selected=all.filter(p=>ids.has(p.id)).map(frontCoord);
    if(!selected.length){fitFront();return true;}
    const rect=svg.getBoundingClientRect(),scale=Math.min(rect.width/260,rect.height/190);if(!(scale>0))return false;
    const xs=selected.map(p=>p.x),ys=selected.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    let zoom;
    if(selected.length===1){const p=selected[0],gaps=all.filter(p=>!ids.has(p.id)).map(frontCoord).map(q=>Math.hypot(q.x-p.x,q.y-p.y)).filter(n=>n>1e-6);zoom=gaps.length?32/(Math.min(...gaps)*scale):4;zoom=Math.max(2,zoom);}
    else zoom=Math.min((260-64/scale)/Math.max(1e-6,right-left),(190-64/scale)/Math.max(1e-6,bottom-top));
    Object.assign(frontView,{x:(left+right)/2,y:(top+bottom)/2,zoom:Math.max(.5,Math.min(24,zoom))});
    lastFrontPointer=null;lastTap=null;frontHover='';pointCursor.hide();viewBox();drawFront(state);svg.focus({preventScroll:true});return true;
  }
  function revealCurrentPoint(){
    const state=api.state(),p=api.frontData()?.knots.find(p=>p.id===api.pointState().selected);if(!p||state.active)return;
    const q=frontCoord(p),matrix=svg.getScreenCTM(),scale=matrix?Math.hypot(matrix.a,matrix.b):1,margin=24/Math.max(.01,scale),halfX=130/frontView.zoom,halfY=95/frontView.zoom;
    const dx=q.x<frontView.x-halfX+margin?q.x-(frontView.x-halfX+margin):q.x>frontView.x+halfX-margin?q.x-(frontView.x+halfX-margin):0;
    const dy=q.y<frontView.y-halfY+margin?q.y-(frontView.y-halfY+margin):q.y>frontView.y+halfY-margin?q.y-(frontView.y+halfY-margin):0;
    if(!dx&&!dy)return;frontView.x+=dx;frontView.y+=dy;lastFrontPointer=null;frontHover='';pointCursor.hide();viewBox();drawFront(state);
  }
  node.querySelectorAll('[data-front-nav]').forEach(b=>b.onclick=()=>b.dataset.frontNav==='selection'?focusFrontSelection():b.dataset.frontNav==='fit'?fitFront():zoomFront(b.dataset.frontNav==='in'?1.4:1/1.4,{x:frontView.x,y:frontView.y}));
  svg.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();zoomFront(Math.exp(-Math.max(-200,Math.min(200,e.deltaY))*.003),svgPoint(e));},{passive:false});
  svg.addEventListener('contextmenu',e=>e.preventDefault());
  function nearestKnot(e,max=14){
    let best=null;const matrix=svg.getScreenCTM();if(!matrix)return null;
    for(const c of svg.querySelectorAll('[data-knot-id]')){const p=svg.createSVGPoint();p.x=Number(c.getAttribute('cx'));p.y=Number(c.getAttribute('cy'));const q=p.matrixTransform(matrix),distance=Math.hypot(q.x-e.clientX,q.y-e.clientY);if(distance<=max&&(!best||distance<best.distance))best={id:c.dataset.knotId,distance};}
    return best?.id;
  }
  function isPendingLineRepeat(e){const state=api.state();return node.contains(e.target)&&state.enabled&&state.editable&&!state.active&&!frontDrag&&!frontBox&&!frontPan&&e.button===0&&!e.altKey&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&state.mode==='PROFILE'&&lastTap?.point&&performance.now()-lastTap.time<=500&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<=6;}
  // A first line click may collapse point controls and move the graph. Keep
  // the second click of the same physical double-click tied to that contour.
  window.addEventListener('pointerdown',e=>{
    if(svg.contains(e.target)||!isPendingLineRepeat(e))return;
    frontPress={x:e.clientX,y:e.clientY,repeatPoint:lastTap.point};lastTap=null;svg.focus({preventScroll:true});svg.setPointerCapture(e.pointerId);e.preventDefault();e.stopImmediatePropagation();
  },true);
  svg.addEventListener('pointerdown', e => {
    if(frontDrag?.keyboard){e.preventDefault();e.stopPropagation();if(e.button===0){if(api.finishFront()!==false)frontDrag=null;}else if(e.button===2)api.cancel();return;}
    const state=api.state();if(frontDrag||frontBox||frontPan||state.active)return;
    if(e.button===0&&!e.altKey&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&state.mode==='PROFILE'&&lastTap?.point&&performance.now()-lastTap.time<=500&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<=6){frontPress={x:e.clientX,y:e.clientY,repeatPoint:lastTap.point};lastTap=null;svg.focus({preventScroll:true});svg.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();return;}
    const id=nearestKnot(e)||e.target.dataset.knotId,twist=e.target.dataset.twist;
    if(e.button===0&&state.editable&&state.selectionScope==='RING'&&!e.altKey&&!e.metaKey&&(e.shiftKey||e.ctrlKey)&&outlinePoint(e)){frontPress=lastTap=null;api.selectSection(state.section.id,{mode:e.ctrlKey?'SUBTRACT':'ADD'});svg.focus({preventScroll:true});e.preventDefault();e.stopPropagation();return;}
    if(e.button===0&&state.editable&&state.mode==='PROFILE'&&!e.ctrlKey&&!e.metaKey){
      if(e.altKey){frontPress=lastTap=null;pointCursor.hide();if(id)api.removePoint(id);svg.focus({preventScroll:true});e.preventDefault();e.stopPropagation();return;}
      if(e.shiftKey&&!nearestKnot(e,6)){const point=outlinePoint(e);if(point){frontPress=lastTap=null;pointCursor.hide();api.addPoint(point);svg.focus({preventScroll:true});e.preventDefault();e.stopPropagation();return;}}
    }
    if(e.button===1){frontPress=lastTap=null;frontPan={matrix:svg.getScreenCTM().inverse(),start:svgPoint(e),x:frontView.x,y:frontView.y};svg.classList.add('panning');svg.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();return;}
    if (e.button !== 0 || !state.editable) return;
    svg.focus({preventScroll:true});
    if(id&&(e.shiftKey||e.ctrlKey)){frontPress=lastTap=null;api.selectPoint(id,{mode:e.ctrlKey?'SUBTRACT':'ADD'});e.preventDefault();e.stopPropagation();return;}
    if(!id&&!twist&&state.mode==='PROFILE'){
      const p=svgPoint(e);const linePoint=outlinePoint(e);frontPress={x:e.clientX,y:e.clientY,linePoint,ringCandidate:Boolean(linePoint)&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey};frontBox={x:p.x,y:p.y,end:p,candidates:[],mode:e.ctrlKey?'SUBTRACT':e.shiftKey?'ADD':'REPLACE'};svg.setPointerCapture(e.pointerId);update();e.preventDefault();e.stopPropagation();return;
    }
    frontPress={x:e.clientX,y:e.clientY,onHandle:Boolean(id||twist)};
    if (!id && !twist) {if(!e.ctrlKey)api.selectPoint('');return;}
    const kind = twist ? 'TWIST' : 'PROFILE', p = frontPoint(e);
    if (!api.beginFront(kind, id, p)) return;
    frontDrag = { kind, id,start:{x:e.clientX,y:e.clientY},started:false }; drawFront(api.state()); svg.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
  });
  svg.addEventListener('pointermove', e => {
    lastFrontPointer={clientX:e.clientX,clientY:e.clientY,shiftKey:e.shiftKey,altKey:e.altKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey};updatePointCursor(e);
    if(frontPress?.repeatPoint){if(Math.hypot(e.clientX-frontPress.x,e.clientY-frontPress.y)<3)return;const p=svgPoint({clientX:frontPress.x,clientY:frontPress.y});frontPress.repeatPoint=null;frontBox={x:p.x,y:p.y,end:svgPoint(e),candidates:[],mode:e.ctrlKey?'SUBTRACT':e.shiftKey?'ADD':'REPLACE'};}
    if(frontBox){frontBox.end=svgPoint(e);const a=Math.min(frontBox.x,frontBox.end.x),b=Math.max(frontBox.x,frontBox.end.x),c=Math.min(frontBox.y,frontBox.end.y),d=Math.max(frontBox.y,frontBox.end.y);frontBox.candidates=[...svg.querySelectorAll('[data-knot-id]')].filter(p=>Number(p.getAttribute('cx'))>=a&&Number(p.getAttribute('cx'))<=b&&Number(p.getAttribute('cy'))>=c&&Number(p.getAttribute('cy'))<=d).map(p=>p.dataset.knotId);drawFront(api.state());e.preventDefault();return;}
    if(frontPan){const p=svgPoint(e,frontPan.matrix);frontView.x=frontPan.x-(p.x-frontPan.start.x);frontView.y=frontPan.y-(p.y-frontPan.start.y);viewBox();e.preventDefault();return;}
    if(frontDrag){if(frontDrag.kind==='PROFILE'&&!frontDrag.keyboard&&!frontDrag.started&&Math.hypot(e.clientX-frontDrag.start.x,e.clientY-frontDrag.start.y)<3)return;frontDrag.started=true;const point=frontPoint(e);if(frontDrag.offset){point.x+=frontDrag.offset.x;point.y+=frontDrag.offset.y;}api.moveFront(frontDrag.kind,frontDrag.id,point,{freeAngle:e.altKey,precision:e.shiftKey});e.preventDefault();return;}
    const next=nearestKnot(e)||'';if(next!==frontHover){frontHover=next;drawFront(api.state());}
  });
  svg.addEventListener('pointerleave',()=>{pointCursor.hide();if(!frontDrag){lastFrontPointer=null;}if(!frontDrag&&!frontPan){frontHover='';drawFront(api.state());}});
  svg.addEventListener('pointerup', e => {
    if(frontPress?.repeatPoint){const press=frontPress;frontPress=lastTap=null;if(Math.hypot(e.clientX-press.x,e.clientY-press.y)<3){ignoreNativeDoubleUntil=performance.now()+500;api.addPoint(press.repeatPoint);}e.preventDefault();return;}
    if(frontBox){const box=frontBox;frontBox=null;if(frontPress.ringCandidate&&Math.hypot(e.clientX-frontPress.x,e.clientY-frontPress.y)<3)api.selectRing();else api.selectPoints(box.candidates,{mode:box.mode});update();e.preventDefault();if(Math.hypot(e.clientX-frontPress.x,e.clientY-frontPress.y)>=3||e.shiftKey||e.ctrlKey){frontPress=lastTap=null;return;}}
    if(frontPan){frontPan=null;svg.classList.remove('panning');drawFront(api.state());e.preventDefault();return;}
    const press=frontPress,previous=lastTap,changed=frontDrag?.started;frontPress=null;if(frontDrag){frontDrag=null;api.finishFront();e.preventDefault();}
    if(press?.onHandle){lastTap=null;return;}
    if(changed||!press||e.button!==0||e.altKey||e.shiftKey||e.ctrlKey||e.metaKey||Math.hypot(e.clientX-press.x,e.clientY-press.y)>=3||api.state().mode!=='PROFILE'){lastTap=null;return;}
    const now=performance.now();if(previous&&now-previous.time<=500&&Math.hypot(e.clientX-previous.x,e.clientY-previous.y)<=6){lastTap=null;const point=outlinePoint(e);if(point){api.addPoint(point);ignoreNativeDoubleUntil=now+500;}}else lastTap={x:e.clientX,y:e.clientY,time:now,point:press.linePoint||outlinePoint(e)};
  });
  svg.addEventListener('pointercancel',()=>{frontBox=frontPan=frontPress=lastTap=null;svg.classList.remove('panning');if(frontDrag){frontDrag=null;api.cancel();}else update();});
  svg.addEventListener('lostpointercapture',()=>{if(frontDrag||frontBox||frontPan){api.cancel();update();}});
  svg.addEventListener('focusout',()=>{pointCursor.hide();if(frontDrag?.keyboard)api.cancel();if(frontBox){frontBox=frontPress=lastTap=null;update();}});
  function outlinePoint(e){
    const data=api.frontData(),matrix=svg.getScreenCTM();if(!data||!matrix)return null;
    const points=data.outline.map(p=>{const q=svg.createSVGPoint();q.x=130+p.x/extent*74;q.y=95-p.y/extent*74;return {point:p,screen:q.matrixTransform(matrix)};});let best=null;
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],dx=b.screen.x-a.screen.x,dy=b.screen.y-a.screen.y,length=dx*dx+dy*dy,u=length?Math.max(0,Math.min(1,((e.clientX-a.screen.x)*dx+(e.clientY-a.screen.y)*dy)/length)):0,distance=Math.hypot(a.screen.x+u*dx-e.clientX,a.screen.y+u*dy-e.clientY);if(distance<=14&&(!best||distance<best.distance))best={distance,point:{x:a.point.x+(b.point.x-a.point.x)*u,y:a.point.y+(b.point.y-a.point.y)*u}};}
    return best?.point;
  }
  function updatePointCursor(e){
    pointCursor.hide();const state=api.state();if(!state.enabled||state.mode!=='PROFILE'||!state.editable||state.active||e.metaKey||document.activeElement?.matches('input,textarea,select')||document.activeElement?.isContentEditable||document.querySelector('dialog[open]'))return;
    if(state.selectionScope==='RING'&&!e.altKey&&(e.shiftKey||e.ctrlKey)){if(outlinePoint(e))pointCursor.show({x:e.clientX,y:e.clientY},e.ctrlKey?'REMOVE':'ADD',false,e.ctrlKey?'Ctrl 点击减选整圈':'Shift 点击加选整圈');return;}
    if(e.ctrlKey)return;const id=nearestKnot(e),points=api.pointState();if(e.altKey&&(id||outlinePoint(e)))pointCursor.show({x:e.clientX,y:e.clientY},'REMOVE',!id||points.count<=3);else if(e.shiftKey&&!nearestKnot(e,6)&&outlinePoint(e))pointCursor.show({x:e.clientX,y:e.clientY},'ADD',points.count>=points.limit);
  }
  function beginPointMove(action='MOVE'){const state=api.state(),points=api.pointState(),knot=api.frontData()?.knots.find(p=>p.id===points.selected);if(state.active||!state.editable||!knot)return;let initial=lastFrontPointer;if(!initial){const matrix=svg.getScreenCTM(),q=svg.createSVGPoint();q.x=130+knot.x/extent*74;q.y=95-knot.y/extent*74;const p=q.matrixTransform(matrix);initial={clientX:p.x,clientY:p.y};}const pointer=frontPoint(initial);if(!api.beginFront('PROFILE',points.selected,knot,{translate:action==='MOVE',transform:action==='MOVE'?null:action,keyboard:true}))return;const reference=api.pointState().transform?.reference||knot;pointCursor.hide();frontDrag={kind:'PROFILE',id:points.selected,start:{x:initial.clientX,y:initial.clientY},offset:{x:reference.x-pointer.x,y:reference.y-pointer.y},started:false,keyboard:true};svg.focus({preventScroll:true});update();}
  svg.addEventListener('dblclick',e=>{if(performance.now()<ignoreNativeDoubleUntil||e.button!==0||e.altKey||e.shiftKey||e.ctrlKey||e.metaKey||api.state().mode!=='PROFILE'||frontDrag||frontPan||frontBox)return;if(!nearestKnot(e)){const point=outlinePoint(e);if(point)api.addPoint(point);}svg.focus({preventScroll:true});e.preventDefault();e.stopPropagation();});
  function pointKey(e){
    const escapeState=api.state();
    if(e.key==='Escape'&&escapeState.enabled&&!escapeState.active&&!e.defaultPrevented&&!e.isComposing&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!document.querySelector('dialog[open]')&&(!e.target?.matches?.('input,textarea,select')&&!e.target?.isContentEditable||pointMore.open)){back();return true;}
    if(e.target===svg)ensureFrontVisible();
    if(lastFrontPointer&&['Shift','Alt','Control','Meta'].includes(e.key)){Object.assign(lastFrontPointer,{shiftKey:e.shiftKey,altKey:e.altKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey});updatePointCursor(lastFrontPointer);}
    if(heightDrag&&e.key==='Escape'&&!e.defaultPrevented&&!e.isComposing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!document.querySelector('dialog[open]')){if(heightDrag.started)api.cancel();else{heightDrag=null;update();}return true;}
    if(e.target?.closest?.('#sectionFrontSvg,.section-point-tools,.section-selection-tools'))lastTap=null;
    const state=api.state(),focused=Boolean(e.target?.closest?.('#sectionFrontSvg,.section-point-tools,.section-selection-tools,.section-front-navigation'));
    if(focused&&api.pointKey(e))return true;
    const action=trunkContourShortcut(e,{enabled:state.enabled,focused,typing:e.target?.matches?.('input,textarea,select')||e.target?.isContentEditable,dialogOpen:Boolean(document.querySelector('dialog[open]'))});
    if(action){
      if(state.active&&!(state.presetPreview&&['ZOOM_IN','ZOOM_OUT','FIT'].includes(action))||e.repeat&&!['ZOOM_IN','ZOOM_OUT'].includes(action))return true;
      if(['ZOOM_IN','ZOOM_OUT','FIT'].includes(action)){if(action==='FIT')fitFront();else zoomFront(action==='ZOOM_IN'?1.4:1/1.4,{x:frontView.x,y:frontView.y});return true;}
      if(action==='FOCUS_POINTS'){focusFrontSelection();return true;}
      if(action==='EXPAND'){$('sectionEditorExpand').click();return true;}
      if(action==='HEIGHT'||action==='OFFSET'){const input=action==='HEIGHT'?node.querySelector('[data-section-field="t"]'):pointOffset;if(!input.disabled){if(action==='HEIGHT'){closePointMore();if(properties.contains(input))properties.open=true;}else pointMore.open=true;input.scrollIntoView({block:'nearest'});input.focus({preventScroll:true});input.select();}return true;}
      if(state.mode!=='PROFILE'||!state.editable||state.covered)return true;
      if(['ALL','CLEAR','INVERT'].includes(action))node.querySelector(`[data-point-select="${action}"]`).click();
      else if(action==='WORLD_POINTS'){if(state.contourScope==='FINAL')$('sectionWholeWorldPoints').click();}
      else if(state.direct)node.querySelector(`[data-whole-tool="${action}"]`)?.click();
      return true;
    }
    if(e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||!state.enabled||document.querySelector('dialog[open]')||!focused||e.target?.matches?.('input,textarea,select')||e.target?.isContentEditable)return false;
    if(frontDrag?.keyboard){if(!e.altKey&&!e.shiftKey&&['Enter','Escape'].includes(e.key)){if(e.key==='Escape')api.cancel();else if(api.finishFront()!==false)frontDrag=null;return true;}if(['g','r','s'].includes(e.key.toLowerCase()))return true;}
    if(e.key==='Escape'&&!e.shiftKey&&!e.altKey&&frontBox){frontBox=frontPress=lastTap=null;update();return true;}
    if(e.key==='Escape'&&!e.shiftKey&&!e.altKey&&frontPan){frontPan=null;svg.classList.remove('panning');update();return true;}
    if(e.key==='Home'&&!e.shiftKey&&!e.altKey){if(state.presetPreview||!api.pointState().active)fitFront();return true;}
    if(state.mode!=='PROFILE')return ['Delete','Backspace'].includes(e.key);
    const point=api.pointState(),key=e.key;
    if(['g','r','s'].includes(key.toLowerCase())&&!e.shiftKey&&!e.altKey){if(!e.repeat&&point.selected)beginPointMove({g:'MOVE',r:'ROTATE',s:'SCALE'}[key.toLowerCase()]);return true;}
    if(key.toLowerCase()==='b'&&!e.shiftKey&&!e.altKey){if(!e.repeat&&!state.active)svg.focus({preventScroll:true});return true;}
    if(key==='Escape'&&!e.shiftKey&&!e.altKey){if(point.nudge){nudgeKeys.clear();api.cancelNudge();return true;}if(point.selected&&!point.active){frontHover='';api.selectPoint('');return true;}return false;}
    if((key==='Delete'||key==='Backspace'||key==='Insert'||key.toLowerCase()==='a')&&!e.shiftKey&&!e.altKey){if(!e.repeat&&!point.active&&state.editable){if(key==='Delete'||key==='Backspace')api.removePoint();else api.addPoint();}return true;}
    if(key==='Tab'&&!e.altKey&&point.selected){if(!e.repeat&&!point.active){api.cyclePoint(e.shiftKey?-1:1);revealCurrentPoint();}svg.focus({preventScroll:true});return true;}
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key)){if(!point.selected||!state.editable||point.active&&!point.nudge)return true;const factor=e.altKey ? .1 : e.shiftKey ? 5 : 1,radial=key==='ArrowUp'||key==='ArrowDown',amount=(key==='ArrowUp'||key==='ArrowRight'?1:-1)*(radial ? .01 : .5)*factor;if(api.nudgePoint(radial?'RADIUS':'ANGLE',amount))nudgeKeys.add(key);return true;}
    return false;
  }
  window.addEventListener('keyup',e=>{if(lastFrontPointer&&['Shift','Alt','Control','Meta'].includes(e.key)){Object.assign(lastFrontPointer,{shiftKey:e.shiftKey,altKey:e.altKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey});updatePointCursor(lastFrontPointer);}if(!nudgeKeys.delete(e.key))return;if(!nudgeKeys.size)api.finishNudge();e.preventDefault();e.stopImmediatePropagation();},true);
  window.addEventListener('blur',()=>{if(nudgeKeys.size){nudgeKeys.clear();api.cancelNudge();}if(frontDrag||heightDrag?.started)api.cancel();else if(frontBox||frontPan||heightDrag){frontBox=frontPan=frontPress=lastTap=heightDrag=null;update();}});
  window.addEventListener('resize',()=>{if(frontDrag||heightDrag?.started)api.cancel();else if(frontBox||frontPan||heightDrag){frontBox=frontPan=frontPress=lastTap=heightDrag=null;update();}queueFrontLayout();});
  function drawFront(state) {
    if(state.range?.open)return;
    if (!state.section || !['PROFILE', 'TWIST'].includes(state.mode)) return;
    const data = api.frontData({references:showReferences}); if (!data) return;const points=api.pointState(),selected=new Set(points.ids),influenced=new Set(points.influenced),draggingIds=new Set(points.dragging);
    if(extentNeedsFit&&!frontDrag){extent=Math.max(.001,...data.outline.flatMap(p=>[Math.abs(p.x),Math.abs(p.y)]))*1.15;extentNeedsFit=false;}
    const point = p => `${130 + p.x / extent * 74},${95 - p.y / extent * 74}`;
    const path = data.outline.map(point).join(' ');
    svg.innerHTML = `<path d="M 22 95 H 238 M130 12V178" stroke="#526059" stroke-dasharray="3 5" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"/><polygon points="${path}" fill="#42513988" stroke="${state.selectionScope==='RING'?'#ffb553':'#ffd84d'}" stroke-width="${state.selectionScope==='RING'?3.5:2}" vector-effect="non-scaling-stroke"/>`;
    for(const reference of data.references||[]){const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.dataset.sectionReference=reference.side;line.dataset.referenceId=reference.id;line.dataset.referenceT=reference.t;line.setAttribute('d',reference.outline.map((p,i)=>(i?'L':'M')+' '+point(p).replace(',',' ')).join(' ')+' Z');line.setAttribute('fill','none');line.setAttribute('vector-effect','non-scaling-stroke');line.setAttribute('pointer-events','none');line.setAttribute('aria-hidden','true');svg.insertBefore(line,svg.querySelector('polygon'));}
    const screenMatrix=svg.getScreenCTM(),screenScale=screenMatrix?Math.hypot(screenMatrix.a,screenMatrix.b):1;
    if(points.move?.axis){const origin=points.move.origin,[x,y]=point(origin).split(',').map(Number),guide=document.createElementNS('http://www.w3.org/2000/svg','path');guide.dataset.pointAxis=points.move.axis;guide.setAttribute('d',points.move.axis==='X'?`M ${x-2000} ${y} H ${x+2000}`:`M ${x} ${y-2000} V ${y+2000}`);guide.setAttribute('stroke',points.move.axis==='X'?'#f0998f':'#9cdd9c');guide.setAttribute('stroke-width','1');guide.setAttribute('stroke-dasharray','4 3');guide.setAttribute('vector-effect','non-scaling-stroke');guide.setAttribute('pointer-events','none');svg.append(guide);}
    const selectionOverlays=[];
    const create = (p, attr, value) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'), knot = attr === 'data-knot-id';
      const [x, y] = point(p).split(','); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', state.contourScope==='FINAL'?'3.2':'6'); c.setAttribute(attr, value);
      const scale=screenScale,hovered=knot&&(frontHover===value||state.hoverKnot===value),activeId=frontDrag?.id||state.activeKnot||frontHover;
      c.style.setProperty('--knot-radius',((selected.has(value)?points.selected===value?9:8:hovered||activeId===value?7:state.contourScope==='BASE'?6:3.4)/Math.max(.01,scale))+'px');c.classList.toggle('selected',knot&&selected.has(value));c.classList.toggle('primary-selected',knot&&selected.has(value)&&points.selected===value);c.setAttribute('aria-pressed',String(knot&&selected.has(value)));
      c.classList.toggle('influenced',influenced.has(value));c.classList.toggle('box-candidate',Boolean(frontBox?.candidates.includes(value)));
      const dragging = knot ? draggingIds.has(value) : frontDrag?.kind === 'TWIST';
      c.classList.toggle('hovered', Boolean(hovered)); c.classList.toggle('dragging', Boolean(dragging));
      c.setAttribute('data-dragging', String(Boolean(dragging))); c.setAttribute('tabindex', '-1'); c.setAttribute('role', 'button');
      c.setAttribute('aria-label', knot ? state.contourScope==='BASE'?'主点：移动时带动附近子点，松手确认，Esc 取消':'子点：精修局部轮廓，主点保留，松手确认，Esc 取消' : '黄色扭转点：拖动扭转截面，松手确认，Esc 取消'); svg.append(c);
      if(knot&&selected.has(value)){const echo=c.cloneNode(false);echo.removeAttribute('data-knot-id');echo.removeAttribute('data-dragging');echo.removeAttribute('role');echo.removeAttribute('tabindex');echo.removeAttribute('aria-pressed');echo.removeAttribute('aria-label');echo.setAttribute('aria-hidden','true');echo.classList.add('point-selection-overlay');selectionOverlays.push(echo);}
    };
    if(state.conversion){svg.setAttribute('aria-label','只读轮廓对照，确认准备后才能编辑子点');}
    else if (state.mode === 'PROFILE') data.knots.forEach(p => create(p, 'data-knot-id', p.id));
    else {
      const a = state.section.roll * Math.PI / 180;
      create({ x: Math.cos(a) * extent * .85, y: Math.sin(a) * extent * .85 }, 'data-twist', 'true');
      const hint = document.createElementNS('http://www.w3.org/2000/svg', 'text'); hint.setAttribute('x', '12'); hint.setAttribute('y', '20'); hint.textContent = `扭转 ${state.section.roll.toFixed(1)}°`; svg.append(hint);
    }
    selectionOverlays.sort((a,b)=>Number(a.classList.contains('primary-selected'))-Number(b.classList.contains('primary-selected'))).forEach(c=>svg.append(c));
    if(points.transform){const pivot=points.transform.pivot,[x,y]=point(pivot).split(',').map(Number),matrix=svg.getScreenCTM(),unit=1/Math.max(.01,matrix?Math.hypot(matrix.a,matrix.b):1),mark=document.createElementNS('http://www.w3.org/2000/svg','path');mark.dataset.pointTransformPivot='true';mark.setAttribute('d',`M ${x-16*unit} ${y} H ${x+16*unit} M ${x} ${y-16*unit} V ${y+16*unit} M ${x-12*unit} ${y} a ${12*unit} ${12*unit} 0 1 0 ${24*unit} 0 a ${12*unit} ${12*unit} 0 1 0 ${-24*unit} 0`);mark.setAttribute('fill','none');mark.style.filter='drop-shadow(0 0 1px #17101f)';mark.setAttribute('stroke','#eebcff');mark.setAttribute('stroke-width',String(2*unit));mark.setAttribute('pointer-events','none');mark.setAttribute('aria-hidden','true');svg.append(mark);}
    if(frontBox){const box=document.createElementNS('http://www.w3.org/2000/svg','rect');box.classList.add('section-point-box');box.setAttribute('x',Math.min(frontBox.x,frontBox.end.x));box.setAttribute('y',Math.min(frontBox.y,frontBox.end.y));box.setAttribute('width',Math.abs(frontBox.end.x-frontBox.x));box.setAttribute('height',Math.abs(frontBox.end.y-frontBox.y));svg.append(box);}
  }
  function update() {
    const state = api.state(); node.hidden = !state.enabled;
    rangeControls.update(state);
    if (node.hidden) { closePointMore();shortcutHelp.close();properties.open=management.open=alongBranch.open=false;libraryOpen=false;node.scrollTop=0;rememberFrontView();frontKey='';frontDrag = dockDrag = frontPan = frontBox = frontPress = lastTap = heightDrag = null;nudgeKeys.clear();lastScope='BASE';return; }
    const rootRegion=state.region==='ROOT';node.classList.toggle('root-region',rootRegion);shortcutHelp.setKind(rootRegion?'root':'contour');shortcutHelp.node.classList.toggle('trunk-root-help',rootRegion);node.dataset.activeObject=state.region||'SECTION';sectionTarget.setAttribute('aria-pressed',String(!rootRegion));sectionTarget.disabled=!state.editable||state.active;rootUi.update(state);
    const select=$('sectionDockSelect'),context=trunkSectionContext(state.sections,state.section?.id),items=context.items,navKey=JSON.stringify(items.map(p=>[p.id,p.t]));
    if(select.dataset.items!==navKey){select.dataset.items=navKey;select.replaceChildren(...items.map((p,i)=>{const o=document.createElement('option');o.value=p.id;o.textContent=(isTrunkRootBase(p)?'根盘截面':'截面 '+(i+1))+' · 沿枝 '+(p.t*100).toFixed(1)+'%';return o;}));if(!items.length){const o=document.createElement('option');o.textContent='尚无截面 · 按 N 放置';select.add(o);}}
    select.value=state.section?.id||'';select.disabled=!items.length||!state.editable||state.active;
    node.querySelectorAll('[data-section-nav]').forEach(b=>b.disabled=!(b.dataset.sectionNav==='previous'?context.previous:context.next)||!state.editable||state.active);
    const selectionSummary=trunkSelectionContext({...state,points:rootRegion?{}:api.pointState()});selectionContext.querySelector('[data-context-constraint]').textContent=selectionSummary.constraint;selectionContext.querySelector('[data-context-pivot]').textContent=selectionSummary.pivot;selectionContext.dataset.kind=selectionSummary.kind;selectionContext.dataset.count=selectionSummary.count;selectionContext.setAttribute('aria-label',selectionSummary.label+' · '+selectionSummary.constraint+' · '+selectionSummary.pivot+' · '+selectionSummary.influence);selectionContext.title=selectionSummary.influence;
    if(rootRegion){node.classList.remove('editor-expanded','whole-editor');node.querySelector('header strong').textContent='板根生成参数';$('sectionDockTarget').textContent=selectionSummary.label;$('sectionEditorExpand').hidden=true;node.querySelector('[data-section-action="focus"]').disabled=state.active;node.querySelectorAll('[data-workflow-done],[data-section-action="exit"]').forEach(b=>b.disabled=state.active);return;}
    $('sectionEditorExpand').hidden=false;
    const whole=state.contourScope==='FINAL';
    const contourCopy=node.querySelector('[data-contour-copy]'),contourPaste=node.querySelector('[data-contour-paste]');
    contourCopy.disabled=!state.section||!state.editable||state.active;
    contourPaste.disabled=contourCopy.disabled||state.covered||!state.clipboard?.compatible;
    contourCopy.innerHTML=(whole?'复制主子点':'复制主点')+' <kbd>⌃⇧C</kbd>';
    contourPaste.innerHTML=(state.clipboard?.scope==='FINAL'?'套用主子点':'套用主点')+' <kbd>⌃⇧V</kbd>';
    node.querySelector('[data-contour-source]').textContent=state.clipboard?state.clipboard.label+' · '+(state.clipboard.compatible?'保留目标高度、粗细、椭圆、扭转与独立表面细节。':'配方版本不同，请在同版截面间复用；不会自动升级。'):'先复制轮廓，再切到目标截面套用。';
    node.querySelector('.section-contour-preview').hidden=!state.pastePreview;
    node.querySelector('.section-contour-preview>span').textContent='轮廓试用 · 目标位置与尺寸保持';
    if(state.mode!=='PROFILE'||state.covered)closePointMore();
    properties.hidden=!state.section;
    if(state.stage!==node.dataset.trunkStage){closePointMore();properties.open=false;management.open=false;node.scrollTop=0;}
    if(state.contourScope!==lastScope){expanded=whole||libraryOpen;lastScope=state.contourScope;}
    node.classList.toggle('conversion-preview',Boolean(state.conversion));node.classList.toggle('ring-selected',state.selectionScope==='RING');node.dataset.selectionScope=state.selectionScope;node.classList.toggle('whole-editor',whole);node.classList.toggle('editor-expanded',expanded);
    $('sectionEditorExpand').textContent=expanded?'收起大窗':'放大编辑';$('sectionEditorExpand').setAttribute('aria-pressed',String(expanded));$('sectionEditorExpand').disabled=Boolean(frontDrag||frontPan||state.keyboard&&!state.conversion||state.activeKnot);
    const nextKey=[state.target,state.section?.id,state.conversion?'PREP_'+(state.conversionOriginal?'ORIGINAL':'PREVIEW'):state.contourScope].join('|');if(nextKey!==frontKey){rememberFrontView();frontKey=nextKey;frontHover='';const saved=frontViews.get(nextKey);Object.assign(frontView,saved?.view||{zoom:1,x:130,y:95});if(saved){extent=saved.extent;extentNeedsFit=false;}else extentNeedsFit=true;queueFrontLayout();}viewBox();
    node.querySelector('header strong').textContent=(state.rootBase?'根盘 · ':'')+(state.conversion?TRUNK_WORKFLOW_LABELS[state.stage]+' · 准备':TRUNK_WORKFLOW_LABELS[whole?'CONTOUR':'SHAPE']);
    node.querySelector('.trunk-workflow-guide').textContent=whole?'凹角、凸峰直接选点精修；默认只动选点，主点保留。进入和增加编辑点不改造型。':'默认 10 个主点，精确移动只改所选主点，子点随大形调整；打大体时可手动开启带动邻点。';
    node.querySelectorAll('[data-contour-scope]').forEach(b=>{b.disabled=!state.editable||state.keyboard||state.pending;b.classList.toggle('active',b.dataset.contourScope===state.contourScope);b.setAttribute('aria-pressed',String(b.dataset.contourScope===state.contourScope));});
    $('sectionWholeControls').hidden=!state.direct;node.querySelector('.whole-sampling-options').hidden=!whole;$('sectionWholeWorldPoints').closest('label').hidden=!whole;$('sectionWholePoints').value=state.wholePointCount;$('sectionWholePoints').disabled=!state.editable||state.active;
    loftControls.hidden=!state.direct;loftControls.querySelector('[data-loft-mode]').textContent='本枝层间过渡：'+(state.loft==='SMOOTH'?'平顺':'直线');const loftButton=loftControls.querySelector('[data-loft-preview]');loftButton.textContent=state.loft==='SMOOTH'?'恢复直线过渡':'平顺层间过渡';loftButton.disabled=!state.editable||state.active||state.range?.open;loftConfirmation.hidden=!state.loftPreview;
    repair.hidden=!whole||!state.childLayer?.repairable;repair.querySelector('button').disabled=!state.editable||state.active||state.covered;
    $('sectionWholeDensify').disabled=$('sectionWholePoints').disabled;
    node.querySelectorAll('[data-whole-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.wholeTool===state.wholeTool);b.setAttribute('aria-pressed',String(b.dataset.wholeTool===state.wholeTool));b.disabled=!state.editable||state.active;});
    const reach=$('sectionWholeReach'),reachLayer=whole?'CHILD':'MAIN';if(reach.dataset.pointLayer!==reachLayer){reach.dataset.pointLayer=reachLayer;reach.replaceChildren(...(whole?[[12,'窄 · 12°'],[18,'中 · 18°'],[30,'宽 · 30°'],[45,'很宽 · 45°']]:[[45,'窄 · 45°'],[72,'中 · 72°'],[90,'宽 · 90°']]).map(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;return option;}));}reach.value=state.wholeReach;reach.closest('label').hidden=state.wholeTool!=='SOFT';reach.disabled=state.wholeTool!=='SOFT'||!state.editable||state.active;$('sectionWholeWorldPoints').checked=Boolean(state.wholeWorldPoints);$('sectionWholeWorldPoints').disabled=!state.editable||state.active;
    focusButton.disabled=state.active||state.mode!=='PROFILE'||!state.section;
    const ringSelected=state.selectionScope==='RING',ringCount=(state.selectedSectionIds||[]).length,ringLabel=ringCount>1?'已选 '+ringCount+' 圈':'已选整圈',points=api.pointState(),pointName=whole?'子点':'主点';$('sectionPointSelection').classList.toggle('has-point-selection',points.selectedCount>0);$('sectionPointSelection').textContent=points.transform?`${points.transform.action==='ROTATE'?'R 旋转':'S 缩放'} · ${points.selectedCount} 个${pointName} · ${points.transform.action==='ROTATE'?points.transform.value.toFixed(1)+'°':'×'+points.transform.value.toFixed(3)}${points.transform.limited?' · 边界':''}`:points.move?`G 移动 · ${points.selectedCount} 个${pointName} · ${points.move.axis||'XY'} · X ${points.move.x.toFixed(2)} / Y ${points.move.y.toFixed(2)} cm${points.move.limited?' · 边界':''}`:points.offsetActive?`推拉 · ${points.selectedCount} 个${pointName} · ${points.offset.toFixed(1)}%`:points.nudge?`微调 · ${points.selectedCount} 个${pointName}`:frontDrag?.kind==='PROFILE'||state.activeKnot?`${frontDrag?.keyboard||state.keyboard?'G 移动':'拖动'} · ${points.selectedCount} 个${pointName}`:`${pointName} ${points.count} · ${points.selectedCount?'已选 '+points.selectedCount+' 点 · 当前 '+(points.index+1):'拖空白框选'}`;
    if(ringSelected)$('sectionPointSelection').textContent=state.wholeAction?state.hint:ringLabel+' · G 沿干 / R 旋转 / S 缩放';
    node.querySelector('.section-point-tools').setAttribute('aria-label',ringSelected?'整圈快捷编辑':'轮廓控制点快捷编辑');
    node.querySelector('[data-point-action="move"]').innerHTML=(ringSelected?'沿干':'移动')+' <kbd>G</kbd>';
    if(points.input?.text)$('sectionPointSelection').textContent+=` · 输入 ${points.input.text}${points.transform?.action==='ROTATE'?'°':points.transform?' 倍':' cm'}${points.input.valid?'':'（无效）'}`;
    $('sectionPointSelection').title=$('sectionPointSelection').textContent;
    $('sectionPointSelection').classList.toggle('invalid-point-input',points.input?.valid===false);
    node.querySelector('.section-point-tools').hidden=node.querySelector('.section-point-shortcuts').hidden=state.mode!=='PROFILE';
    node.querySelector('.section-selection-tools').hidden=node.querySelector('.section-point-offset').hidden=state.mode!=='PROFILE';
    node.querySelectorAll('[data-point-action]').forEach(b=>{const a=b.dataset.pointAction;b.hidden=ringSelected&&['add','remove','previous','next'].includes(a);b.disabled=!state.editable||state.active||state.covered||!points.count||['move','rotate','scale'].includes(a)&&!points.selectedCount&&!ringSelected||a==='add'&&(points.selectedCount!==1||points.count>=points.limit)||a==='remove'&&(!points.selectedCount||points.count-points.selectedCount<3)||['previous','next'].includes(a)&&points.selectedCount!==1;
      const reason=!state.editable?'当前枝干不可编辑':state.active?'先确认或取消当前操作':state.covered?'当前截面与另一圈重叠':['move','rotate','scale'].includes(a)&&!points.selectedCount?'先选点或拖空白框选':a==='add'&&points.selectedCount!==1?'先选一个点，在它的下一段加点；也可 Shift 点击黄线':a==='add'&&points.count>=points.limit?`当前层最多 ${points.limit} 点`:a==='remove'&&!points.selectedCount?'先选择要删除的点':a==='remove'&&points.count-points.selectedCount<3?'闭合轮廓至少保留三个点':['previous','next'].includes(a)&&points.selectedCount!==1?'单选一个点后用 Tab / Shift+Tab 切点':'';
      b.title=ringSelected&&['move','rotate','scale'].includes(a)?{move:'G · 沿树干滑动整圈',rotate:'R · 绕树干旋转整圈',scale:'S · 缩放整圈粗细'}[a]:reason||({move:'G · 平面移动选点，左键 / Enter 确认，Esc 取消',rotate:'R · 围绕紫色中心旋转所选点，左键 / Enter 确认，Esc 取消',scale:'S · 围绕紫色中心缩放所选点，左键 / Enter 确认，Esc 取消',add:'A · 在当前点的下一段加点',remove:'Delete · 只删除所选点',previous:'Shift+Tab · 上一点',next:'Tab · 下一点'}[a]);});
    node.querySelectorAll('[data-point-select]').forEach(b=>{b.disabled=!state.editable||state.active||state.covered||!points.count;});
    pointOffset.disabled=!state.editable||state.covered||!points.selectedCount||state.active&&!points.offsetActive;
    if(!points.offsetActive||document.activeElement!==pointOffset)pointOffset.value=Number(points.offset.toFixed(5));
    $('sectionPointOffsetHint').textContent=points.selectedCount>1?`各点同量推拉，以参考点 ${points.index+1}（${points.point.angle.toFixed(1)}°）的半径为基准；确认后归零。`:points.selected?'以当前点半径为基准；输入或拖标签，确认后归零。':'先选点，再输入或拖标签；确认后归零。';
    svg.classList.toggle('box-mode',state.mode==='PROFILE'&&state.editable);
    pointMore.querySelector('summary').setAttribute('aria-disabled',String(state.active));
    if(state.section){$('sectionCircleSummary').textContent=`${(state.section.t*100).toFixed(1)}% · ×${state.section.radius.toFixed(2)} · ${state.section.roll.toFixed(1)}°`;properties.querySelector('summary').title=`整圈高度 ${(state.section.t*100).toFixed(1)}%，粗细 ${state.section.radius.toFixed(2)} 倍，扭转 ${state.section.roll.toFixed(1)}° · H 展开高度输入`;}
    node.querySelector('[data-whole-tool="POINT"]').title='2 · 默认精确移动，只改所选'+pointName+'；多选后拖任一选点移动整个选区，也可按 G'+(whole?'，主点保持':'，子点随主点调整大形');
    node.querySelector('[data-whole-tool="SOFT"]').title='1 · 打大体时手动开启柔和推拉，浅色邻近'+pointName+'也会跟随'+(whole?'，主点保持':'，子点保留相对细形');
    $('sectionDockTarget').textContent = state.section ? `${(state.section.t * 100).toFixed(1)}% · ${state.mode==='PROFILE'?ringSelected?ringLabel:`已选 ${points.selectedCount} 点`:'整圈属性'}` : state.target?'当前承重枝':'先选择承重枝干';$('sectionDockTarget').title=state.target||'';
    updateHeightTrack(state,items);
    ringTransport.hidden=!state.section||Boolean(state.range?.open)||state.conversion;ringTransport.classList.toggle('moving',Boolean(state.ringMoving));const ringSelectButton=ringTransport.querySelector('[data-select-ring]');ringSelectButton.textContent=ringSelected?ringCount>1?'已选 '+ringCount+' 圈':'整圈已选':'选整圈';ringSelectButton.title='普通点击轮廓只选一圈；Shift 加选 / Ctrl 减选其他圈。再次点击返回点编辑';node.dataset.selectedSectionIds=JSON.stringify(state.selectedSectionIds||[]);ringSelectButton.setAttribute('aria-pressed',String(ringSelected));ringSelectButton.disabled=!state.editable||state.active;const moveRingButton=ringTransport.querySelector('[data-section-action="slide"]');moveRingButton.innerHTML=ringSelected?'移圈 <kbd>G</kbd>':'移圈 <kbd>Alt+G</kbd>';moveRingButton.setAttribute('aria-keyshortcuts',ringSelected?'G':'Alt+G');moveRingButton.title=(ringSelected?'G':'Alt+G')+' · 沿树干移动当前整圈；Enter 确认，Esc 取消';moveRingButton.disabled=!state.editable||state.active||Boolean(state.range?.open);moveRingButton.setAttribute('aria-pressed',String(Boolean(state.ringMoving)));
    alongBranch.hidden=!state.section;$('sectionAlongSummary').textContent=`沿干位置 · ${context.index+1} / ${items.length} 圈`+(context.coincident>1?` · 同位 ${context.coincident} 圈`:'');
    alongToggle.disabled=!state.section||state.active||Boolean(state.range?.open);alongToggle.title=$('sectionAlongSummary').textContent+' · 点击切圈，拖动移圈';
    $('sectionNeighbourReferences').checked=showReferences;$('sectionNeighbourReferences').disabled=!state.section||state.active||state.covered;
    referenceControls.hidden=!state.section||state.covered;
    $('sectionReferenceLegend').hidden=!showReferences;
    for(const side of ['ROOT','TIP']){const item=context[side==='ROOT'?'root':'tip'],label=node.querySelector(`[data-reference-label="${side}"]`);label.textContent=(side==='ROOT'?'靠根':'靠梢')+' · '+(item?(item.t*100).toFixed(1)+'%':'无邻圈');label.title=item?item.id:'已到本侧作者截面边界';}
    node.querySelector('.section-quick-fields').hidden=!state.section;
    quickFields.forEach(input=>{const key=input.dataset.sectionField;input.disabled=!state.editable||state.active&&state.sectionField!==key||key!=='t'&&state.covered;if(state.section&&!(state.sectionField===key&&document.activeElement===input))input.value=Number((state.section[key]*(key==='t'?100:1)).toFixed(4));});
    $('sectionRecipeKind').textContent = state.conversion ? '直接截面 · 试用未确认' : state.direct ? '直接截面 · 相邻过渡' : '旧版叠加 · 保持原工程';
    $('sectionRecipeKind').title = state.direct ? '主点控制大体起伏，子点精修局部；纵沟与板根参数仍可独立调节' : '旧版截面与纵沟、板根仍共同叠加；只有明确确认后才转换';
    node.querySelector('[data-section-action="direct"]').hidden = !state.legacy || state.conversion || state.compatibility;
    node.querySelector('[data-section-action="direct"]').disabled = !state.editable;
    $('sectionDirectPreview').hidden = !state.conversion;
    if(state.conversion){const name=TRUNK_WORKFLOW_LABELS[state.stage],child=state.stage==='CONTOUR';node.querySelector('[data-conversion-title]').textContent=child?'子点精修准备 · 先检查新版截面':name+'准备 · 先检查新版截面';node.querySelector('[data-conversion-help]').textContent=child?'当前工程使用旧版截面。进入子点精修需要新版截面连接，外形可能变化；确认后才显示密集子点，取消恢复原形。':'当前工程使用旧版截面，新版连接可能改变外形；确认后进入'+name+'，旧纵沟不会自动拆成独立细节。';node.querySelector('[data-conversion-view-status]').textContent=state.conversionOriginal?'当前看原形 · 仅作对照，切回升级预览后可确认':'当前看升级预览 · 尚未写入工程 · Q 对照原形';const confirm=node.querySelector('[data-section-action="confirm-direct"]');confirm.textContent=state.stage==='SHAPE'?'确认使用新版截面':'确认并进入'+name;confirm.disabled=Boolean(state.conversionOriginal||state.pending);node.querySelectorAll('[data-conversion-view]').forEach(b=>{const active=(b.dataset.conversionView==='ORIGINAL')===state.conversionOriginal;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
    $('sectionChooseTarget').hidden = Boolean(state.target);
    $('sectionLegacyHelp').hidden = !state.legacy || state.conversion || state.compatibility;
    $('sectionDirectEditingHint').hidden=!state.compatibility;
    for (const action of ['sections','details','surface']) node.querySelector(`[data-section-action="${action}"]`).disabled = !state.editable || state.keyboard || state.pending;
    node.querySelectorAll('[data-section-view]').forEach(b => { b.disabled = !state.direct || state.pending || Boolean(state.keyboard && !state.conversion); b.classList.toggle('active', b.dataset.sectionView === state.view); b.setAttribute('aria-pressed', String(b.dataset.sectionView === state.view)); });
    const viewing = state.direct?(whole?'子点只修局部，主点保留；':'主点带动相邻子点，保留局部细形；'):'';
    $('sectionDockHint').textContent = state.hint || (state.keyboard ? '鼠标移动 · 左键 / Enter 确认 · 右键 / Esc 取消' : viewing + (state.section ? hints[state.mode] : '点选承重枝干，按 N 在本枝上放置截面；也可直接调整已有板根。'));
    node.classList.toggle('keyboard-active', Boolean(state.keyboard));
    node.querySelectorAll('[data-section-mode]').forEach(b => { const active=b.dataset.sectionMode===(state.wholeAction||state.mode);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));b.disabled = !state.section || !state.editable || state.active || state.covered && b.dataset.sectionMode !== 'SLIDE'; });
    node.querySelector('[data-section-action="add"]').disabled = !state.editable || state.count >= 24 || state.active;
    node.querySelector('[data-section-action="duplicate"]').disabled = !state.editable || !state.section || state.count >= 24 || state.active;
    node.querySelector('[data-section-action="remove"]').disabled = !state.editable || !state.section || state.active;
    node.querySelector('[data-section-action="remove"]').innerHTML=(ringSelected?(ringCount>1?'删 '+ringCount+' 圈':'删整圈'):whole?'删整圈':'删截面')+' <kbd>Del</kbd>';node.querySelector('[data-section-action="remove"]').title=ringSelected?'Delete / Backspace · 删除所选 '+ringCount+' 圈，保留枝干；可一次撤销':'删除当前'+(whole?'整圈':'截面')+'；点选模式 Delete / Backspace 只删除选中点。';
    node.querySelector('[data-section-action="presets"]').disabled = !state.section || Boolean(state.keyboard);
    node.querySelector('[data-section-action="focus"]').disabled = !state.section || Boolean(state.keyboard&&!state.conversion);
    node.querySelector('[data-section-action="round"]').disabled = !state.editable || state.active || state.covered;
    $('sectionFrontView').hidden = !state.section || !['PROFILE', 'TWIST'].includes(state.mode) || state.covered;
    $('sectionFrontHeading').textContent = state.direct?`主点 ${points.mainCount} / 子点 ${points.childCount} · ${whole?'子点精修':'主点塑形'}`:'旧版截面正视';
    svg.dataset.pointLayer=whole?'CHILD':'MAIN';
    node.querySelector('[data-section-action="round"]').textContent=whole?'子点归基形':'主点归圆';node.querySelector('[data-section-action="round"]').title=whole?'保留主点与子点数量，将子点恢复到主点形状':'主点半径恢复为圆形，保留子点数量和局部细形';
    $('sectionFrontHelp').textContent=frontBox?`框选中 · ${frontBox.candidates.length} 个候选点 · 松手选择，Esc 取消`:points.transform?`${points.transform.scope==='SECTION'?'单点以截面中心':'以所选点中心'}${points.transform.action==='ROTATE'?'旋转':'缩放'} · 紫色十字为中心${points.transform.limited?' · 已到轮廓边界':''} · 输入${points.transform.action==='ROTATE'?'角度':'倍率'} / Shift 细调 · Enter 确认 / Esc 取消`:frontDrag?.keyboard?`移动 ${points.selectedCount} 个${pointName} · X / Y 限方向，输入厘米 · Shift 细调 · Enter 确认 / Esc 取消`:state.active?'正在调整 · 松手 / Enter 确认，Esc 取消':state.mode==='TWIST'?'整圈扭转 · 松手确认，Esc 取消':points.selectedCount>1?`G 移动 / R 旋转 / S 缩放选点 · Del 删点${state.wholeTool==='SOFT'?' · 柔和拖动带邻点':whole?' · 主点保留':' · 子点随形'}`:points.selectedCount===1?`G 移动 / R 旋转 / S 缩放 · Shift 点线加点 · Alt 点点删点${state.wholeTool==='SOFT'?' · 带动邻点':''}`:(whole?(state.childLayer?.unmatched?'已达 128 点 · 可删减多余点，再调整局部':'凹角、凸峰直接选点 · 拖空白框选 · Shift 点线加点'):'拖空白框选 · Shift 加选 / Ctrl 减选 · Shift 点线加点');
    if(ringSelected)$('sectionFrontHelp').textContent=state.wholeAction?state.hint:(ringCount>1?'只变换选中的 '+ringCount+' 圈；':'只变换当前圈；')+'Shift 点其他圈加选 · Ctrl 减选';
    if(!state.conversion)$('sectionFrontHelp').textContent=selectionSummary.constraint+' · '+selectionSummary.pivot+' · '+$('sectionFrontHelp').textContent;
    if(state.conversion)$('sectionFrontHelp').textContent=state.conversionOriginal?'当前为原形对照；Q 切回升级预览':'当前为升级预览；确认后进入'+TRUNK_WORKFLOW_LABELS[state.stage]+'，Q 对照原形';
    $('sectionPointSelection').title=$('sectionPointSelection').textContent;
    svg.setAttribute('aria-label', ringSelected?`已选 ${ringCount} 圈；G 沿干移动，R 各自绕本圈中心旋转，S 调粗细；Shift 点击其他圈加选，Ctrl 减选`:state.mode === 'TWIST' ? '黄色点调整截面扭转，正在拖动的点为橙色；松手确认，Esc 取消' : '蓝色点调整截面轮廓，悬停变亮，正在拖动的点为橙色；拖点自动进入轮廓工具，松手确认，Esc 取消');
    $('sectionPresetLibrary').hidden = !libraryOpen;
    node.classList.toggle('preset-library-open',libraryOpen);
    node.querySelector('.section-preset-preview').hidden=!state.presetPreview;
    $('sectionPresetPreviewName').textContent=state.presetPreview?'试用 · '+state.presetPreview.name:'';
    $('sectionPresetScope').textContent = whole?'保存这一整圈的实际褶皱外形与主点；套用时补偿目的位置已有表面效果，保留沿枝位置和原纵沟／板根配方。':state.direct ? '保存当前截面的主点与子点；套用替换这圈形状，保留沿枝位置，不含独立表面与基部配方。' : '套用仅替换当前截面形状；沿枝位置和过渡范围保留。直接截面预设需先确认转换。';
    node.querySelector('[data-section-action="presets"]').classList.toggle('active', libraryOpen);
    updateTrunkWorkflow(node,{stage:state.stage,disabled:!state.editable||state.active});
    node.querySelector('[data-workflow-next]').textContent=`下一步 · ${TRUNK_WORKFLOW_LABELS[whole?'DETAIL':'CONTOUR']} →`;
    node.querySelectorAll('[data-workflow-next],[data-workflow-done],[data-workflow-mesh]').forEach(b=>b.disabled=!state.editable||state.active);
    if(state.range?.open){$('sectionEditorExpand').disabled=true;node.querySelector('[data-section-action="presets"]').disabled=true;node.querySelector('[data-section-action="exit"]').disabled=Boolean(state.range.preview);}
    else node.querySelector('[data-section-action="exit"]').disabled=false;
    if(state.virtualRootBase&&state.rootBase){const remove=node.querySelector('[data-section-action="remove"]');remove.disabled=true;remove.title='尚未保存的根盘编辑层；直接编辑或删除所选点，首次实际修改后保存。';}
    if(state.conversion)node.querySelectorAll('[data-trunk-stage]').forEach(b=>b.disabled=!['SHAPE',state.stage].includes(b.dataset.trunkStage));
    drawFront(state);
    fitPointMenu();
    if (libraryOpen && loaded && !frontDrag) renderPresets();
  }
  new ResizeObserver(()=>{if(!node.hidden&&api.state().region!=='ROOT'&&!$('sectionFrontView').hidden){drawFront(api.state());queueFrontLayout();}}).observe(svg);
  return { update,toggleRootPresets:rootUi.togglePresets,rootPresetConfirmed:rootUi.presetConfirmed, key:pointKey,rangeKey:e=>{if(e.key==='Escape'&&!e.defaultPrevented&&!e.isComposing&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&shortcutHelp.close())return true;return rangeControls.key(e);},presetConfirmed:record=>{preferenceChange(()=>preferences.used(record.id));$('sectionPresetStatus').textContent='已确认「'+record.name+'」';},toggleShortcuts:()=>{closePointMore();return api.state().region==='ROOT'?rootHelp.toggle():shortcutHelp.toggle();},togglePresets, openPresets, closePresets,back,valid:()=>rootUi.valid()&&rangeControls.valid()&&(pointOffset.disabled||pointOffset.value!==''&&pointOffset.checkValidity()),resetViews:()=>{frontViews.clear();frontKey='';},cancel() { rootUi.cancel();closePointMore();pointCursor.hide();lastFrontPointer=null;const h=heightDrag;frontDrag = frontPan = frontBox = frontPress = lastTap = heightDrag = null;if(h?.button.hasPointerCapture(h.pointerId))h.button.releasePointerCapture(h.pointerId);nudgeKeys.clear();svg.classList.remove('panning'); }, get active() { return Boolean(rootUi.active||frontDrag||frontPan||frontBox||heightDrag||api.worldBoxActive?.()); }, get libraryOpen() { return libraryOpen; } };
}
