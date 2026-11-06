// Improve intrinsic coordinates without changing the existing UV partition.
// Source geometry and old UV cuts are constraints, not optimization variables.
import {buildUvTopology} from './uv-topology.js';
import {refitUvCharts,uvFaceMetric} from './tree-uv-refit.js';
const bounds=p=>[Math.min(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1])),Math.max(...p.map(p=>p[0])),Math.max(...p.map(p=>p[1]))];
const signed=p=>(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);
const boxArea=b=>(b[2]-b[0])*(b[3]-b[1]);
function compact(values,stats){
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),points=values.flat().slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]),lo=[],hi=[];for(const p of points){while(lo.length>=2&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}for(let i=points.length-1;i>=0;i--){const p=points[i];while(hi.length>=2&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}const hull=lo.slice(0,-1).concat(hi.slice(0,-1));let best=boxArea(bounds(points)),ax=1,ay=0;
 for(let i=0;i<hull.length;i++){if(stats.orientationWork+hull.length>8000000){stats.orientationBudgetLimited=true;break;}stats.orientationWork+=hull.length;const a=hull[i],b=hull[(i+1)%hull.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<1e-14)continue;const x=dx/len,y=dy/len,area=boxArea(bounds(hull.map(p=>[x*p[0]+y*p[1],-y*p[0]+x*p[1]])));if(area<best){best=area;ax=x;ay=y;}}
 const angle=Math.atan2(ay,ax)-Math.round(Math.atan2(ay,ax)/(Math.PI/2))*(Math.PI/2);ax=Math.cos(angle);ay=Math.sin(angle);return values.map(t=>t.map(([x,y])=>[ax*x+ay*y,-ay*x+ax*y]));
}
export function polishTreeUvCharts(guided,assembled,{densityRatio=1.5,maxStretch=2.5,spendPair=()=>{},onProgress=()=>{}}={}){
 const mesh=guided.mesh,height=guided.input.height,count=mesh.indices.length/3,topology=buildUvTopology(mesh),uv=assembled.uv.slice(),stats={algorithm:'fixed-partition-conformal-v1',attempts:0,processedFaces:0,acceptedCharts:0,acceptedFaces:0,orientationWork:0,orientationBudgetLimited:false,failures:{},budgetLimited:false},scratch=new Float32Array(uv.length),baseline=new Array(count);
 const points=f=>[0,1,2].map(c=>Array.from(mesh.pos.subarray(mesh.indices[f*3+c]*3,mesh.indices[f*3+c]*3+3),v=>v/height)),triangle=f=>[0,1,2].map(c=>Array.from(uv.subarray(f*6+c*2,f*6+c*2+2)));
 const groups=assembled.charts.map(chart=>{let area=0;for(const f of chart.faces){const p=points(f),m=uvFaceMetric(p,triangle(f));area+=m.area;}return{...chart,area};}).sort((a,b)=>b.area-a.area||a.id-b.id);
 for(const chart of groups){
  if(chart.faces.length>4000)continue;if(stats.attempts>=512||stats.processedFaces+chart.faces.length>25000){stats.budgetLimited=true;continue;}stats.attempts++;stats.processedFaces+=chart.faces.length;
  const seed=chart.faces.map(f=>{const p=points(f),q=triangle(f);baseline[f]={points:p,...uvFaceMetric(p,q)};return Object.assign(q,{chart:chart.id});}),sourceArea=chart.area,oldUvArea=chart.faces.reduce((s,f)=>s+baseline[f].uvArea,0),density=Math.sqrt(sourceArea/oldUvArea),energyBefore=chart.faces.reduce((s,f)=>s+baseline[f].area*Math.log(baseline[f].condition)**2,0),maximumBefore=Math.max(...chart.faces.map(f=>baseline[f].condition)),oldBox=bounds(seed.flat());
  for(const f of chart.faces)baseline[f].density*=density;
  const fit=energyBefore<=sourceArea*1e-10?{ok:false,reason:'already-conformal'}:refitUvCharts(mesh,topology,chart.faces,seed,{scratch,baseline,maxStretch,densityRatio,maxExtent:Infinity,maxAspect:20,fill:0,spendPair});let reason=fit.reason;
  if(fit.ok){const metrics=chart.faces.map((f,i)=>uvFaceMetric(baseline[f].points,fit.values[i])),energyAfter=metrics.reduce((s,m)=>s+m.area*Math.log(m.condition)**2,0),maximumAfter=Math.max(...metrics.map(m=>m.condition)),adjusted=compact(fit.values,stats),newBox=bounds(adjusted.flat());if(energyAfter>=energyBefore*.99||maximumAfter>maximumBefore*(1+2e-5))reason='angular-regression';else if(boxArea(newBox)/fit.area>boxArea(oldBox)/oldUvArea*1.001)reason='footprint-regression';
   if(!reason){const scale=.9/Math.max(newBox[2]-newBox[0],newBox[3]-newBox[1]),candidate=Float32Array.from(adjusted.flat(2),(v,i)=>.05+(v-newBox[i%2])*scale),after=chart.faces.map((f,i)=>uvFaceMetric(baseline[f].points,[0,1,2].map(c=>Array.from(candidate.subarray(i*6+c*2,i*6+c*2+2))))),factor=Math.sqrt(sourceArea/after.reduce((s,m)=>s+m.uvArea,0));if(after.some((m,i)=>signed(seed[i])*signed([0,1,2].map(c=>Array.from(candidate.subarray(i*6+c*2,i*6+c*2+2))))<=0||!Number.isFinite(m.condition)||m.condition>Math.min(Math.max(maxStretch,baseline[chart.faces[i]].condition),maximumBefore)*(1+2e-5)||m.density*factor/baseline[chart.faces[i]].density>densityRatio||m.density*factor/baseline[chart.faces[i]].density<1/densityRatio))reason='quantization-regression';else{for(let i=0;i<chart.faces.length;i++)uv.set(candidate.subarray(i*6,i*6+6),chart.faces[i]*6);stats.acceptedCharts++;stats.acceptedFaces+=chart.faces.length;}}}
  if(!fit.ok||reason)stats.failures[reason]=(stats.failures[reason]||0)+1;for(const f of chart.faces)baseline[f]=undefined;if(stats.attempts%8===0)onProgress(stats.attempts/Math.min(groups.length,512));
 }
 onProgress(1);return{...assembled,uv,stats:{...assembled.stats,intrinsicPolish:stats}};
}
