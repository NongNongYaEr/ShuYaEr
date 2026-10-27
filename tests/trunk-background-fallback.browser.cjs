// Block the actual module-worker request; the live editor must finish via its
// reference builder, including undo, source reuse and an actual cold reload.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'.runtime/trunk-background-fallback');fs.mkdirSync(folder,{recursive:true});const input=path.join(folder,'用户当前工程_只读副本.branch.json');if(!fs.existsSync(input))fs.copyFileSync(path.join(root,'.runtime/bark-material-workspace/用户当前工程_只读副本.branch.json'),input);
const file=path.join(__dirname,'trunk-preset-expansion.browser.cjs');let source=fs.readFileSync(file,'utf8').replaceAll('.runtime/trunk-preset-expansion/','.runtime/trunk-background-fallback/');
source=source.replace("await page.goto('http://127.0.0.1:'", "await page.route('**/trunk-geometry.worker.js',route=>route.abort('failed'));await page.goto('http://127.0.0.1:'");
source=source.replace('const shaped=await snap();',String.raw`const shaped=await snap();const job=await page.evaluate(()=>window.__branchForge.geometryJobs.stats);assert.ok(job.submitted>0);assert.equal(job.completed,0);assert.ok(job.lastError);check('blocked real worker loading falls back to the reference builder and leaves the editor usable');`);
// The expansion harness embeds the shared page setup at runtime; route injection
// belongs in that embedded source rather than only in this wrapper's source.
source=source.replace("const a=source.indexOf(",`source=source.replace("await page.goto('http://127.0.0.1:'", "await page.route('**/trunk-geometry.worker.js',route=>route.abort('failed'));await page.goto('http://127.0.0.1:'");const a=source.indexOf(`);
const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;mod._compile(source,file);
