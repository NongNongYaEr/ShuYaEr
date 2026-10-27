import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBranchCarrierSlide} from '../web/branch-carrier-slide.js';
import {withAxisTimes,sampleAxis} from '../web/branch-axis.js';
import {mountDistanceAt} from '../web/branch-mount-drag.js';

const v=p=>new THREE.Vector3(...p),bounds={left:170,top:85,width:1000,height:800};
function fixture(timed=true){
  const points=[[-2,0,-1],[-1.8,0,-.95],[-1.6,0,-.9],[.8,0,.7],[1.5,0,2.1]].map(v);
  if(timed)withAxisTimes(points,[0,.015,.03,.72,1]);
  const parent={id:0,stableId:'PARENT',parentId:-1,points};
  const root={id:1,stableId:'CHILD',parentId:0,parentT:.8,points:[sampleAxis(points,.8),v([2,0,3])]};
  const child={id:2,stableId:'TWIG',parentId:1,points:[v([1,0,2]),v([2,0,2])]};
  const branches=[parent,root,child];
  const camera=new THREE.PerspectiveCamera(48,bounds.width/bounds.height,.01,100);camera.position.set(3,-10,4);camera.up.set(0,0,1);camera.lookAt(0,0,.5);camera.updateMatrixWorld();
  const modelRoot=new THREE.Group();modelRoot.position.set(.15,-.2,.1);modelRoot.rotation.z=.12;modelRoot.updateMatrixWorld();
  const project=p=>{const q=modelRoot.localToWorld(p.clone()).project(camera);return{x:bounds.left+(q.x+1)*bounds.width/2,y:bounds.top+(1-q.y)*bounds.height/2};};
  const anchor=project(sampleAxis(points,root.parentT)),start={x:anchor.x+23,y:anchor.y-17};
  const at=(b,t)=>{const p=project(sampleAxis(b.points,t));return{start,pointer:{x:start.x+p.x-anchor.x,y:start.y+p.y-anchor.y}};};
  return{branches,parent,root,child,camera,modelRoot,project,anchor,start,at,setup:{camera,modelRoot,bounds}};
}

test('whole-branch G reaches every point on an adaptively sampled carrier in either direction',()=>{
  const f=fixture(),slide=createBranchCarrierSlide(f.branches,f.root,f.setup);
  for(const t of [.76,.65,.4,.15,.03,.02,.005,0,.12,.5,.9,1]){
    const result=slide(f.at(f.parent,t));assert.equal(result.parent,f.parent);
    assert.ok(Math.abs(result.attach-t)<1e-9,`target ${t}, actual ${result.attach}`);
    const p=f.project(sampleAxis(f.parent.points,result.attach)),target=f.project(sampleAxis(f.parent.points,t));
    assert.ok(Math.hypot(p.x-target.x,p.y-target.y)<1e-7);
  }
});

test('carrier transfer uses the same nonuniform times and excludes the selected subtree and installed models',()=>{
  const f=fixture(false),target={id:3,stableId:'TARGET',parentId:-1,points:withAxisTimes([[-2,0,2],[-1.8,0,2.1],[-1,0,2.5],[1,0,3]].map(v),[0,.01,.12,1])};
  const installed={...target,id:4,stableId:'INSTALLED',unitOwner:'UNIT'},symmetry={...target,id:5,stableId:'SYMMETRY',symmetryGroup:'G'};
  const slide=createBranchCarrierSlide([...f.branches,installed,symmetry,target],f.root,f.setup);
  for(const t of [.06,.3,.75,.02,.9]){const result=slide(f.at(target,t));assert.equal(result.parent,target);assert.ok(Math.abs(result.attach-t)<1e-9);}
  const returned=slide(f.at(f.parent,.3));assert.equal(returned.parent,f.parent);assert.ok(Math.abs(returned.attach-.3)<1e-9);
});

test('legacy uniform paths, initial grab offset and metre input keep their existing attachment meaning',()=>{
  for(const timed of [false,true]){
    const f=fixture(timed),slide=createBranchCarrierSlide(f.branches,f.root,f.setup);
    assert.equal(slide({start:f.start,pointer:f.start}).attach,f.root.parentT);
    for(const t of [.1,.3,.55,.9])assert.ok(Math.abs(slide(f.at(f.parent,t)).attach-t)<1e-9);
    const result=slide({...f.at(f.parent,.5),numeric:'-.35'});
    assert.equal(result.parent,f.parent);assert.ok(Math.abs(mountDistanceAt(f.parent.points,result.attach)-mountDistanceAt(f.parent.points,f.root.parentT)+.35)<1e-9);
    assert.equal(slide({...f.at(f.parent,.5),numeric:'-100'}).attach,0);
    assert.equal(slide({...f.at(f.parent,.5),numeric:'100'}).attach,1);
  }
});
