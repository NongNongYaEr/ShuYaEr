import * as THREE from './vendor/three.module.min.js';
import {geometryExtent,normalizePlantUnit,normalizePlantUnitPack,UNIT_ROLES} from './plant-unit-data.js';

export const PREPARATION_VERSION=1;
export function validatePreparationDraft(raw,faceCount=500000){
  if(raw?.version!==PREPARATION_VERSION||!Array.isArray(raw.units)||raw.units.length>64)throw Error('整理草稿格式无效');
  if(raw.selection&&(!Array.isArray(raw.selection)||raw.selection.length>faceCount||!raw.selection.every(face=>Number.isInteger(face)&&face>=0&&face<faceCount)))throw Error('草稿待选面片无效');
  const used=new Set(),ids=new Set();
  for(const unit of raw.units){
    if(!unit.id||ids.has(unit.id)||!Array.isArray(unit.faces)||!unit.faces.length||unit.faces.length>60000)throw Error('草稿单元或选区无效');ids.add(unit.id);
    for(const face of unit.faces){if(!Number.isInteger(face)||face<0||face>=faceCount||used.has(face))throw Error('草稿面片重复或超出源模型');used.add(face);}
    for(const key of ['base','tip','front'])if(unit[key]!=null&&(!Array.isArray(unit[key])||unit[key].length!==3||!unit[key].every(Number.isFinite)))throw Error('校准点无效');
    if(unit.size_reference!=null){const ref=unit.size_reference;for(const key of ['a','b'])if(ref[key]!=null&&(!Array.isArray(ref[key])||ref[key].length!==3||!ref[key].every(Number.isFinite)))throw Error('尺寸参照点无效');if(ref.cm!=null&&(!Number.isFinite(ref.cm)||ref.cm<=0))throw Error('参照长度无效');}
    if(unit.size_checkpoint!=null){const p=unit.size_checkpoint;if(p.source_scale!=null&&(!Number.isFinite(p.source_scale)||p.source_scale<=0))throw Error('尺寸对比比例无效');if(p.version!==1||!['initial','confirmed'].includes(p.kind)||!Number.isFinite(p.size_m)||p.size_m<.001||p.size_m>1||!p.bounds||!p.dimensions)throw Error('尺寸对比记录无效');for(const key of ['min','max'])if(!Array.isArray(p.bounds[key])||p.bounds[key].length!==3||!p.bounds[key].every(Number.isFinite))throw Error('尺寸对比范围无效');if(p.bounds.min.some((v,i)=>v>p.bounds.max[i])||['x','y','z','longest'].some(key=>!Number.isFinite(p.dimensions[key])||p.dimensions[key]<0))throw Error('尺寸对比数值无效');}
    if(!UNIT_ROLES[unit.role]||!Number.isFinite(unit.size_m)||unit.size_m<.001||unit.size_m>1||!Number.isFinite(unit.roll))throw Error('单元类型或尺寸无效');
  }
  return raw;
}
export function preparationSelection(current,candidates,operation='replace',unavailable=new Set()){
  const result=operation==='replace'?new Set():new Set(current);
  for(const id of candidates)if(!unavailable.has(id)){if(operation==='subtract')result.delete(id);else result.add(id);}
  return result;
}
export function extractPreparationGeometry(source,faces){
  if(!faces.length)throw Error('请先框选网格');if(faces.length>60000)throw Error('单个单元最多 6 万三角面，请缩小选区');
  const position=[],normal=[],uv=[],index=[],vertices=new Map(),seen=new Set();
  for(const face of faces){
    if(!Number.isInteger(face)||face<0||face*3+2>=source.index.length||seen.has(face))throw Error('选区面片无效');seen.add(face);
    for(let corner=0;corner<3;corner++){const old=source.index[face*3+corner];if(!vertices.has(old)){const next=position.length/3;if(next>=50000)throw Error('单个单元最多 5 万顶点');vertices.set(old,next);position.push(...source.position.slice(old*3,old*3+3));normal.push(...source.normal.slice(old*3,old*3+3));uv.push(...source.uv.slice(old*2,old*2+2));}index.push(vertices.get(old));}
  }
  return {position,normal,uv,index,source_name:source.source_name};
}
export function preparationUnitGeometry(source,unit){
  if(!unit.base||!unit.tip)throw Error('请先点取底点与朝向点');
  const geometry=extractPreparationGeometry(source,unit.faces),base=new THREE.Vector3(...unit.base),y=new THREE.Vector3(...unit.tip).sub(base);
  if(y.length()<1e-7)throw Error('底点与朝向点不能重合');y.normalize();
  let z=new THREE.Vector3(...(unit.front||[0,0,1]));z.addScaledVector(y,-z.dot(y));
  if(z.length()<1e-6){z=new THREE.Vector3(...(Math.abs(y.z)<.8?[0,0,1]:[1,0,0]));z.addScaledVector(y,-z.dot(y));}z.normalize();
  const x=new THREE.Vector3().crossVectors(y,z).normalize();z.crossVectors(x,y).normalize();
  const angle=THREE.MathUtils.degToRad(unit.roll||0),cos=Math.cos(angle),sin=Math.sin(angle);
  const transform=(values,point)=>{const out=[];for(let i=0;i<values.length;i+=3){const p=new THREE.Vector3(values[i],values[i+1],values[i+2]);if(point)p.sub(base);const a=p.dot(x),b=p.dot(y),c=p.dot(z);out.push(a*cos-c*sin,b,a*sin+c*cos);}return out;};
  return {...geometry,position:transform(geometry.position,true),normal:transform(geometry.normal,false)};
}
export function calibratePreparationUnit(source,unit){
  return normalizePlantUnit({id:unit.id,name:unit.name,role:unit.role,size_m:unit.size_m,source_file:source.source_name,geometry:preparationUnitGeometry(source,unit)});
}
// Keep physical vertex distances when editing the calibration frame. size_m
// owns the axis-aligned longest edge, which may change after a rigid rotation.
export function changePreparationFrame(source,unit,patch){
  const next={...unit,...patch},before=geometryExtent(preparationUnitGeometry(source,unit)).longest,after=geometryExtent(preparationUnitGeometry(source,next)).longest;
  next.size_m=checkedPreparationSize(unit.size_m*after/before);return next;
}
export function rotatePreparationCalibration(source,unit,delta){
  if(!delta?.isQuaternion||![delta.x,delta.y,delta.z,delta.w].every(Number.isFinite)||delta.lengthSq()<1e-10)throw Error('旋转数值无效');
  const rotation=delta.clone().normalize();if(rotation.angleTo(new THREE.Quaternion())<1e-10)return {...unit};
  const base=new THREE.Vector3(...unit.base),y=new THREE.Vector3(...unit.tip).sub(base),length=y.length();if(length<1e-7)throw Error('底点与朝向点不能重合');y.normalize();
  let z=new THREE.Vector3(...(unit.front||[0,0,1]));z.addScaledVector(y,-z.dot(y));if(z.length()<1e-6){z.set(...(Math.abs(y.z)<.8?[0,0,1]:[1,0,0]));z.addScaledVector(y,-z.dot(y));}z.normalize();const x=new THREE.Vector3().crossVectors(y,z).normalize();z.crossVectors(x,y).normalize();
  const frame=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)).invert(),roll=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(-unit.roll));
  const inverse=rotation.multiply(roll.multiply(frame)).invert();
  return changePreparationFrame(source,unit,{tip:new THREE.Vector3(0,length,0).applyQuaternion(inverse).add(base).toArray(),front:new THREE.Vector3(0,0,1).applyQuaternion(inverse).toArray(),roll:0});
}
export function centerPreparationBase(source,unit){
  if(!unit.base||!unit.tip)throw Error('请先设置底点和朝向点');const geometry=extractPreparationGeometry(source,unit.faces),base=new THREE.Vector3(...unit.base),axis=new THREE.Vector3(...unit.tip).sub(base);if(axis.length()<1e-7)throw Error('底点与朝向点不能重合');axis.normalize();
  let front=new THREE.Vector3(...(unit.front||[0,0,1]));front.addScaledVector(axis,-front.dot(axis));if(front.length()<1e-6){front.set(...(Math.abs(axis.z)<.8?[0,0,1]:[1,0,0]));front.addScaledVector(axis,-front.dot(axis));}front.normalize();const right=new THREE.Vector3().crossVectors(axis,front).normalize(),tolerance=Math.max(1e-7,geometryExtent(geometry).longest*.015),bounds=[Infinity,-Infinity,Infinity,-Infinity];let count=0;
  for(let i=0;i<geometry.position.length;i+=3){const p=new THREE.Vector3(...geometry.position.slice(i,i+3)).sub(base);if(Math.abs(p.dot(axis))>tolerance)continue;const x=p.dot(right),z=p.dot(front);bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.max(bounds[1],x);bounds[2]=Math.min(bounds[2],z);bounds[3]=Math.max(bounds[3],z);count++;}
  if(count<2)throw Error('底点附近缺少端部顶点，请靠近叶柄／花梗端部重新点取');return base.addScaledVector(right,(bounds[0]+bounds[1])/2).addScaledVector(front,(bounds[2]+bounds[3])/2).toArray();
}
export function preparationDimensions(source,unit){
  const value=calibratePreparationUnit(source,unit),extent=geometryExtent(value.geometry),factor=value.size_m*100;
  return {x:extent.size[0]*factor,y:extent.size[1]*factor,z:extent.size[2]*factor,longest:extent.longest*factor};
}
export function preparationSizeCheckpoint(source,unit,kind='confirmed'){
  const value=calibratePreparationUnit(source,unit),extent=geometryExtent(value.geometry),scale=value.size_m;
  return {version:1,kind,size_m:scale,source_scale:scale/geometryExtent(preparationUnitGeometry(source,unit)).longest,dimensions:{x:extent.size[0]*scale*100,y:extent.size[1]*scale*100,z:extent.size[2]*scale*100,longest:extent.longest*scale*100},bounds:{min:extent.min.map(v=>v*scale),max:extent.max.map(v=>v*scale)}};
}
export function preparationSizeFeedback(source,unit){
  const current=preparationDimensions(source,unit),baseline=unit.size_checkpoint||null,ratio=baseline?.source_scale?unit.size_m/geometryExtent(preparationUnitGeometry(source,unit)).longest/baseline.source_scale:baseline?unit.size_m/baseline.size_m:1;
  return {current,baseline,ratio,scaleChanged:!!baseline&&Math.abs(ratio-1)>1e-8,changed:!!baseline&&(Math.abs(ratio-1)>1e-8||['x','y','z'].some(k=>Math.abs(current[k]-baseline.dimensions[k])>1e-6))};
}
function checkedPreparationSize(value){
  if(!Number.isFinite(value)||value<.001-1e-10||value>1+1e-10)throw Error('校准后最大边需在 0.1～100 cm 内，请检查输入的实际长度');
  return Math.max(.001,Math.min(1,value));
}
export function preparationSizeFromLength(source,unit,cm){
  if(!Number.isFinite(cm)||cm<=0)throw Error('请输入有效的实际长度');
  const current=preparationDimensions(source,unit).y;if(current<1e-7)throw Error('当前单元缺少有效的生长方向长度');
  return checkedPreparationSize(unit.size_m*cm/current);
}
export function preparationReferenceLength(source,unit){
  const ref=unit.size_reference;if(!ref?.a||!ref?.b)return null;
  const distance=new THREE.Vector3(...ref.a).distanceTo(new THREE.Vector3(...ref.b));
  return distance/geometryExtent(preparationUnitGeometry(source,unit)).longest*unit.size_m*100;
}
export function preparationSizeFromReference(source,unit,cm){
  const distance=preparationReferenceLength(source,unit);if(!(distance>1e-6))throw Error('请点取两个不同的尺寸参照点');
  if(!Number.isFinite(cm)||cm<=0)throw Error('请输入参照段的实际厘米长度');
  return checkedPreparationSize(unit.size_m*cm/distance);
}
export function preparationPack(source,draft){
  validatePreparationDraft(draft,source.geometry.index.length/3);if(!draft.units.length)throw Error('请先提取至少一个单元');
  const incomplete=draft.units.filter(unit=>!unit.approved||!unit.name?.trim());if(incomplete.length)throw Error('还有 '+incomplete.length+' 个单元未确认校准');
  return normalizePlantUnitPack({id:'prepared-'+draft.id,name:draft.name,species:'',source:'GLB 整包整理 · '+draft.sourceName,material:source.material,units:draft.units.map(unit=>calibratePreparationUnit(source.geometry,unit))});
}

// Triangle/rectangle overlap, rather than centroid selection, keeps thin stems
// and triangles crossing the box even if none of their centers lie inside it.
export function projectedTriangleInRect(points,rect){
  const inside=p=>p[0]>=rect.left&&p[0]<=rect.right&&p[1]>=rect.top&&p[1]<=rect.bottom;
  if(points.some(inside))return true;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const corners=[[rect.left,rect.top],[rect.right,rect.top],[rect.right,rect.bottom],[rect.left,rect.bottom]];
  const inTriangle=p=>{const a=cross(points[0],points[1],p),b=cross(points[1],points[2],p),c=cross(points[2],points[0],p);return (a>=0&&b>=0&&c>=0)||(a<=0&&b<=0&&c<=0);};
  if(corners.some(inTriangle))return true;
  const intersects=(a,b,c,d)=>{const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);return x*y<=0&&u*v<=0&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]));};
  return points.some((a,i)=>corners.some((c,j)=>intersects(a,points[(i+1)%3],c,corners[(j+1)%4])));
}
