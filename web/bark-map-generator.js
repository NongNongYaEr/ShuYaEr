const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const option=(value,low,high,fallback)=>value!==null&&value!==''&&Number.isFinite(Number(value))?clamp(Number(value),low,high):fallback;

// Sliding periodic box blur: work is linear in pixel count, independent of
// radius. Opposite edges use the same repeating neighbourhood as the material.
function blur(source,width,height,radius){
  if(!radius)return source.slice();
  const temporary=new Float32Array(source.length),result=new Float32Array(source.length),span=radius*2+1;
  for(let y=0;y<height;y++){
    const row=y*width;let sum=0;for(let i=-radius;i<=radius;i++)sum+=source[row+(i%width+width)%width];
    for(let x=0;x<width;x++){temporary[row+x]=sum/span;sum+=source[row+(x+radius+1)%width]-source[row+(x-radius+width)%width];}
  }
  for(let x=0;x<width;x++){
    let sum=0;for(let i=-radius;i<=radius;i++)sum+=temporary[((i%height+height)%height)*width+x];
    for(let y=0;y<height;y++){result[y*width+x]=sum/span;sum+=temporary[((y+radius+1)%height)*width+x]-temporary[((y-radius+height)%height)*width+x];}
  }
  return result;
}

// An estimate from colour, not a measured scan. Broad lighting is suppressed
// before derivatives; dark cracks tend to become recessed and rougher.
// Raw row order and OpenGL normal convention match existing bark DataTextures.
export function generateBarkCompanionMaps(image,options={}){
  const {width,height,data}=image||{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1024||height>1024||!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||data.length!==width*height*4)throw Error('颜色贴图像素无效（最大 1024 × 1024）');
  const depth=option(options.depth,0,3,1),smoothing=Math.round(option(options.smoothing,0,6,1)),variation=option(options.variation,0,1,.4),invert=options.invert===true;
  const luminance=new Float32Array(width*height),linear=Float32Array.from({length:256},(_,i)=>{const c=i/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
  for(let i=0;i<luminance.length;i++){const j=i*4,alpha=data[j+3]/255;luminance[i]=(.2126*linear[data[j]]+.7152*linear[data[j+1]]+.0722*linear[data[j+2]])*alpha+.5*(1-alpha);}
  const radius=Math.min(6,smoothing,Math.floor((Math.min(width,height)-1)/2)),smooth=blur(blur(luminance,width,height,radius),width,height,radius),broad=blur(smooth,width,height,Math.min(32,Math.max(1,Math.floor(Math.min(width,height)/16))));
  const heights=new Float32Array(luminance.length);let low=Infinity,high=-Infinity;
  for(let i=0;i<heights.length;i++){heights[i]=smooth[i]-.85*broad[i];const value=luminance[i]-.85*broad[i];low=Math.min(low,value);high=Math.max(high,value);}
  // A contrast floor prevents nearly flat pictures from amplifying noise.
  const histogram=new Uint32Array(512),range=Math.max(1e-8,high-low);
  // Contrast comes from the original detail so smoothing cannot amplify the
  // remaining noise back to the strength it had before filtering.
  for(let i=0;i<heights.length;i++)histogram[Math.min(511,Math.floor((luminance[i]-.85*broad[i]-low)/range*511))]++;
  let sum=0,p05=low,p95=high;for(let i=0;i<512;i++){sum+=histogram[i];if(sum<heights.length*.05)p05=low+range*i/511;if(sum<heights.length*.95)p95=low+range*(i+1)/511;}
  const contrast=Math.max(.08,p95-p05),mid=(p05+p95)/2;
  for(let i=0;i<heights.length;i++)heights[i]=clamp((heights[i]-mid)/contrast,-1,1)*(invert?-1:1);
  const normal=new Uint8Array(width*height*4),roughness=new Uint8Array(normal.length),scaleX=depth*6*width/256,scaleY=depth*6*height/256;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x,j=at*4,dx=(heights[y*width+(x+width-1)%width]-heights[y*width+(x+1)%width])*scaleX,dy=(heights[((y+height-1)%height)*width+x]-heights[((y+1)%height)*width+x])*scaleY,length=Math.hypot(dx,dy,1);
    normal[j]=Math.round((dx/length*.5+.5)*255);normal[j+1]=Math.round((dy/length*.5+.5)*255);normal[j+2]=Math.round((1/length*.5+.5)*255);normal[j+3]=255;
    const grain=Math.abs(luminance[at]-smooth[at])/contrast,value=Math.round(clamp(.88+variation*(-heights[at]*.22+Math.min(.5,grain)*.24),.35,.99)*255);
    roughness[j]=roughness[j+1]=roughness[j+2]=value;roughness[j+3]=255;
  }
  return{normal:{width,height,data:normal},roughness:{width,height,data:roughness}};
}
