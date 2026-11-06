// Uniform-only procedural overlays. Membership comes from source-face draw
// partitions, so a nearby disconnected branch cannot receive the projection.
export const LOCAL_PATCH_UNIFORMS=`
uniform int uPatchCount,uPatchBits,uPatchHeightBits;
uniform vec4 uPatchOrigin[8],uPatchU[8],uPatchV[8],uPatchN[8],uPatchColor[8],uPatchShape[8],uPatchChannels[8];
uniform float uPatchEpsilon;
`;
export const LOCAL_PATCH_GLSL=`
struct PatchSurface {vec3 color;float colorAlpha;float rough;float roughAlpha;float h;float normalKeep;};
PatchSurface patchSurface(vec3 p){PatchSurface outPatch=PatchSurface(vec3(0),0.,0.,0.,0.,1.);if(uPatchBits==0)return outPatch;
 for(int i=0;i<8;i++){if(i>=uPatchCount)break;if((uPatchBits&(1<<i))==0||uPatchShape[i].x>4.5)continue;vec3 delta=p-uPatchOrigin[i].xyz;vec2 q=vec2(dot(delta,uPatchU[i].xyz),dot(delta,uPatchV[i].xyz));float kind=uPatchShape[i].x,feather=uPatchShape[i].y,seed=uPatchShape[i].w;
  float grain=noise(vec3(q*vec2(9.,2.),seed)),warp=(noise(vec3(q*3.,seed+23.))-.5)*.10,r=length(q),shape=r+warp;
  if(kind>2.5&&kind<3.5){float center=(noise(vec3(q.y*5.,seed,7.))-.5)*.5;shape=max(abs(q.x-center)*(1.+.22*sin(q.y*17.+seed)),abs(q.y));}
  float alpha=(1.-smoothstep(1.-feather,1.,shape))*uPatchColor[i].a,depth=abs(dot(delta,uPatchN[i].xyz))/max(uPatchOrigin[i].w,1e-7);alpha*=1.-smoothstep(.75,1.,depth);
  float interior=1.-smoothstep(.72,.90,shape),rim=exp(-pow((shape-.84)/.11,2.)),phase=(r*uPatchShape[i].z+noise(vec3(q*2.,seed))*.45)*6.28318530718;
  float ring=.5+.5*sin(phase)*clamp(1.-fwidth(phase)*.32,0.,1.);if(alpha<=0.)continue;vec3 wood=uPatchColor[i].rgb*(.88+grain*.15);float targetH=-uPatchV[i].w*interior+uPatchN[i].w*rim,keep=mix(1.,.15,interior),targetRough=uPatchU[i].w;
  if(kind<.5){wood*=.91+ring*.13;targetH+=(ring-.5)*uPatchV[i].w*.025*interior;targetRough+=(ring-.5)*.03;}
  if(kind>.5&&kind<1.5){wood*=.92+.08*sin(q.y*70.+grain*4.);targetH+=(grain-.5)*uPatchV[i].w*.025*interior;}
  if(kind>1.5&&kind<2.5){wood*=.58+ring*.42;targetH=-uPatchV[i].w*(1.-smoothstep(0.,.45,r))+uPatchN[i].w*rim;keep=.6;}
  if(kind>2.5&&kind<3.5){wood=uPatchColor[i].rgb*(.65+grain*.2);targetH=-uPatchV[i].w*(1.-smoothstep(.02,.85,shape));keep=.8;}
  if(kind>3.5){wood*=.92+grain*.08;targetH=-uPatchV[i].w*interior+uPatchN[i].w*rim*(.35+grain*.65);}
  if(kind<1.5||kind>3.5)wood=mix(uPatchColor[i].rgb*vec3(.52,.48,.43),wood,interior);float a=alpha*uPatchChannels[i].x;outPatch.color=outPatch.color*(1.-a)+wood*a;outPatch.colorAlpha=outPatch.colorAlpha*(1.-a)+a;a=alpha*uPatchChannels[i].y;outPatch.rough=outPatch.rough*(1.-a)+clamp(targetRough,.1,1.)*a;outPatch.roughAlpha=outPatch.roughAlpha*(1.-a)+a;a=alpha*uPatchChannels[i].z;outPatch.h=mix(outPatch.h,targetH,a);outPatch.normalKeep=mix(outPatch.normalKeep,keep,a);
 }return outPatch;
}
`;
