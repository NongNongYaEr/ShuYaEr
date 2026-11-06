import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=JSON.parse(fs.readFileSync(path.join(root,'v040-baseline.json')));
const changes=new Set(['AGENTS.md','README_从这里开始.md','package.json','release.json','release-config.json','native/BranchGeneratorDesktop.cs','server.ps1','web/app.js','web/trunk-preparation.js','树鸭儿.exe','启动树鸭儿.bat']);
const digest=p=>new Promise((resolve,reject)=>{const h=createHash('sha256'),r=fs.createReadStream(p);r.on('data',b=>h.update(b));r.on('end',()=>resolve(h.digest('hex')));r.on('error',reject);});
let verified=0,bytes=0;const mismatches=[];for(const f of base.files){if(changes.has(f.path))continue;const actual=await digest(path.join(root,f.path));if(actual!==f.sha256)mismatches.push({path:f.path,expected:f.sha256,actual});verified++;bytes+=f.bytes;}
const result={passed:!mismatches.length,source:base.source,verified,bytes,mismatches,intentionalForkFiles:[...changes],note:'逐项核对未修改的V040运行库和源码，比较归档SHA；不写原V040。'};
fs.writeFileSync(path.join(root,'.runtime/v050-build/baseline-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,verified,bytes,mismatches:mismatches.length}));if(!result.passed)process.exitCode=1;
