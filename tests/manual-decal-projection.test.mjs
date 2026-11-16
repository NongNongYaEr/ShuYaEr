import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {instantiateLibraryEntry,EFFECT_LIBRARY_BUILTINS} from '../material/web/effect-library.js';
import {addManualDecal,makeManualDecal,validateManualDecal} from '../material/web/manual-decal-rules.js';
import {compileBurlEffects} from '../material/web/burl-compilation.js';
import {compileLocalPatches} from '../material/web/local-patch-analysis.js';
import {patchPreset} from '../material/web/local-patch-rules.js';
import {burlBarkFusion,burlDistributionKey,supportsBurlBarkFusion} from '../material/web/burl-effect.js';
import {validateEffectParams as validateServerEffectParams} from '../material/surface-effects.js';
import {packSurfaceRecipe,importSurfaceRecipe} from '../material/web/surface-recipe.js';
import {prepareMaterialBrush} from '../material/web/surface-material-brushes.js';
import {replacementSummary} from '../material/web/material-combinations.js';
const source='a'.repeat(64),doc=()=>{const d=createDocument({source,name:'局部投影',settings:{}});Object.assign(d.surface,{effects:[],layers:[],masks:[],areas:[]});return d;};
function placed(){const d=doc(),r=instantiateLibraryEntry(d,EFFECT_LIBRARY_BUILTINS.find(e=>e.recipeId==='O06-2'));d.surface=r.surface;const e=d.surface.effects[0];e.params.burlCount=1;e.manualDecal=makeManualDecal(d,e,{face:10,bary:[.2,.3,.5]});Object.assign(e.manualDecal,{widthMeters:.7,heightMeters:.7,depthMeters:.04});return d;}
function projectionFixture(){
 const faces=[
  [[-.04,-.04,0],[.04,-.04,0],[0,.04,0]],
  [[-.025,-.02,-.02],[-.025,.02,-.02],[.025,-.02,-.02]], // Opposite normal, disconnected.
  [[.05,-.1,-.068],[.055,-.1,.068],[.05,.1,-.068]], // Steep side crosses the depth planes.
  [[-.025,-.02,.02],[.025,-.02,.02],[-.025,.02,.02]], // Front, disconnected.
  [[-.025,-.02,-.04],[-.025,.02,-.04],[.025,-.02,-.04]], // Beyond negative depth.
  [[-.025,-.02,.04],[.025,-.02,.04],[-.025,.02,.04]], // Beyond positive depth.
  [[.11,0,.01],[.14,0,.01],[.11,.01,.01]], // Beyond width.
  [[-.02,.23,.01],[.02,.23,.01],[0,.25,.01]], // Beyond height.
  [[.08,.23,.01],[.13,.18,.01],[.14,.26,.01]], // Overlapping axis intervals, but misses the corner.
  [[-.2,-.25,.018],[.2,-.25,.018],[0,.25,.018]], // All corners outside, crosses the box.
 ];
 return {
  pos:Float32Array.from(faces.flat(2)),indices:Uint32Array.from({length:3*faces.length},(_,i)=>i),
  height:1,min:[-.2,-.25,-.068],max:[.2,.75,.068],sourceSHA256:source,
 };
}
const boxPoint={anchor:{face:0,bary:[.25,.25,.5]},widthMeters:.2,heightMeters:.4,depthMeters:.03,maxBendDegrees:5};
test('两种手动贴花点位均以投影盒覆盖断开、背向和侧面的相交几何',()=>{
 const d=placed(),mesh=projectionFixture(),effect=d.surface.effects[0];
 d.actualHeightMeters=1;
 Object.assign(effect.manualDecal,boxPoint);
 const before=mesh.pos.slice(),legacy=compileBurlEffects(mesh,d);
 assert.equal(legacy.analysis[0].manual,true);
 assert.equal(legacy.compilation.descriptors[0].channels[3],-1);
 assert.deepEqual([...legacy.compilation.faceMasks],[1,1,1,1,0,0,0,0,0,1]);
 validateDocument(d);

 effect.manualDecals=[{...effect.manualDecal,id:'point',enabled:true,rotation:90}];
 delete effect.manualDecal;
 const rotated=compileBurlEffects(mesh,d).compilation;
 assert.equal(rotated.descriptors[0].channels[3],-1);
 assert.equal(rotated.faceMasks[6],1); // Rotation brings this face into width.
 assert.equal(rotated.faceMasks[4],0);
 assert.deepEqual(mesh.pos,before);
 validateDocument(d);
});
test('自动与雕刻局部投射继续限制在连通表面，手动投影盒保留指定部位',()=>{
 const mesh=projectionFixture(),partId='a4607361-119d-4082-8aaa-99037f1ea562';
 const patch={...patchPreset('burl'),...boxPoint,id:'a'.repeat(16),name:'贴花',enabled:true};
 const parts={groups:[{id:partId,faces:[0,1]}]};
 const raw={version:1,sourceSHA256:source,patches:[patch,{...patch,type:'cut',id:'b'.repeat(16)}]};
 const automatic=compileLocalPatches(mesh,raw,parts,{actualHeightMeters:1});
 assert.deepEqual([...automatic.faceMasks],[3,0,0,0,0,0,0,0,0,0]);
 const manualOptions={actualHeightMeters:1,projectedIds:new Set([patch.id])};
 const mixed=compileLocalPatches(mesh,raw,parts,manualOptions);
 assert.notEqual(mixed.key,automatic.key);
 assert.deepEqual([...mixed.faceMasks],[3,1,1,1,0,0,0,0,0,1]);
 const scoped=compileLocalPatches(mesh,{...raw,patches:[{...patch,partId}]},parts,manualOptions);
 assert.deepEqual([...scoped.faceMasks],[1,1,0,0,0,0,0,0,0,0]);
});
test('移动旋转尺寸进入缓存键；无效锚点、跨模型和多数量记录被拒绝',()=>{const d=placed(),e=d.surface.effects[0],key=JSON.stringify(burlDistributionKey(e));e.manualDecal.rotation=35;assert.notEqual(JSON.stringify(burlDistributionKey(e)),key);assert.throws(()=>validateManualDecal(e.manualDecal,'b'.repeat(64)),/源模型/);assert.throws(()=>validateManualDecal({...e.manualDecal,widthMeters:NaN},source));e.params.burlCount=2;assert.throws(()=>validateDocument(d),/单个/);});
test('旧愈痕使用样式默认融合，编辑外观时复用已有的手动投影',()=>{
 const draft=placed(),effect=draft.surface.effects[0];
 effect.params.burlStyle=12;
 delete effect.params.burlBarkFusion;
 const restored=validateDocument(draft).surface.effects[0];
 const projection=burlDistributionKey(restored);
 assert.equal(restored.params.burlBarkFusion,-1);
 assert.equal(burlBarkFusion(restored.params),1);
 for(const value of [0,.42,1]){
  effect.params.burlBarkFusion=value;
  const saved=validateDocument(draft).surface.effects[0];
  assert.equal(burlBarkFusion(saved.params),value);
  assert.deepEqual(validateServerEffectParams('burl',effect.params),saved.params);
  assert.deepEqual(burlDistributionKey(saved),projection);
 }
 assert.equal(burlBarkFusion({...restored.params,burlStyle:13,burlBarkFusion:1}),0);
});
test('旧细枝瘤眼允许读取已保存的融合值，渲染使用瘤眼自身材质',()=>{
 const draft=placed(),effect=draft.surface.effects[0];
 Object.assign(effect.params,{burlStyle:6,burlBarkFusion:1});
 const saved=validateDocument(draft).surface.effects[0];
 assert.deepEqual(validateServerEffectParams('burl',effect.params),saved.params);
 assert.equal(saved.params.burlBarkFusion,1);
 assert.equal(supportsBurlBarkFusion(saved.params.burlStyle),false);
 assert.equal(burlBarkFusion(saved.params),0);
 assert.deepEqual(saved.manualDecal,effect.manualDecal);
});
test('跨模型效果预设保留外观、清手动定位；材质画笔重建空白笔触而不失效',()=>{const d=placed(),other=doc();other.resources.source='b'.repeat(64);const imported=importSurfaceRecipe(packSurfaceRecipe(d),other);assert(!imported.surface.effects[0].manualDecal);assert.equal(imported.surface.effects[0].params.burlCount,0);assert(imported.warnings.length);const brush=prepareMaterialBrush(doc(),'whitewash'),result=importSurfaceRecipe(packSurfaceRecipe(brush.document),other);assert.equal(result.surface.effects[0].manualBrush.presetId,'whitewash');assert.equal(result.surface.masks[0].initial,0);assert.equal(result.surface.masks[0].items[0].type,'paint');assert(result.surface.areas.every(a=>a.sourceSHA256===other.resources.source&&!a.strokes.length));});
test('新增贴花保存悬停时计算的尺寸和深度，保留已有手放贴花',()=>{
 const d=placed(),effect=d.surface.effects[0];
 const existing=structuredClone(effect.manualDecal),hit={face:12,bary:[.2,.5,.3]};
 const projection={...existing,anchor:hit,widthMeters:.048,heightMeters:.072,depthMeters:.012};
 const id=addManualDecal(d,effect,hit,projection);
 const [old,added]=validateDocument(d).surface.effects[0].manualDecals;
 assert.deepEqual(old,{...existing,id:'legacy',enabled:true});
 assert.deepEqual(added,{...projection,id,enabled:true});
});
