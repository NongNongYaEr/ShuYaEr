export const MATERIAL_PAINT_GLSL=`
uniform bool uPaintPacked;
uniform vec4 uPaintMaskRect,uPaintRects[48],uPaintAdjust[16];
uniform vec3 uPaintTint[16];
uniform vec4 uPaintUVRegion;
vec3 coatBilinear(vec2 uv,int tile,int level);
vec4 paintSample(vec2 uv,vec4 rect){
 vec2 q=clamp((uv-uPaintUVRegion.xy)/uPaintUVRegion.zw,0.,1.),size=vec2(textureSize(uMaskMap1,0));
 vec2 dx=dFdx(uv/uPaintUVRegion.zw)*rect.zw,dy=dFdy(uv/uPaintUVRegion.zw)*rect.zw;
 float lod=clamp(log2(max(max(length(dx),length(dy)),1.)),0.,log2(rect.z)-2.);
 float margin=.5*exp2(ceil(lod));vec2 point=rect.xy+clamp(q*rect.zw,vec2(margin),rect.zw-margin);return textureLod(uMaskMap1,point/size,lod);
}
// Geometry derivatives, independent of mask resolution and changing brush controls.
vec3 paintMossTile(vec2 uv,vec2 dx,vec2 dy,int tile){
 float width=textureSize(uBakedORM,0).x>=8192?1024.:float(textureSize(uBakedORM,0).x),top=floor(log2(width));
 float lod=clamp(log2(max(max(length(dx*width),length(dy*width)),1.)),0.,top);
 int lo=int(floor(lod)),hi=min(lo+1,int(top));return mix(coatBilinear(uv,tile,lo),coatBilinear(uv,tile,hi),fract(lod));
}
vec3 paintMossMap(vec3 p,vec3 n,float width,vec3 phase,int tile){
 vec3 q=p*uTreeHeight/width+phase,dx=dFdx(vP)*uTreeHeight/width,dy=dFdy(vP)*uTreeHeight/width,w=pow(abs(n),vec3(5));w/=max(dot(w,vec3(1)),.0001);vec3 value=vec3(0);
 if(w.x>.0001)value+=w.x*paintMossTile(q.zy,dx.zy,dy.zy,tile);
 if(w.y>.0001)value+=w.y*paintMossTile(q.xz,dx.xz,dy.xz,tile);
 if(w.z>.0001)value+=w.z*paintMossTile(q.xy,dx.xy,dy.xy,tile);return value;
}
vec3 mossMapNormal(vec3 p,vec3 n,float width,vec3 phase,int tile){
 vec3 q=p*uTreeHeight/width+phase,dx=dFdx(vP)*uTreeHeight/width,dy=dFdy(vP)*uTreeHeight/width,w=pow(abs(n),vec3(5));w/=max(dot(w,vec3(1)),.0001);
 vec3 gx=vec3(1,0,0)-n*n.x,gy=vec3(0,1,0)-n*n.y,gz=vec3(0,0,1)-n*n.z,g=vec3(0);
 if(w.x>.0001){vec3 v=normalize(paintMossTile(q.zy,dx.zy,dy.zy,tile)*2.-1.);g+=w.x*(v.x*gz+v.y*gy)/max(v.z,.08);}
 if(w.y>.0001){vec3 v=normalize(paintMossTile(q.xz,dx.xz,dy.xz,tile)*2.-1.);g+=w.y*(v.x*gx+v.y*gz)/max(v.z,.08);}
 if(w.z>.0001){vec3 v=normalize(paintMossTile(q.xy,dx.xy,dy.xy,tile)*2.-1.);g+=w.z*(v.x*gx+v.y*gy)/max(v.z,.08);}return g*.2/width;
}
// Differentiate the spatial mound only. Alpha*thickness would form crater walls.
vec4 paintColony(vec3 p,float meters,vec3 phase){
 vec3 q=p*uTreeHeight/meters+phase,i=floor(q),f=fract(q),u=f*f*(3.-2.*f),du=6.*f*(1.-f);
 float a=hash(i),b=hash(i+vec3(1,0,0)),c=hash(i+vec3(0,1,0)),d=hash(i+vec3(1,1,0));
 float e=hash(i+vec3(0,0,1)),g=hash(i+vec3(1,0,1)),h=hash(i+vec3(0,1,1)),j=hash(i+vec3(1,1,1));
 float x0=mix(a,b,u.x),x1=mix(c,d,u.x),x2=mix(e,g,u.x),x3=mix(h,j,u.x),y0=mix(x0,x1,u.y),y1=mix(x2,x3,u.y);
 vec3 grad=vec3(mix(mix(b-a,d-c,u.y),mix(g-e,j-h,u.y),u.z)*du.x,mix(x1-x0,x3-x2,u.z)*du.y,(y1-y0)*du.z)/meters;
 float footprint=max(length(dFdx(vP)*uTreeHeight/meters),length(dFdy(vP)*uTreeHeight/meters)),keep=1.-smoothstep(.35,1.15,footprint);
 return vec4(grad*keep,mix(.5,mix(y0,y1,u.z),keep));
}
// Shared moss surface: automatic fill and the material brush use these same
// pigment, leaf pores, roughness and AO equations. Distribution is separate.
vec3 mossSurfaceColor(vec3 atlasColor,vec3 tint){return atlasColor*(dot(tint,vec3(.2126,.7152,.0722))/max(.01,dot(uCoatMossMean,vec3(.2126,.7152,.0722))))*(tint/vec3(.27451,.32549,.21176));}
float mossSurfaceCoverage(float macro,float leaf,float pocket,float porosity){
 float m=macro*mix(.92+leaf*.08,leaf,1.-smoothstep(.1,.8,macro));
 if(porosity>0.)m*=smoothstep(porosity*.4,porosity*.4+.18,leaf+(pocket-.5)*.1);return m;
}
float mossSurfaceRoughness(float leafRough,float roughness){return clamp(leafRough*roughness/.94,.2,1.);}
float mossSurfaceAO(float atlasAO,float strength){return 1.-(1.-atlasAO)*strength;}
Surface paintedLayer(Surface s,vec3 p,vec3 n,vec2 uv,int slot,vec4 cfg,float amount){
 vec4 color=paintSample(uv,uPaintRects[slot*3]);float coverage=color.a,denom=max(coverage,.000001);
 vec4 params=paintSample(uv,uPaintRects[slot*3+1])/denom,data=paintSample(uv,uPaintRects[slot*3+2])/denom,adjust=uPaintAdjust[slot];
 float denseStyle=step(1.5,adjust.x);float width=clamp(params.a,.05,1.),clump=clamp(params.b*.2,.005,.2),seed=uEffectMeta[slot].y;
 vec3 legacyPhase=vec3(17.7,9.3,13.1)+seed*vec3(.17,.23,.31),phase=mix(legacyPhase,vec3(uSeed*.17,uSeed*.23,uSeed*.31),denseStyle);
 float surfaceSeed=uSeed+seed;vec3 noisePhase=mix(legacyPhase,vec3(surfaceSeed*.37+17.,surfaceSeed*.61+3.,surfaceSeed*.43+7.),denseStyle);
 vec4 colony=paintColony(p,clump,noisePhase+67.);
 vec3 leaf=uCoatEnabled?paintMossMap(p,n,width,phase,3):vec3(noise(p*uTreeHeight/.002+phase),.94,0.);
 float cut=mix(.82,.18,clamp(data.a,0.,1.)),edge=max(.025,min(.22,length(colony.xyz)*max(length(dFdx(vP)*uTreeHeight),length(dFdy(vP)*uTreeHeight))));
 float clusters=data.a<=0.?0.:smoothstep(cut-edge,cut+edge,colony.w+(leaf.r-.5)*.08),leafMask=smoothstep(.22,.44,leaf.r),pocket=paintColony(p,.02,noisePhase+83.).w;
 coverage*=mix(clusters*leafMask,mossSurfaceCoverage(1.,leaf.r,pocket,1.-data.a),denseStyle);
 float alpha=clamp(coverage*amount,0.,1.),keep=clamp(data.b,0.,1.);vec3 pigment=color.rgb/denom;
 if(uCoatEnabled){vec3 sourceColor=paintMossMap(p,n,width,phase,0);pigment=mix(pigment*sourceColor/vec3(.27451,.32549,.21176),mossSurfaceColor(sourceColor,pigment),denseStyle);}
 else if(!uCoatEnabled)pigment*=.8+colony.w*.25+leaf.r*.15;
 s.color=mix(s.color,clamp(pigment*uPaintTint[slot],0.,1.),alpha*cfg.y);
 float rough=mix(leaf.g*data.g/.94,mossSurfaceRoughness(leaf.g,data.g),denseStyle);
 s.rough=mix(s.rough,clamp(rough+adjust.z,mix(.1,.2,denseStyle),1.),alpha*cfg.z);
 float suppress=1.-alpha*cfg.w*(1.-keep);s.h*=suppress;s.coatH*=suppress;s.normalWeight*=suppress;s.detailGradient*=suppress;
 if(uPass==-1||uPass==1||uPass==10){
  vec3 gradient=uCoatEnabled?mossMapNormal(p,n,width,phase,5)*(params.r*12./.53):vec3(0);
  float t=clamp((colony.w-.20)/.54,0.,1.),rounded=t*t*(3.-2.*t),derivative=1.25*pow(max(rounded,.000001),.25)*6.*t*(1.-t)/.54;
  gradient-=colony.xyz*(params.g*.08*.85*derivative);gradient-=n*dot(gradient,n);s.detailGradient+=gradient*(adjust.y*alpha*cfg.w);
 }
 if(uPass==-1||uPass==2||uPass==5||uPass==10){float sourceAO=uCoatEnabled?paintMossMap(p,n,width,phase,4).r:.84+colony.w*.16;s.localAO=mix(s.localAO,mossSurfaceAO(sourceAO,data.r*adjust.w),alpha*uEffectMeta[slot].z);}
 s.coatH+=denseStyle*alpha*.00015/uTreeHeight;
 s.layerCoverage=coverage;if(slot==uEffectSelected)s.selectedCoverage=alpha;return s;
}
`;
