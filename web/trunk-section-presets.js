import { normalizeTrunkForm, normalizeTrunkSectionProfile, normalizeDirectTrunkSectionProfile,normalizeTrunkProfileExclusions } from './trunk-form.js';

export const TRUNK_SECTION_PRESET_LIMIT = 500;
export const TRUNK_SECTION_PRESET_ID = /^section-preset-[a-f0-9]{32}(?![\s\S])/;

// A reusable section is a shape, not a placement or a recipe for the whole trunk.
// Keeping this boundary explicit prevents applying a preset from moving an
// existing section, changing its influence span, or adding someone else's roots.
export function normalizeTrunkSectionPresetShape(raw = {}) {
  const direct = raw?.geometry_version === 2;
  const section = normalizeTrunkForm({ ...(direct ? { geometry_version: 2 } : {}), sections: [{
    id: 'PRESET_SHAPE', t: .5, span: .25,
    radius: raw?.radius, oval: raw?.oval, roll: raw?.roll,
  }] }).sections[0];
  const result = { ...(direct ? { geometry_version: 2 } : {}), radius: section.radius, oval: section.oval, roll: section.roll };
  if(direct&&raw.profile_scope==='FINAL')result.profile_scope='FINAL';
  const profile = direct ? normalizeDirectTrunkSectionProfile(raw?.profile) : normalizeTrunkSectionProfile(raw?.profile);
  if (profile?.length >= 3) result.profile = profile.map(point => ({ ...point }));
  const coarse=direct?normalizeTrunkSectionProfile(raw?.profile_coarse,{points:32,min:.001,max:64,tangents:true}):null;
  if(coarse)result.profile_coarse=coarse;
  if(direct&&Array.isArray(raw.profile_exclusions))result.profile_exclusions=normalizeTrunkProfileExclusions(raw.profile_exclusions);
  return result;
}

export function normalizeTrunkSectionPreset(raw, { now = Date.now(), id = raw?.id } = {}) {
  if (!TRUNK_SECTION_PRESET_ID.test(String(id || ''))) throw Error('截面预设 ID 无效');
  const name = String(raw?.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name.length > 80) throw Error('截面预设名称须为 1–80 字');
  if (!raw?.shape || typeof raw.shape !== 'object' || Array.isArray(raw.shape)) throw Error('截面预设形状无效');
  const stamp = Number(raw.updatedAt);
  return {
    id: String(id), name, shape: normalizeTrunkSectionPresetShape(raw.shape),
    updatedAt: Number.isSafeInteger(stamp) && stamp >= 0 ? stamp : Math.max(0, Math.trunc(now)),
  };
}

export function createTrunkSectionPresetId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return 'section-preset-' + uuid.replaceAll('-', '').toLowerCase();
  let hex = '';
  for (let i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return 'section-preset-' + hex;
}
