import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {buildBranchAsset,disposeBranchAsset,deserializeGeometry,normalizeSettings,DEFAULT_SETTINGS} from '../web/branch-kernel.js';
import {compiledSamples,sealCompiledSampleMaterials} from '../web/compiled-sample-cache.js';
import {createUnitPaintPreview} from '../web/unit-paint-preview.js';
import {createUnitErasePreview} from '../web/unit-erase-preview.js';
import {createDensityLedger,touchDensity,densityGroups,densityGroupQuotas,planDensityThinning} from '../web/unit-density-data.js';
import {createDensityGapSearch} from '../web/unit-density-spatial.js';
import {sampleLine} from '../web/tree-sculpt.js';
import {unitPaintPlacement,unitPaintRadialDirection} from '../web/unit-paint-placement.js';

test('unchanged stroke membership reuses the same groups, quotas and thinning plan; new hits invalidate them',()=>{
 const entries=Array.from({length:20},(_,n)=>({id:'I'+n,instance:{parent:'ROOT',shootRole:'MIXED'},position:new T.Vector3(n,0,0),family:new Set(['I'+n])})),ledger=createDensityLedger({entries},.2);
 touchDensity(ledger,entries.slice(0,10));const revision=ledger.revision,groups=densityGroups(ledger),quotas=densityGroupQuotas(ledger),removed=planDensityThinning(ledger);
 for(let n=0;n<40;n++){assert.equal(touchDensity(ledger,entries.slice(0,10)),false);assert.equal(densityGroups(ledger),groups);assert.equal(densityGroupQuotas(ledger),quotas);assert.equal(planDensityThinning(ledger),removed);}assert.equal(ledger.revision,revision);
 touchDensity(ledger,entries);assert.notEqual(densityGroups(ledger),groups);assert.notEqual(densityGroupQuotas(ledger),quotas);assert.equal(planDensityThinning(ledger).size,4);
});
test('quota allocation keeps the original proportional and deterministic tie-break behavior',()=>{
 for(let size=1;size<=90;size+=7){const entries=Array.from({length:size},(_,n)=>({id:'I'+n,instance:{parent:'ROOT'+n%7,shootRole:n%3?'MIXED':'YOUNG'}})),ledger=createDensityLedger({entries},.37);touchDensity(ledger,entries);
  for(const grow of [false,true]){const counts=[...densityGroups(ledger,grow)].map(([key,list])=>({key,n:list.length,cap:grow?128:Math.max(0,list.length-1),quota:0})),budget=Math.min(128,counts.reduce((n,v)=>n+v.cap,0),Math.max(1,Math.floor(size*.37)));
   for(let n=0;n<budget;n++){const e=counts.filter(v=>v.quota<v.cap).sort((a,b)=>a.quota/a.n-b.quota/b.n||b.n-a.n||a.key.localeCompare(b.key))[0];if(e)e.quota++;}
   assert.deepEqual([...densityGroupQuotas(ledger,grow)],counts.map(e=>[e.key,e.quota]));
  }
 }
});
test('cached gap search matches the uncached candidate solve, including occupied updates and front-layer depth',()=>{
 const settings=normalizeSettings(DEFAULT_SETTINGS),parent={stableId:'ROOT',length:4,startRadius:.1,endRadius:.06,points:[new T.Vector3(),new T.Vector3(0,0,4)]},project=p=>({x:200+p.x*100,y:p.z*100,z:0,depth:2+p.z/10}),entries=[.3,.45,.6].map((attach,n)=>({id:'I'+n,instance:{attach}})),hits=new Set(entries.map(e=>e.id)),used=[.3,.6].map((attach,n)=>unitPaintPlacement({parent:'ROOT',attach},parent,sampleLine(parent.points,attach),unitPaintRadialDirection(parent,attach,.1,n),settings)),search=createDensityGapSearch(parent,settings,used,project);
 const naive=(p,r,depth)=>{let best=null,gap=0;for(const e of entries)for(const o of [0,-.025,.025,-.06,.06,-.12,.12,-.2,.2]){const t=Math.max(.02,Math.min(.98,e.instance.attach+o)),pos=sampleLine(parent.points,t),q=project(pos);if(q.depth>depth||Math.hypot(q.x-p[0],q.y-p[1])>r)continue;for(let n=0;n<8;n++){const placement=unitPaintPlacement({parent:'ROOT',attach:t},parent,pos,unitPaintRadialDirection(parent,t,.1,n),settings),d=Math.min(...used.map(v=>v.clearance.distanceToSquared(placement.clearance)));if(d>gap){gap=d;best={t,n,gap,placement};}}}return best&&gap>=.0001?best:null;};
 for(const [point,radius,depth]of [[[200,180],140,Infinity],[[200,210],100,2.2],[[200,110],80,Infinity]]){
  for(let n=0;n<3;n++){const actual=search.best(entries,hits,point,radius,depth),expected=naive(point,radius,depth);assert.equal(actual?.t,expected?.t);assert.equal(actual?.n,expected?.n);if(actual){assert(Math.abs(actual.gap-expected.gap)<1e-12);used.push(actual.placement);search.occupy(actual.placement);}}
 }
 const count=search.size;search.best(entries,hits,[200,180],140);assert.equal(search.size,count);
});

const dir=new URL('../次枝资产/全植物次枝成品V1/香樟/',import.meta.url),name=fs.readdirSync(dir).find(n=>n.includes('紧凑侧枝')&&n.includes('深绿')&&n.endsWith('.branchasset.json')),source=JSON.parse(fs.readFileSync(new URL(name,dir))).asset;
function fixture(){const geometries=[],leaves=source.sample.leaf_meshes.map(s=>{const geometry=deserializeGeometry(s.geometry);geometries.push(geometry);return {...s,geometry};}),settings=normalizeSettings({...DEFAULT_SETTINGS,preview_lod:0,leaf_density:0,max_leaves:0,wind_strength:0,max_triangles:8e6}),authoring=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:[[0,0,0],[0,0,4]],length:4,start_radius:.1,end_radius:.05}]},branch_library:[source],branch_instances:[{id:'I0',asset_id:source.id,linked:true,pinned_revision:source.revision,parent:'ROOT',attach:.25,scale:1,angle:60,azimuth:0},{id:'I1',asset_id:source.id,linked:true,pinned_revision:source.revision,parent:'ROOT',attach:.6,scale:1,angle:60,azimuth:120}],tree_organs:source.sample.authoring.tree_organs}),asset=buildBranchAsset(settings,null,leaves,0,authoring,{instanced:true});sealCompiledSampleMaterials(asset);return {asset,geometries,authoring};}
test('density source previews borrow existing complete geometry, update only new slots, and retain prototypes until released',async()=>{
 const {asset,geometries}=fixture(),authoring=asset.authoring,p=compiledSamples(asset).records.get(JSON.stringify([source.id,source.revision,''])),root=new T.Group(),before=p.refs,sourceState=JSON.stringify(authoring.branch_library);assert(p);
 let preview,ownerDisposed=false;try{preview=await createUnitPaintPreview(authoring.branch_library[0],authoring,root,{owner:asset,includeHover:false,resolvedScale:true});assert(preview.borrowed);assert.equal(p.refs,before+1);const batches=[];preview.root.traverse(m=>{if(m.isInstancedMesh)batches.push(m);});assert.equal(batches.length,p.meshes.length);assert(batches.every(m=>p.meshes.some(s=>s.geometry===m.geometry)));
  const records=[{instance:{...authoring.branch_instances[0],id:'P0'}}];preview.set(records,null,asset);const versions=batches.map(m=>m.instanceMatrix.version);preview.set(records,null,asset);assert.deepEqual(batches.map(m=>m.instanceMatrix.version),versions);records.push({instance:{...authoring.branch_instances[1],id:'P1'}});preview.set(records,null,asset);assert(batches.every((m,n)=>m.count===2&&m.instanceMatrix.version===versions[n]+1));assert.equal(JSON.stringify(authoring.branch_library),sourceState);
  const watched=p.meshes[0].geometry;let disposed=0;watched.addEventListener('dispose',()=>disposed++);disposeBranchAsset(asset);ownerDisposed=true;assert.equal(disposed,0);preview.dispose();assert.equal(disposed,1);assert.equal(root.children.length,0);preview.dispose();assert.equal(disposed,1);
 }finally{preview?.dispose();if(!ownerDisposed)disposeBranchAsset(asset);geometries.forEach(g=>g.dispose());}
});
test('thinning preview can change the marked set and immediately restore units removed from it',()=>{
 const {asset,geometries}=fixture();try{const snapshots=[];asset.group.traverse(m=>{if(m.isInstancedMesh&&asset.editPreviewBindings?.(m)?.instances)snapshots.push({m,values:m.instanceMatrix.array.slice(),ids:asset.editPreviewBindings(m).instances.map(v=>v.id)});});const preview=createUnitErasePreview(asset);preview.set(new Set(['I0']));preview.set(new Set(['I1']));assert.equal(preview.count,1);
  for(const {m,values,ids}of snapshots)ids.forEach((id,n)=>{const actual=m.instanceMatrix.array.slice(n*16,n*16+16);if(id==='I0')assert.deepEqual(actual,values.slice(n*16,n*16+16));else if(id==='I1')assert.equal(actual[0],0);});preview.restore();for(const {m,values}of snapshots)assert.deepEqual(m.instanceMatrix.array,values);
 }finally{disposeBranchAsset(asset);geometries.forEach(g=>g.dispose());}
});
