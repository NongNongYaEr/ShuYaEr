import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { exportGlb } from '../web/glb-export.js';
import { packageTransaction, validatePackage, hash } from '../scripts/pve-package.mjs';
import { validatePVESkeleton } from '../web/pve-skeleton-export.js';

globalThis.FileReader ||= class { async readAsArrayBuffer(blob) { this.result=await blob.arrayBuffer();this.onloadend?.(); } };
async function fixture(out, source) {
 const s={format:'BranchForgePVESkeleton',version:2,kind:'whole_plant',coordinate_system:{handedness:'right',up:'Z',unit:'meter',point_space:'source_local'},
  branches:[{id:'root',parent_id:null,parent_t:null,order:0,instance_id:null,points:[{t:0,position_m:[0,0,0],radius_m:.1},{t:1,position_m:[0,0,1],radius_m:.01}]}],
  foliage_sources:[{id:'classA',name:'classA'}],foliage:[{id:'UNIT_i',branch_id:'root',branch_t:1,source_index:0,position_m:[0,0,1],up:[0,0,1],face:[1,0,0],scale_m:1,radial_scale:1}]};
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));g.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1],2));g.setIndex([0,1,2]);g.computeVertexNormals();
 s.complete_unit_assembly={unit_count:1,source_mesh_count:1,leaf_instances:0,organ_instances:0,baked_unit_leaves:0,baked_unit_organs:0,max_unit_root_error_m:0};
 const material=new T.MeshStandardMaterial(),group=new T.Group();group.add(new T.Mesh(g,material));
 const glb=Buffer.from(await exportGlb(group,{singleMesh:true}));g.dispose();material.dispose();
 const bin=Buffer.alloc(164);bin.write('BFRA0001');[0,0,0,1,0,0,0,1,0].forEach((v,i)=>bin.writeFloatLE(v,8+Math.floor(i/3)*48+i%3*4));[0,1,2].forEach((v,i)=>bin.writeUInt32LE(v,152+i*4));
 const r={format:'BranchForgeResolvedAssembly',version:1,binary:'whole.resolved.bin',binary_bytes:bin.length,binary_sha256:hash(bin),binary_sha1:hash(bin,'sha1'),source_sha256:hash(source),coordinate_system:'UE_centimeter_X_negativeY_Z',vertex_stride:48,
  branches:s.branches,sources:s.foliage_sources,instances:s.foliage,chunks:[{instance_index:0,source_index:0,host_branch_id:'root',material_role:'bark',vertex_offset:8,vertex_count:3,index_offset:152,index_count:3}],summary:{vertices:3,triangles:1,bounds_cm:{min:[0,0,0],max:[1,1,0]},unit_instances:1,source_meshes:1}};
 s.resolved_assembly={manifest:'whole.resolved.json',binary:r.binary,source_sha256:hash(source),...r.summary};
 const m={format:'BranchForgeCompleteUnitSet',version:1,source_whole_sha256:hash(source),resolved_assembly:s.resolved_assembly,units:[{id:'classA',instance_count:1,glb:'classA.glb',glb_sha256:hash(glb)}]};
 for(const [name,data] of Object.entries({'whole.pve-skeleton.json':s,'whole.resolved.json':r,'complete_units.manifest.json':m,'validation.json':validatePVESkeleton(s)}))fs.writeFileSync(path.join(out,name),JSON.stringify(data));
 fs.writeFileSync(path.join(out,'classA.glb'),glb);fs.writeFileSync(path.join(out,'whole.resolved.bin'),bin);
 fs.writeFileSync(path.join(out,'leaf_atlas_color.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64'));
 return {name:'fixture',sources:1,units:1};
}

test('complete package validates payloads, preserves prior files on generation/validation/publish failure, then retries',async()=>{
 const root=fs.mkdtempSync(path.resolve('.runtime/pve-package-test-')),input=path.join(root,'tree.branch.json'),destination=path.join(root,'tree_PVE_Complete'),statusPath=path.join(root,'status.json');
 fs.writeFileSync(input,'source tree');const options={input,destination,statusPath,generate:fixture};
 const digest=()=>Object.fromEntries(fs.readdirSync(destination).map(n=>[n,hash(fs.readFileSync(path.join(destination,n)))]));
 try{
  await packageTransaction(options);const original=digest();
  assert.equal(validatePackage(destination,fs.readFileSync(input)).sources,1);
  await assert.rejects(packageTransaction({...options,generate:async(out)=>{fs.writeFileSync(path.join(out,'partial.glb'),'partial');throw Error('mesh generation failed');}}),/mesh generation failed/);assert.deepEqual(digest(),original);
  await assert.rejects(packageTransaction({...options,generate:async(...args)=>{await fixture(...args);fs.appendFileSync(path.join(args[0],'whole.resolved.bin'),'bad');}}),/二进制头或长度/);assert.deepEqual(digest(),original);
  const rename=fs.renameSync;
  try{fs.renameSync=(from,to)=>{if(from.includes('.building-')&&to===destination)throw Error('injected final rename failure');return rename(from,to);};
   await assert.rejects(packageTransaction(options),/injected final rename failure/);
  }finally{fs.renameSync=rename;}assert.deepEqual(digest(),original);
  fs.writeFileSync(destination+'.export.lock',JSON.stringify({pid:process.pid}));await assert.rejects(packageTransaction(options),/已有完整枝包导出任务/);fs.unlinkSync(destination+'.export.lock');assert.deepEqual(digest(),original);
  await packageTransaction(options);assert.deepEqual(digest(),original);assert.equal(JSON.parse(fs.readFileSync(statusPath)).state,'succeeded');
  assert.equal(JSON.parse(fs.readFileSync(statusPath)).previous_dir,null);
  assert.equal(fs.existsSync(path.join(root,'历史备份')),false);
  assert.equal(fs.readdirSync(root).some(n=>n.includes('.previous-')),false);
  await packageTransaction({...options,keepHistory:true});
  const kept=JSON.parse(fs.readFileSync(statusPath));
  assert.equal(kept.keep_history,true);assert.equal(path.dirname(kept.previous_dir),path.join(root,'历史备份','tree_PVE_Complete'));
  assert.deepEqual(Object.fromEntries(fs.readdirSync(kept.previous_dir).map(n=>[n,hash(fs.readFileSync(path.join(kept.previous_dir,n)))])),original);
  const histories=fs.readdirSync(path.dirname(kept.previous_dir));
  await packageTransaction(options);assert.equal(JSON.parse(fs.readFileSync(statusPath)).previous_dir,null);
  assert.deepEqual(fs.readdirSync(path.dirname(kept.previous_dir)),histories);
  const remove=fs.rmSync;
  try{fs.rmSync=(file,...args)=>{if(path.dirname(file)===path.join(root,'.pve-export-work'))throw Error('cleanup locked');return remove(file,...args);};
   await packageTransaction(options);
  }finally{fs.rmSync=remove;}
  const cleanup=JSON.parse(fs.readFileSync(statusPath));assert.equal(cleanup.state,'succeeded');assert.equal(cleanup.maintenance_warnings.length,1);assert.ok(fs.existsSync(cleanup.previous_dir));assert.deepEqual(digest(),original);
  let transientAttempts=0;
  try{fs.renameSync=(from,to)=>{if(from.includes('.building-')&&to===destination&&transientAttempts++<2){const error=Error('temporary Windows file lock');error.code='EPERM';throw error;}return rename(from,to);};
   await packageTransaction(options);
  }finally{fs.renameSync=rename;}
  assert.ok(transientAttempts>=3 && transientAttempts<=13);assert.deepEqual(digest(),original);
  await packageTransaction({...options,destination:path.join(root,'custom-cli-output')});
  assert.equal(validatePackage(path.join(root,'custom-cli-output'),fs.readFileSync(input)).sources,1);
  await assert.rejects(packageTransaction({...options,destination:root}),/不能包含源工程/);
 }finally{
  assert.ok(root.startsWith(path.resolve('.runtime')+path.sep));fs.rmSync(root,{recursive:true,force:true});
 }
});
