// Reserve distinct debug ports across isolated native acceptance processes.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
module.exports=async function reserve(testDirectory){
 const leases=path.resolve(__dirname,'../.runtime/native-test-port-leases');fs.mkdirSync(leases,{recursive:true});
 for(let attempt=0;attempt<100;attempt++){
  const port=crypto.randomInt(24000,54000),file=path.join(leases,port+'.json');let lease;try{lease=fs.openSync(file,'wx');}catch(error){if(error.code==='EEXIST')continue;throw error;}
  fs.writeFileSync(lease,JSON.stringify({pid:process.pid,testDirectory,created:new Date().toISOString()}));fs.closeSync(lease);
  const available=await new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});if(available)return port;
 }
 throw Error('No isolated native test port available');
};
module.exports.assertOwnership=async(page,out)=>{
 const expected=await page.evaluate(()=>window.__branchForge.nativeViewport.stats.sceneSession),file=path.join(out,'native-status.json');
 for(let i=0;i<100;i++){try{if(JSON.parse(fs.readFileSync(file,'utf8')).scene_session===expected)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 throw Error('Debug page does not match the independently spawned native host session');
};
