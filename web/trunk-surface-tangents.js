// A solid-colour GLB may legitimately have no UVs. Collapsed UVs also leave
// computeTangents() with a zero vector. Supply only the missing surface frame;
// keep authored frames, topology, normals and UVs untouched.
export function trunkSurfaceTangents(normals, tangents) {
  const count = normals.length / 3;
  let result = tangents;
  for (let i = 0; i < count; i++) {
    const n = i * 3, t = i * 4;
    const nx = normals[n], ny = normals[n + 1], nz = normals[n + 2];
    const tx = tangents?.[t] ?? 0, ty = tangents?.[t + 1] ?? 0, tz = tangents?.[t + 2] ?? 0;
    const normalSq = nx * nx + ny * ny + nz * nz;
    const tangentSq = tx * tx + ty * ty + tz * tz, dot = nx * tx + ny * ty + nz * tz;
    // Invalid normals remain invalid: do not hide a genuinely broken surface.
    if (!(normalSq > 1e-20) || !Number.isFinite(normalSq + tangentSq)) continue;
    if (tangentSq > 1e-20 && normalSq * tangentSq - dot * dot > normalSq * tangentSq * 1e-12) continue;
    if (result === tangents) result = tangents ? tangents.slice() : new Float32Array(count * 4);
    const x = Math.abs(nx), y = Math.abs(ny), z = Math.abs(nz);
    const ax = x <= y && x <= z ? 1 : 0, ay = !ax && y <= z ? 1 : 0, az = ax || ay ? 0 : 1;
    const projection = (ax * nx + ay * ny + az * nz) / normalSq;
    const fx = ax - nx * projection, fy = ay - ny * projection, fz = az - nz * projection;
    const inverse = 1 / Math.hypot(fx, fy, fz);
    // Match GLB/GPU float attributes for both fresh imports and old JSON assets.
    result[t] = Math.fround(fx * inverse); result[t + 1] = Math.fround(fy * inverse); result[t + 2] = Math.fround(fz * inverse);
    result[t + 3] = tangents?.[t + 3] < 0 ? -1 : 1;
  }
  return result;
}
