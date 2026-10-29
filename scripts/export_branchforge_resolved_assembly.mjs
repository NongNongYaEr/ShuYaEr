/** Preserve software-resolved complete units without creating additional UE source assets. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { checkPveGeometry } from './pve-geometry-quality.mjs';
import { createPveBarkExporter } from './pve-bark-materials.mjs';
import {createImportedTrunkSkinExporter} from './imported-trunk-skin.mjs';
import {createImportedTrunkMaterialExporter} from './imported-trunk-materials.mjs';

export async function exportResolvedAssembly({ tool, document, skeleton, output, sourceSha256, onQualityWarnings = () => {},
  asset: suppliedAsset = null, completeVineUnit = false, atlas = null, exportPlan = null, barkExporter = null }) {
  const imp = p => import(pathToFileURL(path.join(tool, p)).href);
  const k = await imp('web/branch-kernel.js');
  const { normalizeAuthoring } = await imp('web/authoring-state.js');
  const T = await imp('web/vendor/three.module.min.js');
  const settings = k.normalizeSettings(document.settings);
  const authoring = normalizeAuthoring(document.authoring, settings.seed);
  const sources = suppliedAsset ? [] : document.leaf_meshes.map(s => ({ ...s, geometry: k.deserializeGeometry(s.geometry) }));
  const indices = new Map(authoring.branch_instances.map((i, index) => [i.id, index]));
  const branchIds = new Set(skeleton.branches.map(b => b.id));
  const instanceData = skeleton.foliage;
  const buffers = [], chunks = [];
  const bark = barkExporter || createPveBarkExporter(output);
  const importedMaterials=createImportedTrunkMaterialExporter(output);
  let offset = 8, vertexCount = 0, triangleCount = 0, asset;
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  try {
    asset = suppliedAsset || k.buildBranchAsset(settings, null, sources, 0, authoring);
    onQualityWarnings(checkPveGeometry(asset.report, completeVineUnit ? '藤蔓实际装配' : '整树实际装配'));
    // Mirror applyLeafMaterial without loading browser images. The atlas replaces
    // the default green; an explicitly authored source tint still multiplies it.
    if (authoring.leaf_material?.color) {
      asset.group.traverse(object => {
        for (const material of [object.material].flat().filter(Boolean))
          if (material.name === 'M_Leaf' || material.sampleLeafMaterial) material.color.set(material.vegetationTint || '#ffffff');
      });
    }
    const trunkSkin=createImportedTrunkSkinExporter(output,asset);
    const branchById = new Map(asset.masterBranches.map(b => [b.stableId, b]));
    const vineOwner = completeVineUnit ? { instance_index: 0, source_index: 0, host_branch_id: instanceData[0].branch_id } : null;
    const ownerForBranch = id => {
      if (exportPlan) return exportPlan.ownerForBranch(id);
      const branch = branchById.get(id);
      if (!branch) throw Error('几何缺少所属枝条: ' + id);
      if (vineOwner && id !== vineOwner.host_branch_id) return vineOwner;
      const instance = branch.instanceId ? indices.get(branch.instanceId) : -1;
      if (instance === undefined) throw Error('未知次枝实例: ' + branch.instanceId);
      const host = instance >= 0 ? authoring.branch_instances[instance].parent : branch.stableId;
      if (!branchIds.has(host)) throw Error('几何缺少承重枝: ' + host);
      return { instance_index: instance, source_index: instance >= 0 ? instanceData[instance].source_index : -1, host_branch_id: host };
    };
    const elementOwners = asset.elements.map(e => {
      if (e.type === 'BRANCH') return ownerForBranch(e.id);
      return vineOwner;
    });
    for (let i = 0; i < elementOwners.length; i++) {
      if (!elementOwners[i]) elementOwners[i] = elementOwners[asset.elements[i].parentIndex];
      if (!elementOwners[i]) throw Error('无法解析枝内几何所属实例: ' + i);
    }
    asset.group.updateWorldMatrix(true, true);
    asset.group.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      const g = mesh.geometry;
      const pos = g.getAttribute('position'), normal = g.getAttribute('normal'), uv = g.getAttribute('uv');
      const tangent = g.getAttribute('tangent'), lookup = g.getAttribute('uv1');
      if (!pos || !normal || !uv || !tangent || Array.isArray(mesh.material)) throw Error('不支持的几何属性: ' + mesh.name);
      const role = mesh.material.name === 'M_Bark' ? 'bark' : (mesh.material.name === 'M_Leaf' || mesh.material.sampleLeafMaterial) ? 'foliage' : null;
      if (!role) throw Error('需要定义材质语义: ' + mesh.material.name);
      const barkBinding = role === 'bark' ? bark.binding(mesh.material) : null;
      const trunkBinding=importedMaterials.binding(mesh.material);
      const directId = mesh.userData.stable_id || (typeof mesh.userData.branch_id === 'string' ? mesh.userData.branch_id : '');
      const directOwner = directId ? ownerForBranch(directId) : null;
      const getOwner = v => {
        if (directOwner) return directOwner;
        if (!lookup) throw Error('缺少枝内元素关联: ' + mesh.name);
        const e = Math.floor(lookup.getY(v) * asset.lookupTexture.height) * asset.lookupTexture.width + Math.floor(lookup.getX(v) * asset.lookupTexture.width);
        if (!elementOwners[e]) throw Error('无效枝内元素索引: ' + e);
        return elementOwners[e];
      };
      const buckets = new Map(), rawIndices = g.index?.array;
      const count = rawIndices?.length || pos.count;
      for (let f = 0; f < count; f += 3) {
        const tri = [0, 1, 2].map(j => rawIndices ? rawIndices[f + j] : f + j);
        const owner = getOwner(tri[0]);
        if (tri.some(v => getOwner(v).instance_index !== owner.instance_index || getOwner(v).host_branch_id !== owner.host_branch_id)) throw Error('三角面跨越次枝实例');
        const key = owner.instance_index + ':' + owner.host_branch_id;
        if (!buckets.has(key)) buckets.set(key, { owner, vertices: [], map: new Map(), faces: [] });
        const bucket = buckets.get(key);
        const local = tri.map(v => {
          if (!bucket.map.has(v)) { bucket.map.set(v, bucket.vertices.length); bucket.vertices.push(v); }
          return bucket.map.get(v);
        });
        // UE has the opposite coordinate handedness AND front-face convention.
        // Reflect Y but retain source indices, as UE's glTF importer does.
        bucket.faces.push(local[0], local[1], local[2]);
      }
      const normalMatrix = new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
      const p = new T.Vector3(), n = new T.Vector3(), t = new T.Vector3();
      for (const bucket of buckets.values()) {
        const vb = Buffer.allocUnsafe(bucket.vertices.length * 48);
        bucket.vertices.forEach((v, i) => {
          p.fromBufferAttribute(pos, v).applyMatrix4(mesh.matrixWorld);
          n.fromBufferAttribute(normal, v).applyMatrix3(normalMatrix).normalize();
          t.set(tangent.getX(v), tangent.getY(v), tangent.getZ(v)).transformDirection(mesh.matrixWorld);
          const texture=mesh.material.sampleLeafMaterial || authoring.leaf_material;
          const mappedUv=atlas && role==='foliage' ? atlas.uv(texture,uv.getX(v),uv.getY(v)) : [uv.getX(v),uv.getY(v)];
          const values = [p.x * 100, -p.y * 100, p.z * 100, n.x, -n.y, n.z,
            mappedUv[0], trunkBinding?mappedUv[1]:1-mappedUv[1], t.x, -t.y, t.z, tangent.getW(v)];
          values.forEach((value, c) => {
            if (!Number.isFinite(value)) throw Error('几何含非有限数值');
            vb.writeFloatLE(value, i * 48 + c * 4);
          });
          for (let a = 0; a < 3; a++) {
            const value = vb.readFloatLE(i * 48 + a * 4);
            bounds.min[a] = Math.min(bounds.min[a], value); bounds.max[a] = Math.max(bounds.max[a], value);
          }
        });
        const ib = Buffer.allocUnsafe(bucket.faces.length * 4);
        bucket.faces.forEach((index, i) => ib.writeUInt32LE(index, i * 4));
        const vertexColors=importedMaterials.vertexColors(mesh,bucket.vertices),trunkSkinBinding=trunkSkin.add(mesh,bucket.vertices,chunks.length);
        chunks.push({ ...bucket.owner, material_role: role, color_linear: mesh.material.color.toArray(),
          ...(trunkBinding?{imported_trunk_material:trunkBinding}:{}),...(trunkSkinBinding?{imported_trunk_skin:trunkSkinBinding}:{}),...(vertexColors?{vertex_colors:vertexColors}:{}),
          ...(barkBinding ? { bark_material_binding: barkBinding } : {}),
          vertex_offset: offset, vertex_count: bucket.vertices.length,
          index_offset: offset + vb.length, index_count: bucket.faces.length });
        buffers.push(vb, ib); offset += vb.length + ib.length;
        vertexCount += bucket.vertices.length; triangleCount += bucket.faces.length / 3;
      }
    });
    if (triangleCount !== asset.report.triangles) throw Error('装配几何三角面丢失');
    const file = 'whole.resolved.bin';
    const fd = fs.openSync(path.join(output, file), 'w');
    const hash = createHash('sha256'), hash1 = createHash('sha1');
    const header = Buffer.from('BFRA0001');
    try {
      fs.writeSync(fd, header); hash.update(header); hash1.update(header);
      for (const b of buffers) { fs.writeSync(fd, b); hash.update(b); hash1.update(b); }
    } finally { fs.closeSync(fd); }
    const summary = { vertices: vertexCount, triangles: triangleCount, bounds_cm: bounds,
      branches: asset.masterBranches.length, leaves: asset.masterPlacements.length, organs: asset.treeOrgans.length,
      source_meshes: skeleton.foliage_sources.length, unit_instances: instanceData.length };
    const metadata = { format: 'BranchForgeResolvedAssembly', version: 1, binary: file, binary_bytes: offset,
      binary_sha256: hash.digest('hex').toUpperCase(), binary_sha1: hash1.digest('hex').toUpperCase(), source_sha256: sourceSha256,
      coordinate_system: 'UE_centimeter_X_negativeY_Z', vertex_stride: 48,
      winding_policy: 'reflect_Y_retain_source_indices_UE_clockwise_front_face',
      uv_policy: 'UE_top_left_V_is_one_minus_software_V_sample_without_extra_flip',
      branches: skeleton.branches, sources: skeleton.foliage_sources, instances: instanceData, chunks, summary };
    const barkData = bark.finish();
    const trunkData=importedMaterials.finish();
    if(trunkData)metadata.imported_trunk_materials=trunkData;const skin=trunkSkin.finish();if(skin){skin.instructions='树干UE导出说明.txt';metadata.imported_trunk_skin=skin;fs.writeFileSync(path.join(output,'树干UE导出说明.txt'),`雕刻 / AI 树干 · UE 5.8 交付

1. 启用本版树鸭儿 UE 插件、Procedural Vegetation Editor、Dynamic Wind 和 Nanite Foliage。
2. 用 UE 工作台导入 whole.pve-skeleton.json，生成并保存 PVE 图。请保留包内所有模型、贴图、JSON 和二进制文件。
3. 在 PowerShell 中运行包内脚本：
   & './export_imported_trunk_assets.ps1' -UnrealEditorCmd '你的UE/Engine/Binaries/Win64/UnrealEditor-Cmd.exe' -ProjectFile '你的工程.uproject' -GraphAsset '/Game/你的目录/PVE_树.PVE_树' -OutputFolder '/Game/一个新的输出目录'
4. 脚本在后台输出 SM_Trunk（静态）、SK_Trunk（原模权重及完整单元枝装配）和 SKEL_Trunk，并启动新进程复读检查；既有资产不会被覆盖。
5. 风动请使用 SK_Trunk 的 Instanced Skinned Mesh 组件与 Dynamic Wind 变换提供器；普通 Static Mesh 只显示静态造型。控制点已经绑定，根部固定，完整单元枝仍共享模型。

源工程、UV、原材质与原网格保留。后台复读通过不等于实际风动造型验收；请在自己的工程与风力设置下检查。
`,'utf8');skin.ue_export='export_imported_trunk_assets.ps1';fs.copyFileSync(new URL('./export_imported_trunk_assets.ps1',import.meta.url),path.join(output,skin.ue_export));fs.copyFileSync(new URL('./finalize_imported_trunk_binding.py',import.meta.url),path.join(output,skin.setup));}
    if (barkData) { metadata.bark_materials = barkData.materials; metadata.bark_material_setup = barkData.setup; }
    fs.writeFileSync(path.join(output, 'whole.resolved.json'), JSON.stringify(metadata) + '\n');
    return { manifest: 'whole.resolved.json', binary: file, source_sha256: sourceSha256, ...summary,
      ...(skin ? { imported_trunk: { version:1, ue_export:skin.ue_export, instructions:'树干UE导出说明.txt' } } : {}),
      ...(barkData ? { bark_materials: { manifest: 'whole.resolved.json', material_count: barkData.materials.length,
        setup: barkData.setup, ue_material_application_verified: false } } : {}) };
  } finally {
    if (!suppliedAsset) k.disposeBranchAsset(asset);
    sources.forEach(s => s.geometry.dispose());
  }
}
