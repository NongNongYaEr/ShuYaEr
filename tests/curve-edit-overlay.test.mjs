import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCurveGuide,addCurveHandleOutline,disposeCurveGuide} from '../web/curve-edit-overlay.js';
import {layoutCurveHandles,pickCurveHandle} from '../web/curve-handle-picking.js';
import {createBranchOutlineBatch} from '../web/branch-outline-batch.js';

test('the visible wide curve keeps its exact geometric picking target and releases every owned resource once',()=>{
  const points=[new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,0),new THREE.Vector3(1,0,0)],before=points.map(p=>p.toArray());
  const guide=createCurveGuide(points),ray=new THREE.Raycaster(new THREE.Vector3(0,0,3),new THREE.Vector3(0,0,-1));
  guide.updateMatrixWorld(true); const hits=ray.intersectObject(guide,false); assert(hits.length>0); assert(hits.every(hit=>hit.object===guide));
  assert.deepEqual(points.map(p=>p.toArray()),before);
  const resources=new Set();guide.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material);});
  const disposed=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)||0)+1));
  disposeCurveGuide(guide);assert.equal(disposed.size,resources.size);for(const count of disposed.values())assert.equal(count,1);
});

test('point rings stay aligned with the CSS-pixel handle and never create extra picking or model identities',()=>{
  const root=new THREE.Group(),camera=new THREE.PerspectiveCamera(38,1,.01,1000),geometry=new THREE.SphereGeometry(.018);
  const h=addCurveHandleOutline(new THREE.Mesh(geometry),{active:true,selected:true});h.userData={category:'control_point',point_index:1};root.add(h);
  assert.equal(h.material.transparent,true);assert.equal(h.material.depthTest,false);assert.equal(h.material.depthWrite,false);
  for(const distance of [1,8,45]){camera.position.set(0,0,distance);camera.lookAt(0,0,0);const records=layoutCurveHandles(root,camera,800,800,1);
    assert.equal(records.length,1);assert.equal(pickCurveHandle(records,400,400).object,h);
    assert.equal(records[0].radius,7.5);assert.equal(h.children.length,2);for(const layer of h.children){assert.equal(layer.geometry,geometry);const hits=[];layer.raycast({},hits);assert.deepEqual(hits,[]);assert(layer.renderOrder<h.renderOrder);assert.equal(layer.material.depthTest,false);assert.equal(layer.material.transparent,true);}
  }
});

test('selected subtree strips retain disconnected segments and reuse buffers across idle frames and camera changes',()=>{
  const material=new THREE.LineBasicMaterial({color:0x72c5de}),batch=createBranchOutlineBatch(material);
  const a=[new THREE.Vector3(),new THREE.Vector3(1,0,0)],b=[new THREE.Vector3(9,0,0),new THREE.Vector3(10,0,0)];
  try{
    batch.update([{id:'A',points:a},{id:'B',points:b}]);const strip=batch.object.children[0],mesh=strip.children[1],geometry=mesh.geometry,stream=geometry.attributes.segmentStart.data;
    assert.equal(geometry.instanceCount,2);assert.equal(geometry.attributes.segmentEnd.data,stream);
    assert.deepEqual(Array.from(stream.array.slice(0,12)),[0,0,0,1,0,0,9,0,0,10,0,0]);
    const version=stream.version;assert.equal(batch.update([{id:'A',points:a},{id:'B',points:b}]),false);assert.equal(stream.version,version);
    for(const ratio of [1,1.25,2]){mesh.onBeforeRender({getPixelRatio:()=>ratio,getRenderTarget:()=>null,getCurrentViewport:t=>t.set(0,0,800*ratio,600*ratio)});assert.deepEqual(mesh.material.uniforms.viewportSize.value.toArray(),[800,600]);assert.equal(mesh.material.uniforms.lineWidth.value,1);}
    batch.update([{id:'B',points:b}]);assert.equal(geometry.instanceCount,1);assert.equal(mesh.geometry,geometry);assert.equal(geometry.attributes.segmentStart.data,stream);
    batch.update([]);assert.equal(batch.object.visible,false);assert.equal(geometry.instanceCount,0);
  }finally{batch.dispose();material.dispose();}
});
