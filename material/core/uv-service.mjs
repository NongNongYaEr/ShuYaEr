import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {decodeMeshInput,decodeUvResult,verifySurfacePreserved,verifyFacePartitions} from '../mesh-codec.js';
import {analyzeUV} from '../uv-analysis.js';
const UV_IDLE_TIMEOUT_MS=120000;
export function createUvJobs({root,executable=path.join(root,'runtime','native','TreeUvCore.exe'),launch=spawn,idleTimeoutMs=UV_IDLE_TIMEOUT_MS}={}){
  const jobs=new Map();
  function start(inputBytes,{mode='repack',resolution=2048,padding=12,owner=''}={}){
    if(!['repack','unwrap','tangents'].includes(mode)||![512,1024,2048,4096].includes(resolution)||!Number.isInteger(padding)||padding<0||padding>48)throw Error('UV任务参数无效。');
    if([...jobs.values()].filter(j=>['running','queued'].includes(j.state)).length>=2)throw Error('当前已有UV任务，请完成或取消后继续。');
    const input=decodeMeshInput(inputBytes);if(!fs.existsSync(executable))throw Error('UV运行内核缺失，请使用完整软件目录。');
    const id=randomUUID(),directory=path.join(root,'.runtime','uv-jobs',id),inputPath=path.join(directory,'input.bin'),outputPath=path.join(directory,'output.bin');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(inputPath,inputBytes);
    const job={id,owner,state:'running',mode,resolution,padding,phase:'adjacency',progress:0,startedAt:Date.now(),directory,outputPath,error:null};jobs.set(id,job);
    let child;
    try{child=launch(executable,[inputPath,outputPath,mode,String(resolution),String(padding)],{windowsHide:true,stdio:['ignore','ignore','pipe']});}
    catch(error){job.state='failed';job.error=error.message;return info(id);}
    job.child=child;
    let pending='';
    function watchProgress(){
      clearTimeout(job.timer);
      job.timer=setTimeout(()=>{
        if(job.state!=='running')return;
        job.state='failed';
        job.error='UV 处理长时间没有进展，已停止。可重试，或保留拓扑后调整 UV 设置。';
        child.kill();
      },idleTimeoutMs);
      job.timer.unref();
    }
    watchProgress();
    child.stderr.on('data',b=>{
      if(job.state!=='running')return;
      pending+=b.toString();
      if(pending.length>20000)pending=pending.slice(-20000);
      let at;
      while((at=pending.indexOf('\n'))>=0){
        const line=pending.slice(0,at);pending=pending.slice(at+1);
        try{
          const value=JSON.parse(line);
          if(value.error)job.error=value.error;
          if(value.stage){
            const ranges={adjacency:[0,.12],charts:[.12,.65],packing:[.65,.88],output:[.88,.94],done:[.94,.96]};
            const range=ranges[value.stage]||[0,.95],progress=range[0]+(range[1]-range[0])*(value.percent||0)/100;
            if(value.stage!==job.phase||progress>job.progress)watchProgress();
            job.phase=value.stage;
            job.progress=Math.max(job.progress,progress);
          }
        }catch{}
      }
    });
    child.on('error',error=>{
      clearTimeout(job.timer);
      if(job.state==='running'){job.state='failed';job.error=error.message;}
    });
    child.on('exit',code=>{
      clearTimeout(job.timer);
      if(job.state!=='running')return;
      try{
        if(code!==0)throw Error(job.error||'UV内核退出，代码 '+code);
        const result=decodeUvResult(fs.readFileSync(outputPath));
        verifySurfacePreserved(input,result);
        if(mode!=='tangents')verifyFacePartitions(input,result);
        const diagnostic=analyzeUV(result,{resolution,sampleSize:512});
        delete diagnostic.raster;
        job.diagnostic=diagnostic;job.atlas=result.atlas;job.state='complete';job.progress=1;job.completedAt=Date.now();
      }catch(error){job.state='failed';job.error=error.message;}
    });
    return info(id);
  }
  function info(id){const j=jobs.get(id);if(!j)throw Error('UV任务不存在。');const {child,directory,outputPath,timer,...safe}=j;return safe;}
  function cancel(id){const j=jobs.get(id);if(!j)throw Error('UV任务不存在。');if(j.state==='running'){j.state='cancelled';clearTimeout(j.timer);j.child?.kill();}return info(id);}
  function result(id){const j=jobs.get(id);if(j?.state!=='complete')throw Error('UV任务尚未完整完成。');return fs.readFileSync(j.outputPath);}
  function dispose(){for(const j of jobs.values())if(j.state==='running')cancel(j.id);}
  function cancelOwner(owner){if(!owner)return;for(const j of jobs.values())if(j.owner===owner)cancel(j.id);}
  return {start,info,cancel,result,dispose,cancelOwner};
}
