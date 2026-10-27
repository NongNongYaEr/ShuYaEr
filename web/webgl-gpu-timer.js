// Asynchronous GPU execution timestamps, enabled only during an explicit profile.
// Never waits for a query, calls finish(), or treats a missing result as zero.
export function createWebGLGpuTimer(gl,{record=()=>{},status=()=>{},limit=4}={}){
  let extension=null,running=false,active=null,pending=[],samples=0,discarded=0,skipped=0,state='not_measured';
  const publish=reason=>status({status:state,scope:'main_viewport',unit:'ms',samples,discarded,skipped,pending:pending.length+Number(!!active),...(reason?{reason}:{})});
  const remove=q=>{try{gl.deleteQuery(q);}catch{}};
  function clear(){if(active){try{gl.endQuery(extension.TIME_ELAPSED_EXT);}catch{}remove(active);active=null;discarded++;}for(const q of pending){remove(q);discarded++;}pending=[];}
  function fail(reason){clear();state='unavailable';running=false;publish(reason);}
  const api={
    start(){api.stop();samples=discarded=skipped=0;state='pending';running=true;
      try{extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(!extension){state='unsupported';running=false;publish('GPU timestamp extension is unavailable.');return;}publish();}catch(error){fail(error.message);}
    },
    poll(){if(!running||!extension)return;try{
      if(gl.isContextLost?.()){clear();state='context_lost';running=false;publish();return;}
      if(gl.getParameter(extension.GPU_DISJOINT_EXT)){clear();state='disjoint';publish('Disjoint results were discarded.');return;}
      if(state==='disjoint')state=samples?'measured':'pending';
      while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){
        const q=pending.shift(),nanoseconds=gl.getQueryParameter(q,gl.QUERY_RESULT);remove(q);
        if(Number.isFinite(nanoseconds)&&nanoseconds>=0){record('render.main_gpu_execute',nanoseconds/1e6);samples++;state='measured';}else discarded++;
      }publish();
    }catch(error){fail(error.message);}},
    begin(){if(!running)return;api.poll();if(!running||state==='disjoint'||active)return;
      try{if(pending.length>=Math.max(1,limit)||gl.getQuery(extension.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){skipped++;publish();return;}
        active=gl.createQuery();if(!active){fail('GPU query allocation failed.');return;}gl.beginQuery(extension.TIME_ELAPSED_EXT,active);
      }catch(error){fail(error.message);}
    },
    end(){if(!active)return;try{gl.endQuery(extension.TIME_ELAPSED_EXT);pending.push(active);active=null;publish();}catch(error){fail(error.message);}},
    stop(){if(!running&&!active&&!pending.length)return;api.end();api.poll();clear();running=false;publish();},
    dispose(){api.stop();},
  };return api;
}
