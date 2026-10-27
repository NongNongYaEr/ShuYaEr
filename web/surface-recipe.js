import { createDefaultSurfaceRuler } from './surface-defaults.js';
import { normalizeGrowthRuler } from './surface-growth-ruler-data.js';
export const SURFACE_PRESETS={
 uniform:{name:'均匀铺设',note:'只改自动叶层：均匀分布、全高 100%、关闭额外留空。',values:{distribution:'UNIFORM',height_density:[1,1,1,1,1],leaf_gap_ratio:0}},
 climb:{name:'下密上疏',note:'只改自动叶层：均匀分布，沿高度叶量为 100 / 90 / 55 / 20 / 5%。',values:{distribution:'UNIFORM',height_density:[1,.9,.55,.2,.05]}},
 bare:{name:'裸藤带叶簇',note:'只改自动叶层：成簇分布、逐渐稀疏、额外留空 25%。',values:{distribution:'CLUMP',height_density:[.8,.6,.35,.15,.05],leaf_gap_ratio:.25}},
 bridge:{name:'桥底垂落',note:'开启共用的边缘垂落，长度 1.8m、长短错落 35%；自动叶层改为下密上疏。需实际到达桥底，保留手绘路线。',values:{distribution:'CLUMP',height_density:[1,.9,.65,.4,.2]},surface:{auto_hang:true,hang_length:1.8,hang_variation:.35}}
};
export function upgradeSurfaceRecipe(r){return normalizeGrowthRuler({...r,recipe_version:2,main_density:r.coverage,side_density:r.coverage,distribution:'UNIFORM',stem_seed:r.seed,leaf_seed:r.seed,gap_seed:r.seed});}
export function applySurfacePreset(surface,id){const p=SURFACE_PRESETS[id];if(!p||surface.growth_ruler?.recipe_version!==2)return;surface.growth_ruler=normalizeGrowthRuler({...surface.growth_ruler,...p.values});Object.assign(surface,p.surface||{});}
export const RECIPE_GROUPS={stems:['main_density','side_density','stem_wander','stem_span'],leaves:['distribution','height_density','leaf_spacing'],outline:['canopy_depth','canopy_clump','canopy_ragged','frontier_span','leaf_gap_ratio','leaf_gap_size']};
export function resetSurfaceGroup(r,group){const defaults=createDefaultSurfaceRuler();return normalizeGrowthRuler({...r,...Object.fromEntries((RECIPE_GROUPS[group]||[]).map(k=>[k,defaults[k]]))});}
