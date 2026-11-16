import {FORM_SURFACE_GLSL} from './form-effects.js';
import {BURL_SURFACE_GLSL} from './burl-scatter-shader.js';
// Procedural surface estimates. Physical height is independent of bark strength.
export const EXTRA_SURFACE_GLSL=`
${FORM_SURFACE_GLSL}
${BURL_SURFACE_GLSL}
// Draw the original premultiplied image in its physical box. A small screen-space
// footprint filters minification without sampling other atlas panels or their mips.
vec4 imageDecalTap(vec2 pixel,vec4 rect,vec2 atlasSize){
 return textureLod(uMaskMap3,(rect.xy+clamp(pixel,vec2(.5),rect.zw-.5))/atlasSize,0.);
}
Surface imageDecalSurface(Surface s,vec3 p,float amount,float rough){
 s.layerCoverage=0.;
 if(effectParameter(17,0.)<.5)return s;
 int base=surfaceEffectSlot*10;
 vec4 origin=uEffectData[base+5],axisU=uEffectData[base+6],axisV=uEffectData[base+7],rect=uEffectData[base+8];
 vec3 delta=p-origin.xyz;
 vec2 q=vec2(dot(delta,axisU.xyz),dot(delta,axisV.xyz));
 float side=max(abs(q.x),abs(q.y));
 float depth=abs(dot(delta,normalize(cross(axisU.xyz,axisV.xyz))))/origin.w;
 vec3 px=dFdx(vP),py=dFdy(vP);
 vec2 dx=vec2(dot(px,axisU.xyz),-dot(px,axisV.xyz))*rect.zw*.125;
 vec2 dy=vec2(dot(py,axisU.xyz),-dot(py,axisV.xyz))*rect.zw*.125;
 if(side>=1.||depth>=1.)return s;
 vec2 pixel=vec2(q.x*.5+.5,.5-q.y*.5)*rect.zw,atlasSize=vec2(textureSize(uMaskMap3,0));
 vec4 image;
 if(max(dot(dx,dx),dot(dy,dy))>.0625){
  image=(imageDecalTap(pixel+dx+dy,rect,atlasSize)+imageDecalTap(pixel+dx-dy,rect,atlasSize)
   +imageDecalTap(pixel-dx+dy,rect,atlasSize)+imageDecalTap(pixel-dx-dy,rect,atlasSize))*.25;
 }else image=imageDecalTap(pixel,rect,atlasSize);
 float edge=clamp(axisU.w,0.,1.);
 float coverage=amount*image.a*(1.-smoothstep(.75,1.,depth));
 if(edge>0.)coverage*=1.-smoothstep(1.-edge,1.,side);
 s.layerCoverage=coverage;
 s.color=mix(s.color,clamp(image.rgb/max(image.a,.000001),0.,1.),coverage);
 s.rough=mix(s.rough,rough,coverage);
 return s;
}
// Bark repair tiles share the coating atlas. Wrap bilinear samples within each
// cell at both mips so repeated bark stays continuous without reading neighbors.
vec3 repairBarkBilinear(vec2 uv,int cell,int level){
 int side=max(1,512>>level);
 ivec2 origin=ivec2((cell%16)*side,max(1,1024>>level)+(cell/16)*side);
 vec2 q=fract(uv)*float(side)-.5,f=fract(q);
 ivec2 a=(ivec2(floor(q))+side)%side,b=(a+1)%side;
 vec3 p00=texelFetch(uBakedORM,origin+a,level).rgb,p10=texelFetch(uBakedORM,origin+ivec2(b.x,a.y),level).rgb;
 vec3 p01=texelFetch(uBakedORM,origin+ivec2(a.x,b.y),level).rgb,p11=texelFetch(uBakedORM,origin+b,level).rgb;
 return mix(mix(p00,p10,f.x),mix(p01,p11,f.x),f.y);
}
vec3 repairBarkTile(vec2 uv,vec2 dx,vec2 dy,int cell){
 float footprint=max(length(dx),length(dy))*512.;
 float lod=clamp(log2(max(footprint,1.)),0.,9.);
 int lo=int(floor(lod)),hi=min(lo+1,9);
 return mix(repairBarkBilinear(uv,cell,lo),repairBarkBilinear(uv,cell,hi),fract(lod));
}
vec3 repairBarkMap(vec3 q,vec3 dx,vec3 dy,vec3 w,int cell){
 vec3 value=vec3(0);
 if(w.x>.0001)value+=w.x*repairBarkTile(q.zy,dx.zy,dy.zy,cell);
 if(w.y>.0001)value+=w.y*repairBarkTile(q.xz,dx.xz,dy.xz,cell);
 if(w.z>.0001)value+=w.z*repairBarkTile(q.xy,dx.xy,dy.xy,cell);
 return value;
}
Surface repairBarkSurface(Surface s,vec3 p,vec3 n,float seed,int asset,float amount,float rough,float normal,float height,float ao,float keep,vec3 tint){
 int cell=195+(asset-1)*3;
 float width=(asset==3?.70:.55)*max(.1,effectParameter(15,1.));
 float sourceHeight=asset==1?.0025:asset==2?.0012:.005;
 float frequency=uTreeHeight/width;
 vec3 phase=vec3(seed*.731,seed*.31,seed*.517);
 vec3 q=barkCoordinates(p)*frequency+phase;
 vec3 screenOrigin=uDirectional<.5?vP:(uDirectionMode>2.5&&uHasBarkFlow?vFlowPosition:transpose(barkFrame())*vP);
 vec3 dx=dFdx(screenOrigin)*frequency,dy=dFdy(screenOrigin)*frequency,w=barkProjectionWeights(barkProjectionNormal(n));
 vec3 data=repairBarkMap(q,dx,dy,w,cell+1);
 vec3 color=repairBarkMap(q,dx,dy,w,cell);
 vec3 tone=mix(vec3(1),tint*2.,.55);
 s.color=mix(s.color,clamp(color*tone,0.,1.),amount);
 s.rough=mix(s.rough,clamp(data.g+(rough-.9),.05,1.),amount);
 float retained=mix(1.,keep,amount);
 s.h*=retained;s.normalWeight*=retained;s.detailGradient*=retained;
 s.coatH=s.coatH*retained+amount*normal*(height/.00145)*sourceHeight*(data.r-.5)/uTreeHeight;
 if(uPass==-1||uPass==2||uPass==5||uPass==10)s.localAO*=1.-amount*ao*(1.-data.b);
 return s;
}
Surface extraSurface(int type,Surface s,vec3 p,vec3 n,float seed,vec3 receivingColor,float receivingRoughness){
 if(type==15)return burlSurface(s,p,n,seed,receivingColor,receivingRoughness);
 if(type>=11)return formSurface(type,s,p,n,seed);
 float amount=effectParameter(0,1.),rough=effectParameter(1,.9),normal=effectParameter(2,1.),height=effectParameter(3,0.),grain=max(effectParameter(4,.01),.0005),variation=effectParameter(5,.4),ao=effectParameter(6,.35),keep=effectParameter(7,1.);
 if(type==10&&effectParameter(16,0.)>.5)return imageDecalSurface(s,p,amount,rough);
 vec3 tint=effectColor(vec3(.5));
 s.layerCoverage=amount;
 if(type==10&&uCoatEnabled){
  int asset=int(effectParameter(14,0.)+.5);
  if(asset>=1&&asset<=3&&textureSize(uBakedORM,0).x>=8192)return repairBarkSurface(s,p,n,seed,asset,amount,rough,normal,height,ao,keep,tint);
 }
 vec3 phase=vec3(seed*.37+9.,seed*.17+21.,seed*.53+4.);
 float fine=organicNoise(p,grain,phase),broad=organicNoise(p,grain*4.,phase+13.);float relief=fine;
 if(type==8){s.color*=mix(vec3(1),tint*(.8+variation*broad*.4),amount);s.rough=mix(s.rough,rough,amount);return s;}
 if(type==9){float lum=dot(s.color,vec3(.2126,.7152,.0722));vec3 faded=mix(s.color,vec3(lum),effectParameter(8,.4))*1.12+tint*.09;s.color=mix(s.color,faded,amount);s.rough=mix(s.rough,rough,amount);return s;}
 if(type==6){relief=fine*.25+broad*.75;}
 if(type==10){float plates=smoothstep(.3,.7,broad),ridges=1.-abs(fine*2.-1.);relief=plates*.75+ridges*.25;}
 vec3 pigment=tint*(.86+(fine-.5)*variation*.38+(broad-.5)*variation*.22);
 s.color=mix(s.color,pigment,amount);s.rough=mix(s.rough,clamp(rough+(fine-.5)*variation*.08,.05,1.),amount);
 float retained=mix(1.,keep,amount);s.h*=retained;s.normalWeight*=retained;s.detailGradient*=retained;s.coatH=s.coatH*retained+amount*normal*height*(.15+relief*.85)/uTreeHeight;
 if(uPass==-1||uPass==2||uPass==5||uPass==10)s.localAO*=1.-amount*ao*(1.-relief)*.35;
 return s;
}
`;
