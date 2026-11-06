import {validateEmission} from './web/emission-rules.js';
import {validateManualDecal} from './web/manual-decal-rules.js';
import {validateManualMaterialBrush} from './web/material-brush-rules.js';
import {burlSettings} from './burl-effect.js';
import {validateEdgeTreatment} from './edge-treatment.js';
import {validatePublicDistribution} from './distribution-template-rules.js';
import {DISTRIBUTION_FIELDS,validateDistributionParams,validateDistributionState} from './distribution-modes.js';
import {validateBlend,validateBlendReferences,enableBlend} from './material-blend.js';
import {STABLE_FIELDS} from './stable-distribution.js';
import {validateMaterialPaint} from './material-paint.js';
import {EXTRA_EFFECT_TYPES} from './surface-extra-effects.js';
import {leafLayer,migrateLayerTree,validateLayerTree,duplicateLayer} from './surface-layers.js';
// Surface authoring schema. IDs identify instances; type names never identify instances.
import {LAYER_IDS,LAYER_NAMES,LAYER_CHANNELS} from './material-layers.js';
import {validateScope} from './region-scope.js';
export const SURFACE_VERSION=8,MAX_EFFECTS=16,MAX_MASKS=48,MAX_AREAS=64,MAX_RULES=16;
const number=(label,min,max,step,value,unit='',group='material')=>({kind:'number',label,min,max,step,value,unit,group});
const color=(label,value)=>({kind:'color',label,value,group:'material'});
const bool=(label,value,group='material')=>({kind:'boolean',label,value,group});
export const EFFECT_TYPES={
 ...EXTRA_EFFECT_TYPES,
 moss:{name:'苔藓',fields:{mossEnabled:bool('启用生成',true),moss:number('旧版覆盖量',0,.85,.01,.28,'','legacy'),mossColor:color('颜色','#465336'),mossRough:number('粗糙度',.2,1,.01,.92),mossNormalStrength:number('自身法线',0,3,.05,1.2),mossFiberMm:number('叶簇细起伏',0,3,.05,1,'mm'),mossPorosity:number('疏松程度',0,1,.01,.6),mossThicknessMm:number('团簇起伏',0,20,.1,4,'mm'),mossClumpCm:number('团簇尺寸',1,20,.1,2.5,'cm'),mossAO:number('微AO',0,1,.05,.65)}},
 paint:{name:'白漆',fields:{paintEnabled:bool('启用生成',true),paintColor:color('颜色','#e4e2d5'),paintRough:number('粗糙度',.2,1,.01,.9),paintNormalStrength:number('自身法线',0,3,.05,.35),paintBarkNormal:number('保留树皮法线',0,1,.05,1),paintAO:number('微AO',0,1,.05,.25),paintHeight:number('旧版高度',0,.5,.005,.135,'','legacy'),paintWear:number('素材细小磨损',0,1,.01,.35),paintCoverage:number('旧版覆盖上限',0,1,.01,.9,'','legacy'),paintDepthAmount:number('旧版起伏影响',0,1,.05,.65,'','legacy'),paintDepthContrast:number('旧版遮罩对比',.25,4,.05,1.2,'','legacy'),paintPeel:number('旧版大片剥落',0,1,.01,0,'','legacy'),paintPeelSizeCm:number('旧版斑块尺寸',5,100,1,30,'cm','legacy'),paintPeelEdge:number('旧版边缘过渡',0,1,.01,.15,'','legacy'),paintPeelDetail:number('旧版碎裂',0,1,.01,.7,'','legacy'),paintPeelChips:number('旧版零散掉漆',0,1,.01,.35,'','legacy')}},
 lichen:{name:'地衣',fields:{lichenEnabled:bool('启用生成',true),lichen:number('覆盖量',0,.8,.01,.25),lichenColor:color('颜色','#97a173'),lichenRough:number('粗糙度',.2,1,.01,.95),lichenNormal:number('自身起伏',0,3,.05,1)}},
 dirt:{name:'泥污',fields:{dirtEnabled:bool('启用生成',true),dirt:number('强度',0,1,.01,.4),dirtColor:color('颜色','#291d11'),dirtRough:number('粗糙度',.2,1,.01,.94),dirtNormal:number('自身起伏',0,3,.05,1)}},
 wet:{name:'湿痕',fields:{wetEnabled:bool('启用生成',true),wet:number('湿润程度',0,1,.01,.3),wetDarken:number('颜色加深',0,.8,.01,.42),wetRough:number('湿润粗糙度',.05,1,.01,.28)}},
 aging:{name:'色差',fields:{variation:number('色差强度',0,1,.01,.22)}}
};
export const EFFECT_IDS=[...LAYER_IDS,...Object.keys(EXTRA_EFFECT_TYPES)];
export const effectChannels=type=>EFFECT_TYPES[type].channels||LAYER_CHANNELS[type];
export const effectLayerKind=type=>EFFECT_TYPES[type].layerKind||(['wet','aging'].includes(type)?'adjustment':'material');
export const RULE_TYPES={
 distribution:{name:'统一自动分布',source:true,fields:DISTRIBUTION_FIELDS},
 treeauto:{name:'稳定形体分布',source:true,dependency:'stable',fields:STABLE_FIELDS},
 treeweather:{name:'老树形体分布',source:true,dependency:'weathering',fields:{role:number('分布角色',0,5,1,0),scale:number('识别尺度',.25,4,.05,1),rootHeightMeters:number('根部附着高度',.1,20,.05,1.85,'m'),density:number('覆盖强度',0,2,.05,1),seed:number('随机种子',0,10000,1,0)}},
 legacy:{name:'原表面遮罩',source:true,fields:{}},
 constant:{name:'固定填充',source:true,fields:{value:number('填充值',0,1,.01,1)}},
 area:{name:'区域引用',source:true,fields:{}},
 height:{name:'高度范围',source:true,fields:{minMeters:number('起点',0,200,.05,0,'m'),maxMeters:number('终点',0,200,.05,1.5,'m'),featherMeters:number('柔边',0,20,.01,.1,'m')}},
 ao:{name:'模型AO',source:true,dependency:'ao',fields:{threshold:number('选取阈值',0,1,.01,.4),softness:number('过渡',.001,.5,.01,.12)}},
 curvature:{name:'模型曲率',source:true,dependency:'curvature',fields:{threshold:number('选取阈值',0,1,.01,.4),softness:number('过渡',.001,.5,.01,.12)}},
 noise:{name:'斑驳噪声',source:true,fields:{sizeMeters:number('斑块尺寸',.01,10,.01,.3,'m'),threshold:number('破碎程度',0,1,.01,.4),softness:number('过渡',.001,.5,.01,.12),seed:number('随机种子',0,10000,1,3)}},
 paint:{name:'手绘修正',source:false,fields:{}},
 orientation:{name:'表面朝向',source:true,fields:{threshold:number('朝向阈值',-1,1,.05,.25),softness:number('柔和过渡',.01,1,.01,.25)}},
 streaks:{name:'垂直条流',source:true,fields:{widthMeters:number('条流宽度',.005,2,.005,.035,'m'),lengthMeters:number('延伸长度',.05,20,.05,1.2,'m'),threshold:number('稀疏程度',0,1,.01,.48),softness:number('边缘过渡',.001,.5,.01,.12),seed:number('随机种子',0,10000,1,3)}},
 invert:{name:'反相处理',source:false,fields:{}},
 levels:{name:'色阶处理',source:false,fields:{contrast:number('对比度',.1,8,.05,1.3),balance:number('平衡',-.9,.9,.01,0)}}
};
export const MASK_COMBINES=['replace','add','intersect','subtract'];
export const MASK_COMBINE_NAMES={replace:'替换',add:'增加',intersect:'保留交集',subtract:'扣除',paint:'手绘修正',filter:'处理上一步'};
const identifier=/^[A-Za-z0-9_-]{1,64}$/;
function fail(message){throw Error(message);}
function checkId(id){if(typeof id!=='string'||!identifier.test(id))fail('表面对象标识无效。');return id;}
function checkName(name){if(typeof name!=='string'||!name.trim()||name.length>100)fail('表面对象名称无效。');return name.trim();}
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function defaults(fields){return Object.fromEntries(Object.entries(fields).map(([k,d])=>[k,d.value]));}
export function validateEffectParams(type,raw={}){const fields=EFFECT_TYPES[type]?.fields;if(!fields||!object(raw))fail('不支持的材质效果类型或参数。');const result=defaults(fields);for(const[k,v]of Object.entries(raw)){const d=fields[k];if(!d)fail('未知效果参数：'+k);if(d.kind==='number'&&(!Number.isFinite(v)||v<d.min||v>d.max))fail('效果参数超出范围：'+d.label);if(d.kind==='boolean'&&typeof v!=='boolean')fail('效果开关无效。');if(d.kind==='color'&&(typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v)))fail('效果颜色无效。');result[k]=v;}if(type==='burl')burlSettings(result);return result;}
export function validateStroke(s){if(!object(s)||!Number.isInteger(s.face)||s.face<0||s.face>2000000||!Array.isArray(s.bary)||s.bary.length!==3||s.bary.some(v=>!Number.isFinite(v)||v<0||v>1)||Math.abs(s.bary.reduce((a,v)=>a+v,0)-1)>1e-4||!Number.isFinite(s.radiusMeters)||s.radiusMeters<.01||s.radiusMeters>20||![0,1].includes(s.value)||s.operation!=null&&s.operation!=='smooth'||!Number.isFinite(s.hardness)||s.hardness<0||s.hardness>1||!Number.isFinite(s.strength)||s.strength<0||s.strength>1)fail('表面区域笔触无效。');return structuredClone(s);}
export function legacySurface(document){
 const areas=[],masks=[],effects=[];for(const l of document.layers){const type=l.id,id='legacy-'+type,r=document.regions.find(r=>r.layer===type)||{layer:type,mode:'all',strokes:[]},areaId='legacy-area-'+type,maskId='legacy-mask-'+type;
  areas.push({id:areaId,name:LAYER_NAMES[type]+'原表面遮罩',kind:'surface',sourceSHA256:document.resources.source,mode:r.mode,strokes:structuredClone(r.strokes),scope:r.scope||null,partId:r.partId||null,ownedBy:id,legacyPrecision:document.maskMode});
  masks.push({id:maskId,name:EFFECT_TYPES[type].name+'分布',initial:1,items:[{id:'legacy-rule-'+type,type:'legacy',enabled:true,strength:1,combine:'replace',params:{},areaRef:areaId}]});
  const params={};for(const k of Object.keys(EFFECT_TYPES[type].fields))if(k in document.settings)params[k]=document.settings[k];
  effects.push({id,type,name:LAYER_NAMES[type],enabled:l.enabled,locked:l.locked,opacity:l.opacity,seed:l.seed,channels:structuredClone(l.channels),params:validateEffectParams(type,params),maskRef:maskId,scopeRef:null,coverageMode:'legacy',legacyBinding:type});
 }
 return{version:SURFACE_VERSION,active:false,effects,masks,areas,layers:effects.map(e=>leafLayer(e.id)),analysis:{curvature:{radiusMeters:.1}}};
}
export function validateSurface(raw,document,{allowLegacy=false}={}){
 if(raw==null){if(!allowLegacy)fail('工程缺少表面实例数据。');raw=legacySurface(document);}
 if(!object(raw)||![1,2,3,4,5,6,7,SURFACE_VERSION].includes(raw.version)||typeof raw.active!=='boolean'||!Array.isArray(raw.effects)||raw.effects.length>MAX_EFFECTS||!Array.isArray(raw.masks)||raw.masks.length>MAX_MASKS||!Array.isArray(raw.areas)||raw.areas.length>MAX_AREAS)fail('表面实例、分布或区域数量无效。');
 const s=structuredClone(raw);if(s.version===1){s.layers=migrateLayerTree(s);s.version=SURFACE_VERSION;}s.version=SURFACE_VERSION;const all=new Set(),ids=items=>new Set(items.map(x=>{checkId(x.id);if(all.has(x.id))fail('表面对象标识重复。');all.add(x.id);return x.id;}));
 const effectIds=ids(s.effects),maskIds=ids(s.masks),areaIds=ids(s.areas),parts=new Set(document.parts.groups.map(p=>p.id));
 for(const a of s.areas){a.name=checkName(a.name);if(a.presetOwned!=null&&typeof a.presetOwned!=='boolean')fail('区域预设归属标记无效。');if(!['surface','height','part'].includes(a.kind)||a.sourceSHA256!==document.resources.source)fail('区域来源与当前模型不一致。');a.scope=validateScope(a.scope);if(a.partId!=null&&!parts.has(a.partId))fail('区域引用的部位不存在。');if(a.ownedBy!=null&&!effectIds.has(a.ownedBy))fail('局部区域缺少所属效果。');if(a.kind==='surface'){if(!['all','painted'].includes(a.mode)||!Array.isArray(a.strokes)||a.strokes.length>512)fail('手绘区域结构无效。');a.strokes=a.strokes.map(validateStroke);if(a.legacyPrecision!=null&&!['vertex','pixel'].includes(a.legacyPrecision))fail('原区域精度无效。');}else{a.strokes=[];if(a.kind==='height'&&!a.scope)fail('高度区域缺少范围。');if(a.kind==='part'&&!a.partId)fail('部位区域缺少源面组。');}}
 for(const m of s.masks){m.name=checkName(m.name);if(!Number.isFinite(m.initial)||m.initial<0||m.initial>1||!Array.isArray(m.items)||m.items.length>MAX_RULES)fail('分布规则结构无效。');for(const r of m.items){checkId(r.id);if(all.has(r.id))fail('分布规则标识重复。');all.add(r.id);const d=RULE_TYPES[r.type];if(!d||typeof r.enabled!=='boolean'||!Number.isFinite(r.strength)||r.strength<0||r.strength>1||!object(r.params))fail('分布规则参数无效。');if(d.source?!MASK_COMBINES.includes(r.combine):r.combine!==(r.type==='paint'?'paint':'filter'))fail('分布组合方式无效。');const p=defaults(d.fields);for(const[k,v]of Object.entries(r.params)){const f=d.fields[k];if(!f||!Number.isFinite(v)||v<f.min||v>f.max)fail('分布参数超出范围。');p[k]=v;}r.params=r.type==='distribution'?validateDistributionParams(p):p;
   if(r.type==='legacy'||r.type==='area'){if(!areaIds.has(r.areaRef))fail('分布引用区域不存在。');}
   if(r.type==='paint'&&(!areaIds.has(r.addRef)||!areaIds.has(r.eraseRef)))fail('手绘修正缺少增加/擦除区域。');
   if(r.type==='ao'&&!['cavity','open'].includes(r.polarity)||r.type==='curvature'&&!['convex','concave'].includes(r.polarity))fail('AO或曲率选取意图无效。');
   if(r.type==='orientation'&&!['up','down','positiveX','negativeX','positiveZ','negativeZ'].includes(r.polarity))fail('表面朝向无效。');
   if(['treeweather','treeauto'].includes(r.type)&&(!Number.isInteger(p.role)||!Number.isInteger(p.seed)))fail('老树分布角色或种子必须为整数。');
   if(r.type==='height'&&p.maxMeters<p.minMeters)fail('高度范围终点小于起点。');
 }}
 const legacyBindings=new Set();for(const e of s.effects){e.name=checkName(e.name);if(!EFFECT_IDS.includes(e.type)||!maskIds.has(e.maskRef)||e.scopeRef!=null&&!areaIds.has(e.scopeRef)||!['legacy','rules'].includes(e.coverageMode)||typeof e.enabled!=='boolean'||typeof e.locked!=='boolean'||!Number.isFinite(e.opacity)||e.opacity<0||e.opacity>1||!Number.isInteger(e.seed)||e.seed<0||e.seed>10000||!object(e.channels)||['color','roughness','height'].some(c=>typeof e.channels[c]!=='boolean')||e.channels.ao!=null&&typeof e.channels.ao!=='boolean')fail('效果实例参数无效。');e.params=validateEffectParams(e.type,e.params);if(e.emission!=null)e.emission=validateEmission(e.emission);if(e.edgeTreatment!=null)e.edgeTreatment=validateEdgeTreatment(e.edgeTreatment);if(e.blend!=null)e.blend=validateBlend(e.blend);if(e.distribution!=null)e.distribution=validateDistributionState(e.distribution);if(e.publicDistribution!=null)e.publicDistribution=validatePublicDistribution(e.publicDistribution);if(e.manualDecal!=null){e.manualDecal=validateManualDecal(e.manualDecal,document.resources.source);if(e.type!=='burl'||e.params.burlCount!==1)fail('手动贴花需要单个表面贴花实例。');}if(e.manualBrush!=null){e.manualBrush=validateManualMaterialBrush(e.manualBrush,e.type);if(e.paint||e.distribution||!s.masks.find(m=>m.id===e.maskRef)?.items.some(r=>r.type==='paint'))fail('材质绘制层缺少笔触或混用了自动分布。');}if(e.paint!=null){if(e.type!=='moss'||e.legacyBinding)fail('材质绘制层不能绑定自动效果。');e.paint=validateMaterialPaint(e.paint,document.resources.source);}if(e.legacyBinding!=null){if(e.legacyBinding!==e.type||legacyBindings.has(e.type))fail('旧版效果绑定重复或无效。');legacyBindings.add(e.type);}}
 if(s.effects.filter(e=>e.type==='burl').reduce((n,e)=>n+e.params.burlCount,0)>8)fail('表面贴花总数量最多8个（包括隐藏图层），请减少其他树瘤层数量。');
 const c=s.analysis?.curvature;if(!c||!Number.isFinite(c.radiusMeters)||c.radiusMeters<.001||c.radiusMeters>20)fail('模型曲率分析尺度无效。');
 if(c.preparedFor!=null){const p=c.preparedFor;if(!object(p)||p.sourceSHA256!==document.resources.source||!Number.isFinite(p.actualHeightMeters)||p.actualHeightMeters<.1||p.actualHeightMeters>200||!Number.isFinite(p.radiusMeters)||p.radiusMeters<.001||p.radiusMeters>20)fail('曲率准备记录无效。');}
 validateLayerTree(s,all);validateBlendReferences(s);
 if(JSON.stringify(s).length>(s.effects.some(e=>e.paint)?6000000:1000000))fail('表面规则与笔触超过容量。');return s;
}
export function syncLegacySurface(document){const s=structuredClone(document.surface);if(!s)return legacySurface(document);for(const e of s.effects){if(!e.legacyBinding)continue;const l=document.layers.find(l=>l.id===e.legacyBinding);if(!l)continue;for(const k of ['enabled','locked','opacity','seed','channels'])e[k]=structuredClone(l[k]);const values={};for(const k of Object.keys(EFFECT_TYPES[e.type].fields))if(k in document.settings)values[k]=document.settings[k];e.params=validateEffectParams(e.type,values);const m=s.masks.find(m=>m.id===e.maskRef);for(const r of m.items)if(r.type==='legacy'){const a=s.areas.find(a=>a.id===r.areaRef),old=document.regions.find(r=>r.layer===e.type)||{mode:'all',strokes:[]};if(a){a.mode=old.mode;a.strokes=structuredClone(old.strokes);a.scope=old.scope||null;a.partId=old.partId||null;a.legacyPrecision=document.maskMode;}}}return s;}
export function effectSettings(effect,base){return{...base,...effect.params};}
export function createRule(type,{id=crypto.randomUUID(),...extra}={}){const d=RULE_TYPES[type];if(!d)fail('不支持的分布规则。');return{id,type,enabled:true,strength:1,combine:type==='paint'?'paint':['levels','invert'].includes(type)?'filter':type==='noise'?'intersect':type==='curvature'?'subtract':'replace',params:defaults(d.fields),...(type==='ao'?{polarity:'cavity'}:type==='curvature'?{polarity:'convex'}:type==='orientation'?{polarity:'up'}:{}),...extra};}
export function addEffect(surface,type,{id=crypto.randomUUID(),actualHeightMeters=10,sourceSHA256}={}){if(surface.effects.length>=MAX_EFFECTS)fail('当前版本最多支持16个效果实例。');if(!EFFECT_TYPES[type])fail('不支持的效果类型。');const s=structuredClone(surface);s.layers=migrateLayerTree(s);const maskId=crypto.randomUUID(),params=validateEffectParams(type),items=[];if(type==='paint')items.push(createRule('height',{params:{minMeters:0,maxMeters:actualHeightMeters*.135,featherMeters:.015}}));if(type==='moss'||type==='lichen'||type==='algae'||type==='cork')items.push(createRule('noise'));if(type==='dust')items.push(createRule('orientation'));if(type==='stain')items.push(createRule('streaks'));s.masks.push({id:maskId,name:EFFECT_TYPES[type].name+'分布',initial:1,items});s.effects.push(enableBlend({id,type,name:EFFECT_TYPES[type].name+' '+(s.effects.filter(e=>e.type===type).length+1),enabled:true,locked:false,opacity:1,seed:0,channels:{color:effectChannels(type).includes('color'),roughness:effectChannels(type).includes('roughness'),height:effectChannels(type).includes('height'),ao:effectChannels(type).includes('ao')},params,maskRef:maskId,scopeRef:null,coverageMode:'rules'}));s.layers.push(leafLayer(id));s.active=true;return{s,id};}
export function cloneMask(surface,id,{independentOwnedAreasFor=null}={}){const m=structuredClone(surface.masks.find(m=>m.id===id));if(!m)fail('分布不存在。');const remap=new Map();m.id=crypto.randomUUID();m.name+=' · 独立';for(const r of m.items){r.id=crypto.randomUUID();for(const k of ['areaRef','addRef','eraseRef'])if(r[k]){const a=surface.areas.find(a=>a.id===r[k]);if(a&&(a.ownedBy||r.type==='paint')&&independentOwnedAreasFor){if(!remap.has(a.id)){const copy=structuredClone(a);copy.id=crypto.randomUUID();copy.ownedBy=independentOwnedAreasFor;surface.areas.push(copy);remap.set(a.id,copy.id);}r[k]=remap.get(a.id);}}}surface.masks.push(m);return m.id;}
export function duplicateEffect(surface,id){return duplicateLayer(surface,id);}
export function surfaceUses(surface,maskId){return surface.effects.filter(e=>e.maskRef===maskId);}
export function appendPaintRule(surface,effectId,sourceSHA256){const s=structuredClone(surface),e=s.effects.find(e=>e.id===effectId);if(!e)fail('效果不存在。');const m=s.masks.find(m=>m.id===e.maskRef);if(m.items.length>=MAX_RULES)fail('每套分布最多16条规则。');const addRef=crypto.randomUUID(),eraseRef=crypto.randomUUID();for(const[id,name]of[[addRef,'手绘增加'],[eraseRef,'手绘擦除']])s.areas.push({id,name,kind:'surface',sourceSHA256,mode:'painted',strokes:[],scope:null,partId:null,ownedBy:effectId});const r=createRule('paint',{addRef,eraseRef});m.items.push(r);s.active=true;return{s,id:r.id};}
