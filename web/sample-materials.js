import { normalizeLeafMaterial, sampleLeafMaterial } from './leaf-material-data.js';

// A private complete sample stores each foreign atlas once. Geometry sources
// carry a small reference; older projects with an inline material remain valid.
export function normalizeSampleMaterials(raw) {
  return Object.fromEntries(Object.entries(raw && typeof raw==='object' && !Array.isArray(raw)?raw:{})
    .slice(0,128).filter(([id,value])=>id&&value&&typeof value==='object')
    .map(([id,value])=>[String(id).slice(0,160),normalizeLeafMaterial(value)]));
}

export function sampleMaterialId(source) {
  return typeof source?.sampleLeafMaterialId==='string'?source.sampleLeafMaterialId.slice(0,160):'';
}

export function resolveSampleMaterial(source,authoring={},sample=null) {
  if(source?.sampleLeafMaterial&&typeof source.sampleLeafMaterial==='object')return source.sampleLeafMaterial;
  const id=sampleMaterialId(source);if(!id)return null;
  if(id==='BASE')return sample?sampleLeafMaterial(sample,authoring.branch_library||[],authoring.leaf_material):authoring.leaf_material;
  const own=sample?.authoring?.sample_materials?.[id]||authoring.sample_materials?.[id];if(own)return own;
  for(const item of authoring.branch_library||[]){
    const material=item.sample?.authoring?.sample_materials?.[id];if(material)return material;
    for(const version of item.versions||[]){const material=version.sample?.authoring?.sample_materials?.[id];if(material)return material;}
  }
  return null;
}

const sameMaterial=(a,b)=>['color','normal','cutoff','roughness'].every(key=>a?.[key]===b?.[key]);
const materialKey=material=>{let hash=2166136261;for(const key of ['color','normal','cutoff','roughness'])for(const c of String(material?.[key]||'')){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619)>>>0;}return 'MAT_'+hash.toString(16);};

// Merge a sample into the editable project's source palette without replacing
// an existing atlas that happens to have the same reference key.
export function importSampleMaterials(authoring,sample) {
  const references={},registry={...authoring.sample_materials};let changed=false;
  const add=(id,material)=>{let key=id,n=1;while(registry[key]&&!sameMaterial(registry[key],material))key=id+'_'+n++;
    if(!registry[key]){registry[key]=material;changed=true;}references[id]=key;return key;};
  for(const [id,material]of Object.entries(sample?.authoring?.sample_materials||{}))add(id,material);
  if([...(sample?.leaf_meshes||[]),...(sample?.authoring?.tree_organs?.units||[])].some(source=>sampleMaterialId(source)==='BASE')){
    const base=sampleLeafMaterial(sample,authoring.branch_library||[],authoring.leaf_material);
    references.BASE=sameMaterial(base,authoring.leaf_material)?'BASE':add(materialKey(base),base);
  }
  if(changed)authoring.sample_materials=registry;
  return {references,changed};
}

export function remapSampleMaterial(source,references) {
  const id=sampleMaterialId(source);return id&&references[id]&&references[id]!==id?{...source,sampleLeafMaterialId:references[id]}:source;
}
