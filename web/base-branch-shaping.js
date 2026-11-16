import * as THREE from './vendor/three.module.min.js';
import { baseBranchGeometry } from './base-branch-assembly.js';
import { axisSegment, nearestAxis, sampleAxis, tangentAxis, withAxisTimes } from './branch-axis.js';
import { sealImmutableJson } from './immutable-json.js';
import { createTrunkPose, deformTrunkPrimitive } from './imported-trunk-binding.js';
import { validateTrunkGuides } from './imported-trunk-data.js';
import { BASE_BRANCH_MAX_SIZE_M, geometryExtent } from './plant-unit-data.js';
import { identifyTrunkSkeleton } from './trunk-auto-skeleton.js';

export const BASE_BRANCH_SHAPING_OPTIONS = Object.freeze({ quality:'standard', detail:'standard', density:'simple' });
export const BASE_BRANCH_THICKNESS_RANGE = Object.freeze([.25,4]);

const primitiveId = 'BASE_BRANCH_WOOD';
const rootPoint = [0, 0, 0];
const minimumThickness = .125, maximumThickness = 8;
const vector = point => new THREE.Vector3(...point);
const toWorking = ([x,y,z], size = 1) => [y * size, -x * size, z * size];
const toSource = ([x,y,z]) => [-y, x, z];
const samePoint = (a,b) => a.every((value,index) => value === b[index]);

export function baseBranchShapingAnalysisInput(base) {
  // The kit uses +Y for growth; the existing skeleton analyser uses +Z.
  const size = base.size_m;
  return { primitives:[{position:base.geometry.position,index:base.geometry.index}],
    matrix:[size,0,0,0, 0,0,size,0, 0,-size,0,0, 0,0,0,1] };
}

function pathTimes(points) {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances.at(-1) + vector(points[i]).distanceTo(vector(points[i - 1])));
  }
  return distances.map(distance => distance / distances.at(-1));
}

const axis = (points,times = pathTimes(points)) => withAxisTimes(points.map(vector),times);

function prepareGuides(base, candidates) {
  if (base.shape_guides?.length) {
    return validateTrunkGuides(base.shape_guides.map(guide => ({...guide,
      points:guide.points.map(point => toWorking(point,base.size_m)),
      start_radius:guide.start_radius * base.size_m, end_radius:guide.end_radius * base.size_m,
    })));
  }
  const raw = candidates ?? identifyTrunkSkeleton(baseBranchShapingAnalysisInput(base), BASE_BRANCH_SHAPING_OPTIONS).guides;
  validateTrunkGuides(raw);
  const parents = new Map();
  return validateTrunkGuides(raw.map(guide => {
    const points = guide.points.map(([x,y,z]) => [z,-x,-y]);
    let attach = guide.attach;
    if (!guide.parent) {
      points[0] = rootPoint.slice();
      const next = vector(points[1]), length = next.length();
      if (length < 1e-5) throw Error('基础枝根部太短，无法固定接口方向。');
      // A short fixed section keeps the connection position and direction.
      points.splice(1,0,next.multiplyScalar(Math.min(.5,base.size_m * .035 / length)).toArray());
    } else {
      const parent = parents.get(guide.parent);
      attach = nearestAxis(parent,vector(points[0]));
      points[0] = sampleAxis(parent,attach).toArray();
    }
    parents.set(guide.id,axis(points));
    return {...guide,points,attach};
  }));
}

function bindingMesh(base,guides) {
  const geometry = baseBranchGeometry({base});
  try {
    const position = Array.from(geometry.attributes.position.array), normal = Array.from(geometry.attributes.normal.array);
    // Unreferenced vertices can have zero normals in old kit entries.
    for (let i = 0; i < normal.length; i += 3) {
      if (Math.hypot(normal[i],normal[i + 1],normal[i + 2]) < 1e-10) normal[i + 2] = 1;
    }
    return sealImmutableJson({
      calibration:{base:[0,0,0],tip:[0,0,1],front:[0,1,0],scale:1}, guides,
      primitives:[{id:primitiveId,geometry:{position,normal}}],
    });
  } finally { geometry.dispose(); }
}

function blendMatrices(first,second,weight) {
  const matrix = first.clone();
  matrix.elements.forEach((value,index) => { matrix.elements[index] = THREE.MathUtils.lerp(value,second.elements[index],weight); });
  return matrix;
}

function checkSurface(base,position) {
  const {index} = base.geometry, source = base.geometry.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const area = (values,face) => {
    a.fromArray(values,index[face] * 3);
    b.fromArray(values,index[face + 1] * 3).sub(a);
    c.fromArray(values,index[face + 2] * 3).sub(a);
    return b.cross(c).lengthSq();
  };
  const scale = base.size_m ** 4;
  for (let face = 0; face < index.length; face += 3) {
    const before = area(source,face) * scale;
    if (before > 1e-20 && area(position,face) < before * .000025) {
      throw Error('调整后有三角面压扁，请减小该处弯曲再保存。');
    }
  }
}

export function createBaseBranchShaping(base,{candidates} = {}) {
  const guides = sealImmutableJson(prepareGuides(base,candidates));
  const main = guides[0].id;
  const rest = new Map(guides.map(guide => [guide.id,guide]));
  const stations = new Map(guides.map(guide => [guide.id,pathTimes(guide.points)]));
  const guideMap = Object.fromEntries(guides.map(guide => [guide.id,guide.id]));
  let binding;

  function canEditPoint(id,index) {
    const guide = rest.get(id);
    return Boolean(guide && Number.isInteger(index) && index >= (id === main ? 2 : 1) && index < guide.points.length);
  }

  function canScaleThickness(id,index) {
    const guide = rest.get(id);
    return Boolean(guide && Number.isInteger(index) && index >= (id === main ? 0 : 1) && index < guide.points.length);
  }

  function rotationPivot(id,index) {
    const guide = rest.get(id);
    if (!guide || !Number.isInteger(index) || index < 0 || index >= guide.points.length) return null;
    const pivot = Math.min(index,guide.points.length - 2);
    return pivot >= (id === main ? 1 : 0) ? pivot : null;
  }

  function canRotateAfter(id,index) {
    return rotationPivot(id,index) !== null;
  }

  function isRest(current) {
    return current.length === guides.length && guides.every((guide,i) => current[i].id === guide.id
      && !current[i].radialFactors?.some(factor => factor !== 1)
      && current[i].points.length === guide.points.length && guide.points.every((point,j) => samePoint(point,current[i].points[j])));
  }

  function validate(current) {
    validateTrunkGuides(current);
    if (current.length !== guides.length || current.some((guide,i) => guide.id !== guides[i].id
      || guide.parent !== guides[i].parent || guide.attach !== guides[i].attach || guide.points.length !== guides[i].points.length
      || guide.start_radius !== guides[i].start_radius || guide.end_radius !== guides[i].end_radius)) {
      throw Error('基础枝控制线与原网格绑定不一致。');
    }
    if (!samePoint(current[0].points[0],guides[0].points[0]) || !samePoint(current[0].points[1],guides[0].points[1])) {
      throw Error('基础枝的根部接口已固定。');
    }
    for (const {id,points,radialFactors} of current) {
      if (radialFactors && (!Array.isArray(radialFactors) || radialFactors.length !== points.length
        || radialFactors.some((factor,index) => !Number.isFinite(factor) || factor < minimumThickness
          || factor > maximumThickness || (factor !== 1 && !canScaleThickness(id,index)))
        || (id === main && radialFactors[0] !== radialFactors[1]))) {
        throw Error('基础枝的粗细超出可调范围。');
      }
    }
  }

  function edit(current,adjust) {
    const before = new Map(), after = new Map();
    const result = current.map(guide => {
      const times = stations.get(guide.id), oldPath = axis(guide.points,times);
      before.set(guide.id,oldPath);
      const oldParent = before.get(guide.parent), newParent = after.get(guide.parent);
      let inherited = null;
      if (oldParent && newParent !== oldParent) {
        const origin = oldPath[0], destination = sampleAxis(newParent,guide.attach);
        const rotation = new THREE.Quaternion().setFromUnitVectors(tangentAxis(oldParent,guide.attach),tangentAxis(newParent,guide.attach));
        inherited = point => point.clone().sub(origin).applyQuaternion(rotation).add(destination);
      }
      const points = oldPath.map((point,index) => (adjust(guide,index,point) || inherited?.(point) || point).toArray());
      if (points.every((point,i) => samePoint(point,guide.points[i]))) {
        after.set(guide.id,oldPath);
        return guide;
      }
      after.set(guide.id,axis(points,times));
      return {...guide,points};
    });
    validate(result);
    return result;
  }

  function movePoints(current,selection,delta) {
    const offset = delta?.isVector3 ? delta : vector(delta);
    const selected = new Set(selection.filter(({guide,index}) => canEditPoint(guide,index)).map(({guide,index}) => `${guide}:${index}`));
    return edit(current,(guide,index,point) => selected.has(`${guide.id}:${index}`) ? point.clone().add(offset) : null);
  }

  function rotateAfter(current,{guide:id,index},rotation) {
    const pivotIndex = rotationPivot(id,index);
    if (pivotIndex === null) return current;
    const pivot = vector(current.find(guide => guide.id === id).points[pivotIndex]);
    const turn = rotation?.isQuaternion ? rotation : new THREE.Quaternion(...rotation);
    if (!turn.x && !turn.y && !turn.z && Math.abs(turn.w) === 1) return current;
    return edit(current,(guide,i,point) => guide.id === id && i > pivotIndex
      ? point.clone().sub(pivot).applyQuaternion(turn).add(pivot) : null);
  }

  function scaleThickness(current,selection,factor) {
    if (!(Number.isFinite(factor) && factor > 0)) throw Error('请输入有效的粗细倍率。');
    factor = THREE.MathUtils.clamp(factor,...BASE_BRANCH_THICKNESS_RANGE);
    if (factor === 1) return current;
    const selected = new Map();
    for (const {guide,index} of selection) {
      if (!canScaleThickness(guide,index)) continue;
      if (!selected.has(guide)) selected.set(guide,new Set());
      const indices = selected.get(guide);
      if (guide === main && index < 2) {
        indices.add(0);
        indices.add(1);
      } else indices.add(index);
    }
    if (!selected.size) return current;
    const next = current.map(guide => {
      const indices = selected.get(guide.id);
      if (!indices) return guide;
      const {radialFactors:previous,...path} = guide;
      const factors = previous?.slice() ?? guide.points.map(() => 1);
      let changed = false;
      for (const index of indices) {
        const scaled = THREE.MathUtils.clamp(factors[index] * factor,minimumThickness,maximumThickness);
        const value = Math.abs(scaled - 1) < 1e-12 ? 1 : scaled;
        changed ||= value !== factors[index];
        factors[index] = value;
      }
      if (!changed) return guide;
      return factors.some(value => value !== 1) ? {...path,radialFactors:factors} : path;
    });
    return next.some((guide,index) => guide !== current[index]) ? next : current;
  }

  function evaluate(current) {
    validate(current);
    binding ||= bindingMesh(base,guides);
    const branches = current.map(guide => ({stableId:guide.id,points:axis(guide.points,stations.get(guide.id))}));
    const pose = createTrunkPose(binding,{guide_map:guideMap,binding:'FLEX'},branches);
    const paths = new Map(branches.map(branch => [branch.stableId,branch.points]));
    const collar = pose.bones.get(main);
    collar[0].identity();
    collar[1].identity();
    for (const {id,radialFactors} of current) {
      if (!radialFactors) continue;
      const {frames} = pose.source.byId.get(id), bones = pose.bones.get(id);
      for (const [index,factor] of radialFactors.entries()) {
        if (factor === 1) continue;
        // Scale the source cross-section about the guide point, keeping the
        // longitudinal component and the existing skin weights. Use the same
        // cut axis across the locked collar, including when the branch bends.
        const frame = frames[id === main && index < 2 ? 0 : index];
        const radial = frame.clone().scale(new THREE.Vector3(factor,factor,1)).multiply(frame.clone().invert());
        bones[index].multiply(radial);
      }
    }
    // At the graft both sides use the parent's local frame, then the child
    // transitions into its own deformation along its first segment.
    for (const guide of current) {
      if (!guide.parent) continue;
      const {index,u} = axisSegment(paths.get(guide.parent),guide.attach);
      const parent = pose.bones.get(guide.parent);
      const transition = blendMatrices(parent[index],parent[index + 1],u);
      const originalRoot = vector(rest.get(guide.id).points[0]);
      transition.setPosition(0,0,0);
      transition.setPosition(vector(guide.points[0]).sub(originalRoot.applyMatrix4(transition)));
      pose.bones.get(guide.id)[0] = transition;
    }
    return deformTrunkPrimitive(pose,primitiveId);
  }

  function preview(current) {
    validate(current);
    const changed = !isRest(current);
    const mesh = changed ? evaluate(current) : null;
    const geometry = baseBranchGeometry({base});
    if (mesh) {
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(mesh.position,3));
      geometry.setAttribute('normal',new THREE.Float32BufferAttribute(mesh.normal,3));
    }
    return geometry;
  }

  function bake(current,{id,name}) {
    const mesh = evaluate(current);
    const position = [], normal = [];
    for (let i = 0; i < mesh.position.length; i += 3) {
      position.push(...toSource(mesh.position.slice(i,i + 3)));
      normal.push(...toSource(mesh.normal.slice(i,i + 3)));
    }
    const geometry = {...base.geometry,position,normal};
    const size = geometryExtent(geometry).longest;
    const tip = toSource(current[0].points.at(-1));
    if (!Number.isFinite(size) || size < .001 || size > BASE_BRANCH_MAX_SIZE_M) throw Error('调整后的基础枝尺寸超出套装允许的范围。');
    if (tip[1] <= 0) throw Error('主枝梢已越过根部接口，请减小弯曲后再保存。');
    checkSurface(base,position);
    const paths = new Map(current.map(guide => [guide.id,{
      guide, reference:axis(guide.points,stations.get(guide.id)), times:pathTimes(guide.points),
    }]));
    const graftScale = new Map();
    const shape_guides = current.map(guide => {
      const parent = paths.get(guide.parent);
      let attach = 0, startScale = guide.radialFactors?.[0] ?? 1;
      if (parent) {
        const {index,u} = axisSegment(parent.reference,guide.attach);
        attach = THREE.MathUtils.lerp(parent.times[index],parent.times[index + 1],u);
        const parentFactors = parent.guide.radialFactors;
        const before = index === 0 ? graftScale.get(guide.parent) : parentFactors?.[index] ?? 1;
        startScale = THREE.MathUtils.lerp(before,parentFactors?.[index + 1] ?? 1,u);
      }
      graftScale.set(guide.id,startScale);
      const {radialFactors,...path} = guide;
      return {...path,attach,points:guide.points.map(toSource),
        start_radius:guide.start_radius * startScale, end_radius:guide.end_radius * (radialFactors?.at(-1) ?? 1)};
    });
    return {...base,id,name,geometry,tip,size_m:size,shape_guides,variant_from:{base_id:base.id}};
  }

  return {guides,canEditPoint,canScaleThickness,canRotateAfter,rotationPivot,isRest,
    movePoints,rotateAfter,scaleThickness,preview,bake};
}
