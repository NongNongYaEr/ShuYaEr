import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { snapshotPveBarkBinding } from './pve-bark-materials.mjs';
const sampleGeometryHashes = new WeakMap();

// Compact meshes owned by a complete unit, with the same lookup association
// used by the resolved assembly. No whole-tree clone or geometry regeneration.
export function extractPveUnitGeometry(asset, plan, atlas) {
  const elementOwners = asset.elements.map(element => element.type === 'BRANCH'
    ? plan.ownerForBranch(element.id) : null);
  for (let i = 0; i < elementOwners.length; i++) {
    elementOwners[i] ||= elementOwners[asset.elements[i].parentIndex];
    if (!elementOwners[i]) throw Error('无法解析枝内几何所属实例: ' + i);
  }
  const groups = plan.units.map(() => new THREE.Group());
  if (!plan.units.some(unit => unit.variantRequired)) return groups;
  const inverses = plan.units.map(unit => unit.transform.clone().invert());
  let triangles = 0;
  asset.group.updateWorldMatrix(true, true);
  asset.group.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry, lookup = geometry.getAttribute('uv1');
    const position = geometry.getAttribute('position');
    if (!position || Array.isArray(mesh.material)) throw Error('不支持的完整枝几何: ' + mesh.name);
    const direct = mesh.userData.stable_id || (typeof mesh.userData.branch_id === 'string' ? mesh.userData.branch_id : '');
    const directOwner = direct ? plan.ownerForBranch(direct) : null;
    const ownerCache = directOwner ? null : new Int32Array(position.count).fill(-2);
    const owner = vertex => {
      if (directOwner) return directOwner.instance_index;
      if (ownerCache[vertex] !== -2) return ownerCache[vertex];
      if (!lookup) throw Error('缺少完整枝元素关联: ' + mesh.name);
      const index = Math.floor(lookup.getY(vertex) * asset.lookupTexture.height) * asset.lookupTexture.width
        + Math.floor(lookup.getX(vertex) * asset.lookupTexture.width);
      if (!elementOwners[index]) throw Error('无效完整枝元素索引: ' + index);
      return ownerCache[vertex] = elementOwners[index].instance_index;
    };
    const buckets = new Map(), index = geometry.index;
    const count = index?.count ?? position.count;
    if (directOwner && (directOwner.instance_index < 0 || !plan.units[directOwner.instance_index].variantRequired)) {
      triangles += count / 3; return;
    }
    for (let start = 0; start < count; start += 3) {
      const triangle = [0, 1, 2].map(offset => index ? index.getX(start + offset) : start + offset);
      const instance = owner(triangle[0]);
      if (triangle.some(vertex => owner(vertex) !== instance)) throw Error('三角面跨越完整枝实例');
      triangles++;
      if (instance < 0 || !plan.units[instance].variantRequired) continue;
      if (!buckets.has(instance)) buckets.set(instance, { vertices: [], faces: [], remap: new Map() });
      const bucket = buckets.get(instance);
      for (const vertex of triangle) {
        if (!bucket.remap.has(vertex)) { bucket.remap.set(vertex, bucket.vertices.length); bucket.vertices.push(vertex); }
        bucket.faces.push(bucket.remap.get(vertex));
      }
    }
    for (const [instance, bucket] of buckets) {
      const local = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        // The element lookup belongs to this tree, not to the reusable variant.
        if (name === 'uv1') continue;
        const values = new Float32Array(bucket.vertices.length * attribute.itemSize);
        for (let v = 0; v < bucket.vertices.length; v++) for (let c = 0; c < attribute.itemSize; c++)
          values[v * attribute.itemSize + c] = attribute.getComponent(bucket.vertices[v], c);
        local.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
      }
      local.setIndex(bucket.faces);
      local.applyMatrix4(inverses[instance].clone().multiply(mesh.matrixWorld));
      const material = mesh.material.clone();
      material.name = mesh.material.name;
      material.sampleLeafMaterial = mesh.material.sampleLeafMaterial;
      const foliage = material.name === 'M_Leaf' || material.sampleLeafMaterial;
      if (foliage) {
        const texture = material.sampleLeafMaterial || asset.authoring.leaf_material;
        if (texture?.color) material.color.set(mesh.material.vegetationTint || '#ffffff');
        if (atlas) {
          const uv = local.getAttribute('uv');
          for (let v = 0; v < uv.count; v++) uv.setXY(v, ...atlas.uv(texture, uv.getX(v), uv.getY(v)));
        }
      }
      const barkBinding = snapshotPveBarkBinding(material);
      if (barkBinding) material.userData.bark_pve_binding = barkBinding;
      for (const key of Object.keys(material)) if (material[key]?.isTexture) material[key] = null;
      groups[instance].add(new THREE.Mesh(local, material));
    }
  });
  if (triangles !== asset.report.triangles) throw Error('完整枝划分丢失实际三角面');
  return groups;
}

export function hashPveUnitGeometry(group, asset = null, unit = null) {
  const hash = createHash('sha256');
  if (asset && unit) {
    // Sweep normals are recomputed from Float32 world vertices. Translating the
    // very same twig can cause a few 1e-4 of normal/tangent roundoff. Fingerprint
    // the double-precision authored content in its attachment frame instead.
    const inverse = unit.transform.clone().invert();
    const normal = new THREE.Matrix3().getNormalMatrix(inverse);
    const scale = new THREE.Vector3().setFromMatrixScale(unit.transform).x;
    const rounded = values => values.map(value => Math.round(value * 1e7));
    const point = value => rounded(value.clone().applyMatrix4(inverse).toArray());
    const direction = value => value ? rounded(value.clone().applyMatrix3(normal).normalize().toArray()) : null;
    const branches = new Map(unit.branches.map((branch, index) => [branch.stableId, index]));
    hash.update(JSON.stringify(unit.branches.map(branch => ({
      points: branch.points.map(point), radius: rounded([branch.startRadius / scale, branch.endRadius / scale]),
      profile: branch.radiusProfile, sections: branch.sections, radiusEdits: branch.radiusEdits,
      wind: [branch.windPhase, branch.windStiffness], normals: branch.surfaceNormals?.map(direction)
    }))));
    for (const placements of [unit.leaves || asset.masterPlacements, unit.organs || asset.treeOrgans]) hash.update(JSON.stringify(
      placements.filter(placement => branches.has(placement.branchStableId)).map(placement => ({
        branch: branches.get(placement.branchStableId), position: point(placement.position),
        direction: direction(placement.direction), normal: direction(placement.normal),
        scale: Math.round(placement.scale / scale * 1e7), source: placement.source,
        twist: placement.twist, phase: placement.phase, random: placement.random,
        role: placement.organRole, asset: placement.sourceAssetId
      }))));
    const used = new Set([unit.sourceAsset.id]);
    for (const branch of unit.branches) if (branch.sourceAssetId) used.add(branch.sourceAssetId);
    for (const placement of unit.organs || asset.treeOrgans) if (branches.has(placement.branchStableId) && placement.sourceAssetId) used.add(placement.sourceAssetId);
    for (const id of [...used].sort()) {
      const source = id === unit.sourceAsset.id ? unit.sourceAsset : asset.authoring.branch_library.find(item => item.id === id);
      const sample = source?.sample;
      if (sample && !sampleGeometryHashes.has(sample)) sampleGeometryHashes.set(sample,
        createHash('sha256').update(JSON.stringify([sample.leaf_meshes, sample.authoring?.tree_organs?.units])).digest('hex'));
      hash.update(sampleGeometryHashes.get(sample) || 'missing');
    }
  }
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    hash.update(JSON.stringify([mesh.material.name, mesh.material.color.toArray(),
      mesh.material.alphaTest, mesh.material.roughness]));
    if (mesh.material.userData?.bark_material) hash.update(JSON.stringify([mesh.material.userData.bark_material,
      mesh.material.userData.bark_pve_binding?.texture_transforms]));
    // Quantization eliminates inverse-frame floating point noise while retaining
    // sub-micrometre positions. Include normals, UV, tangents and wind attributes.
    for (const name of Object.keys(mesh.geometry.attributes).sort()) {
      if (asset && unit && ['position', 'normal', 'tangent'].includes(name)) continue;
      const attribute = mesh.geometry.getAttribute(name), values = new Float64Array(attribute.count * attribute.itemSize);
      for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++)
        values[i * attribute.itemSize + c] = Math.round(attribute.getComponent(i, c) * 1e6);
      hash.update(name); hash.update(Buffer.from(values.buffer));
    }
    hash.update(Buffer.from(new Uint32Array(mesh.geometry.index.array).buffer));
  });
  return hash.digest('hex').toUpperCase();
}

// Validate a content match against the actual payload before sharing a variant.
// Tolerances cover Float32 translated sweeps, not different shapes or textures.
export function equalPveUnitGeometry(left, right, { derivedTangents = false } = {}) {
  if (left.children.length !== right.children.length) return false;
  for (let i = 0; i < left.children.length; i++) {
    const a = left.children[i], b = right.children[i];
    if (a.material.name !== b.material.name || !a.material.color.equals(b.material.color)) return false;
    for (const key of ['alphaTest','roughness','metalness','opacity','transparent','side','depthWrite'])
      if (a.material[key] !== b.material[key]) return false;
    if ((a.material.userData?.bark_material || b.material.userData?.bark_material) &&
      JSON.stringify([a.material.userData?.bark_material, a.material.userData?.bark_pve_binding?.texture_transforms]) !==
      JSON.stringify([b.material.userData?.bark_material, b.material.userData?.bark_pve_binding?.texture_transforms])) return false;
    if (a.geometry.index.count !== b.geometry.index.count) return false;
    for (let index = 0; index < a.geometry.index.count; index++) if (a.geometry.index.getX(index) !== b.geometry.index.getX(index)) return false;
    const names = Object.keys(a.geometry.attributes);
    if (names.length !== Object.keys(b.geometry.attributes).length) return false;
    for (const name of names) {
      const x = a.geometry.attributes[name], y = b.geometry.attributes[name];
      if (!y || x.count !== y.count || x.itemSize !== y.itemSize) return false;
      // Complete-package tangents are reconstructed from the verified local
      // positions/normals/UVs. The renderer's world-axis fallback is not model
      // content and cannot distinguish two otherwise identical surfaces.
      if (derivedTangents && name === 'tangent') continue;
      const tolerance = name === 'position' ? 1e-6 : ['normal', 'tangent'].includes(name) ? 5e-4 : 1e-7;
      for (let vertex = 0; vertex < x.count; vertex++) for (let c = 0; c < x.itemSize; c++)
        if (!Number.isFinite(x.getComponent(vertex,c)) || !Number.isFinite(y.getComponent(vertex,c))
          || Math.abs(x.getComponent(vertex, c) - y.getComponent(vertex, c)) > tolerance) return false;
    }
  }
  return true;
}

// Rebuild derived shading data in model space, never from the tree's world
// axes. Keep degenerate UV triangles finite with a deterministic local frame.
export function rebuildPveUnitTangents(group) {
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry=mesh.geometry,normal=geometry.getAttribute('normal');
    if (!normal || !geometry.index || !geometry.getAttribute('uv')) return;
    geometry.deleteAttribute('tangent');geometry.computeTangents();
    const tangent=geometry.getAttribute('tangent'),n=new THREE.Vector3(),t=new THREE.Vector3(),axis=new THREE.Vector3();
    for(let i=0;i<tangent.count;i++) {
      t.fromBufferAttribute(tangent,i);
      if(Number.isFinite(t.lengthSq())&&t.lengthSq()>.25)continue;
      n.fromBufferAttribute(normal,i).normalize();
      axis.set(Math.abs(n.z)<.9?0:1,0,Math.abs(n.z)<.9?1:0);
      t.crossVectors(axis,n).normalize();tangent.setXYZW(i,t.x,t.y,t.z,1);
    }
  });
}

export function disposePveUnitGeometry(group) {
  group?.traverse(mesh => { mesh.geometry?.dispose(); mesh.material?.dispose(); });
}
