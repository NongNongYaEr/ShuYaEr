import * as THREE from './vendor/three.module.min.js';
import {computeGeometryTangents,accelerateSurfaceTangents} from './geometry-accelerator.js';

// Derivatives of the sampled loft, rather than area-weighted triangle fans.
// This removes diagonal lighting bias and unequal-ring weighting at bends.
function loftNormals(attributes,rings,seamOffset){
  const p=attributes.position,n=attributes.normal,sides=rings[0].count,a=new THREE.Vector3(),b=new THREE.Vector3(),around=new THREE.Vector3(),along=new THREE.Vector3(),normal=new THREE.Vector3();
  const distances=rings.slice(1).map((r,i)=>Math.max(1e-10,Math.hypot(...r.center.map((v,k)=>v-rings[i].center[k]))));
  const difference=(to,from,out)=>out.fromBufferAttribute(p,to).sub(a.fromBufferAttribute(p,from));
  for(let row=0;row<rings.length;row++)for(let side=0;side<sides;side++){
    const r=rings[row],index=r.offset+side,previous=r.offset+(side+sides-1)%sides,next=r.offset+(side+1)%sides,angles=r.sampleAngles;
    const before=angles?(angles[side]-angles[(side+sides-1)%sides]+Math.PI*2)%(Math.PI*2):Math.PI*2/sides,after=angles?(angles[(side+1)%sides]-angles[side]+Math.PI*2)%(Math.PI*2):before;
    difference(index,previous,around).multiplyScalar(after/Math.max(1e-15,before*(before+after)));difference(next,index,b).multiplyScalar(before/Math.max(1e-15,after*(before+after)));around.add(b);
    if(!row)difference(rings[1].offset+side,index,along).divideScalar(distances[0]);
    else if(row===rings.length-1)difference(index,rings[row-1].offset+side,along).divideScalar(distances[row-1]);
    else{const h0=distances[row-1],h1=distances[row];difference(index,rings[row-1].offset+side,along).multiplyScalar(h1/(h0*(h0+h1)));difference(rings[row+1].offset+side,index,b).multiplyScalar(h0/(h1*(h0+h1)));along.add(b);}
    normal.crossVectors(around,along);if(normal.lengthSq()>1e-16){normal.normalize();n.setXYZ(index,normal.x,normal.y,normal.z);}
    if(!side)n.setXYZ(seamOffset+row,n.getX(index),n.getY(index),n.getZ(index));
  }
}

// Keep contour indices intact: editor rings still reference the original wall
// vertices. UV seams and cut caps get coincident copies; cap centres stay last.
export function prepareBranchBarkSurface(geometry,branch,settings){
  const rings=geometry.userData.radiusRings,position=geometry.getAttribute('position');
  if(geometry.userData.barkSurface||!position||!rings||rings.length<2)return geometry;
  const sides=rings[0].count;if(rings.some(r=>r.count!==sides)||position.count!==rings.length*sides+2)return geometry;
  const oldCount=position.count,seamOffset=oldCount-2,capRimOffset=seamOffset+rings.length,count=oldCount+rings.length+sides*2,attributes={};
  for(const [key,attribute] of Object.entries(geometry.attributes)){
    if(key==='tangent')continue;
    const size=attribute.itemSize,array=new attribute.array.constructor(count*size);
    array.set(attribute.array.subarray(0,(oldCount-2)*size));
    for(let row=0;row<rings.length;row++)array.set(attribute.array.subarray(rings[row].offset*size,(rings[row].offset+1)*size),(seamOffset+row)*size);
    for(let cap=0;cap<2;cap++){const r=rings[cap?rings.length-1:0];array.set(attribute.array.subarray(r.offset*size,(r.offset+sides)*size),(capRimOffset+cap*sides)*size);}
    array.set(attribute.array.subarray((oldCount-2)*size),(count-2)*size);
    attributes[key]=new THREE.BufferAttribute(array,size,attribute.normalized);
  }
  loftNormals(attributes,rings,seamOffset);
  const uv=attributes.uv,denominator=Math.max(branch.startRadius*12,.2),scale=settings.bark_tiling/denominator,seam=settings.bark_seam/360;
  const perimeters=new Float64Array(rings.length),distances=new Float64Array(sides+1),contourEdges=new Float64Array(rings.length*sides),p=attributes.position;
  const edge=(a,b)=>Math.hypot(p.getX(a)-p.getX(b),p.getY(a)-p.getY(b),p.getZ(a)-p.getZ(b));
  for(let row=0;row<rings.length;row++){
    const r=rings[row];distances[0]=0;
    for(let side=0;side<sides;side++){const length=edge(r.offset+side,r.offset+(side+1)%sides);contourEdges[row*sides+side]=length;distances[side+1]=distances[side]+length;}
    perimeters[row]=distances[sides];
    for(let side=0;side<sides;side++){
      uv.setXY(r.offset+side,distances[side]/Math.max(1e-12,perimeters[row])+seam,0);
    }
    uv.setXY(seamOffset+row,seam+1,0);
  }
  const triangleArea=(a,b,c)=>{const ax=p.getX(b)-p.getX(a),ay=p.getY(b)-p.getY(a),az=p.getZ(b)-p.getZ(a),bx=p.getX(c)-p.getX(a),by=p.getY(c)-p.getY(a),bz=p.getZ(c)-p.getZ(a);return .5*Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx);};
  let distance=0,totalArea=0,perimeterArea=0;const spans=Array.from({length:sides},()=>({length:0,weight:0}));
  for(let row=1;row<rings.length;row++){
    const a=rings[row-1],b=rings[row];let area=0,weight=0;
    for(let side=0;side<sides;side++){
      const previous=(side+sides-1)%sides,next=(side+1)%sides,w=(contourEdges[(row-1)*sides+previous]+contourEdges[(row-1)*sides+side]+contourEdges[row*sides+previous]+contourEdges[row*sides+side])*.25;
      spans[side].length=edge(a.offset+side,b.offset+side);spans[side].weight=w;weight+=w;
      area+=triangleArea(a.offset+side,a.offset+next,b.offset+next)+triangleArea(a.offset+side,b.offset+next,b.offset+side);
    }
    // One V per ring is intentionally retained: independent accumulated paths
    // shear and invert UV triangles around strongly changing buttress contours.
    // Physical contour weights keep clustered detail samples from biasing V.
    spans.sort((a,b)=>a.length-b.length);let sum=0,advance=0;for(const item of spans){sum+=item.weight;advance=item.length;if(sum>=weight*.5)break;}
    distance+=advance;totalArea+=area;perimeterArea+=area*(perimeters[row-1]+perimeters[row])*.5;
    for(let side=0;side<sides;side++)uv.setY(b.offset+side,distance*scale);uv.setY(seamOffset+row,distance*scale);
  }
  const referencePerimeter=Math.max(1e-6,Math.round((totalArea>1e-12?perimeterArea/totalArea:perimeters[0])*1e6)/1e6);
  const point=new THREE.Vector3(),center=new THREE.Vector3(),x=new THREE.Vector3(),y=new THREE.Vector3(),capNormal=new THREE.Vector3();
  for(let cap=0;cap<2;cap++){
    const r=rings[cap?rings.length-1:0];center.fromArray(r.center);x.fromArray(r.rolledX||r.x);y.fromArray(r.rolledY||r.y);capNormal.fromArray(r.tangent).multiplyScalar(cap?1:-1);
    for(let side=0;side<sides;side++){const i=capRimOffset+cap*sides+side;point.fromBufferAttribute(p,i).sub(center);uv.setXY(i,.5+point.dot(x)/referencePerimeter,.5+point.dot(y)*scale);attributes.normal.setXYZ(i,capNormal.x,capNormal.y,capNormal.z);}
    const i=count-2+cap;uv.setXY(i,.5,.5);attributes.normal.setXYZ(i,capNormal.x,capNormal.y,capNormal.z);
  }
  const wallIndexCount=(rings.length-1)*sides*6,index=new (count>65535?Uint32Array:Uint16Array)(geometry.index.array);
  for(let i=0;i<index.length;i++)if(index[i]>=oldCount-2)index[i]+=rings.length+sides*2;
  for(let row=0;row<rings.length-1;row++){
    const at=(row*sides+sides-1)*6;index[at+1]=seamOffset+row;index[at+2]=index[at+4]=seamOffset+row+1;
  }
  for(let cap=0;cap<2;cap++)for(let side=0;side<sides;side++){
    const at=wallIndexCount+cap*sides*3+side*3,base=capRimOffset+cap*sides,next=(side+1)%sides;
    index[at+1]=base+(cap?side:next);index[at+2]=base+(cap?next:side);
  }
  geometry.deleteAttribute('tangent');for(const [key,attribute] of Object.entries(attributes))geometry.setAttribute(key,attribute);
  geometry.setIndex(new THREE.BufferAttribute(index,1));
  // Coincident seam vertices use identical loft normals and tangent frames.
  computeGeometryTangents(geometry);
  const normal=geometry.getAttribute('normal'),tangent=geometry.getAttribute('tangent'),n=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
  if(!accelerateSurfaceTangents(geometry,rings,seamOffset)){
  for(let i=0;i<tangent.count;i++){
    n.fromBufferAttribute(normal,i);a.fromBufferAttribute(tangent,i).addScaledVector(n,-a.dot(n));
    if(a.lengthSq()<1e-12)a.crossVectors(Math.abs(n.z)<.9?b.set(0,0,1):b.set(1,0,0),n);
    a.normalize();tangent.setXYZW(i,a.x,a.y,a.z,tangent.getW(i)<0?-1:1);
  }
  for(let row=0;row<rings.length;row++){
    const first=rings[row].offset,last=seamOffset+row;n.fromBufferAttribute(normal,first);a.fromBufferAttribute(tangent,first);b.fromBufferAttribute(tangent,last);a.add(b).addScaledVector(n,-a.dot(n));
    if(a.lengthSq()<1e-12)a.fromBufferAttribute(tangent,first);a.normalize();const w=tangent.getW(first);
    tangent.setXYZW(first,a.x,a.y,a.z,w);tangent.setXYZW(last,a.x,a.y,a.z,w);
  }
  }
  geometry.userData.barkSurface={version:1,uv:'SURFACE_ARC_LENGTH',seamOffset,capRimOffset,wallIndexCount,referencePerimeter};
  return geometry;
}
