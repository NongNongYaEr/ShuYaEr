import * as THREE from 'three';
import {composeMeshUnitPose,meshUnitMountMatrix} from './mesh-unit-data.js';

const footprints=new WeakMap();

export function meshUnitBrushFootprint(source,box){
  const center=box.getCenter(new THREE.Vector3());
  const pivot=new THREE.Vector3(...source.connector.position),direction=new THREE.Vector3(...source.connector.direction).normalize();
  const size=box.getSize(new THREE.Vector3());
  const reach=center.clone().sub(pivot).dot(direction)+size.dot(new THREE.Vector3(Math.abs(direction.x),Math.abs(direction.y),Math.abs(direction.z)))/2;
  const axis=[pivot,pivot.clone().addScaledVector(direction,Math.max(.001,reach))];
  // Use the model envelope as the brush footprint. A large leaf or fruit can be
  // brushed across its body even if the actual attachment lies well outside it.
  const lines=[axis,[pivot,center]];
  for(const component of ['x','y','z'])if(size[component]>1e-5){
    const from=center.clone(),to=center.clone();
    from[component]=box.min[component];to[component]=box.max[component];
    lines.push([from,to]);
  }
  return lines;
}

function brushFootprint(source,model){
  const previous=footprints.get(model);
  if(previous)return previous;
  const lines=meshUnitBrushFootprint(source,new THREE.Box3().setFromObject(model));
  footprints.set(model,lines);
  return lines;
}

export function meshUnitBrushFrame(source,matrix){
  return {matrix,position:new THREE.Vector3(...source.connector.position).applyMatrix4(matrix),
    direction:new THREE.Vector3(...source.connector.direction).transformDirection(matrix)};
}

export function meshUnitLocalAxis(source,model){
  return brushFootprint(source,model)[0];
}

export function meshUnitBrushEntry({instance,source,parent,matrix},model,asset,authoring){
  const lines=brushFootprint(source,model),mount=meshUnitMountMatrix(instance,source,parent,asset,authoring);
  const basis=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(mount)),inverse=basis.clone().invert();
  const frame=meshUnitBrushFrame(source,matrix);
  const sampleLines=lines.map(line=>line.map(point=>point.clone().applyMatrix4(matrix)));
  return {id:instance.id,instance,shape:source,frame,longAxis:frame.direction.clone(),sampleLines,displayLines:[sampleLines[0]],
    evaluatePlacement(next){return meshUnitBrushFrame(source,composeMeshUnitPose(next,source,mount));},
    rotatePlacement(next,rotation){
      const orientation=inverse.clone().multiply(rotation).multiply(basis).multiply(new THREE.Quaternion(...next.rotation)).normalize();
      return {...next,rotation:orientation.toArray()};
    },
  };
}
