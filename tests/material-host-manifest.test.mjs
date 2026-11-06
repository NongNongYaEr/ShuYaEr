import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {exportTextures} from '../material/core/texture-export.mjs';
test('V050导出清单说明已接入新树干往返，同时保留唯一UV的用途边界',()=>{
 const root=fs.mkdtempSync(fileURLToPath(new URL('../.runtime/v050-build/manifest-probe-',import.meta.url)));
 try{const width=256,meta={width,height:width,padding:0,sourceSHA256:'a'.repeat(64),uvSHA256:'b'.repeat(64),includeModel:false,modelName:'protocol-check',settings:{}},head=Buffer.from(JSON.stringify(meta)),maps=Buffer.alloc(width*width*12,255),payload=Buffer.alloc(4+head.length+maps.length);payload.writeUInt32LE(head.length);head.copy(payload,4);maps.copy(payload,4+head.length);
  const result=exportTextures(payload,{root}),manifest=JSON.parse(fs.readFileSync(path.join(result.folder,'material_manifest.json')));
  assert.equal(manifest.hostIntegration.status,'integrated-new-trunk-result');assert.equal(manifest.hostIntegration.plantProjectVersion,4);assert.equal(manifest.hostIntegration.materialProjectVersion,25);assert.equal(manifest.hostIntegration.rawBarkRecipeCompatible,false);assert.match(fs.readFileSync(path.join(result.folder,'使用说明.txt'),'utf8'),/通过V050树干整理/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
