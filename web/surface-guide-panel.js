import { guideColor } from './surface-guide-shape.js';
import { drawingRecipe, recipeFromGuide, patchGuideParameters } from './surface-guide-workflow.js';
import * as THREE from 'three';

export function createSurfaceGuidePanel({ api, state, transact, selectedGuide, selection, select, selectAll, clearSelection, activate, anchors, config, getMode, tidy }) {
  const panel = document.createElement('section'); panel.id = 'surfaceGuidePanel'; panel.className = 'inspector-section surface-guide-panel';
  panel.innerHTML = `<h3>路线与绘制 <small id="surfaceGuideCount"></small></h3>
    <div class="wb-row"><button data-action="draw">＋ 画新路线</button><button data-action="use-primary">用主选参数继续画</button></div>
    <p id="guideRecipeSummary" class="vine-note"></p>
    <div class="wb-row"><button data-action="edit">编辑所选</button><button data-action="finish">完成编辑</button></div>
    <p id="guideEditStatus" class="vine-note"></p>
    <div class="wb-row"><button data-action="all">全选路线</button><button data-action="clear">清空选择</button></div>
    <p class="vine-note">勾选多条 · Ctrl 加减选 · Shift 连选<br>编辑时 Ctrl+A 全选 · Delete 删除路线</p>
    <div class="surface-guide-cards"></div>
    <label class="guide-target">参数作用于<select id="guideParameterTarget"><option value="SELECTION">所选路线</option><option value="RECIPE">下一笔配方</option></select></label>
    <p id="guideTargetNote" class="vine-note"></p>
    <div class="surface-guide-settings">
      <div class="field-grid"><label>主藤数量<input id="guideBundleCount" type="number" min="1" max="8" step="1"></label><label>藤群宽度（m）<input id="guideBundleWidth" type="number" min="0" max="3" step=".01"></label></div>
      <label>跟随走势 <output id="guideBundleFollowValue"></output><input id="guideBundleFollow" type="range" min="0" max="1" step=".05"></label>
      <div id="guideMainParameters" class="field-grid"></div>
      <details><summary>垂落与贴面</summary><div id="guideExtraParameters" class="field-grid"></div><label class="wb-check"><input id="guideRecipeHang" type="checkbox">到边缘后垂落</label><label class="wb-check"><input id="guideRecipeFlip" type="checkbox">反转贴面方向</label></details>
      <p class="vine-note">修改所选参数时，下一笔也记住这次调整。多选显示“多值”时，只统一你改动的那一项；叶片素材与叶量仍为全局设置。</p>
    </div>
    <div id="guideSelectionOperations">
      <div class="wb-row"><label class="wb-check"><input id="guideBundleEnabled" type="checkbox">启用所选</label><label class="wb-check"><input id="guideBundleLocked" type="checkbox">锁定所选</label></div>
      <div class="wb-row"><button data-action="fit">定位所选</button><button data-action="continue">续画单条</button><button data-action="copy">复制所选</button><button data-action="reverse">反转所选</button><button data-action="tidy">整理控制点</button><button data-action="delete">删除所选</button></div>
    </div>`;
  document.querySelector('.inspector-scroll').prepend(panel);
  const $ = id => panel.querySelector('#' + id), cards = panel.querySelector('.surface-guide-cards');
  // These existing fields keep their original IDs, but now have one home on the
  // right and share the same selection/recipe transaction as the bundle fields.
  for (const field of ['length','radius','spread','density']) $('guideMainParameters').append(document.getElementById('guide_'+field).closest('label'));
  document.getElementById('guide_length').closest('label').firstChild.textContent = '起点生长距离（m）';
  for (const [field,title,min,max,step] of [['hang_length','垂落长度（m）',.1,10,.1],['hang_density','垂藤密度',1,12,1],['hang_reach','向外探出（m）',.05,2,.05],['hang_variation','长短错落',0,.8,.05],['offset','离面距离（m）',.003,.1,.001]]) {
    const label = document.createElement('label'); label.textContent = title;
    const input = document.createElement('input'); Object.assign(input,{id:'guide_'+field,type:'number',min:String(min),max:String(max),step:String(step)}); label.append(input); $('guideExtraParameters').append(label);
  }
  let key = '', target = 'SELECTION', lastMode = '';
  const context = () => ({ vine: api.getAuthoring().vine, seed: api.getAuthoring().seeds.shape });
  const chosen = () => state()?.guides.filter(g => selection.ids.includes(g.id)) || [];
  const recipeOnly = () => target === 'RECIPE' || !chosen().length;
  function editParameters(section, field, value) {
    const ids = selection.ids, recipe = recipeOnly(), eligible = chosen().filter(g=>!g.locked&&(section!=='bundle'||g.type!=='EAVE'));
    if (!recipe && !eligible.length) return api.toast('所选路线已锁定，或不支持这项参数');
    transact(recipe?'调整下一笔配方':'批量调整路线参数', surface => patchGuideParameters(surface,ids,section,field,value,{...context(),recipeOnly:recipe}));
    if (!recipe && eligible.length !== ids.length) api.toast(`已调整 ${eligible.length} 条；其余锁定或不适用的路线保持原样`);
  }
  function actionOnSelected(label, callback, { allowLocked = false, filter = () => true } = {}) {
    const all=chosen(), editable=all.filter(g=>(allowLocked||!g.locked)&&filter(g)), ids=editable.map(g=>g.id);
    if(!ids.length)return api.toast('没有可操作的路线；请检查选择、锁定状态与路线类型');
    transact(label,s=>callback(s,s.guides.filter(g=>ids.includes(g.id))));
    if(ids.length!==all.length)api.toast(`已处理 ${ids.length} 条，跳过 ${all.length-ids.length} 条锁定或不适用的路线`);
  }
  const deleteSelected=()=>actionOnSelected('删除所选路线',(s,items)=>{const ids=new Set(items.map(g=>g.id));s.guides=s.guides.filter(g=>!ids.has(g.id));});
  panel.addEventListener('click', e => {
    const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
    if(action==='draw')return activate('DRAW');
    if(action==='edit')return activate('EDIT');
    if(action==='finish')return activate('');
    if(action==='all')return selectAll();
    if(action==='clear')return clearSelection();
    if(action==='tidy')return tidy();
    const selected=chosen(),g=selectedGuide();if(!g)return;
    if(action==='use-primary'){transact('沿用主选路线配方',s=>{s.draw_recipe=recipeFromGuide(s,g,context().vine,context().seed);});return activate('DRAW');}
    if(action==='fit'){const box=new THREE.Box3().setFromPoints(selected.flatMap(g=>anchors(g).map(a=>new THREE.Vector3(...a.point))));box.expandByScalar(Math.max(.3,...selected.map(g=>g.bundle?.width||0)));return api.fit(box);}
    if(action==='continue'){if(selected.length!==1)return api.toast('续画需要只选择一条路线');return activate('CONTINUE');}
    if(action==='copy'){
      if(state().guides.length+selected.length>32)return api.toast('复制后会超过 32 条，请减少选择');
      return actionOnSelected('复制所选路线',(s,items)=>{for(const item of items){const copy=structuredClone(item);copy.id='G'+crypto.randomUUID().replaceAll('-','');copy.name+=' 副本';copy.locked=false;s.guides.push(copy);}},{allowLocked:true});
    }
    if(action==='reverse')return actionOnSelected('反转所选路线',(_,items)=>{for(const item of items){if(item.anchors.length>1)item.anchors.reverse();else item.flow=item.flow==='DOWN'?'UP':'DOWN';}},{filter:g=>g.type!=='EAVE'});
    if(action==='delete')return deleteSelected();
  });
  $('guideParameterTarget').onchange=()=>{target=$('guideParameterTarget').value;refresh();};
  $('guideBundleEnabled').onchange=()=>{const value=$('guideBundleEnabled').checked;actionOnSelected('切换所选路线生成',(_,items)=>{for(const g of items)g.enabled=value;});};
  $('guideBundleLocked').onchange=()=>{const value=$('guideBundleLocked').checked;actionOnSelected('锁定或解锁所选路线',(_,items)=>{for(const g of items){if(value)g.config=config(g);g.locked=value;}},{allowLocked:true});};
  for(const[id,field]of [['guideBundleCount','count'],['guideBundleWidth','width'],['guideBundleFollow','follow']])$(id).onchange=()=>{const input=$(id);if(input.value===''||!input.checkValidity())return refresh();editParameters('bundle',field,+input.value);};
  for(const field of ['length','radius','spread','density','hang_length','hang_density','hang_reach','hang_variation','offset'])$('guide_'+field).onchange=()=>{const input=$('guide_'+field);if(input.value===''||!input.checkValidity())return refresh();editParameters('config',field,+input.value);};
  for(const[id,field]of [['guideRecipeHang','auto_hang'],['guideRecipeFlip','flip']])$(id).onchange=()=>editParameters('config',field,$(id).checked);
  $('guideBundleFollow').oninput=()=>{$('guideBundleFollowValue').value=Math.round(+$('guideBundleFollow').value*100)+'%';};
  function setValues(input, values, disabled=false) {
    const mixed=values.length>1&&values.some(v=>v!==values[0]);input.disabled=disabled;input.dataset.mixed=String(mixed);
    if(input.type==='checkbox'){input.indeterminate=mixed;input.checked=!mixed&&!!values[0];}
    else {input.placeholder=mixed?'多值':'';if(document.activeElement!==input||mixed)input.value=mixed?(input.type==='range'?.5:''):values[0]??'';}
    return mixed;
  }
  function refresh() {
    const s=state();panel.hidden=!api.isActive()||!s;if(panel.hidden)return;
    const mode=getMode();if(mode!==lastMode){if(['DRAW','ROOT','DOWN','EAVE'].includes(mode))target='RECIPE';else if(mode==='EDIT')target='SELECTION';lastMode=mode;}
    const items=chosen(),g=selectedGuide(),locked=items.filter(g=>g.locked).length,recipe=drawingRecipe(s,context().vine,context().seed);
    $('surfaceGuideCount').textContent=`${s.guides.length} / 32`;
    $('guideRecipeSummary').textContent=`下一笔：${recipe.bundle.count} 根 · 宽 ${recipe.bundle.width.toFixed(2)} m · 侧藤 ${recipe.config.spread} m · 密度 ${recipe.config.density}。随工程保存。`;
    $('guideEditStatus').textContent=['DRAW','ROOT','DOWN','EAVE'].includes(mode)?'绘制中：使用下一笔配方；松手生成，Esc 结束。':`已选 ${items.length} 条${locked?' · '+locked+' 条锁定':''}${items.length>1?' · 批量调参；单选后可拖控制点':mode==='EDIT'?' · 拖点改走势 · 双击加点':' · 点击路线进入编辑'}`;
    $('guideParameterTarget').value=recipeOnly()?'RECIPE':'SELECTION';$('guideParameterTarget').options[0].disabled=!items.length;
    $('guideTargetNote').textContent=recipeOnly()?'只改变之后新画的路线，已有路线保持原样。':`只影响选中的 ${items.length-locked} 条可编辑路线${locked?'，跳过 '+locked+' 条锁定路线':''}。手绘路线长度由控制点决定，起点生长距离只用于点起点路线。`;
    const next=JSON.stringify([s.guides,selection.ids,g?.id]);
    if(key!==next){key=next;cards.replaceChildren();if(!s.guides.length){const empty=document.createElement('p');empty.className='vine-note';empty.textContent='画第一条路线，或在模型顶部点“向下长”。';cards.append(empty);}
      for(const item of s.guides){const row=document.createElement('div');row.className='surface-guide-row';const check=document.createElement('input');check.type='checkbox';check.checked=selection.ids.includes(item.id);check.dataset.guideToggle=item.id;check.setAttribute('aria-label','选择 '+item.name);check.onchange=()=>select(item.id,{toggle:true});
        const card=document.createElement('button');card.className='surface-guide-card';card.dataset.guide=item.id;card.classList.toggle('active',selection.ids.includes(item.id));card.classList.toggle('primary',g?.id===item.id);card.style.setProperty('--guide-color',guideColor(item.id));card.setAttribute('aria-pressed',String(selection.ids.includes(item.id)));
        const name=document.createElement('strong');name.textContent=(g?.id===item.id?'主选 · ':'')+item.name;const info=document.createElement('small');info.textContent=`${item.locked?'锁定 · ':''}${item.enabled===false?'停用 · ':''}${item.type==='EAVE'?'檐口垂藤':(item.bundle?.count||1)+' 根 · '+(item.bundle?.width||0).toFixed(2)+' m'} · ${item.anchors.length} 点`;
        card.append(name,info);card.onclick=e=>select(item.id,{toggle:e.ctrlKey||e.metaKey,range:e.shiftKey,additive:e.ctrlKey||e.metaKey});row.append(check,card);cards.append(row);
      }
    }
    const onlyEave=recipeOnly()?mode==='EAVE':items.every(g=>g.type==='EAVE');
    const data=recipeOnly()?[recipe]:items.map(g=>recipeFromGuide(s,g,context().vine,context().seed)),noEditable=!recipeOnly()&&items.every(g=>g.locked),noBundle=!recipeOnly()&&items.every(g=>g.locked||g.type==='EAVE');
    for(const[id,field]of [['guideBundleCount','count'],['guideBundleWidth','width'],['guideBundleFollow','follow']]){const mixed=setValues($(id),data.map(d=>d.bundle[field]),noBundle||onlyEave);if(field==='follow')$('guideBundleFollowValue').value=mixed?'多值':Math.round(data[0].bundle.follow*100)+'%';}
    for(const field of ['length','radius','spread','density','hang_length','hang_density','hang_reach','hang_variation','offset'])setValues($('guide_'+field),data.map(d=>d.config[field]),noEditable||onlyEave&&['length','spread','density'].includes(field)||field==='length'&&!recipeOnly()&&items.every(g=>g.anchors.length>1||g.type==='EAVE'));
    for(const[id,field]of [['guideRecipeHang','auto_hang'],['guideRecipeFlip','flip']])setValues($(id),data.map(d=>d.config[field]),noEditable||onlyEave&&field==='auto_hang');
    $('guideSelectionOperations').hidden=!items.length;setValues($('guideBundleEnabled'),items.map(g=>g.enabled!==false),!items.some(g=>!g.locked));setValues($('guideBundleLocked'),items.map(g=>g.locked));
    for(const action of ['delete','reverse','tidy'])panel.querySelector(`[data-action="${action}"]`).disabled=!items.some(g=>!g.locked);
    panel.querySelector('[data-action="continue"]').disabled=items.length!==1||!!g?.locked;
    for(const action of ['use-primary','edit','fit','copy'])panel.querySelector(`[data-action="${action}"]`).disabled=!items.length;
  }
  return { refresh, editParameters, deleteSelected };
}
