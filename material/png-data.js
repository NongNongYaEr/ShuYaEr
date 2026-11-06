const signature=[137,80,78,71,13,10,26,10],types={0:1,2:3,3:1,4:2,6:4};
const table=Uint32Array.from({length:256},(_,i)=>{for(let n=0;n<8;n++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
const crc=(bytes,start,end)=>{let c=0xffffffff;for(let i=start;i<end;i++)c=table[(c^bytes[i])&255]^(c>>>8);return(c^0xffffffff)>>>0;};
const abort=()=>Object.assign(Error('数据图解码已取消。'),{name:'AbortError'});
export function inspectPNG(bytes,channel='height'){
 if(!(bytes instanceof Uint8Array)||bytes.length<45||bytes.length>50000000||signature.some((v,i)=>bytes[i]!==v)||!['height','roughness','normal','color'].includes(channel))throw Error('请使用50MB以内的有效PNG数据图。');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),parts=[];let width,height,bitDepth,colorType,interlace,palette=null,ended=false,hadData=false,dataEnded=false,at=8;
 while(at<bytes.length){if(at+12>bytes.length)throw Error('PNG块被截断。');const size=view.getUint32(at),end=at+12+size;if(size>50000000||end>bytes.length)throw Error('PNG块长度无效。');const type=String.fromCharCode(...bytes.subarray(at+4,at+8));if(!/^[a-zA-Z]{4}$/.test(type)||type[2]!==type[2].toUpperCase())throw Error('PNG块类型无效。');if(crc(bytes,at+4,at+8+size)!==view.getUint32(at+8+size))throw Error('PNG CRC校验失败。');
  if(at===8&&type!=='IHDR')throw Error('PNG缺少首个IHDR。');
  if(type==='IHDR'){if(at!==8||size!==13)throw Error('PNG头无效。');width=view.getUint32(at+8);height=view.getUint32(at+12);bitDepth=bytes[at+16];colorType=bytes[at+17];interlace=bytes[at+20];if(!width||!height||width>8192||height>8192)throw Error('数据图长边需在8192以内。');if(!(colorType in types)||![8,16].includes(bitDepth)||colorType===3&&bitDepth!==8||bytes[at+18]!==0||bytes[at+19]!==0||interlace>1)throw Error('数据图需要8/16位标准PNG。');if(channel==='color'&&(bitDepth!==8||![2,3,6].includes(colorType)))throw Error('导出颜色需要8位RGB PNG。');if(channel!=='height'&&bitDepth!==8)throw Error('粗糙度/法线当前需要8位PNG；高度支持8/16位。');if(channel==='normal'&&![2,3,6].includes(colorType))throw Error('切线法线需要RGB PNG，不能使用灰度图。');}
  else if(type==='PLTE'){if(hadData||palette||!size||size%3||size>768)throw Error('PNG调色板无效。');palette=bytes.subarray(at+8,at+8+size);}
  else if(type==='IDAT'){if(dataEnded)throw Error('PNG数据块不连续。');hadData=true;parts.push(bytes.subarray(at+8,at+8+size));}
  else if(type==='IEND'){if(size||!hadData||end!==bytes.length)throw Error('PNG结尾或数据无效。');ended=true;break;}
  else{if(hadData)dataEnded=true;if(type[0]===type[0].toUpperCase())throw Error('不支持的PNG关键块：'+type);}
  at=end;
 }
 if(!ended||colorType===3&&!palette)throw Error('PNG不完整或缺少调色板。');
 return{width,height,bitDepth,colorType,interlace,channels:types[colorType],parts,palette};
}
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
const patterns=[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];
export async function decodeDataPNG(bytes,channel='height',{signal,onProgress=()=>{},normalPolicy='outward-only'}={}){
 if(!['outward-only','reflect-back-facing'].includes(normalPolicy))throw Error('法线修复策略无效。');let correctedNormals=0;if(signal?.aborted)throw abort();const info=inspectPNG(bytes,channel),{width,height,bitDepth,colorType,channels,palette}=info,float=channel==='height'&&bitDepth===16,components=['normal','color'].includes(channel)?3:1,data=float?new Float32Array(width*height):new Uint8Array(width*height*components),bpp=channels*(bitDepth/8),passes=(info.interlace?patterns:[[0,0,1,1]]).map(([x,y,dx,dy])=>({x,y,dx,dy,w:Math.max(0,Math.ceil((width-x)/dx)),h:Math.max(0,Math.ceil((height-y)/dy))})).filter(p=>p.w&&p.h),expected=passes.reduce((n,p)=>n+(1+p.w*bpp)*p.h,0),reader=new Blob(info.parts).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
 let chunk=new Uint8Array(0),offset=0,consumed=0,rows=0;
 const take=async count=>{const out=new Uint8Array(count);let at=0;while(at<count){if(signal?.aborted)throw abort();if(offset===chunk.length){const next=await reader.read();if(next.done)throw Error('PNG解压数据不足。');chunk=next.value;offset=0;}const n=Math.min(count-at,chunk.length-offset);out.set(chunk.subarray(offset,offset+n),at);at+=n;offset+=n;consumed+=n;if(consumed>expected)throw Error('PNG解压数据超出声明尺寸。');}return out;};
 try{for(const pass of passes){let previous=new Uint8Array(pass.w*bpp);for(let y=0;y<pass.h;y++){const filtered=await take(1+previous.length),filter=filtered[0],row=filtered.subarray(1);if(filter>4)throw Error('PNG行过滤器无效。');for(let i=0;i<row.length;i++){const a=i>=bpp?row[i-bpp]:0,b=previous[i],c=i>=bpp?previous[i-bpp]:0;row[i]=(row[i]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;}
    for(let x=0;x<pass.w;x++){const source=x*bpp,target=(pass.y+y*pass.dy)*width+pass.x+x*pass.dx;let r=row[source],g=row[source+1],b=row[source+2];if(colorType===3){const index=r*3;if(index+2>=palette.length)throw Error('PNG调色板索引越界。');[r,g,b]=palette.subarray(index,index+3);}if(float)data[target]=(r*256+row[source+1])/65535;else if(components===1)data[target]=r;else{if(channel==='normal'){const vector=[r,g,b].map(v=>v*2/255-1),length=Math.hypot(...vector);if(length<.01||b<126&&normalPolicy==='outward-only')throw Error('法线图需为朝外的切线空间RGB数据，请检查蓝通道。');if(normalPolicy==='reflect-back-facing'&&vector[2]/length<.02){vector[2]=Math.max(Math.abs(vector[2]),length*.02);const norm=Math.hypot(...vector);[r,g,b]=vector.map(v=>Math.round((v/norm*.5+.5)*255));correctedNormals++;}}const at=target*3;data[at]=r;data[at+1]=g;data[at+2]=b;}}
    previous=row;if(++rows%32===0)onProgress(consumed/expected);
   }}if(offset!==chunk.length)throw Error('PNG解压数据多于声明尺寸。');const tail=await reader.read();if(!tail.done)throw Error('PNG解压数据多于声明尺寸。');if(signal?.aborted)throw abort();onProgress(1);return{kind:'tree-data-image',width,height,bitDepth,channel,...(channel==='normal'&&normalPolicy!=='outward-only'?{normalConditioning:{policy:normalPolicy,correctedPixels:correctedNormals,totalPixels:width*height}}:{}),format:float?'r32f':components===3?'rgb8':'r8',data};
 }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
}
export function dataImage(record){return{...record,close(){this.data=null;this.mipmaps=null;this.closed=true;}};}

export function heightMipmaps(image){
 if(image.format!=='r32f')return null;
 const levels=[{width:image.width,height:image.height,data:image.data}];
 while(levels.at(-1).width>1||levels.at(-1).height>1){const old=levels.at(-1),width=Math.max(1,old.width>>1),height=Math.max(1,old.height>>1),data=new Float32Array(width*height),sx=old.width/width,sy=old.height/height;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const x0=x*sx,x1=(x+1)*sx,y0=y*sy,y1=(y+1)*sy;let sum=0;for(let yy=Math.floor(y0);yy<Math.ceil(y1);yy++)for(let xx=Math.floor(x0);xx<Math.ceil(x1);xx++)sum+=old.data[yy*old.width+xx]*Math.max(0,Math.min(x1,xx+1)-Math.max(x0,xx))*Math.max(0,Math.min(y1,yy+1)-Math.max(y0,yy));data[y*width+x]=sum/(sx*sy);}levels.push({width,height,data});
 }return levels;
}
