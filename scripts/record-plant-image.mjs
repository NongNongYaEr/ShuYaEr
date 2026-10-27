// 记录真实内置 imagegen 输出；不生成占位图，不修改图像像素，不覆盖既有成品。
import fs from 'node:fs';
import path from 'node:path';
import {libraryRoot, manifestPath, readJSON, sha256, slash, safeLibraryPath,
  inspectPNG, scanLibrary, saveProgress, writeJSONAtomic, reviewed} from './audit-plant-image-library.mjs';

function help() {
  console.log(`用法:
  runtime/node.exe scripts/record-plant-image.mjs <记录.json>
  runtime/node.exe scripts/record-plant-image.mjs --patch-quality <验收.json>
记录必填 speciesId、role、imageSourcePath、promptSourcePath，两个 sourcePath 必须为绝对路径。
可选 dimensions（与 PNG 实际尺寸核对）、generatedAt、quality。
验收只需 speciesId、role、quality；不复制或改动图片。
quality 默认为 {reviewStatus:"pending",visualReview:"pending",seamCheck2x2:"pending"}。
完成验收使用 {reviewStatus:"reviewed",visualReview:"passed",seamCheck2x2:"passed",reviewedBy:"验收者"}；
非表面图 seamCheck2x2 使用 "not_applicable"。详见图片库 制作记录/脚本用法.txt。`);
}

function sourcePath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`${label} 必须为绝对路径`);
  const resolved = fs.realpathSync(value);
  if (!fs.statSync(resolved).isFile()) throw new Error(`${label} 不是普通文件`);
  return resolved;
}

function qualityFor(file, incoming = {}, previous = {}) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('quality 必须为对象');
  const quality = {reviewStatus: 'pending', visualReview: 'pending',
    seamCheck2x2: file.role === 'surface_tile' ? 'pending' : 'not_applicable', ...previous, ...incoming};
  if (!['pending', 'reviewed', 'rejected'].includes(quality.reviewStatus)) throw new Error('quality.reviewStatus 只允许 pending/reviewed/rejected');
  if (quality.reviewStatus === 'reviewed') {
    if (!reviewed({...file, quality})) throw new Error('已验收必须 visualReview=passed；surface_tile 还必须 seamCheck2x2=passed');
    if (typeof quality.reviewedBy !== 'string' || !quality.reviewedBy.trim()) throw new Error('已验收必须填写 reviewedBy');
    quality.reviewedAt ||= new Date().toISOString();
  }
  return quality;
}

function syncDiskProgress(manifest, report) {
  const byPath = new Map(report.files.map(file => [file.relativePath.toLowerCase(), file]));
  for (const species of manifest.species) {
    for (const file of [...(species.files || []), ...(species.optionalExpansion || [])]) {
      const actual = byPath.get(slash(file.relativePath).toLowerCase());
      if (actual?.valid) {
        file.status = file.quality?.reviewStatus === 'rejected' ? 'generated_review_rejected' : reviewed(file) ? 'generated_reviewed' : 'generated_review_pending';
        file.format = 'PNG'; file.dimensions = actual.dimensions; file.bytes = actual.bytes; file.sha256 = actual.sha256;
      } else if (actual?.present) file.status = 'invalid_png';
      else if (file.source || /generated|reviewed/.test(file.status || '')) file.status = 'generated_image_missing';
    }
    const progress = report.species.find(item => item.speciesId === species.id);
    species.generatedImageCount = progress.generatedImageCount;
    species.reviewedImageCount = progress.reviewedImageCount;
    species.status = progress.status;
    if ([...(species.files || []), ...(species.optionalExpansion || [])].some(file => file.source?.tool === 'builtin_imagegen')) {
      species.mediaOrigin = 'ai_generated_builtin_imagegen';
    }
  }
  manifest.generatedImageCount = report.generatedImageCount;
  manifest.reviewedImageCount = report.reviewedImageCount;
  manifest.optionalGeneratedImageCount = report.optionalGeneratedImageCount;
  manifest.updatedAt = new Date().toISOString();
  manifest.status = report.generatedImageCount === 0 ? 'planned' : report.remainingImageCount > 0 ? 'in_progress' :
    report.reviewPendingImageCount === 0 ? 'generated_reviewed' : 'generated_review_pending';
}

function record(input, patchQuality) {
  const originalManifest = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(originalManifest.toString('utf8').replace(/^\uFEFF/, ''));
  const candidates = (manifest.species || []).filter(species => species.id === input.speciesId);
  if (candidates.length !== 1) throw new Error(`speciesId 不存在或不唯一: ${input.speciesId}`);
  const species = candidates[0];
  const matches = [...(species.files || []), ...(species.optionalExpansion || [])].filter(file => file.role === input.role);
  if (matches.length !== 1) throw new Error(`role 不存在或不唯一: ${input.role}`);
  const file = matches[0], destination = safeLibraryPath(file.relativePath);
  if (path.extname(destination).toLowerCase() !== '.png') throw new Error('计划目标必须为 PNG');
  const sameDestinations = manifest.species.flatMap(item => [...(item.files || []), ...(item.optionalExpansion || [])])
    .filter(item => slash(item.relativePath).toLowerCase() === slash(file.relativePath).toLowerCase());
  if (sameDestinations.length !== 1) throw new Error('目标路径在清单中不唯一');
  const speciesPath = safeLibraryPath(`${species.folder}/species.json`);
  const originalSpecies = fs.readFileSync(speciesPath);
  const localSpecies = JSON.parse(originalSpecies.toString('utf8').replace(/^\uFEFF/, ''));
  if (localSpecies.id !== species.id || JSON.stringify(localSpecies.files?.map(item => [item.role, item.relativePath])) !==
      JSON.stringify(species.files?.map(item => [item.role, item.relativePath]))) throw new Error('species.json 与主清单的 ID 或首轮计划不一致');
  let image, copied = false;
  if (patchQuality) {
    if (!input.quality) throw new Error('验收记录必须提供 quality');
    image = inspectPNG(destination);
    if (!file.sha256 || file.sha256 !== image.sha256) throw new Error('已有记录 SHA256 与实际 PNG 不一致；拒绝直接标为已验收');
    if (file.source?.tool !== 'builtin_imagegen') throw new Error('图片尚未登记内置 imagegen 来源');
    file.quality = qualityFor(file, input.quality, file.quality);
  } else {
    const source = sourcePath(input.imageSourcePath, 'imageSourcePath');
    if (path.extname(input.imageSourcePath).toLowerCase() !== '.png') throw new Error('imageSourcePath 只接受 .png');
    image = inspectPNG(source);
    if (input.dimensions && (input.dimensions.width !== image.dimensions.width || input.dimensions.height !== image.dimensions.height)) {
      throw new Error('记录 dimensions 与 PNG IHDR 实际尺寸不一致');
    }
    const promptSource = sourcePath(input.promptSourcePath, 'promptSourcePath');
    const prompt = fs.readFileSync(promptSource, 'utf8');
    if (!prompt.trim() || prompt.includes('\0')) throw new Error('promptSourcePath 必须包含非空可读提示词文本');
    const promptPath = safeLibraryPath(file.relativePath.replace(/\.png$/i, '.prompt.txt'));
    if (fs.existsSync(destination) && inspectPNG(destination).sha256 !== image.sha256) throw new Error('目标已有不同 PNG；不覆盖已生成成品');
    if (fs.existsSync(promptPath) && fs.readFileSync(promptPath, 'utf8') !== prompt) throw new Error('目标已有不同提示词；不覆盖来源记录');
    if (file.source?.promptSHA256 && file.source.promptSHA256 !== sha256(Buffer.from(prompt))) throw new Error('已登记的提示词哈希不同');
    const quality = qualityFor(file, input.quality || {}, file.quality);
    const generatedAt = file.generatedAt || input.generatedAt || new Date().toISOString();
    if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('generatedAt 不是有效日期');
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    safeLibraryPath(file.relativePath);
    if (!fs.existsSync(destination)) {
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      copied = true;
      if (inspectPNG(destination).sha256 !== image.sha256) throw new Error('复制后 PNG 哈希不同');
    }
    if (!fs.existsSync(promptPath)) fs.writeFileSync(promptPath, prompt, {flag: 'wx'});
    file.generatedAt = generatedAt;
    file.quality = quality;
    file.mediaOrigin = 'ai_generated_builtin_imagegen';
    file.source = {kind: 'ai_generated', tool: 'builtin_imagegen', note: '内置 imagegen 生成；非实拍、扫描或科学标本',
      imageSourcePath: file.source?.imageSourcePath || source,
      promptSourcePath: file.source?.promptSourcePath || promptSource,
      promptRelativePath: slash(path.relative(libraryRoot, promptPath)), promptSHA256: sha256(Buffer.from(prompt))};
  }
  file.recordedAt = new Date().toISOString();
  Object.assign(file, image);
  file.status = file.quality.reviewStatus === 'rejected' ? 'generated_review_rejected' : reviewed(file) ? 'generated_reviewed' : 'generated_review_pending';
  const report = scanLibrary(manifest);
  syncDiskProgress(manifest, report);
  // 复制期间若其他人改清单/物种资料，保留实际 PNG 供复核，不覆盖其编辑。
  if (sha256(fs.readFileSync(manifestPath)) !== sha256(originalManifest) || sha256(fs.readFileSync(speciesPath)) !== sha256(originalSpecies)) {
    throw new Error('清单或 species.json 已被其他编辑修改；PNG 保留，重新运行记录即可核对');
  }
  for (const key of ['files', 'optionalExpansion', 'status', 'mediaOrigin', 'generatedImageCount', 'reviewedImageCount']) localSpecies[key] = species[key];
  writeJSONAtomic(speciesPath, localSpecies);
  writeJSONAtomic(manifestPath, manifest);
  const finalReport = scanLibrary(manifest);
  saveProgress(finalReport);
  return {speciesId: species.id, role: file.role, relativePath: file.relativePath, copied, idempotent: !copied && !patchQuality,
    status: file.status, dimensions: image.dimensions, bytes: image.bytes, sha256: image.sha256,
    generatedImageCount: finalReport.generatedImageCount, requiredImageCount: finalReport.requiredImageCount,
    reviewedImageCount: finalReport.reviewedImageCount, auditIssueCount: finalReport.issues.length};
}

let lock;
try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) help();
  else {
    const patchQuality = args[0] === '--patch-quality';
    if (args.length !== (patchQuality ? 2 : 1)) throw new Error('参数错误；使用 --help 查看用法');
    const input = readJSON(path.resolve(args[patchQuality ? 1 : 0]));
    lock = safeLibraryPath('制作记录/.plant-image-record.lock');
    fs.mkdirSync(path.dirname(lock), {recursive: true});
    safeLibraryPath('制作记录/.plant-image-record.lock');
    try { fs.writeFileSync(lock, JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()}), {flag: 'wx'}); }
    catch (error) { lock = undefined; throw new Error(`其他记录进程正在运行（或异常中断留下锁）；先核对 制作记录/.plant-image-record.lock: ${error.message}`); }
    console.log(JSON.stringify(record(input, patchQuality), null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (lock && fs.existsSync(lock)) fs.unlinkSync(lock); }
