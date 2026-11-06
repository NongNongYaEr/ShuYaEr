import {brushTipAlpha} from './material-brushes.js';
import {buildBrushTopology,connectedBrushFaces,PixelMaskRasterizer} from './pixel-masks.js';
import {createBrushGeometry} from './brush-preview-geometry.js';
import {paintStampSeed,randomStream,paintStrokeKey,paintMaterialChannels} from './material-paint.js';
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d);},clamp=x=>Math.max(0,Math.min(1,x));
const TILE=128,CHANNELS=12;
export class MaterialPaintRasterizer{
 constructor(source,working,resolution,_unusedAsset,{padding=2,region=[0,0,1,1],analysis=null}={}){this.source=source;this.resolution=resolution;this.region=region;this.topology=analysis?.topology||buildBrushTopology(source);this.geometry=analysis?.geometry||createBrushGeometry(source);const uv=Float32Array.from(working.uv,(v,i)=>(v-region[i%2])/region[2+i%2]);this.raster=new PixelMaskRasterizer(this.topology,{...working,uv},resolution,{padding,channels:1});this.caches=new Map();this.totalPixels=resolution*resolution;this.padding=padding;}
 point(face,bary){const ids=this.source.indices;return[0,1,2].map(k=>[0,1,2].reduce((s,c)=>s+this.source.pos[ids[face*3+c]*3+k]*bary[c],0));}
 normal(face,bary){const ids=this.source.indices;return unit([0,1,2].map(k=>[0,1,2].reduce((s,c)=>s+this.source.normal[ids[face*3+c]*3+k]*bary[c],0)));}
 stamp(stroke,dab,index,height,visit){
  if(dab.face>=this.raster.triangles.length)throw Error('材质笔触超出源模型。');
  const random=randomStream(paintStampSeed(stroke.seed,index)),normal=this.normal(dab.face,dab.bary),u=unit(cross(Math.abs(normal[1])>.95?[1,0,0]:[0,1,0],normal)),v=cross(normal,u),angle=(random()-.5)*Math.PI*2*stroke.brush.angleJitter,co=Math.cos(angle),si=Math.sin(angle),U=u.map((x,k)=>x*co+v[k]*si),V=v.map((x,k)=>x*co-u[k]*si),radius=stroke.brush.diameter*.5*(.85+random()*.15)/(1+stroke.brush.scatter),sx=(random()-.5)*stroke.brush.scatter,sy=(random()-.5)*stroke.brush.scatter,sourceScale=height/this.source.height,eye=stroke.eye.map((x,k)=>x*this.source.height+this.source.min[k]),q=connectedBrushFaces(this.topology,{...dab,radiusMeters:radius*(1+stroke.brush.scatter)},height),touched=new Set(),values=paintMaterialChannels(stroke.material).flat();
  for(const face of q.faces){const t=this.raster.triangles[face];if(!t)continue;const delta=sub(q.center,t.p[0]),cu=t.uv[0][0]+dot(delta,t.gu),cv=t.uv[0][1]+dot(delta,t.gv),ru=q.radius*Math.hypot(...t.gu),rv=q.radius*Math.hypot(...t.gv);
   this.raster.walk(t,[Math.max(t.bounds[0],cu-ru),Math.max(t.bounds[1],cv-rv),Math.min(t.bounds[2],cu+ru),Math.min(t.bounds[3],cv+rv)],(i,a,b,c)=>{
    if(touched.has(i))return;const bary=[a,b,c],p=this.point(face,bary),N=this.normal(face,bary),d=sub(p,q.center).map(x=>x*sourceScale),x=dot(d,U)/radius-sx,y=dot(d,V)/radius-sy,rho=Math.hypot(x,y);
    if(rho>1||Math.abs(dot(d,normal))>radius*.7||dot(N,normal)<.25)return;const direction=unit(sub(p,eye));if(dot(N,direction)>-.05)return;const hit=this.geometry.pick({origin:eye,direction});if(hit&&hit.distance<Math.hypot(...sub(p,eye))-Math.max(this.source.height*3e-6,radius/sourceScale*.002))return;
    touched.add(i);const fall=brushTipAlpha(x,y,stroke.brush,paintStampSeed(stroke.seed,index));visit(i,fall*stroke.brush.flow,stroke.operation==='erase'?null:values);
   });
  }
 }
 render(effect,height){const strokes=effect.paint.strokes,key=JSON.stringify([height,this.region]),old=this.caches.get(effect.id);let cache=old;if(!cache||cache.key!==key)cache={key,maps:Array.from({length:3},()=>new Float32Array(this.totalPixels*4)),prefix:[],active:null};let prefix=0;while(prefix<cache.prefix.length&&prefix<strokes.length&&cache.prefix[prefix]===JSON.stringify(strokes[prefix]))prefix++;const canExtend=cache.active&&prefix===strokes.length-1&&cache.active.key===paintStrokeKey(strokes.at(-1))&&strokes.at(-1).dabs.length>=cache.active.count&&JSON.stringify(strokes.at(-1).dabs.slice(0,cache.active.count))===cache.active.dabs;
 if(prefix<cache.prefix.length&&!canExtend){cache={key,maps:Array.from({length:3},()=>new Float32Array(this.totalPixels*4)),prefix:[],active:null};prefix=0;}
 const dirty=new Set(),s=this.resolution;
 function cell(i){const x=i%s,y=(i-x)/s,tx=Math.floor(x/TILE),ty=Math.floor(y/TILE),id=ty*Math.ceil(s/TILE)+tx;return{id,x,y,local:(y%TILE)*TILE+x%TILE,tx,ty};}
 const tileFor=(active,i)=>{const info=cell(i);let tile=active.tiles.get(info.id);if(!tile){const before=new Float32Array(TILE*TILE*CHANNELS);for(let yy=0;yy<TILE;yy++)for(let xx=0;xx<TILE;xx++){const x=info.tx*TILE+xx,y=info.ty*TILE+yy;if(x>=s||y>=s)continue;for(let map=0;map<3;map++)for(let c=0;c<4;c++)before[((yy*TILE+xx)*12)+map*4+c]=cache.maps[map][(y*s+x)*4+c];}tile={...info,before,stroke:new Float32Array(TILE*TILE*CHANNELS)};active.tiles.set(info.id,tile);}return{tile,at:info.local*12};};
 for(let n=prefix;n<strokes.length;n++){const stroke=strokes[n];let active=n===strokes.length-1&&canExtend?cache.active:null;if(!active)active={key:paintStrokeKey(stroke),count:0,dabs:'[]',tiles:new Map()};for(let at=active.count;at<stroke.dabs.length;at++)this.stamp(stroke,stroke.dabs[at],at,height,(i,a,values)=>{const{tile,at}=tileFor(active,i),p=tile.stroke,remain=1-a;p[at+3]=a+p[at+3]*remain;if(values){const source=values;for(let k=0;k<12;k++)if(k!==3)p[at+k]=source[k]*a+p[at+k]*remain;}dirty.add(tile.id);});
  for(const tile of active.tiles.values()){if(!dirty.has(tile.id)&&n===strokes.length-1&&canExtend)continue;dirty.add(tile.id);for(let yy=0;yy<TILE;yy++)for(let xx=0;xx<TILE;xx++){const x=tile.tx*TILE+xx,y=tile.ty*TILE+yy;if(x>=s||y>=s)continue;const local=(yy*TILE+xx)*12,a=tile.stroke[local+3]*stroke.brush.opacity;for(let map=0;map<3;map++)for(let c=0;c<4;c++){const k=map*4+c,base=tile.before[local+k],value=stroke.operation==='erase'?base*(1-a):tile.stroke[local+k]*stroke.brush.opacity+base*(1-a);cache.maps[map][(y*s+x)*4+c]=clamp(value);}}}
  active.count=stroke.dabs.length;active.dabs=JSON.stringify(stroke.dabs);cache.prefix[n]=JSON.stringify(stroke);cache.active=n===strokes.length-1?active:null;
 }
 // Padding copies only covered boundary pixels; all PBR channels use the same source.
 if(dirty.size)for(let i=0;i<this.totalPixels;i++){const from=this.raster.nearest[i];if(from>=0&&from!==i){const target=cell(i),origin=cell(from);if(!dirty.has(origin.id))continue;for(const map of cache.maps)for(let c=0;c<4;c++)map[i*4+c]=map[from*4+c];dirty.add(target.id);}}
 this.caches.set(effect.id,cache);const patches=[];for(const id of dirty){const tx=id%Math.ceil(s/TILE),ty=Math.floor(id/Math.ceil(s/TILE)),width=Math.min(TILE,s-tx*TILE),height=Math.min(TILE,s-ty*TILE);for(let map=0;map<3;map++){const data=new Float32Array(width*height*4);for(let row=0;row<height;row++)data.set(cache.maps[map].subarray(((ty*TILE+row)*s+tx*TILE)*4,((ty*TILE+row)*s+tx*TILE+width)*4),row*width*4);patches.push({map,x:tx*TILE,y:ty*TILE,width,height,data});}}
 return{maps:cache.maps,patches,changed:dirty.size>0};
 }
}
