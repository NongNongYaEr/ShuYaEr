import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.min.js';
import {createNativeMaterialEncoder} from '../web/native-material-cache.js';
import {createRetainedNativeMaterialTable} from '../web/native-scene-retention.js';
import {nativeMaterialUnsupported} from '../web/native-viewport.js';

test('foreign PBR maps retain channel transforms, sampler modes and mutable strengths without changing legacy palettes',()=>{
 const m=new THREE.MeshStandardMaterial(),color=new THREE.Texture(),mr=new THREE.Texture(),ao=new THREE.Texture(),emission=new THREE.Texture();
 color.userData.importedTrunk=true;color.wrapS=THREE.ClampToEdgeWrapping;color.wrapT=THREE.MirroredRepeatWrapping;color.magFilter=THREE.NearestFilter;color.minFilter=THREE.NearestMipmapNearestFilter;color.flipY=false;color.offset.set(.1,.2);color.colorSpace=THREE.SRGBColorSpace;
 m.map=color;m.roughnessMap=mr;m.metalnessMap=mr;m.aoMap=ao;m.emissiveMap=emission;emission.colorSpace=THREE.SRGBColorSpace;m.aoMapIntensity=.7;
 const encoder=createNativeMaterialEncoder({textureKey:t=>t.uuid});encoder.beginFrame();const first=encoder.encode(m);assert.equal(first.uv0[3],4);assert.equal(first.uv1[3],5);assert.equal(first.uv0[2],.1);assert.equal(first.roughnessMap,first.metalnessMap);assert.equal(first.aoStrength,.7);assert.equal(first.emissiveSrgb,true);assert(nativeMaterialUnsupported(m));assert.equal(nativeMaterialUnsupported(m,{gltf_pbr_protocol:1}),null);
 m.aoMapIntensity=.2;encoder.beginFrame();const changed=encoder.encode(m);assert.notEqual(changed,first);assert.equal(changed.aoStrength,.2);assert.equal(first.aoStrength,.7);m.metalnessMap=m.aoMap=m.emissiveMap=null;encoder.beginFrame();assert(!Object.hasOwn(encoder.encode(m),'aoMap'),'removed PBR slots survived a cache hit');m.dispose();
});

test('native uniform edits without a material version change produce new independent presentation records',()=>{
 const material=new THREE.MeshStandardMaterial({color:0x336699,roughness:.7}),encoder=createNativeMaterialEncoder({textureKey:t=>t.uuid});
 encoder.beginFrame();const first=encoder.encode(material);encoder.beginFrame();assert.equal(encoder.encode(material),first);
 const version=material.version;material.color.setRGB(.1,.2,.3);material.roughness=.4;material.normalScale.set(2,-1);encoder.beginFrame();const second=encoder.encode(material);
 assert.equal(material.version,version);assert.notEqual(second,first);assert.deepEqual(second.color,[.1,.2,.3,1]);assert.equal(second.roughness,.4);assert.equal(second.normalX,2);assert.equal(second.normalY,-1);assert.equal(first.roughness,.7);
 material.opacity=.5;material.transparent=true;material.wireframe=true;material.emissive.setRGB(.2,.3,.4);material.emissiveIntensity=2;encoder.beginFrame();const third=encoder.encode(material);assert.deepEqual(third.emissive,[.4,.6,.8,1]);assert.equal(third.color[3],.5);assert.equal(third.transparent,true);assert.equal(third.wireframe,true);assert.equal(second.wireframe,false);
});
test('shared texture UVs update once per collect and all UV and source changes invalidate the right records',()=>{
 const texture=new THREE.Texture(),normal=new THREE.Texture();texture.colorSpace=THREE.SRGBColorSpace;let updates=0,keys=0;const update=texture.updateMatrix.bind(texture);texture.updateMatrix=()=>{updates++;update();};
 const encoder=createNativeMaterialEncoder({textureKey:(t,role)=>{keys++;return t.uuid+':'+t.version+':'+role;}}),a=new THREE.MeshStandardMaterial({map:texture,roughnessMap:texture,normalMap:normal}),b=a.clone();
 encoder.beginFrame();const first=encoder.encode(a);encoder.encode(b);assert.equal(updates,1);assert.equal(keys,2);assert.equal(first.srgb,true);
 encoder.beginFrame();assert.equal(encoder.encode(a),first);assert.equal(updates,2);
 texture.offset.set(.2,.3);texture.repeat.set(2,3);texture.rotation=.4;encoder.beginFrame();const moved=encoder.encode(a);assert.notEqual(moved,first);const e=texture.matrix.elements;assert.deepEqual(moved.uv0,[e[0],e[3],e[6],0]);assert.deepEqual(moved.uv1,[-e[1],-e[4],1-e[7],0]);assert.deepEqual(first.uv0,[1,0,0,0]);
 texture.flipY=false;encoder.beginFrame();assert.deepEqual(encoder.encode(a).uv1,[e[1],e[4],e[7],0]);texture.matrixAutoUpdate=false;texture.matrix.set(1,2,3,4,5,6,7,8,9);encoder.beginFrame();assert.deepEqual(encoder.encode(a).uv0,[1,2,3,0]);texture.needsUpdate=true;encoder.beginFrame();assert.notEqual(encoder.encode(a).map,moved.map);
});
test('retained palettes reuse explicitly immutable records while preserving mutable encoder compatibility and reset',()=>{
 const material=new THREE.MeshBasicMaterial(),encoder=createNativeMaterialEncoder({textureKey:()=>''}),table=createRetainedNativeMaterialTable({immutableRecords:true});
 encoder.beginFrame();assert.equal(table.intern(material,m=>encoder.encode(m)),0);table.beginFrame();encoder.beginFrame();assert.equal(table.intern(material,m=>encoder.encode(m)),0);assert.equal(table.materials.length,1);
 material.color.setRGB(.5,.2,.1);table.beginFrame();encoder.beginFrame();assert.equal(table.intern(material,m=>encoder.encode(m)),1);assert.equal(table.materials.length,2);table.reset();encoder.beginFrame();assert.equal(table.intern(material,m=>encoder.encode(m)),0);assert.equal(table.materials.length,1);
 const compatibility=createRetainedNativeMaterialTable(),source={color:[1,0,0,1]};assert.equal(compatibility.intern(material,()=>source),0);source.color=[0,1,0,1];compatibility.beginFrame();assert.equal(compatibility.intern(material,()=>source),1);
});

test('cached records match the established native material fields through uniform and texture edits',()=>{
 // The 0.2.4 transport contract, independent of the cache implementation.
 const key=(t,role='color')=>t?t.uuid+':'+t.version+':'+role:'',rgba=(c,s=1,a=1)=>[c.r*s,c.g*s,c.b*s,a];
 const rows=t=>{if(!t)return [[1,0,0,0],[0,1,0,0]];if(t.matrixAutoUpdate)t.updateMatrix();const e=t.matrix.elements,a=[e[0],e[3],e[6],0],b=[e[1],e[4],e[7],0];if(t.flipY){b[0]*=-1;b[1]*=-1;b[2]=1-b[2];}return [a,b];};
 const legacy=m=>{const [uv0,uv1]=rows(m.map),[normalUv0,normalUv1]=rows(m.normalMap),[roughUv0,roughUv1]=rows(m.roughnessMap);return {color:rgba(m.color||new THREE.Color(1,1,1),1,m.opacity),roughness:m.roughness??.9,metalness:m.metalness??0,alphaTest:m.alphaTest||0,transparent:Boolean(m.transparent),emissive:rgba(m.emissive||new THREE.Color(0,0,0),m.emissiveIntensity??1),doubleSide:m.side===THREE.DoubleSide,wireframe:Boolean(m.wireframe),unlit:m.isMeshBasicMaterial||m.isLineBasicMaterial,vertexColors:Boolean(m.vertexColors),map:key(m.map),normalMap:key(m.normalMap,'normal'),roughnessMap:key(m.roughnessMap),srgb:m.map?.colorSpace===THREE.SRGBColorSpace,normalX:m.normalScale?.x??1,normalY:m.normalScale?.y??1,uv0,uv1,normalUv0,normalUv1,roughUv0,roughUv1};};
 const encoder=createNativeMaterialEncoder({textureKey:key}),m=new THREE.MeshStandardMaterial(),a=new THREE.Texture(),b=new THREE.Texture();a.colorSpace=THREE.SRGBColorSpace;
 for(let i=0;i<200;i++){
  m.color.setRGB(i%11/11,i%7/7,i%5/5);m.emissive.setRGB(i%3/3,i%4/4,i%9/9);m.emissiveIntensity=i%4;m.roughness=i%8/8;m.metalness=i%6/6;m.opacity=i%5/5;m.alphaTest=i%3/3;m.transparent=!!(i%2);m.side=i%3;m.wireframe=!!(i%7);m.vertexColors=!!(i%5);m.normalScale.set(i%4-2,i%6-3);m.map=i%3?a:null;m.normalMap=i%4?b:null;m.roughnessMap=i%5?a:null;
  a.offset.set(i%7/7,i%3/3);a.rotation=i%13/13;a.repeat.set(1+i%3,1+i%2);a.flipY=!!(i%2);b.matrixAutoUpdate=false;b.matrix.setUvTransform(.1,.2,1+i%3,1,.2,0,0);if(i%9===0)a.needsUpdate=true;
  encoder.beginFrame();assert.deepEqual(encoder.encode(m),legacy(m),'frame '+i);
 }
});
