import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { validatePVESkeleton } from '../web/pve-skeleton-export.js';

export const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex').toUpperCase();
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const assert = (ok, message) => { if (!ok) throw Error(message); };

async function renamePackageDirectory(from, to) {
  // Windows may still have a freshly written file open briefly. Retry only
  // sharing/permission errors; permanent failures still take the rollback path.
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(from, to); return; }
    catch (error) {
      if (attempt >= 12 || !['EPERM','EACCES','EBUSY'].includes(error.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}

// Re-read the delivery files, rather than trusting in-memory generator results.
export function validatePackage(directory, sourceBytes) {
  const file = name => {
    assert(typeof name === 'string' && name === path.basename(name) && !name.includes('..'), '不安全的包内引用');
    return fs.readFileSync(path.join(directory, name));
  };
  const json = name => JSON.parse(file(name));
  const s = json('whole.pve-skeleton.json'), m = json('complete_units.manifest.json');
  const r = json('whole.resolved.json'), b = file('whole.resolved.bin');
  const sourceHash = hash(sourceBytes);
  assert(m.format === 'BranchForgeCompleteUnitSet' && m.version === 1, '完整枝清单格式错误');
  assert(s.format === 'BranchForgePVESkeleton' && [1, 2, 3].includes(s.version), 'PVE 入口格式错误');
  const skeletonValidation = validatePVESkeleton(s);
  assert(skeletonValidation.valid, '重新读取的 PVE 入口无效：' + skeletonValidation.errors.join('；'));
  assert(r.format === 'BranchForgeResolvedAssembly' && r.version === 1 && r.vertex_stride === 48, '实际装配格式错误');
  assert(r.coordinate_system === 'UE_centimeter_X_negativeY_Z', '实际装配坐标约定变化');
  assert(s.resolved_assembly?.manifest === 'whole.resolved.json' && s.resolved_assembly.binary === 'whole.resolved.bin', '入口缺少实际装配引用');
  assert(JSON.stringify(m.resolved_assembly) === JSON.stringify(s.resolved_assembly), '入口与清单装配引用不一致');
  assert([m.source_whole_sha256, r.source_sha256, s.resolved_assembly.source_sha256].every(h => h === sourceHash), '源工程哈希不一致');
  assert(r.binary === 'whole.resolved.bin' && b.length === r.binary_bytes && b.subarray(0, 8).toString() === 'BFRA0001', '二进制头或长度错误');
  assert(hash(b) === r.binary_sha256 && hash(b, 'sha1') === r.binary_sha1, '实际装配二进制哈希错误');
  assert(JSON.stringify(r.instances) === JSON.stringify(s.foliage) && JSON.stringify(r.sources) === JSON.stringify(s.foliage_sources) && JSON.stringify(r.branches) === JSON.stringify(s.branches), '骨架、实例或枝类索引不一致');
  const ids = new Set(s.branches.map(v => v.id)), counts = m.units.map(() => 0);
  const imported=r.imported_trunk_materials;
  if(s.version===3){assert(imported?.version===1&&Array.isArray(imported.materials)&&imported.materials.length>0,'外部树干缺少实际材质表');const ids=new Set(imported.materials.map(m=>m.id));assert(ids.size===imported.materials.length,'外部树干材质身份重复');for(const material of imported.materials)for(const map of Object.values(material.maps||{})){const bytes=file(map.file);assert(bytes.length===map.bytes&&hash(bytes).toLowerCase()===map.sha256,'外部树干贴图校验失败');}for(const chunk of r.chunks){if(chunk.imported_trunk_material)assert(ids.has(chunk.imported_trunk_material.material_id)&&chunk.imported_trunk_material.uv_policy==='source_gltf_uv0_no_extra_flip','外部树干材质绑定缺失');if(chunk.vertex_colors){const c=chunk.vertex_colors,bytes=file(c.file);assert(c.count===chunk.vertex_count&&c.stride===16&&bytes.length===c.count*16&&hash(bytes).toLowerCase()===c.sha256,'外部树干顶点颜色校验失败');}}assert(imported.setup==='setup_imported_trunk_materials.py'&&file(imported.setup).length>0,'外部树干材质设置脚本缺失');}
  else assert(!imported,'外部树干不能使用旧版 PVE 入口');
  const skin=r.imported_trunk_skin;if(s.version===3){assert(skin?.version===1&&skin.stride===12&&skin.coordinate_system==='UE_centimeter_X_negativeY_Z','外部树干缺少显式骨骼权重');const bytes=file(skin.file);assert(bytes.length===skin.bytes&&bytes.subarray(0,8).toString()==='BFTS0001'&&hash(bytes).toLowerCase()===skin.sha256&&hash(bytes,'sha1').toLowerCase()===skin.sha1,'树干权重文件校验失败');assert(Array.isArray(skin.nodes)&&skin.nodes.length>1&&skin.nodes.every(n=>ids.has(n.branch_id)&&n.position_cm?.length===3&&n.position_cm.every(Number.isFinite)),'树干骨骼节点无效');let end=8;for(const [i,p]of skin.pieces.entries()){assert(p.offset===end&&p.count===r.chunks[p.chunk]?.vertex_count&&r.chunks[p.chunk]?.imported_trunk_skin?.piece===i,'树干权重块引用不一致');end+=p.count*12;for(let v=0;v<p.count;v++){const at=p.offset+v*12,a=bytes.readUInt32LE(at),b=bytes.readUInt32LE(at+4),w=bytes.readFloatLE(at+8);assert(a<skin.nodes.length&&b<skin.nodes.length&&Number.isFinite(w)&&w>=0&&w<=1,'树干权重无效');}}assert(end===bytes.length&&file(skin.setup).length>0,'树干权重文件长度或完成脚本缺失');if(skin.instructions)assert(skin.instructions==='树干UE导出说明.txt'&&file(skin.instructions).length>0,'树干UE导出说明缺失');if(skin.ue_export)assert(skin.ue_export==='export_imported_trunk_assets.ps1'&&file(skin.ue_export).length>0,'树干后台导出脚本缺失');}
  const barkMaterials = new Map(), barkFiles = new Set();
  if (r.bark_materials !== undefined) {
    assert(Array.isArray(r.bark_materials) && r.bark_materials.length > 0 && r.bark_materials.length <= 4096, '树皮材质表无效');
    for (const material of r.bark_materials) {
      assert(/^bark-[a-f0-9]{24}$/.test(material.id) && !barkMaterials.has(material.id) && material.material_role === 'bark', '树皮材质 ID 或语义错误');
      assert(material.base_color_linear?.length === 3 && material.base_color_linear.every(v => Number.isFinite(v) && v >= 0 && v <= 1)
        && Number.isFinite(material.roughness) && material.roughness >= .04 && material.roughness <= 1
        && material.normal_scale?.length === 2 && material.normal_scale.every(v => Number.isFinite(v) && v >= 0 && v <= 3), '树皮颜色、粗糙度或法线强度错误');
      for (const slot of ['color', 'normal', 'roughness']) {
        const ref = material.maps?.[slot];
        assert(ref && ref.file === material.id + '.' + slot + '.png' && ref.color_space === (slot === 'color' ? 'srgb' : 'linear'), '树皮贴图槽或颜色空间错误');
        const bytes = file(ref.file);
        assert(hash(bytes) === ref.sha256 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.length >= 45, '树皮 PNG 哈希或头错误');
        assert(Number.isInteger(ref.width) && Number.isInteger(ref.height) && ref.width > 0 && ref.height > 0 && ref.width <= 1024 && ref.height <= 1024
          && bytes.readUInt32BE(16) === ref.width && bytes.readUInt32BE(20) === ref.height && bytes[24] === 8 && bytes[25] === 6, '树皮 PNG 尺寸或像素格式错误');
        const compressed = []; let offset = 8, ended = false;
        while (offset + 12 <= bytes.length) {
          const length = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8);
          assert(offset + length + 12 <= bytes.length, '树皮 PNG 数据块越界');
          if (kind === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
          offset += length + 12;
          if (kind === 'IEND') { ended = true; break; }
        }
        assert(ended && offset === bytes.length && compressed.length > 0, '树皮 PNG 数据块不完整');
        const rgba = inflateSync(Buffer.concat(compressed)), stride = ref.width * 4 + 1;
        assert(rgba.length === stride * ref.height, '树皮 PNG 像素行长度错误');
        for (let row = 0; row < ref.height; row++) assert(rgba[row * stride] <= 4, '树皮 PNG 行过滤器错误');
        barkFiles.add(ref.file);
      }
      barkMaterials.set(material.id, material);
    }
    const setup = r.bark_material_setup;
    assert(setup?.script === 'setup_bark_materials.py' && setup.readme === '树皮材质说明.txt'
      && hash(file(setup.script)) === setup.script_sha256 && hash(file(setup.readme)) === setup.readme_sha256
      && setup.ue_material_application_verified === false, '树皮初始化说明或验证状态错误');
    barkFiles.add(setup.script); barkFiles.add(setup.readme);
    assert(s.resolved_assembly.bark_materials?.material_count === barkMaterials.size
      && s.resolved_assembly.bark_materials.manifest === 'whole.resolved.json', '树皮材质入口引用错误');
  }
  const validateBarkBinding = binding => {
    assert(binding && barkMaterials.has(binding.material_id), '树皮绑定引用未知材质');
    for (const slot of ['color', 'normal', 'roughness']) {
      const t = binding.texture_transforms?.[slot];
      assert(t?.wrap === 'REPEAT' && t.repeat?.length === 2 && t.offset?.length === 2 && t.center?.length === 2
        && t.matrix?.length === 9 && [...t.repeat, ...t.offset, ...t.center, ...t.matrix, t.rotation].every(Number.isFinite)
        && t.repeat.every(v => v > 0), '树皮铺贴矩阵无效');
      const [sx, sy] = t.repeat, [tx, ty] = t.offset, [cx, cy] = t.center, c = Math.cos(t.rotation), q = Math.sin(t.rotation);
      const expected = [sx*c, -sy*q, 0, sx*q, sy*c, 0, -sx*(c*cx+q*cy)+cx+tx, -sy*(-q*cx+c*cy)+cy+ty, 1];
      assert(expected.every((v,index) => Math.abs(v-t.matrix[index]) <= 1e-8 * Math.max(1,Math.abs(v))), '树皮铺贴矩阵与重复/方向不一致');
    }
  };
  assert(m.units.length === s.foliage_sources.length && new Set(m.units.map(v => v.id)).size === m.units.length, '枝类数量或 ID 错误');
  // The UE whole-tree workbench accepts complete units, not independent leaves.
  // Validate this contract before publishing, in addition to generic skeleton validity.
  const assembly = s.complete_unit_assembly;
  assert(assembly && assembly.leaf_instances === 0 && assembly.organ_instances === 0,
    'UE 完整枝入口仍包含独立叶片或花果，必须烘入完整装配单元');
  assert(assembly.unit_count === s.foliage.length && assembly.source_mesh_count === m.units.length
    && s.foliage.every(i => i.id.startsWith('UNIT_')), '完整装配单元数量或 ID 不符合入口约定');
  for (const i of s.foliage) {
    assert(Number.isInteger(i.source_index) && counts[i.source_index] !== undefined && ids.has(i.branch_id), '实例引用无效');
    assert([...i.position_m, ...i.up, ...i.face, i.scale_m].every(Number.isFinite) && i.scale_m > 0, '实例变换无效');
    counts[i.source_index]++;
  }
  // Optional nested-installation metadata supplements the unchanged absolute
  // transforms. Older packages and consumers need no parent-unit extension.
  const unitById = new Map(s.foliage.map(i=>[i.id,i]));
  for (const i of s.foliage) if (i.parent_unit_id !== undefined) {
    const parent=unitById.get(i.parent_unit_id);
    assert(parent && parent!==i && parent.branch_id===i.branch_id
      && typeof i.parent_unit_branch_id==='string' && i.parent_unit_branch_id.startsWith(parent.id.slice(5)+'.')
      && Number.isFinite(i.parent_unit_t) && i.parent_unit_t>=0 && i.parent_unit_t<=1,'完整单元父子挂接元数据无效');
    const seen=new Set([i.id]);let cursor=parent;
    while(cursor){assert(!seen.has(cursor.id),'完整单元父子挂接成环');seen.add(cursor.id);cursor=unitById.get(cursor.parent_unit_id);}
  }
  for (const [index, unit] of m.units.entries()) {
    assert(unit.id === s.foliage_sources[index].id && unit.instance_count === counts[index], 'source_index 或实例数量错误');
    const glb = file(unit.glb);
    assert(hash(glb) === unit.glb_sha256 && glb.toString('ascii', 0, 4) === 'glTF' && glb.readUInt32LE(4) === 2 && glb.readUInt32LE(8) === glb.length, 'GLB 哈希或头错误：' + unit.id);
    const length = glb.readUInt32LE(12), data = JSON.parse(glb.toString('utf8', 20, 20 + length));
    if (unit.bark_material_bindings !== undefined) {
      assert(Array.isArray(unit.bark_material_bindings) && unit.bark_material_bindings.length > 0, '完整单元树皮槽表无效');
      const slots = new Set();
      for (const binding of unit.bark_material_bindings) {
        validateBarkBinding(binding);
        assert(Number.isInteger(binding.material_index) && data.materials?.[binding.material_index]?.name === 'M_Bark'
          && !slots.has(binding.material_index), '完整单元树皮槽索引错误');
        const { material_index, ...payload } = binding;
        assert(JSON.stringify(data.materials[material_index].extras?.bark_pve_binding) === JSON.stringify(payload), '完整单元树皮槽与 GLB 元数据不一致');
        slots.add(binding.material_index);
      }
    }
    const binOffset = 28 + length, binLength = glb.readUInt32LE(20 + length);
    assert(glb.readUInt32LE(16) === 0x4e4f534a && glb.readUInt32LE(24 + length) === 0x004e4942 && binOffset + binLength === glb.length, 'GLB 数据块错误');
    assert(data.meshes?.length && !data.buffers?.some(v => v.uri) && !data.images?.some(v => v.uri), 'GLB 缺少网格或含外部依赖');
    const accessors = data.accessors.map(a => {
      const view = data.bufferViews[a.bufferView], sizes = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
      const components = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type], size = sizes[a.componentType];
      assert(view && view.buffer === 0 && components && size && a.count > 0 && !a.sparse, 'GLB accessor 无效');
      const stride = view.byteStride || size * components, start = (view.byteOffset || 0) + (a.byteOffset || 0);
      assert(stride >= size * components && start + (a.count - 1) * stride + size * components <= (view.byteOffset || 0) + view.byteLength && (view.byteOffset || 0) + view.byteLength <= binLength, 'GLB 顶点或索引越界');
      const methods = {5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
      const get = (i, c = 0) => glb[methods[a.componentType]](binOffset + start + i * stride + c * size);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < components; c++) assert(Number.isFinite(get(i,c)), 'GLB 含非有限数值');
      return { count: a.count, get };
    });
    let glbTriangles = 0;
    for (const mesh of data.meshes) for (const primitive of mesh.primitives) {
      assert(primitive.attributes.POSITION !== undefined && primitive.attributes.TEXCOORD_0 !== undefined, '完整枝缺少顶点或 UV');
      const pos = accessors[primitive.attributes.POSITION], uv = accessors[primitive.attributes.TEXCOORD_0], index = accessors[primitive.indices];
      assert(pos && uv && pos.count === uv.count && index && index.count % 3 === 0, 'GLB 三角面属性不一致');
      for (let i = 0; i < index.count; i++) assert(index.get(i) < pos.count, 'GLB 三角面索引越界');
      glbTriangles += index.count / 3;
    }
    if (unit.triangles !== undefined) assert(unit.triangles === glbTriangles, '完整单元 GLB 三角面数量不一致');
  }
  const bareImported=s.version===3&&s.foliage.length===0&&s.foliage_sources.length===0;
  const png = bareImported&&!fs.existsSync(path.join(directory,'leaf_atlas_color.png'))?null:file('leaf_atlas_color.png');
  assert(png?png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bareImported&&!m.merged_atlas, '共享图集不是 PNG');
  if (m.merged_atlas) {
    const a=m.merged_atlas;
    assert(a.width===png.readUInt32BE(16) && a.height===png.readUInt32BE(20) && a.regions.length>1, '混合图集尺寸或来源错误');
    assert(new Set(a.regions.map(r=>r.key)).size===a.regions.length,'混合图集来源重复');
    for(const r of a.regions) assert([r.x,r.y,r.width,r.height].every(Number.isInteger) && r.x>=0 && r.y>=0 && r.width>0 && r.height>0 && r.x+r.width<=a.width && r.y+r.height<=a.height,'混合图集分区越界');
    for(let i=0;i<a.regions.length;i++) for(let j=i+1;j<a.regions.length;j++) {
      const p=a.regions[i],q=a.regions[j];
      assert(p.x+p.width<=q.x || q.x+q.width<=p.x || p.y+p.height<=q.y || q.y+q.height<=p.y,'混合图集分区重叠');
    }
    if(fs.existsSync(path.join(directory,'leaf_atlas_normal.png'))) {
      const normal=file('leaf_atlas_normal.png');
      assert(normal.readUInt32BE(16)===a.width && normal.readUInt32BE(20)===a.height,'混合图集法线尺寸不一致');
    }
  }
  let cursor = 8, vertices = 0, triangles = 0;
  const owners = new Set(), bounds = { min: [Infinity,Infinity,Infinity], max: [-Infinity,-Infinity,-Infinity] };
  for (const c of r.chunks) {
    assert(c.vertex_offset === cursor && c.vertex_count > 0 && Number.isInteger(c.vertex_count) && c.index_count > 0 && c.index_count % 3 === 0, '实际装配块布局错误');
    assert(c.index_offset === cursor + c.vertex_count * 48 && c.index_offset + c.index_count * 4 <= b.length, '实际装配块越界');
    assert(ids.has(c.host_branch_id) && ['bark','foliage'].includes(c.material_role), '实际装配所属骨架或材质错误');
    if (c.bark_material_binding !== undefined) {
      assert(c.material_role === 'bark', '叶花果不能绑定承重树皮材质'); validateBarkBinding(c.bark_material_binding);
    }
    if (c.instance_index >= 0) {
      const i = s.foliage[c.instance_index];
      assert(i && i.source_index === c.source_index && i.branch_id === c.host_branch_id, '实际装配所属实例错误'); owners.add(c.instance_index);
    } else assert(c.instance_index === -1 && c.source_index === -1, '承重骨架所属错误');
    for (let v = 0; v < c.vertex_count; v++) for (let a = 0; a < 12; a++) {
      const value = b.readFloatLE(cursor + v * 48 + a * 4); assert(Number.isFinite(value), '实际装配含非有限数');
      if (a < 3) { bounds.min[a] = Math.min(bounds.min[a], value); bounds.max[a] = Math.max(bounds.max[a], value); }
    }
    for (let i = 0; i < c.index_count; i++) assert(b.readUInt32LE(c.index_offset + i * 4) < c.vertex_count, '三角面索引越界');
    cursor = c.index_offset + c.index_count * 4; vertices += c.vertex_count; triangles += c.index_count / 3;
  }
  assert(cursor === b.length && vertices === r.summary.vertices && triangles === r.summary.triangles, '实际装配统计或尾部错误');
  assert(JSON.stringify(bounds) === JSON.stringify(r.summary.bounds_cm), '实际装配包围盒不一致');
  assert(owners.size === s.foliage.length && r.summary.unit_instances === s.foliage.length && r.summary.source_meshes === m.units.length, '实际装配实例丢失');
  const filenames = fs.readdirSync(directory).sort();
  const importedFiles=imported?[imported.setup,...imported.materials.flatMap(m=>Object.values(m.maps||{}).map(x=>x.file)),...r.chunks.filter(c=>c.vertex_colors).map(c=>c.vertex_colors.file)]:[];
  const supportedFiles = new Set(['whole.pve-skeleton.json', 'complete_units.manifest.json', 'whole.resolved.json',
    'whole.resolved.bin', 'leaf_atlas_color.png', 'leaf_atlas_normal.png', 'validation.json', ...m.units.map(unit => unit.glb), ...barkFiles,...importedFiles,...(skin?[skin.file,skin.setup,...(skin.ue_export?[skin.ue_export]:[]),...(skin.instructions?[skin.instructions]:[])]:[])]);
  for (const name of filenames) assert(supportedFiles.has(name), '验证报告包含现有 UE 完整包约定之外的文件：' + name);
  if (m.package_kind === 'vine') {
    const ref = m.vine_detail;
    assert(ref?.data && !ref.file, '藤蔓内部明细必须嵌入现有清单，不能引用额外文件');
    const detail = ref.data, detailBytes = Buffer.from(JSON.stringify(detail));
    assert(hash(detailBytes) === ref.sha256 && validatePVESkeleton(detail).valid, '藤蔓内部结构哈希或引用无效');
    assert(s.branches.length === 1 && s.foliage.length === 1 && m.units.length === 1
      && s.branches[0].id === ref.structural_host && detail.branches.some(b => b.id === ref.structural_host), '完整藤蔓根连接或单元划分错误');
    assert(ref.branches === detail.branches.length && ref.leaves === detail.foliage.length && ref.sources === detail.foliage_sources.length
      && r.summary.branches === ref.branches && r.summary.leaves === ref.leaves
      && m.units[0].complete_unit_leaves === ref.leaves && assembly.baked_unit_leaves === ref.leaves, '完整藤蔓内部叶片或枝条丢失');
    const structural = r.chunks.filter(c => c.instance_index < 0).reduce((n, c) => n + c.index_count / 3, 0);
    assert(structural === ref.structural_triangles && m.units[0].triangles === ref.unit_triangles
      && structural + ref.unit_triangles === triangles, '完整藤蔓骨架和单元几何重复或丢失');
  }
  const files = Object.fromEntries(filenames.filter(n => n !== 'validation.json').map(n => { const bytes = file(n); return [n, { bytes: bytes.length, sha256: hash(bytes) }]; }));
  const originalValidation = json('validation.json');
  assert(originalValidation.valid && originalValidation.errors?.length === 0, '骨架校验未通过');
  return { ...originalValidation, valid: true, errors: [], branch_count: s.branches.length, foliage_count: s.foliage.length, sources: m.units.length,
    source_sha256: sourceHash, resolved_assembly: { ...s.resolved_assembly, ...r.summary }, atlas: png?{ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }:null, files };
}

export async function packageTransaction({ input, destination, statusPath, generate, keepHistory = false,
  validate = validatePackage, manifestName = 'complete_units.manifest.json', manifestFormat = 'BranchForgeCompleteUnitSet',
  entryName = 'whole.pve-skeleton.json', initialStage = '生成骨架与样本枝' }) {
  const id = randomUUID(), parent = path.dirname(destination), name = path.basename(destination);
  const workRoot = path.join(parent, '.pve-export-work'), jobRoot = path.join(workRoot, id);
  const staging = path.join(jobRoot, `.${name}.building-${id}`), previous = path.join(jobRoot, `.${name}.previous-${id}`);
  const historyRoot = path.join(parent, '历史备份', name);
  const archive = path.join(historyRoot, new Date().toISOString().replace(/[:.]/g, '-') + '_' + id);
  const lockPath = destination + '.export.lock';
  let lock, stage = initialStage, moved = false, published = false;
  const started = new Date().toISOString();
  const report = (next, detail = '', extra = {}) => {
    stage = next;
    const data = { success: true, state: 'running', stage, detail, pid: process.pid, started, updated: new Date().toISOString(), output_dir: destination, keep_history: keepHistory === true, ...extra };
    console.log(JSON.stringify(data));
    if (statusPath) { fs.writeFileSync(statusPath + '.tmp', JSON.stringify(data)); fs.renameSync(statusPath + '.tmp', statusPath); }
  };
  try {
    // GUI supplies the named sibling directory; retain CLI --out support while
    // refusing to replace any directory containing the editable source project.
    const relativeSource = path.relative(destination, input);
    assert(relativeSource.startsWith('..' + path.sep) || path.isAbsolute(relativeSource), '完整包目录不能包含源工程文件');
    fs.mkdirSync(parent, { recursive: true });
    if (fs.existsSync(lockPath)) {
      const prior = read(lockPath); let alive = true;
      try { process.kill(prior.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
      assert(!alive, '此工程已有完整枝包导出任务正在运行，请等待完成');
      fs.renameSync(lockPath, lockPath + '.interrupted-' + id);
    }
    lock = fs.openSync(lockPath, 'wx'); fs.writeSync(lock, JSON.stringify({ pid: process.pid, started }));
    if (fs.existsSync(destination)) assert(!fs.lstatSync(destination).isSymbolicLink(), '完整包目标不能是目录链接');
    if (fs.existsSync(destination)) assert(read(path.join(destination, manifestName)).format === manifestFormat, '目标目录不是对应导出包，拒绝覆盖');
    const sourceBytes = fs.readFileSync(input);
    fs.mkdirSync(workRoot, { recursive: true });
    assert(!fs.lstatSync(workRoot).isSymbolicLink(), '导出临时目录不能是目录链接');
    fs.mkdirSync(jobRoot);
    if (keepHistory === true) {
      for (const directory of [path.dirname(historyRoot), historyRoot]) {
        fs.mkdirSync(directory, { recursive: true });
        assert(!fs.lstatSync(directory).isSymbolicLink(), '历史备份目录不能是目录链接');
      }
    }
    report(initialStage, '已读取本次保存的工程'); fs.mkdirSync(staging);
    const generated = await generate(staging, sourceBytes, report);
    report('校验完整包', '逐文件校验引用、哈希、实例及实际几何');
    const validation = validate(staging, sourceBytes);
    assert(hash(fs.readFileSync(input)) === validation.source_sha256, '导出期间源工程发生变化，请重新导出');
    fs.writeFileSync(path.join(staging, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
    report('发布完整包', '完整校验通过，替换输出目录');
    if (fs.existsSync(destination)) { await renamePackageDirectory(destination, previous); moved = true; }
    await renamePackageDirectory(staging, destination); published = true;
    let previousDir = moved ? previous : null;
    const maintenanceWarnings = [];
    try {
      if (moved && keepHistory === true) { await renamePackageDirectory(previous, archive); previousDir = archive; }
      // Only this transaction's UUID directory may be removed, and only after
      // the replacement has been validated and successfully published.
      assert(path.dirname(path.resolve(jobRoot)) === path.resolve(workRoot)
        && path.basename(jobRoot) === id && !fs.lstatSync(jobRoot).isSymbolicLink(), '临时回退目录校验失败');
      fs.rmSync(jobRoot, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
      if (keepHistory !== true) previousDir = null;
      try { fs.rmdirSync(workRoot); } catch { /* Other active/failed jobs remain. */ }
    } catch (error) {
      maintenanceWarnings.push(`完整包已发布，但旧包归档或临时目录清理未完成：${error.message}；保留位置：${previousDir || jobRoot}`);
    }
    report('校验完成', '完整包已生成并通过校验', { state: 'succeeded', ...generated, validation,
      entry_path: path.join(destination, entryName), skeleton_path: entryName === 'whole.pve-skeleton.json' ? path.join(destination, entryName) : undefined,
      previous_dir: previousDir, maintenance_warnings: maintenanceWarnings });
  } catch (error) {
    if (moved && !published) await renamePackageDirectory(previous, destination);
    const detail = ['EPERM','EACCES','EBUSY'].includes(error.code)
      ? '文件被占用或没有写入权限，请关闭使用该文件的程序后重试。\n' + error.message : error.message;
    report(stage, detail, { state: 'failed', error: error.stack, failed_directory: fs.existsSync(staging) ? staging : null });
    throw error;
  } finally {
    if (lock !== undefined) { fs.closeSync(lock); fs.unlinkSync(lockPath); }
  }
}
