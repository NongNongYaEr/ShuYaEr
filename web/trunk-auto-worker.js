import {identifyTrunkSkeleton} from './trunk-auto-skeleton.js';
self.onmessage=event=>{
 try{const result=identifyTrunkSkeleton(event.data.input,event.data.options,progress=>self.postMessage({progress}));self.postMessage({result});}
 catch(error){self.postMessage({error:error.message||'骨架识别失败，请调整设置后重试'});}
};
