import {srgbToLinear,linearToSrgb} from './material-blend.js';
import {verifySurfacePreserved} from './mesh-codec.js';
import {decodeDataPNG} from './png-data.js';

const NO_SLOT=-2;
const linearBytes=Float32Array.from({length:256},(_,value)=>srgbToLinear(value/255));
const toByte=value=>Math.round(Math.min(1,Math.max(0,value))*255);
const topLeft=(dx,dy)=>dy<0||dy===0&&dx>0;
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
function check(signal){if(signal?.aborted)throw Object.assign(Error('已取消转移原材质。'),{name:'AbortError'});}

export function orthogonalTangent(nx,ny,nz,tx,ty,tz,out=[0,0,0]){
  const dot=nx*tx+ny*ty+nz*tz;
  tx-=nx*dot;
  ty-=ny*dot;
  tz-=nz*dot;
  let length=Math.hypot(tx,ty,tz);
  if(length<1e-12){
    [tx,ty,tz]=Math.abs(ny)<.9?[nz,0,-nx]:[0,nz,-ny];
    length=Math.hypot(tx,ty,tz)||1;
  }
  out[0]=tx/length;
  out[1]=ty/length;
  out[2]=tz/length;
  return out;
}

// Generated tangents are smoothed by corner angle and separately across mirrored UVs.
export function uvTangents(pos,normal,uv,indices,{split=false}={}){
  const length=pos.length/3;
  const positive=new Float32Array(length*4),negative=new Float32Array(length*4);
  const faceSigns=split?new Int8Array(indices.length/3):null,projected=[0,0,0];
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i],b=indices[i+1],c=indices[i+2];
    const du=uv[b*2]-uv[a*2],dv=uv[b*2+1]-uv[a*2+1],su=uv[c*2]-uv[a*2],sv=uv[c*2+1]-uv[a*2+1];
    const det=du*sv-su*dv;
    if(Math.abs(det)<1e-14)continue;
    const x=pos[b*3]-pos[a*3],y=pos[b*3+1]-pos[a*3+1],z=pos[b*3+2]-pos[a*3+2];
    const u=pos[c*3]-pos[a*3],v=pos[c*3+1]-pos[a*3+1],w=pos[c*3+2]-pos[a*3+2];
    const tx=(x*sv-u*dv)/det,ty=(y*sv-v*dv)/det,tz=(z*sv-w*dv)/det;
    const bx=(u*du-x*su)/det,by=(v*du-y*su)/det,bz=(w*du-z*su)/det;
    const nx=normal[a*3]+normal[b*3]+normal[c*3];
    const ny=normal[a*3+1]+normal[b*3+1]+normal[c*3+1];
    const nz=normal[a*3+2]+normal[b*3+2]+normal[c*3+2];
    const sign=(ny*tz-nz*ty)*bx+(nz*tx-nx*tz)*by+(nx*ty-ny*tx)*bz<0?-1:1;
    const accum=sign===1?positive:negative;
    if(split)faceSigns[i/3]=sign;
    for(let corner=0;corner<3;corner++){
      const q=indices[i+corner],r=indices[i+(corner+1)%3],s=indices[i+(corner+2)%3];
      const j=q*3,dx=pos[r*3]-pos[j],dy=pos[r*3+1]-pos[j+1],dz=pos[r*3+2]-pos[j+2];
      const ex=pos[s*3]-pos[j],ey=pos[s*3+1]-pos[j+1],ez=pos[s*3+2]-pos[j+2];
      const angle=Math.atan2(Math.hypot(dy*ez-dz*ey,dz*ex-dx*ez,dx*ey-dy*ex),dx*ex+dy*ey+dz*ez);
      orthogonalTangent(normal[j],normal[j+1],normal[j+2],tx,ty,tz,projected);
      const at=q*4;
      for(let k=0;k<3;k++)accum[at+k]+=projected[k]*angle;
      accum[at+3]+=angle;
    }
  }
  const vertex=split?null:new Float32Array(length*4);
  for(let q=0;q<length;q++){
    const i=q*3,j=q*4;
    const preferred=positive[j+3]>=negative[j+3]?positive:negative;
    for(const tangents of split?[positive,negative]:[preferred]){
      orthogonalTangent(normal[i],normal[i+1],normal[i+2],tangents[j],tangents[j+1],tangents[j+2],projected);
      const target=split?tangents:vertex;
      target.set(projected,j);
      target[j+3]=tangents===positive?1:-1;
    }
  }
  return {vertex,positive,negative,faceSigns};
}

async function browserDecode(blob,{signal}){
  if(blob.type==='image/png'){
    const bytes=new Uint8Array(await blob.arrayBuffer());
    if(bytes[24]===8||bytes[24]===16){
      const {width,height,data}=await decodeDataPNG(bytes,'color',{signal});
      return {width,height,data};
    }
  }
  const bitmap=await createImageBitmap(blob,{colorSpaceConversion:'none',premultiplyAlpha:'none'});
  try{
    const {width,height}=bitmap;
    if(width>8192||height>8192)throw Error('原材质贴图长边需在 8192 以内。');
    const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('无法读取原材质贴图。');
    ctx.drawImage(bitmap,0,0);
    const rgba=ctx.getImageData(0,0,width,height).data,data=new Uint8Array(width*height*3);
    for(let i=0,j=0;i<rgba.length;i+=4,j+=3){
      data[j]=rgba[i];
      data[j+1]=rgba[i+1];
      data[j+2]=rgba[i+2];
    }
    return {width,height,data};
  }finally{bitmap.close();}
}

async function mipLevels(image,color,signal){
  const levels=[image];
  let {width,height,data}=image;
  while(width>1||height>1){
    const w=Math.max(1,width>>1),h=Math.max(1,height>>1),mip=new Uint8Array(w*h*3);
    for(let y=0;y<h;y++){
      if((y&63)===0){await pause();check(signal);}
      for(let x=0;x<w;x++){
        const x0=Math.floor(x*width/w),x1=Math.floor((x+1)*width/w);
        const y0=Math.floor(y*height/h),y1=Math.floor((y+1)*height/h);
        const count=(x1-x0)*(y1-y0),at=(y*w+x)*3;
        for(let c=0;c<3;c++){
          let sum=0;
          for(let j=y0;j<y1;j++)for(let i=x0;i<x1;i++){
            const value=data[(j*width+i)*3+c];
            sum+=color?linearBytes[value]:value;
          }
          mip[at+c]=color?toByte(linearToSrgb(sum/count)):Math.round(sum/count);
        }
      }
    }
    levels.push({width:w,height:h,data:mip});
    [width,height,data]=[w,h,mip];
  }
  return levels;
}

function address(texel,size,wrap){
  if(wrap===33071)return Math.max(0,Math.min(size-1,texel));
  const period=wrap===33648?2*size:size,mod=((texel%period)+period)%period;
  return mod<size?mod:period-1-mod;
}

function readSample(level,u,v,wrapS,wrapT,linear,color,out){
  const {width,height,data}=level;
  // Bound normalized repeat/mirrored repeat coordinates before converting to pixel indices.
  if(wrapS===33071)u=Math.max(0,Math.min(1,u));else u%=wrapS===33648?2:1;
  if(wrapT===33071)v=Math.max(0,Math.min(1,v));else v%=wrapT===33648?2:1;
  const px=u*width-(linear?0.5:0),py=v*height-(linear?0.5:0);
  const x=Math.floor(px),y=Math.floor(py);
  const x0=address(x,width,wrapS),y0=address(y,height,wrapT),a=(y0*width+x0)*3;
  if(!linear){
    for(let c=0;c<3;c++)out[c]=color?linearBytes[data[a+c]]:data[a+c]/255;
    return;
  }
  const x1=address(x+1,width,wrapS),y1=address(y+1,height,wrapT);
  const b=(y0*width+x1)*3,d=(y1*width+x0)*3,e=(y1*width+x1)*3;
  const fx=px-x,fy=py-y,k0=(1-fx)*(1-fy),k1=fx*(1-fy),k2=(1-fx)*fy,k3=fx*fy;
  for(let c=0;c<3;c++)out[c]=color?
    linearBytes[data[a+c]]*k0+linearBytes[data[b+c]]*k1+linearBytes[data[d+c]]*k2+linearBytes[data[e+c]]*k3:
    (data[a+c]*k0+data[b+c]*k1+data[d+c]*k2+data[e+c]*k3)/255;
}

function textureCoordinates(binding,source,primitive){
  const uv=binding.texCoord===1?source.extraAttributes.TEXCOORD_1.data:source.uv;
  const offset=primitive.firstVertex*2,coords=new Float32Array(primitive.vertexCount*2);
  const [sx,sy]=binding.scale,[ox,oy]=binding.offset,cos=Math.cos(binding.rotation),sin=Math.sin(binding.rotation);
  for(let i=0;i<coords.length;i+=2){
    const u=uv[offset+i]*sx,v=uv[offset+i+1]*sy;
    coords[i]=ox+cos*u-sin*v;
    coords[i+1]=oy+sin*u+cos*v;
  }
  if(coords.some(v=>!Number.isFinite(v)))throw Error('原材质贴图变换后的 UV 无效。');
  return coords;
}

function samplePlan(texture,a,b,c,dbdx,dcdx,dbdy,dcdy){
  if(!texture)return null;
  const {coords,levels,wrapS,wrapT,magFilter,minFilter,color}=texture;
  const u=coords[a*2],v=coords[a*2+1],bu=coords[b*2]-u,bv=coords[b*2+1]-v,cu=coords[c*2]-u,cv=coords[c*2+1]-v;
  const {width,height}=levels[0];
  const footprint=Math.max(Math.hypot(width*(bu*dbdx+cu*dcdx),height*(bv*dbdx+cv*dcdx)),
    Math.hypot(width*(bu*dbdy+cu*dcdy),height*(bv*dbdy+cv*dcdy)));
  const mip=footprint>1&&minFilter>=9984,blend=mip&&minFilter>=9986;
  const lod=mip?Math.min(levels.length-1,Math.log2(footprint)):0;
  const linear=footprint<=1?magFilter===9729:[9729,9985,9987].includes(minFilter);
  const primary=blend?Math.floor(lod):Math.round(lod),secondary=blend&&lod>primary?primary+1:null;
  const scratch=[0,0,0];
  return (weightB,weightC,out)=>{
    const x=u+bu*weightB+cu*weightC,y=v+bv*weightB+cv*weightC;
    readSample(levels[primary],x,y,wrapS,wrapT,linear,color,out);
    if(secondary!=null){
      readSample(levels[secondary],x,y,wrapS,wrapT,linear,color,scratch);
      for(let i=0;i<3;i++)out[i]+=(scratch[i]-out[i])*(lod-primary);
    }
  };
}

function encodeNormal(out,at,raw,normalScale,sourceNormal,sourceTangent,outputTangent,sourceIndex,workingIndex,a,b,c,s,t){
  const blend=(array,stride,i,j,k,component)=>array[i*stride+component]*a+array[j*stride+component]*b+array[k*stride+component]*c;
  const [i,j,k]=sourceIndex,[l,m,n]=workingIndex;
  let nx=blend(sourceNormal,3,i,j,k,0),ny=blend(sourceNormal,3,i,j,k,1),nz=blend(sourceNormal,3,i,j,k,2);
  const length=Math.hypot(nx,ny,nz)||1;
  nx/=length;
  ny/=length;
  nz/=length;
  orthogonalTangent(nx,ny,nz,blend(sourceTangent,4,i,j,k,0),blend(sourceTangent,4,i,j,k,1),blend(sourceTangent,4,i,j,k,2),s);
  orthogonalTangent(nx,ny,nz,blend(outputTangent,4,l,m,n,0),blend(outputTangent,4,l,m,n,1),blend(outputTangent,4,l,m,n,2),t);
  const sourceW=blend(sourceTangent,4,i,j,k,3)<0?-1:1,targetW=blend(outputTangent,4,l,m,n,3)<0?-1:1;
  const sx=(ny*s[2]-nz*s[1])*sourceW,sy=(nz*s[0]-nx*s[2])*sourceW,sz=(nx*s[1]-ny*s[0])*sourceW;
  const tx=(ny*t[2]-nz*t[1])*targetW,ty=(nz*t[0]-nx*t[2])*targetW,tz=(nx*t[1]-ny*t[0])*targetW;
  const x=(raw[0]*2-1)*normalScale,y=(raw[1]*2-1)*normalScale,z=raw[2]*2-1;
  const magnitude=Math.hypot(x,y,z);
  if(magnitude<1e-8||!Number.isFinite(magnitude))return;
  const tangentX=(x*s[0]+y*sx)/magnitude,tangentY=(x*s[1]+y*sy)/magnitude,tangentZ=(x*s[2]+y*sz)/magnitude;
  out[at]=toByte(.5+.5*(tangentX*t[0]+tangentY*t[1]+tangentZ*t[2]));
  out[at+1]=toByte(.5+.5*(tangentX*tx+tangentY*ty+tangentZ*tz));
  out[at+2]=toByte(.5+.5*z/magnitude);
}

async function fillGutters(slots,maps,width,padding,signal){
  if(!padding)return;
  let frontier=[];
  for(let y=0;y<width;y++){
    if((y&127)===0){await pause();check(signal);}
    for(let x=0;x<width;x++){
      const at=y*width+x;
      if(slots[at]!==NO_SLOT&&(x>0&&slots[at-1]===NO_SLOT||x+1<width&&slots[at+1]===NO_SLOT||
         y>0&&slots[at-width]===NO_SLOT||y+1<width&&slots[at+width]===NO_SLOT))frontier.push(at);
    }
  }
  let nextYield=performance.now()+14;
  for(let step=0;step<padding&&frontier.length;step++){
    const next=[];
    function extend(from,to){
      if(slots[to]!==NO_SLOT)return;
      slots[to]=slots[from];
      for(const map of maps)for(let c=0;c<4;c++)map[to*4+c]=map[from*4+c];
      next.push(to);
    }
    for(let i=0;i<frontier.length;i++){
      if((i&16383)===0&&performance.now()>=nextYield){await pause();check(signal);nextYield=performance.now()+14;}
      const at=frontier[i],x=at%width;
      if(x>0)extend(at,at-1);
      if(x+1<width)extend(at,at+1);
      if(at>=width)extend(at,at-width);
      if(at<slots.length-width)extend(at,at+width);
    }
    frontier=next;
  }
}

// Row 0 is v=0, matching glTF. BaseColor is sRGB, Normal and ORM are linear RGBA8.
// Slot -1 is the implicit glTF material. Slot -2 is unoccupied, including beyond the gutter.
export async function rasterSourcePbr(source,working,{resolution,padding=4,signal,onProgress=()=>{},decodeTexture=browserDecode}={}){
  if(!source.sourcePbr||!Number.isInteger(resolution)||resolution<8||resolution>4096||
     !Number.isInteger(padding)||padding<0||padding>48)throw Error('原材质工作贴图规格无效。');
  check(signal);
  verifySurfacePreserved(source,working);
  const vertexCount=working.pos.length/3;
  if(working.uv.length!==vertexCount*2||working.tangent.length!==vertexCount*4||
     working.uv.some(value=>!Number.isFinite(value)||value<-1e-7||value>1+1e-7)||
     working.tangent.some(value=>!Number.isFinite(value)))throw Error('请先生成有效的工作 UV 与切线。');
  const {primitives,materials,images}=source.sourcePbr;
  const textureImages=new Map(),textureLevels=new Map();
  let sourceImageBytes=0;
  async function prepareTexture(binding,primitive,color=false){
    if(!binding)return null;
    const key=binding.imageIndex+':'+Number(color)+':'+Number(binding.minFilter>=9984);
    if(!textureLevels.has(key)){
      const image=textureImages.get(binding.imageIndex)??await decodeTexture(images[binding.imageIndex],{signal});
      if(!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||
         image.width>8192||image.height>8192||image.data.length!==image.width*image.height*3)throw Error('原材质贴图解码尺寸无效。');
      const isNew=!textureImages.has(binding.imageIndex);
      const levels=binding.minFilter>=9984?await mipLevels(image,color,signal):[image];
      sourceImageBytes+=(isNew?image.data.byteLength:0)+levels.slice(1).reduce((bytes,level)=>bytes+level.data.byteLength,0);
      if(sourceImageBytes>384*1024*1024)throw Error('原材质贴图解码后超出内存预算，请降低源贴图分辨率。');
      textureImages.set(binding.imageIndex,image);
      textureLevels.set(key,levels);
    }
    return {...binding,levels:textureLevels.get(key),coords:textureCoordinates(binding,source,primitive),color};
  }
  const size=resolution*resolution,slots=new Int32Array(size).fill(NO_SLOT);
  const baseColor=new Uint8Array(size*4).fill(255),orm=new Uint8Array(size*4).fill(255),normal=new Uint8Array(size*4).fill(255);
  for(let i=0;i<normal.length;i+=4){normal[i]=128;normal[i+1]=128;}
  const bySlot=new Map(materials.map(material=>[material.index,material]));
  const sourceColors=source.extraAttributes.COLOR_0?.data;
  const dstUV=working.uv,dstIndices=working.indices,dstTangent=working.tangent;
  const sampledColor=[1,1,1],sampledNormal=[.5,.5,1],sampledRoughness=[1,1,1],sampledAO=[1,1,1];
  const s=[0,0,0],t=[0,0,0];
  let nextYield=performance.now()+14;
  for(const primitive of primitives){
    const material=bySlot.get(primitive.materialIndex),{textures}=material;
    const colorTexture=await prepareTexture(textures.baseColor,primitive,true);
    const normalTexture=await prepareTexture(textures.normal,primitive);
    const roughTexture=await prepareTexture(textures.metallicRoughness,primitive);
    const aoTexture=await prepareTexture(textures.occlusion,primitive);
    const {firstVertex,vertexCount,firstIndex,indexCount}=primitive,after=firstIndex+indexCount;
    const srcNorm=source.normal.subarray(firstVertex*3,(firstVertex+vertexCount)*3);
    const authorTangent=source.tangent.subarray(firstVertex*4,(firstVertex+vertexCount)*4);
    const frames=normalTexture&&!primitive.hasTangents?uvTangents(source.pos.subarray(firstVertex*3,(firstVertex+vertexCount)*3),srcNorm,
      normalTexture.coords,Uint32Array.from(source.indices.subarray(firstIndex,after),i=>i-firstVertex),{split:true}):null;
    for(let i=firstIndex;i<after;i+=3){
      if(performance.now()>=nextYield){onProgress(.9*i/source.indices.length);await pause();check(signal);nextYield=performance.now()+14;}
      const a=dstIndices[i],b=dstIndices[i+1],c=dstIndices[i+2],workingIndex=[a,b,c];
      const u=dstUV[a*2]*resolution,v=dstUV[a*2+1]*resolution;
      const bu=dstUV[b*2]*resolution-u,bv=dstUV[b*2+1]*resolution-v;
      const cu=dstUV[c*2]*resolution-u,cv=dstUV[c*2+1]*resolution-v;
      const area=bu*cv-bv*cu;
      if(!Number.isFinite(area)||Math.abs(area)<1e-12)continue;
      const winding=Math.sign(area);
      const includeA=topLeft((cu-bu)*winding,(cv-bv)*winding);
      const includeB=topLeft(-cu*winding,-cv*winding);
      const includeC=topLeft(bu*winding,bv*winding);
      const startX=Math.max(0,Math.ceil(u+Math.min(0,bu,cu)-.5)),endX=Math.min(resolution-1,Math.floor(u+Math.max(0,bu,cu)-.5));
      const startY=Math.max(0,Math.ceil(v+Math.min(0,bv,cv)-.5)),endY=Math.min(resolution-1,Math.floor(v+Math.max(0,bv,cv)-.5));
      if(startX>endX||startY>endY)continue;
      const ia=source.indices[i]-firstVertex,ib=source.indices[i+1]-firstVertex,ic=source.indices[i+2]-firstVertex,sourceIndex=[ia,ib,ic];
      const sa=firstVertex+ia,sb=firstVertex+ib,sc=firstVertex+ic;
      const dbdx=cv/area,dcdx=-bv/area,dbdy=-cu/area,dcdy=bu/area;
      const sample=texture=>samplePlan(texture,ia,ib,ic,dbdx,dcdx,dbdy,dcdy);
      const colorSample=sample(colorTexture),normalSample=sample(normalTexture);
      const roughnessSample=sample(roughTexture),aoSample=sample(aoTexture);
      const faceSign=frames?.faceSigns[(i-firstIndex)/3];
      const srcTangent=frames?(faceSign===-1?frames.negative:frames.positive):authorTangent;
      for(let y=startY;y<=endY;y++)for(let x=startX;x<=endX;x++){
        const px=x+.5-u,py=y+.5-v,wb=px*dbdx+py*dbdy,wc=px*dcdx+py*dcdy,wa=1-wb-wc;
        if(wa<-1e-9||wb<-1e-9||wc<-1e-9||
           wa<=1e-9&&!includeA||wb<=1e-9&&!includeB||wc<=1e-9&&!includeC)continue;
        const index=y*resolution+x,at=index*4;
        if(slots[index]!==NO_SLOT)throw Error('工作 UV 存在重叠面，请重新展开后再转移原材质。');
        slots[index]=material.index;
        if(colorSample)colorSample(wb,wc,sampledColor);else sampledColor.fill(1);
        for(let k=0;k<3;k++){
          const vertexColor=sourceColors?sourceColors[sa*4+k]*wa+sourceColors[sb*4+k]*wb+sourceColors[sc*4+k]*wc:1;
          baseColor[at+k]=toByte(linearToSrgb(sampledColor[k]*material.baseColorFactor[k]*vertexColor));
        }
        if(roughnessSample)roughnessSample(wb,wc,sampledRoughness);else sampledRoughness.fill(1);
        if(aoSample)aoSample(wb,wc,sampledAO);else sampledAO.fill(1);
        orm[at]=toByte(1+(sampledAO[0]-1)*material.occlusionStrength);
        orm[at+1]=toByte(sampledRoughness[1]*material.roughnessFactor);
        orm[at+2]=toByte(sampledRoughness[2]*material.metallicFactor);
        if(normalSample&&faceSign!==0){
          normalSample(wb,wc,sampledNormal);
          encodeNormal(normal,at,sampledNormal,material.normalScale,srcNorm,srcTangent,dstTangent,sourceIndex,workingIndex,wa,wb,wc,s,t);
        }
      }
    }
  }
  if(!slots.some(slot=>slot!==NO_SLOT))throw Error('工作 UV 未覆盖原材质贴图，请先展开网格。');
  onProgress(.9);
  await fillGutters(slots,[baseColor,normal,orm],resolution,padding,signal);
  check(signal);
  onProgress(1);
  return {width:resolution,height:resolution,baseColor,normal,orm,slots};
}
