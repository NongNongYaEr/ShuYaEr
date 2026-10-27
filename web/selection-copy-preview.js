import {markNativeModelChanged} from './native-model-changes.js';
import * as THREE from 'three';
import { applyRadialGeometry } from './sample-radial.js';

// Extract only selected triangles. Originals, materials and texture ownership stay intact.
export function createSelectionCopyPreview(asset, accepts) {
  asset.group.updateWorldMatrix(true,true);
  const group=new THREE.Group(),inverse=asset.group.matrixWorld.clone().invert();
  group.name='复制放置预览';
  function append(mesh,lookup=asset.lookupTexture,elements=asset.elements,prefix='',radius=1){
    const {width,height}=lookup;
    const geometry=mesh.geometry,uv=geometry?.attributes.uv1;
    if(!mesh.isMesh||!uv)return;
    const picked=i=>{const e=elements[Math.floor(uv.getX(i)*width)+Math.floor(uv.getY(i)*height)*width];return accepts(e&&prefix?{...e,id:prefix+e.id}:e);};
    const indices=[],groups=[],index=geometry.index,count=index?.count||uv.count;
    for(let i=0;i<count;i+=3){const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;if(picked(a)&&picked(b)&&picked(c)){
      const materialIndex=geometry.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex||0,last=groups.at(-1);
      if(last?.materialIndex===materialIndex)last.count+=3;else groups.push({start:indices.length,count:3,materialIndex});indices.push(a,b,c);
    }}
    if(!indices.length)return;
    const vertices=[...new Set(indices)],remap=new Map(vertices.map((v,i)=>[v,i])),clone=new THREE.BufferGeometry();
    for(const [name,a]of Object.entries(geometry.attributes)){
      if(a.isInstancedBufferAttribute)continue;
      const source=a.isInterleavedBufferAttribute?a.data.array:a.array,array=new source.constructor(vertices.length*a.itemSize);
      vertices.forEach((v,i)=>{for(let n=0;n<a.itemSize;n++)array[i*a.itemSize+n]=source[a.isInterleavedBufferAttribute?v*a.data.stride+a.offset+n:v*a.itemSize+n];});
      clone.setAttribute(name,new THREE.BufferAttribute(array,a.itemSize,a.normalized));
    }
    clone.setIndex(indices.map(i=>remap.get(i)));applyRadialGeometry(clone,radius);
    if(Array.isArray(mesh.material))for(const g of groups)clone.addGroup(g.start,g.count,g.materialIndex);
    const object=new THREE.Mesh(clone,mesh.material);object.matrixAutoUpdate=false;object.matrix.copy(inverse.clone().multiply(mesh.matrixWorld));object.frustumCulled=false;group.add(object);
  }
  asset.group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const bindings=asset.editPreviewBindings?.(mesh);
    if(bindings?.instances){for(const instance of bindings.instances)append(instance.object(),instance.lookup,instance.elements,instance.id+'.',instance.radius);}
    else if(!mesh.isInstancedMesh)append(mesh,bindings?.lookup||asset.lookupTexture);
  });
  asset.group.add(group);group.matrixAutoUpdate=false;markNativeModelChanged(asset);
  return {group,update(matrix){group.matrix.copy(matrix);group.matrixWorldNeedsUpdate=true;markNativeModelChanged(asset);},restore(){group.removeFromParent();for(const mesh of group.children)mesh.geometry.dispose();markNativeModelChanged(asset);},dispose(){this.restore();}};
}
