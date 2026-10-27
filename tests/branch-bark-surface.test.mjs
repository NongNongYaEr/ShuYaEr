import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSweptBranchGeometry,createTrunkFormPreviewGeometry,normalizeSettings} from '../web/branch-kernel.js';
import {prepareBranchBarkSurface} from '../web/branch-bark-surface.js';
import {withAxisTimes} from '../web/branch-axis.js';
import {createBarkSurfaceMaterial,BARK_PRESETS} from '../web/bark-materials.js';
import {sectionPositionFromSurfaceHit} from '../web/trunk-section-placement.js';
import {intersectTrunkSurface} from '../web/trunk-surface-picker.js';

const v=p=>new THREE.Vector3(...p),settings=normalizeSettings({adaptive_tessellation:false,surface_roughness:0,groove_depth:0,twist:0,section_roll:0,bark_tiling:1.7});
const branch=()=>({stableId:'ROOT',id:0,parentId:-1,order:0,points:withAxisTimes([[0,0,0],[.02,0,.02],[1,0,1],[2,.5,1]].map(v),[0,.005,.8,1]),controlPoints:[[0,0,0],[1,0,1],[2,.5,1]].map(v),length:10,startRadius:.2,endRadius:.1,phase:.3,windPhase:0,windStiffness:1,sections:[],children:[]});
function uvSpan(g){const uv=g.attributes.uv;let max=0;const end=g.userData.barkSurface?.wallIndexCount||(g.userData.radiusRings.length-1)*g.userData.radiusRings[0].count*6;for(let i=0;i<end;i+=3){const values=[0,1,2].map(k=>uv.getX(g.index.getX(i+k)));max=Math.max(max,Math.max(...values)-Math.min(...values));}return max;}

test('bark seam triangles no longer span the texture; editor vertices, caps and topology remain intact',()=>{
 for(const seam of [0,73,-124]){const b=branch(),s={...settings,bark_seam:seam},g=createSweptBranchGeometry(b,12,s),original=g.clone(),rings=g.userData.radiusRings;
 try{assert.ok(uvSpan(g)>.8);prepareBranchBarkSurface(g,b,s);assert.ok(uvSpan(g)<=.5+1e-6);assert.equal(g.index.count,original.index.count);assert.equal(g.attributes.position.count,original.attributes.position.count+rings.length+rings[0].count*2);
  for(const r of rings)for(let side=0;side<r.count;side++)for(const key of ['position','color']){const a=g.attributes[key],o=original.attributes[key],i=r.offset+side;for(let k=0;k<a.itemSize;k++)assert.equal(a.array[i*a.itemSize+k],o.array[i*a.itemSize+k]);}
  for(let cap=0;cap<2;cap++)for(let k=0;k<3;k++)assert.equal(g.attributes.position.array[(g.attributes.position.count-2+cap)*3+k],original.attributes.position.array[(original.attributes.position.count-2+cap)*3+k]);
  assert.ok(g.index.array.every(i=>i<g.attributes.position.count));const n=g.attributes.normal,t=g.attributes.tangent;
  for(let i=0;i<t.count;i++){const a=new THREE.Vector3().fromBufferAttribute(n,i),b=new THREE.Vector3().fromBufferAttribute(t,i);assert.ok(Math.abs(b.length()-1)<1e-5);assert.ok(Math.abs(a.dot(b))<1e-5);}
  for(let row=0;row<rings.length;row++)for(const key of ['position','normal','tangent']){const a=g.attributes[key],i=rings[row].offset,j=g.userData.barkSurface.seamOffset+row;for(let k=0;k<a.itemSize;k++)assert.equal(a.array[i*a.itemSize+k],a.array[j*a.itemSize+k]);}
 }finally{g.dispose();original.dispose();}}
});

test('loft normals are independent of a quad diagonal and uneven longitudinal sampling',()=>{
 const b=branch(),a=createSweptBranchGeometry(b,12,settings),c=a.clone();c.userData=structuredClone(a.userData);
 try{const index=c.index.array,sides=a.userData.radiusRings[0].count;for(let row=0;row<a.userData.radiusRings.length-1;row++)for(let side=0;side<sides;side++){const i=(row*sides+side)*6,x=row*sides+side,y=row*sides+(side+1)%sides,z=(row+1)*sides+(side+1)%sides,w=(row+1)*sides+side;index.set([x,y,w,y,z,w],i);}c.computeVertexNormals();prepareBranchBarkSurface(a,b,settings);prepareBranchBarkSurface(c,b,settings);assert.deepEqual(a.attributes.normal.array,c.attributes.normal.array);
 }finally{a.dispose();c.dispose();}
 const straight={...branch(),points:withAxisTimes([[0,0,0],[0,0,.001],[0,0,1.5],[0,0,2],[0,0,4]].map(v),[0,.00025,.375,.5,1]),startRadius:.2,endRadius:.2},g=createTrunkFormPreviewGeometry(straight,settings,null);
 try{const p=g.attributes.position,n=g.attributes.normal;for(const row of g.userData.radiusRings.slice(1,-1))for(let side=0;side<row.count;side++){const i=row.offset+side,radial=new THREE.Vector3().fromBufferAttribute(p,i).sub(v(row.center)).normalize();assert.ok(radial.dot(new THREE.Vector3().fromBufferAttribute(n,i))>.99999);}}finally{g.dispose();}
});

test('longitudinal texture size follows the real tapered skin, independently of adaptive t and stored length',()=>{
 const b={...branch(),points:withAxisTimes([[0,0,0],[0,0,.001],[0,0,1],[0,0,3]].map(v),[0,.0002,.35,1])},g=createTrunkFormPreviewGeometry(b,settings,null),r=g.userData.radiusRings,uv=g.attributes.uv,p=g.attributes.position;let distance=0;
 try{for(let i=0;i<r.length;i++){if(i)distance+=new THREE.Vector3().fromBufferAttribute(p,r[i].offset).distanceTo(new THREE.Vector3().fromBufferAttribute(p,r[i-1].offset));assert.ok(Math.abs(uv.getY(r[i].offset)-distance*settings.bark_tiling/Math.max(b.startRadius*12,.2))<1e-6);for(let side=1;side<r[i].count;side++)assert.equal(uv.getY(r[i].offset+side),uv.getY(r[i].offset));}
  const before=g.attributes.position.array;assert.equal(prepareBranchBarkSurface(g,b,settings),g);assert.equal(g.attributes.position.array,before,'already prepared geometry is retained');
 }finally{g.dispose();}
});

test('continuous carrier material closes its texture phase and keeps around/along dimensions after direction rotation',()=>{
 for(const direction of ['VERTICAL','HORIZONTAL']){const recipe={...BARK_PRESETS[0],direction,scale_u_m:.41,scale_v_m:.73},m=createBarkSurfaceMaterial(recipe,{branch:branch(),settings,continuousBark:true,size:32});
  try{for(const map of [m.map,m.normalMap,m.roughnessMap]){map.updateMatrix();const a=new THREE.Vector2(0,.2).applyMatrix3(map.matrix),b=new THREE.Vector2(1,.2).applyMatrix3(map.matrix),delta=b.sub(a);assert.ok(Math.abs(delta.x-Math.round(delta.x))<1e-10);assert.ok(Math.abs(delta.y-Math.round(delta.y))<1e-10);const c=new THREE.Vector2(.3,.2).applyMatrix3(map.matrix),d=new THREE.Vector2(.3,1.2).applyMatrix3(map.matrix);assert.ok(Math.abs(d.distanceTo(c)-Math.max(branch().startRadius*12,.2)/settings.bark_tiling/recipe.scale_v_m)<1e-10);}
  }finally{for(const map of [m.map,m.normalMap,m.roughnessMap])map.dispose();m.dispose();}}
});

test('seam triangles keep exact surface placement and dense seamed meshes retain accelerated picking',()=>{
 const b=branch(),g=createTrunkFormPreviewGeometry(b,settings,null),m=new THREE.Mesh(g,new THREE.MeshBasicMaterial());m.updateMatrixWorld();
 try{const row=1,sides=g.userData.radiusRings[0].count,at=(row*sides+sides-1)*6,face={a:g.index.getX(at),b:g.index.getX(at+1),c:g.index.getX(at+2)},point=new THREE.Vector3();for(const [i,key]of ['a','b','c'].entries())point.addScaledVector(new THREE.Vector3().fromBufferAttribute(g.attributes.position,face[key]),[.2,.3,.5][i]);
  const r=g.userData.radiusRings,t=sectionPositionFromSurfaceHit(r,{face,point,object:m},m);assert.ok(Math.abs(t-(r[row].t*.5+r[row+1].t*.5))<1e-8);
 }finally{g.dispose();m.material.dispose();}
 const dense={...branch(),points:withAxisTimes(Array.from({length:301},(_,i)=>v([0,0,i*.04])),Array.from({length:301},(_,i)=>i/300))},geometry=createTrunkFormPreviewGeometry(dense,{...settings,radial_segments:64},null),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
 try{const ray=new THREE.Raycaster(v([3,0,2]),v([-1,0,0])),native=ray.intersectObject(mesh,false)[0],ranges=[],original=mesh.raycast;mesh.raycast=function(ray,hits){ranges.push(this.geometry.drawRange.count);return original.call(this,ray,hits);};const fast=intersectTrunkSurface(mesh,ray);assert.equal(fast.faceIndex,native.faceIndex);assert.ok(ranges.every(n=>n<geometry.index.count),'seam cannot disable the band hierarchy');assert.deepEqual(geometry.drawRange,{start:0,count:Infinity});
 }finally{geometry.dispose();mesh.material.dispose();}
});
