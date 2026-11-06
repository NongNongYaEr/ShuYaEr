export const OPTIMIZATION_LIMITS={triangles:2000000,vertices:2000000,fileBytes:150000000,candidateTriangles:250000,previewTriangles:180000};
export function optimizationOptions(raw={}){
 const value={targetTriangles:50000,errorCm:2,actualHeightMeters:10,detailProtection:.7,preserveBoundary:true,preserveUV:false,...raw};
 if(Object.keys(value).some(k=>!['targetTriangles','errorCm','actualHeightMeters','detailProtection','preserveBoundary','preserveUV'].includes(k))||!Number.isInteger(value.targetTriangles)||value.targetTriangles<100||value.targetTriangles>250000||!Number.isFinite(value.errorCm)||value.errorCm<=0||value.errorCm>100||!Number.isFinite(value.actualHeightMeters)||value.actualHeightMeters<.1||value.actualHeightMeters>200||!Number.isFinite(value.detailProtection)||value.detailProtection<0||value.detailProtection>1||typeof value.preserveBoundary!=='boolean'||typeof value.preserveUV!=='boolean')throw Error('减面参数无效：目标100–250000三角面，误差预算大于0且不超过100cm。');
 return value;
}
export function inspectOptimizationGLB(bytes){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<20||bytes.byteLength>OPTIMIZATION_LIMITS.fileBytes)throw Error('请使用150MB以内的静态GLB。');
 const v=new DataView(bytes);if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.byteLength)throw Error('GLB文件头无效。');
 for(let at=12;at+8<=bytes.byteLength;){const n=v.getUint32(at,true),type=v.getUint32(at+4,true);if(at+8+n>bytes.byteLength)break;if(type===0x4e4f534a){const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,at+8,n)).replace(/\0+$/,''));if(doc.meshes?.length!==1||doc.meshes[0].primitives?.length!==1||doc.skins?.length)throw Error('模型优化支持单网格、单材质的静态GLB。');const p=doc.meshes[0].primitives[0],vertices=doc.accessors?.[p.attributes?.POSITION]?.count,indices=p.indices==null?vertices:doc.accessors?.[p.indices]?.count;if(!Number.isInteger(vertices)||vertices<3||vertices>2000000||!Number.isInteger(indices)||indices%3||indices<3||indices>6000000)throw Error('本轮支持最多200万三角面、200万顶点的索引模型。');return{vertices,triangles:indices/3};}at+=8+n;}
 throw Error('GLB缺少有效网格说明。');
}
export function decodeOptimizationResult(bytes,inputTriangles){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength);if(b.length<4)throw Error('减面结果不完整。');const n=v.getUint32(0,true);if(n>20000||4+n>b.length)throw Error('减面说明无效。');const report=JSON.parse(new TextDecoder().decode(b.subarray(4,4+n))),a=report.candidateIndices,p=report.proxyIndices;
 if(report.version!==1||report.inputTriangles!==inputTriangles||!Number.isInteger(a)||a<3||a%3||a>inputTriangles*3||!Number.isInteger(p)||p<0||p%3||p>540000||report.outputTriangles!==a/3||4+n+(a+p)*4!==b.length)throw Error('减面结果数量不匹配。');
 const copy=(at,count)=>{const out=new Uint32Array(count);for(let i=0;i<count;i++)out[i]=v.getUint32(at+i*4,true);return out;};return{report,indices:copy(4+n,a),proxyIndices:copy(4+n+a*4,p)};
}
export function compactOptimizationMesh(source,indices,{preserveUV=false}={}){
 const n=source.pos.length/3,map=new Int32Array(n).fill(-1);let count=0;for(const i of indices){if(i>=n)throw Error('减面索引越界。');if(map[i]<0)map[i]=count++;}
 const pos=new Float32Array(count*3),normal=new Float32Array(count*3),uv=new Float32Array(count*2),tangent=new Float32Array(count*4),ao=new Float32Array(count).fill(1),sourceVertices=new Uint32Array(count),out=new Uint32Array(indices.length);
 for(let old=0;old<n;old++){const i=map[old];if(i<0)continue;sourceVertices[i]=old;pos.set(source.pos.subarray(old*3,old*3+3),i*3);normal.set(source.normal.subarray(old*3,old*3+3),i*3);if(preserveUV)uv.set(source.uv.subarray(old*2,old*2+2),i*2);tangent.set(source.tangent.subarray(old*4,old*4+4),i*4);}
 for(let i=0;i<indices.length;i++)out[i]=map[indices[i]];
 return{pos,normal,uv,tangent,ao,indices:out,min:[...source.min],max:[...source.max],height:source.height,name:source.name,sourceSHA256:source.sourceSHA256,sourceVertices,extraAttributes:{},hasSourceUV:preserveUV&&source.hasSourceUV};
}
export function validateMeshOptimization(raw,resources){
 if(raw==null)return null;
 if(raw.version!==1||!/^[a-f0-9]{64}$/.test(raw.sourceSHA256||'')||raw.sourceSHA256!==resources?.highPoly||typeof raw.sourceName!=='string'||raw.sourceName.length>180||!Number.isInteger(raw.inputTriangles)||raw.inputTriangles<1||raw.inputTriangles>2000000||!Number.isInteger(raw.outputTriangles)||raw.outputTriangles<1||raw.outputTriangles>250000||raw.outputTriangles>raw.inputTriangles||JSON.stringify(raw).length>20000)throw Error('高低模来源记录无效。');
 const options=optimizationOptions(raw.options);if(raw.report?.inputTriangles!==raw.inputTriangles||raw.report?.outputTriangles!==raw.outputTriangles)throw Error('减面统计不匹配。');return structuredClone({...raw,options});
}
