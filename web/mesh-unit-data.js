import * as THREE from 'three';
import {completeInstanceMatrix} from './branch-instance-matrix.js';
import {branchInstanceFrame} from './branch-kernel.js';
import {evaluateTrunkAttachment} from './imported-trunk-attachments.js';

export function meshUnitMountMatrix(instance,source,parent,asset,authoring) {
  let carrier = parent;
  if (instance.trunk_anchor && !parent.trunkAttachmentEvaluator && !parent.trunkAttachments?.has(instance.id)) {
    const data = authoring.imported_trunks;
    const mount = data?.mounts.find(item=>item.id===instance.trunk_anchor.mount_id);
    const trunk = data?.assets.find(item=>item.id===mount?.asset_id);
    if (!trunk || !Object.values(mount.guide_map).includes(instance.parent)) throw Error('装配实例的导入树干挂点已失效。');
    carrier = {...parent,trunkAttachmentEvaluator:anchor=>evaluateTrunkAttachment(trunk,mount,asset.masterBranches,anchor)};
  }
  return completeInstanceMatrix({...instance,scale:1,variation:0},source,carrier,asset.settings,branchInstanceFrame);
}

export function composeMeshUnitPose(instance,source,mount) {
  const center = new THREE.Vector3(...source.connector.position);
  const offset = new THREE.Vector3(...(instance.offset||[0,0,0])).add(center);
  const rotation = new THREE.Quaternion(...(instance.rotation||[0,0,0,1]));
  const scale = new THREE.Vector3().setScalar(instance.scale);
  return mount.clone()
    .multiply(new THREE.Matrix4().compose(offset,rotation,scale))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z));
}

export function meshUnitMatrix(instance,source,parent,asset,authoring) {
  return composeMeshUnitPose(instance,source,meshUnitMountMatrix(instance,source,parent,asset,authoring));
}

export function resolveMeshUnitPlacements(authoring,asset,{strict=true,skipMissingCarrier}={}) {
  const data = authoring?.mesh_units;
  if (!data?.instances.length) return [];
  const parents = new Map(asset.masterBranches.map(branch=>[branch.stableId,branch]));
  const sources = new Map(data.assets.map(source=>[source.id,source]));
  return data.instances.flatMap(instance=>{
    const source = sources.get(instance.asset_id), parent = parents.get(instance.parent);
    if (source && !parent && skipMissingCarrier?.(instance)) return [];
    if (!source || !parent) {
      if (strict) throw Error(`装配实例 ${source?.name||instance.id} 缺少原模型或母枝，请重新挂接。`);
      return [];
    }
    try { return [{instance,source,parent,matrix:meshUnitMatrix(instance,source,parent,asset,authoring)}]; }
    catch (error) { if (strict) throw error; return []; }
  });
}
