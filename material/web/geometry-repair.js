import {parseGLB} from './model.js';
const exactBits=new DataView(new ArrayBuffer(8));
function exactlyCollinear(pos,a,b,c){
 const values=[];let minimum=Infinity;for(const i of[a,b,c])for(let k=0;k<3;k++){exactBits.setFloat64(0,pos[i+k],true);const bits=exactBits.getBigUint64(0,true),e=Number(bits>>52n&2047n),mantissa=(bits&4503599627370495n)|(e?4503599627370496n:0n),exponent=e?e-1075:-1074;values.push({mantissa:bits>>63n?-mantissa:mantissa,exponent});if(mantissa)minimum=Math.min(minimum,exponent);}
 if(minimum===Infinity)return true;const p=values.map(v=>v.mantissa?v.mantissa<<BigInt(v.exponent-minimum):0n),x=p[3]-p[0],y=p[4]-p[1],z=p[5]-p[2],u=p[6]-p[0],v=p[7]-p[1],w=p[8]-p[2];return y*w-z*v===0n&&z*u-x*w===0n&&x*v-y*u===0n;
}
// Exact collinearity only. Small but nonzero faces are not cleanup candidates.
// Existing projects are never changed by parseGLB; only an explicitly accepted
// import/preparation creates a derivative GLB with a new source identity.
export function inspectGeometry(mesh){
 const {pos,indices}=mesh,faces=[];for(let f=0;f<indices.length;f+=3){const a=indices[f]*3,b=indices[f+1]*3,c=indices[f+2]*3,x=pos[b]-pos[a],y=pos[b+1]-pos[a+1],z=pos[b+2]-pos[a+2],u=pos[c]-pos[a],v=pos[c+1]-pos[a+1],w=pos[c+2]-pos[a+2];if(y*w-z*v===0&&z*u-x*w===0&&x*v-y*u===0&&exactlyCollinear(pos,a,b,c))faces.push(f/3);}
 return{version:1,method:'remove-exact-zero-area-faces-v1',inputTriangles:indices.length/3,removedFaces:faces.length,outputTriangles:indices.length/3-faces.length,faces:Uint32Array.from(faces)};
}
export function filterGeometryIndices(indices,report){const out=new Uint32Array(report.outputTriangles*3);let next=0,at=0;for(let f=0;f<indices.length/3;f++){if(f===report.faces[next]){next++;continue;}out.set(indices.subarray(f*3,f*3+3),at);at+=3;}if(next!==report.faces.length||at!==out.length||!at)throw Error('退化面清理结果无效，原模型保持。');return out;}
export function geometryRepairSummary(report,originalSHA256){return{version:1,method:report.method,inputTriangles:report.inputTriangles,removedFaces:report.removedFaces,outputTriangles:report.outputTriangles,originalSHA256};}
// Append one index accessor. All original binary bytes, vertex attributes,
// materials, images, transforms and their JSON references remain intact.
export function repairGeometryGLB(bytes,mesh,report=inspectGeometry(mesh)){
 if(!report.removedFaces)return bytes;if(!report.outputTriangles)throw Error('所有三角面均已退化，无法自动修复。');
 const source=new Uint8Array(bytes.buffer||bytes,bytes.byteOffset||0,bytes.byteLength),view=new DataView(source.buffer,source.byteOffset,source.byteLength);let doc,bin;
 for(let at=12;at+8<=source.length;){const length=view.getUint32(at,true),type=view.getUint32(at+4,true);if(at+8+length>source.length)throw Error('GLB数据不完整。');const data=source.subarray(at+8,at+8+length);if(type===0x4e4f534a)doc=JSON.parse(new TextDecoder().decode(data).replace(/\0+$/,''));else if(type===0x004e4942)bin=data;at+=8+length;}
 if(!doc||!bin||doc.meshes?.length!==1||doc.meshes[0].primitives?.length!==1)throw Error('当前清理仅支持单网格静态GLB。');const p=doc.meshes[0].primitives[0],raw=new Uint32Array(mesh.indices.length);
 if(p.indices==null){for(let i=0;i<raw.length;i++)raw[i]=i;}else{const a=doc.accessors[p.indices],v=doc.bufferViews[a.bufferView],spec={5121:['getUint8',1],5123:['getUint16',2],5125:['getUint32',4]}[a.componentType];if(!spec||a.sparse||a.count!==raw.length||v.buffer!==0)throw Error('原索引格式不支持无损清理。');const data=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||spec[1];for(let i=0;i<raw.length;i++)raw[i]=data[spec[0]](offset+i*stride,true);}
 const indices=filterGeometryIndices(raw,report),offset=Math.ceil(bin.length/4)*4,length=Math.ceil((offset+indices.byteLength)/4)*4,newBin=new Uint8Array(length);newBin.set(bin);newBin.set(new Uint8Array(indices.buffer),offset);
 doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:indices.byteLength,target:34963});doc.accessors.push({bufferView:doc.bufferViews.length-1,componentType:5125,count:indices.length,type:'SCALAR'});p.indices=doc.accessors.length-1;doc.buffers[0].byteLength=length;doc.extras={...doc.extras,treeMaterialLab:{...doc.extras?.treeMaterialLab,geometryRepair:geometryRepairSummary(report,mesh.sourceSHA256)}};
 const json=new TextEncoder().encode(JSON.stringify(doc)),jsonLength=Math.ceil(json.length/4)*4,out=new Uint8Array(28+jsonLength+length),v=new DataView(out.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,out.length,true);v.setUint32(12,jsonLength,true);v.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+jsonLength);out.set(json,20);v.setUint32(20+jsonLength,length,true);v.setUint32(24+jsonLength,0x004e4942,true);out.set(newBin,28+jsonLength);return out.buffer;
}
export async function prepareGeometryImport(bytes,name,{source=null,confirm,current=()=>true,parse=parseGLB}={}){
 const abort=()=>Object.assign(Error('已取消修复，原模型和工程保持。'),{name:'AbortError'});if(!current())throw abort();source||=await parse(bytes,name);if(!current())throw abort();const report=inspectGeometry(source),pending=report.removedFaces?geometryRepairSummary(report,source.sourceSHA256):null;
 if(pending&&!pending.outputTriangles)throw Error('所有三角面均已退化，无法自动修复。');if(!await confirm({...source,geometryRepair:pending},name)||!current())throw abort();if(!pending)return{bytes,name,source,geometryRepair:null};
 const repaired=repairGeometryGLB(bytes,source,report),newName=name.replace(/\.glb$/i,'').slice(0,160)+'_几何修复.glb',clean=await parse(repaired,newName);if(!current())throw abort();if(inspectGeometry(clean).removedFaces)throw Error('清理后仍有退化面，原工程保持。');return{bytes:repaired,name:newName,source:clean,geometryRepair:pending};
}
