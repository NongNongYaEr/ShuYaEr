import * as THREE from './vendor/three.module.min.js';
import {axisTimes,axisSegment,cloneAxis,sampleAxis,tangentAxis,uniqueAxisTimes} from './branch-axis.js';
import {relaxSweepStrips} from './branch-sweep-continuity.js';
import {sectionAt,branchRadiusAt,branchSampleTs} from './branch-shaping.js';
import {isDirectTrunkForm,createDirectTrunkFormSampler,createTrunkFormProfileSampler,trunkFormSectionAt,trunkFormRadialScale,trunkSectionEllipseRadius} from './trunk-form.js';
import {createTrunkDetailSampler} from './trunk-details.js';
import {createTrunkMeshSampling} from './trunk-mesh-density.js';
import {createTrunkRootPlaneAlignment} from './trunk-root-plane.js';
import {applyLegacyTrunkRotation} from './trunk-legacy-rotation.js';
import {DEFAULT_WIND_PROFILE} from './wind-profile-defaults.js';
import {computeGeometryNormals} from './geometry-accelerator.js';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),radians=v=>v*Math.PI/180;

export function tangentFrame(tangent, phase = 0) {
  const helper = Math.abs(tangent.z) > 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const x = new THREE.Vector3().crossVectors(helper, tangent).normalize();
  const y = new THREE.Vector3().crossVectors(tangent, x).normalize();
  if (phase) {
    const q = new THREE.Quaternion().setFromAxisAngle(tangent, phase);
    x.applyQuaternion(q);
    y.applyQuaternion(q);
  }
  return { x, y };
}

export function pointOnPolyline(points, t) {
  if(axisTimes(points))return sampleAxis(points,t);
  const scaled = clamp(t, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  return points[index].clone().lerp(points[index + 1], fraction);
}

export function tangentOnPolyline(points, t) {
  if(axisTimes(points))return tangentAxis(points,t);
  const scaled = clamp(t, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  return points[index + 1].clone().sub(points[Math.max(0, index)]).normalize();
}

// DIRECT uses a fixed transported frame grid independent of authored key t.
// Inserting an extra section must not rotate every downstream ring.
function directSweepFrames(branch, ts, stable = false) {
  const points = ts.map(t => pointOnPolyline(branch.points, t));
  // Source directions do not depend on uneven tessellation rings. Averaging
  // unit segment directions also avoids bias where edited segments differ in
  // length; ring centres and the skeleton remain on the original polyline.
  const sourceTangents=stable?branch.points.map((p,i)=>{
    const a=i?p.clone().sub(branch.points[i-1]).normalize():null,b=i<branch.points.length-1?branch.points[i+1].clone().sub(p).normalize():null;
    if(a&&b){const direction=a.clone().add(b);return direction.lengthSq()>1e-12?direction.normalize():b.lengthSq()>1e-12?b:a.lengthSq()>1e-12?a:new THREE.Vector3(0,0,1);}
    const direction=a||b;return direction?.lengthSq()>1e-12?direction:new THREE.Vector3(0,0,1);
  }):null;
  let previousX = null;
  const frames = points.map((point, index) => {
    const {index:sourceIndex,u:sourceBlend}=axisSegment(branch.points,ts[index]);
    const tangent = sourceTangents?sourceTangents[sourceIndex].clone().lerp(sourceTangents[sourceIndex+1],sourceBlend).normalize():index === 0 ? points[1].clone().sub(point).normalize()
      : index === points.length - 1 ? point.clone().sub(points[index - 1]).normalize()
        : points[index + 1].clone().sub(points[index - 1]).normalize();
    if(sourceTangents&&tangent.lengthSq()<1e-12)tangent.copy(sourceTangents[sourceIndex]);
    let x = previousX ? previousX.clone().sub(tangent.clone().multiplyScalar(previousX.dot(tangent))).normalize()
      : tangentFrame(tangent, branch.phase).x;
    if (x.lengthSq() < 1e-8) x = tangentFrame(tangent).x;
    const y = new THREE.Vector3().crossVectors(tangent, x).normalize(); previousX = x;
    return { tangent, x, y };
  });
  return t => {
    let index = ts.findIndex(value => value >= t);
    if (index < 0) index = ts.length - 1;
    if (ts[index] === t || index === 0) return frames[index];
    const a = frames[index - 1], b = frames[index], u = (t - ts[index - 1]) / (ts[index] - ts[index - 1]);
    const tangent = a.tangent.clone().lerp(b.tangent, u).normalize();
    const x = a.x.clone().lerp(b.x, u); x.addScaledVector(tangent, -x.dot(tangent)).normalize();
    if (x.lengthSq() < 1e-8) x.copy(tangentFrame(tangent).x);
    return { tangent, x, y: new THREE.Vector3().crossVectors(tangent, x).normalize() };
  };
}

// Preserve the original transported section frame before the edited anchor.
// Applying the local turn to that frame also preserves prior roll on the tail.
function pointCornerFrames(branch,settings){
  const deformation=branch.points.axisDeformation;
  if(deformation){
    const source=pointCornerFrames({...branch,points:deformation.source},settings);
    return t=>{const frame=source(t),q=deformation.turnAt(t);return{tangent:frame.tangent.clone().applyQuaternion(q),x:frame.x.clone().applyQuaternion(q),y:frame.y.clone().applyQuaternion(q)};};
  }
  if(branch.legacyRigidGeometry&&!axisTimes(branch.points)){
    const {baseline,matrix}=branch.legacyRigidGeometry,source=pointCornerFrames({...baseline,axisLod:branch.axisLod},settings),q=new THREE.Quaternion().setFromRotationMatrix(matrix);
    return t=>{const frame=source(t);return{tangent:frame.tangent.clone().applyQuaternion(q),x:frame.x.clone().applyQuaternion(q),y:frame.y.clone().applyQuaternion(q)};};
  }
  const lod=branch.axisLod??1,count=Math.max(5,Math.round((branch.points.length-1)*lod));
  let points=branch.surfaceNormals?cloneAxis(branch.points):resamplePoints(branch.points,count+1);
  if(settings.adaptive_tessellation&&lod>=.76&&!branch.surfaceNormals)points=adaptiveCurvePoints(points,settings.curvature_detail*lod);
  const source={...branch,points},form=source.trunkForm?.enabled!==false?source.trunkForm:null,keys=branchSampleTs(source),values=[...keys,...Array.from({length:65},(_,i)=>i/64)],ts=form?(axisTimes(points)?uniqueAxisTimes(values):[...new Set(values)].sort((a,b)=>a-b)):keys;
  return directSweepFrames(source,ts,isDirectTrunkForm(form)||Boolean(axisTimes(points)));
}

export function createSweptBranchGeometry(branch, radialSegments, settings, options = {}) {
  if (branch.legacyRigidGeometry&&!axisTimes(branch.points)) {
    const { baseline,matrix } = branch.legacyRigidGeometry;
    const geometry = createSweptBranchGeometry(baseline, radialSegments, settings, options);
    ensureGeometryTangents(geometry);
    geometry.applyMatrix4(matrix);
    for (const ring of geometry.userData.radiusRings || []) ring.center=new THREE.Vector3(...ring.center).applyMatrix4(matrix).toArray();
    geometry.computeBoundingBox();
    return geometry;
  }
  const form = branch.trunkForm?.enabled !== false ? branch.trunkForm : null;
  const direct = isDirectTrunkForm(form), directSampler = direct ? createDirectTrunkFormSampler(form,{settings,
    carrierSurfaceAt:(t,a)=>trunkSectionEllipseRadius((settings.cross_section==='OVAL'?settings.oval_ratio:1)*sectionAt(branch.sections,t).oval,a)}) : null;
  const detailed = direct && form.details?.some(detail => detail.enabled !== false && detail.strength > 0);
  const detailScaleAt = detailed ? createTrunkDetailSampler(form.details) : null;
  const profileScaleAt = direct ? null : createTrunkFormProfileSampler(form);
  const neutralSurface = !form || form.groove_depth === 0 && form.root_flare === 0 && form.asymmetry === 0 && !form.buttresses?.length;
  // Surface controls use a fixed grid: moving a section or changing the number
  // of grooves/buttresses cannot change mesh topology while dragging. The old
  // branch path is untouched when there is no enabled recipe.
  if (form) radialSegments = Math.max(detailed ? 96 : 64, radialSegments);
  const wholePoints=direct?Math.max(0,...form.sections.map(s=>s.profile?.length||0)):0;
  if(wholePoints>32)radialSegments=Math.max(radialSegments,wholePoints*2);
  const frameSeeds=[...branchSampleTs(branch),...Array.from({length:65},(_,index)=>index/64)];
  const frameTs = form ? axisTimes(branch.points)?uniqueAxisTimes(frameSeeds):[...new Set(frameSeeds)].sort((a,b)=>a-b) : branchSampleTs(branch);
  const fixedTs = detailed ? [...new Set([...frameTs,
    ...Array.from({ length: 129 }, (_, index) => index / 128)])].sort((a, b) => a - b) : frameTs;
  const legacySampleTs = direct ? [...new Set([...fixedTs, ...form.sections.map(section=>section.t)])].sort((a,b)=>a-b)
    .filter((t,i,all)=>!i || t-all[i-1]>1e-10) : fixedTs;
  const wholeAngles=wholePoints>32?form.sections.flatMap(s=>(s.profile||[]).map(p=>(p.angle-(settings.twist+settings.section_roll)*s.t)*Math.PI/180)):[];
  const meshSampling = form ? createTrunkMeshSampling(branch, form.mesh, direct ? form.details : [], legacySampleTs, {...options,seedAngles:wholeAngles,priorityTs:[...(form?.sections||[]).map(s=>s.t),...(branch.sections||[]).map(s=>s.t),...(branch.points.axisCuts||[])]}) : null;
  const fullSampleTs = meshSampling?.ts || legacySampleTs;
  let sampleTs=fullSampleTs;
  if(options.handleTs){
    const keep=new Set([0,fullSampleTs.length-1]);
    for(const t of options.handleTs){let i=0;while(i<fullSampleTs.length-1&&fullSampleTs[i]<t)i++;keep.add(i);keep.add(Math.max(0,i-1));}
    sampleTs=[...keep].sort((a,b)=>a-b).map(i=>fullSampleTs[i]);
  }
  const sampleAngles = meshSampling?.angles;
  if (sampleAngles) radialSegments = sampleAngles.length;
  const directFrameAt = branch.points.axisDeformation?pointCornerFrames(branch,settings):direct || meshSampling || axisTimes(branch.points) ? directSweepFrames(branch, frameTs, direct||Boolean(axisTimes(branch.points))) : null;
  const points = form || branch.sections?.length || branch.skeletonRadius || axisTimes(branch.points) ? sampleTs.map((t) => pointOnPolyline(branch.points, t)) : branch.points;
  // Allocate the final buffers once. Dense detail previews otherwise grow
  // several million-entry JS arrays and then copy all of them to typed arrays
  // on every pointer frame, keeping both copies alive until the next GC.
  const vertexCount = points.length * radialSegments + 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 4);
  const indices = new (vertexCount > 65535 ? Uint32Array : Uint16Array)(points.length * radialSegments * 6);
  let positionOffset = 0, uvOffset = 0, colorOffset = 0, indexOffset = 0;
  const offset = new THREE.Vector3(), point = new THREE.Vector3();
  let previousX = null;
  const ringFrames = [];
  const alignRootPlane=createTrunkRootPlaneAlignment(branch,form);
  for (let ring = 0; ring < points.length; ring += 1) {
    const t = sampleTs[ring];
    const directFrame = directFrameAt?.(t);
    let tangent = directFrame?.tangent || (ring === 0
      ? points[1].clone().sub(points[0]).normalize()
      : ring === points.length - 1
        ? points[ring].clone().sub(points[ring - 1]).normalize()
        : points[ring + 1].clone().sub(points[ring - 1]).normalize());
    let x;
    if (directFrame) x = directFrame.x;
    else if (!previousX) x = tangentFrame(tangent, branch.phase).x;
    else {
      x = previousX.clone().sub(tangent.clone().multiplyScalar(previousX.dot(tangent))).normalize();
      if (x.lengthSq() < 1e-8) x = tangentFrame(tangent).x;
    }
    let y = new THREE.Vector3().crossVectors(tangent, x).normalize();
    previousX = x;
    const rootFrame=alignRootPlane?.(t,{tangent,x,y});
    if(rootFrame){tangent=rootFrame.tangent;x=rootFrame.x;y=rootFrame.y;}
    const section = sectionAt(branch.sections, t);
    const evaluatedSection = directSampler?.at(t);
    const formSection = evaluatedSection?.section || trunkFormSectionAt(form, t,{baseRotation:true});
    const baseRadius = branchRadiusAt(branch, settings, t) * formSection.radius;
    const ovalX = (settings.cross_section === 'OVAL' ? settings.oval_ratio : 1) * section.oval * formSection.oval;
    const ovalY = 1 / ovalX;
    const roll = radians(section.roll + formSection.roll);
    ringFrames.push({ tangent, x, y,
      rolledX: x.clone().applyAxisAngle(tangent, roll), rolledY: y.clone().applyAxisAngle(tangent, roll),
      localRadius: baseRadius, ovalX, ovalY, roll,
      angleOffset: radians(settings.twist + settings.section_roll) * t });
    for (let side = 0; side < radialSegments; side += 1) {
      const angle = (sampleAngles ? sampleAngles[side] : side / radialSegments * Math.PI * 2) + radians(settings.twist + settings.section_roll) * t;
      // A denser surface grid must not squeeze the original index-based rough
      // wave into dozens of transverse wrinkles. Enabled forms use a smooth,
      // deterministic longitudinal phase independent of sampling resolution.
      if (direct) offset.copy(x).multiplyScalar(Math.cos(angle)).addScaledVector(y, Math.sin(angle))
          .multiplyScalar(baseRadius / formSection.radius * evaluatedSection.radialAt(angle)
            * trunkSectionEllipseRadius((settings.cross_section === 'OVAL' ? settings.oval_ratio : 1) * section.oval, angle)
            * (neutralSurface ? 1 : trunkFormRadialScale(form, t, angle))
            * (detailScaleAt ? detailScaleAt(t, angle - radians(settings.twist + settings.section_roll) * t) : 1));
      else {
        const rough = 1 + settings.surface_roughness * Math.sin(angle * 3 + branch.phase * 7 + (form || axisTimes(branch.points) ? t * Math.PI * 2 : ring * 1.71));
        const lobe = settings.cross_section === 'LOBED' ? 1 + settings.lobe_strength * Math.cos(angle * settings.lobe_count) : 1;
        const groove = 1 - settings.groove_depth * Math.pow(Math.max(0, Math.cos(angle * settings.groove_count + branch.phase)), 4);
        const knot = 1 + settings.knot_strength * Math.pow(Math.max(0, Math.sin(t * Math.PI * 3 + branch.phase * 2)), 12);
        offset.copy(x).multiplyScalar(Math.cos(angle) * ovalX).addScaledVector(y, Math.sin(angle) * ovalY)
          .multiplyScalar(baseRadius * rough * lobe * groove * knot * trunkFormRadialScale(form, t, angle) * profileScaleAt(t, angle));
      }
      offset.applyAxisAngle(tangent, roll);
      point.copy(points[ring]).add(offset);
      positions[positionOffset++]=point.x;positions[positionOffset++]=point.y;positions[positionOffset++]=point.z;
      uvs[uvOffset++]=((sampleAngles ? sampleAngles[side] / (Math.PI * 2) : side / radialSegments) + settings.bark_seam / 360 + 1) % 1;
      uvs[uvOffset++]=t * branch.length * settings.bark_tiling / Math.max(branch.startRadius * 12, 0.2);
      const wind = settings.wind_profile || DEFAULT_WIND_PROFILE;
      const stiffness = clamp(THREE.MathUtils.lerp(wind.root_stiffness, wind.tip_stiffness, t) * (branch.windStiffness || 1), 0, 2);
      colors[colorOffset++]=clamp(t * (1 - stiffness * 0.72), 0, 1);colors[colorOffset++]=clamp(branch.order / 4, 0, 1);
      colors[colorOffset++]=branch.windPhase;colors[colorOffset++]=settings.health;
    }
  }
  for (let ring = 0; ring < points.length - 1; ring += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const next = (side + 1) % radialSegments;
      const a = ring * radialSegments + side;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + next;
      const d = (ring + 1) * radialSegments + side;
      indices[indexOffset++]=a;indices[indexOffset++]=b;indices[indexOffset++]=c;
      indices[indexOffset++]=a;indices[indexOffset++]=c;indices[indexOffset++]=d;
    }
  }
  const appendCap = (ring, reverse) => {
    const centerIndex = positionOffset / 3;
    const center = points[ring];
    positions[positionOffset++]=center.x;positions[positionOffset++]=center.y;positions[positionOffset++]=center.z;
    uvs[uvOffset++]=0.5;uvs[uvOffset++]=0.5;
    const t = ring === 0 ? 0 : 1;
    colors[colorOffset++]=t;colors[colorOffset++]=clamp(branch.order / 4, 0, 1);colors[colorOffset++]=branch.windPhase;colors[colorOffset++]=settings.health;
    const ringStart = ring * radialSegments;
    for (let side = 0; side < radialSegments; side += 1) {
      const next = (side + 1) % radialSegments;
      indices[indexOffset++]=centerIndex;
      indices[indexOffset++]=ringStart+(reverse?next:side);indices[indexOffset++]=ringStart+(reverse?side:next);
    }
  };
  appendCap(0, true);
  appendCap(points.length - 1, false);
  const geometry = new THREE.BufferGeometry();
  geometry.userData.radiusRings=points.map((p,i)=>({t:sampleTs[i],center:p.toArray(),offset:i*radialSegments,count:radialSegments,
    tangent:ringFrames[i].tangent.toArray(),x:ringFrames[i].x.toArray(),y:ringFrames[i].y.toArray(),
    rolledX:ringFrames[i].rolledX.toArray(),rolledY:ringFrames[i].rolledY.toArray(),
    localRadius:ringFrames[i].localRadius,ovalX:ringFrames[i].ovalX,ovalY:ringFrames[i].ovalY,
    roll:ringFrames[i].roll,angleOffset:ringFrames[i].angleOffset,
    ...(direct?{geometryVersion:2,polarAngles:true}:{}),...(sampleAngles?{sampleAngles}:{} )}));
  if (meshSampling) geometry.userData.trunkMeshSampling = meshSampling.info;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  if(axisTimes(branch.points)&&!options.handleTs&&relaxSweepStrips(positions,geometry.userData.radiusRings,branch.points.axisDeformation?.start))geometry.userData.sweepStripRelaxed=true;
  if(form&&!direct&&form.sections.some(s=>s.roll_offset)){const rotated=applyLegacyTrunkRotation(geometry,form.sections,options);if(rotated!==geometry){geometry.dispose();return rotated;}}
  if(!options.handleTs)computeGeometryNormals(geometry);
  geometry.computeBoundingBox();
  return geometry;
}

export function adaptiveCurvePoints(points, strength) {
  if(axisTimes(points))return cloneAxis(points);
  if (points.length < 3 || strength <= 0) return points.map((point) => point.clone());
  const result = [points[0].clone()];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 2)];
    const a = current.clone().sub(before).normalize();
    const b = after.clone().sub(next).normalize();
    const curvature = 1 - clamp(a.dot(b), -1, 1);
    const subdivisions = curvature * strength > 0.16 ? 3 : curvature * strength > 0.045 ? 2 : 1;
    for (let step = 1; step <= subdivisions; step += 1) result.push(current.clone().lerp(next, step / subdivisions));
  }
  return result;
}

export function ensureGeometryTangents(geometry) {
  if (!geometry.getAttribute('normal') && geometry.getAttribute('position')) computeGeometryNormals(geometry);
  if (geometry.getAttribute('tangent') || !geometry.getAttribute('normal')) return;
  const normal = geometry.getAttribute('normal');
  const tangent = new Float32Array(normal.count * 4);
  const n = new THREE.Vector3();
  const reference = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let index = 0; index < normal.count; index += 1) {
    n.fromBufferAttribute(normal, index).normalize();
    reference.set(Math.abs(n.z) < 0.9 ? 0 : 1, 0, Math.abs(n.z) < 0.9 ? 1 : 0);
    t.crossVectors(reference, n).normalize();
    tangent[index * 4] = t.x;
    tangent[index * 4 + 1] = t.y;
    tangent[index * 4 + 2] = t.z;
    tangent[index * 4 + 3] = 1;
  }
  geometry.setAttribute('tangent', new THREE.BufferAttribute(tangent, 4));
}

export function resamplePoints(points, count) {
  if(axisTimes(points))return cloneAxis(points);
  if (count >= points.length) return points.map((point) => point.clone());
  return Array.from({ length: count }, (_, index) => pointOnPolyline(points, index / Math.max(1, count - 1)));
}

