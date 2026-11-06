import {readTrunkGlbData} from './imported-trunk-glb.js';

export const UDIM_MAX_BYTES=150_000_000;
const channels=['BaseColor','Normal','ORM'];
const allowedAttributes=new Set(['POSITION','NORMAL','TANGENT','TEXCOORD_0','COLOR_0']);
const fail=message=>{throw Error('UDIM 导入：'+message);};
const pad4=n=>Math.ceil(n/4)*4;
const epsilon=1e-6;

function tileFiles(files){
 const byTile=new Map(),usedChannels=new Set();
 for(const file of files){
  const match=/^(?:(?:.*[._ -])?(BaseColor|Albedo|Diffuse|NormalGL|Normal|ORM)[._ -])?(1\d{3})\.(png|jpe?g)$/i.exec(file.name);
  if(!match)fail('请用 树皮_BaseColor.1001.png、树皮_Normal.1001.png 或 树皮_ORM.1001.png 命名贴图：'+file.name);
  const number=Number(match[2]);
  if(number<1001)fail('瓦片编号从 1001 开始。');
  const role=match[1]?.toLowerCase()||'basecolor';
  const channel=role==='orm'?'ORM':role.startsWith('normal')?'Normal':'BaseColor';
  const maps=byTile.get(number)||{};
  if(maps[channel])fail(number+' 有多张 '+channel+' 贴图，请仅选择一套。');
  maps[channel]={file,mime:match[3].toLowerCase()==='png'?'image/png':'image/jpeg'};
  usedChannels.add(channel);
  byTile.set(number,maps);
 }
 if(!byTile.size||byTile.size>64)fail('请选择 1–64 个瓦片的贴图。');
 return {byTile,usedChannels};
}

function splitFaces(indices,uv,negativeRows){
 const groups=new Map();
 for(let i=0;i<indices.length;i+=3){
  const corners=indices.slice(i,i+3);
  const us=corners.map(index=>uv[index*2]),vs=corners.map(index=>uv[index*2+1]);
  const loU=Math.min(...us),hiU=Math.max(...us),loV=Math.min(...vs),hiV=Math.max(...vs);
  const u=Math.floor((loU+hiU)/2),v=Math.floor((loV+hiV)/2),row=negativeRows?-v:v;
  if(loU<u-epsilon||hiU>u+1+epsilon||loV<v-epsilon||hiV>v+1+epsilon)
   fail('第 '+(i/3+1)+' 个三角面跨越瓦片，请先沿 UV 瓦片边界切开。');
  if(u<0||u>9||row<0||1001+u+10*row>1999)fail('UV0 落在支持的 UDIM 瓦片范围以外。');
  const tile=1001+u+10*row;
  let group=groups.get(tile);
  if(!group){group={tile,u,v,indices:[]};groups.set(tile,group);}
  group.indices.push(...corners);
 }
 return groups.values();
}

// Turn tile assignments into ordinary embedded glTF materials. Each triangle
// keeps its original winding and gets its tile-local UV, with no resampling.
export async function buildUdimTrunkGlb(input,files){
 if(files.length>192||input.byteLength+files.reduce((sum,file)=>sum+file.size,0)>UDIM_MAX_BYTES)fail('GLB 与贴图合计须在 150 MB 以内。');
 const {byTile,usedChannels}=tileFiles(files);
 const {json,accessor}=readTrunkGlbData(input,{maxBytes:UDIM_MAX_BYTES});
 if(json.animations?.length||json.skins?.length)fail('请使用静态 GLB。');

 let sourceMaterial,vertexCount=0,faceCount=0,minV=0,maxV=1;
 const sources=json.meshes?.map(mesh=>mesh.primitives.map(primitive=>{
  if((primitive.mode??4)!==4||primitive.targets?.length||primitive.extensions)fail('请使用未压缩、无形态键的三角网格。');
  if(sourceMaterial===undefined)sourceMaterial=primitive.material??null;
  if(sourceMaterial!==(primitive.material??null))fail('此入口一次处理一套 UDIM 材质。多套材质请先在建模软件中导出为多材质 GLB。');
  const attributes={};
  for(const [key,id] of Object.entries(primitive.attributes||{})){
   if(!allowedAttributes.has(key))fail('此入口暂不支持顶点属性 '+key+'。');
   attributes[key]=accessor(id);
  }
  const position=attributes.POSITION,uv=attributes.TEXCOORD_0;
  if(position?.size!==3||uv?.size!==2||Object.values(attributes).some(value=>value.count!==position.count))fail('需要有效的位置和 UV0。');
  vertexCount+=position.count;
  const index=primitive.indices==null?null:accessor(primitive.indices);
  if(index&&(index.size!==1||![5121,5123,5125].includes(index.componentType)))fail('索引类型无效。');
  const ids=index?.values||Array.from({length:position.count},(_,i)=>i);
  if(!ids.length||ids.length%3||ids.some(id=>!Number.isInteger(id)||id<0||id>=position.count))fail('三角面索引无效。');
  faceCount+=ids.length/3;
  if(vertexCount>2_000_000||faceCount>2_000_000)fail('网格超过 200 万顶点或三角面。');
  for(const i of ids){minV=Math.min(minV,uv.values[i*2+1]);maxV=Math.max(maxV,uv.values[i*2+1]);}
  return {attributes,ids};
 }));
 if(!faceCount)fail('找不到可用的网格。');
 if(minV<-epsilon&&maxV>1+epsilon)fail('UV0 同时跨过 V 的上下边界，无法确定瓦片行方向。');

 const originalMaterial=json.materials?.[sourceMaterial]||{};
 if(originalMaterial.emissiveTexture)fail('当前入口支持颜色、法线和 ORM，含发光贴图请先导出为多材质 GLB。');
 const segments=[],bufferViews=[],accessors=[],materials=[],images=[],textures=[],materialByTile=new Map();
 let dataLength=0;
 function append(data){
  const padded=pad4(data.byteLength);
  if(dataLength+padded>UDIM_MAX_BYTES)fail('转换后的内嵌 GLB 超过 150 MB。');
  const index=bufferViews.length;
  bufferViews.push({buffer:0,byteOffset:dataLength,byteLength:data.byteLength});
  segments.push(data,new Uint8Array(padded-data.byteLength));
  dataLength+=padded;
  return index;
 }
 function attr(data,type,size,componentType,position=false){
  const result={bufferView:append(data),componentType,type,count:data.length/size};
  if(position){
   result.min=[Infinity,Infinity,Infinity];result.max=[-Infinity,-Infinity,-Infinity];
   for(let i=0;i<data.length;i++){const axis=i%3;result.min[axis]=Math.min(result.min[axis],data[i]);result.max[axis]=Math.max(result.max[axis],data[i]);}
  }
  accessors.push(result);
  return accessors.length-1;
 }
 async function tileMaterial(tile){
  if(materialByTile.has(tile))return materialByTile.get(tile);
  const maps=byTile.get(tile);
  if(!maps?.BaseColor)fail('缺少 '+tile+' 的 BaseColor 贴图。');
  const material={...originalMaterial,name:'UDIM '+tile,pbrMetallicRoughness:{...originalMaterial.pbrMetallicRoughness}};
  delete material.normalTexture;
  delete material.occlusionTexture;
  delete material.pbrMetallicRoughness.metallicRoughnessTexture;
  for(const channel of channels){
   if(channel!=='BaseColor'&&!usedChannels.has(channel))continue;
   const map=maps[channel];
   if(!map)fail('缺少 '+tile+' 的 '+channel+' 贴图。');
   const bufferView=append(new Uint8Array(await map.file.arrayBuffer()));
   const info={index:textures.length};
   textures.push({source:images.length,sampler:0});
   images.push({bufferView,mimeType:map.mime,name:map.file.name});
   const pbr=material.pbrMetallicRoughness;
   if(channel==='BaseColor'){pbr.baseColorTexture=info;pbr.baseColorFactor=[1,1,1,1];}
   if(channel==='Normal')material.normalTexture=info;
   if(channel==='ORM'){
    pbr.metallicRoughnessTexture=info;pbr.metallicFactor=1;pbr.roughnessFactor=1;material.occlusionTexture={...info};
   }
  }
  const pbr=material.pbrMetallicRoughness;
  pbr.metallicFactor??=0;pbr.roughnessFactor??=1;
  const id=materials.length;
  materialByTile.set(tile,id);materials.push(material);
  return id;
 }

 const meshes=[];
 let primitiveCount=0;
 for(const [meshIndex,source] of sources.entries()){
  const primitives=[];
  for(const {attributes,ids} of source){
   for(const group of splitFaces(ids,attributes.TEXCOORD_0.values,minV<-epsilon)){
    if(++primitiveCount>2048)fail('转换后的网格分段超过 2048 个。');
    const seen=new Map(),vertices=[],indices=new Uint32Array(group.indices.length);
    for(let i=0;i<indices.length;i++){
     const index=group.indices[i];
     if(!seen.has(index)){seen.set(index,vertices.length);vertices.push(index);}
     indices[i]=seen.get(index);
    }
    const out={};
    for(const [key,{values,type,size}] of Object.entries(attributes)){
     const data=new Float32Array(vertices.length*size);
     for(let i=0;i<vertices.length;i++)for(let c=0;c<size;c++){
      let value=values[vertices[i]*size+c];
      if(key==='TEXCOORD_0')value=Math.max(0,Math.min(1,value-(c===0?group.u:group.v)));
      data[i*size+c]=value;
     }
     out[key]=attr(data,type,size,5126,key==='POSITION');
    }
    primitives.push({attributes:out,indices:attr(indices,'SCALAR',1,5125),material:await tileMaterial(group.tile)});
   }
  }
  meshes.push({name:json.meshes[meshIndex].name,primitives});
 }
 const tiles=[...materialByTile.keys()].sort((a,b)=>a-b);
 const extensionNames=Object.keys(originalMaterial.extensions||{});
 const document={asset:{version:'2.0',generator:'树鸭儿 UDIM 导入'},scene:json.scene??0,scenes:json.scenes,nodes:json.nodes,meshes,
  buffers:[{byteLength:dataLength}],bufferViews,accessors,materials,images,textures,samplers:[{wrapS:33071,wrapT:33071}],
  extensionsUsed:extensionNames,extras:{branchforgeUdim:{version:1,tiles}}};
 const text=new TextEncoder().encode(JSON.stringify(document)),jsonBytes=new Uint8Array(pad4(text.length)).fill(32);
 jsonBytes.set(text);
 const total=28+jsonBytes.length+dataLength;
 if(total>UDIM_MAX_BYTES)fail('转换后的内嵌 GLB 超过 150 MB。');
 const header=new Uint32Array([0x46546c67,2,total,jsonBytes.length,0x4e4f534a]);
 const binaryHeader=new Uint32Array([dataLength,0x004e4942]);
 return new Blob([header,jsonBytes,binaryHeader,...segments],{type:'model/gltf-binary'}).arrayBuffer();
}
