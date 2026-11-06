import {analyzeUV} from './uv-analysis.js';
import {buildUvTopology,resolveCutEdge,uvEdgeContinuous,partitionCutFaces} from './uv-topology.js';
import {validateCutRules} from './uv-guide-rules.js';
import {verifySurfacePreserved,verifyFacePartitions} from './mesh-codec.js';
import {packUvCharts} from './uv-constraints.js';
const area3=(p,a,b,c)=>{const x=[0,1,2].map(k=>p[b*3+k]-p[a*3+k]),y=[0,1,2].map(k=>p[c*3+k]-p[a*3+k]);return Math.hypot(x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0])*.5;};
const area2=(uv,a,b,c)=>Math.abs((uv[b*2]-uv[a*2])*(uv[c*2+1]-uv[a*2+1])-(uv[c*2]-uv[a*2])*(uv[b*2+1]-uv[a*2+1]))*.5;
export function planGuidedUnwrap(input,{resolution=2048,padding=12,rules={},cutRules}={}){
  const count=input.indices.length/3;if(count>250000)throw Error('带接缝/保护的重展当前支持25万三角面以内。');const cuts=validateCutRules(cutRules),diagnostic=analyzeUV(input,{sampleSize:64,includeFaces:true}),pins=new Set(rules?.pins||[]),weights=rules?.weights||{},protectedSet=new Set(cuts.protectedFaces);
  for(const id of [...pins,...Object.keys(weights).map(Number)])if(!Number.isInteger(id)||id<0||id>=diagnostic.islands)throw Error('锁定/密度规则与当前UV版本不一致。');for(const value of Object.values(weights))if(!Number.isFinite(value)||value<.5||value>4)throw Error('UV密度规则无效。');
  for(const f of protectedSet)if(f>=count)throw Error('UV保护范围不属于当前模型。');for(let f=0;f<count;f++)if(pins.has(diagnostic.faceIslands[f]))protectedSet.add(f);
  if((protectedSet.size||Object.keys(weights).length)&&(diagnostic.zeroUvFaces||diagnostic.outOfRangeFaces))throw Error('保护展开形状或分配旧岛密度需要有效的原UV。');
  const topology=buildUvTopology(input),seamIds=new Set(cuts.seams.map(mark=>resolveCutEdge(topology,mark).id));
  for(const id of seamIds){const edge=topology.edges[id];if(edge.halves.every(h=>protectedSet.has(h.face))&&uvEdgeContinuous(input,edge))throw Error('指定接缝穿过受保护岛内部；请先解除该岛的保护/锁定。');}
  const active=new Uint8Array(count),faceWeights=new Float64Array(count);for(let f=0;f<count;f++){active[f]=!protectedSet.has(f);faceWeights[f]=weights[diagnostic.faceIslands[f]]||1;}
  const partitions=partitionCutFaces(topology,active,seamIds,faceWeights),localToInput=[],vertexMap=new Map(),remainingFaces=[],pos=[],normal=[],uv=[],indices=[],groups=[];
  for(let f=0;f<count;f++)if(active[f]){remainingFaces.push(f);groups.push(partitions.labels[f]);for(let c=0;c<3;c++){const old=input.indices[f*3+c];let local=vertexMap.get(old);if(local==null){local=localToInput.length;vertexMap.set(old,local);localToInput.push(old);pos.push(...input.pos.subarray(old*3,old*3+3));normal.push(...input.normal.subarray(old*3,old*3+3));uv.push(...input.uv.subarray(old*2,old*2+2));}indices.push(local);}}
  const protectedLabels=new Int32Array(count).fill(-1);let protectedComponents=0;for(const first of protectedSet)if(protectedLabels[first]<0){const label=protectedComponents++,queue=[first];protectedLabels[first]=label;for(let at=0;at<queue.length;at++)for(const h of topology.neighbors[queue[at]])if(protectedSet.has(h.face)&&protectedLabels[h.face]<0&&diagnostic.faceIslands[queue[at]]===diagnostic.faceIslands[h.face]&&uvEdgeContinuous(input,topology.edges[h.edge])){protectedLabels[h.face]=label;queue.push(h.face);}}
  const mesh=indices.length?{pos:Float32Array.from(pos),normal:Float32Array.from(normal),uv:Float32Array.from(uv),indices:Uint32Array.from(indices),faceGroups:Uint32Array.from(groups)}:null;
  return{input,topology,mesh,localToInput:Uint32Array.from(localToInput),remainingFaces:Uint32Array.from(remainingFaces),nativeGroups:Uint32Array.from(groups),protectedLabels,protectedSet,seamIds,faceWeights,oldIslands:diagnostic.faceIslands,pins,protectedComponents,partitionCount:partitions.count,options:{resolution,padding}};
}
export function mergeGuidedUnwrap(plan,nativeResult){
  const {input,remainingFaces,protectedLabels,oldIslands,pins,faceWeights}=plan,count=input.indices.length/3;
  if(remainingFaces.length){if(!nativeResult||nativeResult.indices.length!==remainingFaces.length*3)throw Error('受控重展遗漏了未保护的面。');verifyFacePartitions({indices:nativeResult.indices,faceGroups:plan.nativeGroups},nativeResult);}else if(nativeResult)throw Error('全部保护时不应生成额外重展网格。');
  const localFaces=new Int32Array(count).fill(-1);remainingFaces.forEach((f,i)=>localFaces[f]=i);const charts=[],tags=new Map(),faceCharts=new Int32Array(count),pos=[],normal=[],uv=[],indices=[],sourceIndices=[],chartIds=[],unique=new Map();
  for(let f=0;f<count;f++){
    const protectedFace=protectedLabels[f]>=0,localFace=localFaces[f],nativeChart=protectedFace?-1:nativeResult.chartIds[nativeResult.indices[localFace*3]],tag=protectedFace?'p'+protectedLabels[f]:'n'+nativeChart;
    if(!tags.has(tag)){tags.set(tag,charts.length);charts.push({id:charts.length,protected:protectedFace,pinned:protectedFace&&pins.has(oldIslands[f]),weight:faceWeights[f],faces:[],vertices:[],uvArea:0,surfaceArea:0,min:[Infinity,Infinity]});}const chart=charts[tags.get(tag)];faceCharts[f]=chart.id;chart.faces.push(f);if(chart.weight!==faceWeights[f])throw Error('自动重展混合了不同密度区。');
    for(let c=0;c<3;c++){
      const old=input.indices[f*3+c],i=protectedFace?old:nativeResult.indices[localFace*3+c],u=protectedFace?input.uv[i*2]:nativeResult.uv[i*2],v=protectedFace?input.uv[i*2+1]:nativeResult.uv[i*2+1];
      if(!protectedFace){const local=nativeResult.sourceIndices[i];if(local>=plan.localToInput.length||plan.localToInput[local]!==old)throw Error('受控重展面角映射不一致。');for(let k=0;k<3;k++)if(nativeResult.pos[i*3+k]!==input.pos[old*3+k]||nativeResult.normal[i*3+k]!==input.normal[old*3+k])throw Error('受控重展改变了源表面。');}
      if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||u>1||v<0||v>1)throw Error('受控重展出现无效UV。');const key=chart.id+':'+old+':'+u+':'+v;let vertex=unique.get(key);if(vertex==null){vertex=sourceIndices.length;unique.set(key,vertex);sourceIndices.push(old);chartIds.push(chart.id);chart.vertices.push(vertex);pos.push(...input.pos.subarray(old*3,old*3+3));normal.push(...input.normal.subarray(old*3,old*3+3));uv.push(u,v);chart.min[0]=Math.min(chart.min[0],u);chart.min[1]=Math.min(chart.min[1],v);}indices.push(vertex);
    }
    const [a,b,c]=indices.slice(f*3,f*3+3);chart.uvArea+=area2(uv,a,b,c);chart.surfaceArea+=area3(pos,a,b,c);
  }
  let minY=Infinity,maxY=-Infinity;for(const i of input.indices){minY=Math.min(minY,input.pos[i*3+1]);maxY=Math.max(maxY,input.pos[i*3+1]);}const height=Math.max(maxY-minY,1e-8);
  // Put every movable chart at the same area-based physical density before assigning weights.
  // Locked islands keep the original float UVs; protected islands keep their shape up to a similarity transform.
  for(const chart of charts){if(!(chart.uvArea>1e-20)||!(chart.surfaceArea>1e-20))throw Error('受保护或重展区域存在零面积面。');if(!chart.pinned){const factor=Math.sqrt(chart.surfaceArea/chart.uvArea)/height;for(const i of chart.vertices){uv[i*2]=(uv[i*2]-chart.min[0])*factor;uv[i*2+1]=(uv[i*2+1]-chart.min[1])*factor;}}}
  const mesh={pos:Float32Array.from(pos),normal:Float32Array.from(normal),uv:Float32Array.from(uv),indices:Uint32Array.from(indices),sourceIndices:Uint32Array.from(sourceIndices),tangent:new Float32Array(sourceIndices.length*4),chartIds:Int32Array.from(chartIds)},weights=Object.fromEntries(charts.filter(c=>!c.pinned&&Math.abs(c.weight-1)>1e-6).map(c=>[c.id,c.weight]));if(Object.keys(weights).length>2000)throw Error('重展后的密度区过多，请减少分区权重。');if(charts.filter(c=>c.pinned).length>128)throw Error('锁定区域拆为过多UV组件，请减少锁定。');verifySurfacePreserved(input,mesh);return{mesh,charts,options:{...plan.options,faceCharts,allowOutOfRange:true,pins:charts.filter(c=>c.pinned).map(c=>c.id),weights}};
}
export function packGuidedUnwrap(plan,nativeResult,{onProgress=()=>{},quarterTurns=false,refinePacking=false}={}){
  const merged=mergeGuidedUnwrap(plan,nativeResult),result=packUvCharts(merged.mesh,{...merged.options,onProgress,quarterTurns,refinePacking});result.sourceIndices=Uint32Array.from(result.sourceIndices,i=>merged.mesh.sourceIndices[i]);verifySurfacePreserved(plan.input,result);
  for(const id of plan.seamIds)if(uvEdgeContinuous(result,plan.topology.edges[id]))throw Error('最终UV未保留指定接缝，候选已拒绝。');
  result.packing={...result.packing,layoutMethod:result.packing.method,method:'guarded-xatlas',manualSeams:plan.seamIds.size,protectedFaces:plan.protectedSet.size,retainedUvComponents:plan.protectedComponents,nativePartitions:plan.partitionCount,additionalAutomaticSeamsPossible:true};return result;
}
