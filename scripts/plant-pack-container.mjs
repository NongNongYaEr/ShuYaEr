import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
export const MAGIC=Buffer.from('TDPACK1\n');
export const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export const HASH=/^[a-f0-9]{64}$/;
export const MAX_OBJECT=256*1024*1024,MAX_TOTAL=8*1024*1024*1024,MAX_FILE=4*1024*1024*1024;
export function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));try{for(let n=0;;n++){try{fs.renameSync(tmp,file);break;}catch(e){if(n>=30||!['EPERM','EACCES','EBUSY'].includes(e.code))throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
export function readJSON(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
export class ObjectWriter{
  constructor(dir,check=()=>{}){this.dir=dir;this.check=check;this.objects=new Map();this.visits=0;fs.mkdirSync(dir,{recursive:true});}
  put(bytes,kind='json') {this.check();if(bytes.length>MAX_OBJECT)throw Error('单项依赖超过 256 MB，请拆分素材');const hash=sha(bytes);if(!this.objects.has(hash)){const zipped=gzipSync(bytes,{level:6});fs.writeFileSync(path.join(this.dir,hash),zipped);this.objects.set(hash,{hash,kind,size:bytes.length,compressed:zipped.length});}return hash;}
  encode(value,root=false,depth=0){
    if(depth>160)throw Error('资源层级过深');if(++this.visits%2048===0)this.check();
    if(typeof value==='string'&&value.length>1024&&/^data:image\/(png|jpeg|webp);base64,/.test(value)){const i=value.indexOf(',')+1;return [3,this.put(Buffer.from(value.slice(i),'base64'),'image'),value.slice(0,i)];}
    if(value===null||typeof value!=='object')return value;
    // A typed graph escapes all user keys and prevents reference-marker collisions.
    const encoded=Array.isArray(value)?[0,value.map(v=>this.encode(v,false,depth+1))]:[1,Object.entries(value).map(([k,v])=>[k,this.encode(v,false,depth+1)])];
    const bytes=Buffer.from(JSON.stringify(encoded));return root||bytes.length>8192?[2,this.put(bytes)]:encoded;
  }
  async write(file,metadata,assets){
    const objects=[...this.objects.values()].sort((a,b)=>a.hash.localeCompare(b.hash));let offset=0;for(const o of objects){o.offset=offset;offset+=o.compressed;}
    const identity={metadata,assets};const manifest={...identity,digest:sha(Buffer.from(JSON.stringify(identity))),objects};const bytes=Buffer.from(JSON.stringify(manifest));if(bytes.length>32*1024*1024||offset+bytes.length>MAX_FILE)throw Error('资源包超过容量限制');
    const header=Buffer.alloc(16);MAGIC.copy(header);header.writeBigUInt64LE(BigInt(bytes.length),8);const temporary=file+'.partial';fs.mkdirSync(path.dirname(file),{recursive:true});
    try{fs.writeFileSync(temporary,Buffer.concat([header,bytes]));for(const o of objects){this.check();await pipeline(fs.createReadStream(path.join(this.dir,o.hash)),fs.createWriteStream(temporary,{flags:'a'}));}this.check();fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
    return manifest;
  }
}
export function openContainer(file){
  const fd=fs.openSync(file,'r');try{
    const size=fs.fstatSync(fd).size,header=Buffer.alloc(16);if(size<16||size>MAX_FILE||fs.readSync(fd,header,0,16,0)!==16||!header.subarray(0,8).equals(MAGIC))throw Error('不是有效的植物资源包');
    const length=Number(header.readBigUInt64LE(8));if(!Number.isSafeInteger(length)||length<2||length>32*1024*1024||length+16>size)throw Error('资源包目录损坏');const b=Buffer.alloc(length);fs.readSync(fd,b,0,length,16);const manifest=JSON.parse(b.toString('utf8'));
    if(!Array.isArray(manifest.assets)||!manifest.assets.length||manifest.assets.length>20000||!Array.isArray(manifest.objects)||manifest.objects.length>200000)throw Error('资源清单无效');
    if(sha(Buffer.from(JSON.stringify({metadata:manifest.metadata,assets:manifest.assets})))!==manifest.digest)throw Error('资源清单校验失败');
    const index=new Map();let total=0,end=0;for(const o of manifest.objects){if(!HASH.test(o.hash)||index.has(o.hash)||!['json','image'].includes(o.kind)||!Number.isSafeInteger(o.size)||o.size<0||o.size>MAX_OBJECT||!Number.isSafeInteger(o.offset)||o.offset!==end||!Number.isSafeInteger(o.compressed)||o.compressed<1)throw Error('资源对象索引无效');total+=o.size;end+=o.compressed;index.set(o.hash,o);}
    if(total>MAX_TOTAL||16+length+end!==size)throw Error('资源包容量或完整性不匹配');
    for(const a of manifest.assets)if(!a.key||!HASH.test(a.root)||!index.has(a.root)||!Array.isArray(a.dependencies))throw Error('资源引用无效');
    return {file,manifest,index,offset:16+length,size,expanded:total};
  }finally{fs.closeSync(fd);}
}
export function readObject(container,hash){const o=container.index.get(hash);if(!o)throw Error('缺少包内依赖 '+hash);const fd=fs.openSync(container.file,'r');try{const b=Buffer.alloc(o.compressed);if(fs.readSync(fd,b,0,b.length,container.offset+o.offset)!==b.length)throw Error('资源包被截断');const raw=gunzipSync(b,{maxOutputLength:MAX_OBJECT});if(raw.length!==o.size||sha(raw)!==hash)throw Error('模型或纹理校验失败');return raw;}finally{fs.closeSync(fd);}}
export function decodeGraph(root,get,check=()=>{}){
  const stack=new Set();let budget=MAX_OBJECT*3;
  function decode(v,depth=0){if(depth>160)throw Error('资源引用层级过深');if(!Array.isArray(v))return v;
    if(v[0]===2){const hash=v[1];if(!HASH.test(hash)||stack.has(hash))throw Error('资源引用存在循环');check();stack.add(hash);const b=get(hash);budget-=b.length;if(budget<0)throw Error('单个资源展开过大');const result=decode(JSON.parse(b),depth+1);stack.delete(hash);return result;}
    if(v[0]===3){if(!/^data:image\/(png|jpeg|webp);base64,$/.test(v[2]))throw Error('纹理类型无效');return v[2]+get(v[1]).toString('base64');}
    if(v[0]===0&&Array.isArray(v[1]))return v[1].map(x=>decode(x,depth+1));
    if(v[0]===1&&Array.isArray(v[1])){const o={};for(const entry of v[1]){if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string')throw Error('对象字段无效');Object.defineProperty(o,entry[0],{value:decode(entry[1],depth+1),enumerable:true,writable:true,configurable:true});}return o;}
    throw Error('资源对象编码无效');
  }return decode([2,root]);
}
export async function verifyContainer(container,check=()=>{},progress=()=>{}){let n=0;for(const hash of container.index.keys()){check();readObject(container,hash);progress(++n,container.index.size);if(n%16===0)await new Promise(r=>setImmediate(r));}for(const a of container.manifest.assets){check();decodeGraph(a.root,h=>readObject(container,h),check);}return container;}
