import { BARK_PRESETS, BARK_MAP_SLOTS, DEFAULT_BARK_PRESET,isLibraryBark,normalizeBarkMaterial, normalizeBarkPreset, generateBarkTextureMaps, barkBytesToBase64, barkBase64ToBytes,
  barkMaterialForBranch, applyBarkMaterialAssignments } from './bark-materials.js';
import { skeletonBranches } from './skeleton-thickness.js';
import {createBarkMaterialPreview} from './bark-material-preview.js';

// Material editing is deliberately separate from complete-unit internals.
// The dialog edits a reusable recipe; Apply makes one authoring transaction.
export function createBarkMaterialControls(api) {
  const node = document.createElement('dialog'); node.id = 'barkMaterialPanel'; node.className = 'bark-material-panel';
  node.innerHTML = `<header><div><small>树鸭儿 · 木枝表面</small><h2>树干材质</h2><p id="barkMaterialScopeHint"></p></div><button data-bark-close aria-label="关闭树干材质">×</button></header>
    <div class="bark-material-body"><section class="bark-material-library" aria-labelledby="barkLibraryTitle"><div class="bark-library-heading"><h3 id="barkLibraryTitle">树皮库 <span>选择一套材质</span></h3><div class="bark-material-toolbar"><input id="barkMaterialSearch" placeholder="搜索树皮预设" aria-label="搜索树皮预设"><button id="barkMaterialRefresh">刷新个人库</button></div></div><div id="barkLibraryPane"><div id="barkMaterialCards" aria-label="内置与个人树皮预设"></div><p id="barkMaterialBackend"></p></div></section>
    <section class="bark-material-editor" aria-labelledby="barkMaterialDraftName"><div class="bark-current-material"><small>当前材质 · 属性与贴图一起应用</small><h3 id="barkMaterialDraftName">默认树皮</h3></div><div class="bark-material-overview"><section class="bark-material-sample" aria-label="材质预览"><div class="bark-preview-modes"><button type="button" data-bark-preview-mode="CURVED" aria-pressed="true">树皮样段</button><button type="button" data-bark-preview-mode="ACTUAL" aria-pressed="false">树上预览</button></div><canvas id="barkMaterialPreview" width="480" height="320" aria-label="树皮三维预览，拖动旋转、滚轮缩放"></canvas><label class="bark-preview-checks"><input id="barkMaterialUvGrid" type="checkbox">UV 棋盘格</label><p id="barkMaterialPreviewHint">样段高 3 米 · 拖动旋转 · 滚轮缩放</p></section>
    <section class="bark-material-properties" aria-label="当前材质参数"><h4>表面与纹理</h4><div class="bark-material-fields"><label>颜色<input id="barkMaterialColor" type="color"></label><label>纹理方向<select id="barkMaterialDirection"><option value="VERTICAL">纵向 · 沿树干</option><option value="HORIZONTAL">横向 · 绕树干</option></select></label>
    <label>粗糙度<input id="barkMaterialRoughness" type="number" min=".04" max="1" step=".01"></label><label>凹凸强度<input id="barkMaterialNormal" type="number" min="0" max="3" step=".05"></label>
    <label>横向纹理宽度（米）<input id="barkMaterialScaleU" type="number" min=".02" max="20" step=".01"></label><label>纵向纹理高度（米）<input id="barkMaterialScaleV" type="number" min=".02" max="20" step=".01"></label></div><p>一张纹理的实际尺寸，默认 2 × 2.5 米。</p></section></div>
    <section id="barkMapsPane" class="bark-material-maps" aria-labelledby="barkMapsTitle"><h4 id="barkMapsTitle">配套贴图 <span id="barkMapOwner"></span></h4><div id="barkMapPreviews" class="bark-map-previews"></div><p>颜色、法线、粗糙度共同组成上面的当前材质。</p><details class="bark-map-generation"><summary>从颜色生成 · 参数与替换选项</summary><p>按颜色估算凹凸与粗糙变化，可微调后应用。</p>
    <div class="bark-map-options"><label>凹凸深浅<input id="barkMapDepth" type="number" min="0" max="3" step=".1" value="1"></label><label>细节平滑<input id="barkMapSmoothing" type="number" min="0" max="6" step="1" value="1"></label><label>粗糙变化<input id="barkMapVariation" type="number" min="0" max="1" step=".05" value=".4"></label><label class="bark-map-check"><input id="barkMapInvert" type="checkbox">凹凸反转</label></div>
    <label class="bark-map-check"><input id="barkMapAutoFill" type="checkbox" checked>导入颜色后自动补齐</label><label class="bark-map-check"><input id="barkMapReplace" type="checkbox">替换已有法线／粗糙度</label></details><button id="barkMapGenerate" type="button">生成配套贴图</button><p id="barkMapHint" role="status"></p>
    <details><summary>导入自己的 PNG / JPG 贴图</summary><p>贴图保存在工程与预设内，最大缩至 512 像素；原文件保留。法线采用 OpenGL 方向（Y+）。</p><div id="barkMaterialImports"></div></details>
</section>
    <div class="bark-material-save"><input id="barkMaterialPresetName" maxlength="80" placeholder="个人树皮名称" aria-label="个人树皮预设名称"><button id="barkMaterialSave">保存到个人库</button></div>
    </section></div><footer class="bark-material-actions"><button id="barkMaterialApply" class="primary">应用树干材质</button><button id="barkMaterialReset">恢复默认树皮</button><p id="barkMaterialStatus" role="status"></p></footer>`;
  document.body.append(node);
  const button = document.createElement('button'); button.id = 'barkMaterialOpen'; button.type = 'button'; button.textContent = '树干材质'; button.title = '统一编辑树干树皮、纹理尺寸与配套贴图';
  (api.container || api.canvas?.parentElement || document.body).append(button);
  const $ = id => node.querySelector('#' + id), fields = { barkMaterialColor: 'color', barkMaterialDirection: 'direction', barkMaterialRoughness: 'roughness', barkMaterialNormal: 'normal_strength', barkMaterialScaleU: 'scale_u_m', barkMaterialScaleV: 'scale_v_m' };
  const preview=createBarkMaterialPreview($('barkMaterialPreview'));
  let draft = normalizeBarkMaterial(DEFAULT_BARK_PRESET), draftName = DEFAULT_BARK_PRESET.name, records = [], busy = false, token = 0, generationJob = null;
  const store = api.store;
  const mode = () => api.getMode?.() || 'TREE';
  let carrierCache=null;
  const carriers = () => {
    const branches=api.getAsset()?.masterBranches,authoring=api.getAuthoring();
    if(!carrierCache||carrierCache.branches!==branches||carrierCache.authoring!==authoring)
      carrierCache={branches,authoring,bones:skeletonBranches(branches||[])};
    return carrierCache.bones;
  };
  let pickedId=null;
  const status = (text, error = false) => { $('barkMaterialStatus').textContent = text; $('barkMaterialStatus').classList.toggle('error', error); };
  function swatch(canvas, recipe) {
    const maps = generateBarkTextureMaps(recipe, 256), context = canvas.getContext('2d'), image = context.createImageData(canvas.width, canvas.height);
    const tint = recipe.maps?.color||isLibraryBark(recipe) ? [1, 3, 5].map(i => parseInt(recipe.color.slice(i, i + 2), 16) / 255) : [1, 1, 1];
    const horizontal=recipe.direction==='HORIZONTAL',width=horizontal?maps.color.height:maps.color.width,height=horizontal?maps.color.width:maps.color.height,scale=Math.max(canvas.width/width,canvas.height/height);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const a=(x-canvas.width/2)/scale/width+.5,b=(y-canvas.height/2)/scale/height+.5,u=horizontal?b:a,v=horizontal?a:b;
      const cx = Math.min(maps.color.width - 1, Math.floor(u * maps.color.width)), cy = Math.min(maps.color.height - 1, Math.floor(v * maps.color.height)), index = (cy * maps.color.width + cx) * 4, dest = (y * canvas.width + x) * 4;
      for (let c = 0; c < 3; c++) image.data[dest + c] = maps.color.data[index + c] * tint[c];
      image.data[dest + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }
  function loadDraft(recipe, name, id=null) { draft = normalizeBarkMaterial(recipe); draftName = name || '当前树干材质'; pickedId=id;for (const [field, key] of Object.entries(fields)) $(field).value = draft[key]; $('barkMaterialDraftName').textContent = draftName;$('barkMapOwner').textContent=draftName; preview.update(draft); updateImports(); refresh(); }
  function updateImports() { for (const slot of BARK_MAP_SLOTS) { const value = draft.maps?.[slot]; node.querySelector(`[data-bark-image="${slot}"]`).textContent = value ? value.name || '已导入贴图' : '使用内置纹理'; node.querySelector(`[data-bark-remove="${slot}"]`).disabled = !value || busy; } updateMapPreviews(); }
  for(const [slot,label] of [['color','颜色'],['normal','法线'],['roughness','粗糙度']]){
    const item=document.createElement('div'),canvas=document.createElement('canvas'),name=document.createElement('span'),replace=document.createElement('button');canvas.width=256;canvas.height=256;canvas.dataset.barkMapPreview=slot;canvas.setAttribute('aria-label',label+'贴图');name.textContent=label;replace.type='button';replace.textContent='更换';replace.dataset.barkReplaceMap=slot;replace.setAttribute('aria-label','更换'+label+'贴图');replace.onclick=()=>node.querySelector('[data-bark-file="'+slot+'"]').click();item.append(canvas,name,replace);$('barkMapPreviews').append(item);
  }
  function updateMapPreviews(){
    const maps=generateBarkTextureMaps(draft,isLibraryBark(draft)?512:256);
    for(const slot of BARK_MAP_SLOTS){const canvas=node.querySelector('[data-bark-map-preview="'+slot+'"]'),ctx=canvas.getContext('2d'),source=maps[slot];canvas.width=source.width;canvas.height=source.height;const image=ctx.createImageData(source.width,source.height);image.data.set(source.data);ctx.putImageData(image,0,0);
      canvas.title=(draft.maps?.[slot]?.name||'内置贴图')+' · '+source.width+' × '+source.height;
    }
  }
  function stopGeneration(){if(generationJob){generationJob.worker.terminate();generationJob.reject(new DOMException('已取消生成','AbortError'));generationJob=null;}}
  function runGeneration(image,options){
    stopGeneration();return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./bark-map-generation.worker.js',import.meta.url),{type:'module'}),timer=setTimeout(()=>finish(Error('贴图生成超时，请重试')),60000);
      const finish=(error,maps)=>{clearTimeout(timer);worker.terminate();if(generationJob?.worker===worker)generationJob=null;error?reject(error):resolve(maps);};generationJob={worker,reject:error=>finish(error)};
      worker.onmessage=event=>finish(event.data.error?Error(event.data.error):null,event.data.maps);worker.onerror=event=>finish(Error(event.message||'配套贴图生成失败'));worker.postMessage({image,options},[image.data.buffer]);
    });
  }
  async function generateCompanions({auto=false,revision}={}){
    const replace=!auto&&$('barkMapReplace').checked,slots=['normal','roughness'].filter(slot=>replace||!draft.maps?.[slot]);if(!slots.length)return false;
    for(const id of ['barkMapDepth','barkMapSmoothing','barkMapVariation'])if(!$(id).checkValidity()||$(id).value===''){status('请修正无效的贴图生成参数。',true);return false;}
    const ownRevision=revision??++token;busy=true;refresh();status('正在从颜色生成配套贴图…');
    try{
      const source=draft.maps?.color,image=source?{width:source.width,height:source.height,data:barkBase64ToBytes(source.pixels)}:generateBarkTextureMaps(draft,isLibraryBark(draft)?512:256).color;
      const maps=await runGeneration(image,{depth:Number($('barkMapDepth').value),smoothing:Number($('barkMapSmoothing').value),variation:Number($('barkMapVariation').value),invert:$('barkMapInvert').checked});
      if(ownRevision!==token||!node.open)return false;
      draft.maps={...draft.maps};for(const slot of slots){const map=maps[slot];draft.maps[slot]={width:map.width,height:map.height,pixels:barkBytesToBase64(map.data),name:'生成 · '+(slot==='normal'?'法线':'粗糙度')+' · '+(source?.name||draftName)};}
      loadDraft(draft,draftName,pickedId);status('已生成'+slots.map(slot=>slot==='normal'?'法线':'粗糙度').join('、')+(slots.length<2?'，另一张已有贴图保留':'')+'；点击应用后保存，关闭可放弃。');return true;
    }catch(error){if(ownRevision===token&&error.name!=='AbortError')status('配套贴图生成失败：'+error.message,true);return false;}
    finally{if(ownRevision===token){busy=false;refresh();updateImports();}}
  }
  $('barkMapGenerate').onclick=()=>{if(!busy&&readDraft())generateCompanions();};
  $('barkMapReplace').onchange=refresh;

  function renderCards() {
    const query = $('barkMaterialSearch').value.trim().toLowerCase(), holder = $('barkMaterialCards'); holder.replaceChildren();
    const builtins=[DEFAULT_BARK_PRESET,...BARK_PRESETS.filter(p=>p.id!==DEFAULT_BARK_PRESET.id)];
    for (const record of [...builtins.map(item => ({ id: item.id, name: item.name, recipe: normalizeBarkMaterial(item), builtin: true })), ...records]) {
      if (!record.name.toLowerCase().includes(query)) continue;
      const card = document.createElement('div'); card.className = 'bark-material-card'; card.dataset.barkPresetId = record.id;
      const pick = document.createElement('button'); pick.type = 'button';pick.setAttribute('aria-pressed',String(record.id===pickedId)); const image = document.createElement('canvas'); image.width = 256; image.height = 256; swatch(image, record.recipe);
      const label = document.createElement('span'); label.textContent = record.name; pick.append(image, label); pick.disabled = busy;
      pick.onclick = () => { $('barkMapReplace').checked=false;loadDraft(record.recipe, record.name,record.id); status('已选择「'+record.name+'」，右侧调整这套材质的属性与贴图，点击应用统一生效。'); }; card.append(pick);
      if (!record.builtin) { const remove = document.createElement('button'); remove.className = 'bark-material-delete'; remove.textContent = '×'; remove.title = '删除个人预设；已应用材质保留'; remove.disabled = busy;
        remove.onclick = async () => { if (!store || busy) return; busy = true; refresh(); try { await store.remove(record.id); records = records.filter(item => item.id !== record.id); status('已删除个人预设；工程中已应用的材质保留。'); } catch (error) { status('删除失败：' + error.message, true); } finally { busy = false; renderCards(); refresh(); } }; card.append(remove); }
      holder.append(card);
    }
  }
  async function refreshLibrary() {
    if (!store || busy) { if (!store) status('个人库尚未连接；内置预设和工程保存仍可使用。', true); return; }
    busy = true; refresh();
    try { records = (await store.list()).map(normalizeBarkPreset); $('barkMaterialBackend').textContent = store.backend || '本机个人树皮库'; }
    catch (error) { status('读取个人库失败：' + error.message, true); }
    finally { busy = false; renderCards(); refresh(); }
  }
  function readDraft() {
    for (const [id, key] of Object.entries(fields)) { const input = $(id); if (!input.checkValidity() || input.value === '') { status('请修正无效的材质数值。', true); return false; } draft[key] = input.type === 'number' ? Number(input.value) : input.value; }
    draft = normalizeBarkMaterial(draft); preview.update(draft); return true;
  }
  for (const id of Object.keys(fields)) $(id).addEventListener('input', () => { if (readDraft()) status('材质预览已更新，点击「应用树干材质」统一生效。'); });
  for (const [slot, label] of [['color', '颜色'], ['normal', '法线'], ['roughness', '粗糙度']]) {
    const row = document.createElement('label'); row.className = 'bark-material-import'; row.innerHTML = `<span>${label}</span><span data-bark-image="${slot}"></span><input type="file" accept="image/png,image/jpeg" data-bark-file="${slot}" aria-label="导入${label}贴图"><button type="button" data-bark-remove="${slot}">还原</button>`;
    $('barkMaterialImports').append(row);
    row.querySelector('button').onclick = () => { delete draft.maps?.[slot]; loadDraft(draft, draftName,pickedId); status('已还原内置' + label + '纹理，点击应用确认。'); };
    row.querySelector('input').onchange = async event => {
      const file = event.target.files[0]; event.target.value = ''; if (!file) return;
      if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 20000000) { status('请选择 20 MB 内的 PNG / JPG。', true); return; }
      const revision = ++token; busy = true; refresh();
      let bitmap;
      try { bitmap = await createImageBitmap(file); if (revision !== token) return;
        const ratio = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const bytes = new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data);
        draft.maps = { ...draft.maps, [slot]: { width: canvas.width, height: canvas.height, pixels: barkBytesToBase64(bytes), name: file.name, data_uri: canvas.toDataURL('image/png') } };
        if (slot === 'color') { draft.style = 'IMPORTED'; draft.color = '#ffffff'; }
        loadDraft(draft, slot==='color'?file.name.replace(/\.[^.]+$/, ''):draftName,slot==='color'?null:pickedId); status('贴图已导入当前草稿，点击应用；工程与个人预设都会保留图像。');
        if(slot==='color'&&$('barkMapAutoFill').checked)await generateCompanions({auto:true,revision});
      } catch (error) { status('贴图导入失败：' + error.message, true); } finally { bitmap?.close(); if (revision === token) { busy = false; refresh(); updateImports(); } }
    };
  }
  function apply(reset = false) {
    if (busy || api.isBusy?.() || (!reset && !readDraft())) return false;
    if (!carriers().length) { status('当前没有可编辑的树干。',true);return false; }
    const recipe=reset?normalizeBarkMaterial(DEFAULT_BARK_PRESET):draft;
    api.transact(reset ? '恢复默认树皮' : '统一树干材质', next => applyBarkMaterialAssignments(next, recipe, [], {all:true}), { bypassLayers: true,deferControls:true });
    if(reset)loadDraft(DEFAULT_BARK_PRESET,DEFAULT_BARK_PRESET.name,DEFAULT_BARK_PRESET.id);
    status(`${reset?'已恢复默认树皮':'已统一树干材质'}，主干和分枝共用同一套树皮；可一步撤销。${mode()==='BRANCH'?'另存素材版本后更新装配。':''}`); return true;
  }
  $('barkMaterialApply').onclick = () => apply(); $('barkMaterialReset').onclick = () => apply(true);
  $('barkMaterialSave').onclick = async () => {
    if (!store || busy || !readDraft()) return;
    const name = $('barkMaterialPresetName').value.trim(); if (!name) { status('先为树皮预设起个名称。'); $('barkMaterialPresetName').focus(); return; }
    busy = true; refresh();
    try { const record = normalizeBarkPreset(await store.put({ name, shape: structuredClone(draft) })); records = [...records, record]; status('已保存「' + record.name + '」到个人库；工程中的材质是独立副本。'); }
    catch (error) { status('保存失败：' + error.message, true); } finally { busy = false; renderCards(); refresh(); }
  };
  function showPreview(){const all=carriers(),branch=all.find(b=>b.stableId===api.getSelection?.())||all[0];let geometry=null;api.getAsset()?.group.traverse(object=>{if(object.userData.category==='branch'&&object.userData.stable_id===branch?.stableId)geometry=object.geometry;});
    node.querySelector('[data-bark-preview-mode="ACTUAL"]').disabled=!geometry;
    if(!geometry&&preview.debug.mode==='ACTUAL'){preview.setMode('CURVED');for(const item of node.querySelectorAll('[data-bark-preview-mode]'))item.setAttribute('aria-pressed',String(item.dataset.barkPreviewMode==='CURVED'));}
    preview.open({branch,geometry,settings:api.getAsset()?.settings},draft);
  }
  $('barkMaterialSearch').oninput = renderCards; $('barkMaterialRefresh').onclick = refreshLibrary;
  for(const button of node.querySelectorAll('[data-bark-preview-mode]'))button.onclick=()=>{preview.setMode(button.dataset.barkPreviewMode);$('barkMaterialPreviewHint').textContent=button.dataset.barkPreviewMode==='ACTUAL'?'当前树干形状 · 拖动旋转 · 滚轮缩放':'样段高 3 米 · 拖动旋转 · 滚轮缩放';for(const item of node.querySelectorAll('[data-bark-preview-mode]'))item.setAttribute('aria-pressed',String(item===button));};
  $('barkMaterialUvGrid').onchange=event=>{const actual=node.querySelector('[data-bark-preview-mode="ACTUAL"]');if(event.target.checked&&!actual.disabled&&preview.debug.mode!=='ACTUAL')actual.click();preview.setGrid(event.target.checked);};
  function refresh() {
    button.hidden = !['TREE', 'BRANCH'].includes(mode()); button.disabled = Boolean(api.isBusy?.());
    const count = carriers().length, isSource = mode() === 'BRANCH';
    $('barkMaterialScopeHint').textContent = isSource ? '统一编辑这支素材的树皮，另存素材版本后用于装配。' : '主干与分枝共用一套树皮。左侧选材质，右侧调属性与配套贴图，应用后统一生效。';
    for (const id of ['barkMaterialApply', 'barkMaterialReset']) $(id).disabled = busy || !count || Boolean(api.isBusy?.());
    $('barkMaterialSave').disabled = busy || !store; $('barkMaterialRefresh').disabled = busy || !store;
    for (const id of Object.keys(fields)) $(id).disabled = busy;
    for(const control of node.querySelectorAll('#barkMaterialCards button,[data-bark-file],[data-bark-replace-map],.bark-map-options input,#barkMapAutoFill,#barkMapReplace'))control.disabled=busy;
    for(const pick of node.querySelectorAll('.bark-material-card>button:first-child'))pick.setAttribute('aria-pressed',String(pick.parentElement.dataset.barkPresetId===pickedId));
    const missing=['normal','roughness'].filter(slot=>!draft.maps?.[slot]);$('barkMapGenerate').disabled=busy||(!missing.length&&!$('barkMapReplace').checked);
    $('barkMapGenerate').textContent=busy&&generationJob?'正在生成…':$('barkMapReplace').checked?'重新生成配套贴图':'生成配套贴图';
    $('barkMapHint').textContent=missing.length?'可从当前颜色补齐'+missing.map(slot=>slot==='normal'?'法线':'粗糙度').join('、')+'，已有配套图保留。':$('barkMapReplace').checked?'重新生成会替换草稿中的两张配套图；应用后可撤销。':'配套图已齐全；要重调生成参数，请勾选替换。';

  }
  function open() {
    if (api.isBusy?.()) return;try { if(api.beforeOpen?.()===false)return; } catch(error) {api.toast?.(error.message,true);return;} $('barkMapReplace').checked=false;const authoring=api.getAuthoring(),material=authoring?.workbench?.bark_materials?.default||barkMaterialForBranch(authoring, api.getSelection?.()),preset=BARK_PRESETS.find(p=>p.style===material?.style&&p.color===material?.color);
    loadDraft(material || DEFAULT_BARK_PRESET, material ? preset?.name||'当前树干材质' : DEFAULT_BARK_PRESET.name,material?preset?.id:DEFAULT_BARK_PRESET.id); status('调整仅在右侧预览，点击「应用树干材质」统一生效；关闭可放弃。');
    if (!node.open) node.showModal();
    showPreview();renderCards(); if (store) refreshLibrary();
  }
  button.onclick = open; node.querySelector('[data-bark-close]').onclick = () => node.close(); node.addEventListener('close', () => { token++;stopGeneration(); busy = false;$('barkMaterialUvGrid').checked=false;preview.close(); });
  node.addEventListener('cancel', () => { token++;stopGeneration(); busy = false;$('barkMaterialUvGrid').checked=false;preview.close(); });
  loadDraft(draft, draftName); renderCards(); refresh();
  return { open, refresh, node, button, preview,get active() { return node.open; }, cancel() { if (node.open) node.close(); }, flushPending() { return true; } };
}
