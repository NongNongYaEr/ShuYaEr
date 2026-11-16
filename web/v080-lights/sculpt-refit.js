import {lightPoseKey,normalizeTreeLights,packLightTrack} from '../tree-light-data.js';
import {treeLightSurfaceInput} from './surface-input.js';

function wrapTracks(input,record,signal,createWorker){
  return new Promise((resolve,reject)=>{
    signal?.throwIfAborted();
    const worker=createWorker();
    let settled=false;
    function finish(error,tracks){
      if(settled)return;
      settled=true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort',abort);
      worker.terminate();
      if(error)reject(error);
      else resolve(tracks);
    }
    const abort=()=>finish(signal.reason||new DOMException('已取消灯带贴合。','AbortError'));
    const timeout=setTimeout(()=>finish(Error('灯带贴合超时，请重试树干替换。')),60000);
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=({data})=>{
      try{
        if(data.type==='ready')worker.postMessage({type:'generate',epoch:1,id:1,...record.params});
        if(data.type==='result')finish(null,data.tracks);
        if(data.type==='error')finish(Error(data.message));
      }catch(error){finish(error);}
    };
    worker.onerror=event=>finish(Error(event.message||'灯带贴合工作进程失败。'));
    worker.onmessageerror=()=>finish(Error('无法读取灯带贴合结果。'));
    try{
      const transfer=input.mesh.primitives.flatMap(({position,index})=>[position.buffer,index.buffer]);
      worker.postMessage({type:'init',epoch:1,ground:record.ground,...input},transfer);
    }catch(error){finish(error);}
  });
}

export async function refitSculptedTrunkLights(tree,imported,record,{signal,
  createWorker=()=>new Worker(new URL('./controls-worker.js',import.meta.url),{type:'module'})}={}){
  signal?.throwIfAborted();
  const mount=imported.mounts.find(m=>m.id===record.mount&&m.asset_id===record.asset&&m.revision===record.revision);
  const model=mount&&imported.assets.find(asset=>asset.id===mount.asset_id);
  if(!model)throw Error('雕刻后的灯带承重树干已失效。');
  tree.group.updateWorldMatrix(true,true);
  const wood=[],replaced=new Set(record.replaces);
  tree.group.traverseVisible(mesh=>{
    if(mesh.userData.trunk_mount_id===mount.id&&mesh.geometry&&!replaced.has(mesh.userData.trunk_primitive_id))wood.push(mesh);
  });
  const branches=new Map(tree.masterBranches.map(branch=>[branch.stableId,branch]));
  const guides=model.guides.map(({id,parent})=>({id,parent,branch:branches.get(mount.guide_map[id])}));
  if(!wood.length||!guides.length||guides.some(guide=>!guide.branch))throw Error('雕刻后的树干缺少灯带贴合网格或导向。');
  const input=treeLightSurfaceInput({tree,wood,guides,ground:record.ground});
  const tracks=await wrapTracks(input,record,signal,createWorker);
  if(record.tracks.length&&!tracks.length)throw Error('雕刻后的树皮在原有范围内无法贴合灯带。请调整雕刻或灯带范围后重试。');
  return normalizeTreeLights({...record,pose:lightPoseKey(input.guides,record.ground),
    tracks:tracks.map(({guide,turns,points})=>({guide,turns,points:packLightTrack(points)}))},imported);
}
