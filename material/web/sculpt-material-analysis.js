import {sampleStableCurvature} from './stable-curvature.js';
// Shape evidence recommends a global response and a source-corner relief field.
// It is not semantic classification or high-to-low sculpt normal baking.
export function analyzeSculptMaterial(mesh,base,{actualHeightMeters=10}={}){
 const edges=[],stride=Math.max(1,Math.ceil(base.vertices.length/1024)),scale=actualHeightMeters/mesh.height;
 for(let i=0;i<base.vertices.length;i+=stride){const v=base.vertices[i];for(const id of v.neighbors){const p=base.vertices[id].p;edges.push(Math.hypot(v.p[0]-p[0],v.p[1]-p[1],v.p[2]-p[2])*scale);}}
 edges.sort((a,b)=>a-b);const medianEdge=edges[Math.floor(edges.length/2)]||0;
 // Sampling below a mesh edge yields two identical fields and falsely reports
 // a smooth sculpt. Adapt to actual source sampling, with a coarse-mesh limit.
 const localRadiusMeters=Math.min(actualHeightMeters*.2,Math.max(.015,Math.min(.12,actualHeightMeters*.008),medianEdge*1.5)),broadRadiusMeters=localRadiusMeters*4,
 local=sampleStableCurvature(base,mesh,{actualHeightMeters,radiusMeters:localRadiusMeters,maxVisits:256}),broad=sampleStableCurvature(base,mesh,{actualHeightMeters,radiusMeters:broadRadiusMeters,maxVisits:512}),sums=new Float64Array(base.vertices.length),counts=new Uint32Array(base.vertices.length);
 for(let i=0;i<base.mapping.length;i++){const id=base.mapping[i];sums[id]+=Math.abs(local.signed[i]-broad.signed[i]/4);counts[id]++;}
 const samples=base.vertices.map(v=>({value:sums[v.id]/Math.max(1,counts[v.id]),weight:v.area})).sort((a,b)=>a.value-b.value),total=samples.reduce((n,s)=>n+s.weight,0);let weight=0,p80=0;
 for(const sample of samples){weight+=sample.weight;if(weight>=total*.8){p80=sample.value;break;}}
 const score=Math.max(0,Math.min(1,p80/.18)),confidence=localRadiusMeters<medianEdge||local.metadata.truncatedVertices||broad.metadata.truncatedVertices||base.metadata.unsupportedVertices?'limited':'supported';
 let localScores=Float32Array.from(base.vertices,v=>Math.min(1,(sums[v.id]/Math.max(1,counts[v.id]))/.18));
 // Light topological smoothing removes isolated face noise. It cannot bridge
 // disconnected roots, including roots lying very close together in space.
 for(let step=0;step<2;step++){const next=localScores.slice();for(const v of base.vertices){let sum=0,count=0;for(const id of v.neighbors){sum+=localScores[id];count++;}if(count)next[v.id]=localScores[v.id]*.7+sum/count*.3;}localScores=next;}
 const field={algorithm:'sculpt-corner-response-v1',sourceSHA256:mesh.sourceSHA256,actualHeightMeters,corners:Float32Array.from(base.mapping,id=>localScores[id])};
 return{algorithm:'sculpt-multiscale-response-v1',sourceSHA256:mesh.sourceSHA256,actualHeightMeters,score,localRadiusMeters,broadRadiusMeters,confidence,suggestedPreserve:Math.round((.35+score*.6)*100)/100,origin:'area-weighted local-minus-broad geometric curvature; global recommendation and connected source-corner response',field,metadata:{local:local.metadata,broad:broad.metadata,p80Residual:p80,medianEdgeMeters:medianEdge}};
}
