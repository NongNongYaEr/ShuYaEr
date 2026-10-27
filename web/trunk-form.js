// Authoring recipe for the skin of one structural branch. Distances below are
// ratios of its existing radius; they never change its centreline or mounts.
import { normalizeTrunkDetails, createTrunkDetailSampler } from './trunk-details.js';
import { normalizeTrunkMeshSettings } from './trunk-mesh-density.js';
import { trunkLoftValue } from './trunk-loft-interpolation.js';
import {createLegacyRotationOffsetSampler,LEGACY_LOCAL_ROLL_LIMIT} from './trunk-legacy-rotation.js';
const TAU = Math.PI * 2;
const bounded = (value, min, max, fallback) => value !== null && value !== '' && Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback;
const safeId = (value, fallback = '') => typeof value === 'string'
  ? value.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 128) || fallback : fallback;
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const radians = degrees => degrees * Math.PI / 180;
const wrapDegrees = degrees => (degrees % 360 + 360) % 360;
const angleDistance = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Editable contours are positive polar curves in the transported section
 * frame. Keeping the control points ordered by angle guarantees one closed
 * outline and avoids folds when a point is dragged through its neighbour. */
export function normalizeTrunkSectionProfile(raw, limits = null) {
  if (!Array.isArray(raw)) return null;
  const ids = new Set(), points = [];
  for (const [index, item] of raw.slice(0, limits?.points ?? 32).entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = safeId(item.id, `PROFILE_${index + 1}`);
    if (ids.has(id)) continue;
    ids.add(id);
    points.push({ id, angle: wrapDegrees(bounded(item.angle, -36000, 36000, index * 360 / raw.length)),
      radius: bounded(item.radius, limits?.min ?? .15, limits?.max ?? 4, 1),
      ...(limits?.tangents && Number.isFinite(item.tangent) && Math.abs(item.tangent)<=1e12 ? {tangent:item.tangent===0?0:item.tangent} : {}),
      ...(limits?.tangents && Number.isFinite(item.join_tangent) && Math.abs(item.join_tangent)<=1e12 ? {join_tangent:item.join_tangent===0?0:item.join_tangent} : {}) });
  }
  points.sort((a, b) => a.angle - b.angle);
  const result = [];
  for (const point of points) if (!result.length || point.angle - result.at(-1).angle > 1e-4) result.push(point);
  if (result.length > 1 && result[0].angle + 360 - result.at(-1).angle <= 1e-4) result.pop();
  return result.length >= 3 ? result : null;
}

export function createTrunkSectionProfile(count = 8) {
  const size = Math.round(bounded(count, 3, 32, 8));
  return Array.from({ length: size }, (_, index) => ({ id: `PROFILE_${index + 1}`,
    angle: index * 360 / size, radius: 1 }));
}

export function normalizeTrunkProfileExclusions(raw){
  return Array.isArray(raw)?raw.slice(0,128).filter(p=>p&&Number.isFinite(p.start)&&Number.isFinite(p.end))
    .map(p=>({start:wrapDegrees(p.start),end:wrapDegrees(p.end),...(p.join==='SMOOTH'?{join:'SMOOTH'}:{})})):null;
}

function compileProfile(raw, direct = false) {
  const points = direct ? normalizeDirectTrunkSectionProfile(raw) : normalizeTrunkSectionProfile(raw);
  return compileProfilePoints(points,direct);
}
function compileProfilePoints(points,direct=true) {
  if (!points) {const sample=()=>1;sample.derivative=()=>0;return sample;}
  const n = points.length;
  const angles = points.map(point => radians(point.angle));
  const widths = points.map((point, i) => radians((points[(i + 1) % n].angle - point.angle + 360) % 360));
  const slopes = points.map((point, i) => (points[(i + 1) % n].radius - point.radius) / widths[i]);
  // Periodic PCHIP derivatives: extrema get a horizontal tangent; monotone
  // intervals use a weighted harmonic mean and stay inside their endpoints.
  const derivatives = points.map((_, i) => {
    if(direct&&Number.isFinite(points[i].tangent))return points[i].tangent;
    const previous = (i + n - 1) % n, a = slopes[previous], b = slopes[i];
    if (!a || !b || Math.sign(a) !== Math.sign(b)) return 0;
    const w1 = 2 * widths[i] + widths[previous], w2 = widths[i] + 2 * widths[previous];
    return (w1 + w2) / (w1 / a + w2 / b);
  });
  const interval=angle=>{
    const value = (angle % TAU + TAU) % TAU;
    let i = n - 1;
    if(n>32){let lo=0,hi=n;while(lo<hi){const m=(lo+hi)>>1;if(angles[m]<=value)lo=m+1;else hi=m;}i=lo?lo-1:n-1;
    }else{
      for (let j = 0; j < n - 1; j++) {if (value >= angles[j] && value < angles[j + 1]) { i = j; break; }}
    }
    const next = (i + 1) % n, distance = (value - angles[i] + TAU) % TAU;
    return {i,next,u:distance/widths[i],value};
  };
  const sample=angle=>{
    if (!Number.isFinite(angle)) return 1;
    const {i,next,u,value}=interval(angle);
    for(const j of [i,next])if(Math.abs(value-angles[j])<1e-12)return points[j].radius;
    const u2 = u * u, u3 = u2 * u;
    const result = (2 * u3 - 3 * u2 + 1) * points[i].radius
      + (u3 - 2 * u2 + u) * widths[i] * derivatives[i]
      + (-2 * u3 + 3 * u2) * points[next].radius
      + (u3 - u2) * widths[i] * derivatives[next];
    return Math.max(Math.min(points[i].radius, points[next].radius),
      Math.min(Math.max(points[i].radius, points[next].radius), result));
  };
  sample.derivative=angle=>{
    if(!Number.isFinite(angle))return 0;
    const {i,next,u,value}=interval(angle);
    for(const j of [i,next])if(Math.abs(value-angles[j])<1e-12)return derivatives[j];
    return (6*u*u-6*u)/widths[i]*points[i].radius+(3*u*u-4*u+1)*derivatives[i]
      +(-6*u*u+6*u)/widths[i]*points[next].radius+(3*u*u-2*u)*derivatives[next];
  };
  return sample;
}

/** Radians use the unrolled local frame; the swept skin rotates this contour
 * together with its section. This public helper also accepts raw saved data. */
export function sampleTrunkSectionProfile(profile, angleRadians) {
  return compileProfile(profile)(angleRadians);
}

/** Compile once per preview/build rather than normalizing knots per vertex. */
export function createTrunkFormProfileSampler(form) {
  if (isDirectTrunkForm(form)) {
    const sampler = createDirectTrunkFormSampler(form);
    return (t, angle) => { const section = sampler.sectionAt(t);
      return sampler.radialAt(t, angle) / (section.radius * trunkSectionEllipseRadius(section.oval, angle)); };
  }
  const sections = !form || form.enabled === false ? [] : (form.sections || [])
    .filter(section => section.profile?.length >= 3)
    .map(section => ({ t: section.t, span: section.span, sample: compileProfile(section.profile) }));
  return (t, angleRadians) => {
    let scale = 1;
    for (const section of sections) {
      const weight = smooth(1 - Math.abs(t - section.t) / section.span);
      if (weight > 0) scale *= 1 + (section.sample(angleRadians) - 1) * weight;
    }
    return Math.max(.05, Math.min(16, scale));
  };
}

export function trunkFormProfileScaleAt(form, t, angleRadians) {
  return createTrunkFormProfileSampler(form)(t, angleRadians);
}

export const TRUNK_FORM_PRESETS = Object.freeze({
  NATURAL: Object.freeze({ groove_depth: .25, groove_count: 9, root_flare: .18, asymmetry: .08 }),
  BUTTRESS: Object.freeze({ groove_depth: .34, groove_count: 11, root_flare: .35, asymmetry: .12 }),
});

export function createTrunkFormPreset(name = 'NATURAL') {
  const preset = Object.hasOwn(TRUNK_FORM_PRESETS, name) ? name : 'NATURAL';
  return normalizeTrunkForm({ preset, ...TRUNK_FORM_PRESETS[preset],
    // All roots have independent, persistent IDs. Editing one does not reroll
    // its neighbours, and changing the groove count consumes no random state.
    buttresses: preset === 'BUTTRESS' ? [0, 92, 185, 274].map((angle, index) => ({
      id: `BUTTRESS_${index + 1}`, angle, length: [2.6, 1.9, 2.3, 1.7][index],
      height: [.32, .26, .36, .29][index], width: [15, 19, 17, 21][index], strength: 1,
    })) : [] });
}

export function normalizeTrunkForm(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.geometry_version != null && ![1, 2].includes(raw.geometry_version)) return null;
  const preset = Object.hasOwn(TRUNK_FORM_PRESETS, raw.preset) ? raw.preset : 'NATURAL';
  const direct = isDirectTrunkForm(raw);
  const defaults = direct ? { groove_depth: 0, groove_count: 9, root_flare: 0, asymmetry: 0 } : TRUNK_FORM_PRESETS[preset];
  const start = bounded(raw.height_start, 0, 1, 0), end = bounded(raw.height_end, 0, 1, 1);
  const unique = (items, limit, prefix, normalize) => {
    const seen = new Set(), result = [];
    for (const [index, item] of (Array.isArray(items) ? items : []).slice(0, limit).entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const id = safeId(item.id, `${prefix}_${index + 1}`);
      if (seen.has(id)) continue;
      seen.add(id); result.push({ id, ...normalize(item) });
    }
    return result;
  };
  const result = {
    enabled: raw.enabled !== false, preset,
    ...(raw.root_plane==='HORIZONTAL'?{root_plane:'HORIZONTAL'}:{}),
    ...(direct&&raw.loft_interpolation==='SMOOTH'?{loft_interpolation:'SMOOTH'}:{}),
    groove_depth: bounded(raw.groove_depth, 0, .8, defaults.groove_depth),
    groove_count: Math.round(bounded(raw.groove_count, 2, 16, defaults.groove_count)),
    root_flare: bounded(raw.root_flare, 0, 3, defaults.root_flare),
    height_start: Math.min(start, end), height_end: Math.max(start, end),
    asymmetry: bounded(raw.asymmetry, 0, .4, defaults.asymmetry),
    sections: unique(raw.sections, 24, 'SECTION', item => {
      const profile = direct ? normalizeDirectTrunkSectionProfile(item.profile) : normalizeTrunkSectionProfile(item.profile);
      const coarse = direct ? normalizeTrunkSectionProfile(item.profile_coarse,{points:32,min:.001,max:64,tangents:true}) : null;
      return { t: bounded(item.t, 0, 1, .5), radius: bounded(item.radius, .2, 3, 1),
        oval: bounded(item.oval, .25, 4, 1), roll: bounded(item.roll, -180, 180, 0),
        ...(!direct&&bounded(item.roll_offset,-LEGACY_LOCAL_ROLL_LIMIT,LEGACY_LOCAL_ROLL_LIMIT,0)!==0?{roll_offset:bounded(item.roll_offset,-LEGACY_LOCAL_ROLL_LIMIT,LEGACY_LOCAL_ROLL_LIMIT,0)}:{}),
        span: bounded(item.span, .03, 1, .18), ...(profile ? { profile } : {}),
        ...(coarse ? { profile_coarse: coarse } : {}),
        ...(direct && Array.isArray(item.profile_exclusions) ? {profile_exclusions:normalizeTrunkProfileExclusions(item.profile_exclusions)} : {}),
        ...(direct && item.contour_capture?.version === 1 ? { contour_capture: {
          version: 1, points: profile?.length || 0,
          relative_error: bounded(item.contour_capture.relative_error, 0, 100, 0),
        } } : {}) };
    }).sort((a, b) => a.t - b.t),
    buttresses: unique(raw.buttresses, 12, 'BUTTRESS', item => ({
      angle: wrapDegrees(bounded(item.angle, -3600, 3600, 0)),
      length: bounded(item.length, 0, 6, 2), height: bounded(item.height, .025, 1, .3),
      width: bounded(item.width, 4, 90, 18), strength: bounded(item.strength, 0, 2, 1),
    })),
  };
  const mesh = normalizeTrunkMeshSettings(raw.mesh);
  if (mesh) result.mesh = mesh;
  if (direct) {
    result.geometry_version = 2;
    // Explicit surface layers belong to DIRECT only. Untouched V1 recipes
    // retain their old data; an edited V1 may carry local rotation offsets.
    if (Array.isArray(raw.details)) result.details = normalizeTrunkDetails(raw.details);
    if (raw.legacy_form && typeof raw.legacy_form === 'object') {
      // One immutable V1 snapshot only; never nest snapshots on reconversion.
      const legacy = { ...raw.legacy_form }; delete legacy.geometry_version; delete legacy.legacy_form;
      result.legacy_form = normalizeTrunkForm(legacy);
    }
  }
  return result;
}

export function normalizeTrunkForms(raw) {
  const branches = {};
  // Unknown future schemas do not silently alter the old document's geometry.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version != null && ![1, 2].includes(raw.version))
    return { version: 1, branches };
  for (const [key, value] of Object.entries(raw.branches || {}).slice(0, 2200)) {
    const id = safeId(key), form = normalizeTrunkForm(value);
    if (id && !['__proto__', 'constructor', 'prototype'].includes(id) && form)
      Object.defineProperty(branches, id, { value: form, enumerable: true, writable: true, configurable: true });
  }
  return { version: raw.version === 2 || Object.values(branches).some(isDirectTrunkForm) ? 2 : 1, branches };
}

export function trunkFormForBranch(authoring, stableId) {
  const recipe = authoring?.workbench?.trunk_forms;
  if (!recipe || recipe.version != null && ![1, 2].includes(recipe.version) || !Object.hasOwn(recipe.branches || {}, stableId)) return null;
  const form = normalizeTrunkForm(recipe.branches[stableId]);
  return form?.enabled ? form : null;
}

/** DIRECT interpolates complete neighbouring keys; V1 retains its smoothly
 * fading multiplicative corrections. Neither creates skeleton points. */
export function trunkFormSectionAt(form, t, {baseRotation=false}={}) {
  if (isDirectTrunkForm(form)) return createDirectTrunkFormSampler(form).sectionAt(t);
  let radius = 1, oval = 1, roll = 0;
  if (!form || form.enabled === false) return { radius, oval, roll };
  for (const section of form.sections || []) {
    const weight = smooth(1 - Math.abs(t - section.t) / section.span);
    if (weight <= 0) continue;
    radius *= 1 + (section.radius - 1) * weight;
    oval *= 1 + (section.oval - 1) * weight;
    roll += section.roll * weight;
  }
  return { radius: Math.max(.1, Math.min(6, radius)), oval: Math.max(.25, Math.min(4, oval)),
    roll: Math.max(-360, Math.min(360, roll))+(baseRotation?0:createLegacyRotationOffsetSampler(form.sections)(t)) };
}

/** DIRECT keys describe one complete cross-section, rather than multiplying
 * overlapping local corrections. Legacy recipes never acquire this field. */
export function isDirectTrunkForm(form) { return form?.geometry_version === 2; }

export function normalizeDirectTrunkSectionProfile(raw) {
  // Capturing two differently sized/oval contours may require a compensation
  // outside V1's edit range. It remains a positive, explicitly editable curve.
  return normalizeTrunkSectionProfile(raw, { min: .001, max: 64, points:128,tangents:true });
}

/** Deleted arcs interpolate the remaining visible surface controls, rather
 * than multiplying the old procedural grooves back into an empty interval.
 * Surface slopes are separate from base slopes: cancelling a sharp groove
 * must not distort the untouched base segment on the other side of a knot. */
export function createDirectTrunkSectionProfileSampler(profile,{exclusions=[],surfaceAt=()=>1}={}){
  const base=compileProfile(profile,true),ranges=exclusions.filter(p=>p.join==='SMOOTH');
  if(!ranges.length)return base;
  const points=normalizeDirectTrunkSectionProfile(profile);if(!points)return base;
  const surface=a=>Math.max(1e-9,surfaceAt(a)),h=1e-5;
  const slope=a=>(surface(a+h)-surface(a-h))/(2*h);
  const resolved=compileProfilePoints(points.map(p=>({id:p.id,angle:p.angle,radius:p.radius*surface(radians(p.angle)),
    ...(Number.isFinite(p.join_tangent)?{tangent:p.join_tangent}:{})})));
  const joined=a=>ranges.some(p=>{const width=wrapDegrees(p.end-p.start),offset=wrapDegrees(a*180/Math.PI-p.start);return width>1e-6&&(offset<=width+1e-8||360-offset<1e-8);});
  const sample=a=>joined(a)?resolved(a)/surface(a):base(a);
  sample.derivative=a=>joined(a)?(resolved.derivative(a)-sample(a)*slope(a))/surface(a):base.derivative(a);
  return sample;
}

/** Hermite subdivision retains the original periodic curve, including its
 * endpoint slopes. Existing recipes without tangents retain their PCHIP rule. */
export function refineDirectTrunkSectionProfile(profile,extra=[],options){
  const points=normalizeDirectTrunkSectionProfile(profile)||Array.from({length:64},(_,i)=>({id:'CHILD_'+(i+1),angle:i*360/64,radius:1}));
  const sample=createDirectTrunkSectionProfileSampler(points,options),base=compileProfile(points,true);
  const hasJoins=options?.exclusions?.some(p=>p.join==='SMOOTH'),surface=a=>Math.max(1e-9,options?.surfaceAt?.(a)??1),h=1e-5;
  const joinSlope=a=>sample.derivative(a)*surface(a)+sample(a)*(surface(a+h)-surface(a-h))/(2*h);
  return normalizeDirectTrunkSectionProfile([...points.map(p=>({...p,tangent:base.derivative(radians(p.angle)),
    ...(hasJoins?{join_tangent:joinSlope(radians(p.angle))}:{})})),
    ...extra.map(p=>({...p,radius:sample(radians(p.angle)),tangent:base.derivative(radians(p.angle)),
      ...(hasJoins?{join_tangent:joinSlope(radians(p.angle))}:{})}))]);
}

/** Fine movement updates local slopes, retaining unselected knot positions
 * and distant intervals. Legacy curves do not acquire subdivision metadata. */
export function updateDirectTrunkSectionTangents(profile,before,{changedIds=[]}={}){
  if(!before?.some(p=>Number.isFinite(p.tangent))&&!changedIds.length)return profile;
  const old=new Map(before.map(p=>[p.id,p])),changed=new Set([...changedIds,...profile.filter((p,i)=>{
    const q=old.get(p.id);if(!q)return !Number.isFinite(p.tangent);
    const j=before.findIndex(q=>q.id===p.id);
    return q.angle!==p.angle||q.radius!==p.radius||before[(j+before.length-1)%before.length].id!==profile[(i+profile.length-1)%profile.length].id||before[(j+1)%before.length].id!==profile[(i+1)%profile.length].id;
  }).map(p=>p.id)]);
  if(!changed.size)return profile;
  // Insertion carries exact slopes and does not change the old neighbourhood.
  const inserted=profile.filter(p=>!old.has(p.id));
  if(profile.length>before.length&&inserted.every(p=>Number.isFinite(p.tangent))&&before.every(p=>profile.some(q=>q.id===p.id&&q.angle===p.angle&&q.radius===p.radius)))return profile;
  const next=profile.map(p=>{const q={...p};if(changed.has(p.id))delete q.tangent;return q;}),sample=compileProfilePoints(next);
  return next.map((p,i)=>{
    const previous=next[(i+next.length-1)%next.length],following=next[(i+1)%next.length];
    let tangent=changed.has(p.id)?sample.derivative(radians(p.angle)):p.tangent;
    if(changed.has(p.id)||changed.has(previous.id)||changed.has(following.id)){
      const a=(p.radius-previous.radius)/radians(wrapDegrees(p.angle-previous.angle)),b=(following.radius-p.radius)/radians(wrapDegrees(following.angle-p.angle));
      tangent=!a||!b||Math.sign(a)!==Math.sign(b)?0:Math.sign(a)*Math.max(0,Math.min(Math.sign(a)*tangent,3*Math.min(Math.abs(a),Math.abs(b))));
    }
    return tangent===p.tangent?p:{...p,tangent};
  });
}

/** Recompute surface slopes only around changed/deleted controls. The
 * remaining positions and distant base/surface segments stay unchanged. */
export function updateTrunkSectionJoinTangents(profile,before,{exclusions=[],surfaceAt=()=>1,changedIds=[]}={}){
  if(!exclusions.some(r=>r.join==='SMOOTH'))return profile;
  const old=new Map(before.map(p=>[p.id,p])),changed=new Set(changedIds);
  if(!changed.size&&profile.length>before.length&&profile.filter(p=>!old.has(p.id)).every(p=>Number.isFinite(p.join_tangent))&&before.every(p=>profile.some(q=>q.id===p.id&&q.angle===p.angle&&q.radius===p.radius)))return profile;
  profile.forEach((p,i)=>{const q=old.get(p.id),j=before.findIndex(q=>q.id===p.id);
    if(!q||q.angle!==p.angle||q.radius!==p.radius||!Number.isFinite(p.join_tangent)||before[(j+1)%before.length]?.id!==profile[(i+1)%profile.length].id||before[(j+before.length-1)%before.length]?.id!==profile[(i+profile.length-1)%profile.length].id)changed.add(p.id);
  });
  const values=profile.map(p=>({id:p.id,angle:p.angle,radius:p.radius*Math.max(1e-9,surfaceAt(radians(p.angle))),
    ...(!changed.has(p.id)&&Number.isFinite(p.join_tangent)?{tangent:p.join_tangent}:{})})),sample=compileProfilePoints(values);
  return profile.map((p,i)=>{
    const previous=values[(i+values.length-1)%values.length],next=values[(i+1)%values.length];
    if(!changed.has(p.id)&&!changed.has(previous.id)&&!changed.has(next.id))return p;
    const radius=values[i].radius,a=(radius-previous.radius)/radians(wrapDegrees(p.angle-previous.angle)),b=(next.radius-radius)/radians(wrapDegrees(next.angle-p.angle));
    let tangent=changed.has(p.id)?sample.derivative(radians(p.angle)):p.join_tangent;
    tangent=!a||!b||Math.sign(a)!==Math.sign(b)?0:Math.sign(a)*Math.max(0,Math.min(Math.sign(a)*tangent,3*Math.min(Math.abs(a),Math.abs(b))));
    return {...p,join_tangent:tangent};
  });
}

/** Rebased/fully reset controls may have a new monotone direction. Keep their
 * Hermite intervals positive and monotone so later subdivision remains exact. */
export function stabilizeDirectTrunkSectionTangents(profile){
  return profile.map((p,i)=>{
    if(!Number.isFinite(p.tangent))return p;
    const previous=profile[(i+profile.length-1)%profile.length],next=profile[(i+1)%profile.length],
      a=(p.radius-previous.radius)/radians(wrapDegrees(p.angle-previous.angle)),b=(next.radius-p.radius)/radians(wrapDegrees(next.angle-p.angle));
    const tangent=!a||!b||Math.sign(a)!==Math.sign(b)?0:Math.sign(a)*Math.max(0,Math.min(Math.sign(a)*p.tangent,3*Math.min(Math.abs(a),Math.abs(b))));
    return tangent===p.tangent?p:{...p,tangent};
  });
}

export function sampleDirectTrunkSectionProfile(profile, angleRadians) {
  return compileProfile(profile, true)(angleRadians);
}

export function createDirectTrunkForm(raw = null) {
  if (isDirectTrunkForm(raw)) return normalizeTrunkForm(raw);
  const legacy = normalizeTrunkForm(raw);
  return normalizeTrunkForm({ ...(legacy || {}), geometry_version: 2,
    ...(legacy?.sections.some(s=>s.roll_offset)?{sections:legacy.sections.map(s=>({...s,roll:angleDistance(radians(trunkFormSectionAt(legacy,s.t).roll),0)*180/Math.PI}))}:{}),
    ...(legacy ? { legacy_form: legacy } : {}) });
}

/** A temporary recipe used only for shape inspection; no authoring is changed. */
export function getBaseTrunkForm(raw) {
  const form = normalizeTrunkForm(raw);
  return form ? { ...form, groove_depth: 0, root_flare: 0, asymmetry: 0, buttresses: [],
    ...(isDirectTrunkForm(form) ? { ...(form.details?{details:[]}:{}),
      sections:form.sections.map(s=>s.profile_exclusions?{...s,profile_exclusions:s.profile_exclusions.map(({join,...range})=>range)}:s) } : {}) } : null;
}

/** Radius of an ellipse on a true polar ray, not its parametric angle. */
export function trunkSectionEllipseRadius(oval, angle) {
  if (!Number.isFinite(oval) || oval <= 0 || !Number.isFinite(angle)) return 1;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return 1 / Math.hypot(cos / oval, sin * oval);
}

function directKeys(form,{settings={},carrierSurfaceAt=()=>1}={}) {
  const keys = [];
  const detail=createTrunkDetailSampler(form?.details);
  for (const section of form?.enabled === false ? [] : form?.sections || []) {
    const offset=radians((settings.twist||0)+(settings.section_roll||0))*section.t;
    const key = { ...section, sample: createDirectTrunkSectionProfileSampler(section.profile,{exclusions:section.profile_exclusions,
      surfaceAt:a=>trunkSectionEllipseRadius(section.oval,a)*carrierSurfaceAt(section.t,a)*trunkFormRadialScale(form,section.t,a)*detail(section.t,a-offset)}) };
    // Stable sorting preserves record order. Overlapping copies stay authored;
    // the last key at the same t takes precedence until moved apart.
    if (keys.length && Math.abs(keys.at(-1).t - key.t) < 1e-10) keys[keys.length - 1] = key;
    else keys.push(key);
  }
  const neutral = t => ({ t, radius: 1, oval: 1, roll: 0, sample: () => 1 });
  if (!keys.length || keys[0].t > 0) keys.unshift(neutral(0));
  if (keys.at(-1).t < 1) keys.push(neutral(1));
  let previous = keys[0].roll;
  for (const [index, key] of keys.entries()) {
    if (!index) key.unwrappedRoll = previous;
    else { previous += angleDistance(radians(key.roll), radians(previous)) * 180 / Math.PI; key.unwrappedRoll = previous; }
  }
  return keys;
}

/** Existing keys keep their linear loft. Explicit smooth mode uses monotone
 * cubic values through the same circles; inserted circles then participate in
 * the neighbouring smooth spans. Roll follows the shortest unwrapped arc. */
export function createDirectTrunkFormSampler(form,options) {
  const normalized=normalizeTrunkForm(form),keys = directKeys(normalized,options),smoothLoft=normalized?.loft_interpolation==='SMOOTH';
  const pair = value => {
    const t = bounded(value, 0, 1, .5);
    if (t <= keys[0].t) return [keys[0], keys[0], 0,0];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i].t) {
      const a = keys[i - 1], b = keys[i]; return [a, b, (t - a.t) / (b.t - a.t),i-1];
    }
    return [keys.at(-1), keys.at(-1), 0,keys.length-2];
  };
  const interpolate = (a, b, u) => a + (b - a) * u;
  const values=new Map(),radial = (key, angle) => {
    if(!smoothLoft)return key.radius * trunkSectionEllipseRadius(key.oval, angle) * key.sample(angle);
    let cache=values.get(key);if(!cache){cache=new Map();values.set(key,cache);}if(cache.has(angle))return cache.get(angle);
    const value=key.radius * trunkSectionEllipseRadius(key.oval, angle) * key.sample(angle);if(cache.size>=2048)cache.clear();cache.set(angle,value);return value;
  };
  const blend=(a,b,u,i,read)=>a===b?read(a):smoothLoft?trunkLoftValue(keys,i,u,read):interpolate(read(a),read(b),u);
  const section=(a,b,u,i)=>({radius:blend(a,b,u,i,k=>k.radius),oval:blend(a,b,u,i,k=>k.oval),roll:blend(a,b,u,i,k=>k.unwrappedRoll)});
  return {
    at(t) { const [a, b, u,i] = pair(t); return {
      section: section(a,b,u,i),
      radialAt: angle => blend(a,b,u,i,key=>radial(key,angle)),
    }; },
    sectionAt(t) { return section(...pair(t)); },
    radialAt(t, angle) { const [a,b,u,i] = pair(t); return blend(a,b,u,i,key=>radial(key,angle)); },
  };
}

/** Capture an editable contour, without hidden source stacks. 32 explicit
 * knots approximate the complete interpolated polar contour. Original knot
 * angles are kept and remaining knots split the largest interpolation error.
 * relative_error records measured approximation rather than claiming lossless
 * conversion. Adding a key never creates a private model or moves mounts. */
export function sampleDirectTrunkSection(form, value, options) {
  const direct = isDirectTrunkForm(form) ? normalizeTrunkForm(form) : createDirectTrunkForm(form);
  const t = bounded(value, 0, 1, .5);
  const existing = direct.sections.filter(key => Math.abs(key.t - t) < 1e-10).at(-1);
  if (existing) {
    const { radius, oval, roll, profile, profile_coarse, profile_exclusions, contour_capture } = existing;
    return { radius, oval, roll, ...(profile ? { profile: profile.map(p=>({...p})) } : {}),
      ...(profile_coarse ? {profile_coarse:profile_coarse.map(p=>({...p}))} : {}),
      ...(profile_exclusions ? {profile_exclusions:profile_exclusions.map(p=>({...p}))} : {}),
      // This capture copies the current key exactly. An earlier approximation
      // warning belongs to the saved source, not to this new exact capture.
      ...(contour_capture ? { contour_capture: { version: 1, points: profile?.length || 0, relative_error: 0 } } : {}) };
  }
  const sampler = createDirectTrunkFormSampler(direct,options), section = sampler.sectionAt(t);
  section.roll = angleDistance(radians(section.roll), 0) * 180 / Math.PI;
  const compensation = angle => sampler.radialAt(t, angle) / (section.radius * trunkSectionEllipseRadius(section.oval, angle));
  if (Array.from({length:1024},(_,i)=>compensation(i*TAU/1024)).every(r=>Math.abs(r-1)<1e-10)) return section;
  const sources = directKeys(direct);
  const index = sources.findIndex(key => key.t >= t), left = sources[Math.max(0, index - 1)], right = sources[Math.max(0, index)];
  const angles = [...new Set([...Array.from({length:8},(_,i)=>i*45), ...(left?.profile || []).map(p => p.angle), ...(right?.profile || []).map(p => p.angle)])]
    .sort((a, b) => a - b).slice(0, 32);
  let profile, error = 0;
  while (true) {
    profile = angles.map((angle, i) => ({ id: `PROFILE_${i + 1}`, angle, radius: compensation(radians(angle)) }));
    const actual = compileProfile(profile, true); let worst = null; error = 0;
    // Check a fixed dense angular grid as well as interval midpoints. This
    // error estimate stays independent of render LOD and camera distance.
    const candidates = [...Array.from({length:1024}, (_,i)=>i*360/1024),
      ...angles.map((angle,i)=>(angle+((angles[(i+1)%angles.length]-angle+360)%360)/2)%360)];
    for (const angle of candidates) {
      const expected = compensation(radians(angle));
      const relative = Math.abs(actual(radians(angle)) - expected) / Math.max(expected, .001);
      if (relative > error && !angles.some(a=>Math.abs(a-angle)<1e-6)) { error = relative; worst = angle; }
    }
    if (angles.length >= 32 || worst === null || [8,12,16,24,32].includes(angles.length) && error <= .005) break;
    angles.push(worst); angles.sort((a,b)=>a-b);
  }
  return { ...section, profile: normalizeDirectTrunkSectionProfile(profile),
    contour_capture: { version: 1, points: profile.length, relative_error: error },
    ...(error > .01 ? { capture_error: { code: 'CONTOUR_APPROXIMATION', relative_error: error, limit: .01 } } : {}) };
}

/** Positive polar skin in the branch's transported local frame. Angles are
 * radians here and degrees in the saved recipe/UI. Grooves only shrink skin;
 * root flares and individually editable buttresses extend its silhouette. */
export function trunkFormRadialScale(form, t, angle) {
  if (!form || form.enabled === false) return 1;
  const start = form.height_start, end = form.height_end, span = end - start;
  if (span <= 1e-8 || t < start || t > end) return 1;
  const local = Math.max(0, Math.min(1, (t - start) / span));
  const fade = Math.min(start > 0 ? smooth(local / .12) : 1, end < 1 ? smooth((1 - local) / .12) : 1);
  const phase = angle + .08 * Math.sin(local * TAU);
  const groove = Math.pow(Math.max(0, Math.cos(phase * form.groove_count)), 2);
  let scale = (1 - form.groove_depth * groove)
    * (1 + form.asymmetry * (.7 * Math.sin(angle + local * 2.1) + .3 * Math.cos(angle * 2 - local * 1.7)));
  scale += form.root_flare * Math.pow(Math.max(0, 1 - local / .35), 2);
  for (const root of form.buttresses || []) {
    const axial = Math.pow(Math.max(0, 1 - local / root.height), 1.8);
    const angular = Math.exp(-.5 * Math.pow(angleDistance(angle, radians(root.angle)) / radians(root.width), 2));
    scale += root.length * root.strength * axial * angular;
  }
  return 1 + (Math.max(.08, Math.min(20, scale)) - 1) * fade;
}
