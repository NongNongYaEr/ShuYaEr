import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.min.js';import {createNativeTransformRetention} from '../web/native-transform-retention.js';
test('shared presentation motion leaves exact local snapshots and source world matrices intact',()=>{
 const scene=new THREE.Scene(),root=new THREE.Group(),parent=new THREE.Group(),mesh=new THREE.Mesh();scene.add(root);root.add(parent);parent.add(mesh);parent.position.set(2,3,4);mesh.position.set(.3,-.2,1);scene.updateMatrixWorld(true);
 const cache=createNativeTransformRetention(()=>root),first=cache.get(mesh,1),source=mesh.matrixWorld.elements.slice();assert.equal(first.root,root.uuid);assert.deepEqual(first.matrix,source);
 root.rotation.set(.2,.4,-.1);root.scale.set(1.2,.8,1.1);scene.updateMatrixWorld(true);const before=mesh.matrixWorld.elements.slice(),second=cache.get(mesh,2);assert.equal(first,second);assert.deepEqual(mesh.matrixWorld.elements,before);const composed=new THREE.Matrix4().multiplyMatrices(root.matrixWorld,new THREE.Matrix4().fromArray(second.matrix));for(let i=0;i<16;i++)assert(Math.abs(composed.elements[i]-before[i])<1e-12);
 parent.position.x+=.25;scene.updateMatrixWorld(true);const changed=cache.get(mesh,3);assert.notEqual(changed,second);assert.notEqual(changed.revision,second.revision);assert.deepEqual(first.matrix,source);
 scene.add(mesh);scene.updateMatrixWorld(true);assert.equal(cache.get(mesh,4),null);root.add(mesh);scene.updateMatrixWorld(true);assert.equal(cache.get(mesh,5).root,root.uuid);
});
test('local transform reuse catches direct zero-version matrix replacement and root changes',()=>{
 const scene=new THREE.Scene(),a=new THREE.Group(),b=new THREE.Group(),mesh=new THREE.Mesh();scene.add(a,b);a.add(mesh);mesh.matrixAutoUpdate=false;mesh.matrix.makeTranslation(1,2,3);scene.updateMatrixWorld(true);let current=a;const cache=createNativeTransformRetention(()=>current),first=cache.get(mesh,1);mesh.matrix.elements=mesh.matrix.elements.slice();mesh.matrix.elements[12]=6;scene.updateMatrixWorld(true);const next=cache.get(mesh,2);assert.notEqual(next,first);assert.equal(next.matrix[12],6);current=b;assert.equal(cache.get(mesh,3),null);b.add(mesh);scene.updateMatrixWorld(true);assert.equal(cache.get(mesh,4).root,b.uuid);
});
