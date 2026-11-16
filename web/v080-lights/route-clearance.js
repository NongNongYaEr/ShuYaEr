// A new connection must keep a full cord diameter from all other turns.
// Nearby segments in the same continuous bend naturally share a tube wall.
export function createRouteClearance(THREE,tracks,radius){
  const clearance=radius*2+1e-6,clearanceSquared=clearance**2,localArc=clearance*2;
  const cellSize=Math.max(.05,clearance*4),cells=new Map(),incoming=new Map(),outgoing=new Map(),large=[];
  const nearPoint=new THREE.Vector3(),otherPoint=new THREE.Vector3();

  function segments(samples){
    return samples.slice(1).map((end,i)=>{
      const start=samples[i],line=new THREE.Line3(start.point,end.point);
      return {start,end,line,length:line.distance(),direction:line.delta(new THREE.Vector3()).normalize()};
    });
  }

  function forCells({line:{start,end}},padding,visit){
    const [x0,y0,z0]=['x','y','z'].map(axis=>Math.floor((Math.min(start[axis],end[axis])-padding)/cellSize));
    const [x1,y1,z1]=['x','y','z'].map(axis=>Math.floor((Math.max(start[axis],end[axis])+padding)/cellSize));
    if((x1-x0+1)*(y1-y0+1)*(z1-z0+1)>4096)return false;
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)visit(`${x},${y},${z}`);
    return true;
  }

  function insert(segment){
    incoming.set(segment.end,segment);
    outgoing.set(segment.start,segment);
    const indexed=forCells(segment,0,key=>{
      if(!cells.has(key))cells.set(key,[]);
      cells.get(key).push(segment);
    });
    if(!indexed)large.push(segment);
  }

  for(const track of tracks)for(const segment of segments(track))insert(segment);

  function tryConnect(samples){
    const proposed=segments(samples);
    const newIncoming=new Map(proposed.map(segment=>[segment.end,segment]));
    const newOutgoing=new Map(proposed.map(segment=>[segment.start,segment]));
    const previous=sample=>newIncoming.get(sample)||incoming.get(sample);
    const next=sample=>newOutgoing.get(sample)||outgoing.get(sample);
    for(const segment of proposed){
      const before=previous(segment.start),after=next(segment.end);
      if((before&&before.direction.dot(segment.direction)<-.15)||(after&&after.direction.dot(segment.direction)<-.15))return false;
      const adjacent=new Map();
      let distance=0;
      for(let other=before;other&&distance<localArc;other=previous(other.start)){
        adjacent.set(other,{gap:distance,a:segment.start.point,b:other.end.point});
        distance+=other.length;
      }
      distance=0;
      for(let other=after;other&&distance<localArc;other=next(other.end)){
        adjacent.set(other,{gap:distance,a:segment.end.point,b:other.start.point});
        distance+=other.length;
      }
      const candidates=new Set([...proposed,...large]);
      if(!forCells(segment,clearance,key=>{for(const nearby of cells.get(key)||[])candidates.add(nearby);})){
        for(const other of outgoing.values())candidates.add(other);
      }
      candidates.delete(segment);
      for(const other of candidates){
        if(segment.line.distanceSqToLine3(other.line,nearPoint,otherPoint)>=clearanceSquared)continue;
        const local=adjacent.get(other);
        if(!local||local.gap+nearPoint.distanceTo(local.a)+otherPoint.distanceTo(local.b)>localArc)return false;
      }
    }
    for(const segment of proposed)insert(segment);
    return true;
  }

  return {tryConnect};
}
