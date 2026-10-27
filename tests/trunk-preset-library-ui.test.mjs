import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {normalizeTrunkPresetPreferences,filterTrunkPresetRecords,createTrunkPresetPreferences,trunkDetailPresetThumbnail} from '../web/trunk-preset-library-ui.js';
test('preset preferences reject paths and foreign IDs and bound deduplicated history',()=>{
  const many=Array.from({length:550},(_,i)=>'builtin-test-'+i),p=normalizeTrunkPresetPreferences({favorites:['../a','V_GROOVE',...many,...many],recent:[null,'builtin-first','builtin-first',...many],project:{dirty:true}});
  assert.equal(p.favorites.length,500);assert.equal(p.recent.length,24);assert.equal(p.recent[0],'builtin-first');assert.deepEqual(Object.keys(p),['favorites','recent']);
});
test('search, shape scope and favorite/recent views intersect without modifying records',()=>{
  const records=[{id:'builtin-a',name:'深沟',scope:'FINAL',scopeLabel:'褶皱轮廓'},{id:'builtin-b',name:'圆形',scope:'BASE',scopeLabel:'基础轮廓'},{id:'builtin-c',name:'浅沟',scope:'FINAL'}],before=structuredClone(records),prefs={favorites:['builtin-a','builtin-b'],recent:['builtin-c','builtin-a']};
  assert.deepEqual(filterTrunkPresetRecords(records,{query:'沟',mode:'RECENT',scope:'FINAL'},prefs).map(r=>r.id),['builtin-c','builtin-a']);assert.deepEqual(filterTrunkPresetRecords(records,{mode:'FAVORITES',query:'基础'},prefs).map(r=>r.id),['builtin-b']);assert.deepEqual(records,before);
});
test('rapid preference writes serialize and disk failure does not claim saved state or use browser fallback',async()=>{
  let disk={favorites:[],recent:[]},fail=false,localWrites=0;const calls=[];
  const fetch=async(url,options={})=>{calls.push(options.method||'GET');if(options.method==='POST'){if(fail)return{status:500,ok:false,json:async()=>({success:false,message:'磁盘失败'})};disk=JSON.parse(options.body);}return{status:200,ok:true,json:async()=>({success:true,preferences:disk})};};
  const prefs=createTrunkPresetPreferences('section',{fetch,storage:{setItem:()=>localWrites++}});
  await Promise.all([prefs.toggle('builtin-a'),prefs.toggle('builtin-b'),prefs.used('builtin-b'),prefs.used('builtin-a')]);assert.deepEqual(disk,{favorites:['builtin-b','builtin-a'],recent:['builtin-a','builtin-b']});assert.equal(calls.filter(v=>v==='GET').length,1);
  fail=true;await assert.rejects(prefs.toggle('builtin-a'),/磁盘失败/);assert.deepEqual(prefs.data,disk);assert.equal(localWrites,0);fail=false;await prefs.remove('builtin-a');assert.deepEqual(prefs.data,{favorites:['builtin-b'],recent:['builtin-b']});
});
test('only unavailable routes use static storage and kinds stay separate across reload',async()=>{
  const cache=new Map(),storage={getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)},fetch=async()=>({status:404});
  const section=createTrunkPresetPreferences('section',{fetch,storage}),profile=createTrunkPresetPreferences('profile',{fetch,storage});await section.used('builtin-shape');await profile.toggle('builtin-profile-v_groove');
  const cold=createTrunkPresetPreferences('section',{fetch,storage});await cold.load();assert.deepEqual(cold.data,{favorites:[],recent:['builtin-shape']});assert.deepEqual(profile.data,{favorites:['builtin-profile-v_groove'],recent:[]});
});
test('failed preference read cannot overwrite existing disk state',async()=>{
  let posts=0;const prefs=createTrunkPresetPreferences('detail',{fetch:async(_,o)=>{if(o.method)posts++;return{status:503,ok:false,json:async()=>({success:false,message:'不可用'})};}});await assert.rejects(prefs.toggle('builtin-a'),/不可用/);assert.equal(posts,0);assert.deepEqual(prefs.data,{favorites:[],recent:[]});
});
test('detail thumbnail uses the stored stroke positions without authoring changes',()=>{
  const shape={details:[{type:'GROOVE',t:.5,angle:5,width:10,height:.1,path:[{t:.4,angle:0},{t:.6,angle:10}]},{type:'KNOT',t:.55,angle:12,width:15,height:.1,path:[]}]},before=structuredClone(shape);const svg=trunkDetailPresetThumbnail(shape);assert.match(svg,/<polyline/);assert.match(svg,/<ellipse/);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);assert.deepEqual(shape,before);
});
test('desktop navigation route persists per kind in isolated config and rejects chunked oversize writes', {skip:process.platform!=='win32'},()=>{
  const runtime=path.resolve('.runtime');mkdirSync(runtime,{recursive:true});const directory=mkdtempSync(path.join(runtime,'trunk-preset-ui-route-')),file=path.join(directory,'route.ps1'),quote=v=>"'"+v.replaceAll("'","''")+"'";
  const setup=`$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$script:AppDir=${quote(path.resolve('.'))}
$script:ConfigDir=${quote(directory)}
$script:SessionDir=${quote(directory)}
$env:BRANCHFORGE_SESSION_TEST_DIR=${quote(directory)}
. (Join-Path $script:AppDir 'scripts/trunk-preset-server.ps1')
function Send-Json($Context,$Value,$Status=200){$script:RouteResult=$Value}
function Write-AtomicText($File,$Text){[IO.File]::WriteAllText($File,$Text,(New-Object Text.UTF8Encoding $false))}
function Call-Route([string]$Kind,[string]$Method,[string]$Body='',[long]$Declared=-2){
 $bytes=[Text.Encoding]::UTF8.GetBytes($Body);$stream=New-Object IO.MemoryStream(,$bytes)
 $request=[pscustomobject]@{QueryString=@{kind=$Kind};HttpMethod=$Method;ContentLength64=$(if($Declared -eq -2){$bytes.Length}else{$Declared});InputStream=$stream}
 try{$null=Invoke-TrunkPresetRoute ([pscustomobject]@{Request=$request}) '/api/trunk-preset-preferences';return $script:RouteResult}finally{$stream.Dispose()}
}
`;
  writeFileSync(file,'\ufeff'+setup+`
$a=Call-Route 'section' 'POST' '{"favorites":["builtin-a","../escape","builtin-a"],"recent":["builtin-b","builtin-b"],"authoring":{}}'
$b=Call-Route 'profile' 'POST' '{"favorites":["builtin-profile-v_groove"],"recent":[]}'
$r=Call-Route 'root' 'POST' '{"favorites":["builtin-root-wide"],"recent":["builtin-root-low"]}'
$bad=Call-Route '../escape' 'POST' '{}'
$large=Call-Route 'section' 'POST' ('x'*65537) -1
@{saved=$a;profile=$b;root=$r;invalid=$bad.success;oversize=$large.success} | ConvertTo-Json -Depth 6 -Compress
`);
  const run=()=>{const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout);return JSON.parse(result.stdout.trim());};
  const result=run();assert.equal(result.saved.success,true);assert.equal(result.profile.success,true);assert.equal(result.root.success,true);assert.deepEqual(JSON.parse(readFileSync(path.join(directory,'trunk-preset-ui-root.json'),'utf8')),{favorites:['builtin-root-wide'],recent:['builtin-root-low']});assert.equal(result.invalid,false);assert.equal(result.oversize,false);assert.deepEqual(JSON.parse(readFileSync(path.join(directory,'trunk-preset-ui-section.json'),'utf8')),{favorites:['builtin-a'],recent:['builtin-b']});
  writeFileSync(file,'\ufeff'+setup+"Call-Route 'section' 'GET' | ConvertTo-Json -Depth 6 -Compress");assert.deepEqual(run().preferences,{favorites:['builtin-a'],recent:['builtin-b']});
});
