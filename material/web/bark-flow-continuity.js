// Regularize local coordinate rotations over physical source neighborhoods.
// Never average coordinate positions (which would shrink the texture metric).
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return Number.isFinite(n)&&n>1e-20?a.map(v=>v/n):null;};
export function rotationQuaternion(matrix){
 const m=matrix,t=m[0]+m[4]+m[8];let q;
 if(t>0){const s=Math.sqrt(1+t)*2;q=[(m[7]-m[5])/s,(m[2]-m[6])/s,(m[3]-m[1])/s,s/4];}
 else if(m[0]>m[4]&&m[0]>m[8]){const s=Math.sqrt(Math.max(0,1+m[0]-m[4]-m[8]))*2;q=[s/4,(m[1]+m[3])/s,(m[2]+m[6])/s,(m[7]-m[5])/s];}
 else if(m[4]>m[8]){const s=Math.sqrt(Math.max(0,1+m[4]-m[0]-m[8]))*2;q=[(m[1]+m[3])/s,s/4,(m[5]+m[7])/s,(m[2]-m[6])/s];}
 else{const s=Math.sqrt(Math.max(0,1+m[8]-m[0]-m[4]))*2;q=[(m[2]+m[6])/s,(m[5]+m[7])/s,s/4,(m[3]-m[1])/s];}
 return unit(q)||[0,0,0,1];
}
export function quaternionDirection(q,v){
 const [x,y,z,w]=q,a=[x,y,z],b=cross(a,v),c=cross(a,b);return v.map((p,k)=>p+2*(w*b[k]+c[k]));
}
export function sourceRotation(metric,x,y){
 x=unit(x)||[1,0,0];y=unit(y.map((v,k)=>v-x[k]*dot(x,y)));if(!y){const a=Math.abs(x[1])<.8?[0,1,0]:[0,0,1];y=unit(a.map((v,k)=>v-x[k]*dot(x,a)));}const z=cross(x,y),n=cross(metric.x,metric.y),m=[];
 for(let k=0;k<3;k++)for(let c=0;c<3;c++)m.push(x[k]*metric.x[c]+y[k]*metric.y[c]+z[k]*n[c]);
 return rotationQuaternion(m);
}
export function rotationNeighborhoods(mesh,p,topology,faces,{radius,maxVisits=96,maxEntries=1000000}){
 const lookup=new Int32Array(mesh.indices.length/3).fill(-1),centers=faces.map((face,i)=>{lookup[face.sourceFace]=i;return[0,1,2].map(k=>face.ids.reduce((s,v)=>s+p[v*3+k]/3,0));}),indices=[],weights=[],offsets=new Uint32Array(faces.length+1);let truncatedFaces=0,maxVisited=0;
 if(!(radius>0)||!Number.isFinite(radius))throw Error('衔接识别半径无效。');
 for(let i=0;i<faces.length;i++){
  offsets[i]=indices.length;const queue=[i],seen=new Set(queue);let at=0;
  for(;at<queue.length&&at<maxVisits;at++){
   const j=queue[at],d2=centers[i].reduce((s,v,k)=>s+(v-centers[j][k])**2,0);indices.push(j);weights.push(faces[j].metric.area*Math.exp(-d2/(radius*radius*.5)));
   if(indices.length>maxEntries)throw Object.assign(Error('连续走势邻域超过预算，请减小衔接范围；当前材质未改变。'),{code:'FLOW_NEIGHBORHOOD_BUDGET'});
   for(const edge of topology.neighbors[faces[j].sourceFace]){const k=lookup[edge.face];if(k<0||seen.has(k))continue;seen.add(k);if(centers[i].reduce((s,v,c)=>s+(v-centers[k][c])**2,0)<=radius*radius)queue.push(k);}
  }
  maxVisited=Math.max(maxVisited,at);if(at<queue.length)truncatedFaces++;
 }
 offsets[faces.length]=indices.length;
 return{offsets,indices:Uint32Array.from(indices),weights:Float64Array.from(weights),summary:{method:'area-weighted-source-rotation-neighborhood-v1',faces:faces.length,entries:indices.length,radius,maxVisits,maxVisited,truncatedFaces,maxEntries,scope:'connected source faces inside a physical Euclidean ball; not UV adjacency'}};
}
export function smoothRotations(quaternions,neighborhoods,amount){
 if(amount===0)return quaternions;
 return quaternions.map((q,i)=>{
  const sum=[0,0,0,0];for(let at=neighborhoods.offsets[i];at<neighborhoods.offsets[i+1];at++){const other=quaternions[neighborhoods.indices[at]],weight=neighborhoods.weights[at]*(dot(q,other)<0?-1:1);for(let k=0;k<4;k++)sum[k]+=other[k]*weight;}
  let average=unit(sum);if(!average)return q;if(dot(q,average)<0)average=average.map(v=>-v);return unit(q.map((v,k)=>v*(1-amount)+average[k]*amount))||q;
 });
}
