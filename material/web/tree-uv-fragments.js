import {buildUvTopology,uvEdgeContinuous} from './uv-topology.js';
import {strictUvCharts,triangleOverlapArea,triangleSquareDistance} from './uv-clearance.js';
import {uvFaceMetric} from './tree-uv-refit.js';
import {solvePinnedUvPatch} from './tree-uv-local-solve.js';
import {packOutlineAtScale,packOutlineCharts} from './uv-outline-packing.js';
import {verifySurfacePreserved} from './mesh-codec.js';

const next=corner=>(corner+1)%3;
const signed=([a,b,c])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const box=p=>[Math.min(p[0][0],p[1][0],p[2][0]),Math.min(p[0][1],p[1][1],p[2][1]),
  Math.max(p[0][0],p[1][0],p[2][0]),Math.max(p[0][1],p[1][1],p[2][1])];
const intersects=(a,b)=>a[0]<b[2]&&b[0]<a[2]&&a[1]<b[3]&&b[1]<a[3];
function faceNormal([a,b,c]){
  const x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2],u=c[0]-a[0],v=c[1]-a[1],w=c[2]-a[2];
  const n=[y*w-z*v,z*u-x*w,x*v-y*u],length=Math.hypot(...n)||1;
  return n.map(axis=>axis/length);
}

// Keep the receiving island fixed. Only try neighboring patches small enough
// to flatten locally, then repack and let the caller validate the new atlas.
export function sewUvFragments(mesh,{resolution,padding,maxMerges=Infinity,deadline=Infinity,reinsert,preserveHardFolds=false,
  refitTiny=false,onProgress=()=>{}}){
  const maxPatchFaces=refitTiny?4:8,maxDensityRatio=1.8,refitLimit=1500;
  const topology=buildUvTopology(mesh);
  const {labels,count}=strictUvCharts(mesh),charts=Array.from({length:count},()=>[]);
  const points=[],layout=[];
  const vertex=(face,corner)=>mesh.indices[face*3+corner];
  const faceData=(face,uv)=>({uv,box:box(uv),metric:uvFaceMetric(points[face],uv)});
  for(let face=0;face<labels.length;face++){
    charts[labels[face]].push(face);
    const ids=[vertex(face,0),vertex(face,1),vertex(face,2)];
    points.push(ids.map(i=>Array.from(mesh.pos.subarray(i*3,i*3+3))));
    layout.push(faceData(face,ids.map(i=>Array.from(mesh.uv.subarray(i*2,i*2+2)))));
  }
  const hardFolds=new Set();
  if(preserveHardFolds){
    const normals=points.map(faceNormal);
    for(const edge of topology.edges){
      if(!edge.manifold)continue;
      const [a,b]=edge.halves.map(half=>normals[half.face]);
      if(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]<-.5)hardFolds.add(edge.id);
    }
  }
  const node=(face,corner)=>{
    const uv=layout[face].uv[corner];
    return topology.vertices[vertex(face,corner)]+':'+uv[0]+':'+uv[1];
  };
  const stats={merges:0,absorbedFaces:0,attempts:0,pairChecks:0,boxChecks:0,gutterRejects:0,neighborChecks:0,
    refits:0,refitAccepted:0,hardFoldsAvoided:0};
  const hostGrids=new Map(),visited=reinsert?new Uint32Array(labels.length):null;
  let stamp=0,indexEntries=0,gridChecks=0,indexExhausted=false;
  function visitCells([x0,y0,x1,y1],visit){
    if(!(x0>=-2&&y0>=-2&&x1<=3&&y1<=3))return false;
    const cells=96;
    for(let y=Math.floor(y0*cells);y<=Math.floor(y1*cells);y++)
      for(let x=Math.floor(x0*cells);x<=Math.floor(x1*cells);x++)
        if(visit(x+y*1024)===false)return false;
    return true;
  }
  function indexHostFace(grid,face){
    if(!visitCells(layout[face].box,key=>{
      if(++indexEntries>1500000||(indexEntries&1023)===0&&Date.now()>=deadline)return false;
      if(!grid.has(key))grid.set(key,[]);
      grid.get(key).push(face);
    }))indexExhausted=true;
  }
  function hitsHost(data,host,skip=null){
    if(!reinsert||host.length<48)return host.some(face=>!skip?.has(face)&&overlaps(data,layout[face]));
    if(!hostGrids.has(host)){
      const grid=new Map();
      for(const face of host){indexHostFace(grid,face);if(indexExhausted)return true;}
      hostGrids.set(host,grid);
    }
    const grid=hostGrids.get(host),queryStamp=++stamp;
    return !visitCells(data.box,key=>{
      for(const face of grid.get(key)||[]){
        if(++gridChecks>4000000||(gridChecks&1023)===0&&Date.now()>=deadline){
          indexExhausted=true;
          return false;
        }
        if(visited[face]===queryStamp||skip?.has(face))continue;
        visited[face]=queryStamp;
        if(overlaps(data,layout[face]))return false;
      }
    });
  }
  const sceneGrid=new Map(),sceneSeen=refitTiny?new Uint32Array(labels.length):null;
  let sceneQuery=0,sceneEntries=0,sceneTests=0;
  const gap=(padding*2+1.005)/resolution,border=(padding+.502)/resolution;
  function indexSceneFace(face){
    if(!visitCells(layout[face].box,key=>{
      if(++sceneEntries>1500000||(sceneEntries&1023)===0&&Date.now()>=deadline)return false;
      if(!sceneGrid.has(key))sceneGrid.set(key,[]);
      sceneGrid.get(key).push(face);
    }))indexExhausted=true;
  }
  if(refitTiny)for(let face=0;face<labels.length;face++){
    indexSceneFace(face);
    if(indexExhausted)return null;
  }
  function fitsScene(data,patchId,hostId){
    if(!refitTiny)return true;
    const [x0,y0,x1,y1]=data.box;
    if(Math.min(x0,y0,1-x1,1-y1)<border)return false;
    const query=++sceneQuery;
    return visitCells([x0-gap,y0-gap,x1+gap,y1+gap],key=>{
      for(const face of sceneGrid.get(key)||[]){
        if(++sceneTests>3000000||(sceneTests&1023)===0&&Date.now()>=deadline){indexExhausted=true;return false;}
        if(labels[face]===patchId||labels[face]===hostId||sceneSeen[face]===query)continue;
        sceneSeen[face]=query;
        const other=layout[face];
        const [ox0,oy0,ox1,oy1]=other.box;
        if(Math.max(ox0-x1,x0-ox1,oy0-y1,y0-oy1)>=gap)continue;
        if(++stats.neighborChecks>250000||Date.now()>=deadline)return false;
        if(triangleSquareDistance(data.uv,other.uv).distance<gap)return false;
      }
    });
  }
  function weld(patch,host,edges,anchor,snapBoundary,normalScale=1,shear=0){
    const {from,to}=anchor;
    const a=layout[from.face].uv[from.edge],b=layout[from.face].uv[next(from.edge)];
    const p=layout[to.face].uv[next(to.edge)],q=layout[to.face].uv[to.edge];
    const dx=b[0]-a[0],dy=b[1]-a[1],tx=q[0]-p[0],ty=q[1]-p[1],length=dx*dx+dy*dy;
    if(!(length>1e-20))return null;
    const factor=Math.hypot(tx,ty)/Math.sqrt(length);
    if(factor<1/maxDensityRatio||factor>maxDensityRatio)return null;
    const orientation=Math.sign(signed(layout[to.face].uv));
    const reflect=orientation*Math.sign(signed(layout[from.face].uv));
    const pins=new Map();
    for(const {from,to} of snapBoundary?edges:[anchor]){
      for(const [corner,target] of [[from.edge,next(to.edge)],[next(from.edge),to.edge]]){
        const key=node(from.face,corner),value=layout[to.face].uv[target],previous=pins.get(key);
        if(previous&&(previous[0]!==value[0]||previous[1]!==value[1]))return null;
        pins.set(key,value);
      }
    }
    const changed=[];
    for(const face of patch){
      const uv=layout[face].uv.map(([x,y],corner)=>{
        const fixed=pins.get(node(face,corner));
        if(fixed)return fixed;
        const v=((y-a[1])*dx-(x-a[0])*dy)/length*reflect;
        const u=((x-a[0])*dx+(y-a[1])*dy)/length+v*shear;
        return [Math.fround(p[0]+u*tx-v*normalScale*ty),Math.fround(p[1]+u*ty+v*normalScale*tx)];
      });
      const data=faceData(face,uv),original=layout[face].metric,density=data.metric.density/original.density;
      if(signed(uv)*orientation<=0||data.metric.condition>Math.max(2.5,original.condition*1.025)||
        density<1/maxDensityRatio||density>maxDensityRatio)return null;
      if(hitsHost(data,host))return null;
      for(const other of changed)if(overlaps(data,other))return null;
      if(!fitsScene(data,labels[patch[0]],anchor.host)){stats.gutterRejects++;return null;}
      changed.push(data);
    }
    return changed;
  }
  const cornerUv=refitTiny?Float32Array.from(layout.flatMap(face=>face.uv.flat())):null;
  function preservesHardCuts(faces,result){
    const changed=new Map(faces.map((face,i)=>[face,result[i].uv]));
    const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
    for(const face of faces)for(let corner=0;corner<3;corner++){
      const id=topology.faceEdges[face*3+corner];
      if(!hardFolds.has(id))continue;
      const edge=topology.edges[id];
      if(uvEdgeContinuous(mesh,edge,0))continue;
      const [a,b]=edge.halves,p=changed.get(a.face)||layout[a.face].uv,q=changed.get(b.face)||layout[b.face].uv;
      if(same(p[a.edge],q[next(b.edge)])&&same(p[next(a.edge)],q[b.edge])){
        stats.hardFoldsAvoided++;
        return false;
      }
    }
    return true;
  }
  function refitPatch(patch,host,edges){
    if(!cornerUv||stats.refits>=refitLimit||Date.now()>=deadline)return null;
    const patchId=labels[patch[0]],hostId=labels[host[0]],hostFrontier=[...new Set(edges.map(({to})=>to.face))];
    const selected=new Set([...patch,...hostFrontier]),seams=edges.map(({from})=>topology.edges[topology.faceEdges[from.face*3+from.edge]]);
    let frontier=hostFrontier;
    for(let depth=0;depth<3&&selected.size<=100;depth++){
      stats.refits++;
      const faces=[...selected];
      const solved=solvePinnedUvPatch(mesh,topology,cornerUv,labels,{id:hostId,faces:host},{id:patchId,faces:patch},faces,1,seams);
      if(solved.ok){
        const result=[];
        let valid=true;
        for(const [i,face] of faces.entries()){
          const data=faceData(face,solved.values[i]),before=layout[face].metric,ratio=data.metric.density/before.density;
          if(signed(data.uv)*solved.orientation<=0||ratio<.65||ratio>1.5||
             data.metric.condition>Math.max(2.5,before.condition*1.04)||
             hitsHost(data,host,selected)||result.some(other=>overlaps(data,other))||
             !fitsScene(data,patchId,hostId)){
            valid=false;break;
          }
          result.push(data);
        }
        if(valid&&preservesHardCuts(faces,result))return {result,faces};
      }
      if(stats.refits>=refitLimit||Date.now()>=deadline)return null;
      const additional=[];
      for(const face of frontier)for(const other of topology.neighbors[face]){
        if(labels[other.face]!==hostId||selected.has(other.face))continue;
        selected.add(other.face);additional.push(other.face);
      }
      if(!additional.length)break;
      frontier=additional;
    }
    return null;
  }
  function overlaps(a,b){
    if(++stats.boxChecks>12000000||(stats.boxChecks&1023)===0&&Date.now()>=deadline)return true;
    if(!intersects(a.box,b.box))return false;
    if(++stats.pairChecks>150000)return true;
    return triangleOverlapArea(a.uv,b.uv,2**-25)>Math.max(a.metric.uvArea,b.metric.uvArea)*1e-10+1e-24;
  }
  function seamPriority(id,faces){
    const across=new Map();
    let perimeter=0;
    for(const face of faces)for(let corner=0;corner<3;corner++){
      const edge=topology.edges[topology.faceEdges[face*3+corner]];
      if(uvEdgeContinuous(mesh,edge,0))continue;
      perimeter+=edge.length;
      if(!edge.manifold||hardFolds.has(edge.id))continue;
      const other=edge.halves.find(half=>half.face!==face),host=labels[other.face];
      if(host!==id&&charts[host].length>=faces.length)across.set(host,(across.get(host)||0)+edge.length);
    }
    const shared=Math.max(0,...across.values());
    return shared*Math.sqrt(shared/Math.max(perimeter,1e-20));
  }
  const order=charts.map((faces,id)=>({id,count:faces.length})).filter(c=>c.count<=maxPatchFaces);
  if(refitTiny){
    for(const chart of order)chart.score=seamPriority(chart.id,charts[chart.id]);
    order.sort((a,b)=>b.score-a.score||a.id-b.id);
  }else order.sort((a,b)=>a.count-b.count||a.id-b.id);
  for(const [index,{id}] of order.entries()){
    const patch=charts[id];
    if(!patch.length||patch.length>maxPatchFaces)continue;
    if(Date.now()>=deadline||indexExhausted)return null;
    if(stats.merges>=maxMerges||stats.attempts>=1800||stats.boxChecks>12000000)break;
    const adjacent=new Map(),hardHosts=preserveHardFolds?new Set():null;
    for(const face of patch)for(const link of topology.neighbors[face]){
      const host=labels[link.face];
      if(host===id||charts[host].length<patch.length||
         charts[host].length===patch.length&&host<id)continue;
      if(hardFolds.has(link.edge)){hardHosts.add(host);continue;}
      const edge=topology.edges[link.edge],from=edge.halves.find(half=>half.face===face);
      const to=edge.halves.find(half=>half.face===link.face);
      if(!adjacent.has(host))adjacent.set(host,[]);
      adjacent.get(host).push({host,from,to,length:edge.length});
    }
    if(hardHosts)for(const host of hardHosts)adjacent.delete(host);
    const anchors=[...adjacent.values()].flat().sort((a,b)=>b.length-a.length).slice(0,8);
    const refitTried=new Set();
    for(const anchor of anchors){
      stats.attempts++;
      const host=charts[anchor.host],edges=adjacent.get(anchor.host);
      let result=(edges.length>1?weld(patch,host,edges,anchor,true):null)||
        weld(patch,host,edges,anchor,false);
      // A small change in cross-seam width or shear can fit a bent edge.
      if(!result)for(const [normalScale,shear] of [[.78,0],[1,.28],[1,-.28],[.66,0],[.78,.28],[.78,-.28],[1.2,0]]){
        result=weld(patch,host,edges,anchor,false,normalScale,shear);
        if(result)break;
      }
      let faces=patch;
      if(refitTiny&&!result&&!refitTried.has(anchor.host)){
        refitTried.add(anchor.host);
        const refit=refitPatch(patch,host,edges);
        if(refit){result=refit.result;faces=refit.faces;stats.refitAccepted++;}
      }
      if(!result)continue;
      for(let i=0;i<faces.length;i++){
        const face=faces[i];
        layout[face]=result[i];
        if(labels[face]!==anchor.host){
          labels[face]=anchor.host;
          host.push(face);
        }
        if(hostGrids.has(host))indexHostFace(hostGrids.get(host),face);
        if(refitTiny)indexSceneFace(face);
        if(cornerUv)for(let c=0;c<3;c++)cornerUv.set(layout[face].uv[c],face*6+c*2);
      }
      stats.merges++;
      stats.absorbedFaces+=patch.length;
      patch.length=0;
      break;
    }
    if(index%24===0)onProgress((index+1)/order.length*.3);
  }
  if(!stats.merges||Date.now()>=deadline||indexExhausted)return null;
  const packed=packChangedCharts(mesh,labels,layout.map(face=>face.uv),{resolution,padding,reinsert,onProgress:p=>onProgress(.3+p*.7)});
  if(packed)for(const id of hardFolds){
    const edge=topology.edges[id];
    if(!uvEdgeContinuous(mesh,edge,0)&&uvEdgeContinuous(packed,edge,0))return null;
  }
  return packed?{mesh:packed,stats}:null;
}

function packChangedCharts(mesh,labels,layout,{resolution,padding,onProgress,minimumScale,reinsert}){
  const pos=[],normal=[],uv=[],source=[],vertices=new Map(),indices=new Uint32Array(mesh.indices.length);
  for(let i=0;i<indices.length;i++){
    const vertex=mesh.indices[i],point=layout[Math.floor(i/3)][i%3],key=vertex+':'+point.join(',');
    let index=vertices.get(key);
    if(index==null){
      index=source.length;
      vertices.set(key,index);
      source.push(vertex);
      pos.push(...mesh.pos.subarray(vertex*3,vertex*3+3));
      normal.push(...mesh.normal.subarray(vertex*3,vertex*3+3));
      uv.push(...point);
    }
    indices[i]=index;
  }
  // Atlas coordinates can briefly extend past the tile when a boundary grows.
  const input={pos:Float32Array.from(pos),normal:Float32Array.from(normal),uv:Float32Array.from(uv),indices};
  const options={resolution,padding,faceCharts:labels,onProgress};
  const result=reinsert?reinsert(input,labels):minimumScale?packOutlineAtScale(input,{...options,scale:minimumScale}):
    packOutlineCharts(input,{...options,allowOutOfRange:true,quarterTurns:true,refinePacking:true});
  if(!result)return null;
  result.sourceIndices=Uint32Array.from(result.sourceIndices,i=>source[i]);
  verifySurfacePreserved(mesh,result);
  return result;
}

export function extendUvAlongFlow(mesh,directions,{resolution,padding,maxStretch=2.5,deadline=Infinity,reinsert,onProgress=()=>{}}){
  if(Date.now()>=deadline)return null;
  const rounds=4,maxPatchFaces=64,maxAttempts=500,closeLimit=150;
  const densityRatio=2.2,patchStretch=Math.min(3.15,maxStretch*1.26);
  const topology=buildUvTopology(mesh),{labels,count}=strictUvCharts(mesh);
  const charts=Array.from({length:count},()=>[]),layout=[],baseline=[];
  let uvArea=0,surfaceArea=0;
  for(let face=0;face<labels.length;face++){
    charts[labels[face]].push(face);
    const ids=Array.from(mesh.indices.subarray(face*3,face*3+3));
    const points=ids.map(i=>Array.from(mesh.pos.subarray(i*3,i*3+3)));
    const uv=ids.map(i=>Array.from(mesh.uv.subarray(i*2,i*2+2)));
    const metric=uvFaceMetric(points,uv);
    layout.push(uv);
    baseline.push({...metric,points});
    uvArea+=metric.uvArea;
    surfaceArea+=metric.area;
  }
  const ranked=baseline.slice().sort((a,b)=>a.condition-b.condition);
  let cumulativeArea=0;
  const stretchCeiling=ranked.find(face=>(cumulativeArea+=face.area)>=.95*surfaceArea)?.condition*1.036;
  const stretchedArea=metric=>metric.condition>stretchCeiling?metric.area:0;
  const currentMetrics=baseline.slice(),stretchBudget=.05*surfaceArea;
  let stretched=baseline.reduce((sum,metric)=>sum+stretchedArea(metric),0);
  const crossFlow=new Float32Array(topology.edges.length);
  const dot=(x,y)=>Math.abs(x[0]*y[0]+x[1]*y[1]+x[2]*y[2]);
  for(const edge of topology.edges)if(edge.manifold&&edge.length>0){
    const [a,b]=edge.halves.map(half=>half.face);
    const tangent=topology.points[edge.b].map((v,k)=>(v-topology.points[edge.a][k])/edge.length);
    const axisA=directions.subarray(a*3,a*3+3),axisB=directions.subarray(b*3,b*3+3);
    if(Math.hypot(...axisA)>.5&&Math.hypot(...axisB)>.5&&dot(axisA,axisB)>.55)
      crossFlow[edge.id]=1-Math.max(dot(axisA,tangent),dot(axisB,tangent));
  }
  const stats={merges:0,closedCuts:0},cornerUV=Float32Array.from(layout.flat(2)),boxes=layout.map(box);
  let attempts=0,boxTests=0;
  function localFit(a,b,seam=null){
    const host={id:a,faces:charts[a]},patch={id:b,faces:charts[b]};
    let frontier=seam?seam.halves.map(half=>half.face):patch.faces;
    const neighborhood=new Set(frontier);
    const stretchLimit=seam?maxStretch:patchStretch;
    for(let depth=0;depth<4;depth++){
      const next=[];
      for(const f of frontier)for(const {face} of topology.neighbors[f]){
        if(labels[face]!==a||neighborhood.has(face))continue;
        next.push(face);neighborhood.add(face);
      }
      frontier=next;
      if(neighborhood.size>180||boxTests>12000000)break;
      if(depth<1)continue;
      const faces=[...neighborhood];
      const result=solvePinnedUvPatch(mesh,topology,cornerUV,labels,host,patch,faces,1,seam?[seam]:null);
      if(!result.ok)continue;
      const values=new Map(),localBoxes=[];
      let valid=true,addedStretch=0;
      for(const [i,f] of faces.entries()){
        const p=result.values[i],m=uvFaceMetric(baseline[f].points,p),before=baseline[f];
        const density=m.density/before.density;
        if(signed(p)*result.orientation<=0||m.condition>Math.max(stretchLimit,before.condition*1.04)||
          density<1/densityRatio||density>densityRatio){valid=false;break;}
        const bounds=box(p),hits=host.faces.some(g=>++boxTests>12000000||!neighborhood.has(g)&&intersects(bounds,boxes[g])&&
          triangleOverlapArea(p,layout[g],2**-25)>Math.max(m.uvArea,baseline[g].uvArea)*1e-10+1e-24)||
          localBoxes.some(other=>intersects(bounds,other.bounds)&&
          triangleOverlapArea(p,other.p,2**-25)>Math.max(m.uvArea,other.area)*1e-10+1e-24);
        if(hits){valid=false;break;}
        localBoxes.push({p,bounds,area:m.uvArea});
        values.set(f,{p,metric:m});
        addedStretch+=stretchedArea(m)-stretchedArea(currentMetrics[f]);
      }
      if(valid&&stretched+addedStretch<=stretchBudget)return {values,addedStretch};
    }
    return null;
  }
  function accept(changed){
    stretched+=changed.addedStretch;
    for(const [f,{p,metric}] of changed.values){
      layout[f]=p;
      currentMetrics[f]=metric;
      boxes[f]=box(p);
      for(let c=0;c<3;c++)cornerUV.set(p[c],f*6+c*2);
    }
  }
  for(let round=0;round<rounds&&attempts<maxAttempts&&boxTests<=12000000;round++){
    if(Date.now()>=deadline)return null;
    const candidates=new Map();
    for(const edge of topology.edges)if(crossFlow[edge.id]>0){
      const [a,b]=edge.halves.map(half=>labels[half.face]).sort((a,b)=>a-b);
      if(a===b||Math.min(charts[a].length,charts[b].length)>maxPatchFaces)continue;
      const key=a*count+b;
      if(!candidates.has(key))candidates.set(key,{a,b,across:0,length:0});
      const pair=candidates.get(key);
      pair.across+=edge.length*crossFlow[edge.id];
      pair.length+=edge.length;
    }
    const order=[...candidates.values()].filter(pair=>pair.across>=.23*pair.length)
      .sort((a,b)=>b.across-a.across||a.a-b.a||a.b-b.b);
    const joined=new Set();
    for(const pair of order){
      if(Date.now()>=deadline)return null;
      if(attempts>=maxAttempts||boxTests>12000000)break;
      const [a,b]=charts[pair.a].length>=charts[pair.b].length?[pair.a,pair.b]:[pair.b,pair.a];
      if(joined.has(a)||joined.has(b))continue;
      attempts++;
      const changed=localFit(a,b);
      if(!changed)continue;
      accept(changed);
      for(const f of charts[b])labels[f]=a;
      charts[a].push(...charts[b]);
      charts[b]=[];
      joined.add(a);joined.add(b);
      stats.merges++;
    }
    onProgress((round+1)/rounds*.3);
    if(!joined.size)break;
  }
  {
    const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const gap=edge=>{
      const [a,b]=edge.halves,p=layout[a.face][a.edge],q=layout[a.face][next(a.edge)],
        r=layout[b.face][next(b.edge)],s=layout[b.face][b.edge];
      return Math.max(distance(p,r),distance(q,s))/Math.max(distance(p,q),distance(r,s),1e-20);
    };
    const seams=topology.edges.filter(e=>crossFlow[e.id]>.28&&labels[e.halves[0].face]===labels[e.halves[1].face])
      .map(e=>({e,gap:gap(e)})).filter(x=>x.gap>1e-6&&x.gap<1)
      .sort((a,b)=>a.gap/(a.e.length*crossFlow[a.e.id])-b.gap/(b.e.length*crossFlow[b.e.id]));
    for(const [i,{e}] of seams.slice(0,closeLimit).entries()){
      if(Date.now()>=deadline)return null;
      if(boxTests>12000000)break;
      if(gap(e)<1e-6)continue;
      const id=labels[e.halves[0].face],changed=localFit(id,id,e);
      if(changed){accept(changed);stats.closedCuts++;}
      if(i%24===0)onProgress(.3+i/closeLimit*.1);
    }
  }
  if(Date.now()>=deadline||!stats.merges&&!stats.closedCuts)return null;
  const finalArea=layout.reduce((sum,p)=>sum+Math.abs(signed(p))*.5,0);
  const packed=packChangedCharts(mesh,labels,layout,{resolution,padding,reinsert,minimumScale:Math.sqrt((uvArea+.00015)/finalArea),
    onProgress:p=>onProgress(.4+p*.6)});
  return packed?{mesh:packed,stats}:null;
}
