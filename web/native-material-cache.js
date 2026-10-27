import {DoubleSide,SRGBColorSpace} from './vendor/three.module.min.js';

// Private presentation records. No source material/texture fields or versions
// are replaced. Read all uniforms every frame, including edits that correctly
// do not set Material.needsUpdate in Three.js.
export function createNativeMaterialEncoder({textureKey}){
  const textures=new WeakMap(),materials=new WeakMap(),stamp=[];
  const white={r:1,g:1,b:1},black={r:0,g:0,b:0},empty={id:'',uv0:[1,0,0,0],uv1:[0,1,0,0]};let frame=0;
  function textureRecord(texture,role='color'){
    if(!texture)return empty;
    let state=textures.get(texture);if(!state)textures.set(texture,state={frame:-1,roles:new Map()});
    if(state.frame!==frame){
      state.frame=frame;if(texture.matrixAutoUpdate)texture.updateMatrix();
      const e=texture.matrix.elements,uv0=[e[0],e[3],e[6],0],uv1=[e[1],e[4],e[7],0];
      if(texture.flipY){uv1[0]*=-1;uv1[1]*=-1;uv1[2]=1-uv1[2];}
      state.uv0=uv0;state.uv1=uv1;
    }
    let roleState=state.roles.get(role);if(!roleState)state.roles.set(role,roleState={frame:-1,record:null});
    if(roleState.frame===frame)return roleState.record;
    roleState.frame=frame;const id=textureKey(texture,role)||'',old=roleState.record;
    if(!old||old.id!==id||state.uv0.some((v,i)=>v!==old.uv0[i])||state.uv1.some((v,i)=>v!==old.uv1[i]))roleState.record={id,uv0:state.uv0,uv1:state.uv1};
    return roleState.record;
  }
  return {
    beginFrame(){frame++;},
    encode(m){
      const map=textureRecord(m.map),normal=textureRecord(m.normalMap,'normal'),rough=textureRecord(m.roughnessMap),color=m.color||white,emissive=m.emissive||black;
      const r=color.r,g=color.g,b=color.b,opacity=m.opacity===undefined?1:m.opacity,roughness=m.roughness??.9,metalness=m.metalness??0,alphaTest=m.alphaTest||0,transparent=Boolean(m.transparent),intensity=m.emissiveIntensity??1,er=emissive.r*intensity,eg=emissive.g*intensity,eb=emissive.b*intensity,doubleSide=m.side===DoubleSide,wireframe=Boolean(m.wireframe),unlit=m.isMeshBasicMaterial||m.isLineBasicMaterial,vertexColors=Boolean(m.vertexColors),srgb=m.map?.colorSpace===SRGBColorSpace,normalX=m.normalScale?.x??1,normalY=m.normalScale?.y??1;
      stamp.length=0;stamp.push(r,g,b,opacity,roughness,metalness,alphaTest,transparent,er,eg,eb,doubleSide,wireframe,unlit,vertexColors,srgb,normalX,normalY,map,normal,rough);
      const previous=materials.get(m);if(previous&&stamp.every((v,i)=>v===previous.stamp[i]))return previous.record;
      const record={color:[r,g,b,opacity],roughness,metalness,alphaTest,transparent,emissive:[er,eg,eb,1],doubleSide,wireframe,unlit,vertexColors,map:map.id,normalMap:normal.id,roughnessMap:rough.id,srgb,normalX,normalY,uv0:map.uv0,uv1:map.uv1,normalUv0:normal.uv0,normalUv1:normal.uv1,roughUv0:rough.uv0,roughUv1:rough.uv1};
      materials.set(m,{stamp:stamp.slice(),record});return record;
    },
  };
}
