import {MaterialPaintRasterizer} from './material-paint-raster.js';
import {makePaintAtlasLayout,paintAtlasBase,copyPaintRect,paintAtlasByteLength} from './paint-atlas.js';
let source,working,raster,key,mask,analysis;
export function atlasMipmaps(width,height,data){
 const levels=[{width,height,data}],floating=data instanceof Float32Array;
 while(width>1||height>1){const w=Math.max(1,width>>1),h=Math.max(1,height>>1),next=new data.constructor(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++){const value=(data[((y*2)*width+x*2)*4+c]+data[((y*2)*width+Math.min(width-1,x*2+1))*4+c]+data[(Math.min(height-1,y*2+1)*width+x*2)*4+c]+data[(Math.min(height-1,y*2+1)*width+Math.min(width-1,x*2+1))*4+c])/4;next[(y*w+x)*4+c]=floating?value:Math.round(value);}
  width=w;height=h;data=next;levels.push({width,height,data});
 }return levels;
}
self.onmessage=({data})=>{try{
 if(data.source){source=data.source;working=data.working;raster=null;analysis=null;}if(data.mask)mask=data.mask;
 const region=data.region||[0,0,1,1],nextKey=JSON.stringify([data.size,data.padding,region]);
 if(!raster||key!==nextKey){raster=new MaterialPaintRasterizer(source,working,data.size,null,{padding:data.padding,region,analysis});analysis={topology:raster.topology,geometry:raster.geometry};key=nextKey;}
 const start=performance.now(),layout=makePaintAtlasLayout(data.effects.map(e=>e.id),data.size),results=[];let occupied=false;
 for(const e of data.effects){const result=raster.render(e,data.height);results.push([e.id,result.maps]);if(!occupied)for(let i=3;i<result.maps[0].length;i+=4)if(result.maps[0][i]>0){occupied=true;break;}if(data.finished)raster.caches.get(e.id).active=null;}
 for(const id of raster.caches.keys())if(!layout.ids.includes(id))raster.caches.delete(id);
 if(!occupied){self.postMessage({id:data.id,empty:true,region,elapsed:performance.now()-start});return;}
 if(paintAtlasByteLength(layout)>112*1024*1024)throw Error('材质绘制缓存超出原生上传预算。');
 const pixels=paintAtlasBase(layout,mask.data,mask.size,region);for(const[id,maps]of results)for(let m=0;m<3;m++)copyPaintRect(pixels,layout.width,layout.rects[id+':'+m],maps[m]);
 const levels=atlasMipmaps(layout.width,layout.height,pixels);self.postMessage({id:data.id,layout,levels,region,elapsed:performance.now()-start},levels.map(l=>l.data.buffer));
}catch(e){self.postMessage({id:data.id,error:e.message});}};
