import * as THREE from './vendor/three.module.min.js';
import {axisTimes,cloneAxis} from './branch-axis.js';
import {resamplePoints,tangentOnPolyline} from './branch-sweep-kernel.js';
export function deriveLodBranches(masterBranches, settings, lod) {
  const maximumOrder = Math.max(0, settings.branch_levels + lod.maxLevelOffset - 1);
  // A prefab is an authored assembly, independent of the destination tree's
  // procedural tier count. Keep its carriers and complete unit descendants;
  // the normal segment/foliage LOD still controls rendering detail.
  const byId=new Map(masterBranches.map(b=>[b.id,b])),prefabFamily=new Map();
  function inPrefab(branch){if(prefabFamily.has(branch.id))return prefabFamily.get(branch.id);const path=[],seen=new Set();let current=branch,inside=false;while(current&&!seen.has(current.id)){if(current.prefabCarrier||prefabFamily.get(current.id)===true){inside=true;break;}if(prefabFamily.get(current.id)===false)break;seen.add(current.id);path.push(current.id);current=byId.get(current.parentId);}for(const id of path)prefabFamily.set(id,inside);return inside;}
  const activeIds = new Set(masterBranches.filter((branch) => branch.order <= maximumOrder||inPrefab(branch)).map((branch) => branch.id));
  return masterBranches.filter((branch) => activeIds.has(branch.id)).map((branch) => {
    const segmentCount = Math.max(5, Math.round((branch.points.length - 1) * lod.segment));
    const legacy=branch.legacyRigidGeometry;
    let collarQuaternion=branch.collarQuaternion;
    if(legacy?.collarParent){
      const parent=legacy.collarParent,segments=Math.max(5,Math.round((parent.points.length-1)*lod.segment));
      const points=parent.surfaceNormals ? parent.points : resamplePoints(parent.points,segments+1);
      collarQuaternion=new THREE.Quaternion();legacy.matrix.decompose(new THREE.Vector3(),collarQuaternion,new THREE.Vector3());
      collarQuaternion.multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),tangentOnPolyline(points,.7))).normalize();
    }
    return { ...branch, points: branch.surfaceNormals ? cloneAxis(branch.points) : resamplePoints(branch.points, segmentCount + 1),
      ...(axisTimes(branch.points)?{axisLod:lod.segment}:{}),
      ...(legacy ? {legacyRigidGeometry:{...legacy,baseline:{...legacy.baseline,points:legacy.baseline.surfaceNormals
        ? legacy.baseline.points.map(p=>p.clone()) : resamplePoints(legacy.baseline.points,segmentCount+1)}}} : {}),
      ...(collarQuaternion ? {collarQuaternion} : {}),children: branch.children.filter((id) => activeIds.has(id)) };
  });
}
