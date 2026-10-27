import {createNativeTransformRetention} from './native-transform-retention.js';
import {createNativeMaterialEncoder} from './native-material-cache.js';
import {createNativeModelCache} from './native-model-cache.js';
import {nativePreviewGeometrySource} from './native-preview-geometry.js';
import {retainNativeDraw,createNativeSceneRetention,encodeRetainedNativeScene,nativeBindingDelta,nativeDrawDelta,nativeSceneDelta,createRetainedNativeMaterialTable} from './native-scene-retention.js';
import * as THREE from './vendor/three.module.min.js';
import {createNativeTransportSession} from './native-transport-session.js';

// Ephemeral presentation transport. Never modifies source attributes, instances,
// saved authoring, export fields, selection or CPU picking.
export function packNativePacket(metadata,parts=[],sceneBytes=null){
  const encoder=new TextEncoder();let header,offset;
  for(let pass=0;pass<8;pass++){
    if(sceneBytes&&metadata.scene){
      const {scene,...other}=metadata,prefix=encoder.encode(JSON.stringify(other).slice(0,-1)+',"scene":');
      header=new Uint8Array(prefix.length+sceneBytes.length+1);header.set(prefix);header.set(sceneBytes,prefix.length);header[header.length-1]=125;
    }else header=encoder.encode(JSON.stringify(metadata));
    offset=(4+header.length+3)&~3;
    let cursor=offset,changed=false;for(const {spec,bytes} of parts){if(spec.offset!==cursor||spec.bytes!==bytes.byteLength)changed=true;spec.offset=cursor;spec.bytes=bytes.byteLength;cursor=(cursor+bytes.byteLength+3)&~3;}
    if(!changed){const packet=new Uint8Array(cursor);new DataView(packet.buffer).setUint32(0,header.length,true);packet.set(header,4);for(const {spec,bytes} of parts)packet.set(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),spec.offset);return packet;}
  }
  throw Error('Native packet header did not converge');
}
// Recover resource sections from the immutable encoded snapshot, never from
// source arrays which may already contain a later edit. Header offsets are
// independent copies so a fresh camera/scene can share these resource bytes.
export function nativeRetryResources(metadata,packet){
  return (metadata.resources||[]).map(previous=>{
    const resource={...previous},parts=[];
    for(const key of previous.type==='geometry'?['vertices','indices']:['data']){
      const source=previous[key],spec={...source};resource[key]=spec;
      parts.push({spec,bytes:new Uint8Array(packet.buffer,packet.byteOffset+source.offset,source.bytes)});
    }
    return {resource,parts};
  });
}
export function nativeGeometry(geometry){
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv'),color=geometry.getAttribute('color'),center=geometry.getAttribute('sampleCenter'),tangent=geometry.getAttribute('sampleTangent');
  const vertices=new Float32Array(p.count*18);
  for(let i=0;i<p.count;i++){const at=i*18;vertices[at]=p.getX(i);vertices[at+1]=p.getY(i);vertices[at+2]=p.getZ(i);vertices[at+3]=n?.getX(i)??0;vertices[at+4]=n?.getY(i)??0;vertices[at+5]=n?.getZ(i)??1;vertices[at+6]=uv?.getX(i)??0;vertices[at+7]=uv?.getY(i)??0;vertices[at+8]=color?.getX(i)??1;vertices[at+9]=color?.getY(i)??1;vertices[at+10]=color?.getZ(i)??1;vertices[at+11]=color?.itemSize===4?color.getW(i):1;vertices[at+12]=center?.getX(i)??0;vertices[at+13]=center?.getY(i)??0;vertices[at+14]=center?.getZ(i)??0;vertices[at+15]=tangent?.getX(i)??0;vertices[at+16]=tangent?.getY(i)??0;vertices[at+17]=tangent?.getZ(i)??1;}
  const indices=geometry.index?Uint32Array.from(geometry.index.array):Uint32Array.from({length:p.count},(_,i)=>i);
  return {vertices,indices};
}
// Convert line strips only in the presentation packet. CPU picking and saved
// source geometry continue to use their original topology and draw range.
export function nativeLineIndices(geometry,loop=false){
  const source=geometry.index?.array||Uint32Array.from({length:geometry.attributes.position.count},(_,i)=>i),start=Math.max(0,geometry.drawRange.start),end=Math.min(source.length,start+geometry.drawRange.count),indices=[];
  for(let i=start+1;i<end;i++)indices.push(source[i-1],source[i]);
  if(loop&&end-start>1)indices.push(source[end-1],source[start]);
  return Uint32Array.from(indices);
}
// Empty helpers and zero-count instance batches are normal editing states.
// Decide what can draw before allocating or queuing any native resources.
export function nativeDrawRanges(object){
  const geometry=object.geometry;
  if(!geometry?.attributes.position?.count||object.isInstancedMesh&&object.count===0)return [];
  const total=geometry.index?.count??geometry.attributes.position.count,range=geometry.drawRange,groups=geometry.groups,materials=object.material,strip=object.isLine&&!object.isLineSegments,result=[];
  for(let gi=0;gi<Math.max(1,groups.length);gi++){
    const group=groups[gi],groupStart=group?.start??0,material=Array.isArray(materials)?materials[group?.materialIndex??0]:materials;
    if(!material?.visible)continue;
    const start=strip?0:Math.max(groupStart,range.start),end=strip?(Math.min(total,range.start+range.count)-range.start>1?(Math.min(total,range.start+range.count)-range.start-1+(object.isLineLoop?1:0))*2:0):Math.min(groupStart+(group?.count??total),range.start+range.count,total);
    if(end>start)result.push({groupStart,material,start,count:end-start});
  }
  return result;
}
const identity=new THREE.Matrix4(),toD3D=new THREE.Matrix4().set(1,0,0,0,0,1,0,0,0,0,.5,.5,0,0,0,1);
const attributeNames=['position','normal','uv','color','sampleCenter','sampleTangent'];
const bufferIdentities=new WeakMap(),attributeRevisions=new WeakMap();let nextBufferIdentity=0;
const bufferIdentity=value=>{if(!value)return 0;if(!bufferIdentities.has(value))bufferIdentities.set(value,++nextBufferIdentity);return bufferIdentities.get(value);};
export function nativeAttributeVersion(attribute){if(!attribute)return '';const storage=attribute.data||attribute,array=storage.array,old=attributeRevisions.get(attribute);if(old&&old.storage===storage&&old.array===array&&old.version===storage.version&&old.stride===storage.stride&&old.itemSize===attribute.itemSize&&old.count===attribute.count&&old.normalized===attribute.normalized&&old.offset===(attribute.offset||0))return old.key;const key=[bufferIdentity(attribute),bufferIdentity(array),storage.version,attribute.itemSize,attribute.count,attribute.normalized,attribute.offset||0,storage.stride||0].join(':');attributeRevisions.set(attribute,{storage,array,version:storage.version,stride:storage.stride,itemSize:attribute.itemSize,count:attribute.count,normalized:attribute.normalized,offset:attribute.offset||0,key});return key;}

// Include a coherent scene with its resources in the same submission. A helper
// that changes every camera frame must never keep the camera behind the queue.
export function planNativeResourceBatch(pending,capacity,scene,sceneBytes=null){
  const encoder=new TextEncoder(),sceneReserve=(sceneBytes?.byteLength??encoder.encode(JSON.stringify(scene)).byteLength)+2048;
  let remaining=capacity-sceneReserve,sceneFits=true;const selected=[],parts=[];
  for(const item of pending){const cost=item.parts.reduce((n,p)=>n+Math.ceil(p.bytes.byteLength/4)*4+256,0)+encoder.encode(JSON.stringify(item.resource)).byteLength+64;if(cost>remaining)break;remaining-=cost;selected.push(item);parts.push(...item.parts);}
  if(!selected.length&&pending.length){sceneFits=false;const item=pending[0],cost=item.parts.reduce((n,p)=>n+Math.ceil(p.bytes.byteLength/4)*4+256,0)+encoder.encode(JSON.stringify(item.resource)).byteLength+2048;if(cost>capacity)throw Error('场景资源超过当前原生传输容量');selected.push(item);parts.push(...item.parts);}
  return {selected,parts,complete:sceneFits&&selected.length===pending.length&&remaining>=0};
}
const rgba=(color,scale=1,alpha=1)=>[color.r*scale,color.g*scale,color.b*scale,alpha];
// Private viewport protocol; the saved project and UE/PVE material schema are
// untouched. Repeated draw records reference one immutable per-scene palette.
export function createNativeMaterialTable(){
  const materials=[],indices=new Map(),objects=new Map();
  return {materials,intern(object,encode){if(objects.has(object))return objects.get(object);const record=encode(object),signature=JSON.stringify(record);let index=indices.get(signature);if(index===undefined){index=materials.length;materials.push(record);indices.set(signature,index);}objects.set(object,index);return index;}};
}
function supported(object){const materials=Array.isArray(object.material)?object.material:[object.material];return (object.isMesh||object.isLine)&&object.geometry?.attributes.position&&!object.isSkinnedMesh&&!object.geometry.morphAttributes.position?.length&&materials.every(m=>m&&m.depthTest!==false&&!m.isShaderMaterial&&!m.isRawShaderMaterial);}
export function nativeMaterialUnsupported(material){
  if(material.isShaderMaterial||material.isRawShaderMaterial)return '自定义着色器';
  if(material.displacementMap||material.alphaMap||material.emissiveMap||material.aoMap||material.lightMap||material.envMap||material.metalnessMap&&material.metalness>0)return '扩展材质贴图';
  if(material.clearcoat>0||material.transmission>0||material.sheen>0||material.iridescence>0||material.anisotropy>0)return '扩展物理材质';
  if(material.clippingPlanes?.length||material.stencilWrite)return '材质裁切';
  if([material.map,material.normalMap,material.roughnessMap].some(t=>t&&t.channel!==0))return '额外 UV 通道';
  if(material.normalMap&&material.normalMapType!==THREE.TangentSpaceNormalMap)return '物体空间法线';
  return null;
}

export function nativeRuntimeCompatibility(status){
  if(status?.material_table_protocol!==1||status?.retained_scene_protocol!==1)return 'DX12 运行库与当前界面版本不匹配。请保存工程，完全退出并更新完整程序目录后重新打开。';
  return null;
}
export function createNativeViewport({scene,camera,renderer,canvas,isAllowed=()=>true,isSuspended=()=>false,assetIdentity=()=>'',motionRoot=()=>null,getRetainedModel=()=>null,profile=null}){
  const host=window.chrome?.webview;if(!host||!(window.__branchForgeNativeHost||window.__branchForgeNativeRequired))return {render:()=>{if(!isSuspended())renderer.render(scene,camera);},get stats(){return {available:false};}};
  const sceneSession=crypto.randomUUID(),transport=createNativeTransportSession(sceneSession);let activationRevision=0,compatibilityReason=null,runtimeVerified=false;
  let buffer=null,inFlight=false,outbound=null,resourceQueueDirty=false,ready=false,active=false,wanted=true,dlss=false,sequence=0,lastSceneRevision=0,lastAcceptedRevision=0,uploaded=new Set(),pendingIds=new Set(),outboundIds=new Set(),pendingResources=[],currentObjects=[],lastRect='',lastStatus={},lastError='',disposed=false;
  const objectRecords=new WeakMap(),geometryProbes=new WeakMap(),transforms=createNativeTransformRetention(motionRoot);let collectFrame=0;
  const modelCache=createNativeModelCache();let forceModelAudit=false,lastModelAudit={checked:false};
  const geometryUses=new Map();
  const resourceState=new WeakMap(),instanceState=new WeakMap(),geometryRevisions=new WeakMap(),drawCache=new Map(),resourceTokens=new Map(),retention=createNativeSceneRetention(),retainedMaterials=createRetainedNativeMaterialTable({immutableRecords:true});let bindingVersion=0,lastSubmittedBindingVersion=-1,lastCollectedBindings=-1,overlayRoots=[],overlayMembers=[],lastSentFields=null,graphState=null,lastSentGraph=0,lastSubmittedBindings=new Map(),currentBindings=new Map(),frameStamp=0;let latestScene=null,latestSignature='',lastSentSignature='',latestSceneBytes=null,epoch=0;
  const counters={packets:0,bytes:0,resourceUploads:0,fallbacks:0,fullScenes:0,scenePatches:0,graphBuilds:0,coalescedFrames:0,modelCacheHits:0,modelScans:0,modelAudits:0,modelAuditMismatches:0};
  const controls=document.createElement('div');controls.className='native-render-controls';controls.innerHTML='<strong title="专业版主视口">DX12</strong><select hidden aria-label="视口诊断后端"><option value="native">DX12</option><option value="webgl">WebGL 诊断</option></select><label>画质 <select aria-label="视口抗锯齿"><option value="dlss">DLSS 质量</option><option value="native">原始分辨率</option></select></label><span role="status">正在准备 DX12 视口</span>';
  const statusbar=document.querySelector('.statusbar');if(statusbar)statusbar.insertBefore(controls,statusbar.children[1]||null);else canvas.parentElement.append(controls);const [backend,quality]=controls.querySelectorAll('select'),message=controls.querySelector('span');quality.value='native';
  const notice=document.createElement('div');notice.className='native-viewport-notice';notice.hidden=true;notice.setAttribute('role','alert');notice.innerHTML='<strong>DX12 视口暂不可用</strong><p></p><button type="button">重试 DX12</button><small>当前工程与编辑记录保留，可继续保存工程。</small>';canvas.parentElement.append(notice);notice.querySelector('button').onclick=()=>restart();
  function restart(){runtimeVerified=false;transport.restart();lastError='';compatibilityReason=null;wanted=true;backend.value='native';ready=false;buffer=null;uploaded.clear();pendingIds.clear();outboundIds.clear();pendingResources=[];inFlight=false;outbound=null;resourceQueueDirty=false;latestScene=null;latestSceneBytes=null;latestSignature='';lastSentSignature='';lastSentGraph=0;lastSubmittedBindings.clear();lastSubmittedBindingVersion=-1;lastSentFields=null;lastAcceptedRevision=0;resourceTokens.clear();bindingVersion++;lastStatus={};epoch++;deactivate();notice.hidden=true;message.textContent='正在重启 DX12 视口';post({action:'initialize',restart:true});}
  backend.onchange=()=>{wanted=backend.value==='native';deactivate();lastSentSignature='';if(wanted&&lastError)restart();};quality.onchange=()=>{dlss=quality.value==='dlss';lastSentSignature='';};
  const post=data=>host.postMessage(JSON.stringify({topic:'branchforge-native',transportSession:transport.id,...data}));
  function deactivate(){active=false;activationRevision=0;modelCache.clear();document.body.classList.remove('native-viewport-active');document.documentElement.classList.remove('native-viewport-active');renderer.setClearAlpha(1);}
  function showNotice(reason){notice.hidden=false;notice.querySelector('p').textContent=reason;message.textContent='DX12 视口待恢复';message.title=reason;}
  function fail(error){const reason=error.message||String(error);if(lastError===reason)return;lastError=reason;deactivate();showNotice(lastError);post({action:'hide'});}
  function keyFor(object,version){const old=resourceState.get(object);if(old?.version===version)return old.key;const key=object.uuid+':'+version;resourceState.set(object,{key,version});return key;}
  const known=id=>uploaded.has(id)||pendingIds.has(id)||outboundIds.has(id);
  function queueResource(resource,parts){if(known(resource.id))return;pendingResources.push({resource,parts});pendingIds.add(resource.id);}
  function geometryKey(geometry,strip=false,loop=false){let cached=geometryRevisions.get(geometry);if(!cached)geometryRevisions.set(geometry,cached={versions:[],variants:new Map()});const names=attributeNames;let changed=false;for(let i=0;i<7;i++){const value=nativeAttributeVersion(i<6?geometry.attributes[names[i]]:geometry.index);if(cached.versions[i]!==value){cached.versions[i]=value;changed=true;}}if(changed)cached.variants.clear();const kind=strip?(loop?'loop':'strip')+':'+geometry.drawRange.start+':'+geometry.drawRange.count:'mesh';let key=cached.variants.get(kind);if(!key){key=geometry.uuid+':'+cached.versions.join(',')+':'+kind;cached.variants.set(kind,key);}if(!known(key)){const arrays=nativeGeometry(geometry);if(strip)arrays.indices=nativeLineIndices(geometry,loop);const resource={type:'geometry',id:key,vertices:{},indices:{}};queueResource(resource,[{spec:resource.vertices,bytes:arrays.vertices},{spec:resource.indices,bytes:arrays.indices}]);}return key;}

  function dataKey(texture){if(!texture)return null;const alias=lastStatus.retained_scene_protocol===1,key=keyFor(texture,texture.version+':'+alias);if(!known(key)){const resource={id:key,type:'buffer',data:{},stride:4};queueResource(resource,[{spec:resource.data,bytes:texture.image.data}]);}if(alias){if(resourceTokens.get(texture.uuid)!==key){resourceTokens.set(texture.uuid,key);bindingVersion++;}return texture.uuid;}return key;}

  function textureKey(texture,role='color'){if(!texture)return null;const image=texture.image;if(!image||!image.width||!image.height)return null;const key=keyFor(texture.source||texture,(texture.source?.version??texture.version));if(!known(key)){
    let pixels;if(texture.isDataTexture){if(!(image.data instanceof Uint8Array)||image.data.length!==image.width*image.height*4)throw Error('Unsupported native surface texture');pixels=image.data;}else{const scratch=document.createElement('canvas');scratch.width=image.width;scratch.height=image.height;const context=scratch.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);pixels=context.getImageData(0,0,image.width,image.height).data;}
    const resource={type:'texture',id:key,width:image.width,height:image.height,srgb:texture.colorSpace===THREE.SRGBColorSpace,normal:role==='normal',data:{}};queueResource(resource,[{spec:resource.data,bytes:pixels}]);
  }return key;}
  const materialEncoder=createNativeMaterialEncoder({textureKey}),material=m=>materialEncoder.encode(m);
  function instanceKey(mesh){if(!mesh.isInstancedMesh&&!mesh.__branchForgeNativeEdit)return '';const edit=mesh.__branchForgeNativeEdit,count=mesh.isInstancedMesh?mesh.count:1,attribute=mesh.geometry.getAttribute('sampleRadius'),matrixVersion=nativeAttributeVersion(mesh.instanceMatrix),radiusVersion=nativeAttributeVersion(attribute),lookup=edit?.lookupTexture.uuid||'',alias=lastStatus.retained_scene_protocol===1;let cached=instanceState.get(mesh);if(cached&&cached.matrixVersion===matrixVersion&&cached.radiusVersion===radiusVersion&&cached.count===count&&cached.lookup===lookup&&cached.alias===alias){queueResource(cached.resource,cached.parts);if(alias)if(resourceTokens.get(cached.logical)!==cached.key){resourceTokens.set(cached.logical,cached.key);bindingVersion++;}return cached.logical;}
    const values=new Float32Array(count*52),matrix=new THREE.Matrix4(),normalMatrix=new THREE.Matrix4();for(let n=0;n<count;n++){mesh.isInstancedMesh?mesh.getMatrixAt(n,matrix):matrix.identity();values.set(matrix.elements,n*52);values.set(cached?.matrices?.length>=(n+1)*16?cached.matrices.subarray(n*16,n*16+16):matrix.elements,n*52+16);values[n*52+32]=attribute?.getX(n)??1;values[n*52+33]=edit?.offsets[n]??0;values.set(normalMatrix.copy(matrix).invert().transpose().elements,n*52+36);}
    const key=mesh.uuid+':instances:'+matrixVersion+':'+radiusVersion+':'+count+':'+lookup+':'+alias,logical=alias?mesh.uuid+':instances':key,resource={id:key,type:'buffer',data:{},stride:208},parts=[{spec:resource.data,bytes:values}];queueResource(resource,parts);instanceState.set(mesh,{matrixVersion,radiusVersion,count,lookup,alias,key,logical,resource,parts,matrices:Float32Array.from({length:count*16},(_,i)=>values[Math.floor(i/16)*52+i%16])});if(alias&&resourceTokens.get(logical)!==key){resourceTokens.set(logical,key);bindingVersion++;}return logical;
  }

  function geometryProbe(g){let state=geometryProbes.get(g);if(!state)geometryProbes.set(g,state={frame:-1,revision:0,attrs:[],groups:[]});if(state.frame===collectFrame)return state;state.frame=collectFrame;let changed=false;
    for(let i=0;i<7;i++){const attribute=i<6?g.attributes[attributeNames[i]]:g.index,old=state.attrs[i];if(!attribute){if(old){state.attrs[i]=null;changed=true;}continue;}const storage=attribute.data||attribute;if(!old||old.attribute!==attribute||old.array!==storage.array||old.version!==storage.version||old.stride!==storage.stride||old.count!==attribute.count||old.size!==attribute.itemSize||old.normalized!==attribute.normalized||old.offset!==attribute.offset){state.attrs[i]={attribute,array:storage.array,version:storage.version,stride:storage.stride,count:attribute.count,size:attribute.itemSize,normalized:attribute.normalized,offset:attribute.offset};changed=true;}}
    if(state.start!==g.drawRange.start||state.count!==g.drawRange.count||state.groups.length!==g.groups.length){changed=true;state.start=g.drawRange.start;state.count=g.drawRange.count;}
    for(let i=0;i<g.groups.length;i++){const a=g.groups[i],old=state.groups[i];if(!old||old.start!==a.start||old.count!==a.count||old.materialIndex!==a.materialIndex){state.groups[i]={...a};changed=true;}}state.groups.length=g.groups.length;if(changed)state.revision++;return state;
  }
  function collect(){
    if(latestScene&&latestScene.assetIdentity!==assetIdentity()){deactivate();lastSentGraph=0;lastSentFields=null;lastSentSignature='';drawCache.clear();retainedMaterials.reset();epoch++;}
    const matrixProfile=profile?.begin('native.world_matrices');collectFrame++;materialEncoder.beginFrame();scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);matrixProfile?.end();
    const projection=toD3D.clone().multiply(camera.projectionMatrix),view=camera.matrixWorldInverse,vp=projection.clone().multiply(view),draws=[],objects=[],overlays=[],useMaterialTable=lastStatus.material_table_protocol===1,materialTable=lastStatus.retained_scene_protocol===1?retainedMaterials:createNativeMaterialTable();if(materialTable===retainedMaterials)retainedMaterials.beginFrame();
    const result={assetIdentity:assetIdentity(),projection:projection.elements,view:view.elements.slice(),viewProjection:vp.elements,camera:[...camera.position.toArray(),0],near:camera.near,far:camera.far,fov:THREE.MathUtils.degToRad(camera.fov||38),orthographic:Boolean(camera.isOrthographicCamera),dlss:dlss&&lastStatus.dlss_supported!==false,background:rgba(renderer.getClearColor(new THREE.Color())),fog:[scene.fog?.near||1e6,scene.fog?.far||1e7,renderer.toneMappingExposure,0]};let lightIndex=0;
    
    const frameMaterial=m=>materialTable.intern(m,m=>{if(m.visible&&m.depthTest!==false)compatibilityReason||=nativeMaterialUnsupported(m);return material(m);});
    if(lastStatus.retained_scene_protocol===1&&motionRoot())result.rootTransforms={[motionRoot().uuid]:motionRoot().matrixWorld.elements.slice()};
    const managed=lastStatus.retained_scene_protocol===1&&useMaterialTable?getRetainedModel():null;let modelVisited=false,modelMaterials=null;
    if(!managed)modelCache.clear();
    // Palette bytes change independently of retained geometry/draw records.
    // Publish only explicitly owned preview buffers, including on cache hits.
    const declaredBindings=new Map();for(const texture of managed?.dynamicBuffers||[]){const key=dataKey(texture);if(key)declaredBindings.set(key,resourceTokens.get(key));}
    const modelBindings=items=>{const found=new Map();for(const draw of items)for(const key of [draw.instances,draw.editLookup,draw.editFrames])if(key&&resourceTokens.has(key))found.set(key,resourceTokens.get(key));return found;};
    const objectProfile=profile?.begin('native.object_scan');const visit=object=>{
      if(modelMaterials&&(object.isMesh||object.isLine))for(const m of Array.isArray(object.material)?object.material:[object.material])if(m)modelMaterials.add(m);
      const pose=lastStatus.retained_scene_protocol===1?transforms.get(object,collectFrame):null,objectMatrix=pose?.matrix||object.matrixWorld.elements,root=pose?.root||'';
      const encodedGeometry=object.geometry?nativePreviewGeometrySource(object.geometry):null;
      const cached=objectRecords.get(object);if(cached&&cached.frame===collectFrame-1&&cached.epoch===epoch&&cached.materialProtocol===lastStatus.material_table_protocol&&cached.retainedProtocol===lastStatus.retained_scene_protocol&&cached.geometry===object.geometry&&cached.encodedGeometry===encodedGeometry&&cached.material===object.material&&!object.isSkinnedMesh&&!object.geometry.morphAttributes.position?.length){
        const probe=geometryProbe(encodedGeometry),im=object.instanceMatrix,storage=im?.data||im,radius=object.geometry.attributes.sampleRadius,edit=object.__branchForgeNativeEdit,lookup=edit?.lookupTexture,frames=edit?.frameTexture,world=objectMatrix;
        let same=cached.root===root&&cached.geometryRevision===probe.revision&&cached.instanceAttribute===im&&cached.instanceArray===storage?.array&&cached.instanceVersion===storage?.version&&cached.radius===radius&&cached.radiusArray===radius?.array&&cached.radiusVersion===radius?.version&&cached.radiusCount===radius?.count&&cached.radiusSize===radius?.itemSize&&cached.radiusNormalized===radius?.normalized&&cached.count===object.count&&cached.edit===edit&&cached.lookup===lookup&&cached.lookupVersion===lookup?.version&&cached.frames===frames&&cached.framesVersion===frames?.version&&cached.castShadow===object.castShadow&&cached.receiveShadow===object.receiveShadow&&cached.line===object.isLine&&cached.lineLoop===object.isLineLoop&&cached.lineSegments===object.isLineSegments;
        if(same)for(let i=0;i<16;i++)if(cached.matrix[i]!==world[i]){same=false;break;}
        if(same){const mats=Array.isArray(object.material)?object.material:[object.material];if(mats.length!==cached.materials.length)same=false;else for(let i=0;i<mats.length;i++)if(mats[i]!==cached.materials[i]||!mats[i]?.visible||mats[i].depthTest===false||mats[i].isShaderMaterial||mats[i].isRawShaderMaterial||frameMaterial(mats[i])!==cached.materialIndices[i]){same=false;break;}}
        if(same){cached.frame=collectFrame;objects.push(object);for(const d of cached.draws)draws.push(d);return;}
      }

      if(object.isHemisphereLight){result.sky=rgba(object.color,object.intensity);result.earth=rgba(object.groundColor,object.intensity);}
      if(object.isDirectionalLight){const direction=new THREE.Vector3().setFromMatrixPosition(object.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(object.target.matrixWorld)).normalize();if(lightIndex++===0){result.keyDirection=[...direction.toArray(),0];result.keyColor=rgba(object.color,object.intensity);object.shadow.updateMatrices(object);result.lightViewProjection=toD3D.clone().multiply(object.shadow.camera.projectionMatrix).multiply(object.shadow.camera.matrixWorldInverse).elements;}else{result.rimDirection=[...direction.toArray(),0];result.rimColor=rgba(object.color,object.intensity);}}
      if(object.isMesh&&(object.isSkinnedMesh||object.geometry?.morphAttributes.position?.length))compatibilityReason||='骨骼或形态动画';
      if(!supported(object)){if(object.isMesh&&!object.userData.trunk_form_preview_readonly)for(const m of Array.isArray(object.material)?object.material:[object.material])if(m?.visible&&m.depthTest!==false)compatibilityReason||=nativeMaterialUnsupported(m);if(object.isMesh||object.isLine||object.isPoints||object.isSprite||object.isLight)overlays.push(object);return;}
      const ranges=nativeDrawRanges(object);if(!ranges.length)return;
      const firstDraw=draws.length;objects.push(object);const geometry=encodedGeometry,strip=object.isLine&&!object.isLineSegments,geometryId=geometryKey(geometry,strip,Boolean(object.isLineLoop)),materials=object.material,instances=instanceKey(object);
      for(const {groupStart,material:m,start,count}of ranges){
        const id=object.uuid+':'+groupStart,materialIndex=frameMaterial(m),encodedMaterial=useMaterialTable?materialIndex:materialTable.materials[materialIndex],instanceCount=object.isInstancedMesh?object.count:1,line=Boolean(object.isLine),castShadow=Boolean(object.castShadow),receiveShadow=Boolean(object.receiveShadow),radial=Boolean(geometry.attributes.sampleCenter&&geometry.attributes.sampleRadius),editLookup=object.__branchForgeNativeEdit?dataKey(object.__branchForgeNativeEdit.lookupTexture):undefined,editFrames=object.__branchForgeNativeEdit?dataKey(object.__branchForgeNativeEdit.frameTexture):undefined,old=drawCache.get(id),matrix=objectMatrix;
        let same=old&&old.root===root&&old.geometry===geometryId&&old.instances===instances&&old.instanceCount===instanceCount&&old.start===start&&old.count===count&&old.line===line&&old.castShadow===castShadow&&old.receiveShadow===receiveShadow&&old.radial===radial&&old.material===encodedMaterial&&old.editLookup===editLookup&&old.editFrames===editFrames;
        if(same)for(let i=0;i<16;i++)if(old.matrix[i]!==matrix[i]){same=false;break;}
        if(same)draws.push(old);else draws.push(retainNativeDraw(drawCache,{id,root,geometry:geometryId,matrix,instances,instanceCount,start,count,line,castShadow,receiveShadow,radial,material:encodedMaterial,...(editLookup?{editLookup,editFrames}:{})}));
      }
      const im=object.instanceMatrix,storage=im?.data||im,radius=object.geometry.attributes.sampleRadius,edit=object.__branchForgeNativeEdit,mats=Array.isArray(materials)?materials.slice():[materials];objectRecords.set(object,{frame:collectFrame,epoch,root,materialProtocol:lastStatus.material_table_protocol,retainedProtocol:lastStatus.retained_scene_protocol,geometry:object.geometry,encodedGeometry,geometryRevision:geometryProbe(geometry).revision,material:materials,materials:mats,materialIndices:mats.map(frameMaterial),matrix:objectMatrix.slice(),draws:draws.slice(firstDraw),instanceAttribute:im,instanceArray:storage?.array,instanceVersion:storage?.version,radius,radiusArray:radius?.array,radiusVersion:radius?.version,radiusCount:radius?.count,radiusSize:radius?.itemSize,radiusNormalized:radius?.normalized,count:object.count,edit,lookup:edit?.lookupTexture,lookupVersion:edit?.lookupTexture.version,frames:edit?.frameTexture,framesVersion:edit?.frameTexture.version,castShadow:object.castShadow,receiveShadow:object.receiveShadow,line:object.isLine,lineLoop:object.isLineLoop,lineSegments:object.isLineSegments});
    };
    const walk=object=>{
      if(!object.visible)return;
      if(managed?.root===object){
        modelVisited=true;const pose=transforms.get(object,collectFrame)||{root:'',matrix:object.matrixWorld.elements},context={...managed,epoch,pose,materialIndex:frameMaterial},retained=modelCache.read(context);
        if(retained&&!forceModelAudit){for(const draw of retained.draws)draws.push(draw);for(const source of retained.objects)objects.push(source);counters.modelCacheHits++;return;}
        counters.modelScans++;const first=draws.length,firstObject=objects.length,firstOverlay=overlays.length;modelMaterials=new Set();visit(object);for(const child of object.children)walk(child);const materials=[...modelMaterials].map(material=>({material,index:materialTable.cachedIndex(material)}));modelMaterials=null;
        const modelDraws=draws.slice(first),bindings=modelBindings(modelDraws);
        if(forceModelAudit){let expected=retained;if(retained&&declaredBindings.size){const bindings=new Map(retained.bindings);for(const [key,value]of declaredBindings)if(bindings.has(key))bindings.set(key,value);expected={...retained,bindings};}const mismatch=Boolean(expected&&!modelCache.matches(expected,modelDraws,bindings));lastModelAudit={checked:Boolean(retained),mismatch,revision:managed.revision};counters.modelAudits++;if(mismatch)counters.modelAuditMismatches++;forceModelAudit=false;}
        modelCache.capture({...context,draws:modelDraws,objects:objects.slice(firstObject),materials,bindings,eligible:overlays.length===firstOverlay});return;
      }
      visit(object);for(const child of object.children)walk(child);
    };
    walk(scene);if(!modelVisited){modelCache.clear();if(forceModelAudit){lastModelAudit={checked:false,mismatch:false,reason:'no-managed-model'};counters.modelAudits++;forceModelAudit=false;}}
    objectProfile?.end();const retentionProfile=profile?.begin('native.scene_retention');
    const oldState=graphState;graphState=retention.update(draws,useMaterialTable?materialTable.materials.slice():null);currentObjects=objects;
    if(graphState!==oldState||bindingVersion!==lastCollectedBindings||resourceQueueDirty){
      const geometryOnly=!resourceQueueDirty&&oldState&&graphState!==oldState&&!graphState.topologyChanged&&bindingVersion===lastCollectedBindings&&graphState.changes.every(([next,old])=>old&&next.material===old.material&&next.instances===old.instances&&next.editLookup===old.editLookup&&next.editFrames===old.editFrames);
      if(geometryOnly){
        const retired=[];for(const [next,old]of graphState.changes)if(next.geometry!==old.geometry){const count=geometryUses.get(old.geometry)-1;if(count)geometryUses.set(old.geometry,count);else{geometryUses.delete(old.geometry);retired.push(old.geometry);}geometryUses.set(next.geometry,(geometryUses.get(next.geometry)||0)+1);}for(const key of retired)if(!geometryUses.has(key))uploaded.delete(key);
        pendingResources=pendingResources.filter(r=>r.resource.type!=='geometry'||geometryUses.has(r.resource.id));
      }else{
        geometryUses.clear();const live=new Set(),bindings=new Map(),use=id=>{if(!id)return;live.add(id);const token=resourceTokens.get(id);if(token){live.add(token);bindings.set(id,token);}};
        for(const d of draws){geometryUses.set(d.geometry,(geometryUses.get(d.geometry)||0)+1);use(d.geometry);use(d.instances);use(d.editLookup);use(d.editFrames);const m=typeof d.material==='number'?materialTable.materials[d.material]:d.material;use(m.map);use(m.normalMap);use(m.roughnessMap);}
        for(const key of uploaded)if(!live.has(key))uploaded.delete(key);for(const key of resourceTokens.keys())if(!live.has(key))resourceTokens.delete(key);pendingResources=pendingResources.filter(r=>live.has(r.resource.id));currentBindings=bindings;
      }
      pendingIds=new Set(pendingResources.map(r=>r.resource.id));lastCollectedBindings=bindingVersion;resourceQueueDirty=false;counters.graphBuilds++;
      if(graphState.topologyChanged){const ids=new Set(draws.map(d=>d.id));for(const key of drawCache.keys())if(!ids.has(key))drawCache.delete(key);}
    }
    if(objects.length!==overlayMembers.length||objects.some((o,i)=>o!==overlayMembers[i])||overlays.length!==overlayMembers.overlays?.length||overlays.some((o,i)=>o!==overlayMembers.overlays[i])){
      // Hide complete native subtrees for the overlay pass. Picking and authoring
      // see the original scene again before this synchronous render returns.
      const keep=new Set([scene]);for(const o of overlays)for(let p=o;p;p=p.parent)keep.add(p);
      const roots=new Set(),known=new Map();for(const o of objects){let p=o;while(p.parent&&!keep.has(p.parent)){if(known.has(p)){p=known.get(p);break;}p=p.parent;}known.set(o,p);roots.add(p);}overlayRoots=[...roots];overlayMembers=objects;overlayMembers.overlays=overlays;
    }
    latestScene=result;latestSignature=graphState.revision+':'+bindingVersion+':'+JSON.stringify(result);retentionProfile?.end();
  }

  function transmit(packet){if(!buffer||inFlight)return false;if(packet.byteLength>buffer.byteLength)throw Error('场景资源超过传输容量');const copyProfile=profile?.begin('native.shared_copy');new Uint8Array(buffer,0,packet.byteLength).set(packet);copyProfile?.end();inFlight=true;counters.packets++;counters.bytes+=packet.byteLength;post({action:'packet',bytes:packet.byteLength});return true;}
  function send(metadata,parts=[]){if(!buffer||inFlight)return false;const encodeProfile=profile?.begin('native.packet_encode'),packet=packNativePacket({version:1,...metadata},parts,metadata.scene?latestSceneBytes:null);encodeProfile?.end();if(metadata.scene)counters.fullScenes++;if(metadata.scenePatch)counters.scenePatches++;outbound={metadata,packet,sceneState:metadata.scene||metadata.scenePatch?{graph:graphState.version,fields:graphState.fields,signature:latestSignature,bindings:lastSubmittedBindingVersion===bindingVersion?lastSubmittedBindings:new Map(currentBindings),bindingVersion}:null};outboundIds=new Set((metadata.resources||[]).map(r=>r.id));return transmit(packet);}
  function sceneMetadata(){const patch=lastStatus.retained_scene_protocol===1&&lastSentGraph===graphState.version,bindings=patch?(lastSubmittedBindingVersion===bindingVersion?{}:nativeBindingDelta(lastSubmittedBindings,currentBindings)):Object.fromEntries(currentBindings),changes=patch?nativeSceneDelta(lastSentFields,graphState.fields):{},dynamic={...latestScene,...changes,...(Object.keys(bindings).length?{bufferBindings:bindings}:{})};lastSceneRevision=++sequence;if(!activationRevision)activationRevision=lastSceneRevision;const metadata={revision:lastSceneRevision,sceneSession,graphRevision:graphState.version,submittedAtMs:frameStamp};if(patch)metadata.scenePatch=dynamic;else{metadata.scene={...graphState.fields,...dynamic};latestSceneBytes=encodeRetainedNativeScene(graphState.bytes,dynamic);}return metadata;}
  function pump(){if(!ready||!runtimeVerified||!wanted||!isAllowed()||lastError)return;if(inFlight)return;compatibilityReason=null;collect();if(compatibilityReason){deactivate();lastSentSignature='';showNotice('当前 DX12 尚不支持：'+compatibilityReason+'。请恢复支持的材质或视图后继续。');post({action:'hide'});return;}notice.hidden=true;if(inFlight)return;
    if(pendingResources.length){const reserve={byteLength:(lastStatus.retained_scene_protocol===1&&lastSentGraph===graphState.version?JSON.stringify(nativeSceneDelta(lastSentFields,graphState.fields)).length:graphState.bytes.byteLength)+JSON.stringify(latestScene).length+currentBindings.size*512+4096},batch=planNativeResourceBatch(pendingResources,buffer.byteLength,latestScene,reserve),metadata={resources:batch.selected.map(r=>r.resource)};pendingResources.splice(0,batch.selected.length);for(const item of batch.selected)pendingIds.delete(item.resource.id);if(batch.complete)Object.assign(metadata,sceneMetadata());else{deactivate();lastSentSignature='';}send(metadata,batch.parts);return;}
    if(latestSignature!==lastSentSignature)send(sceneMetadata());
  }
  host.addEventListener('sharedbufferreceived',event=>{if(disposed||!transport.shared(event.additionalData))return;buffer=event.getBuffer();lastError='';lastRect='';ready=true;});
  host.addEventListener('message',event=>{let value=event.data;if(value?.topic!=='branchforge-native'||!transport.message(value))return;
    if(value.action==='ack'){
      inFlight=false;
      if(value.accepted===false){
        // Rebuild from the latest scene and last accepted base. Retain still
        // needed resource bytes from the rejected snapshot; collect discards
        // superseded helpers before the next coherent batch is encoded.
        if(outbound){
          const recovered=nativeRetryResources(outbound.metadata,outbound.packet),queued=new Set(pendingResources.map(item=>item.resource.id));
          pendingResources=[...recovered.filter(item=>!queued.has(item.resource.id)),...pendingResources];
          pendingIds=new Set(pendingResources.map(item=>item.resource.id));resourceQueueDirty=true;
          if(outbound.sceneState)counters.coalescedFrames++;
        }
        outbound=null;outboundIds.clear();
      }else{
        for(const resource of outbound?.metadata.resources||[]){uploaded.add(resource.id);counters.resourceUploads++;}
        const state=outbound?.sceneState;if(state){lastAcceptedRevision=outbound.metadata.revision;lastSentGraph=state.graph;lastSentFields=state.fields;lastSentSignature=state.signature;lastSubmittedBindings=state.bindings;lastSubmittedBindingVersion=state.bindingVersion;}
        outbound=null;outboundIds.clear();
      }
    }
    if(value.action==='status'){lastStatus=value.status;const incompatible=nativeRuntimeCompatibility(lastStatus);if(incompatible){fail(Error(incompatible));return;}runtimeVerified=true;if(lastStatus.requires_full_scene){lastSentGraph=0;lastSentSignature='';}if(lastStatus.error){fail(Error(lastStatus.error));return;}if(lastStatus.dlss_supported===false){quality.value='native';quality.querySelector('[value=dlss]').disabled=true;quality.title='当前设备不支持 DLSS';}if(!lastError&&wanted&&!compatibilityReason&&isAllowed()&&lastStatus.frames>0&&lastStatus.scene_session===sceneSession&&lastStatus.asset_identity===assetIdentity()&&lastStatus.revision>=activationRevision&&activationRevision>0){active=true;notice.hidden=true;document.body.classList.add('native-viewport-active');document.documentElement.classList.add('native-viewport-active');message.textContent=`${lastStatus.dlss_active?'DLSS 质量':'原始分辨率'} · ${Number(lastStatus.gpu_ms||0).toFixed(1)} ms`;} }
    if(value.action==='error')fail(Error(value.message));
  });
  post({action:'initialize'});
  function renderOverlay(){const overlayProfile=profile?.begin('native.overlay');const prior=renderer.getClearAlpha(),background=scene.background,sceneAuto=scene.matrixWorldAutoUpdate,cameraAuto=camera.matrixWorldAutoUpdate,hidden=active?overlayRoots.map(o=>[o,o.visible]):[];if(!active)scene.traverseVisible(o=>{if((o.isMesh||o.isLine||o.isPoints||o.isSprite)&&(Array.isArray(o.material)?o.material:[o.material]).every(m=>m?.depthTest!==false))hidden.push([o,o.visible]);});if(active){scene.background=null;renderer.setClearAlpha(0);scene.matrixWorldAutoUpdate=false;camera.matrixWorldAutoUpdate=false;}for(const [o]of hidden)o.visible=false;if(active)scene.traverseVisible(o=>{if(supported(o)){hidden.push([o,o.visible]);o.visible=false;}});try{renderer.render(scene,camera);}finally{for(const [o,visible]of hidden)o.visible=visible;scene.background=background;scene.matrixWorldAutoUpdate=sceneAuto;camera.matrixWorldAutoUpdate=cameraAuto;renderer.setClearAlpha(prior);overlayProfile?.end();}}
  const api={render(){if(disposed)return;if(isSuspended()){post({action:'hide'});return;}frameStamp=Date.now();if(active&&lastStatus.asset_identity!==assetIdentity())deactivate();try{const rect=canvas.getBoundingClientRect(),bounds=JSON.stringify({x:rect.x,y:rect.y,width:rect.width,height:rect.height,dpr:devicePixelRatio});if(bounds!==lastRect){lastRect=bounds;post({action:'bounds',bounds:JSON.parse(bounds)});}if(!wanted||!isAllowed()){deactivate();notice.hidden=true;message.textContent=wanted?'辅助多视图 · WebGL':'WebGL 诊断';post({action:'hide'});return renderer.render(scene,camera);}pump();post({action:compatibilityReason||lastError?'hide':'show'});renderOverlay();
    }catch(error){fail(error);renderOverlay();}},async waitForPresentation({timeout=60000,onProgress=()=>{}}={}){const expected=assetIdentity(),started=performance.now();while(!disposed&&assetIdentity()===expected){const s=api.stats;if(!wanted||!isAllowed()||s.lastError||s.compatibilityReason||s.active&&s.native.asset_identity===expected&&s.native.scene_session===sceneSession)return s;if(performance.now()-started>timeout){fail(Error('DX12 视口准备超时；工程已载入，可保存后重试视口。'));return api.stats;}await onProgress(s);await new Promise(resolve=>setTimeout(resolve,100));}return api.stats;},async auditModel({timeout=10000}={}){if(!ready||!wanted||!isAllowed()||lastError)return {checked:false,mismatch:false,reason:'viewport-inactive'};const before=counters.modelAudits,started=performance.now();forceModelAudit=true;while(!disposed&&counters.modelAudits===before){if(performance.now()-started>timeout)throw Error('Native model audit timeout');await new Promise(resolve=>setTimeout(resolve,37));}return {...lastModelAudit};},restart,setMode(mode){backend.value=mode;backend.onchange();},setDlss(value){quality.value=value?'dlss':'native';quality.onchange();},get stats(){return {available:true,ready,active,wanted,dlss,lastError,presentation:!wanted?'diagnostic-webgl':!isAllowed()?'auxiliary-webgl':lastError||compatibilityReason?'blocked':active?'dx12':'pending',submittedRevision:lastSceneRevision,acceptedRevision:lastAcceptedRevision,sceneSession,transportSession:transport.id,compatibilityReason,pendingResources:pendingResources.length,inFlight,...counters,native:{...lastStatus}};},dispose(){disposed=true;epoch++;deactivate();post({action:'dispose'});controls.remove();notice.remove();}};window.addEventListener('beforeunload',()=>api.dispose(),{once:true});return api;
}
