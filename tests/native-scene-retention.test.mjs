import test from 'node:test';
import assert from 'node:assert/strict';
import {retainNativeDraw,createNativeSceneRetention,nativeDrawDelta,nativeSceneDelta,createRetainedNativeMaterialTable,nativeBindingDelta,encodeRetainedNativeScene} from '../web/native-scene-retention.js';

const matrix=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const draw=(id='枝')=>({id,geometry:'g',matrix:matrix(),instances:'logical-instance',instanceCount:1,start:0,count:3,line:false,castShadow:true,receiveShadow:true,radial:false,material:0});

test('retained draws own their matrix snapshot and detect every render property',()=>{
 const cache=new Map(),source=draw(),first=retainNativeDraw(cache,source);assert.equal(retainNativeDraw(cache,source),first);
 source.matrix[12]=3;assert.equal(first.matrix[12],0);const moved=retainNativeDraw(cache,source);assert.notEqual(moved,first);assert.equal(moved.matrix[12],3);
 for(const key of ['geometry','instances','instanceCount','start','count','line','castShadow','receiveShadow','radial','material','editLookup','editFrames']){
  const old=retainNativeDraw(cache,draw()),next={...draw(),[key]:typeof old[key]==='number'?old[key]+1:typeof old[key]==='boolean'?!old[key]:'new'};assert.notEqual(retainNativeDraw(cache,next),old,key);
 }
});

test('camera-linked geometry changes use exact draw replacements without rebuilding the graph',()=>{
 const retention=createNativeSceneRetention(),a=draw(),b=draw('标尺'),materials=[{color:[1,0,0,1]}],first=retention.update([a,b],materials);
 assert.equal(retention.update([a,b],structuredClone(materials)),first);
 const changed={...b,geometry:'new-height-line',matrix:matrix()};changed.matrix[12]=2;
 const second=retention.update([a,changed],materials);assert.equal(second.version,first.version);assert.notEqual(second.revision,first.revision);assert.deepEqual(nativeDrawDelta(first.fields.draws,second.fields.draws),[[1,changed]]);
 const third=retention.update([a,changed,draw('selection')],materials);assert.equal(third.version,second.version);assert.notEqual(third.revision,second.revision);
 const reordered=retention.update([changed,a,third.fields.draws[2]],materials);assert.equal(reordered.version,third.version);assert.notEqual(reordered.revision,third.revision);
 const newMaterial=retention.update(reordered.fields.draws,[{color:[0,1,0,1]}]);assert.equal(newMaterial.version,reordered.version);assert.notEqual(newMaterial.revision,reordered.revision);
 assert.equal(first.fields.draws[1].geometry,'g');assert.deepEqual(nativeDrawDelta(second.fields.draws,second.fields.draws),[]);
});

test('retained scene UTF-8 assembly preserves a full immutable snapshot and empty dynamic data',()=>{
 const state=createNativeSceneRetention().update([draw('完整单元枝 🍎')],[{map:'树皮'}]),dynamic={assetIdentity:'工程',viewProjection:matrix(),bufferBindings:{logical:'physical:2'}};
 const bytes=encodeRetainedNativeScene(state.bytes,dynamic),decoded=JSON.parse(new TextDecoder().decode(bytes));assert.deepEqual(decoded,{...state.fields,...dynamic});
 dynamic.viewProjection.fill(0);assert.equal(JSON.parse(new TextDecoder().decode(bytes)).viewProjection[0],1);
 assert.deepEqual(JSON.parse(new TextDecoder().decode(encodeRetainedNativeScene(state.bytes,{}))),state.fields);
});

test('buffer bindings transfer only changed versions while staged resources leave active aliases intact',()=>{
 const sent=new Map([['unit','v1'],['frames','f1']]),next=new Map([['unit','v2'],['frames','f1'],['lookup','l1']]);
 assert.deepEqual(nativeBindingDelta(sent,next),{unit:'v2',lookup:'l1'});assert.equal(sent.get('unit'),'v1');assert.deepEqual(nativeBindingDelta(next,next),{});
});

test('local object insertion, removal, reorder and transform deltas reconstruct the exact scene',()=>{
 const palette=[{color:[1,0,0,1]}],a=draw('a'),b=draw('b'),c=draw('c'),changed={...c,matrix:matrix()};changed.matrix[12]=4;
 const states=[{draws:[a,b,c],materials:palette},{draws:[a,draw('selection'),b,changed],materials:[...palette,{color:[1,1,0,1]}]},{draws:[a,changed],materials:[...palette,{color:[1,1,0,1]}]},{draws:[changed,a],materials:[...palette,{color:[1,1,0,1]}]},{draws:[],materials:[...palette,{color:[1,1,0,1]}]}];
 for(let i=1;i<states.length;i++){const delta=nativeSceneDelta(states[i-1],states[i]),result=structuredClone(states[i-1]);if(delta.materialAppend){assert.equal(delta.materialBaseCount,result.materials.length);result.materials.push(...delta.materialAppend);}if(delta.drawSplice)result.draws.splice(delta.drawSplice[0],delta.drawSplice[1],...delta.drawSplice[2]);for(const [index,record]of delta.drawUpdates||[])result.draws[index]=record;assert.deepEqual(result,states[i]);}
 assert.equal(states[0].draws.length,3);assert.equal(states[0].materials.length,1);
});

test('shared material indices remain stable across selection changes and mutable material properties',()=>{
 const table=createRetainedNativeMaterialTable(),a={color:'red'},b={color:'yellow'},encode=m=>({color:m.color});assert.equal(table.intern(a,encode),0);assert.equal(table.intern(b,encode),1);const saved=table.materials.slice();table.beginFrame();assert.equal(table.intern(b,encode),1);assert.equal(table.intern(a,encode),0);a.color='green';table.beginFrame();assert.equal(table.intern(a,encode),2);assert.deepEqual(saved,[{color:'red'},{color:'yellow'}]);table.reset();assert.equal(table.intern(a,encode),0);
});
