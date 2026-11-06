import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function saveIntegrationCheckpoint({root,store,document,model}){
 if(typeof model!=='string'||!model.startsWith('/exports/')||/[?#]/.test(model))throw Error('材质结果路径无效');
 const directory=path.resolve(root,'exports')+path.sep,file=path.resolve(root,decodeURIComponent(model.slice(1)));
 if(!file.startsWith(directory)||path.extname(file)!=='.glb'||!fs.existsSync(file)||fs.statSync(file).size>150000000)throw Error('最终GLB未就绪或超出150MB');
 const modelBytes=fs.readFileSync(file);if(modelBytes.length<20||modelBytes.readUInt32LE(0)!==0x46546c67||modelBytes.readUInt32LE(4)!==2||modelBytes.readUInt32LE(8)!==modelBytes.length)throw Error('最终GLB未完整保存');
 const finalSHA256=sha(modelBytes),key=sha(Buffer.from(JSON.stringify({document,finalSHA256}))),folder=path.join(root,'.runtime','integration-checkpoints');fs.mkdirSync(folder,{recursive:true});
 const bundlePath=path.join(folder,key+'.treeproj');
 if(!fs.existsSync(bundlePath)){const saved=store.save(document),bytes=store.bundle(document.id,saved.revision),temporary=bundlePath+'.part';try{fs.writeFileSync(temporary,bytes,{flag:'wx'});fs.renameSync(temporary,bundlePath);}finally{fs.rmSync(temporary,{force:true});}}
 const bundle=fs.readFileSync(bundlePath);return {key,projectId:document.id,bundleSHA256:sha(bundle),bundleBytes:bundle.length,finalSHA256,model};
}
