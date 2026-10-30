import {normalizeImportedTrunks} from './imported-trunk-runtime.js';
export function sculptReplacementTargets(authoring,model){return (authoring.imported_trunks?.assets||[]).filter(old=>old.source.sha256===model.source.sha256&&authoring.imported_trunks.mounts.some(m=>m.asset_id===old.id));}
// Existing tree controls are deliberately retained. Replacing the source mesh
// must not silently rewrite the user's branch pose or create private unit models.
export function planSculptTrunkReplacement(authoring,model,targetId){
 const targets=sculptReplacementTargets(authoring,model),old=targets.find(m=>m.id===targetId)||targets.find(m=>m.id===model.sculpt_parent?.id)||(targets.length===1?targets[0]:null);if(!old)throw Error('请选择这棵树中对应的原树干');
 for(const p of old.primitives){const next=model.primitives.find(n=>n.id===p.id);if(!next||next.geometry.position.length!==p.geometry.position.length||next.geometry.index.length!==p.geometry.index.length||next.geometry.index.some((n,i)=>n!==p.geometry.index[i]))throw Error('树干拓扑已改变，需要重新建立挂接');}
 const next=structuredClone(authoring),id=model.id===old.id?'TRUNK_SCULPT_'+crypto.randomUUID().replaceAll('-',''):model.id,copy={...structuredClone(model),id,calibration:structuredClone(old.calibration),physical_size_confirmed:!!old.physical_size_confirmed,guides:structuredClone(old.guides),binding:structuredClone(old.binding||{}),sculpt:{...structuredClone(model.sculpt||{version:1,primitives:[]}),needs_review:false}};
 const data=next.imported_trunks,mounts=new Set(data.mounts.filter(m=>m.asset_id===old.id).map(m=>m.id));data.assets=data.assets.filter(m=>m.id!==id);data.assets.push(copy);if(data.assets.length>16)throw Error('项目树干素材已满，请先整理未使用素材');
 for(const m of data.mounts)if(mounts.has(m.id)){m.asset_id=id;m.revision=copy.revision;}
 let anchors=0;const walk=value=>{if(!value||typeof value!=='object')return;if(value.asset_id===old.id&&mounts.has(value.mount_id)){value.asset_id=id;value.revision=copy.revision;anchors++;}for(const [key,item]of Object.entries(value))if(key!=='imported_trunks')walk(item);};walk(next);normalizeImportedTrunks(data);
 return {authoring:next,sourceId:old.id,targetId:id,mounts:mounts.size,anchors,units:authoring.branch_instances?.length||0,retainsSkeleton:true};
}
