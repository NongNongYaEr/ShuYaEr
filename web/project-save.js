import { copy, equalData } from './branch-workbench-data.js';
import { activeProject, projectBinding } from './project-library-data.js';
import { saveContext, defaultSaveMode, prepareSaveDocument, templateContext } from './project-save-data.js';
import { sendProjectSave } from './project-save-request.js';
import { PROJECT_THUMBNAIL_VERSION } from './project-thumbnail.js';

export function createProjectSavePanel(api) {
  const dialog=document.createElement('dialog');dialog.id='projectSaveDialog';dialog.setAttribute('aria-labelledby','psTitle');
  dialog.innerHTML=`<form id="psForm"><header><div><h2 id="psTitle">保存工程与样板</h2><p>保留完整枝条装配、叶花果、材质和编辑配置。</p></div><button type="button" id="psClose" aria-label="关闭保存面板">关闭</button></header>
    <div class="ps-body"><aside><img id="psPreview" alt="当前植物预览"><p id="psSummary"></p><strong>当前来源</strong><p id="psSource"></p><p id="psState"></p></aside>
    <section><fieldset id="psModes"><legend>保存方式</legend><label><input type="radio" name="saveMode" value="CURRENT"><span>保存当前版本 <small>更新当前个人样板，版本号不变，自动保留恢复备份</small></span></label><label><input type="radio" name="saveMode" value="FILE"><span>工程文件 <small>选择文件位置，之后继续编辑</small></span></label><label><input type="radio" name="saveMode" value="NEW"><span>新样板 <small>独立建档，加入整树样板库</small></span></label><label><input type="radio" name="saveMode" value="VERSION"><span>样板新版本 <small>继续迭代自己的样板，保留旧版本</small></span></label></fieldset>
    <label class="ps-field">名称<input id="psName" required maxlength="120" autocomplete="off"></label>
    <label class="ps-field">植物分类<select id="psSpecies"><option value="">未分类</option></select></label>
    <label class="ps-field">备注 <small>可选，记录这次调整</small><textarea id="psNotes" maxlength="2000" rows="3"></textarea></label>
    <div id="psPveOptions" hidden><label style="display:flex;align-items:center;gap:8px"><input id="psPveKeepHistory" type="checkbox" style="width:auto">保留历史备份（默认关闭）</label><small>勾选后，旧完整包及同名导出工程副本收进「导出/历史备份」。关闭时成功更新后清理临时旧包，失败仍恢复上一次完整包。</small></div><div class="ps-destination"><strong id="psAction"></strong><p id="psDestination"></p><p id="psVersionHint"></p></div></section></div>
    <footer><p id="psStatus" role="status" aria-live="polite"></p><div><button type="button" id="psCancel">取消</button><button type="button" id="psView" hidden>在样板库中查看</button><button type="submit" id="psSubmit" class="accent">保存</button></div></footer></form>`;
  document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);
  const badge=document.createElement('span');badge.id='projectSaveState';badge.setAttribute('role','status');document.getElementById('saveProjectBtn').after(badge);
  const identity=document.createElement('button');identity.id='currentProject';identity.type='button';identity.setAttribute('aria-haspopup','dialog');
  identity.innerHTML='<strong id="currentProjectName"></strong><span id="currentProjectMeta"></span>';
  document.querySelector('.build-actions').before(identity);
  const info=document.createElement('dialog');info.id='currentProjectDialog';info.setAttribute('aria-labelledby','currentProjectTitle');
  info.innerHTML='<header><h2 id="currentProjectTitle">当前工程</h2><button type="button" aria-label="关闭工程信息">关闭</button></header><dl></dl><p>修改名称或另存位置，请使用顶部「保存工程」。</p>';
  document.body.append(info);info.querySelector('button').onclick=()=>info.close();info.addEventListener('keydown',e=>e.stopPropagation());info.addEventListener('keyup',e=>e.stopPropagation());
  const origins=new Map();
  let baseline=null,busy=false,opening=false,finished=false,resolve=null,context={},speciesMap={},savedItem=null,fileOnly=false,exportPve=false,exportStatic=false,lastPath='',loaded=false,closeOnSuccess=false;
  const leafStamp=()=>api.leaves().map(({geometry,...source})=>({...copy(source),geometry:geometry?.uuid}));
  const stamp=()=>({authoring:api.authoring(),prefabs:api.prefabs?.(),settings:api.settings(),leaves:leafStamp(),mode:api.mode()});
  const dirty=()=>!baseline||baseline.authoring!==api.authoring()||baseline.prefabs!==api.prefabs?.()||baseline.mode!==api.mode()||!equalData(baseline.settings,api.settings())||!equalData(baseline.leaves,leafStamp());
  function projectInfo(){
    const source=saveContext(api.authoring()),origin=origins.get(api.mode())||{},objectName=api.settings().object_name;
    const name=origin.name&&objectName===origin.objectName?origin.name:objectName||'未命名工程';
    const kind=origin.recovered?'恢复草稿':(origin.fileName||origin.path&&origin.file)?'工程文件':source.templateId?(source.userSaved?'个人样板':'样板副本'):'新建工程';
    const workspace={TREE:'整树',BRANCH:'单元枝',VINE:'藤蔓'}[api.mode()]||'植物';
    const version=source.templateId&&kind!=='工程文件'?`V${source.version||1}`:'';
    const file=origin.path||origin.fileName||(source.templateId&&source.userSaved?source.sourcePath:'')||(source.templateId?'尚未另存的样板副本':'尚未保存到文件');
    return {name,kind,workspace,version,file,source};
  }
  function updateInfo(){const p=projectInfo(),state=badge.textContent.replace('● ','');
    identity.querySelector('strong').textContent=p.name;identity.querySelector('span').textContent=[p.workspace,p.kind,p.version].filter(Boolean).join(' · ');
    identity.title=[p.name,[p.workspace,p.kind,p.version].filter(Boolean).join(' · '),state,p.file,p.source.sourcePath&&p.source.sourcePath!==p.file?'来源：'+p.source.sourcePath:'','点击查看工程信息'].filter(Boolean).join('\n');identity.setAttribute('aria-label',`当前工程：${p.name}，${state}，查看工程信息`);
    const title=`${badge.dataset.dirty==='true'?'* ':''}${p.name} · 树鸭儿`;if(document.title!==title)document.title=title;
    if(info.open){const rows=[['工程名称',p.name],['工作区',p.workspace],['工程类型',[p.kind,p.version].filter(Boolean).join(' · ')],['保存状态',state],['当前文件',p.file]];
      if(p.source.sourceName)rows.push(['来源样板',p.source.sourceName+(p.source.templateId?' · V'+(p.source.version||1):'')]);
      if(p.source.sourcePath&&p.source.sourcePath!==p.file)rows.push(['来源位置',p.source.sourcePath]);
      const dl=info.querySelector('dl');dl.replaceChildren();for(const [label,value] of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd);}
    }
  }
  identity.onclick=()=>{info.showModal();updateInfo();info.querySelector('button').focus();};
  function updateBadge(){const changed=dirty();badge.textContent=changed?'● 未保存':loaded?'已载入':'已保存';badge.dataset.dirty=String(changed);badge.title=lastPath||'工程保存状态';updateInfo();}
  setInterval(updateBadge,800);updateBadge();
  const mode=()=>dialog.querySelector('input[name="saveMode"]:checked')?.value || 'FILE';
  function renderMode(){const value=mode();$('psSubmit').textContent=value==='CURRENT'?'保存当前版本':value==='FILE'?'选择位置并保存':value==='NEW'?'保存新样板':'保存新版本';
    $('psAction').textContent=value==='CURRENT'?`更新当前版本 · V${context.version||1}`:value==='FILE'?'保存为 .branch.json 工程':value==='NEW'?'创建独立样板 · V1':`追加版本 · V${(context.version||1)+1}`;
    $('psDestination').textContent=value==='CURRENT'?'更新当前样板的工程、预览与名称，保留同一卡片和版本号。':value==='FILE'?'下一步选择文件位置，保存后可在顶部「我的工程」中找到；不会自动加入整树样板库。':'保存到本软件「整树样板库」，完成后也可在顶部「我的工程」中找到。';
    $('psVersionHint').textContent=value==='CURRENT'?`将覆盖「${context.sourceName}」V${context.version||1}；覆盖前自动备份，可从备份工程另存恢复。`:value==='VERSION'?`基于「${context.sourceName}」V${context.version||1}，旧版本继续保留。`:value==='NEW'?'生成新卡片，来源样板保持原样。':'';
  }
  function close(){if(busy)return;dialog.close();const done=resolve;resolve=null;done?.('');}
  $('psClose').onclick=close;$('psCancel').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
  dialog.addEventListener('keydown',e=>{e.stopPropagation();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!busy&&!finished)$('psForm').requestSubmit();}});dialog.addEventListener('keyup',e=>e.stopPropagation());
  dialog.querySelectorAll('[name="saveMode"]').forEach(input=>input.onchange=renderMode);
  function lock(value){busy=value;dialog.setAttribute('aria-busy',String(value));for(const element of dialog.querySelectorAll('input,select,textarea,button'))element.disabled=value;}
  $('psView').onclick=()=>{if(savedItem){close();api.openLibrary(savedItem.id);}};
  const phase=async text=>{$('psStatus').textContent=text;await new Promise(done=>setTimeout(done,0));};
  $('psForm').onsubmit=async event=>{
    event.preventDefault();if(busy||finished||!$('psForm').reportValidity())return;
    const selected=mode();lock(true);
    try{
      await phase('正在整理当前工程…');
      const doc=await api.capture(),id=selected==='FILE'?'':selected==='CURRENT'?context.templateId:'template-'+crypto.randomUUID().replaceAll('-','');
      const prepared=prepareSaveDocument(doc,{name:$('psName').value,notes:$('psNotes').value,species:$('psSpecies').value,mode:selected,id,context});
      await phase('正在打包工程与贴图…');
      const projectJson=JSON.stringify(doc,null,selected==='FILE'?2:undefined);
      await phase(selected==='FILE'?(exportPve?'保存工程阶段：正在写入导出目录的工程副本…':'请选择工程文件保存位置…'):'正在写入样板和预览图…');
      let savedContext=prepared.context,path='';
      if(selected==='FILE'){
        const previewCanvas=document.createElement('canvas');previewCanvas.width=320;previewCanvas.height=240;
        if($('psPreview').complete&&$('psPreview').naturalWidth)previewCanvas.getContext('2d').drawImage($('psPreview'),0,0,320,240);
        const response=await sendProjectSave(exportPve?'/api/save-pve-project':'/api/save-project',{suggested_name:prepared.name.replace(/[<>:"/\\|?*]/g,'_')+'.branch.json',name:prepared.name,kind:api.mode(),thumbnail:previewCanvas.toDataURL('image/jpeg',.8),thumbnail_version:PROJECT_THUMBNAIL_VERSION,keep_history:exportPve&&$('psPveKeepHistory').checked,export_kind:exportStatic?'static':'pve'},projectJson);
        path=response.path||'';if(!path){$('psStatus').textContent='已取消选择位置，工程尚未保存。';return;}
      }else{
        const response=await sendProjectSave('/api/tree-template',{id,mode:selected,parentId:selected==='VERSION'?context.templateId:'',name:prepared.name,notes:prepared.notes,
          species:$('psSpecies').value,speciesName:speciesMap[$('psSpecies').value]?.name||'未分类',kind:api.mode(),binding:projectBinding(doc),thumbnail:$('psPreview').src,sourcePath:context.sourcePath||'',sourceId:context.templateId||'',saveToken:prepared.context.saveToken,expectedSaveToken:context.saveToken||''},projectJson);
        savedItem=response.item;savedContext=templateContext(savedItem);path=savedItem.path;
      }
      api.saved(prepared.name,savedContext);origins.set(api.mode(),{name:prepared.name,objectName:prepared.name,path,file:selected==='FILE'});baseline=stamp();loaded=false;lastPath=path;updateBadge();finished=true;
      $('psStatus').textContent=selected==='FILE'?`已保存工程：${path}`:selected==='CURRENT'?`已更新「${savedItem.name}」V${savedItem.version}。恢复备份：${savedItem.lastBackupPath}`:`已保存「${savedItem.name}」V${savedItem.version}，已加入整树样板库。`;
      $('psView').hidden=!savedItem;$('psCancel').textContent='完成';api.toast(selected==='CURRENT'?'当前版本已保存，覆盖前内容已备份':selected==='FILE'?'工程已保存':'样板已保存，原版本保留');
      const done=resolve;resolve=null;done?.(exportPve?{path,keepHistory:$('psPveKeepHistory').checked}:path);
      if(fileOnly||closeOnSuccess)dialog.close();
    }catch(error){$('psStatus').textContent='保存失败：'+error.message;api.toast(error.message,true);}
    finally{lock(false);if(finished){$('psSubmit').disabled=true;for(const element of dialog.querySelectorAll('input,select,textarea'))element.disabled=true;}else applyAvailableModes();}
  };
  function applyAvailableModes(){for(const input of dialog.querySelectorAll('[name="saveMode"]')){
    input.disabled=(fileOnly||!['TREE','VINE'].includes(api.mode()))&&input.value!=='FILE'||['VERSION','CURRENT'].includes(input.value)&&(!context.userSaved||!context.templateId);
    input.closest('label').classList.toggle('disabled',input.disabled);
  }}
  async function open(options={}){
    if(api.prefabBusy?.()){api.toast('预制正在整理或安装，请完成后再保存工程',true);return '';}
    if(dialog.open||opening){if(dialog.open)dialog.focus();return '';}
    opening=true;try{await api.flush();}finally{opening=false;}
    closeOnSuccess=options.closeOnSuccess===true;context={...saveContext(api.authoring())};fileOnly=options.fileOnly===true;exportStatic=options.exportStatic===true;exportPve=options.exportPve===true||exportStatic;finished=false;savedItem=null;lock(false);
    $('psPveOptions').hidden=!exportPve;$('psPveKeepHistory').checked=false;
    $('psView').hidden=true;$('psCancel').textContent='取消';$('psStatus').textContent='';
    $('psName').value=options.name||projectInfo().name;$('psNotes').value=context.notes||'';
    $('psSource').textContent=context.sourceName?`${context.sourceName} · V${context.version||1}`:'当前编辑工程';
    $('psState').textContent=dirty()?'当前编辑尚未保存。':loaded?'已从工程载入，可另存或继续制作。':'当前编辑已保存。';
    const asset=api.asset();$('psSummary').textContent=`${api.mode()==='TREE'?'整树':api.mode()==='BRANCH'?'单元枝':'藤蔓'} · ${api.installedCount?.()??api.authoring().branch_instances.length} 根安装单元枝 · ${asset?.placements.length||0} 片叶 · ${asset?.treeOrgans?.length||0} 个花果`;
    opening=true;try{$('psPreview').src=await api.thumbnail();}finally{opening=false;}
    const selected=fileOnly?'FILE':options.mode||defaultSaveMode(api.mode(),context);
    dialog.querySelector(`[value="${selected}"]`).checked=true;applyAvailableModes();if(dialog.querySelector('[name="saveMode"]:checked').disabled)dialog.querySelector('[value="FILE"]').checked=true;renderMode();
    if(exportPve){$('psSubmit').textContent='保存工程并开始导出';$('psAction').textContent='第 1 阶段 · 保存软件工程副本';$('psDestination').textContent='保存到本软件「导出」目录，再生成同名 _PVE_Complete 完整包。';$('psVersionHint').textContent='这一步保存 .branch.json 可编辑工程；完整包校验通过后才会提示导出成功。历史备份由“保留历史备份”勾选项控制；库中样板不变。';}
    if(exportStatic){$('psDestination').textContent='保存到本软件「导出」目录，再生成同名 _UE_Static 静态植被包。';$('psVersionHint').textContent='UE 5.8 官方 USD 导入入口：vegetation.usda。保留贴面造型和共享叶片，承载模型不导出；软件端校验后仍需在 UE 验证。';}
    const completion=new Promise(done=>{resolve=done;});
    dialog.showModal();$('psName').focus();
    try{if(!Object.keys(speciesMap).length){const response=await fetch('/assets/project-species.json');if(!response.ok)throw Error('植物分类读取失败');speciesMap=await response.json();}
      $('psSpecies').replaceChildren(new Option('未分类',''),...Object.entries(speciesMap).map(([id,value])=>new Option(value.name,id)));
      const tags=api.authoring().recipe?.tags||[];$('psSpecies').value=context.species||Object.keys(speciesMap).find(id=>tags.includes(id))||'';
    }catch(error){$('psStatus').textContent=error.message+'，仍可保存工程。';}
    return completion;
  }
  return {open,markRecovered(){baseline=null;origins.set(api.mode(),{...origins.get(api.mode()),recovered:true});updateBadge();},
    reset({all=false}={}){if(all)origins.clear();else origins.delete(api.mode());baseline=null;loaded=false;lastPath='';updateBadge();},
    activated({replacement=false}={}){if(replacement)this.reset();else updateBadge();},
    origin(){return {...origins.get(api.mode())};},
    loaded(origin={}){origins.clear();const source=saveContext(api.authoring());origins.set(api.mode(),{name:origin.name||(origin.fileName?'':source.sourceName)||'',objectName:api.settings().object_name,...origin});baseline=stamp();loaded=true;lastPath=origin.path||origin.fileName||source.sourcePath||'';updateBadge();},dirty};
}
