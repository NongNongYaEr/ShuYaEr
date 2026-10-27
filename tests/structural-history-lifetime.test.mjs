import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('shared raw skeleton snapshots and an uncommitted copy release the previous full owner, scene and authoring',()=>{
 const result=spawnSync(process.execPath,['--expose-gc','--experimental-loader',new URL('./vendor-loader.mjs',import.meta.url).href,fileURLToPath(new URL('./structural-history-lifetime.worker.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:60000,windowsHide:true});
 assert.equal(result.status,0,result.error?.stack||result.stderr||result.stdout);
 const report=JSON.parse(result.stdout.trim());assert(report.passed&&report.retiredOwnerSceneAndAuthoringCollected&&report.currentAndUncommittedCopiesUsable);assert.equal(report.workerCalls,1);
});
