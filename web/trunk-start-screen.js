import {createTrunkRouteChoice,trunkRoutePlan} from './trunk-import-route.js';

// This is a page inside the existing trunk dialog, not another modal or app.
export function createTrunkStartScreen(layout,{choose,chooseUdim,apply,cancel,change,drop}){
 const panel=document.createElement('section');panel.className='trunk-start-panel';panel.setAttribute('aria-label','选择树干处理流程');panel.innerHTML=`<div class="trunk-start-inner"><header class="trunk-start-heading"><img src="/brand/category-plant-v1.png" alt="" width="72" height="72"><div><small>树干整理 · 开始</small><h2>先选处理方式，再导入树干</h2><p>根据模型的准备程度选择，原始文件始终保留。</p></div></header><div data-start-choices></div><div class="trunk-start-settings" data-start-settings></div><div class="trunk-start-action"><div><small>当前流程</small><strong data-start-route></strong><p data-start-flow></p></div><button type="button" data-start-primary class="trunk-primary">选择树干 GLB →</button></div><div class="trunk-start-bottom"><span data-start-tip>也可以将 GLB 文件拖到这里</span><button type="button" data-start-cancel>返回当前模型</button></div><div class="trunk-start-drafts" data-start-drafts></div><p class="trunk-start-status" data-start-status role="status" aria-live="polite"></p></div>`;layout.append(panel);
 const q=s=>panel.querySelector(s),choice=createTrunkRouteChoice(q('[data-start-choices]'),{change});let state={shown:true,present:false,purpose:'import',busy:false,route:'full'};
 const udim=document.createElement('button');
 udim.type='button';
 udim.textContent='选择 GLB ＋ UDIM 贴图';
 udim.title='同时选择一个 GLB 和瓦片贴图，例如 树皮_BaseColor.1001.png';
 q('[data-start-tip]').after(udim);
 udim.onclick=()=>chooseUdim(choice.value);
 q('[data-start-primary]').onclick=()=>state.purpose==='change'?apply(choice.value):choose(choice.value);
 q('[data-start-cancel]').onclick=cancel;
 panel.ondragover=event=>{if(state.busy||state.purpose==='change')return;event.preventDefault();panel.classList.add('drag-over');};
 panel.ondragleave=event=>{if(!panel.contains(event.relatedTarget))panel.classList.remove('drag-over');};
 panel.ondrop=event=>{event.preventDefault();panel.classList.remove('drag-over');if(state.busy||state.purpose==='change')return;const file=[...(event.dataTransfer?.files||[])].find(f=>/\.glb$/i.test(f.name));if(file)drop(file,choice.value);};
 return{element:panel,settings:q('[data-start-settings]'),drafts:q('[data-start-drafts]'),status:q('[data-start-status]'),choice,
  sync(value){state={...state,...value};const route=trunkRoutePlan(state.route);panel.hidden=!state.shown;choice.sync({value:route.id,disabled:state.busy});q('h2').textContent=state.purpose==='change'?'调整这棵树的处理方式':state.present?'选择新模型的处理方式':'先选处理方式，再导入树干';q('[data-start-route]').textContent=route.title;q('[data-start-flow]').textContent=route.flow;q('[data-start-primary]').textContent=state.busy?'正在读取模型…':state.purpose==='change'?'应用处理方式 →':'选择树干 GLB →';q('[data-start-primary]').disabled=q('[data-start-cancel]').disabled=udim.disabled=state.busy;udim.hidden=state.purpose==='change';q('[data-start-cancel]').hidden=!state.present;q('[data-start-tip]').textContent=state.purpose==='change'?'确认后返回模型，保留当前工作版本':'GLB 可直接拖入 · UDIM 贴图按 BaseColor.1001.png、Normal.1001.png、ORM.1001.png 编号';q('[data-start-settings]').hidden=!route.material;q('[data-start-drafts]').hidden=state.present;},
  focus(){q('input:checked')?.focus({preventScroll:true});}
 };
}
