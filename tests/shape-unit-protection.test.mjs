import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeShapeOperation, normalizeSymmetryGroups } from '../web/shape-operation-data.js';
import { evaluateShapeOperation } from '../web/shape-operation-geometry.js';
import { createBranchCage } from '../web/branch-deformation.js';
import { createSculptSnapshot, sampleLine } from '../web/tree-sculpt.js';
import { applyBranchSymmetry } from '../web/branch-symmetry.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { applySculptLayers } from '../web/generator-geometry.js';

const v = p => new THREE.Vector3(...p);
const branch = (id, parentId, points, extra = {}) => ({ id, stableId: 'B' + id, parentId, parentT: .5,
  children: [], order: parentId < 0 ? 0 : 1, length: 2, startRadius: .08, endRadius: .02,
  points: points.map(v), controlPoints: points.map(v), sections: [], ...extra });
const fixture = () => [branch(0,-1,[[0,0,0],[0,0,2],[0,0,4]]),
  branch(1,0,[[0,0,2],[1,0,2.3],[2,.2,2.8]]),
  branch(2,1,[[1,0,2.3],[1.5,.3,2.5],[2,.7,2.9]],{instanceId:'UNIT',unitOwner:'UNIT'}),
  branch(3,2,[[1.5,.3,2.5],[1.3,.8,2.6]],{instanceId:'UNIT',unitOwner:'UNIT'}),
  branch(4,3,[[1.4,.55,2.55],[1.7,1,2.8]],{instanceId:'NESTED',unitOwner:'NESTED'}),
  branch(5,4,[[1.55,.77,2.67],[1.2,1.1,2.7]],{manual:true})];
function operations(bs) {
  const cage = createBranchCage(createSculptSnapshot(bs.filter(b => b.id < 2)), new Set(['B1']));
  return [
    {type:'CAGE',targets:['B1'],keepRoots:true,rest:cage.rest.map(p=>p.toArray()),nodes:cage.nodes.map((p,i)=>p.clone().add(v([i%3*.22, .3, .05*i])).toArray()),axis:cage.axis},
    {type:'GUIDE',targets:['B1'],guide:[[0,0,0],[1,1,.4],[2,1,1.3]],anchor:[0,0,0],strengths:[0,.7,1]},
    {type:'SPACE',targets:['B1'],center:[1,0,2.5],radius:1,voidEnabled:true,spacingEnabled:false,minOrder:0,amount:.7},
    {type:'POSE',targets:['B1'],mode:'BEND',offset:[0,1,.3],preserveLength:true},
    {type:'POSE',targets:['B1'],mode:'TWIST',twist:80,preserveLength:true},
    {type:'VOLUME',targets:['B1'],stamps:[{branch:'B1',t:.5,width:.4,amount:.8},{branch:'B2',t:.5,width:.4,amount:.8}]},
  ].map(op => normalizeShapeOperation({...op, protect_units:true}));
}

test('new support operations carry every nested or manual unit descendant once, preserving internal shape and radius', () => {
  for (const op of operations(fixture())) {
    const bs=fixture(), before=JSON.stringify(bs), out=evaluateShapeOperation(bs,op,1,{B3:{pinned_points:[1]}});
    const unit=bs.filter(b=>b.id>=2), actual=out.filter(b=>b.id>=2);
    assert.equal(JSON.stringify(bs),before,'evaluation never changes input '+op.type);
    for(let b=0;b<unit.length;b++) {
      assert.equal(actual[b].startRadius,unit[b].startRadius); assert.equal(actual[b].length,unit[b].length);
      assert.deepEqual(actual[b].sections,unit[b].sections);
      for(let i=0;i<unit[b].points.length;i++) {
        const matrix=actual[b].mountMatrix || new THREE.Matrix4();
        assert.ok(unit[b].points[i].clone().applyMatrix4(matrix).distanceTo(actual[b].points[i])<1e-8);
        for(let c=0;c<unit.length;c++)for(let j=0;j<unit[c].points.length;j++)
          assert.ok(Math.abs(unit[b].points[i].distanceTo(unit[c].points[j])-actual[b].points[i].distanceTo(actual[c].points[j]))<1e-8,op.type+' internal distance');
      }
    }
    assert.ok(actual[0].points[0].distanceTo(sampleLine(out[1].points,.5))<1e-8,'unit mount follows carrier');
    if(op.type!=='VOLUME')assert.ok(out[1].mountFrames?.length);
  }
});

test('traceable old copied roots stay complete under new support deformation, even without an explicit root owner',()=>{
  for(const op of operations(fixture())){
    const bs=fixture();Object.assign(bs[2],{instanceId:'',unitOwner:'',copySnapshot:true,sourceInstanceId:'OLD_SOURCE'});
    const out=evaluateShapeOperation(bs,op);
    for(let b=2;b<bs.length;b++)for(const p of bs[b].points)for(let c=2;c<bs.length;c++)for(const q of bs[c].points){
      const pi=bs[b].points.indexOf(p),qi=bs[c].points.indexOf(q);
      assert.ok(Math.abs(p.distanceTo(q)-out[b].points[pi].distanceTo(out[c].points[qi]))<1e-8,'old whole copy stays rigid '+op.type);
    }
    assert.equal(bs[2].unitOwner,'','protection does not migrate original metadata');
  }
  const ordinary=fixture();Object.assign(ordinary[1],{copySnapshot:true,sourceInstanceId:''});
  assert.ok(evaluateShapeOperation(ordinary,operations(ordinary)[0])[1].points.some((p,i)=>p.distanceTo(ordinary[1].points[i])>1e-4),'ordinary copied skeleton remains editable');
});

test('protected flag survives documents; old operations keep old internal deformation behavior', () => {
  const bs=fixture(), op=operations(bs)[0], saved=normalizeAuthoring({sculpt_layers:[{id:'TEST',enabled:true,strength:1,branches:{},operation:op}]});
  assert.equal(normalizeAuthoring(JSON.parse(JSON.stringify(saved))).sculpt_layers[0].operation.protect_units,true);
  assert.equal(normalizeShapeOperation({...op,protect_units:false}).protect_units,false);
  const old={...op};delete old.protect_units;
  assert.ok(!Object.hasOwn(normalizeShapeOperation(old),'protect_units'));
  const legacy=evaluateShapeOperation(bs,old), protectedResult=evaluateShapeOperation(bs,op);
  const internalDistance=rows=>rows[2].points[0].distanceTo(rows[4].points.at(-1));
  assert.ok(Math.abs(internalDistance(legacy)-internalDistance(bs))>1e-4);
  assert.ok(Math.abs(internalDistance(protectedResult)-internalDistance(bs))<1e-8);
  assert.deepEqual(evaluateShapeOperation(bs,{...op,targets:['B2']}),bs,'malformed internal target ignored');
  const applied=fixture();applySculptLayers(applied,[{enabled:true,strength:1,operation:op}]);
  assert.ok(applied[2].mountMatrix,'saved operation retains unit follow matrix');
});

test('protected support symmetry excludes installed units without changing old symmetry groups', () => {
  const group=normalizeSymmetryGroups([{source:'B1',id:'SYM',protect_units:true,lengthVariation:0,bendVariation:0,angleVariation:0}])[0];
  assert.equal(normalizeSymmetryGroups(JSON.parse(JSON.stringify([group])))[0].protect_units,true);
  const out=applyBranchSymmetry(fixture(),[group]);
  assert.equal(out.filter(b=>b.symmetryGroup).length,1,'only support B1 copied');
  assert.equal(out.filter(b=>b.instanceId).length,3,'no copied loose unit internals');
  assert.equal(applyBranchSymmetry(fixture(),[{...group,source:'B2'}]).length,6,'unit source rejected');
  const old={...group};delete old.protect_units;
  assert.equal(applyBranchSymmetry(fixture(),[old]).filter(b=>b.symmetryGroup).length,5,'legacy saved groups retain old result');
});
