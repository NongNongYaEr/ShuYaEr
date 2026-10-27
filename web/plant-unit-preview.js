import {configureViewportNavigation,finishViewportNavigation,createViewportNavigationTicker} from './viewport-navigation.js';
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { bindGlbTextures } from './glb-export.js';
import { deserializeGeometry } from './branch-kernel.js';

export function createPlantUnitPreview(host,{cameraDirection=null}={}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1); renderer.setSize(480, 320); renderer.setClearColor('#17221e');
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x536147, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2.4); light.position.set(1, -1, 3); scene.add(light);
  const camera = new THREE.PerspectiveCamera(36, 1.5, .001, 100);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement), disposeNavigation=configureViewportNavigation(controls);
  controls.addEventListener('change',request);
  const navigationTicker=createViewportNavigationTicker(controls,request);
  let frame=0;
  function render(){frame=0;if(!disposed){navigationTicker.update();renderer.render(scene,camera);}}
  function request(){if(!disposed&&!frame)frame=requestAnimationFrame(render);}
  let material = null, mesh = null, currentPack = null, currentUnit = null, generation = 0, disposed = false, mode = 'material';
  function removeMesh() { if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh = null; } }
  function setUnit(unit) {
    finishViewportNavigation(controls);removeMesh();
    if (!unit || !material) { renderer.render(scene, camera); return; }
    material.color.set(unit.colorTint || '#ffffff');
    mesh = new THREE.Mesh(deserializeGeometry(unit.geometry), material); mesh.scale.setScalar(unit.size_m); scene.add(mesh);
    applyMode();
    const box = new THREE.Box3().setFromObject(mesh), center = box.getCenter(new THREE.Vector3()), radius = Math.max(.001, box.getBoundingSphere(new THREE.Sphere()).radius);
    controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(...(cameraDirection?.(unit)||[.3,-.55,1])).normalize().multiplyScalar(radius * 3.8));
    camera.near = radius / 100; camera.far = radius * 100; camera.updateProjectionMatrix(); controls.update(); renderer.render(scene, camera);
  }
  function disposeMaterial(value) { for(const texture of new Set([value?.map,value?.normalMap,value?.userData.colorMap,value?.userData.normalMap]))texture?.dispose();value?.dispose(); }
  function applyMode() { if(!material)return;material.wireframe=mode==='wireframe';material.map=mode==='material'?material.userData.colorMap:null;material.normalMap=mode==='material'?material.userData.normalMap:null;material.alphaTest=mode==='material'?currentPack?.material.cutoff||0:0;material.color.set(mode==='material'?currentUnit?.colorTint||'#ffffff':mode==='wireframe'?'#e2cf7b':'#d8dfd5');material.needsUpdate=true; }
  async function setPack(pack, token) {
    removeMesh(); disposeMaterial(material);
    material = null;
    const next = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: pack.material.roughness });
    try { await bindGlbTextures(next, pack.material); } catch(error) { disposeMaterial(next); throw error; }
    if(disposed||token!==generation){disposeMaterial(next);return false;}
    next.userData.colorMap=next.map;next.userData.normalMap=next.normalMap;material=next;currentPack=pack;return true;
  }
  function resize() { if(disposed)return;const width = Math.max(200, host.clientWidth), height = Math.max(180, host.clientHeight); renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.render(scene, camera); }
  const observer = new ResizeObserver(resize); observer.observe(host);
  return {
    async load(pack) {
      const token=++generation;if(!await setPack(pack,token))return new Map();const images = new Map();
      renderer.setSize(240, 160); camera.aspect = 1.5;
      for (const unit of pack.units) { currentUnit=unit;setUnit(unit); images.set(unit.id, renderer.domElement.toDataURL('image/png')); }
      currentUnit = pack.units[0]; resize(); setUnit(currentUnit); return images;
    },
    show(unit) { currentUnit = unit; setUnit(unit); },
    setMode(value) {mode=['material','solid','wireframe'].includes(value)?value:'material';applyMode();renderer.render(scene,camera);},
    reset() { if(!disposed)setUnit(currentUnit); },
    resize,
    get camera(){return camera;},get controls(){return controls;},
    get material() { return material; },
    get pack() { return currentPack; },
    dispose() { disposed=true;generation++;cancelAnimationFrame(frame);observer.disconnect();navigationTicker.dispose();disposeNavigation();controls.dispose();removeMesh();if(material){material.map=material.userData.colorMap;material.normalMap=material.userData.normalMap;}disposeMaterial(material);material=null;renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove(); },
  };
}
