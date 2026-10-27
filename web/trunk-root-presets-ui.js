import {createTrunkPresetStore} from './trunk-preset-store.js';
import {createTrunkPresetPreferences,filterTrunkPresetRecords,trunkPresetFilterMarkup} from './trunk-preset-library-ui.js';
import {TRUNK_ROOT_PRESETS,rootPresetSummary,captureTrunkRootPreset} from './trunk-root-presets.js';

export function createTrunkRootPresetUi(host,api){
  const toggle=document.createElement('button');toggle.type='button';toggle.dataset.rootPresetsToggle='true';toggle.innerHTML='预设库 <kbd>P</kbd>';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-keyshortcuts','P Shift+P');toggle.title='P 打开 / 收起板根形状库；Shift+P 命名另存当前白色板根';host.querySelector('.trunk-root-heading').append(toggle);
  const node=document.createElement('div');node.id='rootPresetLibrary';node.hidden=true;
  node.innerHTML=`<strong>板根形状 · 仅所选板根</strong><small data-root-preset-scope></small>
    <div class="root-preset-preview" hidden role="status"><span></span><button data-root-preset-confirm>确认 <kbd>Enter</kbd></button><button data-root-preset-cancel>取消 <kbd>Esc</kbd></button></div>
    ${trunkPresetFilterMarkup('root-preset','搜索板根形状')}
    <div class="root-preset-cards" role="group" aria-label="板根形状预设"></div>
    <div class="root-preset-save"><input data-root-preset-name maxlength="80" placeholder="另存白色当前板根" aria-label="新板根形状预设名称"><button data-root-preset-save>另存新预设</button></div>
    <small data-root-preset-status role="status"></small><button data-root-preset-refresh>刷新本机预设库</button>`;
  host.querySelector('.trunk-root-heading').after(node);
  let store=createTrunkPresetStore('root'),preferences=createTrunkPresetPreferences('root'),items=[],loaded=false,loading=false,busy=false,renderKey='',message='',open=false,focusNameAfterLoad=false;
  const q=s=>node.querySelector(s),search=q('[data-root-preset-search]'),filter=q('[data-root-preset-filter]'),name=q('[data-root-preset-name]'),cards=q('.root-preset-cards');
  function fail(error){message=error?.message||String(error);draw();}
  function refresh(){
    if(loading||busy)return;loading=true;draw();
    // A failed initial connection may be retried. An established disk store
    // keeps its backend so a lost route never reports a browser save instead.
    if(store.kind==='pending')store=createTrunkPresetStore('root');
    Promise.allSettled([store.list(),preferences.load()]).then(results=>{
      const [library,prefs]=results;if(library.status==='fulfilled'){items=library.value;loaded=true;message=store.warnings.join('；');}else message='读取失败：'+library.reason.message;
      if(prefs.status==='rejected')message+=(message?'；':'')+'导航读取失败：'+prefs.reason.message;
    }).finally(()=>{loading=false;renderKey='';draw();if(focusNameAfterLoad&&open&&!name.disabled){focusNameAfterLoad=false;name.focus({preventScroll:true});name.scrollIntoView({block:'nearest'});}});
  }
  async function preference(action){try{await action();renderKey='';draw();}catch(e){fail(e);}}
  function draw(){
    const s=api.state(),r=s.roots,trial=r.presetPreview,selected=r.selectedIds.length,canEdit=s.editable&&!s.active;
    toggle.disabled=!s.editable||s.active&&!trial;toggle.setAttribute('aria-expanded',String(open));host.classList.toggle('root-library-open',open);node.hidden=!open;
    if(!open)return;
    q('[data-root-preset-scope]').textContent=selected?'替换所选 '+selected+' 条的伸出／展开／沿干／强度；方向、根盘与截面保持。':'先在上方列表选板根，再点形状试用。';
    const banner=q('.root-preset-preview');banner.hidden=!trial;if(trial)banner.querySelector('span').textContent='试用「'+trial.name+'」· '+trial.ids.length+' 条 · 尚未确认';
    q('[data-root-preset-confirm]').disabled=Boolean(s.pending);q('[data-root-preset-cancel]').disabled=Boolean(s.pending);
    name.disabled=busy||loading||!canEdit||!selected;q('[data-root-preset-save]').disabled=name.disabled||!name.value.trim();q('[data-root-preset-refresh]').disabled=loading||busy||Boolean(trial);
    const primary=r.items.find(p=>p.id===r.primaryId);name.title=primary?'另存板根 '+(r.items.findIndex(p=>p.id===primary.id)+1)+' 的当前形状；创建新版本，方向不保存':'先选择板根';
    q('[data-root-preset-status]').textContent=(loading?'正在读取预设库…':trial?'当前只预览 · Enter 确认 / Esc 取消':message||store.backend)+(busy?' · 正在保存…':'');
    const records=filterTrunkPresetRecords([...TRUNK_ROOT_PRESETS,...items],{query:search.value,mode:filter.value},preferences.data),key=JSON.stringify([records,preferences.data,trial?.id,canEdit,selected,busy]);
    if(key===renderKey)return;renderKey=key;cards.replaceChildren();
    for(const record of records){
      const card=document.createElement('div');card.className='root-preset-card';card.dataset.rootPresetId=record.id;
      const use=document.createElement('button');use.type='button';use.dataset.rootPresetUse='true';use.disabled=busy||!selected||!s.editable||s.active&&!trial;use.setAttribute('aria-pressed',String(trial?.id===record.id));
      if(!record.builtin)use.title='保存于 '+new Date(record.updatedAt).toLocaleString('zh-CN')+' · 版本 '+record.id.slice(-6);
      const title=document.createElement('strong');title.textContent=record.name;const summary=document.createElement('small');summary.textContent=rootPresetSummary(record.shape);const kind=document.createElement('small');kind.textContent=(record.builtin?'内置形状':'自存版本')+' · 强度 '+Number((record.shape.strength*100).toFixed(1))+'%';use.append(title,summary,kind);use.onclick=()=>{if(api.previewRootPreset(record)){message='';draw();}};card.append(use);
      const favorite=document.createElement('button');favorite.type='button';favorite.className='trunk-preset-favorite';favorite.textContent='★';favorite.title='收藏「'+record.name+'」';favorite.setAttribute('aria-label',favorite.title);favorite.setAttribute('aria-pressed',String(preferences.data.favorites.includes(record.id)));favorite.disabled=busy;favorite.onclick=()=>preference(()=>preferences.toggle(record.id));card.append(favorite);
      if(!record.builtin){const remove=document.createElement('button');remove.type='button';remove.dataset.rootPresetRemove='true';remove.textContent='移除';remove.title='从个人库移除，树上已应用的形状保持';remove.disabled=busy||loading||s.active;remove.onclick=async()=>{if(busy||loading||api.state().active)return;busy=true;draw();try{await store.remove(record.id);items=items.filter(p=>p.id!==record.id);message='已从个人库移除「'+record.name+'」，工程形状保持。';await preferences.remove(record.id);}catch(e){message='移除失败：'+e.message;}finally{busy=false;renderKey='';draw();}};card.append(remove);}
      cards.append(card);
    }
    if(!records.length){const empty=document.createElement('small');empty.className='root-preset-empty';empty.textContent='没有匹配形状；可清空搜索或切回“全部”。';cards.append(empty);}
  }
  function close(focus=true){if(!open)return false;if(api.state().roots.presetPreview)api.cancel();open=false;focusNameAfterLoad=false;draw();if(focus&&!host.hidden)host.querySelector('[data-root-return]').focus({preventScroll:true});return true;}
  function show(focusName=false){
    const s=api.state();if(!s.editable||s.active&&!s.roots.presetPreview)return false;
    if(open&&!focusName)return close();open=true;focusNameAfterLoad=Boolean(focusName&&s.roots.selectedIds.length&&!s.active);draw();if(!loaded&&!loading)refresh();if(focusNameAfterLoad&&!name.disabled){focusNameAfterLoad=false;name.focus({preventScroll:true});name.scrollIntoView({block:'nearest'});}return true;
  }
  async function save(){
    const s=api.state(),root=s.roots.items.find(p=>p.id===s.roots.primaryId);if(busy||loading||s.active||!s.editable||!root||!name.value.trim())return;
    const input={name:name.value.trim(),shape:captureTrunkRootPreset(root)};busy=true;draw();
    try{const saved=await store.put(input);items=[saved,...items.filter(p=>p.id!==saved.id)];loaded=true;message='已另存「'+saved.name+'」· '+store.backend;name.value='';search.value='';filter.value='ALL';}
    catch(e){message='保存失败：'+e.message;}finally{busy=false;renderKey='';draw();}
  }
  toggle.onclick=()=>show();search.oninput=filter.onchange=()=>{renderKey='';draw();};name.oninput=draw;name.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();e.stopPropagation();save();}});
  node.addEventListener('pointerdown',()=>{focusNameAfterLoad=false;});
  q('[data-root-preset-save]').onclick=save;q('[data-root-preset-refresh]').onclick=refresh;q('[data-root-preset-confirm]').onclick=api.confirmRootPreset;q('[data-root-preset-cancel]').onclick=api.cancel;
  return{show,close,update(s){if(s.region!=='ROOT'||!s.enabled){open=false;focusNameAfterLoad=false;host.classList.remove('root-library-open');node.hidden=true;toggle.setAttribute('aria-expanded','false');return;}draw();},confirmed(record){message='已确认「'+record.name+'」';preference(()=>preferences.used(record.id));},get open(){return open;}};
}
