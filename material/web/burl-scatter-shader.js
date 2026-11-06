// Uses the existing eight source-bounded patch descriptors. All physical height
// is normalized by tree height; coordinates never come from quantized masks.
export const BURL_SURFACE_GLSL=`
vec3 burlPanelBilinear(vec2 uv,int panel,int level){ivec2 size=textureSize(uBakedORM,level);bool grid=textureSize(uBakedORM,0).x>=8192;int side=grid?max(1,512>>level):max(1,size.x/2);int style=int(effectParameter(11,0.)+.5),cell=style*3+(panel==3?2:panel);ivec2 origin=grid?ivec2((cell%16)*side,max(1,1024>>level)+(cell/16)*side):ivec2((panel%2)*side,7*size.x+(panel/2)*side);vec2 q=clamp(uv,vec2(.5/float(side)),vec2(1.-.5/float(side)))*float(side)-.5,f=fract(q);ivec2 a=clamp(ivec2(floor(q)),ivec2(0),ivec2(side-1)),b=min(a+1,ivec2(side-1));return mix(mix(texelFetch(uBakedORM,origin+a,level).rgb,texelFetch(uBakedORM,origin+ivec2(b.x,a.y),level).rgb,f.x),mix(texelFetch(uBakedORM,origin+ivec2(a.x,b.y),level).rgb,texelFetch(uBakedORM,origin+b,level).rgb,f.x),f.y);}
vec3 burlPanel(vec2 uv,int panel){float side=textureSize(uBakedORM,0).x>=8192?512.:float(textureSize(uBakedORM,0).x)/2.,lod=clamp(log2(max(max(length(dFdx(uv)*side),length(dFdy(uv)*side)),1.)),0.,log2(side));int lo=int(floor(lod)),hi=min(lo+1,int(log2(side)));return mix(burlPanelBilinear(uv,panel,lo),burlPanelBilinear(uv,panel,hi),fract(lod));}
Surface burlSurface(Surface s,vec3 p,vec3 n,float seed){
 s.layerCoverage=0.;if(uPatchBits==0)return s;
 for(int i=0;i<8;i++){if(i>=uPatchCount)break;if((uPatchBits&(1<<i))==0||uPatchShape[i].x<4.5||abs(uPatchChannels[i].w-float(surfaceEffectSlot+1))>.1)continue;
  vec3 delta=p-uPatchOrigin[i].xyz;vec2 q=vec2(dot(delta,uPatchU[i].xyz),dot(delta,uPatchV[i].xyz));float radius=length(q);if(radius>=1.)continue;
  float warp=effectParameter(10,.55),localSeed=uPatchShape[i].w+seed*.137,angle=atan(q.y,q.x),edgeWarp=(sin(angle*3.+localSeed)*.045+sin(angle*5.-localSeed*.7)*.025)*warp*(1.-radius*radius),r=radius+edgeWarp;
  vec2 stampUV=q*.5+.5;if(mod(localSeed,2.)>1.)stampUV.x=1.-stampUV.x;
  bool hasStamp=uCoatEnabled&&(textureSize(uBakedORM,0).x>=8192||textureSize(uBakedORM,0).y>=textureSize(uBakedORM,0).x*8);vec3 stampData=vec3(1,.5,.9),stampColor=vec3(0);float stampAO=1.;
  if(hasStamp){stampData=burlPanel(stampUV,1);stampColor=burlPanel(stampUV,0)/max(stampData.r,.0001);stampAO=burlPanel(stampUV,3).r;}
  float alpha=(1.-smoothstep(1.-uPatchShape[i].y,1.,r))*(1.-smoothstep(.75,1.,abs(dot(delta,uPatchN[i].xyz))/max(uPatchOrigin[i].w,1e-7)))*stampData.r,amount=effectParameter(0,1.)*alpha;if(amount<=0.)continue;
  float rings=effectParameter(9,18.),phase=(r*rings+sin(angle*2.+r*5.+localSeed)*warp*.45)*6.28318530718,band=.5+.5*sin(phase)*clamp(1.-fwidth(phase)*.32,0.,1.),fine=noise(vec3(q*vec2(1./length(uPatchU[i].xyz),1./length(uPatchV[i].xyz))*uTreeHeight/max(effectParameter(4,.008),.001),localSeed)),broad=noise(vec3(q*4.,localSeed+11.)),dome=pow(max(0.,1.-r*r),1.7),rim=exp(-pow((r-.78)/.13,2.));
  float height=effectParameter(3,.012)/uTreeHeight,strength=effectParameter(2,1.),keep=mix(1.,effectParameter(7,.45),amount),variation=effectParameter(5,.45);vec3 tint=effectColor(vec3(.45,.34,.25));
  float twist=warp*(.65*exp(-r*r*3.)+.10*sin(angle*3.+localSeed)),ct=cos(twist),sn=sin(twist);vec2 turned=vec2(q.x*ct-q.y*sn,q.x*sn+q.y*ct),offset=turned-q;
  vec3 warpedP=p+normalize(uPatchU[i].xyz)*offset.x/length(uPatchU[i].xyz)+normalize(uPatchV[i].xyz)*offset.y/length(uPatchV[i].xyz);
  vec3 bark=barkMapSample(uBark,warpedP,n)*uTint,pigment=mix(bark,tint,.14)*(.94+band*.06+(fine-.5)*variation*.10+(broad-.5)*variation*.08);
  if(hasStamp)pigment=mix(bark,stampColor*clamp(tint/vec3(.455,.353,.251),vec3(0),vec3(3)),.92);
  float barkRelief=(barkHeight(warpedP,n)-.5)*uBarkRelief*.45;
  s.color=mix(s.color,pigment,amount);s.rough=mix(s.rough,clamp(effectParameter(1,.9)+(hasStamp?stampData.b-.9:(fine-.5)*.08),.1,1.),amount);
  s.h*=keep;s.normalWeight*=keep;s.detailGradient*=keep;float relief=dome*(.9+broad*.2)+rim*.18+(band-.5)*.035*dome+(hasStamp?(stampData.g-.5)*.10:(fine-.5)*.012*dome);int style=int(effectParameter(11,0.)+.5),kind=int(effectParameter(12,0.)+.5);if(style>0){float imageH=hasStamp?stampData.g-.5:(fine-.5)*.2,envelope=pow(max(0.,1.-r*r),1.2);if(kind==0)relief=dome*.7+imageH*.3;else if(kind==1)relief=imageH*.7-.12*envelope;else if(kind==2)relief=(exp(-pow((abs(q.x)-.27)/.15,2.))*.4-exp(-pow(q.x/.15,2.))*.28)*envelope+imageH*.25;else if(kind==3)relief=imageH*.12;else if(kind==4)relief=max(0.,stampData.g)*.45+imageH*.3;else relief=imageH*.5+.12*envelope;}if(style>0)barkRelief=0.;s.coatH=s.coatH*keep+amount*strength*(height*relief+barkRelief);
  if(uPass==-1||uPass==2||uPass==5||uPass==10)s.localAO*=1.-amount*effectParameter(6,.4)*(style==0?(1.-band)*.18+rim*.16+(hasStamp?1.-stampAO:0.):(hasStamp?1.-stampAO:0.)+(kind==1?(1.-stampData.g)*.25:0.));
  s.layerCoverage=1.-(1.-s.layerCoverage)*(1.-amount);
 }return s;
}
`;
