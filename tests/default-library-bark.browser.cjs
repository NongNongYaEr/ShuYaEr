// Reuse the real material UI/save/reload checks with additional default-policy
// coverage. The original image library and user project remain read only.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const file=path.join(__dirname,'trunk-surface-bark.browser.cjs');let source=fs.readFileSync(file,'utf8').replaceAll('.runtime/trunk-surface-bark/ui','.runtime/default-library-bark/ui');
source=source.replace("const initial=await state();assert.equal(initial.surface.version,1);",String.raw`const initial=await state();assert.equal(initial.surface.version,1);assert.equal(initial.material.style,'LIBRARY_CELTIS_V1');const defaultMap=await page.evaluate(()=>{let m;window.__branchForge.asset.group.traverse(o=>{if(o.userData.category==='branch'&&o.userData.stable_id==='CAMPHOR_TRUNK')m=o.material;});return {size:m.map.image.width,normal:!!m.normalMap,rough:!!m.roughnessMap,color:m.color.getHexString()};});assert.deepEqual(defaultMap,{size:512,normal:true,rough:true,color:'ffffff'});check('an unassigned old tree receives the actual library bark by default, with all three 512px maps and no extra dark tint');`);
source=source.replace('`+source.slice(end);',String.raw`
  assert.equal(await page.evaluate(()=>window.__branchForge.authoring.workbench.bark_materials.default.style),'LIBRARY_CELTIS_V1');
  const custom=JSON.parse(fs.readFileSync(input,'utf8'));
  custom.authoring.workbench.bark_materials={version:1,default:{version:1,style:'OLD',color:'#998877',roughness:.8,normal_strength:.5,scale_u_m:.8,scale_v_m:.8},branches:{}};
  const customFile=path.join(out,'已有自定义树皮_输入.branch.json');fs.writeFileSync(customFile,JSON.stringify(custom));await openFile(customFile);assert.equal((await state()).material.style,'OLD');assert.equal((await state()).material.color,'#998877');check('loading an existing explicit tree-wide bark choice preserves it instead of replacing it with the library default');
`+'`+source.slice(end);');
const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;mod._compile(source,file);
