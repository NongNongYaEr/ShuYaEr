// Recover only operations with the exact signature of the old automatic
// smoothing migration. Authored curve edits and ordinary carriers stay intact.
// Keep the displaced records in portable project metadata; never rewrite a
// source GLB, saved project file, or immutable trunk asset during normalization.
export function recoverImportedTrunkCurveLayers(authoring){
 const hosts=new Set((authoring.imported_trunks?.mounts||[]).flatMap(m=>Object.values(m.guide_map)));
 if(!hosts.size||!authoring.sculpt_layers?.length)return authoring;
 const removed=[],layers=[];
 for(const layer of authoring.sculpt_layers){const op=layer.operation,automatic=/^SMOOTH_V1_\d+x*$/.test(layer.id)&&op?.type==='CONTROL_CURVE'&&hosts.has(op.root)&&layer.name===('统一平滑走势 · '+op.root).slice(0,64)&&op.targets?.length===1&&op.targets[0]===op.root;
  if(!automatic){layers.push(layer);continue;}removed.push(layer);
  if(Object.keys(layer.branches||{}).length){const {operation,...edits}=layer;layers.push({...edits,name:'保留调整 · '+op.root});}
 }
 if(!removed.length)return authoring;
 const previous=authoring.workbench?.imported_trunk_curve_recovery,archive=[...(previous?.version===1&&Array.isArray(previous.layers)?previous.layers:[])];for(const layer of removed)if(!archive.some(old=>old.id===layer.id&&JSON.stringify(old)===JSON.stringify(layer)))archive.push(layer);
 return {...authoring,sculpt_layers:layers,active_sculpt_layer:layers.some(l=>l.id===authoring.active_sculpt_layer)?authoring.active_sculpt_layer:layers.at(-1)?.id||'',workbench:{...authoring.workbench,imported_trunk_curve_recovery:{version:1,layers:archive}}};
}
