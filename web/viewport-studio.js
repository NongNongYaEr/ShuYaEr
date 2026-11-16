import {Box3, CanvasTexture, Color, Fog, MathUtils, MeshStandardMaterial, PCFShadowMap, Sphere, SRGBColorSpace, Vector3} from 'three';
import {OrbitControls} from '/vendor/OrbitControls.js';
import {configureViewportNavigation,finishViewportNavigation} from './viewport-navigation.js';
import {STUDIO_ENVIRONMENTS} from './viewport-lighting.js';
import {createStudioControls} from './viewport-studio-controls.js';

function paintStudioFloor(map,showGrid,{potBounds,floorWidth,floorZ}) {
  const {width:size} = map.image, center = size / 2;
  const ctx = map.image.getContext('2d');
  ctx.clearRect(0,0,size,size);
  if (showGrid) {
    ctx.fillStyle = '#827e78';
    for (let line = 0; line < size; line += 20) {
      ctx.fillRect(line,0,1.4,size);
      ctx.fillRect(0,line,size,1.4);
    }
    const fade = ctx.createRadialGradient(center,center,36,center,center,175);
    fade.addColorStop(0,'rgba(0,0,0,.50)');
    fade.addColorStop(1,'transparent');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = fade;
    ctx.fillRect(0,0,size,size);
  }
  const matte = ctx.createRadialGradient(center,center,16,center,center,490);
  matte.addColorStop(0,'#a29d97');
  matte.addColorStop(.55,'#99958f');
  matte.addColorStop(1,'#8e8983');
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = matte;
  ctx.fillRect(0,0,size,size);
  ctx.globalCompositeOperation = 'source-over';
  if (potBounds) {
    const foot = potBounds.getSize(new Vector3());
    const separation = Math.max(0,potBounds.min.z-floorZ);
    const opacity = .68 * (1-MathUtils.clamp(separation / Math.max(.001,foot.z*.16),0,1));
    if (opacity > 0) {
      ctx.save();
      ctx.translate(center,center);
      ctx.scale(Math.max(2,foot.x*.68*size/floorWidth),Math.max(2,foot.y*.68*size/floorWidth));
      const contact = ctx.createRadialGradient(0,0,0,0,0,1);
      contact.addColorStop(0,`rgba(45,38,32,${opacity})`);
      contact.addColorStop(.46,`rgba(45,38,32,${opacity*.78})`);
      contact.addColorStop(1,'transparent');
      ctx.fillStyle = contact;
      ctx.fillRect(-1,-1,2,2);
      ctx.restore();
    }
  }
  map.needsUpdate = true;
}

function fitStudioShadow(light,{center,radius}) {
  const distance = Math.max(5,radius * 4);
  const target = light.target.position.clone();
  const shadow = light.shadow.camera;
  const {left,right,top,bottom,near,far} = shadow;
  const radiusBefore = light.shadow.radius;
  light.target.position.copy(center);
  light.target.updateMatrixWorld();
  const halfWidth = radius * 1.12;
  Object.assign(shadow,{left:-halfWidth,right:halfWidth,top:halfWidth,bottom:-halfWidth,
    near:Math.max(.05,distance - radius * 1.2),far:distance + radius * 4});
  light.shadow.radius = 3;
  shadow.updateProjectionMatrix();
  return {
    place() { light.position.sub(center).setLength(distance).add(center); },
    restore() {
      light.target.position.copy(target);
      light.target.updateMatrixWorld();
      Object.assign(shadow,{left,right,top,bottom,near,far});
      shadow.updateProjectionMatrix();
      light.shadow.radius = radiusBefore;
    },
  };
}

function composeStudioView(camera,orbit,bounds,{center,radius},horizontalFrame) {
  const direction = camera.position.clone().sub(orbit.target);
  if (direction.lengthSq() < 1e-6) direction.set(.82,-1,.55);
  direction.normalize();
  camera.position.copy(center).addScaledVector(direction,radius);
  camera.lookAt(center);
  const inverse = camera.quaternion.clone().invert(), corner = new Vector3();
  const vertical = Math.tan(MathUtils.degToRad(camera.fov * .5));
  let distance = radius;
  for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) {
    for (const z of [bounds.min.z,bounds.max.z]) {
      corner.set(x,y,z).sub(center).applyQuaternion(inverse);
      distance = Math.max(distance,corner.z + Math.max(Math.abs(corner.y)/(vertical*.72),
        Math.abs(corner.x)/(vertical*camera.aspect*horizontalFrame)));
    }
  }
  orbit.target.copy(center);
  orbit.minDistance = Math.max(radius * .04,.05);
  orbit.maxDistance = Math.max(radius * 18,20);
  camera.position.copy(center).addScaledVector(direction,distance);
  camera.near = Math.max(.005,distance / 1000);
  camera.far = Math.max(100,distance * 20);
  camera.updateProjectionMatrix();
  orbit.update();
}

export function createViewportStudio({canvas,scene,renderer,camera,controls,modelRoot,ground,keyLight,subject,canOpen,resize,setLights,onChange}) {
  const viewport = canvas.parentElement;
  const navigationSurface = document.createElement('div');
  navigationSurface.className = 'photo-studio-navigation';
  navigationSurface.tabIndex = 0;
  navigationSurface.setAttribute('role','region');
  navigationSurface.setAttribute('aria-label','摄影棚展示。使用当前视口导航，H 切换纯画面，Esc 退出。');
  const wash = document.createElement('div');
  wash.className = 'photo-studio-wash';
  wash.setAttribute('aria-hidden','true');
  const exitArea = document.createElement('div');
  exitArea.className = 'photo-studio-exit';
  exitArea.innerHTML = '<button type="button" data-studio="show-panel">返回调光 · H</button><button type="button" data-studio="exit-preview">退出 · Esc</button>';
  viewport.append(wash,navigationSurface,exitArea);
  const studioControls = createStudioControls(viewport,{
    onChange:applyEnvironment,onPreview:()=>showPreview(true),onFit:fit,onClose:close,
  });

  // DX12 tone maps the clear color. WebGL displays the solid scene background directly.
  const backdrop = new Color(.74,.712,.674);
  const previousClear = new Color();
  const fog = new Fog(0xe2dfdb,10,40);
  const floorTile = document.createElement('canvas');
  floorTile.width = floorTile.height = 1024;
  const floorMap = new CanvasTexture(floorTile);
  floorMap.colorSpace = SRGBColorSpace;
  floorMap.anisotropy = 8;
  const floor = new MeshStandardMaterial({map:floorMap,roughness:1,emissive:0xffffff,emissiveIntensity:.21});
  const previousScale = ground.scale.clone();
  const previousGroundPosition = ground.position.clone();
  let session = null, hintTimer;

  function applyEnvironment(settings) {
    if (!session) return;
    const environment = STUDIO_ENVIRONMENTS[settings.preset];
    setLights(settings);
    session.shadow.place();
    fog.studioShadowRadius = environment.shadow * settings.softness / 100;
    keyLight.shadow.radius = Math.max(1,fog.studioShadowRadius / 7);
    backdrop.setRGB(...environment.nativeBackdrop);
    fog.color.setHex(environment.backdrop);
    floor.color.setHex(environment.floor);
    viewport.dataset.studioEnvironment = settings.preset;
    if (session.showGrid !== settings.grid) {
      paintStudioFloor(floorMap,settings.grid,session);
      session.showGrid = settings.grid;
    }
  }

  function fit() {
    if (!session) return;
    resize();
    const panelWidth = studioControls.panel.offsetWidth;
    const available = 1 - (panelWidth * 2 + 46) / canvas.clientWidth;
    composeStudioView(camera,session.orbit,session.bounds,session.sphere,
      MathUtils.clamp(available,.46,.84));
  }

  function showPreview(active) {
    if (!session) return;
    studioControls.panel.hidden = active;
    viewport.classList.toggle('photo-studio-clean',active);
    navigationSurface.focus({preventScroll:true});
    clearTimeout(hintTimer);
    exitArea.classList.toggle('show-hint',active);
    if (active) hintTimer = setTimeout(() => exitArea.classList.remove('show-hint'),1900);
  }

  function open() {
    if (session || !canOpen()) return false;
    finishViewportNavigation(controls);
    const position = camera.position.clone(), quaternion = camera.quaternion.clone();
    const {near,far} = camera;
    const orbit = new OrbitControls(camera,navigationSurface);
    const disconnectNavigation = configureViewportNavigation(orbit,{plainOrbit:true});
    orbit.enableDamping = false;
    orbit.target.copy(controls.target);
    const scrollPositions = [];
    for (let element = viewport; element; element = element.parentElement) {
      if (element.scrollLeft || element.scrollTop) scrollPositions.push([element,element.scrollLeft,element.scrollTop]);
    }
    session = {orbit,disconnectNavigation,position,quaternion,near,far,scrollPositions,shadowType:renderer.shadowMap.type};
    renderer.shadowMap.type = PCFShadowMap;
    document.body.classList.add('photo-studio-active');
    onChange();
    const {tree,attachmentBounds,potBounds} = subject(true), bounds = new Box3().setFromObject(tree);
    if (attachmentBounds) bounds.union(attachmentBounds);
    if (potBounds) bounds.union(potBounds);
    if (bounds.isEmpty()) bounds.expandByPoint(new Vector3());
    const sphere = bounds.getBoundingSphere(new Sphere());
    sphere.radius = Math.max(sphere.radius,.25);
    session.bounds = bounds;
    session.sphere = sphere;
    session.potBounds = potBounds;
    session.floorZ = ground.position.z;
    session.floorCenter = (potBounds && !potBounds.isEmpty() ? potBounds : bounds).getCenter(new Vector3());
    session.floorWidth = sphere.radius * 17;
    session.floorScale = session.floorWidth / ground.geometry.parameters.width;
    session.shadow = fitStudioShadow(keyLight,sphere);
    applyEnvironment(studioControls.settings);
    showPreview(false);
    fit();
    return true;
  }

  function close() {
    if (!session) return;
    const {orbit,disconnectNavigation,position,quaternion,near,far,scrollPositions,shadow,shadowType} = session;
    session = null;
    clearTimeout(hintTimer);
    exitArea.classList.remove('show-hint');
    studioControls.panel.hidden = true;
    viewport.classList.remove('photo-studio-clean');
    delete viewport.dataset.studioEnvironment;
    disconnectNavigation();
    orbit.dispose();
    document.body.classList.remove('photo-studio-active');
    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
    renderer.shadowMap.type = shadowType;
    shadow.restore();
    setLights(null);
    onChange();
    for (const [element,left,top] of scrollPositions) element.scrollTo(left,top);
    canvas.focus({preventScroll:true});
  }

  exitArea.querySelector('[data-studio="show-panel"]').onclick = () => showPreview(false);
  exitArea.querySelector('[data-studio="exit-preview"]').onclick = close;
  function blockEditingKeys(event) {
    if (!session || document.querySelector('dialog[open]')) return;
    event.stopImmediatePropagation();
    if (event.type === 'keydown' && event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.type === 'keydown' && event.key.toLowerCase() === 'h' &&
        !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      showPreview(!studioControls.panel.hidden);
    }
  }
  window.addEventListener('keydown',blockEditingKeys,true);
  window.addEventListener('keyup',blockEditingKeys,true);

  const hidden = [];
  function hideOthers(root,keep) {
    for (const child of root.children) {
      if (!child.visible || keep(child)) continue;
      hidden.push(child);
      child.visible = false;
    }
  }

  return {
    open,
    get active(){ return session !== null; },
    render(draw) {
      if (!session) return draw();
      const {tree,attachments,pot} = subject();
      const {orbit,floorScale,floorCenter,sphere} = session;
      hideOthers(scene,child => child === modelRoot || child === pot || child === ground || child.isLight);
      hideOthers(modelRoot,child => child === tree || child === attachments);
      if (pot) hideOthers(pot,child => !child.userData.editorOnly);
      const groundVisible = ground.visible, material = ground.material, previousFog = scene.fog, previousBackground = scene.background;
      ground.visible = true;
      ground.material = floor;
      previousScale.copy(ground.scale);
      previousGroundPosition.copy(ground.position);
      ground.position.set(floorCenter.x,floorCenter.y,ground.position.z);
      ground.scale.setScalar(floorScale);
      const radius = sphere.radius;
      fog.near = camera.position.distanceTo(orbit.target) + radius * 1.4;
      fog.far = fog.near + radius * 5;
      scene.fog = fog;
      scene.background = fog.color;
      renderer.getClearColor(previousClear);
      renderer.setClearColor(backdrop,1);
      try { return draw(); }
      finally {
        renderer.setClearColor(previousClear,1);
        scene.background = previousBackground;
        scene.fog = previousFog;
        ground.scale.copy(previousScale);
        ground.position.copy(previousGroundPosition);
        ground.material = material;
        ground.visible = groundVisible;
        for (const child of hidden) child.visible = true;
        hidden.length = 0;
      }
    },
  };
}
