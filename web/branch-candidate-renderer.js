import * as THREE from 'three';
import {hydrateImportedTrunkMaterials} from './imported-trunk-runtime.js';
import { buildBranchAsset, deserializeGeometry, disposeBranchAsset } from './branch-kernel.js';
import { bindGlbTextures } from './glb-export.js';
import { syncLeafMaterialVariants } from './leaf-material-data.js';
import { renderPlantThumbnail } from './project-thumbnail.js';

// Render each candidate independently; never restore it into the working draft.
export async function renderBranchCandidate(document, renderer) {
 // Build normalization can populate nested material defaults. Previews own their data.
 document={...document,settings:structuredClone(document.settings),authoring:structuredClone(document.authoring)};
 const sources=(document.leaf_meshes||[]).map(s=>({...s,geometry:deserializeGeometry(s.geometry)}));
 let asset;
 try {
  asset=buildBranchAsset({...document.settings,preview_lod:0},null,sources,0,document.authoring,{instanced:true});
  await bindGlbTextures(asset.materials.leaf,document.authoring.leaf_material);
  await Promise.all(syncLeafMaterialVariants(asset,bindGlbTextures));
  await Promise.all([...(asset.vegetation?.materials||[])].filter(m=>m.vegetationTexture).map(m=>bindGlbTextures(m,m.vegetationTexture)));
  if(asset.materials.flower&&document.authoring.flowering?.enabled)await bindGlbTextures(asset.materials.flower,document.authoring.flowering.material);
  if(document.authoring.imported_trunks)await hydrateImportedTrunkMaterials(asset.group);
  const box=new THREE.Box3().setFromObject(asset.group);
  return {image:renderPlantThumbnail(asset.group,renderer),report:{ok:asset.report.ok,triangles:asset.report.triangles,leaves:asset.placements.length,warnings:[...asset.report.warnings]},size:box.getSize(new THREE.Vector3()).toArray()};
 }finally{disposeBranchAsset(asset);sources.forEach(s=>s.geometry.dispose());}
}
