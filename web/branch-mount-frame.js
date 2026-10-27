// A bent carrier has a different rigid frame at each segment. Keep roll as well
import {axisTimes,axisSegment,axisTime,sampleAxis,tangentAxis} from './branch-axis.js';
import * as THREE from './vendor/three.module.min.js';
// as tangent direction when installing complete samples on the evaluated curve.
export function branchMountAt(branch, t) {
  // New protected support deformation includes continuously varying roll.
  // A midpoint frame would rotate an attached unit by the wrong twist angle.
  // Invalidate the runtime binding when another evaluator replaces its curves
  // or frames, so older point/scale operations retain their existing behavior.
  const binding = branch?.mountFrameBinding;
  if (binding && binding.points === branch.points && binding.frames === branch.mountFrames) return binding.at(t);
  const frames = branch?.mountFrames;
  if(frames?.length===branch?.points?.length-1&&axisTimes(branch.points))return frames[axisSegment(branch.points,t).index];
  return frames?.[Math.min(frames.length - 1, Math.floor(Math.max(0, Math.min(1, t)) * frames.length))] || branch?.mountMatrix;
}

// Keep the continuously sampled frame valid when another evaluator replaces
// its points. Rigid placements compose one matrix without chaining old models.
export function transportMountFrames(before,points,rigid=null){
  if(!before.mountFrames?.length&&!before.mountFrameBinding)return rigid&&before.mountMatrix?{mountMatrix:rigid.clone().multiply(before.mountMatrix)}:null;
  const binding=before.mountFrameBinding,valid=binding?.points===before.points&&binding?.frames===before.mountFrames;
  let at,sourceAt,rigidMatrix;
  if(rigid){sourceAt=valid&&binding.sourceAt?binding.sourceAt:t=>branchMountAt(before,t)?.clone()||new THREE.Matrix4();rigidMatrix=rigid.clone().multiply(valid&&binding.rigidMatrix?binding.rigidMatrix:new THREE.Matrix4());at=t=>rigidMatrix.clone().multiply(sourceAt(t));}
  else at=t=>{const q=new THREE.Quaternion().setFromUnitVectors(tangentAxis(before.points,t),tangentAxis(points,t)),m=new THREE.Matrix4().makeRotationFromQuaternion(q);m.setPosition(sampleAxis(points,t).sub(sampleAxis(before.points,t).applyQuaternion(q)));return m.multiply(branchMountAt(before,t)||new THREE.Matrix4());};
  const frames=points.slice(1).map((_,i)=>at((axisTime(points,i)+axisTime(points,i+1))*.5));
  return {mountFrames:frames,mountFrameBinding:{points,frames,at,...(rigid?{sourceAt,rigidMatrix}:{})}};
}
