import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../web/vendor/three.module.min.js';
import {createTrunkJointPose,deformTrunkPrimitive,trunkPoseGeometry,trunkSourceBinding} from '../web/imported-trunk-binding.js';
import {removeTrunkBranches} from '../web/trunk-guide-topology.js';
import {FIXED_TRUNK_ROOT,trunkWeightRepairs,withTrunkWeightEdits} from '../web/trunk-weight-data.js';
import {autoRepairTrunkWeights,scanTrunkWeights,trunkBendPose} from '../web/trunk-weight-repair.js';

function fixture(){
 const guide=(id,parent,attach,points)=>({id,parent,attach,points,start_radius:1,end_radius:.5});
 const geometry={position:[7.43,0,.5,7.61,0,.5,7.43,.06,.5],index:[0,1,2],normal:[0,0,1,0,0,1,0,0,1],tangent:[1,0,0,1,1,0,0,1,1,0,0,1]};
 return {source:{sha256:'a'.repeat(64)},calibration:{base:[0,0,0],tip:[0,0,1],front:[0,1,0],scale:1},primitives:[{id:'P',geometry}],
  guides:[guide('G0','',0,[[0,0,0],[0,0,3],[0,0,7],[0,0,10]]),guide('G1','G0',.8,[[0,0,8],[4,0,8],[8,0,8]])]};
}
const patch=(model,items)=>withTrunkWeightEdits(model,new Map([['P',new Map(items)]])).model;
const pose=(model,angle)=>{const {mount,branches}=trunkBendPose(model,angle);return trunkPoseGeometry(model,mount,branches);};

test('trial bending finds a root vertex assigned to an upper branch and automatic reassignment lowers strain',()=>{
 const model=fixture(),before=scanTrunkWeights(model);
 assert.equal(trunkSourceBinding(model).primitives[0].guideIndices[1],1);
 assert(before.count>0);
 const result=autoRepairTrunkWeights(model,before);
 assert.equal(result.changed,1);
 assert(result.scan.count<before.count);
 assert.equal(trunkWeightRepairs(result.model).get('P').get(1),'G0');
 assert.equal(model.binding,undefined);
 assert(pose(result.model,0).primitives.get('P').position.every((n,i)=>Math.abs(n-model.primitives[0].geometry.position[i])<1e-10));
 assert.equal(autoRepairTrunkWeights(patch(model,[[1,'G1']])).changed,0,'preserve an explicit artist decision');
});

test('a root pin uses the first joint, persists and can restore the automatic assignment',()=>{
 const model=fixture(),painted=patch(model,[[1,FIXED_TRUNK_ROOT],[2,'G1']]);
 const restored=JSON.parse(JSON.stringify(painted)),primitive=trunkSourceBinding(restored).primitives[0];
 assert.equal(primitive.guideIndices[1],0);assert.equal(primitive.nodes[1],0);assert.equal(primitive.factors[1],0);
 assert.equal(primitive.guideIndices[2],1);
 assert.equal(trunkSourceBinding(patch(restored,[[1,null]])).primitives[0].guideIndices[1],1);
 assert.throws(()=>trunkSourceBinding({...restored,source:{sha256:'b'.repeat(64)}}),/不匹配/);
 assert.throws(()=>patch(restored,[[3,'G0']]),/不匹配/);
 const removed=removeTrunkBranches(restored,['G1']);
 assert.deepEqual([...trunkWeightRepairs(removed).get('P')],[[1,FIXED_TRUNK_ROOT]]);
 assert.equal(trunkSourceBinding(removed).primitives[0].guideIndices[2],0);
});

test('rotating a test joint moves the downstream bones and their weights, with the upstream fork and rest data intact',()=>{
 const model=fixture(),root=model.guides[0];
 model.guides.push({id:'LOW',parent:root.id,attach:.1,points:[[0,0,1],[1,0,1]],start_radius:.5,end_radius:.2});
 const painted=patch(model,[[0,FIXED_TRUNK_ROOT],[2,'G1']]),rest=trunkSourceBinding(painted),before=JSON.stringify(painted);
 const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/3);
 const testPose=createTrunkJointPose(rest,{guide:root.id,index:1},rotation),identity=new T.Matrix4(),matrices=testPose.bones;
 assert(matrices.get(root.id)[0].equals(identity));
 assert(matrices.get('LOW').every(matrix=>matrix.equals(identity)));
 assert(matrices.get('G1').every(matrix=>matrix.equals(matrices.get(root.id)[1])));
 const pivot=rest.guides[0].points[1];assert(pivot.clone().applyMatrix4(matrices.get(root.id)[1]).distanceTo(pivot)<1e-10);
 const result=deformTrunkPrimitive(testPose,'P').position,original=rest.primitives[0].geometry.position;
 assert.deepEqual(result.slice(0,3),original.slice(0,3));
 assert(new T.Vector3().fromArray(result,6).distanceTo(new T.Vector3().fromArray(original,6))>.5);
 assert.equal(JSON.stringify(painted),before);
});
