import * as THREE from 'three';
import {createBranchPlacementRaycast,pickBranchPlacementTarget} from './branch-installation.js';
import {meshUnitMatrix,meshUnitMountMatrix,resolveMeshUnitPlacements} from './mesh-unit-data.js';
import {buildMeshUnitModel,hydrateMeshUnitModel} from './mesh-unit-source.js';
import {INSTANCE_SCALE_MIN,INSTANCE_SCALE_MAX} from './assembly-scale.js';
import {MESH_UNIT_LIMIT} from './mesh-unit-state.js';
import {sampleLine,lineTangent} from './tree-sculpt.js';
import {nativeModelRevision} from './native-model-changes.js';
import {mountDistanceAt,slideMountParameter} from './branch-mount-drag.js';
import {createBranchSlideScreen} from './branch-carrier-slide.js';
import {MESH_BATCH_ZONES,addMeshUnitBatchSource,removeMeshUnitBatchSource,resizeMeshUnitBatch} from './mesh-unit-batch.js';
import {createMeshUnitBatchPanel} from './mesh-unit-batch-panel.js';
import {createMeshUnitThumbnailView} from './mesh-unit-thumbnail.js';
import {meshUnitBrushEntry,meshUnitBrushFrame,meshUnitLocalAxis} from './mesh-unit-brush.js';
import {createBranchOutlineBatch} from './branch-outline-batch.js';
import {meshUnitScreenBounds,meshUnitsInBox} from './mesh-unit-box-selection.js';
import {combineSelection} from './branch-selection.js';
import {mergeUnitAssemblySelection} from './unit-assembly-selection.js';

const zero = [0,0,0];
const defaults = {angle:48,azimuth:0,roll:0,scale:1,seed:1,variation:0,offset:zero,rotation:[0,0,0,1],assembly_manual:true};
const newId = () => 'MESH_'+crypto.randomUUID().replaceAll('-','');

function atTarget(instance,target){
  return {...instance,parent:target.parent,attach:target.attach,frame:target.frame,trunk_anchor:target.trunk_anchor,offset:zero};
}

function radialSurfaceTarget(item,parent,attach,asset,ray,span,cast){
  const center=sampleLine(parent.points,attach);
  const radial=item.radial.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(item.tangent,lineTangent(parent.points,attach)));
  const expected=asset.group.localToWorld(center.clone().add(radial));
  const origin=asset.group.localToWorld(center.clone().addScaledVector(radial.clone().normalize(),span));
  const axis=asset.group.localToWorld(center);
  ray.far=origin.distanceTo(axis)*1.001;
  ray.set(origin,axis.sub(origin).normalize());
  return cast(ray,{carrier:parent,nearPoint:expected});
}

function setMatrix(group,matrix) {
  group.matrixAutoUpdate=false;
  group.matrix.copy(matrix);
  group.matrixWorldNeedsUpdate=true;
}

function disposePrototype(group) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(object=>{
    if(!object.isMesh)return;
    geometries.add(object.geometry);
    for(const material of [object.material].flat()){
      materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  geometries.forEach(value=>value.dispose());
  materials.forEach(value=>value.dispose());
  const images=new Set([...textures].map(texture=>texture.image));
  textures.forEach(value=>value.dispose());
  images.forEach(image=>image?.close?.());
}

function groupFor(placement,prototype) {
  const group=prototype.clone(true);
  group.name=placement.source.name;
  group.userData.source_id=placement.source.id;
  group.userData.mesh_unit_id=placement.instance.id;
  group.traverse(object=>{if(object.isMesh)object.userData.mesh_unit_instance=placement.instance.id;});
  setMatrix(group,placement.matrix);
  return group;
}

export function addMeshUnitsToExport(asset,authoring,{skipMissingCarrier}={}) {
  const placements=resolveMeshUnitPlacements(authoring,asset,{skipMissingCarrier});
  if(!placements.length)return null;
  const root=new THREE.Group(),models=new Map();
  root.name='手动挂接';
  for(const placement of placements){
    if(!models.has(placement.source.id))models.set(placement.source.id,buildMeshUnitModel(placement.source));
    root.add(groupFor(placement,models.get(placement.source.id)));
  }
  asset.group.add(root);
  return root;
}

export function createMeshUnitWorkspace(api) {
  const {canvas,camera,modelRoot}=api;
  const root=new THREE.Group(),installed=new THREE.Group(),preview=new THREE.Group();
  root.name='手动挂接';root.add(installed,preview);modelRoot.add(root);
  const ray=new THREE.Raycaster();
  const cards=document.createElement('section');cards.className='wb-panel mesh-unit-placed';cards.id='meshUnitPlaced';cards.hidden=true;
  const zones=document.getElementById('wbAssemblyZones');
  if(zones)zones.after(cards);else document.querySelector('.inspector-scroll')?.append(cards);
  const bar=document.createElement('div');bar.className='mesh-unit-placement-bar';bar.id='meshUnitPlacement';bar.hidden=true;
  bar.innerHTML='<span data-target></span><label><input type="checkbox" data-repeat>连续安装</label><button type="button" data-confirm>确认安装</button><button type="button" data-cancel>取消</button>';
  canvas.parentElement.append(bar);
  const selectionAxes=createBranchOutlineBatch(new THREE.LineBasicMaterial({color:0x9dddeb,transparent:true,opacity:.8,depthTest:false,depthWrite:false}));
  selectionAxes.object.name='叶花果选区轴';selectionAxes.object.visible=false;root.add(selectionAxes.object);
  const models=new Map(),groups=new Map();
  const dropping=new Set();
  let placements=[],selected=new Set(),pending=null,lastData,lastAsset,lastRevision,frame=0,isolation=null,uiKey='',windFrame,copyGhosts=[];
  let combCache=null,showAxes=false;
  const thumbnails=createMeshUnitThumbnailView({renderer:api.renderer,
    getModel:source=>models.get(source.id)?.ready?models.get(source.id).group:null,
    getThumbnail:id=>api.library()?.thumbnail(id),
  });
  const batchPanel=createMeshUnitBatchPanel({
    before:cards,available:api.available,writable:api.canEdit,authoring:api.authoring,toast:api.toast,
    selected:()=>selected,isolated:()=>isolation?.key||'',pickedSource:()=>pending?.source,
    thumbnail:id=>api.library()?.thumbnail(id),acceptsDrag:event=>api.library()?.acceptsDrag(event),sourceForDrag:event=>api.library()?.sourceForDrag(event),
    select:selectMatching,locate,isolate,
    add(source,role){cancel();write('已添加叶花果分区样本',data=>addMeshUnitBatchSource(data,source,role));},
    remove(role,id){write('已移除叶花果分区样本与未锁定生成件',data=>removeMeshUnitBatchSource(data,role,id));},
    async applyCount(requested){
      const owner=api.authoring(),asset=api.asset(),revision=nativeModelRevision(asset);
      const shouldAbort=()=>owner!==api.authoring()||asset!==api.asset()||revision!==nativeModelRevision(asset)||!api.canEdit();
      const data=owner.mesh_units||{assets:[],instances:[]};
      const next=await resizeMeshUnitBatch(data,asset,owner,requested,{shouldAbort});
      if(shouldAbort())throw Error('树形或工程已变化，请重新应用数量。');
      cancel();write(`已应用叶花果数量 · ${next.instances.length} 件`,()=>next);
      return next.instances.length;
    },
  });

  function prototype(source){
    const previous=models.get(source.id);
    if(previous?.source.model.source.sha256===source.model.source.sha256)return previous;
    if(previous){previous.retired=true;if(previous.ready)disposePrototype(previous.group);}
    const entry={source,group:buildMeshUnitModel(source),ready:false};models.set(source.id,entry);
    entry.loading=hydrateMeshUnitModel(entry.group).then(()=>{
      if(entry.retired){disposePrototype(entry.group);return;}
      entry.ready=true;
      thumbnails.modelReady(source);combCache=null;
      applyIsolation();
      refreshOutline();
      if(pending?.source===source)refreshPreview();
    }).catch(error=>{
      disposePrototype(entry.group);
      if(models.get(source.id)===entry)models.delete(source.id);
      if(!entry.retired)api.toast(`装配素材贴图读取失败 · ${error.message}`,true);
    });
    return entry;
  }

  function releaseUnused(data){
    const keep=new Set((data?.assets||[]).map(source=>source.id));
    if(pending)keep.add(pending.source.id);
    for(const request of dropping)keep.add(request.source.id);
    for(const [id,item] of models)if(!keep.has(id)){
      models.delete(id);item.retired=true;if(item.ready)disposePrototype(item.group);
    }
  }

  function sync(force=false){
    const asset=api.asset(), data=api.authoring()?.mesh_units, revision=nativeModelRevision(asset);
    root.visible=api.available()&&api.canPreview();
    const axisVisibility=root.visible&&api.showSelection();
    const visibilityChanged=showAxes!==axisVisibility;showAxes=axisVisibility;
    if(pending&&(!root.visible||!api.canEdit()))cancel();
    if(!force&&asset===lastAsset&&data===lastData&&revision===lastRevision){if(visibilityChanged)refreshOutline();return;}
    lastAsset=asset;lastData=data;lastRevision=revision;
    placements=asset&&api.available()?resolveMeshUnitPlacements(api.authoring(),asset,{strict:false}):[];
    const ids=new Set(placements.map(item=>item.instance.id));
    for(const [id,item] of groups)if(!ids.has(id)){item.group.removeFromParent();groups.delete(id);}
    for(const placement of placements){
      const id=placement.instance.id;
      let item=groups.get(id);
      if(item?.source!==placement.source){
        item?.group.removeFromParent();
        const model=prototype(placement.source),group=groupFor(placement,model.group);
        group.visible=model.ready;installed.add(group);item={group,source:placement.source};groups.set(id,item);
      }
      setMatrix(item.group,placement.matrix);
    }
    const existing=new Set((data?.instances||[]).map(instance=>instance.id));
    const retained=[...selected].filter(id=>existing.has(id));
    if(retained.length!==selected.size){selected=new Set(retained);api.selectionCleared?.();}
    releaseUnused(data);applyIsolation();refreshCards();refreshOutline();
  }

  function refreshOutline(){
    const entries=[];
    if(showAxes){
      for(const id of selected){
        const group=groups.get(id)?.group,model=models.get(group?.userData.source_id);
        if(group?.visible&&model)entries.push({id,points:meshUnitLocalAxis(model.source,model.group),matrix:group.matrix});
      }
      for(const group of copyGhosts){
        const model=models.get(group.userData.source_id);
        if(model)entries.push({id:`copy:${group.userData.mesh_unit_id}`,points:meshUnitLocalAxis(model.source,model.group),matrix:group.matrix});
      }
    }
    selectionAxes.update(entries);
  }

  function showWind(pose){
    if(pose===windFrame)return;
    windFrame=pose;
    for(const {instance,parent,matrix} of placements){
      const group=groups.get(instance.id)?.group;
      if(!group)continue;
      const rigid=pose?.transforms.get(parent.id)?.matrix,curved=pose?.updated.get(parent.id);
      if(rigid){setMatrix(group,rigid.clone().multiply(matrix));continue;}
      if(curved){
        const t=instance.attach,rotation=new THREE.Quaternion().setFromUnitVectors(lineTangent(parent.points,t),lineTangent(curved.points,t));
        const position=sampleLine(curved.points,t).sub(sampleLine(parent.points,t).applyQuaternion(rotation));
        const motion=new THREE.Matrix4().makeRotationFromQuaternion(rotation).setPosition(position);
        setMatrix(group,motion.multiply(matrix));
      }else setMatrix(group,matrix);
    }
    if(selected.size)refreshOutline();
  }

  function select(ids){
    const hadSelection=selected.size>0;
    selected=new Set(ids);
    if(selected.size)api.selectMesh();
    else if(hadSelection)api.selectionCleared?.();
    refreshCards();refreshOutline();
  }

  function button(text,action){const value=document.createElement('button');value.type='button';value.textContent=text;value.onclick=action;return value;}

  function selectMatching(ids,event){
    if(!ids.length)return;
    select(mergeUnitAssemblySelection(selected,ids,{shift:event.shiftKey,ctrl:event.ctrlKey}));canvas.focus();
  }

  function locate(ids){
    const bounds=new THREE.Box3();
    for(const id of ids){const item=groups.get(id);if(item)bounds.expandByObject(item.group);}
    if(!bounds.isEmpty())api.fit(bounds);
  }

  function isolate(key,ids){
    isolation=isolation?.key===key?null:{key,ids:new Set(ids)};
    applyIsolation();refreshCards();refreshOutline();
  }

  function refreshCards(){
    batchPanel.refresh();
    const data=api.authoring()?.mesh_units;
    const manual=data?.instances.filter(i=>!i.assembly_generated||!MESH_BATCH_ZONES.some(zone=>zone.role===i.shootRole))||[];
    const visible=api.available()&&(manual.length>0||selected.size>0);
    cards.hidden=!visible;
    if(!visible){uiKey='';thumbnails.reset();cards.replaceChildren();return;}
    const key=JSON.stringify([manual.map(i=>[i.id,i.asset_id]),data?.instances.filter(i=>selected.has(i.id)).map(i=>[i.id,i.assembly_locked]),[...selected],isolation?.key,placements.length]);
    if(key===uiKey)return;uiKey=key;
    const heading=document.createElement('h3');heading.textContent=manual.length?`手动挂接 · ${manual.length} 件`:'叶花果选区';
    const status=document.createElement('p');status.className='vine-note';status.textContent=`已选 ${selected.size} 件${placements.length!==data.instances.length?' · 有实例需重新挂接':''}`;
    thumbnails.reset();cards.replaceChildren(heading,status);
    const bySource=new Map();
    for(const instance of manual){if(!bySource.has(instance.asset_id))bySource.set(instance.asset_id,[]);bySource.get(instance.asset_id).push(instance);}
    for(const source of data.assets){
      const instances=bySource.get(source.id);if(!instances?.length)continue;
      const row=document.createElement('div');row.className='mesh-unit-placed-row';
      const ids=instances.map(i=>i.id),count=ids.filter(id=>selected.has(id)).length;
      const title=button('',event=>selectMatching(ids,event));title.className='mesh-unit-placed-select';
      const label=document.createElement('span');label.className='mesh-unit-placed-label';
      label.textContent=`${source.name} · 已选 ${count}/${ids.length}`;title.title=source.name;
      title.append(thumbnails.mount(source),label);
      title.setAttribute('aria-pressed',String(count===ids.length));
      row.append(title,button('定位',()=>locate(ids)),button(isolation?.key===source.id?'取消隔离':'隔离',()=>isolate(source.id,ids)));
      cards.append(row);
    }
    if(selected.size){
      const actions=document.createElement('div');actions.className='mesh-unit-placed-actions';
      const locked=[...selected].every(id=>data.instances.find(instance=>instance.id===id)?.assembly_locked);
      const lock=button(locked?'解锁':'锁定',()=>updateSelected('已更新挂接锁定',i=>({...i,assembly_locked:!locked}),true));
      const reattach=button('重新挂接',()=>{
        const instance=data.instances.find(i=>selected.has(i.id));
        if(instance&&!instance.assembly_locked)begin(data.assets.find(s=>s.id===instance.asset_id),null,instance);
      });reattach.disabled=selected.size!==1||locked;
      actions.append(lock,reattach,button('移除所选',remove));cards.append(actions);
    }
  }

  function applyIsolation(){
    if(isolation&&![...isolation.ids].some(id=>groups.has(id)))isolation=null;
    for(const [id,item] of groups)item.group.visible=!!models.get(item.source.id)?.ready&&(!isolation||isolation.ids.has(id));
    if(selected.size)api.refreshBrushScope?.();
  }

  const combTargets=()=>placements.filter(({instance})=>selected.has(instance.id)&&!instance.assembly_locked&&groups.get(instance.id)?.group.visible);

  const combBrush={
    entries(){
      const authoring=api.authoring(),asset=api.asset();
      if(combCache?.placements===placements&&combCache.selected===selected&&combCache.isolation===isolation)return combCache.entries;
      const entries=combTargets().map(item=>meshUnitBrushEntry(item,models.get(item.source.id).group,asset,authoring));
      combCache={placements,selected,isolation,entries};return entries;
    },
    summary(){
      const editable=combTargets().length;
      return {selected:selected.size,editable,reason:editable?'':'选中的叶花果已锁定、隐藏或缺少有效挂点。'};
    },
    reference(event){
      const id=hitInstance(event),item=placements.find(entry=>entry.instance.id===id);
      return item?meshUnitBrushFrame(item.source,item.matrix):null;
    },
    preview(entries){
      const asset=api.asset(),authoring=api.authoring(),revision=nativeModelRevision(asset);
      const selection=selected,isolationAtStart=isolation;
      const originals=entries.map(({id,frame})=>({id,group:groups.get(id).group,matrix:frame.matrix}));
      const valid=()=>api.asset()===asset&&api.authoring()===authoring&&nativeModelRevision(asset)===revision&&root.visible
        &&selection===selected&&isolationAtStart===isolation;
      return {valid,
        updateTransforms(transforms){
          for(const {id,group,matrix} of originals){const motion=transforms.get(id);if(motion)setMatrix(group,motion.matrix.clone().multiply(matrix));}
          refreshOutline();
        },
        restore(){
          if(!valid()){sync(true);return;}
          for(const {group,matrix} of originals)setMatrix(group,matrix);
          refreshOutline();
        },
      };
    },
    commit(updates,label){
      if(!api.canEdit())return false;
      write(label,data=>({...data,instances:data.instances.map(instance=>{
        const after=updates.get(instance.id);
        return after&&!instance.assembly_locked?{...instance,rotation:after.rotation,scale:after.scale,assembly_manual:true}:instance;
      })}));
      return true;
    },
  };

  function write(label,mutation){
    api.commit(label,authoring=>{
      const data=authoring.mesh_units||{assets:[],instances:[]};
      const next=mutation(data);
      if(next.instances.length||next.assets.length)authoring.mesh_units=next;else delete authoring.mesh_units;
    });
    sync();applyIsolation();
  }

  function updateSelected(label,transform,allowLocked=false){
    if(!api.canEdit())return;
    write(label,data=>({...data,instances:data.instances.map(instance=>selected.has(instance.id)&&(allowLocked||!instance.assembly_locked)?transform(instance):instance)}));
  }

  function remove(){
    if(!api.canEdit())return false;
    const data=api.authoring().mesh_units;
    if(!data?.instances.some(i=>selected.has(i.id)&&!i.assembly_locked))return false;
    write('已移除手动挂接 · 可撤销',data=>{
      const instances=data.instances.filter(i=>!selected.has(i.id)||i.assembly_locked);
      const used=new Set([...instances.map(i=>i.asset_id),...Object.values(data.slots||{}).flat()]);
      return {...data,instances,assets:data.assets.filter(source=>used.has(source.id))};
    });
    return true;
  }

  function pick(event,cast){
    return pickBranchPlacementTarget(event,{canvas,camera,ray,asset:api.asset(),authoring:api.authoring(),surface:true,cast});
  }

  function cancel(){
    if(!pending)return false;
    pending=null;preview.clear();bar.hidden=true;cancelAnimationFrame(frame);frame=0;
    releaseUnused(api.authoring()?.mesh_units);refreshOutline();return true;
  }

  function pendingRecord(){
    const {source,target,existing}=pending;
    return atTarget({...defaults,...existing,id:existing?.id||pending.id,asset_id:source.id,assembly_manual:true},target);
  }

  function refreshPreview(){
    preview.clear();
    const confirmButton=bar.querySelector('[data-confirm]');
    confirmButton.disabled=true;
    if(!pending)return;
    const {source,target}=pending;
    bar.querySelector('[data-target]').textContent=target?`${source.name} · 枝干表面挂点`:`${source.name} · 请点选枝干表面`;
    const model=models.get(source.id),asset=api.asset();
    const parent=asset?.masterBranches.find(b=>b.stableId===target?.parent);
    if(!model?.ready||!parent)return;
    try{
      const instance=pendingRecord();
      const carrier=target.surface_binding?{...parent,trunkAttachments:new Map([[instance.id,target.surface_binding]])}:parent;
      const matrix=meshUnitMatrix(instance,source,carrier,asset,api.authoring());
      preview.add(groupFor({source,instance,matrix},model.group));
      confirmButton.disabled=false;
    }catch(error){api.toast(error.message,true);}
  }

  function begin(source,target=null,existing=null){
    if(!source||!api.canEdit())return false;
    source=api.authoring()?.mesh_units?.assets.find(item=>item.id===source.id)||source;
    cancel();api.preparePlace();
    pending={source,target,existing,id:newId(),owner:api.owner()};
    bar.hidden=false;
    try{prototype(source);refreshPreview();}
    catch(error){cancel();api.toast(error.message,true);return false;}
    return true;
  }

  function place(source,record,existing){
    const asset=api.asset(),parent=asset.masterBranches.find(branch=>branch.stableId===record.parent);
    if(!parent)return false;
    const authoring=api.authoring(),total=authoring.branch_instances.length+(authoring.mesh_units?.instances.length||0);
    if(!existing&&total>=MESH_UNIT_LIMIT){api.toast('整树装配实例达到当前预算。',true);return false;}
    try{
      meshUnitMatrix(record,source,parent,asset,authoring);
      write(existing?'已重新挂接':'已挂接 '+source.name,data=>({
        ...data,
        assets:data.assets.some(item=>item.id===source.id)?data.assets:[...data.assets,source],
        instances:existing?data.instances.map(item=>item.id===existing.id?record:item):[...data.instances,record],
      }));
      return true;
    }catch(error){api.toast(error.message,true);return false;}
  }

  function confirm(){
    if(!pending?.target||!api.canEdit()||!models.get(pending.source.id)?.ready)return false;
    if(pending.owner!==api.owner()){cancel();api.toast('当前工程已切换，请重新选择挂接素材。',true);return false;}
    const {source,existing}=pending,record=pendingRecord();
    const repeat=bar.querySelector('[data-repeat]').checked&&!existing;
    if(!place(source,record,existing))return false;
    cancel();select([record.id]);
    if(repeat)begin(source);
    canvas.focus();return true;
  }

  async function drop(sourcePromise,target){
    const asset=api.asset(),revision=nativeModelRevision(asset);
    const valid=()=>asset===api.asset()&&revision===nativeModelRevision(asset)&&api.canEdit();
    let request;
    try{
      const picked=await sourcePromise;
      if(!picked||!valid())return;
      const source=api.authoring()?.mesh_units?.assets.find(item=>item.id===picked.id)||picked;
      cancel();api.preparePlace();
      request={source};dropping.add(request);
      const model=prototype(source);
      await model.loading;
      if(!valid()||!model.ready||models.get(source.id)!==model)return;
      const record=atTarget({...defaults,id:newId(),asset_id:source.id,assembly_manual:true},target);
      if(place(source,record)){select([record.id]);canvas.focus();}
    }catch(error){api.toast(error.message,true);}
    finally{
      if(request){dropping.delete(request);releaseUnused(api.authoring()?.mesh_units);}
    }
  }

  function hitInstance(event){
    const rect=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
    installed.updateWorldMatrix(true,true);
    const visible=installed.children.filter(group=>group.visible);
    const hit=ray.intersectObjects(visible,true).find(item=>item.object.userData.mesh_unit_instance);
    return hit?.object.userData.mesh_unit_instance;
  }

  function boxSelection(){
    if(!api.canEdit()||!root.visible||pending)return null;
    const asset=api.asset(),owner=api.authoring(),revision=nativeModelRevision(asset),before=selected;
    const viewport=canvas.getBoundingClientRect();
    camera.updateMatrixWorld();installed.updateWorldMatrix(true,true);
    const clip=camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse),items=[];
    for(const [id,{group,source}] of groups){
      const model=models.get(source.id)?.group;
      if(!group.visible||!model)continue;
      const bounds=meshUnitScreenBounds(model,clip.clone().multiply(group.matrixWorld),viewport);
      if(bounds)items.push({id,bounds});
    }
    if(!before.size&&!items.length)return null;
    return {exclusive:before.size>0,unit:'件挂件',hits:polygon=>meshUnitsInBox(items,polygon),
      apply(hits,operation,{clear=false}={}){
        if(asset!==api.asset()||owner!==api.authoring()||revision!==nativeModelRevision(asset)||before!==selected)return;
        select(clear?[]:combineSelection(before,hits,operation));
      },
    };
  }

  function temporarySelect(event,operation){
    if(!api.canEdit()||!root.visible||pending)return false;
    const id=hitInstance(event);
    if(!id)return false;
    select(combineSelection(selected,new Set([id]),operation));return true;
  }

  function pointerDown(event){
    if(!api.canEdit()||!root.visible||event.button!==0)return false;
    if(pending){const target=pick(event);if(target){pending.target=target;confirm();}return true;}
    if(!api.canPick())return false;
    const id=hitInstance(event);
    if(!id){if(!event.shiftKey&&!event.ctrlKey)select([]);return false;}
    const next=event.shiftKey||event.ctrlKey?new Set(selected):new Set();
    if(event.ctrlKey)next.delete(id);else next.add(id);select(next);canvas.focus();return true;
  }

  function move(event){
    if(!pending||frame||event.buttons)return;
    frame=requestAnimationFrame(()=>{frame=0;if(pending){pending.target=pick(event);refreshPreview();}});
  }

  function keyboardPlacement(items,asset,authoring,center,valid,duplicate){
    const parents=new Map(asset.masterBranches.map(branch=>[branch.stableId,branch]));
    const cast=createBranchPlacementRaycast({asset,authoring,surface:true});
    const probe=new THREE.Raycaster();
    if(duplicate&&authoring.branch_instances.length+authoring.mesh_units.instances.length+items.length>MESH_UNIT_LIMIT){
      api.toast('整树装配实例达到当前预算。',true);return null;
    }
    camera.updateWorldMatrix(true,false);
    const screen=createBranchSlideScreen(asset.masterBranches,{camera,modelRoot:asset.group,bounds:canvas.getBoundingClientRect()});
    let span;
    const entries=items.map(item=>{
      const {instance,source,parent}=item,{attach}=instance;
      const original=duplicate?{...instance,assembly_manual:true,assembly_locked:false,offset:zero}:instance;
      const matrix=duplicate?meshUnitMatrix(original,source,parent,asset,authoring):item.matrix;
      const pivot=new THREE.Vector3(...source.connector.position),mount=meshUnitMountMatrix(instance,source,parent,asset,authoring);
      const tangent=lineTangent(parent.points,attach),radial=pivot.clone().applyMatrix4(mount).sub(sampleLine(parent.points,attach));
      radial.addScaledVector(tangent,-radial.dot(tangent));
      if(radial.lengthSq()<1e-12){
        const side=Math.abs(tangent.z)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1);
        radial.crossVectors(tangent,side).normalize();
      }
      const group=duplicate?groupFor({instance:original,source,matrix},models.get(source.id).group):groups.get(instance.id).group;
      return {original,originalMatrix:matrix,source,parent,anchor:screen.project(pivot.applyMatrix4(matrix)),radial,tangent,group,carrier:parent,next:original};
    });
    if(duplicate){copyGhosts=entries.map(entry=>entry.group);preview.add(...copyGhosts);}
    const clearPreview=()=>{
      for(const group of copyGhosts)group.removeFromParent();copyGhosts=[];
      sync(true);
    };
    function probeSurface(entry,parent,attach){
      span??=Math.max(.1,new THREE.Box3().setFromObject(asset.group).getSize(new THREE.Vector3()).length());
      return radialSurfaceTarget(entry,parent,attach,asset,probe,span,cast);
    }
    return {center,label:`${duplicate?'复制':'调整'} ${items.length} 件叶花果`,alongBranch:true,valid,
      hint:'沿枝滑动 · 指向另一根枝干换挂点 · 数值沿原枝移动',
      update(_delta,{start,pointer,numeric=''}={}){
        const distance=numeric.trim()?Number(numeric):null;
        const dx=pointer&&start?pointer.x-start.x:0,dy=pointer&&start?pointer.y-start.y:0;
        const moving=distance===null?Math.hypot(dx,dy)>=2:Number.isFinite(distance)&&distance!==0;
        for(const entry of entries){
          const {original,originalMatrix,parent,source,anchor,group}=entry;
          let target=null;
          try{
            if(moving&&distance!==null){
              const attach=slideMountParameter(parent.points,original.attach,distance);
              if(Math.abs(attach-original.attach)>1e-9)target=probeSurface(entry,parent,attach);
            }else if(moving&&anchor.w>0){
              const x=anchor.x+dx,y=anchor.y+dy;
              target=pick({clientX:x,clientY:y},cast);
              if(!target){
                const candidate=screen.pick(x,y,entry.carrier,parent,original.attach);
                if(candidate)target=probeSurface(entry,candidate.parent,candidate.attach);
              }
            }
            const carrier=parents.get(target?.parent);
            if(carrier){
              const next=atTarget({...original,assembly_manual:true},target);
              setMatrix(group,meshUnitMatrix(next,source,carrier,asset,authoring));
              entry.next=next;
              entry.carrier=carrier;
              continue;
            }
          }catch{/* Keep the previous valid surface during mouse motion. */}
          if(!moving||distance!==null){entry.next=original;entry.carrier=parent;setMatrix(group,originalMatrix);}
        }
        refreshOutline();
        const {original,parent,next}=entries[0];
        const amount=next.parent===original.parent
          ?mountDistanceAt(parent.points,next.attach)-mountDistanceAt(parent.points,original.attach):0;
        return {carrier:next.parent,amount};
      },
      commit(){
        clearPreview();
        if(duplicate){
          const copies=entries.map(({next})=>({...next,assembly_generated:false,id:newId()}));
          write('已复制叶花果并放置',data=>({...data,instances:[...data.instances,...copies]}));select(copies.map(i=>i.id));
        }else{
          const changes=new Map(entries.filter(({next,original})=>next!==original).map(({next})=>[next.id,next]));
          if(changes.size)write('已移动枝面挂点',data=>({...data,instances:data.instances.map(item=>changes.get(item.id)||item)}));
        }
      },cancel:clearPreview,
    };
  }

  function keyboard(operation){
    if(!api.canEdit()||!selected.size||!['translate','rotate','scale','duplicate'].includes(operation))return null;
    const items=placements.filter(item=>selected.has(item.instance.id)&&(operation==='duplicate'||!item.instance.assembly_locked));
    if(!items.length)return null;
    const asset=api.asset(),authoring=api.authoring(),center=new THREE.Vector3(),revision=nativeModelRevision(asset);
    const valid=()=>api.canEdit()&&api.authoring()===authoring&&api.asset()===asset&&nativeModelRevision(asset)===revision;
    for(const item of items){
      center.add(new THREE.Vector3(...item.source.connector.position).applyMatrix4(item.matrix));
    }
    center.multiplyScalar(1/items.length);
    if(operation==='translate'||operation==='duplicate')return keyboardPlacement(items,asset,authoring,center,valid,operation==='duplicate');
    const bases=new Map(items.map(({instance,source,parent})=>[instance.id,new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().extractRotation(meshUnitMountMatrix(instance,source,parent,asset,authoring)))]));
    let drafts=[];
    const bounds=[Math.max(...items.map(i=>INSTANCE_SCALE_MIN/i.instance.scale)),Math.min(...items.map(i=>INSTANCE_SCALE_MAX/i.instance.scale))];
    return {center,label:'手动挂接',hint:'各自挂点为中心',uniform:true,scaleRange:bounds,valid,
      update(delta){
        drafts=items.map(({instance,source,parent})=>{
          const basis=bases.get(instance.id),inverse=basis.clone().invert();
          const rotation=inverse.clone().multiply(delta.rotation).multiply(basis).multiply(new THREE.Quaternion(...instance.rotation)).normalize();
          const next={...instance,assembly_manual:true,rotation:rotation.toArray(),scale:instance.scale*delta.scale.x};
          setMatrix(groups.get(instance.id).group,meshUnitMatrix(next,source,parent,asset,authoring));return next;
        });refreshOutline();
      },
      commit(){
        const changes=new Map(drafts.map(item=>[item.id,item]));
        if(changes.size)write('已调整手动挂接',data=>({...data,instances:data.instances.map(item=>changes.get(item.id)||item)}));
        sync(true);
      },cancel(){sync(true);applyIsolation();},
    };
  }

  bar.querySelector('[data-confirm]').onclick=confirm;
  bar.querySelector('[data-cancel]').onclick=cancel;
  return {root,begin,drop,sync,showWind,move,pointerDown,keyboard,cancel,remove,clearSelection:()=>select([]),pick,boxSelection,temporarySelect,
    get pending(){return !!pending;},get selected(){return selected.size;},
    get combBrush(){return selected.size&&root.visible?combBrush:null;},
    bounds:()=>new THREE.Box3().setFromObject(installed),
    key(event){if(event.key==='Escape')return cancel();if(pending&&event.key==='Enter'){confirm();return true;}if(event.key==='Delete'&&selected.size){remove();return true;}return false;},
  };
}
