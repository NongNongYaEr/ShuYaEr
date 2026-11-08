const DENSITY_LIMIT = 1.4;
const SEARCH_LIMIT = 1.3998;

function signedUvArea({ indices, uv }, face) {
  const corner = face * 3;
  const a = indices[corner] * 2, b = indices[corner + 1] * 2, c = indices[corner + 2] * 2;
  return (uv[b] - uv[a]) * (uv[c + 1] - uv[a + 1]) - (uv[b + 1] - uv[a + 1]) * (uv[c] - uv[a]);
}

function surfaceArea({ indices, pos }, face) {
  const corner = face * 3;
  const a = indices[corner] * 3, b = indices[corner + 1] * 3, c = indices[corner + 2] * 3;
  const x = pos[b] - pos[a], y = pos[b + 1] - pos[a + 1], z = pos[b + 2] - pos[a + 2];
  const u = pos[c] - pos[a], v = pos[c + 1] - pos[a + 1], w = pos[c + 2] - pos[a + 2];
  return Math.hypot(y * w - z * v, z * u - x * w, x * v - y * u);
}

// Match by ordered face corners because repacking may renumber or split UV vertices.
export function createUvDensityBudget(input, reference = input) {
  const faces = input.indices.length / 3;
  const invalid = () => Error('UV 密度基准与当前网格不匹配，无法继续提覆盖。');
  if (input.indices.length !== reference.indices.length) throw invalid();
  if (reference !== input) {
    for (let corner = 0; corner < input.indices.length; corner++) {
      const a = input.indices[corner] * 3, b = reference.indices[corner] * 3;
      for (let axis = 0; axis < 3; axis++) if (input.pos[a + axis] !== reference.pos[b + axis]) throw invalid();
    }
  }
  const area = new Float64Array(faces), weight = new Float64Array(faces), faceLimits = new Float64Array(faces);
  for (let face = 0; face < faces; face++) {
    area[face] = signedUvArea(reference, face);
    const ratio = signedUvArea(input, face) / area[face];
    if (!Number.isFinite(ratio) || ratio <= 0) throw invalid();
    weight[face] = surfaceArea(input, face);
    // Existing faces over the limit can remain as they were or shrink.
    faceLimits[face] = Math.max(1.00000001, SEARCH_LIMIT ** 2 / ratio);
  }
  function p99(mesh) {
    const ratios = [];
    let total = 0;
    for (let face = 0; face < faces; face++) {
      if (!weight[face]) continue;
      const ratio = signedUvArea(mesh, face) / area[face];
      if (!Number.isFinite(ratio) || ratio <= 0) return Infinity;
      ratios.push([ratio, weight[face]]);
      total += weight[face];
    }
    ratios.sort((a, b) => a[0] - b[0]);
    let sum = 0;
    for (const [ratio, faceWeight] of ratios) {
      sum += faceWeight;
      if (sum >= total * .99) return Math.sqrt(ratio);
    }
    return Infinity;
  }
  const beforeP99 = reference === input ? 1 : p99(input);
  return {
    beforeP99,
    faceLimits,
    audit(mesh) {
      const afterP99 = p99(mesh);
      return afterP99 <= Math.max(DENSITY_LIMIT, beforeP99 * 1.00001)
        ? { beforeP99, afterP99, limit: DENSITY_LIMIT }
        : null;
    },
  };
}
