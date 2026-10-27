import fs from 'node:fs';
import path from 'node:path';
import { assertTrunkPresetKind, normalizeTrunkPreset, TRUNK_PRESET_LIMIT } from '../web/trunk-preset-store.js';

const [input, output] = process.argv.slice(2);
try {
  const request = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, ''));
  const kind = assertTrunkPresetKind(request.kind);
  let result;
  if (request.operation === 'catalog') {
    const items = [], warnings = [];
    if (!Array.isArray(request.files) || request.files.length > TRUNK_PRESET_LIMIT) throw Error('库目录无效');
    for (const file of request.files) {
      try {
        if (fs.statSync(file).size > 24 * 1024 * 1024) throw Error('预设超过 24 MB');
        const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
        if (raw.format !== 'BranchForgeTrunkPreset' || raw.version !== 1 || raw.kind !== kind) throw Error('格式无效');
        const item = normalizeTrunkPreset(kind, raw);
        if (path.basename(file) !== item.id + '.trunkpreset.json') throw Error('文件 ID 不匹配');
        items.push(item);
      } catch (error) { warnings.push(path.basename(file) + '：' + error.message); }
    }
    result = { success: true, items, warnings };
  } else if (request.operation === 'normalize') {
    result = { success: true, item: normalizeTrunkPreset(kind, { ...request.item, updatedAt: Date.now() }) };
  } else throw Error('预设请求无效');
  fs.writeFileSync(output, JSON.stringify(result));
} catch (error) {
  fs.writeFileSync(output, JSON.stringify({ success: false, message: error.message }));
  process.exitCode = 1;
}
