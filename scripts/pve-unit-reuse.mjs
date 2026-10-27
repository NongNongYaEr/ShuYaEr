import * as T from 'three';
import { equalPveUnitGeometry } from './pve-final-geometry.mjs';

// Compare in the proposed reusable model frame. Materials, UVs, topology and
// all authored vertex attributes remain subject to the strict payload check.
// Tangents are derived again in the chosen model frame before GLB export.
export function matchesTransformedPveGeometry(group, currentTransform, reference, proposedTransform) {
  const matrix=proposedTransform.clone().invert().multiply(currentTransform),copy=new T.Group();
  try {
    for(const mesh of group.children)copy.add(new T.Mesh(mesh.geometry.clone().applyMatrix4(matrix),mesh.material));
    return equalPveUnitGeometry(copy,reference,{derivedTangents:true});
  } finally {copy.children.forEach(mesh=>mesh.geometry.dispose());}
}

export function fitPveUnitPair(reference, unit) {
  if(reference.branches.length!==unit.branches.length||reference.branches.some((b,i)=>b.points.length!==unit.branches[i].points.length))return null;
  const fit=fitCompleteUnitTransform(reference.branches.flatMap(b=>b.points),unit.branches.flatMap(b=>b.points));
  return fit?.matrix.clone().multiply(reference.transform);
}

// Prove a single proper similarity for ALL branch points, not just the root
// tangent. A bent or mirrored historical copy must keep its complete variant.
export function fitCompleteUnitTransform(source, target, tolerance=2e-6) {
  if(source.length!==target.length||source.length<3)return null;
  if([...source,...target].some(point=>!point?.isVector3||!point.toArray().every(Number.isFinite)))return null;
  const origin=source[0];let end=1,side=1;
  for(let i=1;i<source.length;i++)if(source[i].distanceToSquared(origin)>source[end].distanceToSquared(origin))end=i;
  const length=source[end].distanceTo(origin);if(length<1e-8)return null;
  const axis=source[end].clone().sub(origin).normalize(),cross=i=>new T.Vector3().crossVectors(axis,source[i].clone().sub(origin)).lengthSq();
  for(let i=1;i<source.length;i++)if(cross(i)>cross(side))side=i;
  if(cross(side)<length*length*1e-12)return null;
  const basis=points=>{const x=points[end].clone().sub(points[0]).normalize(),z=x.clone().cross(points[side].clone().sub(points[0])).normalize();return new T.Matrix4().makeBasis(x,z.clone().cross(x),z);};
  const scale=target[end].distanceTo(target[0])/length;if(!(scale>1e-8))return null;
  const matrix=new T.Matrix4().makeTranslation(...target[0].toArray()).multiply(basis(target)).scale(new T.Vector3().setScalar(scale)).multiply(basis(source).invert()).multiply(new T.Matrix4().makeTranslation(...origin.clone().negate().toArray()));
  if(source.some((p,i)=>p.clone().applyMatrix4(matrix).distanceTo(target[i])>tolerance*Math.max(1,scale)))return null;
  return {matrix,scale};
}

