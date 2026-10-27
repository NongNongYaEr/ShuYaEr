import {axisTime,nearestAxis} from './branch-axis.js';

export function createCurvePointSelection(){
  let owner=null,scope='BRANCH',indices=[],primary=-1,count=0;
  const clean=(values,n)=>[...new Set(values)].filter(i=>Number.isInteger(i)&&i>=0&&i<n).sort((a,b)=>a-b);
  return {
    branch(id){owner=id;scope='BRANCH';indices=[];primary=-1;count=0;},
    select(id,values,active,n,operation='REPLACE'){
      if(owner!==id){indices=[];owner=id;}
      const hits=clean(values,n);
      indices=clean(operation==='ADD'?[...indices,...hits]:operation==='SUBTRACT'?indices.filter(i=>!hits.includes(i)):operation==='TOGGLE'?[...indices.filter(i=>!hits.includes(i)),...hits.filter(i=>!indices.includes(i))]:hits,n);
      scope='POINTS';primary=indices.includes(active)?active:indices.at(-1)??-1;count=n;return primary;
    },
    sync(id,active,n){
      if(owner!==id)this.branch(id);
      if(active!==primary){if(active>=0)scope='POINTS';indices=active>=0?[active]:[];primary=active;}
      indices=clean(indices,n);if(primary>=n)primary=indices.at(-1)??-1;
      if(count&&count!==n&&scope==='POINTS'){indices=primary>=0?[primary]:[];}
      count=n;return {owner,scope,indices:[...indices],primary};
    },
  };
}

export function planCurvePointDeletion(points,selected,pinned=[],minimum=4){
  const chosen=[...new Set(selected)].filter(i=>Number.isInteger(i)&&i>=0&&i<points.length),protectedPoints=new Set([0,points.length-1,...pinned]);
  const removed=chosen.filter(i=>!protectedPoints.has(i)).sort((a,b)=>a-b);
  if(!removed.length)return {removed:[],reason:chosen.length?'端点和固定点保留':'先选择要删除的控制点'};
  if(points.length-removed.length<minimum)return {removed:[],reason:`枝干至少保留 ${minimum} 个控制点，请缩小选区`};
  const remaining=points.map((_,i)=>i).filter(i=>!removed.includes(i));
  return {removed,points:remaining.map(i=>points[i]),pinned:pinned.filter(i=>remaining.includes(i)).map(i=>remaining.indexOf(i)),retained:chosen.length-removed.length};
}

export function planCurvePointInsertion(branch,hit,pinned=[]){
  const knots=branch.controlPoints;if(knots.length>=64)return {reason:'控制点已达到 64 个'};
  if(knots.some(p=>p.distanceToSquared(hit.point)<1e-12))return {reason:'这里已有控制点'};
  const times=knots.map(p=>nearestAxis(branch.points,p));
  let index=times.findIndex(t=>t>hit.t+1e-10);index=Math.max(1,Math.min(knots.length-1,index<0?knots.length-1:index));
  const points=knots.map(p=>p.clone());points.splice(index,0,hit.point.clone());
  return {points,index,pinned:pinned.map(i=>i>=index?i+1:i)};
}

export function curvePointBoxHits(records,start,end){
  const left=Math.min(start.x,end.x),right=Math.max(start.x,end.x),top=Math.min(start.y,end.y),bottom=Math.max(start.y,end.y);
  return records.filter(r=>r.object.userData.category==='control_point'&&r.x>=left&&r.x<=right&&r.y>=top&&r.y<=bottom).map(r=>r.object.userData.point_index);
}

export function projectedCurveHit(points,project,x,y,radius=10){
  if(points.length<2)return null;
  let best=null,previous=project(points[0]);
  for(let i=0;i<points.length-1;i++){
    const a=previous,b=project(points[i+1]);previous=b;if(a.w<=0||b.w<=0||a.z<-1&&b.z<-1||a.z>1&&b.z>1)continue;
    const dx=b.x-a.x,dy=b.y-a.y,square=dx*dx+dy*dy;if(square<1e-10)continue;
    const u=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/square)),px=a.x+dx*u,py=a.y+dy*u,distance=Math.hypot(x-px,y-py);
    if(distance>radius||best&&distance>=best.distance)continue;
    const alpha=u*a.w/((1-u)*b.w+u*a.w),point=points[i].clone().lerp(points[i+1],alpha);
    best={point,t:axisTime(points,i)+(axisTime(points,i+1)-axisTime(points,i))*alpha,x:px,y:py,distance};
  }return best;
}
