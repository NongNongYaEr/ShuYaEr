import * as THREE from './vendor/three.module.min.js';

export const supportsHorizontalRootPlane=branch=>Boolean(branch&&(branch.parentId==null||branch.parentId<0));

// Stop before the first authored circle. Its orientation and every higher
// control stay exact. The recipe stores intent, not a tessellation-dependent mesh.
export function trunkRootPlaneSpan(form){
  return Math.min(.18,...(form?.sections||[]).filter(s=>s.t>1e-7).map(s=>s.t));
}

export function createTrunkRootPlaneAlignment(branch,form){
  if(form?.root_plane!=='HORIZONTAL'||!supportsHorizontalRootPlane(branch))return null;
  const end=trunkRootPlaneSpan(form),identity=new THREE.Quaternion(),rotation=new THREE.Quaternion();let full=null;
  return (t,frame)=>{
    if(t>=end)return null;
    if(!full){const up=new THREE.Vector3(0,0,frame.tangent.z<0?-1:1);full=new THREE.Quaternion().setFromUnitVectors(frame.tangent,up);}
    const u=Math.max(0,Math.min(1,t/end)),weight=1-u*u*(3-2*u);
    rotation.copy(identity).slerp(full,weight);
    return {tangent:frame.tangent.clone().applyQuaternion(rotation),x:frame.x.clone().applyQuaternion(rotation),y:frame.y.clone().applyQuaternion(rotation)};
  };
}
