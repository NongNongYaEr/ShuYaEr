import {createBrushGeometry} from './brush-preview-geometry.js';
import {localPatchFrame} from './local-patch-analysis.js';
import {patchPreset} from './local-patch-rules.js';

const fitCache = new WeakMap();
const localFaceBudget = 768;
const minSize = .005;
const minDepth = .001;
const frameDefaults = patchPreset('burl');

const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const subtract = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vertex = (mesh,face,corner) => {
 const offset = mesh.indices[face*3+corner]*3;
 return [mesh.pos[offset],mesh.pos[offset+1],mesh.pos[offset+2]];
};

function cachedGeometry(mesh,geometry) {
 const existing = fitCache.get(mesh);
 if (existing) return existing;
 const indexed = geometry?.topology?.mesh;
 const reusable = indexed===mesh || indexed?.sourceSHA256 && indexed.sourceSHA256===mesh.sourceSHA256 &&
   indexed.indices.length===mesh.indices.length && indexed.height===mesh.height;
 const entry = {
  geometry:reusable ? geometry : createBrushGeometry(mesh),
  components:new Int32Array(mesh.indices.length/3).fill(-1),
 };
 fitCache.set(mesh,entry);
 return entry;
}

function component(entry,face) {
 const {components,geometry:{topology:{neighbors}}} = entry;
 if (components[face]>=0) return components[face];
 const queue=[face];
 components[face]=face;
 for (let i=0;i<queue.length;i++) {
  for (const {face:other,opposed} of neighbors[queue[i]]) {
   if (!opposed || components[other]>=0) continue;
   components[other]=face;
   queue.push(other);
  }
 }
 return face;
}

function shellThickness(mesh,entry,face,frame,metersPerUnit) {
 const epsilon=mesh.height*1e-7;
 const direction=frame.normal.map(value=>-value);
 const origin=frame.center.map((value,axis)=>value+epsilon*direction[axis]);
 const hit=entry.geometry.pick({origin,direction});
 if (!hit || hit.face===face || hit.distance<=epsilon) return Infinity;
 const a=vertex(mesh,hit.face,0);
 const normal=cross(subtract(vertex(mesh,hit.face,1),a),subtract(vertex(mesh,hit.face,2),a));
 // Only the back-facing side of the same shell bounds the projection.
 if (dot(normal,frame.normal)>=-.35*Math.hypot(...normal) ||
     component(entry,hit.face)!==component(entry,face)) return Infinity;
 return (hit.distance+epsilon)*metersPerUnit;
}

function projectSupport(mesh,topology,face,frame,metersPerUnit,halfWidth,halfHeight,depth) {
 const queue=[face],visited=new Set(queue),triangles=[];
 const axes=[frame.U,frame.V,frame.normal],limits=[halfWidth,halfHeight,depth];
 for (let i=0;i<queue.length&&i<localFaceBudget;i++) {
  const current=queue[i];
  const projected=[0,1,2].map(corner=>{
   const point=subtract(vertex(mesh,current,corner),frame.center);
   return axes.map(axis=>dot(point,axis)*metersPerUnit);
  });
  const margin=1e-7;
  if (limits.some((limit,axis)=>projected.every(point=>point[axis]>limit+margin) ||
    projected.every(point=>point[axis]<-limit-margin))) continue;
  const [a,b,c]=projected,ab=subtract(b,a),ac=subtract(c,a),det=ab[0]*ac[1]-ab[1]*ac[0];
  if (Math.abs(det)>1e-15) triangles.push({a,ab,ac,det});
  for (const {face:other,opposed} of topology.neighbors[current]) {
   if (!opposed || visited.has(other)) continue;
   visited.add(other);
   queue.push(other);
  }
 }
 return triangles;
}

// Probe the central and diagonal directions of the projection plane for a starting size.
const offsets=Array.from({length:8},(_,i)=>{
 const angle=i*Math.PI/4;
 return [.92*Math.cos(angle),.92*Math.sin(angle)];
});

function fitDepth(triangles,halfWidth,halfHeight,depthLimit) {
 let support=0,sag=0;
 for (const [u,v] of offsets) {
  const x=u*halfWidth,y=v*halfHeight;
  let nearest=Infinity;
  for (const {a,ab,ac,det} of triangles) {
   const dx=x-a[0],dy=y-a[1];
   const b=(dx*ac[1]-dy*ac[0])/det,c=(ab[0]*dy-ab[1]*dx)/det;
   if (b< -1e-7 || c< -1e-7 || b+c>1+1e-7) continue;
   nearest=Math.min(nearest,Math.abs(a[2]+b*ab[2]+c*ac[2]));
  }
  if (nearest>depthLimit) continue;
  support++;
  sag=Math.max(sag,nearest);
 }
 return support>=6 ? sag : null;
}

// Only sizes for new or explicitly refitted points are returned. Mesh units
// are converted using the project's current physical-height calibration.
export function fitManualDecal(mesh,anchor,actualHeightMeters,nominal,geometry=null) {
 const {widthMeters,heightMeters,depthMeters,rotation=0}=nominal;
 const original={widthMeters,heightMeters,depthMeters};
 if (!(mesh?.height>0) || !(actualHeightMeters>0) ||
   !Number.isInteger(anchor?.face) || anchor.face<0 || anchor.face>=mesh.indices.length/3) return original;
 let frame;
 try {
  frame=localPatchFrame(mesh,{...frameDefaults,...nominal,anchor,rotation},actualHeightMeters);
 } catch {
  return original;
 }
 const entry=cachedGeometry(mesh,geometry);
 const metersPerUnit=actualHeightMeters/mesh.height;
 const thickness=shellThickness(mesh,entry,anchor.face,frame,metersPerUnit);
 const shorter=Math.min(widthMeters,heightMeters);
 const minScale=minSize/shorter;
 let scale=1;
 const cap=Math.max(minDepth,Math.min(depthMeters,thickness*.42));
 const halfWidth=widthMeters*.5,halfHeight=heightMeters*.5;
 const triangles=projectSupport(mesh,entry.geometry.topology,anchor.face,frame,metersPerUnit,
   halfWidth*scale,halfHeight*scale,cap);
 const probe=factor=>fitDepth(triangles,halfWidth*factor,halfHeight*factor,cap*.78);
 let sag=probe(scale);
 if (sag===null) {
  let lo=minScale,hi=scale;
  sag=probe(lo)??0;
  // A boundary hit can leave only one side of the projection supported.
  // Always keep a placeable footprint at the rule's minimum size.
  for (let step=0;step<6;step++) {
   const mid=(lo+hi)*.5,depth=probe(mid);
   if (depth===null) hi=mid;
   else {lo=mid;sag=depth;}
  }
  scale=lo;
 }
 const floor=Math.max(minDepth,shorter*scale*.06);
 const depth=Math.min(cap,Math.max(floor,sag/.75+floor*.25));
 return {
  widthMeters:Math.max(minSize,widthMeters*scale),
  heightMeters:Math.max(minSize,heightMeters*scale),
  depthMeters:depth,
 };
}
