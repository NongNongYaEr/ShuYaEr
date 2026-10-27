import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
test('asset reference worker reads actual current, parked and recipe instances, skipping unrelated documents',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tree-duck-refs-'));
  try{
    const docs=[{name:'当前树',document:{authoring:{branch_instances:[{asset_id:'A',pinned_revision:1}],branch_library:[{id:'A'}]},workspaces:{branch:{authoring:{branch_instances:[{asset_id:'A',pinned_revision:2}]}}}}},
      {name:'无关树',document:{authoring:{branch_instances:[{asset_id:'B'}]}}},
      {name:'字符串并非引用',document:{note:'A',authoring:{branch_instances:[]}}},
      {name:'新配方',kind:'配方',document:{authoring:{branch_instances:[{asset_id:'A',pinned_revision:3}]}}}];
    const items=docs.map((item,n)=>{const file=path.join(dir,'工程'+n+'.json');fs.writeFileSync(file,JSON.stringify(item.document));return{name:item.name,kind:item.kind,file};});
    items.push({name:'已失效',file:path.join(dir,'missing.json')});
    const manifest=path.join(dir,'manifest.json');fs.writeFileSync(manifest,JSON.stringify({items}));
    const r=spawnSync(process.execPath,['scripts/inspect-asset-references.mjs',manifest,'A'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);
    assert.deepEqual(result.items.map(i=>i.name),['当前树','新配方']);assert.deepEqual(result.items[0].workspaces.map(w=>[w.workspace,w.count,w.revisions]),[['当前工程',1,[1]],['枝条',1,[2]]]);assert.equal(result.items[1].workspaces[0].workspace,'整树配方');assert.equal(result.errors.length,1);assert(result.scope.includes('不扫描'));assert(!result.items[0].file);
  }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('tree-duck-refs-'));fs.rmSync(dir,{recursive:true,force:true});}
});
