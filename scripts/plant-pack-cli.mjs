import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ObjectWriter,atomic,readJSON,decodeGraph} from './plant-pack-container.mjs';
import {catalog,inspect,install,resolveAsset,reexport,updateLibrary} from './plant-pack-library.mjs';
import {publishPlant,portableBranch,validateAsset,describeDependencies,validatePackMetadata,PACK_TYPES} from '../web/plant-pack-data.js';
import {attachPackageOrigins,collectPackageOrigins,packageOrigins} from '../web/asset-origins.js';
import {readTrunkModel} from './trunk-model-library.mjs';
const job=readJSON(process.argv[2]),folder=path.dirname(process.argv[2]),statusFile=path.join(folder,'status.json');
let stamp=0;
const check=()=>{if(fs.existsSync(path.join(folder,'cancel.flag')))throw Error('任务已取消');};
const report=(phase,done=0,total=0,force=false)=>{const t=Date.now();if(force||t-stamp>180){stamp=t;atomic(statusFile,{state:'running',phase,done,total,updatedAt:t});}};
const summary=(type,p)=>({thumbnail:p.thumbnail||'',count:p.units?.length||0,counts:p.counts||null,...(type==='branch'?{branches:p.shape?.branches?.length||0,leafCount:p.sample?.leaf_meshes?.length||0,organCount:p.sample?.authoring?.tree_organs?.units?.length||0,tags:p.sample?.authoring?.recipe?.tags||[]}:{}),...(p.species?{species:p.species}:{})});
async function main(){
  report('准备资源',0,0,true);let result;
  if(job.action==='inspect')result=await inspect(path.join(folder,'input.plantpack'),job.library,{check,progress:(n,t)=>report('校验模型与纹理',n,t)});
  else if(job.action==='install')result=await install(job.file,job.library,{check,copyConflict:job.copyConflict,progress:(n,t)=>report('安装完整依赖',n,t)});
  else if(job.action==='resolve'){const item=resolveAsset(job.library,job.id);const value=attachPackageOrigins(item.asset.type,item.payload,item.origins);if(item.asset.type!=='trunk')value.id=job.id;else value.package_asset_alias=job.id;atomic(path.join(folder,'asset.json'),value);result={type:item.asset.type,file:'asset.json'};}
  else if(job.action==='reexport'){const manifest=await reexport(job.library,job.key,path.join(folder,'output.plantpack'),{check,progress:(n,t)=>report('重新打包',n,t)});result={file:'output.plantpack',name:job.name||'植物资源包',metadata:manifest.metadata};}
  else if(job.action==='remove'||job.action==='metadata')result=await updateLibrary(job.library,job.action,job.key,job.patch,check);
  else if(job.action==='export'){
    const writer=new ObjectWriter(path.join(folder,'objects'),check),metadata=validatePackMetadata(job.metadata),assets=[],seen=new Map();
    async function add(type,value,info={},primary=false){
      check();validateAsset(type,value);if(type==='trunk')metadata.minimumVersion='0.2.52';metadata.derivedFrom=packageOrigins([...metadata.derivedFrom,...collectPackageOrigins(value)]);const payload=type==='plant'?publishPlant(value,{kind:info.kind}):type==='branch'?portableBranch(value,info.library||[]):value;
      let id=String(info.originalId||info.id||payload.id||'plant-'+crypto.randomUUID());const revision=Math.max(1,Number(info.revision||payload.revision||1)),root=writer.encode(payload,true)[1],sourceId=id;
      if(assets.some(a=>a.type===type&&a.id===id&&a.revision===revision&&a.root!==root))id=id.slice(0,100)+'.variant.'+root.slice(0,16);
      const key=type+':'+id+':'+revision+':'+root;
      if(seen.has(key)){if(primary)seen.get(key).primary=true;return key;}
      const a={key,type,id,...(id!==sourceId?{sourceId}:{}),revision,name:String(info.name||payload.name||payload.settings?.object_name||PACK_TYPES[type]).slice(0,160),root,primary,dependencies:[],...summary(type,payload),...(type==='units'&&info.thumbnail?{thumbnail:info.thumbnail}:{})};assets.push(a);seen.set(key,a);
      const d=describeDependencies(type,payload);for(const dep of d.assets)a.dependencies.push(await add(dep.type,dep.payload,dep,false));a.geometryCount=d.geometry;return key;
    }
    for(let n=0;n<job.sources.length;n++){check();const s=job.sources[n];report('收集 '+(s.name||PACK_TYPES[s.type]),n,job.sources.length,true);let payload=s.trunkId?readTrunkModel(s.trunkLibrary,s.trunkId,s.revision):s.packageAlias?resolveAsset(job.library,s.packageAlias).payload:readJSON(s.file);if(s.packageAlias){const origin=resolveAsset(job.library,s.packageAlias).origins;metadata.derivedFrom=packageOrigins([...metadata.derivedFrom,...origin]);}if(s.wrapper)payload=payload[s.wrapper];if(s.type==='material'&&!payload.data)payload={id:payload.id,name:payload.name,revision:1,kind:s.kind,data:payload.shape,...(payload.package_origins?.length?{package_origins:payload.package_origins}:{})};await add(s.type,payload,s,true);}
    if(!assets.some(a=>a.primary))throw Error('请至少选择一项内容');report('压缩并写出资源包',assets.length,assets.length,true);const manifest=await writer.write(path.join(folder,'output.plantpack'),metadata,assets);result={file:'output.plantpack',name:metadata.name,metadata,digest:manifest.digest,assets,bytes:fs.statSync(path.join(folder,'output.plantpack')).size};
  }else if(job.action==='catalog')result=catalog(job.library);else throw Error('未知资源包任务');
  atomic(path.join(folder,'result.json'),result);atomic(statusFile,{state:'complete',phase:'完成',result,updatedAt:Date.now()});
}
main().catch(error=>{atomic(statusFile,{state:fs.existsSync(path.join(folder,'cancel.flag'))?'cancelled':'failed',phase:error.message,message:error.message,updatedAt:Date.now()});process.exitCode=1;});
