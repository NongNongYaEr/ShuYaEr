import {equalData} from './branch-workbench-data.js';
import {normalizeTrunkForms,isDirectTrunkForm} from './trunk-form.js';
import {encodeSweepBranch,unpackComputedGeometry} from './geometry-transfer.js';

const withoutForms=a=>{const {workbench,...rest}=a;const {trunk_forms,...other}=workbench||{};return {...rest,workbench:other};};
export async function prepareBackgroundTrunks(client,asset,previous,next,lod){
  if(!asset||!previous||!equalData(previous.settings,next.settings)||!equalData(previous.leaf_sources,next.leaf_sources)
    ||!equalData(withoutForms(previous.authoring),withoutForms(next.authoring)))return null;
  const before=normalizeTrunkForms(previous.authoring.workbench?.trunk_forms).branches,after=normalizeTrunkForms(next.authoring.workbench?.trunk_forms).branches;
  const changed=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(id=>!equalData(before[id],after[id]));if(!changed.length)return null;
  const geometries=new Map(),branches=new Map(asset.branches.map(b=>[b.stableId,b])),surfaces=new Map();asset.group.traverse(o=>{if(o.isMesh&&o.userData.category==='branch'&&!o.isInstancedMesh)surfaces.set(o.userData.stable_id,o.geometry);});
  try{for(const id of changed){
    const branch=branches.get(id);if(!branch||!surfaces.has(id))continue;
    if(branch.instanceId||branch.unitOwner||branch.sourceAssetId||branch.copySnapshot||branch.localBundle){for(const g of geometries.values())g.dispose();return null;}
    const form=after[id]||null,continuous=Boolean(asset.skeletonOnly||next.authoring.branch_library.length||Object.keys(after).length)&&(!form||isDirectTrunkForm(form));
    const result=await client.run({branch:encodeSweepBranch(branch),form,lodIndex:next.settings.preview_lod,adaptiveCurveDetail:next.settings.curvature_detail*lod.segment,settings:{...next.settings,wind_profile:next.authoring.wind_profile},radialSegments:Math.max(4,Math.round(next.settings.radial_segments*lod.radial)),continuousBark:continuous});
    geometries.set(id,unpackComputedGeometry(result.geometry));
  }return geometries;}catch(error){for(const g of geometries.values())g.dispose();throw error;}
}
