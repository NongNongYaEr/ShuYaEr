import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const hash=async f=>{const h=createHash('sha256');for await(const b of fs.createReadStream(f))h.update(b);return h.digest('hex');};
const json=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
const inside=(root,relative)=>{const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('Escaping input path');return file;};
const [action,appArg,buildArg,extra,flavorArg]=process.argv.slice(2),app=path.resolve(appArg),build=path.resolve(buildArg);
if(action==='prepare'){
 const manifestFile=path.join(app,'distribution-manifest.json'),manifest=read(manifestFile),release=read(path.join(app,'release-config.json')),native=read(path.join(app,'runtime/native/manifest.json'));
 if(release.version!==manifest.release||native.product_version!==release.version||native.entry_sha256!==await hash(path.join(app,release.entry)))throw Error('Unverified application/version mismatch');
 const names=new Set();for(const item of manifest.files){const file=inside(app,item.path),key=item.path.toLowerCase();if(names.has(key)||key.split('/').some(p=>['.runtime','.git','node_modules'].includes(p)))throw Error('Invalid package input');names.add(key);if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size!==item.bytes||await hash(file)!==item.sha256)throw Error('Application changed: '+item.path);}
 const files=[...manifest.files,{path:'distribution-manifest.json',bytes:fs.statSync(manifestFile).size,sha256:await hash(manifestFile)}];json(path.join(build,'input-manifest.json'),{files});json(path.join(build,'application.json'),{release,counts:manifest.counts});console.log(JSON.stringify({verified:true,files:files.length}));
}else if(action==='config'){
 const source=read(path.join(build,'application.json')),input=read(path.join(build,'input-manifest.json')),payload=path.join(build,'resources.pack'),payloadHash=await hash(payload),flavor=flavorArg||'v020-lite';if(!/^[a-z0-9-]+$/.test(flavor))throw Error('Invalid cache flavor');
 const boot=new Set(['树鸭儿.exe','server.ps1','runtime/node.exe','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','runtime/native/EditorViewport.hlsl','runtime/native/build-provenance.json','runtime/native/manifest.json','web/index.html','web/app.js','web/distribution-config.js','release-config.json']);
 const critical=input.files.filter(f=>boot.has(f.path)||f.path.startsWith('runtime/native/')&&f.path.endsWith('.dll'));
 const quote=v=>JSON.stringify(v);const data={version:source.release.version,flavor,payloadHash,payloadBytes:fs.statSync(payload).size,counts:source.counts,files:input.files.length,criticalPaths:critical.map(f=>f.path),criticalHashes:critical.map(f=>f.sha256)};
 fs.writeFileSync(path.join(build,'PackageConfig.cs'),'using System.Reflection;\n'+`[assembly: AssemblyTitle("树鸭儿")]\n[assembly: AssemblyProduct(${quote(extra||'树鸭儿 V020 精简单文件版')})]\n[assembly: AssemblyCompany("鸭儿")]\n[assembly: AssemblyVersion("${data.version}.0")]\n[assembly: AssemblyFileVersion("${data.version}.0")]\nnamespace TreeDuckPortable { internal static class PackageConfig {\npublic const string Version=${quote(data.version)};\npublic const string Flavor=${quote(data.flavor)};\npublic const string PayloadHash=${quote(payloadHash)};\npublic const long PayloadBytes=${data.payloadBytes}L;\npublic static readonly string[] CriticalPaths={${data.criticalPaths.map(quote).join(',')}};\npublic static readonly string[] CriticalHashes={${data.criticalHashes.map(quote).join(',')}};\n} }\n`);json(path.join(build,'package-config.json'),data);
}else if(action==='finish'){
 const output=path.resolve(extra),payload=path.join(build,'resources.pack'),launcher=path.join(build,'launcher.exe'),stream=fs.createWriteStream(output,{flags:'wx'}),config=read(path.join(build,'package-config.json'));
 for(const file of [launcher,payload])for await(const b of fs.createReadStream(file))if(!stream.write(b))await new Promise(r=>stream.once('drain',r));
 const footer=Buffer.alloc(24);footer.writeBigInt64LE(BigInt(config.payloadBytes));footer.write('TREEDUCK_SFX_V2!',8,'ascii');stream.write(footer);await new Promise((resolve,reject)=>{stream.on('error',reject);stream.end(resolve);});
 const result={...config,passed:true,exe:output,exeBytes:fs.statSync(output).size,exeSha256:await hash(output),cacheSubdirectory:config.version+'-'+config.flavor+'-'+config.payloadHash.slice(0,16),inputManifest:'input-manifest.json',packing:read(path.join(build,'resources.pack.audit.json'))};json(path.join(build,'portable-build.json'),result);console.log(JSON.stringify({passed:true,exe:output,bytes:result.exeBytes,sha256:result.exeSha256,files:result.files}));
}else throw Error('Unknown packaging action');
