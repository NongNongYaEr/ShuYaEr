// Thin exfoliating bark: classify colour regions, then author a shallow skin
// step and pores. Large colour differences never become broad height bulges.
export const FEATURED_BARK_FAMILIES={
 plane:{name:'法桐',source:'plane-featured',width:.9,patchCm:18,roughness:.82,thicknessMm:.55,retention:.48,damage:.35,grain:.55,directional:false},
 firmiana:{name:'青桐',source:'firmiana-featured',width:.55,patchCm:12,roughness:.72,thicknessMm:.08,retention:.35,damage:.12,grain:.35,directional:true},
 crape:{name:'紫薇',source:'crape-featured',width:.65,patchCm:17,roughness:.77,thicknessMm:.22,retention:.43,damage:.2,grain:.4,directional:false},
 lacebark:{name:'榔榆',source:'lacebark-featured',width:.65,patchCm:5,roughness:.89,thicknessMm:.8,retention:.62,damage:.6,grain:.75,directional:false}
};
export const FEATURED_BARK_PRESETS=[
 {id:'plane-mosaic',family:'plane',name:'法桐·大斑拼皮',params:{}},
 {id:'plane-peeling',family:'plane',name:'法桐·残皮剥落',params:{retention:.28,thicknessMm:.85,damage:.7}},
 {id:'plane-aged',family:'plane',name:'法桐·老干过渡',params:{retention:.55,damage:.5},transition:true},
 {id:'firmiana-green',family:'firmiana',name:'青桐·青绿细皮',params:{}},
 {id:'crape-cloud',family:'crape',name:'紫薇·云斑薄皮',params:{}},
 {id:'lacebark-scales',family:'lacebark',name:'榔榆·细鳞拼皮',params:{}}
];
export const FEATURED_BARK_FIELDS={patchCm:{label:'斑片尺寸',min:1,max:80,step:1,unit:'cm'},retention:{label:'老皮保留',min:0,max:1,step:.01},thicknessMm:{label:'薄皮厚度',min:0,max:2,step:.05,unit:'mm'},damage:{label:'边缘破损',min:0,max:1,step:.01},grain:{label:'微细节',min:0,max:1,step:.01},roughness:{label:'表面粗糙度',min:.3,max:1,step:.01},seed:{label:'破边随机',min:0,max:10000,step:1}};
export function featuredBarkOptions(raw){if(raw==null)return null;if(raw.version!==1||!FEATURED_BARK_FAMILIES[raw.family])throw Error('特色树皮类型无效。');const preset=FEATURED_BARK_PRESETS.find(p=>p.id===raw.preset&&p.family===raw.family);if(!preset)throw Error('特色树皮样式无效。');const f=FEATURED_BARK_FAMILIES[raw.family],defaults={patchCm:f.patchCm,retention:f.retention,thicknessMm:f.thicknessMm,damage:f.damage,grain:f.grain,roughness:f.roughness,seed:13,...preset.params},params={};for(const[k,field]of Object.entries(FEATURED_BARK_FIELDS)){const v=raw.params?.[k]??defaults[k];if(!Number.isFinite(v)||v<field.min||v>field.max||(k==='seed'&&!Number.isInteger(v)))throw Error('特色树皮参数无效：'+field.label);params[k]=v;}return{version:1,family:raw.family,preset:preset.id,params};}
export function featuredBarkSettings(options,height=10){const o=featuredBarkOptions(options),f=FEATURED_BARK_FAMILIES[o.family],width=f.width*o.params.patchCm/f.patchCm;return {barkStyle:0,scale:height/width,bump:1,normalStrength:1,normalDirectX:false,heightWithNormal:false,reliefMm:4,barkReliefMm:0,barkCavity:.22,detail:0,rough:1,directional:f.directional,directionMode:f.directional?2:3,tint:'#ffffff',physicalWidthMeters:width};}
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=(a,b,x)=>{const v=clamp((x-a)/(b-a));return v*v*(3-2*v);},mix=(a,b,t)=>a+(b-a)*t;
function blur(src,n,r){const tmp=new Float32Array(src.length),out=new Float32Array(src.length),wrap=x=>(x%n+n)%n;for(let y=0;y<n;y++){let sum=0;for(let k=-r;k<=r;k++)sum+=src[y*n+wrap(k)];for(let x=0;x<n;x++){tmp[y*n+x]=sum/(2*r+1);sum+=src[y*n+wrap(x+r+1)]-src[y*n+wrap(x-r)];}}for(let x=0;x<n;x++){let sum=0;for(let k=-r;k<=r;k++)sum+=tmp[wrap(k)*n+x];for(let y=0;y<n;y++){out[y*n+x]=sum/(2*r+1);sum+=tmp[wrap(y+r+1)*n+x]-tmp[wrap(y-r)*n+x];}}return out;}
function colorInput(image,n){const c=new Float32Array(n*n*3),components=image.data.length/(image.width*image.height);if(![3,4].includes(components))throw Error('特色树皮需要RGB颜色图。');for(let y=0;y<n;y++)for(let x=0;x<n;x++){const sx=x/(n-1)*(image.width-1),sy=y/(n-1)*(image.height-1),ix=Math.floor(sx),iy=Math.floor(sy),tx=sx-ix,ty=sy-iy;for(let k=0;k<3;k++){const at=(xx,yy)=>image.data[(Math.min(yy,image.height-1)*image.width+Math.min(xx,image.width-1))*components+k];c[(y*n+x)*3+k]=mix(mix(at(ix,iy),at(ix+1,iy),tx),mix(at(ix,iy+1),at(ix+1,iy+1),tx),ty);}}
 // Paired narrow edge correction, shared BEFORE classification and all PBR.
 const band=Math.max(8,Math.round(n*.055));for(let axis=0;axis<2;axis++)for(let j=0;j<n;j++)for(let d=0;d<band;d++){const a=axis?d*n+j:j*n+d,b=axis?(n-1-d)*n+j:j*n+n-1-d,t=.5*(1-smooth(0,band,d));for(let k=0;k<3;k++){const aa=c[a*3+k],bb=c[b*3+k];c[a*3+k]=mix(aa,bb,t);c[b*3+k]=mix(bb,aa,t);}}return c;}
function palette(c,n){const pts=[],step=Math.max(1,Math.floor(n/90));for(let y=0;y<n;y+=step)for(let x=0;x<n;x+=step)pts.push([c[(y*n+x)*3],c[(y*n+x)*3+1],c[(y*n+x)*3+2]]);pts.sort((a,b)=>a[0]+a[1]+a[2]-b[0]-b[1]-b[2]);let centers=Array.from({length:6},(_,i)=>pts[Math.floor((i+.5)*pts.length/6)].slice());for(let it=0;it<9;it++){const sums=centers.map(()=>[0,0,0,0]);for(const p of pts){let chosen=0,best=Infinity;for(let i=0;i<centers.length;i++){const d=p.reduce((s,v,k)=>s+(v-centers[i][k])**2,0);if(d<best){best=d;chosen=i;}}for(let k=0;k<3;k++)sums[chosen][k]+=p[k];sums[chosen][3]++;}centers=centers.map((p,i)=>sums[i][3]?sums[i].slice(0,3).map(v=>v/sums[i][3]):p);}return centers.sort((a,b)=>a[0]+a[1]+a[2]-b[0]-b[1]-b[2]);}
function periodicNoise(u,v,seed){return Math.sin(2*Math.PI*(u*37+v*21)+seed)*.36+Math.sin(2*Math.PI*(u*91-v*67)+seed*1.7)*.24+Math.cos(2*Math.PI*(u*203+v*173)+seed*.37)*.2;}
export function generateFeaturedBark(image,raw,{size=1536,onProgress=()=>{}}={}){
 const options=featuredBarkOptions(raw),f=FEATURED_BARK_FAMILIES[options.family],p=options.params,n=size;if(!Number.isInteger(n)||n<32||n>2048)throw Error('特色树皮生成尺寸超出范围。');const c=colorInput(image,n),centers=palette(c,n),luma=new Float32Array(n*n),score=new Float32Array(n*n),hist=new Uint32Array(1024),young=centers.slice(-2).reduce((a,b)=>a.map((v,k)=>v+b[k]/2),[0,0,0]),old=centers.slice(0,3).reduce((a,b)=>a.map((v,k)=>v+b[k]/3),[0,0,0]);
 for(let i=0;i<n*n;i++)luma[i]=(c[i*3]*.2126+c[i*3+1]*.7152+c[i*3+2]*.0722)/255;const low=blur(luma,n,Math.max(1,Math.round(n/320)));onProgress(.18);
 for(let i=0;i<n*n;i++){let dy=0,doo=0;for(let k=0;k<3;k++){dy+=(c[i*3+k]-young[k])**2;doo+=(c[i*3+k]-old[k])**2;}const s=clamp(.5+(Math.sqrt(dy)-Math.sqrt(doo))/160);score[i]=s;hist[Math.round(s*1023)]++;}
 // Remove pores from the region classifier; pores belong to microrelief, not skin holes.
 const clean=blur(score,n,Math.max(1,Math.round(n/256)));hist.fill(0);for(let i=0;i<score.length;i++){score[i]=clean[i];hist[Math.round(score[i]*1023)]++;}
 let sum=0,cut=.5,baseCut=.5;for(let i=0;i<1024;i++){sum+=hist[i];if(sum>=n*n*(1-p.retention)){cut=i/1023;break;}}sum=0;for(let i=0;i<1024;i++){sum+=hist[i];if(sum>=n*n*(1-f.retention)){baseCut=i/1023;break;}}
 const mask=new Float32Array(n*n),height=new Float32Array(n*n),edges=new Float32Array(n*n),color=new Uint8Array(n*n*4),roughness=new Uint8Array(n*n*4),orm=new Uint8Array(n*n*4);let oldPixels=0;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,u=x/(n-1),v=y/(n-1),noise=periodicNoise(u,v,p.seed),jag=periodicNoise(u*2,v*2,p.seed+3)*p.damage*.055,original=smooth(baseCut-.055,baseCut+.055,score[i]),m=p.retention===0?0:p.retention===1?1:smooth(cut-.025,cut+.025,score[i]+jag),edge=4*m*(1-m),micro=clamp((luma[i]-low[i])*2,-.12,.12);mask[i]=m;edges[i]=edge;oldPixels+=m;
  // A flat, physically shallow skin step plus independent fine pores, NOT luma height.
  height[i]=.6+m*p.thicknessMm+edge*p.thicknessMm*.22+micro*p.grain*.18+noise*p.grain*.025;
  for(let k=0;k<3;k++){let value=c[i*3+k];if(m<original)value=mix(value,young[k]+(luma[i]-low[i])*115,clamp(original-m));else value=mix(value,old[k]+(luma[i]-low[i])*115,clamp(m-original));color[i*4+k]=Math.round(clamp(value/255)*255);}color[i*4+3]=255;const r=clamp(p.roughness+(m-.5)*.065+noise*.018*p.grain,.3,1);roughness.set([Math.round(r*255),Math.round(r*255),Math.round(r*255),255],i*4);const ao=1-edge*.1;orm.set([Math.round(ao*255),Math.round(r*255),0,255],i*4);
 }
 // Duplicate the periodic endpoint consistently across ALL channels before gradients.
 for(const a of [height,mask,edges]){for(let i=0;i<n;i++){a[i*n+n-1]=a[i*n];a[(n-1)*n+i]=a[i];}}
 for(const a of [color,roughness,orm])for(let i=0;i<n;i++)for(let k=0;k<4;k++){a[(i*n+n-1)*4+k]=a[i*n*4+k];a[((n-1)*n+i)*4+k]=a[i*4+k];}
 onProgress(.55);
 const normal=new Uint8Array(n*n*4),height16=new Uint16Array(n*n),maskImage=new Uint8Array(n*n*4),edgeImage=new Uint8Array(n*n*4),width=f.width*p.patchCm/f.patchCm,denom=2*width*1000/(n-1),at=(x,y)=>height[((y+n-1)%(n-1))*n+(x+n-1)%(n-1)];let normalEnergy=0;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,nx=(at(x-1,y)-at(x+1,y))/denom,ny=(at(x,y-1)-at(x,y+1))/denom,len=Math.hypot(nx,ny,1);normal.set([Math.round((nx/len*.5+.5)*255),Math.round((ny/len*.5+.5)*255),Math.round((1/len*.5+.5)*255),255],i*4);normalEnergy+=nx*nx+ny*ny;height16[i]=Math.round(clamp(height[i]/4)*65535);const m=Math.round(mask[i]*255),e=Math.round(edges[i]*255);maskImage.set([m,m,m,255],i*4);edgeImage.set([e,e,e,255],i*4);}
 onProgress(1);return{width:n,height:n,color,normal,height16,roughness,orm,mask:maskImage,edge:edgeImage,options,settings:featuredBarkSettings(options),metrics:{oldCoverage:oldPixels/(n*n),normalSlopeRMS:Math.sqrt(normalEnergy/(n*n)),heightReferenceMm:4,physicalWidthMeters:width,geometrySource:'classified thin skin and independent microrelief'}};
}
