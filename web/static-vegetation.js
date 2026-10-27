import * as T from 'three';
import { unitPoseQuaternion } from './unit-authoring.js';
import { calibratedLeafGeometry } from './branch-kernel.js';

// Export the evaluated scene, not the viewport's instanced approximation. Only
// blades verified against the evaluated vertices become shared prototypes.
export const STATIC_POSITION_TOLERANCE = 0.000005; // metres, 0.005 mm
export const STATIC_ASSEMBLY_LIMIT = 60000; // leave room for the unique base meshes
const emptyMesh = material => ({ material, positions: [], normals: [], uvs: [], indices: [] });
const check = (ok, message) => { if (!ok) throw Error(message); };

export function planStaticVegetation(asset, sources) {
  const materials = [], materialObjects = [], bases = new Map(), prototypes = [], instances = [];
  const placements = new Map(asset.masterPlacements.map(p => [p.stableId, p]));
  const candidates = new Map();
  let triangles = 0, maxError = 0, bakedLeaves = 0;
  const materialIndex = m => {
    let id = materialObjects.indexOf(m);
    if (id < 0) {
      id = materials.length; materialObjects.push(m);
      const leaf = m.name === 'M_Leaf';
      materials.push({ name: m.name, color: (leaf ? new T.Color(m.vegetationTint || '#ffffff') : m.color).toArray(),
        roughness: m.roughness ?? .72, metalness: m.metalness || 0, doubleSided: m.side === T.DoubleSide, leaf });
    }
    return id;
  };
  const baseFor = material => { if (!bases.has(material)) bases.set(material, emptyMesh(material)); return bases.get(material); };
  const append = (target, geometry, matrix, normalMatrix, indices, start, count) => {
    const map = new Map(), p = new T.Vector3(), n = new T.Vector3();
    for (let i = start; i < start + count; i++) {
      const v = indices[i]; let out = map.get(v);
      if (out === undefined) {
        out = target.positions.length / 3; map.set(v, out);
        p.fromBufferAttribute(geometry.attributes.position, v).applyMatrix4(matrix);
        n.fromBufferAttribute(geometry.attributes.normal, v).applyMatrix3(normalMatrix).normalize();
        target.positions.push(...p.toArray()); target.normals.push(...n.toArray());
        target.uvs.push(geometry.attributes.uv.getX(v), geometry.attributes.uv.getY(v));
      }
      target.indices.push(out);
    }
  };
  asset.group.updateWorldMatrix(true, true);
  asset.group.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    check(!mesh.isInstancedMesh, '静态导出必须使用完整求值几何');
    const g = mesh.geometry, a = g.attributes;
    check(a.position && a.normal && a.uv, '当前网格缺少顶点、法线或材质 UV');
    const ix = g.index ? Array.from(g.index.array) : Array.from({ length: a.position.count }, (_, i) => i);
    check(ix.length % 3 === 0, '当前网格不是三角面'); triangles += ix.length / 3;
    const normalMatrix = new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
    if (mesh.userData.category !== 'leaf' || Array.isArray(mesh.material) || !a.uv1) {
      const slots = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = Array.isArray(mesh.material) ? g.groups : [{ start: 0, count: ix.length, materialIndex: 0 }];
      check(groups.reduce((sum, v) => sum + v.count, 0) === ix.length, '网格材质分组不完整');
      for (const range of groups) append(baseFor(materialIndex(slots[range.materialIndex])), g, mesh.matrixWorld, normalMatrix, ix, range.start, range.count);
      return;
    }
    const material = materialIndex(mesh.material), sourceIndex = mesh.userData.source_index, source = sources[sourceIndex];
    const elementAt = v => Math.floor(a.uv1.getY(v) * asset.lookupTexture.height) * asset.lookupTexture.width + Math.floor(a.uv1.getX(v) * asset.lookupTexture.width);
    let cursor = 0;
    while (cursor < ix.length) {
      const begin = cursor, element = elementAt(ix[cursor]);
      while (cursor < ix.length && elementAt(ix[cursor]) === element) {
        check(elementAt(ix[cursor + 1]) === element && elementAt(ix[cursor + 2]) === element, '叶片三角面跨越单元边界'); cursor += 3;
      }
      const placement = placements.get(asset.elements[element]?.id), sourceIndices = source?.geometry.index?.count || source?.geometry.attributes.position.count;
      const hasStem = placement && (asset.settings.petiole_length > .0001 || placement.canopyRoot);
      const stemCount = hasStem ? 24 : 0, bladeStart = begin + stemCount, bladeCount = cursor - bladeStart;
      if (!placement || !source || bladeCount !== sourceIndices || !(placement.scale > 0)) {
        append(baseFor(material), g, mesh.matrixWorld, normalMatrix, ix, begin, cursor - begin); bakedLeaves++; continue;
      }
      if (stemCount) append(baseFor(material), g, mesh.matrixWorld, normalMatrix, ix, begin, stemCount);
      const origin = placement.position.clone().addScaledVector(placement.direction.clone().normalize(), asset.settings.petiole_length);
      const q = unitPoseQuaternion(placement);
      // PointInstancer uses float32 transforms. Verify those exact values, rather
      // than validating doubles and writing lower precision values afterwards.
      const position = origin.toArray().map(Math.fround), rotation = [q.w, q.x, q.y, q.z].map(Math.fround), scale = [placement.scale, placement.scale, placement.scale].map(Math.fround);
      const matrix = new T.Matrix4().compose(new T.Vector3(...position), new T.Quaternion(rotation[1], rotation[2], rotation[3], rotation[0]).normalize(), new T.Vector3(...scale));
      const candidateKey = sourceIndex + ':' + material;
      let prototype = candidates.get(candidateKey);
      const actual = emptyMesh(material); append(actual, g, mesh.matrixWorld, normalMatrix, ix, bladeStart, bladeCount);
      if (!prototype) {
        const canonical = calibratedLeafGeometry(source.geometry, asset.settings, source.calibration);
        const local = emptyMesh(material);
        try { append(local, canonical, new T.Matrix4(), new T.Matrix3(), Array.from(canonical.index.array), 0, canonical.index.count); }
        finally { canonical.dispose(); }
        prototype = { ...local, source_index: sourceIndex, source_id: source.id || String(sourceIndex), id: prototypes.length };
        prototypes.push(prototype); candidates.set(candidateKey, prototype);
      }
      let error = 0, matches = prototype.positions.length === actual.positions.length && prototype.indices.length === actual.indices.length;
      const point = new T.Vector3(), normal = new T.Vector3(), nm = new T.Matrix3().getNormalMatrix(matrix);
      if (matches) for (let v = 0; v < actual.positions.length; v += 3) {
        point.fromArray(prototype.positions, v).applyMatrix4(matrix);
        error = Math.max(error, point.distanceTo(new T.Vector3().fromArray(actual.positions, v)));
        normal.fromArray(prototype.normals, v).applyMatrix3(nm).normalize();
        if (normal.distanceTo(new T.Vector3().fromArray(actual.normals, v)) > .00002) matches = false;
      }
      matches &&= error <= STATIC_POSITION_TOLERANCE && prototype.uvs.every((v, i) => v === actual.uvs[i]) && prototype.indices.every((v, i) => v === actual.indices[i]);
      if (!matches) { append(baseFor(material), g, mesh.matrixWorld, normalMatrix, ix, bladeStart, bladeCount); bakedLeaves++; }
      else { maxError = Math.max(maxError, error); instances.push({ id: asset.elements[element].id, prototype: prototype.id, position, rotation, scale }); }
    }
  });
  check(triangles === asset.report.triangles, '完整场景三角面数量不一致');
  const baseMeshes = [...bases.values()];
  const expanded = baseMeshes.reduce((n, m) => n + m.indices.length / 3, 0) + instances.reduce((n, i) => n + prototypes[i.prototype].indices.length / 3, 0);
  check(expanded === triangles, '静态装配遗漏或重复了几何');
  check(instances.length + bakedLeaves === asset.masterPlacements.length, '静态装配叶片数量不一致');
  return { materials, materialObjects, baseMeshes, prototypes, instances,
    summary: { branches: asset.masterBranches.length, leaves: asset.masterPlacements.length, shared_leaves: instances.length, baked_leaves: bakedLeaves,
      prototypes: prototypes.length, triangles, stored_triangles: [...baseMeshes, ...prototypes].reduce((n, m) => n + m.indices.length / 3, 0), max_position_error_m: maxError } };
}

const num = x => { check(Number.isFinite(x), '静态网格含非有限数值'); return Number(x.toPrecision(10)).toString(); };
const vector = x => '(' + x.map(num).join(', ') + ')';
const tuples = (values, width) => { const result = []; for (let i = 0; i < values.length; i += width) result.push(vector(values.slice(i, i + width))); return '[' + result.join(', ') + ']'; };
const array = values => '[' + values.map(num).join(', ') + ']';
export function staticUsdMesh(mesh, name) {
  return `def Mesh "${name}" (prepend apiSchemas = ["MaterialBindingAPI"]) {
    uniform token subdivisionScheme = "none"
    uniform token orientation = "rightHanded"
    bool doubleSided = ${mesh.doubleSided ? 'true' : 'false'}
    point3f[] points = ${tuples(mesh.positions, 3)}
    normal3f[] normals = ${tuples(mesh.normals, 3)} (interpolation = "vertex")
    texCoord2f[] primvars:st = ${tuples(mesh.uvs, 2)} (interpolation = "vertex")
    int[] faceVertexCounts = ${array(Array(mesh.indices.length / 3).fill(3))}
    int[] faceVertexIndices = ${array(mesh.indices)}
    rel material:binding = </Looks/M_${mesh.material}>
}`;
}

export function writeStaticUsd(plan) {
  const { materials, prototypes, instances, baseMeshes } = plan;
  const parts = ['#usda 1.0\n(\n defaultPrim = "Vegetation"\n upAxis = "Z"\n metersPerUnit = 1\n)\n'];
  parts.push('def Scope "Looks" {');
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i], at = `/Looks/M_${i}`;
    const texture = (name, file, normal = false) => `def Shader "${name}" {
      uniform token info:id = "UsdUVTexture"
      asset inputs:file = @./${file}@
      token inputs:sourceColorSpace = "${normal ? 'raw' : 'sRGB'}"
      token inputs:wrapS = "repeat"
      token inputs:wrapT = "repeat"
      float2 inputs:st.connect = <${at}/UV.outputs:result>
      float4 inputs:scale = ${vector(normal ? [2, 2, 2, 1] : [...m.color, 1])}
      float4 inputs:bias = ${vector(normal ? [-1, -1, -1, 0] : [0, 0, 0, 0])}
      float3 outputs:rgb
      float outputs:a
    }`;
    parts.push(`def Material "M_${i}" {
      token outputs:surface.connect = <${at}/Surface.outputs:surface>
      def Shader "UV" { uniform token info:id = "UsdPrimvarReader_float2"
        string inputs:varname = "st"
        float2 outputs:result
      }
      ${m.color_texture ? texture('Color', m.color_texture) : ''}
      ${m.normal_texture ? texture('Normal', m.normal_texture, true) : ''}
      def Shader "Surface" { uniform token info:id = "UsdPreviewSurface"
        ${m.color_texture ? `color3f inputs:diffuseColor.connect = <${at}/Color.outputs:rgb>` : `color3f inputs:diffuseColor = ${vector(m.color)}`}
        float inputs:roughness = ${num(m.roughness)}
        float inputs:metallic = ${num(m.metalness)}
        ${m.leaf && m.color_texture && (m.cutoff ?? .4) > 0 ? `float inputs:opacity.connect = <${at}/Color.outputs:a>\nfloat inputs:opacityThreshold = ${num(m.cutoff ?? .4)}` : ''}
        ${m.normal_texture ? `normal3f inputs:normal.connect = <${at}/Normal.outputs:rgb>` : ''}
        token outputs:surface
      }
    }`);
  }
  parts.push('}\ndef Xform "Vegetation" {');
  // Chunk by height at the engine's transform limit. Coordinates stay in the
  // source frame and the unique base is emitted only once, never per chunk.
  const ordered = [...instances].sort((a, b) => a.position[2] - b.position[2] || a.id.localeCompare(b.id));
  const chunks = Math.max(1, Math.ceil(ordered.length / STATIC_ASSEMBLY_LIMIT));
  for (let c = 0; c < chunks; c++) {
    const nodes = ordered.slice(c * STATIC_ASSEMBLY_LIMIT, (c + 1) * STATIC_ASSEMBLY_LIMIT), name = `Assembly_${c}`, root = `/Vegetation/${name}/Leaves`;
    parts.push(`def Xform "${name}" (prepend apiSchemas = ["NaniteAssemblyRootAPI"]) {\n uniform token unreal:naniteAssembly:meshType = "staticMesh"`);
    if (c === 0) baseMeshes.forEach((m, i) => parts.push(staticUsdMesh({ ...m, doubleSided: materials[m.material].doubleSided }, `Base_${i}`)));
    if (nodes.length) {
      parts.push(`def PointInstancer "Leaves" {
        rel prototypes = [${prototypes.map((_, i) => `<${root}/Prototypes/Leaf_${i}>`).join(', ')}]
        int[] protoIndices = ${array(nodes.map(n => n.prototype))}
        point3f[] positions = ${tuples(nodes.flatMap(n => n.position), 3)}
        quatf[] orientationsf = ${tuples(nodes.flatMap(n => n.rotation), 4)}
        float3[] scales = ${tuples(nodes.flatMap(n => n.scale), 3)}
        def Scope "Prototypes" {`);
      prototypes.forEach((m, i) => parts.push(staticUsdMesh({ ...m, doubleSided: materials[m.material].doubleSided }, `Leaf_${i}`)));
      parts.push('}\n}');
    }
    parts.push('}');
  }
  parts.push('}\n');
  return { text: parts.join('\n'), chunks, orderedInstances: ordered };
}
