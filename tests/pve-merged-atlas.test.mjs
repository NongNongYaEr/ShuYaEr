import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { packAtlasRegions,atlasUv,createPveAtlas,atlasKey } from '../scripts/pve-merged-atlas.mjs';
function png(pixels) {
 const chunk=(name,data)=>{const body=Buffer.concat([Buffer.from(name),data]),out=Buffer.alloc(body.length+8);out.writeUInt32BE(data.length);body.copy(out,4);let crc=0xffffffff;for(const c of body){crc^=c;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(pixels.length,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
 return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,...pixels.flat()]))),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
test('mixed atlas packing keeps source resolution, deduplicates and maps bottom-origin UVs',()=>{
 const a=packAtlasRegions([[2048,2048],[4096,4096]]);
 assert.equal(a.width,4096);assert.equal(a.height,8192);
 assert.deepEqual(a.regions[0],{x:0,y:4112,width:2048,height:2048});
 assert.deepEqual(atlasUv(a.regions[0],a,0,0),[0,1-6160/8192]);
 assert.deepEqual(atlasUv(a.regions[0],a,1,1),[.5,1-4112/8192]);
 assert.throws(()=>packAtlasRegions([[16384,16384],[1,1]]),/超过/);
});
test('actual merged PNG preserves color/alpha/normal pixels; missing normals are neutral; single atlas unchanged',()=>{
 const root=fs.mkdtempSync(path.resolve('.runtime/pve-atlas-test-'));
 const red={color:png([[250,10,20,255],[5,220,8,0]]),normal:png([[128,100,250,255],[130,140,240,255]])};
 const blue={color:png([[20,50,240,255],[240,210,3,100]])};
 try {
  const atlas=createPveAtlas([red,red,blue],root);
  assert.equal(atlas.sources.length,2);
  const command='Add-Type -AssemblyName System.Drawing; $result=@(); foreach($name in @(\'color\',\'normal\')){$b=[Drawing.Bitmap]::new((Join-Path $args[0] (\'leaf_atlas_\'+$name+\'.png\'))); try{foreach($x in @(0,1,18,19)){$p=$b.GetPixel($x,0); $result+=,@($p.R,$p.G,$p.B,$p.A)}}finally{$b.Dispose()}}; ConvertTo-Json -InputObject $result -Compress';
  // -Command argument semantics differ from -File. Feed the path through env.
  const values=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',command.replace('$args[0]','$env:BF_ATLAS_TEST')],{env:{...process.env,BF_ATLAS_TEST:root},windowsHide:true,encoding:'utf8'}));
  assert.deepEqual(values.slice(0,4),[[250,10,20,255],[5,220,8,0],[20,50,240,255],[240,210,3,100]]);
  assert.deepEqual(values.slice(4),[[128,100,250,255],[130,140,240,255],[128,128,255,255],[128,128,255,255]]);
  const single=path.join(root,'single');fs.mkdirSync(single);assert.equal(createPveAtlas([red,red],single),null);
  assert.deepEqual(fs.readFileSync(path.join(single,'leaf_atlas_color.png')),Buffer.from(red.color.split(',')[1],'base64'));
  assert.throws(()=>atlas.uv({color:png([[1,2,3,255]])},0,0),/未登记/);
 } finally {assert.equal(path.dirname(root),path.resolve('.runtime'));fs.rmSync(root,{recursive:true,force:true});}
});

test('explicitly registered legacy untextured surfaces retain white/tint and native normal pixels without becoming a fallback for unknown textures',()=>{
 const root=fs.mkdtempSync(path.resolve('.runtime/pve-atlas-untextured-test-'));
 const textured={color:png([[210,30,40,200],[15,70,230,0]])},plain={color:'',normal:''},
  normalOnly={color:'',normal:png([[129,117,252,255],[133,145,237,255]])},before=JSON.stringify([textured,plain,normalOnly]);
 try {
  const unregistered=path.join(root,'unregistered');fs.mkdirSync(unregistered);
  assert.equal(createPveAtlas([textured,plain],unregistered),null,'unused empty global palette does not alter the established single-atlas path');
  assert.throws(()=>createPveAtlas([],unregistered),/缺少/,'an absent material is still an error without explicit resolved surface registration');
  assert.throws(()=>createPveAtlas([textured],unregistered,{untexturedMaterials:[textured]}),/不能登记/);
  const atlas=createPveAtlas([textured],root,{untexturedMaterials:[plain,normalOnly,plain]});
  assert.equal(atlas.sources.length,3);const registered=atlas.sources.filter(s=>s.untextured);assert.equal(registered.length,2);
  assert.deepEqual(registered.find(s=>s.key===atlasKey(normalOnly)).width,2,'normal-only source retains its native dimensions');
  for(const material of [plain,normalOnly]){
   const region=atlas.sources.find(s=>s.key===atlasKey(material));assert.deepEqual(atlas.uv(material,0,0),atlasUv(region,atlas,0,0));
  }
  assert.throws(()=>atlas.uv({color:png([[1,2,3,255]])},0,0),/未登记/,'an unknown textured source must never silently use the white tile');
  const points=atlas.sources.flatMap(s=>Array.from({length:s.width},(_,x)=>[s.x+x,s.y]));
  const command='Add-Type -AssemblyName System.Drawing; $points=ConvertFrom-Json $env:BF_ATLAS_POINTS; $result=@(); foreach($name in @(\'color\',\'normal\')){$b=[Drawing.Bitmap]::new((Join-Path $env:BF_ATLAS_TEST (\'leaf_atlas_\'+$name+\'.png\'))); try{foreach($xy in $points){$p=$b.GetPixel($xy[0],$xy[1]); $result+=,@($p.R,$p.G,$p.B,$p.A)}}finally{$b.Dispose()}}; ConvertTo-Json -InputObject $result -Compress';
  const pixels=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',command],{env:{...process.env,BF_ATLAS_TEST:root,BF_ATLAS_POINTS:JSON.stringify(points)},windowsHide:true,encoding:'utf8'}));
  assert.deepEqual(pixels.slice(0,5),[[210,30,40,200],[15,70,230,0],[255,255,255,255],[255,255,255,255],[255,255,255,255]]);
  assert.deepEqual(pixels.slice(5),[[128,128,255,255],[128,128,255,255],[128,128,255,255],[129,117,252,255],[133,145,237,255]]);
  assert.equal(JSON.stringify([textured,plain,normalOnly]),before,'export registration never edits source materials');
 } finally {assert.equal(path.dirname(root),path.resolve('.runtime'));fs.rmSync(root,{recursive:true,force:true});}
});
