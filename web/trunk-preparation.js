import * as T from './vendor/three.module.min.js';
import {normalizeTrunkRoute,trunkRoutePlan} from './trunk-import-route.js';
import {createTrunkStartScreen} from './trunk-start-screen.js';
import {createTrunkAutoController} from './trunk-auto-controller.js';
import {checkTrunkRig} from './trunk-rig-readiness.js';
import {createTrunkMaterialComponent} from './trunk-material-component.js';
import {transformTrunkCalibration} from './trunk-calibration-transform.js';
import {resourceEscape as esc,resourceIcon as icon,syncResourceOverlay,trapResourceDialogFocus} from './resource-ui.js';
import {trunkDimensions,trunkCalibrationMatrix,validateTrunkGuides} from './imported-trunk-data.js';
import {trunkEditable,restoreTrunkEdits,recalibrateTrunk,resizeTrunk,addTrunkGuide,validateTrunkReady} from './trunk-preparation-data.js';
import {createTrunkPreparationStore} from './trunk-preparation-store.js';
import {createTrunkModelStore} from './trunk-model-store.js';
import {createTrunkPreparationView} from './trunk-preparation-view.js';
import {normalizeGuideSelection,combineGuideSelection,guidePointKey,guideSelectionCenter,transformGuideSelection} from './trunk-guide-selection.js';
import {guideEditPoints,subdivideTrunkSegments,interiorSegmentPoints,segmentDeletionPoints,planTrunkPointDeletion,dissolveTrunkPoints,trunkBranchFamily,removeTrunkBranches,reattachTrunkBranch} from './trunk-guide-topology.js';
import {createTrunkWeightTools} from './trunk-weight-tools.js';

export function createTrunkPreparation(api){
 const style=document.createElement('link');style.rel='stylesheet';style.href='/trunk-preparation.css';document.head.append(style);const flowStyle=document.createElement('link');flowStyle.rel='stylesheet';flowStyle.href='/trunk-flow.css';document.head.append(flowStyle);
 const dialog=document.createElement('dialog');dialog.id='trunkPreparationDialog';dialog.className='trunk-workbench';dialog.setAttribute('aria-labelledby','trunkPreparationTitle');
 dialog.innerHTML=`<header class="trunk-heading"><img src="/brand/category-plant-v1.png" width="76" height="76" alt=""><div><small>雕刻 / AI 模型 → 可装配树干</small><h2 id="trunkPreparationTitle">树干整理</h2><p>保留原始网格与材质，建立可复用的承重结构。</p></div><div class="trunk-header-actions"><button data-import>${icon('import')}导入树干 GLB</button><button data-close>${icon('arrow-left')}返回资源中心</button><button data-cancel-import hidden>取消读取</button></div></header>
 <div class="trunk-namebar"><label>素材名称<input data-name maxlength="80" placeholder="例如：老樟树 · 树洞主干"></label><span data-source></span><span data-autosave role="status">草稿随整理自动保存</span></div>
 <div class="trunk-layout"><aside class="trunk-sidebar"><button data-overview class="trunk-overview">${icon('layout-grid')}<span><strong>树干总览</strong><small>原模、网格与控制骨架</small></span>${icon('arrow-left')}</button><nav class="trunk-steps" aria-label="树干整理步骤"><button data-step="1"><i>01</i><span><strong>方向与尺寸</strong><small>底点、朝向、真实米制尺寸</small></span></button><button data-step="2"><i>02</i><span><strong>控制骨架</strong><small>布置控制枝与网格归属</small></span></button><button data-step="3"><i>03</i><span><strong>检查与保存</strong><small>原材质、弯曲测试、固定版本</small></span></button></nav><div class="trunk-structure"><header><strong>控制枝 <span data-guide-count>0</span></strong><button data-add-guide aria-label="添加子控制枝">${icon('plus')}</button></header><div data-guides></div></div><details class="trunk-draft-list" open><summary>${icon('history')}整理草稿</summary><select data-drafts aria-label="选择树干整理草稿"></select><button data-resume>继续整理</button></details></aside>
 <main class="trunk-main"><div class="trunk-viewbar"><div role="group" aria-label="模型显示"><button data-display="source">${icon('box')}原始模型</button><button data-display="result">${icon('axis-3d')}整理结果</button></div><button data-material title="用当前造型制作新的树皮材质，保留原始树干与控制骨架">${icon('palette')}制作树皮材质</button><button data-sculpt class="trunk-sculpt-entry">${icon('brush')}模型雕刻</button><span data-view-note>检查方向与尺寸</span><select data-representation aria-label="显示模型与骨架"><option value="overlay">模型＋骨架</option><option value="model">只看模型</option><option value="bones">只看骨架</option></select><button data-fit>${icon('maximize')}适应模型</button><button data-front>正视</button></div><div class="trunk-host" data-host><div class="trunk-empty" data-empty><img src="/brand/category-plant-v1.png" alt=""><h3>从一段有造型的树干开始</h3><p>导入雕刻或 AI 生成的静态 GLB，保留树洞、根部、UV 和内嵌贴图。</p><button data-empty-import>${icon('plus')}选择树干 GLB</button><small>原始文件随草稿和素材保留 · 可随时返回修改</small></div></div><footer class="trunk-viewfooter"><span>中键旋转 · Shift＋中键平移 · 滚轮缩放</span><span data-dimensions></span><button data-undo aria-label="撤销">${icon('undo-2')}</button><button data-redo aria-label="重做">${icon('redo-2')}</button></footer></main>
 <aside class="trunk-properties"><header><span data-step-number>01</span><div><small>树干整理</small><h3 data-step-title>方向与真实尺寸</h3></div></header><div class="trunk-property-scroll">
 <section data-section="1"><p class="trunk-guide">确定树干底点与生长方向，再输入真实长度。原始网格始终保留。</p><div class="trunk-point-actions"><button data-point="base">${icon('map-pin')}重定底点</button><button data-point="tip">${icon('move-up')}重定朝向</button></div><label>底点到朝向点的真实长度（m）<input type="number" data-length min=".001" max="1000" step="any"></label><div data-size-feedback class="trunk-size-feedback"></div><dl data-size-facts></dl><details><summary>校准点坐标</summary>${['base','tip','front'].map(key=>'<fieldset><legend>'+({base:'底点',tip:'朝向点',front:'正面方向'}[key])+'</legend>'+['X','Y','Z'].map((axis,i)=>'<label>'+axis+'<input type="number" step="any" data-coordinate="'+key+'" data-axis="'+i+'"></label>').join('')+'</fieldset>').join('')}</details><button data-face-camera>${icon('scan-eye')}以当前视角设置正面</button><small>整理后底点为原点，Z 轴向上，Y 轴为正面。</small></section>
 <section data-section="2" hidden><p class="trunk-guide">把控制枝放在对应木干内部。这里设置原始骨架；弯曲测试在下一步进行。</p><label>当前控制枝<select data-guide-select></select></label><div class="trunk-point-navigator"><header><strong data-point-title>当前控制点</strong><span data-point-count></span></header><div class="trunk-point-jump"><button data-previous-point aria-label="上一个控制点">${icon('chevron-left')}</button><select data-point-select aria-label="当前控制点"></select><button data-next-point aria-label="下一个控制点">${icon('chevron-right')}</button></div><div class="trunk-selection-actions"><button data-guide-all>本枝全选</button><button data-guide-clear>清空选区</button></div><div data-point-strip class="trunk-point-strip" aria-label="选择控制点"></div><small data-selection-note>仅编辑明确选中的点</small></div><small data-coordinate-title>控制点坐标（m）</small><div class="trunk-point-inputs">${['X','Y','Z'].map((axis,i)=>'<label>'+axis+'（m）<input type="number" data-control-axis="'+i+'" step="any"></label>').join('')}</div><div class="trunk-point-actions"><button data-insert-point>${icon('plus')}插入控制点</button><button data-remove-point>${icon('minus')}删除控制点</button></div><p class="trunk-guide">空白处拖框多个点，Shift 补选、Ctrl 减选。G／R／S 编辑选区，轴心为选区中心；未选点不连带。F 聚焦选区。</p><div class="trunk-point-actions"><button data-add-child>添加子控制枝</button><button data-remove-guide>删除当前控制枝</button></div><label>网格归属<div data-regions></div></label><small>相邻但不连通的木干，可指定对应控制枝，避免错误连带。</small></section>
 <section data-section="3" hidden><p class="trunk-guide">检查方向、真实尺寸和材质。素材在整树中支持整体变换与柔性控制枝编辑。</p><label>弯曲测试 <strong data-pose-label>0°</strong><input type="range" data-pose min="-35" max="35" step="1" value="0"></label><button data-reset-pose>恢复原始造型</button><small>测试不改变保存造型。请检查分叉、树洞与相邻木干。</small><div data-sculpt-review hidden><p>雕刻已改变网格，请复核控制线与挂接位置。</p><button data-confirm-sculpt-review>已检查方向、尺寸与骨架</button></div><div class="trunk-checklist" data-checklist></div><h4>原始材质与贴图</h4><div data-materials></div></section>
 </div><div class="trunk-next"><button type="button" data-rig-back hidden>${icon('arrow-left')}上一步 · 骨架编辑</button><button data-next>下一步：控制骨架 ${icon('arrow-right')}</button></div></aside></div>
 <footer class="trunk-footer"><div><strong data-status role="status" aria-live="polite">先导入树干，或继续已有草稿。</strong><small data-save-note>默认保存到当前项目；收入本机内容库后可跨工程复用。</small></div><button data-library>${icon('library-big')}收入本机内容库</button><button data-project class="trunk-primary">${icon('save')}保存到当前项目</button><button data-replace-sculpt hidden>预览应用到当前树</button><button data-use>${icon('arrow-up-right')}以此树干开始创作</button></footer><input type="file" data-file accept=".glb" hidden>`;
 const modelTools=document.createElement('div');modelTools.className='trunk-transformbar';modelTools.innerHTML='<span data-transform-kind>模型校准</span><div role="group" aria-label="模型变换" data-model-toolbar><button data-model-tool="observe">'+icon('mouse-pointer-2')+'观察</button><button data-model-tool="translate">'+icon('move')+'移动网格 <kbd>G</kbd></button><button data-model-tool="rotate">'+icon('rotate-3d')+'旋转 <kbd>R</kbd></button><button data-model-tool="scale">'+icon('scaling')+'等比缩放 <kbd>S</kbd></button></div><div data-guide-toolbar hidden><div role="group" aria-label="点选择方式"><button data-point-mode="box" title="拖动框选一个新选区">'+icon('mouse-pointer-2')+'框选 <kbd>B</kbd></button></div><span class="trunk-edit-target" data-edit-target>选择控制点</span><button data-guide-move>'+icon('move')+'移动 <kbd>G</kbd></button><button data-guide-rotate>'+icon('rotate-3d')+'旋转 <kbd>R</kbd></button><button data-guide-scale>'+icon('scaling')+'缩放 <kbd>S</kbd></button><select data-axis-view aria-label="布点视角"><option value="">布点视角</option><option value="front">正视 · X/Z</option><option value="side">侧视 · Y/Z</option><option value="top">俯视 · X/Y</option></select><button data-guide-focus>'+icon('focus')+'聚焦 <kbd>F</kbd></button></div><label><input type="checkbox" data-human-reference checked>人物 1.75 m</label><small data-transform-help>拖动手柄；或按快捷键输入数值</small>';dialog.querySelector('[data-host]').before(modelTools);
 document.body.append(dialog);trapResourceDialogFocus(dialog);const q=s=>dialog.querySelector(s),all=s=>dialog.querySelectorAll(s),store=createTrunkPreparationStore(),library=createTrunkModelStore();
 const flow=document.createElement('nav');flow.className='trunk-flow';flow.setAttribute('aria-label','树干整理流程');flow.innerHTML='<button data-flow="model">01 模型准备</button><button data-flow="material">02 表面材质</button><button data-flow="export">03 检查与保存</button><button data-flow="rig">04 自动骨架与绑定</button>';q('.trunk-heading').after(flow);
 const strategy=document.createElement('div');strategy.className='trunk-material-options';strategy.innerHTML='<select data-material-policy hidden aria-label="处理方式"><option value="new">高模完整处理</option><option value="material">保留模型，只制作材质</option><option value="keep">直接绑定骨骼</option></select><label>目标三角面<select data-material-target><option value="15000">1.5 万</option><option value="30000">3 万</option><option value="50000" selected>5 万</option></select></label><label>贴图规格<select data-material-resolution><option value="1024">1K</option><option value="2048" selected>2K</option><option value="4096">4K</option></select></label>';q('[data-section="1"]').prepend(strategy);
 const summary=document.createElement('div');summary.className='trunk-current-route';summary.innerHTML='<div><small>当前处理方式</small><strong data-route-title></strong></div><button type="button" data-route-change>更改</button><p data-route-flow></p>';strategy.prepend(summary);
 const draftList=q('.trunk-draft-list'),draftHome=draftList.parentElement,strategyHome=strategy.parentElement;
 let pendingImportRoute=null,picker={open:false,purpose:'import',route:'full',target:'50000',resolution:'2048'};
 const udimFiles=document.createElement('input');
 Object.assign(udimFiles,{type:'file',multiple:true,accept:'.glb,.png,.jpg,.jpeg',hidden:true});
 dialog.append(udimFiles);
 const startScreen=createTrunkStartScreen(q('.trunk-layout'),{change:value=>{picker.route=value;if(!model)selectRoute(value);render();},choose:value=>{pendingImportRoute=value;q('[data-file]').click();},chooseUdim:value=>{pendingImportRoute=value;udimFiles.click();},apply:value=>{selectRoute(value);if(draft){draft={...draft,preparationRoute:value};scheduleSave();}picker.open=false;render();status('已选择：'+trunkRoutePlan(value).title+'。当前模型保留，按右侧主按钮继续。');q('[data-next]').focus({preventScroll:true});},cancel:()=>{picker.open=false;q('[data-material-target]').value=picker.target;q('[data-material-resolution]').value=picker.resolution;render();q('[data-route-change]').focus({preventScroll:true});},drop:(file,route)=>safe(()=>importFile(file,{route}))()});
 function selectRoute(value){const route=normalizeTrunkRoute(value);q('[data-material-policy]').value=route==='rig'?'keep':route==='full'?'new':'material';picker.route=route;}
 function chooseImport(){if(busy||gesture||repair)return;pendingImportRoute=null;if(!model){pendingImportRoute=startScreen.choice.value;q('[data-file]').click();return;}openRoutePicker('import');}
 function openRoutePicker(purpose){if(busy||gesture||repair)return;picker={open:true,purpose,route:normalizeTrunkRoute(q('[data-material-policy]').value),target:q('[data-material-target]').value,resolution:q('[data-material-resolution]').value};render();startScreen.focus();}
 summary.querySelector('[data-route-change]').onclick=()=>openRoutePicker('change');
 const inspect=document.createElement('button');inspect.dataset.rigInspect='';inspect.textContent='检查弯曲与绑定 →';q('[data-section="2"]').append(inspect);
 const confirmRig=document.createElement('button');confirmRig.dataset.confirmRig='';confirmRig.textContent='检查弯曲与绑定';q('[data-section="3"]').prepend(confirmRig);
 const jointPanel=document.createElement('div');jointPanel.className='trunk-joint-panel';
 jointPanel.innerHTML=`
  <strong>单骨旋转检查</strong><small data-joint-note>点选关节点或骨架段，按 R 或拖动旋转环。</small>
  <label>控制枝<select data-joint-guide aria-label="验收控制枝"></select></label>
  <label>骨架段<select data-joint-segment aria-label="验收骨架段"></select></label>
  <div><label>旋转轴<select data-joint-axis><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label>
  <label>试转角度 <output data-joint-angle-label>0°</output><input type="range" data-joint-angle aria-label="试转角度" min="-90" max="90" step="1" value="0"></label></div>
  <div data-joint-actions><button type="button" data-joint-weights>返回权重修复</button></div>
  <small><kbd>R</kbd> 试转 · <kbd>X</kbd>/<kbd>Y</kbd>/<kbd>Z</kbd> 约束轴 · 可输入角度<br><kbd>Enter</kbd> 确认 · <kbd>Esc</kbd> 取消 · <kbd>F</kbd> 聚焦 · <kbd>↑</kbd>/<kbd>↓</kbd> 切换同枝关节</small>
  <small>测试姿态仅用于检查。可点选另一段骨架继续验收。</small>`;
 q('[data-section="3"]').prepend(jointPanel);
 const resetPose=q('[data-reset-pose]');resetPose.textContent='恢复静止姿态';q('[data-joint-actions]').prepend(resetPose);
 q('[data-pose-label]').previousSibling.textContent='整树试弯 ';
 const repairEntry=document.createElement('button');
 repairEntry.className='trunk-repair-entry';repairEntry.dataset.repairOpen='';repairEntry.textContent='修整当前骨架';
 q('[data-overview]').after(repairEntry);
 const targetTools=document.createElement('div');
 targetTools.setAttribute('role','group');targetTools.setAttribute('aria-label','骨架选择对象');
 targetTools.innerHTML='<button data-guide-target="point">点</button><button data-guide-target="segment">段</button><button data-guide-target="branch">枝</button><label title="选中投影范围内的骨架，包括被木干挡住的点、段和枝"><input type="checkbox" data-guide-through checked>透选</label>';
 q('[data-guide-toolbar]').prepend(targetTools);
 const topology=document.createElement('div');
 topology.className='trunk-repair-tools';
 topology.innerHTML=`
  <div data-repair-summary hidden><strong data-repair-title></strong><small data-auto-warnings></small></div>
  <div data-segment-tools hidden>
   <label>每段新增点数<input type="number" data-subdivide-count min="1" max="8" step="1" value="1"></label>
   <div class="trunk-point-actions"><button data-subdivide>细分所选段</button><button data-dissolve>溶解中间点</button></div>
   <small>Delete 可裁去末端段。多选相邻段可溶解中间点。</small>
  </div>
  <div data-branch-tools hidden>
   <div class="trunk-point-actions"><button data-delete-branches>删除所选枝</button><button data-reattach>重新挂接</button></div>
   <small data-attach-hint hidden>点击目标父枝上的一段设置挂接位置。Esc 取消。</small>
  </div>`;
 q('[data-section="2"]').prepend(topology);
 const deletePopup=document.createElement('div');
 deletePopup.className='trunk-delete-popup';deletePopup.dataset.deleteReview='';deletePopup.hidden=true;
 deletePopup.setAttribute('role','dialog');deletePopup.setAttribute('aria-label','确认删除骨架');deletePopup.setAttribute('aria-describedby','trunkDeleteCount');
 deletePopup.innerHTML=`
  <strong id="trunkDeleteCount" data-delete-count></strong>
  <label data-delete-parent-row>保留子枝的目标父枝<select data-delete-parent></select></label>
  <div class="trunk-delete-actions">
   <button type="button" data-delete-keep>保留子枝并挂接</button>
   <button type="button" data-delete-family>确认删除</button><button type="button" data-delete-cancel>取消</button>
  </div>`;
 dialog.append(deletePopup);
 const repairBar=document.createElement('div');
 repairBar.className='trunk-repair-bar';repairBar.hidden=true;
 repairBar.innerHTML=`
  <button data-repair-compare aria-pressed="false">对照修整前</button>
  <select data-repair-baseline aria-label="对照的骨架" hidden><option value="candidate">修整前候选</option><option value="original">上一版骨架</option></select>
  <button data-repair-test aria-pressed="false">试弯曲</button>
  <label data-repair-angle-row hidden><input data-repair-angle type="range" min="-35" max="35" value="8" aria-label="试弯曲角度"><output data-repair-angle-label>8°</output></label>
  <button data-auto-discard>放弃修整</button><button data-auto-apply class="trunk-primary">确认绑定</button>`;
 q('.trunk-footer').prepend(repairBar);
 const versionButton=document.createElement('button');versionButton.dataset.materialVersion='';q('.trunk-header-actions').prepend(versionButton);
 const rebuild=document.createElement('button');rebuild.dataset.materialRebuild='';rebuild.textContent='重新准备材质工作版本';q('[data-section="1"]').append(rebuild);
 let model=null,draft=null,view=null,context={},step=1,selected=null,selection=[],selectionMode='auto',busy=false,worker=null,timer=0,saveChain=Promise.resolve(),saveError=null,opener=null,history=[],future=[],importSequence=0,savedStamp='',gesture=false,rejectImport=null,auto=null;
 let repair=null,targetMode='point',targets=[],through=true,deleteReview=null,attaching=null,lastPointer=null;
 const rigAllowed=()=>!!model&&(!!model.material_workflow||normalizeTrunkRoute(q('[data-material-policy]').value)==='rig');
 const status=(message,error=false)=>{q('[data-status]').textContent=message;q('[data-status]').dataset.error=String(error);startScreen.status.textContent=message;startScreen.status.dataset.error=String(error);};
 const component=createTrunkMaterialComponent({dialog,render,status,getView:()=>view?.getView(),setView:value=>view?.setView(value)});
 const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(error){if(error.name==='AbortError'){status('已取消读取，原有树干和草稿保留。');return;}status(error.message,true);api.toast(error.message,true);}};
 udimFiles.onchange=safe(async()=>{
  const files=[...udimFiles.files],models=files.filter(file=>/\.glb$/i.test(file.name));
  udimFiles.value='';
  const route=pendingImportRoute||picker.route;
  pendingImportRoute=null;
  if(!files.length)return;
  if(models.length!==1||files.length<2)throw Error('请同时选择一个 GLB 和它的 UDIM 瓦片贴图。');
  await importFile(models[0],{route,tiles:files.filter(file=>file!==models[0])});
 });
 const selectionHistory=new WeakMap(),captureEditState=()=>{const edits=trunkEditable(model);selectionHistory.set(edits,{selection:selection.map(p=>({...p})),selected:selected&&{...selected},targetMode,targets:targets.map(p=>({...p}))});return edits;};
 const stamp=()=>model?JSON.stringify(trunkEditable(model)):'';
 const paintIcons=()=>window.lucide?.createIcons({root:dialog});
 const editLocked=()=>busy||gesture||repair?.comparing||repair?.testing||!!deleteReview;
 const targetState=()=>({target:attaching?'segment':targetMode,targets,through,attaching:!!attaching,affected:deleteReview?.affected,selectionLocked:busy||!!deleteReview});
 const weightTools=createTrunkWeightTools({dialog,getModel:()=>model,getView:()=>view,getSelected:()=>selected,
  canOpen:()=>step===2&&!!model&&rigAllowed()&&!editLocked()&&!attaching,
  isBusy:()=>busy,isDrawing:()=>gesture,setBusy:value=>{busy=value;},setDrawing:value=>{gesture=value;},
  commit:(next,message)=>change(()=>{model=next;},message),refresh:render,status,safe});
 const editModeForStep=value=>value===2?'guide':value===3?'rig-test':'model';
 let inspectorGuides=null,inspectorSegments=null;
 function renderJointPanel(){
  if(step!==3||!model||!view)return;
  const test=view.rigTest,joint=test.joint,guide=model.guides.find(g=>g.id===joint?.guide),locked=busy||gesture;
  const guideSelect=q('[data-joint-guide]'),segmentSelect=q('[data-joint-segment]'),axis=q('[data-joint-axis]'),angle=q('[data-joint-angle]');
  if(inspectorGuides!==model.guides){
   inspectorGuides=model.guides;
   guideSelect.replaceChildren(new Option('请选择控制枝',''),...model.guides.map(g=>new Option(g.parent?'控制枝 '+g.id:'主控制枝',g.id)));
  }
  if(inspectorSegments!==guide){
   inspectorSegments=guide;
   segmentSelect.replaceChildren(...(guide?guide.points.slice(1).map((_,i)=>new Option('第 '+(i+1)+' 段',i)):[new Option('请选择骨架段','')]));
  }
  guideSelect.value=guide?.id||'';segmentSelect.value=joint?.index??'';
  guideSelect.disabled=locked;segmentSelect.disabled=locked||!joint;
  axis.disabled=angle.disabled=locked||!joint||!!test.wholeBend||view.mode!=='result';
  const degrees=Math.round(joint?test.angle(axis.value):0);angle.value=degrees;q('[data-joint-angle-label]').value=degrees+'°';
  q('[data-joint-note]').textContent=test.wholeBend?'整树试弯中，恢复后可继续试转单骨。':joint?'按 R、拖动旋转环或用滑块试转。':'点选关节点或骨架段，按 R 或拖动旋转环。';
  q('[data-joint-weights]').disabled=locked||!rigAllowed();
  resetPose.disabled=locked||!test.wholeBend&&!test.rotated;
  q('[data-transform-kind]').textContent='权重验收';q('[data-transform-help]').textContent='R 试转 · X/Y/Z 约束 · F 聚焦';
  q('[data-view-note]').textContent='单骨旋转与整树试弯';
  q('[data-pose]').value=test.wholeBend;q('[data-pose-label]').textContent=test.wholeBend+'°';
  for(const button of all('[data-inspect-guide]'))button.classList.toggle('selected',button.dataset.inspectGuide===joint?.guide);
 }
 const jointApi={locked:()=>busy||gesture,changed:renderJointPanel,setAxis:value=>{q('[data-joint-axis]').value=value;},dragging:value=>{gesture=value;render();}};

 function renderRepair(){
  const active=!!repair,locked=editLocked(),guideStep=step===2;
  dialog.classList.toggle('trunk-repairing',active);
  dialog.dataset.autoState=auto?.running?'running':repair?.automatic?'preview':'idle';
  dialog.dataset.guideTarget=targetMode;
  repairEntry.hidden=!model||step===1||active;
  repairEntry.disabled=locked||!rigAllowed()||weightTools.active;
  repairBar.hidden=!active;
  for(const b of all('[data-guide-target]')){
   b.disabled=locked||!!attaching;
   b.setAttribute('aria-pressed',String(b.dataset.guideTarget===targetMode));
  }
  q('[data-guide-through]').checked=through;
  q('[data-guide-through]').disabled=locked;
  q('[data-segment-tools]').hidden=targetMode!=='segment';
  q('[data-branch-tools]').hidden=targetMode!=='branch';
  q('[data-attach-hint]').hidden=!attaching;
  q('[data-reattach]').textContent=attaching?'取消重新挂接':'重新挂接';
  q('[data-subdivide]').disabled=locked||!targets.length;
  q('[data-dissolve]').disabled=locked||!model||!interiorSegmentPoints(model,targets).length;
  const onlyChild=targets.length===1&&model?.guides.find(g=>g.id===targets[0].guide)?.parent;
  q('[data-reattach]').disabled=locked||!onlyChild;
  q('[data-delete-branches]').disabled=locked||!!attaching||!targets.some(p=>p.guide!==model?.guides[0].id);
  deletePopup.hidden=!deleteReview;
  q('[data-remove-guide]').disabled=locked||!selected||selected.guide===model?.guides[0].id;
  q('[data-remove-point]').disabled=locked||!selection.length;
  q('[data-repair-summary]').hidden=!active;
  if(guideStep){
   if(targetMode!=='point')q('[data-edit-target]').textContent=targets.length?'已选 '+targets.length+(targetMode==='segment'?' 段':' 枝'):'点选或拖框选择'+(targetMode==='segment'?'骨架段':'控制枝');
   q('[data-transform-kind]').textContent=active?'骨架修整':'控制骨架';
   q('[data-transform-help]').textContent='Shift 点选／拖框补选 · Ctrl 减选';
  }
  if(active){
   q('[data-step-title]').textContent='骨架修整';
   q('[data-view-note]').textContent=repair.testing?'试弯曲 · 拖动角度检查':'当前修整 · 确认后更新绑定';
   q('[data-repair-title]').textContent=(repair.automatic?'自动识别候选':'当前骨架副本')+' · '+model.guides.length+' 枝';
   q('[data-auto-warnings]').textContent=repair.warnings;
   q('[data-repair-angle-row]').hidden=!repair.testing;
   q('[data-repair-compare]').setAttribute('aria-pressed',String(repair.comparing));
   q('[data-repair-compare]').textContent=repair.comparing?'返回修整':'对照修整前';
   q('[data-repair-baseline]').hidden=!repair.comparing||!repair.automatic;
   q('[data-repair-test]').setAttribute('aria-pressed',String(repair.testing));
   q('[data-repair-test]').textContent=repair.testing?'结束试弯曲':'试弯曲';
   q('[data-repair-test]').disabled=busy||gesture||repair.comparing||!!deleteReview||!!attaching||weightTools.active;
   q('[data-repair-compare]').disabled=busy||gesture||!!deleteReview||!!attaching||weightTools.active;
   q('[data-repair-angle]').disabled=busy;
   q('[data-representation]').disabled=busy||repair.testing;
   q('[data-auto-apply]').disabled=busy||gesture||repair.comparing||!!deleteReview||!!attaching;
   q('[data-auto-discard]').disabled=busy||gesture;
   for(const b of all('[data-flow],[data-step],[data-overview],[data-next],[data-import],[data-resume],[data-route-change],[data-sculpt],[data-material],[data-material-version],[data-material-rebuild],[data-project],[data-library],[data-use],[data-replace-sculpt],[data-display="source"],[data-name]'))b.disabled=true;
   if(locked||attaching)for(const b of all('[data-guide-move],[data-guide-rotate],[data-guide-scale],[data-guide-all],[data-guide-clear],[data-undo],[data-redo],[data-guide-select],[data-point-select],[data-control-axis],[data-add-guide],[data-add-child],[data-remove-guide],[data-insert-point],[data-point-index],[data-guides] button'))b.disabled=true;
  }
  weightTools.render(guideStep,locked);
 }
 function checkpoint(){if(!model)return;history.push(captureEditState());history=history.slice(-60);future=[];}
 function render(){q('[data-replace-sculpt]').hidden=!model?.sculpt||!api.canReplace?.(model);q('[data-replace-sculpt]').disabled=busy||gesture||!!repair;q('[data-confirm-sculpt-review]').disabled=busy||gesture||!!repair;q('[data-sculpt-review]').hidden=!model?.sculpt?.needs_review;all('input:not([data-file]),select').forEach(input=>input.disabled=busy||gesture||!model&&!input.matches('[data-drafts]'));q('[data-resume]').disabled=busy||q('[data-drafts]').options.length<2;q('[data-overview]').disabled=busy||!model;
  for(const b of all('[data-model-tool]')){b.disabled=busy||gesture||!model;b.setAttribute('aria-pressed',String(b.dataset.modelTool===(view?.transformMode||'observe')));}q('[data-human-reference]').checked=view?.referenceVisible??true;
  repairSelection();all('[data-point-mode]').forEach(b=>{b.disabled=editLocked()||!model;b.setAttribute('aria-pressed',String(b.dataset.pointMode===selectionMode));});for(const key of ['guide-all','guide-clear'])q('[data-'+key+']').disabled=busy||gesture||!model;q('[data-model-toolbar]').hidden=step!==1;q('[data-guide-toolbar]').hidden=step!==2;q('[data-transform-kind]').textContent=step===2?'控制点编辑':step===3?'模型检视':'模型校准';q('[data-transform-help]').textContent=step===2?'Shift 补选 · Ctrl 减选 · 仅作用选区':'G 移动网格对齐 · 竖直骨架固定';for(const key of ['guide-move','guide-rotate','guide-scale','guide-focus','previous-point','next-point'])q('[data-'+key+']').disabled=busy||gesture||!model||view?.mode==='source';
  q('[data-material]').disabled=busy||gesture||!model||!!repair;
  q('[data-sculpt]').disabled=busy||gesture||!model||!!repair;const present=!!model;dialog.dataset.busy=String(busy);q('[data-cancel-import]').hidden=!worker;q('[data-import]').disabled=busy;all('[data-point],[data-representation],[data-reset-pose]').forEach(input=>input.disabled=busy||!model);for(const key of ['project','library','use','next','fit','front','face-camera','add-guide','add-child','remove-guide','insert-point','remove-point'])q('[data-'+key+']').disabled=busy||!present;
  q('[data-name]').disabled=!present||busy;q('[data-name]').value=model?.name||'';q('[data-empty]').hidden=present;q('[data-source]').textContent=model?.source.name||'静态 GLB · 内嵌材质';q('[data-step-number]').textContent=String(step).padStart(2,'0');q('[data-step-title]').textContent=['方向与真实尺寸','布置控制骨架','检查与保存'][step-1];all('[data-step]').forEach(b=>{b.disabled=busy||!present;b.setAttribute('aria-current',b.dataset.step===String(step)?'step':'false');});all('[data-section]').forEach(s=>s.hidden=s.dataset.section!==String(step));all('[data-display]').forEach(b=>{b.disabled=busy||!present;b.setAttribute('aria-pressed',String(b.dataset.display===(view?.mode||'result')));});q('[data-rig-back]').hidden=step!==3;q('[data-rig-back]').disabled=busy||gesture||!present;q('[data-next]').hidden=step===3;q('[data-next]').textContent=step===1?'下一步：控制骨架 →':'下一步：检查与保存 →';q('[data-undo]').disabled=busy||!history.length||gesture;q('[data-redo]').disabled=busy||!future.length||gesture;
  q('[data-view-note]').textContent=step===2?'布置原始控制骨架；原模不变，下一步测试弯曲':step===3?'检查材质和弯曲结果':'底点、朝向与米制尺寸';
  all('[data-flow]').forEach(b=>{b.disabled=busy||gesture||!model||!!repair;b.setAttribute('aria-current',(step===1?b.dataset.flow==='model':b.dataset.flow==='rig')?'step':'false');});
  const route=trunkRoutePlan(q('[data-material-policy]').value),picking=!model||picker.open,displayRoute=trunkRoutePlan(picking?picker.route:route.id);dialog.classList.toggle('trunk-start-screen',picking);dialog.dataset.preparationStep=String(step);startScreen.sync({shown:picking,present:!!model,purpose:picker.open?picker.purpose:'import',route:displayRoute.id,busy:busy||gesture||!!repair});const strategyTarget=picking?startScreen.settings:strategyHome;if(strategy.parentElement!==strategyTarget)strategyTarget[picking?'append':'prepend'](strategy);const draftsTarget=!model?startScreen.drafts:draftHome;if(draftList.parentElement!==draftsTarget)draftsTarget.append(draftList);summary.querySelector('[data-route-title]').textContent=route.title;summary.querySelector('[data-route-flow]').textContent=route.flow;q('[data-route-change]').disabled=busy||gesture||!!repair;q('[data-material-target]').closest('label').hidden=!displayRoute.optimize;q('[data-material-resolution]').closest('label').hidden=!displayRoute.material;if(picking){q('[data-material-target]').disabled=q('[data-material-resolution]').disabled=busy;q('[data-empty]').hidden=true;}q('[data-import]').textContent=model?'导入新模型':'选择树干 GLB';for(const b of all('[data-flow]')){const skipped=route.id==='rig'&&['material','export'].includes(b.dataset.flow);b.dataset.skipped=String(skipped);if(skipped||picking)b.disabled=true;}q('[data-next]').textContent=step===1?route.action:'下一步：弯曲与绑定检查 →';q('[data-rig-inspect]').disabled=busy||gesture||!!repair;
  const rigChecked=!!model?.material_workflow?.rigConfirmed&&!!model.material_workflow.rigValidation;
  q('[data-confirm-rig]').hidden=!model?.material_workflow;q('[data-confirm-rig]').disabled=busy||gesture||!!repair||rigChecked;
  q('[data-step-number]').textContent=step===1?'01':'04';q('[data-step-title]').textContent=step===1?'模型准备':step===2?'自动骨架与绑定':'弯曲检查与素材保存';
  for(const key of ['project','library','use'])q('[data-'+key+']').disabled=busy||gesture||!present||!!repair;
  confirmRig.textContent=rigChecked?'绑定检查已通过':'检查弯曲与绑定';
  if(!rigAllowed()){q('[data-flow="rig"]').disabled=true;for(const key of ['project','library','use'])q('[data-'+key+']').disabled=true;}
  versionButton.hidden=!model?.material_workflow?.previous&&!draft?.materialResult;versionButton.disabled=busy||gesture;versionButton.textContent=model?.material_workflow?.previous?'回到处理前版本':'恢复材质结果';
  rebuild.hidden=!model?.material_editable&&!draft?.materialSession;rebuild.disabled=busy||gesture||!!repair;
  if(!model){auto?.render();renderRepair();paintIcons();component.render();return;}renderCalibration();
  q('[data-guide-count]').textContent=model.guides.length;const list=q('[data-guides]');list.replaceChildren();for(const g of model.guides){const button=document.createElement('button');button.type='button';if(step===3)button.dataset.inspectGuide=g.id;button.className=(targetMode==='branch'?targets.some(p=>p.guide===g.id):g.id===selected?.guide)?'selected':'';button.innerHTML=icon(g.parent?'git-branch':'tree-pine')+'<span><strong>'+(g.parent?'控制枝 '+g.id:'主控制枝')+'</strong><small>'+g.points.length+' 个控制点</small></span>';button.onclick=event=>{if(step===3){view.rigTest.select({guide:g.id,index:0});return;}const operation=event.ctrlKey||event.metaKey?'subtract':event.shiftKey?'add':'replace';if(targetMode==='branch')selectTargets([{guide:g.id,index:0}],operation);else{if(targetMode!=='point')setTargetMode('point');chooseGuide(g.id,0,operation);}};list.append(button);}
  q('[data-guide-select]').innerHTML=model.guides.map(g=>'<option value="'+g.id+'">'+(g.parent?'控制枝 '+g.id:'主控制枝')+'</option>').join('');q('[data-guide-select]').value=selected?.guide||model.guides[0].id;renderPoint();
  q('[data-regions]').innerHTML=model.primitives.map(p=>'<label>'+esc(p.name)+'<select data-region="'+esc(p.id)+'"><option value="">自动按控制枝</option>'+model.guides.map(g=>'<option value="'+g.id+'" '+(model.binding?.primitive_guides?.[p.id]?.[0]===g.id?'selected':'')+'>'+g.id+'</option>').join('')+'</select></label>').join('');all('[data-region]').forEach(select=>select.onchange=safe(()=>change(()=>{const regions={...model.binding?.primitive_guides};if(select.value)regions[select.dataset.region]=[select.value];else delete regions[select.dataset.region];model={...model,binding:{...model.binding,primitive_guides:regions}};},'已更新网格的控制枝归属')));
  q('[data-checklist]').innerHTML='<span>'+icon('check')+'原始 GLB 已保留</span><span>'+icon('check')+(model.triangles||0).toLocaleString()+' 三角面 · '+model.materials.length+' 材质</span><span>'+icon('check')+model.guides.length+' 条控制骨架 · 米制尺寸</span>'+(model.material_workflow?'<span>'+icon(rigChecked?'check':'info')+(rigChecked?'弯曲与绑定检查已通过':'保存或开始创作时自动检查绑定')+'</span>':'');
  const slots={baseColor:'颜色',normal:'法线',metallicRoughness:'金属度 / 粗糙度',occlusion:'环境遮蔽',emissive:'自发光'};q('[data-materials]').innerHTML=model.materials.filter((_,i)=>model.primitives.some(p=>p.material===i)).map(m=>'<article class="trunk-material"><strong>'+esc(m.name||'原始材质')+'</strong><small>粗糙度 '+m.roughness+' · 金属度 '+m.metalness+' · '+m.alphaMode+'</small><div>'+Object.entries(slots).filter(([key])=>m[key]).map(([key,label])=>'<button type="button" data-image="'+m[key].image+'" title="检视'+label+'原图"><img src="'+esc(model.images[m[key].image].data)+'" alt="'+label+'"><span>'+label+'</span></button>').join('')+'</div></article>').join('');all('[data-image]').forEach(b=>b.onclick=()=>inspectImage(Number(b.dataset.image),b.textContent));q('[data-save-note]').textContent=savedStamp&&savedStamp===stamp()?'当前素材已保存。安装到整树后，单元枝仍以完整模型装配。':'当前是整理草稿；保存到项目或内容库后才成为可复用素材。';auto?.render();renderRepair();renderJointPanel();paintIcons();component.render();
 }
 let pointStripKey='';
 function renderCalibration(){if(!model)return;const c=model.calibration,length=new T.Vector3(...c.base).distanceTo(new T.Vector3(...c.tip))*c.scale,dimensions=trunkDimensions(model),format=n=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3}).format(n)+' m';q('[data-length]').value=Number(length.toFixed(6));q('[data-size-feedback]').textContent='当前校准长度 '+format(length)+' · 原始比例 ×'+c.scale.toFixed(3);q('[data-size-facts]').innerHTML=[['高度 Z',format(dimensions.height)],['宽度 X',format(dimensions.width)],['厚度 Y',format(dimensions.depth)]].map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join('');q('[data-dimensions]').textContent=format(dimensions.height)+' 高 · '+format(dimensions.width)+' 宽';all('[data-coordinate]').forEach(input=>input.value=c[input.dataset.coordinate][Number(input.dataset.axis)]);}
 function repairSelection(){selection=normalizeGuideSelection(model,selection);if(!selection.some(p=>p.guide===selected?.guide&&p.index===selected?.index))selected=selection.at(-1)||null;}
 function renderPoint(){const g=model?.guides.find(g=>g.id===(selected?.guide||model.guides[0].id));if(!g)return;const index=Math.min(selected?.index||0,g.points.length-1),keys=new Set(selection.map(guidePointKey)),center=guideSelectionCenter(model,selection);q('[data-point-select]').innerHTML=g.points.map((_,i)=>'<option value="'+i+'">'+(i===0?'根点':i===g.points.length-1?'端点':'控制点 '+i)+'</option>').join('');q('[data-point-select]').value=index;q('[data-point-title]').textContent=selection.length>1?'已选 '+selection.length+' 个点':selection.length?(index===0?'根点':index===g.points.length-1?'端点':'控制点 '+index):'未选择控制点';q('[data-point-count]').textContent=selection.length>1?new Set(selection.map(p=>p.guide)).size+' 条控制枝':(index+1)+' / '+g.points.length;q('[data-edit-target]').textContent=selection.length>1?selection.length+' 点 · 选区中心':selection.length?(g.parent?'控制枝 '+g.id:'主控制枝')+' · 点 '+index:'空选区';q('[data-coordinate-title]').textContent=selection.length>1?'选区中心坐标（m）':'控制点坐标（m）';q('[data-selection-note]').textContent=selection.length?'仅编辑 '+selection.length+' 个选中点 · 不带动未选点':'点击选点，空白处拖动框选；空选区不会修改骨架';q('[data-previous-point]').disabled=busy||gesture||!selected||index===0;q('[data-next-point]').disabled=busy||gesture||!selected||index===g.points.length-1;for(const name of ['guide-move','guide-focus'])q('[data-'+name+']').disabled=busy||gesture||!selection.length;for(const name of ['guide-rotate','guide-scale'])q('[data-'+name+']').disabled=busy||gesture||selection.length<2;
 const key=g.id+':'+g.points.length;if(key!==pointStripKey){pointStripKey=key;q('[data-point-strip]').replaceChildren(...g.points.map((_,i)=>{const b=document.createElement('button');b.type='button';b.dataset.pointIndex=i;b.textContent=i===0?'根':i===g.points.length-1?'端':i;b.setAttribute('aria-label','选择控制点 '+i);b.onclick=e=>chooseGuide(g.id,i,e.ctrlKey||e.metaKey?'subtract':e.shiftKey?'add':'replace');return b;}));}all('[data-point-index]').forEach(b=>{b.disabled=busy||gesture;b.setAttribute('aria-pressed',String(keys.has(g.id+':'+b.dataset.pointIndex)));});all('[data-control-axis]').forEach(input=>{input.disabled=busy||gesture||!selection.length;input.value=Number(center.getComponent(Number(input.dataset.controlAxis)).toFixed(6));});}
 function changed(message,{keepRig=false}={}){savedStamp='';if(model?.material_workflow&&!keepRig)model={...model,material_workflow:{...model.material_workflow,rigConfirmed:false}};repairSelection();weightTools.modelChanged();view?.sync(model);if(step===2&&!weightTools.active)view?.selectControl(selected?.guide||null,selected?.index||0);render();scheduleSave();if(message)status(message);}
 function change(mutate,message,options){if(!model||editLocked())return;const before=captureEditState();try{mutate();validateTrunkReady(model);history.push(before);history=history.slice(-60);future=[];changed(message,options);}catch(error){model=restoreTrunkEdits(model,before);view?.sync(model);render();throw error;}}
 function selectPoints(items,operation='replace',primary=null){if(!model||editLocked()||attaching)return false;step=2;selection=combineGuideSelection(model,selection,items,operation);selected=primary&&selection.some(p=>guidePointKey(p)===guidePointKey(primary))?primary:selection.at(-1)||null;q('[data-pose]').value=0;q('[data-pose-label]').textContent='0°';view.restoreOriginal();view.setEditMode('guide');view.selectControl(selected?.guide||null,selected?.index||0);render();scheduleSave();return true;}
 function chooseGuide(id,index=0,operation='replace',preserve=false){const point={guide:id,index};if(preserve&&operation==='replace'&&selection.some(p=>guidePointKey(p)===guidePointKey(point)))operation='add';if(!selectPoints([point],operation,point))return false;return selection.some(p=>guidePointKey(p)===guidePointKey(point));}
 function setSelectionMode(mode){if(editLocked()||attaching)return;selectionMode=mode==='box'?'box':'auto';view?.sync(model);render();}
 function setStep(next){if(!model||gesture||busy||repair)return;weightTools.leave();if(next!==2){deleteReview=null;attaching=null;}step=next;view.setEditMode(editModeForStep(step));if(step!==3){q('[data-pose]').value=0;q('[data-pose-label]').textContent='0°';view.restoreOriginal();}if(step===2){if(!selection.length&&selected)selection=[selected];view.setDisplay('result');view.selectControl(selected?.guide||null,selected?.index||0);}else{view.selectControl(null);if(step===3)view.setDisplay('result');}render();scheduleSave();}
 function beginPoint(key){if(gesture||busy||repair)return null;const before=captureEditState();gesture=true;return {valid:()=>!!model&&dialog.open,update:point=>{try{const next={...model.calibration,[key]:[...point]};model=recalibrateTrunk(model,next);view.sync(model);return true;}catch(error){status(error.message,true);return false;}},commit:()=>{gesture=false;history.push(before);future=[];changed('已调整'+(key==='base'?'底点':'朝向点'));},cancel:()=>{gesture=false;model=restoreTrunkEdits(model,before);view.sync(model);render();}};}
 function beginGuideTransform(mode){if(!model||editLocked()||attaching||!selection.length)return null;if(mode!=='translate'&&selection.length<2){status('旋转或缩放请先框选至少两个控制点。');return null;}const before=captureEditState(),base=restoreTrunkEdits(model,before),points=selection.map(p=>({...p})),center=guideSelectionCenter(base,points);let error='';gesture=true;render();
 const cancel=()=>{gesture=false;model=restoreTrunkEdits(model,before);view.sync(model);render();status('已取消控制点选区调整。');};return {center,uniform:true,label:({translate:'G 移动',rotate:'R 旋转',scale:'S 缩放'})[mode]+' · '+points.length+' 个控制点',get error(){return error;},update(delta){try{model=transformGuideSelection(base,points,delta,center);validateTrunkGuides(model.guides);error='';}catch(e){error=e.message;}view.updateGuideModel(model);renderPoint();status(error||'正在编辑 '+points.length+' 个控制点；未选点保持原位。',!!error);},commit(){if(error)return cancel();gesture=false;if(JSON.stringify(before)!==JSON.stringify(trunkEditable(model))){history.push(before);history=history.slice(-60);future=[];changed('已更新 '+points.length+' 个选中点，可一步撤销。');}else render();},cancel};}
 function beginGuide(id,index){const origin=new T.Vector3(...model.guides.find(g=>g.id===id).points[index]),current=beginGuideTransform('translate');if(!current)return null;return {...current,update:point=>current.update({translation:new T.Vector3(...point).sub(origin)})};}
 function beginCalibration(mode){if(!model||gesture||busy||repair)return null;const before=captureEditState(),base=restoreTrunkEdits(model,before),initial=JSON.stringify(before);let error='';gesture=true;step=1;render();
  const cancel=()=>{gesture=false;model=restoreTrunkEdits(model,before);view.sync(model);render();status('已取消模型校准，原尺寸与朝向已恢复。');};
  return {get error(){return error;},update(delta){try{const next=transformTrunkCalibration(base,delta);validateTrunkReady(next);model=next;error='';view.sync(model);renderCalibration();status(({translate:'正在移动网格对齐竖直控制骨架，骨架保持固定',rotate:'正在调整模型的校准朝向',scale:'正在等比调整模型真实尺寸'})[mode]+' · Enter 确认 / Esc 取消');}catch(e){error=e.message;status(error,true);}},commit(){if(error)return cancel();gesture=false;if(stamp()!==initial){history.push(before);history=history.slice(-60);future=[];changed('模型校准已应用，可一步撤销；原始 GLB 保留。');}else render();},cancel};
 }
 async function ensureView(){if(view)return;view=createTrunkPreparationView(q('[data-host]'),{native:api.native,weight:weightTools.view,rigTest:jointApi,point:(key,point)=>safe(()=>change(()=>{model=recalibrateTrunk(model,{...model.calibration,[key]:point});},'已设置'+(key==='base'?'底点':'朝向点')))(),beginPoint,beginGuide,beginGuideTransform,beginCalibration,select:chooseGuide,selectMany:selectPoints,selectTargets,pickAttachment:safe(pickAttachment),getTargetState:targetState,deleteSelection:safe(deleteSelection),escapeGuide:cancelRepairAction,setSelectionMode,getGuideSelection:()=>selection,getSelectionMode:()=>selectionMode,selectionAll:()=>{const g=model.guides.find(g=>g.id===(selected?.guide||model.guides[0].id));if(targetMode==='point')selectPoints(g.points.map((_,index)=>({guide:g.id,index})));else if(targetMode==='segment')selectTargets(g.points.slice(1).map((_,index)=>({guide:g.id,index})));else selectTargets(model.guides.map(g=>({guide:g.id,index:0})));},selectionClear:()=>targetMode==='point'?selectPoints([]):selectTargets([]),error:message=>status(message,true)});}
 function scheduleSave(){if(repair)return;clearTimeout(timer);q('[data-autosave]').textContent='草稿待保存…';timer=setTimeout(()=>flush().catch(error=>{saveError=error;q('[data-autosave]').textContent='草稿未保存';status(error.message,true);}),650);}
 function flush({applyRepair=false}={}){clearTimeout(timer);timer=0;saveChain=saveChain.catch(()=>{}).then(async()=>{if(!draft||!model)return;const id=draft.id,base=applyRepair?null:repair,ui=base&&selectionHistory.get(base.before),payload={...draft,edits:base?.before||trunkEditable(model),step:base?.step||step,selected:ui?ui.selected:selected,selection:(ui?ui.selection:selection).map(p=>({...p}))};q('[data-autosave]').textContent='正在保存草稿…';const saved=await store.put(payload);if(draft?.id===id){draft={...draft,revision:saved.revision,updatedAt:saved.updatedAt};saveError=null;q('[data-autosave]').textContent='草稿已保存';}});return saveChain;}
 async function material(stage='material',rebuild=false){
  if(component.active&&!rebuild){await component.command('stage',stage);return;}
  if(model?.source.udimTiles?.length>1&&normalizeTrunkRoute(q('[data-material-policy]').value)==='material')
   throw Error('多瓦片在各自材质中共用 0–1 UV。要保留原贴图，请选择直接绑定骨骼。要制作新材质，请切换高模完整处理并重新展开 UV。');
  if(busy||gesture||repair||!model)throw Error('请先完成当前树干调整');if(normalizeTrunkRoute(q('[data-material-policy]').value)==='rig')throw Error('当前选择直接绑定骨骼；要制作新材质，请先切换处理方式。');validateTrunkReady(model);view.restoreOriginal();await flush();
  await api.material(model,{sessionId:draft.id,materialSession:draft.materialSession,target:Number(q('[data-material-target]').value),resolution:Number(q('[data-material-resolution]').value),stage,rebuild,preparation:normalizeTrunkRoute(q('[data-material-policy]').value)==='material'?'material':'full'});
 }
 async function acceptMaterial(next,{sessionId}={}){
  if(busy||gesture||repair||!draft||draft.id!==sessionId||next.id!==model?.id)throw Error('树干草稿已改变，材质检查点未写入');
  await flush();const previous={model,draft,step,history,future,selected,selection};busy=true;render();
  try{
   const edits=trunkEditable(model);if(edits.material_workflow)delete edits.material_workflow.previous;
   next.material_workflow.previous={sourceId:draft.sourceId,sourceRevision:draft.sourceRevision,edits};
   const record={...next,id:'TRUNK_MAT_'+next.source.sha256.slice(0,32)+next.material_editable.sha256.slice(0,16)},source=await store.source(record);
   await view.setModel(next);model=next;draft={...draft,sourceId:source.id,sourceRevision:source.revision,materialResult:{sourceId:source.id,sourceRevision:source.revision,edits:trunkEditable(next)}};step=2;history=[];future=[];selected=null;selection=[];clearRepairTools();auto.reset();view.setEditMode('guide');view.setDisplay('result');await flush();await drafts();
  }catch(error){({model,draft,step,history,future,selected,selection}=previous);await view.setModel(model);throw error;}finally{busy=false;render();}
  if(model.material_workflow.needsSkeleton){auto.open();auto.start();}else status('材质GLB已更新；几何一致，原控制骨架与绑定保留。');
 }
 async function restoreMaterialVersion(){
  if(busy||gesture||repair)return;auto.reset();await flush();const target=model?.material_workflow?.previous||draft?.materialResult;if(!target)return;
  const previous={model,draft,step};busy=true;render();try{const source=await store.readSource(target.sourceId,target.sourceRevision),next=restoreTrunkEdits(source,target.edits);await view.setModel(next);if(model.material_workflow?.previous)draft={...draft,materialResult:{sourceId:draft.sourceId,sourceRevision:draft.sourceRevision,edits:trunkEditable(model)}};model=next;draft={...draft,sourceId:target.sourceId,sourceRevision:target.sourceRevision};step=model.material_workflow?2:1;selected=null;selection=[];history=[];future=[];clearRepairTools();view.setEditMode(step===2?'guide':'model');await flush();status('已恢复工作版本；另一版本仍然保留。');}catch(error){({model,draft,step}=previous);await view.setModel(model);throw error;}finally{busy=false;render();}
 }
 async function drafts(){const items=await store.list();q('[data-drafts]').innerHTML='<option value="">选择已有草稿</option>'+items.map(d=>'<option value="'+d.id+'">'+esc(d.name)+' · '+new Date(d.updatedAt).toLocaleDateString('zh-CN')+'</option>').join('');q('[data-resume]').disabled=!items.length;}
 async function importFile(file,{route=q('[data-material-policy]').value,tiles=[]}={}){
  if(!file)return;
  if(busy||repair)throw Error('请先确认或保留候选骨架');
  if(!/\.glb$/i.test(file.name))throw Error('请选择 GLB 文件');
  const ticket=++importSequence,previous=model;
  busy=true;render();
  try{
   if(model)await flush();
   status(tiles.length?'正在按瓦片匹配并内嵌 UDIM 贴图…':'正在读取树干 GLB，解析网格与原始材质…');
   worker?.terminate();
   worker=new Worker(new URL('./trunk-preparation-worker.js',import.meta.url),{type:'module'});
   render();
   const bytes=await file.arrayBuffer();
   if(ticket!==importSequence)return;
   const parsed=await new Promise((resolve,reject)=>{
    rejectImport=reject;
    worker.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.model);
    worker.onerror=e=>reject(Error(e.message||'树干模型解析失败'));
    worker.postMessage({bytes,name:file.name,tiles},[bytes]);
   });
   if(ticket!==importSequence)return;
   rejectImport=null;worker.terminate();worker=null;render();
   validateTrunkReady(parsed);
   const tileCount=parsed.source.udimTiles?.length||0;
   const needsRig=tileCount>1&&normalizeTrunkRoute(route)==='material';
   if(needsRig)route='rig';
   status(tileCount?'正在保存内嵌瓦片贴图的工作副本…':'正在保留原始 GLB 和草稿来源…');
   const source=await store.source(parsed);
   await ensureView();
   try{await view.setModel(parsed);}catch(error){if(previous)await view.setModel(previous);throw error;}
   model=parsed;
   draft={version:1,id:crypto.randomUUID(),sourceId:source.id,sourceRevision:source.revision,revision:0,preparationRoute:normalizeTrunkRoute(route)};
   selectRoute(route);picker.open=false;history=[];future=[];selected=null;selection=[];clearRepairTools();step=1;savedStamp='';
   view.setEditMode('model');view.setDisplay('result');
   await flush();await drafts();
   const detail=tileCount?'已内嵌 '+tileCount+' 个 UDIM 瓦片。':'';
   const hint=needsRig?'已切换为直接绑定骨骼以保留贴图。要制作新材质，可更改为高模完整处理。':'核对方向与尺寸后，点击右侧主按钮继续。';
   status(detail+'已选择：'+trunkRoutePlan(route).title+'。'+hint);
  }finally{worker?.terminate();worker=null;rejectImport=null;busy=false;render();}
 }
 async function open({model:existing=null,...options}={}){if(dialog.open)return;context=options;opener=document.activeElement;busy=true;dialog.showModal();syncResourceOverlay();render();try{if(existing||model)await ensureView();if(existing){if(draft)await flush();model={...existing,...trunkEditable(existing)};validateTrunkReady(model);const source=await store.source(model);draft={version:1,id:crypto.randomUUID(),sourceId:source.id,sourceRevision:source.revision,revision:0};history=[];future=[];selected=null;selection=[];clearRepairTools();step=1;await view.setModel(model);await flush();}else if(model)await view.setModel(model);if(model){view.setEditMode(editModeForStep(step));if(step===2&&selected)view.selectControl(selected.guide,selected.index);}await drafts();render();q('[data-import]').focus({preventScroll:true});}finally{busy=false;render();}}
 async function close({resume=true,finishing=false}={}){if(component.active)await component.command('leave');if(busy&&!finishing){status('当前操作尚未完成，请稍候。');return;}if(gesture){status('请先松开当前手柄。');return;}if(repair){if(model.guides!==repair.initialGuides||model.binding!==repair.initialBinding){status('请先确认绑定，或放弃本次修整后退出。');return;}discardRepair();}await flush();weightTools.leave();deleteReview=null;deletePopup.hidden=true;lastPointer=null;view?.dispose();view=null;dialog.close();syncResourceOverlay();if(resume)await context.onReturn?.();opener?.isConnected&&opener.focus({preventScroll:true});}
 async function ensureRig({automatic=false}={}){
  if(busy)throw Error('当前操作尚未完成，请稍候。');
  if(!rigAllowed())throw Error('请先完成材质保存，或选择直接绑定骨骼');
  if(repair)throw Error('请先应用候选骨架，或选择保留原骨架。');
  if(gesture)throw Error('请先确认或取消当前点位调整。');
  weightTools.leave();
  const source=model,session=draft;busy=true;render();status('正在检查弯曲与绑定…');
  try{
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const checked=await checkTrunkRig(source,{automatic,current:()=>draft===session?model:null,check:()=>{
    const display=view.mode;view.setDisplay('result');
    try{view.showPose(8);}finally{view.restoreOriginal();if(display!=='result')view.setDisplay(display);q('[data-pose]').value=0;q('[data-pose-label]').textContent='0°';}
   }});
   if(checked!==model){model=checked;savedStamp='';view.sync(model);await flush();}
   status('弯曲与绑定检查通过，可以直接开始创作或保存。');
  }finally{busy=false;render();}
 }
 function clearRepairTools(){
  weightTools.leave();
  targetMode='point';targets=[];attaching=null;deleteReview=null;selectionMode='auto';
 }
 function startRepair(result=null){
  if(!model||repair||editLocked()||!rigAllowed())return;
  const original=model,before=captureEditState();
  const binding={...original.binding};delete binding.weight_repairs;
  const next=result?{...original,guides:result.guides,binding:{...binding,primitive_guides:{},auto_skeleton:{version:1,...result.summary}}}:original;
  validateTrunkReady(next);
  repair={original,before,history,future,savedStamp,step,automatic:!!result,warnings:result?.warnings.join(' ')||'',comparing:false,testing:false,initialGuides:next.guides,initialBinding:next.binding};
  q('[data-repair-baseline]').value='candidate';
  model=next;
  history=[];future=[];selection=[];selected=null;clearRepairTools();step=2;
  view.restoreOriginal();view.setEditMode('guide');view.setDisplay('result');view.sync(model);view.selectControl(null);
  render();
  status(result?(original.binding?.weight_repairs?'新候选已重新计算权重。放弃候选可返回原骨架及其权重修复。':'候选已生成，可以直接选点、选段或选枝修整。'):'已打开骨架修整，可对照原骨架并试弯曲。');
 }
 function discardRepair(){
  if(!repair||busy||gesture)return;
  if(repair.testing)setRepairTesting(false);
  const old=repair,ui=selectionHistory.get(old.before);
  view.restoreOriginal();view.showCandidateGuides(null);
  model=old.original;history=old.history;future=old.future;savedStamp=old.savedStamp;step=old.step;
  selection=ui.selection;selected=ui.selected;repair=null;clearRepairTools();
  view.sync(model);view.setEditMode(step===2?'guide':step===1?'model':'inspect');
  view.selectControl(step===2?selected?.guide:null,selected?.index);
  render();status('已放弃本次修整，沿用修整前的骨架和绑定。');
 }
 function setRepairTesting(on){
  if(!repair||busy||gesture||repair.comparing)return;
  repair.testing=on;
  view.setEditMode(on?'inspect':'guide');
  if(on){
   repair.representation=q('[data-representation]').value;
   view.setRepresentation('overlay');
   try{
    const angle=Number(q('[data-repair-angle]').value);
    view.showPose(angle);
    q('[data-repair-angle-label]').textContent=angle+'°';
   }catch(error){setRepairTesting(false);throw error;}
  }else{
   view.restoreOriginal();
   view.setRepresentation(repair.representation);
   view.selectControl(selected?.guide||null,selected?.index||0);
  }
  render();
 }
 async function commitRepair(){
  if(!repair||busy||gesture||repair.comparing||deleteReview||attaching)return;
  weightTools.leave();
  if(repair.testing)setRepairTesting(false);
  const session=repair,working=model,metadata=working.binding?.auto_skeleton;
  const candidate=metadata?{...working,binding:{...working.binding,auto_skeleton:{...metadata,
   control_branches:working.guides.length,control_points:working.guides.reduce((n,g)=>n+g.points.length,0)}}}:working;
  const source=candidate.material_workflow?{...candidate,material_workflow:{...candidate.material_workflow,rigConfirmed:false}}:candidate;
  busy=true;render();status('正在检查修整后的骨架与绑定…');
  try{
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   view.sync(source);
   const checked=await checkTrunkRig(source,{automatic:session.automatic,check:()=>{
    try{view.showPose(8);}finally{view.restoreOriginal();}
   }});
   model=checked;
   await flush({applyRepair:true});
   history=[...session.history,session.before].slice(-60);future=[];
   repair=null;savedStamp='';clearRepairTools();
   view.sync(model);
   status('修整已确认，弯曲与绑定检查通过。可一步撤销本次修整。');
  }catch(error){
   model=working;view.sync(model);
   throw error;
  }finally{busy=false;render();}
 }
 function setTargetMode(mode){
  if(editLocked()||attaching||mode===targetMode)return;
  targetMode=mode;targets=[];
  selectPoints([]);
 }
 function selectTargets(items,operation='replace'){
  if(editLocked()||attaching||targetMode==='point')return;
  targets=combineGuideSelection(model,targets,items,operation);
  selectPoints(guideEditPoints(model,targetMode,targets), 'replace',targets.at(-1));
 }
 function applySubdivide(items,count){
  change(()=>{
   const result=subdivideTrunkSegments(model,items,count);
   model=result.model;targetMode='point';targets=[];selection=result.points;selected=selection.at(-1);
  },'已细分骨架段。新控制点已选中，可按 G 移动。');
 }
 function removePoints(items,event){
  if(editLocked())return;
  const {points,branches,protectedCount}=planTrunkPointDeletion(model,items);
  if(branches.length){
   reviewDeletion(branches,{points,shortBranch:true,protectedCount,event});
   return;
  }
  if(!points.length){
   status(protectedCount?'已选中受保护的底点、挂接根点或主枝最后两点。删除子枝请切换「枝」模式。':'请先选择控制点或末端骨架段。',true);
   return;
  }
  change(()=>{
   model=dissolveTrunkPoints(model,points);
   selection=[];selected=null;targets=[];
  },'已删除 '+points.length+' 个控制点。'+(protectedCount?'已保留 '+protectedCount+' 个受保护点。':'')+'可撤销。');
 }
 function positionDeletePopup(){
  if(!deleteReview||deletePopup.hidden||!dialog.open)return;
  const {x,y}=deleteReview.anchor,bounds=dialog.getBoundingClientRect();
  const place=(at,size,min,max)=>{
   const gap=10,preferred=at+gap+size<=max-gap?at+gap:at-gap-size;
   return Math.max(min+gap,Math.min(preferred,max-gap-size))+'px';
  };
  deletePopup.style.left=place(x,deletePopup.offsetWidth,bounds.left,bounds.right);
  deletePopup.style.top=place(y,deletePopup.offsetHeight,bounds.top,bounds.bottom);
 }
 function restoreDeleteFocus(opener){
  const target=opener?.isConnected&&!opener.disabled&&opener.getClientRects().length?opener:q('[data-host] canvas');
  target?.focus({preventScroll:true});
 }
 function reviewDeletion(ids,{points=[],shortBranch=false,protectedCount=0,event}={}){
  if(editLocked())return;
  const includesMain=ids.includes(model.guides[0].id);
  ids=ids.filter(id=>id!==model.guides[0].id);
  if(!ids.length){
   status(includesMain?'主控制枝受保护。可切换「点」或「段」修剪末端。':'请先选中要删除的控制枝。',true);
   return;
  }
  const affected=trunkBranchFamily(model.guides,ids),hasChildren=affected.size>ids.length;
  const trigger=document.activeElement;
  const fallback=(trigger===q('[data-host] canvas')?q('[data-host] [data-guide-point].primary:not([hidden])')||trigger:trigger||q('[data-host]')).getBoundingClientRect();
  const anchor=event?.type==='click'&&event.detail>0?{x:event.clientX,y:event.clientY}:lastPointer||{x:fallback.left+fallback.width/2,y:fallback.top+fallback.height/2};
  deleteReview={ids,affected,points,anchor,trigger};
  q('[data-delete-count]').textContent=(shortBranch?'剩余点数不足，需整枝移除。':'')+'将删除 '+ids.length+' 条控制枝'+(hasChildren?'，另有 '+(affected.size-ids.length)+' 条下级枝':'')+'。'
   +(points.length?'同时删除 '+points.length+' 个选中点。':'')+(includesMain?'保留主控制枝。':'')+(protectedCount?'保留 '+protectedCount+' 个受保护点。':'');
  const parent=q('[data-delete-parent]');
  parent.replaceChildren(new Option('选择新的挂接父枝',''),...model.guides.filter(g=>!affected.has(g.id)).map(g=>new Option(g.parent?'控制枝 '+g.id:'主控制枝',g.id)));
  q('[data-delete-parent-row]').hidden=q('[data-delete-keep]').hidden=!hasChildren;
  q('[data-delete-keep]').disabled=true;
  q('[data-delete-family]').textContent=hasChildren?'连同下级枝删除':'确认删除';
  render();view.sync(model);
  positionDeletePopup();q('[data-delete-cancel]').focus({preventScroll:true});
 }
 function finishDeletion(keepChildren){
  if(!deleteReview||busy||gesture)return;
  const {ids,points,trigger}=deleteReview,parentId=q('[data-delete-parent]').value;
  const kept=removeTrunkBranches(model,ids,{keepChildren,parentId}),remaining=new Set(kept.guides.map(g=>g.id));
  const retainedPoints=points.filter(p=>remaining.has(p.guide));
  const next=retainedPoints.length?dissolveTrunkPoints(kept,retainedPoints):kept;
  deleteReview=null;
  change(()=>{model=next;selection=[];selected=null;targets=[];},'已删除所选控制枝，可撤销。');
  restoreDeleteFocus(trigger);
 }
 function pickAttachment(segment){
  if(!attaching||editLocked())return;
  const next=reattachTrunkBranch(model,attaching,segment);
  attaching=null;
  change(()=>{model=next;},'已更新子枝的挂接位置，可撤销。');
 }
 function deleteSelection(event){
  if(editLocked()||attaching)return;
  if(targetMode==='branch')reviewDeletion(targets.map(p=>p.guide),{event});
  else if(targetMode==='segment'){
   const points=segmentDeletionPoints(model,targets);
   if(points.length)removePoints(points,event);
   else status(targets.length?'这段位于枝干中间。可多选相邻段溶解中间点，或切换「点」模式。':'请先选择骨架段。',true);
  }else if(selection.length)removePoints(selection,event);
  else status('请先选中节点。',true);
 }
 function cancelDeletion(restoreFocus=true){
  if(!deleteReview)return false;
  const {trigger}=deleteReview;deleteReview=null;render();view.sync(model);
  if(restoreFocus)restoreDeleteFocus(trigger);
  return true;
 }
 function cancelRepairAction(){
  if(busy||gesture)return false;
  if(cancelDeletion())return true;
  if(weightTools.leave()){render();return true;}
  if(attaching){attaching=null;render();view.sync(model);return true;}
  if(repair?.testing){setRepairTesting(false);return true;}
  if(repair?.comparing){q('[data-repair-compare]').click();return true;}
  return false;
 }
 repairEntry.onclick=safe(()=>startRepair());
 all('[data-guide-target]').forEach(b=>b.onclick=()=>setTargetMode(b.dataset.guideTarget));
 q('[data-guide-through]').onchange=()=>{through=q('[data-guide-through]').checked;view.sync(model);};
 q('[data-subdivide]').onclick=safe(()=>applySubdivide(targets,Number(q('[data-subdivide-count]').value)));
 q('[data-dissolve]').onclick=safe(event=>removePoints(interiorSegmentPoints(model,targets),event));
 q('[data-delete-branches]').onclick=safe(deleteSelection);
 q('[data-delete-parent]').onchange=()=>{q('[data-delete-keep]').disabled=!q('[data-delete-parent]').value;};
 q('[data-delete-cancel]').onclick=()=>cancelDeletion();
 q('[data-delete-keep]').onclick=safe(()=>finishDeletion(true));
 q('[data-delete-family]').onclick=safe(()=>finishDeletion(false));
 const trackPointer=event=>{lastPointer={x:event.clientX,y:event.clientY};};
 dialog.addEventListener('pointermove',trackPointer,true);
 dialog.addEventListener('pointerleave',()=>{lastPointer=null;});
 dialog.addEventListener('pointerdown',event=>{
  trackPointer(event);
  if(!deletePopup.contains(event.target))cancelDeletion(false);
 },true);
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&cancelDeletion()){
   event.preventDefault();event.stopImmediatePropagation();
  }
 },true);
 window.addEventListener('resize',positionDeletePopup);
 q('[data-reattach]').onclick=()=>{
  if(attaching){cancelRepairAction();return;}
  attaching=targets[0].guide;render();view.sync(model);
  status('点击新的父枝骨架段，设置挂接位置。');
 };
 q('[data-auto-discard]').onclick=discardRepair;
 q('[data-auto-apply]').onclick=safe(commitRepair);
 q('[data-repair-test]').onclick=safe(()=>setRepairTesting(!repair.testing));
 q('[data-repair-angle]').oninput=safe(()=>{
  if(!repair?.testing)return;
  const angle=Number(q('[data-repair-angle]').value);
  if(angle)view.showPose(angle);else view.restoreOriginal();
  q('[data-repair-angle-label]').textContent=angle+'°';
 });
 q('[data-repair-compare]').onclick=safe(()=>{
  if(repair.testing)setRepairTesting(false);
  repair.comparing=!repair.comparing;
  view.showCandidateGuides(repair.comparing?repairBaseline():null);
  render();
 });
 function repairBaseline(){return q('[data-repair-baseline]').value==='original'?repair.original.guides:repair.initialGuides;}
 q('[data-repair-baseline]').onchange=()=>{if(repair?.comparing)view.showCandidateGuides(repairBaseline());};
 async function save(kind){if(!model||busy)return;await ensureRig();if(savedStamp===stamp()){status('内容未变，沿用已保存素材。');return;}busy=true;render();try{view.restoreOriginal();model.thumbnail=view.thumbnail();await flush();if(kind==='library'){const existing=(await library.list()).find(r=>r.id===model.id),item=await library.put(model,{expectedRevision:existing?.revision||0,thumbnail:model.thumbnail});model={...model,revision:item.revision};await flush();status('已收入本机内容库 · V'+item.revision+'；原版本保留。');}else{await api.saveProject({...model});status('树干素材已保存到当前项目。保存工程文件后会随工程一起保留。');}savedStamp=stamp();}finally{busy=false;render();}}
 function inspectImage(index,title){const image=document.createElement('dialog');image.className='trunk-image-dialog';image.innerHTML='<header><strong>'+esc(title)+' · 原始贴图</strong><button aria-label="关闭贴图检视">'+icon('x')+'</button></header><div><img src="'+esc(model.images[index].data)+'" alt="'+esc(title)+'"></div>';document.body.append(image);image.querySelector('button').onclick=()=>image.close();image.addEventListener('close',()=>image.remove(),{once:true});trapResourceDialogFocus(image);image.showModal();paintIcons();}
 q('[data-replace-sculpt]').onclick=safe(async()=>{await flush();if(await api.replace(model))await close({resume:false});});q('[data-confirm-sculpt-review]').onclick=safe(()=>change(()=>{model={...model,physical_size_confirmed:true,sculpt:{...model.sculpt,needs_review:false}};},'已确认雕刻后的骨架与尺寸'));q('[data-sculpt]').onclick=safe(async()=>{if(!model||busy||gesture||repair)throw Error('请先结束当前调整');await api.sculpt(model,context);});q('[data-cancel-import]').onclick=()=>{if(!worker)return;importSequence++;worker.terminate();worker=null;status('已取消读取，原有树干和草稿保留。');rejectImport?.(new DOMException('已取消读取','AbortError'));render();};q('[data-import]').onclick=q('[data-empty-import]').onclick=chooseImport;q('[data-file]').onchange=safe(async()=>{const file=q('[data-file]').files[0];q('[data-file]').value='';const route=pendingImportRoute||q('[data-material-policy]').value;pendingImportRoute=null;await importFile(file,{route});});q('[data-close]').onclick=safe(close);dialog.addEventListener('cancel',event=>{event.preventDefault();safe(close)();});q('[data-name]').onchange=safe(()=>change(()=>{model={...model,name:q('[data-name]').value.trim()};},'名称已更新',{keepRig:true}));q('[data-length]').onchange=safe(()=>change(()=>{model=resizeTrunk(model,Number(q('[data-length]').value));},'真实尺寸已更新'));all('[data-coordinate]').forEach(input=>input.onchange=safe(()=>change(()=>{const key=input.dataset.coordinate,value=[...model.calibration[key]];value[Number(input.dataset.axis)]=Number(input.value);model=recalibrateTrunk(model,{...model.calibration,[key]:value});},'校准已更新')));
 all('[data-model-tool]').forEach(button=>button.onclick=()=>{view.chooseTransform(button.dataset.modelTool);render();status('模型校准：G 只移动网格，竖直骨架固定；R 旋转、S 校准尺寸。');});all('[data-point-mode]').forEach(b=>b.onclick=()=>setSelectionMode(b.dataset.pointMode));q('[data-guide-all]').onclick=()=>{const g=model.guides.find(g=>g.id===(selected?.guide||model.guides[0].id));selectPoints(g.points.map((_,index)=>({guide:g.id,index})));};q('[data-guide-clear]').onclick=()=>selectPoints([]);for(const [name,mode]of [['guide-rotate','rotate'],['guide-scale','scale']])q('[data-'+name+']').onclick=()=>{q('[data-host] canvas').focus({preventScroll:true});view.beginGuideMove(mode);};q('[data-guide-move]').onclick=()=>{q('[data-host] canvas').focus({preventScroll:true});view.beginGuideMove();};q('[data-axis-view]').onchange=()=>{if(q('[data-axis-view]').value)view.fit(q('[data-axis-view]').value,false);};q('[data-guide-focus]').onclick=()=>view.focusControl();q('[data-previous-point]').onclick=()=>chooseGuide(selected.guide,Math.max(0,selected.index-1));q('[data-next-point]').onclick=()=>{const g=model.guides.find(g=>g.id===selected.guide);chooseGuide(g.id,Math.min(g.points.length-1,selected.index+1));};q('[data-human-reference]').onchange=()=>view.setReference(q('[data-human-reference]').checked);
 all('[data-point]').forEach(button=>button.onclick=()=>{view.choosePoint(button.dataset.point);render();status('在原始网格上点击'+(button.dataset.point==='base'?'底点':'朝向点')+'；也可直接拖动两个点。');});all('[data-display]').forEach(button=>button.onclick=()=>{view.setDisplay(button.dataset.display);render();});all('[data-step]').forEach(button=>button.onclick=()=>setStep(Number(button.dataset.step)));q('[data-overview]').onclick=()=>{if(gesture||busy)return;selected=null;setStep(1);view?.fit();};q('[data-representation]').onchange=()=>view?.setRepresentation(q('[data-representation]').value);q('[data-fit]').onclick=()=>view?.fit();q('[data-front]').onclick=()=>view?.fit('front');q('[data-next]').onclick=()=>setStep(step+1);
 q('[data-face-camera]').onclick=safe(()=>change(()=>{const direction=view.camera.getWorldDirection(new T.Vector3()).negate();if(view.mode==='result')direction.transformDirection(trunkCalibrationMatrix(model.calibration).invert());model=recalibrateTrunk(model,{...model.calibration,front:direction.toArray()});},'正面方向已按当前观察方向设置'));
 q('[data-guide-select]').onchange=()=>chooseGuide(q('[data-guide-select]').value,0);q('[data-point-select]').onchange=()=>chooseGuide(selected?.guide||model.guides[0].id,Number(q('[data-point-select]').value));all('[data-control-axis]').forEach(input=>input.onchange=safe(()=>change(()=>{const center=guideSelectionCenter(model,selection),delta=new T.Vector3().setComponent(Number(input.dataset.controlAxis),Number(input.value)-center.getComponent(Number(input.dataset.controlAxis)));model=transformGuideSelection(model,selection,{translation:delta});},'控制点已更新')));
 const addGuide=safe(()=>change(()=>{model=addTrunkGuide(model,{parent:selected?.guide||model.guides[0].id});step=2;selected={guide:model.guides.at(-1).id,index:1};selection=[selected];view.sync(model);view.selectControl(selected.guide,selected.index);},'子控制枝已添加，请放到对应木干内部'));q('[data-add-guide]').onclick=q('[data-add-child]').onclick=addGuide;q('[data-remove-guide]').onclick=safe(event=>reviewDeletion(selected?[selected.guide]:[],{event}));
 q('[data-insert-point]').onclick=safe(()=>{
  const g=model.guides.find(g=>g.id===(selected?.guide||model.guides[0].id)),index=Math.min(selected?.index||0,g.points.length-2);
  applySubdivide([{guide:g.id,index}],1);
 });
 q('[data-remove-point]').onclick=safe(event=>removePoints(selection,event));
 q('[data-pose]').oninput=safe(()=>{const value=Number(q('[data-pose]').value);if(value)view.showPose(value);else view.restoreOriginal();});
 q('[data-reset-pose]').onclick=()=>view.restoreOriginal();
 q('[data-joint-guide]').onchange=event=>view.rigTest.select(event.target.value?{guide:event.target.value,index:0}:null);
 q('[data-joint-segment]').onchange=event=>view.rigTest.select({guide:view.rigTest.joint.guide,index:Number(event.target.value)});
 q('[data-joint-axis]').onchange=renderJointPanel;
 q('[data-joint-angle]').oninput=event=>view.rigTest.setAngle(q('[data-joint-axis]').value,Number(event.target.value));
 q('[data-joint-weights]').onclick=()=>{
  const joint=view.rigTest.joint;
  setStep(2);
  if(joint)chooseGuide(joint.guide,joint.index);
  q('[data-weight-open]').click();
 };
 function undo(redo=false){if(!model||editLocked()||attaching)return;const from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(captureEditState());const entry=from.pop(),ui=selectionHistory.get(entry);model=restoreTrunkEdits(model,entry);if(ui){selection=ui.selection.map(p=>({...p}));selected=ui.selected&&{...ui.selected};targetMode=ui.targetMode;targets=ui.targets;}if(selected){const g=model.guides.find(g=>g.id===selected.guide)||model.guides[0];selected={guide:g.id,index:Math.min(selected.index,g.points.length-1)};}view.sync(model);view.restoreOriginal();changed(redo?'已重做':'已撤销',{keepRig:true});}q('[data-undo]').onclick=()=>undo();q('[data-redo]').onclick=()=>undo(true);
 q('[data-resume]').onclick=safe(async()=>{const id=q('[data-drafts]').value;if(!id||busy||repair)return;auto?.reset();busy=true;render();try{if(model)await flush();const restored=await store.get(id);draft=restored.draft;selectRoute(draft.preparationRoute||(draft.step>=2&&!draft.edits?.material_workflow?'rig':'full'));model=restoreTrunkEdits(restored.model,draft.edits);step=draft.step||1;selected=draft.selected||null;selection=normalizeGuideSelection(model,draft.selection||selected&&[selected]||[]);repairSelection();history=[];future=[];clearRepairTools();await ensureView();picker.open=false;await view.setModel(model);view.setEditMode(editModeForStep(step));if(step===2&&selected)view.selectControl(selected.guide,selected.index);render();status('整理草稿已恢复，原始网格和校准均已保留。');}finally{busy=false;render();}});q('[data-project]').onclick=safe(()=>save('project'));q('[data-library]').onclick=safe(()=>save('library'));q('[data-use]').onclick=safe(async()=>{await ensureRig();busy=true;render();try{view.restoreOriginal();model.thumbnail=view.thumbnail();await flush();const value={...model};await close({resume:false,finishing:true});await api.use(value);}finally{busy=false;render();}});
 for(const type of ['keydown','keyup'])dialog.addEventListener(type,event=>{if(event.target.closest('dialog')!==dialog)return;if(type==='keydown'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();safe(()=>save('project'))();}else if(type==='keydown'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.target.matches('input,textarea')){event.preventDefault();undo(event.shiftKey);}event.stopPropagation();});
 q('[data-material]').onclick=safe(()=>material());
 q('[data-material-policy]').onchange=()=>{picker.route=normalizeTrunkRoute(q('[data-material-policy]').value);if(draft){draft={...draft,preparationRoute:normalizeTrunkRoute(q('[data-material-policy]').value)};scheduleSave();}render();};
 q('[data-next]').onclick=safe(async()=>{if(step!==1){setStep(3);return;}if(normalizeTrunkRoute(q('[data-material-policy]').value)==='rig'){setStep(2);auto.open();auto.start();}else await material();});
 all('[data-flow]').forEach(button=>button.onclick=safe(async()=>{const stage=button.dataset.flow;if(component.active){await component.command(stage==='rig'?'next':'stage',stage);return;}if(stage==='model')setStep(1);else if(stage==='rig')setStep(2);else await material(stage); }));
 q('[data-rig-inspect]').onclick=()=>setStep(3);
 q('[data-rig-back]').onclick=()=>{
  if(step!==3)return;
  setStep(2);
  if(step===2)q('[data-host] canvas')?.focus({preventScroll:true});
 };
 q('[data-confirm-rig]').onclick=safe(()=>ensureRig());
 versionButton.onclick=safe(restoreMaterialVersion);
 rebuild.onclick=safe(async()=>{const prompt=document.createElement('dialog');prompt.className='trunk-image-dialog';prompt.innerHTML='<header><strong>建立新的材质工作版本？</strong></header><p style="padding:0 20px">当前材质与原模型保留；新几何重新准备UV和走势，原笔触不直接套用新面号。</p><div><button data-cancel>取消</button><button data-confirm>保留当前版本并重新准备</button></div>';document.body.append(prompt);const allowed=await new Promise(resolve=>{prompt.querySelector('[data-cancel]').onclick=()=>{prompt.close();resolve(false);};prompt.querySelector('[data-confirm]').onclick=()=>{prompt.close();resolve(true);};prompt.oncancel=()=>resolve(false);prompt.showModal();});prompt.remove();if(allowed)await material('material',true);});
 auto=createTrunkAutoController({dialog,icon,getModel:()=>model,
  canStart:()=>rigAllowed()&&!busy&&!gesture&&!repair&&!weightTools.active,
  enterGuides:()=>setStep(2),setBusy:value=>{busy=value;},refresh:render,
  preview:(guides,locked=!!guides)=>view?.showCandidateGuides(guides,locked),
  stage:startRepair,status
 });
 q('[data-section="2"]').insertBefore(topology,q('.trunk-manual-guides'));
 q('[data-section="2"]').prepend(q('[data-weight-open]'),q('.trunk-weight-panel'));
 return {open,close,importFile,acceptMaterial,materialComponent:component,async noteMaterialSession(session,pending){if(draft?.id!==pending.sessionId||!/^[a-f0-9]{64}$/.test(session.originKey)||!/^[a-f0-9-]{36}$/.test(session.projectId))throw Error('材质草稿引用与当前树干不匹配');draft={...draft,materialSession:{version:2,projectId:session.projectId,originKey:session.originKey,preparation:session.preparation||'full'}};await flush();render();},get autoState(){return dialog.dataset.autoState;},get model(){return repair?.original||model;},get workingModel(){return model;},get draft(){return draft;},get selection(){return selection.map(p=>({...p}));},get panel(){return dialog;},get view(){return view;},flush};
}
