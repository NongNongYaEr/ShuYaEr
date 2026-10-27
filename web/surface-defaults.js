import { normalizeGrowthRuler } from './surface-growth-ruler-data.js';

// User-approved surface ivy defaults, 2026-09-28. Stored lengths remain metres.
// Keep separate from deserialization fallbacks so existing projects keep their look.
export const SURFACE_LEAF_DEFAULTS=Object.freeze({leaf_size:.17,foliage:6});
export const SURFACE_RULER_DEFAULTS=Object.freeze({
 recipe_version:2,enabled:true,visible:true,
 bottom:-.082,top:9.831,
 main_density:.9,side_density:.9,stem_wander:.8,stem_span:.8,
 distribution:'UNIFORM',leaf_spacing:.018,leaf_gap_ratio:0,leaf_gap_size:.6,
 height_density:Object.freeze([1,.9,.55,.2,.05]),
 canopy_ragged:.7,frontier_span:1.6,canopy_depth:.1,canopy_clump:.85
});
export function createDefaultSurfaceRuler(range={}){
 return normalizeGrowthRuler({...SURFACE_RULER_DEFAULTS,...range});
}
