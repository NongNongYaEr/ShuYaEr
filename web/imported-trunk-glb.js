import * as THREE from './vendor/three.module.min.js';
import {trunkSurfaceTangents} from './trunk-surface-tangents.js';

const fail=message=>{throw Error('树干 GLB：'+message);};
const component={5120:[1,'getInt8'],5121:[1,'getUint8'],5122:[2,'getInt16'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
export function trunkBytesBase64(bytes){let result='';for(let i=0;i<bytes.length;i+=24576)result+=String.fromCharCode(...bytes.subarray(i,i+24576));return btoa(result);}
export async function trunkContentHash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}

// Independent static GLB reader: it retains original material channels instead
// of flattening the model into the single leaf atlas used by unit preparation.
export async function readImportedTrunkGlb(input,{name='树干.glb',maxBytes=256*1048576,maxTriangles=2000000,signal}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length>maxBytes)fail('文件超过当前 256 MB 制作预算');
 if(bytes.length<28)fail('文件头不完整');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length)fail('需要完整的 glTF 2.0 GLB');
 let json,bin;for(let offset=12;offset<bytes.length;){if(offset+8>bytes.length)fail('分块头越界');const size=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;if(size%4||offset+size>bytes.length)fail('分块长度无效');const data=bytes.subarray(offset,offset+size);if(type===0x4e4f534a){if(json)fail('重复 JSON 分块');try{json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data).replace(/[\u0000\s]+$/,''));}catch{fail('JSON 无法解析');}}else if(type===0x004e4942){if(bin)fail('重复二进制分块');bin=data;}offset+=size;}
 if(!json||!bin||json.asset?.version!=='2.0')fail('缺少模型数据');
 const extensions=new Set(['KHR_mesh_quantization','KHR_texture_transform','KHR_materials_unlit']);for(const ext of json.extensionsRequired||[])if(!extensions.has(ext))fail('暂不支持必需扩展 '+ext+'，请导出未压缩的静态 GLB');
 if(json.buffers?.length!==1||json.buffers[0].uri||json.buffers[0].byteLength>bin.length||bin.length-json.buffers[0].byteLength>3)fail('请把模型和贴图嵌入同一 GLB');
 const bv=index=>{const b=json.bufferViews?.[index];if(!b||b.buffer!==0||!Number.isSafeInteger(b.byteLength)||b.byteLength<0||!Number.isSafeInteger(b.byteOffset||0)||(b.byteOffset||0)<0||(b.byteOffset||0)+b.byteLength>json.buffers[0].byteLength)fail('bufferView 越界');return b;};
 const accessor=index=>{
  const a=json.accessors?.[index],layout=component[a?.componentType],size=widths[a?.type];if(!a||!layout||!size||!Number.isInteger(a.count)||a.count<1||a.count>6000000||a.sparse)fail('无效或暂不支持的稀疏 accessor');
  const b=bv(a.bufferView),stride=b.byteStride||layout[0]*size,start=a.byteOffset||0;if(stride<layout[0]*size||stride>252||start<0||!Number.isInteger(start)||start+(a.count-1)*stride+size*layout[0]>b.byteLength)fail('accessor 数据越界');
  const values=new Array(a.count*size),source=new DataView(bin.buffer,bin.byteOffset+(b.byteOffset||0),b.byteLength);
  for(let i=0;i<a.count;i++)for(let c=0;c<size;c++){let v=source[layout[1]](start+i*stride+c*layout[0],true);if(a.normalized&&a.componentType!==5126){const bits=layout[0]*8,signed=a.componentType===5120||a.componentType===5122;v=signed?Math.max(-1,v/(2**(bits-1)-1)):v/(2**bits-1);}if(!Number.isFinite(v))fail('顶点含非有限数');values[i*size+c]=v;}
  return {values,size,count:a.count,type:a.type,componentType:a.componentType};
 };
 const images=(json.images||[]).map(image=>{if(image.uri){if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image.uri))fail('贴图引用了外部文件');return {data:image.uri,name:image.name||''};}if(!['image/png','image/jpeg','image/webp'].includes(image.mimeType))fail('暂不支持的贴图格式 '+image.mimeType);const b=bv(image.bufferView),data=bin.subarray(b.byteOffset||0,(b.byteOffset||0)+b.byteLength);return {data:'data:'+image.mimeType+';base64,'+trunkBytesBase64(data),name:image.name||''};});
 const texture=info=>{if(!info)return null;const t=json.textures?.[info.index],image=images[t?.source];if(!image)fail('材质缺少对应贴图');const transform=info.extensions?.KHR_texture_transform||{},channel=transform.texCoord??info.texCoord??0;if(channel!==0)fail('材质使用了 UV'+channel+'，请先统一到 UV0');return {image:t.source,offset:transform.offset||[0,0],scale:transform.scale||[1,1],rotation:transform.rotation||0,sampler:json.samplers?.[t.sampler]||{}};};
 const materials=(json.materials||[]).map((m,i)=>{if(Object.keys(m.extensions||{}).some(e=>e!=='KHR_materials_unlit'))fail('材质 '+(m.name||i)+' 含未支持的扩展，请先烘焙为标准 PBR');const p=m.pbrMetallicRoughness||{},alpha=m.alphaMode||'OPAQUE';if(!['OPAQUE','MASK','BLEND'].includes(alpha))fail('透明模式无效');return {id:'M'+i,name:m.name||'材质 '+(i+1),color:p.baseColorFactor||[1,1,1,1],roughness:p.roughnessFactor??1,metalness:p.metallicFactor??1,baseColor:texture(p.baseColorTexture),normal:texture(m.normalTexture),normalScale:m.normalTexture?.scale??1,metallicRoughness:texture(p.metallicRoughnessTexture),occlusion:texture(m.occlusionTexture),occlusionStrength:m.occlusionTexture?.strength??1,emissive:texture(m.emissiveTexture),emissiveFactor:m.emissiveFactor||[0,0,0],alphaMode:alpha,alphaCutoff:m.alphaCutoff??.5,doubleSided:!!m.doubleSided,unlit:!!m.extensions?.KHR_materials_unlit};});
 const fallback=materials.length;materials.push({id:'M_default',name:'默认材质',color:[1,1,1,1],roughness:1,metalness:1,alphaMode:'OPAQUE',doubleSided:false});
 const primitives=[],warnings=[],nodes=json.nodes||[],visiting=new Set(),seen=new Set(),up=new THREE.Matrix4().makeRotationX(Math.PI/2);let triangles=0;
 const visit=(ni,parent)=>{if(signal?.aborted)throw new DOMException('已取消导入','AbortError');if(visiting.has(ni)||seen.has(ni))fail('节点层级有循环或重复父级');const node=nodes[ni];if(!node)fail('节点不存在');visiting.add(ni);seen.add(ni);if(node.skin!=null||node.weights?.some(v=>v))fail('请先把蒙皮或形态模型转换为静态制作副本');
  const local=node.matrix?new THREE.Matrix4().fromArray(node.matrix):new THREE.Matrix4().compose(new THREE.Vector3(...node.translation||[0,0,0]),new THREE.Quaternion(...node.rotation||[0,0,0,1]),new THREE.Vector3(...node.scale||[1,1,1]));const world=parent.clone().multiply(local),matrix=up.clone().multiply(world),det=matrix.determinant();if(!Number.isFinite(det)||Math.abs(det)<1e-12)fail('节点变换不可逆');
  if(node.mesh!=null){const mesh=json.meshes?.[node.mesh];if(!mesh)fail('缺少节点模型');for(const [pi,p]of mesh.primitives.entries()){
   if((p.mode??4)!==4)fail('请将模型三角化后再导入');if(p.extensions?.KHR_draco_mesh_compression||p.targets?.length)fail('请使用未压缩、无形态目标的静态模型');
   const pos=accessor(p.attributes.POSITION);if(pos.size!==3)fail('位置属性不是 VEC3');const g=new THREE.BufferGeometry();try{
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos.values,3));for(const [field,key,width]of [['NORMAL','normal',3],['TEXCOORD_0','uv',2],['TANGENT','tangent',4],['COLOR_0','color',null]])if(p.attributes[field]!=null){const a=accessor(p.attributes[field]);if(a.count!==pos.count||(width?a.size!==width:![3,4].includes(a.size)))fail('模型属性数量不一致');g.setAttribute(key,new THREE.Float32BufferAttribute(a.values,a.size));}
    if(!g.attributes.uv){warnings.push('网格 '+(node.name||ni)+' 无 UV，使用纯色材质；纹理材质需要补齐 UV');if(materials[p.material??fallback].baseColor||materials[p.material??fallback].normal||materials[p.material??fallback].metallicRoughness)fail('带贴图的网格缺少 UV0');g.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(pos.count*2).fill(0),2));}
    const ind=p.indices!=null?accessor(p.indices):null;if(ind&&(ind.size!==1||![5121,5123,5125].includes(ind.componentType)))fail('索引类型无效');const ids=ind?ind.values:Array.from({length:pos.count},(_,i)=>i);if(ids.length%3||ids.some(i=>!Number.isInteger(i)||i<0||i>=pos.count))fail('三角面索引无效');triangles+=ids.length/3;if(triangles>maxTriangles)fail('模型超过当前 200 万三角面制作预算');
    g.setIndex(ids);if(!g.attributes.normal)g.computeVertexNormals();g.applyMatrix4(matrix);if(det<0){const a=g.index.array;for(let i=0;i<a.length;i+=3)[a[i+1],a[i+2]]=[a[i+2],a[i+1]];if(g.attributes.tangent)for(let i=0;i<g.attributes.tangent.count;i++)g.attributes.tangent.setW(i,-g.attributes.tangent.getW(i));}if(!g.attributes.tangent)g.computeTangents();const tangents=trunkSurfaceTangents(g.attributes.normal.array,g.attributes.tangent.array);if(tangents!==g.attributes.tangent.array)g.setAttribute('tangent',new THREE.Float32BufferAttribute(tangents,4));g.computeBoundingBox();
    const material=p.material??fallback;if(!materials[material])fail('引用未知材质');const geometry={};for(const [key,a]of Object.entries(g.attributes))geometry[key]=Array.from(a.array);geometry.index=Array.from(g.index.array);
    primitives.push({id:'N'+ni+'_P'+pi,name:node.name||mesh.name||'网格 '+(primitives.length+1),material,geometry});
   }finally{g.dispose();}
  }}for(const child of node.children||[])visit(child,world);visiting.delete(ni);
 };
 const roots=json.scenes?.[json.scene??0]?.nodes;if(!roots?.length)fail('没有可用的场景根节点');for(const root of roots)visit(root,new THREE.Matrix4());if(!primitives.length)fail('模型中没有可用三角面');
 if(json.animations?.length)warnings.push('已读取静止模型，原动画仅随原始文件保留');
 const hash=await trunkContentHash(bytes);return {kind:'branchforge-trunk-model',version:1,id:'TRUNK_'+hash.slice(0,24),revision:1,name:name.replace(/\.glb$/i,''),source:{name,sha256:hash,bytes:bytes.length,glb_base64:trunkBytesBase64(bytes)},primitives,materials,images,warnings,triangles,calibration:{base:[0,0,0],tip:[0,0,1],front:[0,-1,0],scale:1},guides:[]};
}
