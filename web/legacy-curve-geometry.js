import * as THREE from './vendor/three.module.min.js';
import {axisTime,sampleAxis} from './branch-axis.js';
import {transformLegacyRigidGeometry} from './legacy-unit-placement.js';

// An old complete-copy sweep is a rest mesh plus a rigid placement. A changed
// curve must either transport that placement or stop using the old rest mesh.
// Test all samples before treating a saved sculpt delta as a rigid movement.
export function legacyGeometryForCurve(before,after,preferred=null){
  if(!before.legacyRigidGeometry&&!before.copySnapshot)return after.legacyRigidGeometry;
  for(const key of ['startRadius','endRadius','radiusProfile','sections','radiusEdits'])if(before[key]!==after[key]&&JSON.stringify(before[key])!==JSON.stringify(after[key]))return undefined;
  const source=after.points.map((_,i)=>sampleAxis(before.points,axisTime(after.points,i))),target=after.points;
  const matches=m=>source.every((p,i)=>p.clone().applyMatrix4(m).distanceToSquared(target[i])<1e-14);
  if(preferred&&matches(preferred))return transformLegacyRigidGeometry(before,preferred);
  if(source.length<2)return undefined;
  let along=1;for(let i=2;i<source.length;i++)if(source[i].distanceToSquared(source[0])>source[along].distanceToSquared(source[0]))along=i;
  const a=source[along].clone().sub(source[0]),b=target[along].clone().sub(target[0]);if(a.lengthSq()<1e-16||b.lengthSq()<1e-16)return undefined;
  let cross=null,crossTarget=null,best=0;
  for(let i=1;i<source.length;i++){const n=new THREE.Vector3().crossVectors(a,source[i].clone().sub(source[0]));if(n.lengthSq()>best){best=n.lengthSq();cross=n;crossTarget=new THREE.Vector3().crossVectors(b,target[i].clone().sub(target[0]));}}
  let rotation;
  if(best>1e-14*a.lengthSq()&&crossTarget.lengthSq()>1e-16){const x=a.normalize(),z=cross.normalize(),y=new THREE.Vector3().crossVectors(z,x),u=b.normalize(),w=crossTarget.normalize(),v=new THREE.Vector3().crossVectors(w,u);rotation=new THREE.Matrix4().makeBasis(u,v,w).multiply(new THREE.Matrix4().makeBasis(x,y,z).invert());}
  else rotation=new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(a.normalize(),b.normalize()));
  rotation.setPosition(target[0].clone().sub(source[0].clone().applyMatrix4(rotation)));
  return matches(rotation)?transformLegacyRigidGeometry(before,rotation):undefined;
}
