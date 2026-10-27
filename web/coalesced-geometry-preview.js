import {unpackComputedGeometry} from './geometry-transfer.js';

// One active computation and one replaceable latest request. Results advance
// monotonically within a gesture; cancellation invalidates the whole gesture.
export function createCoalescedGeometryPreview(client,{install,valid=()=>true,fallback,onError=()=>{}}){
  let epoch=0,revision=0,active=false,queued=null,disabled=false;
  const stats={requested:0,merged:0,completed:0,discarded:0,fallbacks:0};
  async function pump(){if(active||!queued)return;const request=queued;queued=null;active=true;const token=epoch;
    try{let data;if(disabled){stats.fallbacks++;data=await fallback(request.job);}else try{data=(await client.run(request.job)).geometry;}catch(error){if(error.name==='AbortError')throw error;if(!fallback)throw error;disabled=true;stats.fallbacks++;onError(error);data=await fallback(request.job);}
      if(token!==epoch||!valid(request.context)){stats.discarded++;return;}
      const geometry=unpackComputedGeometry(data);try{install(geometry,request.context,request.revision);stats.completed++;}catch(error){geometry.dispose();throw error;}
    }catch(error){if(error.name!=='AbortError')onError(error);}finally{if(token===epoch){active=false;pump();}}
  }
  return {request(job,context){stats.requested++;if(queued)stats.merged++;queued={job,context,revision:++revision};pump();return revision;},
    cancel(){epoch++;queued=null;active=false;client.cancel();},dispose(){epoch++;queued=null;active=false;client.dispose();},
    get stats(){return {...stats,active,queued:Boolean(queued),revision,worker:client.stats};},
  };
}
