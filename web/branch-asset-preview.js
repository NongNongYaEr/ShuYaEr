import {configureViewportNavigation,finishViewportNavigation,createViewportNavigationTicker} from './viewport-navigation.js';
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {buildBranchAssetAsync,deserializeGeometry,disposeBranchAsset} from './branch-kernel.js';
import {bindGlbTextures} from './glb-export.js';
import {syncLeafMaterialVariants} from './leaf-material-data.js';

// Every preview owns its build, camera and renderer. Never borrow the live tree.
export function createBranchAssetPreview(host){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor('#17221e');host.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.001,1000);camera.up.set(0,0,1);
  scene.add(new THREE.HemisphereLight(0xf1f6ff,0x403d2b,2));
  const light=new THREE.DirectionalLight(0xfff2dc,2.7);light.position.set(2,-3,5);scene.add(light);
  const fill=new THREE.DirectionalLight(0xc9dfff,.8);fill.position.set(-3,2,1);scene.add(fill);
  const controls=new OrbitControls(camera,renderer.domElement),disposeNavigation=configureViewportNavigation(controls);
  let asset=null,sources=[],disposed=false,mode='material',frame=0,direction=[.45,-1,.4],lastWidth=0,lastHeight=0;
  const originals=new Map();
  function render(){frame=0;if(!disposed&&asset){navigationTicker.update();renderer.render(scene,camera);}}
  function request(){if(!disposed&&!frame)frame=requestAnimationFrame(render);}
  controls.addEventListener('change',request);
  const navigationTicker=createViewportNavigationTicker(controls,request);
  function resize(){if(disposed||!host.clientWidth||!host.clientHeight)return;const width=Math.max(180,host.clientWidth),height=Math.max(160,host.clientHeight),changed=lastWidth&&Math.abs(width/height-lastWidth/lastHeight)>.01;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();if(asset&&changed)fit(camera.position.clone().sub(controls.target).toArray());lastWidth=width;lastHeight=height;request();}
  const observer=new ResizeObserver(resize);observer.observe(host);
  function fit(next=direction){
    if(!asset)return;finishViewportNavigation(controls);direction=next;asset.group.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(asset.group);
    if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),radius=Math.max(.001,box.getBoundingSphere(new THREE.Sphere()).radius);
    const axis=new THREE.Vector3(...direction).normalize();camera.position.copy(center).add(axis);camera.lookAt(center);
    const inverse=camera.quaternion.clone().invert(),tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;
    let distance=radius*.2;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const point=new THREE.Vector3(x,y,z).sub(center).applyQuaternion(inverse);distance=Math.max(distance,point.z+Math.max(Math.abs(point.x)/tanH,Math.abs(point.y)/tanV));}
    controls.target.copy(center);camera.position.copy(center).addScaledVector(axis,distance*1.12);
    camera.near=radius/1000;camera.far=radius*1000;controls.minDistance=radius*.05;controls.maxDistance=radius*30;camera.updateProjectionMatrix();controls.update();request();
  }
  function setMode(value){
    mode=['material','solid','wireframe'].includes(value)?value:'material';
    for(const [material,original] of originals){
      material.map=mode==='material'?original.map:null;material.normalMap=mode==='material'?original.normalMap:null;
      material.roughnessMap=mode==='material'?original.roughnessMap:null;material.alphaTest=mode==='material'?original.alphaTest:0;
      material.wireframe=mode==='wireframe'||mode==='material'&&original.wireframe;
      material.color?.copy(mode==='material'?original.color:new THREE.Color(mode==='wireframe'?'#e4cd7f':'#dce2d9'));material.needsUpdate=true;
    }
    request();
  }
  function restoreMaterials(){for(const [material,original] of originals){Object.assign(material,{map:original.map,normalMap:original.normalMap,roughnessMap:original.roughnessMap,alphaTest:original.alphaTest,wireframe:original.wireframe});if(original.color)material.color.copy(original.color);}originals.clear();}
  return {
    async load(document){
      let built=null;
      try{
        sources=(document.leaf_meshes||[]).map(source=>({...source,geometry:deserializeGeometry(source.geometry)}));
        built=await buildBranchAssetAsync({...document.settings,wind_strength:0,preview_lod:0},null,sources,0,document.authoring,{instanced:true},{shouldAbort:()=>disposed});
        await bindGlbTextures(built.materials.leaf,document.authoring.leaf_material);
        const jobs=[...syncLeafMaterialVariants(built,bindGlbTextures)];
        for(const material of built.vegetation?.materials||[])if(material.vegetationTexture)jobs.push(bindGlbTextures(material,material.vegetationTexture));
        if(built.materials.flower&&document.authoring.flowering?.enabled)jobs.push(bindGlbTextures(built.materials.flower,document.authoring.flowering.material));
        const results=await Promise.allSettled(jobs);if(disposed){const error=new Error('检视已关闭');error.name='AbortError';throw error;}
        const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
        built.group.traverse(object=>{if(object.userData.category==='marker')object.visible=false;if(!object.isMesh)return;for(const material of Array.isArray(object.material)?object.material:[object.material])if(material&&!originals.has(material))originals.set(material,{map:material.map,normalMap:material.normalMap,roughnessMap:material.roughnessMap,alphaTest:material.alphaTest,wireframe:material.wireframe,color:material.color?.clone()});});
        asset=built;scene.add(asset.group);resize();fit();setMode(mode);render();
        return {size:new THREE.Box3().setFromObject(asset.group).getSize(new THREE.Vector3()).toArray(),triangles:asset.report.triangles,branches:asset.masterBranches.length,leaves:asset.placements.length,organs:asset.treeOrgans?.length||0,warnings:[...(asset.report.warnings||[])]};
      }catch(error){if(built)disposeBranchAsset(built);sources.forEach(source=>source.geometry.dispose());sources=[];throw error;}
    },
    setMode,reset:()=>fit([.45,-1,.4]),view:value=>fit({front:[0,-1,.05],side:[1,0,.05],top:[.001,0,1]}[value]||[.45,-1,.4]),
    resize,
    get asset(){return asset;},get camera(){return camera;},get controls(){return controls;},get mode(){return mode;},
    get materials(){return [...originals].map(([material,original])=>({material,...original}));},
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();navigationTicker.dispose();disposeNavigation();controls.dispose();restoreMaterials();if(asset){scene.remove(asset.group);disposeBranchAsset(asset);asset=null;}sources.forEach(source=>source.geometry.dispose());sources=[];renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();},
  };
}

export function branchTextureCanvas(texture){
  const image=texture?.image;if(!image)return null;const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
  if(!width||!height)return null;const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  if(image.data){if(image.data.length!==width*height*4||!(image.data instanceof Uint8Array||image.data instanceof Uint8ClampedArray))return null;const pixels=ctx.createImageData(width,height);pixels.data.set(image.data);ctx.putImageData(pixels,0,0);}
  else ctx.drawImage(image,0,0);return canvas;
}
