import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { activeProject, projectBinding } from '../web/project-library-data.js';

// File metadata only: project files and the PVE document contract are untouched.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'assets/project-library/catalog.json');
const speciesMap = JSON.parse(fs.readFileSync(path.join(root, 'web/assets/project-species.json'), 'utf8').replace(/^\uFEFF/, ''));
const force = process.argv.includes('--force');
const slash = value => value.replaceAll('\\', '/');
const draft = value => /草稿|(?:^|[\/_ -])draft(?:[\/_ .-]|$)|待验收/i.test(value);
function walk(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)]);
}
function versionOf(value) {
  const matches = [...value.matchAll(/[Vv](\d+)(?:[^\d]|$)/g)].map(match => +match[1]);
  return matches.length ? Math.max(...matches) : 0;
}
const files = ['初始样本', 'web/previews'].flatMap(folder => walk(path.join(root, folder)));
const images = files.filter(file => /\.(png|jpe?g|webp)$/i.test(file));
let previous = { items: [] };
try { previous = JSON.parse(fs.readFileSync(destination, 'utf8')); } catch {}
const cache = new Map((previous.items || []).map(item => [item.path, item]));
const items = [], errors = [];
let parsed = 0, cached = 0;
function choosePreview(file, item) {
  const folder = path.dirname(file) + path.sep;
  if (slash(file).includes('/全植物新次枝装配V2/') && fs.existsSync(folder + '软件重载验收.json')) {
    const check = JSON.parse(fs.readFileSync(folder + '软件重载验收.json', 'utf8'));
    if (check.passed && fs.existsSync(folder + '正面.png')) return slash(path.relative(root, folder + '正面.png'));
  }
  const basename = path.basename(file, '.branch.json');
  const candidates = images.filter(image => image.startsWith(folder) && !/参考|reference|texture|贴图|假色|枝架|UV|atlas/i.test(path.basename(image)) && !image.includes(path.sep + 'textures' + path.sep));
  const sameDraft = candidates.filter(image => draft(image) === draft(file));
  const matching = sameDraft.filter(image => path.basename(image, path.extname(image)) === basename || (item.version ? versionOf(slash(path.relative(path.dirname(file), image))) === item.version : (/结构预览|正面|front/i.test(image) || (item.kind === 'TREE' && path.basename(image, path.extname(image)) === '成品预览'))));
  matching.sort((a, b) => {
    const score = image => (/正面|front/i.test(path.basename(image)) ? 10 : 0) + (path.basename(image, path.extname(image)) === basename ? 20 : 0) - (/局部|closeup|细节/i.test(image) ? 5 : 0);
    return score(b) - score(a) || a.localeCompare(b);
  });
  return matching[0] ? slash(path.relative(root, matching[0])) : '';
}
function inspect(file, stats, relative) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const project = activeProject(doc);
  const author = project.authoring || {}, tags = author.recipe?.tags || [];
  const name = project.settings?.object_name || author.recipe?.name || path.basename(file, '.branch.json');
  const identity = name + ' ' + relative;
  const species = Object.keys(speciesMap).find(id => tags.includes(id)) || Object.keys(speciesMap).find(id => identity.includes(speciesMap[id].name)) || (/绿枯混合草丛/.test(identity) ? 'SCENE_GRASS' : /大叶丛生/.test(identity) ? 'SCENE_BROADLEAF' : /小黄花长枝/.test(identity) ? 'SCENE_FLOWER' : '');
  const active = doc.workspaces?.active;
  const whole = tags.includes('WHOLE_PLANT') || /整树|成熟整|修剪球|连续绿篱|整丛|盆栽/.test(identity);
  let kind = whole ? 'TREE' : (active === 'VINE' || author.vine?.enabled) ? 'VINE' : active === 'TREE' ? 'TREE' : 'BRANCH';
  const instances = author.branch_instances || [];
  return { id: crypto.createHash('sha256').update(relative).digest('hex').slice(0, 24), name, path: relative, species,
    speciesName: speciesMap[species]?.name || '未分类植物', kind, bytes: stats.size, mtimeMs: stats.mtimeMs,
    version: versionOf(path.basename(file) + ' ' + name), binding: projectBinding(doc),
    previewPath: '', recommended: false, instanceCount: instances.length, libraryCount: author.branch_library?.length || 0,
    draft: draft(relative), activeWorkspace: active || null };
}
for (const file of files.filter(file => file.endsWith('.branch.json'))) {
  const relative = slash(path.relative(root, file));
  try {
    const stats = fs.statSync(file), old = cache.get(relative);
    let item;
    if (!force && previous.version === 2 && old && old.bytes === stats.size && old.mtimeMs === stats.mtimeMs) { item = { ...old, recommended: false }; cached++; }
    else { item = inspect(file, stats, relative); parsed++; }
    item.previewPath = choosePreview(file, item);
    item.placeholder = /骨架|占位叶|结构预览/.test(item.name + ' ' + item.path);
    items.push(item);
  } catch (error) { errors.push({ path: relative, message: error.message }); }
}
// One original, non-draft whole-plant candidate per species. This is a creation
// shortcut to an existing project, not a claim of fresh visual acceptance.
for (const species of Object.keys(speciesMap)) {
  const candidates = items.filter(item => item.species === species && item.kind === 'TREE' && !item.draft && !item.placeholder);
  candidates.sort((a, b) => b.version - a.version || Number(a.path.startsWith('web/')) - Number(b.path.startsWith('web/')) || Number(Boolean(b.previewPath)) - Number(Boolean(a.previewPath)) || a.path.localeCompare(b.path));
  if (candidates[0]) candidates[0].recommended = true;
}
items.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination + '.tmp', JSON.stringify({ version: 2, scannedAt: new Date().toISOString(), items, errors }, null, 2));
fs.renameSync(destination + '.tmp', destination);
const countBy = key => items.reduce((counts, item) => (counts[item[key]] = (counts[item[key]] || 0) + 1, counts), {});
console.log(JSON.stringify({ scanned: items.length, parsed, cached, kinds: countBy('kind'), bindings: countBy('binding'), recommended: items.filter(item => item.recommended).length, previews: items.filter(item => item.previewPath).length, errors, catalog: destination }, null, 2));




