// Periodic least-squares integration of normal slopes. Relative mask height only:
// absolute height, constant tilt and non-integrable lighting errors cannot be recovered.
const pow2=n=>2**Math.floor(Math.log2(Math.max(1,n)));
export function normalHeightExtent(image){if(!image||image.format!=='rgb8'||!image.data)return null;const scale=Math.min(1,512/Math.max(image.width,image.height));return[ pow2(image.width*scale),pow2(image.height*scale) ];}
export function normalHeightBytes(image){const size=normalHeightExtent(image);if(!size)return 0;let[w,h]=size,total=0;for(;;){total+=w*h*8;if(w===1&&h===1)break;w=Math.max(1,w>>1);h=Math.max(1,h>>1);}return total;}
function fftLine(a,start,stride,n,inverse){
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const x=(start+i*stride)*2,y=(start+j*stride)*2;[a[x],a[y]]=[a[y],a[x]];[a[x+1],a[y+1]]=[a[y+1],a[x+1]];}}
 for(let length=2;length<=n;length<<=1){const angle=(inverse?2:-2)*Math.PI/length,wr=Math.cos(angle),wi=Math.sin(angle);for(let i=0;i<n;i+=length){let ur=1,ui=0;for(let j=0;j<length/2;j++){const x=(start+(i+j)*stride)*2,y=(start+(i+j+length/2)*stride)*2,vr=a[y]*ur-a[y+1]*ui,vi=a[y]*ui+a[y+1]*ur;a[y]=a[x]-vr;a[y+1]=a[x+1]-vi;a[x]+=vr;a[x+1]+=vi;const next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;}}}
 if(inverse)for(let i=0;i<n;i++){const x=(start+i*stride)*2;a[x]/=n;a[x+1]/=n;}
}
function fft2(a,w,h,inverse){for(let y=0;y<h;y++)fftLine(a,y*w,1,w,inverse);for(let x=0;x<w;x++)fftLine(a,x,w,h,inverse);}
function normalizedHeight(values,w,h){const sorted=Float32Array.from(values).sort(),low=sorted[Math.floor((sorted.length-1)*.01)],high=sorted[Math.ceil((sorted.length-1)*.99)],span=high-low,data=new Float32Array(values.length);for(let i=0;i<data.length;i++)data[i]=span<1e-7?.5:Math.max(0,Math.min(1,(values[i]-low)/span));return{kind:'tree-data-image',format:'r32f',width:w,height:h,bitDepth:32,generatedFromNormal:true,data,close(){this.data=null;this.closed=true;}};}
export function normalToRelativeHeights(image){
 const size=normalHeightExtent(image);if(!size)return null;const[w,h]=size,sw=image.width,sh=image.height;if(image.data.length!==sw*sh*3)throw Error('法线高度重建的像素长度无效。');const p=new Float64Array(w*h*2),q=new Float64Array(w*h*2);
 // Area-average slopes before integration; downsampling normals first biases steep cracks.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const x0=x*sw/w,x1=(x+1)*sw/w,y0=y*sh/h,y1=(y+1)*sh/h;let px=0,qy=0,weight=0;for(let yy=Math.floor(y0);yy<Math.ceil(y1);yy++)for(let xx=Math.floor(x0);xx<Math.ceil(x1);xx++){const i=(yy*sw+xx)*3,z=Math.max(.05,image.data[i+2]/127.5-1),v=Math.max(0,Math.min(x1,xx+1)-Math.max(x0,xx))*Math.max(0,Math.min(y1,yy+1)-Math.max(y0,yy));px+=Math.max(-8,Math.min(8,-(image.data[i]/127.5-1)/z))*v;qy+=Math.max(-8,Math.min(8,-(image.data[i+1]/127.5-1)/z))*v;weight+=v;}const at=(y*w+x)*2;p[at]=px/weight;q[at]=qy/weight;}
 fft2(p,w,h,false);fft2(q,w,h,false);const aspect=sw/sh;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=(y*w+x)*2,kx=2*Math.PI*(x<=w/2?x:x-w),ky=2*Math.PI*(y<=h/2?y:y-h)*aspect,den=kx*kx+ky*ky;if(!den){p[at]=p[at+1]=q[at]=q[at+1]=0;continue;}const pr=p[at],pi=p[at+1],qr=q[at],qi=q[at+1];p[at]=kx*pi/den;p[at+1]=-kx*pr/den;q[at]=ky*qi/den;q[at+1]=-ky*qr/den;}
 fft2(p,w,h,true);fft2(q,w,h,true);const gl=new Float32Array(w*h),dx=new Float32Array(w*h);for(let i=0;i<gl.length;i++){gl[i]=p[i*2]+q[i*2];dx[i]=p[i*2]-q[i*2];}
 return{normalHeightGL:normalizedHeight(gl,w,h),normalHeightDX:normalizedHeight(dx,w,h),method:'periodic least-squares normal-slope integration; normalized relative height, not measured depth'};
}
