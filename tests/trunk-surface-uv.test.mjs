import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTrunkFormPreviewGeometry,normalizeSettings} from '../web/branch-kernel.js';
import {createDirectTrunkForm} from '../web/trunk-form.js';
import {createBarkSurfaceMaterial,BARK_PRESETS} from '../web/bark-materials.js';

const v=p=>new THREE.Vector3(...p),settings=normalizeSettings({radial_segments:12,adaptive_tessellation:false,twist:0,section_roll:0,groove_depth:0,surface_roughness:0});
const branch=()=>({id:0,stableId:'ROOT',parentId:-1,order:0,points:[[0,0,0],[.1,0,.8],[.7,0,1.3],[1.1,0,2.4]].map(v),controlPoints:[[0,0,0],[.1,0,.8],[.7,0,1.3],[1.1,0,2.4]].map(v),length:3,startRadius:.35,endRadius:.2,sections:[],children:[],phase:.3,windPhase:0,windStiffness:1});
const profile=Array.from({length:32},(_,i)=>({id:'P'+i,angle:i*360/32,radius:i%4===0?2.8:i%4===1?.45:1}));
const form=()=>createDirectTrunkForm({geometry_version:2,sections:[{id:'BASE',t:.12,radius:1.2,profile},{id:'TOP',t:.7,radius:.8,profile:profile.map(p=>({...p,radius:1+(p.radius-1)*.35}))}]});
const point=(g,i)=>new THREE.Vector3().fromBufferAttribute(g.attributes.position,i);

test('deep corrugated contours receive U proportional to real surface width and never fold a UV triangle',()=>{
 const g=createTrunkFormPreviewGeometry(branch(),settings,form());
 try{const rows=g.userData.radiusRings,uv=g.attributes.uv;let oldRatio=0;
  for(const r of rows.filter((_,i)=>i%7===0)){const sizes=[],density=[];for(let side=0;side<r.count;side++){const a=r.offset+side,b=r.offset+(side+1)%r.count,width=point(g,a).distanceTo(point(g,b)),u=side===r.count-1?uv.getX(g.userData.barkSurface.seamOffset+rows.indexOf(r)):uv.getX(b);if(width>1e-7){density.push((u-uv.getX(a))/width);sizes.push(width);}assert.equal(uv.getY(a),uv.getY(r.offset));}
   oldRatio=Math.max(oldRatio,Math.max(...sizes)/Math.min(...sizes));assert.ok(Math.max(...density)/Math.min(...density)<1.0003,'a groove wall cannot have a different texel width than its neighbour');
  }assert.ok(oldRatio>4,'fixture must contain the former angular-UV stretching');
  for(let i=0;i<g.userData.barkSurface.wallIndexCount;i+=3){const [a,b,c]=[0,1,2].map(k=>g.index.getX(i+k)),det=(uv.getX(b)-uv.getX(a))*(uv.getY(c)-uv.getY(a))-(uv.getX(c)-uv.getX(a))*(uv.getY(b)-uv.getY(a));assert.ok(det>=0,'UV triangle reversed');}
 }finally{g.dispose();}
});

test('cut caps have their own planar UV and flat normals while original editable contour vertices remain',()=>{
 const g=createTrunkFormPreviewGeometry(branch(),settings,form());
 try{const rows=g.userData.radiusRings,uv=g.attributes.uv,n=g.attributes.normal,offset=g.userData.barkSurface.capRimOffset;
  for(let cap=0;cap<2;cap++){const r=rows[cap?rows.length-1:0],normal=v(r.tangent).multiplyScalar(cap?1:-1);for(let side=0;side<r.count;side++){const i=offset+cap*r.count+side;assert.deepEqual(point(g,i).toArray(),point(g,r.offset+side).toArray());assert.ok(new THREE.Vector3().fromBufferAttribute(n,i).dot(normal)>.99999);}
   const start=g.userData.barkSurface.wallIndexCount+cap*r.count*3;for(let side=0;side<r.count;side++){const ids=[0,1,2].map(k=>g.index.getX(start+side*3+k)),[a,b,c]=ids;assert.equal(a,g.attributes.position.count-2+cap);assert.ok(ids.slice(1).every(i=>i>=offset+cap*r.count&&i<offset+(cap+1)*r.count));assert.ok(Math.abs((uv.getX(b)-uv.getX(a))*(uv.getY(c)-uv.getY(a))-(uv.getX(c)-uv.getX(a))*(uv.getY(b)-uv.getY(a)))>1e-9);}
  }
 }finally{g.dispose();}
});

test('material repeats use actual skin perimeter and keep the requested physical cap and longitudinal dimensions',()=>{
 const b=branch(),g=createTrunkFormPreviewGeometry(b,settings,form()),perimeter=g.userData.barkSurface.referencePerimeter,recipe={...BARK_PRESETS[0],scale_u_m:.4,scale_v_m:.6},m=createBarkSurfaceMaterial(recipe,{branch:b,settings,continuousBark:true,referencePerimeter:perimeter,size:16});
 try{assert.equal(m.map.repeat.x,Math.max(1,Math.round(perimeter/.4)));assert.ok(perimeter>2*Math.PI*b.startRadius);const uv=g.attributes.uv,rows=g.userData.radiusRings,r=rows[0],a=g.userData.barkSurface.capRimOffset,next=a+1,actual=point(g,a).sub(point(g,next));m.map.updateMatrix();const u=new THREE.Vector2().fromBufferAttribute(uv,a).applyMatrix3(m.map.matrix),w=new THREE.Vector2().fromBufferAttribute(uv,next).applyMatrix3(m.map.matrix),along=Math.abs(actual.dot(v(r.rolledY||r.y)))/recipe.scale_v_m;assert.ok(Math.abs(Math.abs(u.y-w.y)-along)<2e-6);}
 finally{g.dispose();for(const slot of ['map','normalMap','roughnessMap'])m[slot].dispose();m.dispose();}
});
