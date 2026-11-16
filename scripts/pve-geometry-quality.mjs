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

// A built export asset owns the repair and can be discarded without changing
// saved primitives, source vertex identities, or authored surface anchors.
export function preparePveExportGeometry(asset, kernel, label, allowGeometryCleanup = true) {
  const removedFaces = asset.report.degenerate_faces
    ? kernel.repairExportAssetGeometry(asset).removedFaces : 0;
  const warnings = checkPveGeometry(asset.report, label);
  if (removedFaces && !allowGeometryCleanup) {
    const error = Error(`${label}有 ${removedFaces} 个零面积三角面可以在导出副本中移除，请确认后重试。`);
    error.geometryCleanupRequired = { label, removed_faces: removedFaces };
    throw error;
  }
  return { removedFaces, warnings };
}

export function pveGeometryCleanup(assemblyRemovedFaces, sourceModels = []) {
  const removedFaces = sourceModels.reduce((count, source) => count + source.removed_faces, assemblyRemovedFaces);
  return removedFaces ? {
    assembly_removed_faces: assemblyRemovedFaces,
    source_models: sourceModels,
    removed_faces: removedFaces,
  } : null;
}
