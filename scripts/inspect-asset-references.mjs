// Paths are resolved and authorized by the desktop server before this worker runs.
// Skip unrelated documents before parsing their embedded meshes and atlases.
import fs from 'node:fs';
const [manifestPath,id]=process.argv.slice(2);
if(!/^[a-zA-Z0-9_.-]{1,160}$/.test(id||''))throw Error('素材 ID 无效');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8').replace(/^\uFEFF/,''));
const needle=Buffer.from('"'+id+'"'),items=[],errors=[...(manifest.errors||[])];
for(const item of manifest.items){
  try{
    const bytes=fs.readFileSync(item.file);if(!bytes.includes(needle))continue;
    const doc=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
    const spaces=item.kind==='配方'?[['整树配方',doc]]:[['当前工程',doc],['整树',doc.workspaces?.tree],['枝条',doc.workspaces?.branch],['藤蔓',doc.workspaces?.vine]];
    const workspaces=[];
    for(const [workspace,data] of spaces){if(!data)continue;const instances=(data.authoring?.branch_instances||[]).filter(i=>i.asset_id===id),library=(data.authoring?.branch_library||[]).some(a=>a.id===id);
      if(instances.length||library)workspaces.push({workspace,count:instances.length,revisions:[...new Set(instances.map(i=>i.pinned_revision))].sort((a,b)=>a-b),library});
    }
    if(workspaces.length){const {file,...meta}=item;items.push({...meta,workspaces});}
  }catch(e){errors.push({name:item.name,message:e.message});}
}
process.stdout.write(JSON.stringify({items,errors,scope:'已登记的工程、样板与整树配方；不扫描未登记的外部文件'}));
