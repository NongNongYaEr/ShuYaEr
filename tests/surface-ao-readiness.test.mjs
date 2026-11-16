import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {addEffect,createRule} from '../material/web/surface-effects.js';
import {createSurfaceWorkbench} from '../material/web/surface-workbench.js';
import {exportReadiness,exportUvState} from '../material/web/export-presentation.js';

function setup(ruleType){
 const source={sourceSHA256:'a'.repeat(64),ao:Float32Array.of(1,1,1)};
 const doc=createDocument({source:source.sourceSHA256,name:'AO fixture',settings:{}});
 const effect=addEffect(doc.surface,'moss',{sourceSHA256:source.sourceSHA256});
 doc.surface=effect.s;
 doc.surface.masks.find(mask=>mask.id===doc.surface.effects.at(-1).maskRef).items=[createRule(ruleType)];
 const requests=[],renderer={setSculptResponse(){},setSurfaceMasks(){},setSurfaceStack(){}};
 const workbench=createSurfaceWorkbench({
  document:()=>doc,settings:()=>doc.settings,source:()=>source,working:()=>source,renderer:()=>renderer,
  sessionFactory:()=>({dispose(){},async request(options){requests.push(options);return {};}}),
 });
 return {source,doc,workbench,requests};
}

test('surface effects wait for genuine geometry AO and accept a baked field once ready',async()=>{
 const {source,doc,workbench,requests}=setup('ao');
 assert.equal(workbench.state.ao,false);
 assert.equal(workbench.state.aoVerified,false);
 await assert.rejects(workbench.update(),error=>error.missing.some(item=>item.type==='ao'));
 assert.equal(requests.length,0);

 source.ao=Float32Array.of(.43,.77,.95);
 doc.resources.ao='b'.repeat(64);
 assert.equal(workbench.state.ao,true);
 assert.equal(workbench.state.aoVerified,true);
 await workbench.update();
 assert.equal(requests.length,1);
 assert.equal(requests[0].ao,source.ao);
 assert.equal(workbench.state.error,null);
});

test('procedural rules can render without requiring a separate baked AO field',async()=>{
 const {workbench,requests}=setup('noise');
 await workbench.update();
 assert.equal(requests.length,1);
 assert.equal(requests[0].ao,null);
});

test('export offers to bake missing AO and still blocks unrecoverable surface errors',()=>{
 const model={indices:[0,1,2],diagnostic:{}},project={};
 const surface={error:'缺少模型 AO',missing:[{type:'ao'}]};
 assert.equal(exportReadiness({project,model,surface}).canExport,true);
 assert.equal(exportReadiness({project,model,surface}).material,'导出时准备模型 AO');
 assert.equal(exportReadiness({project,model,surface:{...surface,missing:[...surface.missing,{type:'curvature'}]}}).canExport,false);
 assert.equal(exportReadiness({project,model,surface:{error:'读取失败'}}).canExport,false);
 assert.equal(exportReadiness({project,model,surface,busy:true}).canExport,false);
});

test('export recovery sends invalid UV and unsafe spacing to the relevant preparation tools',()=>{
 const project={output:{resolution:2048,padding:3}};
 const model={indices:[0,1,2],uvSHA256:'working',sourceUvSHA256:'source',diagnostic:{zeroUvFaces:1}};
 const invalid=exportReadiness({project,model});
 assert.equal(invalid.canExport,false);
 assert.equal(invalid.recovery.action,'uv');
 assert.equal(invalid.uvError,true);
 assert.equal(exportReadiness({project:{...project,materialBase:{}},model}).recovery.action,'overlay-uv');
 assert.equal(exportReadiness({project,model,geometryNeedsRepair:true}).canExport,true);

 model.diagnostic={clearance:{status:'measured',safe:false}};
 assert.equal(exportReadiness({project,model}).recovery.action,'uv');
 assert.equal(exportReadiness({project,model:{...model,uvSHA256:'source'}}).canExport,true);

 model.diagnostic={clearance:{status:'pending'}};
 assert.equal(exportReadiness({project,model}).canExport,true);
 const packed={...project,output:{resolution:2048,padding:12},uvPacking:{method:'tree-strips',resolution:2048,padding:3}};
 assert.equal(exportReadiness({project:packed,model}).recovery.action,'uv');
 assert.equal(exportReadiness({project:packed,model}).canExport,false);
});

test('export recovery exposes analysis or material actions and permits automatic AO',()=>{
 const project={},model={indices:[0,1,2],diagnostic:{}};
 assert.equal(exportReadiness().recovery.action,'model');
 assert.equal(exportReadiness({project,model,surface:{pending:true}}).canExport,false);
 const missing={error:'请准备分布数据：模型曲率',missing:[{type:'curvature'}]};
 const blocked=exportReadiness({project,model,surface:missing});
 assert.equal(blocked.canExport,false);
 assert.equal(blocked.recovery.action,'distribution');
 assert.equal(blocked.recovery.detail,missing.error);
 assert.equal(exportReadiness({project,model,surface:{error:'材质分布读取失败'}}).recovery.action,'material');
 const incompatible=exportReadiness({project,model,compatibilityError:'高级图层需要 DX12'});
 assert.equal(incompatible.canExport,false);
 assert.equal(incompatible.recovery.action,'material');
 assert.equal(incompatible.recovery.detail,'高级图层需要 DX12');
 assert.equal(exportReadiness({project,model,surface:{error:'缺少 AO',missing:[{type:'ao'}]}}).recovery,null);
});

test('original UV overlap can be confirmed for export and the approval stays bound to the source and UV',()=>{
 const source='a'.repeat(64),uv='b'.repeat(64),other='c'.repeat(64);
 const project=createDocument({source,name:'Overlap fixture',settings:{}});
 const model={indices:[0,1,2],sourceSHA256:source,uvSHA256:uv,sourceUvSHA256:uv,diagnostic:{overlap:.00117,clearance:{status:'measured',safe:false}}};
 assert.equal(exportUvState(project,model),'confirm-overlap');
 assert.equal(exportReadiness({project,model}).canExport,true);
 const accepted=validateDocument({...project,acceptedSourceUvOverlap:{source,uv}});
 assert.equal(exportUvState(accepted,model),'accepted-overlap');
 assert.equal(exportReadiness({project:accepted,model}).canExport,true);
 assert.equal(exportUvState(accepted,{...model,sourceSHA256:other}),'confirm-overlap');
 assert.equal(exportUvState(accepted,{...model,uvSHA256:other,sourceUvSHA256:other}),'confirm-overlap');
 assert.equal(exportUvState(accepted,{...model,uvSHA256:other}),'invalid');
 for(const failure of [{zeroUvFaces:1},{outOfRangeFaces:1},{clearance:{status:'invalid'}}]){
  const bad={...model,diagnostic:{...model.diagnostic,...failure}};
  assert.equal(exportReadiness({project:accepted,model:bad}).canExport,false);
 }
 const replacement=createDocument({source:other,name:'Replacement',settings:{}});
 assert.equal(validateDocument({...replacement,acceptedSourceUvOverlap:accepted.acceptedSourceUvOverlap}).acceptedSourceUvOverlap,undefined);
});
