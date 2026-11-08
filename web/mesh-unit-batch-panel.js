import {MESH_BATCH_ZONES,meshUnitBatchStatus} from './mesh-unit-batch.js';
import {resourceIcon} from './resource-ui.js';

const unitIcon=resourceIcon('resource-units');
const button=(label,action)=>{
  const element=document.createElement('button');
  element.type='button';element.textContent=label;element.onclick=action;
  return element;
};

export function createMeshUnitBatchPanel(api){
  const panel=document.createElement('section');
  panel.id='meshUnitBatch';panel.className='wb-panel mesh-unit-batch';
  panel.innerHTML=`<h3>叶花果批量装配</h3><p class="vine-note">把左侧单件拖入分区，设置目标数量后应用。点素材图选中同款，Shift 加选，Ctrl 切换。</p>
    <div class="wb-assembly-count"><label>目标叶花果数量<input id="meshUnitBatchCount" type="number" min="0" max="1600" step="1" value="0"></label>
    <button type="button" id="meshUnitBatchApply">应用数量</button><p class="wb-assembly-capacity" role="status"></p></div><div data-zones></div>`;
  api.before.before(panel);
  const input=panel.querySelector('input'),apply=panel.querySelector('#meshUnitBatchApply');
  const message=panel.querySelector('[role="status"]'),zones=panel.querySelector('[data-zones]');
  let busy=false,last='',draft=false,feedback='',inputOwner;
  input.oninput=()=>{draft=true;};

  async function run(action){
    if(busy||!api.writable())return;
    busy=true;feedback='';refresh();
    try{feedback=await action()||'';}
    catch(error){feedback=error.message;api.toast(error.message,true);}
    finally{busy=false;refresh();}
  }

  apply.onclick=()=>run(async()=>{
    if(!input.reportValidity()||input.value==='')return;
    const count=await api.applyCount(input.valueAsNumber);
    draft=false;
    return `已应用 · ${count} 件`;
  });
  input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();apply.click();}};

  function refresh(){
    panel.hidden=!api.available();
    if(panel.hidden)return;
    const authoring=api.authoring(),data=authoring.mesh_units;
    if(inputOwner!==authoring){draft=false;inputOwner=authoring;if(!busy)feedback='';}
    const status=meshUnitBatchStatus(data,authoring),selected=api.selected(),isolated=api.isolated();
    input.min=String(status.minimum);input.max=String(status.maximum);
    if(!draft)input.value=String(status.current);
    apply.disabled=busy||!status.configured&&!status.automatic;
    message.textContent=busy?'正在处理叶花果装配…':feedback||`当前 ${status.current} 件 · 保留 ${status.minimum} 件 · 预算上限 ${status.maximum} 件`;
    const key=JSON.stringify([data?.slots,data?.instances.map(i=>[i.id,i.asset_id,i.shootRole,i.assembly_generated,i.assembly_manual,i.assembly_locked]),[...selected],isolated,busy]);
    if(key===last)return;
    last=key;zones.replaceChildren();
    const assets=new Map((data?.assets||[]).map(source=>[source.id,source]));
    for(const zone of MESH_BATCH_ZONES){
      const {role,label}=zone,section=document.createElement('div');
      section.className='wb-assembly-zone mesh-unit-batch-zone';section.dataset.meshUnitRole=role;
      const slots=data?.slots?.[role]||[],bySource=new Map(slots.map(id=>[id,[]]));
      for(const item of data?.instances||[]){
        if(!item.assembly_generated||item.shootRole!==role)continue;
        if(!bySource.has(item.asset_id))bySource.set(item.asset_id,[]);
        bySource.get(item.asset_id).push(item);
      }
      const members=[...bySource.values()].flat(),heading=document.createElement('strong');
      const zoneIds=members.map(item=>item.id),zoneSelected=zoneIds.filter(id=>selected.has(id)).length;
      const labelNode=document.createElement('span');labelNode.textContent=`${label} · ${members.length} 件${zoneSelected?` · 已选 ${zoneSelected}`:''}`;
      heading.append(labelNode);
      if(zoneIds.length){
        const controls=document.createElement('span');controls.className='mesh-unit-zone-selection';
        const replace=button('选本区',event=>api.select(zoneIds,event));replace.dataset.zoneSelect='';
        replace.className='wb-zone-select';replace.title='点击选本区 · Shift 加选 · Ctrl 切换';
        const allSelected=zoneSelected===zoneIds.length;
        const toggle=button(allSelected?'减选':'加选',()=>api.select(zoneIds,{shiftKey:!allSelected,ctrlKey:allSelected}));
        toggle.className='wb-zone-select';toggle.dataset.zoneToggle='';toggle.title=allSelected?'从选区移除本区挂件':'把本区挂件加入当前选区';
        controls.append(replace,toggle);heading.append(controls);
      }
      section.append(heading);
      for(const [sourceId,items] of bySource){
        const source=assets.get(sourceId);
        if(!source)continue;
        const configured=slots.includes(sourceId);
        const card=document.createElement('div');card.className='wb-assembly-card mesh-unit-batch-card';card.dataset.sourceId=sourceId;
        const thumbnail=api.thumbnail(sourceId);
        const image=thumbnail?document.createElement('img'):document.createElement('div');
        if(thumbnail){image.src=thumbnail;image.alt='';}
        else{image.className='wb-assembly-placeholder';image.innerHTML=unitIcon;}
        const ids=items.map(item=>item.id),picked=ids.filter(id=>selected.has(id)).length;
        const title=button('',event=>api.select(ids,event));title.title=`${source.name} · Shift 加选 · Ctrl 切换`;title.className='mesh-unit-batch-name';
        const name=document.createElement('span');name.textContent=source.name;
        title.append(image,name);title.disabled=!ids.length;
        card.dataset.selection=picked===0?'NONE':picked===ids.length?'ALL':'PARTIAL';
        title.setAttribute('aria-pressed',card.dataset.selection==='PARTIAL'?'mixed':String(card.dataset.selection==='ALL'));
        const locked=items.filter(item=>item.assembly_locked).length;
        const count=document.createElement('small');
        count.textContent=`${configured?'已用':'已移出样本 · 留在本区'} ${ids.length} · 已选 ${picked}${locked?` · 锁定 ${locked}`:''}`;
        const controls=document.createElement('div');controls.className='wb-card-actions';
        const key=role+':'+sourceId;
        const locate=button('定位',()=>api.locate(ids)),isolate=button(isolated===key?'取消隔离':'隔离',()=>api.isolate(key,ids));
        locate.disabled=isolate.disabled=!ids.length;
        const remove=button('×',()=>run(()=>{
          api.remove(role,sourceId);
          return `已移除 ${ids.length-locked} 件${locked?` · 锁定保留 ${locked} 件`:''}`;
        }));
        remove.disabled=!configured&&locked===ids.length;
        remove.title=remove.disabled?'解锁后可移除保留的挂件':'移出本区样本并删除未锁定的生成件，可撤销';
        remove.setAttribute('aria-label',`从${label}移除${source.name}`);
        controls.append(locate,isolate,remove);card.append(title,count,controls);section.append(card);
      }
      const drop=button('＋ 拖入或点击添加样本',()=>run(async()=>{
        const source=api.pickedSource();
        if(!source)throw Error('请先点选左侧单件，或把单件拖到这里。');
        await api.add(source,role);
      }));
      drop.className='wb-assembly-drop';section.append(drop);
      section.ondragover=event=>{
        if(busy||!api.writable()||!api.acceptsDrag(event))return;
        event.preventDefault();event.dataTransfer.dropEffect='copy';section.classList.add('drag-over');
      };
      section.ondragleave=event=>{if(!section.contains(event.relatedTarget))section.classList.remove('drag-over');};
      section.ondrop=event=>{
        if(busy||!api.writable()||!api.acceptsDrag(event))return;
        event.preventDefault();section.classList.remove('drag-over');
        const owner=api.authoring(),source=api.sourceForDrag(event);
        void run(async()=>{
          const item=await source;
          if(owner===api.authoring()&&item)await api.add(item,role);
        });
      };
      zones.append(section);
    }
  }
  return {refresh};
}
