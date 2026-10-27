import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.min.js';
import {normalizeLeafMaterial} from '../web/leaf-material-data.js';
import {applyLeafMaterial,clearLeafTextureCache} from '../web/leaf-resources.js';

test('large immutable PNGs normalize independently and changed descriptors are revalidated',()=>{
 const color='data:image/png;base64,'+'ABCD'.repeat(300000),raw={color,normal:color,cutoff:.3,roughness:.6};
 const first=normalizeLeafMaterial(raw),second=normalizeLeafMaterial(raw);assert.notEqual(first,second);first.cutoff=.9;assert.equal(second.cutoff,.3);assert.equal(second.color,color);assert.equal(second.normal,color);
 raw.color+='!';assert.equal(normalizeLeafMaterial(raw).color,'');raw.color='data:image/jpeg;base64,AAAA';assert.equal(normalizeLeafMaterial(raw).color,'');raw.color=color;raw.cutoff=2;assert.equal(normalizeLeafMaterial(raw).cutoff,1);
});

test('hundreds of variants share exact PNG textures while color/normal roles and cache reset stay independent',async()=>{
 const original=THREE.TextureLoader.prototype.load,loads=[],disposed=[];THREE.TextureLoader.prototype.load=function(url,done){const texture=new THREE.Texture();loads.push(url);texture.addEventListener('dispose',()=>disposed.push(texture));queueMicrotask(()=>done(texture));return texture;};
 const material=new THREE.MeshStandardMaterial(),raw={color:'data:image/png;base64,'+'ABCD'.repeat(300000),normal:'data:image/png;base64,'+'ABCD'.repeat(300000),cutoff:.25,roughness:.65};
 try{clearLeafTextureCache();applyLeafMaterial(material,raw);const color=material.map,normal=material.normalMap;assert.notEqual(color,normal);for(let i=0;i<500;i++){const m=material.clone();applyLeafMaterial(m,raw);assert.equal(m.map,color);assert.equal(m.normalMap,normal);assert.equal(m.alphaTest,.25);assert.equal(m.roughness,.65);m.dispose();}assert.equal(loads.length,2);assert.equal(color.colorSpace,THREE.SRGBColorSpace);assert.equal(normal.colorSpace,THREE.NoColorSpace);clearLeafTextureCache();assert.equal(disposed.length,2);applyLeafMaterial(material,raw);assert.notEqual(material.map,color);assert.equal(loads.length,4);await Promise.resolve();}
 finally{clearLeafTextureCache();THREE.TextureLoader.prototype.load=original;material.dispose();}
});
