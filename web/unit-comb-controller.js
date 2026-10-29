import * as THREE from 'three';
import { createGpuMeshPreview } from './gpu-edit-preview.js';
import { sampleLine, lineTangent } from './tree-sculpt.js';
import { applyInstanceFamilyPlacement, createInstancePlacementContext, evaluatedInstanceFrame } from './branch-instance-operations.js';
import { resolveInstanceShape } from './branch-workbench-data.js';
import { unitBranchIndex } from './unit-branch-boundary.js';
import { makeLegacyUnitPlacement } from './legacy-unit-placement.js';
import { prepareUnitCombEntries, evaluateUnitInstanceCombing, advanceUnitCombEntries } from './unit-instance-combing.js';

const clamp = THREE.MathUtils.clamp;
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const svgElement = tag => document.createElementNS('http://www.w3.org/2000/svg', tag);
const orientationNames = { DRAG:'沿笔划转向', DOWN:'整支向下', ROLL:'绕长轴翻转' };
const effectNames = { TURN:'梳理转向', ALIGN:'取样主轴对齐', SPREAD:'角度散开／收拢', SCALE:'整支大小', JITTER:'自然扰动' };

// TREE combing changes the placement of complete unit models. The brush never
// writes curve knots, leaf edits or source assets. Old baked copies keep their
// saved geometry and persist only a complete-model placement operation.
export function createUnitCombController(api) {
  const { canvas, camera, controls } = api;
  const overlay = svgElement('svg'); overlay.id = 'unitCombOverlay';
  overlay.classList.add('sculpt-overlay'); overlay.setAttribute('aria-hidden', 'true'); overlay.setAttribute('hidden', '');
  Object.assign(overlay.style, { position:'absolute', pointerEvents:'none', overflow:'visible' });
  const outer = svgElement('circle'), inner = svgElement('circle'), lines = svgElement('g'), sizeMark=svgElement('text');
  outer.setAttribute('fill', 'none'); outer.setAttribute('stroke', '#f0cb58'); outer.setAttribute('stroke-width', '1.5');
  inner.setAttribute('fill', 'none'); inner.setAttribute('stroke', '#f0cb58'); inner.setAttribute('stroke-opacity', '.4');
  sizeMark.setAttribute('text-anchor','middle');sizeMark.setAttribute('dominant-baseline','central');sizeMark.setAttribute('font-size','20');sizeMark.setAttribute('font-family','system-ui');sizeMark.setAttribute('stroke','#17231d');sizeMark.setAttribute('stroke-width','3');sizeMark.style.paintOrder='stroke';
  overlay.append(lines, outer, inner, sizeMark); canvas.parentElement.append(overlay);
  const feedback = document.createElement('div'); feedback.id = 'unitCombFeedback'; feedback.className = 'sculpt-feedback'; feedback.hidden = true;
  feedback.innerHTML = '<strong></strong><span></span><small>围绕各自枝根转向 · 挂点、尺寸和内部样式保持</small>';
  canvas.parentElement.append(feedback);
  let stroke = null, prepared = new WeakMap(), lastHover = null, previewFrame = 0, picking = '', toolActive = true, altShrink = false;
  let sampleDirectionWorld = null, sampleOriginWorld = null, centerPointWorld = null;
  const referenceMarkers = new THREE.Group(); referenceMarkers.name = 'unitBrushReferences'; referenceMarkers.visible = false;
  const centerMarker = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1,0,0),new THREE.Vector3(1,0,0),new THREE.Vector3(0,-1,0),new THREE.Vector3(0,1,0),
    new THREE.Vector3(0,0,-1),new THREE.Vector3(0,0,1),
  ]),new THREE.LineBasicMaterial({color:0xf0cb58,depthTest:false,depthWrite:false}));
  const directionMarker = new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),1,0x78c9d3);
  for (const mesh of [centerMarker,directionMarker.line,directionMarker.cone]) {mesh.renderOrder=125;mesh.material.depthTest=false;mesh.material.depthWrite=false;}
  centerMarker.visible=directionMarker.visible=false;referenceMarkers.add(centerMarker,directionMarker);api.markerRoot?.add(referenceMarkers);
  const weightLines = new Map();
  const schedule = api.scheduleFrame || (callback => requestAnimationFrame(callback));
  const unschedule = api.cancelFrame || (id => cancelAnimationFrame(id));
  const enabled = () => !api.selectionMode || api.selectionMode() === 'UNIT';
  const blocked = () => api.isBlocked?.() || !api.getAsset() || api.getAsset().group.userData.pending_rebuild;
  const message = (text, state='ready') => api.status?.(text, state);

  function updateReferences() {
    const sampleStatus=document.getElementById('unitBrushSampleStatus'),centerStatus=document.getElementById('unitBrushCenterStatus');
    if(sampleStatus)sampleStatus.textContent=picking==='SAMPLE'?'点击一支单元枝取样 · Esc 取消':sampleDirectionWorld?'已取样整支主轴方向':'尚未取样主轴方向';
    if(centerStatus)centerStatus.textContent=picking==='CENTER'?'点击画面设置固定中心 · Esc 取消':centerPointWorld?'固定中心已设置':'尚未设置固定中心';
    for(const [id,kind] of [['unitBrushSample','SAMPLE'],['unitBrushCenter','CENTER']]){
      const button=document.getElementById(id);button?.setAttribute('aria-pressed',String(picking===kind));button?.classList.toggle?.('active',picking===kind);
    }
    const effect=options().effect;
    referenceMarkers.visible=enabled()&&toolActive&&Boolean(effect==='ALIGN'&&sampleDirectionWorld||effect==='SPREAD'&&centerPointWorld);
    if(!api.markerRoot||!referenceMarkers.visible)return;
    api.markerRoot.updateWorldMatrix(true,false);camera.updateMatrixWorld();
    const inverse=api.markerRoot.matrixWorld.clone().invert(),bounds=canvas.getBoundingClientRect();
    const markerSize=world=>camera.isOrthographicCamera?(camera.top-camera.bottom)/camera.zoom*12/Math.max(1,bounds.height)
      :Math.max(.002,camera.getWorldPosition(new THREE.Vector3()).distanceTo(world)*Math.tan(THREE.MathUtils.degToRad(camera.fov||45)/2)*24/Math.max(1,bounds.height));
    centerMarker.visible=effect==='SPREAD'&&Boolean(centerPointWorld);
    if(centerPointWorld){centerMarker.position.copy(centerPointWorld).applyMatrix4(inverse);centerMarker.scale.setScalar(markerSize(centerPointWorld));}
    directionMarker.visible=effect==='ALIGN'&&Boolean(sampleDirectionWorld&&sampleOriginWorld);
    if(directionMarker.visible){directionMarker.position.copy(sampleOriginWorld).applyMatrix4(inverse);directionMarker.setDirection(sampleDirectionWorld.clone().transformDirection(inverse));
      const size=markerSize(sampleOriginWorld);directionMarker.setLength(size*7,size*1.8,size*.8);}
  }

  function options() {
    const values = api.brushOptions?.() || {};
    const read = (id, fallback) => document.getElementById(id)?.value ?? fallback;
    const asset=api.getAsset();asset?.group.updateWorldMatrix(true,false);
    const inverse=asset?.group.matrixWorld.clone().invert()||new THREE.Matrix4();
    const effect=values.effect||read('unitBrushEffect','TURN');
    const hitMode=read('unitBrushHitMode','AUTO');
    return {
      effect:effectNames[effect]?effect:'TURN',
      radius:clamp(finite(values.radius ?? read('sculptRadius', 160), 160), 20, 700),
      strength:clamp(finite(values.strength ?? read('sculptStrength', .65), .65), .05, 1),
      hardness:clamp(finite(values.hardness ?? read('sculptHardness', .45), .45), 0, 1),
      depthMode:values.scope || values.depthMode || (hitMode==='AUTO'?(api.getScope?.()==='ALL'?'SURFACE':'THROUGH'):hitMode),
      depthRadius:values.depthRadius!==undefined ? clamp(finite(values.depthRadius,.75),.025,15)
        : clamp(finite(values.depthRange ?? read('sculptDepth',1.5),1.5),.05,30)/2,
      direction:values.direction || read('sculptDirection', 'VIEW'),
      orientation:orientationNames[values.orientation || read('unitCombOrientation','DRAG')] ? values.orientation || read('unitCombOrientation','DRAG') : 'DRAG',
      downDirection:new THREE.Vector3(0,0,-1).transformDirection(inverse),
      sampleDirection:sampleDirectionWorld?.clone().transformDirection(inverse),
      centerPoint:centerPointWorld?.clone().applyMatrix4(inverse),
      spreadMode:(values.spreadMode||read('unitBrushSpreadMode','OUT'))==='IN'?'IN':'OUT',
      sizeMode:altShrink||(values.sizeMode||read('unitBrushSizeMode','GROW'))==='SHRINK'?'SHRINK':'GROW',
      angleLimitDegrees:clamp(finite(values.angleLimitDegrees??read('unitBrushAngleLimit',25),25),1,90),
      sizeLimitPercent:clamp(finite(values.sizeLimitPercent??read('unitBrushSizeLimit',20),20),1,80),
      seed:Math.trunc(finite(values.seed??read('unitBrushSeed',1),1)),
    };
  }
  function entries() {
    const asset = api.getAsset(), authoring = api.getAuthoring();
    if (!asset || !authoring) return [];
    const instances=api.getUnitInstances?.()||authoring.branch_instances,branches=api.getUnitBranches?.()||asset.masterBranches;
    // Production supplies a pool that already resolves scope, exclusions and
    // isolation. Expanding ALL again would let hidden ancestors suppress a
    // visible child during family deduplication. An empty resolved pool stays
    // empty, including in ALL mode.
    const resolved = api.getTargetIds?.();
    const scope = resolved == null && api.getScope?.() === 'ALL' ? 'ALL' : 'SELECTED';
    const selection = [...(resolved ?? api.getSelectedIds?.() ?? [])];
    const key = (resolved == null ? 'raw/' : 'resolved/') + scope + '/' + selection.slice().sort().join('/');
    const cached=prepared.get(asset);
    if (cached?.authoring === authoring && cached.instances === instances && cached.key === key) return cached.entries;
    const planning=instances===authoring.branch_instances?authoring:{...authoring,branch_instances:instances};
    const next = prepareUnitCombEntries({ authoring:planning, branches, settings:api.getSettings?.() || {}, selection, scope, isLocked:api.isLocked,
      sampleBranches:'ALL',placements:[...(asset.masterPlacements||[]),...(asset.treeOrgans||[])] });
    const visible = next.filter(entry => !api.isVisible || entry.sampleBranches?.some(b => api.isVisible(b.stableId)) || api.isVisible(entry.rootId || entry.id));
    // An inactive brush must not keep a disposed full tree alive after keyboard
    // edits rebuild it. Entries remain cached only while their owner is live.
    prepared.set(asset,{ authoring, instances, key, entries:visible, outlineTargets:resolved == null ? null : new Set(selection) });
    return visible;
  }
  function projection(asset=api.getAsset()) {
    const bounds = canvas.getBoundingClientRect();
    asset.group.updateWorldMatrix(true, false); camera.updateMatrixWorld();
    const view = camera.matrixWorldInverse.clone().multiply(asset.group.matrixWorld);
    const clip = camera.projectionMatrix.clone().multiply(view), inverse = clip.clone().invert();
    const cache = new WeakMap();
    return {
      bounds,
      project(point, cacheResult=true) {
        const x=point.x,y=point.y,z=point.z;
        const cached=cacheResult?cache.get(point):null;
        if(cached&&cached.sourceX===x&&cached.sourceY===y&&cached.sourceZ===z)return cached;
        // Project with the same homogeneous matrix arithmetic, without two
        // temporary Vector3 objects for every wood/organ brush sample.
        const e=clip.elements,v=view.elements;
        const w=1/(e[3]*x+e[7]*y+e[11]*z+e[15]),vw=1/(v[3]*x+v[7]*y+v[11]*z+v[15]);
        const px=(e[0]*x+e[4]*y+e[8]*z+e[12])*w,py=(e[1]*x+e[5]*y+e[9]*z+e[13])*w;
        const depth=-(v[2]*x+v[6]*y+v[10]*z+v[14])*vw;
        // A dense stroke owns its working points. Reuse their projection
        // records, but reproject whenever the whole-unit transform moves them.
        const result=cached||{};
        result.x=(px*.5+.5)*bounds.width;result.y=(.5-py*.5)*bounds.height;
        result.clip=(e[2]*x+e[6]*y+e[10]*z+e[14])*w;result.depth=depth;result.visible=depth>0;
        result.sourceX=x;result.sourceY=y;result.sourceZ=z;
        if(cacheResult)cache.set(point,result); return result;
      },
      unproject(point, depth) { return new THREE.Vector3(point[0]/bounds.width*2-1, 1-point[1]/bounds.height*2, depth).applyMatrix4(inverse); },
    };
  }
  const pointAt = (event, proj) => [event.clientX-proj.bounds.left, event.clientY-proj.bounds.top];
  // Reference picking is read-only and independent of the manipulation pool:
  // locked, unselected and nested models remain valid direction references.
  function referenceEntries() {
    const asset=api.getAsset(),authoring=api.getAuthoring();if(!asset||!authoring)return [];
    const branches=api.getUnitBranches?.()||asset.masterBranches,instances=api.getUnitInstances?.()||authoring.branch_instances;
    const boundary=unitBranchIndex(branches,instances),byBranch=new Map(branches.map(branch=>[branch.stableId,branch]));
    return instances.flatMap(instance=>{
      const root=byBranch.get(boundary.roots.get(instance.id));
      if(!root?.points?.length||api.isVisible&&!api.isVisible(root.stableId))return [];
      return [{id:instance.id,instance,rootId:root.stableId,root,sampleLines:[root.points],samples:root.points}];
    });
  }
  function referenceHit(event,items,proj,point) {
    const hit=api.hitUnit||api.getInstanceEditor?.()?.hitOwner;
    if(hit){const instance=hit(event),id=typeof instance==='string'?instance:instance?.id;return items.find(item=>item.id===id)||null;}
    // A lightweight main-axis fallback is useful when no geometry picker is
    // supplied. The application uses its complete-model picker for leaves too.
    return centerAt(items,proj,point,14)?.entry||null;
  }
  function pickReference(event) {
    const asset=api.getAsset(),proj=projection(asset),point=pointAt(event,proj),items=referenceEntries(),item=referenceHit(event,items,proj,point);
    if(picking==='SAMPLE'){
      if(!item){message('未点中可见单元枝，请点击一支完整单元枝取样，Esc 取消');return true;}
      const shape=resolveInstanceShape(item.instance,api.getAuthoring().branch_library),frame=shape&&evaluatedInstanceFrame(item.instance,shape,asset.masterBranches,api.getSettings?.()||{});
      const axis=item.root.points.at(-1).clone().sub(frame?.position||item.root.points[0]);
      if(axis.lengthSq()<1e-12){message('该单元枝没有有效主轴，请换一支取样');return true;}
      sampleDirectionWorld=axis.normalize().transformDirection(asset.group.matrixWorld);
      sampleOriginWorld=(frame?.position||item.root.points[0]).clone().applyMatrix4(asset.group.matrixWorld);picking='';updateReferences();
      message('已取样单元枝主轴方向，可在当前选区刷过以对齐');return true;
    }
    let center=item?centerAt([item],proj,point,Math.max(proj.bounds.width,proj.bounds.height)*2):centerAt(items,proj,point,14);
    if(center)centerPointWorld=proj.unproject(point,center.clip).applyMatrix4(asset.group.matrixWorld);
    else{
      const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(point[0]/proj.bounds.width*2-1,1-point[1]/proj.bounds.height*2),camera);
      const target=controls.target?.clone()||new THREE.Vector3(),normal=camera.getWorldDirection(new THREE.Vector3());
      const picked=ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal,target),new THREE.Vector3());
      if(!picked){message('当前画面无法确定中心深度，请换一个点击位置');return true;}
      centerPointWorld=picked;
    }
    picking='';updateReferences();message('固定中心已设置，角度散开／收拢会围绕此点调整整支');return true;
  }
  function centerAt(items, proj, point, radius) {
    let closest = null;
    for (const entry of items) for (const line of entry.sampleLines || [entry.samples]) {
      if (!line?.length) continue;
      for (let index=1; index<line.length; index++) {
        const a=proj.project(line[index-1]), b=proj.project(line[index]);
        if (a.depth<=0 || b.depth<=0 || a.clip<-1 || a.clip>1 || b.clip<-1 || b.clip>1) continue;
        if (point[0]<Math.min(a.x,b.x)-radius || point[0]>Math.max(a.x,b.x)+radius
          || point[1]<Math.min(a.y,b.y)-radius || point[1]>Math.max(a.y,b.y)+radius) continue;
        const x=b.x-a.x, y=b.y-a.y;
        const t=clamp(((point[0]-a.x)*x+(point[1]-a.y)*y)/Math.max(1e-8,x*x+y*y),0,1);
        const distance=Math.hypot(a.x+x*t-point[0],a.y+y*t-point[1]);
        if (distance>radius) continue;
        const depth=a.depth+(b.depth-a.depth)*t;
        if (!closest || (distance<12 && closest.distance<12 ? depth<closest.depth : distance<closest.distance)) closest={distance,depth,clip:a.clip+(b.clip-a.clip)*t,entry};
      }
    }
    if (!closest) return null;
    return { x:point[0], y:point[1], depth:closest.depth, clip:closest.clip, center3d:proj.unproject(point,closest.clip),
      worldRadius:proj.unproject(point,closest.clip).distanceTo(proj.unproject([point[0]+radius,point[1]],closest.clip)),entry:closest.entry };
  }
  function hide() { overlay.setAttribute('hidden',''); feedback.hidden=true; }
  function skippedMessage(skipped) {
    const counts=new Map();for(const reason of skipped?.values()||[])counts.set(reason,(counts.get(reason)||0)+1);
    return [...counts].map(([reason,count])=>reason==='MISSING_REFERENCE'?`${count} 支未标定悬垂方向，请到枝条工作台设置整支参考方向`
      :reason==='PARALLEL_REFERENCE'?`${count} 支参考方向与长轴平行，请重新标定`
      :reason==='PARALLEL_GRAVITY'?`${count} 支长轴与重力平行，无法确定绕轴向下方向`
      :reason==='MISSING_SAMPLE_DIRECTION'?`请先取样一支单元枝的主轴方向`
      :reason==='MISSING_CENTER'?`请先点取角度散开／收拢的固定中心`
      :reason==='CENTER_AT_ROOT'?`${count} 支枝根与中心重合，跳过无明确方向的单元枝`
      :`${count} 支缺少有效整支长轴或重力方向`).join('；');
  }
  function effectLabel(settings) {
    return settings.effect==='TURN'?orientationNames[settings.orientation]:settings.effect==='SPREAD'?(settings.spreadMode==='IN'?'角度收拢':'角度散开')
      :settings.effect==='SCALE'?(settings.sizeMode==='SHRINK'?'整支缩小':'整支放大'):effectNames[settings.effect];
  }
  function show(items, weights, point, settings, proj, skipped = new Map()) {
    overlay.removeAttribute('hidden');
    Object.assign(overlay.style,{left:`${canvas.offsetLeft}px`,top:`${canvas.offsetTop}px`,width:`${proj.bounds.width}px`,height:`${proj.bounds.height}px`});
    overlay.setAttribute('viewBox',`0 0 ${proj.bounds.width} ${proj.bounds.height}`);
    const shrinking=settings.effect==='SCALE'&&settings.sizeMode==='SHRINK',tint=shrinking?'#89d5dc':'#f0cb58';outer.setAttribute('stroke',tint);inner.setAttribute('stroke',tint);
    sizeMark.style.display=settings.effect==='SCALE'?'':'none';sizeMark.textContent=shrinking?'−':'+';sizeMark.setAttribute('x',point[0]);sizeMark.setAttribute('y',point[1]);sizeMark.setAttribute('fill',tint);
    for (const [circle,radius] of [[outer,settings.radius],[inner,settings.radius*settings.hardness]]) {
      circle.setAttribute('cx',point[0]);circle.setAttribute('cy',point[1]);circle.setAttribute('r',radius);
    }
    let count=0;const batches=new Map();
    for (const entry of items) {
      const weight=weights.get(entry.id)||0;if (!weight) continue;count++;
      // Draw every exact main axis, but batch their feedback into 16 visual
      // weight bands. Dense brushes no longer change thousands of SVG nodes
      // every frame; actual influence/placement math keeps its full precision.
      const band=Math.round(weight*15);
      for (const line of entry.displayLines || entry.sampleLines || [entry.samples]) {
        const points=line.map(p=>proj.project(p)).filter(p=>p.depth>0&&p.clip>=-1&&p.clip<=1);
        if (points.length<2) continue;
        if(!batches.has(band))batches.set(band,[]);
        batches.get(band).push(points.map((p,index)=>`${index?'L':'M'}${p.x},${p.y}`).join(' '));
      }
    }
    for(const [band,paths]of batches){
      let element=weightLines.get(band);
      if(!element){
        const weight=band/15;element=svgElement('path');element.setAttribute('fill','none');element.setAttribute('stroke-width','2');
        element.setAttribute('stroke',`rgb(${Math.round(100+weight*145)},${Math.round(170+weight*25)},${Math.round(210-weight*130)})`);
        element.setAttribute('opacity',.3+weight*.6);lines.append(element);weightLines.set(band,element);
      }
      const path=paths.join(' ');if(element.unitBrushPath!==path){element.setAttribute('d',path);element.unitBrushPath=path;}
    }
    for (const [key,line] of weightLines) if (!batches.has(key)) {line.remove();weightLines.delete(key);}
    const countLabel=document.getElementById('sculptTargetCount');if (countLabel) countLabel.textContent=`${count} 支单元枝`;
    feedback.hidden=false;
    feedback.style.left=`${canvas.offsetLeft+Math.max(8,Math.min(proj.bounds.width-300,point[0]+20))}px`;
    feedback.style.top=`${canvas.offsetTop+Math.max(8,Math.min(proj.bounds.height-78,point[1]+24))}px`;
    feedback.querySelector('strong').textContent=`单元枝笔刷 · ${effectLabel(settings)} · 命中 ${count} 支`;
    const scope=settings.depthMode==='THROUGH'?'穿透':settings.depthMode==='SPHERE'?'空间球':`表层 · 深度 ${settings.depthRadius*2} m`;
    const selectionSummary=api.getSelectionSummary?.();
    feedback.querySelector('span').textContent=`${selectionSummary?`已选 ${selectionSummary.selected} · 可刷 ${items.length} · `:''}${scope} · 半径 ${settings.radius} px`;
    const sizes=stroke?.options.effect==='SCALE'?[...stroke.updated].map(([id,after])=>Math.abs(after.scale/stroke.initialScales.get(id)-1)*100):[];
    feedback.querySelector('small').textContent=skippedMessage(skipped)||(!items.length?selectionSummary?.reason||'缺少可用的完整单元枝模型，请检查源素材':'' )||(!count&&items.length?'移近所选整支；表层或空间球模式还会按深度筛选':null)||(settings.effect==='SCALE'?'木枝与叶花果同比例缩放 · '+(sizes.length?'本笔最多已变 '+Math.max(...sizes).toFixed(1)+'% / 上限 '+settings.sizeLimitPercent+'%':'枝根与源模型保持')
      :settings.effect==='ALIGN'?'朝取样主轴逐步对齐 · 挂点与尺寸保持'
      :settings.effect==='JITTER'?`固定随机种子 ${settings.seed} · 每笔最多 ${settings.angleLimitDegrees}° · 挂点与尺寸保持`
      :settings.effect==='TURN'?'围绕各自枝根转向 · 挂点、尺寸和内部样式保持':`围绕各自枝根转向 · 每笔最多 ${settings.angleLimitDegrees}° · 挂点与尺寸保持`);
  }
  function hoverAt(event) {
    lastHover={clientX:event.clientX,clientY:event.clientY};
    updateReferences();if(picking){hide();return;}
    if (stroke || !enabled() || blocked()) return;
    const items=entries(), proj=projection(), point=pointAt(event,proj), settings=options(), center=centerAt(items,proj,point,settings.radius);
    const result=center?evaluateUnitInstanceCombing(items,{...settings,center,worldRadius:center.worldRadius,delta:new THREE.Vector3(),project:proj.project}):{weights:new Map()};
    show(items,result.weights,point,settings,proj,result.skipped);
    api.showActiveUnits?.(items,undefined,prepared.get(api.getAsset())?.outlineTargets);
  }
  const optionKey = settings => JSON.stringify([settings.effect,settings.orientation,settings.radius,settings.strength,settings.hardness,settings.depthMode,settings.depthRadius,
    settings.direction,settings.spreadMode,settings.effect==='SCALE'?'ALT_SIZE':settings.sizeMode,settings.angleLimitDegrees,settings.sizeLimitPercent,settings.seed,
    settings.sampleDirection?.toArray(),settings.centerPoint?.toArray(),settings.downDirection.toArray()]);
  function valid(s) {return enabled() && !blocked() && api.getAsset()===s.asset && api.getAuthoring()===s.source && optionKey(options())===s.optionKey;}
  function flush(s) {
    if (stroke!==s || !valid(s)) return;
    if (s.previewDirty) {
      if(s.preview.updateTransforms)s.preview.updateTransforms(s.transforms);
      else s.preview.update(s.snapshot,s.transforms);
      s.previewDirty=false;
    }
    api.showActiveUnits?.(s.working,s.transforms,s.outlineTargets);
    show(s.working,s.weights,s.last,s.options,s.proj,s.skipped);
  }
  function compute(point,final=false) {
    const s=stroke;if (!s) return;
    if (!valid(s)) {cancel();return;}
    if(s.options.effect==='SCALE')s.options.sizeMode=options().sizeMode;
    const sample = next => {
      const center=centerAt(s.working,s.proj,next,s.options.radius);
      if (!center) {s.lastSample=next.slice();s.weights=new Map();s.skipped=new Map();return;}
      let delta=s.proj.unproject(next,center.clip).sub(s.proj.unproject(s.lastSample,center.clip));
      if (s.options.effect==='TURN' && s.options.orientation==='DRAG' && s.options.direction!=='VIEW') delta=new THREE.Vector3(s.options.direction==='X'?1:0,s.options.direction==='Y'?1:0,s.options.direction==='Z'?1:0)
        .multiplyScalar((s.lastSample[1]-next[1])/s.options.radius*center.worldRadius);
      const result=evaluateUnitInstanceCombing(s.working,{...s.options,center,worldRadius:center.worldRadius,delta,project:s.proj.project});
      s.weights=result.weights;s.skipped=result.skipped;
      for(const [id,reason] of result.skipped)s.skippedDuringStroke.set(id,reason);
      for (const update of result.updates) {
        s.previewDirty=true;
        s.updated.set(update.id,update.after);
        const cumulative=s.cumulative.get(update.id)||new THREE.Matrix4();cumulative.premultiply(update.matrix);s.cumulative.set(update.id,cumulative);
        for (const id of s.branchIds.get(update.id)||[]) s.transforms.set(id,{matrix:cumulative});
      }
      s.working=advanceUnitCombEntries(s.working,result.updates,{inPlace:result.updates.length>s.working.length*.5,workspace:s.workspace});s.lastSample=next.slice();
    };
    let distance=Math.hypot(point[0]-s.lastSample[0],point[1]-s.lastSample[1]);
    while (distance>=6) {
      sample([s.lastSample[0]+(point[0]-s.lastSample[0])/distance*6,s.lastSample[1]+(point[1]-s.lastSample[1])/distance*6]);
      distance=Math.hypot(point[0]-s.lastSample[0],point[1]-s.lastSample[1]);
    }
    if (final && distance>.01) sample(point);
    s.last=point.slice();
    if (!previewFrame) previewFrame=schedule(()=>{previewFrame=0;if (stroke===s) flush(s);});
  }
  function release(restore) {
    if (!stroke) return null;const s=stroke;stroke=null;
    if (previewFrame) {unschedule(previewFrame);previewFrame=0;}
    if (restore) s.preview.restore();
    if (canvas.hasPointerCapture?.(s.pointerId)) canvas.releasePointerCapture(s.pointerId);
    controls.enabled=s.controls;hide();return s;
  }
  function cancel() {
    const pending=Boolean(picking);picking='';const s=release(true);updateReferences();
    if (!s) {hide();if(pending)message('单元枝参照拾取 · 已取消');return pending;}
    api.showActiveUnits?.(entries());message('单元枝笔刷 · 已取消');return true;
  }
  function requestReference(kind) {
    if(!enabled()||blocked())return false;
    cancel();picking=kind;updateReferences();hide();
    message(kind==='SAMPLE'?'点击一支完整单元枝取样主轴方向 · 不改变当前选区 · Esc 取消':'点击画面设置固定中心 · Esc 取消','busy');return true;
  }
  function begin(event) {
    if (!enabled() || event.button!==0) return false;
    if (stroke) return true;if (blocked()) return true;
    if(picking)return pickReference(event);
    const items=entries();
    if (!items.length) {const summary=api.getSelectionSummary?.();message(summary?.reason||(summary?.selected?'所选实例缺少可用的完整模型，请检查源素材':'请先点选单元枝，或将作用范围切换为全部单元枝'));return true;}
    const asset=api.getAsset(),source=api.getAuthoring(),proj=projection(asset),point=pointAt(event,proj),settings=options();
    if(settings.effect==='ALIGN'&&!settings.sampleDirection){message('请先点击「取样主轴」，再点一支完整单元枝');return true;}
    if(settings.effect==='SPREAD'&&!settings.centerPoint){message('请先点击「固定中心」，再点画面设置散开／收拢的中心');return true;}
    const center=centerAt(items,proj,point,settings.radius);
    if (!center) {message('单元枝梳理 · 未命中可调整单元枝');return true;}
    const initial=evaluateUnitInstanceCombing(items,{...settings,center,worldRadius:center.worldRadius,delta:new THREE.Vector3(),project:proj.project});
    if (![...initial.weights.values()].some(value=>value>0)) {message('单元枝梳理 · '+(skippedMessage(initial.skipped)||'当前范围无可调整单元枝'));return true;}
    api.getInstanceEditor?.()?.deactivate();
    // Whole-model placement never edits knots, masks or sample bindings. Keep
    // independent rest points for preview/cache validation without preparing the
    // much larger per-point sculpt state for every branch in the tree.
    const snapshot=new Map(asset.masterBranches.map(branch=>[branch.id,{...branch,points:branch.points.map(point=>point.clone())}])),branchIds=new Map(),targets=new Set(),unitRoots=new Map();
    for (const item of items) {
      branchIds.set(item.id,[]);
      for (const id of item.familyIds || [item.id]) unitRoots.set(id,item.id);
    }
    const boundary=unitBranchIndex(api.getUnitBranches?.()||asset.masterBranches,api.getUnitInstances?.()||source.branch_instances);
    for (const branch of asset.masterBranches) {
      const owner=unitRoots.get(boundary.owners.get(branch.stableId)?.id);
      if (owner) {branchIds.get(owner).push(branch.id);targets.add(branch.stableId);}
    }
    let preview;
    try {preview=(api.createPreview||createGpuMeshPreview)(asset,snapshot,{sampleLine,lineTangent,targets,rigid:true});}
    catch (error) {message('单元枝梳理预览失败：'+error.message,'error');return true;}
    if (!preview) {message('当前模型暂不能建立实时梳理预览，请使用整支旋转调整','error');return true;}
    preview.dispose ||= preview.restore;
    stroke={asset,source,settings:api.getSettings?.()||{},entries:items,working:items,snapshot,preview,branchIds,updated:new Map(),initialScales:new Map(items.map(i=>[i.id,i.instance.scale])),cumulative:new Map(),transforms:new Map(),
      pointerId:event.pointerId,controls:controls.enabled,proj,options:settings,optionKey:optionKey(settings),last:point.slice(),lastSample:point.slice(),weights:initial.weights,
      skipped:initial.skipped,skippedDuringStroke:new Map(initial.skipped),previewDirty:false,outlineTargets:prepared.get(asset)?.outlineTargets,workspace:new WeakSet()};
    controls.enabled=false;canvas.setPointerCapture?.(event.pointerId);
    show(items,initial.weights,point,settings,proj,initial.skipped);
    message('单元枝笔刷 · '+effectLabel(settings)+'，Esc 取消'+(initial.skipped.size?' · '+skippedMessage(initial.skipped):''),'busy');return true;
  }
  function move(event) {
    if (!enabled()) return false;
    if (!stroke) {hoverAt(event);return true;}
    if (event.pointerId===stroke.pointerId) compute(pointAt(event,stroke.proj));return true;
  }
  function end(event) {
    if (!stroke) return enabled()&&event.button===0;
    if (event.pointerId!==stroke.pointerId || event.button!==0) return true;
    if (!valid(stroke)) {cancel();return true;}
    compute(pointAt(event,stroke.proj),true);if (!stroke) return true;
    const s=stroke;flush(s);release(false);
    if (!s.updated.size) {s.preview.restore();message('单元枝梳理 · 未产生修改');return true;}
    const apply=()=>api.transact(`${effectLabel(s.options)} ${s.updated.size} 支单元枝`, next=>{
      const placementContext=createInstancePlacementContext(next,s.asset.masterBranches,s.settings,{owners:s.updated.keys()});
      for (const entry of s.entries) {
        const after=s.updated.get(entry.id);if (!after) continue;
        const before=placementContext.instanceById.get(entry.id);
        if (before) applyInstanceFamilyPlacement(next,structuredClone(before),after,entry.shape,s.asset.masterBranches,s.settings,placementContext);
      }
      const legacy=s.entries.filter(entry=>entry.instance.legacyPlacement&&s.updated.has(entry.id));
      if(legacy.length){
        const operation=makeLegacyUnitPlacement(legacy,legacy.map(entry=>({id:entry.id,matrix:s.cumulative.get(entry.id),after:s.updated.get(entry.id)})),
          {branches:s.asset.masterBranches,authoring:next,excluded:api.getSelectionExclusions?.()||[]});
        if(!operation)throw new Error('旧副本的完整挂接记录无效，本次调整已取消');
        next.sculpt_layers.push({id:`UNIT_PLACEMENT_${Date.now()}`,name:'旧副本 · '+effectLabel(s.options),enabled:true,strength:1,operation,branches:{}});
      }
    },{bypassLayers:true,deferControls:true});
    try {
      const accepted=api.commitPreview?api.commitPreview(s.preview,apply):apply();
      if (!api.commitPreview || accepted===false) s.preview.restore();
      const skipped=skippedMessage(s.skippedDuringStroke);
      prepared=new WeakMap();message(accepted===false?'单元枝梳理 · 未提交':'已梳理 '+s.updated.size+' 支单元枝'+(skipped?' · '+skipped:''));
    } catch (error) {s.preview.restore();message('单元枝梳理未提交：'+error.message,'error');}
    return true;
  }
  function toolChanged(next) {cancel();toolActive=!next||next==='COMB';prepared=new WeakMap();lastHover=null;hide();updateReferences();}
  function refreshTargets() {prepared=new WeakMap();if (stroke || picking&&!enabled()) cancel();else if (lastHover && enabled() && !blocked()) hoverAt(lastHover);else api.showActiveUnits?.(enabled()?entries():[]);updateReferences();}
  function resetReferences() {cancel();sampleDirectionWorld=null;sampleOriginWorld=null;centerPointWorld=null;prepared=new WeakMap();updateReferences();}
  const settingsChanged=()=>{cancel();refreshTargets();};
  for(const id of ['unitCombOrientation','unitBrushEffect','unitBrushSpreadMode','unitBrushSizeMode','unitBrushAngleLimit','unitBrushSizeLimit','unitBrushSeed',
    'sculptRadius','sculptStrength','sculptHardness','sculptScope','sculptDepth','sculptDirection','unitBrushHitMode']){
    const control=document.getElementById(id);control?.addEventListener('input',settingsChanged);control?.addEventListener('change',settingsChanged);
  }
  const requestSample=()=>requestReference('SAMPLE'),requestCenter=()=>requestReference('CENTER');
  const sampleButton=document.getElementById('unitBrushSample'),centerButton=document.getElementById('unitBrushCenter'),shuffle=document.getElementById('unitBrushShuffle');
  if(sampleButton)sampleButton.onclick=requestSample;if(centerButton)centerButton.onclick=requestCenter;
  if(shuffle)shuffle.onclick=()=>{
    cancel();const seed=document.getElementById('unitBrushSeed');if(!seed)return;
    seed.value=String((Math.abs(Math.trunc(finite(seed.value,1)))+1)%2147483647||1);
    seed.dispatchEvent(new Event('input',{bubbles:true}));seed.dispatchEvent(new Event('change',{bubbles:true}));
    message('已切换自然扰动种子，刷过时才会修改单元枝');
  };
  let rightCancelled=false;
  canvas.addEventListener('pointerdown',event=>{rightCancelled=false;if(event.button===2&&(stroke||picking)){
    rightCancelled=true;cancel();event.preventDefault?.();event.stopImmediatePropagation?.();
  }},true);
  canvas.addEventListener('contextmenu',event=>{if(rightCancelled||stroke||picking){cancel();rightCancelled=false;event.preventDefault?.();event.stopImmediatePropagation?.();}},true);
  controls.addEventListener?.('change',updateReferences);
  function sizeDirectionChanged(){
    if(stroke?.options.effect==='SCALE'){stroke.options.sizeMode=options().sizeMode;show(stroke.working,stroke.weights,stroke.last,stroke.options,stroke.proj,stroke.skipped);}
    else if(lastHover&&enabled()&&toolActive&&!blocked())hoverAt(lastHover);
    document.dispatchEvent?.(new CustomEvent('unit-brush-direction',{detail:{temporary:altShrink,sizeMode:options().sizeMode}}));
  }
  globalThis.window?.addEventListener('keydown',event=>{
    if(event.key!=='Alt'||!enabled()||!toolActive||options().effect!=='SCALE'||event.target?.isContentEditable||event.target?.matches?.('input,textarea,select')||document.querySelector?.('dialog[open]'))return;
    event.preventDefault();if(!altShrink){altShrink=true;sizeDirectionChanged();}
  },true);
  globalThis.window?.addEventListener('keyup',event=>{if(event.key==='Alt'&&altShrink){altShrink=false;sizeDirectionChanged();}},true);
  globalThis.window?.addEventListener('blur',()=>{altShrink=false;cancel();});
  updateReferences();
  return {begin,move,end,cancel,hoverAt,hide,toolChanged,refreshTargets,requestSample,requestCenter,resetReferences,referenceMarkers,
    key(event){return event.key==='Escape'&&cancel();},get active(){return Boolean(stroke||picking);},
    get debug(){const settings=stroke?.options||options();return {active:Boolean(stroke),picking,effect:settings.effect,
      references:{sampleDirectionWorld:sampleDirectionWorld?.toArray()||null,sampleOriginWorld:sampleOriginWorld?.toArray()||null,centerPointWorld:centerPointWorld?.toArray()||null},
      options:{...settings,sampleDirection:settings.sampleDirection?.toArray()||null,centerPoint:settings.centerPoint?.toArray()||null,downDirection:settings.downDirection.toArray()},
      ...(stroke?{units:stroke.updated.size,targets:stroke.entries.length,matrices:stroke.transforms,preview:stroke.preview.stats}:{})};}};
}
