import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSurfaceGrowth } from '../web/surface-growth-data.js';
import { createGuideSelection, drawingRecipe, patchGuideParameters, recipeFromGuide } from '../web/surface-guide-workflow.js';
const mesh={id:'workflow-wall',position:[0,0,0,4,0,0,0,0,4],index:[0,1,2]};
const fixture=()=>normalizeSurfaceGrowth({mesh,guides:[{id:'a',anchors:[{face:0,point:[1,0,1]}],bundle:{count:3,width:.5,follow:.8},config:{spread:.3,density:2,radius:.003}},{id:'b',anchors:[{face:0,point:[2,0,1]}],bundle:{count:5,width:1,follow:.6},config:{spread:1,density:5,radius:.007}},{id:'c',locked:true,anchors:[{face:0,point:[2,0,1]}]}]});
const context={vine:{stem:.004},seed:123};
test('editing one route remembers its effective recipe for a new independent route; recipe survives project normalization',()=>{
 const s=fixture(),other=structuredClone(s.guides[1]);patchGuideParameters(s,['a'],'bundle','width',1.4,context);patchGuideParameters(s,['a'],'config','spread',.8,context);
 const recipe=drawingRecipe(s,context.vine,context.seed);assert.equal(recipe.bundle.width,1.4);assert.equal(recipe.config.spread,.8);assert.equal(recipe.config.radius,.003);assert.equal(recipe.config.density,2);assert.deepEqual(s.guides[1],other);
 assert.deepEqual(normalizeSurfaceGrowth(JSON.parse(JSON.stringify(s))).draw_recipe,s.draw_recipe);
 recipe.config.spread=1.5;assert.equal(s.draw_recipe.config.spread,.8);
});
test('mixed selection edits only the touched field and preserves locked routes and existing per-route differences',()=>{
 const s=fixture(),locked=structuredClone(s.guides[2]);const n=patchGuideParameters(s,['a','b','c'],'config','density',8,context);
 assert.equal(n,2);assert.equal(s.guides[0].config.density,8);assert.equal(s.guides[1].config.density,8);assert.equal(s.guides[0].config.radius,.003);assert.equal(s.guides[1].config.radius,.007);assert.equal(s.guides[0].bundle.width,.5);assert.equal(s.guides[1].bundle.width,1);assert.deepEqual(s.guides[2],locked);assert.equal(s.draw_recipe.config.density,8);
});
test('recipe-only editing never changes existing routes; a wholly locked edit does not change recipe either',()=>{
 const s=fixture(),before=structuredClone(s.guides);patchGuideParameters(s,['a','b'],'bundle','count',7,{...context,recipeOnly:true});assert.deepEqual(s.guides,before);const recipe=structuredClone(s.draw_recipe);assert.equal(patchGuideParameters(s,['c'],'bundle','count',2,context),0);assert.deepEqual(s.draw_recipe,recipe);
});
test('bundle changes skip eaves while shared growth fields support both route types',()=>{
 const s=fixture();s.guides[1].type='EAVE';s.guides[1].bundle=null;assert.equal(patchGuideParameters(s,['a','b'],'bundle','count',6,context),1);assert.equal(s.guides[1].bundle,null);assert.equal(patchGuideParameters(s,['a','b'],'config','hang_length',4,context),2);assert.equal(s.guides[1].config.hang_length,4);
});
test('selection supports modifiers, clearing, route additions, deletion and mesh replacement without persisting stale IDs',()=>{
 const guides=fixture().guides,selection=createGuideSelection();selection.sync(guides,'a','mesh');selection.select('a',guides);selection.select('c',guides,{range:true});assert.deepEqual(selection.ids,['a','b','c']);selection.select('b',guides,{toggle:true});assert.deepEqual(selection.ids,['a','c']);selection.clear();selection.sync(guides,'a','mesh');assert.deepEqual(selection.ids,[]);
 selection.sync([...guides,{id:'d'},{id:'e'}],'e','mesh');assert.deepEqual(selection.ids,['d','e']);selection.sync(guides,'a','mesh');assert.deepEqual(selection.ids,[]);selection.sync(guides,'b','other-mesh');assert.deepEqual(selection.ids,['b']);selection.all(guides);assert.equal(selection.ids.length,3);
});
test('using a primary recipe does not copy locks, path points, suppression or trims',()=>{
 const s=fixture(),g=s.guides[0];g.locked=true;g.trim=.5;g.enabled=false;const recipe=recipeFromGuide(s,g,context.vine,context.seed);assert.deepEqual(Object.keys(recipe).sort(),['bundle','config']);assert.equal(recipe.bundle.width,.5);
});
