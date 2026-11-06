import {collectUvCharts} from './uv-charts.js';
import {findOutlinePlacement} from './outline-collision.js';
import {compactChartFrame,chartLocalUV} from './uv-chart-frame.js';
function rasterTriangle(mask,w,h,points){const det=(points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[1][1]-points[0][1])*(points[2][0]-points[0][0]),sign=det<0?-1:1,minX=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0])))),maxX=Math.min(w-1,Math.floor(Math.max(...points.map(p=>p[0])))),minY=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))),maxY=Math.min(h-1,Math.floor(Math.max(...points.map(p=>p[1])))),edges=points.map((a,i)=>{const b=points[(i+1)%3],dx=b[0]-a[0],dy=b[1]-a[1];return[-dy*sign,dx*sign,(dy*a[0]-dx*a[1])*sign];});for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){let inside=true;for(const [a,b,c]of edges)if(a*(a>=0?x+1:x)+b*(b>=0?y+1:y)+c< -1e-8){inside=false;break;}if(inside)mask[y*w+x]=1;}}
function dilate(raw,w,h,radius){if(!radius)return raw;const horizontal=new Uint8Array(raw.length),result=new Uint8Array(raw.length);for(let y=0;y<h;y++){let sum=0;for(let x=0;x<=radius&&x<w;x++)sum+=raw[y*w+x];for(let x=0;x<w;x++){horizontal[y*w+x]=sum>0;if(x-radius>=0)sum-=raw[y*w+x-radius];if(x+radius+1<w)sum+=raw[y*w+x+radius+1];}}for(let x=0;x<w;x++){let sum=0;for(let y=0;y<=radius&&y<h;y++)sum+=horizontal[y*w+x];for(let y=0;y<h;y++){result[y*w+x]=sum>0;if(y-radius>=0)sum-=horizontal[(y-radius)*w+x];if(y+radius+1<h)sum+=horizontal[(y+radius+1)*w+x];}}return result;}
const popcount=x=>{x-=x>>>1&0x55555555;x=(x&0x33333333)+(x>>>2&0x33333333);return((x+(x>>>4)&0x0f0f0f0f)*0x01010101)>>>24;};
function pattern(bitmap,w,h,stride){const rows=new Map();for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(bitmap[y*w+x]){const offset=y*stride+(x>>5);rows.set(offset,(rows.get(offset)||0)|(1<<(x&31)));}const sorted=[...rows].sort((a,b)=>popcount(b[1])-popcount(a[1])||a[0]-b[0]),entries=new Uint32Array(sorted.length*2);for(let i=0;i<sorted.length;i++){entries[i*2]=sorted[i][0];entries[i*2+1]=sorted[i][1];}return{w,h,entries};}
function rotate(bitmap,w,h){const out=new Uint8Array(bitmap.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[(w-1-x)*h+y]=bitmap[y*w+x];return out;}
function packOutlineVariant(mesh,{resolution=2048,padding=12,pins=[],weights={},faceCharts=null,allowOutOfRange=false,quarterTurns=false,onProgress=()=>{},gridLimit=1024,refineFrom=null,compact=false,order='area',deadline=Infinity,pixelScale=1,singleTrial=false}={}){
  if(!Number.isInteger(resolution)||resolution<256||resolution>4096||!Number.isInteger(padding)||padding<0||padding>48)throw Error('轮廓重排参数无效。');const {charts,faceIslands}=collectUvCharts(mesh,{faceCharts,allowOutOfRange}),locked=new Set(pins);for(const id of locked){if(!charts[id])throw Error('锁定规则与当前UV布局不一致，请清空规则。');const c=charts[id];if(c.min.some(v=>v<0)||c.max.some(v=>v>1))throw Error('锁定岛需保留在0–1 UV内。');}for(const [id,v]of Object.entries(weights))if(!charts[Number(id)]||!Number.isFinite(v)||v<.5||v>4)throw Error('UV密度规则无效。');
  const grid=Math.min(gridLimit,resolution*pixelScale),stride=Math.ceil(grid/32),margin=Math.ceil((padding+.5)/resolution*grid),baseBitmap=new Uint8Array(grid*grid);for(const c of charts)if(locked.has(c.id))for(const f of c.faces)rasterTriangle(baseBitmap,grid,grid,[0,1,2].map(k=>{const i=mesh.indices[f*3+k];return[mesh.uv[i*2]*grid,mesh.uv[i*2+1]*grid];}));const fixed=dilate(baseBitmap,grid,grid,margin),fixedPattern=pattern(fixed,grid,grid,stride),initial=new Uint32Array(grid*stride);for(let i=0;i<fixedPattern.entries.length;i+=2)initial[fixedPattern.entries[i]]=fixedPattern.entries[i+1];
  if(compact)for(const c of charts)if(!locked.has(c.id))c.frame=compactChartFrame(mesh,c);
  const dimensions=c=>c.frame?[c.frame.width,c.frame.height]:[c.max[0]-c.min[0],c.max[1]-c.min[1]],score=c=>{const [w,h]=dimensions(c),weight=weights[c.id]||1;return order==='length'?Math.max(w,h)*weight:w*h*weight*weight;};
  const moving=charts.filter(c=>!locked.has(c.id)).sort((a,b)=>score(b)-score(a)||a.id-b.id);let searchTimedOut=false;
  function make(c,factor){const [cw,ch]=dimensions(c),w=Math.ceil(cw*grid*factor)+margin*2+2,h=Math.ceil(ch*grid*factor)+margin*2+2;if(w>grid||h>grid)return null;const raw=new Uint8Array(w*h);for(const face of c.faces)rasterTriangle(raw,w,h,[0,1,2].map(k=>{const [u,v]=chartLocalUV(mesh,c,mesh.indices[face*3+k]);return[margin+u*grid*factor,margin+v*grid*factor];}));const bitmap=dilate(raw,w,h,margin);const one=rotate(bitmap,w,h),result=[pattern(bitmap,w,h,stride),pattern(one,h,w,stride)];if(quarterTurns){const two=rotate(one,h,w);result.push(pattern(two,w,h,stride),pattern(rotate(two,w,h),h,w,stride));}return result;}
  function fit(scale){const occupied=initial.slice(),placed=new Map(),anchors=new Map([['0,0',[0,0]]]);
    function collision(mask,x,y){if(x<0||y<0||x+mask.w>grid||y+mask.h>grid)return true;const base=y*stride+(x>>5),shift=x&31,entries=mask.entries;for(let i=0;i<entries.length;i+=2){const at=base+entries[i],bits=entries[i+1];if(occupied[at]&(bits<<shift))return true;if(shift&&occupied[at+1]&(bits>>>(32-shift)))return true;}return false;}
    function stamp(mask,x,y){const base=y*stride+(x>>5),shift=x&31,e=mask.entries;for(let i=0;i<e.length;i+=2){const at=base+e[i],bits=e[i+1];occupied[at]|=bits<<shift;if(shift)occupied[at+1]|=bits>>>(32-shift);}}
    for(const chart of moving){if(Date.now()>deadline){searchTimedOut=true;return null;}const factor=scale*(weights[chart.id]||1),masks=make(chart,factor);if(!masks)return null;let choice=null;const candidates=[...anchors.values()].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);for(const [x,y]of candidates){for(let r=0;r<masks.length;r++)if(!collision(masks[r],x,y)){choice={x,y,rotated:!!r,rotation:r,mask:masks[r]};break;}if(choice)break;}
      if(compact&&choice?.y>0)choice=findOutlinePlacement(occupied,masks,grid,stride,2,{maxRow:choice.y-1})||choice;
      if(!choice)choice=findOutlinePlacement(occupied,masks,grid,stride,grid>=1024?2:1);
      if(!choice)return null;stamp(choice.mask,choice.x,choice.y);placed.set(chart.id,{x:choice.x,y:choice.y,rotated:choice.rotated,rotation:choice.rotation,factor,baseWidth:masks[0].w,baseHeight:masks[0].h});const right=choice.x+choice.mask.w,bottom=choice.y+choice.mask.h;for(const p of [[right,choice.y],[choice.x,bottom],[right,bottom],[0,bottom],[right,0]])if(p[0]<grid&&p[1]<grid)anchors.set(p.join(','),p);
    }placed.footprint=occupied.reduce((sum,bits)=>sum+popcount(bits),0)/(grid*grid);return placed;
  }
  let scale=1,placements=new Map(),refinementFits=0;
  if(moving.length){
   if(refineFrom!=null){
    let low=refineFrom+(compact||singleTrial?0:1/256),high=Math.min(8,compact?refineFrom*1.125:refineFrom+1/16);if(!(low<high))return null;
    placements=fit(low);refinementFits++;onProgress(.2);if(!placements)return null;
    for(let i=0;i<4&&!singleTrial&&!searchTimedOut;i++){const mid=(low+high)*.5,result=fit(mid);refinementFits++;if(result){low=mid;placements=result;}else high=mid;onProgress(.2+(i+1)*.2);}scale=low;
   }else{let low=0,high=1;while(high<8&&fit(high))high*=2;for(let i=0;i<8;i++){const mid=(low+high)*.5,result=fit(mid);if(result){low=mid;placements=result;}else high=mid;onProgress((i+1)/8);}scale=low;}
   if(scale<1e-6)throw Error('锁定区域或间距占用过多，无法安排剩余UV。');
  }
  const pos=[],normal=[],uv=[],sourceIndices=[],chartIds=[],indices=[],unique=new Map();for(let corner=0;corner<mesh.indices.length;corner++){const old=mesh.indices[corner],id=faceIslands[Math.floor(corner/3)],key=id+':'+old;let vertex=unique.get(key);if(vertex==null){vertex=sourceIndices.length;unique.set(key,vertex);sourceIndices.push(old);chartIds.push(id);pos.push(...mesh.pos.subarray(old*3,old*3+3));normal.push(...mesh.normal.subarray(old*3,old*3+3));const u=mesh.uv[old*2],v=mesh.uv[old*2+1],c=charts[id],p=placements.get(id);if(locked.has(id))uv.push(u,v);else{const local=chartLocalUV(mesh,c,old),du=local[0]*grid*p.factor,dv=local[1]*grid*p.factor;if(!quarterTurns){uv.push((p.x+margin+(p.rotated?dv:du))/grid,(p.y+(p.rotated?p.baseWidth-margin-du:margin+dv))/grid);}else{const r=p.rotation??(p.rotated?1:0),x=r===0?margin+du:r===1?margin+dv:r===2?p.baseWidth-margin-du:p.baseHeight-margin-dv,y=r===0?margin+dv:r===1?p.baseWidth-margin-du:r===2?p.baseHeight-margin-dv:margin+du;uv.push((p.x+x)/grid,(p.y+y)/grid);}}}indices.push(vertex);}
  return{pos:Float32Array.from(pos),normal:Float32Array.from(normal),uv:Float32Array.from(uv),indices:Uint32Array.from(indices),sourceIndices:Uint32Array.from(sourceIndices),chartIds:Int32Array.from(chartIds),tangent:new Float32Array(sourceIndices.length*4),atlas:{charts:charts.length,width:resolution,height:resolution,packedUtilization:0},packing:{method:'conservative-outline-mask',gridResolution:grid,scale,padding,resolution,pinnedIslands:[...locked],relativeDensityWeights:{...weights},requiresMikk:true,reservedFootprint:placements.footprint??null,...(compact?{alignedCharts:charts.filter(c=>c.frame).length,compactOrder:order,searchTimedOut}:{}),...(refineFrom!=null?{refinementFits}:{})}};
}

function packQuarterTurns(mesh,options={}){
 if(options.quarterTurns!=null&&typeof options.quarterTurns!=='boolean')throw Error('UV旋转搜索参数无效。');
 if(!options.quarterTurns)return packOutlineVariant(mesh,options);
 const onProgress=options.onProgress||(()=>{}),base=packOutlineVariant(mesh,{...options,quarterTurns:false,onProgress:p=>onProgress(p*.5)});let alternate=null,error=null;try{alternate=packOutlineVariant(mesh,{...options,quarterTurns:true,onProgress:p=>onProgress(.5+p*.5)});}catch(e){error=e.message;}const useAlternate=alternate&&alternate.packing.scale>base.packing.scale,result=useAlternate?alternate:base;result.packing.orientationSearch={algorithm:'best-of-quarter-turns-v1',selected:useAlternate?'four':'two',baselineScale:base.packing.scale,quarterScale:alternate?.packing.scale??null,...(error?{alternateError:error}:{})};onProgress(1);return result;
}

export function packOutlineCharts(mesh,options={}){
 if(options.refinePacking!=null&&typeof options.refinePacking!=='boolean')throw Error('UV精细排布参数无效。');
 if(!options.refinePacking)return packQuarterTurns(mesh,options);
 const onProgress=options.onProgress||(()=>{}),base=packQuarterTurns(mesh,{...options,onProgress:p=>onProgress(p*.6)});
 const eligible=base.packing.resolution>=2048&&base.atlas.charts>=8&&base.atlas.charts<=2000&&base.packing.pinnedIslands.length<base.atlas.charts;
 let fine=null,error=null;
 if(eligible)try{fine=packOutlineVariant(mesh,{...options,gridLimit:1536,refineFrom:base.packing.scale,quarterTurns:true,onProgress:p=>onProgress(.6+p*.15)});}catch(e){error=e.message;}
 const selected=!!fine&&fine.packing.scale>base.packing.scale;let result=selected?fine:base;
 if(selected&&base.packing.orientationSearch)result.packing.orientationSearch={...base.packing.orientationSearch,scope:'coarse-grid-baseline'};
 result.packing.precisionSearch={algorithm:'bounded-fine-outline-v1',eligible,selected,baselineGrid:base.packing.gridResolution,candidateGrid:1536,baselineScale:base.packing.scale,candidateScale:fine?.packing.scale??null,maxExtraFits:5,extraFits:fine?.packing.refinementFits??(eligible?1:0),...(error?{candidateError:error}:{})};
 const compactEligible=mesh.indices.length<=750000&&result.atlas.charts>=2&&result.atlas.charts<=2000&&result.packing.pinnedIslands.length<result.atlas.charts;
 const prior=result,started=Date.now(),deadline=started+12000,trials=[];
 if(compactEligible)for(const order of ['length','area']){
  if(Date.now()>=deadline)break;
  try{
   const trial=packOutlineVariant(mesh,{...options,compact:true,order,quarterTurns:true,gridLimit:prior.packing.gridResolution,refineFrom:result.packing.scale,deadline,onProgress:p=>onProgress(.75+(order==='length'?0:.1)+p*.1)});
   trials.push({order,alignedCharts:trial?.packing.alignedCharts??null,scale:trial?.packing.scale??null,timedOut:trial?.packing.searchTimedOut??Date.now()>=deadline});
   if(trial&&trial.packing.scale>result.packing.scale*(1+1e-6))result=trial;
  }catch(e){trials.push({order,error:e.message});}
 }
 const pixelEligible=compactEligible&&prior.atlas.charts<=256;
 if(pixelEligible)try{
  const trial=packOutlineVariant(mesh,{...options,compact:true,order:'length',quarterTurns:true,gridLimit:4096,pixelScale:prior.packing.resolution<=2048?2:1,refineFrom:result.packing.scale*1.015625,singleTrial:true,deadline:started+20000,onProgress:p=>onProgress(.95+p*.05)});
  trials.push({order:'pixel-precision',scale:trial?.packing.scale??null,timedOut:trial?.packing.searchTimedOut??Date.now()>=started+20000});
  if(trial&&trial.packing.scale>result.packing.scale)result=trial;
 }catch(e){trials.push({order:'pixel-precision',error:e.message});}
 if(result!==prior){result.packing.orientationSearch={...prior.packing.orientationSearch,scope:'baseline-before-compaction'};result.packing.precisionSearch={...prior.packing.precisionSearch,scope:'baseline-before-compaction'};}
 result.packing.compactionSearch={algorithm:'rigid-hull-contour-nesting-v1',eligible:compactEligible,pixelPrecisionEligible:pixelEligible,selected:result!==prior,baselineScale:prior.packing.scale,selectedScale:result.packing.scale,alignedCharts:result.packing.alignedCharts||0,trials,maxExtraFits:pixelEligible?11:10,budgetMs:pixelEligible?20000:12000,elapsedMs:Date.now()-started};
 onProgress(1);return result;
}
