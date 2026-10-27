import {createTrunkNumberDrag} from './trunk-number-drag.js';

export function createTrunkSectionRangeUi({node,alongBranch,api,focusPoints}){
  const entry=document.createElement('button');entry.type='button';entry.dataset.sectionRangeOpen='true';entry.textContent='调整区段…';entry.title='明确选择起止圈，再一起调整粗细和扭转';alongBranch.append(entry);
  const panel=document.createElement('section');panel.id='sectionRangePanel';panel.hidden=true;panel.setAttribute('aria-label','区段粗细与扭转');
  panel.innerHTML=`<header><strong>区段调整</strong><button type="button" data-range-close>返回修圈 <kbd>Esc</kbd></button></header>
    <div class="section-range-ends"><label>靠根起圈<select data-range-end="startId" aria-label="区段靠根起圈"></select></label><label>靠梢止圈<select data-range-end="endId" aria-label="区段靠梢止圈"></select></label></div>
    <div class="section-range-mark"><button type="button" data-range-mark="startId">当前设起圈 <kbd>⇧[</kbd></button><button type="button" data-range-mark="endId">当前设止圈 <kbd>⇧]</kbd></button></div>
    <p data-range-scope role="status"></p><div class="section-range-locks"><label><input type="checkbox" data-range-option="lockRoot">锁靠根端</label><label><input type="checkbox" data-range-option="lockTip">锁靠梢端</label><label>衰减<select data-range-option="falloff"><option value="SMOOTH">边界柔和</option><option value="UNIFORM">均匀影响</option></select></label></div>
    <div class="section-range-values"><label><span>粗细增量 %</span><input data-range-number="radiusPercent" type="number" min="-80" max="100" step="any" value="0"></label><label><span>扭转增量 °</span><input data-range-number="twist" type="number" min="-90" max="90" step="any" value="0"></label><label><span>影响强度 %</span><input data-range-number="strength" type="number" min="0" max="100" step="any" value="100"></label></div>
    <div data-range-members></div><small data-range-note></small><p data-range-result role="status"></p><div class="section-range-confirm"><button type="button" data-range-cancel>取消预览 <kbd>Esc</kbd></button><button type="button" data-range-confirm>确认区段 <kbd>Enter</kbd></button></div>`;
  node.querySelector('.section-edit-workspace').before(panel);
  const numbers=[...panel.querySelectorAll('[data-range-number]')];let revision=-1;
  const valid=()=>numbers.every(input=>input.value!==''&&input.checkValidity());
  entry.onclick=()=>{if(api.openRange()){alongBranch.open=false;node.scrollTop=0;}};
  panel.querySelector('[data-range-close]').onclick=()=>{if(api.closeRange())focusPoints();};
  panel.querySelectorAll('[data-range-end]').forEach(select=>select.onchange=()=>api.selectRange({[select.dataset.rangeEnd]:select.value}));
  panel.querySelectorAll('[data-range-mark]').forEach(button=>button.onclick=()=>api.selectRange({[button.dataset.rangeMark]:api.state().section?.id||''}));
  function edit(patch){api.editRange(patch);update(api.state());}
  panel.querySelectorAll('[data-range-option]').forEach(input=>input.onchange=()=>edit({[input.dataset.rangeOption]:input.type==='checkbox'?input.checked:input.value}));
  numbers.forEach(input=>input.oninput=()=>{if(valid())edit({[input.dataset.rangeNumber]:Number(input.value)});else update(api.state());});
  panel.querySelector('[data-range-confirm]').onclick=()=>{if(valid())api.confirmRange();};panel.querySelector('[data-range-cancel]').onclick=()=>api.cancelRange();
  createTrunkNumberDrag({inputs:numbers,canStart:()=>{const s=api.state();return s.range?.open&&s.editable&&(!s.active||s.range.preview);},step:input=>input.dataset.rangeNumber==='twist' ? .25 : .5,cancel:()=>api.cancelRange()});
  numbers.forEach(input=>input.closest('label').querySelector('span').addEventListener('pointerenter',event=>{if(!input.disabled&&input.value!==''&&input.checkValidity())event.currentTarget.title='左右拖动预览 · Shift 大步 / Alt 精调 · 松手继续预览，Enter 确认整段 / Esc 取消';}));
  function update(state){
    const range=state.range;entry.disabled=!state.direct||!state.editable||state.active;entry.title=state.direct?'先选择起止圈，再预览整段粗细和扭转':'旧版配方须先明确升级为直接截面';
    panel.hidden=!range?.open;node.classList.toggle('section-range-open',Boolean(range?.open));if(!range?.open)return;
    const own=range.preview,busy=state.active&&!own,reset=revision!==range.revision;revision=range.revision;
    const items=state.sections.slice().sort((a,b)=>a.t-b.t),key=JSON.stringify(items.map(s=>[s.id,s.t]));
    for(const select of panel.querySelectorAll('[data-range-end]')){if(select.dataset.items!==key){select.dataset.items=key;select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='请选择一圈';select.append(empty);items.forEach((s,i)=>{const option=document.createElement('option');option.value=s.id;option.textContent=`圈 ${i+1} · ${(s.t*100).toFixed(1)}%`;select.append(option);});}select.value=range.selection[select.dataset.rangeEnd]||'';select.disabled=own||busy;}
    panel.querySelectorAll('[data-range-mark]').forEach(b=>b.disabled=own||busy||!state.section);
    numbers.forEach(input=>{if(reset||document.activeElement!==input)input.value=range.options[input.dataset.rangeNumber];input.disabled=busy||!state.editable||!range.valid;});
    panel.querySelectorAll('[data-range-option]').forEach(input=>{if(input.type==='checkbox')input.checked=range.options[input.dataset.rangeOption];else input.value=range.options[input.dataset.rangeOption];input.disabled=busy||!state.editable;});
    panel.querySelector('[data-range-scope]').textContent=range.valid?`区段 ${range.members.length} 圈 · 参与调整 ${range.affected.length} 圈${range.shadowed.length?' · 重叠未生效 '+range.shadowed.length+' 圈':''}`:range.reason;
    const members=panel.querySelector('[data-range-members]');members.replaceChildren(...range.weights.map(w=>{const row=document.createElement('span');row.dataset.rangeMember=w.id;row.dataset.rangeWeight=w.weight;row.textContent=`${(w.t*100).toFixed(1)}% · ${w.shadowed?'重叠不改':w.locked?'锁定':(w.weight*100).toFixed(0)+'% 影响'}`;row.title=w.id;return row;}));
    panel.querySelector('[data-range-note]').textContent=(!range.options.lockRoot||!range.options.lockTip?'端点解锁会连带外侧邻圈间的过渡。':'两端锁定，保持外侧过渡。')+' 紫色为参与圈；只调整整圈参数，不移动或重配控制点。';
    panel.querySelector('[data-range-result]').textContent=!valid()?'先修正范围内的数值，或 Esc 取消':range.limited?.length?`${range.limited.length} 圈已到粗细／扭转边界`:own?`预览中 · 实际改变 ${range.changed?.length||0} 圈 · 确认后一次撤销`:range.valid&&!range.affected.length?'当前范围没有可调整圈；可扩大范围或解锁端点':'输入增量或拖动参数标签预览；Enter 确认，Esc 取消';
    panel.querySelector('[data-range-close]').disabled=own||busy;
    panel.querySelector('[data-range-cancel]').disabled=!own||busy;
    panel.querySelector('[data-range-confirm]').disabled=!own||busy||!valid();
  }
  function key(event){
    const s=api.state();if(!s.range?.open||event.defaultPrevented||event.isComposing||event.repeat||event.ctrlKey||event.metaKey||event.altKey||document.querySelector('dialog[open]'))return false;
    if(event.key==='Escape'&&!event.shiftKey){if(s.range.preview)api.cancelRange();else if(api.closeRange())focusPoints();return true;}
    if(event.key==='Enter'&&!event.shiftKey&&s.range.preview){if(valid())api.confirmRange();return true;}
    const typing=event.target?.matches?.('input,textarea,select')||event.target?.isContentEditable;
    if(event.shiftKey&&!typing&&(event.code==='BracketLeft'||event.code==='BracketRight'||['[',']','{','}'].includes(event.key))){if(!s.active)api.selectRange({[event.code==='BracketLeft'||['[','{'].includes(event.key)?'startId':'endId']:s.section?.id||''});return true;}
    return false;
  }
  return{update,key,valid:()=>!api.state().range?.open||valid()};
}
