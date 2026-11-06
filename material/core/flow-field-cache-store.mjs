import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
const valid=h=>/^[a-f0-9]{64}$/.test(h||''),sha=b=>createHash('sha256').update(b).digest('hex');
export function createFlowFieldCacheStore({root,webRoot,maxEntryBytes=32*1024*1024,maxTotalBytes=128*1024*1024,maxEntries=4}={}){
 const base=path.resolve(root,'.runtime/flow-field-cache');let algorithm;
 function info(){
  if(algorithm===undefined){try{const names=['flow-field-cache.js','model.js','bark-flow.js','bark-flow-banyan.js','bark-flow-surface.js','bark-flow-metric.js','bark-flow-relax.js','bark-flow-projection.js','bark-flow-continuity.js','flow-integration.js','flow-edge-multiply.js','flow-linear-solver.js','uv-topology.js','bark-flow-rules.js'];algorithm=sha(Buffer.from(names.map(n=>n+':'+sha(fs.readFileSync(path.join(webRoot,n)))).join('\n')));}catch{algorithm=null;}}
  return{enabled:!!algorithm,algorithm,maxEntryBytes,maxTotalBytes,maxEntries};
 }
 const file=(source,suffix)=>{if(!valid(source))throw Error('走势缓存源无效。');return path.join(base,source+suffix);};
 function record(source){try{const meta=file(source,'.json'),data=file(source,'.bin');if(!fs.lstatSync(meta).isFile()||!fs.lstatSync(data).isFile())return null;const m=JSON.parse(fs.readFileSync(meta,'utf8'));return m.kind==='tree-flow-field-cache'&&m.source===source&&valid(m.key)&&valid(m.digest)&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&m.bytes<=maxEntryBytes&&Number.isFinite(m.used)?m:null;}catch{return null;}}
 function get(source,key,expected){if(!info().enabled||expected!==algorithm||!valid(key))return Buffer.alloc(0);const m=record(source);if(!m||m.key!==key||m.algorithm!==algorithm)return Buffer.alloc(0);const data=file(source,'.bin');if(fs.statSync(data).size!==m.bytes)return Buffer.alloc(0);const bytes=fs.readFileSync(data);if(sha(bytes)!==m.digest)return Buffer.alloc(0);try{fs.utimesSync(data,new Date(),new Date());}catch{}return bytes;}
 function put(source,key,expected,bytes){
  if(!info().enabled||expected!==algorithm||!valid(key))throw Error('走势缓存算法已变化。');if(!Buffer.isBuffer(bytes)||bytes.length<12||bytes.length>maxEntryBytes||bytes.subarray(0,8).toString()!=='TMLFLW01')throw Error('走势缓存数据无效。');
  fs.mkdirSync(base,{recursive:true});const data=file(source,'.bin'),meta=file(source,'.json');for(const p of[data,meta])if(fs.existsSync(p)&&!fs.lstatSync(p).isFile())throw Error('走势缓存目标无效。');
  const temp=path.join(base,randomUUID()+'.tmp'),m={kind:'tree-flow-field-cache',version:1,source,key,algorithm,bytes:bytes.length,digest:sha(bytes),used:Date.now()};
  try{fs.writeFileSync(temp,bytes,{flag:'wx'});fs.renameSync(temp,data);fs.writeFileSync(meta,JSON.stringify(m));}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  const records=fs.readdirSync(base).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(n=>record(n.slice(0,64))).filter(Boolean).map(r=>({...r,used:fs.statSync(file(r.source,'.bin')).mtimeMs})).sort((a,b)=>(a.source===source?-1:b.source===source?1:0)||b.used-a.used||a.source.localeCompare(b.source));let total=0,count=0;
  for(const r of records){total+=r.bytes;count++;if(count>maxEntries||total>maxTotalBytes){fs.unlinkSync(file(r.source,'.bin'));fs.unlinkSync(file(r.source,'.json'));}}
  return{cached:true,bytes:bytes.length};
 }
 return{info,get,put};
}
