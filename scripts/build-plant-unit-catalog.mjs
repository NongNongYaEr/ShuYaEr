import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TREE_SPECIES } from '../web/tree-species-library.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(path.join(root, 'BlenderAsset'), { recursive: true }).filter(p => p.endsWith('.blend'));
const entries = [];
for (const file of fs.readdirSync(path.join(root, 'web/assets/plants')).filter(p => p.endsWith('.json'))) {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'web/assets/plants', file), 'utf8'));
  const spec = TREE_SPECIES[raw.species], name = spec?.name || raw.name || raw.id;
  const matching = files.filter(p => p.endsWith(`${name}_成品单元.blend`)).sort().at(-1);
  const special = { 'ivy-v1.json': 'Ivy_Builtin_v1/Ivy_Units_2K.blend', 'bougainvillea-v1.json': 'Bougainvillea_Unified_v1/Bougainvillea_Unified_4K.blend',
    'scene-grass-v1.json': 'ScenePlants_Builtin_v1/Grass/Grass_Units.blend', 'scene-broadleaf-v1.json': 'ScenePlants_Builtin_v1/Broadleaf/Broadleaf_Units.blend', 'scene-flower-v1.json': 'ScenePlants_Builtin_v1/YellowFlower/YellowFlower_Units.blend' }[file];
  entries.push({ id: `builtin:${file.replace('.json', '')}`, name, species: raw.species || '', file,
    count: (raw.leaf_meshes || raw.units || []).length + (raw.organ_meshes || []).length + (raw.flower ? 1 : 0),
    leaf_size: spec?.leaf || .1, source: matching || special ? 'BlenderAsset/' + (matching || special).replaceAll('\\', '/') : '软件配套素材 / ' + file });
}
fs.writeFileSync(path.join(root, 'web/assets/plant-unit-catalog.json'), JSON.stringify(entries, null, 2));
console.log(`Catalog: ${entries.length} plant packs, ${entries.reduce((n, e) => n + e.count, 0)} units`);
