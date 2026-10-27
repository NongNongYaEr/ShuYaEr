import {TRUNK_ROOT_FIELDS} from './trunk-root-edit.js';
import {createTrunkNumberDrag} from './trunk-number-drag.js';
import {createTrunkRootPresetUi} from './trunk-root-presets-ui.js';

// Root shaping uses the same section workbench. These optional controls only
// adjust the existing generator recipe; they do not introduce another point set.
export function createTrunkRootUi(host,api){
  const node=document.createElement('div');node.id='sectionRootEditor';node.hidden=true;
  node.innerHTML=`<div class="trunk-root-heading"><strong>板根生成参数</strong></div>
    <p class="trunk-root-generator-help">这里调整板根的生成分布；局部造型请返回根盘，用主点 / 子点编辑。</p>
    <div class="trunk-root-list" role="group" aria-label="板根生成参数作用范围"></div>
    <div class="trunk-root-fields">${Object.entries(TRUNK_ROOT_FIELDS).map(([key,s])=>'<label><span>'+s.label+'</span><input data-root-field="'+key+'" type="number" min="'+s.min+'" max="'+s.max+'" step="any" aria-label="所选板根'+s.label+'"></label>').join('')}</div>
    <small data-root-field-hint>多选按同一增量调整；拖标签微调，松手确认。</small>
    <div class="trunk-root-management"><button data-root-action="add">新增 <kbd>N</kbd></button><button data-root-action="duplicate">复制 <kbd>⇧D</kbd></button><button data-root-action="remove">删除 <kbd>Del</kbd></button></div>
    <details class="trunk-root-base"><summary>根盘整体展开</summary><label><span>基部膨大倍率</span><input data-root-field="root_flare" type="number" min="0" max="3" step="any" aria-label="根盘整体膨大倍率"></label><small>调整已有基部膨大，不覆盖已修截面与沟纹。</small></details>
    <button data-root-return>返回圈点编辑 <kbd>Esc</kbd></button>`;
  host.append(node);const inputs=[...node.querySelectorAll('[data-root-field]')],list=node.querySelector('.trunk-root-list'),navigator=document.createElement('div');navigator.className='trunk-root-navigator';navigator.setAttribute('role','group');navigator.setAttribute('aria-label','根部轮廓与辅助参数');
  navigator.innerHTML='<button data-root-base title="根盘轮廓：与主干一样，用主点 / 子点编辑底部整圈">根盘轮廓</button><button data-root-plane="FOLLOW" title="根盘垂直于主干起始段；恢复原有方向">随树干</button><button data-root-plane="HORIZONTAL" title="让底圈与水平地面平行，向上平顺接回原树干；先预览再确认">水平根盘</button><button data-root-locate title="定位根部，保持选区">定位</button><button data-object-target="ROOT" title="辅助设置：调整已有板根的生成参数，不改变当前圈点选区">生成参数…</button>';
  navigator.querySelector('[data-root-base]').onclick=api.editRootBase;navigator.querySelectorAll('[data-root-plane]').forEach(b=>b.onclick=()=>api.previewRootPlane(b.dataset.rootPlane));navigator.querySelector('[data-root-locate]').onclick=api.focusRoot;navigator.querySelector('[data-object-target]').onclick=()=>api.setRegion(api.state().region==='ROOT'?'SECTION':'ROOT');node.before(navigator);
  node.querySelector('[data-root-return]').onclick=()=>api.setRegion('SECTION');
  const planePreview=document.createElement('div');planePreview.className='trunk-root-plane-preview';planePreview.hidden=true;planePreview.innerHTML='<span>根盘方向预览 · 基部中心不变</span><button data-root-plane-confirm>确认 <kbd>Enter</kbd></button><button data-root-plane-cancel>取消 <kbd>Esc</kbd></button>';navigator.append(planePreview);planePreview.querySelector('[data-root-plane-confirm]').onclick=api.confirmRootPlane;planePreview.querySelector('[data-root-plane-cancel]').onclick=api.cancel;

  const library=createTrunkRootPresetUi(node,api),state=()=>api.state();
  node.querySelectorAll('[data-root-action]').forEach(b=>b.onclick=()=>({add:api.addRoot,duplicate:api.duplicateRoots,remove:api.removeRoots}[b.dataset.rootAction])());
  for(const input of inputs){input.addEventListener('input',()=>{if(input.value!==''&&input.checkValidity())api.editRootField(input.dataset.rootField,Number(input.value));});input.addEventListener('change',api.flush);input.addEventListener('blur',()=>{if(state().roots.field===input.dataset.rootField&&input.value!==''&&input.checkValidity())api.flush();});input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(api.flush())input.blur();}});}
  const scrub=createTrunkNumberDrag({inputs,canStart:input=>{const s=state();return s.editable&&!s.active&&(input.dataset.rootField==='root_flare'||s.roots.selectedIds.length>0);},cancel:api.cancel,step:input=>TRUNK_ROOT_FIELDS[input.dataset.rootField]?.step||.01});
  function update(s){
    node.hidden=s.region!=='ROOT';library.update(s);const r=s.roots,selected=new Set(s.region==='ROOT'?r.selectedIds:[]),primary=r.items.find(p=>p.id===r.primaryId),key=JSON.stringify(r.items.map(p=>p.id));
    if(list.dataset.items!==key){list.dataset.items=key;list.replaceChildren(...r.items.map((p,i)=>{const b=document.createElement('button');b.dataset.rootSelect=p.id;b.textContent='板根 '+(i+1);b.title='参数作用范围：点击单选 · Shift 加选 · Ctrl 减选';b.onclick=e=>api.selectRootItem(p.id,{mode:e.ctrlKey?'SUBTRACT':e.shiftKey?'ADD':'REPLACE'});return b;}));}
    list.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',selected.has(b.dataset.rootSelect));b.setAttribute('aria-pressed',String(selected.has(b.dataset.rootSelect)));b.classList.toggle('root-primary',selected.has(b.dataset.rootSelect)&&b.dataset.rootSelect===r.primaryId);b.disabled=s.active||!s.editable;});
    const base=navigator.querySelector('[data-root-base]');base.disabled=!s.editable||s.active;base.setAttribute('aria-pressed',String(Boolean(s.rootBase)));const target=navigator.querySelector('[data-object-target]');target.setAttribute('aria-pressed',String(s.region==='ROOT'));target.disabled=!s.editable||s.active;navigator.querySelector('[data-root-locate]').disabled=!s.editable||s.active;navigator.hidden=!s.enabled;

    for(const b of navigator.querySelectorAll('[data-root-plane]')){b.hidden=!s.rootBase||!s.rootPlane.supported;b.disabled=!s.editable||s.active;b.setAttribute('aria-pressed',String(s.rootPlane.mode===b.dataset.rootPlane));}
    planePreview.hidden=!s.rootPlane.preview;planePreview.querySelector('span').textContent=(s.rootPlane.mode==='HORIZONTAL'?'水平根盘':'随树干方向')+' · 预览中，尚未保存';planePreview.querySelectorAll('button').forEach(b=>b.disabled=Boolean(s.pending));
    if(node.hidden)return;
    for(const input of inputs){const key=input.dataset.rootField;input.disabled=!s.editable||s.active&&(r.field!==key||r.dragging)||key!=='root_flare'&&!selected.size;const value=key==='root_flare'?r.flare:primary?(key==='height'?primary.height*100:primary[key]):null;if(!(r.field===key&&document.activeElement===input))input.value=value===null?'':Number(value.toFixed(5));}
    node.querySelector('.trunk-root-heading strong').textContent=r.selectedIds.length?'生成参数 · 已选 '+r.selectedIds.length+' 条':'板根生成参数 · 未选择';
    node.querySelector('[data-root-field-hint]').textContent=selected.size>1?'以当前读数为基准，所选项同量调整；Esc 取消。':selected.size?'拖标签微调 · 松手 / Enter 确认 · Esc 取消':'选编号后调整生成参数；根盘展开可单独设置。';
    node.querySelector('[data-root-return]').disabled=s.active;
    for(const b of node.querySelectorAll('[data-root-action]')){const action=b.dataset.rootAction;b.disabled=!s.editable||s.active||action==='add'&&r.items.length>=12||['duplicate','remove'].includes(action)&&!selected.size;}
  }
  return{node,navigator,update,togglePresets:library.show,closePresets:library.close,presetConfirmed:library.confirmed,cancel(){scrub.cancel();if(!node.hidden)update(state());},get active(){return false;},valid:()=>node.hidden||state().region!=='ROOT'||inputs.every(input=>input.disabled||input.value!==''&&input.checkValidity())};
}
