import * as T from './vendor/three.module.min.js';
import {nearestParameter,sampleLine,lineTangent} from './tree-sculpt.js';
import {skeletonBranches} from './skeleton-thickness.js';
import {pickImportedTrunkCarrier} from './imported-trunk-picker.js';
import {assemblyBranchLimit} from './local-assembly-data.js';
import {createSculptBrushWorkflow} from './sculpt-brush-workflow.js';
import {createUnitPaintPreview} from './unit-paint-preview.js';
import {unitPaintRole,sampleUnitPaintStroke,commitPaintedUnits} from './unit-paint-data.js';
import {unitPaintRadialDirection,unitPaintPlacement,unitPaintPlacementOccupancy,acceptsUnitPaintPlacement,unitPaintAxisCandidates} from './unit-paint-placement.js';
import {createUnitPaintAxisPicker} from './unit-paint-axis.js';
import {prepareUnitErase,createUnitEraseScreen,commitErasedUnits} from './unit-paint-erase.js';
import {createUnitErasePreview} from './unit-erase-preview.js';

const $=id=>document.getElementById(id),clamp=T.MathUtils.clamp;
const node=(tag,attributes={})=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attributes))el.setAttribute(k,v);return el;};
export function createUnitPaintController(api,context){
 const {canvas,camera,controls}=api,ray=new T.Raycaster();let source=null,preview=null,stroke=null,committing=false,loading=false,epoch=0,openEpoch=0,pickCache=null,lastHover=null,round=new Set(),carriers=new Set(),project=null,sourceKey='',requestedKey='',paintReady=false;
 let altErase=false,eraseCache=null,eraseProjection=null,pointerInside=false;
 let eraseScreen=null,eraseMarkKey='',moveFrame=0,moves=[],pendingHover=null,heldErase=null,occupancyCache=null;
 const measure=(name,run)=>api.measure?api.measure('brush.paint.'+name,run):run();
 const enabled=()=>api.isTree()&&canvas.dataset.viewportTool==='UNIT_PAINT'&&!api.getSkeletonEditMode();
 const erasing=()=>stroke?stroke.erase:altErase;
 const panel=document.createElement('section');panel.id='unitPaintSettings';
 panel.innerHTML=`<div class="unit-paint-source"><img id="unitPaintSourceImage" alt=""><div><small>当前生成素材</small><strong id="unitPaintSourceName">先在左侧选择单元枝</strong><span id="unitPaintSourceVersion"></span></div></div>
 <p id="unitPaintState" class="wb-note" role="status">选择素材后，在承重枝上单击或拖动。</p>
 <div id="unitPaintMode" class="unit-paint-mode" role="status"><b>＋ 刷生成</b><span>按住 Alt 临时擦除完整单元枝</span></div>
 <label>笔刷半径 · F <output id="unitPaintRadiusValue"></output><input id="unitPaintRadius" type="range" min="20" max="700" step="1" value="160"></label>
 <div class="field-grid"><label>最小间距（cm）<input id="unitPaintSpacing" type="number" min="1" max="500" step="1" value="30"></label><label>完整模型倍率<input id="unitPaintScale" type="number" min="0.01" max="10" step="any" value="1"></label></div>
 <label>母枝范围<select id="unitPaintScope"><option value="VISIBLE">当前可见母枝</option><option value="SELECTED">仅指定母枝</option></select></label>
 <label>刷取方式<select id="unitPaintHitMode"><option value="AXIS">笔刷内母枝 · 穿透前后</option><option value="SURFACE">鼠标命中母枝 · 仅表面</option></select></label>
 <label>生长方向<select id="unitPaintOrientation"><option value="RADIAL">环绕母枝 · 360°</option><option value="SURFACE">沿刷到的表面朝向</option></select></label>
 <label>装配分区<select id="unitPaintRole"><option value="AUTO">自动归区</option><option value="MATURE">内部</option><option value="MIXED">中间</option><option value="YOUNG">末端</option></select></label>
 <details class="companion-advanced"><summary>朝向与变化</summary><div class="field-grid"><label>向枝梢偏转（°）<input id="unitPaintTilt" type="number" min="-60" max="80" value="20"></label><label>随机滚转（±°）<input id="unitPaintRoll" type="number" min="0" max="180" value="15"></label></div></details>
 <div class="unit-paint-summary"><span>已装配 <b id="unitPaintTotal">0</b></span><span>本轮新增 <b id="unitPaintRound">0</b></span></div>
 <p class="wb-note">单击补一支 · 拖动连续生成 · Alt＋左键擦除 · 松手确认 · Esc 取消整笔。擦除穿透笔刷内可见实例，包含挂接子枝；锁定或隐藏家族保留。每笔固定操作，松手后切换。</p>`;
 context.register('UNIT_PAINT','单元枝 · 刷生成',panel);
 const overlay=node('svg',{id:'unitPaintOverlay','aria-hidden':'true',class:'unit-paint-overlay',hidden:''}),axis=node('path'),eraseMarks=node('path',{class:'unit-paint-erase-marks'}),ring=node('circle'),anchor=node('circle',{r:4}),sign=node('text',{'text-anchor':'middle','dominant-baseline':'central'});sign.textContent='+';overlay.append(axis,eraseMarks,ring,anchor,sign);canvas.parentElement.append(overlay);
 const feedback=document.createElement('div');feedback.className='sculpt-feedback unit-paint-feedback';feedback.hidden=true;feedback.innerHTML='<strong></strong><span></span><small></small>';canvas.parentElement.append(feedback);
 const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
 const message=(text,busy=false)=>{$('unitPaintState').textContent=text;api.toastStatus?.(text,busy?'busy':'ready');};
 function settings(){return {radius:Number($('sculptRadius').value),spacing:Number($('unitPaintSpacing').value)/100,scale:Number($('unitPaintScale').value),tilt:Number($('unitPaintTilt').value),roll:Number($('unitPaintRoll').value),scope:$('unitPaintScope').value,role:$('unitPaintRole').value,hitMode:$('unitPaintHitMode').value,orientation:$('unitPaintOrientation').value};}
 function blocked(){return loading||committing||api.isBusy()||api.getAsset()?.group.userData.pending_rebuild||!api.getAsset()||!$('busyOverlay').hidden;}
 const workflow=createSculptBrushWorkflow({canvas,controls,getTool:()=>enabled()?'UNIT_PAINT':'SELECT',brushTools:new Set(['UNIT_PAINT']),hudId:'unitPaintAdjustHud',storageKey:'treeDuck.unitPaintBrush.v1',blocked:()=>Boolean(stroke)||blocked(),refresh:()=>{syncRadius();if(lastHover)hover(lastHover);},hidePreview:()=>{overlay.setAttribute("hidden","");feedback.hidden=true;preview?.hide();},status:api.toastStatus||(()=>{})});
 function syncRadius(){$('unitPaintRadius').value=$('sculptRadius').value;$('unitPaintRadiusValue').textContent=$('sculptRadius').value+' px';}
 $('unitPaintRadius').addEventListener('input',()=>{cancel();$('sculptRadius').value=$('unitPaintRadius').value;$('sculptRadius').dispatchEvent(new Event('input',{bubbles:true}));syncRadius();});
 for(const id of ['unitPaintSpacing','unitPaintScale','unitPaintScope','unitPaintRole','unitPaintTilt','unitPaintRoll','unitPaintHitMode','unitPaintOrientation'])$(id).addEventListener('input',()=>{cancel();if(id==='unitPaintOrientation'&&$('unitPaintOrientation').value==='SURFACE')$('unitPaintHitMode').value='SURFACE';if(id==='unitPaintHitMode'&&$('unitPaintHitMode').value==='AXIS')$('unitPaintOrientation').value='RADIAL';persist();syncMode();if(id==='unitPaintScope'&&$('unitPaintScope').value==='SELECTED'&&!carriers.size)message('尚未指定承重枝：先切到主枝干并选择母枝，再进入刷生成');});
 function persist(){try{localStorage.setItem('treeDuck.unitPaint.v1',JSON.stringify(Object.fromEntries(['unitPaintSpacing','unitPaintScale','unitPaintScope','unitPaintRole','unitPaintTilt','unitPaintRoll','unitPaintHitMode','unitPaintOrientation'].map(id=>[id,$(id).value]))));}catch{}}
 try{const saved=JSON.parse(localStorage.getItem('treeDuck.unitPaint.v1'));for(const[id,value]of Object.entries(saved||{})){const input=$(id);if(!panel.contains(input))continue;const before=input.value;input.value=String(value);if(!input.value||!input.checkValidity())input.value=before;}}catch{}
 function validate(){return [...panel.querySelectorAll('input,select')].every(input=>input.checkValidity()&&input.value!=='');}
 function identity(){const a=api.getAuthoring();return a?.workbench?.project_save?.id||a?.imported_trunks?.mounts?.[0]?.id||a?.branch_shape?.branches?.[0]?.id||'';}
 function refresh(){
  const item=api.selectedAsset();$('unitPaintSourceName').textContent=item?.name||'先在左侧选择单元枝';$('unitPaintSourceVersion').textContent=item?'固定版本 V'+item.revision:'';
  const img=$('unitPaintSourceImage');img.hidden=!item?.thumbnail;if(item?.thumbnail&&img.src!==item.thumbnail)img.src=item.thumbnail;
  $('unitPaintTotal').textContent=String(api.getAuthoring()?.branch_instances.length||0);const current=new Set(api.getAuthoring()?.branch_instances.map(i=>i.id));round=new Set([...round].filter(id=>current.has(id)));$('unitPaintRound').textContent=String(round.size);syncRadius();
  if(project!==identity()){project=identity();round.clear();}
  syncMode();
  $('unitPaintScope').querySelector('option[value="SELECTED"]').textContent='指定母枝（'+carriers.size+' 根）';
  const key=item?item.id+':'+item.revision:'';
  if(enabled()&&paintReady&&!item){cancel();preview?.dispose();preview=null;source=null;paintReady=false;sourceKey='';message('当前生成素材已移出，请在左侧重新选择单元枝');}
  if(stroke&&(stroke.asset!==api.getAsset()||stroke.authoring!==api.getAuthoring()))cancel();
  if(enabled()&&!loading&&!committing&&key&&key!==sourceKey&&key!==requestedKey)open().catch(error=>message(error.message));
  if(!enabled()){overlay.setAttribute("hidden","");feedback.hidden=true;preview?.hide();}
 }
 async function prepare(){
  cancel();const token=++epoch;paintReady=false;loading=true;sourceKey='';preview?.dispose();preview=null;source=null;
  try{const item=api.selectedAsset();if(!item)throw Error('先在左侧「当前工程 · 单元枝素材」选择一款素材，再开始刷生成');if(token!==epoch)return;
   const current=api.selectedAsset();if(current?.id!==item.id)throw Error('素材已切换，请重新进入刷生成');if(!current.sample)throw Error('这款素材缺少完整模型，请在枝条工作台补存完整版本');
   const built=await createUnitPaintPreview(current,api.getAuthoring(),api.modelRoot);if(token!==epoch){built.dispose();return;}preview=built;source=current;sourceKey=current.id+':'+current.revision;paintReady=true;message('就绪 · 左键刷生成，Alt＋左键擦除完整单元枝');
  }catch(error){if(token===epoch){message(error.message);api.toast(error.message,true);}}
  finally{if(token===epoch){loading=false;refresh();}}
 }
 async function open(){
  if(!api.isTree()||loading||committing)return;const item=api.selectedAsset(),request=++openEpoch;
  if(!enabled()){const bones=new Set(skeletonBranches(api.getAsset()?.masterBranches||[]).map(b=>b.stableId));carriers=new Set([...api.getSelections()].filter(id=>bones.has(id)));}
  if(!item){await api.unitMode();api.setTool('UNIT_PAINT');context.setMode('UNIT_PAINT');refresh();message('先在左侧选择一款完整单元枝，再点击刷生成');return;}
  loading=true;requestedKey=item.id+':'+item.revision;
  try{await api.ensureSource(item.id);if(request!==openEpoch||api.selectedAsset()?.id!==item.id)return;await api.unitMode();if(request!==openEpoch||!api.isTree()||api.getSkeletonEditMode()||api.selectedAsset()?.id!==item.id)return;
   round.clear();api.setTool('UNIT_PAINT');workflow.switchTool('UNIT_PAINT');context.setMode('UNIT_PAINT');await prepare();
  }finally{loading=false;}
 }
 function picker(){
  camera.updateMatrixWorld();
  const asset=api.getAsset(),signature=camera.matrixWorld.elements.join(',')+'/'+camera.projectionMatrix.elements.join(',')+'/'+$('unitPaintScope').value+'/'+$('unitPaintHitMode').value+'/'+[...carriers].join(',');
  if(pickCache?.asset===asset&&pickCache.signature===signature)return pickCache;
  const bones=skeletonBranches(asset.masterBranches).filter(b=>(!api.isVisible||api.isVisible(b.stableId))&&($('unitPaintScope').value!=='SELECTED'||carriers.has(b.stableId))),ids=new Set(bones.map(b=>b.stableId)),meshes=[],bindings=new Map();
  asset.group.updateWorldMatrix(true,true);camera.updateMatrixWorld();
  if($('unitPaintHitMode').value==='SURFACE')asset.group.traverse(o=>{if(!o.isMesh)return;for(let p=o;p&&p!==asset.group.parent;p=p.parent)if(!p.visible)return;if(o.userData.imported_trunk){meshes.push(o);return;}if(o.userData.category!=='branch')return;const binding=asset.editPreviewBindings?.(o);if(ids.has(o.userData.stable_id)||binding?.instances?.some(i=>ids.has(i.object().userData.stable_id))){meshes.push(o);if(binding?.instances)bindings.set(o,binding.instances);}});
  const rect=canvas.getBoundingClientRect(),view=camera.matrixWorldInverse.elements,screen=bones.map(b=>({branch:b,points:b.points.map(p=>{const q=asset.group.localToWorld(p.clone()),depth=camera.isPerspectiveCamera?-(view[2]*q.x+view[6]*q.y+view[10]*q.z+view[14]):null;q.project(camera);return {x:(q.x*.5+.5)*rect.width,y:(.5-q.y*.5)*rect.height,z:q.z,depth};})}));
  return pickCache={asset,signature,rect,bones,ids,meshes,bindings,screen,byId:new Map(bones.map(b=>[b.stableId,b])),axisPicker:createUnitPaintAxisPicker(api.getAuthoring(),asset.masterBranches)};
 }
 function hitAt(point){
  const data=picker(),{asset,rect}=data;if(point[0]<0||point[1]<0||point[0]>rect.width||point[1]>rect.height)return null;
  const cast=screen=>{ray.setFromCamera(new T.Vector2(screen[0]/rect.width*2-1,1-screen[1]/rect.height*2),camera);
   for(const hit of ray.intersectObjects(data.meshes,false)){
    if(hit.object.userData.imported_trunk){const target=pickImportedTrunkCarrier(asset,api.getAuthoring(),hit);if(target&&data.ids.has(target.parent))return target;continue;}
    const descriptor=data.bindings.get(hit.object)?.[hit.instanceId],id=descriptor?.object().userData.stable_id||hit.object.userData.stable_id,parent=data.bones.find(b=>b.stableId===id);if(!parent)continue;
    const local=asset.group.worldToLocal(hit.point.clone()),t=clamp(nearestParameter(parent.points,local),.02,.98),normal=hit.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld)).transformDirection(asset.group.matrixWorld.clone().invert());
    return {parent:id,attach:t,surface_frame:{position:sampleLine(parent.points,t),direction:normal}};
   }return null;};
  let target=cast(point);if(target)return target;
  let nearest=null;for(const entry of data.screen)for(let n=1;n<entry.points.length;n++){const a=entry.points[n-1],b=entry.points[n];if(a.z< -1||a.z>1||b.z< -1||b.z>1)continue;const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((point[0]-a.x)*dx+(point[1]-a.y)*dy)/Math.max(1e-8,dx*dx+dy*dy),0,1),p=[a.x+dx*t,a.y+dy*t],distance=Math.hypot(p[0]-point[0],p[1]-point[1]);if(distance<settings().radius&&(!nearest||distance<nearest.distance))nearest={point:p,distance};}
  return nearest?cast(nearest.point):null;
 }
 function record(target,attempt=0,s=settings()){
  const parent=pickCache?.byId.get(target.parent)||api.getAsset().masterBranches.find(b=>b.stableId===target.parent);if(!parent||target.attach<.02||target.attach>.98)return null;
  const t=target.attach,position=sampleLine(parent.points,t),tangent=lineTangent(parent.points,t),normal=s.orientation==='RADIAL'?unitPaintRadialDirection(parent,t,s.spacing,attempt):target.surface_frame.direction.clone().normalize(),direction=normal.multiplyScalar(Math.cos(s.tilt*Math.PI/180)).addScaledVector(tangent,Math.sin(s.tilt*Math.PI/180)).normalize();
  const placement=unitPaintPlacement({parent:target.parent,attach:t},parent,position,direction,api.getSettings());
  let frame={position:position.toArray(),parent_position:position.toArray(),parent_tangent:tangent.toArray(),direction:direction.toArray()};
  if(target.trunk_anchor){frame={...target.frame,position:target.surface_binding.rest.position.toArray(),direction:direction.applyQuaternion(target.surface_binding.rotation.clone().invert()).toArray()};}
  const id='PAINT_'+crypto.randomUUID().replaceAll('-',''),rollSeed=[...target.parent+':'+t.toFixed(3)].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261)/0xffffffff;
  const instance={id,asset_id:source.id,linked:true,pinned_revision:source.revision,parent:target.parent,attach:t,frame,...(target.trunk_anchor?{trunk_anchor:structuredClone(target.trunk_anchor)}:{}),shootRole:unitPaintRole(t,s.role),angle:90,azimuth:0,roll:(rollSeed*2-1)*s.roll,scale:s.scale,seed:42,variation:0,radius_scale:1,assembly_manual:true};
  return {instance,position,binding:target.surface_binding,placement};
 }
 function occupied(){const asset=api.getAsset(),a=api.getAuthoring();if(occupancyCache?.asset!==asset||occupancyCache.authoring!==a||occupancyCache.branches!==asset.masterBranches)occupancyCache={asset,authoring:a,branches:asset.masterBranches,entries:unitPaintPlacementOccupancy(a,asset.masterBranches,api.getSettings())};return occupancyCache.entries;}
 function planAt(point){
  const s=settings(),data=picker(),candidates=s.hitMode==='AXIS'?unitPaintAxisCandidates(data.screen,point,s.radius):[hitAt(point)].filter(Boolean),used=new Map(),records=[],pending=stroke?.pending.length||0,cap=Math.max(0,Math.min(128-pending,1600-api.getAuthoring().branch_instances.length-pending,Math.floor((assemblyBranchLimit(api.getAuthoring())-data.asset.masterBranches.length)/source.shape.branches.length)-pending));let missing=0,spacing=0;
  for(const entry of stroke?.occupied||occupied()){if(!used.has(entry.parent))used.set(entry.parent,[]);used.get(entry.parent).push(entry);}
  for(const candidate of candidates){if(records.length>=cap)break;const target=candidate.surface_frame?candidate:data.axisPicker(candidate.parent,candidate.attach);if(!target){missing++;continue;}
   let accepted=null;for(let attempt=0;attempt<(s.orientation==='RADIAL'?8:1);attempt++){const next=record(target,attempt,s);if(next&&acceptsUnitPaintPlacement(next.placement,used.get(target.parent)||[],s.spacing)){accepted=next;break;}}
   if(accepted){records.push(accepted);if(!used.has(target.parent))used.set(target.parent,[]);used.get(target.parent).push(accepted.placement);}else spacing++;
  }
  return {records,candidates:candidates.length,reason:!cap?'已达到本笔或当前工程装配上限':records.length?'松手确认 · Esc 取消整笔':spacing?'间距不足 · 本母枝的相近周向位置已有单元枝':missing?'当前母枝缺少可用挂接来源':'未命中母枝 · 调整笔刷半径或母枝范围'};
 }
 function pointAt(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
 function syncMode(){const erase=erasing(),s=settings(),mode=$('unitPaintMode');mode.classList.toggle('erasing',erase);mode.querySelector('b').textContent=erase?'− 擦除完整单元枝':s.orientation==='RADIAL'?'＋ 环绕刷生成':'＋ 表面刷生成';mode.querySelector('span').textContent=erase?'穿透可见实例 · 包含挂接子枝 · 松手确认':(s.hitMode==='AXIS'?'穿透前后母枝':'仅刷到的表面母枝')+' · '+(s.orientation==='RADIAL'?'360° 生长':'表面朝向')+' · Alt 擦除';overlay.classList.toggle('erasing',erase);sign.textContent=erase?'−':'+';document.dispatchEvent(new CustomEvent('unit-paint-mode',{detail:{erase}}));}
 function setAlt(value){if(altErase===value)return;altErase=value;if(value&&!stroke)eraseCache=eraseProjection=null;syncMode();if(pointerInside&&lastHover&&!stroke)hover(lastHover);}
 function erasePlan(){
  const asset=api.getAsset(),authoring=api.getAuthoring(),scope=$('unitPaintScope').value;
  if(eraseCache?.asset===asset&&eraseCache.authoring===authoring&&eraseCache.scope===scope)return eraseCache.plan;
  const plan=prepareUnitErase({authoring,branches:asset.masterBranches,placements:[...(asset.masterPlacements||[]),...(asset.treeOrgans||[])],isVisible:api.isVisible,carriers:scope==='SELECTED'?carriers:null});
  eraseCache={asset,authoring,scope,plan};return plan;
 }
 function projector(){const asset=api.getAsset(),rect=canvas.getBoundingClientRect();camera.updateMatrixWorld();asset.group.updateWorldMatrix(true,false);const view=camera.matrixWorldInverse.clone().multiply(asset.group.matrixWorld),clip=camera.projectionMatrix.clone().multiply(view),key=clip.elements.join(',')+'/'+rect.width+'/'+rect.height;
  if(eraseProjection?.asset===asset&&eraseProjection.key===key)return eraseProjection.project;
  const cache=new WeakMap(),e=clip.elements,v=view.elements,project=p=>{if(cache.has(p))return cache.get(p);const x=p.x??p[0],y=p.y??p[1],z=p.z??p[2],w=e[3]*x+e[7]*y+e[11]*z+e[15],q={x:((e[0]*x+e[4]*y+e[8]*z+e[12])/w*.5+.5)*rect.width,y:(.5-(e[1]*x+e[5]*y+e[9]*z+e[13])/w*.5)*rect.height,z:(e[2]*x+e[6]*y+e[10]*z+e[14])/w,behind:v[2]*x+v[6]*y+v[10]*z+v[14]>=0};cache.set(p,q);return q;};eraseProjection={asset,key,project};return project;
 }
 function screenErase(){const plan=stroke?.erasePlan||erasePlan(),project=projector();if(!eraseScreen||eraseScreen.plan!==plan||eraseScreen.project!==project){eraseScreen={plan,project,index:measure('erase_index',()=>createUnitEraseScreen(plan.entries,project))};eraseMarkKey='';}return eraseScreen.index;}
 function eraseAt(point){return screenErase().query(point,settings().radius);}
 function showErase(point,hits){
  show(point,null,true);const entries=stroke?.erasePlan?.entries||erasePlan().entries,pending=stroke?.removed||new Set(hits.filter(e=>!e.reason).flatMap(e=>[...e.family])),blocked=hits.filter(e=>e.reason);
  const screen=screenErase(),key=[...pending].sort().join('|');if(key!==eraseMarkKey){eraseMarkKey=key;eraseMarks.setAttribute('d',[...pending].map(id=>screen.paths.get(id)||'').join(' '));}
  if(stroke?.erase)stroke.erasePreview.hide(pending);
  feedback.querySelector('strong').textContent=stroke?'擦除 · 本笔移除 '+pending.size+' 支':'Alt 擦除 · 命中 '+pending.size+' 支';feedback.querySelector('span').textContent=blocked.length?'跳过 '+blocked.length+' 组 · '+blocked[0].reason:'完整单元枝 · 含挂接子枝';feedback.querySelector('small').textContent=stroke?'已即时隐藏 · 松手确认 · Esc 恢复整笔':'按住 Alt＋左键刷除 · Esc 取消';
 }
 function show(point,target,erase=false,plan=null){
  const asset=api.getAsset(),rect=canvas.getBoundingClientRect();overlay.removeAttribute("hidden");overlay.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);Object.assign(overlay.style,{left:canvas.offsetLeft+'px',top:canvas.offsetTop+'px',width:rect.width+'px',height:rect.height+'px'});
  ring.setAttribute('cx',point[0]);ring.setAttribute('cy',point[1]);ring.setAttribute('r',settings().radius);sign.setAttribute('x',point[0]);sign.setAttribute('y',point[1]);
  const targets=Array.isArray(target)?target:target?[target]:[],first=targets[0],parent=first&&pickCache?.byId.get(first.instance.parent),project=p=>{const q=asset.group.localToWorld(p.clone()).project(camera);return [(q.x*.5+.5)*rect.width,(.5-q.y*.5)*rect.height];};
  axis.setAttribute('d',parent?parent.points.map((p,n)=>(n?'L':'M')+project(p).join(',')).join(' '):'');anchor.style.display=first?'':'none';if(first){const p=project(first.position);anchor.setAttribute('cx',p[0]);anchor.setAttribute('cy',p[1]);}
  if(erase)preview?.hide();else preview?.set(stroke?.pending||[],stroke?null:target,asset);if(!erase){eraseMarks.setAttribute('d','');eraseMarkKey='';}feedback.hidden=false;feedback.style.left=canvas.offsetLeft+Math.max(8,Math.min(rect.width-270,point[0]+20))+'px';feedback.style.top=canvas.offsetTop+Math.max(8,Math.min(rect.height-88,point[1]+25))+'px';
  if(!erase){feedback.querySelector('strong').textContent=stroke?'刷生成 · 本笔新增 '+stroke.pending.length+' 支':plan?.records.length?'可生成 '+plan.records.length+' 支 · '+(settings().hitMode==='AXIS'?'穿透刷取':'表面刷取'):'刷生成 · 暂不可新增';feedback.querySelector('span').textContent=source?source.name+' · V'+source.revision:'';feedback.querySelector('small').textContent=stroke?.reason||plan?.reason||('间距 '+Math.round(settings().spacing*100)+' cm · Alt 擦除完整单元枝');}
 }
 function hover(e){lastHover={clientX:e.clientX,clientY:e.clientY};if(!enabled()||blocked()||workflow.adjusting)return;const point=pointAt(e);if(erasing()){showErase(point,eraseAt(point));return;}if(!paintReady)return;const plan=measure('pick',()=>planAt(point));show(point,plan.records.slice(0,12),false,plan);}
 function dab(point){const s=stroke;if(!s)return;if(s.erase){for(const entry of eraseAt(point))if(!entry.reason)for(const id of entry.family)s.removed.add(id);return;}const plan=planAt(point);for(const next of plan.records){s.pending.push(next);s.occupied.push(next.placement);}s.reason=plan.reason;
 }
 function drag(e,final=false,render=true){if(!stroke)return;if(stroke.asset!==api.getAsset()||stroke.authoring!==api.getAuthoring()||blocked()){cancel();return;}const point=pointAt(e),samples=sampleUnitPaintStroke(stroke.samplePoint,point);samples.points.forEach(dab);stroke.samplePoint=samples.last;if(final&&Math.hypot(point[0]-samples.last[0],point[1]-samples.last[1])>.01)dab(point);if(render){if(stroke.erase)showErase(point,eraseAt(point));else show(point,null);}}
 function clearMoves(){if(moveFrame)cancelAnimationFrame(moveFrame);moveFrame=0;moves=[];pendingHover=null;}
 function processMoves(){moveFrame=0;const queue=moves;moves=[];if(stroke){for(const e of queue)drag(e,false,false);if(stroke&&queue.length){const point=pointAt(queue.at(-1));if(stroke.erase)showErase(point,eraseAt(point));else show(point,null);}}else if(pendingHover){const e=pendingHover;pendingHover=null;hover(e);}}
 function queueMove(e){const value={clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId};if(stroke)moves.push(value);else pendingHover=value;if(!moveFrame)moveFrame=requestAnimationFrame(()=>measure('frame',processMoves));}
 function release(){const s=stroke;if(!s)return null;stroke=null;clearMoves();controls.enabled=s.controls;if(canvas.hasPointerCapture(s.pointerId))canvas.releasePointerCapture(s.pointerId);return s;}
 function cancel(){clearMoves();const s=release();s?.erasePreview?.restore();preview?.hide();overlay.setAttribute("hidden","");feedback.hidden=true;syncMode();if(s)message(s.erase?'已取消本笔擦除，全部单元枝保留':'已取消本笔生成，原模型保持');return Boolean(s);}
 async function finish(e){if(!stroke||e.pointerId!==stroke.pointerId)return;if(moveFrame)cancelAnimationFrame(moveFrame);processMoves();drag(e,true);const s=release();if(!s)return;
  if(s.erase){if(!s.removed.size){overlay.setAttribute('hidden','');feedback.hidden=true;syncMode();message('未移除 · 笔刷没有命中可擦除的单元枝，锁定或隐藏家族保留');return;}
   committing=true;heldErase=s;try{await new Promise(requestAnimationFrame);if(api.getAuthoring()!==s.authoring)return;api.transact('擦除 '+s.removed.size+' 支完整单元枝',a=>commitErasedUnits(a,s.removed),{bypassLayers:true,deferControls:true});await api.flush();const live=new Set(api.getAsset().masterBranches.map(b=>b.stableId));api.setSelections(new Set(s.selection.filter(id=>live.has(id))));message('已移除 '+s.removed.size+' 支完整单元枝 · Ctrl+Z 撤销');}
   catch(error){api.toast(error.message,true);}finally{s.erasePreview.restore();heldErase=null;committing=false;eraseCache=pickCache=null;overlay.setAttribute('hidden','');feedback.hidden=true;refresh();}return;
  }
  if(!s.pending.length){preview?.hide();message('本笔没有新增 · 请靠近母枝或减小最小间距');return;}
  committing=true;try{await new Promise(requestAnimationFrame);if(api.getAuthoring()!==s.authoring)return;api.transact('刷生成 '+s.pending.length+' 支完整单元枝',a=>commitPaintedUnits(a,source,s.pending.map(p=>p.instance)),{bypassLayers:true,deferControls:true});await api.flush();
   for(const p of s.pending)round.add(p.instance.id);const live=new Set(api.getAuthoring().branch_instances.map(i=>i.id));round=new Set([...round].filter(id=>live.has(id)));
   const roots=api.getAsset().masterBranches.filter(b=>round.has(b.instanceId)).filter(b=>{const parent=api.getAsset().masterBranches.find(p=>p.id===b.parentId);return parent?.instanceId!==b.instanceId;}).map(b=>b.stableId);
   api.setSelections(new Set(roots));message('已新增 '+s.pending.length+' 支 · 本轮已选 '+round.size+' 支');
  }catch(error){api.toast(error.message,true);}finally{committing=false;preview?.hide();overlay.setAttribute("hidden","");feedback.hidden=true;pickCache=null;refresh();}
 }
 canvas.addEventListener('pointerdown',e=>{if(!enabled()||e.button===1||e.button===4)return;if(e.button===2){consume(e);cancel();return;}if(e.button!==0||e.ctrlKey||e.shiftKey||e.metaKey)return;consume(e);canvas.focus({preventScroll:true});setAlt(e.altKey);if(blocked()||workflow.adjusting)return;if(!altErase&&!paintReady){message('请先在左侧选择完整单元枝素材；Alt 可直接擦除已装配实例');return;}if(!altErase&&!validate()){message('请检查笔刷参数的数值范围');return;}
  clearMoves();stroke={pointerId:e.pointerId,asset:api.getAsset(),authoring:api.getAuthoring(),controls:controls.enabled,pending:[],erase:altErase,removed:new Set(),erasePlan:altErase?erasePlan():null,erasePreview:altErase?createUnitErasePreview(api.getAsset()):null,selection:[...api.getSelections()],occupied:altErase?[]:[...occupied()],samplePoint:pointAt(e),reason:''};controls.enabled=false;canvas.setPointerCapture(e.pointerId);syncMode();dab(stroke.samplePoint);if(stroke.erase)showErase(stroke.samplePoint,eraseAt(stroke.samplePoint));else show(stroke.samplePoint,null);
 },true);
 canvas.addEventListener('pointermove',e=>{pointerInside=true;if(!enabled())return;if(stroke){consume(e);if(e.pointerId===stroke.pointerId)queueMove(e);}else if(!e.buttons){setAlt(e.altKey);queueMove(e);}},true);
 canvas.addEventListener('pointerup',e=>{if(!enabled()||!stroke||e.button!==0)return;consume(e);finish(e);},true);
 canvas.addEventListener('pointercancel',()=>cancel(),true);canvas.addEventListener('lostpointercapture',()=>{if(stroke)cancel();},true);
 canvas.addEventListener('pointerleave',()=>{pointerInside=false;if(!stroke){clearMoves();overlay.setAttribute("hidden","");feedback.hidden=true;preview?.hide();}});
 canvas.addEventListener('contextmenu',e=>{if(enabled()){consume(e);cancel();}},true);
 window.addEventListener('keydown',e=>{if(!enabled()||document.querySelector('dialog[open]'))return;if(e.key==='Alt'&&(pointerInside||stroke)){e.preventDefault();setAlt(true);return;}if(e.target?.isContentEditable||e.target?.matches?.('input,textarea,select'))return;if(e.key==='Escape'&&(stroke||workflow.adjusting)){consume(e);cancel();workflow.cancel();}else if(stroke&&(e.ctrlKey||e.metaKey||['g','r','s','Delete'].includes(e.key)))cancel();},true);
 window.addEventListener('keyup',e=>{if(e.key==='Alt')setAlt(false);},true);
 window.addEventListener('blur',()=>{pointerInside=false;cancel();setAlt(false);});document.addEventListener('visibilitychange',()=>{if(document.hidden){pointerInside=false;cancel();setAlt(false);}});controls.addEventListener('change',()=>{pickCache=null;if(enabled()&&!stroke&&pointerInside&&lastHover)queueMove(lastHover);});
 document.addEventListener('tree-assembly-refreshed',()=>{eraseCache=pickCache=null;refresh();});
 function toolChanged(next){cancel();workflow.switchTool(next);eraseCache=null;if(next!=='UNIT_PAINT'){setAlt(false);epoch++;loading=false;paintReady=false;sourceKey='';preview?.dispose();preview=null;source=null;pickCache=occupancyCache=eraseScreen=eraseProjection=null;}}
 return {open,toolChanged,cancel,refresh,releaseDisplay(owner){if(heldErase?.asset===owner)heldErase.erasePreview.restore();},reset(){openEpoch++;toolChanged('SELECT');round.clear();carriers.clear();project=null;},get active(){return Boolean(stroke)||committing||loading||workflow.adjusting;},get debug(){return {ready:paintReady,loading,committing,erase:erasing(),pending:(stroke?.pending.length||0)+(stroke?.removed.size||0),removed:[...(stroke?.removed||[])],round:[...round],carriers:[...carriers],source:source?.id,preview:preview?.root};}};
}
