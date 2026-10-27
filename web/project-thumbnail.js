import * as THREE from 'three';

export const PROJECT_THUMBNAIL_VERSION = 'project-preview-v2';

// Borrow only the plant for this synchronous render; never photograph the editor canvas.
export function renderPlantThumbnail(group, renderer, width=400, height=300) {
  if (!group) return '';
  const parent=group.parent,index=parent?.children.indexOf(group),visible=group.visible;
  const previous=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4());
  const scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear,xr=renderer.xr.enabled;
  const rw=width*2,rh=height*2;
  const target=new THREE.WebGLRenderTarget(rw,rh);target.texture.colorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#17221e');
  try {
    scene.add(group);group.visible=true;group.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(group);if(box.isEmpty())return '';
    scene.add(new THREE.HemisphereLight(0xf1f5e9,0x697461,2.5));
    const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,-3,5);scene.add(light);
    const sphere=box.getBoundingSphere(new THREE.Sphere()),radius=Math.max(.01,sphere.radius),aspect=width/height;
    const camera=new THREE.OrthographicCamera(-1,1,1,-1,.001,radius*10);
    camera.up.set(0,0,1);camera.position.copy(sphere.center).addScaledVector(new THREE.Vector3(1,-2,1.1).normalize(),radius*3);camera.lookAt(sphere.center);camera.updateMatrixWorld(true);
    const projected=new THREE.Box3();for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
    const center=projected.getCenter(new THREE.Vector3()),size=projected.getSize(new THREE.Vector3());
    const half=Math.max(size.y/2,size.x/(2*aspect),.01)*1.08;
    camera.left=center.x-half*aspect;camera.right=center.x+half*aspect;camera.top=center.y+half;camera.bottom=center.y-half;camera.updateProjectionMatrix();
    renderer.xr.enabled=false;renderer.autoClear=true;renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setViewport(0,0,rw,rh);
    renderer.render(scene,camera);const pixels=new Uint8Array(rw*rh*4);renderer.readRenderTargetPixels(target,0,0,rw,rh,pixels);
    // Trim conservative 3D bounds against the rendered silhouette, with breathing room.
    // This also works for instanced crowns whose shared mesh bounds are much larger.
    let minX=rw,minY=rh,maxX=-1,maxY=-1;
    for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){const i=(y*rw+x)*4;if(Math.max(Math.abs(pixels[i]-pixels[0]),Math.abs(pixels[i+1]-pixels[1]),Math.abs(pixels[i+2]-pixels[2]))>10){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
    if(maxX<0)return '';
    const source=document.createElement('canvas');source.width=rw;source.height=rh;const ctx=source.getContext('2d'),data=ctx.createImageData(rw,rh);
    for(let y=0;y<rh;y++)data.data.set(pixels.subarray((rh-1-y)*rw*4,(rh-y)*rw*4),y*rw*4);ctx.putImageData(data,0,0);
    const cropHeight=Math.max(maxY-minY+1,(maxX-minX+1)/aspect)*1.14,cropWidth=cropHeight*aspect;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const output=canvas.getContext('2d');output.fillStyle=`rgb(${pixels[0]},${pixels[1]},${pixels[2]})`;output.fillRect(0,0,width,height);output.imageSmoothingQuality='high';
    output.drawImage(source,(minX+maxX+1-cropWidth)/2,rh-(minY+maxY+1+cropHeight)/2,cropWidth,cropHeight,0,0,width,height);
    return canvas.toDataURL('image/jpeg',.88);
  } finally {
    scene.remove(group);if(parent){parent.add(group);parent.children.splice(parent.children.indexOf(group),1);parent.children.splice(index,0,group);}group.visible=visible;group.updateMatrixWorld(true);
    renderer.setRenderTarget(previous);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear;renderer.xr.enabled=xr;target.dispose();
  }
}
