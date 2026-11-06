// Sew a source-continuous region; only verified faces enter the larger chart.
// Exceptions keep their original mapping, and the caller limits fragmentation.
import {sewChartBoundary,scoreSewBoundary} from './tree-uv-sew.js';
import {uvFaceMetric} from './tree-uv-refit.js';
import {triangleOverlapArea} from './uv-clearance.js';
const bounds=p=>[Math.min(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1])),Math.max(...p.map(p=>p[0])),Math.max(...p.map(p=>p[1]))],signed=p=>(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);
export function refitLargeUvCharts(mesh,topology,faces,seed,{scratch,baseline,maxStretch=2.5,densityRatio=1.5,maxExtent=Infinity,maxAspect=8,fill=.12,spendPair=()=>{},sewBalance=0,conditionChains=false}={}){
 const faceMap=new Map(faces.map((f,i)=>[f,i])),boundary=analyzeSewBoundary(mesh,topology,faces,seed,{conditionChains});if(!boundary)return{ok:false,reason:'no-open-boundary'};const {chain}=boundary;

 const uv=sewChartBoundary(mesh,topology,faces,seed,chain,{balance:sewBalance});if(!uv)return{ok:false,reason:'boundary-fit-failed'};

 const local=faces.map((f,i)=>{const p=[0,1,2].map(c=>Array.from(uv.subarray(i*6+c*2,i*6+c*2+2)));return{f,p,m:uvFaceMetric(baseline[f].points,p)};}),surface=local.reduce((s,t)=>s+t.m.area,0),uvArea=local.reduce((s,t)=>s+t.m.uvArea,0),factor=Math.sqrt(surface/uvArea),orientation=Math.sign(local.reduce((s,t)=>s+signed(t.p),0)),bad=new Set();
 for(const t of local){const relative=t.m.density*factor/baseline[t.f].density;if(signed(t.p)*orientation<=1e-16||!Number.isFinite(t.m.condition)||t.m.condition>Math.max(maxStretch,baseline[t.f].condition)*(1+2e-5)||relative>densityRatio||relative<1/densityRatio)bad.add(t.f);t.box=bounds(t.p);}
 const ordered=local.filter(t=>!bad.has(t.f)).sort((a,b)=>a.box[0]-b.box[0]||a.f-b.f),active=[];for(const t of ordered){for(let j=active.length-1;j>=0;j--){const b=active[j];if(b.box[2]<=t.box[0]){active.splice(j,1);continue;}if(bad.has(b.f)||bad.has(t.f)||b.box[3]<=t.box[1]||t.box[3]<=b.box[1])continue;spendPair();if(triangleOverlapArea(t.p,b.p,2**-30)>Math.max(t.m.uvArea,b.m.uvArea)*1e-10+1e-24)bad.add(t.m.area<b.m.area?t.f:b.f);}active.push(t);}
 const lookup=new Map(local.map(t=>[t.f,t])),remaining=new Set(faces.filter(f=>!bad.has(f))),components=[];for(const first of faces)if(remaining.delete(first)){const queue=[first];for(let at=0;at<queue.length;at++)for(const h of topology.neighbors[queue[at]]){if(!remaining.has(h.face))continue;const [a,b]=topology.edges[h.edge].halves,x=lookup.get(a.face),y=lookup.get(b.face);if(!x||!y||![0,1].every(k=>x.p[a.edge][k]===y.p[(b.edge+1)%3][k]&&x.p[(a.edge+1)%3][k]===y.p[b.edge][k]))continue;remaining.delete(h.face);queue.push(h.face);}components.push(queue);}
 components.sort((a,b)=>b.reduce((s,f)=>s+baseline[f].area,0)-a.reduce((s,f)=>s+baseline[f].area,0));const kept=components[0]||[],keptArea=kept.reduce((s,f)=>s+baseline[f].area,0);if(keptArea<surface*.9)return{ok:false,reason:'partial-area',retained:keptArea/surface};if(new Set(kept.map(f=>seed[faceMap.get(f)].chart)).size<2)return{ok:false,reason:'no-join'};
 const values=kept.map(f=>lookup.get(f).p),outputUvArea=kept.reduce((s,f)=>s+lookup.get(f).m.uvArea,0),densityFactor=Math.sqrt(keptArea/outputUvArea),densities=[];
 for(const f of kept){const t=lookup.get(f),d=t.m.density*densityFactor,relative=d/baseline[f].density;if(relative>densityRatio||relative<1/densityRatio)return{ok:false,reason:'local-density'};densities.push([d,t.m.area]);}
 const quantile=q=>{const sorted=densities.slice().sort((a,b)=>a[0]-b[0]);let sum=0;for(const[v,w]of sorted){sum+=w;if(sum>=keptArea*q)return v;}return sorted.at(-1)[0];},loScale=quantile(.05),hiScale=quantile(.95);if(hiScale/loScale>densityRatio)return{ok:false,reason:'density'};
 for(const tri of values)for(const p of tri){p[0]*=densityFactor;p[1]*=densityFactor;}const resultBox=bounds(values.flat()),w=resultBox[2]-resultBox[0],h=resultBox[3]-resultBox[1];if(Math.max(w,h)>maxExtent||Math.max(w,h)/Math.max(Math.min(w,h),1e-30)>maxAspect*2||keptArea/Math.max(w*h,1e-30)<fill)return{ok:false,reason:'extent'};
 return{ok:true,faces:kept,values,area:keptArea,loScale,hiScale,retainedAreaFraction:keptArea/surface,sewBalance,boundaryScore:boundary.score,exceptionFaces:faces.length-kept.length};
}

export function analyzeSewBoundary(mesh,topology,faces,seed,{conditionChains=false}={}){
 const faceMap=new Map(faces.map((f,i)=>[f,i]));
 const shared=topology.edges.filter(e=>e.manifold&&e.halves.every(h=>faceMap.has(h.face))&&seed[faceMap.get(e.halves[0].face)].chart!==seed[faceMap.get(e.halves[1].face)].chart),atVertex=new Map(),edgeKeys=new Map(),fixedChart=seed[0].chart;
 for(const e of shared){let[a,b]=e.halves;if(seed[faceMap.get(a.face)].chart!==fixedChart)[a,b]=[b,a];const i=faceMap.get(a.face),j=faceMap.get(b.face),keys=[[a.edge,(b.edge+1)%3],[(a.edge+1)%3,b.edge]].map(([x,y])=>topology.vertices[mesh.indices[a.face*3+x]]+':'+seed[i][x].join(',')+':'+seed[j][y].join(','));edgeKeys.set(e.id,keys);for(const key of keys){if(!atVertex.has(key))atVertex.set(key,[]);atVertex.get(key).push(e);}}
 const remainingEdges=new Set(shared.map(e=>e.id)),chains=[];for(const first of shared)if(remainingEdges.delete(first.id)){const part=[first];for(let at=0;at<part.length;at++)for(const key of edgeKeys.get(part[at].id))for(const e of atVertex.get(key))if(remainingEdges.delete(e.id))part.push(e);chains.push(part);}
 chains.sort((a,b)=>b.reduce((s,e)=>s+e.length,0)-a.reduce((s,e)=>s+e.length,0));const open=chains.filter(c=>c.some(e=>edgeKeys.get(e.id).some(key=>atVertex.get(key).length===1)));let chain=open[0];if(conditionChains&&chain){const length=c=>c.reduce((s,e)=>s+e.length,0),longest=length(chain),base=scoreSewBoundary(mesh,topology,faces,seed,chain),ranked=open.filter(c=>length(c)>=longest*.25).map(c=>({chain:c,score:scoreSewBoundary(mesh,topology,faces,seed,c)+.1*(longest/length(c)-1)})).sort((a,b)=>a.score-b.score);if(ranked[0]?.score<base*.85)chain=ranked[0].chain;}if(!chain)return null;

 return{chain,score:scoreSewBoundary(mesh,topology,faces,seed,chain),length:chain.reduce((s,e)=>s+e.length,0)};
}
