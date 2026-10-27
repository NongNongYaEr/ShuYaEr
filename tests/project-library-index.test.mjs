import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureParent = path.join(projectRoot, '.runtime');
fs.mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = fs.mkdtempSync(path.join(fixtureParent, 'branchforge-project-index-'));
const write = (relative, value) => { const file = path.join(fixtureRoot, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
write('package.json', { type: 'module' });
write('scripts/index-project-library.mjs', fs.readFileSync(path.join(projectRoot, 'scripts/index-project-library.mjs'), 'utf8'));
write('web/project-library-data.js', fs.readFileSync(path.join(projectRoot, 'web/project-library-data.js'), 'utf8'));
write('web/assets/project-species.json', { CAMPHOR: { name: '香樟', category: 'TREE' }, CELTIS: { name: '朴树', category: 'TREE' }, IVY: { name: '常春藤', category: 'VINE' } });
const make = (name, species, ids = [], tags = ['WHOLE_PLANT']) => ({ settings: { object_name: name }, authoring: { recipe: { tags: [species, ...tags] }, branch_instances: ids.map(asset_id => ({ asset_id })), branch_library: [] } });
write('初始样本/香樟/香樟_整树V1.branch.json', make('香樟_整树V1', 'CAMPHOR', ['OLD_SIDE']));
write('初始样本/香樟/香樟_整树V2.branch.json', make('香樟_整树V2', 'CAMPHOR', ['OLD_SIDE', 'FINISHED_CAMPHOR_SIDE_MATURE_V1']));
const current = make('错误的外层旧项目', 'CELTIS', ['OLD_SIDE']);
current.workspaces = { active: 'TREE', tree: make('香樟_整树V3', 'CAMPHOR', ['FINISHED_CAMPHOR_SIDE_MATURE_V1']) };
write('初始样本/香樟/香樟_整树V3.branch.json', current);
write('初始样本/香樟/香樟_整树V99_草稿.branch.json', make('香樟_整树V99_草稿', 'CAMPHOR'));
write('初始样本/香樟/香樟_整树_骨架V98.branch.json', make('香樟_整树_占位叶', 'CAMPHOR'));
write('初始样本/香樟/整树预览V3/正面.png', 'fixture image');
write('初始样本/朴树/朴树_侧枝V1.branch.json', make('朴树_侧枝V1', 'CELTIS', [], ['SIDE', 'FINISHED_UNUSED_TAG']));
const ivy = make('错误外层', 'CAMPHOR');
ivy.workspaces = { active: 'VINE', vine: make('常春藤', 'IVY', [], []) };
write('初始样本/常春藤/常春藤.branch.json', ivy);
write('初始样本/broken.branch.json', '{');
const run = () => JSON.parse(execFileSync(process.execPath, [path.join(fixtureRoot, 'scripts/index-project-library.mjs')], { cwd: path.dirname(projectRoot), encoding: 'utf8' }));
const read = () => JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'assets/project-library/catalog.json'), 'utf8'));

try {
  await test('index resolves its repository from the module and uses safe relative paths', () => {
    const summary = run(), catalog = read();
    assert.equal(catalog.version, 2);
    assert.equal(summary.scanned, 7);
    assert.equal(summary.parsed, 7);
    assert.equal(catalog.errors.length, 1);
    assert.equal(catalog.errors[0].path, '初始样本/broken.branch.json');
    assert.equal(new Set(catalog.items.map(item => item.id)).size, 7);
    for (const item of catalog.items) {
      assert.match(item.id, /^[a-f0-9]{24}$/);
      for (const field of ['path', 'previewPath']) if (item[field]) {
        assert.equal(path.isAbsolute(item[field]), false);
        assert.equal(item[field].includes('\\'), false);
        assert.equal(item[field].split('/').includes('..'), false);
        assert.ok(fs.existsSync(path.join(fixtureRoot, item[field])));
      }
    }
  });
  await test('binding and classification reflect the active workspace and exclude draft/placeholder recommendations', () => {
    const items = read().items, find = fragment => items.find(item => item.path.includes(fragment));
    assert.equal(find('整树V1.').binding, 'legacy');
    assert.equal(find('整树V2.').binding, 'mixed');
    assert.equal(find('整树V3.').binding, 'new');
    assert.equal(find('整树V3.').species, 'CAMPHOR');
    assert.equal(find('整树V3.').name, '香樟_整树V3');
    assert.equal(find('整树V3.').previewPath, '初始样本/香樟/整树预览V3/正面.png');
    assert.equal(find('朴树_侧枝').binding, 'none');
    assert.equal(find('朴树_侧枝').kind, 'BRANCH');
    assert.equal(find('常春藤.branch').kind, 'VINE');
    assert.equal(find('常春藤.branch').species, 'IVY');
    assert.deepEqual(items.filter(item => item.recommended).map(item => item.name), ['香樟_整树V3']);
  });
  await test('repeat scan reuses metadata and reparses only a changed project', () => {
    assert.equal(run().cached, 7);
    const changed = '初始样本/朴树/朴树_侧枝V1.branch.json';
    const doc = make('朴树_已修改的侧枝V1', 'CELTIS', ['FINISHED_CELTIS_TIP_YOUNG_V1'], ['TIP']);
    write(changed, doc);
    const summary = run();
    assert.equal(summary.cached, 6);
    assert.equal(summary.parsed, 1);
    const item = read().items.find(item => item.path === changed);
    assert.equal(item.binding, 'new');
    assert.equal(item.name, doc.settings.object_name);
  });
} finally {
  // The random fixture directory is the only deletion target.
  const resolved = path.resolve(fixtureRoot), parent = path.resolve(fixtureParent);
  if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('branchforge-project-index-')) throw new Error('Unexpected fixture directory');
  fs.rmSync(resolved, { recursive: true, force: true });
}

