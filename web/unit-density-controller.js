import * as T from './vendor/three.module.min.js';
import {sampleLine,lineTangent} from './tree-sculpt.js';
import {skeletonBranches} from './skeleton-thickness.js';
import {assemblyBranchLimit} from './local-assembly-data.js';
import {createSculptBrushWorkflow} from './sculpt-brush-workflow.js';
import {createUnitPaintPreview} from './unit-paint-preview.js';
import {createUnitErasePreview} from './unit-erase-preview.js';
import {createUnitEraseScreen} from './unit-paint-erase.js';
import {sampleUnitPaintStroke} from './unit-paint-data.js';
import {createUnitPaintAxisPicker} from './unit-paint-axis.js';
import {unitPaintRadialDirection,unitPaintPlacement,unitPaintPlacementOccupancy} from './unit-paint-placement.js';
import {prepareUnitDensity,createDensityLedger,touchDensity,densityGroups,densityGroupQuotas,densityKey,densitySourceKey,nextDensityTemplate,planDensityThinning,commitDensityUnits} from './unit-density-data.js';
import {createDensityGapSearch} from './unit-density-spatial.js';

const $=id=>document.getElementById(id),frame=()=>new Promise(requestAnimationFrame);
export function createUnitDensityController(api,context){
 const {canvas,camera,controls}=api;let stroke=null,held=null,committing=false,alt=false,inside=false,last=null,cache=null,modelCache=null,layoutCache=null,raf=0,moves=[],epoch=0,modeSignature='',overlayLayout='';
 const previews=new Map(),pending=new Map();
 const enabled=()=>api.isTree()&&canvas.dataset.viewportTool==='UNIT_DENSITY'&&!api.getSkeletonEditMode();
 const measure=(name,run)=>api.measure?api.measure('brush.density.'+name,run):run();
 const blocked=()=>committing||api.isBusy()||!api.getAsset()||api.getAsset().group.userData.pending_rebuild||!$('busyOverlay').hidden;
 const thinning=()=>stroke?stroke.thin:($('unitDensityMode').value==='THIN')!==alt;
 const panel=document.createElement('section');panel.id='unitDensitySettings';
 panel.innerHTML=`<div class="unit-density-heading"><b>局部密度</b><span>沿用区域内的完整单元枝与固定版本</span></div>
 <input id="unitDensityMode" type="hidden" value="GROW"><div class="unit-density-modes" role="group" aria-label="密度操作"><button type="button" data-density-mode="GROW" aria-pressed="true">＋ 加密</button><button type="button" data-density-mode="THIN" aria-pressed="false">－ 疏化</button></div>
 <p id="unitDensityState" class="wb-note" role="status">先选择树上单元枝，或明确切换到全部可见。</p>
 <label>笔刷半径 · F <output id="unitDensityRadiusValue"></output><input id="unitDensityRadius" type="range" min="20" max="700" step="1" value="160"></label>
 <label>每笔变化比例 · Shift＋F <output id="unitDensityStrengthValue"></output><input id="unitDensityStrength" type="range" min="1" max="80" step="1" value="20"></label>
 <label>作用范围<select id="unitDensityScope"><option value="SELECTED">当前选区 · 含挂接子枝</option><option value="VISIBLE">全部可见单元枝</option></select></label>
 <div class="field-grid"><label>刷取层<select id="unitDensityLayer"><option value="THROUGH">穿透前后</option><option value="FRONT">前层挂接点</option></select></label><label>前层深度（m）<input id="unitDensityDepth" type="number" min="0.01" max="100" step="0.1" value="1.5"></label></div>
 <label class="unit-density-protection"><input id="unitDensityProtect" type="checkbox" checked>保护精修单元枝</label>
 <div class="unit-density-tally" aria-live="polite"><span>本笔新增 <b id="unitDensityAdded">0</b></span><span>本笔减少 <b id="unitDensityRemoved">0</b></span><span>保护 <b id="unitDensityProtected">0</b></span></div>
 <p class="wb-note">按挂接点刷取，少量补充或逐步疏化；每个母枝分区至少保留一支。按住 Alt 临时反向，松手后恢复。锁定家族始终保留。</p>
 <details class="companion-advanced"><summary>操作与范围说明</summary><p class="wb-note">左键拖动 · 松手确认 · Esc／右键取消整笔 · Ctrl＋Z 一步撤销。往返刷过同一处不会在一笔里反复累乘。加密保持原有实例，沿选中实例的母枝补空；新增自动加入当前选区。没有完整源模型时会明确提示；树干上全新的空白区域请使用「刷生成」。</p></details>`;
 context.register('UNIT_DENSITY','单元枝 · 密度刷',panel);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='unitDensityOverlay';svg.classList.add('unit-paint-overlay','unit-density-overlay');svg.setAttribute('hidden','');svg.innerHTML='<path class="unit-density-marks"></path><circle/><text text-anchor="middle" dominant-baseline="central">+</text>';canvas.parentElement.append(svg);
 const hud=document.createElement('div');hud.className='sculpt-feedback unit-density-feedback';hud.hidden=true;hud.innerHTML='<strong></strong><span></span><small></small>';canvas.parentElement.append(hud);
 const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
 const setText=(el,text)=>{if(el.textContent!==String(text))el.textContent=text;};
 const message=text=>{setText($('unitDensityState'),text);api.toastStatus?.(text,'ready');};
 const settings=()=>({radius:Number($('sculptRadius').value),strength:Math.min(.8,Number($('sculptStrength').value)),scope:$('unitDensityScope').value,protectRefined:$('unitDensityProtect').checked,layer:$('unitDensityLayer').value,depth:Number($('unitDensityDepth').value)});
 function sync(){
  const signature=[$('sculptRadius').value,$('sculptStrength').value,$('unitDensityScope').value,$('unitDensityLayer').value,thinning()].join('|');if(signature===modeSignature)return;modeSignature=signature;
  $('unitDensityRadius').value=$('sculptRadius').value;$('unitDensityRadiusValue').textContent=$('sculptRadius').value+' px';
  $('unitDensityStrength').value=Math.round(settings().strength*100);$('unitDensityStrengthValue').textContent=Math.round(settings().strength*100)+'%';
  $('unitDensityDepth').disabled=$('unitDensityLayer').value!=='FRONT';
  for(const b of panel.querySelectorAll('[data-density-mode]')){const on=b.dataset.densityMode===(thinning()?'THIN':'GROW');b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}
  svg.classList.toggle('erasing',thinning());svg.querySelector('text').textContent=thinning()?'−':'+';
  document.dispatchEvent(new CustomEvent('unit-density-mode'));
 }
 const workflow=createSculptBrushWorkflow({canvas,controls,getTool:()=>enabled()?'UNIT_DENSITY':'SELECT',brushTools:new Set(['UNIT_DENSITY']),hudId:'unitDensityAdjustHud',storageKey:'treeDuck.unitDensityBrush.v1',blocked:()=>!!stroke||blocked(),refresh:()=>{sync();if(last)hover(last);},hidePreview:hide,status:api.toastStatus||(()=>{})});
 $('unitDensityRadius').oninput=()=>{const value=$('unitDensityRadius').value;cancel();$('sculptRadius').value=value;$('sculptRadius').dispatchEvent(new Event('input',{bubbles:true}));sync();};
 $('unitDensityStrength').oninput=()=>{const value=$('unitDensityStrength').value;cancel();$('sculptStrength').value=Number(value)/100;$('sculptStrength').dispatchEvent(new Event('input',{bubbles:true}));sync();};
 const controlsIds=['unitDensityScope','unitDensityLayer','unitDensityDepth','unitDensityProtect'];
 function persist(){try{localStorage.setItem('treeDuck.unitDensity.v1',JSON.stringify(Object.fromEntries(controlsIds.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]))));}catch{}}
 try{const saved=JSON.parse(localStorage.getItem('treeDuck.unitDensity.v1'));for(const id of controlsIds)if(saved&&Object.hasOwn(saved,id)){const input=$(id),old=input.value;if(input.type==='checkbox')input.checked=!!saved[id];else{input.value=saved[id];if(!input.value||!input.checkValidity())input.value=old;}}}catch{}
 for(const id of controlsIds)$(id).oninput=()=>{cancel();cache=modelCache=null;persist();sync();refresh();};
 for(const b of panel.querySelectorAll('[data-density-mode]'))b.onclick=()=>{cancel();$('unitDensityMode').value=b.dataset.densityMode;sync();if(last)hover(last);};
 function layout(){return layoutCache||=(canvas.getBoundingClientRect());}
 function point(e){const r=stroke?.data.rect||layout();return [e.clientX-r.left,e.clientY-r.top];}
 function data(){
  const asset=api.getAsset(),authoring=api.getAuthoring(),s=settings(),rect=layout();camera.updateMatrixWorld();asset.group.updateWorldMatrix(true,false);
  const scopeKey=[...api.getSelections(),s.scope,s.protectRefined,api.isIsolated?.()].join('|'),view=camera.matrixWorldInverse.clone().multiply(asset.group.matrixWorld),clip=camera.projectionMatrix.clone().multiply(view),key=[...clip.elements,rect.left,rect.top,rect.width,rect.height,scopeKey].join('|');
  if(cache?.asset===asset&&cache.authoring===authoring&&cache.branches===asset.masterBranches&&cache.key===key)return cache;
  const project=p=>{const v=p.clone().applyMatrix4(view),q=p.clone().applyMatrix4(clip);return {x:(q.x*.5+.5)*rect.width,y:(.5-q.y*.5)*rect.height,z:q.z,depth:-v.z,behind:v.z>=0};};
  if(!modelCache||modelCache.asset!==asset||modelCache.authoring!==authoring||modelCache.branches!==asset.masterBranches||modelCache.key!==scopeKey){
   const modelSettings=asset.settings,plan=measure('prepare',()=>prepareUnitDensity({authoring,branches:asset.masterBranches,placements:[...(asset.masterPlacements||[]),...(asset.treeOrgans||[])],selected:api.getSelections(),scope:s.scope,protectRefined:s.protectRefined,isVisible:api.isVisible})),carriers=new Map(skeletonBranches(asset.masterBranches).filter(b=>!api.isVisible||api.isVisible(b.stableId)).map(b=>[b.stableId,b]));
   modelCache={asset,authoring,branches:asset.masterBranches,key:scopeKey,plan,modelSettings,carriers,occupancy:unitPaintPlacementOccupancy(authoring,asset.masterBranches,modelSettings),axisPicker:createUnitPaintAxisPicker(authoring,asset.masterBranches)};
  }
  const entries=modelCache.plan.entries.map(e=>({...e,lines:[[e.position,e.position]],screen:project(e.position)})),screen=createUnitEraseScreen(entries,project);
  return cache={...modelCache,key,rect,plan:{...modelCache.plan,entries},screen,project};
 }
 function hitsAt(p,d=stroke?.data||data()){
  const s=stroke?.settings||settings(),hits=d.screen.query(p,s.radius).filter(e=>e.screen.depth>0);
  if(s.layer!=='FRONT'||!hits.length)return hits;
  const nearest=Math.min(...hits.map(e=>e.screen.depth));return hits.filter(e=>e.screen.depth<=nearest+s.depth);
 }
 function previewFor(item){
  const key=item.id+':'+item.revision;if(previews.has(key))return Promise.resolve(previews.get(key));if(pending.has(key))return pending.get(key);
  const token=epoch,promise=createUnitPaintPreview(item,api.getAuthoring(),api.modelRoot,{owner:api.getAsset(),includeHover:false,resolvedScale:true}).then(p=>{if(token!==epoch){p.dispose();return null;}previews.set(key,p);if(stroke)render(stroke.last);return p;}).catch(error=>{message('完整模型预览未就绪：'+error.message);return null;}).finally(()=>{if(pending.get(key)===promise)pending.delete(key);});pending.set(key,promise);return promise;
 }
 function hide(){svg.setAttribute('hidden','');hud.hidden=true;for(const p of previews.values())p.hide();}
 function render(p,hits=hitsAt(p)){
  const r=stroke?.data.rect||layout(),s=stroke?.settings||settings(),thin=thinning(),protectedCount=(stroke?[...stroke.ledger.touched.values()]:hits).filter(e=>thin?e.reason:e.growReason).length;
  svg.removeAttribute('hidden');const signature=[r.left,r.top,r.width,r.height].join('|');if(signature!==overlayLayout){overlayLayout=signature;svg.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);Object.assign(svg.style,{left:canvas.offsetLeft+'px',top:canvas.offsetTop+'px',width:r.width+'px',height:r.height+'px'});}
  const circle=svg.querySelector('circle'),text=svg.querySelector('text');circle.setAttribute('cx',p[0]);circle.setAttribute('cy',p[1]);circle.setAttribute('r',s.radius);text.setAttribute('x',p[0]);text.setAttribute('y',p[1]);
  const marked=stroke?.ledger.removed||new Set(),marks=hits.filter(e=>marked.has(e.id)||!stroke).map(e=>`M${e.screen.x-4},${e.screen.y}h8 M${e.screen.x},${e.screen.y-4}v8`).join(' ');svg.querySelector('path').setAttribute('d',marks);
  const added=stroke?.ledger.added||[];for(const [key,preview]of previews){const records=stroke?.previewRecords.get(key);if(records?.length)preview.set(records,null,api.getAsset());else preview.hide();}
  if(stroke?.thin&&(marked.size||stroke.erasePreview)){stroke.erasePreview||=measure('erase_prepare',()=>createUnitErasePreview(api.getAsset()));stroke.erasePreview.set(marked);}
  setText($('unitDensityAdded'),added.length);setText($('unitDensityRemoved'),marked.size);setText($('unitDensityProtected'),protectedCount);
  // Read viewport offsets before mutating the HUD. They only change on layout.
  hud.hidden=false;hud.style.left=(svg.style.left?parseFloat(svg.style.left):0)+Math.max(8,Math.min(r.width-290,p[0]+20))+'px';hud.style.top=(svg.style.top?parseFloat(svg.style.top):0)+Math.max(8,Math.min(r.height-100,p[1]+25))+'px';
  setText(hud.querySelector('strong'),stroke?'本笔 ＋'+added.length+' ／ −'+marked.size:(thin?'− 疏化':'＋ 加密')+(alt?' · Alt 临时反向':''));
  setText(hud.querySelector('span'),stroke?.reason||(hits.length?'命中 '+hits.length+' 支 · 保护 '+protectedCount+' 支':s.scope==='SELECTED'&&!data().plan.allowed.size?'当前选区为空 · 先选树上单元枝':'未命中范围内的挂接点'));
  setText(hud.querySelector('small'),(s.scope==='SELECTED'?'当前选区':'全部可见')+' · '+Math.round(s.strength*100)+'% / 笔 · '+(stroke?'松手确认 · Esc 恢复':'Alt 临时反向'));
 }
 function hover(e){last={clientX:e.clientX,clientY:e.clientY};if(!enabled()||blocked()||workflow.adjusting)return;const p=point(e),hits=hitsAt(p);if(!thinning())for(const e of hits.filter(e=>!e.growReason))previewFor(e.item);render(p,hits);}
 function addRecord(template,t,attempt,d){
  const b=d.carriers.get(template.instance.parent);if(!b)return null;const target=d.axisPicker(b.stableId,t);if(!target)return null;
  const position=sampleLine(b.points,t),tangent=lineTangent(b.points,t),original=d.occupancy.find(p=>p.parent===template.instance.parent&&p.position.distanceTo(template.position)<1e-4),tilt=Math.asin(T.MathUtils.clamp(original?.direction.dot(tangent)??.3,-.95,.95));
  const direction=unitPaintRadialDirection(b,t,.1,attempt).multiplyScalar(Math.cos(tilt)).addScaledVector(tangent,Math.sin(tilt)).normalize(),placement=unitPaintPlacement({parent:b.stableId,attach:t},b,position,direction,d.modelSettings);
  let frame={position:position.toArray(),parent_position:position.toArray(),parent_tangent:tangent.toArray(),direction:direction.toArray()};
  if(target.trunk_anchor)frame={...target.frame,position:target.surface_binding.rest.position.toArray(),direction:direction.clone().applyQuaternion(target.surface_binding.rotation.clone().invert()).toArray()};
  const i=template.instance,instance={id:'DENSITY_'+crypto.randomUUID().replaceAll('-',''),asset_id:i.asset_id,linked:true,pinned_revision:template.item.revision,parent:i.parent,attach:t,frame,...(target.trunk_anchor?{trunk_anchor:structuredClone(target.trunk_anchor)}:{}),shootRole:i.shootRole||'MIXED',scale:i.scale,angle:90,azimuth:0,roll:i.roll||0,seed:i.seed||42,variation:0,radius_scale:i.radius_scale||1,assembly_manual:true};
  return {instance,item:template.item,position,binding:target.surface_binding,placement};
 }
 function densify(p,hits){
  const s=stroke,d=s.data,ledger=s.ledger;touchDensity(ledger,hits);
  const quotas=densityGroupQuotas(ledger,true),totalQuota=[...quotas.values()].reduce((n,v)=>n+v,0);
  for(const [key,entries]of densityGroups(ledger,true)){
   const groupAdded=ledger.added.filter(r=>densityKey(r.instance)===key),quota=quotas.get(key);
   while(groupAdded.length<quota&&ledger.added.length<totalQuota&&ledger.added.length<128&&d.authoring.branch_instances.length+ledger.added.length<1600){
    const template=nextDensityTemplate(entries,groupAdded),parent=d.carriers.get(template.instance.parent);
    if(!parent){s.reason='当前挂接母枝不支持补空；可先使用刷生成';break;}
    const branches=template.item.shape.branches.length;
    if(s.branchCount+branches>assemblyBranchLimit(d.authoring)){s.reason='已达到当前工程的几何预算';break;}
    if(!s.searches.has(parent.stableId))s.searches.set(parent.stableId,createDensityGapSearch(parent,d.modelSettings,[...d.occupancy,...ledger.added.map(r=>r.placement)],d.project));
    const search=s.searches.get(parent.stableId),best=search.best(entries,new Set(hits.map(e=>e.id)),p,s.settings.radius,s.settings.layer==='FRONT'?Math.min(...hits.map(e=>e.screen.depth))+s.settings.depth:Infinity);
    if(!best){s.reason='局部已较密，当前笔刷内没有安全空位';break;}
    const record=addRecord(template,best.t,best.n,d);if(!record){s.reason='母枝缺少有效的轴线挂接数据';break;}
    ledger.added.push(record);groupAdded.push(record);search.occupy(record.placement);s.branchCount+=branches;const sourceKey=densitySourceKey(record.instance);if(!s.previewRecords.has(sourceKey))s.previewRecords.set(sourceKey,[]);s.previewRecords.get(sourceKey).push(record);previewFor(record.item);
   }
  }
 }
 function dab(p){if(!stroke)return;const hits=hitsAt(p);stroke.last=p;stroke.reason='';if(hits.length&&hits.every(e=>stroke.thin?e.reason:e.growReason))stroke.reason=hits[0][stroke.thin?'reason':'growReason'];if(stroke.thin){touchDensity(stroke.ledger,hits);planDensityThinning(stroke.ledger);}else densify(p,hits);}
 function move(e,final=false){if(!stroke)return;if(stroke.data.asset!==api.getAsset()||stroke.data.authoring!==api.getAuthoring()||blocked()){cancel();return;}const p=point(e),samples=sampleUnitPaintStroke(stroke.samplePoint,p,12);for(const q of samples.points)dab(q);stroke.samplePoint=samples.last;if(final)dab(p);}
 function clearMoves(){if(raf)cancelAnimationFrame(raf);raf=0;moves=[];}
 function process(){raf=0;const batch=moves;moves=[];if(stroke){for(const e of batch)move(e);if(stroke)render(stroke.last);}else if(batch.length)hover(batch.at(-1));}
 function release(){const s=stroke;if(!s)return null;stroke=null;clearMoves();controls.enabled=s.controls;if(canvas.hasPointerCapture(s.pointerId))canvas.releasePointerCapture(s.pointerId);return s;}
 function cancel(){const s=release();clearMoves();s?.erasePreview?.restore();hide();if(s)message('已取消整笔密度调整，原有实例保留');sync();return !!s;}
 async function finish(e){if(!stroke||e.pointerId!==stroke.pointerId)return;process();move(e,true);if(!stroke)return;render(stroke.last);const s=release(),{added,removed}=s.ledger;
  if(!added.length&&!removed.size){hide();message(s.reason||'本笔未改变：请检查选区、保护状态或增加命中数量；疏化保留每个母枝分区的最后一支');sync();return;}
  committing=true;held=s;
  try{const prepared=await Promise.all(added.map(r=>previewFor(r.item)));if(prepared.some(p=>!p))throw Error('本笔未应用：完整源模型预览未能准备，请重试或检查素材');
   for(const [key,preview]of previews){const records=s.previewRecords.get(key);if(records?.length)preview.set(records,null,s.data.asset);else preview.hide();}
   await frame();if(api.getAuthoring()!==s.data.authoring)return;
   api.transact((s.thin?'疏化 ':'加密 ')+(s.thin?removed.size:added.length)+' 支完整单元枝',a=>commitDensityUnits(a,added,removed),{bypassLayers:true,deferControls:true});await api.flush();
   const index=data().plan.index,live=new Set(api.getAuthoring().branch_instances.map(i=>i.id)),ids=new Set([...s.selection].map(id=>s.data.plan.index.ownerOf(id)?.id).filter(id=>live.has(id)));
   if(s.settings.scope==='SELECTED')for(const r of added)ids.add(r.instance.id);
   api.setSelections(new Set([...ids].map(id=>index.roots.get(id)).filter(Boolean)));
   message('密度已调整 · ＋'+added.length+' ／ −'+removed.size+' · Ctrl＋Z 撤销整笔');
  }catch(error){api.toast(error.message,true);}finally{s.erasePreview?.restore();held=null;committing=false;cache=modelCache=null;hide();sync();refresh();}
 }
 async function open(){if(!api.isTree()||committing)return;const selection=[...api.getSelections()];await api.unitMode();const index=prepareUnitDensity({authoring:api.getAuthoring(),branches:api.getAsset().masterBranches}).index;
  api.setSelections(new Set(selection.map(id=>index.ownerOf(id)?.id).map(id=>index.roots.get(id)).filter(Boolean)));
  api.setTool('UNIT_DENSITY');workflow.switchTool('UNIT_DENSITY');if(!localStorage.getItem('treeDuck.unitDensityBrush.v1'))$('sculptStrength').value='.2';context.setMode('UNIT_DENSITY');sync();refresh();
 }
 function refresh(){if(stroke&&(stroke.data.asset!==api.getAsset()||stroke.data.authoring!==api.getAuthoring()))cancel();cache=modelCache=layoutCache=null;if(!enabled()){hide();return;}const d=data(),s=settings();message(!d.plan.allowed.size&&s.scope==='SELECTED'?'当前选区为空：先选择树上单元枝，或切换为「全部可见」':'范围内 '+d.plan.entries.length+' 支 · 加密沿用局部素材，疏化按本笔比例减少');sync();}
 canvas.addEventListener('pointerdown',e=>{if(!enabled())return;if(e.button===1){if(stroke)cancel();return;}if(e.button===2){consume(e);cancel();return;}if(e.button!==0||e.ctrlKey||e.shiftKey||e.metaKey)return;consume(e);canvas.focus({preventScroll:true});alt=e.altKey;sync();if(blocked()||workflow.adjusting)return;if(!$('unitDensityDepth').checkValidity()){message('请填写有效的前层深度');return;}
  const d=data(),p=point(e);stroke={data:d,settings:settings(),pointerId:e.pointerId,controls:controls.enabled,thin:thinning(),selection:[...api.getSelections()],ledger:createDensityLedger(d.plan,settings().strength),erasePreview:null,searches:new Map(),previewRecords:new Map(),samplePoint:p,last:p,branchCount:d.asset.masterBranches.length,reason:''};controls.enabled=false;canvas.setPointerCapture(e.pointerId);measure('down',()=>{dab(p);render(p);});
 },true);
 canvas.addEventListener('pointermove',e=>{inside=true;if(!enabled())return;if(stroke){consume(e);if(e.pointerId!==stroke.pointerId)return;}else if(e.buttons)return;else if(alt!==e.altKey){alt=e.altKey;sync();}last={clientX:e.clientX,clientY:e.clientY};moves.push(last);if(!raf)raf=requestAnimationFrame(()=>measure('frame',process));},true);
 canvas.addEventListener('pointerup',e=>{if(enabled()&&stroke&&e.button===0){consume(e);finish(e);}},true);
 canvas.addEventListener('pointercancel',cancel,true);canvas.addEventListener('lostpointercapture',()=>{if(stroke)cancel();},true);canvas.addEventListener('pointerleave',()=>{inside=false;if(!stroke){clearMoves();hide();}});canvas.addEventListener('contextmenu',e=>{if(enabled()){consume(e);cancel();}},true);
 window.addEventListener('keydown',e=>{if(!enabled()||document.querySelector('dialog[open]'))return;if(e.key==='Alt'&&(inside||stroke)){e.preventDefault();alt=true;sync();if(last&&!stroke)hover(last);return;}if(e.target?.isContentEditable||e.target?.matches?.('input,textarea,select'))return;if(e.key==='Escape'&&(stroke||workflow.adjusting)){consume(e);cancel();workflow.cancel();}else if(stroke&&(e.ctrlKey||e.metaKey||['g','r','s','Delete'].includes(e.key)))cancel();},true);
 window.addEventListener('keyup',e=>{if(e.key==='Alt'){alt=false;sync();if(enabled()&&last&&!stroke)hover(last);}},true);
 const blur=()=>{inside=false;cancel();alt=false;sync();};window.addEventListener('blur',blur);document.addEventListener('visibilitychange',()=>{if(document.hidden)blur();});
 controls.addEventListener('change',()=>{cache=null;if(enabled()&&inside&&last&&!stroke)hover(last);});document.addEventListener('tree-assembly-refreshed',refresh);
 const invalidateLayout=()=>{layoutCache=null;overlayLayout='';cache=null;if(stroke)cancel();};new ResizeObserver(invalidateLayout).observe(canvas);window.addEventListener('resize',invalidateLayout);window.addEventListener('scroll',invalidateLayout,true);
 function toolChanged(next){cancel();workflow.switchTool(next);cache=modelCache=layoutCache=null;modeSignature='';if(next!=='UNIT_DENSITY'){epoch++;for(const p of previews.values())p.dispose();previews.clear();pending.clear();last=null;alt=false;}}
 return {open,refresh,toolChanged,reset:()=>toolChanged('SELECT'),releaseDisplay(owner){if(held?.data.asset===owner)held.erasePreview?.restore();},get active(){return !!stroke||committing||workflow.adjusting;},get debug(){return {committing,pending:stroke?1+stroke.ledger.added.length+stroke.ledger.removed.size:0,thin:thinning(),added:stroke?.ledger.added.map(r=>r.instance.id)||[],removed:[...(stroke?.ledger.removed||[])],ready:previews.size,borrowed:[...previews.values()].filter(p=>p.borrowed).length};}};
}
