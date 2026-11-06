import {REGION_LAYERS} from './surface-tools.js';
import {scopeWeight} from './region-scope.js';
import {regionPartSets} from './surface-parts.js';

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const length=Math.hypot(...v)||1;return[v[0]/length,v[1]/length,v[2]/length];};
const smoothOffsets=Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4)]);
const point=(mesh,i)=>[mesh.pos[i*3],mesh.pos[i*3+1],mesh.pos[i*3+2]];
function edgeDistance2(p,a,b){const e=sub(b,a),d=sub(p,a),t=Math.max(0,Math.min(1,dot(d,e)/(dot(e,e)||1)));return d.reduce((s,v,c)=>s+(v-e[c]*t)**2,0);}

// Only shared, manifold edges join faces. Merely touching vertices do not join branches.
export function buildBrushTopology(mesh){
  const edges=new Map(),neighbors=Array.from({length:mesh.indices.length/3},()=>[]);let minY=Infinity,maxY=-Infinity;
  for(const i of mesh.indices){minY=Math.min(minY,mesh.pos[i*3+1]);maxY=Math.max(maxY,mesh.pos[i*3+1]);}
  for(let f=0;f<neighbors.length;f++)for(let c=0;c<3;c++){
    const a=point(mesh,mesh.indices[f*3+c]),b=point(mesh,mesh.indices[f*3+(c+1)%3]),ka=a.join(','),kb=b.join(','),key=ka<kb?ka+'|'+kb:kb+'|'+ka;
    if(ka===kb)continue;let list=edges.get(key);if(!list)edges.set(key,list=[]);list.push({face:f,edge:c,a,b});
  }
  for(const list of edges.values())if(list.length===2&&list[0].face!==list[1].face){const [a,b]=list,opposed=a.a.every((v,k)=>v===b.b[k])&&a.b.every((v,k)=>v===b.a[k]);neighbors[a.face].push({face:b.face,a:a.a,b:a.b,edge:a.edge,otherEdge:b.edge,opposed});neighbors[b.face].push({face:a.face,a:a.a,b:a.b,edge:b.edge,otherEdge:a.edge,opposed});}
  return{mesh,neighbors,minY,height:Math.max(maxY-minY,1e-8)};
}

export function connectedBrushFaces(topology,stroke,actualHeightMeters){
  if(!Number.isInteger(stroke.face)||stroke.face<0||stroke.face>=topology.neighbors.length)throw Error('遮罩笔触的源三角面无效。');
  const points=[0,1,2].map(c=>point(topology.mesh,topology.mesh.indices[stroke.face*3+c])),center=[0,1,2].map(k=>points.reduce((s,p,c)=>s+p[k]*stroke.bary[c],0)),radius=stroke.radiusMeters/actualHeightMeters*topology.height;
  if(!(radius>0)||!Number.isFinite(radius))throw Error('笔刷半径无效。');
  const faces=[],visited=new Set([stroke.face]),queue=[stroke.face];
  for(let at=0;at<queue.length;at++){const f=queue[at];faces.push(f);for(const edge of topology.neighbors[f])if((stroke.operation!=='smooth'||edge.opposed)&&!visited.has(edge.face)&&edgeDistance2(center,edge.a,edge.b)<=radius*radius*(1+1e-10)){visited.add(edge.face);queue.push(edge.face);}}
  return{faces,center,radius};
}

export class PixelMaskRasterizer{
  constructor(topology,working,size,{padding=8,channels=6}={}){
    if(!Number.isInteger(size)||size<16||size>4096||!Number.isInteger(padding)||padding<0||padding>32)throw Error('遮罩分辨率或扩边无效。');
    if(working.indices.length!==topology.mesh.indices.length)throw Error('遮罩的源面映射不一致。');
    this.topology=topology;this.size=size;this.padding=padding;this.triangles=[];const count=size*size,nearest=this.nearest=new Int32Array(count).fill(-1);
    for(let f=0;f<working.indices.length/3;f++){
      const ids=[0,1,2].map(c=>working.indices[f*3+c]),p=ids.map(i=>point(working,i)),uv=ids.map(i=>Array.from(working.uv.subarray(i*2,i*2+2)));
      for(let c=0;c<3;c++)for(let k=0;k<3;k++)if(p[c][k]!==topology.mesh.pos[topology.mesh.indices[f*3+c]*3+k])throw Error('遮罩映射改变了源几何。');
      const a=sub(p[1],p[0]),b=sub(p[2],p[0]),aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),det=aa*bb-ab*ab,du=[uv[1][0]-uv[0][0],uv[2][0]-uv[0][0]],dv=[uv[1][1]-uv[0][1],uv[2][1]-uv[0][1]],uvdet=du[0]*dv[1]-du[1]*dv[0];
      if(det<=1e-28||Math.abs(uvdet)<1e-16){this.triangles.push(null);continue;}
      const grad=delta=>a.map((v,k)=>(delta[0]*bb-delta[1]*ab)/det*v+(delta[1]*aa-delta[0]*ab)/det*b[k]);
      const t={p,uv,du,dv,uvdet,gu:grad(du),gv:grad(dv),bounds:[Math.min(...uv.map(v=>v[0])),Math.min(...uv.map(v=>v[1])),Math.max(...uv.map(v=>v[0])),Math.max(...uv.map(v=>v[1]))]};this.triangles.push(t);this.walk(t,t.bounds,(i)=>{nearest[i]=i;});
    }
    // Nearest covered texel within a bounded Chebyshev gutter, computed once per UV layout.
    if(padding){const queue=new Int32Array(count);let end=0;for(let i=0;i<count;i++)if(nearest[i]===i){const x=i%size,y=(i-x)/size;if((x&&nearest[i-1]<0)||(x+1<size&&nearest[i+1]<0)||(y&&nearest[i-size]<0)||(y+1<size&&nearest[i+size]<0))queue[end++]=i;}
      let start=0;for(let depth=0;depth<padding&&start<end;depth++){const stop=end;for(;start<stop;start++){const i=queue[start],x=i%size,y=(i-x)/size;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy||x+dx<0||x+dx>=size||y+dy<0||y+dy>=size)continue;const j=i+dy*size+dx;if(nearest[j]>=0)continue;nearest[j]=nearest[i];queue[end++]=j;}}}}
    if(![1,6].includes(channels))throw Error('表面笔刷通道数量无效。');this.maps=Array.from({length:channels===1?1:2},()=>new Uint8Array(count*4).fill(255));this.previous=[];this.actualHeightMeters=null;
  }
  walk(t,bounds,visit){const s=this.size,x0=Math.max(0,Math.ceil(bounds[0]*s-.5)),y0=Math.max(0,Math.ceil(bounds[1]*s-.5)),x1=Math.min(s-1,Math.floor(bounds[2]*s-.5)),y1=Math.min(s-1,Math.floor(bounds[3]*s-.5));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const u=(x+.5)/s-t.uv[0][0],v=(y+.5)/s-t.uv[0][1],b=(u*t.dv[1]-v*t.du[1])/t.uvdet,c=(v*t.du[0]-u*t.dv[0])/t.uvdet,a=1-b-c;if(Math.min(a,b,c)<-1e-8)continue;visit(y*s+x,a,b,c);}}
  visitStroke(stroke,actualHeightMeters,visit){
    const {faces,center,radius}=connectedBrushFaces(this.topology,stroke,actualHeightMeters),hardness=Math.max(0,Math.min(.9999,stroke.hardness??.5));
    // Shared UV edges can visit the same texel twice. A stroke is composited once per texel.
    const touched=new Set();for(const f of faces){const t=this.triangles[f];if(!t)continue;const delta=sub(center,t.p[0]),u=t.uv[0][0]+dot(delta,t.gu),v=t.uv[0][1]+dot(delta,t.gv),ru=radius*Math.hypot(...t.gu),rv=radius*Math.hypot(...t.gv),bounds=[Math.max(t.bounds[0],u-ru),Math.max(t.bounds[1],v-rv),Math.min(t.bounds[2],u+ru),Math.min(t.bounds[3],v+rv)];
      this.walk(t,bounds,(i,a,b,c)=>{if(touched.has(i))return;const p=[0,1,2].map(k=>t.p[0][k]*a+t.p[1][k]*b+t.p[2][k]*c),d=Math.hypot(...sub(p,center))/radius;if(d>1)return;touched.add(i);let falloff=Math.max(0,Math.min(1,(1-d)/(1-hardness)));falloff=falloff*falloff*(3-2*falloff);visit({i,face:f,p,falloff});});
    }
    return radius;
  }
  prepareSmoothing(){
    if(this.owners)return;const n=this.triangles.length,parent=Int32Array.from({length:n},(_,i)=>i);this.owners=new Int32Array(this.size*this.size).fill(-1);this.crossings=Array.from({length:n},()=>Array(3).fill(null));
    const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
    for(let f=0;f<n;f++){const t=this.triangles[f];if(!t)continue;const a=sub(t.p[1],t.p[0]),b=sub(t.p[2],t.p[0]),aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),det=aa*bb-ab*ab;t.gB=a.map((v,k)=>(bb*v-ab*b[k])/det);t.gC=b.map((v,k)=>(aa*v-ab*a[k])/det);t.n=unit(cross(a,b));t.T=unit(a);t.B=cross(t.n,t.T);this.walk(t,t.bounds,i=>{this.owners[i]=f;});}
    for(let f=0;f<n;f++){const t=this.triangles[f];if(!t)continue;for(const h of this.topology.neighbors[f]){const other=this.triangles[h.face];if(!h.opposed||!other)continue;this.crossings[f][h.edge]={...h};const same=[0,1].every(k=>Math.abs(t.uv[h.edge][k]-other.uv[(h.otherEdge+1)%3][k])<=1e-8&&Math.abs(t.uv[(h.edge+1)%3][k]-other.uv[h.otherEdge][k])<=1e-8);if(same)parent[find(f)]=find(h.face);}}
    this.faceCharts=Int32Array.from({length:n},(_,i)=>find(i));
  }
  barycentric(t,p){const x=p[0]-t.p[0][0],y=p[1]-t.p[0][1],z=p[2]-t.p[0][2],b=x*t.gB[0]+y*t.gB[1]+z*t.gB[2],c=x*t.gC[0]+y*t.gC[1]+z*t.gC[2];return[1-b-c,b,c];}
  traceSurface(face,start,displacement){
    let target=[start[0]+displacement[0],start[1]+displacement[1],start[2]+displacement[2]];
    for(let step=0;step<48;step++){
      const t=this.triangles[face];if(!t)return null;const bary=this.barycentric(t,target);if(bary.every(v=>v>=-1e-7)){const clamped=bary.map(v=>Math.max(0,v)),sum=clamped.reduce((s,v)=>s+v,0);return{face,bary:clamped.map(v=>v/sum)};}
      const from=this.barycentric(t,start);let fraction=Infinity,opposite=-1;for(let k=0;k<3;k++)if(bary[k]<-1e-7){const q=Math.max(0,from[k])/(Math.max(0,from[k])-bary[k]);if(q<fraction){fraction=q;opposite=k;}}
      if(opposite<0||fraction>1)return null;const edge=(opposite+1)%3,h=this.crossings[face][edge];if(!h)return null;const next=this.triangles[h.face],hit=start.map((v,k)=>v+(target[k]-v)*fraction),remaining=sub(target,hit),transport=h.transport||(h.transport=(()=>{const axis=unit(sub(t.p[(edge+1)%3],t.p[edge]));return{axis,cos:Math.max(-1,Math.min(1,dot(t.n,next.n))),sin:dot(axis,cross(t.n,next.n))};})()),{axis,cos,sin}=transport,turn=cross(axis,remaining),along=dot(axis,remaining),rotated=remaining.map((v,k)=>v*cos+turn[k]*sin+axis[k]*along*(1-cos));
      start=hit;target=hit.map((v,k)=>v+rotated[k]);face=h.face;
    }
    return null;
  }
  sampleSurface(location,read){
    if(!location)return null;const t=this.triangles[location.face],b=location.bary,u=((0+t.uv[0][0]*b[0])+t.uv[1][0]*b[1])+t.uv[2][0]*b[2],v=((0+t.uv[0][1]*b[0])+t.uv[1][1]*b[1])+t.uv[2][1]*b[2],x=u*this.size-.5,y=v*this.size-.5,x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,chart=this.faceCharts[location.face];let value=0,weight=0;
    for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){const xx=Math.max(0,Math.min(this.size-1,x0+dx)),yy=Math.max(0,Math.min(this.size-1,y0+dy)),src=this.nearest[yy*this.size+xx],w=(dx?fx:1-fx)*(dy?fy:1-fy);if(src<0||this.owners[src]<0||this.faceCharts[this.owners[src]]!==chart||w<=0)continue;value+=(typeof read==='function'?read(src):read[src])*w;weight+=w;}
    return weight>1e-8?value/weight:null;
  }
  apply(stroke,channel,actualHeightMeters){
    const values=this.maps[channel>>2],component=channel%4,strength=stroke.strength??1;
    if(stroke.operation!=='smooth'){const target=stroke.value===0?0:255;this.visitStroke(stroke,actualHeightMeters,({i,falloff})=>{const at=i*4+component;values[at]=Math.round(values[at]+(target-values[at])*falloff*strength);});return;}
    this.prepareSmoothing();const targets=[],before=new Map(),radius=this.visitStroke(stroke,actualHeightMeters,target=>{targets.push(target);before.set(target.i,values[target.i*4+component]);}),kernel=radius*.2,read=i=>before.get(i)??values[i*4+component];
    // Snapshot all pixels that may change. Samples outside this set still contain their pre-stroke values.
    for(const target of targets){const old=before.get(target.i),t=this.triangles[target.face];let sum=old*4;for(const [x,y]of smoothOffsets){const displacement=t.T.map((v,k)=>(v*x+t.B[k]*y)*kernel),sample=this.sampleSurface(this.traceSurface(target.face,target.p,displacement),read);sum+=sample??old;}values[target.i*4+component]=Math.round(old+(sum/12-old)*target.falloff*strength);}
  }
  render(regions=[],actualHeightMeters=10,parts=null){
    for(let c=0;c<REGION_LAYERS.length;c++){
      const region=regions.find(r=>r.layer===REGION_LAYERS[c])||{mode:'all',strokes:[]},prev=this.previous[c],map=this.maps[c>>2],component=c%4;
      if((this.actualHeightMeters===actualHeightMeters&&prev&&JSON.stringify(prev)===JSON.stringify(region))||(!prev&&region.mode==='all'&&!region.strokes.length)){this.previous[c]=structuredClone(region);continue;}
      const incremental=this.actualHeightMeters===actualHeightMeters&&prev&&prev.mode===region.mode&&prev.strokes.length<=region.strokes.length&&prev.strokes.every((s,i)=>JSON.stringify(s)===JSON.stringify(region.strokes[i]));
      if(!incremental)for(let i=component;i<map.length;i+=4)map[i]=region.mode==='painted'?0:255;
      for(let i=incremental?prev.strokes.length:0;i<region.strokes.length;i++)this.apply(region.strokes[i],c,actualHeightMeters);
      // Repeat padding after incremental edits; covered pixels remain authoritative.
      for(let i=0;i<this.nearest.length;i++){const src=this.nearest[i];if(src>=0&&src!==i)map[i*4+component]=map[src*4+component];}
      this.previous[c]=structuredClone(region);
    }
    this.actualHeightMeters=actualHeightMeters;const maps=this.maps.map(m=>m.slice()),partSets=regionPartSets(regions,parts,this.triangles.length),scopes=REGION_LAYERS.map((id,c)=>{const index=regions.findIndex(r=>r.layer===id);return{c,scope:regions[index]?.scope,faces:partSets[index]};}).filter(r=>r.scope||r.faces);
    // Scope the returned copy, never the stroke cache. Expanding a range restores
    // the original brush result and changing only a range cannot compound fades.
    if(scopes.length){for(let face=0;face<this.triangles.length;face++){const t=this.triangles[face];if(!t)continue;this.walk(t,t.bounds,(i,a,b,c)=>{const height=(t.p[0][1]*a+t.p[1][1]*b+t.p[2][1]*c-this.topology.minY)/this.topology.height;for(const item of scopes){const map=item.c>>2,at=i*4+item.c%4;maps[map][at]=Math.round(this.maps[map][at]*scopeWeight(item.scope,height)*(!item.faces||item.faces.has(face)?1:0));}});}for(const item of scopes)for(let i=0;i<this.nearest.length;i++){const src=this.nearest[i];if(src>=0&&src!==i)maps[item.c>>2][i*4+item.c%4]=maps[item.c>>2][src*4+item.c%4];}}
    return{size:this.size,maps,algorithm:'surface-connected-pixel-v2'};
  }
}
