import * as THREE from 'three';
import { createTrunkDetail, createTrunkDetailId, normalizeTrunkDetails, TRUNK_DETAIL_DEFAULTS } from './trunk-details.js';
import { transformTrunkDetailSelection, placeTrunkDetailPreset, redrawTrunkDetail, moveTrunkDetailPathPoint } from './trunk-detail-edit.js';
export { transformTrunkDetailSelection } from './trunk-detail-edit.js';
import { TRUNK_DETAIL_PRESETS, TRUNK_DETAIL_COMBINATIONS, normalizeTrunkDetailPresetShape } from './trunk-detail-presets.js';
import {captureTrunkDetailRecipe} from './trunk-detail-recipe.js';
import { createTrunkPresetStore } from './trunk-preset-store.js';
import { createSectionProfileMarker } from './trunk-section-marker.js';
import { createSectionOverlayLine, hitSectionPolyline } from './trunk-section-overlay.js';
import {createTrunkDetailProfileEditor} from './trunk-detail-profile-editor.js';
import {trunkWorkflowMarkup,updateTrunkWorkflow,TRUNK_WORKFLOW_LABELS} from './trunk-workflow-ui.js';
import {createTrunkNumberDrag} from './trunk-number-drag.js';
import {createTrunkShortcutHelp} from './trunk-shortcut-help.js';
import {createTrunkPresetPreferences,filterTrunkPresetRecords,trunkPresetFilterMarkup,trunkDetailPresetThumbnail} from './trunk-preset-library-ui.js';

export const TRUNK_DETAIL_NAMES = Object.freeze({ GROOVE:'纵沟', RIDGE:'脊线', KNOT:'树瘤', SCAR:'疤结', FLARE:'局部鼓包', WRINKLE:'细皱' });
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), wrap=v=>(v%360+360)%360;
const signed=(a,b)=>((b-a+540)%360)-180;
const clone=value=>structuredClone(value);

export function trunkDetailShortcut(event={}, { enabled=false, active=false, typing=false, dialogOpen=false }={}) {
  if(!enabled||event.defaultPrevented||event.isComposing||dialogOpen||event.repeat||event.metaKey)return null;
  const key=(event.key||{KeyA:'a',KeyG:'g',KeyR:'r',KeyS:'s',KeyD:'d',KeyI:'i',KeyE:'e',KeyH:'h',KeyF:'f',KeyP:'p',KeyV:'v',KeyC:'c',KeyT:'t',Digit1:'1',Digit2:'2',Digit3:'3',Home:'home',Delete:'delete',Escape:'escape',Enter:'enter'}[event.code]||'').toLowerCase();
  if(typing)return active&&key==='escape'&&!event.ctrlKey&&!event.shiftKey&&!event.altKey?'CANCEL':null;
  if(event.ctrlKey)return !event.shiftKey&&!event.altKey?({a:'ALL',d:'CLEAR',i:'INVERT'})[key]||null:null;
  if(event.altKey)return null;
  if(event.shiftKey)return ({d:'DUPLICATE',p:'SAVE_PRESET',f:'STRENGTH',r:'REDRAW',a:'REPEAT_PRESET',e:'ENABLE',h:'DISABLE'})[key]||null;
  return ({escape:'CANCEL',enter:active?'CONFIRM':null,a:'ADD',g:'SLIDE',r:'TURN',s:'SIZE',f:'BRUSH_SIZE',p:'PRESETS',v:'SELECT',c:'PAINT','1':'POINT','2':'PATH','3':'PAINT',home:'FOCUS',delete:'REMOVE',t:'SAMPLE'})[key]||null;
}

// The form controller is the only authoring/history owner. This component
// keeps a transient selection, routes surface gestures and edits its draft.
export function createTrunkDetailControls(api) {
  const section=document.createElement('details');section.className='trunk-form-section trunk-detail-panel';section.dataset.trunkSubpanel='detail-library';
  section.innerHTML=`<summary>${TRUNK_WORKFLOW_LABELS.DETAIL}与组合库</summary><p class="trunk-detail-legacy" hidden>${TRUNK_WORKFLOW_LABELS.DETAIL}需要直接截面。先点击「开始直接截面」，检查效果后确认。</p><div class="trunk-detail-kind-grid"></div>
    <div class="trunk-detail-tools"><button data-detail-tool="SELECT">选择 <kbd>V</kbd></button><button data-detail-tool="POINT">点放置</button><button data-detail-tool="PATH">画走势</button><button data-detail-tool="PAINT">刷区域 <kbd>C</kbd></button></div>
    <small>点下方类型即可开始添加，无需再按 A。紫色标记对应已有细节；点击标记或列表选中后调整。</small>
    <div class="trunk-detail-summary"><span data-detail-count></span><button data-detail-action="all">全选</button><button data-detail-action="clear">清空选择</button></div><div data-detail-list class="trunk-detail-list"></div>
    <div class="trunk-detail-batch"><button data-detail-action="slide">滑动 G</button><button data-detail-action="turn">绕干 R</button><button data-detail-action="size">范围 S</button><button data-detail-action="duplicate">复制 ⇧D</button><button data-detail-action="enable">启用所选</button><button data-detail-action="disable">暂停所选</button><button data-detail-action="remove">删除所选</button><button data-detail-action="redraw">重画走势</button><button data-detail-action="repeat-preset">再放组合</button></div>
    <div class="trunk-detail-cm-values"><label>绕干宽 cm<input data-detail-cm="width" type="number" min="0.01" max="100000" step="any"></label><label>沿枝宽 cm<input data-detail-cm="height" type="number" min="0.01" max="100000" step="any"></label></div><small data-detail-cm-note></small>
    <p class="trunk-detail-path-hint" data-detail-path-hint hidden></p>
    <div class="trunk-detail-value-scope"><span data-detail-value-scope></span><button data-detail-action="reset-recipe">默认参数</button></div>
    <div class="trunk-detail-values"><label>强度 <input data-detail-value="strength" type="number" min="0" max="100" step="1"></label><label>角向宽度 ° <input data-detail-value="width" type="number" min="1" max="180" step="any"></label><label>沿枝范围 % <input data-detail-value="height" type="number" min="0.1" max="100" step="any"></label></div>
    <div class="trunk-detail-library-switch"><button data-detail-library="detail">单项预设</button><button data-detail-library="combination">细节组合</button></div>
    <div data-detail-presets class="trunk-detail-presets"></div><div class="trunk-detail-save"><input data-detail-name maxlength="80" placeholder="所选细节的预设名称"><button data-detail-action="save">另存所选</button></div><p data-detail-storage></p><p data-detail-status role="status"></p>`;
  api.panel.querySelector('#trunkFormHandles').before(section);
  const dock=document.createElement('section');dock.id='trunkDetailDock';dock.hidden=true;dock.setAttribute('aria-label','视口表面细节编辑');
  dock.innerHTML=`<header><strong>${TRUNK_WORKFLOW_LABELS.DETAIL}</strong><span data-detail-target></span><button data-detail-action="exit" title="完成主干编辑；自动暂停的单元枝会恢复">×</button></header>
    ${trunkWorkflowMarkup('detail')}
    <div class="trunk-workflow-notice" data-detail-guide role="status"></div>
    <div class="trunk-detail-kind-grid"></div><div class="trunk-detail-tools"><button data-detail-tool="SELECT">选已有 V</button><button data-detail-tool="POINT">点放置</button><button data-detail-tool="PATH">画走势</button><button data-detail-tool="PAINT">刷区域 C</button></div>
    <label class="trunk-detail-continuous"><input data-detail-continuous type="checkbox">连续添加同类细节</label>
    <div class="trunk-detail-dock-actions"><button data-detail-action="add">添加 A</button><button data-detail-action="slide">滑动 G</button><button data-detail-action="turn">绕干 R</button><button data-detail-action="size">范围 S</button><button data-detail-action="duplicate">复制 ⇧D</button><button data-detail-action="redraw">重画走势</button><button data-detail-action="remove">删除</button><button data-detail-action="focus">定位</button><button data-detail-action="enable">启用所选</button><button data-detail-action="disable">暂停所选</button><button data-detail-action="presets">预设 P</button><button data-detail-action="repeat-preset" title="重复上次确认的预设，在本枝表面重新放置">再放组合</button></div>
    <div class="trunk-detail-brush"><label>刷涂半径 <input data-detail-radius type="range" min="12" max="180" step="1" value="48"></label><span data-detail-radius-label>48 px</span></div>
    <div class="trunk-detail-summary"><span data-detail-count></span><button data-detail-action="all">全选</button><button data-detail-action="clear">清空</button></div><div data-detail-list class="trunk-detail-list"></div>
    <div class="trunk-detail-cm-values"><label>绕干宽 cm<input data-detail-cm="width" type="number" min="0.01" max="100000" step="any"></label><label>沿枝宽 cm<input data-detail-cm="height" type="number" min="0.01" max="100000" step="any"></label></div><small data-detail-cm-note></small>
    <p class="trunk-detail-path-hint" data-detail-path-hint hidden></p>
    <div class="trunk-detail-value-scope"><span data-detail-value-scope></span><button data-detail-action="reset-recipe">默认参数</button></div>
    <div class="trunk-detail-values"><label>凹凸强度 % <input data-detail-value="strength" type="number" min="0" max="100" step="1"></label><label>绕干宽度 ° <input data-detail-value="width" type="number" min="1" max="180" step="any"></label><label>沿枝范围 % <input data-detail-value="height" type="number" min="0.1" max="100" step="any"></label></div>
    <details data-detail-local-library><summary>预设与组合 · 保存 / 复用</summary><div class="trunk-detail-library-switch"><button data-detail-library="detail">单项预设</button><button data-detail-library="combination">细节组合</button></div><div data-detail-presets class="trunk-detail-presets"></div><div class="trunk-detail-save"><input data-detail-name maxlength="80" placeholder="所选细节的预设名称"><button data-detail-action="save">另存所选</button></div></details>
    <p data-detail-hint></p><small>Shift 加选 · Ctrl 切换/拖框减选 · G/R/S 移动鼠标 · 左键/Enter 确认 · Esc 取消</small>
    <footer class="trunk-workflow-footer"><button data-workflow-mesh>网格精度 / 线框</button><button data-workflow-done>完成调整</button></footer>`;
  api.canvas.parentElement.append(dock);
  const toolbar=document.createElement('div');toolbar.className='trunk-dock-toolbar';dock.prepend(toolbar);toolbar.append(dock.querySelector('header'),dock.querySelector('.trunk-workflow-steps'));
  // One work surface, with controls exposed for the current task rather than
  // twelve permanently disabled actions. The existing edit ownership stays.
  const createGroup=document.createElement('details');createGroup.dataset.detailCreate='';createGroup.className='detail-workflow-group';createGroup.open=true;createGroup.innerHTML='<summary>添加细节 · 点类型开始</summary>';
  dock.querySelector('[data-detail-guide]').after(createGroup);
  ['.trunk-detail-kind-grid','.trunk-detail-tools','.trunk-detail-continuous','.trunk-detail-brush'].forEach(selector=>createGroup.append(dock.querySelector(selector)));
  const selectedActions=dock.querySelector('.trunk-detail-dock-actions');selectedActions.classList.add('detail-selected-actions');
  selectedActions.insertAdjacentHTML('beforeend','<button data-detail-action="sample" title="T · 取样一项已有细节的截面、强度和厘米尺寸，重新画下一笔；已有细节保持">取样再画 T</button>');
  const more=document.createElement('details');more.className='detail-workflow-group';more.dataset.detailMore='';more.innerHTML='<summary>更多选中项操作</summary><div class="trunk-detail-batch"></div>';
  ['enable','disable','focus'].forEach(action=>more.lastElementChild.append(selectedActions.querySelector(`[data-detail-action="${action}"]`)));
  const libraryActions=document.createElement('div');libraryActions.className='detail-library-actions';
  ['presets','repeat-preset'].forEach(action=>libraryActions.append(selectedActions.querySelector(`[data-detail-action="${action}"]`)));
  const again=selectedActions.querySelector('[data-detail-action="add"]');again.textContent='再加一笔 A';
  libraryActions.prepend(again);libraryActions.insertBefore(selectedActions.querySelector('[data-detail-action="sample"]'),libraryActions.querySelector('[data-detail-action="presets"]'));toolbar.append(libraryActions);libraryActions.append(dock.querySelector('.trunk-detail-continuous'));
  dock.querySelector('[data-detail-list]').after(selectedActions,more);
  const valueScope=dock.querySelector('.trunk-detail-value-scope'),cm=dock.querySelector('.trunk-detail-cm-values'),values=dock.querySelector('.trunk-detail-values');cm.before(valueScope);cm.append(values.querySelector('[data-detail-value="strength"]').closest('label'));
  const settings=document.createElement('details');settings.className='detail-workflow-group';settings.dataset.detailSettings='';settings.innerHTML='<summary>高级尺寸 · 角度 / 沿枝百分比</summary>';values.before(settings);settings.append(values);
  const recipeZone=document.createElement('div');recipeZone.className='trunk-detail-recipe-zone';cm.before(recipeZone);recipeZone.append(valueScope,cm,dock.querySelector('[data-detail-cm-note]'));
  for(const n of [section,dock.querySelector('[data-detail-local-library]')]){const tabs=n.querySelector('.trunk-detail-library-switch');tabs.after(Object.assign(document.createElement('div'),{innerHTML:trunkPresetFilterMarkup('detail-preset','搜索一笔细节或组合')+'<small>走势示意 · 一笔细节 / 细节组合均在表面预览后确认；横截面在「细节截面」中编辑。</small>'}));}
  [section,dock].forEach(n=>n.querySelector('[data-detail-library="detail"]').textContent='一笔细节');
  const cursor=document.createElement('div');cursor.className='trunk-detail-cursor';cursor.hidden=true;api.canvas.parentElement.append(cursor);
  const box=document.createElement('div');box.className='trunk-detail-selection-box';box.hidden=true;api.canvas.parentElement.append(box);
  const markers=new THREE.Group();markers.name='TrunkDetailMarkers';api.root.add(markers);
  const stores={detail:createTrunkPresetStore('detail'),combination:createTrunkPresetStore('combination')};
  const preferences={detail:createTrunkPresetPreferences('detail'),combination:createTrunkPresetPreferences('combination')};
  let presetQuery='',presetFilter='ALL',preferenceVersion=0;
  let selected=new Set(),tool='SELECT',type='GROOVE',armed=false,redrawId='',lastPreset=null,operation=null,hover='',hoverPathIndex=-1,pathIndex=-1,currentTarget='',lastPointer=null,brushRadius=48,libraryKind='detail',presets={detail:[],combination:[]},busy=false,libraryLoaded=new Set(),renderKey='',drawingKey='',contextKey='',libraryKey='';
  const recipes=structuredClone(TRUNK_DETAIL_DEFAULTS);
  const recipeSizes={};
  let wasAdding=false,shownSelection='';
  let sizeNotice='';
  let profileEditor=null;
  let numberDrag=null;
  const allNodes=[section,dock], controls=selector=>allNodes.flatMap(n=>[...n.querySelectorAll(selector)]), $=selector=>section.querySelector(selector);
  const preferenceChange=async action=>{try{await action();preferenceVersion++;renderLibrary();}catch(e){message(e.message);}};
  controls('[data-detail-preset-search]').forEach(n=>n.oninput=()=>{presetQuery=n.value;controls('[data-detail-preset-search]').filter(m=>m!==n).forEach(m=>m.value=n.value);renderLibrary();});
  controls('[data-detail-preset-filter]').forEach(n=>n.onchange=()=>{presetFilter=n.value;controls('[data-detail-preset-filter]').forEach(m=>m.value=n.value);renderLibrary();});
  const shortcutHelp=createTrunkShortcutHelp(dock,'detail');
  controls('.trunk-detail-summary').forEach(row=>{const b=document.createElement('button');b.dataset.detailAction='invert';b.textContent='反选';row.append(b);});
  const detailKeys={sample:'T',all:'Ctrl+A',clear:'Ctrl+D',invert:'Ctrl+I',redraw:'Shift+R','repeat-preset':'Shift+A',enable:'Shift+E',disable:'Shift+H',focus:'Home',remove:'Delete',add:'A',slide:'G',turn:'R',size:'S',duplicate:'Shift+D',presets:'P',save:'Shift+P'};
  controls('[data-detail-action]').forEach(b=>{const key=detailKeys[b.dataset.detailAction];if(key){b.setAttribute('aria-keyshortcuts',key);b.title=key+' · '+b.textContent.trim()+(b.title?'；'+b.title:'');}});
  controls('[data-detail-tool]').forEach(b=>{const key={POINT:'1',PATH:'2',PAINT:'3 C',SELECT:'V'}[b.dataset.detailTool];b.setAttribute('aria-keyshortcuts',key);b.title=key+' · '+b.textContent.trim();if(['POINT','PATH'].includes(b.dataset.detailTool))b.append(document.createTextNode(' '+key));});
  const state=()=>api.state(), entries=()=>api.draft()?.details||[], chosen=()=>entries().filter(d=>selected.has(d.id));
  const editing=()=>Boolean(operation), ready=()=>state().enabled&&state().direct&&state().editable&&!state().active;
  const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
  function profileState(){
    const s=state(),own=operation?.kind==='PROFILE',next=armed&&!redrawId&&(!operation||own&&operation.recipe),items=next?[{type,...recipes[type]}]:chosen();
    return{key:s.target+':'+(next?'next:'+type:[...selected].sort().join(',')),detail:items.length===1?items[0]:null,single:items.length===1,targets:items.length,
      scope:next?'下一笔 · '+TRUNK_DETAIL_NAMES[type]:items.length===1?'所选 · '+TRUNK_DETAIL_NAMES[items[0].type]:'所选 '+items.length+' 项',
      editable:s.enabled&&s.direct&&s.editable&&!redrawId,active:Boolean(operation||s.active),own};
  }
  function beginProfile(){
    if(operation)return operation.kind==='PROFILE';
    if((!state().enabled||state().mode!=='DETAIL')&&!activate())return false;
    if(!ready()||!profileState().targets)return false;
    if(state().view!=='FINAL')api.setView('FINAL');
    const recipe=armed&&!redrawId;if(!recipe&&!api.begin('编辑细节横截面'))return false;
    operation={kind:'PROFILE',recipe,recipeType:type,beforeRecipe:clone(recipes[type]),source:clone(entries()),beforeSelection:new Set(selected),controlEnabled:api.controls.enabled};
    return true;
  }
  function changeProfile(profile){
    const op=operation;if(op?.kind!=='PROFILE')return;
    const patch=d=>{const next={...d};if(profile)next.profile=clone(profile);else delete next.profile;return next;};
    if(op.recipe){recipes[op.recipeType]=patch(recipes[op.recipeType]);return;}
    api.draft().details=normalizeTrunkDetails(op.source.map(d=>selected.has(d.id)?patch(d):d));api.preview();
  }
  function message(value){$('[data-detail-status]').textContent=value;dock.querySelector('[data-detail-hint]').textContent=value;}
  function activate(){if(!api.selectMode('DETAIL'))return false;section.open=true;return true;}
  function mode(next){if(operation)cancel();if(!activate())return false;redrawId='';tool=next;armed=next!=='SELECT';if(armed&&state().view!=='FINAL')api.setView('FINAL');update();return true;}
  function kind(next){type=next;mode(['GROOVE','RIDGE','SCAR'].includes(next)?'PATH':'POINT');}
  const glyphs={GROOVE:'M10 4Q24 25 10 46M28 4Q16 25 28 46',RIDGE:'M5 42Q10 25 20 8Q30 25 35 42',KNOT:'M6 25C5 8 36 8 36 25C36 43 6 43 6 25M12 25C12 16 30 16 30 25C30 35 12 35 12 25',SCAR:'M7 6L33 44M12 12L27 7M17 23L33 19M21 33L35 31',FLARE:'M7 4Q25 20 7 46M33 4Q15 20 33 46',WRINKLE:'M5 10Q15 4 25 10T37 10M5 22Q15 16 25 22T37 22M5 34Q15 28 25 34T37 34'};
  for(const grid of controls('.trunk-detail-kind-grid'))for(const [key,name]of Object.entries(TRUNK_DETAIL_NAMES)){const b=document.createElement('button');b.type='button';b.dataset.detailKind=key;b.title=`${name} · 选择后可点放置、画走势或刷区域`;b.innerHTML=`<svg viewBox="0 0 42 50" aria-hidden="true"><path d="${glyphs[key]}"/></svg><span>${name}</span>`;b.onclick=()=>kind(key);grid.append(b);}
  controls('[data-detail-tool]').forEach(b=>b.onclick=()=>mode(b.dataset.detailTool));
  dock.querySelector('[data-detail-continuous]').onchange=()=>api.canvas.focus({preventScroll:true});
  function clearMarkers(){for(const o of [...markers.children]){o.traverse(c=>{c.geometry?.dispose();(Array.isArray(c.material)?c.material:[c.material]).forEach(m=>m?.dispose());});markers.remove(o);}}
  function draw(){
    const s=state(),key=JSON.stringify([s.enabled,s.mode,s.view,s.target,s.geometryKey,entries(),[...selected],hover,hoverPathIndex,pathIndex,operation?.kind]);
    if(key===drawingKey)return;drawingKey=key;clearMarkers();markers.visible=s.enabled&&s.mode==='DETAIL'&&s.direct&&s.view==='FINAL';if(!markers.visible)return;
    api.updateTransform(markers);
    for(const d of entries()){
      const active=selected.has(d.id),color=!d.enabled?0x777c83:active?0xffdc71:hover===d.id?0xf3cfff:0xc787e5;
      const p=api.point(d.t,d.angle);if(!p)continue;
      const marker=createSectionProfileMarker(p,color,{radius:active||hover===d.id?8:6,halo:2.5,renderOrder:130});marker.userData.detailId=d.id;marker.userData.detailPoint=true;markers.add(marker);
      if(d.path.length){const pts=d.path.map(n=>api.point(n.t,n.angle)).filter(Boolean);if(pts.length>1){const line=createSectionOverlayLine(pts,color,{width:active?3.5:2.5,haloWidth:active?6:5,renderOrder:128});line.userData.detailId=d.id;markers.add(line);}}
      if(active&&selected.size===1&&!armed&&d.path.length>1){
        let previous=null;d.path.forEach((node,index)=>{
          const point=api.point(node.t,node.angle);if(!point)return;const screen=project(point),special=index===0||index===d.path.length-1||index===pathIndex;
          if(!special&&previous&&Math.hypot(screen.x-previous.x,screen.y-previous.y)<12)return;previous=screen;
          const moving=operation?.kind==='PATH_POINT'&&operation.index===index,bright=index===pathIndex||index===hoverPathIndex;
          const handle=createSectionProfileMarker(point,moving?0xff9852:bright?0xf3e0ff:0xcf9dea,{radius:bright?5.5:4,halo:1.8,renderOrder:134});
          handle.userData.detailPathId=d.id;handle.userData.pathIndex=index;markers.add(handle);
        });
      }
      if(active){const outline=[];for(let i=0;i<=40;i++){const a=i/40*Math.PI*2,point=api.point(clamp(d.t+Math.sin(a)*d.height/2,0,1),wrap(d.angle+Math.cos(a)*d.width/2));if(point)outline.push(point);}if(outline.length>1){const line=createSectionOverlayLine(outline,0xb484ce,{loop:true,width:1.3,haloWidth:2,renderOrder:126});line.userData.detailScope=d.id;markers.add(line);}}
    }
  }
  function project(point){markers.updateWorldMatrix(true,false);const r=api.canvas.getBoundingClientRect(),v=point.clone().applyMatrix4(markers.matrixWorld).project(api.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2,z:v.z};}
  function hitPathPoint(e){
    if(armed||tool!=='SELECT'||selected.size!==1)return null;
    let best=null;for(const marker of markers.children.filter(m=>m.userData.detailPathId)){const p=project(marker.position),distance=Math.hypot(e.clientX-p.x,e.clientY-p.y);if(p.z>=-1&&p.z<=1&&distance<9&&(!best||distance<best.distance))best={id:marker.userData.detailPathId,index:marker.userData.pathIndex,distance};}
    return best;
  }
  function hit(e){let best=null;for(const m of markers.children.filter(m=>m.userData.detailPoint)){const p=project(m.position),distance=Math.hypot(e.clientX-p.x,e.clientY-p.y);if(p.z>=-1&&p.z<=1&&distance<14&&(!best||distance<best.distance))best={id:m.userData.detailId,distance};}if(best?.distance<10)return best.id;for(const line of markers.children.filter(m=>m.userData.detailId&&m.userData.polyline)){const distance=hitSectionPolyline(line.userData.polyline,{x:e.clientX,y:e.clientY},project,{radius:9});if(distance!==null&&(!best||distance<best.distance))best={id:line.userData.detailId,distance};}return best?.id||null;}
  function pick(id,event={}){if(event.ctrlKey){if(selected.has(id))selected.delete(id);else selected.add(id);}else if(event.shiftKey)selected.add(id);else selected=new Set([id]);tool='SELECT';armed=false;redrawId='';pathIndex=-1;sizeNotice='';update();}
  function applyRecipeSizes(detail){
    const targets=recipeSizes[detail.type],metric=targets&&api.metric?.();if(!metric||tool==='PAINT')return detail;
    for(const field of ['width','height'])if(targets[field]!=null){const result=metric.solve(detail,field,targets[field]);if(result){detail[field]=result.value;if(result.limited)sizeNotice='已达到当前位置的尺寸边界，所选参数显示实际厘米值。';}}
    return detail;
  }
  function syncSizes(s,nextRecipe,items){
    const metric=items.length||nextRecipe?api.metric?.():null;
    const position=nextRecipe&&lastPointer&&api.surface(lastPointer),dimensions=nextRecipe?(position?[{...recipes[type],...position}]:[]):items;
    controls('[data-detail-cm]').forEach(input=>{
      const field=input.dataset.detailCm;input.disabled=!metric||!s.direct||!s.editable||Boolean(redrawId)||Boolean(operation&&operation.kind!=='FIELD')||!nextRecipe&&!items.length||nextRecipe&&tool==='PAINT';
      if(document.activeElement===input&&(operation?.kind==='FIELD'||nextRecipe))return;
      const target=nextRecipe?recipeSizes[type]?.[field]:undefined,values=metric?dimensions.map(d=>metric.measure(d,field)):[];
      input.value=target!=null?Number(target.toFixed(3)):values.length&&values.every(v=>Number.isFinite(v)&&Math.abs(v-values[0])<.005)?Number(values[0].toFixed(3)):'';
      input.placeholder=nextRecipe?'落笔位置换算':items.length?'混合':'未选';
    });
    let note=nextRecipe?(tool==='PAINT'?'刷区域的尺寸由笔刷半径决定。':'厘米尺寸在落笔位置换算；当前会话记住下一笔。'):items.length?'按细节起点的大轮廓测量；走势长度另由曲线决定。':'选择细节后可按厘米调整，也可先设下一笔。';
    if(metric&&dimensions.length===1&&!nextRecipe){const w=metric.limits(dimensions[0],'width'),h=metric.limits(dimensions[0],'height');note+=' 可用：绕干 '+w.min.toFixed(2)+'–'+w.max.toFixed(2)+' cm；沿枝 '+h.min.toFixed(2)+'–'+h.max.toFixed(2)+' cm。';}
    controls('[data-detail-cm-note]').forEach(n=>n.textContent=sizeNotice||note);
  }
  function transact(label,fn){if(!state().enabled||state().mode!=='DETAIL'){if(!activate())return false;}if(!ready()){message(state().direct?'请先结束当前调节，或等待模型确认。':'旧工程须先试用并确认直接截面。');return false;}if(!api.begin(label))return false;fn(api.draft());api.draft().details=normalizeTrunkDetails(api.draft().details);api.preview();const result=api.commit();update();return result;}
  function setEnabled(enabled){return transact(enabled?'启用表面细节':'暂停表面细节',d=>{for(const item of d.details||[])if(selected.has(item.id))item.enabled=enabled;});}
  function remove(){if(!selected.size){message('先点紫色标记或列表选择细节。');return false;}const result=transact('删除所选表面细节',d=>{d.details=(d.details||[]).filter(item=>!selected.has(item.id));});if(result!==false)selected.clear();update();return result;}
  function beginTransform(kind,{duplicate=false}={}){
    if(!activate()||!ready()||!selected.size){message('先点紫色标记，或在列表选择一项；Shift/Ctrl 可多选。');return false;}
    if(state().view!=='FINAL')api.setView('FINAL');
    const beforeSelection=new Set(selected),source=clone(entries());if(!api.begin(duplicate?'复制表面细节':{SLIDE:'滑动表面细节',TURN:'旋转表面细节',SIZE:'调整细节范围',STRENGTH:'调整细节强度'}[kind]))return false;
    if(duplicate){const copies=source.filter(d=>selected.has(d.id)).map(d=>({...clone(d),id:'DETAIL_'+crypto.randomUUID()}));if(source.length+copies.length>128){api.cancel();message('当前本枝最多 128 项细节。');return false;}api.draft().details=[...source,...copies];selected=new Set(copies.map(d=>d.id));}
    const rect=api.canvas.getBoundingClientRect(),start=lastPointer||{x:rect.left+rect.width/2,y:rect.top+rect.height/2},anchor=chosen()[0];
    operation={kind,keyboard:true,start,source:clone(entries()),beforeSelection,anchor:clone(anchor),startSurface:api.surface(start),controlEnabled:api.controls.enabled,duplicate};api.controls.enabled=false;armed=false;redrawId='';tool='SELECT';api.canvas.focus({preventScroll:true});update();message(`${duplicate?'复制后滑动':{SLIDE:'G 沿枝滑动',TURN:'R 绕干旋转',SIZE:'S 调整范围'}[kind]} · 移动鼠标，左键/Enter 确认，Esc 取消`);return true;
  }
  function transform(coords){if(!operation?.keyboard)return;const op=operation,rect=api.canvas.getBoundingClientRect();let patch;
    if(op.kind==='PRESET'){placePreset(coords);return;}
    if(op.kind==='SLIDE'){const hit=api.surface(coords);patch={t:hit&&op.startSurface?hit.t-op.startSurface.t:(op.start.y-coords.y)/rect.height};}
    else if(op.kind==='TURN'){const hit=api.surface(coords);patch={angle:hit&&op.startSurface?signed(op.startSurface.angle,hit.angle):(coords.x-op.start.x)/rect.width*360};}
    else if(op.kind==='SIZE')patch={scale:Math.exp((coords.x-op.start.x)/180)};
    else if(op.kind==='BRUSH_SIZE'){brushRadius=clamp(op.radius+(coords.x-op.start.x),12,180);updateCursor(coords);update();return;}
    else if(op.kind==='STRENGTH'){const strength=clamp(op.strength+(coords.x-op.start.x)/240,0,1);api.draft().details=normalizeTrunkDetails(op.source.map(d=>selected.has(d.id)?{...d,strength}:d));api.preview();update();return;}
    if(patch){api.draft().details=transformTrunkDetailSelection(op.source,selected,patch);api.preview();update();}
  }
  function beginPathPoint(hit,e){
    const detail=entries().find(d=>d.id===hit.id),position=api.surface({x:e.clientX,y:e.clientY});
    if(!ready()||!detail||!position||Math.abs(signed(detail.path[hit.index].angle,position.angle))>75)return false;
    const beforeIndex=pathIndex;pathIndex=hit.index;sizeNotice='';
    operation={kind:'PATH_POINT',id:hit.id,index:hit.index,start:{x:e.clientX,y:e.clientY},source:clone(detail),beforeSelection:new Set(selected),beforeIndex,started:false,controlEnabled:api.controls.enabled,cursor:api.canvas.style.cursor};
    api.controls.enabled=false;api.canvas.style.cursor='grabbing';api.canvas.focus({preventScroll:true});api.canvas.setPointerCapture?.(e.pointerId);update();return true;
  }
  function dragPathPoint(coords){
    const op=operation;if(op?.kind!=='PATH_POINT')return false;
    if(!op.started&&Math.hypot(coords.x-op.start.x,coords.y-op.start.y)<3)return false;
    const position=api.surface(coords);if(!position)return false;
    const changed=moveTrunkDetailPathPoint(op.source,op.index,position);if(!changed){message('相邻走势点不能重合；可按 Esc 取消。');return false;}
    if(!op.started){if(!api.begin('拖动细节走势点'))return false;op.started=true;}
    api.draft().details=entries().map(d=>d.id===op.id?changed:d);api.preview();return true;
  }
  function restoreControls(op){if(op){api.controls.enabled=op.controlEnabled??true;if(op.cursor!=null)api.canvas.style.cursor=op.cursor;}cursor.hidden=true;box.hidden=true;}
  function finish(){
    const op=operation;if(!op)return false;
    if(op.kind==='PROFILE'&&!profileEditor.valid()){message('请输入有效的轮廓坐标，或 Esc 取消。');return false;}
    if(op.kind==='FIELD'){const selector=op.field.startsWith('CM_')?'[data-detail-cm="'+op.field.slice(3)+'"]':'[data-detail-value="'+op.field+'"]';if(controls(selector).some(input=>!input.disabled&&(input.value===''||!input.checkValidity()))){message('请输入有效数值，或按 Esc 取消。');return false;}}
    if(op.kind==='PRESET'&&!op.valid){message('先将预设移到当前本枝表面，再点击或 Enter 确认。');return false;}
    operation=null;restoreControls(op);
    if(op.kind==='PROFILE'){profileEditor.clear();if(op.recipe){update();return true;}if(JSON.stringify(entries())===JSON.stringify(op.source)){api.cancel();update();return true;}}
    if(op.kind==='PATH_POINT'&&!op.started){update();return true;}
    if(op.kind==='PATH_POINT'&&JSON.stringify(entries().find(d=>d.id===op.id))===JSON.stringify(op.source)){api.cancel();update();return true;}
    if(op.kind==='BOX'){const ids=markers.children.filter(m=>m.userData.detailPoint).filter(m=>{const p=project(m.position);return p.z>=-1&&p.z<=1&&p.x>=Math.min(op.start.x,op.end.x)&&p.x<=Math.max(op.start.x,op.end.x)&&p.y>=Math.min(op.start.y,op.end.y)&&p.y<=Math.max(op.start.y,op.end.y);}).map(m=>m.userData.detailId);for(const id of ids){if(op.subtract)selected.delete(id);else selected.add(id);}update();return true;}
    if(op.kind==='BRUSH_SIZE'){update();return true;}
    if(op.kind==='PATH'&&entries().find(d=>d.id===op.id)?.path.length<2){api.cancel();selected=op.beforeSelection;message('画线至少需要两个表面点；当前笔已取消。');update();return false;}
    const items=chosen(),result=api.commit();
    if(result!==false){
      if(op.kind==='PRESET'){lastPreset={id:op.presetId,kind:op.presetKind,name:op.name,shape:clone(op.shape)};preferenceChange(()=>preferences[op.presetKind].used(op.presetId));}
      if(items.length===1){const d=items[0];recipes[d.type]=captureTrunkDetailRecipe(d).recipe;if(op.kind==='FIELD'&&op.field.startsWith('CM_')){const field=op.field.slice(3);recipeSizes[d.type]||={};recipeSizes[d.type][field]=op.metric.measure(d,field);}else if(op.kind==='FIELD')delete recipeSizes[d.type]?.[op.field];}
      if(op.kind==='PRESET'||op.editExisting||['POINT','PATH','PAINT'].includes(op.kind)&&!dock.querySelector('[data-detail-continuous]').checked){armed=false;redrawId='';tool='SELECT';}
    }
    update();return result;
  }
  function cancel(){const op=operation;operation=null;profileEditor?.clear();restoreControls(op);if(op?.kind==='PROFILE'&&op.recipe){recipes[op.recipeType]=op.beforeRecipe;update();message('已取消下一笔轮廓调节。');return true;}if(op?.kind==='BRUSH_SIZE')brushRadius=op.radius;if(op?.beforeSelection)selected=op.beforeSelection;if(op&&op.kind!=='BOX'&&op.kind!=='BRUSH_SIZE'&&!(op.kind==='PATH_POINT'&&!op.started))api.cancel();armed=false;redrawId='';tool='SELECT';hover='';hoverPathIndex=-1;pathIndex=op?.beforeIndex??-1;sizeNotice='';update();message('已取消本次细节操作；工程保留。');return Boolean(op);}
  function externalCancel(){numberDrag?.cancel();const op=operation;operation=null;profileEditor?.clear();restoreControls(op);if(op?.kind==='PROFILE'&&op.recipe)recipes[op.recipeType]=op.beforeRecipe;if(op?.kind==='BRUSH_SIZE')brushRadius=op.radius;if(op?.beforeSelection)selected=op.beforeSelection;armed=false;redrawId='';hoverPathIndex=pathIndex=-1;sizeNotice='';cursor.hidden=true;box.hidden=true;drawingKey='';}
  function addSample(coords,event,first=false){const position=api.surface(coords);if(!position)return false;const op=operation,d=api.draft().details.find(item=>item.id===op.id);if(!d)return false;
    if(!first&&op.last&&Math.hypot(coords.x-op.last.x,coords.y-op.last.y)<5)return false;
    op.last={...coords};const pressure=Number.isFinite(event?.pressure)&&event.pressure>0?clamp(event.pressure,.1,1):event?.type==='pointerup'?(d.path.at(-1)?.pressure||1):1;
    if(op.kind==='POINT'){d.t=position.t;d.angle=position.angle;applyRecipeSizes(d);}
    else {if(d.path.length>=128)d.path=d.path.filter((point,index)=>index===0||index%2===0||index===d.path.length-1);d.path.push({...position,pressure});}
    if(op.kind==='PAINT'){const around=api.surface({x:coords.x+brushRadius,y:coords.y}),up=api.surface({x:coords.x,y:coords.y-brushRadius});if(around)d.width=clamp(Math.abs(signed(position.angle,around.angle))*2,1,180);if(up)d.height=clamp(Math.abs(position.t-up.t)*2,.001,1);}
    api.preview();return true;
  }
  function sampleNextRecipe(){
    if(!ready()||operation||numberDrag?.active||chosen().length!==1){message('先选一项细节并结束当前调节，再取样画下一笔。');return false;}
    const sample=captureTrunkDetailRecipe(chosen()[0],api.metric?.());if(!sample)return false;
    recipes[sample.type]=sample.recipe;recipeSizes[sample.type]=sample.sizes;type=sample.type;
    if(!mode(sample.tool))return false;
    sizeNotice='已取样截面、强度与尺寸；下方只设置下一笔，原细节保持。';update();return true;
  }
  function beginRedraw(){const item=chosen()[0];if(chosen().length!==1||!item||!ready()){message('选中一项细节后重画走势。');return false;}if(!mode('PATH'))return false;redrawId=item.id;type=item.type;update();return true;}
  function beginAdd(coords,e){
    const original=redrawId&&entries().find(d=>d.id===redrawId);
    if(!ready()||!original&&entries().length>=128){message(entries().length>=128?'当前本枝最多 128 项细节。':'请先确认当前操作；旧工程需确认直接截面。');return false;}
    if(!original&&controls('[data-detail-value], [data-detail-cm]').some(input=>!input.disabled&&(input.value===''&&!input.matches('[data-detail-cm]')||input.value!==''&&!input.checkValidity()))){message('先修正下一笔的强度与范围，或点击默认参数。');return false;}
    if(state().view!=='FINAL')api.setView('FINAL');const position=api.surface(coords);
    if(!position){message('请在当前承重枝的表面添加；不会穿透其他主枝。');return false;}
    const beforeSelection=new Set(selected);if(!api.begin(original?'重画细节走势':'添加'+TRUNK_DETAIL_NAMES[type]))return false;
    const detail=original?redrawTrunkDetail(original,position):applyRecipeSizes(createTrunkDetail(type,{...recipes[type],...position}));
    api.draft().details=original?entries().map(d=>d.id===original.id?detail:d):[...entries(),detail];
    selected=new Set([detail.id]);operation={kind:original?'PATH':tool==='SELECT'?'POINT':tool,id:detail.id,beforeSelection,editExisting:Boolean(original),controlEnabled:api.controls.enabled,last:null};
    api.controls.enabled=false;addSample(coords,e,true);api.canvas.setPointerCapture?.(e.pointerId);update();return true;
  }
  function updateCursor(coords){const visible=state().enabled&&state().mode==='DETAIL'&&armed&&tool==='PAINT';cursor.hidden=!visible;if(!visible)return;const parent=api.canvas.parentElement.getBoundingClientRect();cursor.style.left=coords.x-parent.left+'px';cursor.style.top=coords.y-parent.top+'px';cursor.style.width=cursor.style.height=brushRadius*2+'px';}
  function focus(){const d=chosen()[0];if(d)api.focus(d.t,d.angle);}
  function pointerDown(e){if(!state().enabled||state().mode!=='DETAIL'||e.target!==api.canvas)return false;lastPointer={x:e.clientX,y:e.clientY};
    if(operation?.keyboard){if(e.button===0)finish();else if(e.button===2)cancel();return true;}
    if(e.button===2){if(operation||armed){cancel();return true;}return false;}
    if(e.button!==0||!state().direct)return false;
    if(!e.shiftKey&&!e.ctrlKey&&!operation){const point=hitPathPoint(e);if(point&&beginPathPoint(point,e))return true;}
    const id=hit(e);if(id&&(tool==='SELECT'||e.shiftKey||e.ctrlKey)){pick(id,e);return true;}
    if((e.shiftKey||e.ctrlKey)&&!operation){operation={kind:'BOX',start:lastPointer,end:lastPointer,subtract:e.ctrlKey,controlEnabled:api.controls.enabled,beforeSelection:new Set(selected)};api.controls.enabled=false;api.canvas.setPointerCapture?.(e.pointerId);return true;}
    if(armed){beginAdd(lastPointer,e);return true;}
    if(id){pick(id,e);return true;}
    if(api.surface(lastPointer)){selected.clear();update();return true;}return false;
  }
  function pointerMove(e){if(!state().enabled||state().mode!=='DETAIL')return false;lastPointer={x:e.clientX,y:e.clientY};
    if(operation?.keyboard){transform(lastPointer);return true;}
    if(operation?.kind==='PATH_POINT'){dragPathPoint(lastPointer);return true;}
    if(operation?.kind==='BOX'){operation.end=lastPointer;const p=api.canvas.parentElement.getBoundingClientRect();box.hidden=false;box.style.left=Math.min(operation.start.x,e.clientX)-p.left+'px';box.style.top=Math.min(operation.start.y,e.clientY)-p.top+'px';box.style.width=Math.abs(operation.start.x-e.clientX)+'px';box.style.height=Math.abs(operation.start.y-e.clientY)+'px';return true;}
    if(operation){addSample(lastPointer,e);return true;}if(e.target!==api.canvas){cursor.hidden=true;return false;}updateCursor(lastPointer);const node=hitPathPoint(e),next=hit(e)||'',index=node?.index??-1;if(next!==hover||index!==hoverPathIndex){hover=next;hoverPathIndex=index;api.canvas.style.cursor=node?'grab':'';draw();}return armed||Boolean(node);
  }
  function pointerUp(e){if(!operation||operation.keyboard)return false;if(operation.kind==='PATH_POINT'){if(e?.target===api.canvas)dragPathPoint({x:e.clientX,y:e.clientY});}else if(operation.kind!=='BOX'&&e?.target===api.canvas)addSample({x:e.clientX,y:e.clientY},e,true);finish();return true;}
  function setAll(){selected=new Set(entries().map(d=>d.id));update();}
  function beginParameter(kind){if(kind==='BRUSH_SIZE'){if(!activate())return false;const r=api.canvas.getBoundingClientRect();operation={kind,keyboard:true,start:lastPointer||{x:r.left+r.width/2,y:r.top+r.height/2},radius:brushRadius,controlEnabled:api.controls.enabled};api.controls.enabled=false;api.canvas.focus({preventScroll:true});message('F · 移动鼠标调整刷涂半径，左键/Enter 确认，Esc 取消');return true;}if(!beginTransform(kind))return false;operation.strength=chosen()[0]?.strength||0;message('Shift+F · 调所选细节强度，左键/Enter 确认，Esc 取消');return true;}
  function key(e){const s=state();if(s.enabled&&s.mode==='DETAIL'&&!document.querySelector('dialog[open]')&&profileEditor?.key(e))return true;const typing=e.target?.isContentEditable||e.target?.matches?.('input,textarea,select,[contenteditable="true"]'),action=trunkDetailShortcut(e,{enabled:s.enabled&&s.mode==='DETAIL',active:editing(),typing,dialogOpen:Boolean(document.querySelector('dialog[open]'))});if(!action)return false;
    if(action==='CANCEL'){
      if(operation||armed)cancel();
      else if(!shortcutHelp.close()){
        const library=dock.querySelector('[data-detail-local-library]'),profile=dock.querySelector('[data-detail-profile-editor]');
        if(library.open)library.open=false;
        else if(profile?.open)profile.open=false;
        else if(selected.size){selected.clear();redrawId='';update();}
      }
      return true;
    }if(action==='CONFIRM'){finish();return true;}
    if(operation){message('先用左键/Enter 确认，或 Esc 取消当前操作。');return true;}
    if(action==='POINT'||action==='PATH'){if(ready())mode(action);return true;}
    const buttonAction={SAMPLE:'sample',CLEAR:'clear',INVERT:'invert',REDRAW:'redraw',REPEAT_PRESET:'repeat-preset',ENABLE:'enable',DISABLE:'disable',FOCUS:'focus'}[action];
    if(buttonAction){const b=dock.querySelector(`[data-detail-action="${buttonAction}"]`);if(b&&!b.disabled)b.click();else message('当前范围无法使用此操作；先选择实际细节或完成当前预览。');return true;}
    if(action==='ADD'){mode(tool==='SELECT'?'POINT':tool);return true;}if(action==='SELECT'){mode('SELECT');return true;}if(action==='PAINT'){mode('PAINT');return true;}if(action==='ALL'){setAll();return true;}if(action==='REMOVE'){remove();return true;}if(action==='DUPLICATE'){beginTransform('SLIDE',{duplicate:true});return true;}if(['SLIDE','TURN','SIZE'].includes(action)){beginTransform(action);return true;}if(['BRUSH_SIZE','STRENGTH'].includes(action)){beginParameter(action);return true;}if(action==='PRESETS'||action==='SAVE_PRESET'){openLibrary();if(action==='SAVE_PRESET')dock.querySelector('[data-detail-name]').focus();return true;}return false;
  }
  async function refreshLibrary(){if(busy)return;const kind=libraryKind;busy=true;renderLibrary();try{presets[kind]=await stores[kind].list();libraryLoaded.add(kind);$('[data-detail-storage]').textContent=stores[kind].backend;await preferences[kind].load();preferenceVersion++;}catch(e){message('读取预设失败：'+e.message);}finally{busy=false;renderLibrary();if(kind!==libraryKind&&!libraryLoaded.has(libraryKind))refreshLibrary();}}
  function applyPreset(record){
    if(operation?.kind==='PRESET')cancel();
    if(!activate()||!ready())return;
    const shape=normalizeTrunkDetailPresetShape(record.shape);
    if(entries().length+shape.details.length>128){message('当前本枝最多 128 项细节。');return;}
    if(state().view!=='FINAL')api.setView('FINAL');
    const source=clone(entries()),beforeSelection=new Set(selected);
    if(!api.begin('放置细节预设「'+record.name+'」'))return;
    operation={kind:'PRESET',presetId:record.id,presetKind:record.kind||libraryKind,keyboard:true,source,shape,name:record.name,ids:shape.details.map(()=>createTrunkDetailId()),beforeSelection,valid:false,controlEnabled:api.controls.enabled};
    armed=false;redrawId='';tool='SELECT';api.controls.enabled=false;
    update();message('移动到当前本枝表面预览「'+record.name+'」；左键/Enter 放置，Esc 取消。');
    api.canvas.focus({preventScroll:true});
  }
  function placePreset(coords){
    const op=operation;if(op?.kind!=='PRESET')return false;
    const position=api.surface(coords);op.valid=Boolean(position);
    if(!position){updateGuide(state());return false;}
    const items=placeTrunkDetailPreset(op.shape,position,op.ids);
    api.draft().details=[...op.source,...items];selected=new Set(op.ids);api.preview();return true;
  }
  function openLibrary(){dock.querySelector('[data-detail-local-library]').open=true;refreshLibrary();}
  dock.querySelector('[data-detail-local-library]').addEventListener('toggle',()=>{if(dock.querySelector('[data-detail-local-library]').open&&!libraryLoaded.has(libraryKind))refreshLibrary();});
  function renderLibrary(){
    const s=state(),own=operation?.kind==='PRESET',blocked=busy||!s.direct||!s.editable||s.active&&!own||Boolean(operation&&!own),key=JSON.stringify([libraryKind,presets[libraryKind].map(p=>[p.id,p.name,p.updatedAt]),presetQuery,presetFilter,preferenceVersion]);
    if(key===libraryKey){controls('.trunk-detail-preset-card>button:first-child').forEach(b=>b.disabled=blocked);controls('[data-detail-preset-delete]').forEach(b=>b.disabled=busy||Boolean(operation));return;}
    libraryKey=key;const kind=libraryKind,prefs=preferences[kind],builtin=kind==='detail'?TRUNK_DETAIL_PRESETS:TRUNK_DETAIL_COMBINATIONS;
    const records=filterTrunkPresetRecords([...builtin,...presets[kind]].map(r=>({...r,scopeLabel:(kind==='detail'?'一笔细节':'细节组合')+' '+r.shape.details.map(d=>TRUNK_DETAIL_NAMES[d.type]).join(' ')})),{query:presetQuery,mode:presetFilter},prefs.data);
    for(const list of controls('[data-detail-presets]')){const scroll=list.scrollTop;list.replaceChildren();for(const record of records){
      const card=document.createElement('div');card.className='trunk-detail-preset-card';card.dataset.detailPresetId=record.id;
      const b=document.createElement('button');b.type='button';b.innerHTML=trunkDetailPresetThumbnail(record.shape);const label=document.createElement('span');label.textContent=record.name;const scope=document.createElement('small');scope.textContent=(kind==='detail'?'一笔细节':'组合 · '+record.shape.details.length+' 项')+(record.category?' · '+record.category:'');b.append(label,scope);b.title=record.name+' · 表面预览后确认，Esc 取消';b.disabled=blocked;b.onclick=()=>applyPreset({...record,kind});card.append(b);
      const star=document.createElement('button');star.type='button';star.className='trunk-preset-favorite';star.textContent=prefs.data.favorites.includes(record.id)?'★':'☆';star.setAttribute('aria-label','收藏 '+record.name);star.setAttribute('aria-pressed',String(prefs.data.favorites.includes(record.id)));star.onclick=()=>preferenceChange(()=>prefs.toggle(record.id));card.append(star);
      if(!record.id.startsWith('builtin-')){const x=document.createElement('button');x.type='button';x.textContent='×';x.className='trunk-preset-remove';x.dataset.detailPresetDelete=record.id;x.title='删除个人预设，工程中已有细节保留';x.disabled=busy||Boolean(operation);x.onclick=async()=>{busy=true;renderLibrary();try{await stores[kind].remove(record.id);presets[kind]=presets[kind].filter(d=>d.id!==record.id);await preferenceChange(()=>prefs.remove(record.id));message('个人预设已删除；工程保留。');}catch(e){message(e.message);}finally{busy=false;renderLibrary();}};card.append(x);}list.append(card);
    }if(!records.length){const empty=document.createElement('p');empty.className='trunk-preset-empty';empty.textContent=presetFilter==='RECENT'?'确认使用后会出现在这里。':presetFilter==='FAVORITES'?'点击卡片星标收藏，或调整搜索条件。':'没有匹配的预设。';list.append(empty);}list.scrollTop=scroll;}
  }
  async function save(){const name=(state().mode==='DETAIL'&&!dock.hidden?dock:section).querySelector('[data-detail-name]').value.trim(),items=chosen();if(!name){message('输入预设名称后保存。');return;}if(!items.length){message('先选择一项细节或一组组合。');return;}if(operation||state().active){message('先确认当前调节，再保存预设。');return;}busy=true;renderLibrary();try{const record=await stores[libraryKind].put({name,shape:normalizeTrunkDetailPresetShape({details:items})});presets[libraryKind]=[record,...presets[libraryKind].filter(d=>d.id!==record.id)];controls('[data-detail-name]').forEach(n=>n.value='');message('已另存「'+record.name+'」，可在其他本枝复用。');}catch(e){message('预设保存失败：'+e.message);}finally{busy=false;renderLibrary();}}
  const actions={sample:sampleNextRecipe,all:setAll,clear:()=>{selected.clear();redrawId='';update();},invert:()=>{selected=new Set(entries().filter(d=>!selected.has(d.id)).map(d=>d.id));redrawId='';update();},enable:()=>setEnabled(true),disable:()=>setEnabled(false),remove,redraw:beginRedraw,'repeat-preset':()=>lastPreset&&applyPreset(lastPreset),'reset-recipe':()=>{recipes[type]=clone(TRUNK_DETAIL_DEFAULTS[type]);delete recipeSizes[type];sizeNotice='';update();},duplicate:()=>beginTransform('SLIDE',{duplicate:true}),slide:()=>beginTransform('SLIDE'),turn:()=>beginTransform('TURN'),size:()=>beginTransform('SIZE'),add:()=>mode(tool==='SELECT'?'POINT':tool),sections:()=>{cancel();api.selectMode('SECTION');},exit:()=>api.exit(),focus,details:()=>mode('SELECT'),presets:openLibrary,save};
  controls('[data-detail-action]').forEach(b=>b.onclick=()=>actions[b.dataset.detailAction]?.());
  dock.querySelectorAll('[data-trunk-stage]').forEach(b=>b.onclick=()=>api.workflow(b.dataset.trunkStage));
  dock.querySelector('[data-workflow-mesh]').onclick=()=>api.inspectMesh();dock.querySelector('[data-workflow-done]').onclick=()=>api.exit();
  controls('[data-detail-library]').forEach(b=>b.onclick=()=>{libraryKind=b.dataset.detailLibrary;update();refreshLibrary();});
  controls('[data-detail-name]').forEach(input=>{input.addEventListener('input',()=>controls('[data-detail-name]').forEach(n=>{if(n!==input)n.value=input.value;}));input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save();}});});
  controls('[data-detail-radius]').forEach(input=>input.oninput=()=>{brushRadius=Number(input.value);update();});
  controls('[data-detail-cm]').forEach(input=>{
    input.oninput=()=>{
      const field=input.dataset.detailCm;
      if(armed&&!redrawId&&!operation){
        recipeSizes[type]||={};
        if(input.value===''){delete recipeSizes[type][field];sizeNotice='';controls('[data-detail-cm]').filter(n=>n!==input&&n.dataset.detailCm===field).forEach(n=>n.value='');return;}
        if(!input.checkValidity())return;recipeSizes[type][field]=Number(input.value);sizeNotice='';update();return;
      }
      if(!selected.size||input.value===''||!input.checkValidity())return;
      if(!operation){if(!ready())return;const metric=api.metric?.();if(!metric||!api.begin('按厘米调整细节尺寸'))return;operation={kind:'FIELD',field:'CM_'+field,metric,source:clone(entries()),beforeSelection:new Set(selected),controlEnabled:api.controls.enabled};}
      if(operation.kind!=='FIELD'||operation.field!=='CM_'+field)return;
      const limited=[];api.draft().details=normalizeTrunkDetails(operation.source.map(d=>{
        if(!selected.has(d.id))return d;const result=operation.metric.solve(d,field,Number(input.value));
        if(!result)return d;if(result.limited)limited.push(result);return{...d,[field]:result.value};
      }));
      sizeNotice=limited.length===1?'当前位置可用 '+limited[0].min.toFixed(2)+'–'+limited[0].max.toFixed(2)+' cm；实际采用 '+limited[0].actual.toFixed(2)+' cm。':limited.length?'有 '+limited.length+' 项达到尺寸边界，参数区显示实际值。':'';
      api.preview();update();
    };
    input.onchange=()=>{if(operation?.kind==='FIELD'&&operation.field==='CM_'+input.dataset.detailCm)finish();};
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.onchange();}else if(e.key==='Escape'&&(operation?.kind==='FIELD'||armed)){e.preventDefault();cancel();}};
  });
  controls('[data-detail-value]').forEach(input=>{
    input.step='any';
    input.oninput=()=>{if(!input.checkValidity()||input.value==='')return;const value=Number(input.value)/(input.dataset.detailValue==='width'?1:100);if(armed&&!redrawId&&!operation){recipes[type][input.dataset.detailValue]=value;delete recipeSizes[type]?.[input.dataset.detailValue];sizeNotice='';controls('[data-detail-value]').filter(n=>n!==input&&n.dataset.detailValue===input.dataset.detailValue).forEach(n=>n.value=input.value);update();return;}if(!selected.size)return;if(!operation){if((!state().enabled||state().mode!=='DETAIL')&&!activate())return;if(!ready()||!api.begin('调整细节参数'))return;operation={kind:'FIELD',field:input.dataset.detailValue,source:clone(entries()),beforeSelection:new Set(selected),controlEnabled:api.controls.enabled};}if(operation.kind!=='FIELD'||operation.field!==input.dataset.detailValue)return;api.draft().details=normalizeTrunkDetails(operation.source.map(d=>selected.has(d.id)?{...d,[input.dataset.detailValue]:value}:d));api.preview();draw();};
    input.onchange=()=>{if(operation?.kind==='FIELD'){if(input.value===''||!input.checkValidity()){message('请输入范围内的数值，或 Esc 取消。');return;}finish();}};
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.onchange();}else if(e.key==='Escape'&&(operation?.kind==='FIELD'||armed)){e.preventDefault();cancel();}};
  });
  numberDrag=createTrunkNumberDrag({inputs:controls('[data-detail-value],[data-detail-cm]'),
    canStart:()=>ready()&&!operation&&!redrawId,
    step:input=>(input.matches('[data-detail-cm]') ? .5 : input.dataset.detailValue==='height' ? .5 : 1)/8,
    begin:()=>armed?{type,recipe:clone(recipes[type]),sizes:clone(recipeSizes[type]||{}),notice:sizeNotice}:null,
    cancel:before=>{if(before){recipes[before.type]=before.recipe;recipeSizes[before.type]=before.sizes;sizeNotice=before.notice;update();}else cancel();},
    onStart:update,onEnd:update,
  });
  const dragHint=document.createElement('small');dragHint.className='trunk-zone-shortcuts';dragHint.textContent='拖标签微调 · Shift 大步 / Alt 精调 · Esc 取消；Alt+1 / 2 / 3 切分区';cm.after(dragHint);
  dock.querySelector('[data-workflow-mesh]').title='Alt+M · 打开本枝网格精度';dock.querySelector('[data-workflow-mesh]').setAttribute('aria-keyshortcuts','Alt+M');
  for(const n of allNodes)n.addEventListener('pointerdown',e=>e.stopPropagation());
  let dockDrag=null;const header=dock.querySelector('header');header.title='拖标题栏移动工具窗';header.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;const p=api.canvas.parentElement.getBoundingClientRect(),r=dock.getBoundingClientRect();dockDrag={x:e.clientX,y:e.clientY,left:r.left-p.left,top:r.top-p.top};header.setPointerCapture(e.pointerId);e.preventDefault();});header.addEventListener('pointermove',e=>{if(!dockDrag)return;const p=api.canvas.parentElement.getBoundingClientRect(),r=dock.getBoundingClientRect();dock.style.left=clamp(dockDrag.left+e.clientX-dockDrag.x,8,Math.max(8,p.width-r.width-8))+'px';dock.style.top=clamp(dockDrag.top+e.clientY-dockDrag.y,8,Math.max(8,p.height-r.height-8))+'px';dock.style.right=dock.style.bottom='auto';});header.addEventListener('pointerup',()=>dockDrag=null);header.addEventListener('pointercancel',()=>dockDrag=null);
  header.title='拖动标题栏移动工具窗 · 双击回到默认位置';header.addEventListener('dblclick',e=>{if(e.target.closest('button')||dockDrag)return;for(const key of ['left','top','right','bottom'])dock.style[key]='';});
  function keepDockVisible(){if(dock.hidden||!dock.style.left||dockDrag)return;const p=api.canvas.parentElement.getBoundingClientRect(),r=dock.getBoundingClientRect();dock.style.left=clamp(parseFloat(dock.style.left),8,Math.max(8,p.width-r.width-8))+'px';dock.style.top=clamp(parseFloat(dock.style.top),8,Math.max(8,p.height-r.height-8))+'px';}
  new ResizeObserver(keepDockVisible).observe(dock);window.addEventListener('resize',keepDockVisible);
  function renderList(){const s=state(),key=JSON.stringify([entries().map(d=>[d.id,d.type,d.enabled,Math.round(d.t*100),d.path.length]),[...selected],s.direct,s.editable,s.active]);if(renderKey===key)return;renderKey=key;for(const list of controls('[data-detail-list]')){const scroll=list.scrollTop;list.replaceChildren();entries().forEach((d,i)=>{const row=document.createElement('div');row.className='trunk-detail-row'+(selected.has(d.id)?' selected':'')+(!d.enabled?' paused':'');row.dataset.trunkDetailId=d.id;const b=document.createElement('button');b.type='button';b.className='trunk-detail-select';b.textContent=`${TRUNK_DETAIL_NAMES[d.type]} ${i+1} · ${Math.round(d.t*100)}%${d.path.length?' · '+d.path.length+' 点':''}`;b.setAttribute('aria-pressed',String(selected.has(d.id)));b.disabled=!s.direct||s.active;b.onclick=e=>{if(!activate())return;pick(d.id,e);};const eye=document.createElement('button');eye.type='button';eye.textContent=d.enabled?'●':'○';eye.title=d.enabled?'暂停这一项；保留参数':'启用这一项';eye.disabled=!s.editable||s.active;eye.onclick=()=>transact('切换表面细节',form=>{const item=form.details.find(item=>item.id===d.id);item.enabled=!item.enabled;});row.append(b,eye);list.append(row);});if(!entries().length){const empty=document.createElement('p');empty.className='trunk-detail-empty';empty.textContent='还没有独立细节。点上方类型开始，或展开预设添加一组。';list.append(empty);}list.scrollTop=scroll;}}
  function context(){return{summary:`已选 ${selected.size} / ${entries().length} 项 · 仅本枝表面；大轮廓与完整单元枝保持`,tool:operation?.kind==='PRESET'?'放置细节组合':redrawId?'重画已有走势':{SELECT:'选择细节',POINT:'点放置',PATH:'画走势',PAINT:'刷区域'}[tool],kind:operation?.kind==='PRESET'?operation.name:TRUNK_DETAIL_NAMES[type]};}
  function update(){
    const s=state();
    if(s.target!==currentTarget){externalCancel();selected.clear();currentTarget=s.target;renderKey=drawingKey='';}
    selected=new Set([...selected].filter(id=>entries().some(d=>d.id===id)));
    if(chosen().length!==1||pathIndex>=chosen()[0].path.length)pathIndex=-1;
    dock.hidden=!s.enabled||s.mode!=='DETAIL';section.querySelector('.trunk-detail-legacy').hidden=s.direct;section.classList.toggle('inactive',!s.direct);
    controls('[data-detail-kind]').forEach(b=>{b.classList.toggle('active',armed&&b.dataset.detailKind===type);b.setAttribute('aria-pressed',String(armed&&b.dataset.detailKind===type));b.disabled=!s.direct||!s.editable||Boolean(operation);});
    controls('[data-detail-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.detailTool===tool);b.disabled=!s.direct||!s.editable||Boolean(operation);});
    controls('[data-detail-action]').forEach(b=>{
      const action=b.dataset.detailAction;
      if(['enable','disable','remove','duplicate','slide','turn','size','save','focus','redraw'].includes(action))b.disabled=!selected.size||!s.direct||!s.editable||Boolean(operation)||action==='redraw'&&selected.size!==1;
      if(['all','clear','invert','add','presets'].includes(action))b.disabled=!s.direct||!s.editable||Boolean(operation);
      if(action==='sample'){b.hidden=armed||!selected.size;b.disabled=chosen().length!==1||!s.direct||!s.editable||s.active||Boolean(operation)||Boolean(numberDrag?.active);b.title='T · '+(chosen().length!==1?'只取样一项细节，请单选；':'取样截面、强度与厘米尺寸，重新画下一笔；原细节保持');}
      if(action==='repeat-preset')b.disabled=!lastPreset||!s.direct||!s.editable||s.active||Boolean(operation);
      if(action==='reset-recipe'){b.hidden=!armed||Boolean(redrawId);b.disabled=Boolean(operation);}
    });
    controls('[data-detail-library]').forEach(b=>{b.classList.toggle('active',b.dataset.detailLibrary===libraryKind);b.disabled=Boolean(operation);});
    controls('[data-detail-count]').forEach(n=>n.textContent=`已选 ${selected.size} / ${entries().length} 项 · 仅本枝`);
    controls('[data-detail-target]').forEach(n=>{n.textContent=s.target?'当前承重枝':'未选枝干';n.title=s.target||'';});
    controls('[data-detail-radius]').forEach(n=>n.value=brushRadius);controls('[data-detail-radius-label]').forEach(n=>n.textContent=brushRadius+' px');
    const nextRecipe=armed&&!redrawId&&!operation,items=nextRecipe?[recipes[type]]:chosen();
    syncSizes(s,nextRecipe,items);
    const path=chosen().length===1?chosen()[0].path:[];
    controls('[data-detail-path-hint]').forEach(n=>{n.hidden=armed||path.length<2;n.textContent='走势 '+path.length+' 点'+(pathIndex>=0?' · 当前第 '+(pathIndex+1)+' 点':'')+' · 拖动小紫点直接修改，松手确认，Esc 取消；放大可看到更多点。';});
    controls('[data-detail-value-scope]').forEach(n=>n.textContent=redrawId?'重画走势 · 保留原强度与范围':nextRecipe?'下一笔 · '+TRUNK_DETAIL_NAMES[type]+'（保留已有细节）':'所选细节 · 强度与范围');
    controls('[data-detail-value]').forEach(input=>{
      input.disabled=!items.length||!s.direct||!s.editable||Boolean(redrawId)||Boolean(operation&&operation.kind!=='FIELD');
      if(document.activeElement===input&&(operation?.kind==='FIELD'||nextRecipe))return;
      const key=input.dataset.detailValue,values=items.map(d=>d[key]);
      input.value=values.length&&values.every(v=>Math.abs(v-values[0])<1e-8)?Number((values[0]*(key==='width'?1:100)).toFixed(2)):'';input.placeholder=items.length?'混合':'未选';
    });
    if(!operation)dock.querySelector('[data-detail-hint]').textContent=s.view==='BASE'?'大轮廓暂不显示细节；切最终效果后可编辑。':armed?`${TRUNK_DETAIL_NAMES[type]} · ${tool==='POINT'?'表面点放置':tool==='PATH'?'在表面按住左键画走势':'按住左键刷区域'} · Esc 取消添加`:`已选 ${selected.size} / ${entries().length} 项 · 紫色点和列表对应 · A 添加`;
    updateGuide(s);renderList();if(!busy)renderLibrary();profileEditor?.update();draw();
    updateTrunkWorkflow(dock,{stage:s.stage,disabled:!s.editable||s.active||Boolean(operation)||Boolean(numberDrag?.active)});
    selectedActions.hidden=more.hidden=armed||!selected.size;
    [valueScope,cm,dock.querySelector('[data-detail-cm-note]'),settings,dock.querySelector('[data-detail-profile-editor]')].forEach(n=>n.hidden=!armed&&!selected.size);
    dragHint.hidden=!armed&&!selected.size;
    const repeat=libraryActions.querySelector('[data-detail-action="repeat-preset"]');repeat.hidden=!lastPreset;repeat.textContent=lastPreset?'再放 '+lastPreset.name+' ⇧A':'再放预设 ⇧A';repeat.title=lastPreset?'Shift+A · 在本枝重新放置「'+lastPreset.name+'」':'Shift+A · 重复上次确认的预设';
    again.textContent='再加'+TRUNK_DETAIL_NAMES[type]+' A';
    if(armed!==wasAdding){if(armed)createGroup.after(recipeZone);else more.after(recipeZone);}
    dock.querySelectorAll('[data-workflow-mesh],[data-workflow-done]').forEach(b=>b.disabled=!s.editable||s.active||Boolean(operation)||Boolean(numberDrag?.active));
    const selectionKey=[...selected].sort().join('|');
    if(armed||!entries().length)createGroup.open=true;else if(wasAdding||selectionKey&&selectionKey!==shownSelection)createGroup.open=false;
    wasAdding=armed;shownSelection=selectionKey;
    const nextContext=JSON.stringify([s.enabled,s.mode,s.active,operation?.kind,Boolean(numberDrag?.active),context()]);if(contextKey!==nextContext){contextKey=nextContext;api.onContextChanged?.();}
  }
  function updateGuide(s){
    const guide=dock.querySelector('[data-detail-guide]');
    guide.textContent=operation?.kind==='PRESET'?'放置「'+operation.name+'」 · '+(operation.valid?'左键/Enter 确认，Esc 取消。':'移动到当前本枝表面预览；空白处无法放置。'):operation?'正在调节 · 松手或 Enter 确认，Esc 取消。':!s.editable?'正在准备本枝；若枝干已锁定，请先解除锁定。':redrawId?'重画所选走势 · 在本枝表面按住左键绘制；保留原尺寸，Esc 取消。':armed?'下一步 · '+TRUNK_DETAIL_NAMES[type]+'：先在下方设置下一笔，再'+(tool==='POINT'?'点击表面放置':tool==='PATH'?'按住左键画走势':'按住左键刷涂')+'。Esc 返回选择。':selected.size?'已选 '+selected.size+' 项 · 下方直接调强度与范围；G 滑动、R 绕干、S 调范围。':'从这里开始 · 点一种细节，然后到树干上操作。也可点紫色标记或下方列表调整已有细节。';
    dock.querySelector('.trunk-detail-brush').hidden=tool!=='PAINT';
    dock.querySelector('.trunk-detail-continuous').hidden=Boolean(redrawId);dock.querySelector('[data-detail-continuous]').disabled=!s.direct||!s.editable||s.active||Boolean(operation);
    dock.querySelectorAll('[data-detail-action="sections"]').forEach(b=>b.disabled=Boolean(operation));
  }
  window.addEventListener('pointermove',e=>{if(operation?.keyboard&&state().mode==='DETAIL'){pointerMove(e);consume(e);}},true);
  window.addEventListener('pointerdown',e=>{if(!operation?.keyboard||state().mode!=='DETAIL')return;if(operation.kind==='PRESET'&&e.target.closest?.('[data-detail-presets],.trunk-preset-filters,.trunk-detail-library-switch'))return;if(e.target!==api.canvas){cancel();return;}if(e.button===0){if(operation.kind==='PRESET')placePreset({x:e.clientX,y:e.clientY});finish();}else if(e.button===2)cancel();consume(e);},true);
  window.addEventListener('blur',()=>{if(operation)cancel();});window.addEventListener('resize',()=>{if(operation)cancel();});
  api.controls.addEventListener?.('change',()=>{if(!operation&&state().enabled&&state().mode==='DETAIL'&&chosen().length===1&&chosen()[0].path.length>1){api.camera.updateMatrixWorld();drawingKey='';draw();}});
  api.canvas.addEventListener('pointercancel',()=>{if(operation)cancel();});
  profileEditor=createTrunkDetailProfileEditor({containers:allNodes,state:profileState,begin:beginProfile,change:changeProfile,finish,cancel});
  settings.after(dock.querySelector('[data-detail-profile-editor]'));
  return {section,dock,markers,update,draw,key,toggleShortcuts:shortcutHelp.toggle,pointerDown,pointerMove,pointerUp,cancel,externalCancel,refreshLibrary,get context(){return context();},get active(){return Boolean(operation)||Boolean(numberDrag?.active);},get armed(){return armed;},get selection(){return new Set(selected);},flush(){if(numberDrag?.active||operation&&!['FIELD','PROFILE','BRUSH_SIZE','BOX'].includes(operation.kind)||profileEditor.dragging){message('请先确认或取消细节操作，再保存或导出。');return false;}if(['FIELD','PROFILE'].includes(operation?.kind))return finish();if(operation?.kind==='BRUSH_SIZE'||operation?.kind==='BOX')cancel();return true;},deactivate(){externalCancel();selected.clear();clearMarkers();drawingKey='';dock.hidden=true;},consume};
}
