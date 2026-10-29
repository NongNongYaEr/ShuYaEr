// Data-only resource exchange. Constructive authoring is kept; editor recovery
// stacks and unrelated workspaces are deliberately outside a published asset.
import {unpackPrefab,portablePrefabAssets,normalizePrefabAssets} from './prefab-project-data.js';
import {validateBranchPrefab} from './branch-prefab-data.js';
import {normalizeTrunkPreset} from './trunk-preset-store.js';
import {normalizePlantUnitPack} from './plant-unit-data.js';
import {validateImportedTrunk,validateTrunkGuides,trunkCalibrationMatrix} from './imported-trunk-data.js';
export const PACK_TYPES={plant:'整株样板',trunk:'树干素材',prefab:'预制枝干',branch:'完整单元枝',units:'叶花果单元包',material:'材质与配方'};
export const PACK_FORMAT=1;
export const PACK_MIN_VERSION='0.2.22';
export const PACK_CURRENT_VERSION='0.2.52';
export const clone=value=>JSON.parse(JSON.stringify(value));
export function portableBranch(item,library=[],fallback=null){
  const result=clone(item);
  for(const v of [result,...(result.versions||[])])if(v.sample){
    const sample=v.sample,owner=library.find(a=>a.id===sample.material_asset_id);
    if(sample.material_asset_id&&!sample.authoring?.leaf_material){const m=owner?.sample?.authoring?.leaf_material;if(!m)throw Error('单元枝缺少共享材质：'+item.name);sample.authoring={...sample.authoring,leaf_material:clone(m)};}
    if(!sample.authoring?.leaf_material&&fallback)sample.authoring={...sample.authoring,leaf_material:clone(fallback)};
    delete sample.material_asset_id;delete sample.history;delete sample.future;
  }
  return result;
}
function referenced(value,ids=new Set()){
  if(!value||typeof value!=='object')return ids;
  if(Array.isArray(value)){if(value.length&&typeof value[0]!=='object')return ids;for(const v of value)referenced(v,ids);return ids;}
  for(const [key,v]of Object.entries(value)){if(key==='branch_library'||key==='prefab_assets')continue;if(['asset_id','material_asset_id','sourceAssetId','source_asset_id'].includes(key)&&typeof v==='string')ids.add(v);else referenced(v,ids);}
  return ids;
}
export function publishPlant(raw,{kind}={}){
  const doc=clone(raw),activeMode=doc.workspaces?.active||'TREE',active=doc.workspaces?.[activeMode.toLowerCase()];if(active){const shared=doc.prefab_assets;Object.assign(doc,active);if(shared)doc.prefab_assets=shared;}
  delete doc.history;delete doc.future;delete doc.curve_point_selection;
  const mode=(kind||activeMode)==='VINE'?'VINE':'TREE';doc.workspaces={version:2,active:mode,tree:null,branch:null,vine:null};
  const a=doc.authoring||{},library=a.branch_library||[],ids=referenced(a);
  // Include transitive material/source owners before resolving shared materials.
  for(let size=-1;size!==ids.size;){size=ids.size;for(const item of library.filter(x=>ids.has(x.id)))referenced(item,ids);}
  if(a.branch_library)a.branch_library=library.filter(x=>ids.has(x.id)).map(x=>portableBranch(x,library,a.leaf_material));
  if(doc.prefab_assets){const roots=new Set();function scan(v){if(!v||typeof v!=='object')return;if(Array.isArray(v)){if(v.length&&typeof v[0]!=='object')return;for(const x of v)scan(x);return;}if(typeof v.id==='string')roots.add(v.id);for(const [key,x]of Object.entries(v))if(!['branch_library','geometry','position','normal','uv','index'].includes(key))scan(x);}scan(a);doc.prefab_instances=(doc.prefab_instances||[]).filter(i=>roots.has(i.root));const assets=normalizePrefabAssets(doc.prefab_assets),keys=new Set(doc.prefab_instances.map(x=>x.definitionId));assets.items=assets.items.filter(x=>keys.has(x.id));doc.prefab_assets=portablePrefabAssets(assets);}
  if(a.workbench){delete a.workbench.project_save;delete a.workbench.references;delete a.workbench.reference;}
  return doc;
}
export function prefabPayload(raw){
  if(raw.kind==='branchforge-prefab-archive')return unpackPrefab({root:raw.root,resources:raw.resources});
  return raw;
}
export function validateAsset(type,value){
  if(!PACK_TYPES[type]||!value||typeof value!=='object')throw Error('资源类型或内容无效');
  if(type==='plant'&&(!value.settings||!value.authoring||value.version>4))throw Error('整株样板缺少造型数据或需要更新软件');
  if(type==='plant'&&((value.authoring.branch_library?.length||0)>100||(value.authoring.branch_instances?.length||0)>1600))throw Error('整株超出当前软件的素材或装配数量上限');
  if(type==='plant'){const library=value.authoring.branch_library||[];for(const i of value.authoring.branch_instances||[])if(i.asset_id&&!library.some(a=>a.id===i.asset_id))throw Error('整株缺少单元枝源模型：'+i.asset_id);}
  if(type==='trunk'){validateImportedTrunk(value);validateTrunkGuides(value.guides);trunkCalibrationMatrix(value.calibration);if(!value.source?.glb_base64||!/^[a-f0-9]{64}$/.test(value.source.sha256||''))throw Error('树干素材缺少原始 GLB');}
  if(type==='plant'&&value.authoring.imported_trunks){for(const model of value.authoring.imported_trunks.assets||[])validateAsset('trunk',model);for(const mount of value.authoring.imported_trunks.mounts||[])if(!value.authoring.imported_trunks.assets.some(a=>a.id===mount.asset_id&&a.revision===mount.revision))throw Error('整株树干素材版本缺失');}
  if(type==='prefab'){const p=validateBranchPrefab(prefabPayload(value));if(p.kind!=='branchforge-branch-prefab'||!Array.isArray(p.library)||!p.operation?.records?.length||!Array.isArray(p.copies))throw Error('预制枝干数据无效');for(const i of p.copies)if(i.asset_id&&!p.library.some(a=>a.id===i.asset_id))throw Error('预制缺少单元枝源模型');}
  if(type==='branch'&&(!value.id||!value.sample||!value.shape))throw Error('完整单元枝缺少源模型');
  if(type==='units'&&(!Array.isArray(value.units)||!value.units.length))throw Error('叶花果套装没有真实单元');
  if(type==='units')normalizePlantUnitPack(value);
  if(type==='material'&&(!value.data||!value.kind))throw Error('材质配方无效');
  if(type==='material')normalizeTrunkPreset(value.kind,{id:'trunk-preset-00000000000000000000000000000001',name:value.name||'配方',shape:value.data});
  // Texture references are embedded data; metadata may retain source names.
  const check=(v,depth=0)=>{if(depth>160)throw Error('资源层级过深');if(!v||typeof v!=='object')return;for(const [key,x]of Object.entries(v)){if(typeof x==='string'&&['thumbnail','color','normal','roughness_map','color_map','normal_map','alpha_map'].includes(key)&&/^(https?:|file:|blob:|[A-Za-z]:[\\/])/i.test(x))throw Error('模型或贴图仍引用外部文件，请先嵌入素材');if(x&&typeof x==='object')check(x,depth+1);}};check(value);return value;
}
export function describeDependencies(type,value){
  const p=type==='prefab'?prefabPayload(value):value;
  const lib=type==='plant'?p.authoring?.branch_library:type==='prefab'?p.library:[];
  const deps=(lib||[]).map(a=>({type:'branch',id:a.id,revision:a.revision||1,name:a.name||a.id,payload:portableBranch(a,lib)}));
  if(type==='plant')for(const asset of p.authoring?.imported_trunks?.assets||[])deps.push({type:'trunk',id:asset.id,revision:asset.revision,name:asset.name,payload:asset});
  const leaves=p.leaf_meshes||p.sample?.leaf_meshes||[],organs=p.organ_units||p.authoring?.tree_organs?.units||p.sample?.authoring?.tree_organs?.units||[];
  return {assets:deps,geometry:leaves.length+organs.length,note:'模型、纹理、校准、构造记录随资源固定保存'};
}
export function validatePackMetadata(raw){
  const text=(key,max,required=false)=>{if(raw?.[key]!=null&&typeof raw[key]!=='string')throw Error('资源包'+key+'格式无效');const v=String(raw?.[key]||'').trim();if((required&&!v)||v.length>max)throw Error('资源包'+key+'无效或过长');return v;};
  const id=text('id',100,true),version=text('version',40,true);if(!/^[a-zA-Z0-9_.-]+$/.test(id)||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))throw Error('包标识或版本无效，请使用 1.0.0 形式的版本');if(/[\u0000-\u001f\u007f]/.test(String(raw.name||'')))throw Error('包名不能包含换行或控制字符');
  const cover=text('cover',12000000);if(cover&&!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(cover))throw Error('封面格式无效');
  if(raw?.derivedFrom!=null&&(!Array.isArray(raw.derivedFrom)||raw.derivedFrom.length>1000))throw Error('资源包来源清单无效或过长');
  return {id,version,name:text('name',100,true),description:text('description',4000),author:text('author',160),tags:text('tags',500),license:text('license',2000),cover,minimumVersion:PACK_MIN_VERSION,format:PACK_FORMAT,derivedFrom:Array.isArray(raw?.derivedFrom)?raw.derivedFrom.map(x=>({id:String(x.id||'').slice(0,100),...(x.name?{name:String(x.name).slice(0,100)}:{}),version:String(x.version||'').slice(0,40),digest:String(x.digest||'').slice(0,64),author:String(x.author||'').slice(0,160),license:String(x.license||'').slice(0,2000)})):[]};
}
