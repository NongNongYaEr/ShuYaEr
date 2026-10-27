import { sendProjectSave } from './project-save-request.js';
import { createAppConfirm } from './app-confirm.js';
import { attachSaveContext,templateContext } from './project-save-data.js';
import { PROJECT_THUMBNAIL_VERSION } from './project-thumbnail.js';

export function createProjectSession(api) {
  const confirm=createAppConfirm('projectSwitchConfirm');
  const panel=document.createElement('dialog');panel.id='projectSessionPanel';panel.hidden=true;panel.setAttribute('aria-labelledby','sessionTitle');
  panel.innerHTML=`<header class="session-heading"><div><small>树鸭儿 · 我的创作</small><h2 id="sessionTitle">我的工程</h2><p>浏览保存的作品，继续上次创作。</p></div><img src="/brand/guide-projects-v1.png" alt="" aria-hidden="true"><button type="button" data-session-close aria-label="关闭工程浏览器">关闭</button></header>
    <nav class="session-tabs" aria-label="工程分类"><button type="button" data-session-tab="saved" class="accent">已保存工程</button><button type="button" data-session-tab="recent">最近打开</button><button type="button" data-session-tab="draft">恢复草稿</button><button type="button" data-session-templates>整树样板库</button></nav>
    <div class="session-toolbar"><input id="sessionSearch" type="search" placeholder="搜索工程名或保存位置" aria-label="搜索我的工程"><select id="sessionKind" aria-label="工程类型"><option value="">全部类型</option><option value="TREE">整树</option><option value="BRANCH">单元枝</option><option value="VINE">藤蔓</option><option value="UNKNOWN">待分类</option></select><button type="button" data-session-refresh>刷新</button><button type="button" data-session-file>打开本地工程…</button></div>
    <div class="session-body"><section class="session-results"><div class="session-results-heading"><p id="sessionCount"></p><div class="session-preview-actions"><button type="button" data-session-previews-all title="重新生成当前分类的全部工程预览，包括已有图片；不受搜索和类型筛选影响">刷新全部预览</button><button type="button" data-session-previews>补齐缺失预览</button><button type="button" data-session-stop hidden>停止刷新</button></div></div><div class="session-list"></div></section><aside><div class="session-preview"></div><h3 id="sessionName">选择工程</h3><p id="sessionInfo"></p><p id="sessionPath"></p><button type="button" data-session-open class="accent" disabled>打开工程</button><button type="button" data-session-preview>刷新所选预览</button><button type="button" data-session-remove hidden>移除恢复草稿</button><p id="sessionHint">点选查看详情，双击继续编辑。</p></aside></div><footer><p data-session-status role="status" aria-live="polite"></p></footer>`;
  document.body.append(panel);
  const button=document.createElement('button');button.id='recentProjectsBtn';button.type='button';button.textContent='我的工程';button.title='浏览已保存工程、最近打开与恢复草稿';document.querySelector('[for="projectInput"]')?.after(button);
  const homeButton=button.cloneNode(true);homeButton.id='homeRecentProjectsBtn';document.querySelector('.brand-home-actions')?.append(homeButton);homeButton.onclick=()=>{document.getElementById('brandHomeDialog')?.close();button.click();};
  let draftId='draft-'+crypto.randomUUID().replaceAll('-',''),items=[],busy=false,pending=false,token=api.token(),savedToken=token,changedAt=Date.now(),loadedOnce=false,dismissed=false;
  let files=[],templates=[],tab='saved',selected='',opening=false,refreshSequence=0;
  let previewCache=new Map(),previewWorking=false,stopPreviews=false;
  const $=selector=>panel.querySelector(selector);
  const status=text=>$('[data-session-status]').textContent=text;
  const kindNames={TREE:'整树',BRANCH:'单元枝',VINE:'藤蔓',UNKNOWN:'待分类'};
  function hide(){stopPreviews=true;panel.close();panel.hidden=true;dismissed=true;}
  function show(){panel.hidden=false;if(!panel.open)panel.showModal();}
  const initialToken=token;
  const needsSave=()=>api.dirty()&&(loadedOnce||api.token()!==initialToken);
  const request=async(url,options)=>{const response=await fetch(url,options);const body=await response.json();if(!response.ok)throw Error(body.message||'恢复服务不可用');return body;};
  const beat=active=>request('/api/project-session/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:draftId,active})});
  async function refresh(){const sequence=++refreshSequence;
    const results=await Promise.allSettled([request('/api/project-session'),request('/api/saved-projects'),request('/api/project-library'),request('/api/branch-thumbnails')]);
    if(sequence!==refreshSequence)return;
    if(results[0].status==='fulfilled')items=results[0].value.items||[];
    if(results[1].status==='fulfilled')files=(results[1].value.items||[]).map(i=>({...i,section:'file',workspace:i.kind}));
    if(results[2].status==='fulfilled')templates=(results[2].value.items||[]).filter(i=>i.userSaved).map(i=>({...i,section:'template',workspace:i.kind,thumbnail:i.previewPath?'/api/project-preview?id='+encodeURIComponent(i.id)+'&revision='+encodeURIComponent(i.saveToken||i.mtimeMs):''}));
    if(results[3].status==='fulfilled')previewCache=new Map((results[3].value.items||[]).map(i=>[i.id,i]));
    render();const errors=results.filter(r=>r.status==='rejected');if(errors.length)status('部分工程列表未加载：'+errors.map(r=>r.reason.message).join('；'));
  }
  function available(){const now=Date.now();return tab==='saved'?[...files,...templates]:items.filter(i=>i.kind===tab&&(tab!=='draft'||i.id!==draftId&&(!i.active||now-i.heartbeatAt>90000)));}
  const previewKey=item=>(item.section==='template'?'project:':'project-browser:')+item.id;
  const previewRevision=item=>Math.max(1,Math.round(item.mtimeMs||item.updatedAt||item.savedAt||1));
  function previewImage(item){if(!item)return '';const cached=previewCache.get(previewKey(item));if(cached?.revision===previewRevision(item)&&cached.thumbnail_render_version===PROJECT_THUMBNAIL_VERSION)return cached.thumbnail;return item.section==='template'||item.thumbnail_version===PROJECT_THUMBNAIL_VERSION?item.thumbnail||'':'';}
  const documentUrl=item=>(item.section==='file'?'/api/saved-project-document?id=':item.section==='template'?'/api/project-document?id=':'/api/project-session/document?id=')+encodeURIComponent(item.id);
  function emptyPreview(element){element.replaceChildren();element.classList.add('session-empty-preview');const icon=document.createElement('span');icon.textContent='♧';icon.setAttribute('aria-hidden','true');const label=document.createElement('small');label.textContent='尚未生成预览';element.append(icon,label);}
  function fillPreview(element,item){element.classList.remove('session-empty-preview');element.replaceChildren();const src=previewImage(item);if(src){const image=document.createElement('img');image.src=src;image.alt='';image.loading='lazy';image.onerror=()=>emptyPreview(element);element.append(image);}else emptyPreview(element);}
  function visibleItems(){const query=$('#sessionSearch').value.trim().toLowerCase(),kind=$('#sessionKind').value;return available().filter(i=>(!kind||(i.workspace||'UNKNOWN')===kind)&&(!query||`${i.name} ${i.path||''} ${i.fileName||''}`.toLowerCase().includes(query))).sort((a,b)=>(b.mtimeMs||b.updatedAt||b.savedAt||0)-(a.mtimeMs||a.updatedAt||a.savedAt||0));}
  function details(){const item=available().find(i=>i.id===selected);
    $('#sessionName').textContent=item?.name||'选择工程';
    $('#sessionInfo').textContent=item?`${kindNames[item.workspace]||'植物工程'} · ${item.section==='template'?'个人样板 · V'+(item.version||1):item.section==='file'?'工程文件':item.kind==='draft'?'未保存恢复草稿':'最近打开快照'}\n${new Date(item.mtimeMs||item.updatedAt||item.savedAt).toLocaleString()} · ${((item.bytes||0)/1048576).toFixed(1)} MB`:'';
    $('#sessionPath').textContent=item?.path||item?.fileName||'';
    $('#sessionHint').textContent=item?.missing?'文件已移动或不存在，请使用「打开本地工程」重新选择。':item?.section==='file'?'读取当前磁盘上的完整工程，保留原文件。':item?.section==='template'?'继续编辑你保存的这个样板版本。':item?.kind==='draft'?'恢复后仍需保存工程；正式文件保持原样。':'这是上次打开或保存时的快照；最新磁盘文件请在「已保存工程」中打开。';
    fillPreview($('.session-preview'),item);
    $('[data-session-open]').disabled=!item||item.missing||opening||previewWorking;
    $('[data-session-preview]').disabled=!item||item.missing||opening||previewWorking;
    $('[data-session-preview]').textContent=previewImage(item)?'刷新所选预览':'生成所选预览';
    $('[data-session-previews]').disabled=previewWorking||opening||!visibleItems().some(i=>!i.missing&&!previewImage(i));
    $('[data-session-previews-all]').disabled=previewWorking||opening||!available().some(i=>!i.missing);
    $('[data-session-stop]').hidden=!previewWorking;
    $('[data-session-open]').textContent=item?.kind==='draft'?'恢复草稿':'打开工程';
    $('[data-session-remove]').hidden=item?.kind!=='draft';
    $('[data-session-remove]').disabled=previewWorking||opening;
    for(const card of $('.session-list').children)card.setAttribute('aria-pressed',String(card.dataset.id===selected));
  }
  function render(){const list=$('.session-list');list.replaceChildren();const query=$('#sessionSearch').value.trim().toLowerCase(),kind=$('#sessionKind').value;
    const visible=visibleItems();
    if(!visible.some(i=>i.id===selected))selected=visible[0]?.id||'';
    $('#sessionCount').textContent=`${visible.length} 份${tab==='saved'?'已保存工程':tab==='recent'?'最近打开快照':'恢复草稿'}`;
    status(tab==='saved'?'显示个人样板、通过软件保存的工程文件及本软件导出目录的工程副本。':tab==='recent'?'最近 6 份完整工程快照；与磁盘保存文件分别记录。':'编辑后约 30 秒保留恢复草稿；恢复后请保存工程。');
    for(const item of visible){const card=document.createElement('button');card.type='button';card.className='session-card';card.dataset.id=item.id;
      const preview=document.createElement('div');preview.className='session-card-preview';fillPreview(preview,item);
      const name=document.createElement('strong');name.textContent=(item.kind==='draft'?'恢复草稿 · ':'')+item.name;name.title=item.name;
      const meta=document.createElement('small');meta.textContent=item.missing?'文件已移动':`${kindNames[item.workspace]||'待分类'} · ${new Date(item.mtimeMs||item.updatedAt||item.savedAt).toLocaleDateString()}${item.section==='template'?' · V'+(item.version||1):''}`;
      card.append(preview,name,meta);card.onclick=()=>{selected=item.id;details();if(item.kind==='draft')startOpen(item);};card.ondblclick=()=>{if(item.kind!=='draft')startOpen(item);};card.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();startOpen(item);}};list.append(card);
    }
    if(!visible.length){const empty=document.createElement('p');empty.className='session-empty';empty.textContent=query||kind?'没有符合条件的工程。':tab==='saved'?'保存工程后会出现在这里；以前保存到其他位置的文件，可用「打开本地工程」选择。':tab==='draft'?'没有需要恢复的草稿。':'打开或保存工程后，会在这里显示。';list.append(empty);}
    for(const b of panel.querySelectorAll('[data-session-tab]')){b.classList.toggle('accent',b.dataset.sessionTab===tab);b.setAttribute('aria-pressed',String(b.dataset.sessionTab===tab));}details();
  }
  async function startOpen(item){if(!item||opening||previewWorking||item.missing)return;opening=true;details();try{await openItem(item);}catch(e){status(e.message);api.toast(e.message,true);}finally{opening=false;details();}}
  async function generatePreviews(mode){if(previewWorking||opening)return;const queue=mode==='all'?available().filter(i=>!i.missing):mode==='missing'?visibleItems().filter(i=>!i.missing&&!previewImage(i)):[available().find(i=>i.id===selected)].filter(i=>i&&!i.missing);if(!queue.length)return;
    previewWorking=true;stopPreviews=false;details();let completed=0,failed=0,lastError='';
    try{for(const item of queue){if(stopPreviews||!panel.open)break;status(`正在生成预览 ${completed+failed+1} / ${queue.length}：${item.name}…`);await new Promise(resolve=>setTimeout(resolve,30));if(stopPreviews)break;
      try{const doc=await request(documentUrl(item));if(stopPreviews)break;const preview=await api.thumbnailDocument(doc);if(!preview.image)throw Error('未生成植物图片');
        const entry={id:previewKey(item),revision:previewRevision(item),thumbnail:preview.image,thumbnail_render_version:PROJECT_THUMBNAIL_VERSION};
        await request('/api/branch-thumbnails',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)});previewCache.set(entry.id,entry);completed++;
        const card=[...$('.session-list').children].find(c=>c.dataset.id===item.id);if(card)fillPreview(card.querySelector('.session-card-preview'),item);if(selected===item.id)details();
      }catch(e){failed++;lastError=e.message;}
    }}finally{previewWorking=false;details();status(`${stopPreviews?'已停止；':''}已生成 ${completed} 张预览${failed?`，${failed} 张失败：${lastError}`:''}。预览已缓存，工程内容保持原样。`);}
  }
  async function removeSelected(){const item=items.find(i=>i.id===selected);if(item?.kind==='draft'&&await confirm({title:'移除恢复草稿？',name:item.name,message:'只移除自动恢复副本，正式工程不变。',accept:'移除草稿',danger:true})){await request('/api/project-session/document?id='+item.id,{method:'DELETE'});await refresh();}}
  async function checkpoint(force=false){if(busy||(!force&&api.blocked())||!api.dirty()||(!force&&api.token()===savedToken))return false;busy=true;
    try{const before=api.token(),doc=await api.capture();await sendProjectSave('/api/project-session/document',{id:draftId,name:doc.settings?.object_name||api.name(),workspace:api.mode?.(),thumbnail:await api.thumbnail?.()||'',thumbnail_version:PROJECT_THUMBNAIL_VERSION},JSON.stringify(doc));savedToken=before;return true;}
    catch(e){panel.querySelector('[data-session-status]').textContent='恢复草稿未保存：'+e.message;button.title='自动恢复未完成：'+e.message;return false;}finally{busy=false;}
  }
  async function guard(name,{confirmed=false}={}){if(pending)return false;pending=true;try{
    if(!confirmed&&needsSave()){const choice=await confirm({title:'切换工程？',name,detail:'当前工程有未保存修改',message:'保存后打开会先完成保存，再切换工程。直接打开会尝试保留自动恢复副本。',accept:'直接打开',save:true});if(!choice)return false;if(choice==='save'&&!await api.save({closeOnSuccess:true}))return false;}
    if(needsSave()){await api.prepareSwitch?.();const saved=await checkpoint(true);if(!saved)throw Error('无法保留当前恢复草稿，请先保存工程再切换');await beat(false);}
    return true;
  }finally{pending=false;}}
  async function remember(){const doc=await api.capture(),name=doc.settings?.object_name||api.name(),origin=api.origin?.()||{};const bytes=new TextEncoder().encode(name+'|'+(doc.authoring?.workbench?.project_save?.templateId||'')+'|'+(origin.path||origin.fileName||''));const hash=await crypto.subtle.digest('SHA-256',bytes);const id='recent-'+Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);await sendProjectSave('/api/project-session/document',{id,name,workspace:api.mode?.(),fileName:origin.path||origin.fileName||'',thumbnail:await api.thumbnail?.()||'',thumbnail_version:PROJECT_THUMBNAIL_VERSION},JSON.stringify(doc));}
  async function loaded(){loadedOnce=true;draftId='draft-'+crypto.randomUUID().replaceAll('-','');token=api.token();savedToken=token;changedAt=Date.now();try{await remember();await refresh();}catch(e){api.toast('工程已打开；最近工程记录失败：'+e.message,true);}}
  async function openItem(item){if(busy||api.blocked()||item.missing)return;if(!await guard(item.name))return;hide();
    await api.open(item.name,async progress=>{await progress(0,item.section?'读取保存的完整工程':'读取完整恢复快照');
      const url=item.section==='file'?'/api/saved-project-document?id=':item.section==='template'?'/api/project-document?id=':'/api/project-session/document?id=';
      let doc=await request(url+encodeURIComponent(item.id));
      if(item.section==='template')doc=attachSaveContext(doc,templateContext(item));
      const origin=item.section==='file'?{path:item.path,file:true}:item.section==='template'?{}:item.fileName?{fileName:item.fileName}:{};
      await api.load(doc,progress,origin);if(item.kind==='draft')api.markRecovered();await loaded();
      if(item.kind==='draft'){
        // Keep recovery available if the app exits again before an explicit save.
        if(await checkpoint(true)){await request('/api/project-session/document?id='+item.id,{method:'DELETE'});await refresh();}
        else api.toast('已恢复工程，原恢复草稿继续保留；请保存当前工程',true);
      }
    });
  }
  button.onclick=async()=>{if(panel.open){hide();return;}tab='saved';show();status('正在读取工程目录…');try{await refresh();}catch(e){status(e.message);}};
  panel.querySelector('[data-session-close]').onclick=hide;panel.addEventListener('cancel',e=>{e.preventDefault();hide();});
  $('[data-session-refresh]').onclick=()=>refresh().catch(e=>status(e.message));
  $('[data-session-file]').onclick=()=>{hide();document.getElementById('projectInput').click();};
  $('[data-session-templates]').onclick=()=>{hide();api.openLibrary?.();};
  $('[data-session-open]').onclick=()=>startOpen(available().find(i=>i.id===selected));
  $('[data-session-remove]').onclick=()=>removeSelected().catch(e=>status(e.message));
  $('[data-session-preview]').onclick=()=>generatePreviews('selected');$('[data-session-previews]').onclick=()=>generatePreviews('missing');$('[data-session-previews-all]').onclick=()=>generatePreviews('all');$('[data-session-stop]').onclick=()=>{stopPreviews=true;status('正在停止，保留已完成的预览…');};
  for(const b of panel.querySelectorAll('[data-session-tab]'))b.onclick=()=>{stopPreviews=true;tab=b.dataset.sessionTab;selected='';render();};
  $('#sessionSearch').oninput=()=>{stopPreviews=true;render();};$('#sessionKind').onchange=()=>{stopPreviews=true;render();};
  panel.addEventListener('keydown',e=>e.stopPropagation());panel.addEventListener('keyup',e=>e.stopPropagation());
  const showRecovery=()=>{if(!dismissed&&!panel.open&&!document.querySelector('dialog[open]')&&items.some(i=>i.kind==='draft'&&i.id!==draftId&&(!i.active||Date.now()-i.heartbeatAt>90000))){tab='draft';render();show();}};
  const timer=setInterval(()=>{const next=api.token();if(next!==token){token=next;changedAt=Date.now();}if(Date.now()-changedAt>30000&&!pending)checkpoint();beat(true).catch(()=>{});showRecovery();},5000);
  refresh().then(showRecovery).catch(()=>{});
  return {guard,loaded,checkpoint,refresh,openItem,needsSave,get draftId(){return draftId;},async saved(){if(busy||api.dirty())return;try{await request('/api/project-session/document?id='+draftId,{method:'DELETE'});savedToken=api.token();await remember();}catch(e){api.toast('工程已保存；最近工程记录失败：'+e.message,true);}},dispose(){clearInterval(timer);}};
}
