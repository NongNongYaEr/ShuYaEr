import * as THREE from 'three';

const boxes=new WeakMap();

// Project the oriented model bounds, including edges clipped by the camera's
// near/far planes so close-ups remain selectable from the visible model body.
export function meshUnitScreenBounds(model,clipMatrix,{width,height}){
  let box=boxes.get(model);
  if(!box){box=new THREE.Box3().setFromObject(model);boxes.set(model,box);}
  if(box.isEmpty())return null;
  const corners=Array.from({length:8},(_,index)=>new THREE.Vector4(
    (index&1?box.max:box.min).x,(index&2?box.max:box.min).y,(index&4?box.max:box.min).z,1).applyMatrix4(clipMatrix));
  const min=new THREE.Vector2(Infinity,Infinity),max=new THREE.Vector2(-Infinity,-Infinity);
  function include(point){
    if(point.w<=0)return;
    const x=(point.x/point.w+1)*width/2,y=(1-point.y/point.w)*height/2;
    min.x=Math.min(min.x,x);min.y=Math.min(min.y,y);max.x=Math.max(max.x,x);max.y=Math.max(max.y,y);
  }
  for(let index=0;index<8;index++){
    const a=corners[index];
    if(a.z>=-a.w&&a.z<=a.w)include(a);
    for(const axis of [1,2,4])if(!(index&axis)){
      const b=corners[index|axis];
      for(const sign of [-1,1]){
        const from=a.w+sign*a.z,to=b.w+sign*b.z;
        if((from<0)!==(to<0))include(a.clone().lerp(b,from/(from-to)));
      }
    }
  }
  if(min.x>width||min.y>height||max.x<0||max.y<0)return null;
  return {left:Math.max(0,min.x),top:Math.max(0,min.y),right:Math.min(width,max.x),bottom:Math.min(height,max.y)};
}

export function meshUnitsInBox(items,polygon){
  const left=Math.min(polygon[0][0],polygon[2][0]),right=Math.max(polygon[0][0],polygon[2][0]);
  const top=Math.min(polygon[0][1],polygon[2][1]),bottom=Math.max(polygon[0][1],polygon[2][1]);
  return new Set(items.filter(({bounds})=>bounds.left<=right&&bounds.right>=left&&bounds.top<=bottom&&bounds.bottom>=top).map(({id})=>id));
}
