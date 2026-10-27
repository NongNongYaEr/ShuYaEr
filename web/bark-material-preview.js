import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {createBarkPreviewSample} from './bark-preview-sample.js';
import {createBarkSurfaceMaterial} from './bark-materials.js';

// Render only when the recipe, view or camera changes. Nothing in this small
// preview writes to the live scene, source models or authoring document.
export function createBarkMaterialPreview(canvas){
  let renderer,scene,camera,controls,mesh,context=null,displayContext=null,recipe=null,active=false,frame=0,mode='CURVED',revision=0,grid=false;
  function render(){frame=0;if(!active||!renderer||!mesh)return;const width=Math.max(220,canvas.clientWidth),height=Math.max(180,canvas.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.render(scene,camera);canvas.dataset.revision=String(++revision);}
  const request=()=>{if(active&&!frame)frame=requestAnimationFrame(render);};
  function initialize(){
    if(renderer)return;
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
    scene=new THREE.Scene();scene.background=new THREE.Color('#18221e');camera=new THREE.PerspectiveCamera(38,1,.001,10000);camera.up.set(0,0,1);
    scene.add(new THREE.HemisphereLight(0xe9f2ff,0x3d3525,2));const key=new THREE.DirectionalLight(0xffefdd,3);key.position.set(3,-4,5);scene.add(key);const fill=new THREE.DirectionalLight(0xc6ddff,1);fill.position.set(-3,1,2);scene.add(fill);
    controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.addEventListener('change',request);
  }
  function clearMaterial(){if(!mesh?.material)return;for(const key of ['map','normalMap','roughnessMap'])mesh.material[key]?.dispose();mesh.material.dispose();}
  function material(){if(!mesh||!recipe)return;clearMaterial();mesh.material=createBarkSurfaceMaterial(recipe,{branch:displayContext?.branch||{startRadius:.48},settings:displayContext?.settings||{},continuousBark:!!mesh.geometry.userData.barkSurface,referencePerimeter:mesh.geometry.userData.barkSurface?.referencePerimeter});
    if(grid){const pixels=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const color=x===0?[230,89,75]:y===0?[101,203,139]:(Math.floor(x/16)+Math.floor(y/16))%2?[57,98,131]:[214,224,230];pixels.set([...color,255],(y*64+x)*4);}
      const map=new THREE.DataTexture(pixels,64,64,THREE.RGBAFormat),original=mesh.material.map;map.repeat.copy(original.repeat);map.offset.copy(original.offset);map.center.copy(original.center);map.rotation=original.rotation;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());map.needsUpdate=true;clearMaterial();mesh.material=new THREE.MeshBasicMaterial({map});}
    canvas.dataset.uvGrid=String(grid);request();}
  function rebuild(){
    if(!active)return;initialize();if(mesh){clearMaterial();mesh.geometry.dispose();scene.remove(mesh);}
    let geometry;
    if(mode==='ACTUAL'&&context?.geometry){geometry=context.geometry.clone();displayContext=context;}
    else{displayContext=createBarkPreviewSample();geometry=displayContext.geometry;}
    geometry.computeBoundingBox();const center=geometry.boundingBox.getCenter(new THREE.Vector3()),size=geometry.boundingBox.getSize(new THREE.Vector3()).length();geometry.translate(-center.x,-center.y,-center.z);
    mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());scene.add(mesh);material();controls.target.set(0,0,0);camera.position.set(size*.28,-size*1.65,size*.15);camera.near=Math.max(.0001,size/10000);camera.far=Math.max(10,size*20);camera.updateProjectionMatrix();controls.minDistance=size*.06;controls.maxDistance=size*8;controls.update();canvas.dataset.mode=mode;request();
  }
  const resize=new ResizeObserver(request);resize.observe(canvas);
  return {
    open(next,raw){context=next;recipe=raw;active=true;rebuild();},
    update(raw){recipe=raw;if(active)material();},
    setMode(next){mode=next==='ACTUAL'?'ACTUAL':'CURVED';rebuild();},
    setGrid(value){grid=!!value;if(active)material();},
    close(){active=false;grid=false;delete canvas.dataset.uvGrid;cancelAnimationFrame(frame);frame=0;if(mesh){clearMaterial();mesh.geometry.dispose();scene.remove(mesh);mesh=null;}context=null;displayContext=null;},
    get debug(){return{active,mode,revision,mesh,camera,grid};},
  };
}
