import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { copy, equalData } from '../web/branch-workbench-data.js';
import { editableProjectCopy } from '../web/project-library-data.js';
import { disposeBranchAsset } from '../web/branch-kernel.js';

test('snapshot copy keeps editable geometry isolated without JSON serialization of atlas payloads',()=>{
  const source={sample:{material:{color:'data:image/png;base64,'+'A'.repeat(1000000)},geometry:{positions:[1,2,3]},weights:[.4,.5,.1]}};
  const stringify=JSON.stringify;
  let cloned;
  try{JSON.stringify=()=>{throw Error('Unexpected serialization');};cloned=copy(source);}finally{JSON.stringify=stringify;}
  assert.deepEqual(cloned,source);cloned.sample.geometry.positions[0]=42;cloned.sample.weights[0]=.1;
  assert.equal(source.sample.geometry.positions[0],1);assert.equal(source.sample.weights[0],.4);
  assert.deepEqual(copy({a:undefined,b:[undefined,NaN],c:Infinity}),{b:[null,null],c:null});
});

test('history comparison avoids serializing atlas strings and detects editable changes',()=>{
 const source={history:[{authoring:{atlas:'data:image/png;base64,'+'A'.repeat(1000000),instances:[{scale:1}]}}]};
 const snapshot=copy(source),stringify=JSON.stringify;
 try{JSON.stringify=()=>{throw Error('Unexpected serialization');};assert.equal(equalData(source,snapshot),true);snapshot.history[0].authoring.instances[0].scale=5;assert.equal(equalData(source,snapshot),false);}finally{JSON.stringify=stringify;}
 assert.equal(source.history[0].authoring.instances[0].scale,1);
 assert.equal(equalData({a:undefined},{b:undefined}),false);assert.equal(equalData([],{}),false);
});

test('owned template payload avoids second clone while the default API preserves caller data',()=>{
  const input={settings:{object_name:'树'},authoring:{geometry:[1,2,3]}};
  const separate=editableProjectCopy(input,'TREE');assert.notEqual(separate,input);assert.equal(input.settings.object_name,'树');
  const owned=editableProjectCopy(input,'TREE',{consume:true});assert.equal(owned,input);assert.equal(owned.settings.object_name,'树_副本');
});

test('disposing an owned tree releases tint variants as well as its base palette',()=>{
  const base=new THREE.MeshStandardMaterial(),tint=base.clone(),geometry=new THREE.BufferGeometry();
  const disposed={base:0,tint:0,geometry:0};
  base.addEventListener('dispose',()=>disposed.base++);tint.addEventListener('dispose',()=>disposed.tint++);geometry.addEventListener('dispose',()=>disposed.geometry++);
  const group=new THREE.Group();group.add(new THREE.Mesh(geometry,tint));
  disposeBranchAsset({group,ownsMaterials:true,materials:{leaf:base}});
  assert.deepEqual(disposed,{base:1,tint:1,geometry:1});
});
