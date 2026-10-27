import * as THREE from './vendor/three.module.min.js';

// Presentation only: picking, branch identity and authoring stay in the graph.
// The whole skeleton uses one line draw and two instanced endpoint draws.
export function createSkeletonDisplay(branches,lineMaterial){
 const root=new THREE.Group(),positions=[],entries=[];
 const endpointGeometry=new THREE.SphereGeometry(1,6,4),groups=[0x73b76f,0xe3b84b].map(color=>new THREE.InstancedMesh(endpointGeometry,new THREE.MeshBasicMaterial({color}),Math.max(1,branches.length)));
 for(const branch of branches){const start=positions.length/3;for(let i=1;i<branch.points.length;i++)positions.push(...branch.points[i-1].toArray(),...branch.points[i].toArray());entries.push({branch,start,count:positions.length/3-start});}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const lines=new THREE.LineSegments(geometry,lineMaterial);root.add(lines,...groups);let prior,initialized=false;
 root.userData.setVisibleIds=ids=>{
  if(initialized&&(ids===prior||ids&&prior&&ids.size===prior.size&&[...ids].every(id=>prior.has(id))))return;
  initialized=true;prior=ids?new Set(ids):null;const indices=[],counts=[0,0],matrix=new THREE.Matrix4();
  for(const {branch,start,count}of entries){if(ids&&!ids.has(branch.stableId))continue;for(let i=start;i<start+count;i++)indices.push(i);if(!branch.points.length)continue;const group=branch.children?.length?0:1,radius=Math.max(.007,branch.endRadius*1.5);matrix.makeScale(radius,radius,radius);matrix.setPosition(branch.points.at(-1));groups[group].setMatrixAt(counts[group]++,matrix);}
  geometry.setIndex(indices);geometry.computeBoundingSphere();for(let i=0;i<2;i++){groups[i].count=counts[i];groups[i].instanceMatrix.needsUpdate=true;groups[i].computeBoundingSphere();groups[i].visible=counts[i]>0;}lines.visible=indices.length>0;
 };
 root.userData.dispose=()=>{geometry.dispose();endpointGeometry.dispose();for(const mesh of groups){mesh.dispose();mesh.material.dispose();}};
 root.userData.setVisibleIds(null);return root;
}
