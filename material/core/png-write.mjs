import zlib from 'node:zlib';
const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const value of bytes)c=table[(c^value)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(out.subarray(4,out.length-4)),out.length-4);return out;}
export function encodePNG(width,height,rgba,{normal=false,directX=false}={}){
  const rows=Buffer.alloc((width*3+1)*height);let dest=0;
  for(let y=0;y<height;y++){rows[dest++]=1;let pr=0,pg=0,pb=0;for(let x=0;x<width;x++){const i=(y*width+x)*4;let r=rgba[i],g=rgba[i+1],b=rgba[i+2];if(normal){const nx=r/127.5-1,ny=g/127.5-1,nz=b/127.5-1,length=Math.hypot(nx,ny,nz)||1;r=Math.max(0,Math.min(255,Math.round((nx/length*.5+.5)*255)));g=Math.max(0,Math.min(255,Math.round((ny/length*.5+.5)*255)));b=Math.max(0,Math.min(255,Math.round((nz/length*.5+.5)*255)));if(directX)g=255-g;}rows[dest++]=(r-pr+256)&255;rows[dest++]=(g-pg+256)&255;rows[dest++]=(b-pb+256)&255;pr=r;pg=g;pb=b;}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
export function encodePNG16(width,height,data,channels=1){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192||![1,3,4].includes(channels)||!(data instanceof Uint16Array)||data.length!==width*height*channels)throw Error('16位PNG数据无效。');const bytesPerPixel=channels*2,rows=Buffer.alloc((width*bytesPerPixel+1)*height);let at=0,source=0;
 for(let y=0;y<height;y++){rows[at++]=1;const previous=new Uint8Array(bytesPerPixel);for(let x=0;x<width;x++)for(let c=0;c<channels;c++){const value=data[source++],high=value>>>8,low=value&255;rows[at++]=(high-previous[c*2]+256)&255;rows[at++]=(low-previous[c*2+1]+256)&255;previous[c*2]=high;previous[c*2+1]=low;}}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=16;ihdr[9]=channels===1?0:channels===3?2:6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
