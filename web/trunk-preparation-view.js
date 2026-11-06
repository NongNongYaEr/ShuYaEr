import * as T from './vendor/three.module.min.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {TransformControls} from './vendor/TransformControls.js';
import {configureViewportNavigation,finishViewportNavigation} from './viewport-navigation.js';
import {createImportedTrunkMaterial,hydrateImportedTrunkMaterials,disposeImportedTrunkTextures} from './imported-trunk-runtime.js';
import {trunkCalibrationMatrix,trunkBounds} from './imported-trunk-data.js';
import {createPreparationPointControls} from './unit-preparation-point-controls.js';
import {sealImmutableJson} from './immutable-json.js';
import {trunkEditable} from './trunk-preparation-data.js';
import {createTrunkJointPose,deformTrunkPrimitive,trunkPoseGeometry,trunkSourceBinding} from './imported-trunk-binding.js';
import {trunkSurfaceTangents} from './trunk-surface-tangents.js';
import {createHumanSilhouette,formatDistance} from './size-reference-data.js';
import {createScopedModelTransform} from './scoped-model-transform.js';
import {createTrunkGuideControls} from './trunk-guide-controls.js';
import {guideSelectionCenter} from './trunk-guide-selection.js';
import {createTrunkWeightBrush} from './trunk-weight-brush.js';
import {createTrunkWeightOverlay} from './trunk-weight-overlay.js';
import {trunkBendPose} from './trunk-weight-repair.js';

export function createTrunkPreparationView(host,api){
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor('#17221e');renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;host.append(renderer.domElement);renderer.domElement.tabIndex=0;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.001,100000);camera.up.set(0,0,1);scene.add(new T.HemisphereLight(0xffffff,0x47513e,2));for(const [position,intensity]of [[[3,4,7],3],[[-4,-3,4],1]]){const light=new T.DirectionalLight(0xffffff,intensity);light.position.fromArray(position);scene.add(light);}
 const modelRoot=new T.Group(),guideRoot=new T.Group(),reference=new T.Group(),proxy=new T.Object3D();scene.add(modelRoot,guideRoot,reference,proxy);modelRoot.matrixAutoUpdate=false;
 const controls=new OrbitControls(camera,renderer.domElement),disposeNavigation=configureViewportNavigation(controls),gizmo=new TransformControls(camera,renderer.domElement),helper=gizmo.getHelper();gizmo.setSize(.7);gizmo.setMode('translate');scene.add(helper);helper.visible=false;
 const dialog=host.closest('dialog'),raycaster=new T.Raycaster(),pointer=new T.Vector2();let model=null,display='result',pick=null,selected=null,pose=0,disposed=false,frame=0,adapter=null,loadAbort=null,poseSource=null,representation='overlay',identity=crypto.randomUUID(),loadToken=0,restore=null,transformMode='observe',modelAdapter=null,modelGesture=false,human=null,referenceBox=null,referenceVisible=true,modelRevision=0,editMode='model',referenceKey='',guideTool='translate',candidateGuides=null,analysisLocked=false;
 try{referenceVisible=localStorage.getItem('treeDuck.trunk-reference')!=='false';}catch{}
 const labels=document.createElement('div');labels.className='trunk-view-readout';labels.innerHTML='<strong>整理结果 · 米</strong><span>X 横向　Y 正面　Z 生长</span><small data-native-state></small>';host.append(labels);
 const referenceLabels=document.createElement('div');referenceLabels.className='trunk-reference-labels';host.append(referenceLabels);const dimensions=document.createElement('div');dimensions.className='trunk-reference-size';host.append(dimensions);let worldLabels=[];
 const noGuideSelection=[];
 let weightSettings=null,testJoint=null,testGuides=null,testSource=null,testFrame=0,testDrag=null;
 const weightOverlay=createTrunkWeightOverlay(modelRoot,()=>{modelRevision++;});
 const weightBrush=createTrunkWeightBrush({host,canvas:renderer.domElement,camera,controls,root:modelRoot,
  getState:()=>weightSettings&&model?{...weightSettings,model,enabled:!pose&&api.weight.canDraw()}:null,
  commit:api.weight.commit,sample:(id,index)=>api.weight.sample(weightOverlay.sample(model,id,index)),
  setDrawing:api.weight.drawing,setRadius:api.weight.radius,onError:api.error});
 const pointControls=createPreparationPointControls({host,camera,controls,getUnit:()=>model&&editMode==='model'&&display==='source'&&!pick?model.calibration:null,pointAt:(x,y)=>hit(x,y),begin:key=>api.beginPoint(key),onError:api.error});
 const depthMaterial=new T.MeshBasicMaterial({side:T.DoubleSide});
 const guideControls=createTrunkGuideControls({
  host,camera,controls,
  getState:()=>{
   if(!model||editMode==='inspect'&&!weightSettings||display!=='result'||pose&&editMode!=='rig-test'||representation==='model')return null;
   if(editMode==='rig-test')return {model:testGuides?{...model,guides:testGuides}:model,target:'segment',selected:testJoint,
    targets:testJoint?[testJoint]:noGuideSelection,selection:noGuideSelection,selectionMode:'auto',through:true,clickOnly:true,joints:true,interactive:!pose&&!api.rigTest.locked()};
   const target=api.getTargetState(),editable=!analysisLocked&&editMode==='guide';
   return {endpointsOnly:!!candidateGuides||!!weightSettings,model:candidateGuides?{...model,guides:candidateGuides}:model,
    selected:editable?(selected||{guide:model.guides[0].id,index:-1}):null,selection:editable?api.getGuideSelection():[],
    selectionMode:api.getSelectionMode(),...target,interactive:editable&&!target.selectionLocked,
    through:representation==='bones'||target.through};
  },
  select:api.select,selectMany:api.selectMany,selectTargets:(items,operation)=>editMode==='rig-test'?selectTestJoint(items[0]||null):api.selectTargets(items,operation),pickAttachment:api.pickAttachment,
  isVisible:point=>{
   const position=new T.Vector3(...point),screen=position.clone().project(camera);
   raycaster.setFromCamera(screen,camera);
   const depth=raycaster.ray.origin.distanceTo(position),hits=[];
   for(const mesh of modelRoot.children){
    if(!mesh.isMesh)continue;
    const material=mesh.material;
    mesh.material=depthMaterial;
    try{mesh.raycast(raycaster,hits);}finally{mesh.material=material;}
   }
   hits.sort((a,b)=>a.distance-b.distance);
   const front=hits[0];
   if(!front)return true;
   // A control point inside the first wood shell remains selectable. A point
   // behind that shell requires through selection or a different camera view.
   const tolerance=Math.max(.002,front.distance*.002);
   const back=hits.find(h=>h.object===front.object&&h.distance>front.distance+tolerance&&h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(raycaster.ray.direction)>0);
   return depth<=(back?.distance??front.distance)+tolerance;
  },
  setSelectionMode:api.setSelectionMode,begin:api.beginGuide,
  canBox:e=>{
   if(keyboard.active||gizmo.dragging||adapter||modelAdapter||pick)return false;
   if(editMode!=='rig-test'&&(e.shiftKey||e.ctrlKey||e.metaKey||api.getSelectionMode()==='box'||api.getTargetState().attaching))return true;
   if(!gizmo.enabled||!gizmo.object)return true;
   const r=host.getBoundingClientRect();
   gizmo.pointerHover({x:(e.clientX-r.left)/r.width*2-1,y:1-(e.clientY-r.top)/r.height*2,button:e.button});
   return !gizmo.axis;
  },
  refreshView:()=>{syncGuides();if(selected)proxy.position.copy(guideSelectionCenter(model,api.getGuideSelection()));},onError:api.error
 });
 function hit(x,y){const r=host.getBoundingClientRect();pointer.set(x/r.width*2-1,1-y/r.height*2);raycaster.setFromCamera(pointer,camera);modelRoot.updateMatrixWorld(true);const found=raycaster.intersectObject(modelRoot,true)[0];return found?{point:found.point.toArray(),hit:found}:null;}
 function updateNative(){labels.querySelector('[data-native-state]').textContent=api.native.stats.available?api.native.stats.active?'DX12':'正在准备 DX12…':'浏览器预览';}
 function resize(){const r=host.getBoundingClientRect();if(r.width<1||r.height<1)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
 const observer=new ResizeObserver(resize);observer.observe(host);
 function loop(){if(disposed)return;controls.update();pointControls.refresh();guideControls.refresh();updateNative();if(human){human.rotation.z=Math.atan2(camera.position.y-human.position.y,camera.position.x-human.position.x)+Math.PI/2;}for(const {node,point}of worldLabels){const p=point.clone().project(camera);node.hidden=p.z< -1||p.z>1||!model;node.style.left=(p.x+1)*host.clientWidth/2+'px';node.style.top=(1-p.y)*host.clientHeight/2+'px';}frame=requestAnimationFrame(loop);}
 function geometry(raw){const g=new T.BufferGeometry();for(const [key,size]of [['position',3],['normal',3],['uv',2],['tangent',4]])g.setAttribute(key,new T.Float32BufferAttribute(key==='tangent'?trunkSurfaceTangents(raw.normal,raw.tangent):raw[key],size));if(raw.color)g.setAttribute('color',new T.Float32BufferAttribute(raw.color,raw.color.length/(raw.position.length/3)));g.setIndex(raw.index);return g;}
 function clear(group){for(const object of [...group.children]){group.remove(object);object.traverse(o=>{o.geometry?.dispose();for(const material of [o.material].flat().filter(Boolean))material.dispose();});}}
 async function setModel(next,{fit=true}={}){
  cancelAnimationFrame(testFrame);testFrame=0;testJoint=testGuides=testSource=null;
  weightBrush.reset();weightOverlay.clear(model);weightSettings=null;
  const token=++loadToken;loadAbort?.abort();loadAbort=new AbortController();const signal=loadAbort.signal;disposeImportedTrunkTextures(modelRoot);clear(modelRoot);model=next;selected=null;gizmo.detach();pose=0;
  const materials=next.materials.map((_,i)=>createImportedTrunkMaterial(next,i));for(const p of next.primitives){const m=materials[p.material];if(p.geometry.color)m.vertexColors=true;const mesh=new T.Mesh(geometry(p.geometry),m);mesh.userData.trunkPrimitive=p.id;modelRoot.add(mesh);}
  identity=crypto.randomUUID();modelRevision++;referenceKey='';sync();if(fit)fitView();
  try{await hydrateImportedTrunkMaterials(modelRoot,{signal,onProgress:()=>{if(token===loadToken)modelRevision++;}});}catch(error){if(signal.aborted)return;throw error;}
  if(disposed||token!==loadToken)return;modelRevision++;
 }
 function referenceGeometry(){const key=model?JSON.stringify([model.id,model.calibration,display,referenceVisible]):'';if(key===referenceKey)return;referenceKey=key;clear(reference);referenceLabels.replaceChildren();worldLabels=[];human=null;dimensions.hidden=!model;if(!model)return;const bounds=trunkBounds(model,display==='result'?trunkCalibrationMatrix(model.calibration):new T.Matrix4()),extent=bounds.getSize(new T.Vector3()),length=extent.length(),step=10**Math.floor(Math.log10(Math.max(.01,length/10))),size=Math.max(step*10,length*1.5,referenceVisible?2.5:0),grid=new T.GridHelper(size,Math.min(100,Math.round(size/step)),0x526c5a,0x2f4438);grid.rotation.x=Math.PI/2;reference.add(grid);referenceBox=bounds.clone();const axes=new T.AxesHelper(Math.max(step,length*.18));axes.material.depthTest=false;axes.renderOrder=10;reference.add(axes);
  const line=(points,color)=>{const l=new T.LineSegments(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.8}));l.renderOrder=10;reference.add(l);};
  const label=(text,point,color)=>{const node=document.createElement('span');node.className='trunk-world-label';node.textContent=text;node.style.color=color;referenceLabels.append(node);worldLabels.push({node,point});};
  const margin=Math.max(.025,length*.09),x=bounds.max.x+margin,y=bounds.min.y,z=bounds.min.z;line([new T.Vector3(x,y,z),new T.Vector3(x,y,bounds.max.z),new T.Vector3(bounds.min.x,bounds.min.y-margin,z),new T.Vector3(bounds.max.x,bounds.min.y-margin,z)],'#d9c978');label('高 '+formatDistance(extent.z),new T.Vector3(x,y,(z+bounds.max.z)/2),'#e7d989');label('宽 '+formatDistance(extent.x),new T.Vector3((bounds.min.x+bounds.max.x)/2,bounds.min.y-margin,z),'#a9d7d4');label('挂接原点',new T.Vector3(),'#ffdb52');
  if(referenceVisible){human=new T.Mesh(createHumanSilhouette(),new T.MeshBasicMaterial({color:'#91ada0',side:T.DoubleSide,transparent:true,opacity:.6,depthWrite:false}));human.scale.setScalar(1.75);human.position.set(bounds.max.x+Math.max(.4,extent.x*.3)+.38,0,0);human.raycast=()=>{};reference.add(human);referenceBox.expandByPoint(new T.Vector3(human.position.x+.4,.1,1.9)).expandByPoint(new T.Vector3(human.position.x-.4,-.1,0));label('人物参照 · 1.75 m',new T.Vector3(human.position.x,0,1.87),'#bed5c9');}
  dimensions.textContent='高 '+formatDistance(extent.z)+'　宽 '+formatDistance(extent.x)+'　厚 '+formatDistance(extent.y)+'\n每格 '+formatDistance(size/Math.min(100,Math.round(size/step)))+' · '+(display==='result'?'校准后真实尺寸':'原始 GLB 尺寸');
 }
 const guideLines=new Map();
 function syncGuides(){
  const live=new Set();if(model)for(const g of testGuides||candidateGuides||model.guides){live.add(g.id);let line=guideLines.get(g.id);if(!line){line=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({depthTest:false,transparent:true,opacity:.9}));line.renderOrder=15;guideRoot.add(line);guideLines.set(g.id,line);}let position=line.geometry.attributes.position;if(position?.count!==g.points.length){position=new T.Float32BufferAttribute(new Float32Array(g.points.length*3),3);line.geometry.setAttribute('position',position);}let changed=false;g.points.forEach((p,i)=>{if(Math.abs(position.getX(i)-p[0])>1e-8||Math.abs(position.getY(i)-p[1])>1e-8||Math.abs(position.getZ(i)-p[2])>1e-8){position.setXYZ(i,...p);changed=true;}});if(changed){position.needsUpdate=true;line.geometry.computeBoundingSphere();}line.material.color.set(selected?.guide===g.id?'#ffdb52':'#73c9c1');}
  for(const [id,line]of guideLines)if(!live.has(id)){line.removeFromParent();line.geometry.dispose();line.material.dispose();guideLines.delete(id);}guideControls.refresh();
 }
 function sync(next=model){poseSource=null;model=next;if(!model)return;modelRoot.matrix.copy(display==='result'?trunkCalibrationMatrix(model.calibration):new T.Matrix4());modelRoot.updateMatrixWorld(true);reference.visible=true;modelRoot.visible=display==='source'||representation!=='bones';guideRoot.visible=display==='result'&&representation!=='model';labels.querySelector('strong').textContent=display==='source'?'原始模型 · 导入坐标':'整理结果 · 米';labels.querySelector('span').textContent=display==='source'?'G / R / S 调整校准结果；原始文件保留':editMode==='guide'?'点击选点 · 空白处拖框 · 拖点移动 · G 移动 · X/Y/Z 约束 · F 聚焦':editMode==='rig-test'?'点选骨架段 · 拖动旋转环检查变形':'X 横向　Y 正面　Z 生长 · G / R / S 模型校准';referenceGeometry();syncGuides();pointControls.refresh();if(editMode==='rig-test'){syncTestGizmo();return;}gizmo.enabled=!analysisLocked&&!api.getTargetState().attaching&&editMode!=='inspect'&&pose===0&&!(editMode==='guide'&&api.getSelectionMode()==='box');if(analysisLocked||editMode==='inspect'||api.getTargetState().attaching){gizmo.detach();helper.visible=false;}else if(!modelGesture){if(selected&&display==='result'){const g=model.guides.find(g=>g.id===selected.guide);if(g?.points[selected.index]){proxy.position.copy(guideSelectionCenter(model,api.getGuideSelection()));gizmo.setMode(guideTool);gizmo.attach(proxy);helper.visible=true;}}else if(transformMode!=='observe'&&display==='result'){proxy.position.set(0,0,0);proxy.quaternion.identity();proxy.scale.setScalar(1);gizmo.setMode(transformMode);gizmo.attach(proxy);helper.visible=true;}else{gizmo.detach();helper.visible=false;}}}
 function fitView(preset='perspective',includeReference=true){if(!model)return;finishViewportNavigation(controls);const box=(includeReference&&referenceBox||trunkBounds(model,display==='result'?trunkCalibrationMatrix(model.calibration):new T.Matrix4())).clone(),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),radius=Math.max(.001,size.length()*.5),distance=radius/Math.sin(camera.fov*Math.PI/360)*1.2,direction=preset==='front'?new T.Vector3(0,1,0):preset==='side'?new T.Vector3(1,0,0):preset==='top'?new T.Vector3(0,0,1):new T.Vector3(1,1.7,.65).normalize();camera.position.copy(center).addScaledVector(direction,distance);camera.near=Math.max(.00001,radius/10000);camera.far=Math.max(1000,distance+radius*100);camera.updateProjectionMatrix();controls.target.copy(center);controls.update();}
 function choosePoint(key){keyboard.cancel();guideControls.cancel();editMode='model';transformMode='observe';display='source';pick=key;selected=null;sync();fitView();}
 function selectControl(guide,index=0){keyboard.cancel();if(guide)editMode='guide';guideTool='translate';transformMode='observe';display='result';selected=guide?{guide,index}:null;proxy.quaternion.identity();proxy.scale.setScalar(1);pick=null;sync();}
 function chooseTransform(mode){keyboard.cancel();guideControls.cancel();editMode='model';if(pose)restoreOriginal();display='result';pick=null;selected=null;transformMode=mode;sync();}
 function down(event){if(analysisLocked)return;if(event.button!==0||gizmo.axis||gizmo.dragging||event.target!==renderer.domElement)return;const r=host.getBoundingClientRect();if(pick){const found=hit(event.clientX-r.left,event.clientY-r.top);if(found){const key=pick;pick=null;api.point(key,found.point);}return;}if(display!=='result')return;pointer.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);raycaster.setFromCamera(pointer,camera);const found=raycaster.intersectObject(guideRoot,true).find(h=>h.object.userData.controlPoint);if(found){const p=found.object.userData.controlPoint;api.select(p.guide,p.index);}}
 renderer.domElement.addEventListener('pointerdown',down);
 gizmo.addEventListener('dragging-changed',event=>{controls.enabled=!event.value;if(editMode==='rig-test'){testDrag=event.value?proxy.quaternion.clone():null;api.rigTest.dragging(event.value);return;}if(event.value){pointControls.cancel?.();if(editMode==='model'&&transformMode!=='observe'){modelAdapter=api.beginCalibration(transformMode);modelGesture=!!modelAdapter;}else adapter=selected&&api.beginGuideTransform(guideTool);}else if(modelAdapter){const current=modelAdapter;modelAdapter=null;modelGesture=false;current.error?current.cancel():current.commit();}else if(adapter){const current=adapter;adapter=null;current.commit();}});
 gizmo.addEventListener('objectChange',()=>{if(editMode==='rig-test'&&testDrag){queueJointPreview();return;}if(modelAdapter){const factor=transformMode==='scale'?(gizmo.axis==='Y'?proxy.scale.y:gizmo.axis==='Z'?proxy.scale.z:proxy.scale.x):1;modelAdapter.update({translation:proxy.position.clone(),rotation:proxy.quaternion.clone(),scale:new T.Vector3().setScalar(factor)});}else if(adapter){const factor=guideTool==='scale'?(gizmo.axis==='Y'?proxy.scale.y:gizmo.axis==='Z'?proxy.scale.z:proxy.scale.x):1;adapter.update({translation:proxy.position.clone().sub(adapter.center),rotation:proxy.quaternion.clone(),scale:new T.Vector3().setScalar(factor)});poseSource=null;syncGuides();}});
 const keyboard=createScopedModelTransform({dialog,canvas:renderer.domElement,camera,space:scene,controls,start:mode=>{if(analysisLocked||!model||modelAdapter||gizmo.dragging||guideControls.active)return null;if(editMode==='guide'){if(!selected||display!=='result'){api.error('请在整理结果中先选择控制点。');return null;}const current=api.beginGuideTransform(mode);if(!current)return null;guideTool=mode;proxy.position.copy(current.center);proxy.quaternion.identity();proxy.scale.setScalar(1);gizmo.setMode(mode);gizmo.attach(proxy);return {...current,get error(){return current.error;},update:delta=>{current.update(delta);proxy.position.copy(current.center).add(delta.translation);proxy.quaternion.copy(delta.rotation);proxy.scale.copy(delta.scale);}};}if(editMode==='rig-test')return beginTestRotation(mode);if(editMode!=="model"){api.error("请先进入方向与尺寸，或点选控制枝进行编辑。");return null;}chooseTransform(mode);const current=api.beginCalibration(mode);if(!current)return null;modelGesture=true;return {...current,get error(){return current.error;},update:delta=>{current.update(delta);},commit:()=>{modelGesture=false;current.commit();},cancel:()=>{modelGesture=false;current.cancel();}};}});
 function showPose(amount,source=model){if(!model||display!=='result')return;
  if(testGuides&&!pose||testFrame)restoreOriginal();
  const {mount,branches}=trunkBendPose(source,amount),posedSource=source===model?(poseSource||=sealImmutableJson({...model,...trunkEditable(model)})):source;
  const result=trunkPoseGeometry(posedSource,mount,branches);
  pose=amount;
  applyPreviewGeometry(result.primitives);guideRoot.visible=(amount===0||editMode==='rig-test')&&representation!=='model';helper.visible=amount===0&&!!selected&&!weightSettings;gizmo.enabled=amount===0&&!weightSettings;
  if(editMode==='rig-test'){
   testGuides=amount?posedGuidePoints(result.pose):null;syncGuides();syncTestGizmo();api.rigTest.changed();
  }else guideControls.refresh();
  if(weightSettings)weightOverlay.render(source,weightSettings,true);
 }
 function applyPreviewGeometry(primitives,reuseBuffers=false){
  const inverse=trunkCalibrationMatrix(model.calibration).invert();
  for(const mesh of modelRoot.children){
   const raw=primitives.get(mesh.userData.trunkPrimitive);
   if(reuseBuffers){
    const g=mesh.geometry;
    for(const name of ['position','normal','tangent'])g.attributes[name].array.set(raw[name]);
    g.boundingBox=g.boundingSphere=null;g.applyMatrix4(inverse);
   }else{const g=geometry(raw);g.applyMatrix4(inverse);mesh.geometry.dispose();mesh.geometry=g;}
  }
  modelRevision++;
 }
 function restoreOriginal(){
  cancelAnimationFrame(testFrame);testFrame=0;
  if(editMode==='rig-test')proxy.quaternion.identity();
  const changed=!!pose||!!testGuides;
  if(changed){for(const mesh of modelRoot.children){const raw=model.primitives.find(p=>p.id===mesh.userData.trunkPrimitive).geometry;mesh.geometry.dispose();mesh.geometry=geometry(raw);}modelRevision++;}
  pose=0;testGuides=null;sync();
  if(changed&&weightSettings)weightOverlay.render(model,weightSettings,true);
  if(editMode==='rig-test')api.rigTest.changed();
 }
 function syncTestGizmo(){
  const guide=testJoint&&model.guides.find(g=>g.id===testJoint.guide),point=guide?.points[testJoint.index];
  gizmo.enabled=!!point&&display==='result'&&!pose;
  if(!gizmo.enabled){gizmo.detach();helper.visible=false;return;}
  proxy.position.fromArray(point);proxy.scale.setScalar(1);gizmo.setMode('rotate');gizmo.attach(proxy);helper.visible=true;
 }
 function selectTestJoint(joint){
  if(editMode!=='rig-test'||api.rigTest.locked())return;
  const guide=joint&&model.guides.find(g=>g.id===joint.guide);
  if(joint&&(!guide||!guide.points[joint.index+1]))return;
  if(!pose&&joint?.guide===testJoint?.guide&&joint?.index===testJoint?.index)return;
  testJoint=joint;restoreOriginal();renderer.domElement.focus({preventScroll:true});
 }
 const jointAxes={x:new T.Vector3(1,0,0),y:new T.Vector3(0,1,0),z:new T.Vector3(0,0,1)};
 function setTestAngle(axis,value){
  if(!testJoint||editMode!=='rig-test'||pose||api.rigTest.locked()||!jointAxes[axis]||!Number.isFinite(value))return;
  proxy.quaternion.setFromAxisAngle(jointAxes[axis],T.MathUtils.degToRad(T.MathUtils.clamp(value,-90,90)));queueJointPreview();
 }
 function beginTestRotation(mode){
  if(mode!=='rotate'||!testJoint||display!=='result'||pose||api.rigTest.locked())return null;
  const previous=proxy.quaternion.clone(),center=proxy.position.clone(),neutral=new T.Quaternion();let error='';
  api.rigTest.dragging(true);
  return {center,label:'R 试转骨架段',get error(){return error;},
   update({rotation,amount},axis){
    if(axis)api.rigTest.setAxis(axis.toLowerCase());
    const next=rotation.clone().multiply(previous);
    if(Math.abs(amount)>90||neutral.angleTo(next)>Math.PI/2+1e-8){error='单骨试转范围为 ±90°。';return;}
    error='';proxy.quaternion.copy(next);queueJointPreview();
   },
   commit(){api.rigTest.dragging(false);},
   cancel(){proxy.quaternion.copy(previous);queueJointPreview();api.rigTest.dragging(false);}};
 }
 function posedGuidePoints(pose){
  return model.guides.map(g=>({...g,points:g.points.map((p,i)=>new T.Vector3(...p).applyMatrix4(pose.bones.get(g.id)[i]).toArray())}));
 }
 function queueJointPreview(){
  if(testFrame)return;
  testFrame=requestAnimationFrame(()=>{
   testFrame=0;if(!testJoint||editMode!=='rig-test'||pose)return;
   try{
    const neutral=new T.Quaternion(),angle=neutral.angleTo(proxy.quaternion);
    if(angle>Math.PI/2)proxy.quaternion.copy(neutral.slerp(proxy.quaternion,Math.PI/2/angle));
    if(angle<1e-8){if(testGuides)restoreOriginal();else api.rigTest.changed();return;}
    if(testSource?.model!==model)testSource={model,binding:trunkSourceBinding(model)};
    const jointPose=createTrunkJointPose(testSource.binding,testJoint,proxy.quaternion);
    applyPreviewGeometry(new Map(model.primitives.map(p=>[p.id,deformTrunkPrimitive(jointPose,p.id)])),true);
    testGuides=posedGuidePoints(jointPose);
    syncGuides();api.rigTest.changed();
   }catch(error){api.error(error.message);}
  });
 }
 function setWeightMode(state){
  if(!state&&!weightSettings)return;
  weightSettings=state;
  weightOverlay.render(state?.reference||model,state);
  if(!state)weightBrush.reset();else weightBrush.refresh();
  guideControls.refresh();
 }
 function focusViewportPoint(point){
  finishViewportNavigation(controls);
  const target=new T.Vector3(...point),offset=camera.position.clone().sub(controls.target);
  const scale=trunkBounds(model,modelRoot.matrix).getSize(new T.Vector3()).length();
  offset.setLength(Math.min(offset.length(),Math.max(.03,scale*.65)));controls.target.copy(target);camera.position.copy(target).add(offset);controls.update();
 }
 function thumbnail(){const hidden=[guideRoot,reference,helper].map(o=>[o,o.visible]),saved={position:camera.position.clone(),target:controls.target.clone(),near:camera.near,far:camera.far};hidden.forEach(([o])=>o.visible=false);const alpha=renderer.getClearAlpha();renderer.setClearAlpha(1);try{fitView('perspective',false);renderer.render(scene,camera);const canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;canvas.getContext('2d').drawImage(renderer.domElement,0,0,400,300);return canvas.toDataURL('image/webp',.86);}finally{camera.position.copy(saved.position);camera.near=saved.near;camera.far=saved.far;camera.updateProjectionMatrix();controls.target.copy(saved.target);controls.update();renderer.setClearAlpha(alpha);hidden.forEach(([o,v])=>o.visible=v);}}
 const cancelGuide=event=>{if(!adapter&&!modelAdapter&&!testDrag)return;if(event.type==='keydown'&&event.key!=='Escape')return;if(event.type==='pointerdown'&&event.button!==2)return;event.preventDefault();event.stopImmediatePropagation();if(testDrag){proxy.quaternion.copy(testDrag);gizmo.dragging=false;gizmo.axis=null;queueJointPreview();return;}const current=modelAdapter||adapter;modelAdapter=null;adapter=null;modelGesture=false;gizmo.reset();gizmo.dragging=false;controls.enabled=true;current.cancel();};dialog.addEventListener('keydown',cancelGuide,true);host.addEventListener('pointerdown',cancelGuide,true);
 const cancelTestDrag=event=>{if(testDrag)cancelGuide(event);};
 renderer.domElement.addEventListener('pointercancel',cancelTestDrag);window.addEventListener('blur',cancelTestDrag);
 resize();restore=api.native.enterPreview({scene,camera,renderer,canvas:renderer.domElement,isSuspended:()=>disposed,assetIdentity:()=>identity,motionRoot:()=>modelRoot,getRetainedModel:()=>model?{root:modelRoot,revision:modelRevision}:null});loop();
 function focusControl(){if(!selected||!model)return;finishViewportNavigation(controls);const point=guideSelectionCenter(model,api.getGuideSelection()),offset=camera.position.clone().sub(controls.target),length=trunkBounds(model,trunkCalibrationMatrix(model.calibration)).getSize(new T.Vector3()).length();offset.setLength(Math.min(offset.length(),Math.max(.05,length*.9)));controls.target.copy(point);camera.position.copy(point).add(offset);controls.update();}
 const guideKey=e=>{
  if(!dialog.open||keyboard.active||gizmo.dragging||guideControls.active||e.altKey||e.target.matches('input,textarea,select'))return;
  const key=e.key.toLowerCase(),consume=()=>{e.preventDefault();e.stopImmediatePropagation();};
  if(editMode==='rig-test'&&!api.rigTest.locked()&&!e.ctrlKey&&!e.metaKey){
   if(key==='escape'&&(testJoint||pose)){consume();selectTestJoint(null);return;}
   if(testJoint&&!pose&&display==='result'){
    const {guide,index}=testJoint;
    if(key==='f'){consume();focusViewportPoint(model.guides.find(g=>g.id===guide).points[index]);return;}
    if(key==='arrowup'||key==='arrowdown'){
     consume();const last=model.guides.find(g=>g.id===guide).points.length-2;
     selectTestJoint({guide,index:T.MathUtils.clamp(index+(key==='arrowup'?1:-1),0,last)});return;
    }
   }
  }
  if(key==='escape'&&api.escapeGuide()){consume();return;}
  if(analysisLocked||editMode!=='guide'||display!=='result'||(e.ctrlKey||e.metaKey)&&key!=='a')return;
  if((e.ctrlKey||e.metaKey)&&key==='a'){consume();api.selectionAll();}
  else if(key==='delete'||key==='backspace'){consume();api.deleteSelection();}
  else if(key==='b'||key==='v'){consume();api.setSelectionMode(key==='b'?'box':'auto');}
  else if(key==='escape'&&api.getSelectionMode()==='box'){consume();api.setSelectionMode('auto');}
  else if(key==='f'){consume();focusControl();}
  else if(api.getTargetState().target==='point'&&['ArrowUp','ArrowDown'].includes(e.key)&&selected){
   consume();const g=model.guides.find(g=>g.id===selected.guide);
   api.select(g.id,Math.max(0,Math.min(g.points.length-1,selected.index+(e.key==='ArrowUp'?1:-1))));
  }
 };
 dialog.addEventListener('keydown',guideKey,true);
 async function waitForPresentation({required=true,timeout=60000}={}){const token=loadToken;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(disposed||token!==loadToken)throw Error('树干已切换，未显示过期模型。');const state=await api.native.waitForPresentation?.({refresh:true,timeout});if(disposed||token!==loadToken)throw Error('树干已切换，未显示过期模型。');if(required&&state?.available&&!state.presentationReady)throw Error(state.lastError||state.compatibilityReason||(state.presentationTimedOut?'最终树干画面仍在准备，请重试进入骨架；已保存GLB保留。':'最终树干视口尚未就绪。'));return {source:model?.source.sha256,native:state?.native||null,presentationReady:!state?.available||!!state.presentationReady,presentationTimedOut:!!state?.presentationTimedOut,displayError:state?.lastError||state?.compatibilityReason||null};}
 return {rigTest:{select:selectTestJoint,setAngle:setTestAngle,get joint(){return testJoint;},get wholeBend(){return pose;},get rotated(){return !!testGuides&&!pose;},angle(axis){return T.MathUtils.radToDeg(new T.Euler().setFromQuaternion(proxy.quaternion)[axis]);}},waitForPresentation,setWeightMode,focusWeightPoint:focusViewportPoint,getView(){const matrix=display==='source'?trunkCalibrationMatrix(model.calibration):new T.Matrix4();return {version:1,eye:camera.position.clone().applyMatrix4(matrix).toArray(),target:controls.target.clone().applyMatrix4(matrix).toArray(),fov:camera.fov};},setView(value){if(!value||![value.eye,value.target].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)))return;const matrix=display==='source'?trunkCalibrationMatrix(model.calibration).invert():new T.Matrix4(),target=new T.Vector3(...value.target).applyMatrix4(matrix),offset=new T.Vector3(...value.eye).applyMatrix4(matrix).sub(target).multiplyScalar(Math.tan((value.fov||36)*Math.PI/360)/Math.tan(camera.fov*Math.PI/360));camera.position.copy(target).add(offset);controls.target.copy(target);controls.update();},setModel,sync,showCandidateGuides(guides,locked=!!guides){keyboard.cancel();guideControls.cancel();candidateGuides=guides;analysisLocked=locked;sync();},updateGuideModel(next){model=next;poseSource=null;syncGuides();},setEditMode(mode){keyboard.cancel();guideControls.cancel();if(editMode==='rig-test'&&mode!==editMode){restoreOriginal();testJoint=testSource=null;}editMode=mode;sync();},focusControl,beginGuideMove(mode='translate'){return keyboard.begin(mode);},setRepresentation(mode){representation=mode;sync();},fit:fitView,choosePoint,selectControl,chooseTransform,setReference(value){referenceVisible=value;try{localStorage.setItem('treeDuck.trunk-reference',String(value));}catch{}sync();fitView();},get referenceVisible(){return referenceVisible;},showPose,restoreOriginal,thumbnail,get camera(){return camera;},get mode(){return display;},get transformMode(){return transformMode;},get editMode(){return editMode;},get controlPivot(){return proxy.position.clone();},setDisplay(mode){const changed=mode!==display;keyboard.cancel();transformMode='observe';if(pose||testGuides||testFrame)restoreOriginal();display=mode;pick=null;sync();if(changed)fitView();},dispose(){renderer.domElement.removeEventListener('pointercancel',cancelTestDrag);window.removeEventListener('blur',cancelTestDrag);cancelAnimationFrame(testFrame);weightBrush.dispose();weightOverlay.clear(model);keyboard.dispose();guideControls.dispose();dialog.removeEventListener('keydown',guideKey,true);disposed=true;loadToken++;loadAbort?.abort();dialog.removeEventListener('keydown',cancelGuide,true);host.removeEventListener('pointerdown',cancelGuide,true);cancelAnimationFrame(frame);observer.disconnect();restore?.();pointControls.dispose();gizmo.dispose();disposeNavigation();controls.dispose();disposeImportedTrunkTextures(modelRoot);clear(modelRoot);clear(guideRoot);clear(reference);depthMaterial.dispose();renderer.dispose();renderer.domElement.remove();labels.remove();referenceLabels.remove();dimensions.remove();}};
}
