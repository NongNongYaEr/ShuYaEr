import {collectUvCharts} from './uv-charts.js';
import {rasterTriangle,dilate,fitAroundIslands} from './uv-outline-packing.js';
import {clearanceAtResolution,measureUvClearance,strictUvCharts} from './uv-clearance.js';
import {analyzeUV} from './uv-analysis.js';
import {assertUvIslandsPreserved} from './uv-layout-policy.js';
import {verifySurfacePreserved} from './mesh-codec.js';

function maskRuns(bitmap,w,h){
 const runs=[];
 for(let y=0;y<h;y++){
  let start=-1;
  for(let x=0;x<=w;x++){
   const active=x<w&&bitmap[y*w+x];
   if(active&&start<0)start=x;
   else if(!active&&start>=0){runs.push(y,start,x);start=-1;}
  }
 }
 return Int32Array.from(runs);
}

// The raster overlap count guides the search. The caller checks the final
// triangle clearances before offering this layout as a candidate.
function relaxAtlas(mesh,{resolution,padding,grid,scale,sweeps,seed,keep,deadline}){
 const {labels}=strictUvCharts(mesh),{charts,faceIslands}=collectUvCharts(mesh,{faceCharts:labels});
 const pad=Math.ceil((padding+.5)/resolution*grid),pixelScale=grid*scale;
 const occupancy=new Uint16Array(grid*grid),sums=new Int32Array((grid+1)*grid);
 let random=seed>>>0;
 const next=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return (random>>>0)/4294967296;};
 const clamp=(v,max)=>Math.min(max,Math.max(0,v));
 const shapes=charts.map(chart=>{
  const origin=chart.min.map(v=>Math.floor(v*pixelScale)-pad);
  const [w,h]=chart.max.map((v,axis)=>Math.ceil(v*pixelScale)-origin[axis]+pad+1);
  if(w>grid||h>grid)return null;
  const bitmap=new Uint8Array(w*h);
  for(const face of chart.faces)rasterTriangle(bitmap,w,h,[0,1,2].map(c=>{
   const at=mesh.indices[face*3+c]*2;
   return [mesh.uv[at]*pixelScale-origin[0],mesh.uv[at+1]*pixelScale-origin[1]];
  }));
  let padded=dilate(bitmap,w,h,pad),width=w,height=h;
  const masks=[];
  for(let turn=0;turn<4;turn++){
   masks.push({runs:maskRuns(padded,width,height),w:width,h:height,turn});
   if(turn===3)break;
   const rotated=new Uint8Array(padded.length);
   for(let cy=0;cy<height;cy++)for(let cx=0;cx<width;cx++)rotated[(width-1-cx)*height+cy]=padded[cy*width+cx];
   padded=rotated;[width,height]=[height,width];
  }
  const runs=masks[0].runs;
  const [x,y]=origin.map((o,k)=>clamp(Math.round(o-((chart.min[k]+chart.max[k])/2)*(pixelScale-grid)),grid-(k?h:w)));
  return {origin,runs,w,h,x,y,masks,turn:0,area:runs.reduce((sum,v,i)=>i%3===2?sum+v-runs[i-1]:sum,0)};
 });
 if(shapes.some(shape=>!shape))return null;
 function stamp(shape,amount){
  const {runs,x,y}=shape;
  for(let i=0;i<runs.length;i+=3){
   const at=(y+runs[i])*grid+x,limit=at+runs[i+2];
   for(let p=at+runs[i+1];p<limit;p++)occupancy[p]+=amount;
  }
 }
 function score(shape){
  const {runs,x,y}=shape;
  let total=0;
  for(let i=0;i<runs.length;i+=3){
   const at=(y+runs[i])*grid+x,limit=at+runs[i+2];
   for(let p=at+runs[i+1];p<limit;p++)total+=occupancy[p]-1;
  }
  return total;
 }
 function relocate(shape,sweep,initialScore,global){
  stamp(shape,-1);
  const {w,h,x,y}=shape;
  const reach=Math.max(6,Math.min(44,Math.round(Math.sqrt(shape.area)*.30)));
  const low=global?0:Math.max(0,y-reach),high=global?grid:Math.min(grid,y+h+reach),stride=grid+1;
  for(let row=low;row<high;row++){
   const at=row*grid,base=row*stride;
   let sum=0;
   for(let col=0;col<grid;col++){sum+=occupancy[at+col];sums[base+col+1]=sum;}
  }
  let best=initialScore,bx=x,by=y,bestMask=shape.masks[shape.turn];
  function tryAt(cx,cy,mask=shape.masks[shape.turn]){
   if(cx===bx&&cy===by&&mask===bestMask)return;
   const candidate=mask.runs;
   let overlap=0;
   for(let i=0;i<candidate.length;i+=3){
    const at=(cy+candidate[i])*stride+cx;
    overlap+=sums[at+candidate[i+2]]-sums[at+candidate[i+1]];
    if(overlap>=best)return;
   }
   best=overlap;bx=cx;by=cy;bestMask=mask;
  }
  if(global){
   const step=shape.area<1200?5:Math.max(6,Math.round(grid/90));
   const startX=Math.floor(next()*step),startY=Math.floor(next()*step);
   for(const mask of shape.masks){
    for(let cy=startY;cy+mask.h<=grid&&best;cy+=step)for(let cx=startX;cx+mask.w<=grid&&best;cx+=step)tryAt(cx,cy,mask);
    for(const cy of [0,grid-mask.h])for(let cx=0;cx+mask.w<=grid&&best;cx+=step)tryAt(cx,cy,mask);
    for(const cx of [0,grid-mask.w])for(let cy=0;cy+mask.h<=grid&&best;cy+=step)tryAt(cx,cy,mask);
   }
  }
  for(const offset of [reach,Math.ceil(reach/2),Math.ceil(reach/4),2,1]){
   const sx=bx,sy=by;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){
    const mask=bestMask,cx=clamp(sx+dx*offset,grid-mask.w),cy=clamp(sy+dy*offset,grid-mask.h);
    if(cy>=low&&cy+mask.h<=high)tryAt(cx,cy,mask);
   }
  }
  if(best>0)for(let k=0;k<12;k++){
   const cx=clamp(x+Math.round((next()*2-1)*reach),grid-w),cy=clamp(y+Math.round((next()*2-1)*reach),grid-h);
   tryAt(cx,cy);
  }
  Object.assign(shape,bestMask,{x:bx,y:by});
  if(best===initialScore&&sweep%7===6&&next()<.35){
   const step=Math.max(3,Math.ceil(reach*.28));
   shape.x=clamp(x+Math.round((next()*2-1)*step),grid-w);
   shape.y=clamp(y+Math.round((next()*2-1)*step),grid-h);
  }
  stamp(shape,1);
 }
 const placed=keep?shapes.slice().sort((a,b)=>b.area-a.area).slice(0,keep):shapes;
 for(const shape of placed)stamp(shape,1);
 let remaining=Infinity;
 for(let sweep=0;sweep<sweeps;sweep++){
  if(Date.now()>=deadline)return null;
  const order=placed.map(shape=>({shape,score:score(shape)})).filter(x=>x.score>0);
  remaining=order.reduce((sum,x)=>sum+x.score,0)/2;
  if(!remaining)break;
  order.sort((a,b)=>b.score-a.score);
  if(sweep%4===2)order.reverse();
  const global=new Set(sweep%3===1?order.filter(({shape})=>shape.area<=grid*grid*.045)
   .sort((a,b)=>b.score/Math.sqrt(b.shape.area)-a.score/Math.sqrt(a.shape.area)).slice(0,12).map(x=>x.shape):[]);
  for(const {shape} of order){
   const cost=score(shape);
   if(cost)relocate(shape,sweep,cost,global.has(shape));
  }
 }
 remaining=placed.reduce((sum,shape)=>sum+score(shape),0)/2;
 if(keep&&remaining>175)return null;
 const indices=new Uint32Array(mesh.indices.length),map=new Map(),source=[],groups=[],pos=[],normal=[],uv=[];
 for(let i=0;i<indices.length;i++){
  const old=mesh.indices[i],id=faceIslands[Math.floor(i/3)],key=id+':'+old;
  let index=map.get(key);
  if(index==null){
   index=source.length;map.set(key,index);source.push(old);groups.push(id);
   pos.push(...mesh.pos.subarray(old*3,old*3+3));normal.push(...mesh.normal.subarray(old*3,old*3+3));
   const {origin,x,y,masks,turn}=shapes[id],base=masks[0];
   const u=mesh.uv[old*2]*pixelScale-origin[0],v=mesh.uv[old*2+1]*pixelScale-origin[1];
   const r=turn===0?u:turn===1?v:turn===2?base.w-u:base.h-v,
    s=turn===0?v:turn===1?base.w-u:turn===2?base.h-v:u;
   uv.push((x+r)/grid,(y+s)/grid);
  }
  indices[i]=index;
 }
 const moved={pos:Float32Array.from(pos),normal:Float32Array.from(normal),uv:Float32Array.from(uv),indices,
  sourceIndices:Uint32Array.from(source),chartIds:Int32Array.from(groups),tangent:new Float32Array(source.length*4),
  atlas:{charts:charts.length,width:resolution,height:resolution,packedUtilization:0}};
 if(!keep)return moved;
 const pins=placed.map(shape=>shapes.indexOf(shape));
 const packed=fitAroundIslands(moved,{resolution,padding,faceCharts:faceIslands,pins,deadline});
 if(packed)packed.sourceIndices=Uint32Array.from(packed.sourceIndices,i=>moved.sourceIndices[i]);
 return packed;
}

export function improveUvNesting(mesh,{resolution,padding,onProgress=()=>{}}){
 if(!Number.isInteger(resolution)||resolution<1024||!Number.isInteger(padding)||mesh.indices.length>150000)return null;
 const baseline=analyzeUV(mesh),count=strictUvCharts(mesh).count;
 if(count<40||count>500||baseline.overlap||baseline.outOfRangeFaces||baseline.zeroUvFaces)return null;
 const deadline=Date.now()+38000,options={resolution,padding,deadline};
 const coarseGrid=Math.min(1536,Math.floor(resolution*2/(padding+.5)));
 if(coarseGrid<512)return null;
 const draft=relaxAtlas(mesh,{...options,grid:coarseGrid,scale:1.012,
  sweeps:170,seed:13,keep:Math.min(42,Math.floor(count*.18))});
 onProgress(.45);
 if(!draft)return null;
 const safe=layout=>clearanceAtResolution(measureUvClearance(layout),options).safe;
 const grid=Math.min(4096,Math.floor(resolution*4/(padding+.5)));
 const result=safe(draft)?draft:relaxAtlas(draft,{...options,grid,scale:1,sweeps:80,seed:19,keep:0});
 onProgress(.92);
 if(!result||!safe(result))return null;
 const after=analyzeUV(result);
 if(after.overlap||after.zeroUvFaces||after.outOfRangeFaces||after.summedUvTriangleArea<=baseline.summedUvTriangleArea)return null;
 if(result!==draft)result.sourceIndices=Uint32Array.from(result.sourceIndices,index=>draft.sourceIndices[index]);
 verifySurfacePreserved(mesh,result);
 const islands=assertUvIslandsPreserved(mesh,result);
 result.packing={method:'conservative-outline-mask',resolution,padding,pinnedIslands:[],
  relativeDensityWeights:{},requiresMikk:true,
  outlineNesting:{before:baseline.summedUvTriangleArea,after:after.summedUvTriangleArea,islands:islands.after}};
 return result;
}
