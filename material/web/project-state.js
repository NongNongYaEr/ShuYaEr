import {featuredBarkOptions} from './featured-bark.js';
import {validateSculptMaterial} from './sculpt-material-rules.js';
import {sculptBarkOptions} from './sculpt-bark-generator.js';
import {validateMeshOptimization} from './mesh-optimization.js';
import {validatePartSuggestionOptions} from './part-suggestion-rules.js';
import {validateMicrodetail} from './microdetail-rules.js';
import {validateBarkFlow,validateDirectionCorrections} from './bark-flow-rules.js';
import {PROJECT_RESOURCE_LIMIT} from './project-limits.js';
import {validateCutRules} from './uv-guide-rules.js';
import {defaultLayers,validateLayers} from './material-layers.js';
import {validateScope} from './region-scope.js';
import {validateParts} from './surface-parts.js';
import {validatePartMaterials,partMaterialResources} from './part-materials.js';
import {validateTreeUvOptions} from './tree-uv-rules.js';
import {validateSurface,legacySurface} from './surface-effects.js';
export const PROJECT_VERSION=25;
const hash=/^[a-f0-9]{64}$/;
export function validateDocument(raw){
  if(raw?.kind!=='tree-material-project'||![1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,PROJECT_VERSION].includes(raw.version))throw Error('不支持的工程版本。');
  if(raw.featuredBark!=null){raw={...raw,featuredBark:featuredBarkOptions(raw.featuredBark)};if(!/^[a-f0-9]{64}$/.test(raw.resources?.featuredBarkSource||''))throw Error('特色树皮缺少可编辑源素材。');}
  if(raw.sculptBark!=null){raw={...raw,sculptBark:sculptBarkOptions(raw.sculptBark)};if(!/^[a-f0-9]{64}$/.test(raw.resources?.sculptBarkSource||''))throw Error('雕刻树皮缺少可编辑来源。');}
  if(raw.featuredBarkTransitionGroup!=null&&!/^[a-f0-9-]{36}$/.test(raw.featuredBarkTransitionGroup))throw Error('特色树皮过渡组无效。');
  const sourceVersion=raw.version;raw=structuredClone(raw);if(raw.version===1){raw.version=PROJECT_VERSION;raw.maskMode='vertex';raw.layers=defaultLayers({legacy:true});}raw.version=PROJECT_VERSION;
  if(raw.sculptMaterial!=null)raw.sculptMaterial=validateSculptMaterial(raw.sculptMaterial,raw.resources?.source);
  if(raw.sculptMaterial?.evidence?.actualHeightMeters!==raw.actualHeightMeters&&raw.sculptMaterial?.evidence)delete raw.sculptMaterial.evidence;
  if(!['vertex','pixel'].includes(raw.maskMode))throw Error('遮罩精度模式无效。');raw.layers=validateLayers(raw.layers);raw.uvCutRules=validateCutRules(raw.uvCutRules);raw.microdetail=validateMicrodetail(raw.microdetail);
  if(!/^[a-f0-9-]{36}$/.test(raw.id)||typeof raw.name!=='string'||raw.name.length>180)throw Error('工程标识无效。');
  if(!Number.isFinite(raw.actualHeightMeters)||raw.actualHeightMeters<.1||raw.actualHeightMeters>200)throw Error('树高需要在0.1–200米之间。');
  if(!raw.resources||typeof raw.resources!=='object'||Array.isArray(raw.resources)||Object.values(raw.resources).some(v=>v!=null&&!hash.test(v))||new Set(Object.values(raw.resources).filter(Boolean)).size>PROJECT_RESOURCE_LIMIT)throw Error('工程素材引用无效或超过32项。');
  for(const key of ['source','working','bark','ao','height','roughness','normal'])if(raw.resources?.[key]!=null&&!hash.test(raw.resources[key]))throw Error('工程素材引用无效。');
  if(!hash.test(raw.resources?.source||''))throw Error('工程缺少源模型。');
  if(raw.meshOptimization!=null)raw.meshOptimization=validateMeshOptimization(raw.meshOptimization,raw.resources);
  raw.parts=validateParts(raw.parts,raw.resources.source);raw.partSuggestionOptions=validatePartSuggestionOptions(raw.partSuggestionOptions);
  raw.partMaterials=validatePartMaterials(raw.partMaterials,raw.parts);raw.resources=partMaterialResources(raw.resources,raw.partMaterials);if(new Set(Object.values(raw.resources).filter(Boolean)).size>PROJECT_RESOURCE_LIMIT)throw Error('工程素材引用超过32项。');
  raw.barkFlow=validateBarkFlow(raw.barkFlow,raw.resources.source);raw.directionCorrections=validateDirectionCorrections(raw.directionCorrections);raw.flowTransition=raw.flowTransition??1;if(!Number.isFinite(raw.flowTransition)||raw.flowTransition<0||raw.flowTransition>3||(!raw.barkFlow&&raw.directionCorrections.length))throw Error('枝干流向配置无效。');
  if(!raw.settings||typeof raw.settings!=='object'||Array.isArray(raw.settings)||JSON.stringify(raw.settings).length>20000)throw Error('材质参数无效。');
  if(JSON.stringify(raw).length>(raw.surface?.effects?.some(e=>e.paint)?8000000:2000000))throw Error('工程状态超过容量限制。');
  if(raw.bake&&!([16,32,64].includes(raw.bake.aoSamples)))throw Error('AO采样设置无效。');
  if(!Number.isInteger(raw.uvRevision)||raw.uvRevision<0)throw Error('UV版本无效。');
  if(raw.uvOptions){const r=raw.uvOptions;if(r.revision!==raw.uvRevision||!Array.isArray(r.pins)||r.pins.length>128||r.pins.some(i=>!Number.isInteger(i)||i<0||i>2000000)||new Set(r.pins).size!==r.pins.length||!r.weights||Object.keys(r.weights).length>2000||Object.entries(r.weights).some(([id,v])=>!/^\d+$/.test(id)||Number(id)>2000000||!Number.isFinite(v)||v<.5||v>4))throw Error('UV重排规则无效。');}
  if(!['original','repack','unwrap','tree'].includes(raw.uvMode))throw Error('UV模式无效。');raw.treeUV=validateTreeUvOptions(raw.treeUV);
  if(![1024,2048,4096].includes(raw.output?.resolution)||!Number.isInteger(raw.output?.padding)||raw.output.padding<0||raw.output.padding>32)throw Error('输出设置无效。');
  if(raw.output.includeModel!=null&&typeof raw.output.includeModel!=='boolean')throw Error('模型导出设置无效。');
  if(!Array.isArray(raw.regions)||raw.regions.length>6)throw Error('图层遮罩无效。');
  const layers=new Set();for(const r of raw.regions){if(!['moss','paint','lichen','dirt','wet','aging'].includes(r.layer)||layers.has(r.layer)||!['all','painted'].includes(r.mode)||!Array.isArray(r.strokes)||r.strokes.length>512)throw Error('图层遮罩结构无效。');layers.add(r.layer);for(const s of r.strokes){if(!Number.isInteger(s.face)||s.face<0||s.face>2000000||!Array.isArray(s.bary)||s.bary.length!==3||s.bary.some(v=>!Number.isFinite(v)||v<0||v>1)||Math.abs(s.bary.reduce((a,v)=>a+v,0)-1)>1e-4||!Number.isFinite(s.radiusMeters)||s.radiusMeters<.01||s.radiusMeters>20||![0,1].includes(s.value)||(s.operation!=null&&s.operation!=='smooth')||(s.operation==='smooth'&&raw.maskMode!=='pixel')||!Number.isFinite(s.hardness)||s.hardness<0||s.hardness>1||!Number.isFinite(s.strength)||s.strength<0||s.strength>1)throw Error('笔触数据无效。');}}
  for(const region of raw.regions)if(region.scope!=null)region.scope=validateScope(region.scope);
  for(const region of raw.regions)if(region.partId!=null&&(raw.maskMode!=='pixel'||!raw.parts.groups.some(group=>group.id===region.partId)))throw Error('部位范围需要像素模式和有效的部位选区。');
  raw.surface=validateSurface(raw.surface,raw,{allowLegacy:sourceVersion<14});
  if(JSON.stringify(raw).length>(raw.surface?.effects?.some(e=>e.paint)?8000000:2000000))throw Error('工程状态超过容量限制。');
  return structuredClone(raw);
}
export function createDocument({source,name,settings,bark=null,actualHeightMeters=10,id=crypto.randomUUID()}){const doc={kind:'tree-material-project',version:PROJECT_VERSION,id,name,sourceName:name,actualHeightMeters,resources:{source,bark,working:null},settings,uvRevision:0,uvMode:'original',output:{resolution:2048,padding:3},regions:[],layers:defaultLayers(),maskMode:'pixel',createdAt:new Date().toISOString()};doc.surface=legacySurface(doc);return validateDocument(doc);}
export class History{
  constructor(limit=80){this.limit=limit;this.past=[];this.future=[];this.current=null;}
  reset(document){this.current=validateDocument(document);this.past=[];this.future=[];return this.value;}
  get value(){return this.current&&structuredClone(this.current);}
  commit(document){const next=validateDocument(document);if(JSON.stringify(next)===JSON.stringify(this.current))return false;if(this.current)this.past.push(this.current);if(this.past.length>this.limit)this.past.shift();let bytes=JSON.stringify(next).length;for(let i=this.past.length-1;i>=0;i--){bytes+=JSON.stringify(this.past[i]).length;if(bytes>96*1024*1024&&i<this.past.length-1){this.past.splice(0,i+1);break;}}this.current=next;this.future=[];return true;}
  undo(){if(!this.past.length)return null;this.future.push(this.current);this.current=this.past.pop();return this.value;}
  redo(){if(!this.future.length)return null;this.past.push(this.current);this.current=this.future.pop();return this.value;}
}
export class TaskGate{
  constructor(){this.epoch=0;this.active=null;}
  begin(kind,cancel=()=>{}){this.cancel();const task={kind,epoch:this.epoch,cancel};this.active=task;return task;}
  accepts(task){return this.active===task&&task.epoch===this.epoch;}
  finish(task){if(this.accepts(task))this.active=null;}
  cancel(){this.epoch++;const task=this.active;this.active=null;task?.cancel();}
}
