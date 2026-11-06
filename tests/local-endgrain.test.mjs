import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {EFFECT_LIBRARY_BUILTINS,instantiateLibraryEntry,libraryEntryDependencies} from '../material/web/effect-library.js';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {validateDocument as validateServerDocument} from '../material/project-state.js';
import {makeManualDecal} from '../material/web/manual-decal-rules.js';
import {SURFACE_DECAL_STYLES} from '../material/web/surface-decal-styles.js';
import {COATING_ASSET} from '../material/web/coating-asset-config.js';
test('四种端面先点表面定位，前后端保存兼容，未放置不触发数量分析',()=>{
 const entries=EFFECT_LIBRARY_BUILTINS.filter(e=>e.manualPlacement);assert.equal(entries.length,4);assert.equal(SURFACE_DECAL_STYLES.length,65);
 for(const entry of entries){const d=createDocument({source:'a'.repeat(64),name:'端面',settings:{}});Object.assign(d.surface,{effects:[],layers:[],masks:[],areas:[]});
  const r=instantiateLibraryEntry(d,entry);d.surface=r.surface;let e=d.surface.effects[0];assert.equal(e.params.burlCount,0);assert.equal(e.params.surfaceBarkKeep,0);assert.deepEqual(libraryEntryDependencies(entry),[]);validateDocument(d);validateServerDocument(d);
  e.manualDecal=makeManualDecal(d,e,{face:8,bary:[.2,.3,.5]});e.params.burlCount=1;assert.equal(e.manualDecal.maxBendDegrees,35);e.manualDecal.rotation=75;validateDocument(d);validateServerDocument(d);
  assert.deepEqual(libraryEntryDependencies({surfaceRecipe:{surface:d.surface}}),[]);assert.equal(e.params.burlWarp,0);
 }
});
test('图集仍使用13槽和原资源预算，旧61样式逐像素保留',()=>{
 const proof=JSON.parse(fs.readFileSync(new URL('../material/web/assets/sculpt-bark/local-endgrain.json',import.meta.url),'utf8'));
 assert(proof.legacy61PixelsExact);assert.equal(proof.records.length,4);assert.equal(proof.atlasSHA256,COATING_ASSET.sha256);assert.equal(COATING_ASSET.decalCount,65);assert.equal(COATING_ASSET.width,8192);assert.equal(COATING_ASSET.height,7680);assert.equal(proof.textureSlots,13);assert(proof.rgbaMipBytesApprox<512*1024*1024);
 assert(COATING_ASSET.parts.every(p=>p.bytes<50000000));assert(proof.records.every(r=>r.alphaPixels>100000&&r.alphaPixels<220000));assert.equal(new Set(proof.records.map(r=>r.panelsSHA256[0])).size,4);
});
