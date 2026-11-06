import {validateTrunkReady} from './trunk-preparation-data.js';
import {digest} from './trunk-material-workflow.js';

// A check belongs to the geometry, calibration and guides that were actually
// tested. A legacy confirmation boolean alone cannot certify later edits.
export async function checkTrunkRig(model,{check,current=()=>model,automatic=false}={}){
 validateTrunkReady(model);
 const input=JSON.stringify({geometry:model.material_workflow?.geometryKey||model.source.sha256,calibration:model.calibration,guides:model.guides,binding:model.binding||{},sculpt:model.sculpt||null});
 const key=await digest(new TextEncoder().encode(input));
 const assertCurrent=()=>{if(current()!==model)throw Error('树干已变化，请重新检查当前骨架。');};
 assertCurrent();
 const workflow=model.material_workflow;
 if(workflow?.rigConfirmed&&workflow.rigValidation?.key===key)return model;
 if(typeof check!=='function')throw Error('绑定检查尚未就绪，请重试。');
 try{await check();}catch(error){throw Error('弯曲与绑定检查未通过：'+error.message);}
 assertCurrent();
 if(!workflow)return model;
 return {...model,material_workflow:{...workflow,needsSkeleton:false,rigConfirmed:true,rigValidation:{version:1,key,automatic}}};
}
