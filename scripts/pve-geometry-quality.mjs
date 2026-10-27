// Authoring overlap targets describe the chosen plant silhouette, not whether
// its geometry can be serialized. Keep those warnings without reshaping it.
export function checkPveGeometry(report, label) {
  const defects = ['invalid_vertices', 'degenerate_faces', 'missing_uv', 'missing_normals', 'missing_tangents'];
  const overlapOnly = Number.isFinite(report?.attachment_overlap_ratio)
    && Number.isFinite(report?.attachment_overlap_limit)
    && report.attachment_overlap_ratio > report.attachment_overlap_limit;
  if (!report || defects.some(key => report[key] !== 0) || (!report.ok && !overlapOnly)) {
    throw Error(`${label} 的几何无效：${report?.warnings?.join('；') || '几何检查未通过'}`);
  }
  return (report.warnings || []).map(message => `${label}：${message}`);
}
