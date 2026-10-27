// 本地审计：只读取素材和清单，唯一输出为 制作记录/进度.json。
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const libraryRoot = path.join(workspaceRoot, '植物图片素材库');
export const manifestPath = path.join(libraryRoot, 'species-manifest.json');
export const slash = value => value.replaceAll('\\', '/');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

// 写入路径必须在图片库内；不允许 ..、盘符、符号链接或 junction 绕过边界。
export function safeLibraryPath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\0') ||
      path.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
    throw new Error(`必须使用图片库内相对路径: ${relativePath}`);
  }
  const segments = relativePath.replaceAll('\\', '/').split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[<>:"|?*]/.test(segment) || /[. ]$/.test(segment))) {
    throw new Error(`拒绝越界或不规范路径: ${relativePath}`);
  }
  const target = path.resolve(libraryRoot, ...segments);
  if (!isInside(libraryRoot, target)) throw new Error(`路径越出图片库: ${relativePath}`);
  const realRoot = fs.realpathSync(libraryRoot);
  let current = libraryRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`拒绝符号链接或 junction: ${current}`);
    if (!isInside(realRoot, fs.realpathSync(current))) throw new Error(`实际路径越出图片库: ${current}`);
  }
  return target;
}

export function writeJSONAtomic(file, value) {
  const safe = safeLibraryPath(slash(path.relative(libraryRoot, file)));
  fs.mkdirSync(path.dirname(safe), {recursive: true});
  safeLibraryPath(slash(path.relative(libraryRoot, safe)));
  const temporary = `${safe}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {flag: 'wx'});
    fs.renameSync(temporary, safe);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  crcTable[n] = crc >>> 0;
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// 检查完整 PNG 签名、IHDR、尺寸、分块边界/CRC、IDAT 和 IEND；不改动像素。
export function inspectPNG(file) {
  if (path.extname(file).toLowerCase() !== '.png') throw new Error(`只接受 PNG: ${file}`);
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error(`不是普通文件: ${file}`);
  const bytes = fs.readFileSync(file);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) throw new Error('PNG 签名或文件长度非法');
  let offset = 8, width, height, bitDepth, colorType, sawIDAT = false, sawIEND = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('PNG 分块头被截断');
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('PNG 分块内容被截断');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error('PNG 分块名称非法');
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error(`PNG ${type} CRC 不符`);
    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) throw new Error('PNG 首块必须是 13 字节 IHDR');
      width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12);
      bitDepth = bytes[offset + 16]; colorType = bytes[offset + 17];
      const allowedDepths = {0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16]};
      if (!width || !height || width > 0x7fffffff || height > 0x7fffffff ||
          !allowedDepths[colorType]?.includes(bitDepth) || bytes[offset + 18] !== 0 ||
          bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) throw new Error('PNG IHDR 尺寸或编码非法');
    } else if (type === 'IHDR') throw new Error('PNG 存在重复 IHDR');
    if (type === 'IDAT') sawIDAT = true;
    if (type === 'IEND') {
      if (length !== 0 || end !== bytes.length) throw new Error('PNG IEND 非法或存在尾随数据');
      sawIEND = true;
    }
    offset = end;
  }
  if (!sawIDAT || !sawIEND) throw new Error('PNG 缺少 IDAT 或 IEND');
  return {format: 'PNG', dimensions: {width, height}, bitDepth, colorType, bytes: bytes.length, sha256: sha256(bytes)};
}

export function reviewed(file) {
  return file.quality?.reviewStatus === 'reviewed' && file.quality?.visualReview === 'passed' &&
    (file.role !== 'surface_tile' || file.quality?.seamCheck2x2 === 'passed');
}

function walkPNG(directory, issues, result = []) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      issues.push({kind: 'symbolic_link_skipped', relativePath: slash(path.relative(libraryRoot, full))});
    } else if (entry.isDirectory()) walkPNG(full, issues, result);
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.png') result.push(full);
  }
  return result;
}

export function scanLibrary(manifest = readJSON(manifestPath)) {
  if (!Array.isArray(manifest.species)) throw new Error('主清单缺少 species 数组');
  const issues = [], diskImages = [], expected = [], ids = new Set();
  for (const species of manifest.species) {
    if (ids.has(species.id)) issues.push({kind: 'duplicate_species_id', speciesId: species.id});
    ids.add(species.id);
    for (const [scope, files] of [['first_round', species.files], ['optional', species.optionalExpansion]]) {
      for (const file of files || []) {
        try {
          if (path.extname(file.relativePath).toLowerCase() !== '.png') throw new Error('计划图片路径必须为 .png');
          const absolutePath = safeLibraryPath(file.relativePath);
          expected.push({speciesId: species.id, role: file.role, scope, relativePath: slash(file.relativePath), absolutePath, file});
        } catch (error) {
          issues.push({kind: 'invalid_plan_path', speciesId: species.id, role: file.role, message: error.message});
        }
      }
    }
  }
  const expectedByPath = new Map();
  for (const entry of expected) {
    const key = entry.absolutePath.toLowerCase();
    if (expectedByPath.has(key)) issues.push({kind: 'duplicate_plan_path', relativePath: entry.relativePath});
    else expectedByPath.set(key, entry);
  }
  for (const full of walkPNG(libraryRoot, issues)) {
    const relativePath = slash(path.relative(libraryRoot, full));
    try { diskImages.push({relativePath, ...inspectPNG(full), valid: true}); }
    catch (error) { diskImages.push({relativePath, valid: false, error: error.message}); issues.push({kind: 'invalid_png', relativePath, message: error.message}); }
  }
  const diskByPath = new Map(diskImages.map(image => [path.resolve(libraryRoot, image.relativePath).toLowerCase(), image]));
  const entries = expected.map(entry => {
    const image = diskByPath.get(entry.absolutePath.toLowerCase());
    const value = {speciesId: entry.speciesId, role: entry.role, scope: entry.scope, relativePath: entry.relativePath,
      present: Boolean(image), valid: image?.valid === true,
      reviewed: image?.valid === true && entry.file.sha256 === image.sha256 && entry.file.source?.tool === 'builtin_imagegen' && reviewed(entry.file)};
    if (image) Object.assign(value, image);
    if (!image && /generated|reviewed/.test(entry.file.status || '')) issues.push({kind: 'recorded_image_missing', relativePath: entry.relativePath});
    if (image?.valid && entry.file.sha256 && entry.file.sha256 !== image.sha256) issues.push({kind: 'recorded_sha256_mismatch', relativePath: entry.relativePath});
    if (image?.valid && !entry.file.source?.tool) issues.push({kind: 'image_not_recorded', relativePath: entry.relativePath});
    return value;
  });
  for (const image of diskImages) if (!expectedByPath.has(path.resolve(libraryRoot, image.relativePath).toLowerCase())) {
    issues.push({kind: 'unplanned_png', relativePath: image.relativePath});
  }
  const byHash = new Map();
  for (const image of diskImages.filter(image => image.valid)) {
    if (!byHash.has(image.sha256)) byHash.set(image.sha256, []);
    byHash.get(image.sha256).push(image.relativePath);
  }
  const duplicateImages = [...byHash].filter(([, files]) => files.length > 1).map(([hash, files]) => ({sha256: hash, files}));
  for (const duplicate of duplicateImages) issues.push({kind: 'duplicate_image_sha256', ...duplicate});
  const required = entries.filter(entry => entry.scope === 'first_round');
  const optional = entries.filter(entry => entry.scope === 'optional');
  const speciesProgress = manifest.species.map(species => {
    const files = required.filter(entry => entry.speciesId === species.id);
    const generatedImageCount = files.filter(file => file.valid).length;
    const reviewedImageCount = files.filter(file => file.reviewed).length;
    return {speciesId: species.id, chineseName: species.chineseName, order: species.order,
      requiredImageCount: files.length, generatedImageCount, reviewedImageCount,
      status: generatedImageCount === 0 ? 'planned' : generatedImageCount < files.length ? 'in_progress' :
        reviewedImageCount === files.length ? 'generated_reviewed' : 'generated_review_pending'};
  });
  const generatedImageCount = required.filter(entry => entry.valid).length;
  const reviewedImageCount = required.filter(entry => entry.reviewed).length;
  if (manifest.generatedImageCount !== generatedImageCount) issues.push({kind: 'manifest_count_stale', recorded: manifest.generatedImageCount, actual: generatedImageCount});
  return {version: 1, auditedAt: new Date().toISOString(), mediaOrigin: 'AI生成素材；非实拍、扫描或科学标本',
    requiredImageCount: required.length, declaredRequiredImageCount: manifest.firstRoundRequiredImages,
    generatedImageCount, reviewedImageCount, reviewPendingImageCount: generatedImageCount - reviewedImageCount,
    remainingImageCount: required.length - generatedImageCount, optionalGeneratedImageCount: optional.filter(entry => entry.valid).length,
    actualPNGFileCount: diskImages.length, validPNGFileCount: diskImages.filter(image => image.valid).length,
    completeSpeciesCount: speciesProgress.filter(species => species.generatedImageCount === species.requiredImageCount).length,
    reviewedSpeciesCount: speciesProgress.filter(species => species.reviewedImageCount === species.requiredImageCount).length,
    passed: issues.length === 0, issues, duplicateImages, species: speciesProgress, files: entries};
}

export function saveProgress(report) {
  writeJSONAtomic(safeLibraryPath('制作记录/进度.json'), report);
}

const main = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (main) {
  try {
    if (process.argv.includes('--help')) {
      console.log('用法: runtime/node.exe scripts/audit-plant-image-library.mjs\n只读清单和实际 PNG，写入 植物图片素材库/制作记录/进度.json。未生成的计划文件属于正常剩余任务。');
    } else {
      if (process.argv.length > 2) throw new Error('不接受自定义目录；使用 --help 查看用法');
      const report = scanLibrary();
      saveProgress(report);
      console.log(JSON.stringify({generated: report.generatedImageCount, required: report.requiredImageCount,
        reviewed: report.reviewedImageCount, remaining: report.remainingImageCount, issues: report.issues,
        progressPath: safeLibraryPath('制作记录/进度.json')}, null, 2));
      if (!report.passed) process.exitCode = 1;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
