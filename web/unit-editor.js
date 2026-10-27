import { createUnitDrop } from './unit-drop.js';
import { createUnitSlide } from './unit-slide.js';
import { createSelectionCopyPreview } from './selection-copy-preview.js';
import * as THREE from 'three';
import { TransformControls } from './vendor/TransformControls.js';
import { captureUnit, resolveUnit, unitFrame, nearestUnitT, unitPoseQuaternion, inspectUnits } from './unit-authoring.js';

const $=id=>document.getElementById(id);
const field=(id,label,value,step='.01')=>`<label>${label}<input id="${id}" type="number" value="${value}" step="${step}"></label>`;
export function createUnitEditor(api,section) {
  const panel=document.createElement('details');panel.id='unitEditorPanel';panel.open=true;
  panel.innerHTML=`<summary>叶花果 · 直接编辑</summary>
  <label>选择对象<select id="ueKind"><option value="BRANCH">枝干</option><option value="LEAF">叶片单元</option><option value="ORGAN">花果单元</option></select></label>
  <p class="vine-note">普通选择工具下直接点击叶片、花果或枝干，自动切换对象；Shift 框选加选，Ctrl 框选减选。Shift+D 复制并放置；G 移动、R 旋转、S 等比缩放；Enter 确认，Esc 取消。中键转动视角。修改自动保留，随工程保存。</p>
  <div class="wb-row"><button id="ueMove">移动</button><button id="ueRotate">三轴旋转</button><button id="ueAdd">点击枝干添加</button></div>
  <p class="vine-note">移动时柄根吸附枝干，拖到另一根枝干可切换挂接；G 输入距离时沿原挂接枝干移动。</p>
  <label>多选旋转中心<select id="uePivot"><option value="EACH">各自柄根</option><option value="CENTER">共同中心</option></select></label>
  <p id="ueStatus" class="vine-note"></p><label>单元素材<select id="ueSource"></select></label>
  <div id="ueProperties"><label>挂接枝条<select id="ueParent"></select></label>
  <div class="field-grid">${field('ueT','沿枝位置（%）',50,'1')}${field('ueSize','大小倍率',1)}</div>
  <div class="field-grid">${field('ueX','局部偏移 X（cm）',0)}${field('ueY','局部偏移 Y（cm）',0)}${field('ueZ','局部偏移 Z（cm）',0)}</div>
  <div class="field-grid">${field('ueRX','局部倾斜 X（°）',0,'1')}${field('ueRY','局部扭转 Y（°）',0,'1')}${field('ueRZ','局部朝向 Z（°）',0,'1')}</div></div>
  <div class="wb-row"><button id="ueCopy">复制 Shift+D</button><button id="ueDelete">删除（Delete）</button><button id="ueReset">恢复自动</button></div>
  <details><summary>批量调整</summary><div class="field-grid">${field('ueBatchT','沿枝移动（百分点）',0,'1')}${field('ueBatchSize','大小乘数',1)}${field('ueBatchX','倾斜 X（°）',0,'1')}${field('ueBatchY','扭转 Y（°）',0,'1')}${field('ueBatchZ','朝向 Z（°）',0,'1')}</div><button id="ueBatch">调整所选单元</button></details>
  <button id="ueRestoreDeleted">恢复本样本已删除的叶花果</button><details><summary>待重新挂接的单元</summary><select id="ueOrphans"></select><p class="vine-note">先选择一根枝干，再将保留的单元挂接到该枝。原局部姿态与尺寸保留。</p><div class="wb-row"><button id="ueReattach">挂到选中枝干</button><button id="ueDiscardOrphan">移除这条失效记录</button></div></details><button id="ueCheck">检查挂接与近似重叠</button><p class="vine-note">检查柄根和重复朝向；网格穿插仍需近景检查。</p><div id="ueIssues"></div>`;
  section.prepend(panel);
  const proxy=new THREE.Object3D(),gizmo=new TransformControls(api.camera),helper=gizmo.getHelper(),outline=new THREE.Group();
  gizmo.setSize(.65);gizmo.setSpace('world');gizmo.showE=false;gizmo.showXYZE=false;api.modelRoot.add(proxy,helper,outline);
  const ray=new THREE.Raycaster(),chosen=new Set();let mode='translate',adding=false,gesture=null,drag=null,current=null,lookup=new Map(),meshRefs=new Map(),held=false;
  const box=document.createElement('div');box.style.cssText='position:fixed;pointer-events:none;border:1px solid #e7c966;background:#e7c96622;z-index:50;display:none';document.body.append(box);
  const kind=()=>$('ueKind').value,enabled=()=>api.isBranch()&&kind()!=='BRANCH';
  const busy=()=>api.isBusy()||api.getAsset()?.group.userData.pending_rebuild||!$('busyOverlay').hidden;
  const sources=(k=kind())=>k==='ORGAN'?api.getAuthoring().tree_organs.units:api.getLeafSources().length?api.getLeafSources():[{id:'DEFAULT',name:'内置叶片'}];
  const branches=()=>api.getAsset()?.masterBranches||[];
  const branch=id=>branches().find(b=>b.stableId===id);
  const pointer=(e,button=e.button)=>{const r=api.canvas.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*2-1,y:1-(e.clientY-r.top)/r.height*2,button};};
  let pendingCopies=null;
  function rebuild(){
    const a=api.getAsset();if(a===current)return;held=false;current=a;lookup=new Map();meshRefs=new Map();if(!a)return;
    for(const p of [...a.placements,...a.treeOrgans])lookup.set(p.stableId,p);
    a.group.traverse(mesh=>{const uv=mesh.geometry?.getAttribute('uv1');if(!mesh.isMesh||!uv||!['leaf','tree_organ'].includes(mesh.userData.category))return;
      const {width,height}=a.lookupTexture,map=new Map();for(let i=0;i<uv.count;i++){const index=Math.floor(uv.getX(i)*width)+Math.floor(uv.getY(i)*height)*width,id=a.elements[index]?.id;if(!lookup.has(id))continue;if(!map.has(id))map.set(id,[]);map.get(id).push(i);}
      for(const [id,indices]of map){if(!meshRefs.has(id))meshRefs.set(id,[]);meshRefs.get(id).push({mesh,indices});const p=lookup.get(id);if(p.source<0)p.source=mesh.userData.source_index;}
    });
    if(pendingCopies?.every(id=>lookup.has(id))){chosen.clear();pendingCopies.forEach(id=>chosen.add(id));pendingCopies=null;}
    for(const id of chosen)if(!lookup.has(id))chosen.delete(id);
  }
  function picked(){return [...chosen].map(id=>lookup.get(id)).filter(Boolean);}
  function matches(p){return kind()==='LEAF'?!['FLOWER','BUD','FRUIT'].includes(p.organRole):['FLOWER','BUD','FRUIT'].includes(p.organRole);}
  function records(){return picked().map(p=>{const old=api.getAuthoring().unit_editing.items.find(v=>v.id===p.stableId);return {...captureUnit(p,branch(p.branchStableId),sources(),kind(),old?.added),base_scale:old?.base_scale||p.scale};});}
  function store(items,label){if(busy())return false;return api.transact(label,a=>{const map=new Map(a.unit_editing.items.map(v=>[v.id,v]));for(const v of items)map.set(v.id,{...v,...(map.get(v.id)?.duplicate?{duplicate:true}:{})});a.unit_editing.items=[...map.values()];a.unit_editing.removed=a.unit_editing.removed.filter(id=>!items.some(v=>v.id===id));},{bypassLayers:true});}
  function refresh(){
    document.body.dataset.unitEditing=enabled()?'on':'off';
    if (!enabled() && $('contextCount')) $('contextCount').textContent = $('contextCount').dataset.branchCount || '0';
    panel.hidden=!api.isBranch();if(panel.hidden){current=null;lookup.clear();meshRefs.clear();gizmo.detach();outline.visible=false;return;}const orphans=api.getAuthoring().unit_editing.items.filter(v=>!branch(v.parent));const orphanValue=$('ueOrphans').value;$('ueOrphans').replaceChildren(...orphans.map(v=>new Option(v.id+' → '+v.parent,v.id)));if(orphans.some(v=>v.id===orphanValue))$('ueOrphans').value=orphanValue;$('ueReattach').disabled=$('ueDiscardOrphan').disabled=!orphans.length;
    $('ueOrphans').closest('details').hidden = !orphans.length;
    if(enabled())rebuild();if(!enabled()){gizmo.detach();outline.visible=false;return;}if(drag||held)return;
    outline.children.forEach(o=>{o.geometry?.dispose();o.material?.dispose();});outline.clear();outline.visible=true;
    const ps=picked();if ($('contextCount')) $('contextCount').textContent=String(ps.length);for(const p of ps){const bounds=new THREE.Box3();for(const {mesh,indices}of meshRefs.get(p.stableId)||[])for(const i of indices)bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrix));if(!bounds.isEmpty()){const helper=new THREE.Box3Helper(bounds,0xe6c961);helper.userData.unitId=p.stableId;outline.add(helper);}}
    proxy.position.set(0,0,0);ps.forEach(p=>proxy.position.add(p.position));if(ps.length)proxy.position.multiplyScalar(1/ps.length);proxy.quaternion.identity();proxy.scale.setScalar(1);proxy.updateMatrixWorld(true);
    if(ps.length&&!adding){gizmo.attach(proxy);gizmo.setMode(mode);gizmo.enabled=true;}else gizmo.detach();
    $('ueStatus').textContent=adding?'点击枝干放置当前素材；再次点击按钮结束。':`已选 ${ps.length} 个${kind()==='LEAF'?'叶片':'花果'}单元 · ${api.getAuthoring().unit_editing.items.filter(v=>v.kind===kind()).length} 个手工保留`;
    const ss=sources(),value=$('ueSource').value;$('ueSource').replaceChildren(...ss.map(s=>new Option(s.name||s.id,s.id)));$('ueSource').value=ps.length===1?(ss[ps[0].source]?.id||value):value;if(!$('ueSource').value&&ss.length)$('ueSource').selectedIndex=0;
    $('ueMove').classList.toggle('active',!adding&&mode==='translate');$('ueRotate').classList.toggle('active',!adding&&mode==='rotate');$('ueAdd').classList.toggle('active',adding);
    $('ueProperties').hidden=ps.length!==1;for(const id of ['ueCopy','ueDelete','ueBatch'])$(id).disabled=!ps.length;$('ueReset').disabled=!ps.length;
    if(ps.length===1){const v=records()[0],q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(new THREE.Vector3(...v.direction),new THREE.Vector3(...v.normal)).normalize(),new THREE.Vector3(...v.direction),new THREE.Vector3(...v.normal))),e=new THREE.Euler().setFromQuaternion(q);
      $('ueParent').replaceChildren(...branches().filter(b=>!b.unitOwner&&!b.instanceId).map(b=>new Option(b.stableId,b.stableId)));$('ueParent').value=v.parent;
      for(const [id,n]of Object.entries({ueT:v.t*100,ueSize:v.scale/v.base_scale,ueX:v.offset[0]*100,ueY:v.offset[1]*100,ueZ:v.offset[2]*100,ueRX:THREE.MathUtils.radToDeg(e.x),ueRY:THREE.MathUtils.radToDeg(e.y),ueRZ:THREE.MathUtils.radToDeg(e.z)}))if(document.activeElement!==$(id))$(id).value=Number(n.toFixed(4));
    }
  }
  const unitDrop=createUnitDrop({...api,isBusy:busy,cancel,hitWood:e=>hit(e,true),selectUnit(id,k){adding=false;chosen.clear();$('ueKind').value=k;rebuild();chosen.add(id);refresh();}});
  function deselect(){cancel();chosen.clear();adding=false;gizmo.detach();outline.visible=false;}
  $('ueKind').onchange=()=>{const next=kind();deselect();api.setTool('SELECT');$('ueKind').value=next;api.select(null);refresh();};
  $('ueMove').onclick=()=>{cancel();adding=false;mode='translate';refresh();};$('ueRotate').onclick=()=>{cancel();adding=false;mode='rotate';refresh();};
  $('ueAdd').onclick=()=>{cancel();adding=!adding;refresh();};$('uePivot').onchange=()=>{cancel();refresh();};
  function valid(ids){return ids.every(id=>$(id).value!==''&&Number.isFinite(Number($(id).value)));}
  const props=['ueT','ueSize','ueX','ueY','ueZ','ueRX','ueRY','ueRZ'];
  function change(){if(!enabled()||chosen.size!==1||!valid(props))return;const v=records()[0],q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...['ueRX','ueRY','ueRZ'].map(id=>THREE.MathUtils.degToRad(Number($(id).value)))));v.parent=$('ueParent').value;v.t=THREE.MathUtils.clamp(Number($('ueT').value)/100,0,1);v.offset=['ueX','ueY','ueZ'].map(id=>Number($(id).value)/100);v.direction=new THREE.Vector3(0,1,0).applyQuaternion(q).toArray();v.normal=new THREE.Vector3(0,0,1).applyQuaternion(q).toArray();v.scale=v.base_scale*Math.max(.01,Number($('ueSize').value));store([v],'调整单元挂点与姿态');}
  for(const id of [...props,'ueParent'])$(id).onchange=change;
  $('ueSource').onchange=()=>{if(chosen.size&&!adding)store(records().map(v=>({...v,source_id:$('ueSource').value,source:sources().findIndex(s=>s.id===$('ueSource').value)})),'替换选中单元素材');};
  function remove(){if(busy()||!chosen.size)return;const ids=[...chosen];api.transact('删除叶花果单元',a=>{a.unit_editing.removed=[...new Set([...a.unit_editing.removed,...ids])];},{bypassLayers:true});chosen.clear();refresh();}
  $('ueDelete').onclick=remove;
  $('ueCopy').onclick=()=>document.dispatchEvent(new CustomEvent('duplicate-selection')); 
  $('ueReset').onclick=()=>{if(busy())return;const ids=new Set(chosen);api.transact('恢复单元自动生成',a=>{a.unit_editing.items=a.unit_editing.items.filter(v=>!ids.has(v.id));a.unit_editing.removed=a.unit_editing.removed.filter(id=>!ids.has(id));},{bypassLayers:true});};
  $('ueBatch').onclick=()=>{if(!valid(['ueBatchT','ueBatchSize','ueBatchX','ueBatchY','ueBatchZ']))return;const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...['ueBatchX','ueBatchY','ueBatchZ'].map(id=>THREE.MathUtils.degToRad(Number($(id).value)))));store(records().map(v=>({...v,t:THREE.MathUtils.clamp(v.t+Number($('ueBatchT').value)/100,0,1),scale:v.scale*Math.max(.01,Number($('ueBatchSize').value)),direction:new THREE.Vector3(...v.direction).applyQuaternion(q).toArray(),normal:new THREE.Vector3(...v.normal).applyQuaternion(q).toArray()})),'批量调整单元');};
  $('ueRestoreDeleted').onclick=()=>{if(!busy())api.transact('恢复已删除单元',a=>{a.unit_editing.removed=[];a.leaf_edits.removed=[];},{bypassLayers:true});};
  $('ueReattach').onclick=()=>{const b=branch(api.getSelection()),id=$('ueOrphans').value;if(!b||b.unitOwner||b.instanceId){api.toast('请先切换到枝干选择并选中一根样本枝干',true);return;}if(!busy())api.transact('重新挂接保留单元',a=>{const v=a.unit_editing.items.find(v=>v.id===id);if(v)v.parent=b.stableId;},{bypassLayers:true});};
  $('ueDiscardOrphan').onclick=()=>{const id=$('ueOrphans').value;if(!busy())api.transact('移除失效单元记录',a=>{a.unit_editing.items=a.unit_editing.items.filter(v=>v.id!==id);},{bypassLayers:true});};
  $('ueCheck').onclick=()=>{rebuild();const issues=inspectUnits([...lookup.values()],branches(),api.getAuthoring().unit_editing,{LEAF:sources('LEAF'),ORGAN:sources('ORGAN')});$('ueIssues').replaceChildren();const note=document.createElement('p');note.textContent=issues.length?`${issues.length} 项待检查（显示前 60 项）`:'未发现挂点缺失或近似重叠。';$('ueIssues').append(note);for(const issue of issues.slice(0,60)){const b=document.createElement('button');b.textContent=`${issue.id}：${issue.reason}`;b.onclick=()=>{const p=lookup.get(issue.id);if(p){$('ueKind').value=p.organRole&&p.organRole!=='LEAF'?'ORGAN':'LEAF';chosen.clear();chosen.add(issue.id);refresh();api.controls.target.copy(api.modelRoot.localToWorld(p.position.clone()));api.controls.update();}else api.toast('该单元挂点或素材已失效；撤销骨架替换可恢复，也可清理失效记录。',true);};$('ueIssues').append(b);}};
  function hit(e,wood=false,automatic=false){rebuild();ray.setFromCamera(pointer(e),api.camera);const meshes=[];current?.group.traverse(o=>{if(o.isMesh&&o.visible&&(automatic?['branch','leaf','tree_organ'].includes(o.userData.category):wood?o.userData.category==='branch':kind()==='LEAF'?o.userData.category==='leaf':o.userData.category==='tree_organ'))meshes.push(o);});for(const h of ray.intersectObjects(meshes,false)){if(wood||h.object.userData.category==='branch'){const b=branch(h.object.userData.stable_id);if(b&&!b.unitOwner&&!b.instanceId)return {b,point:current.group.worldToLocal(h.point.clone())};}else{const uv=h.object.geometry.attributes.uv1,i=h.face.a,{width,height}=current.lookupTexture,id=current.elements[Math.floor(uv.getX(i)*width)+Math.floor(uv.getY(i)*height)*width]?.id;if(lookup.has(id))return {id,kind:h.object.userData.category==='tree_organ'?'ORGAN':'LEAF'};}}return null;}
  function previewFor(ps){const entries=[];for(const p of ps)for(const {mesh,indices}of meshRefs.get(p.stableId)||[]){const g=mesh.geometry;entries.push({p,mesh,g,indices,bounds:g.boundingBox?.clone(),sphere:g.boundingSphere?.clone(),positions:indices.map(i=>new THREE.Vector3().fromBufferAttribute(g.attributes.position,i)),normals:indices.map(i=>new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i))});}
    function update(next){const boxes=new Map();for(const e of entries){if(!boxes.has(e.p.stableId))boxes.set(e.p.stableId,new THREE.Box3());const p=next.get(e.p.stableId)||e.p,q=unitPoseQuaternion(p).multiply(unitPoseQuaternion(e.p).invert()),scale=p.scale/e.p.scale;for(let n=0;n<e.indices.length;n++){const v=e.positions[n].clone().sub(e.p.position).applyQuaternion(q).multiplyScalar(scale).add(p.position),normal=e.normals[n].clone().applyQuaternion(q);e.g.attributes.position.setXYZ(e.indices[n],v.x,v.y,v.z);e.g.attributes.normal.setXYZ(e.indices[n],normal.x,normal.y,normal.z);e.g.boundingBox?.expandByPoint(v);boxes.get(e.p.stableId).expandByPoint(v.applyMatrix4(e.mesh.matrix));}e.g.attributes.position.needsUpdate=true;e.g.attributes.normal.needsUpdate=true;if(e.g.boundingBox)e.g.boundingSphere=e.g.boundingBox.getBoundingSphere(new THREE.Sphere());}for(const helper of outline.children){const box=boxes.get(helper.userData.unitId);if(box){helper.box.copy(box);helper.updateMatrixWorld(true);}}}
    return {update,restore:()=>{update(new Map());for(const e of entries){if(e.bounds)e.g.boundingBox=e.bounds.clone();if(e.sphere)e.g.boundingSphere=e.sphere.clone();}},dispose(){}};
  }
  gizmo.addEventListener('objectChange',()=>{if(!drag)return;const delta=proxy.position.clone().sub(drag.center),q=proxy.quaternion;drag.items=drag.records.map((v,i)=>{const p=drag.placements[i],position=p.position.clone();if(mode==='translate')return delta.lengthSq()<1e-14?v:drag.slides[i]({point:position.add(delta)}).record;if(mode==='translate')position.add(delta);else if($('uePivot').value==='CENTER')position.sub(drag.center).applyQuaternion(q).add(drag.center);const b=branch(v.parent),t=mode==='translate'?nearestUnitT(b,position):v.t;const next={...p,unitT:t,position:mode==='translate'?unitFrame(b,t).position:position,direction:p.direction.clone().applyQuaternion(mode==='translate'?unitFrame(b,t).quaternion.multiply(unitFrame(b,v.t).quaternion.invert()):q),normal:p.normal?.clone().applyQuaternion(mode==='translate'?unitFrame(b,t).quaternion.multiply(unitFrame(b,v.t).quaternion.invert()):q)};return {...captureUnit(next,b,sources(),kind(),v.added),base_scale:v.base_scale};});const next=new Map(drag.items.map(v=>[v.id,resolveUnit(v,branch(v.parent),sources())]));drag.preview.update(next);drag.changed=true;});
  function begin(e){
    if(e.button!==0||!api.isBranch())return false;
    if(!enabled()){
      if(e.shiftKey||e.ctrlKey||!api.canDirectSelect()||busy())return false;
      const h=hit(e,false,true);if(!h?.id)return false;
      api.select(null);$('ueKind').value=h.kind;refresh();
    }
    if(busy())return true;
    rebuild();
    if(!e.shiftKey&&!e.ctrlKey&&!adding){
      helper.updateMatrixWorld(true);if(chosen.size)gizmo.pointerHover(pointer(e));
      if(!chosen.size||!gizmo.axis){const h=hit(e,false,true);if(h?.b){deselect();$('ueKind').value='BRANCH';refresh();return false;}}
    }
    gesture={x:e.clientX,y:e.clientY,shift:e.shiftKey,ctrl:e.ctrlKey};api.controls.enabled=false;api.canvas.setPointerCapture(e.pointerId);
    if(!e.shiftKey&&!e.ctrlKey&&!adding&&chosen.size){helper.updateMatrixWorld(true);gizmo.pointerHover(pointer(e));if(gizmo.axis){drag={placements:picked().map(p=>({...p,position:p.position.clone(),direction:p.direction.clone(),normal:new THREE.Vector3(0,0,1).applyQuaternion(unitPoseQuaternion(p)),twist:0})),records:records(),center:proxy.position.clone(),changed:false};api.modelRoot.updateWorldMatrix(true,false);api.camera.updateMatrixWorld();drag.slides=drag.records.map(v=>createUnitSlide(branch(v.parent),v,{camera:api.camera,modelRoot:api.modelRoot,bounds:api.canvas.getBoundingClientRect(),branches:branches()}));drag.preview=previewFor(drag.placements);gizmo.pointerDown(pointer(e));}}return true;}
  function move(e){if(!enabled())return false;if(drag){gizmo.pointerMove(pointer(e,-1));return true;}if(gesture&&(gesture.shift||gesture.ctrl)){box.style.display='block';Object.assign(box.style,{left:Math.min(e.clientX,gesture.x)+'px',top:Math.min(e.clientY,gesture.y)+'px',width:Math.abs(e.clientX-gesture.x)+'px',height:Math.abs(e.clientY-gesture.y)+'px'});}else if(!gesture&&chosen.size)gizmo.pointerHover(pointer(e));return true;}
  function end(e){if(!enabled()||e.button!==0)return false;box.style.display='none';api.controls.enabled=true;const g=gesture;gesture=null;if(drag){gizmo.pointerUp(pointer(e));const d=drag;drag=null;if(d.changed){held=true;const accepted=api.commitPreview(d.preview,()=>store(d.items,'调整叶花果单元'));if(accepted===false){held=false;refresh();}}else{d.preview.restore();refresh();}return true;}if(!g)return true;
    const distance=Math.hypot(e.clientX-g.x,e.clientY-g.y);
    if(g.shift||g.ctrl){const r=api.canvas.getBoundingClientRect();for(const p of lookup.values()){if(!matches(p))continue;const v=api.modelRoot.localToWorld(p.position.clone()).project(api.camera),x=r.left+(v.x+1)*r.width/2,y=r.top+(1-v.y)*r.height/2;if(v.z>=-1&&v.z<=1&&x>=Math.min(g.x,e.clientX)-3&&x<=Math.max(g.x,e.clientX)+3&&y>=Math.min(g.y,e.clientY)-3&&y<=Math.max(g.y,e.clientY)+3){if(g.ctrl)chosen.delete(p.stableId);else chosen.add(p.stableId);}}}
    else if(distance<5){if(adding){const h=hit(e,true),ss=sources(),index=ss.findIndex(s=>s.id===$('ueSource').value);if(h&&index>=0){const t=nearestUnitT(h.b,h.point),f=unitFrame(h.b,t),p={stableId:'UNIT_'+crypto.randomUUID(),unitT:t,position:f.position,direction:new THREE.Vector3(1,.4,.3).normalize().applyQuaternion(f.quaternion),normal:null,twist:0,scale:kind()==='LEAF'?api.getSettings().leaf_scale:ss[index].size,source:index};store([captureUnit(p,h.b,ss,kind(),true)],'添加叶花果单元');}}else{const h=hit(e,false,true);chosen.clear();if(h?.id){$('ueKind').value=h.kind;chosen.add(h.id);}}}
    refresh();return true;
  }
  function keyboardDuplicate() {
    if(!enabled()||!chosen.size||busy()||drag||gesture||held)return null;
    rebuild();const ps=picked(),vs=records().map(v=>({...v,id:'UNIT_'+crypto.randomUUID(),added:true,duplicate:true})),asset=current;
    api.modelRoot.updateWorldMatrix(true,false);api.camera.updateMatrixWorld();
    const entries=ps.map((p,i)=>({p,preview:createSelectionCopyPreview(asset,e=>e?.id===p.stableId),slide:createUnitSlide(branch(vs[i].parent),vs[i],{camera:api.camera,modelRoot:api.modelRoot,bounds:api.canvas.getBoundingClientRect(),branches:branches()})}));
    let items=vs;gizmo.detach();adding=false;
    const restore=()=>entries.forEach(e=>e.preview.restore());
    return {center:proxy.position.clone(),alongBranch:true,label:`复制 ${ps.length} 个${kind()==='LEAF'?'叶片':'花果'}单元`,valid:()=>api.getAsset()===asset&&!busy(),
      update(delta,gesture){items=entries.map(e=>e.slide(gesture).record);for(const [i,e]of entries.entries()){
        const next=resolveUnit(items[i],branch(items[i].parent),sources());
        const from=new THREE.Matrix4().compose(e.p.position,unitPoseQuaternion(e.p),new THREE.Vector3(1,1,1));
        const to=new THREE.Matrix4().compose(next.position,unitPoseQuaternion(next),new THREE.Vector3(1,1,1));e.preview.update(to.multiply(from.invert()));
      }return {carrier:items[0]?.parent};},
      commit(){pendingCopies=items.map(v=>v.id);held=true;const accepted=api.commitPreview({restore,dispose:restore},()=>store(items,'复制叶花果单元并放置'));if(accepted===false){pendingCopies=null;held=false;restore();refresh();}},
      cancel(){restore();refresh();}};
  }
  function keyboardTransform(operation) {
    if(!enabled()||!chosen.size||busy()||drag||gesture||held)return null;
    rebuild();const ps=picked(),vs=records(),asset=current,center=proxy.position.clone(),preview=previewFor(ps),individual=$('uePivot').value==='EACH';
    api.modelRoot.updateWorldMatrix(true,false);api.camera.updateMatrixWorld();const slides=operation==='translate'?vs.map(v=>createUnitSlide(branch(v.parent),v,{camera:api.camera,modelRoot:api.modelRoot,bounds:api.canvas.getBoundingClientRect(),branches:branches()})):null;
    let items=vs,changed=false;adding=false;gizmo.detach();
    return {center,uniform:true,alongBranch:operation==='translate',label:ps.length+' 个叶花果单元',valid:()=>api.getAsset()===asset&&!busy(),
      update({translation,rotation,scale},gesture) {
        if(slides){const results=slides.map(slide=>slide(gesture));items=results.map(r=>r.record);changed=results.some(r=>r.changed);preview.update(new Map(items.map(v=>[v.id,resolveUnit(v,branch(v.parent),sources())])));return {amount:results[0].distance,carrier:results[0].record.parent};}
        changed=translation.lengthSq()>1e-14||1-Math.abs(rotation.w)>1e-12||Math.abs(scale.x-1)>1e-9;
        items=ps.map((p,i)=>{const pivot=individual?p.position:center,pose=unitPoseQuaternion(p);
          const next={...p,unitT:vs[i].t,position:p.position.clone().sub(pivot).applyQuaternion(rotation).multiplyScalar(scale.x).add(pivot).add(translation),direction:new THREE.Vector3(0,1,0).applyQuaternion(pose).applyQuaternion(rotation),normal:new THREE.Vector3(0,0,1).applyQuaternion(pose).applyQuaternion(rotation),twist:0,scale:p.scale*scale.x};
          return {...captureUnit(next,branch(vs[i].parent),sources(),kind(),vs[i].added),base_scale:vs[i].base_scale};});
        preview.update(new Map(items.map(v=>[v.id,resolveUnit(v,branch(v.parent),sources())])));
      },
      commit(){if(!changed){preview.restore();refresh();return;}held=true;const accepted=api.commitPreview(preview,()=>store(items,({translate:'移动',rotate:'旋转',scale:'缩放'}[operation])+'叶花果单元'));if(accepted===false){held=false;refresh();}},
      cancel(){preview.restore();refresh();}
    };
  }
  function cancel(){const active=!!gesture||!!drag;if(drag){drag.preview.restore();gizmo.pointerUp({button:0});drag=null;}gesture=null;box.style.display='none';api.controls.enabled=true;return active;}
  function key(e){if(!enabled()||e.target?.isContentEditable||e.target?.matches?.('input,textarea,select')||document.querySelector('dialog[open]'))return false;
    if(e.key==='Escape'){if(!cancel()){adding=false;chosen.clear();}refresh();return true;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){if(cancel()){refresh();return true;}return false;}
    if(e.key==='Delete'&&!e.ctrlKey&&!e.shiftKey&&!e.altKey&&!e.metaKey){if(!e.repeat)remove();return true;}return false;
  }
  return {refresh,begin,move,end,cancel,key,keyboardTransform,keyboardDuplicate,unitDrop,deactivate(){unitDrop.cancel();deselect();$('ueKind').value='BRANCH';document.body.dataset.unitEditing='off';},get enabled(){return enabled();},get selection(){return [...chosen];},get debug(){return {gizmo,dragging:!!drag};}};
}
