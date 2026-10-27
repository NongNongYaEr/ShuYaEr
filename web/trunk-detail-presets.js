import { normalizeTrunkDetails, createTrunkDetailId } from './trunk-details.js';
import {TRUNK_DETAIL_PROFILES} from './trunk-detail-profile.js';

export const TRUNK_DETAIL_PRESET_LIMIT = 500;
export const TRUNK_DETAIL_PRESET_ID = /^trunk-preset-[a-f0-9]{32}(?![\s\S])/;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const valid = (v, fallback) => Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback;
const wrap = angle => (angle % 360 + 360) % 360;
const angleDelta = (a, b) => ((a - b + 540) % 360) - 180;
const shape = details => Object.freeze({ version: 1, details: Object.freeze(normalizeTrunkDetails(details).map(detail =>
  Object.freeze({ ...detail, path: Object.freeze(detail.path.map(point => Object.freeze({ ...point }))) }))) });
const single = (type, name) => Object.freeze({ id: `builtin-${type.toLowerCase()}`, name, builtin: true,
  shape: shape([{ type, t: .5, angle: 0 }]) });
const profile=id=>TRUNK_DETAIL_PROFILES.find(p=>p.id===id).shape;
const variant=(id,name,category,details,tags=[])=>Object.freeze({id:'builtin-'+id,name,category,tags:Object.freeze(tags),builtin:true,shape:shape(details)});

export const TRUNK_DETAIL_PRESETS = Object.freeze([
  single('GROOVE', '纵向沟槽'), single('RIDGE', '纵向脊线'), single('KNOT', '圆润树瘤'),
  single('SCAR', '凹陷疤结'), single('FLARE', '局部鼓包'), single('WRINKLE', '细密皱纹'),
  variant('short-fissure','短细裂口','裂纹沟槽',[{type:'GROOVE',t:.5,angle:0,height:.028,width:7,strength:.18,profile:profile('V_GROOVE'),path:[{t:.47,angle:-2},{t:.5,angle:1},{t:.53,angle:0}]}],['细沟','伤痕']),
  variant('curved-furrow','弯曲深沟','裂纹沟槽',[{type:'GROOVE',t:.5,angle:0,height:.035,width:12,strength:.2,profile:profile('U_GROOVE'),path:[{t:.36,angle:-9},{t:.44,angle:4},{t:.56,angle:-4},{t:.65,angle:8}]}],['纵沟','老树']),
  variant('wide-low-ridge','宽浅树脊','树脊鼓包',[{type:'RIDGE',t:.5,angle:0,height:.24,width:35,strength:.13,profile:profile('PLATE_RIDGE')}],['宽脊','柔和']),
  variant('elongated-scar','拉长疤结','树瘤疤痕',[{type:'SCAR',t:.5,angle:0,height:.1,width:16,strength:.18,profile:profile('SLANTED_CUT')}],['伤痕','偏心']),
  variant('cross-wrinkle','横向细褶','横向纹理',[{type:'WRINKLE',t:.5,angle:0,height:.035,width:25,strength:.055,path:[{t:.5,angle:-60},{t:.5,angle:0},{t:.5,angle:60}]}],['生长纹','浅褶']),
  variant('root-shoulder','根部过渡鼓包','根部过渡',[{type:'FLARE',t:.5,angle:0,height:.36,width:64,strength:.16,profile:profile('ROUND_RIDGE')}],['板根','根盘']),
]);
export const TRUNK_DETAIL_COMBINATIONS = Object.freeze([
  Object.freeze({ id: 'builtin-fine-crack', name: '细裂纹与浅脊', builtin: true, shape: shape([
    { id:'CRACK',type:'GROOVE',t:.5,angle:0,height:.025,width:8,strength:.12,
      path:[{t:.44,angle:-3},{t:.48,angle:2},{t:.52,angle:-1},{t:.56,angle:4}] },
    { id:'CRACK_EDGE',type:'RIDGE',t:.5,angle:6,height:.02,width:8,strength:.035,
      path:[{t:.44,angle:3},{t:.48,angle:8},{t:.52,angle:5},{t:.56,angle:10}] },
  ]) }),
  Object.freeze({ id: 'builtin-small-scar', name: '小疤与卷边', builtin: true, shape: shape([
    { id:'SMALL_SCAR',type:'SCAR',t:.5,angle:0,height:.045,width:18,strength:.2 },
    { id:'SMALL_SHOULDER',type:'FLARE',t:.5,angle:0,height:.07,width:30,strength:.06 },
  ]) }),
  Object.freeze({ id: 'builtin-knot-cluster', name: '小树瘤簇', builtin: true, shape: shape([
    { id:'KNOT_CENTRE',type:'KNOT',t:.5,angle:0,height:.05,width:20,strength:.2,seed:7 },
    { id:'KNOT_LEFT',type:'KNOT',t:.47,angle:-11,height:.025,width:12,strength:.11,seed:13 },
    { id:'KNOT_RIGHT',type:'KNOT',t:.53,angle:10,height:.03,width:14,strength:.13,seed:19 },
  ]) }),
  Object.freeze({ id: 'builtin-old-bark', name: '老树纵沟与皱纹', builtin: true, shape: shape([
    ...[-70, 0, 72].map((angle, index) => ({ id: `OLD_GROOVE_${index}`, type: 'GROOVE', t: .5,
      angle, height: .88, width: 26, strength: .2, seed: index + 3,
      path: [{ t: .12, angle: angle - 8 }, { t: .5, angle: angle + 7 }, { t: .88, angle: angle - 3 }] })),
    { id: 'OLD_WRINKLE', type: 'WRINKLE', t: .3, angle: 25, height: .38, width: 140, strength: .08, seed: 11 },
  ]) }),
  Object.freeze({ id: 'builtin-scar-knot', name: '疤结与周边隆起', builtin: true, shape: shape([
    { id: 'SCAR_CENTRE', type: 'SCAR', t: .5, angle: 0, height: .22, width: 50, strength: .25 },
    { id: 'SCAR_SHOULDER', type: 'FLARE', t: .49, angle: 0, height: .33, width: 80, strength: .15 },
    { id: 'SCAR_KNOT', type: 'KNOT', t: .6, angle: 16, height: .14, width: 36, strength: .18, seed: 8 },
  ]) }),
  Object.freeze({ id: 'builtin-root-ridges', name: '基部脊线与鼓包', builtin: true, shape: shape([
    ...[-65, 0, 66].map((angle, index) => ({ id: `ROOT_RIDGE_${index}`, type: 'RIDGE', t: .5,
      angle, height: .6, width: 48, strength: .24, seed: index + 2,
      path: [{ t: .23, angle: angle - 12 }, { t: .44, angle }, { t: .72, angle: angle + 3 }] })),
    { id: 'ROOT_FLARE', type: 'FLARE', t: .29, angle: 0, height: .3, width: 160, strength: .28 },
  ]) }),
  variant('paired-fissures','双裂缝夹脊','裂纹沟槽',[
    ...[-9,9].map((angle,i)=>({id:'PAIR_GROOVE_'+i,type:'GROOVE',t:.5,angle,height:.025,width:7,strength:.15,profile:profile('V_GROOVE'),path:[{t:.4,angle:angle-3},{t:.5,angle},{t:.6,angle:angle+2}]})),
    {id:'PAIR_RIDGE',type:'RIDGE',t:.5,angle:0,height:.22,width:12,strength:.07},
  ],['双沟','窄脊']),
  variant('long-furrow-group','顺干长沟群','裂纹沟槽',[-24,0,28].map((angle,i)=>({id:'LONG_GROOVE_'+i,type:'GROOVE',t:.5,angle,height:.04,width:12,strength:.14+i*.015,path:[{t:.28,angle:angle-4},{t:.44,angle:angle+3},{t:.58,angle:angle-2},{t:.72,angle:angle+5}]})),['纵沟','老树']),
  variant('old-joint-scars','旧枝节疤群','树瘤疤痕',[
    ...[-25,0,27].map((angle,i)=>({id:'JOINT_SCAR_'+i,type:'SCAR',t:.49+i*.018,angle,height:.055,width:16,strength:.15,seed:20+i})),
    {id:'JOINT_SHOULDER',type:'FLARE',t:.5,angle:0,height:.15,width:85,strength:.055},
  ],['枝节','疤结']),
  variant('offset-knot-trail','偏侧树瘤群','树瘤疤痕',Array.from({length:4},(_,i)=>({id:'TRAIL_KNOT_'+i,type:'KNOT',t:.41+i*.06,angle:-12+i*9,height:.025+i*.006,width:10+i*2,strength:.11+i*.015,seed:31+i*7})),['树瘤','不对称']),
  variant('root-shallow-furrows','板根浅沟群','根部过渡',[-40,0,40].map((angle,i)=>({id:'BASE_GROOVE_'+i,type:'GROOVE',t:.5,angle,height:.06,width:15,strength:.1,path:[{t:.3,angle:angle-10},{t:.48,angle},{t:.68,angle:angle+3}]})),['根盘','根部','细沟']),
  variant('growth-bands','横向生长纹','横向纹理',Array.from({length:3},(_,i)=>({id:'GROWTH_BAND_'+i,type:'RIDGE',t:.44+i*.06,angle:0,height:.015,width:10,strength:.045,profile:profile('ROUND_RIDGE'),path:[{t:.44+i*.06,angle:-60},{t:.445+i*.06,angle:0},{t:.44+i*.06,angle:60}]})),['环纹','浅脊']),
]);

/** A preset keeps relative surface placement, never the source branch ID.
 * Centering the anchor range preserves large combinations near either end. */
export function normalizeTrunkDetailPresetShape(raw) {
  if (raw?.version != null && raw.version !== 1) throw Error('细节预设版本不受支持');
  const details = normalizeTrunkDetails(raw?.details);
  if (!details.length) throw Error('细节预设至少需要一个有效细节');
  const anchors = details.flatMap(detail => detail.path.length ? detail.path : [detail]);
  const centreT = (Math.min(...anchors.map(point => point.t)) + Math.max(...anchors.map(point => point.t))) / 2;
  const reference = anchors[0].angle, angles = anchors.map(point => angleDelta(point.angle, reference));
  const centreA = reference + (Math.min(...angles) + Math.max(...angles)) / 2;
  return { version: 1, details: details.map((detail, index) => ({ ...detail, id: `PRESET_DETAIL_${index + 1}`,
    t: clamp(detail.t - centreT + .5, 0, 1), angle: wrap(detail.angle - centreA),
    path: detail.path.map(point => ({ ...point, t: clamp(point.t - centreT + .5, 0, 1), angle: wrap(point.angle - centreA) })) })) };
}

export function normalizeTrunkDetailPreset(raw, { now = Date.now(), id = raw?.id } = {}) {
  if (!TRUNK_DETAIL_PRESET_ID.test(String(id || ''))) throw Error('细节预设 ID 无效');
  const name = String(raw?.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name.length > 80) throw Error('细节预设名称须为 1–80 字');
  if (!raw?.shape || typeof raw.shape !== 'object' || Array.isArray(raw.shape)) throw Error('细节预设形状无效');
  const stamp = Number(raw.updatedAt);
  return { id: String(id), name, shape: normalizeTrunkDetailPresetShape(raw.shape),
    updatedAt: Number.isSafeInteger(stamp) && stamp >= 0 ? stamp : Math.max(0, Math.trunc(now)) };
}

export function createTrunkDetailPresetId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return 'trunk-preset-' + uuid.replaceAll('-', '').toLowerCase();
  let hex = ''; for (let i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return 'trunk-preset-' + hex;
}

/** Append only to an explicitly chosen destination branch/region. The caller
 * owns that scope; returned records cannot overwrite existing detail IDs. */
export function applyTrunkDetailPreset(raw, { t = .5, angle = 0, height = 1, width = 360,
  strength = 1, idFactory = createTrunkDetailId } = {}) {
  const normalized = normalizeTrunkDetailPresetShape(raw?.shape || raw);
  const centreT = clamp(valid(t, .5), 0, 1), centreA = valid(angle, 0);
  const axialScale = clamp(valid(height, 1), .02, 4), angularScale = clamp(valid(width, 360) / 360, .02, 4);
  const gain = clamp(valid(strength, 1), 0, 4);
  return normalizeTrunkDetails(normalized.details.map(detail => ({ ...detail, id: idFactory(),
    t: centreT + (detail.t - .5) * axialScale, angle: centreA + angleDelta(detail.angle, 0) * angularScale,
    height: detail.height * axialScale, width: detail.width * angularScale, strength: detail.strength * gain,
    path: detail.path.map(point => ({ ...point, t: centreT + (point.t - .5) * axialScale,
      angle: centreA + angleDelta(point.angle, 0) * angularScale })) })));
}
