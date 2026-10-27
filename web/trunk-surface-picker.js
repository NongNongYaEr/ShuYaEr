import * as THREE from 'three';

// The swept skin is a sequence of closed triangle bands. A small hierarchy
// over their exact local bounds lets the native Three raycaster inspect only
// intersected bands, while retaining its material-side and face conventions.
// No simplified picking mesh is substituted for the displayed surface.
const cache = new WeakMap();
const min = new THREE.Vector3(), max = new THREE.Vector3();
function build(geometry) {
  const position=geometry.getAttribute('position'),index=geometry.index,rings=geometry.userData.radiusRings;
  if(!position||position.count<4096||!index||!Array.isArray(rings)||rings.length<2)return null;
  const count=rings[0].count,bandSize=count*6,surface=geometry.userData.barkSurface,seams=surface?.version===1?surface.seamOffset:null;
  const capRim=surface?.capRimOffset;
  if(!Number.isInteger(count)||count<3||index.count!==rings.length*bandSize||position.count!==rings.length*count+2+(seams===null?0:rings.length)+(capRim===undefined?0:2*count)||seams!==null&&seams!==rings.length*count||capRim!==undefined&&capRim!==seams+rings.length||geometry.morphAttributes.position?.length)return null;
  const boxes=[];
  for(let i=0;i<rings.length;i++){
    if(rings[i].offset!==i*count||rings[i].count!==count)return null;
    min.set(Infinity,Infinity,Infinity);max.set(-Infinity,-Infinity,-Infinity);
    for(let j=0;j<count;j++){
      const v=(i*count+j)*position.itemSize,x=position.array[v],y=position.array[v+1],z=position.array[v+2];
      if(!Number.isFinite(x+y+z))return null;
      min.x=Math.min(min.x,x);min.y=Math.min(min.y,y);min.z=Math.min(min.z,z);
      max.x=Math.max(max.x,x);max.y=Math.max(max.y,y);max.z=Math.max(max.z,z);
    }
    boxes.push(new THREE.Box3(min.clone(),max.clone()));
  }
  // Validate the real strip layout once. A different saved/derived topology
  // always falls back to the unmodified native raycast.
  const data=index.array;
  for(let ring=0;ring<rings.length-1;ring++)for(let side=0;side<count;side++){
    const n=(side+1)%count,a=ring*count+side,b=seams!==null&&!n?seams+ring:ring*count+n,c=seams!==null&&!n?seams+ring+1:(ring+1)*count+n,d=(ring+1)*count+side,k=(ring*count+side)*6;
    if(data[k]!==a||data[k+1]!==b||data[k+2]!==c||data[k+3]!==a||data[k+4]!==c||data[k+5]!==d)return null;
  }
  const tree=(start,end)=>{
    const box=boxes[start].clone();for(let i=start+1;i<=end;i++)box.union(boxes[i]);
    if(end-start<=8)return{box,start:start*bandSize,count:(end-start)*bandSize};
    const middle=(start+end)>>1;return{box,left:tree(start,middle),right:tree(middle,end)};
  };
  const caps=[];
  for(let end=0;end<2;end++){
    const center=position.count-2+end,box=boxes[end?rings.length-1:0].clone();box.expandByPoint(new THREE.Vector3().fromBufferAttribute(position,center));
    const start=(rings.length-1)*bandSize+end*count*3;
    for(let side=0;side<count;side++){
      const next=(side+1)%count,base=capRim===undefined?(end?(rings.length-1)*count:0):capRim+end*count,k=start+side*3;
      if(data[k]!==center||data[k+1]!==base+(end?side:next)||data[k+2]!==base+(end?next:side))return null;
    }
    caps.push({box,start,count:count*3});
  }
  return{root:tree(0,rings.length-1),caps};
}

export function intersectTrunkSurface(mesh,raycaster) {
  const geometry=mesh?.geometry;if(!geometry||mesh.isSkinnedMesh||mesh.isInstancedMesh)return raycaster.intersectObject(mesh,false)[0]||null;
  const p=geometry.getAttribute('position'),i=geometry.index,draw=geometry.drawRange;
  if(draw.start!==0||draw.count!==Infinity)return raycaster.intersectObject(mesh,false)[0]||null;
  let entry=cache.get(geometry);
  if(!entry||entry.position!==p||entry.array!==p?.array||entry.version!==p?.version||entry.index!==i||entry.indexVersion!==i?.version||entry.rings!==geometry.userData.radiusRings){
    entry={position:p,array:p?.array,version:p?.version,index:i,indexVersion:i?.version,rings:geometry.userData.radiusRings,tree:build(geometry)};cache.set(geometry,entry);
  }
  if(!entry.tree)return raycaster.intersectObject(mesh,false)[0]||null;
  const determinant=mesh.matrixWorld.determinant();if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-15)return raycaster.intersectObject(mesh,false)[0]||null;
  const localRay=raycaster.ray.clone().applyMatrix4(mesh.matrixWorld.clone().invert()),ranges=[];
  const visit=node=>{if(!localRay.intersectsBox(node.box))return;if(node.left){visit(node.left);visit(node.right);}else ranges.push(node);};
  visit(entry.tree.root);entry.tree.caps.forEach(visit);
  const hits=[];
  // Native raycast reads drawRange synchronously; restore even if a custom
  // material/raycast throws. No render, event or asynchronous work occurs here.
  try{for(const range of ranges){draw.start=range.start;draw.count=range.count;mesh.raycast(raycaster,hits);}}
  finally{draw.start=0;draw.count=Infinity;}
  let nearest=null;for(const hit of hits)if(!nearest||hit.distance<nearest.distance)nearest=hit;
  return nearest;
}
