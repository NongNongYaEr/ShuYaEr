import * as THREE from './vendor/three.module.min.js';
import {axisTime,axisSegment,withAxisTimes,sampleAxis} from './branch-axis.js';
import {branchMountAt} from './branch-mount-frame.js';
import {transformLegacyRigidGeometry} from './legacy-unit-placement.js';

// Shape-preserving Hermite interpolation: each coordinate stays between its
// neighbouring controls. A level pair cannot acquire a hidden hump from old R.
export function controlCurveAxis(controls){
  const knots=controls.map(p=>p.isVector3?p.clone():new THREE.Vector3(...p)),nodes=[];
  for(const p of knots)if(!nodes.length||p.distanceToSquared(nodes.at(-1))>1e-16)nodes.push(p);
  if(nodes.length<2)return null;
  const lengths=nodes.slice(1).map((p,i)=>p.distanceTo(nodes[i])),total=lengths.reduce((a,b)=>a+b,0),weights=lengths.map(n=>Math.max(n,total*1e-6)),sum=weights.reduce((a,b)=>a+b,0),times=[0];
  weights.forEach(n=>times.push(times.at(-1)+n/sum));times[times.length-1]=1;
  const slopes=nodes.map(()=>new THREE.Vector3());
  for(const axis of ['x','y','z']){
    const secants=nodes.slice(1).map((p,i)=>(p[axis]-nodes[i][axis])/(times[i+1]-times[i]));
    slopes[0][axis]=secants[0];slopes.at(-1)[axis]=secants.at(-1);
    for(let i=1;i<nodes.length-1;i++){
      const a=secants[i-1],b=secants[i],h=times[i]-times[i-1],next=times[i+1]-times[i],w1=2*next+h,w2=next+2*h;
      slopes[i][axis]=a*b<=0?0:(w1+w2)/(w1/a+w2/b);
    }
  }
  const counts=lengths.map((length,i)=>{
    const d=nodes[i+1].clone().sub(nodes[i]).normalize(),angles=[];
    if(i)angles.push(d.angleTo(nodes[i].clone().sub(nodes[i-1]).normalize()));
    if(i+2<nodes.length)angles.push(d.angleTo(nodes[i+2].clone().sub(nodes[i+1]).normalize()));
    return Math.max(2,Math.min(16,Math.ceil(length/total*64-1e-8)+Math.ceil(Math.max(0,...angles)/Math.PI*8-1e-8)));
  });
  while(counts.reduce((a,b)=>a+b,1)>512){const i=counts.indexOf(Math.max(...counts));counts[i]--;}
  const points=[nodes[0].clone()],ts=[0];
  for(let i=0;i<nodes.length-1;i++)for(let step=1;step<=counts[i];step++){
    const u=step/counts[i],u2=u*u,u3=u2*u,h=times[i+1]-times[i];
    points.push(step===counts[i]?nodes[i+1].clone():nodes[i].clone().multiplyScalar(2*u3-3*u2+1).addScaledVector(nodes[i+1],-2*u3+3*u2).addScaledVector(slopes[i],h*(u3-2*u2+u)).addScaledVector(slopes[i+1],h*(u3-u2)));
    ts.push(step===counts[i]?times[i+1]:times[i]+h*u);
  }
  return withAxisTimes(points,ts,times);
}

const frameCache=new WeakMap();
function axisFrame(points,phase){
  let cached=frameCache.get(points);if(cached?.phase===phase)return cached.at;
  const tangents=points.slice(1).map((p,i)=>{const d=p.clone().sub(points[i]);return d.lengthSq()>1e-16?d.normalize():new THREE.Vector3(0,0,1);});
  const across=[];let previous=null;
  tangents.forEach((tangent,i)=>{
    let x=previous?previous.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(tangents[i-1],tangent)):new THREE.Vector3(0,0,Math.abs(tangent.z)<.92?1:0);
    if(!previous){if(!x.lengthSq())x.set(1,0,0);x.cross(tangent).normalize().applyAxisAngle(tangent,phase||0);}
    x.addScaledVector(tangent,-x.dot(tangent)).normalize();across.push(x);previous=x;
  });
  const at=t=>{const {index}=axisSegment(points,t),z=tangents[index],x=across[index],y=new THREE.Vector3().crossVectors(z,x).normalize();return new THREE.Matrix4().makeBasis(x,y,z).setPosition(sampleAxis(points,t));};
  frameCache.set(points,{phase,at});return at;
}

export const controlCurveOperation=(root,knots)=>({type:'CONTROL_CURVE',root:root.stableId,targets:[root.stableId],protect_units:true,knots:knots.map(p=>p.isVector3?p.toArray():[...p])});
export function controlCurveTransforms(snapshot,updated,rootId){
  const result=new Map();for(const b of updated.values()){
    const old=snapshot.get(b.id);if(b.id===rootId||b===old||!b.mountMatrix)continue;
    const matrix=b.mountMatrix.clone().multiply((old.mountMatrix||new THREE.Matrix4()).clone().invert());result.set(b.id,{matrix,normal:new THREE.Matrix3().getNormalMatrix(matrix)});
  }return result;
}
export function writeControlCurve(authoring,operation,name='控制点驱动走势'){
  const last=authoring.sculpt_layers.at(-1);
  if(last?.enabled&&last.strength===1&&last.operation?.type==='CONTROL_CURVE'&&last.operation.root===operation.root)last.operation=operation;
  else authoring.sculpt_layers.push({id:'CONTROL_'+Date.now()+'_'+operation.root,name,enabled:true,strength:1,operation,branches:{}});
  authoring.active_sculpt_layer='';
}
export function evaluateControlCurve(branches,operation,strength=1,overrides={}){
  const root=branches.find(b=>b.stableId===operation.root);
  if(!root||root.unitOwner||root.instanceId||root.symmetryGroup||strength<=0)return branches;
  const knots=operation.knots.map((p,i)=>{const v=new THREE.Vector3(...p);return strength<1&&root.controlPoints.length===operation.knots.length?root.controlPoints[i].clone().lerp(v,strength):v;});
  if(root.controlPoints.length===knots.length&&(overrides[root.stableId]?.pinned_points||[]).some(i=>knots[i]&&knots[i].distanceToSquared(root.controlPoints[i])>1e-16))return branches;
  const points=controlCurveAxis(knots);if(!points)return branches;
  const old={...root},before=axisFrame(root.points,root.phase),after=axisFrame(points,root.phase),motion=t=>after(t).multiply(before(t).invert()),identity=new THREE.Matrix4();
  const at=t=>motion(t).multiply(branchMountAt(old,t)||identity),frames=points.slice(1).map((_,i)=>at((axisTime(points,i)+axisTime(points,i+1))*.5));
  const byId=new Map(branches.map(b=>[b.id,b])),moves=new Map(),visiting=new Set();
  function move(b){if(moves.has(b.id))return moves.get(b.id);if(visiting.has(b.id))return null;visiting.add(b.id);const p=byId.get(b.parentId),m=p===root?motion(b.parentT):p?move(p):null;visiting.delete(b.id);moves.set(b.id,m);return m;}
  if(branches.some(b=>b!==root&&move(b)&&(overrides[b.stableId]?.pinned_points?.length)))return branches;
  return branches.map(b=>{
    if(b===root)return {...b,points,controlPoints:knots,controlDriven:true,length:points.slice(1).reduce((n,p,i)=>n+p.distanceTo(points[i]),0),mountFrames:frames,mountFrameBinding:{points,frames,at},legacyRigidGeometry:undefined,surfaceNormals:null};
    const m=move(b);if(!m)return b;const q=new THREE.Quaternion().setFromRotationMatrix(m),p=byId.get(b.parentId),movedPoints=b.points.map(p=>p.clone().applyMatrix4(m));
    if(b.points.axisTimes)withAxisTimes(movedPoints,b.points.axisTimes,b.points.axisCuts);
    return {...b,points:movedPoints,controlPoints:b.controlPoints.map(p=>p.clone().applyMatrix4(m)),surfaceNormals:b.surfaceNormals?.map(n=>n.clone().applyQuaternion(q)),mountMatrix:m.clone().multiply(b.mountMatrix||identity),mountFrames:b.mountFrames?.map(f=>m.clone().multiply(f)),mountFrameBinding:undefined,
      ...(b.legacyRigidGeometry||b.copySnapshot?{legacyRigidGeometry:transformLegacyRigidGeometry(b,m,p)}:{}),...(b.collarQuaternion?{collarQuaternion:q.clone().multiply(b.collarQuaternion)}:{})};
  });
}
