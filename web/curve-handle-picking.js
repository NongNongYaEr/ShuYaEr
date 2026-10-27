import * as THREE from 'three';

// CSS pixels, independent of device pixel ratio, tree size and camera distance.
export function layoutCurveHandles(root, camera, width, height, selected = -1,group=null) {
  if (!root.visible || width <= 0 || height <= 0) return [];
  camera.updateMatrixWorld();root.updateWorldMatrix(true,false);
  const records=[],world=new THREE.Vector3(),view=new THREE.Vector3(),scale=new THREE.Vector3();
  root.getWorldScale(scale);
  for(const object of root.children){
    const kind=object.userData.category;
    if(!['control_point','tangent_handle'].includes(kind))continue;
    world.copy(object.position).applyMatrix4(root.matrixWorld);
    view.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const p=world.clone().project(camera),valid=view.z<0 && p.z>=-1 && p.z<=1;
    object.visible=valid;
    if(!valid)continue;
    const radius=kind==='tangent_handle'?4.5:object.userData.point_index===selected?7.5:group?.has(object.userData.point_index)?7:5.5;
    const worldPixel=2*(camera.isPerspectiveCamera?-view.z:1)/(camera.projectionMatrix.elements[5]*height);
    const geometryRadius=object.geometry.parameters.radius;
    object.scale.setScalar(radius*worldPixel/(geometryRadius*Math.max(1e-10,scale.x)));
    records.push({object,x:(p.x+1)*width/2,y:(1-p.y)*height/2,depth:-view.z,radius,
      hitRadius:kind==='tangent_handle'?9:13});
  }
  return records;
}

export function pickCurveHandle(records,x,y) {
  const hits=records.map(r=>({...r,distance:Math.hypot(r.x-x,r.y-y)})).filter(r=>r.distance<=r.hitRadius);
  // A visible dot beats another handle's expanded hit area. Inside overlapping
  // dots choose the closest screen center; stable tie-breaks avoid flickering.
  hits.sort((a,b)=>Number(b.distance<=b.radius+1)-Number(a.distance<=a.radius+1)
    || a.distance-b.distance
    || Number(a.object.userData.category==='tangent_handle')-Number(b.object.userData.category==='tangent_handle')
    || a.depth-b.depth);
  return hits[0] || null;
}
