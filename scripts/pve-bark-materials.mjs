import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeBarkMaterial, barkTextureFiles, BARK_MAP_SLOTS } from '../web/bark-materials.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const materialSlots = { color: 'map', normal: 'normalMap', roughness: 'roughnessMap' };
export function barkTextureTransform(texture) {
  if (!texture) return null;
  texture.updateMatrix();
  return { repeat: texture.repeat.toArray(), offset: texture.offset.toArray(), center: texture.center.toArray(),
    rotation: texture.rotation, matrix: texture.matrix.toArray(), wrap: 'REPEAT' };
}
export function snapshotPveBarkBinding(material) {
  if (material?.name !== 'M_Bark' || !material.userData?.bark_material) return null;
  const recipe = normalizeBarkMaterial(material.userData.bark_material);
  const transforms = Object.fromEntries(BARK_MAP_SLOTS.map(slot => [slot, barkTextureTransform(material[materialSlots[slot]])]));
  // Variant extraction strips browser textures only after taking this snapshot.
  const previous = material.userData.bark_pve_binding;
  return { recipe, texture_transforms: BARK_MAP_SLOTS.every(slot => transforms[slot]) ? transforms : previous?.texture_transforms,
    base_color_linear: material.color.toArray(), roughness: material.roughness,
    normal_scale: material.normalScale.toArray() };
}

export function createPveBarkExporter(output) {
  const records = new Map();
  function binding(material) {
    const data = snapshotPveBarkBinding(material); if (!data) return null;
    if (!data.texture_transforms) throw Error('新树皮缺少实际纹理铺贴信息');
    const id = 'bark-' + sha(JSON.stringify([data.recipe, data.base_color_linear, data.roughness, data.normal_scale])).slice(0, 24).toLowerCase();
    if (!records.has(id)) {
      const maps = {};
      for (const image of barkTextureFiles(data.recipe, id)) {
        fs.writeFileSync(path.join(output, image.name), image.bytes);
        maps[image.key] = { file: image.name, width: image.width, height: image.height, sha256: sha(image.bytes),
          color_space: image.key === 'color' ? 'srgb' : 'linear' };
      }
      records.set(id, { id, material_role: 'bark', base_color_linear: data.base_color_linear,
        roughness: data.roughness, normal_scale: data.normal_scale, maps });
    }
    return { material_id: id, texture_transforms: data.texture_transforms };
  }
  function capture(group) {
    group.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      for (const material of [mesh.material].flat().filter(Boolean)) {
        const item = binding(material); if (item) material.userData.bark_pve_binding = item;
      }
    });
  }
  function glbBindings(bytes) {
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    const items = (json.materials || []).flatMap((material, material_index) => material.extras?.bark_pve_binding
      ? [{ material_index, ...material.extras.bark_pve_binding }] : []);
    return items.length ? items : null;
  }
  function finish() {
    if (!records.size) return null;
    const script = 'setup_bark_materials.py', readme = '树皮材质说明.txt';
    const scriptBytes = fs.readFileSync(new URL('./pve-bark-setup.py', import.meta.url));
    const readmeBytes = Buffer.from('树鸭儿 · 真实树皮材质\n\nwhole.resolved.json 的 bark_materials 保存真实颜色、法线、粗糙度 PNG。每个 chunk 的 bark_material_binding 保存实际铺贴矩阵；完整单元 GLB 的材质槽绑定在 complete_units.manifest.json 的 units[].bark_material_bindings。叶花果和完整模型件的分区保持原规则。\n\n旧 UE 桥接只有一套 AssemblyBarkMaterial，不消费多套树皮槽。请在 Unreal Python 中运行 setup_bark_materials.py，调用 setup(package_directory, unreal_content_folder)。脚本按每种实际铺贴创建材质并输出 chunk/完整模型槽绑定表；只能当承重骨架与完整单元枝的所有木枝均已使用同一新配方、同一铺贴时，才会返回 AssemblyBarkMaterial 的单材质桥接候选。多配方、多铺贴或混合旧树皮必须由 UE 原生桥接按 chunk 使用材料表；不要仅指派其中一项。\n\n脚本会按 OpenGL 法线导入约定翻转法线绿通道，颜色使用 sRGB，法线与粗糙度为线性。材质节点明确还原颜色倍率、法线强度、粗糙度和纹理矩阵。此脚本未在本轮启动 UE 实际验证。整树/PVE 的几何、坐标与完整单元模型通路沿用原已验证约定。\n\nGLB 中的软件 UV 原样保留：铺贴使用 transform(UV)。实际装配二进制按既有约定将 V 翻转，因此新树皮先恢复 (u, 1-v) 再乘铺贴矩阵。PNG 是程序 DataTexture 的原始 RGBA 行顺序；不再额外翻转采样结果。\n', 'utf8');
    fs.writeFileSync(path.join(output, script), scriptBytes); fs.writeFileSync(path.join(output, readme), readmeBytes);
    return { materials: [...records.values()], setup: { script, script_sha256: sha(scriptBytes), readme, readme_sha256: sha(readmeBytes),
      texture_origin: 'DataTexture_row_zero', resolved_uv_input: 'U_one_minus_V', unit_glb_uv_input: 'U_V',
      existing_ue_bridge: 'single_bark_slot_without_texture_bindings', ue_material_application_verified: false } };
  }
  return { binding, capture, glbBindings, finish };
}
