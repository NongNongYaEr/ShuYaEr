export async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
// Face-corner order survives UV/tangent vertex splitting; raw vertex-array order does not.
export async function hashUV({uv,indices}){const bytes=new Uint8Array(indices.length*8),view=new DataView(bytes.buffer);for(let i=0;i<indices.length;i++){view.setFloat32(i*8,uv[indices[i]*2],true);view.setFloat32(i*8+4,uv[indices[i]*2+1],true);}return digest(bytes);}
const mul=(a,b)=>Array.from({length:16},(_,i)=>{const r=i%4,c=i>>2;return a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3]});
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function nodeMatrix(n) {
  if(n.matrix)return n.matrix;
  const [x,y,z,w]=n.rotation||[0,0,0,1],s=n.scale||[1,1,1],t=n.translation||[0,0,0];
  return [(1-2*y*y-2*z*z)*s[0],(2*x*y+2*w*z)*s[0],(2*x*z-2*w*y)*s[0],0,
    (2*x*y-2*w*z)*s[1],(1-2*x*x-2*z*z)*s[1],(2*y*z+2*w*x)*s[1],0,
    (2*x*z+2*w*y)*s[2],(2*y*z-2*w*x)*s[2],(1-2*x*x-2*y*y)*s[2],0,...t,1];
}
// Repair only invalid normals, within the original indexed topology. Never weld
// positions across UV/hard-edge seams, remove faces, or replace authored normals.
function repairInvalidNormals(pos,normal,indices){
  const count=pos.length/3,used=new Uint8Array(count),repair=new Uint8Array(count);for(const i of indices)used[i]=1;
  let correctedVertices=0,sanitizedUnusedVertices=0,dominantFaceFallbacks=0;
  for(let i=0;i<count;i++){const j=i*3,n=Math.hypot(normal[j],normal[j+1],normal[j+2]);if(Number.isFinite(n)&&n>=1e-12)continue;if(used[i]){repair[i]=1;correctedVertices++;}else{normal[j]=0;normal[j+1]=1;normal[j+2]=0;sanitizedUnusedVertices++;}}
  if(!correctedVertices&&!sanitizedUnusedVertices)return null;
  if(correctedVertices){
    const sums=new Float64Array(pos.length),best=new Float64Array(pos.length),areas=new Float64Array(count);
    for(let k=0;k<indices.length;k+=3){const a=indices[k]*3,b=indices[k+1]*3,c=indices[k+2]*3,x=pos[b]-pos[a],y=pos[b+1]-pos[a+1],z=pos[b+2]-pos[a+2],u=pos[c]-pos[a],v=pos[c+1]-pos[a+1],w=pos[c+2]-pos[a+2],nx=y*w-z*v,ny=z*u-x*w,nz=x*v-y*u,area=Math.hypot(nx,ny,nz);if(!area)continue;
      for(let corner=0;corner<3;corner++){const i=indices[k+corner];if(!repair[i])continue;const j=i*3;sums[j]+=nx;sums[j+1]+=ny;sums[j+2]+=nz;if(area>areas[i]){areas[i]=area;best[j]=nx;best[j+1]=ny;best[j+2]=nz;}}
    }
    for(let i=0;i<count;i++)if(repair[i]){const j=i*3;let nx=sums[j],ny=sums[j+1],nz=sums[j+2],n=Math.hypot(nx,ny,nz);if(n<=areas[i]*1e-8){nx=best[j];ny=best[j+1];nz=best[j+2];n=areas[i];dominantFaceFallbacks++;}if(!n||!Number.isFinite(n))throw Error('顶点 '+i+' 的法线无法重建：相邻三角面全部退化，请先修复网格。');normal[j]=nx/n;normal[j+1]=ny/n;normal[j+2]=nz/n;}
  }
  return{version:1,method:'indexed-incident-face-area-weighted; dominant-face fallback for cancellation',correctedVertices,sanitizedUnusedVertices,dominantFaceFallbacks,geometryUVUnchanged:true};
}
export async function parseGLB(buffer,name) {
  const dv=new DataView(buffer);
  if(dv.byteLength<20||dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2)throw Error('请导入glTF 2.0格式的GLB模型。');
  if(dv.getUint32(8,true)!==buffer.byteLength)throw Error('GLB声明长度与文件不一致。');
  let doc,bin;for(let i=12;i<buffer.byteLength;){const length=dv.getUint32(i,true),type=dv.getUint32(i+4,true);if(i+8+length>buffer.byteLength)throw Error('GLB文件不完整。');const data=buffer.slice(i+8,i+8+length);if(type===0x4e4f534a)doc=JSON.parse(new TextDecoder().decode(data).replace(/\0+$/,''));if(type===0x004e4942)bin=data;i+=length+8;}
  if(!doc||!bin)throw Error('模型缺少JSON或内嵌网格数据。');
  if(doc.meshes?.length!==1||doc.meshes[0].primitives.length!==1)throw Error('第一版支持单网格、单材质GLB，请先合并材质和网格。');
  if(doc.skins?.length)throw Error('第一版只支持静态树模型，不支持骨骼。');
  const p=doc.meshes[0].primitives[0];
  if(p.targets?.length)throw Error('请导出不含形态键的静态模型，避免UV重建损失形变数据。');
  const supported=new Set(['POSITION','NORMAL','TANGENT','TEXCOORD_0','TEXCOORD_1','COLOR_0','_TML_SOURCE_COLOR_0']);
  for(const key of Object.keys(p.attributes))if(!supported.has(key))throw Error('存在尚未支持的顶点属性 '+key+'，请先导出静态树干模型。');
  const unsupportedRequired=(doc.extensionsRequired||[]).filter(name=>name!=='KHR_texture_transform');if(unsupportedRequired.length)throw Error('模型包含必须扩展 '+unsupportedRequired.join(', ')+'，请导出标准静态GLB。');
  if(p.extensions?.KHR_draco_mesh_compression)throw Error('请使用未进行Draco压缩的GLB。');
  if((p.mode??4)!==4)throw Error('模型需要使用三角形网格。');
  const read=(idx)=>{
    const a=doc.accessors[idx];if(a.sparse)throw Error('第一版不支持稀疏Accessor。');const v=doc.bufferViews[a.bufferView];
    if(!v||v.buffer!==0||v.extensions?.EXT_meshopt_compression)throw Error('请使用未压缩的内嵌网格。');
    const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],spec={5121:['getUint8',1,255],5123:['getUint16',2,65535],5125:['getUint32',4,4294967295],5126:['getFloat32',4,1]}[a.componentType];
    if(!size||!spec)throw Error('不支持的顶点数据类型。');const result=new Float32Array(a.count*size),data=new DataView(bin),stride=v.byteStride||size*spec[1],offset=(v.byteOffset||0)+(a.byteOffset||0);
    for(let i=0;i<a.count;i++)for(let c=0;c<size;c++)result[i*size+c]=data[spec[0]](offset+i*stride+c*spec[1],true)/(a.normalized?spec[2]:1);
    return result;
  };
  const pos=read(p.attributes.POSITION),uv=p.attributes.TEXCOORD_0==null?new Float32Array(pos.length/3*2):read(p.attributes.TEXCOORD_0),indices=p.indices==null?Uint32Array.from({length:pos.length/3},(_,i)=>i):Uint32Array.from(read(p.indices));
  if(indices.length%3||!indices.length||indices.length>6_000_000)throw Error('模型过大或三角形索引无效。');
  if(uv.length!==pos.length/3*2)throw Error('UV与顶点数量不匹配。');
  for(const x of uv)if(!Number.isFinite(x))throw Error('UV存在无效数值。');
  for(const i of indices)if(i>=pos.length/3)throw Error('顶点索引越界。');
  let bad=0;for(let k=0;k<indices.length;k+=3){const a=indices[k]*2,b=indices[k+1]*2,c=indices[k+2]*2;const area=(uv[b]-uv[a])*(uv[c+1]-uv[a+1])-(uv[b+1]-uv[a+1])*(uv[c]-uv[a]);if(Math.abs(area)<1e-14)bad++;}
  let normal=p.attributes.NORMAL==null?new Float32Array(pos.length):read(p.attributes.NORMAL);
  if(normal.length!==pos.length)throw Error('法线与顶点数量不匹配。');
  // Flatten the single mesh's node hierarchy into preview space; exported UVs remain unchanged.
  const nodeIndices=(doc.nodes||[]).map((n,i)=>n.mesh===0?i:-1).filter(i=>i>=0);
  if(nodeIndices.length>1)throw Error('不支持同一网格的多个实例，请导入一棵独立的树。');
  let matrix=identity();if(nodeIndices.length){const parents={};doc.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents[c]=i));let i=nodeIndices[0],chain=[],seen=new Set();while(i!=null){if(seen.has(i))throw Error('节点层级循环。');seen.add(i);chain.unshift(i);i=parents[i];}for(const j of chain)matrix=mul(matrix,nodeMatrix(doc.nodes[j]));}
  const cofactor=[matrix[5]*matrix[10]-matrix[9]*matrix[6],matrix[9]*matrix[2]-matrix[1]*matrix[10],matrix[1]*matrix[6]-matrix[5]*matrix[2],matrix[8]*matrix[6]-matrix[4]*matrix[10],matrix[0]*matrix[10]-matrix[8]*matrix[2],matrix[4]*matrix[2]-matrix[0]*matrix[6],matrix[4]*matrix[9]-matrix[8]*matrix[5],matrix[8]*matrix[1]-matrix[0]*matrix[9],matrix[0]*matrix[5]-matrix[4]*matrix[1]];
  const determinant=matrix[0]*cofactor[0]+matrix[1]*cofactor[3]+matrix[2]*cofactor[6];
  const columns=[0,4,8].map(i=>matrix.slice(i,i+3)),lengths=columns.map(c=>Math.hypot(...c)),reference=Math.max(...lengths),orthogonal=columns.every((a,i)=>columns.every((b,j)=>i===j||Math.abs(a.reduce((s,v,k)=>s+v*b[k],0))<reference*reference*1e-6)),uniform=lengths.every(x=>Math.abs(x-lengths[0])<reference*1e-6),requiresPairedMesh=!orthogonal||!uniform||determinant<0;
  if(Math.abs(determinant)<1e-12)throw Error('节点缩放导致表面退化。');
  if(determinant<0){for(let k=0;k<indices.length;k+=3)[indices[k+1],indices[k+2]]=[indices[k+2],indices[k+1]];for(let c=0;c<cofactor.length;c++)cofactor[c]*=-1;}
  for(let i=0;i<pos.length;i+=3){const [x,y,z]=pos.subarray(i,i+3);pos[i]=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12];pos[i+1]=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13];pos[i+2]=matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14];const [a,b,c]=normal.subarray(i,i+3);normal[i]=cofactor[0]*a+cofactor[1]*b+cofactor[2]*c;normal[i+1]=cofactor[3]*a+cofactor[4]*b+cofactor[5]*c;normal[i+2]=cofactor[6]*a+cofactor[7]*b+cofactor[8]*c;}
  if(p.attributes.NORMAL==null){for(let k=0;k<indices.length;k+=3){const a=indices[k]*3,b=indices[k+1]*3,c=indices[k+2]*3;const x=pos[b]-pos[a],y=pos[b+1]-pos[a+1],z=pos[b+2]-pos[a+2],u=pos[c]-pos[a],v=pos[c+1]-pos[a+1],w=pos[c+2]-pos[a+2];for(const i of [a,b,c]){normal[i]+=y*w-z*v;normal[i+1]+=z*u-x*w;normal[i+2]+=x*v-y*u;}}}
  for(const x of pos)if(!Number.isFinite(x))throw Error('无效坐标。');
  const normalRepair=repairInvalidNormals(pos,normal,indices);
  const tang=new Float32Array(pos.length),bt=new Float32Array(pos.length);
  for(let k=0;k<indices.length;k+=3){const a=indices[k],b=indices[k+1],c=indices[k+2],du=uv[b*2]-uv[a*2],dv=uv[b*2+1]-uv[a*2+1],su=uv[c*2]-uv[a*2],sv=uv[c*2+1]-uv[a*2+1],det=du*sv-su*dv;if(Math.abs(det)<1e-14)continue;for(let j=0;j<3;j++){const e=pos[b*3+j]-pos[a*3+j],f=pos[c*3+j]-pos[a*3+j],t=(e*sv-f*dv)/det,h=(f*du-e*su)/det;for(const q of [a,b,c]){tang[q*3+j]+=t;bt[q*3+j]+=h;}}}
  const tangent=new Float32Array(pos.length/3*4),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],used=new Uint8Array(pos.length/3);for(const i of indices)used[i]=1;
  for(let i=0;i<pos.length/3;i++){const n=normal.subarray(i*3,i*3+3);let len=Math.hypot(...n);if(used[i]&&(!Number.isFinite(len)||len<1e-12))throw Error('模型包含零法线或无效法线。');len=len||1;for(let j=0;j<3;j++)n[j]/=len;const d=n[0]*tang[i*3]+n[1]*tang[i*3+1]+n[2]*tang[i*3+2];let t=[tang[i*3]-n[0]*d,tang[i*3+1]-n[1]*d,tang[i*3+2]-n[2]*d];len=Math.hypot(...t);if(len<1e-12){t=Math.abs(n[1])<.9?[n[2],0,-n[0]]:[0,n[2],-n[1]];len=Math.hypot(...t)||1;}t=t.map(x=>x/len);tangent.set(t,i*4);const cross=[n[1]*t[2]-n[2]*t[1],n[2]*t[0]-n[0]*t[2],n[0]*t[1]-n[1]*t[0]];tangent[i*4+3]=(cross[0]*bt[i*3]+cross[1]*bt[i*3+1]+cross[2]*bt[i*3+2])<0?-1:1;for(let j=0;j<3;j++){if(!Number.isFinite(pos[i*3+j]))throw Error('无效坐标。');if(used[i]){min[j]=Math.min(min[j],pos[i*3+j]);max[j]=Math.max(max[j],pos[i*3+j]);}}}
  const height=max[1]-min[1];if(height<1e-8)throw Error('模型高度为零；第一版需要Y轴向上的GLB。');
  let original=null;const material=doc.materials?.[p.material||0],texture=material?.pbrMetallicRoughness?.baseColorTexture;
  if(material?.alphaMode&&material.alphaMode!=='OPAQUE')throw Error('当前制作实心树干材质，暂不支持透明叶片/遮罩材质。');
  const transform=texture?.extensions?.KHR_texture_transform,coord=transform?.texCoord??texture?.texCoord??0,hasSourceColorUV=p.attributes['TEXCOORD_'+coord]!=null,sourceUV=hasSourceColorUV?read(p.attributes['TEXCOORD_'+coord]):uv.slice(),originalFactor=material?.pbrMetallicRoughness?.baseColorFactor?.slice(0,3)||[1,1,1];
  if(transform){const offset=transform.offset||[0,0],scale=transform.scale||[1,1],rotation=transform.rotation||0,c=Math.cos(rotation),s=Math.sin(rotation);for(let i=0;i<sourceUV.length;i+=2){const u=sourceUV[i]*scale[0],v=sourceUV[i+1]*scale[1];sourceUV[i]=offset[0]+c*u-s*v;sourceUV[i+1]=offset[1]+s*u+c*v;}}
  const originalSampler=doc.samplers?.[doc.textures?.[texture?.index]?.sampler]||{wrapS:10497,wrapT:10497};
  if(sourceUV.length!==uv.length||Array.from(sourceUV).some(v=>!Number.isFinite(v)))throw Error('原颜色贴图的UV无效。');
  if(!Array.isArray(originalFactor)||originalFactor.length!==3||originalFactor.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('原材质颜色因子无效。');
  for(const key of ['wrapS','wrapT'])if(originalSampler[key]!=null&&![10497,33071,33648].includes(originalSampler[key]))throw Error('原贴图采样方式无效。');
  if(texture){const im=doc.images[doc.textures[texture.index].source];if(im.bufferView!=null){const v=doc.bufferViews[im.bufferView];original=new Blob([bin.slice(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)],{type:im.mimeType});}}
  const extraAttributes={};for(const key of ['TEXCOORD_1','COLOR_0','_TML_SOURCE_COLOR_0'])if(p.attributes[key]!=null){const accessor=doc.accessors[p.attributes[key]],components={VEC2:2,VEC3:3,VEC4:4}[accessor.type],data=read(p.attributes[key]);if(data.length!==pos.length/3*components||(key==='TEXCOORD_1'?components!==2:![3,4].includes(components))||Array.from(data).some(v=>!Number.isFinite(v)))throw Error('额外顶点属性无效。');extraAttributes[key]={data,components};}
  const uvSHA256=await hashUV({uv,indices});
  const repairHistory=doc.extras?.treeMaterialLab?.geometryRepair,geometryRepairHistory=repairHistory?.version===1&&repairHistory.method==='remove-exact-zero-area-faces-v1'&&Number.isInteger(repairHistory.removedFaces)&&repairHistory.removedFaces>0&&/^[a-f0-9]{64}$/.test(repairHistory.originalSHA256||'')?repairHistory:null;
  return {pos,normal,uv,sourceUV,tangent,indices,min,max,height,name,original,originalFactor,originalSampler,geometryRepairHistory,requiresPairedMesh:requiresPairedMesh||!!normalRepair?.correctedVertices||!!geometryRepairHistory,...(normalRepair?{normalRepair}:{}),extraAttributes,sourceBytes:buffer.slice(0),hasSourceUV:p.attributes.TEXCOORD_0!=null,hasSourceColorUV,badUV:bad,ao:new Float32Array(pos.length/3).fill(1),sourceSHA256:await digest(buffer),uvSHA256,sourceUvSHA256:uvSHA256,sourceIndices:Uint32Array.from({length:pos.length/3},(_,i)=>i)};
}
