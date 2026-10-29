import * as THREE from 'three';
import { buildBranchAsset, disposeBranchAsset } from './branch-kernel.js';
import { planBranchStroke } from './branch-stroke-data.js';
import { planLocalBranches } from './local-branch-data.js';
import { sampleLine, lineTangent, nearestParameter } from './tree-sculpt.js';
import {pickImportedTrunkAttachment} from './imported-trunk-picker.js';
import {captureBranchDuplicate} from './branch-duplicate.js';
import {normalizeAuthoring} from './authoring-state.js';
import {carrierTrunkAnchor} from './imported-trunk-data.js';
import {evaluateTrunkAttachment} from './imported-trunk-attachments.js';

export function planClickedBranch(authoring, settings, branches, hit, options, id, groupId) {
  const branch = branches.find(b => b.stableId === hit.branch);
  if (!branch || branch.unitOwner || branch.instanceId || branch.symmetryGroup) throw new Error('请点承重枝干，单元枝保持独立');
  if(branch.importedTrunkHost&&!hit.trunk_anchor)throw new Error('请在导入树干的真实表面点选挂点');
  const attach = THREE.MathUtils.clamp(hit.trunk_anchor?nearestParameter(branch.points,new THREE.Vector3(...hit.point)):hit.attach, .02, .98), origin = sampleLine(branch.points, attach), tangent = lineTangent(branch.points, attach);
  let radial = new THREE.Vector3(...hit.point).sub(origin); radial.addScaledVector(tangent, -radial.dot(tangent));
  if (radial.lengthSq() < 1e-12) { radial = Math.abs(tangent.z) < .9 ? new THREE.Vector3(0,0,1) : new THREE.Vector3(1,0,0); radial.addScaledVector(tangent,-radial.dot(tangent)); }
  radial.normalize().applyAxisAngle(tangent, THREE.MathUtils.degToRad(options.azimuth));
  const angle = THREE.MathUtils.degToRad(options.angle), direction = tangent.clone().multiplyScalar(Math.cos(angle)).addScaledVector(radial,Math.sin(angle));
  const arcLength = branch.points.slice(1).reduce((sum,p,i) => sum+p.distanceTo(branch.points[i]),0), length = Math.max(.04,arcLength*options.length);
  const raw = Array.from({length:7},(_,i) => { const t=i/6; return origin.clone().addScaledVector(direction,length*t).addScaledVector(tangent,length*.08*t*t); });
  const skeletonBranches = branches.filter(b=>!b.instanceId&&!b.unitOwner);
  let planned = planBranchStroke(authoring,settings,skeletonBranches,branch.stableId,raw,{mode:'FORK',attach,length:0,taper:options.taper,radius:options.radius,smooth:.3,align:.55},id);
  if (options.children) {
    const base=buildBranchAsset({...settings,leaf_density:0},null,[],0,planned.authoring,{skeletonOnly:true});
    try { planned={...planned,...planLocalBranches(planned.authoring,base.masterBranches,id,options.children,groupId)}; }
    finally { disposeBranchAsset(base); }
  }
  const preview=buildBranchAsset({...settings,leaf_density:0},null,[],0,planned.authoring,{skeletonOnly:true});
  try {
    if (![id,...(planned.created||[])].every(key=>preview.masterBranches.some(b=>b.stableId===key))) throw new Error('枝段预算不足或母枝不可用，本次未添加');
    if(hit.trunk_anchor){
      // Use the same persistent triangle frame as installed carrier prefabs.
      // Only the new root is captured; generated children keep their ordinary
      // manual records and editable local recipe instead of becoming assets.
      const root=preview.masterBranches.find(b=>b.stableId===id),source={...preview,masterBranches:preview.masterBranches.filter(b=>b===root||b.stableId===branch.stableId).map(b=>b===root?{...b,children:[]}:b)};
      const anchor=carrierTrunkAnchor({...hit.trunk_anchor,axis_t:attach},attach),context=branch.importedTrunkSource,target=evaluateTrunkAttachment(context.asset,context.mount,branches,anchor);
      const operation=captureBranchDuplicate(source,new Set([id]),id),targetId=operation.targets[0],record=operation.records[0],offset=target.position.clone().sub(root.points[0]);
      for(const key of ['points','controlPoints'])record[key]=record[key].map(p=>new THREE.Vector3(...p).add(offset).toArray());
      record.mountMatrix=new THREE.Matrix4().makeTranslation(...offset.toArray()).multiply(record.mountMatrix?new THREE.Matrix4().fromArray(record.mountMatrix):new THREE.Matrix4()).toArray();record.properties.prefabCarrier=true;
      record.frame={position:origin.toArray(),tangent:tangent.toArray(),trunk_anchor:anchor,trunk_surface_matrix:new THREE.Matrix4().makeRotationFromQuaternion(target.rotation).setPosition(target.position).toArray()};
      const layer={id:'CLICK_'+id,name:'点击加枝 · 控制线生长',enabled:true,strength:1,operation,branches:{}};
      planned={...planned,targetId,authoring:normalizeAuthoring({...planned.authoring,
        manual_branches:planned.authoring.manual_branches.filter(b=>b.id!==id).map(b=>b.parent===id?{...b,parent:targetId}:b),
        local_branch_groups:planned.authoring.local_branch_groups.map(g=>g.root===id?{...g,root:targetId}:g),
        sculpt_layers:[...authoring.sculpt_layers,layer],active_sculpt_layer:layer.id,
        topology:{...planned.authoring.topology,operations:planned.authoring.topology.operations.map(op=>op.created===id?{...op,created:targetId}:op)}
      })};
    }
  }
  finally { disposeBranchAsset(preview); }
  return planned;
}

// A tool can be armed without a selected branch. Only a completed click commits;
// moving the camera, cancellation and stale geometry never add a branch.
export function createBranchClickTool(api, ui) {
  let active=false, press=null, waiting=false, currentAsset=null, oldCursor='', lastBranch='';
  const ray=new THREE.Raycaster(), marker=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:0xf0c965,depthTest:false}));
  marker.name='点击加枝连接点';marker.renderOrder=150;marker.visible=false;api.modelRoot.add(marker);
  const busy=()=>!api.getAsset()||api.getAsset().group.userData.pending_rebuild||!document.getElementById('busyOverlay').hidden||waiting;
  function pick(e) {
    if(busy())return null;
    const asset=api.getAsset(),r=api.canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),api.camera);
    const meshes=[];asset.group.updateWorldMatrix(true,true);
    asset.group.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});
    const hit=ray.intersectObjects(meshes,false)[0];
    if(hit?.object.userData.imported_trunk){const target=pickImportedTrunkAttachment(asset,api.getAuthoring(),hit),branch=asset.masterBranches.find(b=>b.stableId===target?.parent);if(!branch||branch.instanceId||branch.unitOwner||branch.symmetryGroup)return null;return {...target,branch:branch.stableId,point:target.surface_frame.position.toArray(),asset,authoring:api.getAuthoring()};}
    const branch=asset.masterBranches.find(b=>b.stableId===hit?.object.userData.stable_id);
    if(!hit||hit.object.userData.category!=='branch'||!branch||branch.instanceId||branch.unitOwner||branch.symmetryGroup)return null;
    const p=asset.group.worldToLocal(hit.point.clone()),attach=THREE.MathUtils.clamp(nearestParameter(branch.points,p),.02,.98);
    return {branch:branch.stableId,attach,point:p.toArray(),asset,authoring:api.getAuthoring()};
  }
  function release() {const p=press;press=null;if(p){api.controls.enabled=p.controls;if(api.canvas.hasPointerCapture(p.id))api.canvas.releasePointerCapture(p.id);}}
  function cancel() {const pending=!!press;release();if(active){active=false;waiting=false;marker.visible=false;api.canvas.style.cursor=oldCursor;ui.close();}return pending;}
  function open() {api.setTool('SELECT');api.select(null);oldCursor=api.canvas.style.cursor;active=true;waiting=false;currentAsset=api.getAsset();api.canvas.style.cursor='crosshair';ui.open();}
  function move(e) {
    if(!active)return false;
    if(press){if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>5)press.moved=true;return true;}
    const hit=pick(e);marker.visible=!!hit;
    if(hit){const b=hit.asset.masterBranches.find(b=>b.stableId===hit.branch);marker.position.copy(hit.surface_frame?.position||sampleLine(b.points,hit.attach));const world=api.modelRoot.localToWorld(marker.position.clone());marker.scale.setScalar(api.camera.position.distanceTo(world)*.007);}
    return true;
  }
  function begin(e) {
    if(!active||e.button!==0)return false;
    if(busy())return true;
    const hit=pick(e);if(!hit){ui.status('请直接点承重枝干；空白处、叶花果和单元枝不加枝');return true;}
    press={...hit,id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,controls:api.controls.enabled};
    api.controls.enabled=false;api.canvas.setPointerCapture(e.pointerId);return true;
  }
  function end(e) {
    if(!active||e.button!==0)return false;
    const p=press;release();if(!p||p.moved||Math.hypot(e.clientX-p.x,e.clientY-p.y)>5)return true;
    if(p.asset!==api.getAsset()||p.authoring!==api.getAuthoring()||busy()){ui.status('模型已变化，请重新点击');return true;}
    try {
      const options=ui.options(),id='M'+crypto.randomUUID().replaceAll('-',''),groupId='LOCAL_'+crypto.randomUUID().replaceAll('-','');
      const planned=planClickedBranch(api.getAuthoring(),api.getSettings(),api.getAsset().masterBranches,p,options,id,groupId);
      waiting=true;lastBranch=p.branch;marker.visible=false;
      api.transact('点击新增枝束',a=>{a.manual_branches=planned.authoring.manual_branches;a.local_branch_groups=planned.authoring.local_branch_groups;a.sculpt_layers=planned.authoring.sculpt_layers;a.active_sculpt_layer=planned.authoring.active_sculpt_layer;a.topology=planned.authoring.topology;},{bypassLayers:true});
      ui.status(`已添加 1 根新枝${planned.stats?`和 ${planned.stats.total} 根下级枝`:''}，可继续点击其他枝干；Ctrl+Z 撤销`);
    }catch(error){waiting=false;ui.status(error.message);api.toast(error.message,true);}
    return true;
  }
  for(const name of ['pointercancel','lostpointercapture'])api.canvas.addEventListener(name,()=>{if(press){release();marker.visible=false;ui.status('已取消本次点击，可继续加枝');}});
  window.addEventListener('blur',()=>{if(press){release();marker.visible=false;}});
  return {open,cancel,begin,move,end,get active(){return active;},get pending(){return !!press;},get lastBranch(){return lastBranch;},
    refresh(){if(!active)return;const asset=api.getAsset();if(asset!==currentAsset){release();marker.visible=false;currentAsset=asset;}if(asset&&!asset.group.userData.pending_rebuild&&asset.authoring===api.getAuthoring())waiting=false;},
    key(e){if(active&&e.key==='Escape'){cancel();return true;}return false;}};
}
