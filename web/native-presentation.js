// A fresh-frame demand must survive an older packet's acknowledgement. Clearing
// lastSentSignature is insufficient: that acknowledgement can write it back.
export class NativePresentationFence{
 constructor(){this.requiredRevision=0;}
 request(submittedRevision){this.requiredRevision=Math.max(this.requiredRevision,submittedRevision+1);return this.requiredRevision;}
 needsSubmission(acceptedRevision){return acceptedRevision<this.requiredRevision;}
 reset(){this.requiredRevision=0;}
}
export async function waitForNativePresentation({read,current,asset,session,revision=1,timeout=60000,onProgress=()=>{},now=()=>performance.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const started=now();
 while(current()){
  const state=read(),native=state.native||{};
  if(state.wanted===false||state.presentationAllowed===false||state.lastError||state.compatibilityReason)return{...state,presentationReady:false,presentationReason:'blocked'};
  if(state.active&&native.frames>0&&native.asset_identity===asset&&native.scene_session===session&&native.revision>=revision)return{...state,presentationReady:true,presentationTargetRevision:revision};
  // A caller's deadline is not a device failure. Do not poison the renderer or
  // stop its queue: a late frame and a retry can still complete normally.
  if(now()-started>=timeout)return{...state,presentationReady:false,presentationTimedOut:true,presentationTargetRevision:revision};
  await onProgress(state);await sleep(100);
 }
 return{...read(),presentationReady:false,presentationSuperseded:true};
}
