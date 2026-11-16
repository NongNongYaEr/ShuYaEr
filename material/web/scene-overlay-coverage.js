import {createSceneOverlayPattern,sceneBiteFootprintCm,sceneBrandFootprintCm} from './scene-overlay-pattern.js';

const clamp=value=>Math.max(0,Math.min(1,value));
const mix=(a,b,t)=>a+(b-a)*t;
const degrees=Math.PI/180;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const pulse=(distance,width,edge)=>1-smooth(width,width+edge,Math.abs(distance));
const low=(height,cutoff,edge)=>1-smooth(cutoff,cutoff+edge,height);
const empty=()=>0;

function hash(x,y,z,seed){
 let h=Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791)^Math.imul(seed+17,1274126177);
 h=Math.imul(h^(h>>>13),1274126177);
 return ((h^(h>>>16))>>>0)/4294967295;
}

function noise(x,y,z,seed){
 const i=Math.floor(x),j=Math.floor(y),k=Math.floor(z);
 const a=smooth(0,1,x-i),b=smooth(0,1,y-j),c=smooth(0,1,z-k);
 const row=(dy,dz)=>mix(hash(i,j+dy,k+dz,seed),hash(i+1,j+dy,k+dz,seed),a);
 return mix(mix(row(0,0),row(1,0),b),mix(row(0,1),row(1,1),b),c);
}

// One compact, seeded feature per cell. Bounded jitter keeps it away from the cell seam.
function cellField(x,y,z,scale,seed){
 const u=x/scale,v=y/scale,w=z/scale;
 const i=Math.floor(u),j=Math.floor(v),k=Math.floor(w);
 const a=u-i-mix(.42,.58,hash(i,j,k,seed));
 const b=v-j-mix(.42,.58,hash(i,j,k,seed+13));
 const c=w-k-mix(.42,.58,hash(i,j,k,seed+37));
 return Math.hypot(a,b,c)*scale;
}

function scatteredStamps(pattern,x,z,size,density,seed,role){
 const pitch=size*1.33,u=x/pitch,v=z/pitch,i=Math.floor(u),j=Math.floor(v);
 if(hash(i,0,j,seed+83)>density)return 0;
 const dx=(u-i-mix(.45,.55,hash(i,0,j,seed)))*pitch*2/size;
 const dz=(v-j-mix(.45,.55,hash(i,0,j,seed+37)))*pitch*2/size;
 const turn=Math.floor(hash(i,0,j,seed+59)*4)%4;
 const a=turn===0?dx:turn===1?dz:turn===2?-dx:-dz;
 const b=turn===0?dz:turn===1?-dx:turn===2?-dz:dx;
 return pattern(a,b,role);
}

const unit=([x,y,z]=[0,0,1])=>{const d=Math.hypot(x,y,z);return d?[x/d,y/d,z/d]:[0,0,1];};
const cross=([x,y,z],[a,b,c])=>[y*c-z*b,z*a-x*c,x*b-y*a];
const dot=([a,b,c],x,y,z)=>a*x+b*y+c*z;

function localProjection(point,width,height,sample,{rotation=0,shift=0,depth=Math.min(width,height)*.35}={}){
 if(!point)return empty;
 const origin=point.position,normal=unit(point.normal),up=Math.abs(normal[1])<.95?[0,1,0]:[0,0,1];
 const U=unit(cross(up,normal)),V=cross(normal,U),cs=Math.cos(rotation*degrees),sn=Math.sin(rotation*degrees);
 const right=U.map((v,i)=>v*cs+V[i]*sn),top=V.map((v,i)=>v*cs-U[i]*sn);
 const sx=2/width,sy=2/height,supportDepth=Math.max(.002,depth);
 return (x,y,z,nx,ny,nz)=>{
  const dx=x-origin[0],dy=y-origin[1],dz=z-origin[2];
  const h=Math.abs(dot(normal,dx,dy,dz));
  if(h>=supportDepth)return 0;
  const u=dot(right,dx,dy,dz)*sx,v=(dot(top,dx,dy,dz)-shift)*sy;
  if(Math.abs(u)>1||Math.abs(v)>1)return 0;
  const facing=smooth(-.05,.50,dot(normal,nx,ny,nz));
  return facing*low(h,supportDepth*.6,supportDepth*.4)*sample(u,v);
 };
}

function pathProjection(points,width,sample,{shiftY=0}={}){
 if(!points.length)return empty;
 const spans=[];
 const radius=width*.5,radiusSquared=radius*radius;
 const lower=[Infinity,Infinity,Infinity],upper=[-Infinity,-Infinity,-Infinity];
 let distance=0;
 for(let i=0;i<Math.max(1,points.length-1);i++){
  const p=points[i],q=points[i+1]??p;
  const [x,y,z]=p.position,[a,b,c]=q.position;
  const dx=a-x,dy=b-y,dz=c-z,length=Math.hypot(dx,dy,dz);
  const n=unit(p.normal),m=unit(q.normal),side=length?unit(cross(n,[dx,dy,dz])):unit(cross([0,1,0],n));
  const minimum=[Math.min(x,a)-radius,Math.min(y,b)+shiftY-radius,Math.min(z,c)-radius];
  const maximum=[Math.max(x,a)+radius,Math.max(y,b)+shiftY+radius,Math.max(z,c)+radius];
  for(let axis=0;axis<3;axis++){
   lower[axis]=Math.min(lower[axis],minimum[axis]);
   upper[axis]=Math.max(upper[axis],maximum[axis]);
  }
  spans.push({x,y:y+shiftY,z,dx,dy,dz,length,distance,n,m,side,minimum,maximum,scale:length?1/(length*length):0});
  distance+=length;
 }
 const first=points[0].position,last=points.at(-1).position;
 const closed=points.length>3&&Math.hypot(first[0]-last[0],first[1]-last[1],first[2]-last[2])<radius;
 const inward=closed?Math.sign(spans.reduce((sum,span)=>{
  const area=cross([span.x-first[0],span.y-shiftY-first[1],span.z-first[2]],[span.dx,span.dy,span.dz]);
  return sum+dot(span.n,...area);
 },0))||1:1;
 return (x,y,z,nx,ny,nz,convex,concave,ao)=>{
  if(x<lower[0]||x>upper[0]||y<lower[1]||y>upper[1]||z<lower[2]||z>upper[2])return 0;
  let best=radiusSquared,found=false,along=0,lateral=0;
  for(const s of spans){
   if(x<s.minimum[0]||x>s.maximum[0]||y<s.minimum[1]||y>s.maximum[1]||z<s.minimum[2]||z>s.maximum[2])continue;
   const dx=x-s.x,dy=y-s.y,dz=z-s.z;
   const t=clamp((dx*s.dx+dy*s.dy+dz*s.dz)*s.scale);
   const a=dx-t*s.dx,b=dy-t*s.dy,c=dz-t*s.dz,d=a*a+b*b+c*c;
   if(d>=best)continue;
   const normal=dot(s.n,nx,ny,nz)*(1-t)+dot(s.m,nx,ny,nz)*t;
   if(normal<.20)continue;
   found=true;
   best=d;
   along=s.distance+t*s.length;
   lateral=dot(s.side,a,b,c)/radius;
  }
  return found?sample(Math.sqrt(best)/radius,along,lateral*inward,convex,concave,ao):0;
 };
}

const geometryStyles=new Set(['litter','rime','rub','filler','drying','snowmelt','dew']);
export const sceneOverlayGeometry=style=>geometryStyles.has(style);

export function createSceneOverlayCoverage({style,role='main',params={},points=[],textMask:storedTextMask=null},
 {seed=0,textMask=null,min=[0,0,0],max=[1,1,1],samplePattern}={}){
 const read=(key,otherwise)=>Number.isFinite(params[key])?params[key]:otherwise;
 const cm=(key,otherwise)=>Math.max(.001,read(key,otherwise)*.01);
 const ratio=(key,otherwise)=>clamp(read(key,otherwise));
 const pattern=samplePattern??createSceneOverlayPattern(style,params,{textMask:storedTextMask});
 const amount=ratio('amount',.75),progress=ratio('progress',.5),direction=read('direction',0),rotation=read('rotation',0);
 const east=Math.sin(direction*degrees),north=Math.cos(direction*degrees);
 const size=cm('size',18),width=cm('width',20),length=cm('length',45),spacing=cm('spacing',7);
 const depth=Math.max(0,read('depth',4))*.001;
 const localPoints=min[1]===0?points:points.map(({position,normal})=>({position:[position[0],position[1]-min[1],position[2]],normal}));
 const point=localPoints[0],treeHeight=Math.max(.1,max[1]-min[1]);
 const cx=(max[0]+min[0])*.5,cz=(max[2]+min[2])*.5;
 const grain=(x,y,z,scale,shift=0)=>noise(x/scale,y/scale,z/scale,seed+shift);
 const pointMask=(w,h,sampler,options)=>localProjection(point,w,h,sampler,options);
 const pathMask=(w,sampler,options)=>pathProjection(localPoints,w,sampler,options);
 const round=(u,v,edge=.25)=>low(Math.hypot(u,v),1-edge,edge);
 const roundStamp=(u,v)=>round(u,v);
 const finish=sample=>(x,y,z,nx,ny,nz,convex=0,concave=0,ao=1,under=1)=>
  clamp(sample(x,y-min[1],z,nx,ny,nz,convex,concave,ao,under));

 switch(style){
 case 'tide':{
  const height=read('height',.95),edge=width*.18;
  return finish((x,y,z)=>{
   const jitter=(grain(x,y,z,width*1.47)-.5)*edge;
   return amount*(role==='line'
    ?pulse(y-height+jitter,width*.025,width*.075)*smooth(.16,.64,grain(x,y,z,width*.78,31))
    :smooth(height-width-edge,height-width,y)*(1-smooth(height-edge,height,y+jitter)));
  });
 }
 case 'strap':return finish(pathMask(width,(r,along)=>{
  const compression=mix(.32,1,smooth(0,.012,depth));
  return amount*compression*(role==='rim'?pulse(r-.82,.035,.13)*mix(.74,1,grain(along,0,0,width*.37)):(1-smooth(.61,.89,r)));
 }));
 case 'spray':{
  const stencil=typeof textMask==='function'?textMask:pattern??empty;
  return finish(pointMask(width,cm('height',16),(u,v)=>stencil(u,v,role),{rotation}));
 }
 case 'sap':{
  const tail=ratio('tail',.68);
  if(role==='drop'){
   const origin=pointMask(width*1.15,width*1.3,(u,v)=>round(u,v,.38)*.92,{shift:width*.10});
   if(tail===0)return finish(origin);
   const dropWidth=width*mix(.22,1.13,tail),dropHeight=dropWidth*1.34;
   const drop=pointMask(dropWidth,dropHeight,(u,v)=>round(u,v,.41)*smooth(0,.20,tail),{shift:-length*.93,depth:width*.62});
   return finish((x,y,z,nx,ny,nz)=>Math.max(origin(x,y,z,nx,ny,nz),drop(x,y,z,nx,ny,nz)));
  }
  return finish(pointMask(width*1.8,length,(u,v)=>{
   const t=(1-v)*.5,curve=(noise(t*3,.5,.7,seed+7)-.5)*t*.7;
   const stem=pulse(u-curve,mix(.19,.055,t),.15);
   return stem*low(t,.82,.18)*mix(.95,.43,t);
  },{shift:-length*.5,depth:width*.62}));
 }
 case 'paint-peel':{
  const bare=ratio('bare',.32),undercoat=ratio('undercoat',.58),peel=bare+(1-bare)*undercoat;
  const border=.012;
  if(bare===1)return empty;
  return finish((x,y,z)=>{
   const field=grain(x,y,z,size)*.82+grain(x,y,z,size*.27,29)*.18;
   const intact=peel===0?1:peel===1?0:1-smooth(1-peel-border,1-peel+border,field);
   if(role!=='primer')return intact;
   const bareWood=bare===0?0:smooth(1-bare-border,1-bare+border,field);
   return undercoat===0?0:Math.max(0,1-intact-bareWood);
  });
 }
 case 'vine-print':return finish(pathMask(size*1.7,(r,along,lateral)=>{
  const index=Math.floor(along/spacing+.5),t=along-index*spacing;
  const offset=mix(-.3,.3,hash(index,0,0,seed));
  return amount*low(Math.hypot((lateral-offset)*.85,t/size),.34,.25)*low(r,.67,.33);
 }));
 case 'tool-teeth':if(localPoints.length<2)return empty;return finish(pathMask(width,(r,along,lateral)=>{
  const teeth=(along+.16*spacing)/spacing;
  return mix(.28,1,smooth(0,.016,depth))*pulse(teeth-Math.round(teeth),.11,.18)*low(r,.50,.50)*mix(.68,1,Math.abs(lateral));
 }));
 case 'hollow-rim':{
  const shine=ratio('shine',.55),dark=ratio('dark',.68);
  return finish(pathMask(width,(r,along,inward)=>{
   const mottled=mix(.73,1,grain(along,0,0,width*.75));
   return mottled*(role==='wall'
    ?dark*smooth(.14,.43,inward)*low(r,.50,.50)
    :shine*low(r,.23,.32)*(1-smooth(.14,.53,inward)));
  }));
 }
 case 'buried-slope':{
  const height=read('height',.65),slope=Math.tan(Math.min(75,Math.max(-75,read('slope',25)))*degrees);
  return finish((x,y,z)=>{
   const plane=height+slope*((x-cx)*east+(z-cz)*north);
   const worn=(grain(x,y,z,width*.9)-.5)*width*.6;
   return 1-smooth(plane-width*.7,plane+width*.3,y+worn);
  });
 }
 case 'litter':{
  const spread=cm('spread',36),stamp=pattern??roundStamp;
  return finish((x,y,z,nx,ny,nz,convex,concave,ao)=>{
   const catchment=low(y,spread*.54,spread*.65)*smooth(.15,.77,ny)*mix(.46,1,Math.max(concave,1-ao));
   if(catchment<.002)return 0;
   const visible=scatteredStamps(stamp,x,z,size,mix(.15,.84,amount),seed,role);
   return amount*catchment*(role==='stain'?Math.max(visible*.55,smooth(.55,.80,grain(x,y,z,size*1.2))*.30):visible);
  });
 }
 case 'rime':{
  const threshold=mix(.53,.046,width/(width+.075)),textureScale=treeHeight*.018+.045;
  return finish((x,y,z,nx,ny,nz,convex)=>{
   const wind=smooth(.02,.79,nx*east+nz*north),ridge=smooth(threshold*.48,threshold,convex);
   return amount*wind*mix(.10,1,ridge)*smooth(.28,.65,grain(x,y,z,textureScale));
  });
 }
 case 'splash-fan':{
  const fan=Math.tan(read('angle',62)*degrees*.5),span=length*Math.max(.12,Math.min(2,fan));
  return finish(pointMask(span*2,length,(u,v)=>{
   const t=(1+v)*.5,edge=Math.abs(u)/Math.max(.08,t);
   return low(edge,.73,.27)*low(t,.71,.29)*smooth(.38,.64,noise(u*12,t*15,0,seed));
  },{rotation:direction,shift:length*.5,depth:length*.20}));
 }
 case 'smoke':{
  if(!point)return empty;
  const normal=unit(point.normal),right=unit(cross(Math.abs(normal[1])<.95?[0,1,0]:[0,0,1],normal));
  const wind=dot(right,east,0,north),spread=mix(.78,1.08,(dot(normal,east,0,north)+1)*.5);
  return finish(pointMask(length*1.44,length,(u,v)=>{
   const t=(v+1)*.5,bend=(wind*.59+(noise(t*2.7,.6,0,seed)-.5)*.28)*t;
   const body=pulse(u-bend,mix(.12,.37,t)*spread,.21)*smooth(0,.07,t)*low(t,.51,.49);
   return amount*body*mix(.35,1,noise(u*2.6,t*4.2,0,seed+31));
  },{shift:length*.5,depth:length*.17}));
 }
 case 'sprinkler':{
  if(!point)return empty;
  const normal=unit(point.normal),right=unit(cross(Math.abs(normal[1])<.95?[0,1,0]:[0,0,1],normal)),up=cross(normal,right);
  const distance=Math.max(.24,Math.min(1.25,treeHeight*.125));
  const offset=normal.map((v,i)=>distance*(v+.61*(right[i]*east+up[i]*north)));
  const origin=point.position.map((v,i)=>v+offset[i]),ray=unit(offset.map(value=>-value));
  const halfAngle=Math.max(2.5,Math.min(85,read('angle',75)*.5))*degrees;
  const outer=Math.cos(halfAngle),inner=Math.cos(halfAngle*.69),reach=distance*3.15;
  const scale=distance*.11;
  return finish((x,y,z,nx,ny,nz)=>{
   const dx=x-origin[0],dy=y-origin[1],dz=z-origin[2],range=Math.hypot(dx,dy,dz);
   if(range<.002||range>=reach)return 0;
   const incidence=dot(ray,dx,dy,dz)/range;
   if(incidence<=outer)return 0;
   const facing=smooth(.055,.66,-(nx*dx+ny*dy+nz*dz)/range);
   if(facing===0)return 0;
   const bands=.62+.38*(Math.sin(range/scale*2.7+grain(x,y,z,scale,17)*3)*.5+.5);
   const droplets=mix(.42,1,smooth(.32,.66,grain(x,y,z,scale*.47,23)));
   return amount*smooth(outer,inner,incidence)*low(range,reach*.59,reach*.41)*facing*bands*droplets;
  });
 }
 case 'rub':return finish(pathMask(width,(r,along,lateral,convex,concave,ao)=>{
  const stroke=grain(along,width*lateral,0,width*.45);
  const raised=mix(.32,1,smooth(.015,.48,convex))*mix(1,.20,Math.max(concave,(1-ao)*.62));
  return amount*raised*low(r,.43,.57)*mix(.57,1,stroke);
 },{shiftY:read('height',0)*.01}));
 case 'bite':return finish(pointMask(sceneBiteFootprintCm(width,spacing),width*3.5,(u,v)=>
  mix(.27,1,smooth(0,.016,depth))*(pattern?.(u,v,role)??round(u,v))));
 case 'graft':{
  const raised=mix(.35,1,smooth(0,.015,Math.max(0,read('height',6))*.001));
  return finish(pathMask(width,(r,along)=>{
   const n=grain(along,0,0,width*.65);
   return raised*(role==='rim'
    ?mix(.25,1,progress)*pulse(r-mix(.53,.31,progress),.045,.22)*mix(.62,1,n)
    :low(r,mix(.51,.16,progress),.34)*mix(1,.28,progress));
  }));
 }
 case 'blue-wood':{
  const stretch=ratio('stretch',.75);
  return finish(pointMask(length*mix(.62,.31,stretch),length,(u,v)=>
   amount*round(u,v,.39)*smooth(.24,.68,noise(u*mix(3,15,stretch),v*mix(5,2,stretch),0,seed))));
 }
 case 'leaf-print':{
  const density=ratio('density',.55),stamp=pattern??roundStamp;
  return finish((x,y,z,nx,ny)=>{
   const normal=smooth(.30,.85,ny),foot=low(y,treeHeight*.29,treeHeight*.17);
   return normal*foot*amount*scatteredStamps(stamp,x,z,size,density,seed,role);
  });
 }
 case 'lichen-ring':{
  const breakup=ratio('breakup',.45),rim=Math.min(width,size*.62);
  return finish((x,y,z)=>{
   const radius=size*.28,r=cellField(x,y,z,size,seed);
   const broken=mix(1,smooth(.24,.65,grain(x,y,z,rim*1.4,43)),breakup);
   return role==='ring'?pulse(r-radius,rim*.15,rim*.42)*broken:low(r,Math.max(0,radius-rim*.32),rim*.45)*mix(.56,1,broken);
  });
 }
 case 'shade-print':{
  const height=cm('height',22),edge=cm('edge',2);
  return finish(pointMask(width,height,(u,v)=>amount*low(Math.abs(u),Math.max(0,1-edge*2/width),Math.min(1,edge*2/width))*
   low(Math.abs(v),Math.max(0,1-edge*2/height),Math.min(1,edge*2/height))));
 }
 case 'rust':{
  if(role==='ring')return finish(pointMask(size,size,(u,v)=>amount*pulse(Math.hypot(u,v)-.57,.12,.22)));
  return finish(pointMask(size*1.75,length+size,(u,v)=>{
   const t=(1-v)*.5,core=size/(length+size),sway=(noise(t*3,.5,0,seed)-.5)*t*.65;
   return amount*Math.max(low(Math.hypot(u,(t-core*.47)/core),.37,.24),
    pulse(u-sway,mix(.20,.025,t),.15)*smooth(core*.2,core,t)*low(t,.51,.49)*mix(.26,1,noise(u*6,t*10,0,seed+9)));
  },{shift:-length*.5,depth:size*.5}));
 }
 case 'boot':return finish(pointMask(size*.55,size,(u,v)=>pattern?.(u,v,role)??round(u,v),{rotation}));
 case 'brand':{
  const span=sceneBrandFootprintCm(size,width,role);
  return finish(pointMask(span,span,(u,v)=>amount*(pattern?.(u,v,role)??pulse(Math.hypot(u,v)-.62,.036,.12)),{depth:size*.35}));
 }
 case 'saw':{
  const span=cm('size',22);
  return finish(pointMask(span*.82,span,(u,v)=>{
   const tooth=(v+1)*span/(spacing*2)+u*.14;
   return pulse(tooth-Math.round(tooth),.08,.17)*round(u,v,.45)*mix(.22,1,smooth(0,.013,depth));
  },{rotation:direction}));
 }
 case 'filler':return finish(pathMask(width,(r,along,lateral,convex,concave,ao)=>{
  const recess=smooth(.045,.70,Math.max(concave,(1-ao)*.87));
  const preference=mix(.22,1,recess)*mix(1,.43,smooth(.13,.75,convex));
  return amount*preference*low(r,.47,.48)*mix(.38,1,smooth(0,.018,depth))*mix(.72,1,grain(along,0,0,width*.28));
 }));
 case 'drying':{
  const retention=ratio('retention',.72),scale=treeHeight*.09;
  if(progress>=1||amount===0)return empty;
  return finish((x,y,z,nx,ny,nz,convex,concave,ao)=>{
   const pocket=clamp(Math.max(concave,1-ao)*1.16-convex*.39);
   const field=grain(x,y,z,scale)*.76+grain(x,y,z,scale*.29,31)*.24;
   const delay=mix(.25,.83,field)+pocket*retention*.24;
   return amount*low(progress,delay-.19,.19);
  });
 }
 case 'snowmelt':{
  if(progress>=1)return empty;
  return finish((x,y,z,nx,ny,nz,convex,concave,ao)=>{
   const upward=smooth(.08,.81,ny),sheltered=Math.max(concave,1-ao),exposed=smooth(-.35,.89,nx*east+nz*north);
   const block=grain(x,y,z,size)*.77+grain(x,y,z,size*.36,41)*.23;
   const left=mix(.24,.80,block)+sheltered*.13-exposed*.19;
   return upward*smooth(.18,.45,block)*low(progress,left-.19,.19);
  });
 }
 case 'dust-wash':{
  const edge=cm('edge',2),blendWidth=Math.min(.43,edge/size);
  return finish((x,y,z,nx,ny)=>{
   const v=noise(x/size,y/(size*3.9),z/size,seed);
   return amount*smooth(.53-blendWidth,.53+blendWidth,v)*mix(.57,1,smooth(-.4,.58,ny));
  });
 }
 case 'evaporation':return finish((x,y,z,nx,ny)=>{
  const mask=smooth(.02,.69,ny);
  const r=cellField(x,y,z,size,seed),radius=size*mix(.32,.19,progress);
  return amount*mask*(role==='ring'
   ?pulse(r-radius,size*.025,size*.065)*smooth(.1,.94,progress)*mix(.42,1,grain(x,y,z,size*.19,32))
   :low(r,radius*.64,size*.10)*(1-progress));
 });
 case 'dew':{
  const density=ratio('density',.52);
  return finish((x,y,z,nx,ny,nz,convex,concave,ao)=>{
   const shade=Math.max(concave,1-ao),under=smooth(.16,.79,-ny);
   const surface=mix(under,Math.max(shade,under),.43);
   const r=cellField(x,y,z,size*1.8,seed);
   const present=smooth(1-density-.12,1-density+.12,grain(x,y,z,size*2.8,17));
   return amount*surface*present*low(r,size*.22,size*.20);
  });
 }
 case 'bark-patch':{
  const scale=Math.max(.25,Math.min(4,read('scale',1))),edge=cm('edge',width*.23*100),feather=Math.min(1,edge*2/width);
  return finish(pathMask(width,(r,along,lateral)=>{
   const bark=grain(along,lateral*width,0,width*.32*scale);
   return low(r,1-feather,feather)*mix(.44,1,smooth(.22,.77,bark));
  }));
 }
 default:return empty;
 }
}
