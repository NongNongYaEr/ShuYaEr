import * as T from './vendor/three.module.min.js';
import {createTrunkPose,deformTrunkVertices} from './imported-trunk-binding.js';
import {trunkSurfaceAnchor} from './imported-trunk-data.js';
import {sampleLine} from './tree-sculpt.js';

const cache=new WeakMap();
// Recover older centre-line moves against the fixed GLB rather than retaining
// a floating offset. New interactive moves save their picked triangle directly.
export function projectTrunkSlide(branches,root,parent,carrier,attach){
 const context=carrier.importedTrunkSource;if(!context)return null;const {asset,mount}=context,hosts=asset.guides.map(g=>branches.find(b=>b.stableId===mount.guide_map[g.id])),key=hosts.flatMap(b=>[b.points,b.startRadius,b.endRadius]);let retained=cache.get(context);
 if(!retained||key.some((v,i)=>v!==retained.key[i])){const pose=createTrunkPose(asset,mount,branches);retained={key,primitives:pose.source.primitives.map(p=>({id:p.id,index:p.geometry.index,vertices:deformTrunkVertices(pose,p.id,Array.from({length:p.geometry.position.length/3},(_,i)=>i)),owners:p.guideIndices,guideIds:pose.source.guides.map(g=>g.id)}))};cache.set(context,retained);}
 const target=sampleLine(carrier.points,attach),guess=target.clone().add(root.points[0]).sub(sampleLine(parent.points,root.parentT)),guideId=Object.keys(mount.guide_map).find(id=>mount.guide_map[id]===carrier.stableId),triangle=new T.Triangle(),point=new T.Vector3();let best=null,distance=Infinity;
 for(const p of retained.primitives)for(let face=0;face<p.index.length/3;face++){const ids=p.index.slice(face*3,face*3+3);if(!ids.some(i=>p.guideIds[p.owners[i]]===guideId))continue;triangle.set(...ids.map(i=>p.vertices[i]));if(triangle.getArea()<1e-16)continue;triangle.closestPointToPoint(guess,point);const d=point.distanceToSquared(guess);if(d>=distance)continue;const bary=triangle.getBarycoord(point,new T.Vector3());if(!bary)continue;distance=d;best=trunkSurfaceAnchor(asset,p.id,face,bary.toArray(),{offset:root.trunkCarrierAnchor?.offset_m??-.003,roll:root.trunkCarrierAnchor?.roll||0,guideId});}
 if(!best)throw Error('该位置没有可挂接的树干表面');return {...best,mount_id:mount.id};
}
