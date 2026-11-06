export const FIXED_TRUNK_ROOT='@';
export const TRUNK_WEIGHT_VERTEX_LIMIT=250000;

const surfaceKey=model=>model.material_workflow?.geometryKey||model.source?.sha256;
const fail=()=>{throw Error('树干权重修复与当前网格或骨架不匹配');};

export function trunkWeightRepairs(model){
 const repairs=model.binding?.weight_repairs,result=new Map();
 if(repairs===undefined)return result;
 if(repairs?.version!==1||!/^[a-f0-9]{64}$/.test(repairs.surface)||repairs.surface!==surfaceKey(model)||!Array.isArray(repairs.meshes))fail();
 const guides=new Set(model.guides?.map(g=>g.id)),meshes=new Map(model.primitives.map(p=>[p.id,p.geometry.position.length/3]));
 let total=0;
 for(const mesh of repairs.meshes){
  const count=meshes.get(mesh?.id);
  if(!count||result.has(mesh.id)||!Array.isArray(mesh.vertices)||!mesh.vertices.length)fail();
  if((total+=mesh.vertices.length)>TRUNK_WEIGHT_VERTEX_LIMIT)fail();
  const vertices=new Map();let previous=-1;
  for(const entry of mesh.vertices){
   if(!Array.isArray(entry)||entry.length!==2)fail();
   const [index,target]=entry;
   if(!Number.isInteger(index)||index<=previous||index>=count||target!==FIXED_TRUNK_ROOT&&!guides.has(target))fail();
   vertices.set(index,target);previous=index;
  }
  result.set(mesh.id,vertices);
 }
 return result;
}

export function withTrunkWeightEdits(model,edits){
 const maps=trunkWeightRepairs(model);let changed=0;
 for(const [id,items] of edits){
  const vertices=maps.get(id)||new Map();maps.set(id,vertices);
  for(const [index,target] of items){
   if(vertices.get(index)===(target??undefined))continue;
   if(target==null)vertices.delete(index);else vertices.set(index,target);
   changed++;
  }
 }
 if(!changed)return {model,changed};
 const binding={...model.binding};
 const meshes=[...maps].filter(([,items])=>items.size).map(([id,items])=>({id,vertices:[...items].sort(([a],[b])=>a-b)}));
 if(meshes.length)binding.weight_repairs={version:1,surface:surfaceKey(model),meshes};else delete binding.weight_repairs;
 const next={...model,binding};trunkWeightRepairs(next);
 return {model:next,changed};
}

export function removeTrunkWeightGuides(binding,removed){
 const repairs=binding.weight_repairs;
 if(!repairs)return binding;
 const meshes=repairs.meshes.map(mesh=>({...mesh,vertices:mesh.vertices.filter(([,id])=>!removed.has(id))})).filter(mesh=>mesh.vertices.length);
 if(meshes.length)return {...binding,weight_repairs:{...repairs,meshes}};
 const next={...binding};delete next.weight_repairs;return next;
}
