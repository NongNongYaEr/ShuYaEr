import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import * as T from '../web/vendor/three.module.min.js';
import {createTrunkPose} from '../web/imported-trunk-binding.js';
import {nearestAxis} from '../web/branch-axis.js';
import {createTreeLightSkin} from '../web/tree-light-skin.js';
export function ensureImportedTrunkSkinPoints(asset,skeleton){
 const data=asset.authoring.imported_trunks;if(!data)return;
 for(const mount of data.mounts){const model=data.assets.find(a=>a.id===mount.asset_id),pose=createTrunkPose(model,mount,asset.masterBranches);for(const guide of pose.source.guides){const runtime=asset.masterBranches.find(b=>b.stableId===mount.guide_map[guide.id]),branch=skeleton.branches.find(b=>b.id===runtime.stableId);for(const [i,p]of guide.points.entries()){const position=p.clone().applyMatrix4(pose.rigid||pose.bones.get(guide.id)[i]),t=nearestAxis(runtime.points,position);if(branch.points.some(p=>Math.abs(p.t-t)<1e-8))continue;const next=branch.points.findIndex(p=>p.t>t),j=next<0?branch.points.length-1:Math.max(1,next),left=branch.points[j-1],right=branch.points[j],u=(t-left.t)/Math.max(1e-12,right.t-left.t);branch.points.push({t,position_m:position.toArray(),radius_m:T.MathUtils.lerp(left.radius_m,right.radius_m,u)});branch.points.sort((a,b)=>a.t-b.t);}}}
}
export function createImportedTrunkSkinExporter(output,asset,skeleton){
  const data=asset.authoring.imported_trunks,states=new Map(),nodes=[],pieces=[],buffers=[];
  const v2=!!asset.authoring.tree_lights?.tracks.length,stride=v2?32:12;
  const procedural=v2&&asset.authoring.tree_lights.kind==='procedural';
  let offset=8,lights;
  for(const mount of data?.mounts||[]){
    const model=data.assets.find(a=>a.id===mount.asset_id),pose=createTrunkPose(model,mount,asset.masterBranches),indices=new Map();
    for(const guide of pose.source.guides){
      indices.set(guide.id,nodes.length);
      for(const [i,p]of guide.points.entries()){
        const position=p.clone().applyMatrix4(pose.rigid||pose.bones.get(guide.id)[i]);
        nodes.push({mount_id:mount.id,guide_id:guide.id,branch_id:mount.guide_map[guide.id],node:i,t:guide.times[i],position_cm:[position.x*100,-position.y*100,position.z*100]});
      }
    }
    states.set(mount.id,{mount,model,pose,indices,primitives:new Map(pose.source.primitives.map(p=>[p.id,p]))});
  }
  function bark(mesh,vertex){
    const state=states.get(mesh.userData.trunk_mount_id),primitive=state.primitives.get(mesh.userData.trunk_primitive_id);
    const i=mesh.userData.trunk_source_vertices?.[vertex];
    if(i===undefined)throw Error('树干导出缺少原始顶点对应');
    const guide=state.pose.source.guides[primitive.guideIndices[i]],node=state.indices.get(guide.id)+primitive.nodes[i],w=primitive.factors[i];
    return [{index:node,weight:1-w},{index:node+1,weight:w}];
  }
  const proceduralBark=new Set(),proceduralNodes=new Map();
  const branches=new Map(asset.masterBranches.map(branch=>[branch.stableId,branch]));
  const exported=new Map(skeleton.branches.map(branch=>[branch.id,branch]));
  function proceduralWeights(mesh,vertex,position){
    proceduralBark.add(mesh);
    const id=mesh.userData.stable_id,points=exported.get(id)?.points;
    if(!points)throw Error('灯带下的树皮缺少 PVE 承重枝：'+id);
    if(!proceduralNodes.has(id)){
      proceduralNodes.set(id,nodes.length);
      for(const [node,{t,position_m:[x,y,z]}] of points.entries())
        nodes.push({branch_id:id,node,t,position_cm:[x*100,-y*100,z*100]});
    }
    const t=nearestAxis(branches.get(id).points,position);
    let next=1;
    while(next<points.length-1&&points[next].t<t)next++;
    const a=points[next-1].t,b=points[next].t,w=T.MathUtils.clamp((t-a)/(b-a),0,1);
    const index=proceduralNodes.get(id)+next-1;
    return [{index,weight:1-w},{index:index+1,weight:w}];
  }
  if(procedural){
    lights=createTreeLightSkin(asset,proceduralWeights);
    // Resolve the lamp rings first so the bark they touch gets those same weights.
    asset.group.traverseVisible(mesh=>{
      if(mesh.userData.category!=='tree_light')return;
      const {ringSize}=mesh.userData.treeLightStrip;
      for(let v=0;v<mesh.geometry.attributes.position.count;v+=ringSize)lights(mesh,v);
    });
  }
  function add(mesh,vertices,chunk){
    const light=mesh.userData.category==='tree_light';
    const pinnedBark=proceduralBark.has(mesh);
    if(!mesh.userData.imported_trunk&&!light&&!pinnedBark)return null;
    const state=states.get(light?asset.authoring.tree_lights.mount:mesh.userData.trunk_mount_id);
    if(light)lights??=createTreeLightSkin(asset,bark);
    const position=new T.Vector3(),local=pinnedBark?asset.group.matrixWorld.clone().invert().multiply(mesh.matrixWorld):null;
    const bytes=Buffer.alloc(vertices.length*stride);
    for(const [v,index]of vertices.entries()){
      const weights=light?lights(mesh,index):pinnedBark
        ?proceduralWeights(mesh,index,position.fromBufferAttribute(mesh.geometry.attributes.position,index).applyMatrix4(local))
        :bark(mesh,index);
      const at=v*stride;
      if(v2){
        const total=weights.reduce((n,w)=>n+w.weight,0);
        if(!(total>0)||weights.length>4)throw Error('灯带蒙皮权重无效');
        weights.forEach(({index,weight},i)=>{
          bytes.writeUInt32LE(index,at+i*4);
          bytes.writeFloatLE(weight/total,at+16+i*4);
        });
      }else{
        bytes.writeUInt32LE(weights[0].index,at);
        bytes.writeUInt32LE(weights[1].index,at+4);
        bytes.writeFloatLE(weights[1].weight,at+8);
      }
    }
    const source=state?{mount_id:state.mount.id,asset_id:state.model.id,revision:state.model.revision,
      primitive_id:light?mesh.name:mesh.userData.trunk_primitive_id}:{kind:'procedural'};
    const piece={chunk,offset,count:vertices.length,...source};
    pieces.push(piece);buffers.push(bytes);offset+=bytes.length;
    return {piece:pieces.length-1};
  }
  function finish(){
    if(!pieces.length)return null;
    if(nodes.length>65535)throw Error('UE 骨骼数量超过 65535，请在整理台精简控制点');
    const bytes=Buffer.concat([Buffer.from(v2?'BFTS0002':'BFTS0001'),...buffers]),file='whole.trunk-skin.bin';
    fs.writeFileSync(path.join(output,file),bytes);
    return {version:v2?2:1,file,bytes:bytes.length,stride,sha256:createHash('sha256').update(bytes).digest('hex'),
      sha1:createHash('sha1').update(bytes).digest('hex'),coordinate_system:'UE_centimeter_X_negativeY_Z',
      nodes,pieces,weight_policy:v2?'bark_controls_with_up_to_four_normalized_light_influences':'two_rest_control_nodes_normalized',
      setup:'finalize_imported_trunk_binding.py'};
  }
  return {add,finish};
}
