import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {decodeMeshInput,decodeUvResult,verifySurfacePreserved,verifyFacePartitions} from '../mesh-codec.js';
import {analyzeUV} from '../uv-analysis.js';
export function createUvJobs({root,executable=path.join(root,'runtime','native','TreeUvCore.exe')}={}){
  const jobs=new Map();
  function start(inputBytes,{mode='repack',resolution=2048,padding=12,owner=''}={}){
    if(!['repack','unwrap','tangents'].includes(mode)||![512,1024,2048,4096].includes(resolution)||!Number.isInteger(padding)||padding<0||padding>48)throw Error('UV任务参数无效。');
    if([...jobs.values()].filter(j=>['running','queued'].includes(j.state)).length>=2)throw Error('当前已有UV任务，请完成或取消后继续。');
    const input=decodeMeshInput(inputBytes);if(!fs.existsSync(executable))throw Error('UV运行内核缺失，请使用完整软件目录。');
    const id=randomUUID(),directory=path.join(root,'.runtime','uv-jobs',id),inputPath=path.join(directory,'input.bin'),outputPath=path.join(directory,'output.bin');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(inputPath,inputBytes);
    const job={id,owner,state:'running',mode,resolution,padding,phase:'adjacency',progress:0,startedAt:Date.now(),directory,outputPath,error:null};jobs.set(id,job);
    const child=spawn(executable,[inputPath,outputPath,mode,String(resolution),String(padding)],{windowsHide:true,stdio:['ignore','ignore','pipe']});job.child=child;let pending='';
    child.stderr.on('data',b=>{pending+=b.toString();let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);try{const value=JSON.parse(line);if(value.error)job.error=value.error;if(value.stage){job.phase=value.stage;const ranges={adjacency:[0,.12],charts:[.12,.65],packing:[.65,.88],output:[.88,.94],done:[.94,.96]},range=ranges[value.stage]||[0,.95];job.progress=Math.max(job.progress,range[0]+(range[1]-range[0])*(value.percent||0)/100);}}catch{}}});
    child.on('error',e=>{if(job.state==='cancelled')return;job.state='failed';job.error=e.message;});
    child.on('exit',code=>{if(job.state==='cancelled')return;if(code!==0){job.state='failed';job.error=job.error||'UV内核退出，代码 '+code;return;}try{const bytes=fs.readFileSync(outputPath),result=decodeUvResult(bytes);verifySurfacePreserved(input,result);if(mode!=='tangents')verifyFacePartitions(input,result);const diagnostic=analyzeUV(result,{resolution,sampleSize:512});delete diagnostic.raster;job.diagnostic=diagnostic;job.atlas=result.atlas;job.state='complete';job.progress=1;job.completedAt=Date.now();}catch(e){job.state='failed';job.error=e.message;}});
    return info(id);
  }
  function info(id){const j=jobs.get(id);if(!j)throw Error('UV任务不存在。');const {child,directory,outputPath,...safe}=j;return safe;}
  function cancel(id){const j=jobs.get(id);if(!j)throw Error('UV任务不存在。');if(j.state==='running'){j.state='cancelled';j.child?.kill();}return info(id);}
  function result(id){const j=jobs.get(id);if(j?.state!=='complete')throw Error('UV任务尚未完整完成。');return fs.readFileSync(j.outputPath);}
  function dispose(){for(const j of jobs.values())if(j.state==='running'){j.state='cancelled';j.child?.kill();}}
  function cancelOwner(owner){if(!owner)return;for(const j of jobs.values())if(j.owner===owner)cancel(j.id);}
  return {start,info,cancel,result,dispose,cancelOwner};
}
