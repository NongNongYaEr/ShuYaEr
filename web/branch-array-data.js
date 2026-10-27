import { profileValue } from './generator-data.js';
const number = (v, min, max, fallback) => Math.max(min, Math.min(max, Number.isFinite(+v) ? +v : fallback));
export function normalizeBranchArrays(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter((g) => g && typeof g.id === 'string').slice(0, 16).map((g) => ({
    id: g.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48), name: String(g.name || '枝簇排列').slice(0, 64), parent: String(g.parent || '').slice(0, 128), asset_id: String(g.asset_id || '').slice(0, 128),
    palette: (Array.isArray(g.palette) ? g.palette : []).filter((p) => p && typeof p.asset_id === 'string').slice(0, 12).map((p) => ({ asset_id: p.asset_id.slice(0, 128), weight: number(p.weight, 0, 100, 1) })),
    mix: ['ALTERNATE', 'SEQUENCE', 'RANDOM'].includes(g.mix) ? g.mix : 'ALTERNATE',
    locked: [...new Set((Array.isArray(g.locked) ? g.locked : []).filter((id) => typeof id === 'string'))].slice(0, 256),
    removed: [...new Set((Array.isArray(g.removed) ? g.removed : []).filter((id) => typeof id === 'string' && id.length <= 128))].slice(0, 256),
    identity_version: g.identity_version === 2 ? 2 : 1,
    member_ids: Object.fromEntries(Object.entries(g.member_ids || {}).slice(0, 256).filter(([slot, id]) => /^(?:[0-9]|[12][0-9]|3[01]):[0-7]$/.test(slot) && typeof id === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(id))),
    member_indices: Object.fromEntries(Object.entries(g.member_indices || {}).slice(0, 256).filter(([slot]) => /^(?:[0-9]|[12][0-9]|3[01]):[0-7]$/.test(slot)).map(([slot, index]) => [slot, Math.round(number(index, 0, 1023, 0))])),
    placement_baselines: Object.fromEntries(Object.entries(g.placement_baselines || {}).slice(0, 256).filter(([id, record]) => /^[a-zA-Z0-9_.-]{1,128}$/.test(id) && record && typeof record === 'object').map(([id, record]) => [id, arrayPlacement(record)])),
    replacements: Object.fromEntries(Object.entries(g.replacements || {}).slice(0, 256).filter(([, value]) => typeof value === 'string').map(([id, value]) => [id.slice(0, 128), value.slice(0, 128)])),
    start: number(g.start, 0.02, 0.97, 0.25), end: number(g.end, 0.03, 0.98, 0.85), count: Math.round(number(g.count, 1, 32, 5)), spacing: number(g.spacing, 0.01, 10, 0.25),
    distribution: g.distribution === 'SPACING' ? 'SPACING' : 'COUNT', arrangement: ['ALTERNATE', 'PAIR', 'RING'].includes(g.arrangement) ? g.arrangement : 'ALTERNATE', ringCount: Math.round(number(g.ringCount, 2, 8, 3)),
    angle: number(g.angle, 0, 180, 45), azimuth: number(g.azimuth, -180, 180, 0), scale: number(g.scale, 0.05, 5, 0.7), variation: number(g.variation, 0, 0.5, 0.1), seed: Math.round(number(g.seed, 1, 2147483646, 1)),
    layerOffset: number(g.layerOffset, -180, 180, 25),
    profiles: Object.fromEntries(['length', 'angle', 'radius'].map((key) => [key, [0, 1, 2].map((i) => number(g.profiles?.[key]?.[i], 0.05, 2, 1))])),
  })).filter((g) => { if (seen.has(g.id)) return false; seen.add(g.id); if (g.end <= g.start) g.end = Math.min(0.98, g.start + 0.01); return true; });
}
function pathLengths(parent) { const lengths = [0]; parent.points.slice(1).forEach((p, i) => lengths.push(lengths.at(-1) + p.distanceTo(parent.points[i]))); return lengths; }
function distanceAt(lengths, t) { const at = t * (lengths.length - 1), i = Math.min(lengths.length - 2, Math.floor(at)); return lengths[i] + (lengths[i + 1] - lengths[i]) * (at - i); }
function parameterAt(lengths, d) { let i = 1; while (i < lengths.length - 1 && lengths[i] < d) i++; return (i - 1 + (d - lengths[i - 1]) / Math.max(1e-9, lengths[i] - lengths[i - 1])) / (lengths.length - 1); }
export function generateArrayInstances(group, shape, parent, library = [], options = {}) {
  if (!parent || !shape) return [];
  const lengths = pathLengths(parent), start = distanceAt(lengths, group.start), end = distanceAt(lengths, group.end);
  const count = group.distribution === 'SPACING' ? Math.min(32, Math.floor((end - start) / group.spacing) + 1) : group.count;
  const copies = group.arrangement === 'PAIR' ? 2 : group.arrangement === 'RING' ? group.ringCount : 1, result = [];
  let seed = group.seed >>> 0; const randomValues = [];
  const randomAt = index => { while (randomValues.length <= index) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; randomValues.push(seed / 4294967296 * 2 - 1); } return randomValues[index]; };
  const palette = (group.palette || []).filter((p) => p.weight > 0), total = palette.reduce((sum, p) => sum + p.weight, 0);
  if (group.palette?.length && !palette.length) throw new Error('至少一种素材的权重需大于 0');
  const choiceRandom = (index) => { let x = (group.seed + Math.imul(index + 1, 7919)) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x7feb352d); x = Math.imul(x ^ (x >>> 15), 0x846ca68b); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const choose = (index, size) => {
    if (!palette.length) return group.asset_id;
    if (group.mix === 'ALTERNATE') return palette[index % palette.length].asset_id;
    let cursor = (group.mix === 'SEQUENCE' ? (index + 0.5) / size : choiceRandom(index)) * total;
    return (palette.find((p) => (cursor -= p.weight) < 0) || palette.at(-1)).asset_id;
  };
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0.5 : i / (count - 1), d = group.distribution === 'SPACING' ? start + i * group.spacing : start + u * (end - start);
    for (let j = 0; j < copies; j++) {
      const index = i * copies + j, slot = `${i}:${j}`;
      const stableIndex = group.member_indices?.[slot] ?? (group.identity_version === 2 ? i * 8 + j : index);
      const v = 1 + randomAt(stableIndex) * group.variation;
      const memberId = group.member_ids?.[slot] || (group.identity_version === 2 ? `${group.id}_S${i}_P${j}` : `${group.id}_${index}`);
      if (!options.includeRemoved && group.removed?.includes(memberId)) continue;
      const assetId = group.replacements?.[memberId] || choose(index, count * copies), memberShape = library.find((item) => item.id === assetId)?.shape || (assetId === group.asset_id ? shape : null);
      if (!memberShape) throw new Error(`排列素材缺失：${assetId}`);
      const azimuth = group.azimuth + (copies === 1 ? (i % 2) * 180 : j * 360 / copies + (i % 2 ? group.layerOffset ?? 25 : 0));
      result.push({ id: memberId, array_id: group.id, array_index: index, array_station: i, array_spoke: j, asset_id: assetId, linked: true, pinned_revision: 0, shape: structuredClone(memberShape), parent: group.parent,
        attach: parameterAt(lengths, d), angle: Math.min(180, group.angle * profileValue(group.profiles.angle, u)), azimuth: ((azimuth + 540) % 360) - 180, roll: 0,
        scale: number(group.scale * profileValue(group.profiles.length, u) * v, 0.05, 5, 1), radius_scale: number(profileValue(group.profiles.radius, u), 0.05, 5, 1), variation: 0, seed: Math.round(number(group.seed + stableIndex, 1, 2147483646, 1)), frame: null });
    }
  }
  return result;
}
// Library association is independent from placement ownership. These fields
// describe only the mount made by this group's generator, never sample payloads.
export function arrayPlacement(record) {
  return Object.fromEntries(['parent', 'asset_id', 'attach', 'angle', 'azimuth', 'roll', 'scale', 'radius_scale', 'variation', 'seed', 'frame'].filter(key => record[key] !== undefined).map(key => [key, structuredClone(record[key])]));
}
export function arrayPlacementChanged(record, baseline) {
  if (!baseline) return true;
  const actual = arrayPlacement(record);
  return Object.keys(baseline).some(key => typeof baseline[key] === 'number'
    ? !Number.isFinite(actual[key]) || Math.abs(actual[key] - baseline[key]) > 1e-8
    : JSON.stringify(actual[key] ?? null) !== JSON.stringify(baseline[key] ?? null));
}
export function reconcileArrayInstances(next, previous, current, locked = [], options = {}) {
  const groupId = options.groupId || next[0]?.array_id || previous[0]?.array_id;
  if (groupId) current = current.filter(record => record.array_id === groupId);
  const oldById = new Map(previous.map(record => [record.id, record])), currentById = new Map(current.map(record => [record.id, record]));
  const protectedIds = new Set([...(options.protected || []), ...locked]);
  for (const edited of current) {
    const old = oldById.get(edited.id), baseline = options.baselines?.[edited.id] || old;
    if (edited.assembly_locked || edited.assembly_refined || edited.assembly_manual || baseline && arrayPlacementChanged(edited, baseline)) protectedIds.add(edited.id);
  }
  for (const id of options.forceAutomatic || []) protectedIds.delete(id);
  const removed = new Set(options.removed || []);
  const records = next.filter((record) => !removed.has(record.id) && (!oldById.has(record.id) || currentById.has(record.id) || options.fillMissing)).map((record) => {
    const old = oldById.get(record.id), edited = currentById.get(record.id);
    if (edited && protectedIds.has(record.id)) return structuredClone(edited);
    if (!old || !edited) return record;
    const value = { ...record };
    value.pinned_revision = record.asset_id === edited.asset_id ? edited.pinned_revision || 0 : 0; value.shape = value.pinned_revision ? structuredClone(edited.shape) : value.shape;
    value.linked = record.asset_id === edited.asset_id ? edited.linked : true; if (!value.linked) value.shape = structuredClone(edited.shape);
    return value;
  });
  current.filter(i => protectedIds.has(i.id) && !removed.has(i.id) && !records.some(r => r.id === i.id)).forEach(i => records.push(structuredClone(i)));
  return records;
}
