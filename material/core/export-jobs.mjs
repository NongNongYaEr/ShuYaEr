import fs from 'node:fs';import path from 'node:path';import {Worker} from 'node:worker_threads';import {randomUUID} from 'node:crypto';import {parseBakePayload} from './texture-export.mjs';
export function createExportJobs({root,publishRename=fs.renameSync}){
 const jobs=new Map();
 const stagingRoot=path.resolve(root,'.runtime','export-jobs');
 function info(id){const j=jobs.get(id);if(!j)throw Error('导出任务不存在。');const {worker,publishing,...safe}=j;return safe;}
 function removeStage(stageDirectory){
  void fs.promises.rm(stageDirectory,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(error=>{
   console.warn('清理材质导出暂存失败：'+error.message);
  });
 }
 function cleanup(job,stageDirectory){
  if(!job.worker&&!job.publishing)removeStage(stageDirectory);
 }
 async function publish(job,stageDirectory,ready){
  job.publishing=true;
  try{
   const {stage,...result}=ready,source=path.resolve(stage),target=path.resolve(result.folder);
   if(!source.startsWith(path.resolve(stageDirectory)+path.sep)||!target.startsWith(path.resolve(root,'exports')+path.sep)||path.basename(source)!==path.basename(target))throw Error('导出暂存路径无效。');
   for(let attempt=0;attempt<5;attempt++){
    if(job.state!=='running')return;
    try{if(fs.existsSync(target))throw Error('导出目标已存在，已保留原文件。');publishRename(source,target);job.state='complete';job.result={...result,committed:true};job.progress=1;job.completedAt=Date.now();return;}
    catch(error){if(attempt===4||!['EPERM','EBUSY','EACCES'].includes(error.code)||fs.existsSync(target)||!fs.existsSync(source))throw error;await new Promise(resolve=>setTimeout(resolve,100*2**attempt));}
   }
  }catch(error){if(job.state==='running'){job.state='failed';job.error=error.message;}}
  finally{job.publishing=false;cleanup(job,stageDirectory);}
 }
 function start(payload,{owner=''}={}){
  parseBakePayload(payload);if([...jobs.values()].filter(j=>j.state==='running').length>=2)throw Error('导出任务已满，请稍候。');
  const id=randomUUID(),stageDirectory=path.join(stagingRoot,id);
  const job={id,owner,state:'running',startedAt:Date.now(),progress:0};
  const data=Uint8Array.from(payload);
  fs.mkdirSync(stagingRoot,{recursive:true});
  fs.mkdirSync(stageDirectory);
  let worker;
  try{
   worker=new Worker(new URL('./export-worker.mjs',import.meta.url),{workerData:{root,payload:data.buffer,stageDirectory},transferList:[data.buffer]});
  }catch(error){
   removeStage(stageDirectory);
   throw error;
  }
  job.worker=worker;
  jobs.set(id,job);
  worker.on('message',message=>{if(job.state!=='running')return;if(message.error){job.state='failed';job.error=message.error;return;}if(message.ready&&!job.publishing)void publish(job,stageDirectory,message.ready);});
  worker.on('error',e=>{if(job.state==='running'&&!job.publishing){job.state='failed';job.error=e.message;}});
  worker.on('exit',code=>{
   delete job.worker;
   if(job.state==='running'&&!job.publishing){job.state='failed';job.error='导出工作进程意外退出：'+code;}
   cleanup(job,stageDirectory);
  });
  return info(id);
 }
 function cancel(id){
  const job=jobs.get(id);
  if(!job)throw Error('导出任务不存在。');
  if(job.state==='running'){
   job.state='cancelled';
   void job.worker?.terminate().catch(()=>{});
  }
  return info(id);
 }
 function dispose(){for(const j of jobs.values())if(j.state==='running')cancel(j.id);}
 function cancelOwner(owner){if(!owner)return;for(const j of jobs.values())if(j.owner===owner)cancel(j.id);}
 return{start,info,cancel,dispose,cancelOwner};
}
