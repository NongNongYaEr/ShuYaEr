import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyNativeProvenance} from './native-runtime-provenance.mjs';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const digest=async file=>{const h=createHash('sha256');for await(const bytes of fs.createReadStream(file))h.update(bytes);return h.digest('hex');};
const json=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Release symlink');const file=path.join(dir,e.name);return e.isDirectory()?walk(file):[file];});
export async function auditProfessionalRelease(destination,rootFiles=['server.ps1','web/index.html','runtime/node.exe','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','release-config.json']){
 const release=read(path.join(destination,'release-config.json')),native=read(path.join(destination,'runtime/native/manifest.json'));
 const errors=[],files=walk(destination).filter(f=>path.basename(f)!=='release-manifest.json'),entries=[];
 try{verifyNativeProvenance(null,path.join(destination,'runtime/native'));}catch(error){errors.push(error.message);}
 if(native.product_version!==release.version||native.entry!==release.entry||native.main_viewport!=='DX12')errors.push('Release/native version or viewport mismatch');
 for(const relative of [...rootFiles,release.entry,'runtime/native/manifest.json',...native.files.map(f=>'runtime/native/'+f.name)])if(!fs.existsSync(path.join(destination,relative)))errors.push('Missing runtime file: '+relative);
 if(fs.existsSync(path.join(destination,release.entry))&&await digest(path.join(destination,release.entry))!==native.entry_sha256)errors.push('Published desktop checksum mismatch');
 for(const item of native.files){const file=path.join(destination,'runtime/native',item.name);if(fs.existsSync(file)&&await digest(file)!==item.sha256)errors.push('Published native checksum mismatch: '+item.name);}
 for(const file of files){const relative=path.relative(destination,file).replaceAll('\\','/');if(/(^|\/)(\.runtime|tests|归档|tree-template-backups)(\/|$)|\.(blend\d*|log|bak|zip)$/i.test(relative))errors.push('Excluded content: '+relative);entries.push({path:relative,bytes:fs.statSync(file).size,sha256:await digest(file)});
  if(/\.(js|mjs|cjs)$/.test(relative)){const text=fs.readFileSync(file,'utf8');for(const re of [/(?:from\s*|import\s*\(\s*)['"](\.[^'"?]+)['"]/g,/new URL\(\s*['"](\.[^'"?]+)['"]\s*,\s*import\.meta\.url/g])for(const m of text.matchAll(re))if(!fs.existsSync(path.resolve(path.dirname(file),m[1])))errors.push('Missing JS: '+relative+' -> '+m[1]);}
  if(relative.endsWith('.ps1'))for(const m of fs.readFileSync(file,'utf8').matchAll(/['"](scripts[\\/][^'"]+\.(?:ps1|mjs))['"]/g))if(!fs.existsSync(path.join(destination,m[1])))errors.push('Missing server dependency: '+m[1]);
  if(relative.endsWith('.meta.json')){const meta=read(file);if(meta.userSaved)errors.push('Personal save: '+relative);for(const field of ['path','previewPath'])if(meta[field]&&!fs.existsSync(path.join(destination,meta[field])))errors.push('Missing '+field+': '+relative);}
 }
 const counts={branches:entries.filter(f=>f.path.endsWith('.branchasset.json')).length,templates:entries.filter(f=>f.path.startsWith('assets/tree-template-library/')&&f.path.endsWith('.branch.json')).length,calibratedPacks:entries.filter(f=>f.path.endsWith('.plantunits.json')).length};if(counts.branches!==164||counts.templates!==28||counts.calibratedPacks!==28)errors.push('Formal library count mismatch');
 json(path.join(destination,'release-manifest.json'),{version:1,release,counts,files:entries,passed:!errors.length,errors});
 return {passed:!errors.length,destination,files:entries.length,bytes:entries.reduce((n,f)=>n+f.bytes,0),counts,errors};
}
