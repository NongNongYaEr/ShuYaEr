import {isImmutableJson, sealImmutableJson} from './immutable-json.js';

const MIB = 1024 * 1024;
export const MAX_POT_BYTES = 64 * MIB;
export const POT_SCALE_RANGE = [.001, 100];
const maxEncoded = Math.ceil(MAX_POT_BYTES / 3) * 4;
const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);

export function potFileSizeMessage(bytes) {
  return `花盆 GLB 为 ${(bytes / MIB).toFixed(1)} MiB，导入上限为 ${MAX_POT_BYTES / MIB} MiB。`;
}

export function normalizeBonsaiPot(raw) {
  if (isImmutableJson(raw)) return raw;
  if (raw?.version !== 1 || typeof raw.glb !== 'string' || !raw.glb.startsWith('Z2xURgIA') || raw.glb.length > maxEncoded || raw.glb.length % 4
    || !vector(raw.planting, 3) || !vector(raw.position, 3) || !vector(raw.rotation, 4)
    || !Number.isFinite(raw.scale) || raw.scale < POT_SCALE_RANGE[0] || raw.scale > POT_SCALE_RANGE[1]) return null;
  const padding = raw.glb.endsWith('==') ? 2 : raw.glb.endsWith('=') ? 1 : 0;
  if (raw.glb.length * 3 / 4 - padding > MAX_POT_BYTES) return null;
  const length = Math.hypot(...raw.rotation);
  if (length < .000001 || Math.abs(length - 1) > .001) return null;
  return sealImmutableJson({version:1,name:String(raw.name || '花盆').slice(0, 120),glb:raw.glb,visible:raw.visible !== false,
    ...(raw.export_with_tree === true ? {export_with_tree:true} : {}),
    planting:[...raw.planting],position:[...raw.position],rotation:[...raw.rotation],scale:raw.scale});
}
