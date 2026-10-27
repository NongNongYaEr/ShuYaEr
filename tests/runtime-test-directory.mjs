import fs from 'node:fs';
import path from 'node:path';

const prefixes = new Set(['pve-final-graph-', 'trunk-form-pve-', 'pve-bark-', 'pve-bark-variant-', 'pve-six-unit-classes-']);

// Large export fixtures are disposable. Keep only small reports from three runs.
export function createRuntimeTestDirectory(context, prefix) {
  if (!prefixes.has(prefix) || typeof context?.after !== 'function') throw new Error('An export test context and approved prefix are required');
  const runtime = path.resolve('.runtime');
  fs.mkdirSync(runtime, {recursive: true});
  const boundary = fs.realpathSync(runtime);
  const folder = fs.mkdtempSync(path.join(boundary, prefix));
  const name = path.basename(folder);
  const recordsRoot = path.join(boundary, 'test-records');
  const records = path.join(recordsRoot, name);
  const removeOwned = (target, parent) => {
    if (fs.lstatSync(target).isSymbolicLink() || path.dirname(fs.realpathSync(target)) !== parent || !path.basename(target).startsWith(prefix)) {
      throw new Error('Refusing to remove a directory outside this test’s generated output');
    }
    fs.rmSync(target, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
  };
  context.after(() => {
    let copied = 0;
    const collect = directory => {
      for (const item of fs.readdirSync(directory, {withFileTypes: true})) {
        if (item.isSymbolicLink()) throw new Error('Unexpected link in generated export output');
        const source = path.join(directory, item.name);
        if (item.isDirectory()) { collect(source); continue; }
        if (!item.isFile() || !(/\.log$/.test(item.name) || /(?:验收|proof|report|result).*\.json$/.test(item.name))) continue;
        const size = fs.statSync(source).size;
        if (size > 2 * 1024 * 1024 || copied + size > 8 * 1024 * 1024) continue;
        const destination = path.join(records, path.relative(folder, source));
        fs.mkdirSync(path.dirname(destination), {recursive: true});
        fs.copyFileSync(source, destination);
        copied += size;
      }
    };
    try {
      collect(folder);
      fs.mkdirSync(records, {recursive: true});
      fs.writeFileSync(path.join(records, 'cleanup.json'), JSON.stringify({test: context.name, temporaryOutputRemoved: true, retainedBytes: copied}) + '\n');
      const previous = fs.readdirSync(recordsRoot, {withFileTypes: true})
        .filter(item => item.isDirectory() && item.name.startsWith(prefix) && item.name.length === prefix.length + 6)
        .map(item => path.join(recordsRoot, item.name))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      for (const old of previous.slice(3)) removeOwned(old, recordsRoot);
      console.log('Retained export test reports: ' + records);
    } finally {
      removeOwned(folder, boundary);
    }
  });
  return folder;
}
