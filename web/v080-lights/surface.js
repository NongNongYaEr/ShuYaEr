// Read-only queries over the same calibrated triangle positions used by the
// imported trunk guide analyser. Face identifiers refer to the source primitive.
export function trunkSurfaceIndex(THREE,input){
  const faces=[];
  const matrix=new THREE.Matrix4().fromArray(input.matrix);
  for(const [primitive,p] of input.primitives.entries()){
    const points=Array.from({length:p.position.length/3},(_,i)=>
      new THREE.Vector3().fromArray(p.position,i*3).applyMatrix4(matrix));
    for(let i=0;i<p.index.length;i+=3){
      const a=points[p.index[i]],b=points[p.index[i+1]],c=points[p.index[i+2]];
      const triangle=new THREE.Triangle(a,b,c);
      const normal=triangle.getNormal(new THREE.Vector3());
      if(normal.lengthSq()<.5)continue;
      faces.push({triangle,normal,primitive,face:i/3,
        box:new THREE.Box3().setFromPoints([a,b,c]),center:triangle.getMidpoint(new THREE.Vector3())});
    }
  }
  function build(list){
    const box=new THREE.Box3();
    for(const face of list)box.union(face.box);
    if(list.length<=10)return {box,faces:list};
    const {x,y,z}=box.getSize(new THREE.Vector3());
    const key=x>=y&&x>=z?'x':y>=z?'y':'z';
    list.sort((a,b)=>a.center[key]-b.center[key]);
    const half=list.length>>1;
    return {box,left:build(list.slice(0,half)),right:build(list.slice(half))};
  }
  if(!faces.length)throw Error('No source bark faces');
  const tree=build(faces);
  const point=new THREE.Vector3(),intersection=new THREE.Vector3();
  return {
    ray(origin,direction,limit){
      const ray=new THREE.Ray(origin,direction);
      let best=null,bestDistance=limit;
      function visit(node){
        if(!node.box.containsPoint(origin)&&
          (!ray.intersectBox(node.box,intersection)||intersection.distanceTo(origin)>=bestDistance))return;
        if(node.left){visit(node.left);visit(node.right);return;}
        for(const face of node.faces){
          const {a,b,c}=face.triangle;
          if(!ray.intersectTriangle(a,b,c,false,intersection))continue;
          const distance=intersection.distanceTo(origin);
          if(distance>1e-7&&distance<bestDistance){
            bestDistance=distance;
            best={face,position:intersection.clone(),distance};
          }
        }
      }
      visit(tree);
      return best;
    },
    closest(location,limit){
      let best=null,closest=limit;
      const position=new THREE.Vector3();
      function visit(node){
        if(node.box.distanceToPoint(location)>=closest)return;
        if(node.left){visit(node.left);visit(node.right);return;}
        for(const face of node.faces){
          if(face.box.distanceToPoint(location)>=closest)continue;
          face.triangle.closestPointToPoint(location,point);
          const distance=point.distanceTo(location);
          if(distance>=closest)continue;
          closest=distance;best=face;position.copy(point);
        }
      }
      visit(tree);
      return best?{face:best,position,distance:closest}:null;
    },
    distance(location,limit){
      let closest=limit;
      function visit(node){
        if(node.box.distanceToPoint(location)>=closest)return;
        if(node.left){visit(node.left);visit(node.right);return;}
        for(const {triangle,box} of node.faces){
          if(box.distanceToPoint(location)>=closest)continue;
          triangle.closestPointToPoint(location,point);
          closest=Math.min(closest,point.distanceTo(location));
        }
      }
      visit(tree);
      return closest;
    },
  };
}
