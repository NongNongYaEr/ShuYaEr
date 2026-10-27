import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
import {createDirectTrunkForm,createTrunkFormPreset,normalizeTrunkForm,normalizeTrunkSectionProfile,normalizeDirectTrunkSectionProfile,createDirectTrunkSectionProfileSampler} from '../web/trunk-form.js';
import {wholeTrunkContourKnots,captureWholeTrunkContour,applyWholeTrunkContour,wholeTrunkSurfaceSampler,WHOLE_TRUNK_CONTOUR_PRESETS,pullWholeTrunkContour} from '../web/trunk-whole-contour.js';
import {normalizeTrunkSectionPreset} from '../web/trunk-section-presets.js';
import {createTrunkFormPreviewGeometry,DEFAULT_SETTINGS,normalizeSettings} from '../web/branch-kernel.js';
import {createTrunkMeshPreset} from '../web/trunk-mesh-density.js';
const source=()=>{const f=createDirectTrunkForm(createTrunkFormPreset('BUTTRESS'));f.sections=[{id:'S',t:.15,radius:1.1,oval:.9,roll:17,span:.18}];return normalizeTrunkForm(f);};
test('soft whole-ring pulling compensates real surface radii, wraps the seam and leaves distant knots and angles exact',()=>{
 const p=wholeTrunkContourKnots({},64),before=structuredClone(p),radiusAt=a=>2+.8*Math.cos(a),result=pullWholeTrunkContour(p,{angle:0,delta:.3,radiusAt,reach:18});
 assert.deepEqual(p,before);assert.equal(result.length,64);assert.ok(Math.abs(result[0].radius-(1+.3/2.8))<1e-12);assert.ok(Math.abs(result[1].radius-result[63].radius)<1e-12);assert.ok(result[1].radius>result[2].radius);assert.ok(result[2].radius>result[3].radius);for(let i=4;i<61;i++)assert.deepEqual(result[i],p[i]);for(let i=0;i<64;i++){assert.equal(result[i].angle,p[i].angle);assert.equal(result[i].id,p[i].id);}
});
test('precise radial pulling changes one knot and zero motion cannot create a contour edit',()=>{
 const p=wholeTrunkContourKnots({},96),radiusAt=()=>3,result=pullWholeTrunkContour(p,{angle:p[7].angle,delta:-.6,radiusAt,single:true});assert.ok(Math.abs(result[7].radius-.8)<1e-12);for(let i=0;i<96;i++)if(i!==7)assert.deepEqual(result[i],p[i]);assert.deepEqual(pullWholeTrunkContour(p,{angle:0,delta:0,radiusAt}),p);
});
test('whole-ring pulling clamps extreme motions and invalid surface samples without introducing nonfinite geometry',()=>{
 const p=wholeTrunkContourKnots({},64);for(const delta of [-1e10,1e10]){const result=pullWholeTrunkContour(p,{angle:0,delta,radiusAt:a=>a===0?NaN:1,reach:45});assert.deepEqual(result[0],p[0]);assert.ok(result.every(p=>p.radius>=.001&&p.radius<=64&&Number.isFinite(p.radius)));}
});
test('whole-ring knot density is explicit, preserves old source knots and legacy 32-point limit, and cold normalizes 128-point direct contours',()=>{
 const f=source(),before=structuredClone(f);for(const count of [64,96,128]){const p=wholeTrunkContourKnots(f.sections[0],count);assert.equal(p.length,count);assert.ok(p.every(p=>p.radius===1));assert.equal(normalizeDirectTrunkSectionProfile(p).length,count);assert.equal(normalizeTrunkSectionProfile(p).length,32);}
 assert.deepEqual(f,before);const p=wholeTrunkContourKnots(f.sections[0],64);p[12].angle+=.5;p[12].radius=.7;const refined=wholeTrunkContourKnots({...f.sections[0],profile:p},96);for(const knot of p)assert.deepEqual(refined.find(p=>p.id===knot.id),knot);assert.equal(new Set(refined.map(p=>p.id)).size,refined.length);
 const saved=normalizeTrunkForm({...f,sections:[{...f.sections[0],profile:wholeTrunkContourKnots(f.sections[0],128)}]});assert.deepEqual(normalizeTrunkForm(JSON.parse(JSON.stringify(saved))),saved);
});
test('whole contour captures actual grooves, roots, asymmetry and detail into an independent periodic preset within measured tolerance',()=>{
 const f=source(),s=f.sections[0];f.details=[{id:'D',type:'SCAR',t:s.t,angle:359,width:32,height:.1,strength:.1}];const before=structuredClone(f),settings={twist:21,section_roll:7},result=captureWholeTrunkContour(f,s,settings),actual=createDirectTrunkSectionProfileSampler(result.shape.profile),expected=wholeTrunkSurfaceSampler(f,s,settings);
 assert.ok(result.relative_error<.01);assert.equal(result.shape.profile_scope,'FINAL');assert.ok(result.shape.profile.length>32);for(let i=0;i<1000;i++){const a=i/1000*Math.PI*2;assert.ok(Math.abs(actual(a)-expected(a))/expected(a)<.01);assert.ok(Math.abs(actual(a+Math.PI*2)-actual(a))<1e-10);}
 assert.deepEqual(f,before);assert.equal(Object.hasOwn(result.shape,'buttresses'),false);assert.equal(Object.hasOwn(result.shape,'t'),false);
});
test('applying a final whole-ring preset compensates different existing effects while retaining destination placement and effect recipes',()=>{
 const a=source(),preset=captureWholeTrunkContour(a,a.sections[0]).shape,b=source();b.groove_count=5;b.groove_depth=.2;b.buttresses[0].length=1;b.sections[0].t=.21;const before=structuredClone(b),result=applyWholeTrunkContour(b,b.sections[0],preset),at=createDirectTrunkSectionProfileSampler(result.profile),desired=createDirectTrunkSectionProfileSampler(preset.profile),surface=wholeTrunkSurfaceSampler(b,b.sections[0]);
 assert.ok(result.relative_error<.01);for(let i=0;i<1000;i++){const angle=i*Math.PI*2/1000;assert.ok(Math.abs(at(angle)*surface(angle)-desired(angle))/desired(angle)<.011);}
 assert.deepEqual(b,before);for(const item of WHOLE_TRUNK_CONTOUR_PRESETS){assert.equal(item.shape.profile_scope,'FINAL');assert.ok(normalizeDirectTrunkSectionProfile(item.shape.profile));}
});
test('a saved 128-point wrinkled circle can redistribute its point budget when reused above the original buttress',()=>{
 const f=source(),s=f.sections[0];Object.assign(s,{t:.16,radius:1,oval:1,roll:0,profile:wholeTrunkContourKnots(s,64)});s.profile[3].angle=14.99;s.profile[3].radius=1.32;
 const captured=captureWholeTrunkContour(f,s),sample=createDirectTrunkSectionProfileSampler(captured.shape.profile),preset={...captured.shape,profile:Array.from({length:128},(_,i)=>({id:'SAVED_'+i,angle:i*360/128,radius:sample(i*Math.PI*2/128)}))};
 const destination={...s,t:.6},before=structuredClone(f),result=applyWholeTrunkContour(f,destination,preset),actual=createDirectTrunkSectionProfileSampler(result.profile),desired=createDirectTrunkSectionProfileSampler(preset.profile),surface=wholeTrunkSurfaceSampler(f,destination);
 assert.equal(preset.profile.length,128);assert.ok(result.profile.length<=128);assert.ok(result.relative_error<.01,'fit error: '+result.relative_error);
 for(let i=0;i<2048;i++){const a=i*Math.PI*2/2048;assert.ok(Math.abs(actual(a)*surface(a)-desired(a))/desired(a)<.01);}
 assert.deepEqual(f,before);
});
test('dense whole contours produce closed actual geometry and bounded previews without changing the carrier or saved precision',()=>{
 const f=source();f.sections[0].profile=wholeTrunkContourKnots(f.sections[0],96);f.sections[0].profile[7].radius=.5;f.mesh=createTrunkMeshPreset('FINE');const before=JSON.stringify(f),branch={id:0,stableId:'ROOT',parentId:-1,order:0,length:3,startRadius:.3,endRadius:.12,points:[[0,0,0],[.2,.1,1],[.3,0,3]].map(p=>new THREE.Vector3(...p)),sections:[],phase:.2,windPhase:.4,windStiffness:1,children:[]},settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,twist:0,section_roll:0}),g=createTrunkFormPreviewGeometry(branch,settings,f,0,{view:'FINAL',vertexLimit:48000}),cold=createTrunkFormPreviewGeometry(branch,settings,normalizeTrunkForm(JSON.parse(before)),0,{view:'FINAL'});
 try{assert.ok(g.attributes.position.count<=48000);assert.ok(cold.attributes.position.count<=250000);assert.ok(g.attributes.position.array.every(Number.isFinite));const edges=new Map(),p=cold.attributes.position,welded=new Map(),ids=Array.from({length:p.count},(_,i)=>{const key=[p.getX(i),p.getY(i),p.getZ(i)].join(',');if(!welded.has(key))welded.set(key,welded.size);return welded.get(key);});const v=Array.from(cold.index.array,i=>ids[i]);for(let i=0;i<v.length;i+=3)for(const[a,b]of[[v[i],v[i+1]],[v[i+1],v[i+2]],[v[i+2],v[i]]]){const key=a<b?a+':'+b:b+':'+a;edges.set(key,(edges.get(key)||0)+1);}assert.ok([...edges.values()].every(n=>n===2));assert.equal(JSON.stringify(f),before);}finally{g.dispose();cold.dispose();}
});
test('whole-ring preset metadata and 128 knots survive real native disk normalization and fresh PowerShell reload', {skip:process.platform!=='win32'},()=>{
 const folder=fs.mkdtempSync(path.resolve('.runtime/trunk-whole-library-')),id='section-preset-0123456789abcdef0123456789abcdef',shape={...WHOLE_TRUNK_CONTOUR_PRESETS[0].shape,profile:wholeTrunkContourKnots({profile:WHOLE_TRUNK_CONTOUR_PRESETS[0].shape.profile},128)},item={id,name:'整圈褶皱',shape,updatedAt:7},input=path.join(folder,'input.json'),script=path.join(folder,'native.ps1');fs.writeFileSync(input,JSON.stringify(item));
 const quote=v=>"'"+v.replaceAll("'","''")+"'";fs.writeFileSync(script,'\ufeff'+`$ErrorActionPreference='Stop'\n[Console]::OutputEncoding=[Text.Encoding]::UTF8\n$script:AppDir=${quote(path.resolve('.'))}\n$env:BRANCHFORGE_SESSION_TEST_DIR=${quote(folder)}\n. (Join-Path $script:AppDir 'scripts/trunk-section-preset-server.ps1')\n$raw=Get-Content -LiteralPath ${quote(input)} -Raw -Encoding UTF8 | ConvertFrom-Json\n$item=Confirm-TrunkSectionPreset $raw\n$null=New-Item -ItemType Directory -Path $script:TrunkSectionPresetDir -Force\n$record=[ordered]@{format='BranchForgeTrunkSectionPreset';version=2;id=$item.id;name=$item.name;shape=$item.shape;updatedAt=$item.updatedAt}\n$record | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath (Get-TrunkSectionPresetPath $item.id) -Encoding UTF8\nGet-TrunkSectionPresetCatalog | ConvertTo-Json -Depth 16 -Compress\n`);
 for(let i=0;i<2;i++){const run=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr||run.stdout);const catalog=JSON.parse(run.stdout.trim()),saved=catalog.items[0];assert.equal(saved.shape.profile_scope,'FINAL');assert.equal(saved.shape.profile.length,128);const expected=normalizeTrunkSectionPreset(item);for(let j=0;j<128;j++)assert.ok(Math.abs(saved.shape.profile[j].radius-expected.shape.profile[j].radius)<1e-10);assert.deepEqual(catalog.warnings,[]);}
});
