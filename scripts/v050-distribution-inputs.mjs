import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function verifyV050Inputs(root){
 const release=read(path.join(root,'release-config.json')),native=read(path.join(root,'runtime/native/manifest.json'));
 const executable=sha(path.join(root,release.entry));
 if(!['0.5.0','0.5.1','0.5.2'].includes(release.version)||native.product_version!==release.version||native.entry!==release.entry||native.entry_sha256!==executable)throw Error('Integrated desktop does not match its native manifest');
 if(release.version==='0.5.0'){
  const proof=read(path.join(root,'v050-verification.json'));
  if(!proof.passed||executable!==proof.executableSHA256)throw Error('V050 integrated desktop is not verified');
 }
 const material=read(path.join(root,'material/native/material-native-verification.json')),folder=path.join(root,'material/runtime/native-material');
 if(!material.passed||material.abi!==1||material.slots!==13||sha(path.join(folder,'shader-layout.json'))!==material.shaderLayoutSHA256)throw Error('V050 material ABI or shader layout verification failed');
 const dll=['TreeMaterialDX12.dll','TreeMaterialDX12.next.dll'].map(f=>path.join(folder,f)).find(f=>fs.existsSync(f)&&sha(f)===material.sha256);if(!dll)throw Error('Verified material DLL missing');
 const layout=read(path.join(folder,'shader-layout.json'));for(const stage of [...Object.values(layout.stages),...Object.values(layout.sceneVariants||{})]){if(stage.binary&&stage.binarySHA256&&sha(path.join(folder,stage.binary))!==stage.binarySHA256)throw Error('Material shader binary differs: '+stage.binary);}
 return{release,material,dll};
}
export async function copyV050Material(root,dir,variant,{copyRelative,copyFile,writeJSON},verified){
 for(const name of fs.readdirSync(path.join(root,'material'),{withFileTypes:true}).filter(e=>e.isFile()&&/\.(js|mjs|json|ps1|txt|md)$/i.test(e.name)).map(e=>e.name))await copyRelative(dir,'material/'+name);
 for(const name of ['web','core','licenses'])await copyRelative(dir,'material/'+name,rel=>variant.source&&!variant.public||runtimeMaterialPathAllowed(rel));
 if(variant.source)await copyRelative(dir,'material/native',rel=>!(/\.(exe|dll|cso|obj|pdb|spv|lib)$/i.test(rel)));
 if(!variant.public){
  await copyRelative(dir,'material/runtime',rel=>!rel.endsWith('.next.dll'));
  for(const name of ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll'])await copyRelative(dir,'material/'+name);
  const target=path.join(dir,'material/runtime/native-material/TreeMaterialDX12.dll');fs.copyFileSync(verified.dll,target);
  writeJSON(dir,'material/native/material-native-verification.json',{...verified.material,pending:null,packaged:true});
 }else{
  for(const rel of ['runtime/NOTICE.txt','runtime/NODE-LICENSE.txt','runtime/native/meshoptimizer-LICENSE.md'])if(fs.existsSync(path.join(root,'material',rel)))await copyRelative(dir,'material/'+rel);
 }
 // Prompt provenance is retained without disclosing a developer's profile path.
 for(const file of ['material/web/assets/sculpt-bark/prompts.json','material/web/assets/featured-bark/prompts.json']){
  const target=path.join(dir,file);if(!fs.existsSync(target))continue;const p=read(target);for(const row of p.records||[])if(row.generatedSource)row.generatedSource=row.file;writeJSON(dir,file,p);
 }
}
export function publicSourcePathAllowed(relative){return !/\.(exe|dll|cso|obj|pdb|spv|lib)$/i.test(relative);}
export function runtimeMaterialPathAllowed(relative){
 // The active atlas and paired shelf maps provide every style. Original source
 // sheets, unused standalone derivatives and superseded atlases stay in 04.
 if(/^material\/web\/assets\/(bark-expansion|burls|surface-decals)\//.test(relative))return /\/(metadata\.json|generation-prompt\.txt)$/.test(relative);
 if(relative.startsWith('material/web/assets/coatings/'))return /\/(coating-atlas-v3(?:-[abc]\.png|\.json)|metadata\.json)$/.test(relative);
 return true;
}
