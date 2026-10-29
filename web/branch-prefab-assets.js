import * as THREE from './vendor/three.module.min.js';
import {createBranchPrefabStore} from './branch-prefab-store.js';
import {captureBranchPrefab,branchPrefabDocument,insertBranchPrefab,prefabPlacement} from './branch-prefab-data.js';
import {packPrefab,projectPrefab,addProjectPrefab,editProjectPrefab,prefabRevision,prefabArchive,readPrefabArchive,latestPrefabVersions,portablePrefabAssets} from './prefab-project-data.js';
import {createPrefabAssetsUI} from './prefab-assets-ui.js';
import {selectionRoots} from './branch-selection.js';
import {nearestAxis} from './branch-axis.js';
import {pickImportedTrunkCarrier} from './imported-trunk-picker.js';
import {sampleLine,lineTangent} from './tree-sculpt.js';
import {assemblyBranchLimit} from './local-assembly-data.js';
import {createAppConfirm} from './app-confirm.js';

export function createBranchPrefabWorkspace(api){
  const store=createBranchPrefabStore(),confirm=createAppConfirm('branchPrefabDeleteConfirm'),ray=new THREE.Raycaster(),mime='application/x-branchforge-prefab';
  let busy=false,catalog=[],generation=0,dragging=null,placing=null,oldCursor='',cancelContextMenu=false;
  const context=()=>api.getPrefabContext(),assets=()=>context().assets;
  const marker=new THREE.Mesh(new THREE.SphereGeometry(.12,12,8),new THREE.MeshBasicMaterial({color:0xffd66b,depthTest:false}));marker.visible=false;marker.renderOrder=1001;api.modelRoot.add(marker);
  function validRoot(){const roots=selectionRoots(api.getAsset()?.masterBranches||[],new Set(api.getSelections()));return roots.length===1&&!roots[0].unitOwner&&!roots[0].instanceId&&!roots[0].symmetryGroup&&!roots[0].importedTrunkHost;}
  function instances(id){const live=new Set((api.getAsset()?.masterBranches||[]).map(b=>b.stableId));return context().instances.filter(i=>i.definitionId===id&&live.has(i.root));}
  const ui=createPrefabAssetsUI({assets,busy:()=>busy,isTree:api.isTree,canUse:api.canUse,selections:api.getSelections,validRoot,token:()=>generation,instances,select:api.select,
    selectionInstances(){const selected=new Set(api.getSelections()),live=new Set((api.getAsset()?.masterBranches||[]).map(b=>b.stableId));return context().instances.filter(i=>live.has(i.root)&&(selected.has(i.root)||Object.values(i.members).some(id=>selected.has(id))));},
    list:(which,hidden=false)=>which==='project'?assets().items.filter(p=>hidden||!p.hidden):catalog.filter(p=>hidden||!p.archived),
    latest:(hidden=false)=>latestPrefabVersions(catalog).filter(p=>hidden||!p.archived),
    versions:item=>catalog.filter(p=>(p.familyId||p.id)===(item.familyId||item.id)).sort((a,b)=>b.revision-a.revision),
    place:(id,scope)=>beginPlacement(id,scope),join:importToProject,archive,updateLibrary:(item,patch)=>perform(async check=>{await store.update(item.id,patch);check();await load();}),
    updateProject:(item,patch)=>perform(async()=>{api.changePrefabAssets(editProjectPrefab(assets(),item.id,patch));ui.render();}),submit,
    startDrag(id,scope,event){dragging={id,scope};event.dataTransfer.setData(mime,JSON.stringify(dragging));event.dataTransfer.effectAllowed='copy';ui.hint('拖到承重母干表面，松手安装；Esc取消');},endDrag});
  function endDrag(){dragging=null;marker.visible=false;if(placing){placing=null;api.canvas.style.cursor=oldCursor;ui.hint('已取消预制放置；工程保持。');}}
  function beginPlacement(id,scope='project'){
    if(!api.isTree()||!api.canUse()||busy)throw Error('请先返回整树预览并完成当前调整');
    if(!(scope==='project'?assets().items:catalog).some(p=>p.id===id))throw Error('预制已不存在，请刷新');
    endDrag();oldCursor=api.canvas.style.cursor;placing={id,scope};api.canvas.style.cursor='crosshair';ui.choose(id,scope);ui.hint('移动到承重树干，单击安装；右键或 Esc 取消');
  }
  async function load(){catalog=await store.list();ui.render();}
  async function perform(action){if(busy)return null;busy=true;const token=generation,check=()=>{if(token!==generation)throw Error('工程已切换，请在当前工程重新操作');};ui.refresh();try{return await action(check);}catch(error){ui.hint(error.message);ui.error(error.message);api.toast(error.message,true);return null;}finally{busy=false;ui.render();}}
  async function save(name){return perform(async check=>{
    if(!api.isTree()||!api.canUse())throw Error('请先确认或取消当前调整');if(api.getSelectionExclusions?.().size)throw Error('请先取消排除项，再选择需要保存的完整大枝干');
    ui.hint('正在提取完整枝干与预览…');await api.flush();check();const selected=new Set(api.getSelections()),document=api.capture({includeHistory:false});let asset,owned=false;
    try{asset=api.getCompleteAsset();owned=asset!==api.getAsset();const prefab=captureBranchPrefab(asset,document,selected,api.getLeafSources(),{id:'prefab-'+crypto.randomUUID().replaceAll('-',''),name});if(owned){api.releaseCompleteAsset(asset);asset=null;}
      const preview=await api.thumbnailDocument(branchPrefabDocument(prefab));check();if(!preview?.image)throw Error('预制缩略图未生成，请重试；当前工程保留');prefab.thumbnail=preview.image;ui.hint('正在整理共享材质和模型…');const packed=await packPrefab(prefab);check();const added=addProjectPrefab(assets(),packed,prefab);api.changePrefabAssets(added.assets);ui.choose(added.item.id);ui.hint('已保存到当前项目；请保存工程以保留');return added.item.id;
    }finally{if(owned&&asset)api.releaseCompleteAsset(asset);}
  });}
  async function importDefinition(id,check){
    const meta=catalog.find(p=>p.id===id);if(!meta)throw Error('库预制已不存在，请刷新');const existing=assets().items.find(p=>p.versions.some(v=>v.source?.versionId===id));if(existing)return {assets:assets(),item:existing,revision:existing.versions.find(v=>v.source?.versionId===id).revision};
    const value=await store.get(id);check();const prefab=readPrefabArchive(value);if(value.package_origins?.length)prefab.package_origins=value.package_origins;const packed=value.kind==='branchforge-prefab-archive'&&!value.package_origins?.length?{root:value.root,resources:value.resources}:await packPrefab(prefab);check();return addProjectPrefab(assets(),packed,{...meta,source:{familyId:meta.familyId||id,versionId:id,revision:meta.revision||1,...(value.package_origins?.length?{package_origins:value.package_origins}:{})}});
  }
  async function importToProject(id){return perform(async check=>{const added=await importDefinition(id,check);if(added.assets!==assets()||added.item.hidden)api.changePrefabAssets(editProjectPrefab(added.assets,added.item.id,{hidden:false}));ui.choose(added.item.id);ui.hint('固定版本已加入当前项目；保存工程后保留');return added.item.id;});}
  async function archive(item){if(await confirm({title:item.archived?'恢复这个库资产？':'归档这个库资产？',name:item.name,message:'当前工程与已挂接枝干保留；可以在显示已归档中恢复。',accept:item.archived?'恢复':'归档'}))return perform(async check=>{await store.update(item.id,{archived:!item.archived});check();await load();});}
  async function submit(task,name,metadata){
    if(task.kind==='save')return save(name);
    return perform(async check=>{const {item,kind}=task;if(kind==='project-rename'){api.changePrefabAssets(editProjectPrefab(assets(),item.id,{name}));return true;}if(kind==='library-meta'){await store.update(item.id,{name,...metadata});check();await load();return true;}
      const v=prefabRevision(item),resources=portablePrefabAssets({...assets(),items:[item]}).resources,archive=prefabArchive({root:v.root,resources},{...item,name});ui.hint('正在收入本机内容库…');readPrefabArchive(archive);await store.put(archive);check();
      // The immutable payload is committed before optional catalog organization.
      // If that organization fails, do not invite a second publish of this asset.
      try{await store.update(archive.id,metadata);}catch(error){api.toast('资产已收入库；分类未保存：'+error.message,true);}check();await load();ui.hint('已收入内容库V1；工程中的预制与已挂接枝干保持');return archive.id;
    });
  }
  function hit(event){const asset=api.getAsset();if(!asset)return null;const rect=api.canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),api.camera);const meshes=[],byStable=new Map(asset.masterBranches.map(b=>[b.stableId,b]));asset.group.updateWorldMatrix(true,true);asset.group.traverse(o=>{const b=byStable.get(o.userData?.stable_id);if(o.isMesh&&o.visible&&o.userData.category==='branch'&&(o.userData.imported_trunk||b&&!b.unitOwner&&!b.instanceId&&api.isVisible(b.stableId)))meshes.push(o);});const result=ray.intersectObjects(meshes,false)[0];if(!result)return null;if(result.object.userData.imported_trunk){const target=pickImportedTrunkCarrier(asset,api.getAuthoring(),result);return target?{...target,branch:byStable.get(target.parent),point:target.surface_frame.position}:null;}const branch=byStable.get(result.object.userData.stable_id),point=asset.group.worldToLocal(result.point.clone()),attach=THREE.MathUtils.clamp(nearestAxis(branch.points,point),.01,.99);return {branch,point,attach};}
  async function install(id,target,which=assets().items.some(p=>p.id===id)?'project':'library'){return perform(async check=>{
    if(!api.isTree()||!api.canUse())throw Error('请先确认或取消当前调整');const added=which==='library'?await importDefinition(id,check):{assets:assets(),item:assets().items.find(p=>p.id===id)};if(!added.item)throw Error('项目预制已不存在');const revision=added.revision||added.item.revision,prefab=projectPrefab(added.assets,added.item.id,revision);await api.flush();check();const branch=api.getAsset().masterBranches.find(b=>b.stableId===target.branch.stableId);if(!branch||branch.unitOwner||branch.instanceId)throw Error('请拖到承重骨架上挂接');
    if(api.getAuthoring().branch_instances.length+prefab.copies.length>1600||api.getAsset().masterBranches.length+prefab.operation.records.length+prefab.copies.reduce((n,i)=>n+(i.shape?.branches.length||0),0)>assemblyBranchLimit(api.getAuthoring()))throw Error('安装后超过当前工程枝干预算，请先减少装配数量');
    ui.hint('正在安装预制枝干…');const token='PREFAB_'+crypto.randomUUID().replaceAll('-',''),placement=prefabPlacement(prefab,branch,target.attach,target.point),binding=target.surface_binding;if(binding)placement.setPosition(target.surface_frame.position);const inserted=insertBranchPrefab(api.capture({includeHistory:false}),prefab,{parent:branch.stableId,attach:target.attach,matrix:placement,...(binding?{surface:{anchor:target.trunk_anchor,parent_position:sampleLine(branch.points,target.attach).toArray(),matrix:new THREE.Matrix4().makeRotationFromQuaternion(binding.rotation).setPosition(binding.anchor_position)}}:{}),parentTangent:lineTangent(branch.points,target.attach),token});
    const members=Object.fromEntries(prefab.operation.records.map((r,n)=>[r.id,inserted.operation.records[n].id]));for(let n=0;n<prefab.copies.length;n++)members[prefab.copies[n].id]=inserted.copies[n].id;
    await api.apply({...inserted,prefab_assets:added.assets,prefab_instance:{id:token,root:inserted.root,definitionId:added.item.id,revision,source:prefabRevision(added.item,revision).source,members}});check();api.select(inserted.root);ui.inspect('scene');ui.render();ui.hint('已挂接固定版本；Ctrl+Z一次撤销导入与安装');return inserted.root;
  });}
  api.canvas.addEventListener('pointerdown',()=>{if(!dragging)ui.inspect('scene');});
  api.canvas.addEventListener('pointermove',event=>{if(!placing||busy)return;const target=hit(event);marker.visible=Boolean(target);if(target){marker.position.copy(target.surface_frame?.position||sampleLine(target.branch.points,target.attach));marker.scale.setScalar(Math.max(1,target.branch.startRadius*2));}});
  api.canvas.addEventListener('pointerdown',event=>{if(!placing)return;event.preventDefault();event.stopImmediatePropagation();if(event.button===2){cancelContextMenu=true;endDrag();return;}if(event.button!==0||busy)return;const target=hit(event);if(!target){ui.hint('请点承重树干表面；右键或 Esc 取消');return;}const item=placing;endDrag();install(item.id,target,item.scope);},true);
  api.canvas.addEventListener('contextmenu',event=>{if(placing||cancelContextMenu){event.preventDefault();event.stopImmediatePropagation();cancelContextMenu=false;endDrag();}},true);
  document.addEventListener('keydown',event=>{if(!placing)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();endDrag();}},true);
  api.canvas.addEventListener('dragover',event=>{if(!event.dataTransfer.types.includes(mime))return;event.preventDefault();const target=api.isTree()&&!busy&&api.canUse()?hit(event):null;event.dataTransfer.dropEffect=target?'copy':'none';marker.visible=Boolean(target);if(target){marker.position.copy(target.surface_frame?.position||sampleLine(target.branch.points,target.attach));marker.scale.setScalar(Math.max(1,target.branch.startRadius*2));}ui.hint(target?'挂接到 '+target.branch.stableId+' · 松手安装':'请拖到树干或枝干上');});
  api.canvas.addEventListener('dragleave',()=>marker.visible=false);api.canvas.addEventListener('drop',event=>{if(!event.dataTransfer.types.includes(mime))return;event.preventDefault();event.stopPropagation();marker.visible=false;let payload;try{payload=JSON.parse(event.dataTransfer.getData(mime));}catch{payload=dragging;}endDrag();const target=hit(event);if(!payload||!target){ui.hint('已取消安装；请拖到树干或枝干上');return;}install(payload.id,target,payload.scope);});
  const ready=load().catch(error=>{ui.hint(error.message);api.toast('预制库暂不可用：'+error.message,true);});
  document.addEventListener('prefab-library-open',()=>ui.open('library'));
  return {ready,refresh:ui.refresh,reload:load,save,install,store,openManager:ui.open,importToProject,beginPlacement,cancelPlacement:endDrag,resourceAction:ui.resourceAction,instances,selectInstance:api.select,get placing(){return placing;},get catalog(){return catalog;},get busy(){return busy;},get items(){return assets().items.filter(p=>!p.hidden);},get context(){return context();},projectChanged(){generation++;endDrag();ui.reset();}};
}
