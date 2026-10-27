import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTrunkRootPresetShape,captureTrunkRootPreset,applyTrunkRootPreset,TRUNK_ROOT_PRESETS} from '../web/trunk-root-presets.js';
import {normalizeTrunkPreset,createTrunkPresetStore} from '../web/trunk-preset-store.js';
import {createTrunkPresetPreferences} from '../web/trunk-preset-library-ui.js';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const id='trunk-preset-0123456789abcdef0123456789abcdef',shape=TRUNK_ROOT_PRESETS[0].shape;
test('root shape capture excludes identity, direction, carrier and project parameters without mutating its source',()=>{
 const source={id:'ROOT_A',angle:99,length:2.1,height:.35,width:36,strength:.7,root_flare:2,sections:[1],mesh:{},branch_instances:[1]},before=structuredClone(source),saved=captureTrunkRootPreset(source);
 assert.deepEqual(saved,{version:1,length:2.1,height:.35,width:36,strength:.7});assert.deepEqual(source,before);
 assert.deepEqual(normalizeTrunkRootPresetShape({...saved,angle:200}),saved);
});
test('invalid or future root presets cannot silently substitute a shape',()=>{
 for(const raw of [null,[],{}, {...shape,version:2},{...shape,length:NaN},{...shape,width:91},{...shape,height:0},{...shape,strength:'1'}])assert.throws(()=>normalizeTrunkRootPresetShape(raw));
});
test('applying a root preset replaces only the selected shape fields and retains each direction, identity and metadata',()=>{
 const roots=[{id:'A',angle:10,length:5,height:.8,width:8,strength:.3,note:'keep'},{id:'B',angle:200,length:4,height:.6,width:70,strength:1}],before=structuredClone(roots);
 assert.deepEqual(applyTrunkRootPreset(roots,['A'],shape),[{...roots[0],length:shape.length,height:shape.height,width:shape.width,strength:shape.strength},roots[1]]);assert.deepEqual(roots,before);
 assert.deepEqual(applyTrunkRootPreset(roots,[],shape),before);assert.deepEqual(applyTrunkRootPreset(roots,['stale'],shape),before);
 const group=applyTrunkRootPreset(roots,['A','B'],shape);assert.deepEqual(group.map(r=>[r.id,r.angle]),[['A',10],['B',200]]);
});
test('every built-in is explicit root shape and store normalization excludes unrelated authoring data',()=>{
 assert.equal(TRUNK_ROOT_PRESETS.length,6);for(const item of TRUNK_ROOT_PRESETS){assert.deepEqual(normalizeTrunkRootPresetShape(item.shape),item.shape);const normalized=normalizeTrunkPreset('root',{id,name:item.name,shape:{...item.shape,angle:90,sections:[1]},updatedAt:1});assert.deepEqual(normalized.shape,item.shape);}
});
test('root libraries survive new store instances independently of detail libraries and failed writes stay failures',async()=>{
 const records=new Map();let fail=false;const fetch=async(url,options={})=>{const u=new URL(url,'http://localhost'),key=u.searchParams.get('kind')+':',method=options.method||'GET';if(fail&&method==='POST')return{ok:false,status:500,json:async()=>({message:'磁盘满了'})};let data;if(method==='POST'){const item=JSON.parse(options.body);records.set(key+item.id,item);data={item};}else if(method==='DELETE'){records.delete(key+u.searchParams.get('id'));data={success:true};}else data={items:[...records].filter(([k])=>k.startsWith(key)).map(([,v])=>v)};return{ok:true,status:200,json:async()=>data};};
 const store=createTrunkPresetStore('root',{fetch,now:()=>3,createId:()=>id});assert.deepEqual(await store.list(),[]);const saved=await store.put({name:'自存板根',shape});assert.deepEqual(await createTrunkPresetStore('root',{fetch}).list(),[saved]);assert.deepEqual(await createTrunkPresetStore('detail',{fetch}).list(),[]);
 fail=true;await assert.rejects(store.put({name:'失败',shape}),/磁盘满了/);assert.equal(store.kind,'disk');assert.deepEqual(await store.list(),[saved]);fail=false;await store.remove(id);assert.deepEqual(await store.list(),[]);
});
test('root favorite and confirmed-recent preferences are independent local navigation data',async()=>{
 let data={favorites:[],recent:[]};const fetch=async(url,options={})=>{assert.match(url,/kind=root$/);if(options.method==='POST')data=JSON.parse(options.body);return{ok:true,status:200,json:async()=>({preferences:data})};};const prefs=createTrunkPresetPreferences('root',{fetch});await prefs.load();await prefs.toggle('builtin-root-wide');assert.deepEqual(prefs.data,{favorites:['builtin-root-wide'],recent:[]});await prefs.used('builtin-root-wide');assert.deepEqual((await createTrunkPresetPreferences('root',{fetch}).load()).recent,['builtin-root-wide']);
});
test('the desktop root catalog reads and validates real isolated root files through the production PowerShell and Node path', {skip:process.platform!=='win32'},()=>{
 const directory=fs.mkdtempSync(path.resolve('.runtime/root-preset-disk-')),folder=path.join(directory,'trunk-presets','root');fs.mkdirSync(folder,{recursive:true});const record={format:'BranchForgeTrunkPreset',version:1,kind:'root',id,name:'真实板根预设',shape,updatedAt:5},file=path.join(folder,id+'.trunkpreset.json');fs.writeFileSync(file,JSON.stringify(record));
 const quote=v=>"'"+v.replaceAll("'","''")+"'",script=path.join(directory,'read.ps1');fs.writeFileSync(script,'\ufeff'+`$ErrorActionPreference='Stop'\n[Console]::OutputEncoding=[Text.Encoding]::UTF8\n$script:AppDir=${quote(path.resolve('.'))}\n$env:BRANCHFORGE_SESSION_TEST_DIR=${quote(directory)}\n. (Join-Path $script:AppDir 'scripts/trunk-preset-server.ps1')\nGet-TrunkPresetCatalog 'root' | ConvertTo-Json -Depth 16 -Compress\n`);
 for(let i=0;i<2;i++){const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);const catalog=JSON.parse(result.stdout.trim());assert.equal(catalog.success,true);assert.deepEqual(catalog.items,[normalizeTrunkPreset('root',record)]);assert.deepEqual(catalog.warnings,[]);}
 assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),record);
});
