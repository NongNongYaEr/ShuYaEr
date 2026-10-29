const fs=require('fs'),path=require('path'),assert=require('assert/strict');
module.exports=function cleanup(root,out,{keepModels=false}={}){
 const base=fs.realpathSync(path.join(root,'.runtime','skinned-glb')),dir=fs.realpathSync(out),relative=path.relative(base,dir);
 assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&/^native-\d+$/.test(relative));
 const host=JSON.parse(fs.readFileSync(path.join(dir,'host.json'),'utf8'));assert(fs.existsSync(path.join(dir,'host-exit.json')));let active=false;try{process.kill(host.pid,0);active=true;}catch{}assert(!active,'owned test host must exit before cleanup');
 const targets=fs.readdirSync(dir).filter(name=>name==='WebView2'||['fixture.branch.json','saved.branch.json','static.glb'].includes(name)||/^recent-[a-f0-9]+\.branch\.json$/.test(name)||(!keepModels&&['skeletal.glb','skeletal-verified.blend','skeletal-verified.blend1'].includes(name)));
 let bytes=0;const size=p=>{const s=fs.lstatSync(p);assert(!s.isSymbolicLink());return s.isDirectory()?fs.readdirSync(p).reduce((n,f)=>n+size(path.join(p,f)),0):s.size;};
 for(const name of targets){const target=fs.realpathSync(path.join(dir,name)),rel=path.relative(dir,target);assert(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel));bytes+=size(target);fs.rmSync(target,{recursive:fs.statSync(target).isDirectory()});}return bytes;
};
