export const BASE_BRANCH_BARK_SLOT = 'M_UnitBark';
export const BASE_BRANCH_FOLIAGE_SLOT = 'M_UnitFoliage';
export const BASE_BRANCH_SHARED_SLOT = 'M_UnitAtlas';

export function baseBranchAtlasRole(mesh, material = mesh.material) {
  if (!material?.userData?.base_branch_atlas) return null;
  if (mesh.userData.base_branch_mesh) return 'bark';
  if (mesh.userData.base_branch_unit_id) return 'foliage';
  return material.userData.base_branch_atlas_role || null;
}

export function baseBranchAtlasMerge(mesh, material = mesh.material) {
  return material?.sampleLeafMaterial?.merge_unit_materials === true && !!baseBranchAtlasRole(mesh, material);
}

export function markBaseBranchAtlasMaterial(material, role) {
  material.userData.base_branch_atlas_role = role;
  material.name = role === 'shared' ? BASE_BRANCH_SHARED_SLOT : role === 'bark' ? BASE_BRANCH_BARK_SLOT : BASE_BRANCH_FOLIAGE_SLOT;
  if (role === 'bark' || role === 'shared') {
    material.alphaTest = 0;
    material.transparent = false;
    material.opacity = 1;
  }
  return material;
}

export function createBaseBranchAtlasMaterials({ mergeUnitMaterials = true } = {}) {
  const slots = { bark: new Map(), foliage: new Map(), shared: new Map() };
  function forMesh(mesh, material) {
    const role = mergeUnitMaterials && baseBranchAtlasMerge(mesh, material) ? 'shared' : baseBranchAtlasRole(mesh, material);
    if (!role || material.userData.base_branch_atlas_role === role) return material;
    const cache = slots[role];
    if (!cache.has(material)) {
      const copy = markBaseBranchAtlasMaterial(material.clone(), role);
      copy.sampleLeafMaterial = material.sampleLeafMaterial;
      cache.set(material, copy);
    }
    return cache.get(material);
  }
  function dispose() {
    for (const cache of Object.values(slots))
      for (const material of cache.values()) material.dispose();
  }
  return { forMesh, dispose };
}
