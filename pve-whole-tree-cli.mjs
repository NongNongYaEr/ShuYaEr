import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createPVEWholeTree } from './web/pve-whole-tree.js';
import { validatePVESkeleton } from './web/pve-skeleton-export.js';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? '' : args[index + 1] || '';
};
const recipePath = option('--recipe');
const outputPath = option('--output');
if (!recipePath || !outputPath) throw new Error('用法：node --experimental-loader ./vendor-loader.mjs pve-whole-tree-cli.mjs --recipe 整树配方.json --output 整树.pve-skeleton.json');
const recipe = JSON.parse(await readFile(path.resolve(recipePath), 'utf8'));
const skeleton = createPVEWholeTree(recipe);
const report = validatePVESkeleton(skeleton);
const absoluteOutput = path.resolve(outputPath);
await mkdir(path.dirname(absoluteOutput), { recursive: true });
await writeFile(absoluteOutput, `${JSON.stringify(skeleton, null, 2)}\n`, 'utf8');
await writeFile(absoluteOutput.replace(/\.json$/i, '.validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ output: absoluteOutput, ...report }, null, 2)}\n`);
