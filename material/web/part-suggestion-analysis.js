import {flowComponents} from './bark-flow.js';import {createBranchSampler} from './branch-sampler.js';import {validateBarkFlow} from './bark-flow-rules.js';import {validatePartSuggestionOptions,PART_SEMANTICS,PART_SEMANTIC_NAMES} from './part-suggestion-rules.js';import {digest} from './model.js';
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),length=a=>Math.hypot(...a),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],point=(p,i)=>Array.from(p.subarray(i*3,i*3+3)),unit=a=>{const l=length(a);return l>1e-15?a.map(v=>v/l):[0,0,0];};
export async function suggestTreeParts(mesh,{flow,options,guideSource='accepted'}={},progress=()=>{}){
 const config=validatePartSuggestionOptions(options),record=validateBarkFlow(flow,mesh.sourceSHA256),faceCount=mesh.indices.length/3;if(!record||!Number.isInteger(faceCount)||faceCount<1||faceCount>250000||!(mesh.height>1e-9)||!mesh.min||!['accepted','automatic'].includes(guideSource))throw Error('部位建议需要当前源模型与有效中心线，最多25万面。');
 const {topology,labels}=flowComponents(mesh);if(record.componentSeed>=faceCount)throw Error('部位建议中心线锚点不属于源模型。');const component=labels[record.componentSeed],sampler=createBranchSampler(record),branches=sampler.branches,byId=new Map(branches.map((b,i)=>[b.id,i])),main=branches.map((b,i)=>({i,b,span:Math.max(...b.points.map(p=>p[1]))-Math.min(...b.points.map(p=>p[1]))})).filter(x=>!x.b.parent).sort((a,b)=>b.span-a.span||a.i-b.i)[0]?.i;if(main==null)throw Error('中心线没有可用的主干。');
 const roots=new Uint8Array(branches.length),ancestors=[],junctions=Array.from(branches,()=>[]),radius=(b,s)=>b.start_radius+(b.end_radius-b.start_radius)*Math.max(0,Math.min(1,s/b.length));
 for(const [i,b]of branches.entries()){
  const parent=byId.get(b.parent),chain=parent==null?[]:[parent,...ancestors[parent]];ancestors[i]=chain;const first=b.points[0],last=b.points.at(-1),delta=sub(last,first),horizontal=Math.hypot(delta[0],delta[2]);
  // A low attachment alone is not a root: the descendant must travel down or
  // mostly outward with little rise. Root descendants inherit that evidence.
  if(i!==main&&(parent!=null&&roots[parent]||first[1]<=config.rootAttachMax&&delta[1]<=Math.max(b.start_radius*.5,horizontal*.3)&&last[1]<=config.rootAttachMax))roots[i]=1;
  if(parent!=null&&!roots[i]){const item={child:i,point:first,radius:Math.min(b.start_radius,radius(branches[parent],b.attach*branches[parent].length))*config.junctionScale};junctions[parent].push(item);junctions[i].push(item);}
 }
 const p=Float64Array.from(mesh.pos,(v,i)=>(v-mesh.min[i%3])/mesh.height),faces=new Array(faceCount),assignment=new Array(faceCount),reasons={},endSeeds=new Map(),countReason=key=>reasons[key]=(reasons[key]||0)+1;
 for(let f=0;f<faceCount;f++){
  const points=[0,1,2].map(c=>point(p,mesh.indices[f*3+c])),center=[0,1,2].map(k=>points.reduce((sum,p)=>sum+p[k]/3,0)),n=cross(sub(points[1],points[0]),sub(points[2],points[0])),area=length(n)*.5,normal=unit(n);faces[f]={points,center,normal,area};
  if(labels[f]!==component||area<1e-18){assignment[f]='review';countReason(labels[f]!==component?'independent-surface':'degenerate');continue;}
  const [sample,other]=sampler.readPair(center),branch=branches[sample.branch],r=sample.expectedRadius;faces[f].sample=sample;
  let kind;if(sample.distance>r*3){kind='review';countReason('far-from-guide');}
  else if(roots[sample.branch])kind='roots';
  else if(sample.branch===main&&center[1]<config.basalHeight)kind='base';
  else if(junctions[sample.branch].some(j=>{const d=sub(center,j.point);return dot(d,d)<j.radius*j.radius;}))kind='junctions';
  else if(other&&!ancestors[sample.branch].includes(other.branch)&&!ancestors[other.branch].includes(sample.branch)&&other.distance<sample.distance*1.15&&other.distance<other.expectedRadius*2.5){kind='review';countReason('ambiguous-nearby-guides');}
  else if(sample.branch===main)kind='trunk';
  else {const parent=branches[byId.get(branch.parent)??main],parentRadius=radius(parent,(branch.parent?branch.attach:.5)*parent.length);kind=r<parentRadius*config.thinRatio?'twigs':'branches';}
  assignment[f]=kind;
  if(config.detectEndCaps&&!['review','roots','base','junctions'].includes(kind)){
   const end=branch.points.at(-1),axis=branch.frames.at(-1).y,delta=sub(center,end),radial=sub(delta,axis.map(v=>v*dot(delta,axis)));if(branch.length-sample.s<Math.max(branch.end_radius*2,branch.length*.025)&&Math.abs(dot(delta,axis))<branch.end_radius*2&&length(radial)<branch.end_radius*2.5&&dot(normal,axis)>Math.cos(Math.PI/10)){if(!endSeeds.has(sample.branch))endSeeds.set(sample.branch,new Set());endSeeds.get(sample.branch).add(f);}
  }
  if(f%2048===0)progress({phase:'按枝段分析部位',progress:f/faceCount*.85});
 }
 const endPatches=[];for(const [branchIndex,seeds]of endSeeds){const seen=new Set();for(const first of seeds)if(!seen.has(first)){
  const patch=[first];seen.add(first);for(let at=0;at<patch.length;at++)for(const next of topology.neighbors[patch[at]])if(seeds.has(next.face)&&!seen.has(next.face)&&dot(faces[first].normal,faces[next.face].normal)>.985){seen.add(next.face);patch.push(next.face);}
  if(patch.length<3)continue;const area=patch.reduce((sum,f)=>sum+faces[f].area,0),normal=unit([0,1,2].map(k=>patch.reduce((sum,f)=>sum+faces[f].normal[k]*faces[f].area,0))),center=[0,1,2].map(k=>patch.reduce((sum,f)=>sum+faces[f].center[k]*faces[f].area,0)/area),r=branches[branchIndex].end_radius;let planeError=0;for(const f of patch)for(const p of faces[f].points)planeError=Math.max(planeError,Math.abs(dot(sub(p,center),normal)));
  if(area<Math.PI*r*r*.25||planeError>r*.08||patch.some(f=>dot(faces[f].normal,normal)<Math.cos(Math.PI/22.5)))continue;for(const f of patch)assignment[f]='endcaps';endPatches.push({branch:branches[branchIndex].id,faces:patch.length,center,normal,areaNormalized:area,maxPlaneError:planeError});
 }}
 const groups=PART_SEMANTICS.map(semantic=>({semantic,name:PART_SEMANTIC_NAMES[semantic]+'（建议）',faces:[]}));for(let f=0;f<faceCount;f++)groups.find(g=>g.semantic===assignment[f]).faces.push(f);
 const guideSHA256=await digest(new TextEncoder().encode(JSON.stringify({kind:record.kind,version:record.version,coordinates:record.coordinates,sourceSHA256:record.sourceSHA256,componentSeed:record.componentSeed,guides:record.guides}))),algorithm='tree-surface-part-suggestions-v1',analysisSHA256=await digest(new TextEncoder().encode(JSON.stringify({algorithm,sourceSHA256:mesh.sourceSHA256,guideSHA256,options:config,assignment})));progress({phase:'部位建议完成',progress:1});
 return{kind:'tree-part-suggestions',version:1,algorithm,sourceSHA256:mesh.sourceSHA256,faceCount,guideSource,guideSHA256,analysisSHA256,options:config,groups,summary:{mainGuide:branches[main].id,rootGuides:branches.filter((b,i)=>roots[i]).map(b=>b.id),counts:Object.fromEntries(groups.map(g=>[g.semantic,g.faces.length])),reasons,endPatches,warnings:['这是几何规则建议，不是已确认的树木解剖。请检查根向枝段、分叉与可能端面，再采用。',...(record.warnings||[]).map(w=>w.replace('其它部分使用直立投射，不跨接。','其它部分列入待检查，不跨接。'))]}};
}
