// Register finished files only; originals and existing library records stay intact.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'次枝资产'),destination=path.join(root,'assets/branch-asset-library');
const summary=item=>({id:item.id,name:item.name,revision:item.revision,thumbnail:item.thumbnail||'',tags:item.sample?.authoring?.recipe?.tags||[],branches:item.shape?.branches?.length||0,leafCount:item.sample?.leaf_meshes?.length||0,organCount:item.sample?.authoring?.tree_organs?.units?.length||0});
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name.endsWith('.branchasset.json')?[path.join(dir,e.name)]:[]);}
fs.mkdirSync(destination,{recursive:true});const registered=[];
// Upgrade only the lightweight catalog. Existing finished asset data is retained.
for(const name of fs.readdirSync(destination).filter(n=>n.endsWith('.branchasset.json'))){
 const item=JSON.parse(fs.readFileSync(path.join(destination,name),'utf8'));
 fs.writeFileSync(path.join(destination,name.replace('.branchasset.json','.meta.json')),JSON.stringify(summary(item)));
}
for(const file of process.argv.includes('--metadata-only')?[]:walk(source)){
 if(file.includes(path.join('次枝资产','全植物次枝成品V1'))){
  const dir=path.dirname(file),verified=path.join(dir,'软件重载验收.json'),review=path.join(dir,'视觉验收.json'),recipe=path.join(dir,'制作数据.json'),roundtrip=path.join(dir,'成品数据往返验收.json');
  if(!fs.existsSync(verified)||!fs.existsSync(review)||!fs.existsSync(roundtrip)||!JSON.parse(fs.readFileSync(verified)).passed||!JSON.parse(fs.readFileSync(review)).passed||!JSON.parse(fs.readFileSync(roundtrip)).passed||fs.statSync(verified).mtimeMs<fs.statSync(recipe).mtimeMs||fs.statSync(file).mtimeMs<fs.statSync(recipe).mtimeMs||fs.statSync(roundtrip).mtimeMs<fs.statSync(file).mtimeMs)continue;
 }
 const wrapper=JSON.parse(fs.readFileSync(file,'utf8'));if(wrapper.format!=='BranchForgeBranchAsset')continue;
 const item=wrapper.asset;if(!item?.id||!item.shape?.branches?.length)continue;
 const key=crypto.createHash('sha256').update(item.id).digest('hex'),target=path.join(destination,key+'.branchasset.json');
 if(fs.existsSync(target))continue;
 fs.writeFileSync(target,JSON.stringify(item),{flag:'wx'});
 fs.writeFileSync(path.join(destination,key+'.meta.json'),JSON.stringify(summary(item)));
 registered.push({id:item.id,name:item.name,source:path.relative(root,file)});
}
fs.mkdirSync(path.join(root,'.runtime/branch-library-manager'),{recursive:true});
fs.writeFileSync(path.join(root,'.runtime/branch-library-manager/registered-files.json'),JSON.stringify(registered,null,2));
console.log(JSON.stringify({registered:registered.length,names:registered.map(a=>a.name)}));
