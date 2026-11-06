import {autoRepairTrunkWeights,scanTrunkWeights} from './trunk-weight-repair.js';

self.onmessage=event=>{
 const {model,automatic,previous}=event.data;
 try{
  const before=previous||scanTrunkWeights(model);
  if(!automatic){self.postMessage({scan:before,changed:0});return;}
  const {scan,changed,model:next}=autoRepairTrunkWeights(model,before);
  self.postMessage({scan,changed,binding:next.binding,beforeCount:before.count,applied:changed?before.edits:null});
 }catch(error){self.postMessage({error:error.message});}
};
