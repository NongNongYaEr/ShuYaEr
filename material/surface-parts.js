import {validatePartOrigin} from './part-suggestion-rules.js';
// Named source-face groups. Suggested labels remain editable and retain origin.
export const PART_LIMIT=8,PART_FACE_LIMIT=250000;
export function emptyParts(sourceSHA256){return{version:2,sourceSHA256,groups:[]};}
export function validateParts(raw,sourceSHA256){
  if(raw==null)return emptyParts(sourceSHA256);
  if(raw.sourceSHA256!==sourceSHA256)throw Error('部位选区不属于当前源模型。');
  if(![1,2].includes(raw.version)||!Array.isArray(raw.groups)||raw.groups.length>PART_LIMIT)throw Error('部位选区结构无效。');
  const ids=new Set();let total=0;const groups=raw.groups.map(group=>{if(!/^[a-f0-9]{16}$/.test(group?.id)||ids.has(group.id)||typeof group.name!=='string'||!group.name.trim()||group.name.length>40||!Array.isArray(group.faces)||group.faces.length>PART_FACE_LIMIT||group.faces.some(f=>!Number.isInteger(f)||f<0||f>2000000)||new Set(group.faces).size!==group.faces.length||raw.version===1&&group.origin!=null)throw Error('部位名称或源面选区无效。');ids.add(group.id);total+=group.faces.length;const origin=validatePartOrigin(group.origin);return{id:group.id,name:group.name.trim(),faces:group.faces.slice().sort((a,b)=>a-b),...(origin?{origin}:{})};});
  if(total>PART_FACE_LIMIT)throw Error('全部部位选区合计最多25万个源面引用。');return{version:2,sourceSHA256,groups};
}
export function validatePartSource(parts,mesh){
  if(!parts)return true;if(parts.sourceSHA256!==mesh.sourceSHA256||parts.groups.some(g=>g.faces.some(f=>f>=mesh.indices.length/3)))throw Error('部位选区不属于当前源模型。');return true;
}
export function replacePartFaces(parts,id,faces,{remove=false}={}){
  const next=structuredClone(parts),group=next.groups.find(g=>g.id===id);if(!group)throw Error('请先选择一个部位。');const selected=new Set(group.faces);let changed=false;for(const face of faces){if(remove)changed=selected.delete(face)||changed;else if(!selected.has(face)){selected.add(face);changed=true;}}group.faces=[...selected];if(changed&&group.origin)group.origin.selectionEdited=true;return validateParts(next,next.sourceSHA256);
}
const distance2=(p,a,b)=>{const e=b.map((v,k)=>v-a[k]),d=p.map((v,k)=>v-a[k]),ee=e.reduce((s,v)=>s+v*v,0),t=Math.max(0,Math.min(1,e.reduce((s,v,k)=>s+v*d[k],0)/(ee||1)));return d.reduce((s,v,k)=>s+(v-e[k]*t)**2,0);};
export function selectPartBrush(topology,hit,radiusMeters,actualHeightMeters){
  const mesh=topology.mesh;if(!Number.isInteger(hit.face)||hit.face<0||hit.face>=mesh.indices.length/3||!Array.isArray(hit.bary)||hit.bary.length!==3||hit.bary.some(v=>!Number.isFinite(v)||v<0||v>1)||Math.abs(hit.bary.reduce((s,v)=>s+v,0)-1)>1e-4||!Number.isFinite(radiusMeters)||radiusMeters<.01||radiusMeters>20||!Number.isFinite(actualHeightMeters)||actualHeightMeters<.1||actualHeightMeters>200)throw Error('部位刷选输入无效。');
  const ids=[0,1,2].map(c=>mesh.indices[hit.face*3+c]),center=[0,1,2].map(k=>ids.reduce((s,i,c)=>s+mesh.pos[i*3+k]*hit.bary[c],0));let minY=Infinity,maxY=-Infinity;for(const i of mesh.indices){minY=Math.min(minY,mesh.pos[i*3+1]);maxY=Math.max(maxY,mesh.pos[i*3+1]);}const radius=radiusMeters/actualHeightMeters*Math.max(maxY-minY,1e-8),queue=[hit.face],visited=new Set(queue);
  // buildUvTopology.neighbors contains only opposed, manifold shared edges.
  for(let at=0;at<queue.length;at++)for(const neighbor of topology.neighbors[queue[at]]){const edge=topology.edges[neighbor.edge];if(!visited.has(neighbor.face)&&distance2(center,topology.points[edge.a],topology.points[edge.b])<=radius*radius){visited.add(neighbor.face);queue.push(neighbor.face);}}
  return queue;
}
export function partOverlay(mesh,faces){const positions=new Float32Array(faces.length*9);let at=0;for(const f of faces){if(f*3+2>=mesh.indices.length)throw Error('部位显示包含无效源面。');for(let c=0;c<3;c++){const i=mesh.indices[f*3+c];for(let k=0;k<3;k++)positions[at++]=(mesh.pos[i*3+k]-mesh.min[k])/mesh.height+mesh.normal[i*3+k]*.00006;}}return positions;}
export function regionPartSets(regions,parts,faceCount){
  return regions.map(region=>{if(!region.partId)return null;const group=parts?.groups.find(g=>g.id===region.partId);if(!group||group.faces.some(f=>f>=faceCount))throw Error('图层部位范围无效。');return new Set(group.faces);});
}
