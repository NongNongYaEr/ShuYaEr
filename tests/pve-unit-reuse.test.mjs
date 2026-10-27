import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { fitCompleteUnitTransform, matchesTransformedPveGeometry } from '../scripts/pve-unit-reuse.mjs';
import { rebuildPveUnitTangents } from '../scripts/pve-final-geometry.mjs';

const points=()=>[[0,0,0],[1,.2,0],[2,1,.4],[.3,-.7,.9]].map(p=>new T.Vector3(...p));
test('complete-unit fit accepts only a proper whole similarity, not internal edits, reflection or invalid values',()=>{
  const a=points(),m=new T.Matrix4().compose(new T.Vector3(3,7,-1),new T.Quaternion().setFromAxisAngle(new T.Vector3(1,2,3).normalize(),.87),new T.Vector3().setScalar(1.4));
  const b=a.map(p=>p.clone().applyMatrix4(m)),fit=fitCompleteUnitTransform(a,b);
  assert.ok(fit);assert.ok(Math.abs(fit.scale-1.4)<1e-10);
  for(let i=0;i<a.length;i++)assert.ok(a[i].clone().applyMatrix4(fit.matrix).distanceTo(b[i])<1e-10);
  const edit=b.map(p=>p.clone());edit[1].y+=.01;assert.equal(fitCompleteUnitTransform(a,edit),null);
  assert.equal(fitCompleteUnitTransform(a,a.map(p=>p.clone().multiply(new T.Vector3(-1,1,1)))),null);
  assert.equal(fitCompleteUnitTransform(a,a.map(p=>p.clone().multiply(new T.Vector3(1,2,1)))),null);
  edit[1].x=NaN;assert.equal(fitCompleteUnitTransform(a,edit),null);
  assert.equal(fitCompleteUnitTransform(a.slice(0,2),b.slice(0,2)),null);
});

test('reusable complete payload requires matching wood/leaf vertices, normals, UVs, wind and material',()=>{
  const group=new T.Group(),geometry=new T.BoxGeometry(1,2,3),material=new T.MeshStandardMaterial({roughness:.8});
  geometry.computeTangents();geometry.setAttribute('color',new T.Float32BufferAttribute(new Array(geometry.attributes.position.count*4).fill(.5),4));
  group.add(new T.Mesh(geometry,material));
  const matrix=new T.Matrix4().compose(new T.Vector3(1,2,3),new T.Quaternion().setFromAxisAngle(new T.Vector3(1,2,0).normalize(),.7),new T.Vector3().setScalar(1.3));
  const moved=new T.Group();moved.add(new T.Mesh(geometry.clone().applyMatrix4(matrix),material.clone()));
  const matches=()=>matchesTransformedPveGeometry(moved,new T.Matrix4(),group,matrix);
  try {
    assert.ok(matches());
    moved.children[0].geometry.attributes.tangent.array.fill(0);assert.ok(matches(),'renderer fallback tangents are derived, not model identity');
    for(const name of ['position','normal','uv','color']){
      const attr=moved.children[0].geometry.attributes[name],before=attr.getX(0);attr.setX(0,before+.1);assert.equal(matches(),false,name+' edit cannot merge');attr.setX(0,before);
    }
    moved.children[0].material.roughness=.4;assert.equal(matches(),false);moved.children[0].material.roughness=.8;
    rebuildPveUnitTangents(moved);
    const tangents=moved.children[0].geometry.attributes.tangent;
    for(let i=0;i<tangents.count;i++)assert.ok(Math.abs(new T.Vector3().fromBufferAttribute(tangents,i).length()-1)<1e-6);
    assert.ok(matches());
  } finally {for(const g of [group,moved])for(const mesh of g.children){mesh.geometry.dispose();mesh.material.dispose();}}
});
