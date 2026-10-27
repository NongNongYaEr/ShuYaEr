import * as THREE from 'three';
import { instanceMatrix } from './branch-instance-edit.js';
import { resolveInstanceAsset, resolveInstanceShape, normalizeBranchShape, equalData } from './branch-workbench-data.js';
import { pveGlbMatrix } from './pve-export.js';

// Resolve delivery ownership from the final graph, after copies, sculpt and
// reattachment. Document instance order is not a geometry ownership contract.
// Normal nested installation keeps every authored source as a separate unit.
// Historical locally edited/snapshotted families retain their outer full model.
export function resolvePveExportPlan(asset, authoring = asset.authoring) {
  const graph = asset.masterBranches;
  const byId = new Map(graph.map(branch => [branch.id, branch]));
  const byStable = new Map(graph.map(branch => [branch.stableId, branch]));
  const instances = new Map(authoring.branch_instances.map(instance => [instance.id, instance]));
  const ownerId = branch => {
    if (!branch) return '';
    if (branch.unitOwner || branch.instanceId) return branch.unitOwner || branch.instanceId;
    // Early snapshot copies deliberately cleared the selected root's owner.
    // Its explicit provenance restores the complete-unit boundary at delivery.
    const sourceInstance = branch.sourceInstanceId
      || [...(branch.copiedLeaves || []), ...(branch.copiedOrgans || [])].find(unit => unit.metadata?.sourceInstanceId)?.metadata.sourceInstanceId;
    return branch.copySnapshot && sourceInstance
      ? `${branch.stableId.replace(/_\d+$/, '')}_${sourceInstance}` : '';
  };
  const outerOwner = branch => {
    let result = ownerId(branch), cursor = branch, seen = new Set();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id); cursor = byId.get(cursor.parentId);
      if (ownerId(cursor)) result = ownerId(cursor);
    }
    return result;
  };
  const outerGroups = new Map();
  for (const branch of graph) {
    const owner = outerOwner(branch);
    if (!owner) continue;
    if (!outerGroups.has(owner)) outerGroups.set(owner, []);
    outerGroups.get(owner).push(branch);
  }
  const structuralBranches = graph.filter(branch => !outerOwner(branch));
  const structuralIds = new Set(structuralBranches.map(branch => branch.stableId));
  const internalEdits = (id, branches) => {
    const ids = new Set(branches.map(branch => branch.stableId));
    const touches = value => typeof value === 'string' && (ids.has(value) || value.startsWith(id + '.'));
    const ancestors = new Set();
    for (const branch of branches) {
      let parent=byId.get(branch.parentId);const seen=new Set();
      while(parent && !seen.has(parent.id)){seen.add(parent.id);ancestors.add(parent.stableId);parent=byId.get(parent.parentId);}
    }
    const affects = operation => operation?.protect_units !== true &&
      ((operation?.targets || []).some(touches)
        || (operation?.stamps || []).some(stamp=>touches(stamp.branch))
        // Older region tools recursively deformed every installed descendant.
        // Keep that final geometry as a legacy complete variant on export.
        || ['CAGE','GUIDE','SPACE','POSE','QUICK'].includes(operation?.type)
          && (operation.targets || []).some(target=>ancestors.has(target)));
    return Object.keys(authoring.overrides).some(touches)
      || authoring.sculpt_layers.some(layer => layer.enabled !== false && layer.strength !== 0 &&
        (Object.keys(layer.branches || {}).some(touches) || affects(layer.operation)))
      || authoring.topology.suppressed.some(touches)
      || authoring.leaf_edits.added.some(unit => touches(unit.parent))
      || authoring.leaf_edits.removed.some(touches)
      || authoring.unit_editing.items.some(unit => touches(unit.parent) || touches(unit.id))
      || authoring.unit_editing.removed.some(touches)
      || authoring.unit_editing.rules.some(rule => rule.targets?.some(touches))
      || authoring.foliage_masks.length > 0;
  };
  const groups = new Map();
  for (const [outer, branches] of outerGroups) {
    const owners = new Set(branches.map(ownerId));
    const independent = [...owners].every(id => {
      const instance = instances.get(id);
      if (!instance) return false;
      const item = resolveInstanceAsset({...instance,linked:true},authoring.branch_library);
      const shape = resolveInstanceShape(instance,authoring.branch_library);
      return item?.sample && (instance.linked || equalData(normalizeBranchShape(shape),normalizeBranchShape(item.shape)))
        && !(instance.junction?.enabled && instance.junction.align > 0)
        && !internalEdits(id,branches.filter(branch=>ownerId(branch)===id));
    }) && branches.every(branch => !branch.copySnapshot && !branch.manual && instances.has(branch.instanceId));
    if (!independent) { groups.set(outer,branches); continue; }
    for (const branch of branches) {
      const id=ownerId(branch);
      if (!groups.has(id)) groups.set(id,[]);
      groups.get(id).push(branch);
    }
  }
  const units = [];
  for (const [id, branches] of groups) {
    const family = new Set(branches.map(branch => branch.id));
    const roots = branches.filter(branch => !family.has(branch.parentId));
    if (roots.length !== 1) throw Error(`完整枝 ${id} 有 ${roots.length} 个连接根，无法安全交付`);
    const root = roots[0], parent = byId.get(root.parentId);
    let host = parent, hostChild = root;
    const ancestors = new Set();
    while(host && !structuralIds.has(host.stableId) && !ancestors.has(host.id)) {
      ancestors.add(host.id);hostChild=host;host=byId.get(host.parentId);
    }
    if (!host || !structuralIds.has(host.stableId)) throw Error(`完整枝 ${id} 缺少承重挂接枝`);
    const sourceInstance = instances.get(id) || instances.get(root.sourceInstanceId)
      // Older independent snapshots encoded provenance in the owner identity.
      || [...instances.values()].filter(instance => id.endsWith('_' + instance.id))
        .sort((a, b) => b.id.length - a.id.length)[0];
    const sourceAssetId = root.sourceAssetId || sourceInstance?.asset_id
      || branches.flatMap(branch => [...(branch.copiedLeaves || []), ...(branch.copiedOrgans || [])])
        .find(unit => unit.metadata?.sourceAssetId)?.metadata.sourceAssetId;
    const base = authoring.branch_library.find(item => item.id === sourceAssetId);
    let sourceAsset = sourceInstance && base
      ? resolveInstanceAsset({ ...sourceInstance, linked: true }, authoring.branch_library) : base;
    // Old DUPLICATE records may predate sourceAssetId/sourceInstanceId. Their
    // final wood and attached organ geometry is nevertheless preserved. Never
    // guess a current library item from a stale FIN number or a similar name:
    // deliver that already-authored complete snapshot through the variant path.
    // Ordinary instances without a sample still fail; they have no such proof.
    const sourceRecovery = !sourceAsset?.sample && branches.every(branch => branch.copySnapshot)
      ? 'snapshot_geometry' : '';
    if (sourceRecovery) sourceAsset = {
      id: 'LEGACY_SNAPSHOT', revision: 1,
      shape: { branches: [{ id: 'ROOT', parent: '', length: root.length }],
        connector: { position: [0, 0, 0], direction: [0, 1, 0] } },
    };
    if (!sourceAsset?.sample && !sourceRecovery) throw Error(`完整枝 ${id} 无法恢复完整素材工程，请重新指定素材`);
    const shape = sourceInstance ? resolveInstanceShape(sourceInstance, authoring.branch_library) || sourceAsset.shape : sourceAsset.shape;
    const connector = sourceAsset.sample?.authoring?.branch_shape?.connector || shape.connector;
    let transform;
    if (instances.has(id)) {
      transform = instanceMatrix(sourceInstance, shape, graph, asset.settings)
        .multiply(pveGlbMatrix(connector).clone().invert());
    } else {
      const up = root.points[1].clone().sub(root.points[0]).normalize();
      const face = new THREE.Vector3(0, 0, 1);
      if (Math.abs(up.dot(face)) > .999) face.set(0, 1, 0);
      face.addScaledVector(up, -face.dot(up)).normalize();
      const across = new THREE.Vector3().crossVectors(up, face).normalize();
      const sourceLength = shape.branches.find(branch => !branch.parent)?.length || root.length;
      const scale = root.length / sourceLength;
      transform = new THREE.Matrix4().makeBasis(across, up, face).scale(new THREE.Vector3().setScalar(scale));
      const sourceBranch = byStable.get(root.sourceBranchId || (sourceInstance &&
        `${sourceInstance.id}.${shape.branches.find(branch => !branch.parent)?.id}`));
      if (sourceInstance && sourceBranch?.mountMatrix && root.mountMatrix) {
        // Preserve the source connector's roll through a copied carrier frame.
        // Choosing editor-up again would bake a different roll into an otherwise
        // identical copy, preventing reuse when moving to a tilted carrier.
        const sourceTransform = instanceMatrix(sourceInstance, shape, graph, asset.settings)
          .multiply(pveGlbMatrix(connector).clone().invert());
        const copiedTransform = root.mountMatrix.clone().multiply(sourceBranch.mountMatrix.clone().invert()).multiply(sourceTransform);
        transform = new THREE.Matrix4().extractRotation(copiedTransform).scale(new THREE.Vector3().setScalar(scale));
      }
      transform.setPosition(root.points[0]);
    }
    const nested = branches.some(branch => ownerId(branch) !== id);
    // Freezing a source revision or moving the entire unit does not make a new
    // model class. Older independent shapes still need their exact full variant.
    const independentShape = sourceInstance?.linked === false &&
      !equalData(normalizeBranchShape(shape), normalizeBranchShape(sourceAsset.shape));
    const variantRequired = !!sourceRecovery || !!root.copySnapshot || nested || independentShape || internalEdits(id,branches);
    // A structural mount/sculpt operation can move an installed root without
    // rewriting the historical instance frame. A baked variant's pivot belongs
    // to the final root, rather than to that earlier placement record.
    if (variantRequired) transform.setPosition(root.points[0]);
    units.push({ id, root, host, parent, hostT:hostChild.parentT, branches, sourceAsset, sourceInstance, connector,
      transform, variantRequired, nested, sourceRecovery });
  }
  const unitByBranch = new Map();
  units.forEach((unit, index) => unit.branches.forEach(branch => unitByBranch.set(branch.stableId, index)));
  units.forEach(unit => {
    const parentIndex = unitByBranch.get(unit.parent?.stableId);
    if (parentIndex !== undefined) unit.parentUnitId = units[parentIndex].id;
  });
  units.forEach(unit => { unit.leaves = []; unit.organs = []; });
  for (const [items, key] of [[asset.masterPlacements || [], 'leaves'], [asset.treeOrgans || [], 'organs']])
    for (const placement of items) {
      const index = unitByBranch.get(placement.branchStableId);
      if (index !== undefined) units[index][key].push(placement);
    }
  const ownerForBranch = id => {
    const branch = byStable.get(id);
    if (!branch) throw Error('几何缺少所属枝条: ' + id);
    const index = unitByBranch.get(id);
    return index === undefined
      ? { instance_index: -1, source_index: -1, host_branch_id: id }
      : { instance_index: index, source_index: units[index].source_index,
        host_branch_id: units[index].host.stableId };
  };
  return { structuralBranches, units, ownerForBranch, byStable };
}
