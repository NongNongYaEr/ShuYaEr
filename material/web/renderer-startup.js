import {createNativeRenderDevice} from './native-render-device.js';
import {Renderer} from './renderer.js';
import {CompatibilityRenderer} from './renderer-compatibility.js';
import {notifyStartupProgress} from './service-adapter.js';

const DX12='v040-dx12';
const WEBGL2='webgl2';
const startupAbort=()=>Object.assign(Error('材质视口启动已取消。'),{name:'AbortError'});
const messageOf=error=>String(error?.message||error).slice(0,1200);

async function verifyStartupTarget(renderer){
 const gl=renderer.gl,size=16;
 let pixels;
 // Verify a real offscreen render target and readback without loading a project.
 if(gl.nativeBackend){
  gl.beginFrame(size,size);
  gl.clearColor(1,1,1,1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  pixels=await gl.readback();
 }else{
  const {tex,fb}=renderer.target(size);
  try{
   gl.clearColor(1,1,1,1);
   gl.clear(gl.COLOR_BUFFER_BIT);
   pixels=new Uint8Array(size*size*4);
   gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL2 视口试绘回读失败。');
  }finally{
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   gl.deleteFramebuffer(fb);
   gl.deleteTexture(tex);
  }
 }
 gl.clearColor(0,0,0,0);
 if(pixels?.length!==size*size*4||pixels.some(value=>value!==255))throw Error('材质试绘未返回有效像素。');
}

async function waitForStartup(work,signal,timeoutMs){
 let timer,onAbort;
 const stop=new Promise((_,reject)=>{
  onAbort=()=>reject(startupAbort());
  if(signal?.aborted)onAbort();
  else signal?.addEventListener('abort',onAbort,{once:true});
  timer=setTimeout(()=>reject(Error('材质视口试绘超时。')),timeoutMs);
 });
 try{return await Promise.race([work(),stop]);}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
}

export async function createWorkbenchRenderer(canvas,{signal}={}){
 const host=globalThis.__treeMaterialHostConfig;
 const mode=globalThis.__shuyaerGraphicsMode;
 const preferred=mode==='compatibility'?WEBGL2:host?.renderer===DX12?DX12:WEBGL2;
 async function open(backend){
  if(signal?.aborted)throw startupAbort();
  let renderer,device;
  try{
   const Implementation=backend===WEBGL2&&host?.desktop&&mode?CompatibilityRenderer:Renderer;
   if(mode)notifyStartupProgress(backend===DX12?'正在启动材质 DX12 视口…':'正在启动 WebGL2 基础材质视口…');
   renderer=new Implementation(canvas,undefined,{createDevice:target=>{
    device=backend===DX12?createNativeRenderDevice(target):
     target.getContext(WEBGL2,{alpha:true,antialias:true,preserveDrawingBuffer:true});
    return device;
   }});
   await waitForStartup(async()=>{
    await renderer.ready;
    if(signal?.aborted)throw startupAbort();
    if(host?.desktop&&mode){
     notifyStartupProgress('正在检测材质渲染与回读…');
     await verifyStartupTarget(renderer);
    }
   },signal,mode?20000:45000);
   if(signal?.aborted)throw startupAbort();
   renderer.graphicsBackend=backend;
   renderer.graphicsFallbackReason=null;
   return renderer;
  }catch(error){
   // A failed constructor can still have started the native bridge.
   try{
    if(renderer)renderer.dispose();
    else{device?.ready?.catch(()=>{});device?.dispose?.();}
   }finally{if(backend===DX12)delete document.documentElement.dataset.nativeViewport;}
   throw error;
  }
 }
 try{return await open(preferred);}
 catch(error){
  if(preferred!==DX12||mode!=='auto'||signal?.aborted||error?.name==='AbortError')throw error;
  const reason=messageOf(error);
  try{
   const renderer=await open(WEBGL2);
   renderer.graphicsFallbackReason=reason;
   return renderer;
  }catch(fallbackError){
   if(fallbackError?.name==='AbortError')throw fallbackError;
   throw Error('DX12：'+reason+'。WebGL2：'+messageOf(fallbackError));
  }
 }
}
