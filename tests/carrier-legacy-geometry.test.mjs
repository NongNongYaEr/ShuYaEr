import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {evaluateControlCurve,controlCurveOperation} from '../web/branch-control-curve.js';
import {makeMountOperation,evaluateBranchMount} from '../web/branch-mount.js';
import {createSculptSnapshot,deformTree,nearestParameter,sampleLine} from '../web/tree-sculpt.js';
import {createSweptBranchGeometry,normalizeSettings} from '../web/branch-kernel.js';
import {applySculptLayers} from '../web/generator-geometry.js';
import {branchMountAt} from '../web/branch-mount-frame.js';
const v=p=>new THREE.Vector3(...p),settings=normalizeSettings({leaf_density:0,child_count:0,junction_collar:false,surface_roughness:0,adaptive_tessellation:false});
function fixture(){const branch=(id,stableId,parentId,points,parentT=.5)=>({id,stableId,parentId,parentT,points:points.map(v),controlPoints:points.map(v),children:[],length:3,startRadius:.08,endRadius:.01,phase:0,sections:[]});const trunk=branch(0,'TRUNK',-1,[[0,0,0],[0,0,3],[.4,0,6]]),root=branch(1,'ROOT',0,[[0,0,3],[1,0,3.5],[2,0,4]]),copy=branch(2,'COPY',1,[[1,0,3.5],[1.4,.2,4],[1.6,.1,4.8]]);copy.copySnapshot=true;trunk.children=[1];root.children=[2];const curves=evaluateControlCurve([trunk,root,copy],controlCurveOperation(root,[[0,0,3],[1,.3,3.7],[2,.2,4.2]]));assert(curves[2].legacyRigidGeometry);return curves;}
function aligned(branch){const geometry=createSweptBranchGeometry(branch,8,settings);try{assert(geometry.userData.radiusRings.length>2);for(const ring of geometry.userData.radiusRings){const p=v(ring.center),t=nearestParameter(branch.points,p);assert(p.distanceTo(sampleLine(branch.points,t))<1e-6,`${branch.stableId}: stale centreline ${p.distanceTo(sampleLine(branch.points,t))}`);}}finally{geometry.dispose();}}
test('a mounted carrier transports existing legacy copy geometry together with its curves',()=>{const branches=fixture(),root=branches[1],op=makeMountOperation(branches,root,{attach:.8,azimuth:25,elevation:10},{azimuth:0,elevation:0}),moved=evaluateBranchMount(branches,op);aligned(moved[2]);});
test('combing a structural legacy copy rebuilds its changed curve instead of retaining an old rigid baseline',()=>{const branches=fixture(),snapshot=createSculptSnapshot(branches),weights=new Map([...snapshot].map(([id,b])=>[id,b.controlPoints.map((_,i)=>id===2&&i>0?1:0)])),after=deformTree(snapshot,weights,v([.8,-.3,.4]),'COMB',{worldRadius:1,strength:1});assert(after.get(2).points.some((p,i)=>p.distanceTo(branches[2].points[i])>.001));aligned(after.get(2));});
test('plain sculpt history invalidates a nonrigid legacy baseline while retaining the full history data',()=>{const branches=fixture(),old=branches[2].points.map(p=>p.clone()),layer={id:'EDIT',enabled:true,strength:1,branches:{COPY:{parent:'ROOT',root_offset:[0,0,0],deltas:[[0,0,0],[.4,.3,0],[.1,0,.2]],knot_deltas:[[0,0,0],[.4,.3,0],[.1,0,.2]]}}};applySculptLayers(branches,[layer]);assert.notDeepEqual(branches[2].points,old);aligned(branches[2]);});

test('saved point rotations after mounting a copy transport its cached sweep rather than exposing the old baseline again',()=>{
 const branches=fixture();branches[2].parentT=.85;const mount=makeMountOperation(branches,branches[2],{attach:.9,azimuth:12,elevation:5},{azimuth:0,elevation:0}),rotation={type:'POINT_ROTATE',root:'ROOT',targets:['ROOT'],point:1,rotation:new THREE.Quaternion().setFromAxisAngle(v([0,0,1]),.7).toArray()};
 applySculptLayers(branches,[{id:'MOUNT',enabled:true,strength:1,operation:mount,branches:{}},{id:'TURN',enabled:true,strength:1,operation:rotation,branches:{}}]);aligned(branches[2]);
});
test('mounting a smooth carrier preserves its exact continuous roll frame at arbitrary attachments',()=>{
 const branches=fixture(),root=branches[1],op=makeMountOperation(branches,root,{attach:.8,azimuth:25,elevation:10},{azimuth:0,elevation:0}),moved=evaluateBranchMount(branches,op),now=moved[1],matrix=now.mountMatrix;
 for(const t of [.001,.17,.375,.501,.83,.999]){const expected=matrix.clone().multiply(branchMountAt(root,t)),actual=branchMountAt(now,t);for(let i=0;i<16;i++)assert(Math.abs(actual.elements[i]-expected.elements[i])<1e-9);}
 assert.equal(now.mountFrameBinding.points,now.points);assert.equal(now.mountFrameBinding.frames,now.mountFrames);
});
