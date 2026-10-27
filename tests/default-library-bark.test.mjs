import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DEFAULT_BARK_PRESET,ensureDefaultTreeBark,normalizeBarkMaterial,generateBarkTextureMaps,createBarkSurfaceMaterial} from '../web/bark-materials.js';
import {libraryBarkProvenance} from '../web/library-bark.js';
import {normalizeTrunkPreset} from '../web/trunk-preset-store.js';

const hash=data=>createHash('sha256').update(data).digest('hex');
test('default bark is the versioned library image with exact prepared PBR pixels and matching periodic edges',()=>{
 assert.equal(hash(fs.readFileSync(libraryBarkProvenance.source)),libraryBarkProvenance.source_sha256);
 const recipe=normalizeBarkMaterial(DEFAULT_BARK_PRESET),maps=generateBarkTextureMaps(recipe,512);assert.equal(recipe.style,'LIBRARY_CELTIS_V1');assert.equal(recipe.color,'#ffffff');
 for(const [slot,map]of Object.entries(maps)){assert.equal(hash(map.data),libraryBarkProvenance.rgba_sha256[slot]);assert.equal(map.width,512);for(let i=0;i<512;i++)for(let c=0;c<4;c++){assert.equal(map.data[(i*512)*4+c],map.data[(i*512+511)*4+c],slot+' horizontal seam');assert.equal(map.data[i*4+c],map.data[((511*512)+i)*4+c],slot+' vertical seam');}}
 maps.color.data[0]^=255;assert.equal(hash(generateBarkTextureMaps(recipe,512).color.data),libraryBarkProvenance.rgba_sha256.color);
});

test('default assignment preserves explicit bark, opt-outs and complete source models, and saves a small portable recipe',()=>{
 const a={workbench:{bark_materials:{version:1,branches:{KEEP:normalizeBarkMaterial({color:'#773322'}),LEGACY:null}}},branch_library:[{id:'SOURCE',sample:{authoring:{}}}],branch_instances:[{id:'UNIT',asset_id:'SOURCE'}]},old=JSON.stringify([a.branch_library,a.branch_instances]),branches=structuredClone(a.workbench.bark_materials.branches);
 assert.equal(ensureDefaultTreeBark(a),true);assert.deepEqual(a.workbench.bark_materials.branches,branches);assert.equal(ensureDefaultTreeBark(a),false);assert.equal(JSON.stringify([a.branch_library,a.branch_instances]),old);assert.ok(JSON.stringify(a.workbench.bark_materials).length<1000);assert.ok(!JSON.stringify(a).includes('Z:'));
 const custom={workbench:{bark_materials:{version:1,default:normalizeBarkMaterial({style:'OLD',color:'#553322'}),branches:{}}}},before=JSON.stringify(custom);assert.equal(ensureDefaultTreeBark(custom),false);assert.equal(JSON.stringify(custom),before);
 const preset=normalizeTrunkPreset('bark',{id:'trunk-preset-0123456789abcdef0123456789abcdef',name:'素材库树皮',shape:a.workbench.bark_materials.default});assert.equal(preset.shape.style,'LIBRARY_CELTIS_V1');assert.deepEqual(normalizeBarkMaterial(JSON.parse(JSON.stringify(preset.shape))),a.workbench.bark_materials.default);
});

test('default bark shares immutable texture sources between carrier radii without sharing repeat transforms',()=>{
 const a=createBarkSurfaceMaterial(DEFAULT_BARK_PRESET,{branch:{startRadius:.2},continuousBark:true}),b=createBarkSurfaceMaterial(DEFAULT_BARK_PRESET,{branch:{startRadius:1.2},continuousBark:true});
 try{for(const slot of ['map','normalMap','roughnessMap']){assert.notEqual(a[slot],b[slot]);assert.equal(a[slot].source,b[slot].source);assert.equal(a[slot].image.width,512);}assert.notEqual(a.map.repeat.x,b.map.repeat.x);const repeat=b.map.repeat.x;a.map.repeat.x=999;assert.equal(b.map.repeat.x,repeat);assert.equal(a.color.getHexString(),'ffffff');}
 finally{for(const m of [a,b]){for(const slot of ['map','normalMap','roughnessMap'])m[slot].dispose();m.dispose();}}
});
