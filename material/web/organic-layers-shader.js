// Physical coating heights are in normalized model units, separate from bark relief.
// All fields are sampled by live preview and the same final UV baking shader.
export const ORGANIC_LAYERS_GLSL=`
// Slot 10 is exclusive: final ORM while inspecting an export, coating atlas while authoring/baking.
// Explicit per-tile bilinear/LOD sampling prevents atlas tiles bleeding into each other.
vec3 coatBilinear(vec2 uv,int tile,int level){ivec2 size=textureSize(uBakedORM,level);bool grid=textureSize(uBakedORM,0).x>=8192;ivec2 ts=grid?ivec2(max(1,1024>>level)):ivec2(size.x,max(1,size.y/max(1,textureSize(uBakedORM,0).y/textureSize(uBakedORM,0).x)));vec2 q=fract(uv)*vec2(ts)-.5,f=fract(q);ivec2 i=ivec2(floor(q)),a=ivec2((i.x%ts.x+ts.x)%ts.x,(i.y%ts.y+ts.y)%ts.y),b=(a+1)%ts;ivec2 offset=grid?ivec2(tile*ts.x,0):ivec2(0,tile*ts.y);a+=offset;b+=offset;return mix(mix(texelFetch(uBakedORM,a,level).rgb,texelFetch(uBakedORM,ivec2(b.x,a.y),level).rgb,f.x),mix(texelFetch(uBakedORM,ivec2(a.x,b.y),level).rgb,texelFetch(uBakedORM,b,level).rgb,f.x),f.y);}
// One physical atlas sampler and normal projection for fills and brushes.
vec3 coatMap(vec3 p,vec3 n,int tile){return paintMossMap(p,n,uCoatWidth,vec3(uSeed*.17,uSeed*.23,uSeed*.31),tile);}
vec3 coatNormalGradient(vec3 p,vec3 n,int tile){return mossMapNormal(p,n,uCoatWidth,vec3(uSeed*.17,uSeed*.23,uSeed*.31),tile);}
float organicNoise(vec3 p,float meters,vec3 phase){
 vec3 q=p*uTreeHeight/meters+phase;
 float footprint=max(length(dFdx(q)),length(dFdy(q)));
 return mix(noise(q),.5,smoothstep(.35,1.15,footprint));
}
Surface mossCoating(Surface s,vec3 p,vec3 n,float seed,float barkLum){
 vec3 phase=vec3(seed*.37+17.,seed*.61+3.,seed*.43+7.);
 float colony=organicNoise(p,.075,phase),tuft=organicNoise(p,.009,phase+19.),tip=organicNoise(p,.0035,phase+37.);
 float field=noise(p*vec3(13,6,13)+vec3(seed,3,7))*.72+noise(p*39.+11.+seed)*.28+(1.-p.y)*.14+n.y*.08;
 field+=(colony-.5)*.13+(tuft-.5)*.06+(1.-barkLum)*.025;
 vec3 data=vec3(0),coverage=vec3(1);if(uCoatEnabled){data=coatMap(p,n,2);coverage=coatMap(p,n,3);field+=(data.r-.5)*.08;}
 float aa=max(.012,fwidth(field)*.75),m=uMossEnabled*(genericDistribution()?1.:step(.0001,uMoss)*smoothstep(1.-uMoss-aa,1.-uMoss+aa,field));
 float cushion=smoothstep(.22,.8,tuft),tips=pow(smoothstep(.24,.78,tip),1.5);
 vec3 green=uMossColor*(.79+colony*.14+cushion*.10+tips*.16);
 green*=mix(vec3(.94,1.,.89),vec3(1.03,1.01,.91),cushion);
 if(uCoatEnabled){cushion=data.r;tips=data.r;green=mossSurfaceColor(coatMap(p,n,0),uMossColor);}
 float pocket=organicNoise(p,.02,phase+83.);if(uCoatEnabled)m=mossSurfaceCoverage(m,coverage.r,pocket,uMossPorosity);else if(uMossPorosity>0.)m*=smoothstep(uMossPorosity*.4,uMossPorosity*.4+.18,tuft*.7+tip*.3+(pocket-.5)*.1);
 s.layerCoverage=m;s.color=mix(s.color,green,m);
 s.rough=mix(s.rough,clamp(uCoatEnabled?mossSurfaceRoughness(coverage.g,uMossRough):uMossRough+(colony-.5)*.08-tips*.035,.2,1.),m);
 s.h*=mix(1.,.08,m);s.normalWeight*=mix(1.,.08,m);s.detailGradient*=mix(1.,.08,m);if(uCoatEnabled&&(uPass==-1||uPass==1||uPass==10))s.detailGradient+=m*coatNormalGradient(p,n,5)*uMossNormalStrength*(uMossFiberMm/.53);
 if(uPass==-1||uPass==2||uPass==5||uPass==10){float localAO=uCoatEnabled?coatMap(p,n,4).r:clamp(.84+cushion*.16,.0,1.);s.localAO=mix(s.localAO,mossSurfaceAO(localAO,uMossAO),m);}
 float mound=pow(smoothstep(.20,.74,organicNoise(p,uMossClump,phase+67.)),1.25);float thickness=uMossThickness*(.15+.85*mound);
 // Differentiate tuft thickness, then mask its normal. Leaf-sized gaps must not become 4mm vertical crater walls.
 if(uPass==-1||uPass==1||uPass==10){vec3 a=dFdx(p)*uTreeHeight,b=dFdy(p)*uTreeHeight;float aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),det=aa*bb-ab*ab;float ha=dFdx(thickness),hb=dFdy(thickness);if(det>1e-25)s.detailGradient-=m*uMossNormalStrength*(a*((ha*bb-hb*ab)/det)+b*((hb*aa-ha*ab)/det));}
 s.coatH+=m*(.00015+(uCoatEnabled?0.:(.00045*cushion+.00008*tips)))*uMossNormalStrength/uTreeHeight;
 return s;
}
// Cached source wear is filtered after nonlinear height analysis, keeping small final maps stable.
float paintSubstrateWear(vec3 p,vec3 n){vec3 cached=barkMapSample(uRoughMap,p,n);float wear=uNormalY<0.?cached.b:cached.g;return pow(clamp(wear,0.,1.),uPaintDepthContrast);}
// Independent object-space age mask. Broad islands, a broken perimeter, no UV seams.
// Endpoints are exact; intermediate wear is an artistic amount, not measured surface area.
float paintMacroIntact(vec3 p,vec3 phase,float flake,float grain,float sourceIntact){
 if(uPaintPeel<=0.)return 1.;if(uPaintPeel>=1.)return 0.;
 float detail=uPaintPeelDetail,warp=organicNoise(p,uPaintPeelSize*1.7,phase+211.)-.5;
 vec3 warped=p+warp*detail*uPaintPeelSize/uTreeHeight*vec3(.58,.18,.41);
 float broad=organicNoise(warped,uPaintPeelSize,phase+101.);
 float lobes=organicNoise(warped*mix(vec3(1),vec3(1,1.45,1),detail),uPaintPeelSize*.43,phase+137.);
 float chips=organicNoise(p,uPaintPeelSize*.11,phase+173.);
 float field=broad*(.72-.18*detail)+lobes*(.20+.14*detail)+chips*(.08+.04*detail);
 // Expand the clustered value-noise range, so most of the slider has useful coverage.
 field=smoothstep(.22,.78,field);
 // Image-derived cracks and millimetre flakes break the perimeter of the broad islands.
 // This field stays independent of age: increasing age must never put paint back.
 field+=detail*((chips-.5)*.18+(flake-.5)*.06+(grain-.5)*.025-(1.-sourceIntact)*.18);
 float edge=max(.003+uPaintPeelEdge*.16,fwidth(field)*.75);
 float intact=smoothstep(uPaintPeel-edge,uPaintPeel+edge,field);
 if(uPaintPeelChips>0.){
  float edgeZone=1.-smoothstep(.0,.22,field-uPaintPeel);
  float cut=uPaintPeelChips*(uPaintPeel*.7+edgeZone*.3);
  float flecks=min(chips*.65+grain*.35,sourceIntact);
  float aa=max(.008,fwidth(flecks)*.65);
  intact*=smoothstep(cut-aa,cut+aa,flecks);
 }
 return intact;
}
Surface paintCoating(Surface s,vec3 p,vec3 n,float seed,float barkLum){
 vec3 phase=vec3(seed*.41+9.,seed*.29+13.,seed*.67+5.);
 float paintPatch=organicNoise(p,.065,phase),flake=organicNoise(p,.021,phase+23.),grain=organicNoise(p,.006,phase+41.);
 float edge=uPaintHeight+(paintPatch-.5)*uPaintWear*.06/uTreeHeight;
 float aa=max(.0007/uTreeHeight,fwidth(p.y)*.75);
 float m=uPaintEnabled*(genericDistribution()?1.:step(.0001,uPaintHeight)*(1.-smoothstep(edge-aa,edge+aa,p.y)));
 float cavity=1.-smoothstep(.16,.48,barkLum),damage=flake*.72+grain*.28-cavity*uPaintWear*.22;
 float cut=uPaintWear*.38,cutAA=max(.012,fwidth(damage)*.6);
 // True missing flakes expose bark, instead of tinting every texel translucent.
 vec3 data=vec3(0),coverage=vec3(1);if(uCoatEnabled){data=coatMap(p,n,2);coverage=coatMap(p,n,3);damage=data.g;cut=uPaintWear*.75;cutAA=max(.01,fwidth(damage)*.6);}
 float intact=smoothstep(cut-cutAA,cut+cutAA,damage);
 m*=mix(1.,intact,step(.0001,uPaintWear));
 // Signed local relief preserves cracks and raised bark structure without treating albedo as depth.
 if(!genericDistribution()&&uPaintEnabled>.5&&uHasMaskHeight&&uPaintDepthAmount>0.)m*=1.-uPaintDepthAmount*(.55+.45*paintPatch)*paintSubstrateWear(p,n);
 if(!genericDistribution())m*=uPaintCoverage*paintMacroIntact(p,phase,flake,grain,uCoatEnabled?data.g:1.);s.paintMask=m;s.layerCoverage=m;
 vec3 pigment=uPaintColor*(.955+paintPatch*.035+grain*.01);
 if(uCoatEnabled){pigment=uPaintColor*clamp(coatMap(p,n,1)/max(uCoatPaintMean,vec3(.01)),vec3(.88),vec3(1.04));grain=data.b;}
 s.color=mix(s.color,pigment,m);
 s.rough=mix(s.rough,clamp(uCoatEnabled?coverage.b*uPaintRough/.92:uPaintRough+(paintPatch-.5)*.025,.2,1.),m);
 // A thin whitewash follows bark; it is not a smooth replacement surface.
 s.h*=mix(1.,uPaintBarkKeep,m);s.normalWeight*=mix(1.,uPaintBarkKeep,m);s.detailGradient*=mix(1.,uPaintBarkKeep,m);if(uCoatEnabled&&(uPass==-1||uPass==1||uPass==10))s.detailGradient+=m*coatNormalGradient(p,n,6)*uPaintNormalStrength;
 if(uPass==-1||uPass==2||uPass==5||uPass==10){float localAO=uCoatEnabled?coatMap(p,n,4).g:clamp(.97+grain*.03,0.,1.);s.localAO*=mix(1.,localAO,m*uPaintAO);}
 s.coatH+=m*(.00012+(uCoatEnabled?0.:(grain-.5)*.000035))*uPaintNormalStrength/uTreeHeight;
 return s;
}
`;
