import * as THREE from 'three';

// Only isolated branch assets use a PVE attachment frame. Surface vegetation and
// whole-tree scenes retain their placement in the generator's coordinate system.
export function pveBranchConnector(authoring) {
  if (authoring?.recipe?.tags?.includes('WHOLE_PLANT') || authoring?.vine || authoring?.surface_growth?.enabled) return null;
  return authoring?.branch_shape?.branches?.length ? authoring.branch_shape.connector : null;
}

export function pveGlbMatrix(connector) {
  const valid = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  if (!valid(connector?.position) || !valid(connector?.direction)) throw new Error('枝条连接点或方向无效，无法导出 PVE 素材');
  const origin = new THREE.Vector3(...connector.position);
  const growth = new THREE.Vector3(...connector.direction);
  if (growth.lengthSq() < 1e-12) throw new Error('枝条连接方向长度为零，无法导出 PVE 素材');
  growth.normalize();
  // The connector has no roll field. Preserve the projected editor-up direction
  // as the face reference, falling back to editor +Y for upright connectors.
  const face = new THREE.Vector3(0, 0, 1);
  if (Math.abs(growth.dot(face)) > 0.999) face.set(0, 1, 0);
  face.addScaledVector(growth, -face.dot(growth)).normalize();
  const across = new THREE.Vector3().crossVectors(growth, face).normalize();
  // glTF (X,Y,Z) -> UE (X,Z,Y). Thus glTF +Y is PVE growth +Z,
  // glTF +Z is PVE face +Y. This is a proper rotation, without mirroring.
  const matrix = new THREE.Matrix4().makeBasis(across, growth, face).transpose();
  return matrix.multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
}
