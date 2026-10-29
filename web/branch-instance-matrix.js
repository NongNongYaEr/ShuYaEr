import {cloneAxis} from './branch-axis.js';
import * as THREE from './vendor/three.module.min.js';
import { branchMountAt } from './branch-mount-frame.js';
import {trunkInstanceWorldMatrix} from './imported-trunk-attachments.js';

// Shared by viewport instances, local sample editing and the existing PVE exporter.
export function completeInstanceMatrix(instance, shape, parent, settings, frame) {
  const surface=trunkInstanceWorldMatrix(instance,parent),mount = surface||branchMountAt(parent, instance.attach), inverse = mount?.clone().invert();
  const sourceParent = mount&&!surface ? {...parent, points: cloneAxis(parent.points,p => p.clone().applyMatrix4(inverse))} : parent;
  const f = frame(instance, sourceParent, settings);
  if(surface){f.position.applyMatrix4(inverse);f.direction.transformDirection(inverse);}
  const direction = f.direction.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...shape.connector.direction).normalize(), direction);
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(direction, instance.roll * Math.PI / 180));
  const result = new THREE.Matrix4().compose(f.position,q,new THREE.Vector3().setScalar(f.scale))
    .multiply(new THREE.Matrix4().makeTranslation(...shape.connector.position.map(v => -v)));
  return mount ? result.premultiply(mount) : result;
}
