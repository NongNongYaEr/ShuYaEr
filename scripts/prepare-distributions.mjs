// Freeze the verified application into four fresh, independent distributions.
// Source files are read-only. Caches, backups and test output never enter a copy.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createGzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
const flag=name=>{const n=process.argv.indexOf(name);return n>=0?process.argv[n+1]:null;};
const root=path.resolve(flag('--source')||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const {verifyNativeProvenance}=await import(pathToFileURL(path.join(root,'scripts/native-runtime-provenance.mjs')));
const {packSampleResources}=await import(pathToFileURL(path.join(root,'scripts/sample-resource-pack.mjs')));
const delivery=flag('--delivery')||'V030',shell=flag('--shell'),overlay=flag('--overlay');
const destination=process.argv[2]&&path.resolve(process.argv[2]);
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const slash=f=>f.replaceAll('\\','/');
const write=(dir,file,text)=>{const target=inside(dir,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);};
const json=(dir,file,value)=>write(dir,file,JSON.stringify(value,null,2)+'\n');
function inside(dir,file){const target=path.resolve(dir,file);if(!target.startsWith(dir+path.sep))throw Error('Path escaped: '+file);return target;}
const excluded=new Set(['.runtime','.git','.codex','.agents','node_modules','__pycache__','tree-template-backups','Intermediate','Binaries','Saved','DerivedDataCache']);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const f=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Symlink input: '+f);if(excluded.has(e.name)||/\.(blend\d+|pyc|bak|tmp)$/i.test(e.name))return [];return e.isDirectory()?walk(f):[f];});}
const digest=async file=>{const hash=createHash('sha256');for await(const b of fs.createReadStream(file))hash.update(b);return hash.digest('hex');};
const sourceHashes=new Map();
async function copyFile(from,dir,relative){const target=inside(dir,relative);fs.mkdirSync(path.dirname(target),{recursive:true});const original=await digest(from);if(fs.existsSync(target)){const actual=await digest(target);let generated=false;if(relative===release.entry&&shell)generated=actual===await digest(shell);if(relative==='runtime/native/manifest.json'){const old=read(from),next=read(target);generated=next.product_version===release.version&&next.entry_sha256===await digest(shell)&&JSON.stringify(old.files)===JSON.stringify(next.files);}if(actual!==original&&!generated)throw Error('Existing input differs: '+target);}else fs.copyFileSync(from,target,fs.constants.COPYFILE_EXCL);if(from.startsWith(root+path.sep)&&!sourceHashes.has(from))sourceHashes.set(from,original);}
async function copyRelative(dir,relative,filter=()=>true){const from=inside(root,relative);if(!fs.existsSync(from))throw Error('Missing build input: '+relative);const files=fs.statSync(from).isDirectory()?walk(from):[from];for(const f of files){const rel=slash(path.relative(root,f));if(filter(rel))await copyFile(f,dir,rel);}}
const metas=relative=>fs.existsSync(inside(root,relative))?fs.readdirSync(inside(root,relative)).filter(n=>n.endsWith('.meta.json')).map(n=>({file:relative+'/'+n,meta:read(inside(root,relative+'/'+n))})):[];
const sourceRelease=read(inside(root,'release-config.json')),release={...sourceRelease,version:flag('--version')||sourceRelease.version,channel:'professional'};
if(!/^\d+\.\d+\.\d+$/.test(release.version)||!/^V\d{3}$/.test(delivery))throw Error('Invalid release identity');
const classes=[['TREE','CAMPHOR','香樟','tree-camphor-v1.json'],['SHRUB','AZALEA','杜鹃','tree-azalea-v1.json'],['POTTED','FIDDLE_FIG','琴叶榕','tree-fiddle_fig-v1.json'],['VINE','IVY','常春藤','ivy-v1.json'],['FLOWERING_VINE','BOUGAINVILLEA','三角梅','bougainvillea-v1.json'],['GRASS','SCENE_GRASS','草叶','scene-grass-v1.json'],['HERB','SCENE_BROADLEAF','大叶草本','scene-broadleaf-v1.json'],['FLOWER','SCENE_FLOWER','黄色小花','scene-flower-v1.json']].map(([category,species,name,file])=>({category,species,name,file}));
const trees=metas('assets/tree-template-library'),branches=metas('assets/branch-asset-library'),units=metas('assets/plant-unit-library'),prefabs=metas('assets/branch-prefab-library');
const selectedTrees=classes.map(c=>{const row=trees.find(v=>v.meta.species===c.species&&v.meta.batch==='ALL_PLANT_SAMPLE_V2');if(!row)throw Error('No representative template: '+c.species);return row;});
const requiredBranches=new Set(),embedded=new Map();
for(const row of selectedTrees){const doc=read(inside(root,row.meta.path));for(const entry of doc.authoring?.branch_library||[]){requiredBranches.add(entry.id);embedded.set(entry.id,entry);}}
for(const row of prefabs){const doc=read(inside(root,row.file.replace('.meta.json','.prefab.json')));for(const entry of doc.library||[]){requiredBranches.add(entry.id);embedded.set(entry.id,entry);}}
const selectedBranches=branches.filter(v=>requiredBranches.has(v.meta.id));
const embeddedOnly=[...requiredBranches].filter(id=>!selectedBranches.some(v=>v.meta.id===id));
for(const id of embeddedOnly){const asset=embedded.get(id);if(!asset?.shape?.branches?.length||!asset.sample)throw Error('Representative branch dependency is incomplete: '+id);}
const selectedUnits=units.filter(v=>classes.some(c=>v.meta.id===c.species+'_FINISHED_V1'));
if(selectedUnits.length!==classes.length)throw Error('Representative calibrated packs are missing');
const qaUnit='prepared-aca902b0-b643-4bfb-9881-6eefd4d9621e';
const variants=[{folder:'01_精简EXE',lite:true,source:false},{folder:'02_精简公开源码',lite:true,source:true,public:true},{folder:'03_全资产EXE',lite:false,source:false},{folder:'04_全资产开发',lite:false,source:true}];
const selection={release,sourceRelease,delivery,classes,requiredBranches:[...requiredBranches],embeddedOnlyDependencies:embeddedOnly,counts:{lite:{trees:selectedTrees.length,branches:selectedBranches.length,units:selectedUnits.length,prefabs:prefabs.length},full:{trees:trees.length,branches:branches.length,units:units.filter(v=>v.meta.id!==qaUnit).length,prefabs:prefabs.length}},variants};
if(process.argv.includes('--plan-only')){console.log(JSON.stringify(selection,null,2));process.exit(0);}
if(!destination||destination===root||destination.startsWith(root+path.sep))throw Error('Use a fresh sibling delivery directory');
const resume=process.argv.includes('--resume');
if(fs.existsSync(destination)&&fs.readdirSync(destination).length&&(!resume||JSON.stringify(read(inside(destination,'交付计划.json')))!==JSON.stringify(selection)))throw Error('Destination is not empty; originals will not be overwritten');
verifyNativeProvenance(root,inside(root,'runtime/native'));
const manifest=read(inside(root,'runtime/native/manifest.json'));
if(manifest.product_version!==sourceRelease.version||manifest.entry_sha256!==await digest(inside(root,sourceRelease.entry)))throw Error('Verified source desktop does not match source release');
if(!shell||!fs.existsSync(shell))throw Error('Supply the freshly built target-version desktop shell with --shell');
fs.mkdirSync(destination,{recursive:true});json(destination,'交付计划.json',selection);
const docs=overlay?path.join(overlay,'design','distribution-'+delivery.toLowerCase()):path.join(root,'design','distribution-'+delivery.toLowerCase());
const runtimeScripts=['unit-preparation-server.ps1','plant-unit-thumbnail-server.ps1','plant-pack-server.ps1','plant-pack-cli.mjs','plant-pack-library.mjs','plant-pack-container.mjs','branch-prefab-server.ps1','creative-library-server.ps1','project-files-server.ps1','project-library-server.ps1','project-session-server.ps1','project-template-current.ps1','trunk-section-preset-server.ps1','trunk-preset-server.ps1','trunk-preset-cli.mjs','pve-export-server.ps1','index-project-library.mjs','inspect-asset-references.mjs','export-pve-complete-units.mjs','export-pve-vine.mjs','export_branchforge_resolved_assembly.mjs','export-static-vegetation.mjs','pve-atlas.mjs','pve-atlas.ps1','pve-merged-atlas.mjs','pve-merged-atlas.ps1','pve-geometry-quality.mjs','pve-package.mjs','pve-final-package.mjs','pve-final-geometry.mjs','pve-unit-reuse.mjs','pve-bark-materials.mjs','pve-bark-setup.py','static-vegetation-package.mjs','static-texture-tint.ps1'];
const rootFiles=['启动树鸭儿.bat','server.ps1','WEBVIEW2-LICENSE.txt','WEBVIEW2-NOTICE.txt','branch-cli.mjs','pve-leaf-sources-cli.mjs','pve-skeleton-cli.mjs','pve-unit-glb-cli.mjs','pve-whole-tree-cli.mjs','vendor-loader.mjs','release-config.json'];
const legacyScript=/^(?:audit-release-v01|prepare-release-(?:lite-)?v01|prepare-v020-distributions|build-(?:release-v011|single-file-v01)|test-(?:release-v011-single|single-file-v01)|zip-release-v01|trunk-detail-release)/;
const coreTests=['unit-preparation.test.mjs','keyboard-transform.test.mjs','plant-unit-grid.test.mjs','unit-authoring.test.mjs','unit-preparation-rotation.test.mjs','unit-preparation-scale.test.mjs'].filter(f=>fs.existsSync(inside(root,'tests/'+f)));
const reports=[];
for(const variant of variants){
 const dir=variant.folder==='01_精简EXE'?inside(destination,'验收记录/构建暂存/精简运行目录'):inside(destination,variant.folder);
 if(resume&&fs.existsSync(inside(dir,'distribution-manifest.json'))){const existing=read(inside(dir,'distribution-manifest.json'));if(existing.release!==release.version||existing.variant!==variant.folder)throw Error('Unrecognized partial distribution');for(const file of existing.files)if(await digest(inside(dir,file.path))!==file.sha256)throw Error('Existing distribution changed: '+file.path);const entries=existing.files;reports.push({folder:variant.folder,counts:existing.counts,files:entries.length,bytes:entries.reduce((sum,f)=>sum+f.bytes,0),maximumFileBytes:Math.max(...entries.map(f=>f.bytes))});console.log('REUSED verified '+variant.folder);continue;}
 fs.mkdirSync(dir,{recursive:true});console.log('START '+variant.folder);
 for(const f of rootFiles)await copyRelative(dir,f);
 await copyRelative(dir,'web',relative=>!relative.startsWith('web/assets/plant-unit-thumbnails/')&&!relative.startsWith('web/assets/plants/')&&(!variant.lite||!relative.startsWith('web/assets/references/')));
 if(variant.source){await copyRelative(dir,'native');await copyRelative(dir,'tests');await copyRelative(dir,'UnrealPlugin');}
 // Runtime services have acquired transitive tree preparation/export modules.
 // Ship the current small tool set instead of a historical fixed dependency list.
 await copyRelative(dir,'scripts',relative=>!legacyScript.test(path.basename(relative)));
 await copyRelative(dir,'UEWorkbench');
 for(const f of ['LICENSE.txt','ASSETS_LICENSE.md','BRAND_NOTICE.md','THIRD_PARTY_NOTICES.md'])await copyRelative(dir,f);
 const plantFiles=variant.lite?new Set(classes.map(c=>c.file)):null;
 await copyRelative(dir,'web/assets/plants',f=>!plantFiles||plantFiles.has(path.basename(f)));
 const catalog=read(inside(root,'web/assets/plant-unit-catalog.json')).filter(c=>!plantFiles||plantFiles.has(c.file)).map(c=>({...c,source:'随软件附带的植物样本，见 ASSETS_LICENSE.md'}));
 fs.writeFileSync(inside(dir,'web/assets/plant-unit-catalog.json'),JSON.stringify(catalog,null,2)+'\n');
 const chosenUnits=variant.lite?selectedUnits:units.filter(v=>v.meta.id!==qaUnit),unitIds=new Set(chosenUnits.map(v=>v.meta.id));
 const thumbCatalog=read(inside(root,'web/assets/plant-unit-thumbnails/catalog.json'));thumbCatalog.items=thumbCatalog.items.filter(v=>unitIds.has(v.id));
 json(dir,'web/assets/plant-unit-thumbnails/catalog.json',thumbCatalog);for(const item of thumbCatalog.items)await copyRelative(dir,'web/assets/plant-unit-thumbnails/'+item.file);
 for(const [rows,suffix]of [[variant.lite?selectedBranches:branches,'.branchasset.json'],[chosenUnits,'.plantunits.json'],[prefabs,'.prefab.json']])for(const row of rows){await copyRelative(dir,row.file);await copyRelative(dir,row.file.replace('.meta.json',suffix));}
 for(const row of variant.lite?selectedTrees:trees){await copyRelative(dir,row.meta.path);const meta={...row.meta,sourcePath:row.meta.path};delete meta.originalSource;
  if(meta.previewPath&&fs.existsSync(inside(root,meta.previewPath))){const relative='assets/tree-template-library/'+meta.id+path.extname(meta.previewPath);if(relative!==row.meta.path)await copyFile(inside(root,meta.previewPath),dir,relative);meta.previewPath=relative;}else delete meta.previewPath;
  json(dir,row.file,meta);
 }
 json(dir,'assets/project-library/catalog.json',{version:2,items:[],errors:[],scannedAt:null});
for(const name of ['trunk-presets','trunk-section-presets','tree-recipe-library','plant-package-library',...(!variant.lite?['trunk-models']:[])])if(fs.existsSync(inside(root,'assets/'+name)))await copyRelative(dir,'assets/'+name);
 if(variant.lite){let distribution=fs.readFileSync(inside(dir,'web/distribution-config.js'),'utf8');distribution=distribution.replace("edition: 'full', treeSpecies: null", "edition: 'sample', treeSpecies: ['CAMPHOR','AZALEA','FIDDLE_FIG']");fs.writeFileSync(inside(dir,'web/distribution-config.js'),distribution);}
 if(!variant.public){for(const f of [release.entry,'Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','runtime'])await copyRelative(dir,f);fs.copyFileSync(shell,inside(dir,release.entry));const native=read(inside(dir,'runtime/native/manifest.json'));native.product_version=release.version;native.channel=release.channel;native.entry_sha256=await digest(shell);json(dir,'runtime/native/manifest.json',native);}
 else{for(const f of ['runtime/NOTICE.txt','runtime/NODE-LICENSE.txt'])await copyRelative(dir,f);for(const f of walk(inside(root,'runtime/native')).filter(f=>/license|notice/i.test(path.basename(f))))await copyFile(f,dir,slash(path.relative(root,f)));}
 if(variant.source&&!variant.public){
  for(const f of ['BlenderAsset','次枝资产','初始样本','植物图片素材库','测试树干','assets/references','design','交付说明'])await copyRelative(dir,f);
  for(const f of fs.readdirSync(root).filter(f=>/\.(md|bat)$/.test(f)&&!['AGENTS.md','README_从这里开始.md','启动树鸭儿.bat'].includes(f)))await copyRelative(dir,f);
  await copyRelative(dir,'AGENTS.md');
 }
 if(overlay){for(const f of walk(overlay)){const rel=slash(path.relative(overlay,f));if(rel==='交付说明/V020开发历史.md'&&variant.folder!=='04_全资产开发')continue;const target=inside(dir,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(f,target);}}
 json(dir,'release-config.json',release);
 const pkg={name:variant.public?'shuyaer-source-available':'shuyaer-'+delivery.toLowerCase(),version:release.version,private:!variant.public,type:'module',license:'LicenseRef-ShuYaEr-Free-Use-Source-Available-1.0',...(variant.source?{scripts:{test:'node --experimental-loader ./tests/vendor-loader.mjs --test '+coreTests.map(f=>'tests/'+f).join(' '),'test:all':'node --experimental-loader ./tests/vendor-loader.mjs --test tests/*.test.mjs'}}:{})};json(dir,'package.json',pkg);
 json(dir,'release.json',{...release,delivery,variant:variant.folder,sampleClasses:variant.lite?classes:null,sourceAvailable:!!variant.source,publicSource:!!variant.public,license:pkg.license,commercialCreativeOutput:true,commercialRedistributionRequiresWrittenPermission:true});
 const counts=selection.counts[variant.lite?'lite':'full'];
 json(dir,'资产清单.json',{...counts,samples:variant.lite?classes:null,requiredBranchIds:variant.lite?[...requiredBranches]:null,excludedVerificationOnlyAsset:qaUnit});
 if(variant.public){
  const resources=walk(dir).filter(f=>slash(path.relative(dir,f)).startsWith('assets/')||slash(path.relative(dir,f)).startsWith('web/assets/'));const packed=packSampleResources(dir,resources);for(const file of resources)fs.unlinkSync(file);console.log('Sample blocks: '+packed.blocks.length+' for '+resources.length+' files');
  write(dir,'.gitignore','.runtime/\n导出/\n恢复资料/\nnode_modules/\n*.exe\n*.dll\n*.blend1\nassets/\nweb/assets/\n!web/assets/.gitkeep\nruntime/native/*.json\nruntime/native/*.hlsl\n');
  write(dir,'.gitattributes','* text=auto\n*.gz binary\n*.png binary\n*.jpg binary\n*.wasm binary\n');
 }
 write(dir,'README_从这里开始.md',fs.readFileSync(path.join(docs,variant.public?'README_SOURCE.md':variant.source?'README_DEVELOPMENT.md':'README_DESKTOP.md'),'utf8').replaceAll('{{VERSION}}',release.version).replaceAll('{{VARIANT}}',variant.folder));
 if(variant.public)write(dir,'README.md',fs.readFileSync(inside(dir,'README_从这里开始.md'),'utf8'));
 const entries=[];for(const file of walk(dir)){const relative=slash(path.relative(dir,file)),bytes=fs.statSync(file).size;if(variant.public&&bytes>95*1024*1024)throw Error('Public source file requires splitting: '+relative);entries.push({path:relative,bytes,sha256:await digest(file)});}
 json(dir,'distribution-manifest.json',{format:1,release:release.version,variant:variant.folder,counts,files:entries});
 const report={folder:variant.folder,counts,files:entries.length,bytes:entries.reduce((sum,f)=>sum+f.bytes,0),maximumFileBytes:Math.max(...entries.map(f=>f.bytes))};reports.push(report);console.log('COMPLETE '+JSON.stringify(report));
}
for(const [file,hash]of sourceHashes)if(await digest(file)!==hash)throw Error('Source changed while freezing: '+file);
json(destination,'源文件校验.json',{sourceVersion:release.version,files:[...sourceHashes].map(([file,sha256])=>({path:slash(path.relative(root,file)),sha256})),changed:0});
json(destination,'四版本构建记录.json',{passed:false,assembled:true,release:release.version,delivery,reports,sourceFilesVerified:sourceHashes.size,validation:'Pending independent cold starts'});
write(destination,'先读我.md',`# 树鸭儿 ${delivery} 归档\n\n程序版本 ${release.version}，工程格式 4，主视口 DX12。\n\n${reports.map(r=>'- **'+r.folder+'**：'+(r.bytes/1024**3).toFixed(2)+' GiB（打包前），'+r.counts.trees+' 个整株样板、'+r.counts.branches+' 款单元枝、'+r.counts.units+' 套叶花果、'+r.counts.prefabs+' 个预制枝干。').join('\n')}\n\n01 最终交付单个 EXE；03 为独立运行文件夹。公开源码的样本压缩存放，准备脚本按校验清单还原，不包含 EXE、DLL、个人恢复资料或完整资产库。开发副本保留当前源码和完整制作原件。构建缓存、历史发布包和测试输出不进入归档。\n\n允许用软件和随附样本制作商业作品；软件、源码、修改版或原始素材的商业分发需要作者单独书面授权。许可内容保持原已确认版本，详见各目录声明。\n`);
console.log(JSON.stringify({passed:true,destination,reports}));
