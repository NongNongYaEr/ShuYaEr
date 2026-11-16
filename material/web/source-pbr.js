import {digest,hashUV,multiplyNodeMatrices,nodeMatrix,repairInvalidNormals} from './model.js';
import {orthogonalTangent,uvTangents} from './source-pbr-atlas.js';
export {rasterSourcePbr} from './source-pbr-atlas.js';

const attributeSizes={POSITION:3,NORMAL:3,TANGENT:4,TEXCOORD_0:2,TEXCOORD_1:2,COLOR_0:[3,4],_TML_SOURCE_COLOR_0:[3,4]};
const dataTypes={5121:['getUint8',1,255],5123:['getUint16',2,65535],5125:['getUint32',4,4294967295],5126:['getFloat32',4,1]};
const typeSize={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const wraps=[10497,33071,33648],minFilters=[9728,9729,9984,9985,9986,9987];
const textureSlots=['baseColor','normal','metallicRoughness','occlusion','emissive'];
const isIndex=value=>Number.isSafeInteger(value)&&value>=0;
const factor=(v,min=0,max=1)=>Number.isFinite(v)&&v>=min&&v<=max;
const vector=(v,n,check=Number.isFinite)=>Array.isArray(v)&&v.length===n&&v.every(check);
const fail=message=>{throw Error(message);};

function readGlb(buffer){
  const header=new DataView(buffer);
  if(header.byteLength<20||header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||
     header.getUint32(8,true)!==header.byteLength)fail('请导入有效的 glTF 2.0 GLB。');
  let doc,bin;
  for(let offset=12;offset<header.byteLength;){
    if(offset+8>header.byteLength)fail('GLB 块不完整。');
    const length=header.getUint32(offset,true),type=header.getUint32(offset+4,true),end=offset+8+length;
    if(end>header.byteLength||length%4)fail('GLB 块长度无效。');
    const bytes=new Uint8Array(buffer,offset+8,length);
    if(type===0x4e4f534a){
      if(offset!==12)fail('GLB JSON 块位置无效。');
      doc=JSON.parse(new TextDecoder().decode(bytes).replace(/\0+$/,''));
    }
    if(type===0x004e4942){
      if(!doc||bin)fail('GLB 二进制块位置无效。');
      bin=bytes;
    }
    offset=end;
  }
  if(doc?.asset?.version!=='2.0'||!bin||!doc.buffers?.[0]||doc.buffers[0].uri||
     !isIndex(doc.buffers[0].byteLength)||doc.buffers[0].byteLength>bin.byteLength)fail('GLB 缺少内嵌的网格数据。');
  return {doc,bin};
}

function binaryReader(doc,bin){
  const data=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
  function view(index){
    const v=doc.bufferViews?.[index],offset=v?.byteOffset??0;
    if(!v||v.buffer!==0||v.extensions?.EXT_meshopt_compression||!isIndex(offset)||
       !isIndex(v.byteLength)||offset+v.byteLength>doc.buffers[0].byteLength)fail('请使用未压缩且完整的内嵌 GLB 数据。');
    return {...v,offset};
  }
  function accessor(index,components,kind){
    const a=doc.accessors?.[index],size=typeSize[a?.type],spec=dataTypes[a?.componentType];
    const allowed=kind==='INDEX'?[5121,5123,5125]:kind==='POSITION'||kind==='NORMAL'||kind==='TANGENT'?[5126]:[5121,5123,5126];
    if(!a||a.sparse||!spec||!allowed.includes(a.componentType)||!components.includes(size)||
       !isIndex(a.count)||a.count===0||a.count>6_000_000||
       (a.componentType!==5126&&kind!=='INDEX'&&!a.normalized)||
       ((kind==='INDEX'||a.componentType===5126)&&a.normalized))fail('GLB 的 '+kind+' 数据类型不受支持或无效。');
    const v=view(a.bufferView),[method,bytes,max]=spec,stride=v.byteStride??size*bytes,offset=a.byteOffset??0;
    if(!isIndex(offset)||!isIndex(stride)||stride<size*bytes||
       offset+(a.count-1)*stride+size*bytes>v.byteLength)fail('GLB 的 '+kind+' 数据越界。');
    const output=kind==='INDEX'?new Uint32Array(a.count):new Float32Array(a.count*size);
    for(let i=0;i<a.count;i++)for(let c=0;c<size;c++){
      const value=data[method](v.offset+offset+i*stride+c*bytes,true)/(a.normalized?max:1);
      if(!Number.isFinite(value))fail('GLB 的 '+kind+' 含无效数值。');
      output[i*size+c]=value;
    }
    return {output,count:a.count,size};
  }
  return {view,accessor};
}

function activePrimitives(doc){
  const active=[],seen=new Set();
  function mesh(nodeIndex,meshIndex,matrix){
    const primitives=doc.meshes?.[meshIndex]?.primitives;
    if(!Array.isArray(primitives))fail('GLB 节点引用了无效的网格。');
    primitives.forEach((primitive,primitiveIndex)=>active.push({nodeIndex,meshIndex,primitiveIndex,primitive,matrix}));
  }
  function visit(index,parent){
    const node=doc.nodes?.[index];
    if(!node||seen.has(index))fail('GLB 场景节点重复或层级无效。');
    seen.add(index);
    if(node.skin!=null)fail('保留原材质模式需要静态 GLB。');
    const local=nodeMatrix(node);
    if(!vector(local,16)||local[3]!==0||local[7]!==0||local[11]!==0||local[15]!==1)fail('GLB 节点变换无效。');
    const matrix=multiplyNodeMatrices(parent,local);
    if(node.mesh!=null)mesh(index,node.mesh,matrix);
    for(const child of node.children??[])visit(child,matrix);
  }
  if(doc.scenes?.length){
    const scene=doc.scenes[doc.scene??0];
    if(!scene)fail('GLB 默认场景不存在。');
    for(const root of scene.nodes??[])visit(root,identity);
  }else if(doc.nodes?.length){
    const children=new Set(doc.nodes.flatMap(node=>node.children??[]));
    doc.nodes.forEach((_,index)=>{if(!children.has(index))visit(index,identity);});
  }else{
    doc.meshes?.forEach((_,index)=>mesh(null,index,identity));
  }
  if(!active.length)fail('GLB 场景没有可用的网格。');
  return active;
}

function readPrimitive(entry,{accessor},{allowGeometryRepair}){
  const {primitive,matrix}=entry;
  if(!primitive.attributes||primitive.attributes.POSITION==null||(primitive.mode??4)!==4||
     primitive.extensions?.KHR_draco_mesh_compression||primitive.targets?.length)fail('请导入未压缩、不含形态键的静态三角网格。');
  const attributes={};
  for(const [key,index] of Object.entries(primitive.attributes)){
    if(!(key in attributeSizes))fail('保留原材质暂不支持顶点属性 '+key+'。');
    attributes[key]=accessor(index,[attributeSizes[key]].flat(),key);
  }
  const {output:pos,count}=attributes.POSITION;
  if(Object.values(attributes).some(a=>a.count!==count))fail('GLB 顶点属性数量不一致。');
  const indices=primitive.indices==null?Uint32Array.from({length:count},(_,i)=>i):accessor(primitive.indices,[1],'INDEX').output;
  if(!indices.length||indices.length%3||indices.some(i=>i>=count))fail('GLB 三角形索引无效。');
  const uv=attributes.TEXCOORD_0?.output??new Float32Array(count*2);
  const normal=attributes.NORMAL?.output??new Float32Array(count*3),tangent=attributes.TANGENT?.output;
  const [a,d,g,,b,e,h,,c,f,i,,tx,ty,tz]=matrix;
  const cofactor=[e*i-f*h,f*g-d*i,d*h-e*g,c*h-b*i,a*i-c*g,b*g-a*h,b*f-c*e,c*d-a*f,a*e-b*d];
  const determinant=a*cofactor[0]+d*cofactor[3]+g*cofactor[6],sign=Math.sign(determinant);
  const reference=Math.max(Math.hypot(a,d,g),Math.hypot(b,e,h),Math.hypot(c,f,i));
  if(!Number.isFinite(determinant)||Math.abs(determinant)<=reference**3*1e-12)fail('GLB 节点缩放导致表面退化。');
  const inverseNormalScale=sign/reference**2;
  if(sign<0)for(let at=0;at<indices.length;at+=3)[indices[at+1],indices[at+2]]=[indices[at+2],indices[at+1]];
  for(let j=0;j<pos.length;j+=3){
    const x=pos[j],y=pos[j+1],z=pos[j+2];
    pos[j]=a*x+b*y+c*z+tx;
    pos[j+1]=d*x+e*y+f*z+ty;
    pos[j+2]=g*x+h*y+i*z+tz;
    const nx=normal[j],ny=normal[j+1],nz=normal[j+2];
    for(let k=0;k<3;k++)normal[j+k]=inverseNormalScale*(cofactor[3*k]*nx+cofactor[3*k+1]*ny+cofactor[3*k+2]*nz);
  }
  if(pos.some(v=>!Number.isFinite(v)))fail('GLB 节点变换产生无效坐标。');
  repairInvalidNormals(pos,normal,indices,{allowGeometryRepair});
  for(let j=0;j<normal.length;j+=3){
    const length=Math.hypot(normal[j],normal[j+1],normal[j+2]);
    for(let k=0;k<3;k++)normal[j+k]/=length;
  }
  if(tangent)for(let j=0;j<count;j++){
    const at=j*4,x=tangent[at],y=tangent[at+1],z=tangent[at+2],w=tangent[at+3];
    if(Math.abs(Math.abs(w)-1)>1e-5)fail('GLB 切线方向无效。');
    const t=orthogonalTangent(normal[j*3],normal[j*3+1],normal[j*3+2],a*x+b*y+c*z,d*x+e*y+f*z,g*x+h*y+i*z);
    tangent.set(t,at);
    tangent[at+3]=w*sign;
  }
  const colors=attributes.COLOR_0,archivedColors=attributes._TML_SOURCE_COLOR_0;
  if(colors?.output.some(v=>!factor(v))||archivedColors?.output.some(v=>!factor(v)))fail('GLB 顶点颜色超出有效范围。');
  return {pos,uv,normal,indices,tangent,uv1:attributes.TEXCOORD_1?.output,colors,archivedColors,hasUV0:!!attributes.TEXCOORD_0};
}

function sourceMaterials(doc,bin,reader,entries){
  const images={},materials=[];
  function image(index){
    if(!isIndex(index))fail('GLB 材质引用了无效的贴图。');
    if(images[index])return;
    const record=doc.images?.[index];
    if(!record||record.bufferView==null||record.uri||!['image/png','image/jpeg'].includes(record.mimeType))
      fail('原材质贴图需是 GLB 内嵌的 PNG 或 JPEG。');
    const v=reader.view(record.bufferView);
    images[index]=new Blob([bin.subarray(v.offset,v.offset+v.byteLength)],{type:record.mimeType});
  }
  function texture(info){
    if(info==null)return null;
    if(!isIndex(info.index))fail('GLB 材质引用了无效的贴图。');
    const source=doc.textures?.[info.index],sampler=source?.sampler==null?{}:doc.samplers?.[source.sampler];
    const transform=info.extensions?.KHR_texture_transform??{},texCoord=transform.texCoord??info.texCoord??0;
    const offset=transform.offset??[0,0],scale=transform.scale??[1,1],rotation=transform.rotation??0;
    if(!source||!sampler||![0,1].includes(texCoord)||!vector(offset,2)||!vector(scale,2)||!Number.isFinite(rotation)||
       Object.keys(info.extensions??{}).some(name=>name!=='KHR_texture_transform'))fail('原材质贴图 UV 或变换不受支持。');
    const {wrapS=10497,wrapT=10497,minFilter=9987,magFilter=9729}=sampler;
    if(!wraps.includes(wrapS)||!wraps.includes(wrapT)||!minFilters.includes(minFilter)||![9728,9729].includes(magFilter))
      fail('原材质贴图采样方式无效。');
    image(source.source);
    return {imageIndex:source.source,texCoord,offset,scale,rotation,wrapS,wrapT,minFilter,magFilter};
  }
  for(const index of new Set(entries.map(entry=>entry.primitive.material??-1))){
    if(index!==-1&&!isIndex(index))fail('GLB 网格引用了无效的材质槽。');
    const material=index===-1?{}:doc.materials?.[index],pbr=material?.pbrMetallicRoughness??{};
    if(!material||(material.alphaMode??'OPAQUE')!=='OPAQUE'||
       Object.keys(material.extensions??{}).some(name=>name!=='KHR_materials_emissive_strength'))
      fail('保留原材质模式目前支持标准不透明 PBR 材质。');
    const baseColorFactor=pbr.baseColorFactor??[1,1,1,1],roughnessFactor=pbr.roughnessFactor??1,metallicFactor=pbr.metallicFactor??1;
    const normalScale=material.normalTexture?.scale??1,occlusionStrength=material.occlusionTexture?.strength??1;
    const emissiveFactor=material.emissiveFactor??[0,0,0],emissiveStrength=material.extensions?.KHR_materials_emissive_strength?.emissiveStrength??1;
    if(!vector(baseColorFactor,4,v=>factor(v))||!factor(roughnessFactor)||!factor(metallicFactor)||
       !factor(occlusionStrength)||!Number.isFinite(normalScale)||!vector(emissiveFactor,3,v=>factor(v))||
       !factor(emissiveStrength,0,Number.MAX_VALUE))
      fail('GLB 材质通道因子无效。');
    const textures={baseColor:texture(pbr.baseColorTexture),normal:texture(material.normalTexture),
      metallicRoughness:texture(pbr.metallicRoughnessTexture),occlusion:texture(material.occlusionTexture),
      emissive:texture(material.emissiveTexture)};
    materials.push({index,name:material.name||(index===-1?'默认材质':'材质 '+(index+1)),
      doubleSided:!!material.doubleSided,hasEmissive:emissiveStrength>0&&emissiveFactor.some(v=>v>0),emissiveFactor,emissiveStrength,
      baseColorFactor,roughnessFactor,metallicFactor,normalScale,occlusionStrength,textures});
  }
  return {materials,images};
}

export async function parseSourcePbrGLB(buffer,name,{allowGeometryRepair=false}={}){
  const {doc,bin}=readGlb(buffer);
  if(doc.animations?.length||doc.skins?.length)fail('保留原材质模式需要不含动画和骨骼的静态 GLB。');
  if((doc.extensionsRequired??[]).some(ext=>!['KHR_texture_transform','KHR_materials_emissive_strength'].includes(ext)))
    fail('GLB 包含尚不支持的必需扩展。');
  const reader=binaryReader(doc,bin),active=activePrimitives(doc);
  const {materials,images}=sourceMaterials(doc,bin,reader,active);
  const bySlot=new Map(materials.map(material=>[material.index,material]));
  const records=[];
  let vertices=0,indexCount=0;
  for(const entry of active){
    const data=readPrimitive(entry,reader,{allowGeometryRepair}),vertexCount=data.pos.length/3,materialIndex=entry.primitive.material??-1;
    const material=bySlot.get(materialIndex),{textures}=material;
    for(const slot of textureSlots){
      const coord=textures[slot]?.texCoord;
      if(coord===0&&!data.hasUV0||coord===1&&!data.uv1)fail('材质「'+material.name+'」缺少 '+slot+' 贴图所需的 TEXCOORD_'+coord+'。');
    }
    const {nodeIndex,meshIndex,primitiveIndex,primitive}=entry;
    records.push({data,nodeIndex,meshIndex,primitiveIndex,materialIndex,firstIndex:indexCount,indexCount:data.indices.length,
      firstVertex:vertices,vertexCount,id:primitive.extras?.branchforgeSourcePrimitiveId,
      hasUV0:data.hasUV0,hasUV1:!!data.uv1,hasTangents:!!data.tangent,hasColors:!!data.colors});
    vertices+=vertexCount;
    indexCount+=data.indices.length;
    if(vertices>2_000_000||indexCount>6_000_000)fail('GLB 超出保留原材质模式的几何预算。');
  }
  const pos=new Float32Array(vertices*3),normal=new Float32Array(pos.length),uv=new Float32Array(vertices*2);
  const indices=new Uint32Array(indexCount),tangent=new Float32Array(vertices*4),extraAttributes={};
  if(records.some(p=>p.hasUV1))extraAttributes.TEXCOORD_1={components:2,data:new Float32Array(vertices*2)};
  if(records.some(p=>p.hasColors))extraAttributes.COLOR_0={components:4,data:new Float32Array(vertices*4).fill(1)};
  if(records.some(p=>p.data.archivedColors))extraAttributes._TML_SOURCE_COLOR_0={components:4,data:new Float32Array(vertices*4).fill(1)};
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  let badUV=0;
  for(const record of records){
    const {data,firstVertex,firstIndex,vertexCount}=record;
    pos.set(data.pos,firstVertex*3);
    normal.set(data.normal,firstVertex*3);
    uv.set(data.uv,firstVertex*2);
    tangent.set(data.tangent??uvTangents(data.pos,data.normal,data.uv,data.indices).vertex,firstVertex*4);
    if(data.uv1)extraAttributes.TEXCOORD_1.data.set(data.uv1,firstVertex*2);
    for(const [key,colors] of [['COLOR_0',data.colors],['_TML_SOURCE_COLOR_0',data.archivedColors]]){
      if(colors)for(let v=0;v<vertexCount;v++)for(let c=0;c<colors.size;c++)
        extraAttributes[key].data[(firstVertex+v)*4+c]=colors.output[v*colors.size+c];
    }
    for(let i=0;i<data.indices.length;i++){
      const vertex=data.indices[i];
      indices[firstIndex+i]=firstVertex+vertex;
      for(let c=0;c<3;c++){
        const value=data.pos[vertex*3+c];
        min[c]=Math.min(min[c],value);
        max[c]=Math.max(max[c],value);
      }
    }
    for(let i=0;i<data.indices.length;i+=3){
      const a=data.indices[i]*2,b=data.indices[i+1]*2,c=data.indices[i+2]*2;
      const area=(data.uv[b]-data.uv[a])*(data.uv[c+1]-data.uv[a+1])-(data.uv[b+1]-data.uv[a+1])*(data.uv[c]-data.uv[a]);
      if(Math.abs(area)<1e-14)badUV++;
    }
  }
  const height=max[1]-min[1];
  if(height<1e-8)fail('模型高度为零，需要 Y 轴向上的 GLB。');
  const primitives=records.map(({data,...record})=>record);
  const faceGroups=primitives.length>1?new Uint32Array(indices.length/3):null;
  if(faceGroups)primitives.forEach((p,index)=>faceGroups.fill(index,p.firstIndex/3,(p.firstIndex+p.indexCount)/3));
  const uvSHA256=await hashUV({uv,indices});
  return {pos,normal,uv,tangent,indices,min,max,height,name,original:null,originalFactor:[1,1,1],
    originalSampler:{wrapS:10497,wrapT:10497},sourceUV:uv.slice(),hasSourceUV:primitives.every(p=>p.hasUV0),
    hasSourceColorUV:materials.some(m=>m.textures.baseColor),badUV,extraAttributes,requiresPairedMesh:true,
    sourceBytes:buffer.slice(0),sourceSHA256:await digest(buffer),uvSHA256,sourceUvSHA256:uvSHA256,
    sourceIndices:Uint32Array.from({length:vertices},(_,i)=>i),ao:new Float32Array(vertices).fill(1),faceGroups,
    sourcePbr:{doc,primitives,materials,images}};
}
