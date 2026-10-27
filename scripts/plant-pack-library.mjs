import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {atomic,readJSON,sha,HASH,openContainer,readObject,decodeGraph,verifyContainer,ObjectWriter} from './plant-pack-container.mjs';
import {PACK_TYPES,PACK_MIN_VERSION,validatePackMetadata,validateAsset} from '../web/plant-pack-data.js';
import {packageOrigins} from '../web/asset-origins.js';
const readOr=(file,fallback)=>fs.existsSync(file)?readJSON(file):fallback;
export function packagePaths(root){return {root,index:path.join(root,'index.json'),objects:path.join(root,'objects'),lock:path.join(root,'write.lock')};}
export function readIndex(root){return readOr(packagePaths(root).index,{format:1,packages:[],preferences:{}});}
export function alias(a){return 'PACK_'+sha(Buffer.from([a.type,a.id,a.revision,a.root].join('|')));}
export function packageKey(m){return m.id+'@'+m.version;}
export function catalog(root){const index=readIndex(root),assets=new Map();for(const p of index.packages)for(const a of p.assets){const id=alias(a),item=assets.get(id)||{...a,id,originalId:a.id,packages:[],familyId:'PACK_FAMILY_'+sha(Buffer.from(a.type+':'+a.id)),local:true,packageAsset:true,count:a.count||0};item.packages.push({key:p.key,id:p.metadata.id,name:p.metadata.name,version:p.metadata.version,primary:!!a.primary,archived:!!index.preferences[p.key]?.archived});if(!item.thumbnail&&a.thumbnail)item.thumbnail=a.thumbnail;if(a.primary)item.primary=true;assets.set(id,item);}return {success:true,packages:index.packages.map(({assets,...p})=>({...p,assets:assets.map(a=>({...a,alias:alias(a)})),preference:index.preferences[p.key]||{}})),assets:[...assets.values()]};}
function newer(v,current){const a=v.split('-')[0].split('.').map(Number),b=current.split('-')[0].split('.').map(Number);for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return false;}
export async function inspect(file,root,{check=()=>{},progress=()=>{}}={}){
  const c=openContainer(file),m=validatePackMetadata(c.manifest.metadata);
  if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(c.manifest.metadata.minimumVersion||'')||c.manifest.metadata.format!==1||newer(c.manifest.metadata.minimumVersion||'999.0.0',PACK_MIN_VERSION))throw Error('资源包由更新的软件制作，请升级树鸭儿后导入');
  const keys=new Set(),identities=new Map();for(const a of c.manifest.assets){if(keys.has(a.key)||typeof a.key!=='string'||a.key.length>500||!PACK_TYPES[a.type]||typeof a.id!=='string'||!a.id||a.id.length>160||typeof a.name!=='string'||!a.name||a.name.length>160||!Number.isInteger(a.revision)||a.revision<1||typeof a.primary!=='boolean')throw Error('资源身份或版本无效');if(a.thumbnail&&(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.thumbnail)||a.thumbnail.length>12000000))throw Error('资源缩略图无效');if(a.type==='prefab'&&(!a.counts||!Number.isInteger(a.counts.carriers)||!Number.isInteger(a.counts.units)||a.counts.carriers<1||a.counts.units<0))throw Error('预制成员清单无效');const identity=a.type+':'+a.id+':'+a.revision;if(identities.has(identity)&&identities.get(identity)!==a.root)throw Error('包内同一资源版本包含不同内容，请重新导出');identities.set(identity,a.root);keys.add(a.key);}for(const a of c.manifest.assets)for(const d of a.dependencies)if(!keys.has(d))throw Error('资源包缺少必需成员');
  for(const a of c.manifest.assets){if(a.tags!=null&&(!Array.isArray(a.tags)||a.tags.length>1000||a.tags.some(x=>typeof x!=='string'||x.length>160)))throw Error('素材标签无效');for(const key of ['branches','leafCount','organCount'])if(a[key]!=null&&(!Number.isInteger(a[key])||a[key]<0||a[key]>10000000))throw Error('素材数量清单无效');}
  const visited=new Set(),visiting=new Set(),members=new Map(c.manifest.assets.map(a=>[a.key,a]));function visit(key,depth=0){if(depth>160||visiting.has(key))throw Error('资源依赖存在循环或层级过深');if(visited.has(key))return;visiting.add(key);for(const k of members.get(key).dependencies)visit(k,depth+1);visiting.delete(key);visited.add(key);}for(const key of keys)visit(key);
  await verifyContainer(c,check,progress);
  for(const a of c.manifest.assets)validateAsset(a.type,decodeGraph(a.root,h=>readObject(c,h),check));
  const index=readIndex(root),previous=index.packages.find(p=>p.key===packageKey(m)),conflicts=[];for(const a of c.manifest.assets){const same=index.packages.flatMap(p=>p.assets).find(b=>b.type===a.type&&b.id===a.id&&b.revision===a.revision&&b.root!==a.root);if(same)conflicts.push({name:a.name,type:a.type,id:a.id,revision:a.revision});}
  const exact=!!previous&&previous.digest===c.manifest.digest;
  const available=(()=>{try{const s=fs.statfsSync(path.dirname(root));return Number(s.bavail)*Number(s.bsize);}catch{return null;}})();
  return {metadata:m,digest:c.manifest.digest,assets:c.manifest.assets,bytes:c.size,expanded:c.expanded,objectCount:c.index.size,alreadyInstalled:exact,conflict:!!previous&&!exact||conflicts.length>0,conflicts,available,required:exact?0:c.expanded+c.size,compatible:true};
}
async function lock(root,check){const p=packagePaths(root);fs.mkdirSync(root,{recursive:true});for(let n=0;n<100;n++){check();try{const fd=fs.openSync(p.lock,'wx');fs.writeSync(fd,String(process.pid));return ()=>{fs.closeSync(fd);fs.unlinkSync(p.lock);};}catch(e){if(e.code!=='EEXIST')throw e;try{const pid=+fs.readFileSync(p.lock,'utf8');try{process.kill(pid,0);}catch{fs.unlinkSync(p.lock);continue;}}catch{}await new Promise(r=>setTimeout(r,100));}}throw Error('内容库正由另一项任务更新，请稍后重试');}
export async function install(file,root,{check=()=>{},progress=()=>{},copyConflict=false}={}){
  const preview=await inspect(file,root,{check,progress});if(preview.available!==null&&preview.required>preview.available)throw Error('磁盘剩余空间不足');const unlock=await lock(root,check);
  try{
    const index=readIndex(root),c=openContainer(file);let metadata=c.manifest.metadata,key=packageKey(metadata),digest=c.manifest.digest,localAssets=c.manifest.assets;
    if(index.packages.some(p=>p.key===key&&p.digest===digest))return {reused:true,key};
    const conflicts=index.packages.some(p=>p.key===key)||c.manifest.assets.some(a=>index.packages.some(p=>p.assets.some(b=>b.type===a.type&&b.id===a.id&&b.revision===a.revision&&b.root!==a.root)));
    if(conflicts&&!copyConflict)throw Error('同一身份与版本的内容不同，请选择作为独立副本安装');
    if(conflicts){metadata={...metadata,id:'pack-'+crypto.randomUUID(),name:metadata.name+' · 副本',derivedFrom:[...(metadata.derivedFrom||[]),{id:metadata.id,name:metadata.name,version:metadata.version,digest,author:metadata.author,license:metadata.license}]};key=packageKey(metadata);localAssets=c.manifest.assets.map(a=>({...a,sourceId:a.id,id:metadata.id+'.'+sha(Buffer.from(a.type+':'+a.id)).slice(0,24)}));digest=sha(Buffer.from(JSON.stringify({metadata,assets:localAssets})));}
    const p=packagePaths(root);fs.mkdirSync(p.objects,{recursive:true});let n=0;
    // Objects become visible only through the final atomic registry commit.
    // Unreferenced immutable objects from an interrupted job are harmless and
    // are kept; no cleanup can accidentally remove another project's models.
    for(const [hash,o]of c.index){check();const dest=path.join(p.objects,hash+'.gz');if(!fs.existsSync(dest)){const raw=readObject(c,hash);const {gzipSync}=await import('node:zlib');atomic(dest,gzipSync(raw));}else{readStoredObject(root,hash);}progress(++n,c.index.size);if(n%12===0)await new Promise(r=>setImmediate(r));}
    check();const record={key,metadata,digest,assets:localAssets,objects:c.manifest.objects.map(o=>({hash:o.hash,kind:o.kind,size:o.size})),installedAt:Date.now(),sourceDigest:preview.digest};
    index.packages.push(record);atomic(p.index,index);atomic(path.join(root,'catalog.json'),catalog(root));return {key,reused:false,copied:conflicts};
  }finally{unlock();}
}
export function readStoredObject(root,hash){if(!HASH.test(hash))throw Error('资源对象标识无效');return readStored(root,hash);}
import {gunzipSync} from 'node:zlib';
function readStored(root,hash){const file=path.join(packagePaths(root).objects,hash+'.gz');if(!fs.existsSync(file))throw Error('本机资源依赖缺失，请重新导入原包');const b=gunzipSync(fs.readFileSync(file),{maxOutputLength:256*1024*1024});if(sha(b)!==hash)throw Error('本机资源校验失败，请重新导入原包');return b;}
export function resolveAsset(root,id){const packages=readIndex(root).packages.filter(p=>p.assets.some(a=>alias(a)===id)),a=packages[0]?.assets.find(a=>alias(a)===id);if(!a)throw Error('资源已移除，请重新导入');const raw=decodeGraph(a.root,h=>readStoredObject(root,h));validateAsset(a.type,raw);return {asset:a,payload:raw,origins:packageOrigins(packages.flatMap(p=>[{...p.metadata,digest:p.digest},...(p.metadata.derivedFrom||[])]))};}
export async function updateLibrary(root,action,key,patch={},check=()=>{}){const unlock=await lock(root,check);try{const index=readIndex(root),item=index.packages.find(p=>p.key===key);if(!item)throw Error('资源包已不存在');if(action==='remove'){index.packages=index.packages.filter(p=>p.key!==key);delete index.preferences[key];}else{const previous=index.preferences[key]||{};index.preferences[key]={...previous,...(patch.name===undefined?{}:{name:String(patch.name||'').slice(0,100)}),...(patch.favorite===undefined?{}:{favorite:!!patch.favorite}),...(patch.archived===undefined?{}:{archived:!!patch.archived})};}atomic(packagePaths(root).index,index);atomic(path.join(root,'catalog.json'),catalog(root));}finally{unlock();}return {success:true};}
export async function reexport(root,key,file,{check=()=>{},progress=()=>{}}={}){const p=readIndex(root).packages.find(p=>p.key===key);if(!p)throw Error('资源包已移除');const writer=new ObjectWriter(file+'.objects',check);let n=0;for(const o of p.objects){writer.put(readStoredObject(root,o.hash),o.kind);progress(++n,p.objects.length);}return writer.write(file,p.metadata,p.assets);}
