import {isImmutableJson,sealImmutableJson} from './immutable-json.js';
import {normalizeBranchInstances} from './branch-workbench-data.js';
import {normalizeAssemblySlots} from './branch-assembly.js';

const key = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(value);
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
export const MESH_UNIT_LIMIT = 1600;

function normalizeSource(source,table) {
  if (isImmutableJson(source)) return source;
  const {model,connector} = source;
  if (!key(source.id) || !vector(connector?.position) || !vector(connector?.direction) || Math.hypot(...connector.direction) < 1e-7
    || !Array.isArray(model?.primitives) || !model.primitives.length || !Array.isArray(model.materials) || !Array.isArray(model.images)
    || !/^[a-f0-9]{64}$/.test(model.source?.sha256 || '')) throw Error('装配素材的模型或连接点无效。');
  const images = table ? model.images.map(image=>{
    const entry=table[image];
    if(!Number.isInteger(image)||!entry?.data)throw Error('装配素材贴图引用无效。');
    return entry;
  }) : model.images;
  return sealImmutableJson({...source,model:{...model,images},name:String(source.name||'装配素材').slice(0,120),revision:Math.max(1,Math.trunc(Number(source.revision)||1))});
}

export function normalizeMeshUnits(raw,previous) {
  if (!raw) return undefined;
  if (raw === previous) return raw;
  if (!Array.isArray(raw.assets) || !Array.isArray(raw.instances) || raw.assets.length > MESH_UNIT_LIMIT || raw.instances.length > MESH_UNIT_LIMIT)
    throw Error('叶花果装配数据超出实例预算。');
  const assets = raw.assets === previous?.assets ? raw.assets : raw.assets.map(source=>normalizeSource(source,raw.image_table));
  const rawById = new Map(raw.instances.map(instance=>[instance?.id,instance]));
  const instances = raw.instances === previous?.instances ? raw.instances : normalizeBranchInstances(raw.instances,previous?.instances).map(instance=>{
    const value = rawById.get(instance.id);
    const rotation = value?.rotation;
    const length = Array.isArray(rotation)&&rotation.length===4&&rotation.every(Number.isFinite) ? Math.hypot(...rotation) : 0;
    return {...instance,offset:vector(value?.offset)?value.offset:[0,0,0],rotation:length>1e-7?rotation.map(n=>n/length):[0,0,0,1],
      ...(value?.assembly_generated===true?{assembly_generated:true}:{})};
  });
  const known = new Set(assets.map(source=>source.id));
  if(known.size!==assets.length || instances.length!==raw.instances.length || instances.some(instance=>!known.has(instance.asset_id)||!instance.parent))
    throw Error('叶花果装配缺少素材、挂点或实例编号。');
  const slots=raw.slots?normalizeAssemblySlots(raw.slots,assets):undefined;
  return assets.length || instances.length ? {assets,instances,...(slots?{slots}:{})} : undefined;
}

export function packMeshUnitImages(data) {
  const image_table=[],indices=new Map();
  const assets=data.assets.map(source=>({...source,model:{...source.model,images:source.model.images.map(image=>{
    if(!indices.has(image.data)){indices.set(image.data,image_table.length);image_table.push(image);}
    return indices.get(image.data);
  })}}));
  return {assets,instances:data.instances,image_table,...(data.slots?{slots:data.slots}:{})};
}
