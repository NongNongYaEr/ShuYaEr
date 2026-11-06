import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {optimizationOptions,decodeOptimizationResult} from '../mesh-optimization.js';
export function createMeshOptimizationJobs({root,executable=path.join(root,'runtime/native/TreeMeshOptimize.exe')}={}){
 const jobs=new Map();
 const base=path.resolve(root,'.runtime/mesh-jobs');
 function cleanup(j){if(!j.exited)return;const target=path.resolve(j.directory);if(!target.startsWith(base+path.sep)||path.dirname(target)!==base)throw Error('减面缓存清理越界。');fs.rmSync(target,{recursive:true,force:true});jobs.delete(j.id);}
 const owned=(id,owner)=>{const j=jobs.get(id);if(!j||j.owner!==owner)throw Error('该减面任务不属于当前会话。');return j;};
 function info(id,owner){const j=owned(id,owner);return{id:j.id,state:j.state,phase:j.phase,progress:j.progress,options:j.options,error:j.error,report:j.report||null};}
 function start(bytes,{owner='',previewSource=true,...raw}={}){
  if(typeof previewSource!=='boolean')throw Error('原模型预览参数无效。');
  const options=optimizationOptions(raw);if([...jobs.values()].some(j=>j.state==='running'))throw Error('已有减面任务正在运行，请先完成或取消。');
  if(!fs.existsSync(executable))throw Error('减面内核缺失，请使用更新后的完整运行目录。');
  if(bytes.length<16||bytes.subarray(0,8).toString()!=='TMLMESH1')throw Error('减面输入无效。');const v=bytes.readUInt32LE(8),k=bytes.readUInt32LE(12);if(!v||v>2000000||!k||k%3||k>6000000||bytes.length!==16+v*32+k*4)throw Error('减面输入超出200万三角面/200万顶点预算。');
  const id=randomUUID(),directory=path.join(root,'.runtime/mesh-jobs',id);fs.mkdirSync(directory,{recursive:true});const input=path.join(directory,'input.bin'),output=path.join(directory,'output.bin');fs.writeFileSync(input,bytes);
  const j={id,owner,directory,output,state:'running',phase:'read',progress:0,options,error:null};jobs.set(id,j);
  const child=j.child=spawn(executable,[input,output,String(options.targetTriangles),String(options.errorCm),String(options.actualHeightMeters),String(options.detailProtection),options.preserveBoundary?'1':'0',options.preserveUV?'1':'0',previewSource?'1':'0'],{windowsHide:true,stdio:['ignore','ignore','pipe']});let pending='';
  const clear=()=>{clearTimeout(j.timer);try{fs.unlinkSync(input);}catch{}};
  j.timer=setTimeout(()=>{if(j.state==='running'){j.state='failed';j.error='减面超过120秒，任务已停止；原模型未改变。';child.kill();}},120000);
  child.stderr.on('data',b=>{pending+=b.toString();if(pending.length>20000)pending=pending.slice(-20000);let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);try{const x=JSON.parse(line);if(x.error)j.error=x.error;if(x.stage){j.phase=x.stage;j.progress=Math.max(j.progress,(x.percent||0)/100);}}catch{}}});
  child.on('error',e=>{clear();if(j.state==='running'){j.state='failed';j.error=e.message;}});
  child.on('exit',code=>{clear();j.exited=true;if(j.releaseRequested){cleanup(j);return;}if(j.state!=='running')return;try{if(code!==0)throw Error(j.error||'减面内核退出：'+code);const b=fs.readFileSync(output),decoded=decodeOptimizationResult(b,k/3);j.report=decoded.report;j.state='complete';j.progress=1;}catch(e){j.state='failed';j.error=e.message;}});
  return info(id,owner);
 }
 function cancel(id,owner){const j=owned(id,owner);if(j.state==='running'){j.state='cancelled';clearTimeout(j.timer);j.child.kill();}return info(id,owner);}
 function result(id,owner){const j=owned(id,owner);if(j.state!=='complete')throw Error('减面候选尚未准备完毕。');return fs.readFileSync(j.output);}
 function release(id,owner){const j=owned(id,owner);if(j.state==='running')cancel(id,owner);j.releaseRequested=true;cleanup(j);return{released:true};}
 function cancelOwner(owner){for(const j of [...jobs.values()])if(j.owner===owner)release(j.id,owner);}
 function dispose(){for(const j of [...jobs.values()])release(j.id,j.owner);}
 return{start,info,cancel,result,release,cancelOwner,dispose};
}
