// Intrinsic 3x2 coordinate Jacobian. Edge lengths alone miss a collapsed
// transverse direction (and the resulting arbitrarily stretched texture).
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const at=(a,i)=>Array.from(a.subarray(i*3,i*3+3));
// The source triangle metric is invariant throughout local/global relaxation.
// Reuse it without changing the subtraction/division order of the Jacobian.
export function triangleFlowJacobian(q,ids,metric){
 const a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,j0=new Array(3),j1=new Array(3);
 for(let k=0;k<3;k++){j0[k]=(q[b+k]-q[a+k])/metric.length;j1[k]=((q[c+k]-q[a+k])-metric.u*j0[k])/metric.h;}
 return{j0,j1};
}
export function triangleFlowMetric(p,q,ids){
 const [a,b,c]=ids.map(i=>at(p,i)),e=sub(b,a),f=sub(c,a),length=Math.hypot(...e);
 if(length<1e-12)return null;
 const x=e.map(v=>v/length),u=dot(f,x),h=Math.sqrt(Math.max(0,dot(f,f)-u*u));
 if(h<1e-12)return null;
 const [qa,qb,qc]=ids.map(i=>at(q,i)),j0=sub(qb,qa).map(v=>v/length),j1=sub(qc,qa).map((v,k)=>(v-u*j0[k])/h),aa=dot(j0,j0),bb=dot(j1,j1),ab=dot(j0,j1),d=Math.hypot(aa-bb,2*ab),hi=Math.sqrt(Math.max(0,(aa+bb+d)/2));
 // det / high eigenvalue avoids cancellation in a nearly collapsed triangle.
 const lo=hi>1e-15?Math.sqrt(Math.max(0,aa*bb-ab*ab))/hi:0;
 return{min:lo,max:hi,condition:hi/Math.max(lo,1e-15),area:length*h/2,j0,j1,x,y:f.map((v,k)=>(v-u*x[k])/h),length,u,h};
}
export function measureFlowDistortion(mesh,p,q,faceFilter=()=>true){
 const values=[],faceMetrics=new Array(mesh.indices.length/3);let area=0,compressed=0,stretched=0,severe=0,min=Infinity,max=0;
 for(let f=0;f<faceMetrics.length;f++)if(faceFilter(f)){const m=triangleFlowMetric(p,q,Array.from(mesh.indices.subarray(f*3,f*3+3)));if(!m)continue;faceMetrics[f]=m;values.push(m);area+=m.area;min=Math.min(min,m.min);max=Math.max(max,m.max);if(m.min<.5)compressed+=m.area;if(m.max>2)stretched+=m.area;if(m.condition>4)severe+=m.area;}
 const percentile=(key,t)=>{const sorted=values.slice().sort((a,b)=>a[key]-b[key]);let sum=0;for(const m of sorted){sum+=m.area;if(sum>=area*t)return m[key];}return sorted.at(-1)?.[key]??0;};
 return{faceMetrics,summary:{method:'area-weighted-tangent-singular-values-v1',faces:values.length,min:values.length?min:0,max,minP01:percentile('min',.01),minP05:percentile('min',.05),maxP99:percentile('max',.99),conditionP99:percentile('condition',.99),compressedAreaFraction:compressed/Math.max(area,1e-30),stretchedAreaFraction:stretched/Math.max(area,1e-30),severeAnisotropyAreaFraction:severe/Math.max(area,1e-30)}};
}
