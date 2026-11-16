import * as THREE from 'three';
import {unpackLightTrack,normalizeTreeLightFlow} from './tree-light-data.js';
import {cordArrays} from './v080-lights/wrap.js';

export const TREE_LIGHT_GROUP='V080_可调灯带预览';
const attributes=[['position','position',3],['normal','normal',3],['uv','uv0',2],['uv1','uv1',2]];

export function buildTreeLightGroup(record,flow,branches){
  const group=new THREE.Group();
  group.name=TREE_LIGHT_GROUP;
  const {color,intensity,radius}=record.params;
  const material=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:intensity,roughness:.4,metalness:0});
  material.name='M_TreeLightStrip';
  const playback=normalizeTreeLightFlow(flow);
  material.userData.treeLightStrip={materialTexCoord:0,flowTexCoord:1,flowAxis:'U',speed:playback.speed,direction:playback.direction};
  group.userData={treeLightStrip:{materialTexCoord:0,flowTexCoord:1,flowAxis:'U',flowRange:'0 to 1 per guide'}};
  const routes=new Map();
  const branchIds=record.kind==='procedural'&&branches?new Set(branches.map(branch=>branch.stableId)):null;
  for(const track of record.tracks){
    if(branchIds&&!branchIds.has(track.guide))continue;
    const values=unpackLightTrack(track.points),samples=[];
    for(let i=0;i<values.length;i+=6)samples.push({
      point:new THREE.Vector3().fromArray(values,i),radial:new THREE.Vector3().fromArray(values,i+3)
    });
    if(!routes.has(track.guide))routes.set(track.guide,[]);
    routes.get(track.guide).push({samples,turns:track.turns});
  }
  const bounds=new THREE.Box3();
  let turns=0,totalLength=0;
  for(const [guide,route] of routes){
    let routeLength=0,previous=null;
    for(const row of route){
      if(previous)routeLength+=previous.distanceTo(row.samples[0].point);
      row.offset=routeLength;
      for(let i=1;i<row.samples.length;i++)routeLength+=row.samples[i-1].point.distanceTo(row.samples[i].point);
      previous=row.samples.at(-1).point;
    }
    for(const [i,{samples,offset,turns:count}] of route.entries()){
      const strip=cordArrays(THREE,samples,{radius,textureRepeat:.25,routeOffset:offset,routeLength});
      if(!strip.length)continue;
      const geometry=new THREE.BufferGeometry();
      for(const [key,source,size] of attributes)geometry.setAttribute(key,new THREE.Float32BufferAttribute(strip[source],size));
      geometry.setIndex(strip.indices);
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox);
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name='LightStrip_'+guide+'_'+String(i+1).padStart(2,'0');
      mesh.userData={category:'tree_light',treeLightStrip:{guide,lengthMeters:strip.length,turns:count,flowTexCoord:1,ringSize:strip.stride}};
      group.add(mesh);
      turns+=count;totalLength+=strip.length;
    }
  }
  if(!group.children.length)material.dispose();
  group.userData.preview={span:bounds.isEmpty()?null:[bounds.min.z-record.ground,bounds.max.z-record.ground],turns,totalLength};
  return group;
}

export function replaceTreeLightGroup(asset,record,group){
  const old=asset.group.getObjectByName(TREE_LIGHT_GROUP),materials=new Set();
  if(old){
    old.removeFromParent();
    old.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();materials.add(mesh.material);}});
    for(const material of materials)material.dispose();
  }
  const replaced=new Set(record?.replaces);
  asset.group.traverse(mesh=>{
    if(mesh.userData.trunk_mount_id!==record?.mount||!replaced.has(mesh.userData.trunk_primitive_id))return;
    mesh.visible=false;
    mesh.userData.tree_light_replaced=true;
  });
  if(group)asset.group.add(group);
}
