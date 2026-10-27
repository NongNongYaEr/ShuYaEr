import {defaultTrunkDetailProfile} from './trunk-details.js';
import {TRUNK_DETAIL_PROFILES,createTrunkDetailProfileSampler,moveTrunkDetailProfilePoint,insertTrunkDetailProfilePoint,insertTrunkDetailProfilePointAfter,removeTrunkDetailProfilePoint} from './trunk-detail-profile.js';
import {createTrunkPresetStore} from './trunk-preset-store.js';
import {createTrunkPresetPreferences,filterTrunkPresetRecords,trunkPresetFilterMarkup} from './trunk-preset-library-ui.js';

const copy=v=>structuredClone(v), round=v=>Number((v*100).toFixed(2));
const curve=profile=>{const at=createTrunkDetailProfileSampler(profile);return Array.from({length:101},(_,i)=>`${i?'L':'M'}${20+i*2.6},${85-at(-1+i/50)*65}`).join(' ');};
const thumb=profile=>`<svg viewBox="0 0 300 170" aria-hidden="true"><path class="profile-zero" d="M20 85H280"/><path class="profile-curve" d="${curve(profile)}"/></svg>`;

/** Both surfaces share the same selected detail or next-stroke recipe. No
 * hidden full-tree scope; a gesture owns exactly one authoring transaction. */
export function createTrunkDetailProfileEditor(api) {
  const roots=api.containers.map(container=>{
    const root=document.createElement('details');root.className='trunk-detail-profile-editor';root.dataset.detailProfileEditor='';
    root.innerHTML=`<summary>细节截面 · 形状编辑 / 预设库</summary><p data-profile-scope></p>
      <svg class="trunk-detail-profile-graph" data-profile-graph viewBox="0 0 300 170" role="img" aria-label="细节横截面轮廓，横向为宽度，向下为凹陷，向上为隆起" tabindex="0"></svg>
      <small>拖紫点改截面 · A 加点 · Tab 切点 · 方向键微调 · Shift 大步 / Alt 细调；端点固定。</small><small data-profile-selected role="status"></small>
      <div class="trunk-profile-fields"><label>横向 %<input data-profile-field="x" type="number" min="-98" max="98" step="any"></label><label>凹凸 %<input data-profile-field="y" type="number" min="-100" max="100" step="any"></label><button data-profile-action="add" title="A / Insert · 在当前点后的一段加点" aria-keyshortcuts="A Insert">加点 A</button><button data-profile-action="remove" title="Delete / Backspace · 删除内部点" aria-keyshortcuts="Delete Backspace">删点 Del</button></div>
      <div class="trunk-profile-actions"><label>过渡<select data-profile-interpolation><option value="SMOOTH">圆滑</option><option value="LINEAR">直线</option></select></label><button data-profile-action="mirror">左右镜像</button><button data-profile-action="reset">恢复类型默认</button></div>
      <p class="trunk-profile-note">宽度沿用厘米尺寸，深浅乘凹凸强度；自定义截面替换该项的类型默认凹凸。沿绘制方向区分左右。</p>
      <strong class="trunk-preset-type">细节截面 · 保留走势、尺寸与强度</strong>${trunkPresetFilterMarkup('profile-preset','搜索细节截面')}<div data-profile-builtins class="trunk-profile-library"></div>
      <details data-profile-personal><summary>我的轮廓 · 仅保存截面</summary><div class="trunk-detail-save"><input data-profile-name maxlength="80" placeholder="轮廓名称"><button data-profile-action="save">另存轮廓</button></div><div data-profile-personal-list class="trunk-profile-library"></div><small data-profile-storage></small></details>
      <p data-profile-status role="status"></p>`;
    container.querySelector('.trunk-detail-values').after(root);return root;
  });
  const nodes=selector=>roots.flatMap(r=>[...r.querySelectorAll(selector)]),store=createTrunkPresetStore('profile');
  const preferences=createTrunkPresetPreferences('profile');let query='',filter='ALL';
  let index=1,drag=null,field='',key='',records=[],loaded=false,busy=false,nudge=null;
  const heldKeys=new Set();
  nodes('[data-profile-action="mirror"]').forEach(b=>{b.title='M · 左右镜像（截面图内）';b.setAttribute('aria-keyshortcuts','M');});
  nodes('[data-profile-interpolation]').forEach(n=>{n.title='L · 切换圆滑 / 直线（截面图内）';n.setAttribute('aria-keyshortcuts','L');});
  const profile=()=>{const s=api.state();return s.detail?copy(s.detail.profile||defaultTrunkDetailProfile(s.detail)):null;};
  const message=value=>nodes('[data-profile-status]').forEach(n=>n.textContent=value);
  const valid=()=>!field||nodes('[data-profile-field="'+field+'"]').filter(n=>!n.disabled).every(n=>n.value!==''&&n.checkValidity());
  function apply(value){if(!api.begin())return false;api.change(value);const ok=api.finish();update();return ok;}
  const preferenceChange=async action=>{try{await action();renderLibraries();update();}catch(e){message(e.message);}};
  nodes('[data-profile-preset-search]').forEach(n=>n.oninput=()=>{query=n.value;nodes('[data-profile-preset-search]').filter(m=>m!==n).forEach(m=>m.value=query);if(query)nodes('[data-profile-personal]').forEach(p=>p.open=true);renderLibraries();update();});
  nodes('[data-profile-preset-filter]').forEach(n=>n.onchange=()=>{filter=n.value;nodes('[data-profile-preset-filter]').forEach(m=>m.value=filter);if(filter!=='ALL')nodes('[data-profile-personal]').forEach(p=>p.open=true);renderLibraries();update();});
  function cards(list,items,personal){
    const all=items.map(r=>({...r,originalId:r.id,id:personal?r.id:'builtin-profile-'+r.id.toLowerCase()})),visible=filterTrunkPresetRecords(all,{query,mode:filter},preferences.data);
    list.replaceChildren();for(const record of visible){const card=document.createElement('div');card.className='trunk-profile-card';const b=document.createElement('button');b.type='button';b.dataset.profilePreset=record.originalId;b.innerHTML=thumb(record.shape);const label=document.createElement('span');label.textContent=record.name;b.append(label);b.title='只套用横截面，保留位置、走势、宽度和强度';b.onclick=()=>{if(apply(copy(record.shape))!==false)preferenceChange(()=>preferences.used(record.id));};card.append(b);
      const star=document.createElement('button');star.type='button';star.className='trunk-preset-favorite';star.textContent=preferences.data.favorites.includes(record.id)?'★':'☆';star.setAttribute('aria-label','收藏 '+record.name);star.setAttribute('aria-pressed',String(preferences.data.favorites.includes(record.id)));star.onclick=()=>preferenceChange(()=>preferences.toggle(record.id));card.append(star);
      if(personal){const remove=document.createElement('button');remove.type='button';remove.className='trunk-preset-remove';remove.textContent='×';remove.title='删除此个人轮廓；已做细节保留';remove.dataset.profileDelete=record.id;remove.onclick=async()=>{if(busy||api.state().active)return;busy=true;update();try{await store.remove(record.id);records=records.filter(r=>r.id!==record.id);await preferenceChange(()=>preferences.remove(record.id));renderPersonal();message('个人轮廓已删除；已有细节保留。');}catch(e){message(e.message);}finally{busy=false;update();}};card.append(remove);}list.append(card);
    }
    if(!visible.length&&!personal){const empty=document.createElement('p');empty.className='trunk-preset-empty';empty.textContent='没有匹配的内置截面；个人截面在下方。';list.append(empty);}
  }
  function renderPersonal(){nodes('[data-profile-personal-list]').forEach(list=>cards(list,records,true));nodes('[data-profile-storage]').forEach(n=>n.textContent=store.backend+(store.warnings.length?' · '+store.warnings.join('；'):''));}
  function renderLibraries(){nodes('[data-profile-builtins]').forEach(list=>cards(list,TRUNK_DETAIL_PROFILES,false));renderPersonal();}
  async function refresh(){if(busy)return;busy=true;update();try{records=await store.list();loaded=true;await preferences.load();renderLibraries();}catch(e){message('轮廓库读取失败：'+e.message);}finally{busy=false;update();}}
  nodes('[data-profile-builtins]').forEach(list=>cards(list,TRUNK_DETAIL_PROFILES,false));
  roots.forEach(root=>root.addEventListener('toggle',()=>{if(root.open&&!loaded)refresh();}));
  nodes('[data-profile-personal]').forEach(d=>d.addEventListener('toggle',()=>{if(d.open&&!loaded)refresh();}));
  nodes('[data-profile-name]').forEach(n=>n.oninput=()=>nodes('[data-profile-name]').filter(m=>m!==n).forEach(m=>m.value=n.value));
  async function save(root){const shape=profile(),name=root.querySelector('[data-profile-name]').value.trim();if(!shape||!name){message('选中一项或设好下一笔，输入名称后另存。');return;}if(api.state().active||busy){message('先确认或取消轮廓调节，再另存。');return;}busy=true;update();try{const record=await store.put({name,shape});records=await store.list();loaded=true;renderPersonal();nodes('[data-profile-name]').forEach(n=>n.value='');message('已另存「'+record.name+'」，可在其他细节复用。');}catch(e){message('保存失败：'+e.message);}finally{busy=false;update();}}
  function coords(svg,e){const r=svg.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*300,y=(e.clientY-r.top)/r.height*170;return{x:Math.max(-1,Math.min(1,(x-20)/130-1)),y:Math.max(-1,Math.min(1,(85-y)/65))};}
  nodes('[data-profile-graph]').forEach(svg=>{
    svg.onpointerdown=e=>{if(e.button!==0||!api.state().editable||api.state().active)return;const knot=e.target.closest('[data-profile-point]');if(!knot)return;index=Number(knot.dataset.profilePoint);update();if(index===0||index===profile().points.length-1)return;drag={svg,index,source:copy(profile()),start:{x:e.clientX,y:e.clientY},started:false};svg.setPointerCapture(e.pointerId);svg.focus({preventScroll:true});e.preventDefault();};
    svg.onpointermove=e=>{if(!drag||drag.svg!==svg)return;if(!drag.started){if(Math.hypot(e.clientX-drag.start.x,e.clientY-drag.start.y)<3)return;if(!api.begin()){drag=null;return;}drag.started=true;}api.change(moveTrunkDetailProfilePoint(drag.source,drag.index,coords(svg,e)));update();};
    svg.onpointerup=()=>{if(!drag)return;const started=drag.started;drag=null;if(started)api.finish();update();};
    svg.onpointercancel=()=>{if(drag?.started)api.cancel();clear();update();};
    svg.ondblclick=e=>{if(!api.state().editable||api.state().active)return;const p=coords(svg,e),next=insertTrunkDetailProfilePoint(profile(),p.x,p.y);if(!next){message('最多 25 个点；相邻点至少间隔宽度的 1%。');return;}index=next.points.findIndex(n=>n.x===p.x);apply(next);e.preventDefault();};
    svg.onkeydown=e=>{if(keyEvent(e))e.preventDefault();};
  });
  nodes('[data-profile-field]').forEach(input=>{
    input.oninput=()=>{if(input.value===''||!input.checkValidity())return;const value=Number(input.value)/100;if(!field){field=input.dataset.profileField;if(!api.begin()){field='';return;}}if(field!==input.dataset.profileField)return;api.change(moveTrunkDetailProfilePoint(profile(),index,{[field]:value}));update();};
    input.onchange=()=>{if(!field)return;if(!valid()){message('请输入范围内的有效数值，或 Esc 取消。');return;}field='';api.finish();update();};
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.onchange();}else if(e.key==='Escape'&&field){e.preventDefault();api.cancel();clear();update();}};
  });
  nodes('[data-profile-interpolation]').forEach(n=>n.onchange=()=>{const p=profile();if(p){p.interpolation=n.value;apply(p);}});
  nodes('[data-profile-action]').forEach(b=>b.onclick=()=>{
    const action=b.dataset.profileAction,p=profile();if(action==='save'){save(b.closest('[data-detail-profile-editor]'));return;}if(action==='reset'){apply(null);return;}if(!p)return;
    if(action==='mirror'){p.points=p.points.map(p=>({x:-p.x,y:p.y})).reverse();index=p.points.length-1-index;apply(p);}
    if(action==='remove'){const next=removeTrunkDetailProfilePoint(p,index);if(next){index=Math.min(index,next.points.length-2);apply(next);}}
    if(action==='add'){const next=insertTrunkDetailProfilePointAfter(p,index);if(next){index=Math.min(index+1,next.points.length-2);apply(next);}else message('无法加点：最多 25 点，相邻点至少间隔宽度的 1%。');}
  });
  function clear(){drag=nudge=null;field='';heldKeys.clear();}
  function keyEvent(e){
    const svg=e.target?.closest?.('[data-profile-graph]');
    if(e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||!svg||document.querySelector('dialog[open]'))return false;
    const key=e.key,arrow=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key),plain=!e.altKey&&!e.shiftKey;
    if(key==='Escape'&&plain&&nudge){api.cancel();clear();update();return true;}
    const action=({Delete:'remove',Backspace:'remove',Insert:'add',a:'add',A:'add',m:'mirror',M:'mirror'})[key];
    if(!arrow&&!(plain&&(action||key.toLowerCase()==='l'))&&!(key==='Tab'&&!e.altKey))return false;
    const s=api.state(),p=profile();if(!s.editable||!s.single||!p||s.active&&!nudge)return true;
    if(arrow){
      if(index===0||index===p.points.length-1){message('端点固定回到表面，Tab 切到内部点后微调。');return true;}
      const axis=key==='ArrowLeft'||key==='ArrowRight'?'x':'y',step=.01*(e.altKey?.1:e.shiftKey?5:1)*(key==='ArrowDown'||key==='ArrowLeft'?-1:1);
      const next=moveTrunkDetailProfilePoint(p,index,{[axis]:p.points[index][axis]+step});
      if(nudge)heldKeys.add(key);
      if(next.points[index][axis]===p.points[index][axis])return true;
      if(!nudge){if(!api.begin())return true;nudge={svg};heldKeys.add(key);}
      api.change(next);update();message(`微调第 ${index+1} 点 · 松键确认，Esc 取消`);return true;
    }
    if(nudge||e.repeat)return true;
    if(key==='Tab'){index=(index+(e.shiftKey?-1:1)+p.points.length)%p.points.length;update();return true;}
    if(action){const b=svg.closest('[data-detail-profile-editor]').querySelector(`[data-profile-action="${action}"]`);if(!b.disabled)b.click();}
    else{p.interpolation=p.interpolation==='LINEAR'?'SMOOTH':'LINEAR';apply(p);}
    return true;
  }
  window.addEventListener('keyup',e=>{if(!nudge||!heldKeys.delete(e.key))return;if(!heldKeys.size){nudge=null;api.finish();update();}e.preventDefault();e.stopImmediatePropagation();},true);
  window.addEventListener('blur',()=>{if(nudge){api.cancel();clear();update();}});
  window.addEventListener('resize',()=>{if(nudge){api.cancel();clear();update();}});
  nodes('[data-profile-graph]').forEach(svg=>svg.addEventListener('focusout',()=>{if(nudge?.svg===svg){api.cancel();clear();update();}}));
  function update(){
    const s=api.state(),p=profile();const nextKey=s.key;
    if(key!==nextKey){clear();index=p?Math.floor(p.points.length/2):1;key=nextKey;}
    if(p)index=Math.min(index,p.points.length-1);
    nodes('[data-profile-scope]').forEach(n=>n.textContent=s.scope+(p?(s.detail.profile?' · 自定义截面':' · 类型默认截面'):' · 单选才能拖点，多选可套预设'));
    nodes('[data-profile-selected]').forEach(n=>n.textContent=p?`点 ${index+1} / ${p.points.length}`+(index===0||index===p.points.length-1?' · 固定端点':''):'先单选一项或设定下一笔');
    const allowed=s.editable&&(!s.active||s.own),knots=Boolean(p&&s.single&&allowed),middle=p&&index>0&&index<p.points.length-1;
    nodes('[data-profile-graph]').forEach(svg=>{svg.classList.toggle('disabled',!knots);svg.innerHTML=`<path class="profile-zero" d="M20 20V150M20 85H280M150 20V150"/><text x="23" y="15">隆起</text><text x="23" y="165">凹陷</text><text x="261" y="165">宽度</text>`+(p?`<path class="profile-curve" d="${curve(p)}"/>`+p.points.map((v,i)=>`<circle data-profile-point="${i}" class="${i===index?'selected':''}" cx="${20+(v.x+1)*130}" cy="${85-v.y*65}" r="5"/>`).join(''):'');});
    nodes('[data-profile-field]').forEach(n=>{n.disabled=!knots||!middle||Boolean(drag);if(document.activeElement===n&&field===n.dataset.profileField)return;n.value=p?round(p.points[index][n.dataset.profileField]):'';});
    nodes('[data-profile-interpolation]').forEach(n=>{n.disabled=!knots||s.active;n.value=p?.interpolation||'SMOOTH';});
    nodes('[data-profile-action]').forEach(b=>{const a=b.dataset.profileAction;b.disabled=busy||!allowed||s.active||!s.targets||a==='remove'&&(!middle||!knots||p.points.length<=3)||a==='add'&&(!knots||p.points.length>=25)||a==='save'&&!p||a==='mirror'&&!knots;});
    nodes('[data-profile-preset]').forEach(b=>b.disabled=busy||!s.editable||s.active||!s.targets);
    nodes('[data-profile-delete]').forEach(b=>b.disabled=busy||s.active);
  }
  // The carrier's structural index is initialized after its child panels.
  // First rendering is owned by the parent's normal refresh lifecycle.
  return{update,clear,valid,refresh,key:keyEvent,get dragging(){return Boolean(drag?.started||nudge);}};
}
