import * as THREE from 'three';
import { GLTFLoader } from './vendor/surface/loaders/GLTFLoader.js';
import { OBJLoader } from './vendor/surface/loaders/OBJLoader.js';
import { normalizeSurfaceGrowth, SURFACE_LIMIT } from './surface-growth-data.js';

export async function importGrowthSurface(file, { scale = 1, objUp = 'Z' } = {}) {
  if (file.size > 80 * 1024 * 1024) throw new Error('承载模型请控制在 80 MB 以内');
  let root;
  if (/\.glb$/i.test(file.name)) {
    const loader = new GLTFLoader(new THREE.LoadingManager());
    loader.manager.setURLModifier(url => { if (/^(data:|blob:)/.test(url)) return url; throw new Error('请导出资源内嵌的 GLB'); });
    loader.register(() => ({ name: 'BranchForgeReferenceOnly', loadMaterial: () => Promise.resolve(new THREE.MeshBasicMaterial()) }));
    try { root = (await loader.parseAsync(await file.arrayBuffer(), '')).scene; }
    catch (e) { throw new Error(`GLB 读取失败，请使用未压缩的静态 GLB：${e.message}`); }
  } else if (/\.obj$/i.test(file.name)) root = new OBJLoader().parse(await file.text());
  else throw new Error('请选择 GLB 或 OBJ 承载模型');
  const position = [], index = [];
  const rotation = new THREE.Matrix4().makeRotationX(/\.glb$/i.test(file.name) || objUp === 'Y' ? Math.PI / 2 : 0);
  const transform = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(rotation);
  root.updateMatrixWorld(true);
  try {
    root.traverse(o => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh || o.morphTargetInfluences?.some(v => v !== 0)) throw new Error('请先把承载模型转换为静态网格');
      const matrices = [];
      if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { const m = new THREE.Matrix4(); o.getMatrixAt(i, m); matrices.push(o.matrixWorld.clone().multiply(m)); } }
      else matrices.push(o.matrixWorld);
      for (const world of matrices) {
        const matrix = transform.clone().multiply(world), g = o.geometry, p = g.attributes.position;
        if (!p) continue;
        const count = g.index?.count ?? p.count;
        if (count % 3) throw new Error('承载模型需要三角面网格');
        if (index.length + count > SURFACE_LIMIT * 3) throw new Error('承载模型最多 10 万三角面，请先简化后导入');
        for (let i = 0; i < count; i += 3) for (const j of matrix.determinant() < 0 ? [0, 2, 1] : [0, 1, 2]) {
          const v = new THREE.Vector3().fromBufferAttribute(p, g.index ? g.index.getX(i + j) : i + j).applyMatrix4(matrix);
          index.push(position.length / 3); position.push(v.x, v.y, v.z);
        }
      }
    });
    const surface = normalizeSurfaceGrowth({ mesh: { id: crypto.randomUUID(), name: file.name, position, index } });
    if (!surface) throw new Error('没有可用的静态三角面');
    return surface;
  } finally { root.traverse(o => { o.geometry?.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m?.dispose(); }); }
}
