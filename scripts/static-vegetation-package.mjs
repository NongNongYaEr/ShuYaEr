import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hash } from './pve-package.mjs';
import { writePveAtlas } from './pve-atlas.mjs';
import { buildBranchAsset, deserializeGeometry, disposeBranchAsset } from '../web/branch-kernel.js';
import { migrateProjectDocument, normalizeAuthoring } from '../web/authoring-state.js';
import { planStaticVegetation, writeStaticUsd, STATIC_POSITION_TOLERANCE, STATIC_ASSEMBLY_LIMIT } from '../web/static-vegetation.js';

const assert = (ok, message) => { if (!ok) throw Error(message); };
export const STATIC_ENTRY = 'vegetation.usda';
export const STATIC_MANIFEST = 'static_vegetation.manifest.json';

export function bakeSrgbTint(data, tint) {
  const result = Uint8Array.from(data);
  const linear = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  const srgb = v => v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055;
  for (let i = 0; i < result.length; i++) if (i % 4 < 3) result[i] = Math.round(Math.min(1, Math.max(0, srgb(linear(data[i] / 255) * tint[i % 4]))) * 255);
  return result;
}
function writeRgbaPng(image, file, tint = [1,1,1]) {
  const crc = b => { let c = 0xffffffff; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, bytes) => { const b = Buffer.concat([Buffer.alloc(4), Buffer.from(type), bytes, Buffer.alloc(4)]); b.writeUInt32BE(bytes.length); b.writeUInt32BE(crc(b.subarray(4, -4)), b.length - 4); return b; };
  const { width, height } = image, data = bakeSrgbTint(image.data, tint);
  assert(data?.length === width * height * 4, '树皮纹理数据无效');
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  // DataTexture row zero is the bottom row in the current Three renderer.
  for (let y = 0; y < height; y++) rows.set(data.subarray((height - y - 1) * width * 4, (height - y) * width * 4), y * (width * 4 + 1) + 1);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}

export async function generateStaticVegetation(directory, sourceBytes, progress = () => {}) {
  const document = migrateProjectDocument(JSON.parse(sourceBytes.toString('utf8').replace(/^\uFEFF/, '')));
  const authoring = normalizeAuthoring(document.authoring, document.settings.seed);
  assert(authoring.vine || authoring.surface_growth?.enabled, 'UE 静态植被装配当前支持藤蔓；整树请继续使用原有导出入口');
  assert(document.leaf_meshes?.length && authoring.leaf_material?.color, '请先选择真实叶片模型和共享贴图，再保存导出');
  assert(!authoring.vegetation?.enabled, '请先关闭藤蔓中的区域地被混种；该类型的独立素材尚未接入静态装配导出');
  const sources = document.leaf_meshes.map(s => ({ ...s, geometry: deserializeGeometry(s.geometry) }));
  let asset;
  try {
    progress('生成实际藤蔓', '读取本次保存的工程，完整求值藤干、叶片与连接细柄');
    asset = buildBranchAsset(document.settings, null, sources, 0, authoring, { resolveSources: true });
    assert(asset.masterBranches.length && asset.report.triangles, '当前工程没有可以导出的藤蔓');
    progress('整理共享叶片', '逐片核对几何，保留实际姿态；独有形状保留原始网格');
    const plan = planStaticVegetation(asset, sources);
    const warnings = [];
    for (let i = 0; i < plan.materials.length; i++) {
      const m = plan.materials[i], original = plan.materialObjects[i];
      if (m.leaf) {
        m.color_texture = 'leaf_atlas_color.png'; m.cutoff = authoring.leaf_material.cutoff; m.roughness = authoring.leaf_material.roughness;
        if (authoring.leaf_material.normal) m.normal_texture = 'leaf_atlas_normal.png';
      } else if (original.map?.image?.data) {
        m.color_texture = `bark_${i}.png`; writeRgbaPng(original.map.image, path.join(directory, m.color_texture), m.color);
        m.texture_tint_baked = [...m.color]; m.color = [1,1,1];
        if (original.bumpMap) warnings.push('树皮颜色纹理已保留；USD 通用材质不携带软件专用的树皮凹凸算法。');
      } else assert(!original.map, '当前植物存在尚未支持的独立材质贴图，停止导出以避免丢失外观');
    }
    writePveAtlas(authoring.leaf_material.color, path.join(directory, 'leaf_atlas_color.png'));
    for (let i = 0; i < plan.materials.length; i++) {
      const m = plan.materials[i];
      if (!m.leaf || m.color.every(v => v === 1)) continue;
      // UE 5.8's USD preview-surface importer ignores UsdUVTexture color scale.
      // Bake the linear tint into a per-material copy; never alter the source atlas.
      m.color_texture = `leaf_atlas_tint_${i}.png`;
      execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
        fileURLToPath(new URL('./static-texture-tint.ps1', import.meta.url)), '-SourceFile', path.join(directory, 'leaf_atlas_color.png'),
        '-Destination', path.join(directory, m.color_texture), '-Tint', JSON.stringify(m.color)], { windowsHide: true, timeout: 60000 });
      m.texture_tint_baked = [...m.color]; m.color = [1,1,1];
    }
    if (authoring.leaf_material.normal) writePveAtlas(authoring.leaf_material.normal, path.join(directory, 'leaf_atlas_normal.png'));
    progress('输出 USD 装配', `${plan.summary.leaves} 片叶，${plan.summary.prototypes} 个共享原型；承载模型不导出`);
    const usd = writeStaticUsd(plan); fs.writeFileSync(path.join(directory, STATIC_ENTRY), usd.text);
    const manifest = { format: 'BranchForgeStaticVegetation', version: 1, entry: STATIC_ENTRY, name: document.settings.object_name,
      source_sha256: hash(sourceBytes), target: 'UE 5.8 Nanite Assembly StaticMesh', coordinate_system: 'right_handed_Z_up_meters',
      uv_policy: 'USD st equals authored material UV; UE USD importer flips V once', support_mesh_exported: false,
      static_only: true, ue_import_verified: false, assembly_count: usd.chunks, instance_limit: STATIC_ASSEMBLY_LIMIT,
      summary: plan.summary, tolerance_m: STATIC_POSITION_TOLERANCE, materials: plan.materials,
      prototypes: plan.prototypes.map(p => ({ index: p.id, source_index: p.source_index, source_id: p.source_id, material: p.material, triangles: p.indices.length / 3 })),
      instances: usd.orderedInstances.map(i => ({ id: i.id, prototype: i.prototype })),
      warnings: [...new Set(warnings)],
      files: Object.fromEntries([...new Set([STATIC_ENTRY, 'leaf_atlas_color.png', ...plan.materials.flatMap(m => [m.color_texture, m.normal_texture].filter(Boolean))])]
        .map(name => { const b = fs.readFileSync(path.join(directory, name)); return [name, { bytes: b.length, sha256: hash(b) }]; })) };
    fs.writeFileSync(path.join(directory, STATIC_MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(directory, '导入说明.txt'), `BranchForge UE 静态植被装配\n\n入口：${STATIC_ENTRY}\n适用：UE 5.8，官方 USD Importer 与 Nanite Foliage 支持。\n通过官方 USD 导入将 Stage 导入为持久资产；不能交给 BranchForge PVE JSON 工作台。\n结果是 Nanite Assembly Static Mesh，辅助部件和材质由官方导入流程创建，配套文件一起保留。\n保持 Z-up、米和模型原点；藤蔓沿用承载模型局部坐标，桥墩不包含在包中。\n本包共 ${usd.chunks} 个装配；超过 ${STATIC_ASSEMBLY_LIMIT} 个叶片实例时按高度分包，各包共用原点。\n这是静态资产，不包含骨骼风动画。\n软件端验证不等于 UE 导入验收；本包尚未在 UE 中验证。\n首次测试请导入新的内容目录，确认贴图、尺寸、朝向、保存重载，再评估更新已有资产。\n\n${manifest.warnings.join('\n')}\n`);
    return { name: manifest.name, package_kind: 'static_vegetation', ...plan.summary, assembly_count: usd.chunks, warnings: manifest.warnings };
  } finally { disposeBranchAsset(asset); sources.forEach(s => s.geometry.dispose()); }
}

// Strict reader for our authored USDA subset. OpenUSD also parses these exports
// in the acceptance test; runtime validation has no installed-UE dependency.
export function usdNumbers(block, attribute, width = 1) {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp('(?:^|\\n)\\s*[^\\n=]+\\s' + escaped + '\\s*=\\s*\\[([^\\]]*)\\]').exec(block);
  assert(match, 'USD 缺少属性：' + attribute);
  const values = match[1].replace(/[()]/g, '').split(',').map(v => v.trim()).filter(Boolean).map(Number);
  assert(values.length % width === 0 && values.every(Number.isFinite), 'USD 属性数值无效：' + attribute);
  return values;
}
export function readStaticUsd(text) {
  assert(text.startsWith('#usda 1.0') && /upAxis = "Z"/.test(text) && /metersPerUnit = 1\s/.test(text), 'USD 单位或向上轴不正确');
  assert(!/\b(?:nan|inf)\b/i.test(text), 'USD 含非有限数值');
  return [...text.matchAll(/def Xform "Assembly_\d+"/g)].map((match, index, all) => {
    const block = text.slice(match.index, all[index + 1]?.index || text.length);
    assert(block.includes('"NaniteAssemblyRootAPI"') && block.includes('unreal:naniteAssembly:meshType = "staticMesh"'), 'USD 装配标记缺失');
    const meshes = [...block.matchAll(/def Mesh "(Base_\d+|Leaf_\d+)"[^\{]*\{([^}]+)\}/g)].map(m => {
      const result = { name: m[1], positions: usdNumbers(m[2], 'points', 3), normals: usdNumbers(m[2], 'normals', 3), uvs: usdNumbers(m[2], 'primvars:st', 2), indices: usdNumbers(m[2], 'faceVertexIndices') };
      const counts = usdNumbers(m[2], 'faceVertexCounts');
      assert(result.positions.length && result.normals.length === result.positions.length && result.uvs.length / 2 === result.positions.length / 3, 'USD 顶点属性数量不一致');
      assert(counts.every(v => v === 3) && counts.length * 3 === result.indices.length && result.indices.every(v => Number.isInteger(v) && v >= 0 && v < result.positions.length / 3), 'USD 面或索引无效');
      for (let n = 0; n < result.normals.length; n += 3) assert(Math.abs(Math.hypot(...result.normals.slice(n, n + 3)) - 1) < .001, 'USD 法线无效');
      result.material = Number(/material:binding = <\/Looks\/M_(\d+)>/.exec(m[2])?.[1]);
      assert(Number.isInteger(result.material), 'USD 材质绑定缺失');
      return result;
    });
    const hasInstances = block.includes('def PointInstancer');
    const data = hasInstances ? block.slice(block.indexOf('def PointInstancer'), block.indexOf('def Scope "Prototypes"')) : '';
    const nodes = hasInstances ? { prototypes: usdNumbers(data, 'protoIndices'), positions: usdNumbers(data, 'positions', 3), rotations: usdNumbers(data, 'orientationsf', 4), scales: usdNumbers(data, 'scales', 3) } : { prototypes: [], positions: [], rotations: [], scales: [] };
    const count = nodes.prototypes.length;
    assert(count <= STATIC_ASSEMBLY_LIMIT && nodes.positions.length === count * 3 && nodes.rotations.length === count * 4 && nodes.scales.length === count * 3 && nodes.scales.every(v => v > 0), 'USD 实例数量、缩放或上限无效');
    for (let i = 0; i < count; i++) assert(Math.abs(Math.hypot(...nodes.rotations.slice(i * 4, i * 4 + 4)) - 1) < .00001, 'USD 旋转不是单位四元数');
    const leaves = meshes.filter(m => m.name.startsWith('Leaf_'));
    assert(nodes.prototypes.every(v => Number.isInteger(v) && v >= 0 && v < leaves.length), 'USD 实例原型引用越界');
    if (hasInstances) assert((/rel prototypes = \[([^\]]*)\]/.exec(data)?.[1].match(/<[^>]+>/g) || []).every((ref, i) => ref === `</Vegetation/Assembly_${index}/Leaves/Prototypes/Leaf_${i}>`) && leaves.length === (/rel prototypes = \[([^\]]*)\]/.exec(data)?.[1].match(/<[^>]+>/g) || []).length, 'USD 原型路径错误');
    return { meshes, nodes };
  });
}

export function validateStaticVegetation(directory, sourceBytes) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, STATIC_MANIFEST)));
  assert(manifest.format === 'BranchForgeStaticVegetation' && manifest.version === 1 && manifest.entry === STATIC_ENTRY, '静态植被清单格式不正确');
  assert(manifest.source_sha256 === hash(sourceBytes), '静态植被源工程哈希不一致');
  assert(manifest.summary.max_position_error_m <= STATIC_POSITION_TOLERANCE && manifest.tolerance_m === STATIC_POSITION_TOLERANCE, '实例复用超过几何误差范围');
  for (const [name, value] of Object.entries(manifest.files)) {
    assert(name === path.basename(name) && !name.includes('..'), '不安全的静态植被文件引用');
    const bytes = fs.readFileSync(path.join(directory, name)); assert(bytes.length === value.bytes && hash(bytes) === value.sha256, '静态植被文件哈希不一致：' + name);
    if (name.endsWith('.png')) assert(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, '无效贴图：' + name);
  }
  const text = fs.readFileSync(path.join(directory, STATIC_ENTRY), 'utf8'), assemblies = readStaticUsd(text);
  assert(assemblies.length > 0 && assemblies.length === manifest.assembly_count, 'USD 装配数量不一致');
  for (const ref of text.matchAll(/@\.\/([^@]+)@/g)) assert(manifest.files[ref[1]], 'USD 贴图引用未登记：' + ref[1]);
  let triangles = 0, instances = 0, stored = 0;
  for (const [assemblyIndex, a] of assemblies.entries()) {
    const prototypes = a.meshes.filter(m => m.name.startsWith('Leaf_')), base = a.meshes.filter(m => m.name.startsWith('Base_'));
    assert(assemblyIndex === 0 || base.length === 0, 'USD 重复导出基础藤干');
    assert(a.meshes.length > 0 && a.meshes.every(m => manifest.materials[m.material]), 'USD 材质引用越界');
    triangles += base.reduce((n, m) => n + m.indices.length / 3, 0);
    triangles += a.nodes.prototypes.reduce((n, id) => n + prototypes[id].indices.length / 3, 0);
    stored += base.reduce((n, m) => n + m.indices.length / 3, 0) + (assemblyIndex ? 0 : prototypes.reduce((n, m) => n + m.indices.length / 3, 0));
    a.nodes.prototypes.forEach((id, i) => assert(manifest.instances[instances + i]?.prototype === id, 'USD 实例与稳定 ID 清单不一致'));
    instances += a.nodes.prototypes.length;
  }
  assert(triangles === manifest.summary.triangles && stored === manifest.summary.stored_triangles && instances === manifest.summary.shared_leaves && instances === manifest.instances.length && instances + manifest.summary.baked_leaves === manifest.summary.leaves, 'USD 实际几何和清单统计不一致');
  assert(new Set(manifest.instances.map(i => i.id)).size === instances, 'USD 实例稳定 ID 重复');
  const names = fs.readdirSync(directory);
  assert(names.every(n => n in manifest.files || [STATIC_MANIFEST, 'validation.json', '导入说明.txt'].includes(n)), '静态包混入未知文件');
  return { valid: true, errors: [], source_sha256: manifest.source_sha256, ...manifest.summary, assembly_count: assemblies.length,
    scope: '软件端文件、引用、数值及求值几何一致性；未进行 UE 导入验收', ue_import_verified: false,
    files: Object.fromEntries(names.filter(n => n !== 'validation.json').map(n => { const b = fs.readFileSync(path.join(directory, n)); return [n, { bytes: b.length, sha256: hash(b) }]; })) };
}
