import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {controlCurveAxis,controlCurveOperation,evaluateControlCurve,writeControlCurve} from '../web/branch-control-curve.js';
import {sampleLine,nearestParameter} from '../web/tree-sculpt.js';
import {axisTimes} from '../web/branch-axis.js';
import {completeInstanceMatrix} from '../web/branch-instance-matrix.js';
import {branchMountAt} from '../web/branch-mount-frame.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings,branchInstanceFrame,createTrunkFormPreviewGeometry} from '../web/branch-kernel.js';
import {createPVESkeleton} from '../web/pve-skeleton-export.js';
const v=p=>new THREE.Vector3(...p),near=(a,b)=>assert.ok(a.distanceTo(b)<1e-7,`${a.toArray()} != ${b.toArray()}`);
const knots=[[0,0,0],[1,0,1],[2,0,1],[3,0,0]];
const root=()=>({id:0,stableId:'ROOT',parentId:-1,order:0,points:[[0,0,0],[.5,.2,2],[1,-.3,1],[1.5,.1,3],[2,0,1],[3,0,0]].map(v),controlPoints:knots.map(v),length:4,startRadius:.05,endRadius:.01,phase:.3,windPhase:.2,windStiffness:1,children:[],sections:[]});
const settings=normalizeSettings({leaf_density:0,child_count:0,junction_collar:false,wind_strength:0,surface_roughness:.06});
test('current controls alone determine the entire curve, irrespective of previous sampled bends and their point counts',()=>{
 const a=root(),b={...root(),points:Array.from({length:97},(_,i)=>v([i/32,Math.sin(i)*3,Math.cos(i)*2]))},op=controlCurveOperation(a,knots),x=evaluateControlCurve([a],op)[0],y=evaluateControlCurve([b],op)[0];assert.deepEqual(x.points.map(p=>p.toArray()),y.points.map(p=>p.toArray()));assert.deepEqual(axisTimes(x.points),axisTimes(y.points));for(const p of x.controlPoints)near(sampleLine(x.points,nearestParameter(x.points,p)),p);assert.ok(x.points.every(p=>p.y===0&&p.z>=0&&p.z<=1));
});
test('a plateau between two controls stays level and every interval remains inside its endpoint bounds',()=>{
 const points=controlCurveAxis(knots),times=points.axisCuts;for(let i=0;i<points.length;i++){const t=points.axisTimes[i],segment=Math.min(knots.length-2,Math.max(0,times.findIndex(k=>k>=t)-1));for(let k=0;k<3;k++)assert.ok(points[i].getComponent(k)>=Math.min(knots[segment][k],knots[segment+1][k])-1e-10&&points[i].getComponent(k)<=Math.max(knots[segment][k],knots[segment+1][k])+1e-10);if(t>=times[1]&&t<=times[2])assert.ok(Math.abs(points[i].z-1)<1e-10);}
});
test('returning to the same controls removes intermediate bends without accumulating mesh samples',()=>{
 const original=root(),A=evaluateControlCurve([original],controlCurveOperation(original,knots)),B=knots.map(p=>[...p]);B[1][1]=.5;B[2][2]=1.6;let current=A;for(let i=0;i<12;i++){current=evaluateControlCurve(current,controlCurveOperation(current[0],B));current=evaluateControlCurve(current,controlCurveOperation(current[0],knots));assert.deepEqual(current[0].points.map(p=>p.toArray()),A[0].points.map(p=>p.toArray()));assert.equal(current[0].points.length,A[0].points.length);}
});
test('connected complete units follow rigidly, and compiled instance matrices agree with the same carrier motion',()=>{
 const b=root(),instance={attach:.43,angle:45,azimuth:30,roll:70,scale:.8,variation:0,seed:3},shape={connector:{position:[.1,.2,0],direction:[1,0,0]}},matrix=completeInstanceMatrix(instance,shape,b,settings,branchInstanceFrame),unit={...root(),id:1,stableId:'UNIT',parentId:0,parentT:instance.attach,unitOwner:'U',instanceId:'U',points:[[0,0,0],[.5,.1,.2]].map(p=>v(p).applyMatrix4(matrix)),controlPoints:[[0,0,0],[.5,.1,.2]].map(p=>v(p).applyMatrix4(matrix))},after=evaluateControlCurve([b,unit],controlCurveOperation(b,knots)),rigid=after[1].mountMatrix;
 const compiled=completeInstanceMatrix(instance,shape,after[0],settings,branchInstanceFrame),expected=rigid.clone().multiply(matrix);for(const p of [[0,0,0],[1,.2,.4],[-.3,0,.6]])near(v(p).applyMatrix4(compiled),v(p).applyMatrix4(expected));for(let i=0;i<unit.points.length;i++)near(after[1].points[i],unit.points[i].clone().applyMatrix4(rigid));assert.ok(Math.abs(after[1].points[0].distanceTo(after[1].points[1])-unit.points[0].distanceTo(unit.points[1]))<1e-9);
});
test('complete-unit frames return to the same pose after a control round trip, including azimuth roll',()=>{
 const b=root(),A=evaluateControlCurve([b],controlCurveOperation(b,knots)),B=knots.map(p=>[...p]);B[1][1]=.3;B[2][2]=1.8;const changed=evaluateControlCurve(A,controlCurveOperation(A[0],B)),back=evaluateControlCurve(changed,controlCurveOperation(changed[0],knots));for(const t of [.1,.35,.7,.95]){const a=branchMountAt(A[0],t),z=branchMountAt(back[0],t);for(const p of [[0,0,0],[1,.2,.3]])near(v(p).applyMatrix4(a),v(p).applyMatrix4(z));}
});
test('consecutive point changes replace one current curve recipe; unrelated operations keep their order',()=>{
 const b=root(),authoring={sculpt_layers:[]};writeControlCurve(authoring,controlCurveOperation(b,knots));writeControlCurve(authoring,controlCurveOperation(b,knots.map(p=>[p[0],p[1],p[2]+.1])));assert.equal(authoring.sculpt_layers.length,1);authoring.sculpt_layers.push({id:'OTHER',enabled:true,strength:1,operation:{type:'RADIUS'}});writeControlCurve(authoring,controlCurveOperation(b,knots));assert.equal(authoring.sculpt_layers.length,3);assert.equal(authoring.sculpt_layers[1].id,'OTHER');
});
test('ownership, fixed controls, fixed connected branches and degenerate curves are respected',()=>{
 const b=root(),op=controlCurveOperation(b,knots.map((p,i)=>i===1?[p[0],.2,p[2]]:p));for(const key of ['unitOwner','instanceId','symmetryGroup']){const protectedRoot={...b,[key]:'U'};assert.deepEqual(evaluateControlCurve([protectedRoot],op),[protectedRoot]);}assert.deepEqual(evaluateControlCurve([b],op,1,{ROOT:{pinned_points:[1]}}),[b]);assert.equal(controlCurveAxis([[1,1,1],[1,1,1]]),null);const d={...root(),id:1,stableId:'CHILD',parentId:0,parentT:.5};assert.deepEqual(evaluateControlCurve([b,d],op,1,{CHILD:{pinned_points:[0]}}),[b,d]);
});
test('sampling is bounded, preserves close controls, and co-located handles do not create zero mesh strips',()=>{
 const raw=Array.from({length:64},(_,i)=>[i*.03,Math.sin(i)*.1,Math.cos(i)*.1]),p=controlCurveAxis(raw);assert.ok(p.length<=512);assert.equal(p.axisCuts.length,64);for(const k of raw)near(sampleLine(p,nearestParameter(p,v(k))),v(k));const repeated=controlCurveAxis([[0,0,0],[1,0,0],[1,0,0],[1.001,0,1],[2,0,1]]);for(let i=1;i<repeated.length;i++)assert.ok(repeated[i].distanceTo(repeated[i-1])>0);
});
test('project JSON cold rebuild, every LOD mesh centreline and existing PVE fields use the same current control curve',()=>{
 const b=root(),a=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',points:b.points.map(p=>p.toArray()),knots,length:4,start_radius:.05,end_radius:.01}]},sculpt_layers:[{id:'NODES',enabled:true,strength:1,branches:{},operation:controlCurveOperation(b,knots)}]}),expected=controlCurveAxis(knots),asset=buildBranchAsset(settings,null,[],0,normalizeAuthoring(JSON.parse(JSON.stringify(a))));
 try{const actual=asset.masterBranches[0];assert.equal(actual.controlDriven,true);assert.deepEqual(actual.points.map(p=>p.toArray()),expected.map(p=>p.toArray()));for(let lod=0;lod<4;lod++){const g=createTrunkFormPreviewGeometry(actual,settings,null,lod);try{for(const r of g.userData.radiusRings)near(v(r.center),sampleLine(expected,r.t));}finally{g.dispose();}}const pve=createPVESkeleton(asset);for(const p of pve.branches[0].points){assert.deepEqual(Object.keys(p),['t','position_m','radius_m']);near(v(p.position_m),sampleLine(expected,p.t));}}finally{disposeBranchAsset(asset);}
});
