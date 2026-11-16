import {test} from 'node:test';import assert from 'node:assert/strict';
import {DISTRIBUTION_TEMPLATES,applyDistributionTemplate,validatePublicDistribution} from '../material/web/distribution-templates.js';
import {createDocument,validateDocument,History} from '../material/web/project-state.js';
import {addEffect,appendPaintRule,createRule} from '../material/web/surface-effects.js';
import {editPaintWear,paintWearRule,switchDistribution} from '../material/web/distribution-presets.js';
const document=()=>createDocument({source:'a'.repeat(64),name:'公共分布模板',settings:{}});
test('十二套公共模板均可事务采用，对普通材质只显示兼容项',()=>{const d=document(),id=d.surface.effects[0].id;assert.equal(DISTRIBUTION_TEMPLATES.length,12);for(const t of DISTRIBUTION_TEMPLATES.filter(t=>!t.decal)){const next=applyDistributionTemplate(d,id,t.id);assert.equal(validateDocument(next).surface.effects[0].publicDistribution.id,t.id);assert.deepEqual(next.resources,d.resources);assert.equal(next.uvRevision,d.uvRevision);assert.deepEqual(next.surface.effects[0].params,d.surface.effects[0].params);}assert.throws(()=>applyDistributionTemplate(d,id,'D12'),/贴花/);assert.equal(d.surface.effects[0].publicDistribution,undefined);});
test('高度模板可恢复原混合条件，换普通模式不会遗留隐藏高度约束',()=>{const d=document(),id=d.surface.effects[0].id,a=applyDistributionTemplate(d,id,'D11'),b=applyDistributionTemplate(a,id,'D11'),c=applyDistributionTemplate(b,id,'D03');assert.equal(a.surface.effects[0].blend.conditions.height,'cavity');assert.equal(b.surface.effects[0].publicDistribution.previousHeight.height,'off');assert.equal(c.surface.effects[0].blend.conditions.height,'off');const direct=switchDistribution(a,id,'flow');assert.equal(direct.surface.effects[0].blend.conditions.height,'off');assert.equal(direct.surface.effects[0].publicDistribution,undefined);});
test('数量散布遵守总预算，包括隐藏贴花，失败不修改原工程',()=>{let d=document(),a=addEffect(d.surface,'burl');d.surface=a.s;const first=a.id;a=addEffect(d.surface,'burl');d.surface=a.s;const second=a.id;d.surface.effects.find(e=>e.id===second).enabled=false;const next=applyDistributionTemplate(d,first,'D12');assert.equal(next.surface.effects.find(e=>e.id===first).params.burlCount,4);assert.equal(next.surface.effects.find(e=>e.id===first).publicDistribution.id,'D12');d.surface.effects.find(e=>e.id===first).params.burlCount=0;d.surface.effects.find(e=>e.id===second).params.burlCount=8;const before=JSON.stringify(d);assert.throws(()=>applyDistributionTemplate(d,first,'D12'),/数量已满/);assert.equal(JSON.stringify(d),before);});
test('锁定层和非法模板记录受到校验',()=>{const d=document(),id=d.surface.effects[0].id;d.surface.effects[0].locked=true;assert.throws(()=>applyDistributionTemplate(d,id,'D01'),/解锁/);assert.throws(()=>validatePublicDistribution({version:1,id:'D99'}));assert.throws(()=>validatePublicDistribution({version:1,id:'D11',heightOwned:true,previousHeight:{}}));});

function paintEffect(d,id){return d.surface.effects.find(e=>e.id===id);}
function paintMask(d,id){return d.surface.masks.find(m=>m.id===paintEffect(d,id).maskRef);}

function oldPaintDocument({curvature=false,painted=false}={}){
 const d=document(),{s,id}=addEffect(d.surface,'paint');
 d.surface=s;
 const mask=paintMask(d,id);
 Object.assign(mask.items[0].params,{maxMeters:1.6,featherMeters:.1});
 mask.items.push(createRule('noise',{combine:curvature?'intersect':'subtract',params:{sizeMeters:.35,threshold:.4,softness:.12,seed:3}}));
 if(curvature)mask.items.push(createRule('curvature',{params:{threshold:.15,softness:.1}}));
 if(painted){
  d.surface=appendPaintRule(d.surface,id,d.resources.source).s;
  const correction=paintMask(d,id).items.at(-1);
  d.surface.areas.find(a=>a.id===correction.eraseRef).strokes.push({face:0,bary:[1,0,0],radiusMeters:.1,hardness:.5,strength:1,value:0});
  const scope={id:crypto.randomUUID(),name:'树干范围',kind:'height',sourceSHA256:d.resources.source,mode:'all',strokes:[],scope:{kind:'height',min:0,max:.4,feather:.03},partId:null,ownedBy:id};
  d.surface.areas.push(scope);
  paintEffect(d,id).scopeRef=scope.id;
 }
 return{d:validateDocument(d),id};
}

test('白漆快捷参数定位旧扣除规则，忽略关闭、无强度和被高度覆盖的斑驳规则',()=>{
 const {d,id}=oldPaintDocument(),effect=paintEffect(d,id),mask=paintMask(d,id),[height,noise]=mask.items;
 assert.equal(paintWearRule(d.surface,effect),noise);
 assert.equal(noise.params.threshold,.4);
 noise.enabled=false;
 assert.equal(paintWearRule(d.surface,effect),null);
 noise.enabled=true;
 noise.strength=0;
 assert.equal(paintWearRule(d.surface,effect),null);
 noise.strength=1;
 mask.items=[noise,height];
 assert.equal(paintWearRule(d.surface,effect),null);
 mask.items=[height,noise,createRule('noise',{combine:'subtract'})];
 assert.equal(paintWearRule(d.surface,effect),null);
 const curvature=createRule('curvature');
 mask.items=[height,noise,curvature];
 assert.equal(paintWearRule(d.surface,effect),curvature);
});

test('调整凸处磨损只改选中的规则，保留手绘和作用范围，强度可归零后恢复',()=>{
 const {d,id}=oldPaintDocument({curvature:true,painted:true});
 const before=structuredClone(d),original=paintWearRule(d.surface,paintEffect(d,id));
 const muted=editPaintWear(d,id,{params:{threshold:.32,softness:.04},strength:0});
 assert.deepEqual(paintWearRule(muted.surface,paintEffect(muted,id)),{...original,params:{threshold:.32,softness:.04},strength:0});
 const active=editPaintWear(muted,id,{strength:.95});
 assert.deepEqual(paintMask(active,id).items,paintMask(before,id).items.map(rule=>rule.id===original.id?{...rule,params:{threshold:.32,softness:.04},strength:.95}:rule));
 assert.deepEqual(paintEffect(active,id),paintEffect(before,id));
 assert.deepEqual(active.surface.areas,before.surface.areas);
 assert.deepEqual(d,before);
 assert.throws(()=>editPaintWear(active,id,{params:{softness:0}}),/范围/);
 const history=new History();
 history.reset(d);
 assert.equal(history.commit(active),true);
 assert.deepEqual(history.undo(),d);
 assert.deepEqual(history.redo(),active);
});

test('白漆快捷编辑分离共享蒙版并拒绝修改锁定层',()=>{
 const {d,id}=oldPaintDocument({painted:true}),originalMask=paintMask(d,id);
 const sibling=addEffect(d.surface,'paint');
 d.surface=sibling.s;
 const effect=paintEffect(d,sibling.id),unused=effect.maskRef;
 effect.maskRef=originalMask.id;
 effect.locked=true;
 d.surface.masks=d.surface.masks.filter(m=>m.id!==unused);
 const changed=editPaintWear(d,id,{params:{threshold:.6}});
 assert.notEqual(paintMask(changed,id).id,originalMask.id);
 assert.equal(paintWearRule(changed.surface,paintEffect(changed,id)).params.threshold,.6);
 assert.deepEqual(paintMask(changed,sibling.id),originalMask);
 assert.equal(paintWearRule(changed.surface,paintEffect(changed,sibling.id)).params.threshold,.4);
 const painted=paintMask(changed,id).items.at(-1),original=originalMask.items.at(-1);
 assert.notEqual(painted.eraseRef,original.eraseRef);
 assert.deepEqual(changed.surface.areas.find(a=>a.id===painted.eraseRef).strokes,d.surface.areas.find(a=>a.id===original.eraseRef).strokes);
 assert.throws(()=>editPaintWear(changed,sibling.id,{params:{threshold:.5}}),/解锁/);
});
