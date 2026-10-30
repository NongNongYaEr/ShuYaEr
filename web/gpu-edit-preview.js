import {transportMountFrames} from './branch-mount-frame.js';
import {createImportedTrunkPreview} from './imported-trunk-preview.js';
import {markNativeModelChanged} from './native-model-changes.js';
import {cloneNativePreviewGeometry} from './native-preview-geometry.js';
import {axisTimes,axisTime,axisSegment,nearestAxis,cloneAxis} from './branch-axis.js';
import * as THREE from './vendor/three.module.min.js';

// Interactive render state only. The authored curves remain on the CPU and the
// existing generator/exporter still produces the final, exact mesh at commit.
const TEXELS = 7; // affine matrix (4 columns), inverse-transpose normal (3 columns)
const IDENTITY = new THREE.Matrix4();
const bindingCache = new WeakMap();
const bindingAttribute=a=>{if(!a)return null;const data=a.data||a;return {attribute:a,data,array:data.array,version:data.version,stride:data.stride,count:a.count,size:a.itemSize,normalized:a.normalized,offset:a.offset};};
const sameBindingAttribute=(a,s)=>{if(!s)return !a;const data=a?.data||a;return a===s.attribute&&data===s.data&&data.array===s.array&&data.version===s.version&&data.stride===s.stride&&a.count===s.count&&a.itemSize===s.size&&a.normalized===s.normalized&&a.offset===s.offset;};
const bindingAttributes=mesh=>[mesh.geometry.attributes.position,mesh.geometry.attributes.uv1,mesh.geometry.attributes.sampleCenter,mesh.instanceMatrix];
const nearParameter = (points, point) => {
  if(axisTimes(points))return nearestAxis(points,point);
  let best=Infinity,t=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
    const f=Math.max(0,Math.min(1,((point.x-a.x)*x+(point.y-a.y)*y+(point.z-a.z)*z)/Math.max(1e-12,x*x+y*y+z*z)));
    const dx=a.x+x*f-point.x,dy=a.y+y*f-point.y,dz=a.z+z*f-point.z,d=dx*dx+dy*dy+dz*dz;
    if(d<best){best=d;t=(i-1+f)/(points.length-1);}
  }
  return t;
};
const sameParameters=(a,b)=>{const x=axisTimes(a),y=axisTimes(b);return !x&&!y||Boolean(x&&y&&x.length===y.length&&x.every((t,i)=>t===y[i]));};
const sameCurve = (a,b) => a===b || (a?.points.length===b?.points.length && sameParameters(a.points,b.points) && a.points.every((p,i)=>p.distanceToSquared(b.points[i])<1e-24));
function texture(values,format,channels,limit){
  const length=typeof values==='number'?values:values.length;
  // Tall palettes must also use the supported width. A fixed 1024-wide image
  // prematurely fell back to CPU even when the GPU had ample texture capacity.
  const pixels=Math.ceil(length/channels),width=Math.min(limit,Math.max(Math.min(1024,limit),2**Math.ceil(Math.log2(Math.max(1,Math.ceil(pixels/limit)))))),height=Math.max(1,Math.ceil(pixels/width));
  if(height>limit)return null;
  const data=new Float32Array(width*height*channels);if(typeof values!=='number')data.set(values);
  const result=new THREE.DataTexture(data,width,height,format,THREE.FloatType);
  result.minFilter=result.magFilter=THREE.NearestFilter;result.generateMipmaps=false;result.needsUpdate=true;return result;
}
function shaderMaterial(source,uniforms,instanced){
  const result=source.clone(),hook=source.onBeforeCompile,key=source.customProgramCacheKey();
  result.onBeforeCompile=(shader,renderer)=>{
    hook.call(source,shader,renderer);
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=`
uniform sampler2D duckEditLookup;
uniform sampler2D duckEditFrames;
uniform vec2 duckEditLookupSize;
uniform vec2 duckEditFrameSize;
uniform float duckEditOffset;
uniform float duckEditInfluences;
attribute float duckEditVertex;
${instanced?'attribute float duckEditInstance;':''}
vec4 duckEditTexel(sampler2D image, vec2 size, float index) {
  return texture2D(image, (vec2(mod(index,size.x),floor(index/size.x))+.5)/size);
}
float duckEditFrame() {
  return duckEditTexel(duckEditLookup,duckEditLookupSize,duckEditVertex+${instanced?'duckEditInstance':'duckEditOffset'}).r*7.0;
}
mat4 duckEditMatrix() {
  float base=duckEditVertex*3.0+duckEditOffset;
  float i=duckEditInfluences>1.5?duckEditTexel(duckEditLookup,duckEditLookupSize,base).r*7.0:duckEditFrame();
  mat4 first=mat4(duckEditTexel(duckEditFrames,duckEditFrameSize,i),duckEditTexel(duckEditFrames,duckEditFrameSize,i+1.0),duckEditTexel(duckEditFrames,duckEditFrameSize,i+2.0),duckEditTexel(duckEditFrames,duckEditFrameSize,i+3.0));
  if(duckEditInfluences<1.5)return first;
  float j=duckEditTexel(duckEditLookup,duckEditLookupSize,base+1.0).r*7.0,w=duckEditTexel(duckEditLookup,duckEditLookupSize,base+2.0).r;
  return first*(1.0-w)+mat4(duckEditTexel(duckEditFrames,duckEditFrameSize,j),duckEditTexel(duckEditFrames,duckEditFrameSize,j+1.0),duckEditTexel(duckEditFrames,duckEditFrameSize,j+2.0),duckEditTexel(duckEditFrames,duckEditFrameSize,j+3.0))*w;
}
mat3 duckEditNormal() {
  float base=duckEditVertex*3.0+duckEditOffset;
  float i=duckEditInfluences>1.5?duckEditTexel(duckEditLookup,duckEditLookupSize,base).r*7.0+4.0:duckEditFrame()+4.0;
  mat3 first=mat3(duckEditTexel(duckEditFrames,duckEditFrameSize,i).xyz,duckEditTexel(duckEditFrames,duckEditFrameSize,i+1.0).xyz,duckEditTexel(duckEditFrames,duckEditFrameSize,i+2.0).xyz);
  if(duckEditInfluences<1.5)return first;
  float j=duckEditTexel(duckEditLookup,duckEditLookupSize,base+1.0).r*7.0+4.0,w=duckEditTexel(duckEditLookup,duckEditLookupSize,base+2.0).r;
  return first*(1.0-w)+mat3(duckEditTexel(duckEditFrames,duckEditFrameSize,j).xyz,duckEditTexel(duckEditFrames,duckEditFrameSize,j+1.0).xyz,duckEditTexel(duckEditFrames,duckEditFrameSize,j+2.0).xyz)*w;
}
`+shader.vertexShader;
    const normal=THREE.ShaderChunk.defaultnormal_vertex
      .replace('transformedNormal = normalMatrix * transformedNormal;','transformedNormal = normalMatrix * duckEditNormal() * transformedNormal;')
      .replace('transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;','transformedTangent = ( modelViewMatrix * duckEditMatrix() * vec4( transformedTangent, 0.0 ) ).xyz;');
    shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>',normal)
      .replace('#include <project_vertex>',`
vec4 duckEditPosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
duckEditPosition=instanceMatrix*duckEditPosition;
#endif
duckEditPosition=duckEditMatrix()*duckEditPosition;
vec4 mvPosition=modelViewMatrix*duckEditPosition;
gl_Position=projectionMatrix*mvPosition;`)
      .replace('#include <worldpos_vertex>',`
#if defined(USE_ENVMAP) || defined(DISTANCE) || defined(USE_SHADOWMAP) || defined(USE_TRANSMISSION) || NUM_SPOT_LIGHT_COORDS > 0
vec4 worldPosition=modelMatrix*duckEditPosition;
#endif`);
  };
  result.customProgramCacheKey=()=>key+':tree-duck-edit-v1:'+Number(instanced);return result;
}

export function createGpuMeshPreview(asset,snapshot,{sampleLine,lineTangent,targets=null,rigid=false,rigidFollowers=false,rigidUnits=false,anchorFollowers=true}){
  asset.activeEditPreview?.restore();
  const meshes=[];asset.group.traverse(o=>{if(o.isMesh&&!o.userData.imported_trunk)meshes.push(o);});
  if(meshes.some(m=>m.isSkinnedMesh||m.isBatchedMesh||m.geometry.morphAttributes.position?.length||
    (Array.isArray(m.material)?m.material:[m.material]).some(v=>v.isShaderMaterial||v.isRawShaderMaterial)))return null;
  const limit=asset.editPreviewTextureLimit||4096;
  const byStable=new Map([...snapshot.values()].map(b=>[b.stableId,b]));
  // The brush/transform can change only this family. Installed followers move
  // rigidly with their attachment; they need one frame, not one per wood vertex.
  const affected=targets?new Set(targets):null;
  if(affected){let expanded=true;while(expanded){expanded=false;for(const b of snapshot.values())if(!affected.has(b.stableId)&&(affected.has(snapshot.get(b.parentId)?.stableId)||affected.has(b.symmetrySource))){affected.add(b.stableId);expanded=true;}}}
  const scopeKey=JSON.stringify([targets?[...targets].sort():null,rigid,rigidFollowers,rigidUnits]);
  const eligible=b=>b&&(!affected||affected.has(b.stableId));
  const isRigid=b=>rigid||(rigidUnits&&(b.instanceId||b.unitOwner))||(rigidFollowers&&targets&&!targets.has(b.stableId)&&!b.pins?.size);
  asset.group.updateMatrixWorld(true);
  const rootInverse=asset.group.matrixWorld.clone().invert(),poseProbe=new THREE.Matrix4();
  const cached=bindingCache.get(asset);
  const reusable=cached&&cached.scopeKey===scopeKey&&cached.elements===asset.elements&&cached.lookupTexture===asset.lookupTexture&&cached.bindings===asset.editPreviewBindings&&cached.records.length===meshes.length&&cached.snapshot.size===snapshot.size&&
    cached.records.every((r,i)=>r.mesh===meshes[i]&&r.mesh.geometry===r.geometry&&r.count===(r.mesh.isInstancedMesh?r.mesh.count:1)&&r.stableId===r.mesh.userData.stable_id&&r.branchId===r.mesh.userData.branch_id&&r.local.equals(poseProbe.copy(rootInverse).multiply(r.mesh.matrixWorld))&&bindingAttributes(r.mesh).every((a,n)=>sameBindingAttribute(a,r.bindingAttributes[n]))&&(!r.instanceElements?!r.mesh.userData.instance_elements:r.mesh.userData.instance_elements?.length===r.instanceElements.length&&r.instanceElements.every((v,n)=>v===r.mesh.userData.instance_elements[n])))&&
    [...snapshot].every(([id,b])=>cached.snapshot.get(id)?.stableId===b.stableId&&cached.rigid.get(id)===Boolean(isRigid(b))&&sameCurve(cached.snapshot.get(id),b));
  const vertices=meshes.reduce((n,m)=>n+m.geometry.getAttribute('position').count*(m.isInstancedMesh?m.count:1),0);
  const frames=reusable?cached.frames:[null],byBranch=reusable?cached.byBranch:new Map(),records=reusable?cached.records:[],materials=[],lookupChunks=[];
  let lookup=reusable?cached.lookup:null,lookupCursor=reusable?lookup.length:0,skippedVertices=reusable?cached.skippedVertices:0;
  function saveLookup(instance,values){
    if(values.some(v=>v!==0)){instance.offset=lookupCursor;lookupChunks.push(values);lookupCursor+=values.length;}
    else{instance.inactive=true;skippedVertices+=values.length;}
  }
  const compiledFamilies=new WeakMap();
  function compiledFamily(descriptor){
    let family=compiledFamilies.get(descriptor.branchIds);
    if(!family){const ids=descriptor.branches.map(b=>[b.stableId,descriptor.branchIds.get(b.id)]);family={affected:ids.some(([,id])=>eligible(snapshot.get(id))),branches:null,ids};compiledFamilies.set(descriptor.branchIds,family);}
    return family;
  }
  const point=new THREE.Vector3(),instanceMatrix=new THREE.Matrix4(),world=new THREE.Matrix4();
  function addFrame(record,branch,t){
    if(!eligible(branch))return 0;
    if(isRigid(branch))t=0;
    let bindings=record.frames.get(branch.id);if(!bindings){bindings=new Map();record.frames.set(branch.id,bindings);}
    let index=bindings.get(t);
    if(index===undefined){
      index=frames.length;bindings.set(t,index);
      const frame={index,branch:branch.id,t,record};frames.push(frame);
      if(!byBranch.has(branch.id))byBranch.set(branch.id,[]);byBranch.get(branch.id).push(frame);
    }
    return index;
  }
  // Bind each render vertex once. GPU instances stay instances: no per-copy
  // Mesh/BufferGeometry, no Vector3 per vertex and no repeated foliage rebuild.
  if(!reusable)for(const mesh of meshes){
    const geometry=mesh.geometry,position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv1');
    const local=rootInverse.clone().multiply(mesh.matrixWorld),inverse=local.clone().invert();
    const record={mesh,geometry,material:mesh.material,depth:mesh.customDepthMaterial,distance:mesh.customDistanceMaterial,
      raycast:mesh.raycast,frustumCulled:mesh.frustumCulled,local,inverse,frames:new Map(),offset:lookupCursor,instances:[],vertexCount:position.count,
      bindingAttributes:bindingAttributes(mesh).map(bindingAttribute),count:mesh.isInstancedMesh?mesh.count:1,stableId:mesh.userData.stable_id,branchId:mesh.userData.branch_id,instanceElements:mesh.userData.instance_elements?.slice()};
    const compiled=asset.editPreviewBindings?.(mesh),count=mesh.isInstancedMesh?mesh.count:1;
    for(let n=0;n<count;n++){
      const descriptor=compiled?.instances?.[n],elements=descriptor?.elements||asset.elements,grid=descriptor?.lookup||compiled?.lookup||asset.lookupTexture;
      const family=descriptor?compiledFamily(descriptor):null;
      const hint=byStable.get(descriptor?.stableId||mesh.userData.stable_id||mesh.userData.branch_id);
      const elementIndex=mesh.userData.instance_elements?.[n];
      let instanceBinding=null;
      if(elementIndex!==undefined){const e=asset.elements[elementIndex],parent=asset.elements[e?.parentIndex],branch=byStable.get(parent?.id);if(branch)instanceBinding={branch,t:nearParameter(branch.points,new THREE.Vector3(...e.pivot))};}
      if(mesh.isInstancedMesh)mesh.getMatrixAt(n,instanceMatrix);else instanceMatrix.identity();
      world.copy(local).multiply(instanceMatrix);
      const saved={matrix:instanceMatrix.clone(),descriptor,offset:0,inactive:false};record.instances.push(saved);
      // A complete sample contains only its own wood and attached organs.
      // Its unchanged vertices already map to identity frame zero. Skip their
      // UV/element lookup entirely and prepare the shared branch map lazily.
      if(family&&!family.affected){saved.inactive=true;skippedVertices+=position.count;continue;}
      if(hint&&(!eligible(hint)||isRigid(hint))){
        const frame=addFrame(record,hint,0);
        if(frame)saveLookup(saved,new Float32Array(position.count).fill(frame));else{saved.inactive=true;skippedVertices+=position.count;}
        continue;
      }
      const localBranches=family?(family.branches??=new Map(family.ids)):null;
      let marker=null;
      if(!uv&&!hint&&!instanceBinding){
        point.setFromMatrixPosition(world);let best=Infinity;
        for(const branch of snapshot.values()){const t=nearParameter(branch.points,point),d=sampleLine(branch.points,t).distanceToSquared(point);if(d<best){best=d;marker={branch,t};}}
      }
      const center=geometry.getAttribute('sampleCenter'),radius=descriptor?.radius??1;
      const bindings=new Map(),values=new Float32Array(position.count);
      for(let i=0;i<position.count;i++){
        let binding=instanceBinding||marker;
        if(hint)binding={branch:hint,t:null};
        else if(uv&&!instanceBinding){
          const index=Math.floor(uv.getY(i)*grid.height)*grid.width+Math.floor(uv.getX(i)*grid.width);
          if(!bindings.has(index)){
            const e=elements[index],parent=e?.type==='BRANCH'?e:elements[e?.parentIndex];
            const branch=descriptor?snapshot.get(localBranches.get(parent?.id)):byStable.get(parent?.id);
            const pivot=eligible(branch)&&!isRigid(branch)&&e&&new THREE.Vector3(...e.pivot).applyMatrix4(world);
            bindings.set(index,eligible(branch)?{branch,t:isRigid(branch)?0:e.type==='BRANCH'?null:nearParameter(branch.points,pivot)}:null);
          }
          binding=bindings.get(index);
        }
        let t=binding?.t??0;
        if(binding?.t==null&&eligible(binding?.branch)&&!isRigid(binding.branch)){
          point.fromBufferAttribute(position,i);
          if(center)point.set(center.getX(i)+(point.x-center.getX(i))*radius,center.getY(i)+(point.y-center.getY(i))*radius,center.getZ(i)+(point.z-center.getZ(i))*radius);
          point.applyMatrix4(world);t=nearParameter(binding.branch.points,point);
        }
        values[i]=addFrame(record,binding?.branch,t);
      }
      saveLookup(saved,values);
    }
    records.push(record);
  }
  if(!reusable){
    // Only mixed batches need lookup entries for inactive instances. Give all
    // of those instances one shared identity span; untouched batches install
    // no preview at all. Offsets remain per whole instance, in vertex units.
    let identityVertices=0;for(const r of records)if(r.frames.size&&r.instances.some(i=>i.inactive))identityVertices=Math.max(identityVertices,r.vertexCount);
    lookup=new Float32Array(lookupCursor+identityVertices);let offset=0;for(const chunk of lookupChunks){lookup.set(chunk,offset);offset+=chunk.length;}
    lookupChunks.length=0;
    for(const r of records){for(const instance of r.instances)if(instance.inactive)instance.offset=r.frames.size?lookupCursor:0;r.offset=r.instances[0]?.offset??0;}
  }
  if(frames.length*TEXELS>=2**24||lookup.length>=2**24)return null;
  const lookupTexture=texture(lookup,THREE.RedFormat,1,limit),frameTexture=texture(frames.length*TEXELS*4,THREE.RGBAFormat,4,limit);
  if(!lookupTexture||!frameTexture){lookupTexture?.dispose();frameTexture?.dispose();return null;}
  if(!reusable)bindingCache.set(asset,{frames,byBranch,lookup,records,snapshot,scopeKey,skippedVertices,elements:asset.elements,lookupTexture:asset.lookupTexture,bindings:asset.editPreviewBindings,rigid:new Map([...snapshot].map(([id,b])=>[id,Boolean(isRigid(b))]))});
  for(const r of records){r.installed=false;r.material=r.mesh.material;r.depth=r.mesh.customDepthMaterial;r.distance=r.mesh.customDistanceMaterial;r.raycast=r.mesh.raycast;r.frustumCulled=r.mesh.frustumCulled;}
  const data=frameTexture.image.data,normal=new THREE.Matrix3();
  function write(index,matrix){
    const at=index*TEXELS*4;data.set(matrix.elements,at);normal.getNormalMatrix(matrix);
    for(let col=0;col<3;col++){data[at+16+col*4]=normal.elements[col*3];data[at+17+col*4]=normal.elements[col*3+1];data[at+18+col*4]=normal.elements[col*3+2];}
  }
  function packedMatrix(matrix){const values=new Float32Array(TEXELS*4);values.set(matrix.elements);normal.getNormalMatrix(matrix);for(let col=0;col<3;col++)for(let row=0;row<3;row++)values[16+col*4+row]=normal.elements[col*3+row];return values;}
  for(let i=0;i<frames.length;i++){const at=i*TEXELS*4;data.set(IDENTITY.elements,at);data[at+16]=data[at+21]=data[at+26]=1;}
  let restored=false,active=new Set(),uploaded=false,imported=null,outlineTransforms=null;
  const lastPlacementMatrices=new Map();
  const dirtyRows=new Set();frameTexture.onUpdate=()=>{uploaded=true;};
  const stats={mode:'GPU',vertices,lookupVertices:lookup.length,skippedVertices,bindingVertices:vertices-skippedVertices,frames:frames.length,cachedBindings:Boolean(reusable),updatedFrames:0,updatedBranches:0,uploadBytes:0};
  function changedFrame(f){
    stats.updatedFrames++;
    const first=Math.floor(f.index*TEXELS/frameTexture.image.width),last=Math.floor(((f.index+1)*TEXELS-1)/frameTexture.image.width);
    for(let row=first;row<=last;row++)dirtyRows.add(row);
  }
  const localTransform=new THREE.Matrix4();
  function setFrames(id,transform){
    for(const f of byBranch.get(id)||[]){
      const matrix=transform(f.t);
      localTransform.copy(f.record.inverse).multiply(matrix).multiply(f.record.local);write(f.index,localTransform);changedFrame(f);
    }
  }
  function setRigidFrames(id,matrix,cache){
    for(const f of byBranch.get(id)||[]){
      let values=cache.get(f.record);if(!values){values=packedMatrix(localTransform.copy(f.record.inverse).multiply(matrix).multiply(f.record.local));cache.set(f.record,values);}
      data.set(values,f.index*TEXELS*4);changedFrame(f);
    }
  }
  function setCurveFrames(id,before,after){
    const cache=new Map(),b=before.points,a=after.points,na=a.length-1;
    // On each pair of polyline segments the tangent rotation is constant and
    // translation is affine in t. Compute that basis once, not once per vertex.
    for(const f of byBranch.get(id)||[]){
      const bi=axisSegment(b,f.t).index,ai=axisSegment(a,f.t).index;
      let segments=cache.get(f.record);if(!segments){segments=new Map();cache.set(f.record,segments);}
      const key=bi*(na+1)+ai;let state=segments.get(key);
      if(!state){
        const q=new THREE.Quaternion().setFromUnitVectors(lineTangent(b,f.t),lineTangent(a,f.t)),r=new THREE.Matrix4().makeRotationFromQuaternion(q);
        const bt=axisTime(b,bi),at=axisTime(a,ai);
        const db=b[bi+1].clone().sub(b[bi]).divideScalar(Math.max(1e-15,axisTime(b,bi+1)-bt)),da=a[ai+1].clone().sub(a[ai]).divideScalar(Math.max(1e-15,axisTime(a,ai+1)-at));
        const origin=a[ai].clone().addScaledVector(da,-at).sub(b[bi].clone().addScaledVector(db,-bt).applyQuaternion(q));
        const slope=da.sub(db.applyQuaternion(q));
        r.setPosition(origin);localTransform.copy(f.record.inverse).multiply(r).multiply(f.record.local);
        state={values:packedMatrix(localTransform),origin:new THREE.Vector3().setFromMatrixPosition(localTransform),slope:slope.applyMatrix3(new THREE.Matrix3().setFromMatrix4(f.record.inverse))};segments.set(key,state);
      }
      const at=f.index*TEXELS*4;data.set(state.values,at);
      data[at+12]=state.origin.x+state.slope.x*f.t;data[at+13]=state.origin.y+state.slope.y*f.t;data[at+14]=state.origin.z+state.slope.z*f.t;changedFrame(f);
    }
  }
  function resetInactive(next){const cache=new Map();for(const id of active)if(!next.has(id))setRigidFrames(id,IDENTITY,cache);active=next;}
  function finish(){
    stats.updatedBranches=active.size;
    if(!stats.updatedFrames)return;
    if(uploaded){
      // Upload changed rows only. Ranges are RGBA component offsets and must
      // never cross a texture row; keep pending rows across multiple edits
      // before the next render so moving back to rest also reaches the GPU.
      for(const row of dirtyRows)frameTexture.addUpdateRange(row*frameTexture.image.width*4,frameTexture.image.width*4);
      stats.uploadBytes=dirtyRows.size*frameTexture.image.width*16;
    }else{frameTexture.clearUpdateRanges();stats.uploadBytes=data.byteLength;}
    dirtyRows.clear();frameTexture.needsUpdate=true;
  }
  const delta=new THREE.Matrix4(),rotation=new THREE.Quaternion(),from=new THREE.Vector3(),to=new THREE.Vector3();
  function deformedVertex(record,instance,index,target=new THREE.Vector3()){
    const g=record.geometry,saved=record.instances[instance],center=g.getAttribute('sampleCenter');target.fromBufferAttribute(g.getAttribute('position'),index);
    if(center){const r=saved.descriptor?.radius??1;target.set(center.getX(index)+(target.x-center.getX(index))*r,center.getY(index)+(target.y-center.getY(index))*r,center.getZ(index)+(target.z-center.getZ(index))*r);}
    target.applyMatrix4(saved.matrix);if(saved.inactive)return target;const at=lookup[saved.offset+index]*TEXELS*4,x=target.x,y=target.y,z=target.z;
    return target.set(data[at]*x+data[at+4]*y+data[at+8]*z+data[at+12],data[at+1]*x+data[at+5]*y+data[at+9]*z+data[at+13],data[at+2]*x+data[at+6]*y+data[at+10]*z+data[at+14]);
  }
  const normalMatrix=new THREE.Matrix3(),axis=new THREE.Vector3(),along=new THREE.Vector3();
  function deformedNormal(record,instance,index,target=new THREE.Vector3()){
    const g=record.geometry,saved=record.instances[instance],center=g.getAttribute('sampleCenter'),tangent=g.getAttribute('sampleTangent');target.fromBufferAttribute(g.getAttribute('normal'),index);
    if(center&&tangent){axis.fromBufferAttribute(tangent,index);along.copy(axis).multiplyScalar(target.dot(axis));target.sub(along).divideScalar(saved.descriptor?.radius??1).add(along);}
    target.applyMatrix3(normalMatrix.getNormalMatrix(saved.matrix));if(saved.inactive)return target.normalize();const at=lookup[saved.offset+index]*TEXELS*4+16,x=target.x,y=target.y,z=target.z;
    return target.set(data[at]*x+data[at+4]*y+data[at+8]*z,data[at+1]*x+data[at+5]*y+data[at+9]*z,data[at+2]*x+data[at+6]*y+data[at+10]*z).normalize();
  }
  function restore(){
    if(restored)return;restored=true;imported?.restore();
    markNativeModelChanged(asset);
    for(const r of records){if(!r.installed)continue;const mesh=r.mesh;delete mesh.__branchForgeNativeEdit;mesh.geometry.dispose();mesh.geometry=r.geometry;mesh.material=r.material;mesh.customDepthMaterial=r.depth;mesh.customDistanceMaterial=r.distance;mesh.raycast=r.raycast;mesh.frustumCulled=r.frustumCulled;}
    materials.forEach(m=>m.dispose());lookupTexture.dispose();frameTexture.dispose();
    if(asset.activeEditPreview===preview)delete asset.activeEditPreview;
  }
  let nativeTextures=null;
  const preview={stats,restore,
    // Only this installed palette owns this capability. Derived previews with
    // extra asynchronous geometry must declare their own invalidation contract.
    get nativeTextures(){return restored?null:nativeTextures;},
    // Complete-unit brushes provide only rigid/uniform-scale placements. Avoid
    // comparing every curve and packing the same family matrix once per twig.
    // Matrices can be updated in place, so remember their values, not references.
    updateTransforms(transforms){
      if(restored)return;if(imported){const changed=new Map();for(const [id,b]of snapshot){const m=transforms.get(id)?.matrix;if(m){const q=new THREE.Quaternion().setFromRotationMatrix(m),scale=new THREE.Vector3().setFromMatrixScale(m).x;const points=cloneAxis(b.points,p=>p.clone().applyMatrix4(m)),mount=transportMountFrames(b,points,m)||{mountMatrix:m.clone().multiply(b.mountMatrix||new THREE.Matrix4())};changed.set(id,{...b,...mount,points,startRadius:b.startRadius*scale,endRadius:b.endRadius*scale,trunkQuaternion:undefined});}}transforms=imported.update(changed,transforms)||transforms;}stats.updatedFrames=0;
      outlineTransforms=transforms;const next=new Set([...transforms.keys()].filter(id=>byBranch.has(id))),matrixCaches=new Map();
      for(const id of active)if(!next.has(id))lastPlacementMatrices.delete(id);
      resetInactive(next);
      for(const id of next){
        const matrix=transforms.get(id).matrix,previous=lastPlacementMatrices.get(id);
        if(previous?.equals(matrix))continue;
        let cache=matrixCaches.get(matrix);if(!cache){cache=new Map();matrixCaches.set(matrix,cache);}
        setRigidFrames(id,matrix,cache);
        if(previous)previous.copy(matrix);else lastPlacementMatrices.set(id,matrix.clone());
      }
      finish();
    },
    updateRigid(matrix,branchIds){
      if(restored)return;if(imported){const transforms=new Map([...branchIds].map(id=>[id,{matrix}]));preview.updateTransforms(transforms);return;}lastPlacementMatrices.clear();stats.updatedFrames=0;const next=new Set([...branchIds].filter(id=>byBranch.has(id)));resetInactive(next);
      const cache=new Map();for(const id of next)setRigidFrames(id,matrix,cache);finish();
    },
    update(updated,rigidTransforms=null){
      if(restored)return;rigidTransforms=imported?.update(updated,rigidTransforms)||rigidTransforms;outlineTransforms=rigidTransforms;lastPlacementMatrices.clear();stats.updatedFrames=0;const next=new Set();
      for(const id of byBranch.keys())if(rigidTransforms?.has(id)||!sameCurve(snapshot.get(id),updated.get(id)||snapshot.get(id)))next.add(id);
      resetInactive(next);
      for(const id of next){
        const before=snapshot.get(id),after=updated.get(id)||before,rigid=rigidTransforms?.get(id)
          || (after.sculptFollowMatrix ? {matrix:after.sculptFollowMatrix} : null);
        if(!rigid){setCurveFrames(id,before,after);continue;}
        if(!rigid.at){setRigidFrames(id,rigid.matrix,new Map());continue;}
        setFrames(id,t=>{
          const explicit=rigid?.at?rigid.at(t):rigid;if(explicit)return explicit.matrix;
          from.copy(sampleLine(before.points,t));to.copy(sampleLine(after.points,t));rotation.setFromUnitVectors(lineTangent(before.points,t),lineTangent(after.points,t));
          delta.makeRotationFromQuaternion(rotation);from.applyMatrix4(delta);delta.setPosition(to.sub(from));return delta;
        });
      }
      finish();
    },
    outlineBranches(branches){if(restored||!imported||!outlineTransforms?.size)return branches;return branches.map(b=>{const motion=outlineTransforms.get(b.id),before=snapshot.get(b.id);return motion?.matrix&&!motion.at&&before?{...b,points:cloneAxis(before.points,p=>p.clone().applyMatrix4(motion.matrix))}:b;});},
    vertex(mesh,index,instance=0){if(mesh.userData.imported_trunk)return imported?.vertex(mesh,index)||null;const record=records.find(r=>r.mesh===mesh);return record?deformedVertex(record,instance,index):null;},
    normal(mesh,index,instance=0){if(mesh.userData.imported_trunk)return imported?.normal(mesh,index)||null;const record=records.find(r=>r.mesh===mesh);return record&&record.geometry.hasAttribute('normal')?deformedNormal(record,instance,index):null;},
    get textures(){return [lookupTexture,frameTexture];},
  };
  try{
    for(const r of records){
      if(!r.frames.size)continue;
      const mesh=r.mesh,g=cloneNativePreviewGeometry(r.geometry),vertex=new Float32Array(r.vertexCount);for(let i=0;i<vertex.length;i++)vertex[i]=i;
      g.setAttribute('duckEditVertex',new THREE.BufferAttribute(vertex,1));
      if(mesh.isInstancedMesh)g.setAttribute('duckEditInstance',new THREE.InstancedBufferAttribute(new Float32Array(r.instances.map(i=>i.offset)),1));
      const uniforms={duckEditLookup:{value:lookupTexture},duckEditFrames:{value:frameTexture},duckEditLookupSize:{value:new THREE.Vector2(lookupTexture.image.width,lookupTexture.image.height)},duckEditFrameSize:{value:new THREE.Vector2(frameTexture.image.width,frameTexture.image.height)},duckEditOffset:{value:r.offset},duckEditInfluences:{value:1}};
      const wrap=source=>{const m=shaderMaterial(source,uniforms,mesh.isInstancedMesh);materials.push(m);return m;};
      mesh.geometry=g;r.installed=true;mesh.__branchForgeNativeEdit={lookupTexture,frameTexture,offsets:r.instances.map(i=>i.offset)};mesh.material=Array.isArray(r.material)?r.material.map(wrap):wrap(r.material);
      const depth=r.depth||new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),distance=r.distance||new THREE.MeshDistanceMaterial();
      mesh.customDepthMaterial=wrap(depth);mesh.customDistanceMaterial=wrap(distance);
      if(!r.depth)depth.dispose();if(!r.distance)distance.dispose();mesh.frustumCulled=false;
      // Shader-only displacement is invisible to Three's CPU raycaster. Bake
      // candidate copies lazily when a pick is requested, never on pointermove.
      mesh.raycast=(ray,hits)=>{
        for(let n=0;n<r.instances.length;n++){
          const pickGeometry=r.geometry.clone(),positions=pickGeometry.getAttribute('position'),normals=pickGeometry.getAttribute('normal');
          for(let i=0;i<positions.count;i++){deformedVertex(r,n,i,point);positions.setXYZ(i,point.x,point.y,point.z);if(normals){deformedNormal(r,n,i,point);normals.setXYZ(i,point.x,point.y,point.z);}}
          pickGeometry.computeBoundingBox();pickGeometry.computeBoundingSphere();
          const pick=new THREE.Mesh(pickGeometry,r.material);pick.matrixWorld.copy(mesh.matrixWorld);
          const local=[];pick.raycast(ray,local);for(const hit of local){hit.object=r.instances[n].descriptor?.object?.()||mesh;if(mesh.isInstancedMesh)hit.instanceId=n;hits.push(hit);}pickGeometry.dispose();
        }
      };
    }
    imported=createImportedTrunkPreview(asset,snapshot,{affected,texture,shaderMaterial,limit,anchorFollowers});stats.importedFrames=imported?.frames||0;nativeTextures=Object.freeze([...(records.some(r=>r.installed)?[lookupTexture,frameTexture]:[]),...(imported?.textures||[])]);
    markNativeModelChanged(asset);asset.activeEditPreview=preview;return preview;
  }catch(error){restore();throw error;}
}
