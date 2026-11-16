export function createRouteLattice(THREE,surface,{radius,gap,attachmentLimit,certified}){
  const preferredDistance=radius+gap;
  const clearanceFloor=radius+Math.min(gap*.25,.0003);

  function withinReach(a,b,depth=0){
    const half=a.point.distanceTo(b.point)*.5;
    if(Math.max(a.distance,b.distance)+half<=attachmentLimit)return true;
    if(depth===6)return false;
    const point=a.point.clone().lerp(b.point,.5),distance=surface.distance(point,attachmentLimit);
    if(distance>=attachmentLimit)return false;
    const middle={point,distance};
    return withinReach(a,middle,depth+1)&&withinReach(middle,b,depth+1);
  }

  function connects(a,b){
    return withinReach(a,b)&&certified(a.point,b.point);
  }

  function search(start,end,lateral,length,width,step){
    const columns=Math.max(2,Math.ceil(length/step)),rows=Math.ceil(width/step),stride=2*rows+1;
    let previous=new Array(stride);
    previous[rows]=start;
    for(let i=1;i<=columns;i++){
      const base=start.point.clone().lerp(end.point,i/columns);
      const next=new Array(stride),band=Math.min(rows,i*3,(columns-i)*3);
      for(let offset=-band;offset<=band;offset++){
        const point=i===columns?end.point:base.clone().addScaledVector(lateral,offset*step);
        const distance=i===columns?end.distance:surface.distance(point,attachmentLimit);
        if(distance<clearanceFloor||distance>=attachmentLimit)continue;
        const node={point,distance,t:i/columns,cost:Infinity,parent:null};
        const center=rows+offset;
        for(let j=Math.max(0,center-3);j<=Math.min(stride-1,center+3);j++){
          const prior=previous[j];
          if(!prior)continue;
          const stepCost=prior.point.distanceTo(point)*(1+Math.abs(offset)*.006);
          const cost=prior.cost+stepCost+Math.abs(distance-preferredDistance)*.14;
          if(cost<node.cost&&connects(prior,node)){
            node.cost=cost;
            node.parent=prior;
          }
        }
        if(node.parent)next[center]=node;
      }
      if(!next.some(Boolean))return null;
      previous=next;
    }
    const route=[];
    for(let node=previous[rows];node;node=node.parent)route.push(node);
    return route.reverse();
  }

  function simplify(route){
    const result=[route[0]];
    for(let i=0;i<route.length-1;){
      let j=Math.min(i+24,route.length-1);
      while(j>i+1&&!connects(route[i],route[j]))j--;
      result.push(route[j]);
      i=j;
    }
    return result;
  }

  return (a,b)=>{
    const chord=b.point.clone().sub(a.point),length=chord.length();
    if(length<radius||length>.55)return null;
    // Use the cross-section spanned by the rays and the endpoint chord.
    // One step forward per column keeps the path from turning back on itself.
    const normal=new THREE.Vector3().crossVectors(a.radial,b.radial);
    const lateral=new THREE.Vector3().crossVectors(normal,chord);
    if(lateral.lengthSq()<1e-12)return null;
    lateral.normalize();
    const start={point:a.point,distance:surface.distance(a.point,attachmentLimit),t:0,cost:0};
    const end={point:b.point,distance:surface.distance(b.point,attachmentLimit)};
    if(start.distance>=attachmentLimit||end.distance>=attachmentLimit)return null;
    const route=search(start,end,lateral,length,.032,.004)||search(start,end,lateral,length,.05,.0035);
    if(!route)return null;
    const simplified=simplify(route);
    const distance=simplified.reduce((total,node,i)=>i?total+node.point.distanceTo(simplified[i-1].point):total,0);
    if(distance>length*2)return null;
    return simplified.slice(1,-1).map(({point,t,distance})=>({point,
      radial:a.radial.clone().lerp(b.radial,t).normalize(),station:a.station+(b.station-a.station)*t,
      clearance:distance-radius
    }));
  };
}
