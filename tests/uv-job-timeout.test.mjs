import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {createUvJobs} from '../material/core/uv-service.mjs';
import {encodeMeshInput} from '../material/mesh-codec.js';

test('原生 UV 无进展时停止，释放任务位，迟到的退出不会覆盖错误',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shuyaer-uv-timeout-'));
 const children=[];
 const jobs=createUvJobs({root,executable:process.execPath,idleTimeoutMs:35,launch:()=>{
  const child=new EventEmitter();
  child.stderr=new EventEmitter();
  child.kill=()=>{child.killed=true;child.emit('exit',null);};
  children.push(child);
  return child;
 }});
 const input=encodeMeshInput({
  pos:Float32Array.of(0,0,0,1,0,0,0,1,0),
  normal:Float32Array.of(0,0,1,0,0,1,0,0,1),
  uv:Float32Array.of(0,0,1,0,0,1),indices:Uint32Array.of(0,1,2)
 });
 try{
  const first=jobs.start(input),second=jobs.start(input);
  assert.throws(()=>jobs.start(input),/已有UV任务/);
  const deadline=Date.now()+2000;
  while(jobs.info(first.id).state==='running'||jobs.info(second.id).state==='running'){
   assert(Date.now()<deadline);
   await delay(15);
  }
  assert.match(jobs.info(first.id).error,/长时间没有进展/);
  assert.equal(jobs.info(first.id).state,'failed');
  assert.equal(jobs.info(second.id).state,'failed');
  assert(children.slice(0,2).every(child=>child.killed));
  assert.throws(()=>jobs.result(first.id),/尚未完整完成/);
  const retry=jobs.start(input);
  assert.equal(retry.state,'running');
  assert.equal(jobs.cancel(retry.id).state,'cancelled');
 }finally{
  jobs.dispose();
  fs.rmSync(root,{recursive:true,force:true});
 }
});
