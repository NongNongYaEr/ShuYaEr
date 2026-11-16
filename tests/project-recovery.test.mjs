import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectRecoveryBody } from '../web/project-recovery-save.js';
import { boundedProjectJson, projectSaveBody, PROJECT_SAVE_LIMIT, PROJECT_SAVE_TOO_LARGE } from '../web/project-save-request.js';

const document={settings:{object_name:'梧桐'},authoring:{sample:'data:image/png;base64,ABCD'}};
const metadata={id:'draft-test',name:'梧桐',workspace:'BRANCH'};
const expectedBody=()=>projectSaveBody(metadata,boundedProjectJson(document),PROJECT_SAVE_LIMIT);

test('recovery worker returns the exact existing UTF-8 save body', async()=>{
  let terminated=false;
  const worker={postMessage(snapshot){
    assert.deepEqual(snapshot,{document,metadata});
    queueMicrotask(()=>worker.onmessage({data:{body:expectedBody()}}));
  },terminate(){terminated=true;}};
  const body=await buildProjectRecoveryBody(document,metadata,{createWorker:()=>worker});
  assert.equal(body.type,'application/octet-stream');
  assert.equal(await body.text(),await expectedBody().text());
  assert.equal(terminated,true);
});

test('recovery serialization falls back when worker creation, messaging or startup fails', async()=>{
  for(const createWorker of [
    ()=>{throw new Error('worker unavailable');},
    ()=>({postMessage(){throw new Error('cannot clone');},terminate(){}}),
    ()=>({postMessage(){this.onerror({});},terminate(){}}),
    ()=>({postMessage(){this.onmessageerror();},terminate(){}}),
    ()=>({postMessage(){},terminate(){}})
  ]){
    const body=await buildProjectRecoveryBody(document,metadata,{createWorker,timeoutMs:5});
    assert.equal(await body.text(),await expectedBody().text());
  }
});

test('a superseded recovery serialization never falls back or returns a body', async()=>{
  for(const data of [null,{body:expectedBody()}]){
    let current=true;
    const staleDocument={get value(){assert.fail('superseded document was read');}};
    const body=await buildProjectRecoveryBody(staleDocument,metadata,{
      isCurrent:()=>current,
      createWorker:()=>({postMessage(){current=false;this.onmessage({data});},terminate(){}})
    });
    assert.equal(body,null);
  }
});

test('recovery worker size errors preserve their code and skip fallback', async()=>{
  const oversizedDocument={get value(){assert.fail('document was serialized twice');}};
  const createWorker=()=>({postMessage(){this.onmessage({data:{code:PROJECT_SAVE_TOO_LARGE}});},terminate(){}});
  await assert.rejects(buildProjectRecoveryBody(oversizedDocument,metadata,{createWorker}),{code:PROJECT_SAVE_TOO_LARGE});
});
