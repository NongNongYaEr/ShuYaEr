// Follow a bark ridge from outside. An axis ray can miss its narrow wall
// when the radius changes abruptly between consecutive wrap samples.
export function createRouteDetour(surface,{radius,gap,attachmentLimit,certified}){
  function withinBarkReach(a,b,depth=0){
    const half=a.distanceTo(b)*.5,middle=a.clone().lerp(b,.5);
    const distance=surface.distance(middle,attachmentLimit+half);
    if(distance+half<attachmentLimit)return true;
    if(distance>=attachmentLimit||depth===7)return false;
    return withinBarkReach(a,middle,depth+1)&&withinBarkReach(middle,b,depth+1);
  }

  return (a,b)=>{
    const length=a.point.distanceTo(b.point);
    if(length<1e-7)return null;
    const probeHeight=Math.min(.07,length*.8);

    function sample(t){
      const radial=a.radial.clone().lerp(b.radial,t).normalize();
      if(!radial.lengthSq())return null;
      const base=a.point.clone().lerp(b.point,t);
      const origin=base.addScaledVector(radial,probeHeight);
      const hit=surface.ray(origin,radial.clone().negate(),probeHeight*2);
      if(!hit||hit.face.normal.dot(radial)<=.05)return null;

      for(const spacing of [1,1.5,2.5,4,6]){
        const offset=radius+gap*spacing;
        if(offset>hit.distance&&surface.ray(hit.position.clone().addScaledVector(radial,1e-6),radial,offset))return null;
        const point=hit.position.clone().addScaledVector(radial,offset);
        const distance=surface.distance(point,attachmentLimit);
        if(distance>=radius+.0002&&distance<attachmentLimit){
          return {point,radial,station:a.station+(b.station-a.station)*t,clearance:distance-radius};
        }
      }
      return null;
    }

    function follow(left,right,from,to,depth){
      if(certified(left.point,right.point)&&withinBarkReach(left.point,right.point))return [];
      if(depth===7)return null;
      const t=(from+to)*.5,middle=sample(t);
      if(!middle)return null;
      const first=follow(left,middle,from,t,depth+1);
      if(!first)return null;
      const second=follow(middle,right,t,to,depth+1);
      return second?[...first,middle,...second]:null;
    }
    return follow(a,b,0,1,0);
  };
}
