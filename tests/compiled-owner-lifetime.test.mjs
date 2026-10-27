import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

function lifetime(mode){
 const result=spawnSync(process.execPath,['--expose-gc','--experimental-loader',new URL('./vendor-loader.mjs',import.meta.url).href,fileURLToPath(new URL('./compiled-owner-lifetime.worker.mjs',import.meta.url)),mode],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:60000,windowsHide:true});
 assert.equal(result.status,0,result.error?.stack||result.stderr||result.stdout);return JSON.parse(result.stdout.trim());
}
test('an exact reused compiled model releases the previous full owner while retaining live shared geometry',()=>{const result=lifetime('complete');assert(result.passed&&result.retiredOwnerSceneAndAuthoringCollected&&result.liveSharedModelsUsable);assert.deepEqual(result.cache,{built:1,reused:2});});
test('cancelled cooperative compilation releases owner references and returns every borrowed prototype',()=>{const result=lifetime('cancel');assert(result.passed&&result.cancelled&&result.retiredOwnerSceneAndAuthoringCollected);});
test('historical curve reuse releases the retired full owner, scene and authoring while cached local shapes stay usable',()=>{const result=lifetime('historical');assert(result.passed&&result.retiredOwnerSceneAndAuthoringCollected&&result.liveSharedModelsUsable);assert.deepEqual(result.historyCache,{scoped:true,reusedOwners:2,evaluatedOwners:1});});
test('cancelled scoped historical evaluation cannot retain a retired full owner or its authored root',()=>{const result=lifetime('historical-cancel');assert(result.passed&&result.cancelled&&result.retiredOwnerSceneAndAuthoringCollected);});
