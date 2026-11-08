import * as THREE from 'three';
import {MAX_POT_BYTES, POT_SCALE_RANGE, normalizeBonsaiPot, potFileSizeMessage} from './bonsai-pot-data.js';
import {applyPotTransform, disposePotModel, loadPotModel, potBase64, potBytes} from './bonsai-pot-model.js';

export function createBonsaiWorkspace({panel,scene,canvas,camera,read,owner,commit,available,canPreview,canEdit,anchor,fit,onFloor,exportPot,toast}) {
  const q = key => panel.querySelector('[data-bonsai="' + key + '"]');
  const container = new THREE.Group();
  container.name = '盆景花盆';
  scene.add(container);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(1,12,8),
    new THREE.MeshBasicMaterial({color:0xffd879,depthTest:false,depthWrite:false}));
  marker.visible = false;
  marker.userData.editorOnly = true;
  marker.renderOrder = 150;
  container.add(marker);

  let current, model, preview, pending, error = '', serial = 0, editing = false, picking = false, busy = false;
  let uiKey = '', bounds = null, suppressedPointer = null;
  const ray = new THREE.Raycaster();
  function apply(value) {
    if (!model || !value) return;
    applyPotTransform(model,value);
    bounds = new THREE.Box3().setFromObject(model.root);
    marker.position.fromArray(value.position);
    marker.scale.setScalar(THREE.MathUtils.clamp(model.bounds.getSize(new THREE.Vector3()).length() * value.scale * .025,.008,.09));
    onFloor(container.visible ? bounds.min.z : null);
  }
  function refresh() {
    const showPanel = available(), ready = Boolean(model && current), visible = showPanel && canPreview() && !!current?.visible && ready;
    if (editing && (!visible || !canEdit())) { editing = false; picking = false; preview = null; apply(current); }
    if (container.visible !== visible) { container.visible = visible; onFloor(visible ? bounds?.min.z : null); }
    marker.visible = editing;
    const key = [showPanel,ready,current?.visible,current?.export_with_tree,model?.hasNativeMaterialFallback,model?.hasReducedImages,editing,picking,busy,!!pending,error,canEdit()].join('|');
    if (uiKey === key) return;
    uiKey = key;
    panel.hidden = !showPanel;
    q('import').textContent = current ? '替换花盆' : '导入花盆 GLB';
    q('import').disabled = busy || !!pending || !canEdit();
    q('name').textContent = current?.name || '导入一只花盆，和当前树搭配。';
    q('material-note').hidden = !model?.hasNativeMaterialFallback && !model?.hasReducedImages;
    q('actions').hidden = !current;
    q('editing').hidden = !editing;
    q('visibility').textContent = current?.visible ? '隐藏' : '显示';
    q('export-with-tree').checked = current?.export_with_tree === true;
    q('export-with-tree').disabled = !current || busy || !canEdit();
    q('edit').textContent = editing ? '完成摆放' : '编辑花盆';
    q('edit').setAttribute('aria-pressed',String(editing));
    for (const name of ['visibility','remove']) q(name).disabled = busy || !canEdit();
    for (const name of ['edit','export']) q(name).disabled = !visible || busy || !canEdit();
    q('pick').setAttribute('aria-pressed',String(picking));
    q('status').textContent = error || (pending ? '正在读取花盆模型…' : editing
      ? picking ? '点盆口或盆内土面，种植点会对齐树根。' : 'G 移动 · R 旋转 · S 等比缩放'
      : ready && !current.visible ? '花盆已隐藏。显示后可导出盆景。' : '');
    if (!editing || !current || !model) return;
    for (const [index,axis] of ['x','y','z'].entries()) q(axis).value = Number((current.position[index] * 100).toFixed(3));
    q('yaw').value = Number(THREE.MathUtils.radToDeg(new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(current.rotation),'ZYX').z).toFixed(3));
    q('scale').value = Number(current.scale.toFixed(5));
    q('depth').value = Number(((model.planting[2] - current.planting[2]) * 100).toFixed(3));
  }
  function disposeModel() {
    if (model) { model.root.removeFromParent(); disposePotModel(model.root); }
    model = null; bounds = null; container.visible = false; onFloor(null);
  }
  function useModel(next) {
    disposeModel();
    model = next;
    container.add(model.root);
    apply(current);
  }
  function sync() {
    const next = read();
    if (current !== next) {
      const previous = current;
      current = next;
      preview = null;
      if (!current || previous?.glb !== current.glb) {
        const ticket = ++serial;
        error = ''; pending = null;
        disposeModel();
        if (current) {
          const source = current.glb;
          // Import can install its already loaded model before this task runs.
          pending = Promise.resolve().then(() => ticket === serial ? loadPotModel(potBytes(source)) : null).then(candidate => {
            if (!candidate) return;
            if (ticket === serial) useModel(candidate);
            else disposePotModel(candidate.root);
          }).catch(reason => { if (ticket === serial) error = '无法读取花盆 · ' + reason.message; })
            .finally(() => { if (ticket === serial) { pending = null; refresh(); } });
        }
      } else apply(current);
      uiKey = '';
    }
    refresh();
    return pending;
  }
  function update(fields, message) {
    const next = normalizeBonsaiPot({...current,...fields});
    if (!next) throw Error('花盆摆放数值无效。');
    commit(next,message);
    sync();
  }
  async function treeExportModel() {
    const selected = read();
    if (!available() || selected?.export_with_tree !== true) return null;
    await sync();
    if (!available() || read() !== selected) throw Error('花盆或工程已切换，请重新导出。');
    if (!model) throw Error(error || '花盆尚未加载，请稍后导出。');
    return model.root.clone(true);
  }
  function setEditing(next) {
    editing = next; picking = false; preview = null; uiKey = ''; apply(current); refresh();
    if (editing) canvas.focus();
  }
  const action = handler => async event => {
    try { await handler(event); }
    catch (reason) { toast(reason.message,true); uiKey = ''; refresh(); }
  };
  q('import').onclick = () => q('file').click();
  q('file').onchange = action(async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || busy || !available() || !canEdit()) return;
    if (!/\.glb$/i.test(file.name)) throw Error('请选择静态 GLB 文件。');
    if (file.size > MAX_POT_BYTES) throw Error(potFileSizeMessage(file.size));
    const identity = owner();
    busy = true; refresh();
    let candidate;
    try {
      const bytes = await file.arrayBuffer();
      candidate = await loadPotModel(bytes);
      if (identity !== owner() || !available() || !canEdit()) throw Error('当前工程已变更，请重新导入花盆。');
      const next = normalizeBonsaiPot({version:1,name:file.name.replace(/\.glb$/i,''),glb:potBase64(bytes),
        planting:candidate.planting,position:anchor(),rotation:[0,0,0,1],scale:1,visible:true,export_with_tree:current?.export_with_tree});
      if (!next) throw Error('无法保存花盆数据。');
      commit(next,'花盆已导入并对齐树根');
      current = next; error = ''; ++serial; pending = null;
      useModel(candidate); candidate = null;
      setEditing(true);
      fit();
    } finally {
      if (candidate) disposePotModel(candidate.root);
      busy = false; refresh();
    }
  });
  q('edit').onclick = () => setEditing(!editing);
  panel.addEventListener('toggle',() => { if (!panel.open && editing) setEditing(false); });
  q('visibility').onclick = action(() => update({visible:!current.visible}, current.visible ? '已隐藏花盆' : '已显示花盆'));
  q('export-with-tree').onchange = action(event => {
    const checked = event.target.checked;
    update({export_with_tree:checked},checked ? '导出 GLB 时将包含花盆' : '已关闭随树导出花盆');
  });
  q('remove').onclick = () => { setEditing(false); commit(null,'已移除花盆，可撤销'); sync(); };
  q('align').onclick = action(() => update({position:anchor()},'种植点已对齐树根'));
  q('pick').onclick = () => { picking = !picking; refresh(); canvas.focus(); };
  q('export').onclick = action(async () => {
    if (!model || busy) return;
    const pot = model.root.clone(true);
    setEditing(false);
    busy = true; refresh();
    try { await exportPot(pot); }
    finally { busy = false; refresh(); }
  });
  for (const name of ['x','y','z','yaw','scale','depth']) q(name).onchange = action(event => {
    const field = event.target, value = field.valueAsNumber;
    if (!field.validity.valid || !Number.isFinite(value)) throw Error('请输入有效的花盆摆放数值。');
    if (name === 'scale') update({scale:value},'已调整花盆尺寸');
    else if (name === 'depth') update({planting:[current.planting[0],current.planting[1],model.planting[2]-value/100]},'已调整种植深度');
    else if (name === 'yaw') {
      const angle = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(current.rotation),'ZYX');
      angle.z = THREE.MathUtils.degToRad(value);
      update({rotation:new THREE.Quaternion().setFromEuler(angle).toArray()},'已旋转花盆');
    } else {
      const position = [...current.position];
      position['xyz'.indexOf(name)] = value/100;
      update({position},'已移动花盆');
    }
  });
  window.addEventListener('pointerdown', event => {
    if (!editing || !canEdit() || event.button !== 0 || event.target !== canvas || canvas.dataset.keyboardTransform) return;
    suppressedPointer = event.pointerId;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!picking || !model) return;
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
    const hit = ray.intersectObject(model.root,true).find(item => item.object.isMesh);
    if (!hit) { toast('请点花盆网格上的位置。'); return; }
    picking = false;
    const point = model.root.worldToLocal(hit.point.clone()).add(new THREE.Vector3().fromArray(current.planting));
    update({planting:point.toArray(),position:anchor()},'新种植点已对齐树根');
  },true);
  for (const name of ['pointerup','pointercancel']) window.addEventListener(name,event => {
    if (suppressedPointer !== event.pointerId) return;
    suppressedPointer = null;
    event.stopImmediatePropagation();
  },true);
  window.addEventListener('keydown',event => {
    if (!editing || canvas.dataset.keyboardTransform || event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (picking) { picking = false; refresh(); }
    else setEditing(false);
    event.preventDefault(); event.stopImmediatePropagation();
  },true);

  function keyboard(operation) {
    if (!editing || !model || !canEdit() || !['translate','rotate','scale'].includes(operation)) return null;
    const base = current;
    const limits = POT_SCALE_RANGE.map(limit => limit/base.scale);
    return {center:new THREE.Vector3().fromArray(base.position),label:'花盆',uniform:true,scaleRange:limits,
      uniformHint:'花盆保持原有比例，S 只做等比缩放。',
      valid:()=>editing && canEdit() && read()===base,
      update(delta) {
        preview = {...base,position:new THREE.Vector3().fromArray(base.position).add(delta.translation).toArray(),
          rotation:delta.rotation.clone().multiply(new THREE.Quaternion().fromArray(base.rotation)).normalize().toArray(),
          scale:base.scale*delta.scale.x};
        apply(preview);
      },
      commit(){if (preview) update(preview,'已调整花盆');},
      cancel(){preview = null; apply(current);}
    };
  }
  return {root:container,sync,keyboard,treeExportModel,get editing(){return editing;},close:()=>setEditing(false),bounds:()=>container.visible ? bounds : null};
}
