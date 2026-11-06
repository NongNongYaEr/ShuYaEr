// Absorb only a completely enclosed, single-boundary patch into its sole host.
// All faces must pass; this pass never creates exception islands.
import {buildUvTopology} from './uv-topology.js';
import {uvFaceMetric,refitUvCharts} from './tree-uv-refit.js';
import {triangleOverlapArea} from './uv-clearance.js';
const signed=p=>(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);
export function absorbTreeUvPatches(guided,assembled,{maxStretch=2.5,densityRatio=1.5,maxAspect=8,maxExtent=Infinity,fill=.12,spendPair=()=>{},onProgress=()=>{}}={}){
 const mesh=guided.mesh,height=guided.input.height,topology=buildUvTopology(mesh),uv=assembled.uv.slice(),scratch=new Float32Array(uv.length),charts=assembled.charts.map(c=>({...c,faces:c.faces.slice()})),byId=new Map(charts.map(c=>[c.id,c])),owner=assembled.projected.slice(),count=mesh.indices.length/3,baseline=new Array(count),stats={algorithm:'enclosed-boundary-patches-v1',attempts:0,processedFaces:0,merges:0,absorbedFaces:0,energyIncrease:0,failures:{},budgetLimited:false};
 if(!(height>0&&Number.isFinite(height)))throw Error('树结构UV高度无效。');
 const points=f=>[0,1,2].map(c=>Array.from(mesh.pos.subarray(mesh.indices[f*3+c]*3,mesh.indices[f*3+c]*3+3),v=>v/height)),triangle=f=>[0,1,2].map(c=>Array.from(uv.subarray(f*6+c*2,f*6+c*2+2))),energy=metrics=>metrics.reduce((s,m)=>s+m.area*Math.log(m.condition)**2,0);
 const cost=chart=>{const adjacent=new Set(chart.faces.flatMap(f=>topology.neighbors[f].map(h=>owner[h.face])).filter(id=>id!==chart.id));return adjacent.size===1?chart.faces.length+byId.get([...adjacent][0]).faces.length:Infinity;},small=charts.filter(c=>c.faces.length<=64).map(c=>({chart:c,cost:cost(c)})).sort((a,b)=>a.cost-b.cost||a.chart.faces.length-b.chart.faces.length||a.chart.id-b.chart.id).map(c=>c.chart),originalEnergy=energy(Array.from({length:count},(_,f)=>uvFaceMetric(points(f),triangle(f))));stats.energyBudget=originalEnergy*.01;
 for(let at=0;at<small.length;at++){
  const patch=small[at];if(!patch.faces.length||patch.faces.length>64)continue;
  const neighbors=new Set();let valid=true;
  for(const f of patch.faces)for(let k=0;k<3;k++){const e=topology.edges[topology.faceEdges[f*3+k]];if(!e.manifold){valid=false;break;}const other=e.halves[0].face===f?e.halves[1].face:e.halves[0].face;if(owner[other]===patch.id)continue;if(guided.nativeGroups[f]!==guided.nativeGroups[other]){valid=false;break;}neighbors.add(owner[other]);}
  if(!valid||neighbors.size!==1)continue;const host=byId.get([...neighbors][0]);if(!host||host.faces.length<=patch.faces.length||host.faces.length+patch.faces.length>4000)continue;
  const faces=[...host.faces,...patch.faces];
  const seed=[];let orientation=0;
  for(const chart of [host,patch]){const raw=chart.faces.map(triangle),metrics=chart.faces.map((f,i)=>uvFaceMetric(points(f),raw[i])),factor=Math.sqrt(metrics.reduce((s,m)=>s+m.area,0)/metrics.reduce((s,m)=>s+m.uvArea,0)),sign=Math.sign(raw.reduce((s,p)=>s+signed(p),0));if(!orientation)orientation=sign;
   for(let i=0;i<chart.faces.length;i++){const f=chart.faces[i],p=raw[i].map(p=>[p[0]*factor,p[1]*factor*(sign===orientation?1:-1)]);seed.push(Object.assign(p,{chart:chart.id}));baseline[f]={points:points(f),...uvFaceMetric(points(f),p)};}
  }
  if(stats.attempts>=128||stats.processedFaces+faces.length>16000){stats.budgetLimited=true;for(const f of faces)baseline[f]=undefined;continue;}stats.attempts++;stats.processedFaces+=faces.length;
  const before=energy(faces.map(f=>baseline[f])),fit=refitUvCharts(mesh,topology,faces,seed,{scratch,baseline,maxStretch,densityRatio,maxAspect,maxExtent,fill,spendPair});let reason=fit.reason,increase=0;
  if(fit.ok){const after=energy(faces.map((f,i)=>uvFaceMetric(baseline[f].points,fit.values[i])));increase=Math.max(0,after-before);if(stats.energyIncrease+increase>stats.energyBudget+1e-14)reason='energy-regression';}
  // The conformal solve has a free global orientation. Match the old host's
  // sign before quantization; individual triangle flips remain forbidden.
  if(fit.ok&&signed(fit.values[0])*signed(seed[0])<0)for(const tri of fit.values)for(const p of tri)p[0]=-p[0];
  let candidate=null;
  if(fit.ok&&!reason){const flat=fit.values.flat(),lo=[Math.min(...flat.map(p=>p[0])),Math.min(...flat.map(p=>p[1]))],hi=[Math.max(...flat.map(p=>p[0])),Math.max(...flat.map(p=>p[1]))],scale=.9/Math.max(hi[0]-lo[0],hi[1]-lo[1]);candidate=Float32Array.from(fit.values.flat(2),(v,i)=>.05+(v-lo[i%2])*scale);
   const values=faces.map((f,i)=>[0,1,2].map(c=>Array.from(candidate.subarray(i*6+c*2,i*6+c*2+2)))),metrics=faces.map((f,i)=>uvFaceMetric(baseline[f].points,values[i])),factor=Math.sqrt(fit.area/metrics.reduce((s,m)=>s+m.uvArea,0));
   if(metrics.some((m,i)=>!Number.isFinite(m.condition)||signed(seed[i])*signed(values[i])<=0||m.condition>Math.max(maxStretch,baseline[faces[i]].condition)*(1+2e-5)||m.density*factor/baseline[faces[i]].density>densityRatio||m.density*factor/baseline[faces[i]].density<1/densityRatio))reason='quantization-regression';
   increase=Math.max(0,energy(metrics)-before);if(stats.energyIncrease+increase>stats.energyBudget+1e-14)reason='energy-regression';
   const ordered=values.map((p,i)=>({p,i,box:[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))]})).sort((a,b)=>a.box[0]-b.box[0]||a.i-b.i),active=[];
   if(!reason)for(const t of ordered){for(let j=active.length-1;j>=0;j--){const b=active[j];if(b.box[2]<=t.box[0]){active.splice(j,1);continue;}if(b.box[3]<=t.box[1]||t.box[3]<=b.box[1])continue;spendPair();if(triangleOverlapArea(t.p,b.p,2**-30)>Math.max(metrics[t.i].uvArea,metrics[b.i].uvArea)*1e-10+1e-24){reason='quantization-overlap';break;}}if(reason)break;active.push(t);}
  }
  if(fit.ok&&!reason){for(let i=0;i<faces.length;i++){const f=faces[i];uv.set(candidate.subarray(i*6,i*6+6),f*6);owner[f]=host.id;}stats.absorbedFaces+=patch.faces.length;host.faces=faces;patch.faces=[];stats.merges++;stats.energyIncrease+=increase;}
  else stats.failures[reason]=(stats.failures[reason]||0)+1;
  for(const f of faces)baseline[f]=undefined;onProgress((at+1)/small.length);
 }
 const output=charts.filter(c=>c.faces.length),projected=new Int32Array(owner.length);output.forEach((c,id)=>{c.id=id;for(const f of c.faces)projected[f]=id;});
 const areas=output.map(c=>c.faces.reduce((s,f)=>s+uvFaceMetric(points(f),triangle(f)).area,0)).sort((a,b)=>b-a),total=areas.reduce((s,v)=>s+v,0),layout={tinyCharts:output.filter(c=>c.faces.length<=4).length,largestAreaFraction:(areas[0]||0)/total,topTenAreaFraction:areas.slice(0,10).reduce((s,v)=>s+v,0)/total};
 onProgress(1);return{...assembled,uv,projected,charts:output,stats:{...assembled.stats,stripCharts:output.length,mergedCharts:assembled.stats.initialCharts-output.length,mergeOperations:assembled.stats.mergeOperations+stats.merges,layout,enclosedPatches:stats}};
}
