// Dielectric GGX studio preview. Exported BaseColor/Normal/ORM remain unlit data.
export const STUDIO_LIGHTING_GLSL=`
vec3 studioDirect(vec3 albedo,vec3 N,vec3 V,vec3 L,float rough,vec3 radiance){
 float nl=max(dot(N,L),0.),nv=max(dot(N,V),.0001);vec3 H=normalize(V+L);
 float nh=max(dot(N,H),0.),vh=max(dot(V,H),0.),alpha=max(.035,rough*rough),a2=alpha*alpha,d=nh*nh*(a2-1.)+1.;
 float D=a2/max(3.14159265*d*d,.000001),k=(rough+1.)*(rough+1.)*.125;
 float G=nl/(nl*(1.-k)+k)*nv/(nv*(1.-k)+k),F=.04+.96*pow(1.-vh,5.);
 return ((1.-F)*albedo/3.14159265+vec3(D*G*F/max(4.*nl*nv,.0001)))*nl*radiance;
}
vec3 studioLighting(vec3 albedo,vec3 N,vec3 V,vec3 L,vec3 fill,float rough,float ao){
 vec3 ambient=mix(vec3(.026,.031,.040),vec3(.105,.112,.12),N.y*.5+.5)*albedo*ao;
 return studioDirect(albedo,N,V,L,rough,vec3(1.,.96,.9)*2.8)+studioDirect(albedo,N,V,fill,rough,vec3(.76,.85,1.)*.42)+ambient;
}
`;
