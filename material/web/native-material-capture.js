// Capture actual native pixels. A WebView screenshot cannot include the DX12
// child surface. The existing renderer/device owns the scene and GPU resources.
export async function captureNativeMaterial(renderer,{identity=()=>null}={}){
 const r=renderer,g=r?.gl;if(!g?.nativeBackend||!r.model||r.disposed)throw Error('需要已就绪的原生材质视图。');if(r.captureInProgress)throw Error('正在生成材质预览图。');
 const token=identity();r.captureInProgress=true;const present=g.present;let pending;
 try{
  await g.whenIdle();if(r.disposed||identity()!==token)throw Object.assign(Error('预览图的模型已变化。'),{name:'AbortError'});
  g.present=()=>{pending=g.readback();};r.dirty=false;r.draw();if(!pending)throw Error('原生预览没有提交可回读帧。');
  const width=r.canvas.width,height=r.canvas.height,pixels=await pending;if(r.disposed||identity()!==token)throw Object.assign(Error('预览图的模型已变化。'),{name:'AbortError'});if(pixels?.length!==width*height*4)throw Error('原生预览回读尺寸不一致。');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height),stride=width*4;let covered=0;
  for(let y=0;y<height;y++)image.data.set(pixels.subarray(y*stride,(y+1)*stride),(height-y-1)*stride);for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)covered++;if(covered<16)throw Error('原生预览没有可见模型像素。');ctx.putImageData(image,0,0);return{url:canvas.toDataURL('image/png'),width,height,coveredPixels:covered,backend:g.nativeBackend};
 }finally{g.present=present;r.captureInProgress=false;if(!r.disposed)r.dirty=true;}
}
