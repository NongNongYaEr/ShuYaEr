import {TRUNK_WORKFLOW_LABELS} from './trunk-workflow-ui.js';

export function editContext(state) {
  const {mode='TREE', editKind='BONE', branch='', count=0, point=-1, points=0, unit=false, sample=false, tool='SELECT', scope='SUBTREE'}=state;
  const workspace=mode==='BRANCH'?'枝条工作台':mode==='VINE'?'藤蔓工作台':'整树造型';
  const trunkWorkspace=state.skeletonEditing?'枝干编辑':workspace;
  if(mode==='TREE'&&state.trunkForm&&state.trunkFormContext?.region==='ROOT')return{object:`${trunkWorkspace} · 根部板根${branch?' · '+branch:''}`,scope:(state.trunkFormContext.rootSelection?.length?'已选 '+state.trunkFormContext.rootSelection.length+' 条板根':'未选板根')+' · 仅本枝形状，截面与完整单元枝保持',keys:'点击 / Shift 加选 / Ctrl 减选 · 拖形状手柄 · Tab 切手柄 · N 新增 · Shift+D 复制 · Del 删所选板根 · F 定位 · Enter 确认 / Esc 取消，留在根部'};
  if(mode==='TREE'&&state.trunkForm&&state.trunkFormContext?.preparing)return{object:`${trunkWorkspace} · ${TRUNK_WORKFLOW_LABELS[state.trunkFormContext.stage]}准备${branch?' · '+branch:''}`,scope:'旧版截面升级预览 · 原工程尚未修改',keys:'Q 对照原形 · F 树上定位 · Enter 确认后进入编辑 · Esc / 主点塑形取消并返回'};
  if(mode==='TREE'&&state.trunkForm&&state.trunkFormContext?.part==='DETAIL')return{object:`${trunkWorkspace} · 表面细节 · ${state.trunkFormContext.tool||'选择细节'}${branch?' · '+branch:''}`,scope:state.trunkFormContext.summary||'仅当前本枝表面；大轮廓与完整单元枝保持',keys:'A 添加 · V 选择 · C 刷区域 · G 沿枝滑动 · R 绕干 · S 调范围 · Shift+D 复制 · F 刷涂半径 · Shift+F 强度 · P 预设；左键/Enter 确认 · Esc 取消 / 退一层，留在本区'};
  if(mode==='TREE'&&state.trunkForm)return {object:`${trunkWorkspace} · ${TRUNK_WORKFLOW_LABELS[state.trunkFormContext?.stage]||'主干形体'}${branch?' · '+branch:''}`,scope:branch?'仅当前本枝 · 截面与独立板根；'+(state.skeletonEditing?'单元枝暂停显示，装配保留':'单元枝姿态保持')+(state.trunkFormContext?.compatibility?'；旧版兼容编辑，首次改动保存新版截面':''):'点选承重枝干，或在右侧选择主干',keys:'点选 / 框选编辑点 · 点击轮廓选圈 · Shift 加选圈 · G / R / S 操作选区 · Del 删点 · H 整圈参数 · N 放置 · P 预设 · V 完成 · Esc 取消 / 退一层，留在本区'};
  if(mode==='TREE'&&editKind==='UNIT'&&tool==='COMB')return {object:`${workspace} · 单元枝梳理 · ${{ALIGN:'取样对齐',SPREAD:'散开 / 收拢',SCALE:'大小刷',JITTER:'自然扰动'}[state.effect]||{DRAG:'跟随拖动',DOWN:'枝梢向下',ROLL:'沿枝翻转'}[state.orientation]||'跟随拖动'}`,scope:state.unitSummary||(scope==='ALL'?'全部单元枝 · 围绕各自枝根操作':count?`所选单元枝${scope==='DIRECT'?'':'及下级'} · 围绕各自枝根操作`:'先点选单元枝，或在顶部切换为全部单元枝'),keys:'左键拖动 · F 半径 · Shift+F 强度 · Esc 取消 · 木枝与叶花果整支一起调整'};
  if(mode==='TREE'&&editKind==='UNIT'&&state.unitSummary)return {object:`${workspace} · 完整单元枝`,scope:state.unitSummary,keys:'点右侧卡片选本区同款 · Shift 加选 · Ctrl 切换 · G/R/S 微调 · C 梳理'};
  if(mode==='TREE'&&count&&(sample||unit))return {object:count>1?`${workspace} · ${count} 支单元枝`:`${workspace} · ${branch||'单元枝'}`,scope:'只调整单元枝整体 · 内部枝干与叶花果在枝条工作台编辑',keys:'G 换挂点 · R 旋转 · S 整体缩放 · Shift+D 复制 · 双击选整支 · 编辑源单元枝进入工作台'};
  if(unit&&mode!=='TREE')return {object:`${workspace} · 叶花果单元`,scope:'只修改所选叶花果',keys:'Shift+D 复制 · G 沿枝滑动/换挂点 · R 旋转 · S 缩放单元'};
  if(!count)return {object:`${workspace} · 未选择枝条`,scope:mode==='TREE'?'先选择承重骨架或单元枝，再进行编辑':'先点选枝干或控制点，再进行局部编辑',keys:'点击选择 · Shift 加选 · Esc 取消操作'};
  if(state.pointScope==='POINTS'&&count===1&&!sample&&!unit){
    const n=state.selectedPoints||0;return{object:`${trunkWorkspace} · ${branch} · 控制点`,scope:n?`已选 ${n} 个控制点 · 点间走势自动更新`:'控制点选区为空 · Delete 不删整枝',keys:'空白拖框选点 · Shift 加选 · Ctrl 在线上点击加点 · Delete 删选点 · G / R / S 调整 · 中键观察'};
  }
  const middle=count===1&&point>0&&point<points-1;
  const object=count>1?`${workspace} · ${count} 根枝条`:`${workspace} · ${branch}${point>=0?` · 第 ${point+1} 个点`:''}`;
  if(mode==='VINE')return {object,scope:'藤蔓工具按当前区域与路径操作',keys:'请查看当前工具的区域与路线配置'};
  if(count===1&&point>0&&point===points-1)return {object,scope:'当前为枝梢点，没有后续枝段',keys:'调整后段请选前面的中间点；调整整枝请选枝根'};
  if(middle)return {object,scope:'点位决定走势 · 点间曲线与网格自动更新',keys:'拖点 / G 移点 · R 转向后段点 · S 缩放后段点 · Alt+S 后段粗细'};
  if(mode==='BRANCH')return {object,scope:'当前枝条及下级枝段 · 以工具范围设置为准',keys:'Shift+D 复制整束 · G 移动 · R 旋转 · S 缩放 · Alt+S 粗细'};
  return {object,scope:scope==='DIRECT'?'当前枝干 · 以工具范围设置为准':'所选枝干及下级枝干 · 装配单元枝保持自身大小',keys:tool==='SELECT'||['BUNDLE_MOVE','BUNDLE_ROTATE','BUNDLE_SCALE'].includes(tool)?'Shift+D 复制整束 · G 沿枝移动/换挂点 · R 枝根旋转 · S 缩放 · Alt+S 粗细':'当前笔刷按范围设置生效 · Esc 取消'};
}

export function createEditContext(api) {
  const node=document.createElement('section');node.id='editContext';node.setAttribute('aria-label','当前编辑对象');
  node.innerHTML='<strong></strong><span></span><small></small>';
  api.canvas.parentElement.append(node);
  const toolbar=api.canvas.parentElement.querySelector('.viewport-toolbar');
  const position=()=>{if(!toolbar)return;const parent=api.canvas.parentElement.getBoundingClientRect(),bounds=toolbar.getBoundingClientRect();node.style.top=Math.max(86,bounds.bottom-parent.top+8)+'px';};
  if(toolbar){const observer=new ResizeObserver(position);observer.observe(toolbar);observer.observe(api.canvas.parentElement);}position();
  let signature='';
  // Geometry/layout changes move this label through the observer. Updating an
  // unchanged scope must not force layout after rebuilding the assembly cards.
  return {refresh(){const context=editContext(api.state()),next=JSON.stringify(context);if(next===signature)return;signature=next;node.querySelector('strong').textContent=context.object;node.querySelector('span').textContent=context.scope;node.querySelector('small').textContent=context.keys;}};
}
