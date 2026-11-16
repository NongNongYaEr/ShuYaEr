import {configureViewportNavigation,finishViewportNavigation,createViewportNavigationTicker} from './viewport-navigation.js';
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { bindGlbTextures } from './glb-export.js';
import { deserializeGeometry } from './branch-kernel.js';

const geometryKeys = ['position', 'normal', 'uv', 'index'];
const sameValues = (a, b) => a === b || Boolean(a && b && a.length === b.length && a.every((value, index) => value === b[index]));
function sameThumbnailSource(a, b) {
  return a && a.size_m === b.size_m && a.colorTint === b.colorTint && a.role === b.role
    && geometryKeys.every(key => sameValues(a.geometry[key], b.geometry[key]));
}
function snapshotThumbnailSource(unit) {
  const geometry = Object.fromEntries(geometryKeys.map(key => [key, unit.geometry[key]?.slice() ?? unit.geometry[key]]));
  return {geometry, size_m:unit.size_m, colorTint:unit.colorTint, role:unit.role};
}
const sameAtlas = (a, b) => a?.color === b.color && a?.normal === b.normal;
const sameThumbnailMaterial = (a, b) => sameAtlas(a, b) && a.cutoff === b.cutoff && a.roughness === b.roughness;

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
  let loadedAtlas = null, previousThumbnails = null;
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
    if (!material || !sameAtlas(loadedAtlas, pack.material)) {
      const next = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: pack.material.roughness });
      try { await bindGlbTextures(next, pack.material); } catch(error) { disposeMaterial(next); throw error; }
      if (disposed || token !== generation) { disposeMaterial(next); return false; }
      removeMesh();
      disposeMaterial(material);
      next.userData.colorMap = next.map;
      next.userData.normalMap = next.normalMap;
      material = next;
      loadedAtlas = {color:pack.material.color, normal:pack.material.normal};
    }
    material.roughness = pack.material.roughness;
    currentPack = pack;
    return true;
  }
  function resize() { if(disposed)return;const width = Math.max(200, host.clientWidth), height = Math.max(180, host.clientHeight); renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.render(scene, camera); }
  const observer = new ResizeObserver(()=>{if(host.clientWidth&&host.clientHeight)resize();}); observer.observe(host);
  return {
    async load(pack, {yieldThumbnails = false, regenerateThumbnails = false} = {}) {
      const token = ++generation;
      if (!await setPack(pack,token) || disposed || token !== generation) return new Map();
      const images = new Map(), sources = new Map(), materialSnapshot = {...pack.material}, thumbnailMode = mode;
      const prior = !regenerateThumbnails && previousThumbnails?.mode === thumbnailMode
        && sameThumbnailMaterial(previousThumbnails.material, materialSnapshot) ? previousThumbnails : null;
      const assets = [...pack.units, ...(pack.base_branches || [])];
      let started = performance.now(), thumbnailSize = false;
      for (const unit of assets) {
        const previousSource = prior?.sources.get(unit.id);
        if (sameThumbnailSource(previousSource, unit)) {
          sources.set(unit.id, previousSource);
          images.set(unit.id, prior.images.get(unit.id));
          continue;
        }
        if (yieldThumbnails && performance.now() - started >= 8) {
          await new Promise(resolve => setTimeout(resolve, 0));
          if (disposed || token !== generation) return new Map();
          started = performance.now();
          thumbnailSize = false;
        }
        if (!thumbnailSize) {
          renderer.setSize(240, 160);
          camera.aspect = 1.5;
          thumbnailSize = true;
        }
        currentUnit = unit;
        setUnit(unit);
        images.set(unit.id, renderer.domElement.toDataURL('image/png'));
        sources.set(unit.id, snapshotThumbnailSource(unit));
      }
      previousThumbnails = mode === thumbnailMode ? {material:materialSnapshot, mode:thumbnailMode, sources, images} : null;
      currentUnit = assets[0]; resize(); setUnit(currentUnit);
      return images;
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
