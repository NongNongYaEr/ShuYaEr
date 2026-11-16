// Uses the existing eight source-bounded patch descriptors. All physical height
// is normalized by tree height; coordinates never come from quantized masks.
export const BURL_SURFACE_GLSL=`
vec3 burlPanelBilinear(vec2 uv,int panel,int level){ivec2 size=textureSize(uBakedORM,level);bool grid=textureSize(uBakedORM,0).x>=8192;int side=grid?max(1,512>>level):max(1,size.x/2);int style=int(effectParameter(11,0.)+.5),cell=style*3+(panel==3?2:panel);ivec2 origin=grid?ivec2((cell%16)*side,max(1,1024>>level)+(cell/16)*side):ivec2((panel%2)*side,7*size.x+(panel/2)*side);vec2 q=clamp(uv,vec2(.5/float(side)),vec2(1.-.5/float(side)))*float(side)-.5,f=fract(q);ivec2 a=clamp(ivec2(floor(q)),ivec2(0),ivec2(side-1)),b=min(a+1,ivec2(side-1));return mix(mix(texelFetch(uBakedORM,origin+a,level).rgb,texelFetch(uBakedORM,origin+ivec2(b.x,a.y),level).rgb,f.x),mix(texelFetch(uBakedORM,origin+ivec2(a.x,b.y),level).rgb,texelFetch(uBakedORM,origin+b,level).rgb,f.x),f.y);}
vec3 burlPanel(vec2 uv,int panel){float side=textureSize(uBakedORM,0).x>=8192?512.:float(textureSize(uBakedORM,0).x)/2.,lod=clamp(log2(max(max(length(dFdx(uv)*side),length(dFdy(uv)*side)),1.)),0.,log2(side));int lo=int(floor(lod)),hi=min(lo+1,int(log2(side)));return mix(burlPanelBilinear(uv,panel,lo),burlPanelBilinear(uv,panel,hi),fract(lod));}
// Asset UV centerline of the spiral callus, before any decal projection transform.
float burlSpiralDistance(vec2 uv){
 const vec2 spine[12]=vec2[12](vec2(.397,.093),vec2(.372,.158),vec2(.272,.275),vec2(.242,.337),
   vec2(.263,.382),vec2(.427,.513),vec2(.608,.578),vec2(.665,.618),
   vec2(.720,.667),vec2(.737,.726),vec2(.710,.772),vec2(.493,.916));
 float nearest=1.;
 for(int j=0;j<11;j++){
  vec2 e=spine[j+1]-spine[j],d=uv-spine[j];
  d-=e*clamp(dot(d,e)/dot(e,e),0.,1.);
  nearest=min(nearest,dot(d,d));
 }
 return sqrt(nearest);
}
float burlDonorLum(vec3 premultiplied,float alpha){
 return dot(fromSRGB(clamp(premultiplied/max(alpha,.0001),0.,1.)),vec3(.2126,.7152,.0722));
}
Surface burlSurface(Surface s,vec3 p,vec3 n,float seed,vec3 receivingColor,float receivingRoughness){
 s.layerCoverage=0.;if(uPatchBits==0)return s;
 for(int i=0;i<8;i++){if(i>=uPatchCount)break;if((uPatchBits&(1<<i))==0||uPatchShape[i].x<4.5)continue;
  // The sign marks manual planar stamps while the magnitude addresses the layer.
  float owner=uPatchChannels[i].w;if(abs(abs(owner)-float(surfaceEffectSlot+1))>.1)continue;bool planar=owner<0.;
  vec3 delta=p-uPatchOrigin[i].xyz;vec2 q=vec2(dot(delta,uPatchU[i].xyz),dot(delta,uPatchV[i].xyz));float radius=length(q);
  if(planar?any(greaterThan(abs(q),vec2(1.))):radius>=1.)continue;
  float warp=effectParameter(10,.55),localSeed=uPatchShape[i].w+seed*.137,angle=atan(q.y,q.x),edgeWarp=(sin(angle*3.+localSeed)*.045+sin(angle*5.-localSeed*.7)*.025)*warp*(1.-radius*radius),r=radius+edgeWarp;
  vec2 stampUV=q*.5+.5;if(mod(localSeed,2.)>1.)stampUV.x=1.-stampUV.x;
  bool hasStamp=uCoatEnabled&&(textureSize(uBakedORM,0).x>=8192||textureSize(uBakedORM,0).y>=textureSize(uBakedORM,0).x*8);vec3 stampData=vec3(1,.5,.9),stampColor=vec3(0);float stampAO=1.;
  if(hasStamp){stampData=burlPanel(stampUV,1);stampColor=burlPanel(stampUV,0)/max(stampData.r,.0001);stampAO=burlPanel(stampUV,3).r;}
  float shapeAlpha=planar?1.:1.-smoothstep(1.-uPatchShape[i].y,1.,r);
  float projectedAlpha=shapeAlpha*(1.-smoothstep(.75,1.,abs(dot(delta,uPatchN[i].xyz))/max(uPatchOrigin[i].w,1e-7)));
  if(projectedAlpha<=0.)continue;
  float alpha=projectedAlpha*stampData.r;
  int style=int(effectParameter(11,0.)+.5);
  bool authoredKnot=hasStamp&&style==6;
  // The packed knot's dark endgrain is the material. Fade its donor bark collar.
  if(authoredKnot)alpha*=1.-smoothstep(.228,.292,length(stampUV-vec2(.495,.497)));
  bool domeStyle=style==0||style==7;
  int midLevel=domeStyle?5:3;
  float fusion=hasStamp&&!authoredKnot?clamp(effectParameter(13,0.),0.,1.):0.;
  vec3 midStamp=vec3(0),broadStamp=vec3(0);
  float heightResidual=0.,structure=1.,ribbonDistance=0.;
  if(fusion>0.){
   midStamp=burlPanelBilinear(stampUV,1,midLevel);broadStamp=burlPanelBilinear(stampUV,1,7);
   heightResidual=(midStamp.g-broadStamp.g)*smoothstep(.05,.5,min(midStamp.r,broadStamp.r));
   if(style==12){
    ribbonDistance=burlSpiralDistance(stampUV);
    structure=1.-smoothstep(.035,.085,ribbonDistance);
   }else structure=mix(.12,.92,smoothstep(.015,.12,abs(heightResidual)));
   if(domeStyle){
    // A smooth envelope keeps donor plate edges out of the height gradient.
    float domeAlpha=(1.-smoothstep(.48,.98,radius))*smoothstep(.06,.85,midStamp.r);
    alpha=mix(alpha,projectedAlpha*domeAlpha,fusion);
   }else alpha*=mix(1.,structure,fusion);
  }
  float amount=effectParameter(0,1.)*alpha;if(amount<=0.)continue;
  float rings=effectParameter(9,18.),phase=(r*rings+sin(angle*2.+r*5.+localSeed)*warp*.45)*6.28318530718,band=.5+.5*sin(phase)*clamp(1.-fwidth(phase)*.32,0.,1.),fine=noise(vec3(q*vec2(1./length(uPatchU[i].xyz),1./length(uPatchV[i].xyz))*uTreeHeight/max(effectParameter(4,.008),.001),localSeed)),broad=noise(vec3(q*4.,localSeed+11.)),dome=pow(max(0.,1.-r*r),1.7),rim=exp(-pow((r-.78)/.13,2.));
  float height=effectParameter(3,.012)/uTreeHeight,strength=effectParameter(2,1.),keep=mix(1.,effectParameter(7,.45),amount),variation=effectParameter(5,.45);vec3 tint=effectColor(vec3(.45,.34,.25));
  if(authoredKnot)keep=mix(1.,pow(effectParameter(7,.45),3.),amount);
  if(fusion>0.)keep=mix(keep,1.,.96*fusion);
  float twist=warp*(.65*exp(-r*r*3.)+.10*sin(angle*3.+localSeed)),ct=cos(twist),sn=sin(twist);vec2 turned=vec2(q.x*ct-q.y*sn,q.x*sn+q.y*ct),offset=turned-q;
  vec3 warpedP=p+normalize(uPatchU[i].xyz)*offset.x/length(uPatchU[i].xyz)+normalize(uPatchV[i].xyz)*offset.y/length(uPatchV[i].xyz);
  vec3 bark=barkMapSample(uBark,warpedP,n)*uTint,pigment=mix(bark,tint,.14)*(.94+band*.06+(fine-.5)*variation*.10+(broad-.5)*variation*.08);
  if(hasStamp)pigment=mix(bark,stampColor*clamp(tint/vec3(.455,.353,.251),vec3(0),vec3(3)),.92);
  float roughness=clamp(effectParameter(1,.9)+(hasStamp?stampData.b-.9:(fine-.5)*.08),.1,1.);
  if(authoredKnot){
   pigment=stampColor*clamp(tint/(vec3(116.,90.,64.)/255.),0.,3.);
   roughness=clamp(stampData.b+(effectParameter(1,.92)-.92),.1,1.);
  }
  if(fusion>0.){
   float midLum=burlDonorLum(burlPanelBilinear(stampUV,0,midLevel),midStamp.r);
   float broadLum=burlDonorLum(burlPanelBilinear(stampUV,0,7),broadStamp.r);
   float gain=pow(clamp(midLum/max(broadLum,.01),.42,1.8),.7);
   gain=mix(1.,gain,smoothstep(.05,.5,min(midStamp.r,broadStamp.r))*(style==12?1.:domeStyle?.26:.65));
   if(style==12){
    float ridge=ribbonDistance/.037;
    float shoulder=smoothstep(.03,.055,ribbonDistance)*(1.-smoothstep(.049,.08,ribbonDistance));
    gain*=1.+.27*exp(-ridge*ridge)-.08*shoulder;
   }
   vec3 matched=toSRGB(clamp(fromSRGB(clamp(receivingColor,0.,1.))*gain,0.,1.));
   matched*=clamp(tint/vec3(.455,.353,.251),0.,3.);
   pigment=toSRGB(mix(fromSRGB(clamp(pigment,0.,1.)),fromSRGB(clamp(matched,0.,1.)),fusion));
   float roughDelta=clamp((effectParameter(1,.9)-.9+midStamp.b-broadStamp.b)*.4,-.12,.12);
   roughness=mix(roughness,clamp(receivingRoughness+roughDelta,.1,1.),fusion);
  }
  float barkRelief=(barkHeight(warpedP,n)-.5)*uBarkRelief*.45;
  s.color=mix(s.color,pigment,amount);s.rough=mix(s.rough,roughness,amount);
  s.h*=keep;s.normalWeight*=keep;s.detailGradient*=keep;float relief=dome*(.9+broad*.2)+rim*.18+(band-.5)*.035*dome+(hasStamp?(stampData.g-.5)*.10:(fine-.5)*.012*dome);int kind=int(effectParameter(12,0.)+.5);if(style>0){float imageH=hasStamp?stampData.g-.5:(fine-.5)*.2,envelope=pow(max(0.,1.-r*r),1.2);if(kind==0)relief=dome*.7+imageH*.3;else if(kind==1)relief=imageH*.7-.12*envelope;else if(kind==2)relief=(exp(-pow((abs(q.x)-.27)/.15,2.))*.4-exp(-pow(q.x/.15,2.))*.28)*envelope+imageH*.25;else if(kind==3)relief=imageH*.12;else if(kind==4)relief=max(0.,stampData.g)*.45+imageH*.3;else relief=imageH*.5+.12*envelope;}if(style>0)barkRelief=0.;
  if(authoredKnot)relief=stampData.g-.5;
  if(fusion>0.){
   float ribbon=ribbonDistance/.047;
   float cleanRelief=style==12?.32*exp(-ribbon*ribbon)+clamp(heightResidual,-.10,.10)*.14:
     clamp(heightResidual*1.2,-.24,.24);
   if(domeStyle)cleanRelief=pow(max(0.,1.-radius*radius),1.7)*(style==0?.95:.7);
   relief=mix(relief,cleanRelief,fusion);barkRelief*=1.-fusion;
  }
  s.coatH=s.coatH*keep+amount*strength*(height*relief+barkRelief);
  if(uPass==-1||uPass==2||uPass==5||uPass==10){
   float ao=style==0?(1.-band)*.18+rim*.16+(hasStamp?1.-stampAO:0.):(hasStamp?1.-stampAO:0.)+(kind==1?(1.-stampData.g)*.25:0.);
   if(authoredKnot)ao=1.-stampAO;
   if(fusion>0.)ao=mix(ao,domeStyle?.10*max(0.,1.-radius*radius):ao*.28,fusion);
   s.localAO*=1.-amount*effectParameter(6,.4)*ao;
  }
  s.layerCoverage=1.-(1.-s.layerCoverage)*(1.-amount);
 }return s;
}
`;
