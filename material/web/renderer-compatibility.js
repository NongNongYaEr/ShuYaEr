import {Renderer} from './renderer.js';

// Keep startup and the base material passes small enough for older WebGL2 GPUs.
const BASIC_FRAGMENT=`#version 300 es
precision highp float;
precision highp sampler2D;
in vec3 vP,vN,vGrowth,vFlowPosition,vFlowAcross,vFlowAxis;
in vec2 vUV,vSourceUV,vMask1;
in vec4 vT,vMask0;
in float vAO,vSculpt;
out vec4 outColor;
uniform sampler2D uBark,uOriginal,uHeightMap,uRoughMap,uNormalMap,uBakedColor,uBakedNormal,uBakedORM,uMaskMap0,uMaskMap1;
uniform vec3 uTint,uOriginalFactor,uEye;
uniform bool uBake,uBakedPreview,uHasBakedEmission,uHasHeightMap,uHasRoughMap,uHasNormalMap,uHeightWithNormal,uHasBarkFlow,uPixelMasks,uSurfacePreview;
uniform float uBakedEmissionStrength,uDirectional,uDirectionMode,uSeed,uBarkAspect,uBarkScale,uBump,uNormalStrength,uNormalY,uRough,uVariation,uAOAmount,uOriginalMix,uRelief,uDetail,uBarkRelief,uBarkCavity,uLightMode;
uniform int uPass,uBarkStyle,uMaskChannel;
uniform vec4 uLayerParams[6];
uniform float uLayerSeed[6];
vec3 unit(vec3 v,vec3 fallback){float d=dot(v,v);return d>1e-12?v*inversesqrt(d):fallback;}
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
vec3 fromSRGB(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 toSRGB(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
mat3 barkFrame(){
 if(uDirectional<.5||uDirectionMode<1.5)return mat3(1.);
 vec3 y=unit(uHasBarkFlow&&uDirectionMode>2.5?vFlowAxis:vGrowth,vec3(0,1,0));
 vec3 side=abs(y.x)<.8?vec3(1,0,0):vec3(0,0,1);
 vec3 x=unit(side-y*dot(side,y),vec3(1,0,0));
 return mat3(x,y,unit(cross(x,y),vec3(0,0,1)));
}
vec2 tile(vec2 p){return vec2(p.x,p.y*uBarkAspect);}
vec3 sampleMap(sampler2D image,vec3 p,vec3 w){
 return texture(image,tile(p.zy)).rgb*w.x+texture(image,tile(p.xz)).rgb*w.y+texture(image,tile(p.xy)).rgb*w.z;
}
vec3 normalGradient(vec3 p,vec3 w){
 vec3 x=texture(uNormalMap,tile(p.zy)).rgb*2.-1.;
 vec3 y=texture(uNormalMap,tile(p.xz)).rgb*2.-1.;
 vec3 z=texture(uNormalMap,tile(p.xy)).rgb*2.-1.;
 return vec3(0,x.y*uNormalY,x.x)*w.x/max(x.z,.1)+
        vec3(y.x,0,y.y*uNormalY)*w.y/max(y.z,.1)+
        vec3(z.x,z.y*uNormalY,0)*w.z/max(z.z,.1);
}
vec3 heightGradient(float h,vec3 T,vec3 B){
 vec3 dx=dFdx(vP),dy=dFdy(vP);
 vec2 a=vec2(dot(dx,T),dot(dx,B)),b=vec2(dot(dy,T),dot(dy,B));
 float det=a.x*b.y-a.y*b.x;
 if(abs(det)<1e-12)return vec3(0);
 float dhx=dFdx(h),dhy=dFdy(h);
 return ((dhx*b.y-dhy*a.y)*T+(dhy*a.x-dhx*b.x)*B)/det;
}
void main(){
 vec3 N=unit(vN,vec3(0,0,1));
 if(uPass==7){outColor=vec4(1./255.,0,0,1);return;}
 if(uPass==6){vec2 g=abs(fract(vUV*16.)-.5);outColor=vec4(mix(vec3(.16),vec3(.45,.62,.35),step(.07,min(g.x,g.y))),1);return;}
 if(uPass==8){
  vec4 a=uPixelMasks?texture(uMaskMap0,vUV):vMask0;
  vec2 b=uPixelMasks?texture(uMaskMap1,vUV).xy:vMask1;
  int id=clamp(uMaskChannel,0,5);float m=id<4?a[id]:b[id-4];
  outColor=vec4(mix(vec3(.12),vec3(.75,.9,.35),m),1);return;
 }
 if(uPass==9){outColor=vec4(abs(unit(uDirectional>.5&&uDirectionMode>2.5&&uHasBarkFlow?vFlowAxis:vGrowth,vec3(0,1,0))),1);return;}
 if(uPass==12&&uSurfacePreview){outColor=vec4(vec3(texture(uBakedORM,vUV).r),1);return;}
 if(uPass==15){outColor=vec4(mix(vec3(.12),vec3(.94,.7,.2),clamp(vSculpt,0.,1.)),1);return;}
 mat3 frame=barkFrame();
 bool flow=uDirectional>.5&&uDirectionMode>2.5&&uHasBarkFlow;
 vec3 coordinates=flow?vFlowPosition:transpose(frame)*vP;
 vec3 projected=flow&&uDirectionMode>4.5?unit(vFlowAcross,transpose(frame)*N):transpose(frame)*N;
 vec3 w=pow(abs(projected),vec3(5));w/=max(dot(w,vec3(1)),.0001);
 if(uPass==13){outColor=vec4(w,1);return;}
 bool baked=uBakedPreview&&!uBake&&uPass!=3;
 if(uPass==11||uPass==12||uPass==14){
  vec3 emission=baked&&uPass==14&&uHasBakedEmission?texture(uOriginal,vUV).rgb:vec3(0);
  outColor=vec4(emission,1);return;
 }
 vec3 p=coordinates*uBarkScale+vec3(uSeed*.731,uSeed*.31,uSeed*.517);
 vec3 bark=sampleMap(uBark,p,w),color=bark*uTint;
 float lum=dot(bark,vec3(.2126,.7152,.0722));
 color=mix(color,toSRGB(fromSRGB(texture(uOriginal,vSourceUV).rgb)*uOriginalFactor)*uTint,uOriginalMix);
 float grain=hash(floor(vP*vec3(7,5,7))+uSeed+uLayerSeed[5])-.5;
 float agingMask=uPixelMasks?texture(uMaskMap1,vUV).g:vMask1.y;
 color=clamp(color*(1.+grain*uVariation*uLayerParams[5].x*uLayerParams[5].y*agingMask),0.,1.);
 float rough=uHasRoughMap?clamp(sampleMap(uRoughMap,p,w).r*uRough,.1,1.):clamp(uRough+(lum-.45)*.12+grain*.08,.12,1.);
 float h=uHasHeightMap?sampleMap(uHeightMap,p,w).r:lum*.85;
 if(uBarkStyle==1){h*=.28;color=mix(color,vec3(lum)*uTint,.2);}
 if(uBarkStyle==2){float cracks=pow(1.-abs(grain*2.),7.);h-=cracks*.5;color*=1.-cracks*.32;rough=min(1.,rough+cracks*.06);}
 if(uBarkStyle==3){float plates=smoothstep(.38,.62,hash(floor(p*3.)+uSeed));h+=plates*.25;color*=.8+plates*.28;}
 float ao=mix(1.,vAO,uAOAmount)*(uHasHeightMap?1.-uBarkCavity*uAOAmount*.28*(1.-h):1.);
 if(baked){vec3 orm=texture(uBakedORM,vUV).rgb;color=texture(uBakedColor,vUV).rgb;rough=orm.g;ao=orm.r;}
 if(uPass==0){outColor=vec4(color,1);return;}
 if(uPass==2){outColor=vec4(clamp(ao,0.,1.),rough,0,1);return;}
 if(uPass==4){outColor=vec4(vec3(rough),1);return;}
 if(uPass==5){outColor=vec4(vec3(ao),1);return;}
 vec3 T=unit(vT.xyz-N*dot(N,vT.xyz),vec3(1,0,0)),B=unit(cross(N,T),vec3(0,1,0))*vT.w;
 vec3 bumped=N;
 if(baked){
  vec3 n=texture(uBakedNormal,vUV).rgb*2.-1.;
  bumped=unit(T*n.x+B*n.y+N*n.z,N);
 }else if(uPass!=3){
  vec3 reference=uHasNormalMap?frame*normalGradient(p,w):vec3(0);
  reference-=N*dot(reference,N);
  float relief=uHasNormalMap&&!uHeightWithNormal?(uHasHeightMap?uBarkRelief:0.):uRelief;
  vec3 gradient=relief*heightGradient(h+uDetail*.035*lum,T,B);
  bumped=unit(N+uBump*uNormalStrength*(reference-gradient),N);
 }
 if(uPass==1){outColor=vec4(unit(vec3(dot(bumped,T),dot(bumped,B),dot(bumped,N)),vec3(0,0,1))*.5+.5,1);return;}
 vec3 V=unit(uEye-vP,vec3(0,0,1)),side=unit(cross(vec3(0,1,0),V),vec3(1,0,0));
 vec3 L=normalize(uLightMode>.5?side+V*.12+vec3(0,.08,0):vec3(.6,.8,.7));
 float diffuse=max(dot(bumped,L),0.),fill=max(dot(bumped,normalize(vec3(-.7,.4,-.8))),0.);
 vec3 albedo=(uPass==3||uPass==10)?vec3(.42):fromSRGB(color);
 vec3 lit=albedo*(.22+.7*diffuse+.18*fill)*mix(.5,1.,ao);
 if(baked&&uHasBakedEmission&&uPass==-1)lit+=fromSRGB(texture(uOriginal,vUV).rgb)*uBakedEmissionStrength;
 outColor=vec4(toSRGB(clamp(lit,0.,1.)),1);
}`;

export class CompatibilityRenderer extends Renderer{
 graphicsMaterialProfile='basic';
 compile(vertex,fragment){
  return super.compile(vertex,fragment.includes('Surface surface(')?BASIC_FRAGMENT:fragment);
 }
}

export function basicImportSettings(settings){
 return {...settings,mossEnabled:false,paintEnabled:false,lichenEnabled:false,dirtEnabled:false,wetEnabled:false};
}

export function assertBasicMaterialExport(project,settings,renderer){
 const authored=project.surface?.active&&project.surface.effects.some(effect=>effect.enabled!==false&&effect.opacity>0);
 const coatings=project.layers.some(layer=>layer.id!=='aging'&&layer.enabled&&layer.opacity>0&&settings[layer.id+'Enabled']);
 const unsupported=[
  (authored||coatings)&&'高级图层（含发光）',
  project.partMaterials?.some(binding=>binding.enabled)&&'分区材质',
  renderer.localPatchCompilation?.descriptors?.length&&'贴花',
  project.microdetail?.enabled&&'近景细节',
 ].filter(Boolean);
 if(unsupported.length){
  throw Error('当前工程含'+unsupported.join('、')+'。请用 DX12 导出完整贴图，或在工作副本中关闭这些效果后导出基础贴图。');
 }
}
