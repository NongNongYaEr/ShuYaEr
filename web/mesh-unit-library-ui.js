import {normalizePlantUnitPack, plantPackFromBuiltin, UNIT_ROLES} from './plant-unit-data.js';
import {createPlantUnitStore} from './plant-unit-store.js';
import {plantUnitThumbnailDirection} from './plant-unit-thumbnails.js';
import {meshUnitFromPack, meshUnitFromGlb, buildMeshUnitModel, hydrateMeshUnitModel} from './mesh-unit-source.js';
import {disposeImportedTrunkTextures} from './imported-trunk-runtime.js';
import {renderPlantThumbnail} from './project-thumbnail.js';
import {resourceIcon} from './resource-ui.js';

const dragType = 'application/x-branchforge-mesh-unit';
const leafIcon = resourceIcon('resource-units');
const modelIcon = resourceIcon('resource-branch');

export function createMeshUnitLibraryUI({begin,toast,available,sources=()=>[],renderer}) {
  const section=document.createElement('section');
  section.id='treeMeshUnitLibrary';
  section.className='mesh-unit-library';
  section.setAttribute('aria-labelledby','meshUnitLibraryTitle');
  section.innerHTML=`<h2 id="meshUnitLibraryTitle">${leafIcon}叶花果装配</h2>
    <button id="meshUnitPackOpen" type="button" class="mesh-unit-pack-open" aria-haspopup="dialog" aria-controls="meshUnitPackPicker" aria-expanded="false">
      ${leafIcon}<span><strong>选择叶花果套装</strong><small>打开素材库</small></span><span aria-hidden="true">›</span>
    </button>
    <p id="meshUnitLibraryStatus" class="vine-note" role="status">选择套装后，将单件拖到树上，或点击卡片后选挂点。</p>
    <div id="meshUnitPackUnits" class="wb-library" aria-label="当前套装的单件"></div>
    <div class="mesh-unit-library-tools mesh-unit-glb-tools"><strong>外部整支</strong><button id="meshUnitGlbImport" type="button">导入整支 GLB</button></div>
    <input id="meshUnitGlbFile" type="file" accept=".glb,model/gltf-binary" hidden>
    <p id="meshUnitGlbStatus" class="vine-note" role="status" hidden></p>
    <div id="meshUnitImportedModels" class="wb-library" aria-label="可装配的外部整支"></div>`;
  document.querySelector('[data-page="foliage"]').prepend(section);
  const q=id=>section.querySelector('#'+id);
  const openPicker=q('meshUnitPackOpen'), packCards=q('meshUnitPackUnits'), modelCards=q('meshUnitImportedModels');
  const packStatus=q('meshUnitLibraryStatus'), glbStatus=q('meshUnitGlbStatus');
  const input=q('meshUnitGlbFile'), importButton=q('meshUnitGlbImport');
  const picker=document.createElement('dialog');
  picker.id='meshUnitPackPicker';
  picker.setAttribute('aria-labelledby','meshUnitPackPickerTitle');
  picker.innerHTML=`<header class="mesh-unit-picker-header">
      <div><h2 id="meshUnitPackPickerTitle">${leafIcon}添加叶花果素材</h2><p>选一套素材，套装里的单件会逐个显示在左侧。</p></div>
      <button type="button" data-close aria-label="关闭叶花果素材库">关闭</button>
    </header>
    <div class="blm-toolbar mesh-unit-picker-tools">
      <input type="search" data-search placeholder="搜索套装名称" aria-label="搜索叶花果套装">
      <button id="meshUnitPackRefresh" type="button">刷新素材库</button>
    </div>
    <div class="blm-body mesh-unit-picker-body">
      <section class="blm-results">
        <p data-count role="status"></p>
        <div class="mesh-unit-picker-grid"></div>
      </section>
      <aside>
        <div class="mesh-unit-card-preview" data-preview></div>
        <h3 data-name>选择一套叶花果</h3>
        <p data-details></p>
        <button type="button" data-use class="accent">使用套装</button>
        <p data-status role="status" hidden></p>
      </aside>
    </div>`;
  document.body.append(picker);
  const search=picker.querySelector('[data-search]'), pickerGrid=picker.querySelector('.mesh-unit-picker-grid');
  const usePack=picker.querySelector('[data-use]'), closePicker=picker.querySelector('[data-close]');
  const pickerStatus=picker.querySelector('[data-status]'), refreshPacks=picker.querySelector('#meshUnitPackRefresh');
  const localModels=new Map(), modelThumbnails=new Map(),sourceThumbnails=new Map();
  let store, records=new Map(), catalogTicket=0, packTicket=0, clickTicket=0;
  let currentPack=null, currentPackId='', pickerPackId='', pendingDrag=null, thumbnailPass=null, renderedModels=[];
  let visible=false, libraryStarted=false, readingModel=false;
  let loadingCatalog=false, usingPack=false;
  const inTree=()=>document.body.dataset.workbench==='TREE';

  function announce(node,text,error=false) {
    node.textContent=text;
    node.hidden=!text;
    node.classList.toggle('mesh-unit-error',error);
  }

  function packDetails(record) {
    return Number.isFinite(record.count) ? `${record.count} 个单件` : '叶花果套装';
  }

  function renderPackPreview(preview,record) {
    if (!record?.thumbnail) {
      preview.innerHTML=leafIcon;
      return;
    }
    const image=document.createElement('img');
    image.src=record.thumbnail;
    image.alt='';
    image.loading='lazy';
    preview.replaceChildren(image);
  }

  function showPickerSelection() {
    const record=records.get(pickerPackId);
    for (const button of pickerGrid.children) button.setAttribute('aria-pressed',String(button.dataset.packId===pickerPackId));
    renderPackPreview(picker.querySelector('[data-preview]'),record);
    picker.querySelector('[data-name]').textContent=record?.name||'选择一套叶花果';
    picker.querySelector('[data-details]').textContent=record?packDetails(record):'';
    usePack.disabled=loadingCatalog||usingPack||!record;
    closePicker.disabled=usingPack;
    refreshPacks.disabled=loadingCatalog||usingPack;
    search.disabled=usingPack;
  }

  function renderPackPicker() {
    if (!picker.open) return;
    const query=search.value.trim().toLocaleLowerCase();
    const matches=[...records.values()].filter(row=>[row.name,row.species].join(' ').toLocaleLowerCase().includes(query));
    if (!matches.some(row=>row.id===pickerPackId)) pickerPackId=matches[0]?.id||'';
    pickerGrid.replaceChildren();
    for (const row of matches) {
      const button=document.createElement('button');
      button.type='button';
      button.className='blm-card';
      button.dataset.packId=row.id;
      button.title=row.name;
      const preview=document.createElement('div');
      preview.className='mesh-unit-card-preview';
      renderPackPreview(preview,row);
      const name=document.createElement('strong');
      name.textContent=row.name;
      const details=document.createElement('span');
      details.textContent=row.id===currentPackId?`${packDetails(row)} · 当前套装`:packDetails(row);
      button.append(preview,name,details);
      button.onclick=()=>{
        pickerPackId=row.id;
        announce(pickerStatus,'');
        showPickerSelection();
      };
      button.ondblclick=()=>usePack.click();
      pickerGrid.append(button);
    }
    picker.querySelector('[data-count]').textContent=loadingCatalog?'正在读取素材库…'
      :matches.length?`显示 ${matches.length} / ${records.size} 套素材`
      :query?'没有匹配的套装。':'素材库里暂无套装。';
    showPickerSelection();
  }

  function resolveSource(entry) {
    if (entry.source) return Promise.resolve(entry.source);
    if (!entry.request) entry.request=meshUnitFromPack(entry.pack,entry.unit.id).catch(error=>{
      entry.request=null;
      throw error;
    });
    return entry.request;
  }

  function setCardThumbnail(card,thumbnail) {
    if (!thumbnail) return;
    const image=document.createElement('img');
    image.src=thumbnail;
    image.alt='';
    image.draggable=false;
    image.decoding='async';
    card.querySelector('.mesh-unit-card-preview').replaceChildren(image);
  }

  function rememberThumbnail(source,card){
    const image=card.querySelector('.mesh-unit-card-preview img');
    if(image)sourceThumbnails.set(source.id,image.src);
    return source;
  }

  function card(entry,name,details,icon,status) {
    const button=document.createElement('button');
    button.type='button';
    button.className='wb-asset';
    button.title=`${name} · 拖到树上或点击放置`;
    button.draggable=true;
    const preview=document.createElement('span');
    preview.className='mesh-unit-card-preview';
    preview.innerHTML=icon;
    const label=document.createElement('span');
    label.textContent=name;
    const meta=document.createElement('small');
    meta.textContent=details;
    button.append(preview,label,meta);
    button.onclick=async()=>{
      if (!available()) return;
      const ticket=++clickTicket;
      try {
        const source=rememberThumbnail(await resolveSource(entry),button);
        if (ticket===clickTicket && button.isConnected && available()) await begin(source);
      } catch(error) {
        if (ticket===clickTicket && button.isConnected) {
          announce(status,error.message,true);
          toast?.(error.message,true);
        }
      }
    };
    button.ondragstart=event=>{
      if (!available() || !event.dataTransfer) {event.preventDefault();return;}
      ++clickTicket;
      const token=crypto.randomUUID();
      pendingDrag={token,entry,button};
      event.dataTransfer.setData(dragType,token);
      event.dataTransfer.effectAllowed='copy';
    };
    button.ondragend=()=>{
      if (pendingDrag?.button===button) pendingDrag=null;
    };
    return button;
  }

  function cancelThumbnailPass() {
    if (!thumbnailPass) return;
    const job=thumbnailPass;
    thumbnailPass=null;
    job.preview?.dispose();
    job.host?.remove();
  }

  async function renderPackThumbnails() {
    if (!visible || !currentPack?.units.length || thumbnailPass || packCards.dataset.previews==='done') return;
    const job={pack:currentPack};
    thumbnailPass=job;
    try {
      const {createPlantUnitPreview}=await import('./plant-unit-preview.js');
      if (thumbnailPass!==job) return;
      job.host=document.createElement('div');
      job.host.className='mesh-unit-thumbnail-host';
      document.body.append(job.host);
      job.preview=createPlantUnitPreview(job.host,{cameraDirection:plantUnitThumbnailDirection});
      const images=await job.preview.load(job.pack);
      if (thumbnailPass!==job) return;
      for (const button of packCards.querySelectorAll('[data-unit-id]')) setCardThumbnail(button,images.get(button.dataset.unitId));
      packCards.dataset.previews='done';
    } catch {
      // The role icon remains available if a device cannot render thumbnails.
      if (thumbnailPass===job) packCards.dataset.previews='done';
    } finally {
      if (thumbnailPass===job) cancelThumbnailPass();
    }
  }

  async function loadPack(id,status=packStatus) {
    const ticket=++packTicket;
    const record=records.get(id);
    if (!record) return false;
    announce(status,'正在读取套装…');
    try {
      let pack;
      if (record.local || !record.file) pack=await store.get(id);
      if (!pack && record.file) {
        const response=await fetch('/assets/plants/'+encodeURIComponent(record.file));
        if (!response.ok) throw Error('配套素材读取失败。');
        pack=plantPackFromBuiltin(await response.json(),record);
      } else if (pack) pack=normalizePlantUnitPack(pack);
      if (ticket!==packTicket) return false;
      if (!pack) throw Error('套装已经移除，请刷新素材库。');
      ++clickTicket;
      cancelThumbnailPass();
      currentPack=pack;
      currentPackId=id;
      openPicker.querySelector('strong').textContent=pack.name;
      openPicker.querySelector('small').textContent='更换套装';
      openPicker.title=pack.name;
      packCards.replaceChildren();
      delete packCards.dataset.previews;
      for (const unit of pack.units) {
        const entry={pack,unit};
        const details=`${UNIT_ROLES[unit.role]} · ${(unit.size_m*100).toFixed(1)} cm`;
        const button=card(entry,unit.name,details,leafIcon,packStatus);
        button.dataset.unitId=unit.id;
        packCards.append(button);
      }
      announce(packStatus,pack.units.length ? `${pack.units.length} 个单件 · 拖到树上或点击放置` : '这套素材还没有单件。');
      refresh();
      void renderPackThumbnails();
      return true;
    } catch(error) {
      if (ticket===packTicket) announce(status,error.message,true);
      return false;
    }
  }

  async function loadCatalog() {
    if (usingPack) return;
    libraryStarted=true;
    loadingCatalog=true;
    const ticket=++catalogTicket;
    announce(packStatus,'正在读取叶花果素材库…');
    announce(pickerStatus,'');
    renderPackPicker();
    try {
      store ||= createPlantUnitStore();
      const [builtins,saved]=await Promise.allSettled([
        fetch('/assets/plant-unit-catalog.json').then(response=>{
          if (!response.ok) throw Error('配套素材目录读取失败。');
          return response.json();
        }),
        store.list(),
      ]);
      if (ticket!==catalogTicket) return;
      if (builtins.status==='rejected' && saved.status==='rejected') throw saved.reason;
      records=new Map((builtins.value||[]).map(row=>[row.id,row]));
      for (const row of saved.value||[]) records.set(row.id,{...records.get(row.id),...row,local:true});
      if (records.has(currentPackId)) await loadPack(currentPackId);
      else {
        ++packTicket;
        ++clickTicket;
        cancelThumbnailPass();
        currentPack=null;
        currentPackId='';
        openPicker.querySelector('strong').textContent='选择叶花果套装';
        openPicker.querySelector('small').textContent='打开素材库';
        openPicker.removeAttribute('title');
        packCards.replaceChildren();
        announce(packStatus,'选择套装后，将单件拖到树上，或点击卡片后选挂点。');
      }
    } catch(error) {
      if (ticket===catalogTicket) {
        announce(packStatus,error.message,true);
        announce(pickerStatus,error.message,true);
      }
    } finally {
      if (ticket===catalogTicket) {
        loadingCatalog=false;
        renderPackPicker();
      }
    }
  }

  function renderModels() {
    const all=new Map();
    for (const source of sources()) if (source.role==='GLB') {
      all.set(source.id,source);
      localModels.delete(source.id);
    }
    for (const [id,source] of localModels) all.set(id,source);
    const models=[...all.values()];
    if (models.length===renderedModels.length && models.every((source,index)=>source===renderedModels[index])) return;
    renderedModels=models;
    modelCards.replaceChildren();
    for (const source of models) {
      const button=card({source},source.name,'整支 GLB',modelIcon,glbStatus);
      button.dataset.meshSourceId=source.id;
      setCardThumbnail(button,modelThumbnails.get(source.id));
      modelCards.append(button);
    }
  }

  async function previewModel(source) {
    if (!renderer || modelThumbnails.has(source.id)) return;
    let group;
    try {
      group=buildMeshUnitModel(source);
      await hydrateMeshUnitModel(group);
      const thumbnail=renderPlantThumbnail(group,renderer,150,100);
      if (!thumbnail) return;
      modelThumbnails.set(source.id,thumbnail);
      for (const button of modelCards.children) if (button.dataset.meshSourceId===source.id) setCardThumbnail(button,thumbnail);
    } catch {
      // Import and placement remain usable without a thumbnail.
    } finally {
      disposeImportedTrunkTextures(group);
      group?.traverse(object=>{
        object.geometry?.dispose();
        for (const material of [object.material].flat()) material?.dispose();
      });
    }
  }

  function refresh() {
    section.hidden=!inTree();
    if (section.hidden) {
      if (picker.open) picker.close();
      pendingDrag=null;
      ++clickTicket;
      cancelThumbnailPass();
      return;
    }
    renderModels();
    const placeable=available();
    importButton.disabled=readingModel || !placeable;
    for (const button of section.querySelectorAll('.wb-asset')) button.disabled=!placeable;
  }

  openPicker.onclick=()=>{
    if (picker.open) return;
    pickerPackId=currentPackId;
    search.value='';
    announce(pickerStatus,'');
    picker.showModal();
    openPicker.setAttribute('aria-expanded','true');
    renderPackPicker();
    search.focus();
    if (!libraryStarted) void loadCatalog();
  };
  picker.onclose=()=>openPicker.setAttribute('aria-expanded','false');
  picker.oncancel=event=>{if(usingPack)event.preventDefault();};
  picker.addEventListener('keydown',event=>event.stopPropagation());
  search.oninput=()=>{
    announce(pickerStatus,'');
    renderPackPicker();
  };
  search.onkeydown=event=>{
    if (event.key==='Enter' && !event.isComposing) {event.preventDefault();usePack.click();}
  };
  refreshPacks.onclick=()=>loadCatalog();
  closePicker.onclick=()=>picker.close();
  usePack.onclick=async()=>{
    if (loadingCatalog||usingPack||!records.has(pickerPackId)) return;
    usingPack=true;
    picker.setAttribute('aria-busy','true');
    showPickerSelection();
    try {
      if (await loadPack(pickerPackId,pickerStatus) && picker.open) picker.close();
    } finally {
      usingPack=false;
      picker.removeAttribute('aria-busy');
      showPickerSelection();
    }
  };
  importButton.onclick=()=>input.click();
  input.onchange=async()=>{
    const file=input.files[0];
    input.value='';
    if (!file || readingModel || !available()) return;
    readingModel=true;
    refresh();
    announce(glbStatus,'正在读取整支 GLB…');
    try {
      const source=await meshUnitFromGlb(file);
      localModels.set(source.id,source);
      announce(glbStatus,`${source.name} 已就绪 · 拖到树上或点击放置`);
      refresh();
      await previewModel(source);
    } catch(error) {
      announce(glbStatus,error.message,true);
      toast?.(error.message,true);
    } finally {
      readingModel=false;
      refresh();
    }
  };
  new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['data-workbench']});
  new IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting;
    if (!visible) {cancelThumbnailPass();return;}
    refresh();
    if (!libraryStarted) void loadCatalog();
    else void renderPackThumbnails();
  }).observe(section);
  document.addEventListener('plantpack-library-changed',()=>{if(libraryStarted)void loadCatalog();});
  refresh();

  return {
    refresh,
    thumbnail:id=>sourceThumbnails.get(id)||modelThumbnails.get(id),
    acceptsDrag(event){return available() && Array.from(event.dataTransfer?.types||[]).includes(dragType);},
    sourceForDrag(event){
      const token=event.dataTransfer?.getData(dragType);
      if (!available() || !pendingDrag || token!==pendingDrag.token) return Promise.resolve(null);
      const {entry,button}=pendingDrag;
      pendingDrag=null;
      return resolveSource(entry).then(source=>rememberThumbnail(source,button));
    },
  };
}
