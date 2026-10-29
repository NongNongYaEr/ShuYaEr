import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {gunzipSync} from 'node:zlib';
import {ObjectWriter,atomic,readJSON,decodeGraph,sha,HASH,MAX_OBJECT} from './plant-pack-container.mjs';
import {validateImportedTrunk,validateTrunkGuides,trunkCalibrationMatrix,trunkDimensions} from '../web/imported-trunk-data.js';
export const TRUNK_ID=/^TRUNK_[A-Za-z0-9_]{1,90}$/;
function validate(model){
 validateImportedTrunk(model);validateTrunkGuides(model.guides);trunkCalibrationMatrix(model.calibration);
 if(!TRUNK_ID.test(model.id)||typeof model.name!=='string'||!model.name.trim()||model.name.length>80)throw Error('树干素材名称或身份无效');
 const source=model.source;if(!source||!HASH.test(source.sha256)||typeof source.glb_base64!=='string'||source.glb_base64.length>358000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(source.glb_base64))throw Error('树干缺少内嵌的原始 GLB');
 const bytes=Buffer.from(source.glb_base64,'base64');if(bytes.length!==source.bytes||bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||sha(bytes)!==source.sha256)throw Error('树干原始 GLB 校验失败');return model;
}
const indexFile=root=>path.join(root,'catalog.json');
export function trunkCatalog(root){return fs.existsSync(indexFile(root))?readJSON(indexFile(root)):{version:1,items:[]};}
function object(root,hash){if(!HASH.test(hash))throw Error('树干资源引用无效');const bytes=gunzipSync(fs.readFileSync(path.join(root,'objects',hash)),{maxOutputLength:MAX_OBJECT});if(sha(bytes)!==hash)throw Error('树干资源内容损坏');return bytes;}
export function readTrunkModel(root,id,revision=null){
 if(!TRUNK_ID.test(id))throw Error('树干素材身份无效');const record=trunkCatalog(root).items.find(r=>r.id===id);if(!record)throw Error('树干素材不存在');const v=revision==null?record.versions.at(-1):record.versions.find(v=>v.revision===revision);if(!v)throw Error('指定树干版本不存在');return validate(decodeGraph(v.root,h=>object(root,h)));
}
export async function saveTrunkModel(root,raw,{expectedRevision=0,thumbnail=''}={}){
 fs.mkdirSync(root,{recursive:true});const lock=path.join(root,'write.lock');let fd;
 try{fd=fs.openSync(lock,'wx');}catch(error){
  if(error.code!=='EEXIST')throw error;let stale=false;
  try{const owner=readJSON(lock);if(Number.isInteger(owner.pid)&&owner.pid>0){try{process.kill(owner.pid,0);}catch(e){stale=e.code==='ESRCH';}}}catch{stale=Date.now()-fs.statSync(lock).mtimeMs>60000;}
  if(!stale)throw Error('树干素材库正在保存，请稍后重试');
  fs.unlinkSync(lock);try{fd=fs.openSync(lock,'wx');}catch{throw Error('树干素材库正在保存，请稍后重试');}
 }
 try{
  fs.writeSync(fd,JSON.stringify({pid:process.pid,createdAt:Date.now()}));
  const catalog=trunkCatalog(root),previous=catalog.items.find(r=>r.id===raw.id),current=previous?.revision||0;if(expectedRevision!==current)throw Error('本机树干已有新版本，请刷新后再保存为新版本');
  const model={...raw,revision:current+1};validate(model);if(thumbnail&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(thumbnail)||thumbnail.length>1200000)throw Error('树干缩略图无效');
  const writer=new ObjectWriter(path.join(root,'objects')),hash=writer.encode(model,true)[1],updatedAt=Date.now(),record={id:model.id,key:'trunk:'+model.id,type:'trunk',name:model.name,revision:model.revision,triangles:model.triangles||model.primitives.reduce((n,p)=>n+p.geometry.index.length/3,0),dimensions:trunkDimensions(model),thumbnail:thumbnail||previous?.thumbnail||'',updatedAt,versions:[...(previous?.versions||[]),{revision:model.revision,root:hash,updatedAt}]};
  catalog.items=catalog.items.filter(r=>r.id!==record.id);catalog.items.push(record);atomic(indexFile(root),catalog);return record;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
export async function trunkLibraryCommand(root,operation,payload){
 if(operation==='list')return {success:true,items:trunkCatalog(root).items.map(({versions,...r})=>({...r,versions:versions.map(({revision,updatedAt})=>({revision,updatedAt}))}))};
 if(operation==='get')return readTrunkModel(root,payload.id,payload.revision??null);
 if(operation==='put')return {success:true,item:await saveTrunkModel(root,payload.model,payload)};
 throw Error('不支持的树干素材操作');
}
