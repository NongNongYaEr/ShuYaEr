// Full-resolution textures cross V040's unchanged 128MiB envelope in bounded rows.
export const NATIVE_RESOURCE_BATCH_BYTES=112*1024*1024;
export const NATIVE_TEXTURE_CHUNK_BYTES=16*1024*1024;
export const NATIVE_TEXTURE_TOTAL_BYTES=512*1024*1024;
export function textureUploadPlan(resource){
 if(resource.kind!=='texture'||!['u8rgba','u8r','f32rgba','f32r'].includes(resource.format)||!resource.levels?.length||resource.levels.length>15)throw Error('DX12分块贴图格式无效。');
 const channels=resource.format.endsWith('rgba')?4:1,component=resource.format.startsWith('f32')?4:1,bpp=channels*component,first=resource.levels[0],levels=[],chunks=[];let total=0;
 if(!Number.isInteger(first.width)||!Number.isInteger(first.height)||first.width<1||first.height<1||first.width>16384||first.height>16384)throw Error('DX12分块贴图尺寸无效。');
 for(const [level,mip]of resource.levels.entries()){
  if(mip.width!==Math.max(1,first.width>>level)||mip.height!==Math.max(1,first.height>>level)||!ArrayBuffer.isView(mip.data)||mip.data.byteLength!==mip.width*mip.height*bpp)throw Error('DX12分块贴图层级数据不完整。');
  const rowBytes=mip.width*bpp;total+=mip.data.byteLength;levels.push({width:mip.width,height:mip.height});
  for(let y=0;y<mip.height;){const rows=Math.min(mip.height-y,Math.max(1,Math.floor(NATIVE_TEXTURE_CHUNK_BYTES/rowBytes)));chunks.push({level,y,rows,offset:y*rowBytes,bytes:rows*rowBytes});y+=rows;}
 }
 if(total>NATIVE_TEXTURE_TOTAL_BYTES)throw Error('DX12单张贴图解码后超过512MiB，请使用较小的数据图。');
 return{levels,chunks,total};
}
export async function streamNativeTexture(resource,{submit,cancel,willCommit=()=>{}}){
 const plan=textureUploadPlan(resource),base={id:resource.id};let attempted=false;
 try{
  attempted=true;await submit({textureUpload:{...base,op:'begin',owner:resource.owner,format:resource.format,levels:plan.levels}},[],cancel);
  for(const chunk of plan.chunks){const mip=resource.levels[chunk.level],spec={},data=new Uint8Array(mip.data.buffer,mip.data.byteOffset+chunk.offset,chunk.bytes);await submit({textureUpload:{...base,op:'rows',level:chunk.level,y:chunk.y,rows:chunk.rows,data:spec}},[{spec,data}],cancel);}
  // Invalidate owner revisions before awaiting the commit: native success can be
  // followed by a consumer cancellation, so a lost acknowledgement is conservative.
  willCommit();await submit({textureUpload:{...base,op:'commit'}},[],cancel);
 }catch(error){if(attempted)try{await submit({textureUpload:{...base,op:'abort'}},[]);}catch{}throw error;}
 return plan;
}
