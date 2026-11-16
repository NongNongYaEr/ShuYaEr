const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const openOwnedNative=require('./owned-native-browser.cjs');
const readPng=require('./png-pixels.cjs');

async function verify(){
  const appRoot=path.resolve(process.argv[2]);
  const out=path.join(appRoot,'.runtime',process.argv[3]||'native-resource-chunks');
  fs.mkdirSync(out,{recursive:true});
  const host=await openOwnedNative({appRoot,out,executable:path.join(appRoot,JSON.parse(fs.readFileSync(path.join(appRoot,'release-config.json'),'utf8').replace(/^\uFEFF/, '')).entry)});
  try{
    const {page}=host;
    const original=await page.evaluate(()=>JSON.stringify(window.__branchForge.authoring));
    await page.evaluate(async()=>{
      const THREE=await import('/vendor/three.module.min.js');
      const f=window.__branchForge,host=window.chrome.webview,canvas=document.getElementById('viewport');
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,canvas.clientWidth/canvas.clientHeight,.1,100);
      camera.position.z=4;
      const size=8192,pixels=new Uint8Array(size*size*4),words=new Uint32Array(pixels.buffer);
      for(let y=0;y<size;y++){
        const left=y<size/2?0xff0000ff:0xffff0000,right=y<size/2?0xff00ff00:0xff00ffff;
        words.fill(left,y*size,y*size+size/2);
        words.fill(right,y*size+size/2,(y+1)*size);
      }
      const texture=new THREE.DataTexture(pixels,size,size);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.needsUpdate=true;
      const count=1900000,geometry=new THREE.BufferGeometry(),positions=new Float32Array(count*3),uvs=new Float32Array(count*2);
      positions.set([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0],(count-4)*3);
      uvs.set([0,0, 1,0, 1,1, 0,1],(count-4)*2);
      geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
      geometry.setIndex(new THREE.BufferAttribute(Uint32Array.of(count-4,count-3,count-2,count-4,count-2,count-1),1));
      scene.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide})));

      let shared,rejected=false;
      window.__chunkPackets=[];
      host.addEventListener('sharedbufferreceived',event=>shared=event.getBuffer());
      const post=host.postMessage.bind(host);
      host.postMessage=value=>{
        if(typeof value!=='string'||!value.startsWith('{'))return post(value);
        const envelope=JSON.parse(value);
        if(envelope.action==='packet'&&shared){
          const length=new DataView(shared).getUint32(0,true);
          const chunk=JSON.parse(new TextDecoder().decode(new Uint8Array(shared,4,length))).resourceChunk;
          if(chunk){
            window.__chunkPackets.push({id:chunk.id,offset:chunk.offset,bytes:envelope.bytes,total:chunk.total});
            if(!rejected&&chunk.offset>0){
              rejected=true;
              window.__rejectedChunk={id:chunk.id,offset:chunk.offset};
              post(JSON.stringify({...envelope,action:'reject-test-packets',count:1}));
            }
          }
        }
        return post(value);
      };
      window.__leaveChunkTest=f.nativeViewport.enterPreview({scene,camera,renderer:f.renderer,canvas,assetIdentity:()=> 'large-resource-proof'});
    });
    await page.waitForFunction(()=>{
      const stats=window.__branchForge.nativeViewport.stats;
      return stats.lastError||stats.active&&stats.native.asset_identity==='large-resource-proof'&&stats.native.chunked_resources===2;
    },null,{timeout:120000,polling:75});
    const report=await page.evaluate(()=>({stats:window.__branchForge.nativeViewport.stats,packets:window.__chunkPackets,rejected:window.__rejectedChunk,authoring:JSON.stringify(window.__branchForge.authoring)}));
    assert.equal(report.stats.lastError,'');
    assert.equal(report.stats.presentation,'dx12');
    assert.equal(report.stats.native.asset_identity,'large-resource-proof');
    assert.equal(report.stats.native.draws,1);
    assert.equal(report.stats.native.chunked_resources,2);
    assert.deepEqual(report.packets.filter(packet=>packet.total).map(packet=>packet.total).sort((a,b)=>a-b),[1900000*72+24,8192*8192*4]);
    assert(report.packets.every(packet=>packet.bytes<=128*1024*1024));
    assert(report.packets.filter(packet=>packet.id===report.rejected.id&&packet.offset===report.rejected.offset).length>=2,'the rejected chunk must be retried at the same offset');
    assert.equal(new Set(report.packets.map(packet=>packet.id+':'+packet.offset)).size,report.stats.native.resource_chunks);
    assert.equal(report.authoring,original);
    await page.evaluate(()=>window.chrome.webview.postMessage(JSON.stringify({topic:'branchforge-native',action:'capture',transportSession:window.__branchForge.nativeViewport.stats.transportSession})));
    await page.waitForFunction(()=>window.__branchForge.nativeViewport.stats.native.capture_complete===true,null,{timeout:30000,polling:75});
    const image=readPng(path.join(out,'native-capture.png')),colors={red:0,green:0,blue:0,yellow:0};
    for(let i=0;i<image.data.length;i+=image.channels){
      const r=image.data[i],g=image.data[i+1],b=image.data[i+2];
      if(r>170&&g<60&&b<60)colors.red++;
      if(g>170&&r<60&&b<60)colors.green++;
      if(b>170&&r<60&&g<60)colors.blue++;
      if(r>170&&g>170&&b<60)colors.yellow++;
    }
    assert(Object.values(colors).every(count=>count>100),JSON.stringify(colors));
    fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({passed:true,stats:report.stats,packets:report.packets,colors},null,2));
    console.log(JSON.stringify({passed:true,presentation:report.stats.presentation,chunks:report.stats.native.resource_chunks,colors,out}));
  }finally{await host.close();}
}
verify().catch(error=>{console.error(error);process.exitCode=1;});
