// Equal labels do not mean equal surfaces: complete unit sources and carrier
// branches can share M_Bark while retaining different images and physical UVs.
export function collectExportMaterialBuckets(root) {
  const buckets = new Map(), names = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    const material = object.material;
    if (!buckets.has(material)) {
      const category = material?.name || 'Material';
      let name = category, index = 2;
      while (names.has(name)) name = `${category}_${index++}`;
      names.add(name);
      buckets.set(material, { material, name, category, meshes: [] });
    }
    buckets.get(material).meshes.push(object);
  });
  return [...buckets.values()];
}
