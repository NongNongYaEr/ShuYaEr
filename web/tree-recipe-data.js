import { copy } from './branch-workbench-data.js';
import { buildBranchAsset, disposeBranchAsset } from './branch-kernel.js';
import { skeletonBranches } from './skeleton-thickness.js';
import { normalizeAssemblySlots, inferAssemblySlots, resizeAssemblyInstances } from './branch-assembly.js';
import { recordGeneratedPlacements } from './assembly-distribution.js';
import { assemblyBranchLimit } from './local-assembly-data.js';
import { applyGrowthRules } from './assembly-growth.js';

export function prepareTreeRecipe(document, name) {
  // Formal whole-tree templates also use branch_shape for authored skeletons.
  // The workspace entry checks TREE mode; a shape alone is not a branch draft.
  if(document.authoring?.vine || document.workspaces?.active==='BRANCH') throw Error('请在整树工作区保存配方');
  const doc=copy(document);delete doc.workspaces;delete doc.history;delete doc.future;delete doc.selection;delete doc.pointIndex;
  if(doc.authoring.workbench)delete doc.authoring.workbench.project_save;
  doc.settings.object_name=String(name||doc.settings.object_name).trim().slice(0,80);
  doc.authoring.recipe={...doc.authoring.recipe,name:doc.settings.object_name};return doc;
}
const random=seed=>{let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};};
const seedNumber=value=>{const n=Number(value);if(!Number.isInteger(n)||n<1||n>2147483646)throw Error('种子须为 1–2147483646 的整数');return n;};

// Candidate materials and calibrated meshes are shared read-only. Neither a
// variant nor its thumbnail may mutate the current document or its formal assets.
export function generateTreeCandidates(source, options={}) {
  if(source.authoring?.vine||source.workspaces?.active==='BRANCH')throw Error('整树变体需要完整整树配方');
  const count=Number(options.count??4),seed=seedNumber(options.seed??12037);
  if(!Number.isInteger(count)||count<1||count>8)throw Error('候选数量须为 1–8');
  const ranges={height:Number(options.height??.12),width:Number(options.width??.16),density:Number(options.density??.15)};
  for(const value of Object.values(ranges))if(!Number.isFinite(value)||value<0||value>.5)throw Error('变化幅度须在 0–50%');
  let preview;
  try{
    preview=buildBranchAsset({...source.settings,preview_lod:0},null,[],0,source.authoring,{skeletonOnly:true});
    const bones=skeletonBranches(preview.masterBranches),byId=new Map(bones.map(b=>[b.id,b]));
    const roots=bones.filter(b=>!byId.has(b.parentId)).map(b=>b.stableId);
    if(!roots.length)throw Error('配方没有可用承重骨架');
    const lib=source.authoring.branch_library||[],slots=normalizeAssemblySlots(source.authoring.workbench?.assembly_slots||inferAssemblySlots(source.authoring.branch_instances,lib),lib);
    const managed=source.authoring.branch_instances.filter(i=>i.linked&&Object.values(slots).flat().includes(i.asset_id));
    const branchCount=bones.length+source.authoring.branch_instances.reduce((n,i)=>n+((i.shape||lib.find(a=>a.id===i.asset_id)?.shape)?.branches?.length||0),0);
    return Array.from({length:count},(_,index)=>{
      const n=1+(seed-1+index*104729)%2147483646,rng=random(n),factors=Object.fromEntries(Object.entries(ranges).map(([key,amount])=>[key,1+(rng()*2-1)*amount]));
      const light={...source.authoring,branch_library:[],leaf_material:null,tree_organs:source.authoring.tree_organs?{...source.authoring.tree_organs,units:[]}:null,flowering:{...source.authoring.flowering,material:null,source:null}};
      const a=copy(light);a.branch_library=lib;a.leaf_material=source.authoring.leaf_material;
      if(a.tree_organs)a.tree_organs.units=source.authoring.tree_organs.units;
      a.flowering.material=source.authoring.flowering?.material;a.flowering.source=source.authoring.flowering?.source;
      a.workbench={...a.workbench,tree_variant:{seed:n,factors,source:source.settings.object_name}};delete a.workbench.project_save;
      if(factors.height!==1||factors.width!==1){a.sculpt_layers.push({id:`TREE_VARIANT_${n}`,name:'整树变体 · 冠形',enabled:true,strength:1,branches:{},operation:{type:'ROOT_SCALE',targets:roots,scale:[factors.width,factors.width,factors.height],keepRoots:true}});a.active_sculpt_layer=`TREE_VARIANT_${n}`;}
      const target=Math.round(managed.length*factors.density);
      let error='';
      try{
        const old=new Set(a.branch_instances.map(i=>i.id));
        a.branch_instances=resizeAssemblyInstances(a.branch_instances,slots,lib,target,bones,assemblyBranchLimit(a),branchCount,a);
        recordGeneratedPlacements(a,a.branch_instances.filter(i=>!old.has(i.id)).map(i=>i.id));applyGrowthRules(a,bones);
      }catch(e){error=e.message;}
      const name=`${source.settings.object_name} · 变体 ${index+1} · ${n}`;
      const document={...source,settings:{...source.settings,object_name:name},authoring:a,leaf_meshes:source.leaf_meshes};delete document.workspaces;delete document.history;delete document.future;delete document.selection;delete document.pointIndex;delete document.camera;delete document.target;delete document.up;
      return {id:`TREE_${seed}_${index}`,name,document,factors,seed:n,error,selected:false};
    });
  }finally{if(preview)disposeBranchAsset(preview);}
}
