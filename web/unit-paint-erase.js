import {unitBranchIndex} from './unit-branch-boundary.js';
import {deleteBranchInstances} from './branch-instance-operations.js';

// Erasing targets real complete instances, never the source library, skeleton,
// or individual organs. Hidden/locked descendants protect their mounted family.
export function prepareUnitErase({authoring,branches,placements=[],isVisible=()=>true,carriers=null}) {
 const index=unitBranchIndex(branches,authoring.branch_instances||[]),arrayLocks=new Map((authoring.branch_arrays||[]).map(g=>[g.id,new Set(g.locked||[])]));
 const visible=new Set(),locked=new Set(),families=new Map(),lines=new Map(),byRuntime=new Map(branches.map(b=>[b.id,b]));
 for(const i of index.byInstance.values()){
  const owned=index.ownedBranches.get(i.id)||[];
  if(owned.some(b=>isVisible(b.stableId)))visible.add(i.id);
  if(i.assembly_locked||arrayLocks.get(i.array_id)?.has(i.id))locked.add(i.id);
  lines.set(i.id,owned.filter(b=>isVisible(b.stableId)&&b.points?.length>1).map(b=>b.points));
 }
 for(const p of placements){const branchId=p.branchStableId||byRuntime.get(p.branchId)?.stableId;if(branchId&&!isVisible(branchId))continue;const owner=index.ownerOf(branchId)?.id||p.sourceInstanceId||p.instanceId||p.unitOwner;
  if(visible.has(owner)&&p.position)lines.get(owner)?.push([p.position,p.position]);
 }
 const family=id=>{if(families.has(id))return families.get(id);const ids=new Set(),queue=[id];for(let n=0;n<queue.length;n++){const v=queue[n];if(ids.has(v))continue;ids.add(v);queue.push(...(index.children.get(v)||[]));}families.set(id,ids);return ids;};
 const entries=[];
 for(const i of index.byInstance.values()){
  const members=family(i.id);let reason='';
  if([...members].some(id=>!index.byInstance.has(id)))reason='包含旧复制造型，请在主枝干模式整理';
  else if([...members].some(id=>locked.has(id)))reason='该单元枝或挂接子枝已锁定';
  else if([...members].some(id=>!visible.has(id)))reason='挂接子枝已隐藏，整组保留';
  const visited=new Set([i.id]);let parent=index.parents.get(i.id);
  while(parent&&!visited.has(parent)){visited.add(parent);if(locked.has(parent))reason='所属单元枝已锁定';parent=index.parents.get(parent);}
  if(carriers){let p=i.parent,seen=new Set();while(index.ownerOf(p)&&!seen.has(p)){seen.add(p);p=index.ownerOf(p).parent;}if(!carriers.has(p))continue;}
  if(visible.has(i.id))entries.push({id:i.id,family:members,lines:lines.get(i.id)||[],reason});
 }
 return {entries,index};
}

// Clip each segment to the near/far planes before testing its screen distance.
// A long woody segment may cross the circle even when both endpoints miss it.
export function unitEraseHits(entries,point,radius,project){
 const hits=[];
 for(const entry of entries){const hit=entry.lines.some(line=>line.some((v,n)=>{
  if(!n)return false;let a=project(line[n-1]),b=project(v);
  if(![a.x,a.y,a.z,b.x,b.y,b.z].every(Number.isFinite)||a.behind||b.behind||a.z< -1&&b.z< -1||a.z>1&&b.z>1)return false;
  const z=b.z-a.z;let lo=0,hi=1;if(z){const t1=(-1-a.z)/z,t2=(1-a.z)/z;lo=Math.max(0,Math.min(t1,t2));hi=Math.min(1,Math.max(t1,t2));}if(lo>hi)return false;
  const dx=b.x-a.x,dy=b.y-a.y;b={x:a.x+dx*hi,y:a.y+dy*hi};a={x:a.x+dx*lo,y:a.y+dy*lo};
  const x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((point[0]-a.x)*x+(point[1]-a.y)*y)/Math.max(1e-12,x*x+y*y)));
  return Math.hypot(a.x+t*x-point[0],a.y+t*y-point[1])<=radius;
 }));if(hit)hits.push(entry);}
 return hits;
}

export function commitErasedUnits(authoring,ids){
 const roots=(authoring.branch_instances||[]).filter(i=>ids.has(i.id));
 // Keep the existing deletion contract (array empty slots and assembly voids),
 // including edits on attached manual branches. Sources/slots stay reusable.
 return deleteBranchInstances(authoring,roots);
}

// The view is fixed for a pen. Project/clip once, then query only nearby cells;
// never walk the whole model again for each six-pixel resampling point.
export function createUnitEraseScreen(entries,project,cellSize=96){
 const grid=new Map(),global=[],segments=[],paths=new Map();
 for(const entry of entries){const path=[];
  entry.lines.forEach((line,lineIndex)=>{const display=lineIndex===0;let pen=false;
   for(let n=0;n<line.length;n++){const b=project(line[n]);if(display&&Number.isFinite(b.x)&&Number.isFinite(b.y)&&!b.behind&&b.z>=-1&&b.z<=1){path.push((pen?'L':'M')+b.x.toFixed(1)+','+b.y.toFixed(1));pen=true;}else pen=false;
    if(!n)continue;const a=project(line[n-1]);if(![a.x,a.y,a.z,b.x,b.y,b.z].every(Number.isFinite)||a.behind||b.behind||a.z< -1&&b.z< -1||a.z>1&&b.z>1)continue;
    const dz=b.z-a.z;let lo=0,hi=1;if(dz){lo=Math.max(0,Math.min((-1-a.z)/dz,(1-a.z)/dz));hi=Math.min(1,Math.max((-1-a.z)/dz,(1-a.z)/dz));}if(lo>hi)continue;
    const ax=a.x+(b.x-a.x)*lo,ay=a.y+(b.y-a.y)*lo,bx=a.x+(b.x-a.x)*hi,by=a.y+(b.y-a.y)*hi,dx=bx-ax,dy=by-ay,record={entry,ax,ay,dx,dy,length:dx*dx+dy*dy};
    const minX=Math.floor(Math.min(ax,bx)/cellSize),maxX=Math.floor(Math.max(ax,bx)/cellSize),minY=Math.floor(Math.min(ay,by)/cellSize),maxY=Math.floor(Math.max(ay,by)/cellSize),id=segments.push(record)-1;
    if((maxX-minX+1)*(maxY-minY+1)>256){global.push(id);continue;}
    for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(id);}
   }
  });paths.set(entry.id,path.join(' '));
 }
 return {paths,query(point,radius){const candidates=new Set(global),hits=new Set(),result=[],rr=radius*radius;
  for(let x=Math.floor((point[0]-radius)/cellSize);x<=Math.floor((point[0]+radius)/cellSize);x++)for(let y=Math.floor((point[1]-radius)/cellSize);y<=Math.floor((point[1]+radius)/cellSize);y++)for(const id of grid.get(x+','+y)||[])candidates.add(id);
  for(const id of candidates){const s=segments[id];if(hits.has(s.entry))continue;const t=Math.max(0,Math.min(1,((point[0]-s.ax)*s.dx+(point[1]-s.ay)*s.dy)/Math.max(1e-12,s.length))),dx=s.ax+t*s.dx-point[0],dy=s.ay+t*s.dy-point[1];if(dx*dx+dy*dy<=rr){hits.add(s.entry);result.push(s.entry);}}
  return result;},segments:segments.length};
}
