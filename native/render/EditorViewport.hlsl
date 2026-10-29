// Editor scene inputs use the same column-major matrices and linear colors as
// the authoring viewport. Only the final display pass applies tone mapping.
cbuffer Frame : register(b0) {
  float4x4 viewProjection, previousViewProjection, lightViewProjection;
  float4 cameraPosition, keyDirection, keyColor, rimDirection, rimColor;
  float4 skyColor, earthColor, backgroundColor, fogAndExposure, jitterAndSize;
};
cbuffer Draw : register(b1) {
  float4x4 world, previousWorld, normalWorld;
  float4 diffuse, surface, flags, normalScale;
  float4 colorUv0, colorUv1, normalUv0, normalUv1, roughUv0, roughUv1, motionParameters, emissive;
  float4 metalUv0,metalUv1,aoUv0,aoUv1,emissiveUv0,emissiveUv1,pbrParameters;
};
Texture2D colorMap : register(t0);
Texture2D normalMap : register(t1);
Texture2D roughMap : register(t2);
Texture2D<float> shadowMap : register(t3);
struct Instance { float4x4 placement; float4x4 previous; float4 parameters; float4x4 normalPlacement; };
StructuredBuffer<Instance> instances : register(t4);
StructuredBuffer<float> editLookup : register(t5);
StructuredBuffer<float4> editFrames : register(t6);
Texture2D metalMap : register(t7);
Texture2D aoMap : register(t8);
Texture2D emissiveMap : register(t9);
SamplerState surfaceSampler : register(s0);
SamplerState clampWrapSampler : register(s1);
SamplerState mirrorWrapSampler : register(s2);
SamplerState wrapClampSampler : register(s3);
SamplerState clampSampler : register(s4);
SamplerState mirrorClampSampler : register(s5);
SamplerState wrapMirrorSampler : register(s6);
SamplerState clampMirrorSampler : register(s7);
SamplerState mirrorSampler : register(s8);
SamplerComparisonState shadowSampler : register(s9);
struct Vertex { float3 position:POSITION; float3 normal:NORMAL; float2 uv:TEXCOORD0; float4 color:COLOR0; float3 center:TEXCOORD1; float3 tangent:TEXCOORD2; };
struct Varying { float4 position:SV_Position; float3 location:POSITION0; float3 normal:NORMAL; float2 uv:TEXCOORD0; float4 color:COLOR0; float4 current:TEXCOORD1; float4 previous:TEXCOORD2; float4 light:TEXCOORD3; };
Varying vertexMain(Vertex v, uint instance:SV_InstanceID, uint vertex:SV_VertexID) {
  Varying o; Instance item=instances[instance];
  float3 p=v.position, n=v.normal;
  if(flags.y>0) { p=v.center+(p-v.center)*item.parameters.x;float3 along=v.tangent*dot(n,v.tangent);n=normalize(along+(n-along)/max(.0001,item.parameters.x)); }
  float4 local=mul(item.placement,float4(p,1));
  float4 before=mul(motionParameters.x>0?item.previous:item.placement,float4(p,1));
  n=mul((float3x3)item.normalPlacement,n);
  if(flags.z>0) {
    uint slot=vertex*(flags.z>1.5?3:1)+(uint)item.parameters.y;
    uint at=(uint)editLookup[slot]*7;
    float4x4 edit=transpose(float4x4(editFrames[at],editFrames[at+1],editFrames[at+2],editFrames[at+3]));
    float3x3 editNormal=transpose(float3x3(editFrames[at+4].xyz,editFrames[at+5].xyz,editFrames[at+6].xyz));
    if(flags.z>1.5){uint other=(uint)editLookup[slot+1]*7;float weight=editLookup[slot+2];edit=lerp(edit,transpose(float4x4(editFrames[other],editFrames[other+1],editFrames[other+2],editFrames[other+3])),weight);editNormal=lerp(editNormal,transpose(float3x3(editFrames[other+4].xyz,editFrames[other+5].xyz,editFrames[other+6].xyz)),weight);}
    local=mul(edit,local);before=local;
    n=mul(editNormal,n);
  }
  float4 position=mul(world,local);
  o.location=position.xyz; o.normal=normalize(mul((float3x3)normalWorld,n));
  o.current=mul(viewProjection,position);o.previous=mul(previousViewProjection,mul(previousWorld,before));
  o.position=o.current;o.position.xy+=jitterAndSize.xy*o.position.w;
  o.light=mul(lightViewProjection,position);o.uv=v.uv;o.color=v.color;
  return o;
}
float2 uvTransform(float2 uv,float4 a,float4 b) { return float2(dot(float3(uv,1),a.xyz),dot(float3(uv,1),b.xyz)); }
float wrapCoordinate(float value,uint mode){if(mode==1)return saturate(value);if(mode==2)return 1-abs(1-frac(value*.5)*2);return frac(value);}
float4 surfaceSample(Texture2D image,float2 uv,float4 a,float4 b){
  uint u=(uint)a.w%3,v=(uint)b.w%3;float lod=image.CalculateLevelOfDetailUnclamped(surfaceSampler,uv);
  if((lod>0?b.w:a.w)>=3){uint width,height;image.GetDimensions(width,height);float2 wrapped=float2(wrapCoordinate(uv.x,u),wrapCoordinate(uv.y,v));return image.Load(int3(min(uint2(wrapped*float2(width,height)),uint2(width-1,height-1)),0));}
  switch(u+v*3){
    case 1:return image.Sample(clampWrapSampler,uv);case 2:return image.Sample(mirrorWrapSampler,uv);
    case 3:return image.Sample(wrapClampSampler,uv);case 4:return image.Sample(clampSampler,uv);case 5:return image.Sample(mirrorClampSampler,uv);
    case 6:return image.Sample(wrapMirrorSampler,uv);case 7:return image.Sample(clampMirrorSampler,uv);case 8:return image.Sample(mirrorSampler,uv);
    default:return image.Sample(surfaceSampler,uv);
  }
}
float3 srgbLinear(float3 c) { return lerp(c/12.92,pow((c+.055)/1.055,2.4),step(.04045,c)); }
float4 albedo(Varying i) {
  float4 c=diffuse;
  if(flags.x>0) {float4 t=surfaceSample(colorMap,uvTransform(i.uv,colorUv0,colorUv1),colorUv0,colorUv1); if(normalScale.z>0)t.rgb=srgbLinear(t.rgb);c*=t;}
  if(flags.w>0)c*=i.color;
  clip(c.a-surface.z);return c;
}
float shadow(Varying i) {
  if(surface.w<.5)return 1;
  float3 p=i.light.xyz/i.light.w;float2 uv=float2(p.x*.5+.5,.5-p.y*.5);
  if(any(uv<0)||any(uv>1)||p.z<0||p.z>1)return 1;
  float s=0;[unroll]for(int y=-1;y<=1;y++)[unroll]for(int x=-1;x<=1;x++)s+=shadowMap.SampleCmpLevelZero(shadowSampler,uv+float2(x,y)/2048.,p.z-.0004);
  return s/9;
}
float3 lightBrdf(float3 base,float rough,float metal,float3 n,float3 v,float3 l,float3 radiance) {
  float3 h=normalize(v+l);float nl=saturate(dot(n,l)),nv=max(.001,dot(n,v)),nh=saturate(dot(n,h)),vh=saturate(dot(v,h));
  float a=rough*rough,a2=a*a,d=nh*nh*(a2-1)+1,D=a2/max(.00001,3.14159265*d*d),k=(rough+1)*(rough+1)/8;
  float g=nv/(nv*(1-k)+k)*nl/(nl*(1-k)+k);float3 f0=lerp(.04.xxx,base,metal),f=f0+(1-f0)*pow(1-vh,5);
  return ((1-f)*(1-metal)*base/3.14159265+f*(D*g/max(.001,4*nv*nl)))*radiance*nl;
}
struct Pixel { float4 color:SV_Target0; float2 motion:SV_Target1; };
Pixel pixelMain(Varying i,bool front:SV_IsFrontFace) {
  Pixel o;float4 base=albedo(i);float3 n=normalize(i.normal)*(front?1:-1);
  if(((uint)normalScale.w&1)>0) {
    float2 uv=uvTransform(i.uv,normalUv0,normalUv1);float3 q1=ddx(i.location),q2=ddy(i.location);float2 st1=ddx(uv),st2=ddy(uv);
    float3 t=q1*st2.y-q2*st1.y,b=-q1*st2.x+q2*st1.x;float inv=rsqrt(max(dot(t,t),dot(b,b))+.0000001);t*=inv;b*=inv;
    float3 sampled=surfaceSample(normalMap,uv,normalUv0,normalUv1).xyz*2-1;sampled.xy*=normalScale.xy;n=normalize(t*sampled.x+b*sampled.y+n*sampled.z);
  }
  float rough=surface.x;if(((uint)normalScale.w&2)>0)rough*=surfaceSample(roughMap,uvTransform(i.uv,roughUv0,roughUv1),roughUv0,roughUv1).g;
  float metal=surface.y;if(((uint)pbrParameters.z&1)>0)metal*=surfaceSample(metalMap,uvTransform(i.uv,metalUv0,metalUv1),metalUv0,metalUv1).b;
  float ao=1;if(((uint)pbrParameters.z&2)>0)ao=lerp(1,surfaceSample(aoMap,uvTransform(i.uv,aoUv0,aoUv1),aoUv0,aoUv1).r,pbrParameters.x);
  float3 emission=emissive.rgb;if(((uint)pbrParameters.z&4)>0){float3 e=surfaceSample(emissiveMap,uvTransform(i.uv,emissiveUv0,emissiveUv1),emissiveUv0,emissiveUv1).rgb;if(pbrParameters.y>0)e=srgbLinear(e);emission*=e;}
  rough=clamp(rough,.045,1);float3 v=normalize(cameraPosition.xyz-i.location);
  float3 c=base.rgb*lerp(earthColor.rgb,skyColor.rgb,n.z*.5+.5)*.318309886*ao;
  c+=lightBrdf(base.rgb,rough,metal,n,v,keyDirection.xyz,keyColor.rgb)*shadow(i);
  c+=lightBrdf(base.rgb,rough,metal,n,v,rimDirection.xyz,rimColor.rgb);
  c+=emission;
  if(surface.y<0)c=base.rgb; // Unlit grid/lines retain authored colors.
  float fog=saturate((distance(cameraPosition.xyz,i.location)-fogAndExposure.x)/max(.0001,fogAndExposure.y-fogAndExposure.x));
  o.color=float4(lerp(c,backgroundColor.rgb,fog),base.a);
  float2 current=i.current.xy/i.current.w,previous=i.previous.xy/i.previous.w;
  o.motion=(previous-current)*float2(.5,-.5);return o;
}
void shadowPixel(Varying i) { albedo(i); }
float4 shadowVertex(Vertex v,uint instance:SV_InstanceID,uint vertex:SV_VertexID):SV_Position { return vertexMain(v,instance,vertex).light; }
Varying shadowVertexMain(Vertex v,uint instance:SV_InstanceID,uint vertex:SV_VertexID) { Varying o=vertexMain(v,instance,vertex);o.position=o.light;return o; }
struct Screen { float4 p:SV_Position;float2 uv:TEXCOORD0; };
Screen screenVertex(uint id:SV_VertexID) {Screen o;o.uv=float2((id<<1)&2,id&2);o.p=float4(o.uv*float2(2,-2)+float2(-1,1),0,1);return o;}
float3 aces(float3 c){c*=fogAndExposure.z;return saturate((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14));}
float4 screenPixel(Screen i):SV_Target {float3 c=aces(colorMap.SampleLevel(surfaceSampler,i.uv,0).rgb);c=lerp(c*12.92,1.055*pow(c,1/2.4)-.055,step(.0031308,c));return float4(c,1);}
