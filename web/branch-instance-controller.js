import * as THREE from 'three';
import { TransformControls } from './vendor/TransformControls.js';
import { branchInstanceFrame } from './branch-kernel.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';
import { resolveInstanceShape, copy } from './branch-workbench-data.js';
import { unitBranchIndex } from './unit-branch-boundary.js';
import { buildUnitAssemblySelection, createUnitAssemblyIndex } from './unit-assembly-selection.js';
import { INSTANCE_SCALE_MIN, INSTANCE_SCALE_MAX } from './assembly-scale.js';
import { createGpuMeshPreview } from './gpu-edit-preview.js';
import { createSelectionCopyPreview } from './selection-copy-preview.js';
import { createBranchCarrierSlide } from './branch-carrier-slide.js';
import { branchInstanceOwner, selectedInstanceRoots, instanceFamily, cloneBranchInstances, deleteBranchInstances,
  moveInstanceToCarrier, moveInstanceToSurface, instanceFromMatrix, rotateInstance, instanceTransformMatrix, createInstancePlacementContext, applyInstanceFamilyPlacement, evaluatedInstanceFrame } from './branch-instance-operations.js';

const $ = id => document.getElementById(id);
const btn = (id, icon, label) => `<button id="${id}" title="${label}" aria-label="${label}"><i data-lucide="${icon}"></i></button>`;
export function createBranchInstanceEditor(api, context) {
  const { canvas, camera, controls, modelRoot } = api;
  const root = new THREE.Group();root.name='BranchInstanceHandles';modelRoot.add(root);
  const scope = new THREE.Group();scope.name='单元枝编辑范围';root.add(scope);
  const proxy = new THREE.Object3D();root.add(proxy);
  const gizmo = new TransformControls(camera);gizmo.setSize(.7);gizmo.enabled=false;root.add(gizmo.getHelper());
  const ring = new THREE.Mesh(new THREE.SphereGeometry(.035,14,10),new THREE.MeshBasicMaterial({color:0xf4c56b,depthTest:false}));ring.renderOrder=112;root.add(ring);
  const panel = document.createElement('div');panel.id='instanceEditContext';
  panel.innerHTML=`<strong id="instanceEditTarget">未选择单元枝</strong><p class="vine-note">G 换挂接 · R 旋转 · S 整体缩放 · Shift+D 复制。多选围绕各自枝根调整，内部样式与源模型保持。</p><div class="wb-tools">${btn('instanceSlide','move-horizontal','沿母枝移动，拖近另一枝换挂接')}${btn('instanceRotate','rotate-3d','旋转整个单元枝')}${btn('instanceScale','scaling','缩放整个单元枝')}</div>
    <label>编辑范围高亮<input id="instanceGhostOpacity" type="range" min="0.15" max="1" step="0.05" value="0.75"></label>
    <button id="instanceEditSource"><i data-lucide="pencil"></i>在枝条工作台编辑源单元枝</button><p class="vine-note">木枝、叶花果与材质属于完整单元模型。修改样式需在工作台另存或保存版本，再明确更新装配。</p>`;
  context.register('INSTANCE','单元枝 · 整体调整',panel);
  const entry=document.createElement('div');entry.className='shaping-viewport-tools';entry.innerHTML=btn('openInstanceEditor','git-pull-request-arrow','单元枝整体调整');document.querySelector('.viewport-tool-rail').append(entry);
  let tool='',drag=null,pendingCopies=null,scopeKey='',scopeBranches=null,boundaryAsset=null,boundaryAuthoring=null,index=null;
  const ray=new THREE.Raycaster(),branches=()=>api.getAsset()?.masterBranches || [],shapeOf=i=>resolveInstanceShape(i,api.getAuthoring().branch_library);
  const selection=()=>api.getSelections?.() || new Set(api.getSelection()?[api.getSelection()]:[]);
  const unitInstances=()=>api.getUnitInstances?.()||api.getAuthoring().branch_instances;
  const unitBranches=()=>api.getUnitBranches?.()||branches();
  const selected=()=>{
    const b=boundary(),ids=new Set([...selection()].map(id=>b.ownerOf(id)?.id).filter(Boolean));
    return unitInstances().filter(instance=>ids.has(instance.id)&&![...ids].some(id=>id!==instance.id&&ancestorOf(id,instance.id,b.parents)));
  };
  function ancestorOf(parent,id,parents){const seen=new Set();while(parents.has(id)&&!seen.has(id)){seen.add(id);id=parents.get(id);if(id===parent)return true;}return false;}
  const current=()=>selected()[0];
  let assemblyGraph=null;
  function transformSelection(){
    const authoring=api.getAuthoring(),instances=unitInstances(),branches=unitBranches();
    if(!assemblyGraph||assemblyGraph.authoring!==authoring||assemblyGraph.branches!==branches||assemblyGraph.instances!==instances)
      assemblyGraph={authoring,branches,instances,index:createUnitAssemblyIndex(instances,branches)};
    const state=buildUnitAssemblySelection({instances,branches,index:assemblyGraph.index,library:authoring.branch_library,
      selection:selection(),scope:'SELECTED',arrays:authoring.branch_arrays,isVisible:api.isVisible});
    return {state,items:[...state.eligibleIds].map(id=>state.index.byInstance.get(id)).filter(instance=>!instance.legacyPlacement)};
  }
  let boundaryBranches=null,boundaryInstances=null;
  function boundary(){const asset=api.getAsset(),authoring=api.getAuthoring(),branches=unitBranches(),instances=unitInstances();if(asset!==boundaryAsset||authoring!==boundaryAuthoring||branches!==boundaryBranches||instances!==boundaryInstances){index=unitBranchIndex(branches,instances);boundaryAsset=asset;boundaryAuthoring=authoring;boundaryBranches=branches;boundaryInstances=instances;}return index;}
  const busy=()=>api.isBusy?.() || api.getAsset()?.group.userData.pending_rebuild || Boolean($('busyOverlay')&&!$('busyOverlay').hidden);
  const pointer=(e,button=e.button)=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*2-1,y:1-(e.clientY-r.top)/r.height*2,button};};
  const rootsFor=items=>items.map(i=>boundary().roots.get(i.id)||`${i.id}.${shapeOf(i)?.branches[0]?.id}`).filter(id=>branches().some(b=>b.stableId===id));
  function selectInstances(items){api.setSelections(rootsFor(items));}
  function clearScope(){for(const line of scope.children){line.geometry.dispose();line.material.dispose();}scope.clear();scopeKey='';scopeBranches=null;}
  function highlight(){
    const asset=api.getAsset();
    // The brush draws its transformed axes. CPU curves still describe the rest
    // pose while the GPU preview is held for commit; never draw both poses.
    if(asset?.activeEditPreview){clearScope();return;}
    const ids=selected().map(i=>i.id),key=asset?.group.uuid+'/'+ids.join('/')+'/'+$('instanceGhostOpacity').value;
    // Fast placement updates retain the mesh group but replace runtime curves.
    if(key===scopeKey&&scopeBranches===asset?.masterBranches)return;clearScope();scopeKey=key;scopeBranches=asset?.masterBranches;
    if(!ids.length||!asset)return;
    const family=instanceFamily(api.getAuthoring(),ids),roots=boundary().roots;
    // A tree selection marks the complete model's main axis, rather than every
    // internal twig. Dense card selections remain legible while children show
    // their own whole-unit axes as indirect members of the family.
    const selectedIds=new Set([...family.map(i=>roots.get(i.id)),...ids.map(id=>roots.get(id))].filter(Boolean));
    const coordinates=[];for(const b of asset.masterBranches)if(selectedIds.has(b.stableId))for(let j=1;j<b.points.length;j++)coordinates.push(...b.points[j-1].toArray(),...b.points[j].toArray());
    if(coordinates.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3));
      const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xf0cb58,transparent:true,opacity:+$('instanceGhostOpacity').value,depthTest:false,depthWrite:false}));lines.renderOrder=110;scope.add(lines);}
  }
  function refresh(){
    entry.hidden=api.isTree?.()===false;
    if(pendingCopies&&pendingCopies.every(id=>branches().some(b=>b.instanceId===id))){const ids=pendingCopies;pendingCopies=null;selectInstances(api.getAuthoring().branch_instances.filter(i=>ids.includes(i.id)));}
    if(drag)return;
    highlight();const i=current(),{state,items:adjustable}=transformSelection(),target=adjustable[0],shape=shapeOf(target);ring.visible=Boolean(target?.parent&&tool==='SLIDE');
    if(api.isTree?.()!==false&&i&&!context.mode)context.setMode('INSTANCE');
    if((!i||api.isTree?.()===false)&&context.mode==='INSTANCE')context.setMode('');
    $('instanceEditTarget').textContent=i?.legacyPlacement?'旧复制副本 · C 笔刷整体调整 · 保留原造型':i?`${api.getAuthoring().branch_library.find(a=>a.id===i.asset_id)?.name||'单元枝'}${state.summary.selected>1?' · 已选 '+state.summary.selected+' 支':''} · ${i.assembly_manual||i.assembly_refined?'手工保留':'自动布置'}${state.summary.selectedBlocked?' · 锁定家族跳过 '+state.summary.selectedBlocked+' 支':''} · 可调整 '+adjustable.length+' 支`:'未选择单元枝';
    for(const id of ['instanceSlide','instanceRotate','instanceScale'])$(id).disabled=!target;
    $('instanceEditSource').disabled=!i||!!i.legacyPlacement;
    $('instanceSlide').disabled=!target?.parent;
    if(target&&shape){const f=evaluatedInstanceFrame(target,shape,branches(),api.getSettings());proxy.position.copy(f.position);proxy.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),f.direction.clone().normalize());proxy.scale.setScalar(1);ring.position.copy(f.position);
      if(['ROTATE','SCALE'].includes(tool)){gizmo.attach(proxy);gizmo.setMode(tool==='ROTATE'?'rotate':'scale');gizmo.enabled=true;}else{gizmo.detach();gizmo.enabled=false;}}
    else{gizmo.detach();gizmo.enabled=false;}
  }
  function cast(e){const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);}
  function hitOwner(e){
    const asset=api.getAsset();if(!asset)return null;cast(e);asset.group.updateWorldMatrix(true,true);
    const ownerAt=id=>branchInstanceOwner(api.getAuthoring(),id,asset)||boundary().ownerOf(id);
    const meshes=[],bindings=new Map(),batches=new Map();asset.group.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;meshes.push(mesh);const b=asset.editPreviewBindings?.(mesh);if(b?.instances){batches.set(mesh,b.instances);for(const descriptor of b.instances)bindings.set(descriptor.object(),descriptor);}});
    for(const h of ray.intersectObjects(meshes,false)){
      const descriptor=bindings.get(h.object)||batches.get(h.object)?.[h.instanceId];if(descriptor){const found=unitInstances().find(i=>i.id===descriptor.id);if(found)return found;}
      const data=h.object.userData,known=ownerAt(data.stable_id||data.branch_id);if(known)return known;
      const uv=h.object.geometry.getAttribute('uv1');if(!uv||!h.face)continue;
      const grid=asset.editPreviewBindings?.(h.object)?.lookup||asset.lookupTexture;if(!grid)continue;const index=Math.floor(uv.getY(h.face.a)*grid.height)*grid.width+Math.floor(uv.getX(h.face.a)*grid.width);
      const owner=ownerAt(asset.elements[index]?.id);if(owner)return owner;
    }
    return null;
  }
  function selectHit(e,modifiers={}){const i=hitOwner(e);if(!i)return false;const existing=selected(),ctrl=modifiers.ctrl??e.ctrlKey,shift=modifiers.shift??e.shiftKey;
    const next=ctrl?(existing.some(v=>v.id===i.id)?existing.filter(v=>v.id!==i.id):[...existing,i]):shift?(existing.some(v=>v.id===i.id)?existing:[...existing,i]):[i];
    selectInstances(next);context.setMode('INSTANCE');refresh();return true;
  }
  function activate(next){if(api.isTree?.()===false)return;if(!current())return api.toast('请先选择树上的一支单元枝');if(selected().some(i=>i.legacyPlacement))return api.toast('旧复制副本请使用 C 笔刷整体调整；原造型会保留');if(!transformSelection().items.length)return api.toast('所选单元枝已锁定，或含锁定子件；请先解锁再整体调整');api.setTool('SELECT');tool=next;context.setMode('INSTANCE');refresh();}
  function makeGesture(mode,duplicate=false,keepGizmo=false){
    if(busy()||drag)return null;
    const source=api.getAuthoring(),chosen=selected();
    if(chosen.some(i=>i.legacyPlacement)){api.toast('旧复制副本请使用 C 笔刷整体调整；原造型会保留');return null;}
    const originalRoots=duplicate?chosen:transformSelection().items;
    if(!originalRoots.length){if(!duplicate&&selected().length)api.toast('所选单元枝已锁定，或含锁定子件；请先解锁再整体调整');return null;}
    const asset=api.getAsset(),sourceBranches=branches(),settings=api.getSettings(),draft=duplicate?copy(source):null,sourceContext=createInstancePlacementContext(source,sourceBranches,settings);
    let cloned=null;try{if(duplicate)cloned=cloneBranchInstances(draft,originalRoots,undefined,sourceBranches);}catch(error){api.toast(error.message,true);return null;}
    const workingRoots=duplicate?cloned.roots:originalRoots,ids=new Set(originalRoots.flatMap(i=>sourceContext.familyOf(i.id)).map(i=>i.id));
    asset.group.updateWorldMatrix(true,true);camera.updateMatrixWorld();
    // A whole-model preview never deforms control points. Runtime curves are
    // immutable for this gesture; nearest-point bindings and copies of every
    // twig would only duplicate work that the rigid GPU path does not use.
    const targets=new Set([...ids].flatMap(id=>sourceContext.branchesByOwner.get(id)||[]).map(b=>b.stableId)),snapshot=new Map(sourceBranches.map(b=>[b.id,b]));
    const gpu=duplicate?null:createGpuMeshPreview(asset,snapshot,{sampleLine,lineTangent,targets,rigid:true});
    if(!duplicate&&!gpu){api.toast('当前网格暂不能建立实时编辑预览，请使用右侧数值调整',true);return null;}
    const entries=originalRoots.map((instance,n)=>{
      const shape=shapeOf(instance),familyIds=new Set(sourceContext.familyOf(instance.id).map(i=>i.id)),familyBranches=[...familyIds].flatMap(id=>sourceContext.branchesByOwner.get(id)||[]),rootBranch=sourceContext.byStable.get(instance.id+'.'+shape.branches[0].id),parent=sourceContext.byStable.get(instance.parent);
      const elementIds=new Set(familyBranches.map(b=>b.stableId)),branchIds=new Set(elementIds);if(duplicate)for(const p of [...asset.masterPlacements,...asset.treeOrgans])if(branchIds.has(p.branchStableId))elementIds.add(p.stableId);
      // Restrict triangle extraction to the selected owner descriptors. A copy
      // should not scan the foliage triangles of hundreds of unrelated samples.
      const copyAsset={...asset,editPreviewBindings(mesh){const bindings=asset.editPreviewBindings?.(mesh);return bindings?.instances?{...bindings,instances:bindings.instances.filter(d=>familyIds.has(d.id))}:bindings;}};
      const acceptsElement=e=>e&&(elementIds.has(e.id)||[...familyIds].some(id=>e.id.startsWith(id+'.')&&elementIds.has(e.id.slice(id.length+1))));
      const slideBranches=mode==='translate'&&parent?.instanceId?sourceBranches.map(b=>b===parent?{...b,unitOwner:'',instanceId:''}:b):sourceBranches;
      const slide=mode==='translate'&&rootBranch&&parent?createBranchCarrierSlide(slideBranches,rootBranch,{camera,modelRoot:asset.group,bounds:canvas.getBoundingClientRect(),excludeSubtree:!duplicate,asset,authoring:source}):null;
      return {instance,working:workingRoots[n],shape,familyIds,familyBranches,parent,center:evaluatedInstanceFrame(instance,shape,parent?[parent]:[],settings).position,baseMatrix:evaluatedInstanceFrame(instance,shape,parent?[parent]:[],settings).matrix,slide,preview:duplicate?createSelectionCopyPreview(copyAsset,acceptsElement):null,matrix:new THREE.Matrix4(),next:copy(workingRoots[n])};
    });
    if(!keepGizmo){gizmo.detach();gizmo.enabled=false;}clearScope();let changed=false;
    const restore=()=>{gpu?.restore();entries.forEach(e=>e.preview?.restore());},preview={restore,dispose:restore};
    const valid=()=>api.getAsset()===asset&&!busy();
    return {center:entries[0].center.clone(),uniform:true,scaleRange:[.05,20],alongBranch:mode==='translate'&&entries.every(e=>e.slide),label:`${duplicate?'复制':'调整'} ${entries.length} 支单元枝`,hint:mode==='translate'?'拖到另一根承重枝换挂接 / 数值沿原母枝移动':'各自枝根为中心 · 完整叶花果一起调整',valid,
      update(delta,gesture){let carrier='',amount=delta.amount;const matrices=new Map();changed=false;
        for(const e of entries){let next=copy(e.working),nextParent=e.parent;
          if(mode==='translate'&&e.slide){const result=e.slide(gesture),moved=gesture.numeric?.trim()||Math.hypot(gesture.pointer.x-gesture.start.x,gesture.pointer.y-gesture.start.y)>=2;
            if(moved&&!result.blocked){if(result.trunk_anchor){const moved=moveInstanceToSurface(next,result,e.parent,settings,e.shape);next=moved.instance;nextParent=moved.parent;}else{next=moveInstanceToCarrier(next,result.parent,e.parent,settings,result.attach,e.shape);nextParent=result.parent;}}carrier=result.blocked?'未命中原树干表面 · 当前挂接保留':result.parent.stableId;amount=result.distance??0;}
          else if(mode==='translate'){const desired=new THREE.Matrix4().makeTranslation(...delta.translation.toArray()).multiply(e.baseMatrix);next=instanceFromMatrix(next,e.shape,e.parent,desired);}
          else if(mode==='rotate')next=rotateInstance(next,e.parent,settings,delta.rotation,e.shape);
          else next.scale=THREE.MathUtils.clamp(e.working.scale*delta.amount,INSTANCE_SCALE_MIN,INSTANCE_SCALE_MAX);
          next.assembly_manual=true;next.assembly_refined=true;e.next=next;
          e.matrix.copy(evaluatedInstanceFrame(next,e.shape,nextParent?[nextParent]:[],settings).matrix).multiply(e.baseMatrix.clone().invert());
          if(e.matrix.elements.some((v,i)=>Math.abs(v-(i%5===0?1:0))>1e-9))changed=true;
          if(e.preview)e.preview.update(e.matrix);else for(const b of e.familyBranches)matrices.set(b.id,{matrix:e.matrix});
        }
        if(gpu){if(gpu.updateTransforms)gpu.updateTransforms(matrices);else gpu.update(snapshot,matrices);}
        return mode==='translate'?{carrier,amount}:undefined;
      },
      commit(){
        if(!changed&&!duplicate){restore();refresh();return;}
        let workingBranches=sourceBranches;
        if(duplicate){const copied=sourceBranches.filter(b=>ids.has(b.instanceId)||ids.has(b.unitOwner)),firstId=Math.max(-1,...sourceBranches.map(b=>b.id))+1,runtimeIds=new Map(copied.map((b,n)=>[b.id,firstId+n]));
          workingBranches=sourceBranches.concat(copied.map(b=>({...b,id:runtimeIds.get(b.id),stableId:cloned.mapId(b.stableId),instanceId:cloned.mapId(b.instanceId),unitOwner:cloned.mapId(b.unitOwner),parentId:runtimeIds.get(b.parentId)??b.parentId,children:b.children.map(id=>runtimeIds.get(id)??id)})));}
        if(duplicate)pendingCopies=entries.map(e=>e.working.id);
        const commit=()=>api.transact(duplicate?'复制单元枝并放置':'调整单元枝',a=>{
          if(duplicate)Object.assign(a,copy(draft));
          const placementContext=createInstancePlacementContext(a,workingBranches,settings,{owners:entries.map(e=>e.working.id)});
          for(const e of entries){const before=placementContext.instanceById.get(e.working.id);applyInstanceFamilyPlacement(a,copy(before),e.next,e.shape,workingBranches,settings,placementContext);}
        },{bypassLayers:true,deferControls:true});
        const accepted=api.commitPreview?api.commitPreview(preview,commit):commit();
        if(!api.commitPreview||accepted===false)restore();if(accepted===false)pendingCopies=null;refresh();
      },cancel(){restore();refresh();}};
  }
  function keyboardTransform(mode){if(!['translate','rotate','scale'].includes(mode))return null;return makeGesture(mode);}
  function keyboardDuplicate(){return makeGesture('translate',true);}
  function deleteSelection(){if(busy())return false;const items=selected();if(!items.length)return false;
    if(items.some(i=>i.legacyPlacement)){api.toast('旧复制副本请在主枝干模式删除；完整造型会一起删除');return true;}
    api.transact('删除单元枝并保留空位',a=>deleteBranchInstances(a,items),{bypassLayers:true});api.setSelections([]);deactivate();refresh();return true;}
  function release(){const id=drag?.pointer;drag=null;gizmo.dragging=false;gizmo.axis=null;if(id!=null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);controls.enabled=true;}
  function cancel(){if(!drag)return false;const gesture=drag.adapter;release();gesture.cancel();return true;}
  function deactivate(){cancel();tool='';gizmo.detach();gizmo.enabled=false;ring.visible=false;clearScope();}
  function begin(e){if(!tool||e.button!==0)return false;
    if(tool==='SLIDE'){cast(e);root.updateWorldMatrix(true,true);if(!ray.intersectObject(ring)[0])return false;const adapter=makeGesture('translate',false,true);if(adapter){drag={adapter,pointer:e.pointerId,start:{x:e.clientX,y:e.clientY},position:proxy.position.clone(),rotation:proxy.quaternion.clone()};canvas.setPointerCapture(e.pointerId);controls.enabled=false;}return true;}
    gizmo.getHelper().updateMatrixWorld(true);gizmo.pointerHover(pointer(e));if(!gizmo.axis)return false;gizmo.pointerDown(pointer(e));if(drag){drag.pointer=e.pointerId;canvas.setPointerCapture(e.pointerId);}return true;}
  function move(e){if(!tool)return false;if(tool!=='SLIDE'){if(drag)gizmo.pointerMove(pointer(e,-1));else gizmo.pointerHover(pointer(e));return true;}if(!drag)return true;
    drag.adapter.update({translation:new THREE.Vector3(),rotation:new THREE.Quaternion(),scale:new THREE.Vector3(1,1,1),amount:0},{start:drag.start,pointer:{x:e.clientX,y:e.clientY},numeric:''});return true;}
  function end(e){if(!tool||e.button!==0||!drag)return false;if(tool==='SLIDE'){move(e);const adapter=drag.adapter;release();adapter.commit();}else gizmo.pointerUp(pointer(e));return true;}
  gizmo.addEventListener('mouseDown',()=>{const adapter=makeGesture(tool==='SCALE'?'scale':'rotate',false,true);if(!adapter){gizmo.dragging=false;return;}drag={adapter,position:proxy.position.clone(),rotation:proxy.quaternion.clone()};controls.enabled=false;});
  gizmo.addEventListener('objectChange',()=>{if(!drag)return;const ratio=[proxy.scale.x,proxy.scale.y,proxy.scale.z].find(v=>Math.abs(v-1)>1e-6)??1;
    drag.adapter.update({translation:new THREE.Vector3(),rotation:proxy.quaternion.clone().multiply(drag.rotation.clone().invert()),scale:new THREE.Vector3().setScalar(ratio),amount:ratio},{});});
  gizmo.addEventListener('mouseUp',()=>{if(drag){const adapter=drag.adapter;release();adapter.commit();}});
  $('openInstanceEditor').onclick=()=>activate('SLIDE');$('instanceSlide').onclick=()=>activate('SLIDE');$('instanceRotate').onclick=()=>activate('ROTATE');$('instanceScale').onclick=()=>activate('SCALE');
  $('instanceGhostOpacity').oninput=highlight;
  $('instanceEditSource').onclick=async()=>{const i=current();if(!i||i.legacyPlacement||busy())return;deactivate();try{await api.editSource?.(i);}catch(error){api.toast(error.message,true);}};
  window.addEventListener('blur',cancel);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);ring.visible=false;
  return {root,gizmo,proxy,activate,deactivate,cancel,begin,move,end,refresh,keyboardTransform,keyboardDuplicate,deleteSelection,selectHit,hitOwner,
    selectionOwners:()=>selected(),get active(){return Boolean(tool);},get dragging(){return Boolean(drag);},
    doubleClick(e){return api.isTree?.()!==false&&selectHit(e);},
    canonicalSelectionId(id){if(api.isTree?.()===false)return id;const owner=boundary().owners.get(id);return owner?boundary().roots.get(owner.id)||id:id;},
    isSelectable(id){if(api.isTree?.()===false)return true;const owner=boundary().owners.get(id);return !owner||boundary().roots.get(owner.id)===id;},
    isEditable(id){return api.isTree?.()===false||!boundary().owners.has(id);},
    key(e){if(e.key!=='Escape')return false;if(cancel())return true;if(tool){deactivate();context.setMode('');return true;}return false;}};
}
