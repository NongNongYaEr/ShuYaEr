import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.min.js';
import {packNativePacket,nativeRetryResources,nativeGeometry,nativeLineIndices,nativeDrawRanges,createNativeViewport,nativeMaterialUnsupported,nativeAttributeVersion,planNativeResourceBatch,createNativeMaterialTable} from '../web/native-viewport.js';

test('native packets align typed sections, preserve original buffers and validate offsets after UTF-8 headers grow',()=>{
  const vertices=new Float32Array([1.25,-2,3,4]),indices=new Uint32Array([3,2,1]),a={},b={};
  const metadata={version:1,resources:[{id:'树干截面'.repeat(60),vertices:a,indices:b}]};
  const packet=packNativePacket(metadata,[{spec:a,bytes:vertices},{spec:b,bytes:indices}]);const length=new DataView(packet.buffer).getUint32(0,true),decoded=JSON.parse(new TextDecoder().decode(packet.subarray(4,4+length)));
  assert.equal(a.offset%4,0);assert.equal(b.offset%4,0);assert.deepEqual(decoded.resources[0].vertices,a);
  assert.deepEqual([...new Float32Array(packet.buffer,a.offset,a.bytes/4)],[...vertices]);assert.deepEqual([...new Uint32Array(packet.buffer,b.offset,b.bytes/4)],[...indices]);assert.equal(vertices.buffer.byteLength,16);assert.equal(indices.buffer.byteLength,12);
});
test('native vertex transport reads interleaved and normalized source attributes without changing the whole source geometry',()=>{
  const geometry=new THREE.BufferGeometry(),positions=new THREE.InterleavedBuffer(new Float32Array([1,2,3,99,4,5,6,98]),4);geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(positions,3,0));geometry.setAttribute('color',new THREE.Uint8BufferAttribute([255,0,128,0,255,64],3,true));geometry.setIndex([1,0,1]);const before=positions.array.slice(),result=nativeGeometry(geometry);
  assert.equal(result.vertices.length,36);assert.deepEqual([...result.vertices.slice(0,3)],[1,2,3]);assert.deepEqual([...result.vertices.slice(18,21)],[4,5,6]);assert(Math.abs(result.vertices[10]-128/255)<1e-7);assert.deepEqual([...result.indices],[1,0,1]);assert.deepEqual(positions.array,before);
});
test('native interleaved resource versions include layout changes even when storage identity remains stable',()=>{
 const storage=new THREE.InterleavedBuffer(new Float32Array([1,2,3,99,4,5,6,98]),4),attribute=new THREE.InterleavedBufferAttribute(storage,3,0),before=nativeAttributeVersion(attribute);storage.stride=5;assert.notEqual(nativeAttributeVersion(attribute),before);assert.equal(nativeAttributeVersion(attribute),nativeAttributeVersion(attribute));
});
test('native vertex transport preserves zero normal/tangent components and defaults only missing attributes',()=>{
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute([1,0,0],3));geometry.setAttribute('sampleTangent',new THREE.Float32BufferAttribute([0,1,0],3));const actual=nativeGeometry(geometry).vertices;assert.deepEqual([...actual.slice(3,6)],[1,0,0]);assert.deepEqual([...actual.slice(15,18)],[0,1,0]);geometry.deleteAttribute('normal');geometry.deleteAttribute('sampleTangent');const fallback=nativeGeometry(geometry).vertices;assert.deepEqual([...fallback.slice(3,6)],[0,0,1]);assert.deepEqual([...fallback.slice(15,18)],[0,0,1]);geometry.dispose();
});
test('ordinary browsers keep the existing WebGL renderer and never require a native host',()=>{
  globalThis.window={};let rendered=0;const view=createNativeViewport({scene:{},camera:{},canvas:{},renderer:{render(){rendered++;}}});view.render();assert.equal(rendered,1);assert.deepEqual(view.stats,{available:false});delete globalThis.window;
});
test('unsupported physical material features and UV channels request compatibility instead of dropping source properties',()=>{
 const material=new THREE.MeshStandardMaterial({map:new THREE.Texture()});assert.equal(nativeMaterialUnsupported(material),null);material.map.channel=1;assert.equal(nativeMaterialUnsupported(material),'额外 UV 通道');material.map.channel=0;material.displacementMap=new THREE.Texture();assert.equal(nativeMaterialUnsupported(material),'扩展材质贴图');material.displacementMap=null;material.clearcoat=.2;assert.equal(nativeMaterialUnsupported(material),'扩展物理材质');material.dispose();
});
test('a resource that changes every input frame is submitted together with that frame camera',()=>{
 for(let frame=0;frame<120;frame++){const spec={},bytes=new Float32Array([frame,2,3]),item={resource:{id:'height:'+frame,type:'geometry',vertices:spec},parts:[{spec,bytes}]},scene={viewProjection:[frame],draws:[{geometry:item.resource.id}]};const batch=planNativeResourceBatch([item],4096,scene);assert.equal(batch.complete,true);const packet=packNativePacket({version:1,resources:batch.selected.map(r=>r.resource),scene},batch.parts),length=new DataView(packet.buffer).getUint32(0,true),actual=JSON.parse(new TextDecoder().decode(packet.subarray(4,4+length)));assert.deepEqual(actual.scene.viewProjection,[frame]);assert.equal(actual.resources[0].id,actual.scene.draws[0].geometry);assert.deepEqual([...new Float32Array(packet.buffer,spec.offset,3)],[frame,2,3]);}
});
test('large uploads preserve a complete resource and defer the scene without exceeding the packet bound',()=>{
 const item=n=>{const spec={},bytes=new Uint8Array(n);return {resource:{id:'large',type:'buffer',data:spec},parts:[{spec,bytes}]};};const scene={description:'x'.repeat(2500)},batch=planNativeResourceBatch([item(1024)],4096,scene);assert.equal(batch.complete,false);assert.equal(batch.selected.length,1);assert(packNativePacket({version:1,resources:batch.selected.map(r=>r.resource)},batch.parts).byteLength<=4096);assert.throws(()=>planNativeResourceBatch([item(5000)],4096,{}),/容量/);
});
test('replacing a zero-version attribute or instance array invalidates the native resource identity',()=>{
 const first=new THREE.Float32BufferAttribute([0,0,0],3),second=new THREE.Float32BufferAttribute([1,0,0],3);assert.equal(first.version,second.version);assert.notEqual(nativeAttributeVersion(first),nativeAttributeVersion(second));const old=nativeAttributeVersion(first);first.array=new Float32Array([4,0,0]);assert.notEqual(nativeAttributeVersion(first),old);assert.equal(nativeAttributeVersion(first),nativeAttributeVersion(first));
});
test('a packed retry remains unchanged after live camera and source arrays move on',()=>{
 const scene={matrix:[1,0,0,0]},spec={},data=new Float32Array([2,3,4]),packet=packNativePacket({version:1,scene,resources:[{data:spec}]},[{spec,bytes:data}]),copy=packet.slice();scene.matrix[0]=42;data.fill(99);assert.deepEqual(packet,copy);
});
test('backpressure reuses immutable resource sections while encoding the latest coherent scene and new offsets',()=>{
 const vertices=new Float32Array([1,2,3,4]),indices=new Uint32Array([0,1,0]),instances=new Float32Array([5,6,7]),pixels=new Uint8Array([1,2,3,4]);
 const resources=[{id:'geometry',type:'geometry',vertices:{},indices:{}},{id:'instances',type:'buffer',data:{},stride:4},{id:'color',type:'texture',width:1,height:1,data:{}}],parts=[{spec:resources[0].vertices,bytes:vertices},{spec:resources[0].indices,bytes:indices},{spec:resources[1].data,bytes:instances},{spec:resources[2].data,bytes:pixels}],metadata={version:1,resources,scenePatch:{camera:[1,2,3],drawUpdates:[[2,{id:'whole-unit'}]]}};
 const packet=packNativePacket(metadata,parts),before=packet.slice(),originalMetadata=structuredClone(metadata);vertices.fill(99);indices.fill(99);instances.fill(99);pixels.fill(99);
 const recovered=nativeRetryResources(metadata,packet),next=packNativePacket({version:1,resources:recovered.map(item=>item.resource),scenePatch:{camera:[100,200,300],drawUpdates:metadata.scenePatch.drawUpdates,note:'latest input'.repeat(50)}},recovered.flatMap(item=>item.parts));
 assert.deepEqual(packet,before);assert.deepEqual(metadata,originalMetadata);assert.notEqual(recovered[0].resource.vertices,resources[0].vertices);assert.deepEqual([...new Float32Array(next.buffer,recovered[0].resource.vertices.offset,4)],[1,2,3,4]);assert.deepEqual([...new Uint32Array(next.buffer,recovered[0].resource.indices.offset,3)],[0,1,0]);assert.deepEqual([...new Float32Array(next.buffer,recovered[1].resource.data.offset,3)],[5,6,7]);assert.deepEqual([...next.slice(recovered[2].resource.data.offset,recovered[2].resource.data.offset+4)],[1,2,3,4]);
});
test('preencoded native scenes preserve UTF-8 metadata, typed offsets and immutable retries without reserializing the scene',()=>{
 const scene={assetIdentity:'树鸭儿',draws:Array.from({length:300},(_,i)=>({id:'枝'+i,matrix:[i,.25,-3],material:{color:[.2,.4,.6,1]}}))},snapshot=structuredClone(scene),encoded=new TextEncoder().encode(JSON.stringify(scene));
 scene.toJSON=()=>{throw Error('Scene must use its already encoded snapshot');};
 const a={},b={},x=new Float32Array([1,2,3]),y=new Uint16Array([2,1,0]);
 const pending=[{resource:{id:'新缓冲',a,b},parts:[{spec:a,bytes:x},{spec:b,bytes:y}]}],batch=planNativeResourceBatch(pending,1000000,scene,encoded);
 assert.equal(batch.complete,true);const packet=packNativePacket({version:1,scene,resources:batch.selected.map(i=>i.resource)},batch.parts,encoded),length=new DataView(packet.buffer).getUint32(0,true),header=JSON.parse(new TextDecoder().decode(packet.subarray(4,4+length)));
 assert.deepEqual(header.scene,snapshot);assert.equal(a.offset%4,0);assert.equal(b.offset%4,0);assert.deepEqual([...new Float32Array(packet.buffer,a.offset,3)],[1,2,3]);assert.deepEqual([...new Uint16Array(packet.buffer,b.offset,3)],[2,1,0]);
 const copy=packet.slice();encoded.fill(0);x.fill(8);assert.deepEqual(packet,copy);
});

test('native line strips and loops honor the saved geometry draw range without editing source indices',()=>{
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,2,1,0,3,1,0],3));g.setIndex([3,1,2,0]);g.setDrawRange(1,3);const before=g.index.array.slice();assert.deepEqual([...nativeLineIndices(g)],[1,2,2,0]);assert.deepEqual([...nativeLineIndices(g,true)],[1,2,2,0,0,1]);assert.deepEqual(g.index.array,before);g.setDrawRange(3,1);assert.deepEqual([...nativeLineIndices(g,true)],[]);g.setIndex(null);g.setDrawRange(0,4);assert.deepEqual([...nativeLineIndices(g)],[0,1,1,2,2,3]);
});

test('a native scene sends shared materials once while retaining distinct source properties',()=>{
 const table=createNativeMaterialTable(),a={},b={},c={};let encoded=0;const encode=o=>{encoded++;return {color:o===c?[0,1,0,1]:[1,0,0,1],map:'source-texture'};};
 assert.equal(table.intern(a,encode),0);assert.equal(table.intern(a,encode),0);assert.equal(table.intern(b,encode),0);assert.equal(table.intern(c,encode),1);assert.equal(encoded,3);assert.equal(table.materials.length,2);
 const draws=Array.from({length:10000},(_,i)=>({id:'draw-'+i,material:i%2})),scene={draws,materials:table.materials},packet=packNativePacket({version:1,scene});const length=new DataView(packet.buffer).getUint32(0,true),decoded=JSON.parse(new TextDecoder().decode(packet.subarray(4,4+length)));assert.deepEqual(decoded.scene.materials,table.materials);assert.equal(decoded.scene.draws.length,10000);
});

test('normal empty editing states have no native draws and leave source buffers and instance counts untouched',()=>{
 const material=new THREE.MeshBasicMaterial(),empty=new THREE.BufferGeometry();empty.setAttribute('position',new THREE.Float32BufferAttribute([],3));
 const indexed=new THREE.BoxGeometry();indexed.setIndex([]);const line=new THREE.BufferGeometry();line.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));
 const zero=new THREE.InstancedMesh(new THREE.BoxGeometry(),material,1);zero.count=0;
 const range=new THREE.Mesh(new THREE.BoxGeometry(),material);range.geometry.setDrawRange(0,0);
 const grouped=new THREE.Mesh(new THREE.BoxGeometry(),[material]);grouped.geometry.clearGroups();grouped.geometry.addGroup(0,0,0);
 for(const object of [new THREE.Mesh(empty,material),new THREE.Mesh(indexed,material),new THREE.Line(line,material),new THREE.LineLoop(line,material),zero,range,grouped])assert.deepEqual(nativeDrawRanges(object),[]);
 assert.equal(empty.attributes.position.count,0);assert.equal(indexed.index.count,0);assert.equal(line.attributes.position.count,1);assert.equal(zero.count,0);
 zero.count=1;assert(nativeDrawRanges(zero).length>0);zero.count=0;assert.deepEqual(nativeDrawRanges(zero),[]);
});
test('native eligibility keeps visible material ranges and line-strip topology as editable source data changes',()=>{
 const shown=new THREE.MeshBasicMaterial(),hidden=new THREE.MeshBasicMaterial();hidden.visible=false;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));geometry.setIndex([0,1,2,0,2,3]);geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);geometry.setDrawRange(1,5);
 const mesh=new THREE.Mesh(geometry,[hidden,shown]);assert.deepEqual(nativeDrawRanges(mesh),[{groupStart:3,material:shown,start:3,count:3}]);hidden.visible=true;assert.equal(nativeDrawRanges(mesh).length,2);
 geometry.clearGroups();geometry.setDrawRange(1,3);const line=new THREE.Line(geometry,shown);assert.equal(nativeDrawRanges(line)[0].count,nativeLineIndices(geometry).length);const loop=new THREE.LineLoop(geometry,shown);assert.equal(nativeDrawRanges(loop)[0].count,nativeLineIndices(geometry,true).length);geometry.setDrawRange(3,1);assert.deepEqual(nativeDrawRanges(loop),[]);
});
test('a covering resource workspace suspends drawing and resumes the same browser scene',()=>{
 globalThis.window={};let rendered=0,suspended=false;const scene={},camera={},seen=[];
 const view=createNativeViewport({scene,camera,canvas:{},isSuspended:()=>suspended,renderer:{render(s,c){rendered++;seen.push([s,c]);}}});
 view.render();suspended=true;view.render();view.render();assert.equal(rendered,1);suspended=false;view.render();assert.equal(rendered,2);assert.deepEqual(seen,[[scene,camera],[scene,camera]]);delete globalThis.window;
});
import {nativeRuntimeCompatibility} from '../web/native-viewport.js';
test('native runtime compatibility rejects a stale renderer before scene submission',()=>{assert.match(nativeRuntimeCompatibility({ready:true,frames:0}),/运行库.*不匹配/);assert.match(nativeRuntimeCompatibility({material_table_protocol:1}),/运行库.*不匹配/);assert.equal(nativeRuntimeCompatibility({material_table_protocol:1,retained_scene_protocol:1,ready:false}),null);assert.equal(nativeRuntimeCompatibility({material_table_protocol:1,retained_scene_protocol:1,ready:true}),null);});
