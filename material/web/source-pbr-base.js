export function validateSourcePbrBase(raw) {
  if (raw == null) return null;
  if (raw.version !== 1 || raw.kind !== 'source-pbr' || !Array.isArray(raw.affectedSlots) ||
      raw.affectedSlots.length > 4096 ||
      raw.affectedSlots.some(slot => !Number.isSafeInteger(slot) || slot < -1 || slot > 2_000_000) ||
      new Set(raw.affectedSlots).size !== raw.affectedSlots.length) {
    throw Error('保留原材质的作用范围无效。');
  }
  return {version: 1, kind: 'source-pbr', affectedSlots: [...raw.affectedSlots]};
}

export function validateSourcePbrSlots(base, source) {
  if (!source?.sourcePbr?.primitives?.length) throw Error('导出叠加效果需要可校验的原材质 GLB。');
  const active = new Set(source.sourcePbr.primitives.map(primitive => primitive.materialIndex));
  const emissive = new Set(source.sourcePbr.materials.filter(material => material.hasEmissive).map(material => material.index));
  for (const slot of base.affectedSlots) {
    if (!active.has(slot)) throw Error('叠加效果引用了模型中不存在的材质槽。');
    if (emissive.has(slot)) throw Error('含原始发光的材质槽可原样保留，当前不能叠加效果。');
  }
  const affected = new Set(base.affectedSlots);
  return [...active].filter(slot => !affected.has(slot));
}
