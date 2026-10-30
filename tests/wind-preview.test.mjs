import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createWindPose,normalizeWindPreview,WIND_PRESETS} from '../web/wind-preview-data.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {sampleLine,lineTangent} from '../web/tree-sculpt.js';
import {cloneAxis,withAxisTimes} from '../web/branch-axis.js';
const v=(x,y,z)=>new T.Vector3(x,y,z),close=(a,b,t=1e-10)=>assert(a.distanceTo(b)<t,`${a.toArray()} ≠ ${b.toArray()}`);
function fixture(){
 const b=(id,stableId,parentId,parentT,points,owner)=>({id,stableId,parentId,parentT,points,controlPoints:cloneAxis(points),windStiffness:1,instanceId:owner,children:[]});
 const branches=[b(0,'ROOT',-1,0,[v(0,0,0),v(0,0,.1),v(0,0,1),v(0,0,2),v(0,0,3)]),b(1,'SIDE',0,.5,[v(0,0,1.5),v(.5,0,1.8),v(1.2,0,2)]),b(2,'A.R',1,.5,[v(.5,0,1.8),v(.9,.2,2.1)],'A'),b(3,'A.T',2,.5,[v(.7,.1,1.95),v(.8,.4,2.3)],'A'),b(4,'B.R',3,.6,[v(.76,.28,2.16),v(.95,.5,2.5)],'B')];
 withAxisTimes(branches[0].points,[0,.03,.3,.7,1]);for(const branch of branches){const p=branches.find(b=>b.id===branch.parentId);p?.children.push(branch.id);}
 return {snapshot:new Map(branches.map(b=>[b.id,b])),instances:[{id:'A',parent:'SIDE'},{id:'B',parent:'A.T'}]};
}
test('wind settings are finite, bounded and optional in old project normalization',()=>{
 const a=normalizeWindPreview({strength:Infinity,direction:-450,speed:-10,branch:9,seed:NaN,showDirection:false});assert.equal(a.strength,.5);assert.equal(a.direction,270);assert.equal(a.speed,.25);assert.equal(a.branch,1);assert.equal(a.showDirection,false);assert.deepEqual(normalizeAuthoring({}).wind_preview,normalizeWindPreview());assert.equal(Object.keys(WIND_PRESETS).length,3);
 const round=normalizeAuthoring({wind_preview:{direction:123,strength:.73}});assert.equal(round.wind_preview.direction,123);assert.equal(round.wind_preview.strength,.73);
});
test('root stays fixed; structural segment lengths and nonuniform stations survive wind',()=>{
 const f=fixture(),before=JSON.stringify([...f.snapshot.values()]),pose=createWindPose(f.snapshot,f.instances),frame=pose.evaluate(3,{...WIND_PRESETS.STRONG});
 const root=frame.updated.get(0);close(root.points[0],f.snapshot.get(0).points[0]);close(root.points[1],f.snapshot.get(0).points[1]);assert(root.points.at(-1).distanceTo(f.snapshot.get(0).points.at(-1))>.001);
 for(const [id,b]of frame.updated)for(let i=1;i<b.points.length;i++)assert(Math.abs(b.points[i].distanceTo(b.points[i-1])-f.snapshot.get(id).points[i].distanceTo(f.snapshot.get(id).points[i-1]))<1e-10);
 const at=.5,base=f.snapshot.get(1),parent=f.snapshot.get(0),q=new T.Quaternion().setFromUnitVectors(lineTangent(parent.points,at),lineTangent(root.points,at)),expected=base.points[0].clone().sub(sampleLine(parent.points,at)).applyQuaternion(q).add(sampleLine(root.points,at));close(frame.updated.get(1).points[0],expected);
 assert.equal(JSON.stringify([...f.snapshot.values()]),before);
});
test('each complete owner is one rigid model; nested owners keep their moved attachment',()=>{
 const f=fixture(),frame=createWindPose(f.snapshot,f.instances).evaluate(4,{strength:1,direction:90,unit:.6}),a=frame.transforms.get(2).matrix;
 assert.equal(frame.transforms.get(3).matrix,a);assert(!frame.updated.has(2));const root=f.snapshot.get(2),tip=f.snapshot.get(3);assert(Math.abs(root.points[0].clone().applyMatrix4(a).distanceTo(tip.points[1].clone().applyMatrix4(a))-root.points[0].distanceTo(tip.points[1]))<1e-10);
 const b=frame.transforms.get(4).matrix;close(f.snapshot.get(4).points[0].clone().applyMatrix4(b),f.snapshot.get(4).points[0].clone().applyMatrix4(a));assert.notDeepEqual(a.elements,b.elements);
});
test('wind time is deterministic and zero strength returns an exact rest pose without changing authoring',()=>{
 const f=fixture(),pose=createWindPose(f.snapshot,f.instances),params={seed:18,strength:.5,direction:270};const first=pose.evaluate(7,params),again=pose.evaluate(7,params);assert.deepEqual([...first.updated],[...again.updated]);assert.deepEqual([...first.transforms].map(([id,v])=>[id,v.matrix.elements]),[...again.transforms].map(([id,v])=>[id,v.matrix.elements]));assert.notDeepEqual(first.updated.get(0).points,pose.evaluate(8,params).updated.get(0).points);
 for(const t of [0,5]){const rest=pose.evaluate(t,{strength:0});assert.equal(rest.updated.size,0);assert.equal(rest.transforms.size,0);}assert.equal(pose.evaluate(0,params).updated.size,0);
});

test('ground-level root guides stay fixed while upper branches move',()=>{const f=fixture(),root={id:5,stableId:'GROUND_ROOT',parentId:0,parentT:.03,points:[v(0,0,.1),v(.5,0,.05),v(.8,0,0)],controlPoints:[v(0,0,.1),v(.8,0,0)],windStiffness:1,children:[]};f.snapshot.set(5,root);const frame=createWindPose(f.snapshot,f.instances).evaluate(3,{strength:1,branch:1,trunk:1});for(let i=0;i<root.points.length;i++)close(frame.updated.get(5).points[i],root.points[i]);assert(frame.updated.get(1).points.at(-1).distanceTo(f.snapshot.get(1).points.at(-1))>.001);});
