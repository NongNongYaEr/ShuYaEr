import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrunkDetailSizeMetric } from '../web/trunk-detail-size.js';
import { createTrunkDetail } from '../web/trunk-details.js';
import { moveTrunkDetailPathPoint } from '../web/trunk-detail-edit.js';
import { createSweptBranchGeometry, DEFAULT_SETTINGS, normalizeSettings } from '../web/branch-kernel.js';
import { createTrunkMeshPreset } from '../web/trunk-mesh-density.js';
import { getBaseTrunkForm, normalizeTrunkForm } from '../web/trunk-form.js';

const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} ≈ ${b}`);
const settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,surface_roughness:0,groove_depth:0,knot_strength:0,junction_collar:false,twist:40,section_roll:25});
const branch=(points=[[0,0,0],[0,0,2],[2,0,2]])=>({id:0,stableId:'ROOT',parentId:-1,order:0,length:4,startRadius:.3,endRadius:.3,points:points.map(p=>new THREE.Vector3(...p)),sections:[],phase:0,windPhase:0,windStiffness:1,children:[]});
const form=()=>normalizeTrunkForm({geometry_version:2,mesh:createTrunkMeshPreset(),sections:[{id:'MID',t:.5,radius:1,oval:1.4,roll:17,span:1}]});
function fixture(points){const b=branch(points),f=form(),g=createSweptBranchGeometry({...b,trunkForm:getBaseTrunkForm(f)},9,settings);return{b,f,g,metric:createTrunkDetailSizeMetric(g)};}

test('centimetre axial span follows a bent, unequally parameterized centerline and clips honestly at ends',()=>{
  const {g,metric}=fixture([[0,0,0],[0,0,1],[3,0,1]]);
  near(metric.length,400);near(metric.measure({t:.25,angle:0,height:.2},'height'),40);
  near(metric.measure({t:.75,angle:0,height:.2},'height'),120);
  near(metric.measure({t:0,angle:0,height:.2},'height'),20);
  const a=metric.solve({t:.25,angle:0,width:20,height:.1},'height',15),b=metric.solve({t:.75,angle:0,width:20,height:.1},'height',15);
  near(a.actual,15);near(b.actual,15);assert.ok(a.value>b.value);
  const bounds=metric.solve({t:.5,angle:0,width:20,height:.1},'height',10000);
  assert.equal(bounds.limited,true);near(bounds.actual,bounds.max);g.dispose();
});

test('centimetre circumference measures the actual oval polygon through the angular seam and in world scale',()=>{
  const {g,metric}=fixture([[0,0,0],[0,0,2],[0,0,4]]),scaled=createTrunkDetailSizeMetric(g,new THREE.Matrix4().makeScale(2,3,4));
  const d={t:.5,angle:355,width:40,height:.08},width=metric.measure(d,'width');assert.ok(width>0);
  near(metric.measure({...d,angle:-5},'width'),width);
  const solved=metric.solve(d,'width',7);near(solved.actual,7);assert.equal(solved.limited,false);
  const opposite=metric.measure({...d,angle:90},'width');assert.ok(Math.abs(opposite-width)>1,'ellipse direction changes real arc length');
  assert.ok(scaled.measure(d,'width')>width*1.9);near(scaled.length,1600);
  for(const angle of [0,20,40,180,355,360]){const value=metric.measure({...d,angle},'width');assert.ok(value>0&&value<200);}
  g.dispose();
});

test('cm sizes remain a view of existing detail fields; sub-percent details survive normalization and bounds are reported',()=>{
  const {g,metric}=fixture(),d=createTrunkDetail('SCAR',{width:2,height:.003,t:.6,angle:3});
  const next={...d,width:metric.solve(d,'width',3).value,height:metric.solve(d,'height',2).value};
  const saved=createTrunkDetail(next.type,JSON.parse(JSON.stringify(next)));
  near(metric.measure(saved,'width'),3);near(metric.measure(saved,'height'),2);
  assert.deepEqual(Object.keys(saved),Object.keys(d));assert.ok(saved.width<8&&saved.height<.02);
  const tiny=metric.solve(d,'width',.0001);assert.equal(tiny.limited,true);near(tiny.actual,tiny.min);
  assert.equal(metric.solve(d,'height',0),null);assert.equal(createTrunkDetailSizeMetric(null),null);g.dispose();
});

test('one path-point edit preserves every neighbour, pressure, seed, paused state and dimensions across the seam',()=>{
  const d=createTrunkDetail('SCAR',{id:'PATH',enabled:false,width:3,height:.003,strength:.2,seed:17,t:.2,angle:350,path:[{t:.2,angle:350,pressure:.4},{t:.5,angle:0,pressure:.7},{t:.8,angle:8,pressure:1}]});
  const before=structuredClone(d),next=moveTrunkDetailPathPoint(d,1,{t:.62,angle:363});
  assert.deepEqual(next.path[0],d.path[0]);assert.deepEqual(next.path[2],d.path[2]);assert.equal(next.path[1].pressure,.7);assert.equal(next.path[1].angle,3);assert.equal(next.path[1].t,.62);
  for(const k of ['id','type','enabled','width','height','strength','seed','t','angle'])assert.equal(next[k],d[k]);
  const first=moveTrunkDetailPathPoint(d,0,{t:.1,angle:345});assert.equal(first.t,.1);assert.equal(first.angle,345);
  assert.equal(moveTrunkDetailPathPoint(d,1,{t:.2,angle:350}),null);assert.equal(moveTrunkDetailPathPoint(d,3,{t:.4,angle:0}),null);assert.deepEqual(d,before);
});

test('narrow cm-range features reach closed finite actual triangles and reconstruct exactly after saving',()=>{
  const {b,f,g}=fixture();f.details=[createTrunkDetail('SCAR',{t:.601,angle:359.7,width:1.5,height:.0015,strength:.2})];
  const edited=createSweptBranchGeometry({...b,trunkForm:f},9,settings),cold=createSweptBranchGeometry({...b,trunkForm:normalizeTrunkForm(JSON.parse(JSON.stringify(f)))},9,settings);
  for(const name of ['position','normal','uv','color']){assert.deepEqual(edited.getAttribute(name).array,cold.getAttribute(name).array);assert.ok(edited.getAttribute(name).array.every(Number.isFinite));}
  assert.deepEqual(edited.index.array,cold.index.array);assert.ok(edited.userData.trunkMeshSampling.adaptive_detail_count>0);
  const edges=new Map(),p=edited.getAttribute('position');
  for(let i=0;i<edited.index.count;i+=3){const ids=[0,1,2].map(j=>edited.index.getX(i+j)),v=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id));assert.ok(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).lengthSq()>1e-18);for(let j=0;j<3;j++){const a=ids[j],c=ids[(j+1)%3],key=Math.min(a,c)+':'+Math.max(a,c);edges.set(key,(edges.get(key)||0)+1);}}
  assert.ok([...edges.values()].every(n=>n===2));g.dispose();edited.dispose();cold.dispose();
});
