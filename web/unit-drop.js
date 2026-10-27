import * as THREE from 'three';
import { deserializeGeometry, buildBranchAsset, disposeBranchAsset } from './branch-kernel.js';
import { plantAttachmentBase } from './plant-attachment.js';
import { samePlantTexture } from './plant-unit-import.js';
import { addDroppedUnit, droppedUnitPose } from './unit-drop-data.js';
import { unitPoseQuaternion } from './unit-authoring.js';

const MIME = 'application/x-branchforge-plant-unit';
const signature = p => JSON.stringify([p.stableId, p.branchStableId, p.source, p.position.toArray(), p.direction.toArray(), p.normal?.toArray(), p.scale, p.twist]);

// No texture allocation: dry builds verify that budgets cannot silently replace
// existing units with the new one. Only committed drops rebuild the workbench.
function verifyAddition(before, after, id) {
  const build = doc => {
    const sources = doc.leaf_meshes.map(s => ({ ...s, geometry: deserializeGeometry(s.geometry) }));
    let asset;
    try {
      asset = buildBranchAsset(doc.settings, null, sources, 0, doc.authoring, { resolveSources: true });
      return [...asset.placements, ...asset.treeOrgans].map(p => [p.stableId, signature(p)]);
    } finally { if (asset) disposeBranchAsset(asset); sources.forEach(s => s.geometry.dispose()); }
  };
  const old = build(before), next = new Map(build(after));
  if (!next.has(id) || next.size !== old.length + 1 || old.some(([key, value]) => next.get(key) !== value)) {
    throw Error('本次新增会超出生成预算或改变已有单元，已取消。请提高叶花果数量 / 面数预算后重试');
  }
}

export function createUnitDrop(api) {
  let active = null, committing = false;
  const hint = document.createElement('div'); hint.id = 'unitDropHint';
  hint.style.cssText = 'position:fixed;pointer-events:none;z-index:100;padding:7px 12px;background:#16251e;color:#e7d887;border:1px solid #e7d887;border-radius:5px';
  hint.hidden = true; document.body.append(hint);
  function clear() {
    if (active) { active.ghost.removeFromParent(); active.ghost.geometry.dispose(); active.ghost.material.dispose(); }
    active = null; hint.hidden = true;
  }
  function start(pack, unit, sharedMaterial, commit = fn => fn()) {
    clear();
    if (!api.isBranch() || api.isBusy() || committing) return false;
    api.setTool('SELECT'); api.cancel();
    const geometry = deserializeGeometry(unit.geometry), base = plantAttachmentBase(geometry);
    geometry.translate(-base.x, -base.y, -base.z);
    const material = sharedMaterial.clone(); // map / normalMap remain shared with the card preview
    material.transparent = true; material.opacity = .72; material.depthWrite = false;
    material.color.set(unit.colorTint || '#ffffff');
    const ghost = new THREE.Mesh(geometry, material); ghost.name = '叶花果拖入预览'; ghost.visible = false;
    ghost.scale.setScalar(unit.size_m); ghost.renderOrder = 5; api.modelRoot.add(ghost);
    active = { pack, unit, ghost, commit, asset: api.getAsset() };
    return true;
  }
  function preview(e) {
    if (!active || !e.dataTransfer.types.includes(MIME)) return null;
    e.preventDefault();
    const valid = api.isBranch() && !api.isBusy() && api.getAsset() === active.asset;
    const hit = valid ? api.hitWood(e) : null;
    e.dataTransfer.dropEffect = hit ? 'copy' : 'none';
    active.ghost.visible = !!hit;
    hint.hidden = false; hint.style.left = Math.min(window.innerWidth - 310, e.clientX + 18) + 'px'; hint.style.top = (e.clientY + 18) + 'px';
    hint.textContent = hit ? `松手添加「${active.unit.name}」· 柄根贴合枝干` : '请拖到木质枝干上；移出或 Esc 取消';
    if (hit) {
      const pose = droppedUnitPose(hit.b, hit.point);
      active.ghost.position.copy(pose.position); active.ghost.quaternion.copy(unitPoseQuaternion(pose));
    }
    return hit;
  }
  api.canvas.addEventListener('dragover', preview);
  api.canvas.addEventListener('dragleave', () => { if (active) active.ghost.visible = false; hint.hidden = true; });
  api.canvas.addEventListener('drop', async e => {
    if (!active || !e.dataTransfer.types.includes(MIME)) return;
    e.preventDefault(); e.stopPropagation();
    const hit = preview(e), drag = active; clear();
    if (!hit || committing) return;
    committing = true;
    try {
      const material = api.getAuthoring().leaf_material;
      // A branch uses a shared atlas. Never replace it underneath existing UVs.
      for (const key of ['color', 'normal']) {
        if ((material[key] || '') !== (drag.pack.material[key] || '') && !await samePlantTexture(material[key], drag.pack.material[key])) {
          throw Error('该单元使用另一套共享贴图。请先在装配面板应用对应植物套装，再拖入新增');
        }
      }
      if (!api.isBranch() || api.getAsset() !== drag.asset || api.isBusy()) throw Error('工程正在更新，请稍后重新拖入');
      const before = api.capture(), next = { ...before, settings: { ...before.settings }, leaf_meshes: [...(before.leaf_meshes || [])],
        authoring: { ...before.authoring, tree_organs: { ...before.authoring.tree_organs, units: [...before.authoring.tree_organs.units] },
          unit_editing: { ...before.authoring.unit_editing, items: [...before.authoring.unit_editing.items] } } };
      // These counts include retained manual units. Reserve one more slot when
      // the sample was authored exactly at its limit (common for flower tips).
      if (drag.unit.role === 'LEAF') next.settings.max_leaves = Math.max(next.settings.max_leaves, drag.asset.placements.length + 1);
      else next.authoring.tree_organs.max_count = Math.max(next.authoring.tree_organs.max_count, drag.asset.treeOrgans.length + 1);
      const record = addDroppedUnit(next, drag.pack, drag.unit, hit.b, hit.point, 'UNIT_' + crypto.randomUUID());
      verifyAddition(before, next, record.id);
      await drag.commit(() => api.applyPlantAssets(next));
      api.selectUnit(record.id, record.kind);
      api.toast(`已添加「${drag.unit.name}」，可直接 G 移动、R 旋转、S 缩放；Ctrl+Z 撤销`);
    } catch (error) { api.toast(error.message, true); }
    finally { committing = false; }
  });
  window.addEventListener('dragend', clear);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && active) clear(); }, true);
  window.addEventListener('blur', clear);
  return { start, cancel: clear };
}
