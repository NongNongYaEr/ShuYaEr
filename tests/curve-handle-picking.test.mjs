import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {layoutCurveHandles,pickCurveHandle} from '../web/curve-handle-picking.js';
const camera=new THREE.PerspectiveCamera(38,1,.01,1000);
const root=new THREE.Group(),geometry=new THREE.SphereGeometry(.018);
function handle(index,x=0,z=0,category='control_point'){
 const mesh=new THREE.Mesh(geometry);mesh.position.set(x,0,z);mesh.userData={category,point_index:index};root.add(mesh);return mesh;
}
test('control dots remain CSS-pixel sized over camera distance, zoom and transformed roots',()=>{
 root.clear();root.scale.setScalar(2);const h=handle(0);
 for(const distance of [1,8,35])for(const zoom of [1,2]){
  camera.position.set(0,0,distance);camera.lookAt(0,0,0);camera.zoom=zoom;camera.updateProjectionMatrix();
  const [r]=layoutCurveHandles(root,camera,800,800);
  const projectedRadius=.018*h.scale.x*2*camera.projectionMatrix.elements[5]/distance*400;
  assert.ok(Math.abs(projectedRadius-5.5)<1e-8);
  assert.equal(pickCurveHandle([r],r.x+11,r.y)?.object,h);
  assert.equal(pickCurveHandle([r],r.x+15,r.y),null);
 }
});
test('closest visible dot wins, clipped and behind-camera handles cannot capture clicks',()=>{
 root.clear();root.scale.setScalar(1);camera.position.set(0,0,5);camera.lookAt(0,0,0);
 const a=handle(0),b=handle(1,.02),behind=handle(2,0,6);
 const records=layoutCurveHandles(root,camera,800,800,0),r=records.find(r=>r.object===b);
 assert.equal(records.length,2);assert.equal(behind.visible,false);
 assert.equal(pickCurveHandle(records,r.x,r.y).object,b);
 assert.equal(records.find(r=>r.object===a).radius,7.5);
 root.visible=false;assert.deepEqual(layoutCurveHandles(root,camera,800,800),[]);root.visible=true;
});
