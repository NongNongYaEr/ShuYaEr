import { normalizeUnitRule } from './unit-authoring.js';
const $=id=>document.getElementById(id);
const field=(id,label,value,min,max,step)=>`<label>${label}<input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
export function createUnitRulesUI(api,section){
  const panel=document.createElement('details');panel.id='unitRulesPanel';panel.open=true;
  panel.innerHTML=`<summary>叶花果 · 生成配置</summary><p class="vine-note">旧工程保持原有分布。创建规则后替换对应范围的自动分布；手工保留的单元继续保留。参数随工程保存，同值不累加。</p>
  <label>当前规则<select id="urList"></select></label><div class="wb-row"><button id="urNewLeaf">新建叶片规则</button><button id="urNewOrgan">新建花果规则</button><button id="urRemove">删除规则</button></div>
  <label>新规则作用范围<select id="urScope"><option value="ALL">整根样本枝</option><option value="SELECTED">选中枝条及子枝</option><option value="DIRECT">仅选中枝条</option></select></label>
  <div id="urFields"><label class="wb-check"><input id="urEnabled" type="checkbox">启用此规则</label><p id="urTargets" class="vine-note"></p>
  <label>分布预设<select id="urPreset"><option value="">自定义</option><option value="ALTERNATE">互生疏枝</option><option value="OPPOSITE">对生展开</option><option value="WHORLED">轮生叶簇</option><option value="TIP">枝梢集中</option></select></label>
  <div class="field-grid">${field('urMin','最低枝级',0,0,12,1)}${field('urMax','最高枝级',12,0,12,1)}${field('urStart','起点（%）',15,0,100,1)}${field('urEnd','终点（%）',98,0,100,1)}${field('urSpacing','节间距（cm）',12,.5,500,.5)}${field('urAmount','节点保留比例',1,0,1,.05)}</div>
  <label>叶序<select id="urArrangement"><option value="ALTERNATE">互生 · 每节 1 片</option><option value="OPPOSITE">对生 · 每节 2 片</option><option value="WHORLED">轮生 · 每节指定片数</option></select></label>
  <label>花果位置<select id="urHabit"><option value="AXILLARY">叶腋 · 沿用叶片节位</option><option value="TERMINAL">枝端</option><option value="PENDANT">沿枝下垂</option></select></label>
  <div class="field-grid">${field('urCount','轮生每节片数',3,1,8,1)}${field('urAngle','节间绕枝角（°）',137.5,-360,360,.5)}${field('urSpread','离枝展开角（°）',55,0,180,1)}${field('urDroop','下垂 / 负值上扬',0,-1,1,.05)}${field('urTwist','扭转变化（°）',15,0,180,1)}${field('urVariation','尺寸变化',.12,0,.8,.02)}${field('urSize','尺寸倍率',1,.05,10,.05)}${field('urAvoid','近邻挂点间距（cm，0 关闭）',0,0,100,.1)}${field('urSeed','分布种子',32044,1,2147483646,1)}</div>
  <p class="vine-note">沿枝曲线：根部 → 枝梢。五个控制点可直接输入，折线同步显示。</p><label>节点保留曲线（0–1 为比例）</label><svg id="urDensityGraph" viewBox="0 0 250 60" style="width:100%;height:60px;background:#0c1711"></svg><div class="field-grid">${[0,1,2,3,4].map(i=>field('urD'+i,i*25+'%',1,0,1,.05)).join('')}</div>
  <label>尺寸曲线（倍率）</label><svg id="urSizeGraph" viewBox="0 0 250 60" style="width:100%;height:60px;background:#0c1711"></svg><div class="field-grid">${[0,1,2,3,4].map(i=>field('urS'+i,i*25+'%',1,0,5,.05)).join('')}</div>
  <details><summary>单元款式权重</summary><p class="vine-note">0 表示不使用此款。已有成熟 / 嫩叶标记参与沿枝分层。</p><div id="urWeights"></div></details>
  <p id="urStats" class="vine-note"></p></div><p class="vine-note">花果使用完整 Blender 单元。近邻避让只筛选自动挂点，不移动手工单元；不代替精确网格碰撞检查。</p>`;
  section.prepend(panel);let selected='',identity='';
  const config=()=>api.getAuthoring().unit_editing,active=()=>config().rules.find(r=>r.id===selected);
  const sourceList=r=>r.kind==='LEAF'?api.getLeafSources():api.getAuthoring().tree_organs.units;
  const fields={urMin:'order_min',urMax:'order_max',urStart:'start',urEnd:'end',urSpacing:'spacing',urAmount:'amount',urArrangement:'arrangement',urHabit:'habit',urCount:'count',urAngle:'angle',urSpread:'spread',urDroop:'droop',urTwist:'twist',urVariation:'variation',urSize:'size',urAvoid:'avoid',urSeed:'seed'};
  const factor=id=>['urStart','urEnd','urSpacing','urAvoid'].includes(id)?100:1;
  function mutate(label,fn){if(api.isBusy()||api.getAsset()?.group.userData.pending_rebuild)return;api.transact(label,a=>fn(a.unit_editing),{bypassLayers:true});}
  function targets(){if($('urScope').value==='ALL')return [];const ids=new Set(api.getSelections()),excluded=api.getSelectionExclusions?.()||new Set(),bs=api.getAsset().masterBranches;if(!ids.size)throw Error('请先切换到枝干选择并选中作用枝条');if($('urScope').value==='SELECTED'){let change=true;while(change){change=false;for(const b of bs)if(ids.has(bs.find(p=>p.id===b.parentId)?.stableId)&&!ids.has(b.stableId)&&!excluded.has(b.stableId)){ids.add(b.stableId);change=true;}}}return bs.filter(b=>ids.has(b.stableId)&&!b.unitOwner&&!b.instanceId).map(b=>b.stableId);}
  function add(kind){try{const ids=targets();if(kind==='ORGAN'&&!api.getAuthoring().tree_organs.units.length)throw Error('请先在装配中加入花或果单元');selected='RULE_'+crypto.randomUUID();const r=normalizeUnitRule({id:selected,kind,targets:ids});mutate('创建单元生成规则',a=>a.rules.push(r));}catch(e){api.toast(e.message,true);}}
  $('urNewLeaf').onclick=()=>add('LEAF');$('urNewOrgan').onclick=()=>add('ORGAN');$('urRemove').onclick=()=>mutate('删除生成规则',a=>{a.rules=a.rules.filter(r=>r.id!==selected);});
  $('urList').onchange=()=>{selected=$('urList').value;identity='';refresh();};
  function change(){const r=active();if(!r)return;const n={...r,enabled:$('urEnabled').checked};for(const [id,key]of Object.entries(fields)){if($(id).type==='number'&&(!$(id).value||!$(id).checkValidity())){$(id).reportValidity();return;}n[key]=$(id).tagName==='SELECT'?$(id).value:Number($(id).value)/factor(id);}
    n.density=[0,1,2,3,4].map(i=>Number($('urD'+i).value));n.sizes=[0,1,2,3,4].map(i=>Number($('urS'+i).value));if(n.start>=n.end||n.order_min>n.order_max){api.toast('起点必须小于终点，最低枝级不能大于最高枝级',true);return;}mutate('修改单元生成配置',a=>{a.rules[a.rules.findIndex(v=>v.id===r.id)]=normalizeUnitRule(n);});}
  for(const id of [...Object.keys(fields),'urEnabled',...[0,1,2,3,4].flatMap(i=>['urD'+i,'urS'+i])])$(id).onchange=change;
  $('urPreset').onchange=()=>{const value=$('urPreset').value;if(!value)return;mutate('设置单元分布预设',a=>{const r=a.rules.find(v=>v.id===selected);if(!r)return;Object.assign(r,value==='TIP'?{density:[0,.15,.45,.8,1],sizes:[1,1,.95,.85,.7],start:.15}:value==='OPPOSITE'?{arrangement:'OPPOSITE',angle:90,spacing:.12,spread:70}:value==='WHORLED'?{arrangement:'WHORLED',count:3,angle:35,spacing:.16,spread:65}:{arrangement:'ALTERNATE',angle:137.5,spacing:.15,spread:50});});};
  function graph(id,values){const max=id==='urDensityGraph'?1:Math.max(2,...values);$(id).dataset.maximum=max;$(id).innerHTML=`<path d="M 5 55 H245 M5 5 V55" stroke="#657467" fill="none"/><polyline points="${values.map((v,i)=>`${5+i*60},${55-v/max*48}`).join(' ')}" stroke="#e6c961" stroke-width="2" fill="none"/>${values.map((v,i)=>`<circle data-point="${i}" cx="${5+i*60}" cy="${55-v/max*48}" r="4" fill="#e6c961"/>`).join('')}`;}
  for(const [id,prefix]of [['urDensityGraph','urD'],['urSizeGraph','urS']]){
    const svg=$(id);let drag=null;svg.style.touchAction='none';svg.style.cursor='crosshair';
    const restore=()=>{if(!drag)return;drag.values.forEach((v,i)=>$(prefix+i).value=v);graph(id,drag.values);drag=null;};
    svg.onpointerdown=e=>{if(e.button!==0||!active())return;e.preventDefault();const rect=svg.getBoundingClientRect();drag={index:Math.min(4,Math.max(0,Math.round(((e.clientX-rect.left)/rect.width*250-5)/60))),values:[0,1,2,3,4].map(i=>Number($(prefix+i).value)),max:Number(svg.dataset.maximum)};svg.setPointerCapture(e.pointerId);};
    svg.onpointermove=e=>{if(!drag)return;const rect=svg.getBoundingClientRect(),value=Math.max(0,Math.min(drag.max,(55-(e.clientY-rect.top)/rect.height*60)/48*drag.max));$(prefix+drag.index).value=Number(value.toFixed(3));graph(id,[0,1,2,3,4].map(i=>Number($(prefix+i).value)));};
    svg.onpointerup=()=>{if(!drag)return;drag=null;change();};svg.onpointercancel=restore;
    window.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();restore();}});window.addEventListener('blur',restore);
  }
  function refresh(){panel.hidden=!api.isBranch();if(panel.hidden)return;$('urStats').textContent=`当前显示 ${api.getAsset()?.placements.length||0} 个叶片单元、${api.getAsset()?.treeOrgans.length||0} 个花果单元。手工单元不受此规则覆盖。`;const rules=config().rules;if(!rules.some(r=>r.id===selected))selected=rules.at(-1)?.id||'';const key=JSON.stringify([rules,api.getLeafSources().map(s=>s.id),api.getAuthoring().tree_organs.units.map(s=>s.id),selected]);if(key===identity)return;identity=key;
    $('urList').replaceChildren(...rules.map((r,i)=>new Option(`${i+1} · ${r.kind==='LEAF'?'叶片':'花果'} · ${r.targets.length?`${r.targets.length} 根枝`:'全样本'}${r.enabled?'':'（停用）'}`,r.id)));$('urList').value=selected;const r=active();$('urFields').hidden=!r;$('urRemove').disabled=!r;if(!r)return;
    $('urPreset').value='';$('urEnabled').checked=r.enabled;$('urTargets').textContent=r.targets.length?`作用于 ${r.targets.join('、')}；同范围采用列表中最后一条启用规则。`:'作用于当前样本的所有枝干；可用枝级进一步限制。';
    for(const [id,key]of Object.entries(fields))$(id).value=typeof r[key]==='number'?Number((r[key]*factor(id)).toFixed(4)):r[key];
    $('urArrangement').closest('label').hidden=r.kind!=='LEAF';$('urHabit').closest('label').hidden=r.kind!=='ORGAN';
    for(let i=0;i<5;i++){$('urD'+i).value=r.density[i];$('urS'+i).value=r.sizes[i];}graph('urDensityGraph',r.density);graph('urSizeGraph',r.sizes);
    $('urWeights').replaceChildren();for(const s of sourceList(r)){const label=document.createElement('label');label.textContent=s.name||s.id;const input=document.createElement('input');input.type='number';input.min=0;input.max=100;input.step=.1;input.value=r.weights.find(w=>w.id===s.id)?.weight??s.weight??1;input.onchange=()=>{if(!input.value||!input.checkValidity())return;mutate('修改素材款式权重',a=>{const target=a.rules.find(v=>v.id===selected);target.weights=target.weights.filter(w=>w.id!==s.id);target.weights.push({id:s.id,weight:Number(input.value)});});};label.append(input);$('urWeights').append(label);}
    $('urStats').textContent=`当前显示 ${api.getAsset().placements.length} 个叶片单元、${api.getAsset().treeOrgans.length} 个花果单元。手工单元不受此规则覆盖。`;
  }
  return {refresh};
}
