// Independently compare each fallback GLB with its original embedded sample.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as k from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { exportGlb } from '../web/glb-export.js';
import { pveBranchConnector } from '../web/pve-export.js';
import { atlasKey } from '../scripts/pve-merged-atlas.mjs';
globalThis.FileReader ||= class { async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.();} };
const doc=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),output=process.argv[3];
const manifest=JSON.parse(fs.readFileSync(path.join(output,'complete_units.manifest.json')));
function decode(buffer){
 const length=buffer.readUInt32LE(12),data=JSON.parse(buffer.toString('utf8',20,20+length)),base=28+length;
 const accessor=i=>{const a=data.accessors[i],v=data.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5123:2,5125:4,5126:4}[a.componentType],method={5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];return Array.from({length:a.count*n},(_,j)=>buffer[method](base+(v.byteOffset||0)+(a.byteOffset||0)+Math.floor(j/n)*(v.byteStride||n*size)+j%n*size));};
 return data.meshes.flatMap(m=>m.primitives.map(p=>({material:data.materials[p.material].name,index:accessor(p.indices),attrs:Object.fromEntries(Object.entries(p.attributes).map(([key,i])=>[key,accessor(i)]))})));
}
for(const plan of manifest.units){
 const sample=doc.authoring.branch_library.find(a=>a.id===plan.base_id).sample;
 const authoring=normalizeAuthoring(sample.authoring,sample.settings.seed),connector=pveBranchConnector(authoring)||authoring.branch_shape.connector;
 const settings=k.normalizeSettings({...sample.settings,export_format:'GLB',export_lods:false,preview_lod:0,export_profile:'STANDARD',merge_by_material:true});
 const sources=sample.leaf_meshes.map(s=>({...s,geometry:k.deserializeGeometry(s.geometry)})),materials=k.createBranchMaterials(settings);
 let asset;
 try{
  asset=k.buildBranchAsset(settings,materials,sources,0,authoring);
  asset.group.traverse(node=>{for(const material of [node.material].flat().filter(Boolean))for(const key of Object.keys(material))if(material[key]?.isTexture)material[key]=null;});
  const reference=decode(Buffer.from(await exportGlb(asset.group,{connector,singleMesh:true}))),actual=decode(fs.readFileSync(path.join(output,plan.glb)));
  assert.equal(actual.length,reference.length);
  const region=manifest.merged_atlas.regions.find(r=>r.key===atlasKey(authoring.leaf_material)),layout=manifest.merged_atlas;
  for(let i=0;i<reference.length;i++){
   assert.equal(actual[i].material,reference[i].material);assert.deepEqual(actual[i].index,reference[i].index);
   for(const [key,values] of Object.entries(reference[i].attrs)){
    if(key==='TEXCOORD_0'){
     // glTF primitives can share one full-mesh accessor; inspect owned vertices.
     for(const vertex of new Set(reference[i].index))for(let component=0;component<2;component++){
      const j=vertex*2+component,v=values[j];
      const mapped=reference[i].material==='M_Leaf' ? Math.fround(component ? 1-(region.y+region.height)/layout.height+v*region.height/layout.height : (region.x+v*region.width)/layout.width) : v;
      assert.equal(actual[i].attrs[key][j],mapped,plan.id+': '+reference[i].material+' UV');
     }
    }else assert.deepEqual(actual[i].attrs[key],values);
   }
  }
 }finally{k.disposeBranchAsset(asset);k.disposeMaterials(materials);sources.forEach(s=>s.geometry.dispose());}
}
console.log('All 7 complete-unit GLBs preserve geometry and map leaf/organ UVs to their source atlas region.');
