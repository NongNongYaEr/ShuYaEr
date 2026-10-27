// Keep densely bent sweep strips progressing along their centreline. When the
// inside of a tight bend overtakes its neighbour, slide only those surface
// vertices along the strip instead of moving bones or thinning the whole limb.
export function relaxSweepStrips(positions,rings,start=0){
  const edges=[],free=new Uint8Array(rings.length);let first=rings.length,last=-1;
  for(let k=0;k<rings.length-1;k++){
    const a=rings[k],b=rings[k+1],dx=b.center[0]-a.center[0],dy=b.center[1]-a.center[1],dz=b.center[2]-a.center[2],length=Math.hypot(dx,dy,dz);
    if(a.t<start-1e-10||length<1e-10||a.count!==b.count)continue;
    const edge={a,b,x:dx/length,y:dy/length,z:dz/length,length,k};edges.push(edge);
    for(let side=0;side<a.count;side++){const i=(a.offset+side)*3,j=(b.offset+side)*3,advance=(positions[j]-positions[i])*edge.x+(positions[j+1]-positions[i+1])*edge.y+(positions[j+2]-positions[i+2])*edge.z;if(advance<length*.02){first=Math.min(first,k);last=Math.max(last,k+1);break;}}
  }
  if(last<0)return false;
  for(let k=Math.max(1,first-1);k<=Math.min(rings.length-2,last+1);k++)if(rings[k].t>=start-1e-10)free[k]=1;
  let changed=false;
  for(let pass=0;pass<256;pass++){
    let remaining=0;
    for(let step=0;step<edges.length;step++){
      const e=edges[pass%2?edges.length-1-step:step],wa=free[e.k],wb=free[e.k+1],weight=wa+wb;if(!weight)continue;
      for(let side=0;side<e.a.count;side++){
        const i=(e.a.offset+side)*3,j=(e.b.offset+side)*3,advance=(positions[j]-positions[i])*e.x+(positions[j+1]-positions[i+1])*e.y+(positions[j+2]-positions[i+2])*e.z,gap=e.length*.02-advance;
        if(gap<=Math.max(1e-9,e.length*1e-5))continue;remaining=Math.max(remaining,gap/e.length);changed=true;const amount=gap/weight;
        if(wa){positions[i]-=e.x*amount;positions[i+1]-=e.y*amount;positions[i+2]-=e.z*amount;}
        if(wb){positions[j]+=e.x*amount;positions[j+1]+=e.y*amount;positions[j+2]+=e.z*amount;}
      }
    }
    if(remaining<1e-4)break;
  }
  // A chain of very short overlapping bends can converge slowly. Finish in
  // order, correcting only the next ring, so fixing one strip cannot invalidate
  // an earlier strip. The centreline, UVs and attachment frames never move.
  for(const e of edges)for(let side=0;side<e.a.count;side++){
    const i=(e.a.offset+side)*3,j=(e.b.offset+side)*3,advance=(positions[j]-positions[i])*e.x+(positions[j+1]-positions[i+1])*e.y+(positions[j+2]-positions[i+2])*e.z,gap=e.length*.02-advance;
    if(gap<=Math.max(1e-9,e.length*1e-5))continue;
    positions[j]+=e.x*gap;positions[j+1]+=e.y*gap;positions[j+2]+=e.z*gap;changed=true;
  }
  return changed;
}
