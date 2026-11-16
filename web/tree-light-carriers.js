export function isProceduralLightBranch(branch){
  return !branch.importedTrunkHost&&!branch.unitOwner&&!branch.instanceId&&!branch.sourceAssetId;
}

export function treeLightCarrierId(authoring, guide){
  const record=authoring?.tree_lights;
  if(!record||!guide)return undefined;
  if(record.kind==='procedural')return guide;
  const mount=authoring.imported_trunks?.mounts?.find(item=>item.id===record.mount&&item.asset_id===record.asset&&item.revision===record.revision);
  return mount?.guide_map?.[guide];
}

export function treeLightRingCenter(position, first, size, target){
  const opposite=first+(size-1)/2;
  return target.set((position.getX(first)+position.getX(opposite))*.5,
    (position.getY(first)+position.getY(opposite))*.5,
    (position.getZ(first)+position.getZ(opposite))*.5);
}

export function proceduralLightCarriers(asset){
  const branches=asset.masterBranches.filter(isProceduralLightBranch);
  const ids=new Set(branches.map(branch=>branch.stableId)),wood=[],rendered=new Set();
  asset.group.traverseVisible(mesh=>{
    const {category,stable_id,imported_trunk}=mesh.userData;
    if(!mesh.isMesh||mesh.isInstancedMesh||imported_trunk||!mesh.geometry.index||!ids.has(stable_id))return;
    if(category==='branch'){wood.push(mesh);rendered.add(stable_id);}
    else if(category==='junction')wood.push(mesh);
  });
  return {wood,branches:branches.filter(branch=>rendered.has(branch.stableId))};
}
