export const BLEND_UNIFORMS=`
uniform vec4 uEffectEmission[16],uEffectEmissionShape[16];uniform float uEmissionMaximum;uniform bool uHasBakedEmission;uniform float uBakedEmissionStrength;
uniform vec4 uBlendColor[16],uBlendChannels[16],uBlendExtra[16],uBlendHeight[16],uBlendHeightSource[16],uBlendLimits[16],uBlendTarget[16];
`;
export const BLEND_GLSL=`
vec3 surfaceEmission=vec3(0);
float materialWeights[16],materialHeights[16];float materialBarkWeight=1.,materialPaintWeight=0.,materialMossWeight=0.,lastMaterialCoverage=0.;
bool physicalMaterial(int id){return id==0||id==1||id==2||id==3||id==6||id==7||id==10||id==15;}
vec3 blendRGB(vec3 b,vec3 f,int mode){
 if(mode==1)return b*f;if(mode==2)return 1.-(1.-b)*(1.-f);
 if(mode==3)return mix(2.*b*f,1.-2.*(1.-b)*(1.-f),step(vec3(.5),b));
 if(mode==4){vec3 d=mix(((16.*b-12.)*b+4.)*b,sqrt(max(b,vec3(0))),step(vec3(.25),b));return mix(b-(1.-2.*f)*b*(1.-b),b+(2.*f-1.)*(d-b),step(vec3(.5),f));}
 if(mode==5)return min(b,f);if(mode==6)return max(b,f);if(mode==7){float v=max(f.r,max(f.g,f.b)),bv=max(b.r,max(b.g,b.b));return v>.0000001?f*(bv/v):vec3(bv);}return f;
}
float blendCondition(Surface s,vec3 p,vec3 n,int slot,float substrateWear){
 vec4 h=uBlendHeight[slot],hs=uBlendHeightSource[slot],limits=uBlendLimits[slot],target=uBlendTarget[slot];float m=1.;
 if(h.x>.5){float height=uHasHeightMap?barkHeight(p,n):uHasMaskHeight?substrateWear:.5;if(hs.x>.5){float physical=hs.x>1.5?materialHeights[clamp(int(hs.y),0,15)]:(s.h*uNormalStrength*uRelief+s.coatH);height=clamp(.5+physical*uTreeHeight*1000./max(hs.z,.1),0.,1.);}float selected=smoothstep(h.z-h.w,h.z+h.w,height);if(h.x<1.5)selected=1.-selected;m*=mix(1.,selected,h.y);}
 float lum=dot(fromSRGB(clamp(s.color,0.,1.)),vec3(.2126,.7152,.0722));if(limits.x>0.)m*=smoothstep(limits.x-limits.z,limits.x+limits.z,lum);if(limits.y<1.)m*=1.-smoothstep(limits.y-limits.z,limits.y+limits.z,lum);
 if(limits.w>.5&&limits.w<1.5)m*=materialBarkWeight;else if(limits.w>1.5)m*=materialWeights[clamp(int(target.x),0,15)];
 if(target.y>.5)m*=1.-materialPaintWeight;if(target.z>.5)m*=1.-materialMossWeight;return clamp(m,0.,1.);
}
Surface blendedLayer(int id,Surface s,Surface f,vec3 p,vec3 n,float fine,int slot,float amount,float seed,float substrateWear){
 vec4 bc=uBlendColor[slot],modes=uBlendChannels[slot],extra=uBlendExtra[slot],cfg=uEffectConfig[slot];
 float coverage=clamp(f.layerCoverage,0.,1.),denom=max(coverage,.000001);if(coverage<=.000001){lastMaterialCoverage=0.;return s;}
 vec3 source=f.color/denom;if(id==4)source=vec3(1.-effectParameter(36,.42));if(id==5)source=toSRGB(vec3(.5+(noise(p*vec3(7,5,7)+seed)-.5)*uVariation));if(id==8||id==9||id==11||id==12||id==14)source=effectColor(vec3(.5))*(.9+fine*effectParameter(5,.4)*.2);
 float condition=blendCondition(s,p,n,slot,substrateWear),alpha=clamp(amount*coverage*condition,0.,1.);lastMaterialCoverage=alpha;
 vec3 b=fromSRGB(clamp(s.color,0.,1.)),fg=fromSRGB(clamp(source,0.,1.));if(alpha*cfg.y*bc.y>0.)s.color=toSRGB(clamp(mix(b,blendRGB(b,fg,int(bc.x)),alpha*cfg.y*bc.y),0.,1.));
 float ar=alpha*cfg.z*bc.z,rough=f.rough/denom,targetR=rough;if(modes.x>.5&&modes.x<1.5)targetR=max(s.rough,rough);else if(modes.x>1.5&&modes.x<2.5)targetR=min(s.rough,rough);else if(modes.x>2.5)targetR=s.rough+extra.z;s.rough=clamp(mix(s.rough,targetR,ar),.02,1.);
 float keep=clamp((f.normalWeight-1.+coverage)/denom,0.,1.),an=alpha*cfg.w*bc.w,ah=alpha*cfg.w*extra.x;
 if(modes.w>2.5)an=0.;else if(modes.w>.5&&modes.w<1.5)keep=1.;else if(modes.w>1.5)keep=0.;
 float ownH=f.h/denom,ownCoat=f.coatH/denom;s.normalWeight*=1.-an*(1.-keep);s.detailGradient=s.detailGradient*(1.-an*(1.-keep))+f.detailGradient/denom*an;
 if(modes.y>1.5)ah=0.;float hk=modes.y>.5&&modes.y<1.5?0.:keep;s.h=s.h*(1.-ah*(1.-hk))+ownH*ah;s.coatH=s.coatH*(1.-ah*(1.-hk))+ownCoat*ah;
 float ownAO=clamp(1.+(f.localAO-1.)/denom,0.,1.),aa=alpha*uEffectMeta[slot].z*extra.y,targetAO=ownAO;if(modes.z>.5&&modes.z<1.5)targetAO=min(s.localAO,ownAO);else if(modes.z>1.5&&modes.z<2.5)targetAO=s.localAO*ownAO;else if(modes.z>2.5)aa=0.;s.localAO=mix(s.localAO,targetAO,aa);
 if(id==1)s.paintMask=1.-(1.-s.paintMask)*(1.-alpha);s.layerCoverage=coverage;if(slot==uEffectSelected)s.selectedCoverage=alpha;return s;
}
void accumulateEmission(int slot,int type,vec3 p,vec3 n){if((uPass!=-1&&uPass!=14)||uEmissionMaximum<=0.)return;float a=clamp(lastMaterialCoverage*uEffectConfig[slot].y,0.,1.);if(physicalMaterial(type))surfaceEmission*=1.-a;vec4 em=uEffectEmission[slot],shape=uEffectEmissionShape[slot];if(em.w<=0.||a<=0.)return;float pattern=shape.x>.5?1.-smoothstep(shape.y-shape.z,shape.y+shape.z,barkHeight(p,n)):1.;surfaceEmission+=fromSRGB(em.rgb)*em.w*a*pattern;}
void rememberMaterial(int slot,int type,Surface s){float a=physicalMaterial(type)?lastMaterialCoverage:0.;for(int j=0;j<16;j++){if(j>=slot)break;materialWeights[j]*=1.-a;}materialBarkWeight*=1.-a;materialPaintWeight=materialPaintWeight*(1.-a)+(type==1?a:0.);materialMossWeight=materialMossWeight*(1.-a)+(type==0?a:0.);materialWeights[slot]=a;materialHeights[slot]=s.h*uNormalStrength*uRelief+s.coatH;}
`;
