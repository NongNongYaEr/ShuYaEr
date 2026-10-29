import * as T from './vendor/three.module.min.js';
import {trunkCalibrationMatrix,pointOnTrunkGuide} from './imported-trunk-data.js';
import {evaluateTrunkAttachment} from './imported-trunk-attachments.js';
import {sampleLine,lineTangent} from './tree-sculpt.js';

const sourceIndices=new WeakMap();
function sourceIndex(model){
 if(sourceIndices.has(model))return sourceIndices.get(model);const matrix=trunkCalibrationMatrix(model.calibration),e=matrix.elements,records=[],bounds=new T.Box3(),point=new T.Vector3();
 for(const primitive of model.primitives){const g=primitive.geometry;for(let n=0;n<g.index.length;n+=3){let x=0,y=0,z=0;for(let j=0;j<3;j++){const i=g.index[n+j]*3;x+=g.position[i]/3;y+=g.position[i+1]/3;z+=g.position[i+2]/3;}point.set(e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],e[2]*x+e[6]*y+e[10]*z+e[14]);bounds.expandByPoint(point);records.push({primitive,face:n/3,point:point.clone()});}}
 const size=bounds.getSize(new T.Vector3()),cell=Math.max(.02,Math.max(size.x,size.y,size.z)/32),grid=new Map(),cache=new Map();for(const r of records){const key=[r.point.x,r.point.y,r.point.z].map(v=>Math.floor(v/cell)).join(',');if(!grid.has(key))grid.set(key,[]);grid.get(key).push(r);}
 const result={nearest(guide,t){const key=guide.id+':'+Math.round(t*200);if(cache.has(key))return cache.get(key);const p=pointOnTrunkGuide(guide.points,t).position,c=[p.x,p.y,p.z].map(v=>Math.floor(v/cell));let best=null,distance=Infinity;
  for(const range of [1,2,4]){for(let x=c[0]-range;x<=c[0]+range;x++)for(let y=c[1]-range;y<=c[1]+range;y++)for(let z=c[2]-range;z<=c[2]+range;z++)for(const r of grid.get(x+','+y+','+z)||[]){const d=p.distanceToSquared(r.point);if(d<distance){best=r;distance=d;}}if(best&&distance<cell*cell*range*range)break;}
  if(!best)for(const r of records){const d=p.distanceToSquared(r.point);if(d<distance){best=r;distance=d;}}cache.set(key,best);return best;
 }};sourceIndices.set(model,result);return result;
}
// Axis anchors retain an actual source triangle as their fixed reference, but
// bind to the requested guide/axis parameter, regardless of front occlusion.
export function createUnitPaintAxisPicker(authoring,branches){
 const data=authoring.imported_trunks,byId=new Map(branches.map(b=>[b.stableId,b])),carriers=new Map();
 for(const mount of data?.mounts||[]){const model=data.assets.find(a=>a.id===mount.asset_id);if(model)for(const guide of model.guides){const id=mount.guide_map[guide.id];if(byId.has(id))carriers.set(id,{mount,model,guide});}}
 return (parentId,t)=>{const parent=byId.get(parentId);if(!parent)return null;const entry=carriers.get(parentId);
  if(!entry)return {parent:parentId,attach:t,surface_frame:{position:sampleLine(parent.points,t),direction:new T.Vector3(1,0,0)}};
  const {mount,model,guide}=entry,reference=sourceIndex(model).nearest(guide,t);if(!reference)return null;const g=reference.primitive.geometry,triangle=g.index.slice(reference.face*3,reference.face*3+3),anchor={version:1,mount_id:mount.id,asset_id:model.id,revision:model.revision,primitive_id:reference.primitive.id,face:reference.face,triangle,barycentric:[1/3,1/3,1/3],offset_m:-.003,roll:0,guide_id:guide.id,origin:'AXIS',axis_t:t},binding=evaluateTrunkAttachment(model,mount,branches,anchor),restParent=pointOnTrunkGuide(guide.points,t);
  return {parent:parentId,attach:t,trunk_anchor:anchor,frame:{position:binding.rest.position.toArray(),direction:binding.rest.normal.toArray(),parent_position:restParent.position.toArray(),parent_tangent:restParent.tangent.toArray()},surface_frame:{position:sampleLine(parent.points,t),direction:binding.normal},surface_binding:{anchor_position:binding.position,rotation:binding.rotation,rest:binding.rest,anchor}};
 };
}
