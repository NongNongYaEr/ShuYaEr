import * as T from './vendor/three.module.min.js';
import {trunkCalibrationMatrix,closestTrunkGuide,pointOnTrunkGuide,validateTrunkGuides} from './imported-trunk-data.js';
import {isImmutableJson} from './immutable-json.js';
import {trunkSurfaceTangents} from './trunk-surface-tangents.js';
import {axisTimes,sampleAxis} from './branch-axis.js';
import {branchMountAt} from './branch-mount-frame.js';

const sourceCache = new WeakMap(), up = new T.Vector3(0,0,1);
const fail = message => {throw Error('树干绑定：'+message);};
const vector = p => p.isVector3 ? p.clone() : new T.Vector3(...p);
function axis(points) {
  const p=points.map(vector),times=[0];
  for(let i=1;i<p.length;i++)times.push(times.at(-1)+p[i].distanceTo(p[i-1]));
  const length=times.at(-1);if(!(length>1e-7))fail('控制枝长度为零');
  return {points:p,length,times:times.map(t=>t/length)};
}
function frames(points,firstX) {
  let x=firstX.clone(),previous=null;
  return points.map((p,i)=>{
    const tangent=(i===0?points[1].clone().sub(p):i===points.length-1?p.clone().sub(points[i-1]):points[i+1].clone().sub(points[i-1])).normalize();
    if(tangent.lengthSq()<.5)fail('控制枝回折造成无效方向，请增加转折控制点');
    if(previous)x.applyQuaternion(new T.Quaternion().setFromUnitVectors(previous,tangent));
    x.addScaledVector(tangent,-x.dot(tangent));
    if(x.lengthSq()<1e-12)x.crossVectors(Math.abs(tangent.z)<.9?up:new T.Vector3(0,1,0),tangent);
    x.normalize();const y=new T.Vector3().crossVectors(tangent,x).normalize();previous=tangent;
    return new T.Matrix4().makeBasis(x,y,tangent).setPosition(p);
  });
}
function regionGuides(asset,primitiveId) {
  const ids=asset.binding?.primitive_guides?.[primitiveId];
  if(!ids)return asset.guides;
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>!asset.guides.some(g=>g.id===id)))fail('网格控制区域引用了不存在的骨架');
  return asset.guides.filter(g=>ids.includes(g.id));
}
function sourceBinding(asset) {
  if(isImmutableJson(asset)&&sourceCache.has(asset))return sourceCache.get(asset);
  validateTrunkGuides(asset.guides);
  const calibration=trunkCalibrationMatrix(asset.calibration),normalMatrix=new T.Matrix3().getNormalMatrix(calibration);
  const guides=asset.guides.map(g=>{
    const a=axis(g.points),first=pointOnTrunkGuide(g.points,0).tangent;
    const x=new T.Vector3(1,0,0).applyQuaternion(new T.Quaternion().setFromUnitVectors(up,first));
    return {...g,...a,frames:frames(a.points,x)};
  }),byId=new Map(guides.map(g=>[g.id,g]));
  const primitives=asset.primitives.map(primitive=>{
    const src=primitive.geometry,count=src.position.length/3,g={...src,position:[],normal:[],tangent:[]},guideIndices=new Uint16Array(count),nodes=new Uint16Array(count),factors=new Float64Array(count),tangents=trunkSurfaceTangents(src.normal,src.tangent);
    const candidates=Object.freeze(regionGuides(asset,primitive.id));
    for(let i=0;i<count;i++){
      const p=new T.Vector3().fromArray(src.position,i*3).applyMatrix4(calibration);
      g.position.push(...p.toArray());g.normal.push(...new T.Vector3().fromArray(src.normal,i*3).applyMatrix3(normalMatrix).normalize().toArray());
      g.tangent.push(...new T.Vector3().fromArray(tangents,i*4).transformDirection(calibration).toArray(),tangents[i*4+3]);
      const hit=closestTrunkGuide(p,candidates),guide=byId.get(hit.id);
      // The same source position always receives the same binding, including
      // duplicated material/UV seam vertices. Face ownership never drives skin.
      guideIndices[i]=guides.indexOf(guide);nodes[i]=hit.index;factors[i]=hit.u;
    }
    return {id:primitive.id,geometry:g,guideIndices,nodes,factors};
  });
  const result={guides,byId,primitives};if(isImmutableJson(asset))sourceCache.set(asset,result);return result;
}
function initialRotation(current,rest) {
  if(current.trunkQuaternion)return new T.Quaternion(...current.trunkQuaternion).normalize();
  const explicit=new T.Quaternion().setFromEuler(new T.Euler(...(current.override?.rotation||[0,0,0]).map(T.MathUtils.degToRad))),inherited=branchMountAt(current,0);
  if(inherited)explicit.premultiply(new T.Quaternion().setFromRotationMatrix(new T.Matrix4().extractRotation(inherited)));
  const before=pointOnTrunkGuide(rest.points,0).tangent.applyQuaternion(explicit),after=pointOnTrunkGuide(current.points,0).tangent;
  return explicit.premultiply(new T.Quaternion().setFromUnitVectors(before,after));
}
export function createTrunkPose(asset,mount,branches) {
  const source=sourceBinding(asset),byStable=new Map(branches.map(b=>[b.stableId,b])),bones=new Map();
  for(const rest of source.guides){
    const current=byStable.get(mount.guide_map[rest.id]);if(!current)fail('控制枝丢失：'+rest.id);
    const posed=axis(current.points),q=initialRotation(current,rest),x=new T.Vector3().setFromMatrixColumn(rest.frames[0],0).applyQuaternion(q);
    // Correspondence uses the immutable rest stations, independent of viewport
    // resampling/LOD and the number of samples on the edited curve.
    const points=rest.times.map(t=>axisTimes(current.points)?sampleAxis(current.points,t):pointOnTrunkGuide(posed.points,t).position),posedFrames=frames(points,x);
    const radial0=(current.startRadius??rest.start_radius)/rest.start_radius,radial1=(current.endRadius??rest.end_radius)/rest.end_radius,along=posed.length/rest.length;
    if(![radial0,radial1,along].every(s=>Number.isFinite(s)&&s>1e-6&&s<1e6))fail('缩放超出有效范围');
    bones.set(rest.id,rest.frames.map((frame,i)=>{let target=posedFrames[i];const inherited=branchMountAt(current,rest.times[i]);if(inherited&&!current.trunkQuaternion){const rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().extractRotation(inherited)).multiply(new T.Quaternion().setFromEuler(new T.Euler(...(current.override?.rotation||[0,0,0]).map(T.MathUtils.degToRad))));target=new T.Matrix4().makeRotationFromQuaternion(rotation).multiply(frame.clone().setPosition(0,0,0)).setPosition(points[i]);}return target.clone().scale(new T.Vector3(T.MathUtils.lerp(radial0,radial1,rest.times[i]),T.MathUtils.lerp(radial0,radial1,rest.times[i]),along)).multiply(frame.clone().invert());}));
  }
  if(mount.binding==='PRESERVE'){
    const root=source.guides[0],current=byStable.get(mount.guide_map[root.id]),q=initialRotation(current,root),ratio=axis(current.points).length/root.length;
    const matrix=new T.Matrix4().compose(vector(current.points[0]),q,new T.Vector3().setScalar(ratio)).multiply(new T.Matrix4().makeTranslation(...root.points[0].toArray().map(n=>-n)));
    for(const guide of source.guides){const posed=byStable.get(mount.guide_map[guide.id]);for(const t of guide.times){const expected=pointOnTrunkGuide(guide.points,t).position.applyMatrix4(matrix),actual=pointOnTrunkGuide(posed.points,t).position;if(expected.distanceTo(actual)>Math.max(1e-5,root.length*1e-5))fail('原模模式仅支持整体变换；请先启用柔性绑定再调整控制枝');}}
    return {source,bones,rigid:matrix};
  }
  if(mount.binding!=='FLEX')fail('未知绑定模式');
  return {source,bones,rigid:null};
}
export function deformTrunkPrimitive(pose,primitiveId) {
  const primitive=pose.source.primitives.find(p=>p.id===primitiveId);if(!primitive)fail('网格不存在');
  const src=primitive.geometry,g={...src,position:new Array(src.position.length),normal:new Array(src.normal.length),tangent:new Array(src.tangent.length)},normalMatrices=new Map();
  for(const [id,matrices]of pose.bones)normalMatrices.set(id,matrices.map(m=>new T.Matrix3().getNormalMatrix(m)));
  const rigidNormal=pose.rigid&&new T.Matrix3().getNormalMatrix(pose.rigid);
  const p=new T.Vector3(),n=new T.Vector3(),t=new T.Vector3(),outP=new T.Vector3(),outN=new T.Vector3(),outT=new T.Vector3(),temp=new T.Vector3();
  for(let i=0;i<src.position.length/3;i++){
    p.fromArray(src.position,i*3);n.fromArray(src.normal,i*3);t.fromArray(src.tangent,i*4);outP.set(0,0,0);outN.set(0,0,0);outT.set(0,0,0);
    if(pose.rigid){outP.copy(p).applyMatrix4(pose.rigid);outN.copy(n).applyMatrix3(rigidNormal);outT.copy(t).transformDirection(pose.rigid);}
    else {const id=pose.source.guides[primitive.guideIndices[i]].id,node=primitive.nodes[i],factor=primitive.factors[i];for(let side=0;side<2;side++){const weight=side?factor:1-factor,matrix=pose.bones.get(id)[node+side];if(weight<1e-12)continue;outP.addScaledVector(temp.copy(p).applyMatrix4(matrix),weight);outN.addScaledVector(temp.copy(n).applyMatrix3(normalMatrices.get(id)[node+side]),weight);outT.addScaledVector(temp.copy(t).transformDirection(matrix),weight);}}
    outN.normalize();outT.addScaledVector(outN,-outT.dot(outN)).normalize();
    if(outN.lengthSq()<.5||outT.lengthSq()<.5||![outP.x,outP.y,outP.z].every(Number.isFinite))fail('变形导致无效表面，请减小弯曲或增加控制点');
    outP.toArray(g.position,i*3);outN.toArray(g.normal,i*3);outT.toArray(g.tangent,i*4);g.tangent[i*4+3]=src.tangent[i*4+3];
  }
  return g;
}
export function deformTrunkVertices(pose,primitiveId,indices){
 const primitive=pose.source.primitives.find(p=>p.id===primitiveId);if(!primitive)fail('网格不存在');
 return indices.map(i=>{const point=new T.Vector3().fromArray(primitive.geometry.position,i*3);if(pose.rigid)return point.applyMatrix4(pose.rigid);const id=pose.source.guides[primitive.guideIndices[i]].id,node=primitive.nodes[i],factor=primitive.factors[i],bones=pose.bones.get(id);return point.clone().applyMatrix4(bones[node]).multiplyScalar(1-factor).addScaledVector(point.applyMatrix4(bones[node+1]),factor);});
}
export function trunkPoseGeometry(asset,mount,branches) {
  const pose=createTrunkPose(asset,mount,branches);
  return {pose,primitives:new Map(asset.primitives.map(p=>[p.id,deformTrunkPrimitive(pose,p.id)]))};
}
export function trunkBindingAudit(asset,mount,branches) {
  const result=trunkPoseGeometry(asset,mount,branches);
  return {version:1,mode:mount.binding,source_vertices:result.pose.source.primitives.reduce((sum,p)=>sum+p.factors.length,0),max_influences:2,
    guides:asset.guides.length,unbound_vertices:0,regions:asset.binding?.primitive_guides||{},rest_revision:asset.revision};
}
