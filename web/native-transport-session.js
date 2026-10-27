// Correlate WebView messages and shared mappings across renderer restarts.
// This envelope is separate from the native packet ABI and saved documents.
export function createNativeTransportSession(base){
  let epoch=0,waiting=true,correlated=false;
  const id=()=>base+':'+epoch;
  return {
    get id(){return id();},get waiting(){return waiting;},
    restart(){epoch++;waiting=true;return id();},
    shared(details){
      if(typeof details==='string'){try{details=JSON.parse(details);}catch{return false;}}
      const token=details?.transportSession;
      if(token!==undefined&&token!==id()||correlated&&token===undefined)return false;
      if(token!==undefined)correlated=true;
      waiting=false;return true;
    },
    message(value){
      const token=value?.transportSession;
      if(token!==undefined&&token!==id()||correlated&&token===undefined)return false;
      return !waiting||value.action==='error';
    },
  };
}
