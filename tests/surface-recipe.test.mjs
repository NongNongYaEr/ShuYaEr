import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGrowthRuler } from '../web/surface-growth-ruler-data.js';
import { canopyField } from '../web/surface-canopy-field.js';
import { upgradeSurfaceRecipe,applySurfacePreset,resetSurfaceGroup } from '../web/surface-recipe.js';
import { createDefaultSurfaceRuler,SURFACE_LEAF_DEFAULTS } from '../web/surface-defaults.js';
test('approved creation and group resets use the screenshot defaults without changing load fallbacks',()=>{
 const r=createDefaultSurfaceRuler();assert.equal(r.stem_wander,.8);assert.equal(r.stem_span,.8);assert.equal(r.canopy_depth,.1);assert.equal(r.bottom,-.082);assert.equal(r.top,9.831);assert.deepEqual(r.height_density,[1,.9,.55,.2,.05]);assert.deepEqual(SURFACE_LEAF_DEFAULTS,{leaf_size:.17,foliage:6});
 const old=normalizeGrowthRuler({recipe_version:2,top:5});assert.equal(old.stem_wander,.28);assert.equal(old.canopy_depth,.32);
 const stems=resetSurfaceGroup(old,'stems');assert.equal(stems.stem_span,.8);assert.equal(stems.top,5);assert.equal(stems.canopy_depth,.32);
 const outline=resetSurfaceGroup(stems,'outline');assert.equal(outline.canopy_depth,.1);assert.equal(outline.top,5);
 const leaves=resetSurfaceGroup(outline,'leaves');assert.deepEqual(leaves.height_density,r.height_density);assert.equal(leaves.top,5);
});
test('old rules stay legacy; upgrades and presets preserve manual layers and independent seeds',()=>{
 const old=normalizeGrowthRuler({coverage:.4,seed:55,bottom:0,top:10});assert.equal(old.recipe_version,1);
 const next=upgradeSurfaceRecipe(old);assert.equal(old.recipe_version,1);assert.equal(next.main_density,.4);assert.equal(next.side_density,.4);
 const s={growth_ruler:next,guides:[{id:'manual',locked:true}],regions:[{id:'zone'}]};const manual=JSON.stringify([s.guides,s.regions]);applySurfacePreset(s,'uniform');assert.deepEqual(s.growth_ruler.height_density,[1,1,1,1,1]);assert.equal(JSON.stringify([s.guides,s.regions]),manual);
 s.growth_ruler.stem_seed=123;s.growth_ruler.leaf_seed=234;s.growth_ruler.gap_seed=345;
 assert.deepEqual(normalizeGrowthRuler(JSON.parse(JSON.stringify(s.growth_ruler))),s.growth_ruler);
 const reset=resetSurfaceGroup({...s.growth_ruler,canopy_ragged:2,leaf_spacing:.2},'leaves');assert.equal(reset.canopy_ragged,2);assert.equal(reset.leaf_spacing,.018);
});
test('modern height curve is a pure leaf probability multiplier at every location',()=>{
 const r=normalizeGrowthRuler({recipe_version:2,bottom:0,top:10,canopy_ragged:0,height_density:[1,1,1,1,1]});
 for(const mode of ['UNIFORM','CLUMP'])for(let i=0;i<150;i++){
  const p={x:i*.123,y:Math.sin(i),z:(i%100)/10},base=canopyField(p,{...r,distribution:mode}),half=canopyField(p,{...r,distribution:mode,height_density:[.5,.5,.5,.5,.5]});
  assert.ok(Math.abs(half.density-base.density*.5)<1e-12);assert.equal(half.mask,base.mask);assert.equal(half.depth,base.depth);assert.equal(half.frontier,base.frontier);
  if(mode==='UNIFORM')assert.equal(base.density,1);
 }
});
