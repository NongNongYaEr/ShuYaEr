import {validateMicrodetail,microdetailGenerationKey,microdetailSampling,mergeRecipeMicrodetail} from './microdetail-rules.js';
import {runMicrodetailWorker} from './microdetail-session.js';

export async function prepareMicrodetailStage(renderer,raw,{task,accepts=()=>true,onProgress=()=>{},runWorker=runMicrodetailWorker}={}){
 const options=validateMicrodetail(raw),key=microdetailGenerationKey(options);let tile=renderer.microdetailSet?.tile;
 if(options.enabled&&tile?.key!==key)tile=await runWorker(options,{setCancel:cancel=>{if(task)task.cancel=cancel;if(!accepts())cancel();},onProgress});
 if(!accepts())throw Object.assign(Error('近景细节更新已取消。'),{name:'AbortError'});
 return renderer.stageMicrodetail(tile,options);
}
const fields={enabled:['microEnabled',1],locked:['microLocked',1],size:['microSize',1],seed:['microSeed',1],tileWidthMeters:['microWidth',.01],grainMeters:['microGrain',.001],heightMm:['microHeight',1],strength:['microStrength',1],roughnessAmount:['microRoughness',1]};
export function createMicrodetailPanel({document,renderer,read,edit,isBusy,accepts,status}){
 const $=id=>document.getElementById(id);let thumbnailKey=null;
 function sync(){const options=validateMicrodetail(read());for(const [key,[id,factor]]of Object.entries(fields)){const input=$(id);if(input.type==='checkbox')input.checked=options[key];else input.value=Number((options[key]/factor).toPrecision(10));input.disabled=isBusy();}const sampling=microdetailSampling(options),tile=renderer.microdetailSet?.tile;
  $('microSummary').textContent=(options.enabled?'已启用':'已停用')+' · 实际颗粒 '+(sampling.effectiveGrainMeters*1000).toFixed(2)+' mm · 单次 '+(options.tileWidthMeters*100).toFixed(1)+' cm'+(options.locked?' · 配方保护':'');
  const key=tile?.key+':'+options.heightMm+':'+options.strength+':'+options.tileWidthMeters+':'+options.roughnessAmount;if(thumbnailKey===key)return;thumbnailKey=key;const size=128,normal=$('microNormal').getContext('2d'),rough=$('microRough').getContext('2d'),n=normal.createImageData(size,size),r=rough.createImageData(size,size),level=tile?.levels[0],factor=options.heightMm*options.strength*.001/options.tileWidthMeters;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const p=(y*size+x)*4,i=level?(Math.floor(y*level.height/size)*level.width+Math.floor(x*level.width/size))*4:0,du=level?.data[i]||0,dv=level?.data[i+1]||0,signal=level?.data[i+2]||0,length=Math.hypot(du*factor,dv*factor,1);n.data.set([(-du*factor/length*.5+.5)*255,(-dv*factor/length*.5+.5)*255,(1/length*.5+.5)*255,255],p);const value=Math.max(0,Math.min(255,(.5+signal*options.roughnessAmount)*255));r.data.set([value,value,value,255],p);}normal.putImageData(n,0,0);rough.putImageData(r,0,0);
 }
 for(const [key,[id,factor]]of Object.entries(fields))$(id).onchange=()=>{const input=$(id),next=validateMicrodetail(read());next[key]=input.type==='checkbox'?input.checked:input.value.trim()===''?NaN:Number(input.value)*factor;return edit(next);};
 return{sync,recipe:raw=>mergeRecipeMicrodetail(read(),raw),stage:(raw,task)=>prepareMicrodetailStage(renderer,raw,{task,accepts:()=>accepts(task),onProgress:p=>status('生成共享近景细节…',p)})};
}
