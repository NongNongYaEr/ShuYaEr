import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {TRUNK_DETAIL_PROFILES,normalizeTrunkDetailProfile,createTrunkDetailProfileSampler,moveTrunkDetailProfilePoint,insertTrunkDetailProfilePoint,removeTrunkDetailProfilePoint} from '../web/trunk-detail-profile.js';
import {normalizeTrunkDetail,createTrunkDetailSampler,defaultTrunkDetailProfile} from '../web/trunk-details.js';
import {normalizeTrunkDetailPresetShape,applyTrunkDetailPreset} from '../web/trunk-detail-presets.js';
import {transformTrunkDetailSelection,redrawTrunkDetail,moveTrunkDetailPathPoint} from '../web/trunk-detail-edit.js';
import {normalizeTrunkPreset,createTrunkPresetStore} from '../web/trunk-preset-store.js';
import {createTrunkMeshSampling,createTrunkMeshPreset} from '../web/trunk-mesh-density.js';

const shape=TRUNK_DETAIL_PROFILES[0].shape,base={id:'D',type:'GROOVE',t:.5,angle:359,width:20,height:.2,strength:.3,seed:2},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('profiles validate bounded ordered knots, fixed zero ends and explicit version without mutating data',()=>{
  for(const p of TRUNK_DETAIL_PROFILES){const before=structuredClone(p.shape),normalized=normalizeTrunkDetailProfile(p.shape);assert.deepEqual(normalized,before);assert.deepEqual(p.shape,before);const at=createTrunkDetailProfileSampler(p.shape);for(let x=-1;x<=1;x+=.003){assert.ok(at(x)>=-1&&at(x)<=1);}assert.equal(at(-1),0);assert.equal(at(1),0);for(const n of p.shape.points)near(at(n.x),n.y);}
  for(const bad of [{...shape,version:2},{...shape,points:[{x:-1,y:1},{x:0,y:0},{x:1,y:0}]},{...shape,points:[{x:-1,y:0},{x:-.995,y:0},{x:1,y:0}]},{...shape,points:[{x:-1,y:0},{x:NaN,y:0},{x:1,y:0}]}])assert.equal(normalizeTrunkDetailProfile(bad),null);
});
test('drag, insertion and deletion maintain knots and protect endpoints',()=>{
  const before=structuredClone(shape),moved=moveTrunkDetailProfilePoint(shape,1,{x:50,y:-50});assert.equal(moved.points[1].x,.98);assert.equal(moved.points[1].y,-1);assert.deepEqual(shape,before);assert.deepEqual(moveTrunkDetailProfilePoint(shape,0,{x:0,y:1}),shape);
  const inserted=insertTrunkDetailProfilePoint(shape,.4,.2);assert.equal(inserted.points.length,4);assert.deepEqual(removeTrunkDetailProfilePoint(inserted,2),shape);assert.equal(removeTrunkDetailProfilePoint(shape,1),null);assert.equal(insertTrunkDetailProfilePoint(shape,.005,1),null);
});
test('custom cross sections reach actual displacement and remain smooth and periodic at stroke boundaries',()=>{
  const d={...base,profile:shape},sample=createTrunkDetailSampler([d]);
  for(const x of [-1,-.8,-.4,0,.4,.8,1])near(sample(.5,(359+x*10)*Math.PI/180),1+.3*createTrunkDetailProfileSampler(shape)(x));
  near(sample(.5,0),sample(.5,Math.PI*2));near(sample(.6,359*Math.PI/180),1);
  const path=[{t:.3,angle:359,pressure:.5},{t:.7,angle:359,pressure:.5}],stroke=createTrunkDetailSampler([{...d,path}]);near(stroke(.5,359*Math.PI/180),.85);
  const diagonal=createTrunkDetailSampler([{...d,path:[{t:.4,angle:349,pressure:1},{t:.6,angle:9,pressure:1}]}]);near(diagonal(.5,359*Math.PI/180),.7);
  for(let i=0;i<50;i++){const y=i/50,x=Math.sqrt(1-y*y),a=(359+y*10)*Math.PI/180;near(sample(.5+x*.1,a),1);assert.ok(Math.abs(sample(.5+x*.1*.999999,a)-1)<1e-5);}
});
test('optional profile survives existing detail transforms, redraw, preset reuse and JSON cold normalization; legacy has no new field',()=>{
  const legacy=normalizeTrunkDetail(base);assert.equal(Object.hasOwn(legacy,'profile'),false);assert.deepEqual(normalizeTrunkDetail({...base,profile:null}),legacy);
  assert.ok(defaultTrunkDetailProfile(base));const d=normalizeTrunkDetail({...base,profile:shape,path:[{t:.4,angle:359,pressure:.8},{t:.6,angle:1,pressure:.4}]});
  for(const next of [normalizeTrunkDetail(JSON.parse(JSON.stringify(d))),transformTrunkDetailSelection([d],new Set(['D']),{angle:37,scale:1.2})[0],redrawTrunkDetail(d,{t:.3,angle:5}),moveTrunkDetailPathPoint(d,1,{t:.65,angle:12})])assert.deepEqual(next.profile,shape);
  const preset=normalizeTrunkDetailPresetShape({details:[d]});assert.deepEqual(applyTrunkDetailPreset(preset,{t:.2,angle:7,idFactory:()=> 'NEW'})[0].profile,shape);
});
test('profile library stores shape alone, reports invalid versions, and survives a fresh store connection',async()=>{
  const id='trunk-preset-0123456789abcdef0123456789abcdef',records=new Map();
  const fetch=async(url,options={})=>{const method=options.method||'GET';if(method==='POST'){const item=JSON.parse(options.body);records.set(item.id,item);return{ok:true,status:200,json:async()=>({success:true,item})};}if(method==='DELETE'){const key=new URL(url,'http://localhost').searchParams.get('id'),item=records.get(key);records.delete(key);return{ok:true,status:200,json:async()=>({success:true,item})};}return{ok:true,status:200,json:async()=>({success:true,items:[...records.values()]})};};
  const first=createTrunkPresetStore('profile',{fetch,createId:()=>id});const item=await first.put({name:'偏心沟',shape:{...shape,position:'discard'}});assert.deepEqual(item.shape,shape);
  const second=createTrunkPresetStore('profile',{fetch});assert.deepEqual(await second.list(),[item]);assert.equal(second.kind,'disk');assert.throws(()=>normalizeTrunkPreset('profile',{id,name:'bad',shape:{...shape,version:2}}));await second.remove(id);assert.deepEqual(await first.list(),[]);
});
test('custom narrow profile refinement stays closed and respects both preview and final vertex budgets',()=>{
  const branch={points:[{x:0,y:0,z:0},{x:0,y:0,z:5}]},mesh=createTrunkMeshPreset('FINE'),detail={...base,width:2,height:.003,profile:TRUNK_DETAIL_PROFILES.find(p=>p.id==='ROLLED_EDGE').shape};
  for(const limit of [48000,250000]){const grid=createTrunkMeshSampling(branch,mesh,[detail],Array.from({length:65},(_,i)=>i/64),{vertexLimit:limit});assert.ok(grid.angles.length*grid.ts.length+2<=limit);assert.equal(new Set(grid.angles).size,grid.angles.length);assert.equal(new Set(grid.ts).size,grid.ts.length);assert.ok(grid.info.adaptive_detail_count===1);}
});
test('desktop personal profile directory is accepted by the real Node validator and survives fresh PowerShell catalog reads', {skip:process.platform!=='win32'},()=>{
  const folder=fs.mkdtempSync(path.resolve('.runtime/trunk-profile-library-')),records=path.join(folder,'trunk-presets/profile');fs.mkdirSync(records,{recursive:true});
  const id='trunk-preset-0123456789abcdef0123456789abcdef',raw={format:'BranchForgeTrunkPreset',version:1,kind:'profile',id,name:'我的卷边',shape:TRUNK_DETAIL_PROFILES.find(p=>p.id==='ROLLED_EDGE').shape,updatedAt:77},file=path.join(records,id+'.trunkpreset.json');fs.writeFileSync(file,JSON.stringify(raw));
  const quote=v=>"'"+v.replaceAll("'","''")+"'",script=path.join(folder,'read.ps1');
  fs.writeFileSync(script,'\ufeff'+`$ErrorActionPreference='Stop'\n[Console]::OutputEncoding=[Text.Encoding]::UTF8\n$script:AppDir=${quote(path.resolve('.'))}\n$env:BRANCHFORGE_SESSION_TEST_DIR=${quote(folder)}\n. (Join-Path $script:AppDir 'scripts/trunk-preset-server.ps1')\nGet-TrunkPresetCatalog 'profile' | ConvertTo-Json -Depth 24 -Compress\n`);
  for(let i=0;i<2;i++){const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr||result.stdout);const catalog=JSON.parse(result.stdout.trim());assert.equal(catalog.success,true);assert.deepEqual(catalog.items,[normalizeTrunkPreset('profile',raw)]);assert.deepEqual(catalog.warnings,[]);assert.equal(fs.readFileSync(file,'utf8'),JSON.stringify(raw));}
});
