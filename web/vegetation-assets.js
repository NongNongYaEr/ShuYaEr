import { normalizeVegetationUnit } from './vegetation-data.js';
import { normalizeLeafMaterial } from './leaf-material-data.js';
import { loadBougainvilleaAssets } from './builtin-plant-assets.js';

const pending = new Map();
export async function loadVegetationAssets(kind) {
  if (!['GRASS','BROADLEAF','FLOWER','SHRUB'].includes(kind)) return null;
  if (kind === 'SHRUB') {
    const pack = await loadBougainvilleaAssets();
    return {id:'BOUGAINVILLEA_LEAVES_V1', kind, units:pack.leaf_meshes.map(normalizeVegetationUnit), material:normalizeLeafMaterial(pack.leaf_material)};
  }
  if (!pending.has(kind)) pending.set(kind, (async () => {
    const response = await fetch(new URL(`./assets/plants/scene-${kind.toLowerCase()}-v1.json`, import.meta.url));
    if (!response.ok) throw Error('内置场景植物素材读取失败，请检查 assets/plants 文件夹');
    const pack = await response.json(), units = (pack.units || []).map(normalizeVegetationUnit), material = normalizeLeafMaterial(pack.material);
    if (pack.id !== `SCENE_${kind}_V1` || units.length !== (kind === 'FLOWER' ? 1 : 3) || units.some(u => !u?.geometry.uv) || !material.color) throw Error('内置场景植物素材不完整');
    if (kind === 'GRASS' && (!units.some(u=>u.variant==='DRY') || !units.some(u=>u.variant==='GREEN'))) throw Error('草叶素材缺少绿草或枯草分类');
    return {...pack, units, material};
  })().catch(error => {pending.delete(kind);throw error;}));
  return structuredClone(await pending.get(kind));
}

export function needsVegetationAssets(species, flower=false) {
  return flower ? !species.flower_preset && !species.flower_source && !species.flower_material.color && !species.flower_material.normal
    : !species.asset_preset && !species.sources.length && !species.material.color && !species.material.normal;
}

export function applyVegetationAssets(species, pack, flower=false) {
  if (flower) {
    species.flower_source = structuredClone(pack.units[0]);
    species.flower_material = structuredClone(pack.material);
    species.flower_preset = pack.id;
  } else {
    species.sources = structuredClone(pack.units);
    species.source = species.sources[0];
    species.material = structuredClone(pack.material);
    species.asset_preset = pack.id;
  }
}
