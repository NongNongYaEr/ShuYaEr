const fs=require('fs'),path=require('path'),assert=require('assert/strict');
// Only the dedicated, exited test host's known temporary outputs are removed.
// Reports, screenshots, logs and every real project/source stay in place.
module.exports=function cleanupUnitPaintHost(root,out){
 const base=fs.realpathSync(path.join(root,'.runtime','unit-brush-tools')),dir=fs.realpathSync(out),relative=path.relative(base,dir);
 assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert(/^(native|imported)-\d+$/.test(path.basename(dir)));
 assert(fs.existsSync(path.join(dir,'host.json'))&&fs.existsSync(path.join(dir,'host-exit.json')));
 const {pid}=JSON.parse(fs.readFileSync(path.join(dir,'host.json'),'utf8'));let active=false;try{process.kill(pid,0);active=true;}catch{}assert(!active,'owned test host has not exited');
 let bytes=0;const size=p=>{const s=fs.lstatSync(p);assert(!s.isSymbolicLink());return s.isDirectory()?fs.readdirSync(p).reduce((n,f)=>n+size(path.join(p,f)),0):s.size;};
 for(const name of fs.readdirSync(dir).filter(n=>n==='WebView2'||['saved.branch.json','fixture.branch.json'].includes(n)||/^recent-[a-f0-9]+\.branch\.json$/.test(n))){
  const target=fs.realpathSync(path.join(dir,name)),rel=path.relative(dir,target);assert(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel));bytes+=size(target);fs.rmSync(target,{recursive:fs.statSync(target).isDirectory()});
 }return bytes;
};
