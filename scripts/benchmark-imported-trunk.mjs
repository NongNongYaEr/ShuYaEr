import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from '../web/vendor/three.module.min.js';
import {readImportedTrunkGlb} from '../web/imported-trunk-glb.js';
import {prepareImportedTrunk,importedTrunkShape} from '../web/imported-trunk-runtime.js';
import {buildBranchAsset,disposeBranchAsset,normalizeSettings} from '../web/branch-kernel.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {createGpuMeshPreview} from '../web/gpu-edit-preview.js';
import {sampleLine,lineTangent} from '../web/tree-sculpt.js';
import {importedTrunkFixture} from '../tests/imported-trunk-fixture.mjs';
const rows=[],base=prepareImportedTrunk(await readImportedTrunkGlb(await importedTrunkFixture())),settings=normalizeSettings({leaf_density:0,child_count:0,buds_enabled:false,fruit_enabled:false,junction_collar:false});
for(const triangles of [50000,250000,1000000]){
 const geometry=new T.CylinderGeometry(.22,.65,8,16,Math.ceil(triangles/32),true);geometry.translate(0,4,0);geometry.rotateX(Math.PI/2);geometry.computeTangents();
 const g=Object.fromEntries(['position','normal','uv','tangent'].map(k=>[k,Array.from(geometry.attributes[k].array)]));g.index=Array.from(geometry.index.array);geometry.dispose();
 const model={...base,id:'BENCH_'+triangles,calibration:{base:[0,0,0],tip:[0,0,8],front:[0,-1,0],scale:1},primitives:[{...base.primitives[0],id:'BODY',geometry:g}],guides:[{id:'G0',parent:'',attach:0,start_radius:.5,end_radius:.2,points:Array.from({length:17},(_,i)=>[0,0,i*.5])}]},made=importedTrunkShape(model);made.mount.binding='FLEX';
 const a=normalizeAuthoring({branch_shape:made.shape,imported_trunks:{version:1,assets:[model],mounts:[made.mount]}}),start=performance.now(),asset=buildBranchAsset(settings,null,[],0,a),build_ms=performance.now()-start,snapshot=new Map(asset.masterBranches.map(b=>[b.id,b])),frames=[];let preview;
 try{const begin=performance.now();preview=createGpuMeshPreview(asset,snapshot,{sampleLine,lineTangent,targets:new Set(Object.values(made.mount.guide_map))});const preview_setup_ms=performance.now()-begin;for(let frame=0;frame<120;frame++){const updated=new Map([...snapshot].map(([id,b])=>[id,{...b,points:b.points.map(p=>new T.Vector3(p.x+Math.sin(frame*.03)*p.z*p.z*.025,p.y,p.z)),controlPoints:b.controlPoints}]));const tick=performance.now();preview.update(updated);frames.push(performance.now()-tick);}const sorted=frames.slice().sort((a,b)=>a-b);assert(preview.stats.importedFrames>0);rows.push({triangles:g.index.length/3,vertices:g.position.length/3,build_ms,preview_setup_ms,update_p50_ms:sorted[60],update_p95_ms:sorted[114],heap_mib:process.memoryUsage().heapUsed/1048576});console.log(JSON.stringify(rows.at(-1)));}finally{preview?.restore();disposeBranchAsset(asset);}
}
fs.writeFileSync('.runtime/external-trunk/mesh-performance.json',JSON.stringify({scope:'CPU build and real GPU-preview palette updates; excludes native GPU present time',rows},null,2));
