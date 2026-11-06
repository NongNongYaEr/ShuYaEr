// Diagnostic geometry only. Never changes model UVs, material buffers or bake.
const MODES=new Set(['branches','stripes','uncertain','banyan-types','banyan-directions']);
const colors={unknown:[.42,.43,.46,1],uncertain:[1,.38,.08,1],supported:[.18,.48,.4,1],light:[.92,.91,.72,1],dark:[.12,.2,.24,1]};
const palette=id=>[0,1,2].map(k=>.35+.58*(.5+.5*Math.sin(id*2.399963+k*2.094395))).concat(1);
function clip(poly,limit,keepAbove){const result=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],inside=x=>keepAbove?x.s>=limit:x.s<=limit,aa=inside(a),bb=inside(b);if(aa)result.push(a);if(aa!==bb){const t=(limit-a.s)/(b.s-a.s);result.push({p:a.p.map((v,k)=>v+(b.p[k]-v)*t),s:limit});}}return result;}
export function buildFlowPreview(mesh,field,mode,{actualHeightMeters=10,stripeCm=12,maxVertices=800000}={}){
 if(!MODES.has(mode))throw Error('树皮走势预览方式无效。');if(!field||field.position.length!==mesh.pos.length||field.branchIds?.length!==mesh.pos.length/3)throw Error('流向预览不属于当前网格。');
 if(mode.startsWith('banyan-'))return buildBanyanPreview(mesh,field,mode,maxVertices);
 const groups=new Map(),size=stripeCm/100/actualHeightMeters;let vertices=0,omittedFaces=0,budgetExceededFaces=0,unsupportedFaces=0,uncertainFaces=0;
 const add=(key,color,poly)=>{if(poly.length<3)return;const count=(poly.length-2)*3;if(vertices+count>maxVertices){omittedFaces++;budgetExceededFaces++;return;}let group=groups.get(key);if(!group){group={color,positions:[]};groups.set(key,group);}for(let i=1;i<poly.length-1;i++)for(const q of [poly[0],poly[i],poly[i+1]])group.positions.push(...q.p);vertices+=count;};
 for(let f=0;f<mesh.indices.length/3;f++){
  const ids=[0,1,2].map(k=>mesh.indices[f*3+k]),labels=ids.map(v=>Math.round(field.branchIds[v])),perFace=field.faceBranch?.length===mesh.indices.length/3,id=perFace?field.faceBranch[f]:labels[0],supported=id>=0&&(perFace||labels.every(v=>v===id)),confidence=perFace&&field.faceConfidence?field.faceConfidence[f]:field.confidence?Math.min(...ids.map(v=>field.confidence[v])):0,uncertain=!supported||confidence<.3;
  const poly=ids.map(v=>({p:[0,1,2].map(k=>(mesh.pos[v*3+k]-mesh.min[k])/mesh.height),s:field.position[v*3+1]}));
  if(!supported){unsupportedFaces++;add('unknown',colors.unknown,poly);continue;}if(uncertain)uncertainFaces++;
  if(mode==='branches'){add('branch'+id,palette(id),poly);continue;}
  if(mode==='uncertain'){const key=uncertain?'uncertain':'supported';add(key,colors[key],poly);continue;}
  const lo=Math.floor(Math.min(...poly.map(q=>q.s))/size),hi=Math.floor(Math.max(...poly.map(q=>q.s))/size);
  if(hi-lo>12){add('unknown',colors.unknown,poly);omittedFaces++;continue;}
  for(let band=lo;band<=hi;band++){const part=clip(clip(poly,band*size,true),(band+1)*size,false),key=((band%2)+2)%2?'dark':'light';add(key,colors[key],part);}
 }
 const positions=new Float32Array(vertices*3),ranges=[];let offset=0;for(const group of groups.values()){positions.set(group.positions,offset*3);ranges.push({first:offset,count:group.positions.length/3,color:group.color});offset+=group.positions.length/3;}
 return{positions,ranges,summary:{mode,vertices,omittedFaces,budgetExceededFaces,unsupportedFaces,uncertainFaces,stripeCm,approximation:'source-face assignment when available, otherwise per-vertex approximation; piecewise-linear coordinate stripes; not semantic ground truth'}};
}
function buildBanyanPreview(mesh,field,mode,maxVertices){
 const count=mesh.indices.length/3;if(field.banyanTypes?.length!==count||field.banyanDirections?.length!==count*3)throw Error('请先生成榕根表面走势候选。');
 const palette=[[.20,.55,.85,1],[.70,.53,.32,1],[.18,.72,.43,1],[.95,.43,.16,1]],groups=new Map(),cells=new Set();let omittedFaces=0,vertices=0;
 if(mode==='banyan-directions'){for(let f=0;f<count;f++){if(vertices+3>maxVertices){omittedFaces++;continue;}const ids=Array.from(mesh.indices.subarray(f*3,f*3+3)),p=ids.map(v=>[0,1,2].map(k=>(mesh.pos[v*3+k]-mesh.min[k])/mesh.height)),a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],l=Math.hypot(...n),shade=Math.max(0,Math.min(7,Math.round((.5+(n[1]+n[2])*.2/Math.max(l,1e-12))*7))),key='body'+shade;let group=groups.get(key);if(!group){const v=.12+shade*.035;group={color:[v,v*1.05,v,1],positions:[]};groups.set(key,group);}group.positions.push(...p.flat());vertices+=3;}}
 for(let f=0;f<count;f++){const type=field.banyanTypes[f],p=[0,1,2].map(c=>{const v=mesh.indices[f*3+c];return[0,1,2].map(k=>(mesh.pos[v*3+k]-mesh.min[k])/mesh.height);});let data,key,color;
  if(mode==='banyan-types'){key=type;color=palette[type]||colors.unknown;data=p.flat();}
  else{if(type<0)continue;const a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],nl=Math.hypot(...n);if(nl<1e-16)continue;for(let k=0;k<3;k++)n[k]/=nl;const center=[0,1,2].map(k=>p.reduce((s,v)=>s+v[k]/3,0)),cell=center.map(v=>Math.floor(v/.024)).concat(n.map(v=>Math.round(v*2))).join(',');if(cells.has(cell))continue;cells.add(cell);const d=Array.from(field.banyanDirections.subarray(f*3,f*3+3)),side=[n[1]*d[2]-n[2]*d[1],n[2]*d[0]-n[0]*d[2],n[0]*d[1]-n[1]*d[0]],corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>center.map((q,k)=>q+n[k]*.0007+d[k]*u*.008+side[k]*v*.00045));data=[...corners[0],...corners[1],...corners[2],...corners[0],...corners[2],...corners[3]];key='directions';color=[.22,.95,.87,1];}
  if(vertices+data.length/3>maxVertices){omittedFaces++;continue;}let group=groups.get(key);if(!group){group={color,positions:[]};groups.set(key,group);}group.positions.push(...data);vertices+=data.length/3;
 }
 const positions=new Float32Array(vertices*3),ranges=[];let offset=0;for(const group of groups.values()){positions.set(group.positions,offset*3);ranges.push({first:offset,count:group.positions.length/3,color:group.color});offset+=group.positions.length/3;}
 return{positions,ranges,summary:{mode,vertices,omittedFaces,budgetExceededFaces:omittedFaces,approximation:'automatic surface constraints / geometric evidence only; not semantic organ labels or final coordinate gradients'}};
}
export function clearFlowPreview(renderer){const gl=renderer.gl,old=renderer.flowPreview;if(old){gl.deleteBuffer(old.buffer);gl.deleteVertexArray(old.vao);}renderer.flowPreview=null;renderer.dirty=true;}
export function setFlowPreview(renderer,mesh,field,mode,options){
 if(!mode||mode==='material'||!field){clearFlowPreview(renderer);return;}
 const result=buildFlowPreview(mesh,field,mode,options);if(result.summary.budgetExceededFaces)throw Error('走势诊断超过几何预览预算，请改用分支颜色或降低条纹密度。');const gl=renderer.gl,vao=gl.createVertexArray(),buffer=gl.createBuffer();
 try{gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,result.positions,gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);}catch(error){gl.deleteBuffer(buffer);gl.deleteVertexArray(vao);throw error;}
 clearFlowPreview(renderer);renderer.flowPreview={vao,buffer,ranges:result.ranges,summary:result.summary};renderer.dirty=true;
}
export function drawFlowPreview(renderer){const preview=renderer.flowPreview;if(!preview)return;const gl=renderer.gl,l=renderer.guideLocations;gl.useProgram(renderer.guideProgram);gl.bindVertexArray(preview.vao);gl.uniformMatrix4fv(l.vp,false,renderer.lastVP);gl.uniform1i(l.bake,0);gl.disable(gl.BLEND);gl.depthMask(true);gl.depthFunc(gl.LESS);
 try{for(const range of preview.ranges){gl.uniform4fv(l.color,range.color);gl.drawArrays(gl.TRIANGLES,range.first,range.count);}}finally{gl.depthMask(true);gl.depthFunc(gl.LESS);}
}
