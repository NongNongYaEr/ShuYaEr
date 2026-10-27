import path from 'node:path';
import { packageTransaction } from './pve-package.mjs';
import { generateStaticVegetation, validateStaticVegetation, STATIC_ENTRY, STATIC_MANIFEST } from './static-vegetation-package.mjs';

const args = process.argv.slice(2), option = key => { const i = args.indexOf(key); return i < 0 ? '' : args[i + 1] || ''; };
if (!option('--project') || !option('--out')) throw Error('需要 --project 当前工程.branch.json --out 输出目录');
await packageTransaction({ input: path.resolve(option('--project')), destination: path.resolve(option('--out')), statusPath: option('--status') || undefined,
  keepHistory: args.includes('--keep-history'), generate: generateStaticVegetation, validate: validateStaticVegetation,
  manifestName: STATIC_MANIFEST, manifestFormat: 'BranchForgeStaticVegetation', entryName: STATIC_ENTRY, initialStage: '生成实际藤蔓' });
