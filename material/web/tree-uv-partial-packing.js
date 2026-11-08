import {clearanceAtResolution,measureUvClearance,triangleSquareDistance} from './uv-clearance.js';
import {fitAroundIslands} from './uv-outline-packing.js';
import {buildUvTopology,uvEdgeContinuous} from './uv-topology.js';

const signedArea=([a,b,c])=>((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*.5;
const triangle=(mesh,face)=>[0,1,2].map(c=>{
 const index=mesh.indices[face*3+c]*2;
 return [mesh.uv[index],mesh.uv[index+1]];
});
const bounds=points=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),
 Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
const boxGap=(a,b)=>Math.max(a[0]-b[2],b[0]-a[2],a[1]-b[3],b[1]-a[3]);

function eachCell([x0,y0,x1,y1],inflation,visit){
 const cells=128;
 const left=Math.floor((x0-inflation)*cells),right=Math.floor((x1+inflation)*cells);
 const bottom=Math.floor((y0-inflation)*cells),top=Math.floor((y1+inflation)*cells);
 for(let y=bottom;y<=top;y++)for(let x=left;x<=right;x++){
  if(visit(x+y*1024)===false)return false;
 }
 return true;
}

// The local sewing proposal keeps the receiver in place, but its new boundary
// may overlap nearby islands or consume their gutter. Evict only the blockers
// and retain every other chart's exact placement.
export function fitSewnUvIslands(base,sewn,faceCharts,{resolution,padding,deadline=Infinity,topology}={}){
 const faces=base.indices.length/3;
 if(Date.now()>=deadline||resolution!==2048||padding!==3||faces>50000||
    faceCharts.length!==faces||sewn.indices.length!==base.indices.length)return null;
 const originalTopology=topology??buildUvTopology(base);
 if(originalTopology.edges.some(edge=>uvEdgeContinuous(base,edge,0)&&!uvEdgeContinuous(sewn,edge,0)))return null;
 const margin=(padding+.501)/resolution,gap=(padding*2+1.001)/resolution;
 const labelIds=new Map(),labels=new Int32Array(faces),charts=[],triangles=[],grid=new Map();
 let originalArea=0,proposedArea=0,indexEntries=0;
 for(let face=0;face<faces;face++){
  if((face&255)===0&&Date.now()>=deadline)return null;
  const prior=triangle(base,face),uv=triangle(sewn,face),box=bounds(uv),tag=faceCharts[face];
  if(box.some(v=>!Number.isFinite(v)||v< -1||v>2))return null;
  if(!labelIds.has(tag)){
   labelIds.set(tag,charts.length);
   charts.push({area:0,box:[Infinity,Infinity,-Infinity,-Infinity]});
  }
  const id=labelIds.get(tag),chart=charts[id],before=signedArea(prior),after=signedArea(uv);
  if(Math.sign(before)!==Math.sign(after)||Math.abs(after)<1e-14)return null;
  const area=Math.abs(after),changed=uv.some((p,i)=>p[0]!==prior[i][0]||p[1]!==prior[i][1]);
  labels[face]=id;
  chart.area+=area;
  originalArea+=Math.abs(before);
  proposedArea+=area;
  chart.box[0]=Math.min(chart.box[0],box[0]);chart.box[1]=Math.min(chart.box[1],box[1]);
  chart.box[2]=Math.max(chart.box[2],box[2]);chart.box[3]=Math.max(chart.box[3],box[3]);
  triangles.push({uv,box,id,changed});
  if(!eachCell(box,0,key=>{
   if(++indexEntries>1500000)return false;
   if(!grid.has(key))grid.set(key,[]);
   grid.get(key).push(face);
  }))return null;
 }
 const moving=new Set();
 const footprint=id=>{
  const [x,y,r,b]=charts[id].box;
  return (r-x)*(b-y);
 };
 for(const [id,{box:[x,y,r,b]}] of charts.entries())if(Math.min(x,y,1-r,1-b)<margin)moving.add(id);
 const seen=new Uint32Array(faces);
 let exactChecks=0,coarseChecks=0;
 for(let face=0;face<faces;face++){
  if((face&255)===0&&Date.now()>=deadline)return null;
  const a=triangles[face];
  if(!a.changed||moving.has(a.id))continue;
  if(!eachCell(a.box,gap,key=>{
   for(const neighbor of grid.get(key)||[]){
    if(++coarseChecks>5000000||(coarseChecks&1023)===0&&Date.now()>=deadline)return false;
    if(seen[neighbor]===face+1||moving.has(a.id))continue;
    seen[neighbor]=face+1;
    const b=triangles[neighbor];
    if(b.id===a.id||moving.has(b.id)||boxGap(a.box,b.box)>=gap)continue;
    if(++exactChecks>100000)return false;
    if(triangleSquareDistance(a.uv,b.uv).distance<gap)
     moving.add(footprint(a.id)<footprint(b.id)?a.id:b.id);
   }
  }))return null;
  if(moving.size>32)return null;
 }

 // Compensate for any small area lost in the weld with a uniform scale on
 // moved charts only, bounded to 12% local linear density change.
 const needed=proposedArea<originalArea?originalArea-proposedArea+.000015:0;
 if(needed>.0015)return null;
 const maxScale=1.12,requiredMovableArea=needed/(maxScale*maxScale-1);
 let movableArea=[...moving].reduce((sum,id)=>sum+charts[id].area,0);
 if(movableArea<requiredMovableArea){
  let spare=-1;
  for(const [id,chart] of charts.entries()){
   if(moving.has(id)||chart.area+movableArea<requiredMovableArea)continue;
   if(spare<0||chart.area<charts[spare].area)spare=id;
  }
  if(spare<0||moving.size>=32)return null;
  moving.add(spare);
  movableArea+=charts[spare].area;
 }
 const scale=needed?Math.sqrt(1+needed/movableArea):1;
 if(scale>maxScale||Date.now()>=deadline)return null;
 const pins=charts.map((_,id)=>id).filter(id=>!moving.has(id));
 const weights=needed?Object.fromEntries([...moving].map(id=>[id,scale])):{};
 const packed=fitAroundIslands(sewn,{resolution,padding,faceCharts:labels,pins,weights,deadline,
  gridLimit:resolution,pixelScale:1,orderTries:3});
 if(!packed||Date.now()>=deadline)return null;

 let packedArea=0;
 for(let face=0;face<faces;face++){
  const {uv,id}=triangles[face],result=triangle(packed,face);
  const area=signedArea(result);
  if(Math.abs(area)<1e-14||Math.sign(signedArea(uv))!==Math.sign(area))return null;
  packedArea+=Math.abs(area);
  if(!moving.has(id)&&result.some((p,i)=>p[0]!==uv[i][0]||p[1]!==uv[i][1]))return null;
 }
 if(packedArea<originalArea||Date.now()>=deadline)return null;
 const clearance=clearanceAtResolution(measureUvClearance(packed),{resolution,padding});
 if(!clearance.safe||clearance.gapPixels!=null&&clearance.gapPixels<2*padding+1||
    clearance.borderPixels<padding+.5||Date.now()>=deadline)return null;
 let closedEdges=0;
 for(const edge of originalTopology.edges){
  if(!edge.manifold)continue;
  const wasJoined=uvEdgeContinuous(base,edge,0),joined=uvEdgeContinuous(packed,edge,0);
  if(wasJoined&&!joined)return null;
  if(!wasJoined&&joined)closedEdges++;
 }
 if(Date.now()>=deadline)return null;

 packed.packing.pinnedIslands=[];
 packed.packing.relativeDensityWeights={};
 packed.packing.partialSewPacking={retained:pins.length,moved:moving.size,compensationScale:scale,closedEdges};
 return packed;
}
