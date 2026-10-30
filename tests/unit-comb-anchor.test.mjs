import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cloneAxis,withAxisTimes} from '../web/branch-axis.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {normalizeSettings} from '../web/branch-kernel.js';
import {normalizeBranchShape} from '../web/branch-workbench-data.js';
import {evaluatedInstanceFrame,instanceFromMatrix,applyInstanceFamilyPlacement} from '../web/branch-instance-operations.js';
import {prepareUnitCombEntries,combUnitInstance,advanceUnitCombEntries} from '../web/unit-instance-combing.js';

const settings=normalizeSettings({leaf_density:0,wind_strength:0}),v=p=>new THREE.Vector3(...p);
const near=(a,b,label)=>assert.ok(a.distanceTo(b)<1e-8,`${label}: ${a.distanceTo(b)} m`);
const local=[[.2,-.1,.15],[.32,-.1,.15],[.8,.2,.3],[1.1,.1,.4]];
const shape=normalizeBranchShape({connector:{position:local[0],direction:[1,0,0]},branches:[{id:'R',parent:'',points:local,length:1,start_radius:.02,end_radius:.002}]});
const authoring=()=>normalizeAuthoring({branch_library:[{id:'A',revision:1,shape}],branch_instances:[{id:'I',asset_id:'A',linked:true,parent:'C',attach:.4,scale:1.15,radius_scale:.8,roll:19,angle:70,azimuth:15,variation:0,seed:7}]});
function carrier(mounted=false){
 const matrix=new THREE.Matrix4().compose(v([2,-1,3]),new THREE.Quaternion().setFromEuler(new THREE.Euler(.25,-.2,.4)),new THREE.Vector3().setScalar(1.4));
 const p=withAxisTimes([[0,0,0],[.03,.04,.5],[.3,-.1,1.6],[.65,.2,3]].map(v),[0,.06,.68,1],[.06,.68]);
 const points=mounted?cloneAxis(p,x=>x.clone().applyMatrix4(matrix)):p;
 return {id:0,stableId:'C',parentId:-1,points,controlPoints:points.map(p=>p.clone()),children:[1],...(mounted?{mountFrames:[matrix,matrix,matrix]}:{})};
}
function graph(a,parent,nested=false){
 const instance=a.branch_instances[0],frame=evaluatedInstanceFrame(instance,shape,[parent],settings);
 const points=cloneAxis(withAxisTimes(local.map(v),[0,.08,.6,1]),p=>p.clone().applyMatrix4(frame.matrix));
 const own={id:1,stableId:'I.R',parentId:0,parentT:instance.attach,instanceId:'I',unitOwner:'I',points,controlPoints:points.map(p=>p.clone()),children:nested?[2]:[],startRadius:.02,endRadius:.002};
 const branches=[parent,own];
 if(nested){const child=a.branch_instances[1],f=evaluatedInstanceFrame(child,shape,branches,settings),ps=local.map(p=>v(p).applyMatrix4(f.matrix));branches.push({id:2,stableId:'N.R',parentId:1,parentT:child.attach,instanceId:'N',unitOwner:'N',points:ps,controlPoints:ps.map(p=>p.clone()),children:[],startRadius:.02,endRadius:.002});}
 return branches;
}

for(const mounted of [false,true])test(`nonuniform carrier frame round trip retains the connector and authored offset (mount=${mounted})`,()=>{
 const a=authoring(),parent=carrier(mounted),i=a.branch_instances[0];
 i.frame={position:[.24,-.13,1.15],direction:[.8,.1,.3],parent_position:[.1,.03,.7],parent_tangent:[.1,.1,.98]};
 const before=evaluatedInstanceFrame(i,shape,[parent],settings),next=instanceFromMatrix(i,shape,parent,before.matrix,i.scale),after=evaluatedInstanceFrame(next,shape,[parent],settings);
 near(after.position,before.position,'identity conversion must not move the connector');near(after.direction,before.direction,'identity conversion direction');
 for(const point of local)near(v(point).applyMatrix4(after.matrix),v(point).applyMatrix4(before.matrix),'complete geometry identity');
 assert.deepEqual(parent.points.axisTimes,[0,.06,.68,1]);
});

for(const mounted of [false,true])test(`continuous comb keeps one fixed root across 80 dabs and saved frame reload (mount=${mounted})`,()=>{
 const a=authoring(),parent=carrier(mounted),branches=graph(a,parent),original=structuredClone(a);let entries=prepareUnitCombEntries({authoring:a,branches,settings,scope:'ALL'});
 const root=entries[0].frame.position.clone(),start=entries[0].frame.direction.clone();let total=new THREE.Matrix4(),last;
 for(let n=0;n<80;n++){
  const update=combUnitInstance(entries[0],{delta:v([.015,.008,-.025]),strength:.65,worldRadius:.4});assert(update);last=update;total.premultiply(update.matrix);
  near(root.clone().applyMatrix4(update.matrix),root,'each preview dab pivot');
  entries=advanceUnitCombEntries(entries,[update],{inPlace:true});near(entries[0].frame.position,root,'working pivot');
  const saved=JSON.parse(JSON.stringify(update.after)),after=evaluatedInstanceFrame(saved,shape,branches,settings);near(after.position,root,'saved connector');assert.equal(saved.scale,original.branch_instances[0].scale);assert.equal(saved.parent,'C');assert.equal(saved.attach,.4);
 }
 assert(start.angleTo(entries[0].frame.direction)>.1,'actual turn occurred');near(root.clone().applyMatrix4(total),root,'cumulative preview pivot');assert.deepEqual(a,original,'preview leaves authoring immutable');
 applyInstanceFamilyPlacement(a,original.branch_instances[0],last.after,shape,branches,settings);
 near(evaluatedInstanceFrame(a.branch_instances[0],shape,branches,settings).position,root,'committed connector');assert.deepEqual(a.branch_library,original.branch_library);
});

test('nested complete unit follows the parent rotation exactly with nonuniform attachment stations',()=>{
 const a=authoring();a.branch_instances.push({...structuredClone(a.branch_instances[0]),id:'N',parent:'I.R',attach:.45,scale:.55,roll:-13});
 const parent=carrier(true),branches=graph(a,parent,true),original=structuredClone(a),before=evaluatedInstanceFrame(a.branch_instances[1],shape,branches,settings);
 const [entry]=prepareUnitCombEntries({authoring:a,branches,settings,scope:'ALL'});assert.deepEqual(entry.familyIds,['I','N']);
 const update=combUnitInstance(entry,{delta:v([.1,.03,-.12]),strength:.7,worldRadius:.4});
 applyInstanceFamilyPlacement(a,update.before,update.after,shape,branches,settings);
 const moved=branches.map(b=>b.stableId==='I.R'?{...b,points:cloneAxis(b.points,p=>p.clone().applyMatrix4(update.matrix))}:b);
 const after=evaluatedInstanceFrame(a.branch_instances[1],shape,moved,settings);
 near(after.position,before.position.clone().applyMatrix4(update.matrix),'child relative connector');
 for(const p of local)near(v(p).applyMatrix4(after.matrix),v(p).applyMatrix4(before.matrix).applyMatrix4(update.matrix),'nested rigid geometry');
 assert.deepEqual(a.branch_library,original.branch_library);assert.equal(a.branch_instances[1].parent,'I.R');assert.equal(a.branch_instances[1].scale,original.branch_instances[1].scale);
});
