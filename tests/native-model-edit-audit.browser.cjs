// Existing native editing workflow, plus independent full-scan model audits.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const base=path.join(__dirname,'native-viewport.browser.cjs');let source=fs.readFileSync(base,'utf8');if(!source.includes('   const settled=async()=>{')||!source.includes('   const open=async file=>'))throw Error('Native editing harness changed');
source=source.replace('   const settled=async()=>{','   const auditedModels=[];const settleScene=async()=>{');
source=source.replace('   const open=async file=>',"   const settled=async()=>{await settleScene();const audit=await page.evaluate(()=>window.__branchForge.nativeViewport.auditModel());assert.equal(audit.mismatch,false,'retained model differs from a complete scan after editing');auditedModels.push(audit);};\n   const open=async file=>");
source=source.replace("fs.writeFileSync(path.join(out,'editing-acceptance.json')","fs.writeFileSync(path.join(out,'model-audits.json'),JSON.stringify(auditedModels,null,2));fs.writeFileSync(path.join(out,'editing-acceptance.json')");
const mod=new Module(base,module);mod.filename=base;mod.paths=module.paths;mod._compile(source,base);
