// Only trusted undo/redo snapshots may reuse currently verified loaded resources.
// Opening a project always takes the complete validation/staging path.
export function canReuseHistoryResources(current,next){
 if(!current||!next||current.id!==next.id||current.actualHeightMeters!==next.actualHeightMeters||current.maskMode!==next.maskMode)return false;
 for(const key of ['resources','partMaterials','microdetail','uvRevision','uvMode','uvOptions','uvCutRules','treeUV','uvPacking','barkFlow','directionCorrections','flowTransition'])if(JSON.stringify(current[key])!==JSON.stringify(next[key]))return false;
 if(next.maskMode==='vertex'&&JSON.stringify(current.regions)!==JSON.stringify(next.regions))return false;
 return true;
}
