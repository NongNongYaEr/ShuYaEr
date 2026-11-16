import {isZeroAreaTriangle} from './triangle-area.js';
import {decodeSculptArray,encodeSculptArray,sculptIndexHash} from './model-sculpt-patch.js';
import {sculptVertexGroups} from './model-sculpt-topology.js';

const inspected = new WeakMap();
const applied = new WeakMap();

export function inspectDirectTrunkGeometry(model) {
  const cached = inspected.get(model.primitives);
  if (cached) return cached;
  const removed = new Map();
  let faces = 0;
  let total = 0;
  for (const primitive of model.primitives) {
    const {position,index} = primitive.geometry;
    const rows = [];
    total += index.length / 3;
    for (let i = 0; i < index.length; i += 3) {
      const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
      if (isZeroAreaTriangle(position[a],position[a+1],position[a+2],
        position[b],position[b+1],position[b+2],position[c],position[c+1],position[c+2])) rows.push(i / 3);
    }
    if (rows.length) {
      removed.set(primitive.id, rows);
      faces += rows.length;
    }
  }
  const result = {faces,total,removed};
  inspected.set(model.primitives, result);
  return result;
}

function filterIndices(index, removed) {
  const filtered = new Array(index.length - removed.length * 3);
  let next = 0, output = 0;
  for (let face = 0; face < index.length / 3; face++) {
    if (face === removed[next]) { next++; continue; }
    const i = face * 3;
    filtered[output++] = index[i];
    filtered[output++] = index[i + 1];
    filtered[output++] = index[i + 2];
  }
  if (next !== removed.length) throw Error('树干清理记录的面号无效。');
  return filtered;
}

function rawRows(record, additional) {
  const earlier = decodeSculptArray(record.removed, Uint32Array);
  const result = new Uint32Array(earlier.length + additional.length);
  let old = 0, added = 0, output = 0, retained = 0;
  for (let face = 0; face < record.sourceFaces; face++) {
    if (face === earlier[old]) {
      result[output++] = face;
      old++;
    } else if (retained++ === additional[added]) {
      result[output++] = face;
      added++;
    }
  }
  if (old !== earlier.length || added !== additional.length) throw Error('树干清理记录与当前模型不匹配。');
  return result;
}

export function applyTrunkGeometryCleanup(primitives, cleanup) {
  if (!cleanup || applied.get(primitives) === cleanup.id) return primitives;
  if (cleanup.version !== 1 || !/^[a-f0-9]{32}$/.test(cleanup.id) || !Array.isArray(cleanup.primitives)) {
    throw Error('树干清理记录无效。');
  }
  const records = new Map(cleanup.primitives.map(record => [record.id, record]));
  if (records.size !== cleanup.primitives.length) throw Error('树干清理记录包含重复网格。');
  let changed = false;
  const result = [];
  for (const primitive of primitives) {
    const record = records.get(primitive.id);
    if (!record) { result.push(primitive); continue; }
    records.delete(primitive.id);
    const {index} = primitive.geometry;
    const rows = decodeSculptArray(record.removed, Uint32Array);
    const remainingFaces = record.sourceFaces - rows.length;
    const hash = sculptIndexHash(index);
    if (index.length === remainingFaces * 3 && hash === record.resultIndex) {
      result.push(primitive);
      continue;
    }
    if (index.length !== record.sourceFaces * 3 || hash !== record.sourceIndex) {
      throw Error('树干清理记录与原模型的面顺序不匹配。');
    }
    const filtered = filterIndices(index, rows);
    if (sculptIndexHash(filtered) !== record.resultIndex) throw Error('树干清理记录校验失败。');
    if (filtered.length) result.push({...primitive, geometry:{...primitive.geometry, index:filtered}});
    changed = true;
  }
  for (const record of records.values()) {
    if (decodeSculptArray(record.removed, Uint32Array).length !== record.sourceFaces) {
      throw Error('树干清理记录引用了缺失网格。');
    }
  }
  const output = changed ? result : primitives;
  applied.set(output, cleanup.id);
  return output;
}

function filterSculptMask(model, dropped) {
  if (!model.sculptMask || !dropped.size) return model.sculptMask;
  let mask = decodeSculptArray(model.sculptMask, Uint8Array);
  const vertices = model.primitives.reduce((sum,p) => sum + p.geometry.position.length / 3, 0);
  if (mask.length !== vertices) {
    const position = new Float32Array(vertices * 3);
    let offset = 0;
    for (const primitive of model.primitives) {
      position.set(primitive.geometry.position, offset);
      offset += primitive.geometry.position.length;
    }
    const {groups,representatives} = sculptVertexGroups(position);
    if (mask.length !== representatives.length) throw Error('雕刻选区与树干网格不匹配。');
    mask = Uint8Array.from(groups, group => mask[group]);
  }
  const result = new Uint8Array(vertices);
  let source = 0, target = 0;
  for (const primitive of model.primitives) {
    const count = primitive.geometry.position.length / 3;
    if (!dropped.has(primitive.id)) {
      result.set(mask.subarray(source, source + count), target);
      target += count;
    }
    source += count;
  }
  return encodeSculptArray(result.subarray(0, target));
}

export function createDirectTrunkCleanCopy(model, plan = inspectDirectTrunkGeometry(model)) {
  if (!plan.faces) return model;
  if (plan.faces === plan.total) throw Error('树干的三角面在三维空间里全部没有面积，请换一个模型。');
  const id = crypto.randomUUID().replaceAll('-', '');
  const records = new Map((model.geometry_cleanup?.primitives || []).map(record => [record.id, record]));
  const dropped = new Set();
  const primitives = [];
  for (const primitive of model.primitives) {
    const rows = plan.removed.get(primitive.id);
    if (!rows) { primitives.push(primitive); continue; }
    const {index} = primitive.geometry;
    const prior = records.get(primitive.id);
    const filtered = filterIndices(index, rows);
    records.set(primitive.id, {
      id: primitive.id, sourceFaces: prior?.sourceFaces ?? index.length / 3,
      sourceIndex: prior?.sourceIndex ?? sculptIndexHash(index), resultIndex: sculptIndexHash(filtered),
      removed: encodeSculptArray(prior ? rawRows(prior, rows) : Uint32Array.from(rows)),
    });
    if (filtered.length) primitives.push({...primitive, geometry:{...primitive.geometry, index:filtered}});
    else dropped.add(primitive.id);
  }
  const geometry_cleanup = {version:1,id,primitives:[...records.values()]};
  const binding = {...model.binding};
  if (dropped.size && binding.primitive_guides) {
    binding.primitive_guides = Object.fromEntries(Object.entries(binding.primitive_guides).filter(([key]) => !dropped.has(key)));
  }
  if (dropped.size && binding.weight_repairs) {
    const meshes = binding.weight_repairs.meshes.filter(mesh => !dropped.has(mesh.id));
    if (meshes.length) binding.weight_repairs = {...binding.weight_repairs, meshes};
    else delete binding.weight_repairs;
  }
  const next = {...model, id:'TRUNK_CLEAN_'+id, revision:1, geometry_cleanup, binding,
    primitives, triangles:plan.total - plan.faces};
  if (next.sculpt) {
    const patches = next.sculpt.primitives.filter(patch => !dropped.has(patch.id)).map(patch => {
      const record = records.get(patch.id);
      return record ? {...patch,topology:record.resultIndex} : patch;
    });
    next.sculpt = {...next.sculpt,primitives:patches};
    next.sculptMask = filterSculptMask(model, dropped);
  }
  if (next.material_workflow) {
    // Material paint and other face-based data stay in the original project.
    // Its geometry fingerprint remains the source of truth for material re-entry.
    next.material_workflow = {...next.material_workflow,rigConfirmed:false};
    delete next.material_workflow.rigValidation;
  }
  applied.set(primitives, id);
  inspected.set(primitives, {faces:0,total:next.triangles,removed:new Map()});
  return next;
}
