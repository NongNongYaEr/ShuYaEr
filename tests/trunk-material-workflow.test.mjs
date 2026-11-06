import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {importedTrunkFixture} from './imported-trunk-fixture.mjs';import {createRuntimeTestDirectory} from './runtime-test-directory.mjs';
import {readImportedTrunkGlb} from '../web/imported-trunk-glb.js';import {attachMaterialCheckpoint,materialGeometryKey,digest,base64Bytes} from '../web/trunk-material-workflow.js';
import {prepareImportedTrunk} from '../web/imported-trunk-runtime.js';
import {trunkEditable,restoreTrunkEdits} from '../web/trunk-preparation-data.js';import {saveTrunkModel,readTrunkModel} from '../scripts/trunk-model-library.mjs';
import {saveIntegrationCheckpoint} from '../material/core/integration-checkpoints.mjs';
const bundle=()=>new TextEncoder().encode('TMLPROJ1test-data');
test('材质检查点保留树干身份、独立可编辑包和来源，几何一致才复用绑定',async()=>{
 const parsed=prepareImportedTrunk(await readImportedTrunkGlb(await importedTrunkFixture())),old={...parsed,name:'原树干',binding:{primitive_guides:{x:['G0']}}},b=bundle(),meta={sessionId:'draft',projectId:'project',inputId:'input',bundle:b,bundleSHA256:await digest(b)};
 const next=await attachMaterialCheckpoint(parsed,old,meta);assert.equal(next.id,old.id);assert.equal(next.name,'原树干');assert.deepEqual(next.binding,{});assert.equal(next.material_workflow.needsSkeleton,true);assert.deepEqual(base64Bytes(next.material_editable.base64),b);
 const confirmed={...next,binding:{primitive_guides:{x:['G0']}},material_workflow:{...next.material_workflow,rigConfirmed:true}};
 const same=await attachMaterialCheckpoint(parsed,confirmed,meta);assert.deepEqual(same.binding,confirmed.binding);assert.equal(same.material_workflow.rigConfirmed,true);
 const changed=structuredClone(parsed);changed.primitives[0].geometry.position[0]+=.01;assert.notEqual(await materialGeometryKey(changed),await materialGeometryKey(parsed));const result=await attachMaterialCheckpoint(changed,confirmed,meta);assert.equal(result.material_workflow.needsSkeleton,true);assert.deepEqual(result.binding,{});
 await assert.rejects(attachMaterialCheckpoint(parsed,old,{...meta,bundleSHA256:'a'.repeat(64)}),/校验失败/);
});
test('编辑包随树干库离线重载；小草稿只存引用而不重复200MB编辑包',async t=>{
 const folder=createRuntimeTestDirectory(t,'imported-trunk-pve-'),parsed=prepareImportedTrunk(await readImportedTrunkGlb(await importedTrunkFixture())),b=bundle(),next=await attachMaterialCheckpoint(parsed,parsed,{sessionId:'draft',projectId:'project',inputId:'input',bundle:b,bundleSHA256:await digest(b)});
 const edits=trunkEditable(next);assert(!('material_editable' in edits));assert(edits.material_workflow);await saveTrunkModel(folder,next);const restored=readTrunkModel(folder,next.id);assert.equal(restored.material_editable.base64,next.material_editable.base64);assert.equal(restoreTrunkEdits(restored,edits).material_workflow.sessionId,'draft');
});
test('检查点复用同一结果，损坏/越界输出在转接前拒绝',async t=>{
 const root=createRuntimeTestDirectory(t,'imported-trunk-pve-'),exports=path.join(root,'exports');fs.mkdirSync(exports);const file=path.join(exports,'final.glb');fs.writeFileSync(file,await importedTrunkFixture());let writes=0;const store={save:()=>{writes++;return {revision:'revision'};},bundle:()=>Buffer.from('TMLPROJ1fixture')},document={id:'project'};
 const first=saveIntegrationCheckpoint({root,store,document,model:'/exports/final.glb'}),second=saveIntegrationCheckpoint({root,store,document,model:'/exports/final.glb'});assert.deepEqual(first,second);assert.equal(writes,1);assert.throws(()=>saveIntegrationCheckpoint({root,store,document,model:'/exports/../../server.mjs'}),/未就绪|路径/);
 fs.writeFileSync(file,'partial');assert.throws(()=>saveIntegrationCheckpoint({root,store,document,model:'/exports/final.glb'}),/未完整/);
});
