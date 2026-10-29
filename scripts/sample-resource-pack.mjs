// Lossless content-defined deduplication for public sample data.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function packSampleResources(root,files){
 const folder=path.join(root,'sample-resources');fs.mkdirSync(path.join(folder,'blocks'),{recursive:true});
 const gear=new Uint32Array(256);let seed=0x51f15e5d;for(let i=0;i<gear.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;gear[i]=seed>>>0;}
 const blocks=new Map(),records=[];
 const block=data=>{const id=sha(data);if(!blocks.has(id)){const compressed=gzipSync(data,{level:6}),packed='blocks/'+id+'.gz';fs.writeFileSync(path.join(folder,packed),compressed,{flag:'wx'});blocks.set(id,{id,bytes:data.length,packed,packedSha256:sha(compressed)});}return id;};
 for(const file of files){const bytes=fs.readFileSync(file),ids=[];let start=0,rolling=0;
  for(let i=0;i<bytes.length;i++){rolling=((rolling<<1)+gear[bytes[i]])>>>0;const length=i-start+1;if(length>=32768&&((rolling&131071)===0||length>=524288)){ids.push(block(bytes.subarray(start,i+1)));start=i+1;rolling=0;}}
  if(start<bytes.length)ids.push(block(bytes.subarray(start)));
  records.push({path:path.relative(root,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes),blocks:ids});
 }
 const manifest={version:2,files:records,blocks:[...blocks.values()]};fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
