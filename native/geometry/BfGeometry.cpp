// Binary ABI 1. IEEE double arithmetic mirrors the existing indexed-geometry
// normal/tangent operations. No libc, allocation, exceptions or scene objects.
using u32=unsigned int;
using u8=unsigned char;
struct Vec {double x,y,z;};
static Vec add(Vec a,Vec b){return {a.x+b.x,a.y+b.y,a.z+b.z};}
static Vec sub(Vec a,Vec b){return {a.x-b.x,a.y-b.y,a.z-b.z};}
static Vec mul(Vec a,double s){return {a.x*s,a.y*s,a.z*s};}
static double dot(Vec a,Vec b){return a.x*b.x+a.y*b.y+a.z*b.z;}
static Vec cross(Vec a,Vec b){return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
static Vec normalized(Vec a){const double length=__builtin_sqrt(dot(a,a));return mul(a,1.0/(length?length:1.0));}
static Vec load(const float* p,u32 i){return {p[i*3],p[i*3+1],p[i*3+2]};}
static void store(float* p,u32 i,Vec a){p[i*3]=(float)a.x;p[i*3+1]=(float)a.y;p[i*3+2]=(float)a.z;}
extern "C" void* memset(void* target,int value,unsigned long count){volatile u8* p=(volatile u8*)target;for(unsigned long i=0;i<count;i++)p[i]=(u8)value;return target;}
extern "C" u32 bf_abi_version(){return 1;}
extern "C" int bf_normals(u32 count,u32 indexCount,const float* positions,const u32* indices,float* normals){
  for(u32 i=0;i<count*3;i++)normals[i]=0;
  for(u32 i=0;i+2<indexCount;i+=3){
    const u32 a=indices[i],b=indices[i+1],c=indices[i+2];if(a>=count||b>=count||c>=count)return 0;
    const Vec face=cross(sub(load(positions,c),load(positions,b)),sub(load(positions,a),load(positions,b)));
    store(normals,a,add(load(normals,a),face));store(normals,b,add(load(normals,b),face));store(normals,c,add(load(normals,c),face));
  }
  for(u32 i=0;i<count;i++)store(normals,i,normalized(load(normals,i)));return 1;
}
extern "C" int bf_tangents(u32 count,u32 indexCount,const float* positions,const float* normals,const float* uv,const u32* indices,
                           u32 groupCount,const u32* groups,float* tangents,double* workspace,u8* visited){
  Vec* tan1=(Vec*)workspace;Vec* tan2=tan1+count;
  for(u32 i=0;i<count;i++){tan1[i]={0,0,0};tan2[i]={0,0,0};visited[i]=0;}
  for(u32 group=0;group<groupCount;group++){
    const u32 start=groups[group*2],end=start+groups[group*2+1];if(end>indexCount||start>end)return 0;
    for(u32 at=start;at+2<end;at+=3){
      const u32 a=indices[at],b=indices[at+1],c=indices[at+2];if(a>=count||b>=count||c>=count)return 0;
      visited[a]=visited[b]=visited[c]=1;
      const Vec vA=load(positions,a),vB=load(positions,b),vC=load(positions,c);
      const double x1=vB.x-vA.x,x2=vC.x-vA.x,y1=vB.y-vA.y,y2=vC.y-vA.y,z1=vB.z-vA.z,z2=vC.z-vA.z;
      const double s1=(double)uv[b*2]-uv[a*2],s2=(double)uv[c*2]-uv[a*2],t1=(double)uv[b*2+1]-uv[a*2+1],t2=(double)uv[c*2+1]-uv[a*2+1];
      const double r=1.0/(s1*t2-s2*t1);if(!__builtin_isfinite(r))continue;
      const Vec sdir={(t2*x1-t1*x2)*r,(t2*y1-t1*y2)*r,(t2*z1-t1*z2)*r};
      const Vec tdir={(s1*x2-s2*x1)*r,(s1*y2-s2*y1)*r,(s1*z2-s2*z1)*r};
      tan1[a]=add(tan1[a],sdir);tan1[b]=add(tan1[b],sdir);tan1[c]=add(tan1[c],sdir);
      tan2[a]=add(tan2[a],tdir);tan2[b]=add(tan2[b],tdir);tan2[c]=add(tan2[c],tdir);
    }
  }
  for(u32 i=0;i<count;i++)if(visited[i]){
    const Vec n=load(normals,i),t=tan1[i],result=normalized(sub(t,mul(n,dot(n,t))));
    tangents[i*4]=(float)result.x;tangents[i*4+1]=(float)result.y;tangents[i*4+2]=(float)result.z;
    tangents[i*4+3]=dot(cross(n,t),tan2[i])<0?-1.0f:1.0f;
  }
  return 1;
}
extern "C" int bf_surface_tangents(u32 count,const float* normals,float* tangents,u32 ringCount,const u32* offsets,u32 seamOffset){
  for(u32 i=0;i<count;i++){
    const Vec n=load(normals,i);Vec a={tangents[i*4],tangents[i*4+1],tangents[i*4+2]};a=sub(a,mul(n,dot(a,n)));
    if(dot(a,a)<1e-12)a=cross(__builtin_fabs(n.z)<.9?Vec{0,0,1}:Vec{1,0,0},n);a=normalized(a);
    tangents[i*4]=(float)a.x;tangents[i*4+1]=(float)a.y;tangents[i*4+2]=(float)a.z;tangents[i*4+3]=tangents[i*4+3]<0?-1.0f:1.0f;
  }
  for(u32 row=0;row<ringCount;row++){
    const u32 first=offsets[row],last=seamOffset+row;if(first>=count||last>=count)return 0;
    const Vec n=load(normals,first),original={tangents[first*4],tangents[first*4+1],tangents[first*4+2]},tail={tangents[last*4],tangents[last*4+1],tangents[last*4+2]};
    Vec a=add(original,tail);a=sub(a,mul(n,dot(a,n)));if(dot(a,a)<1e-12)a=original;a=normalized(a);const float w=tangents[first*4+3];
    for(u32 k=0;k<2;k++){const u32 i=k?last:first;tangents[i*4]=(float)a.x;tangents[i*4+1]=(float)a.y;tangents[i*4+2]=(float)a.z;tangents[i*4+3]=w;}
  }
  return 1;
}
