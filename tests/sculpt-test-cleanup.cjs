// Delete only the private profile/export data of a stopped, owned test host.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
module.exports=async function cleanSculptTest(out){
 if(process.env.BRANCHFORGE_KEEP_TEST_DATA==='1')return;
 const root=path.resolve(__dirname,'..'),folder=path.resolve(out),runtime=path.join(root,'.runtime')+path.sep;
 assert(folder.startsWith(runtime)&&path.basename(path.dirname(folder)).startsWith('model-sculpt-'));
 if(!fs.existsSync(path.join(folder,'host-exit.json')))return;
 const removed=[],deferred=[];
 for(const name of fs.readdirSync(folder)){
  const target=path.resolve(folder,name);assert(target.startsWith(folder+path.sep));
  if(!fs.statSync(target).isDirectory()&&!name.endsWith('.branch.json')&&!name.endsWith('.glb'))continue;
  try{await fs.promises.rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:200});removed.push(name);}
  catch(error){deferred.push({name,reason:error.code});}
 }
 fs.writeFileSync(path.join(folder,'cleanup.json'),JSON.stringify({removed,deferred},null,2));
 if(deferred.length)console.warn('Test host exited; some private cache files remain locked: '+deferred.map(i=>i.name).join(', '));
};
