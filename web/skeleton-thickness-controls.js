import { SKELETON_LEVELS, skeletonThicknessState, skeletonBranches, skeletonThicknessView } from './skeleton-thickness.js';
import * as THREE from 'three';
import { createSkeletonBaseControls } from './skeleton-base-controls.js';

export function createSkeletonThicknessControls(api,host){
 const panel=document.createElement('details');panel.id='skeletonThicknessPanel';panel.className='wb-tree-only skeleton-thickness';panel.open=true;
 panel.innerHTML=`<summary>整树骨架 · 分级粗细曲线</summary><p>仅调整承接骨架；已安装的单元枝及其内部枝叶花果保持原样。</p>
 <label>骨架层级<select id="skeletonThicknessLevel">${SKELETON_LEVELS.map((name,i)=>`<option value="${i}">${name}</option>`).join('')}</select></label>
 <small id="skeletonThicknessCount"></small><label class="wb-check"><input id="skeletonThicknessHighlight" type="checkbox">高亮本级骨架（青色）</label><div id="skeletonBaseControls"></div><label>原基部粗细倍率<input id="skeletonThicknessScale" type="number" min="0.1" max="10" step="any" value="1"></label>
 <small id="skeletonThicknessSource"></small>
 <canvas id="skeletonThicknessCurve" width="520" height="250" aria-label="相对各枝基准根部半径的实际粗细曲线"></canvas>
 <div class="skeleton-curve-values">${[0,25,50,75,100].map((p,i)=>`<label>${p}%<input data-skeleton-point="${i}" aria-label="${p}% 位置相对基部粗细" type="number" min="0.001" max="10" step="any" value="1"></label>`).join('')}</div>
 <small>横轴：枝根 → 枝梢；纵轴：相对基准粗细的比例。全 1 沿枝等粗；根部 1、末端 0.2 表示末端为根部的 20%。曲线替代原锥度。回车或失焦更新，拖动松手更新；随工程保存。</small>
 <div class="wb-row"><button id="skeletonThicknessReset" type="button">恢复原有枝形</button></div><small id="skeletonThicknessStatus" role="status"></small>`;
 host.prepend(panel);
 const root=new THREE.Group();root.name='SkeletonThicknessTargets';api.modelRoot.add(root);
 const line=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x50e6ff,depthTest:false,depthWrite:false}));line.renderOrder=110;root.add(line);root.visible=false;
 let highlightedBranches=null,highlightedLevel=-1;
 const $=id=>panel.querySelector('#'+id),inputs=[...panel.querySelectorAll('[data-skeleton-point]')],canvas=$('skeletonThicknessCurve'),ctx=canvas.getContext('2d');
 let level=0,stamp='',viewBranches=null,view=null,draft={scale:1,curve:[1,1,1,1,1]},dirty=false,drag=null;
 let carrierCache=null;
 const carriers=()=>{const branches=api.getAsset()?.masterBranches||[],authoring=api.getAuthoring();if(!carrierCache||carrierCache.branches!==branches||carrierCache.authoring!==authoring)carrierCache={branches,authoring,bones:skeletonBranches(branches)};return carrierCache.bones;};
 const baseControls=createSkeletonBaseControls($('skeletonBaseControls'),{sourceScale:$('skeletonThicknessScale'),context:()=>({branches:api.getAsset()?.masterBranches||[],settings:api.getSettings(),workbench:api.getAuthoring().workbench,level}),change(){read();commit();},highlight(){$('skeletonThicknessHighlight').checked=true;highlightedLevel=-1;refresh();}});
 const allInputs=[$('skeletonThicknessScale'),...inputs,...baseControls.inputs];
 $('skeletonThicknessHighlight').onchange=refresh;panel.addEventListener('toggle',refresh);
 const valid=()=>allInputs.every(input=>input.disabled||input.value!==''&&input.reportValidity());
 const read=()=>{draft={...draft,scale:Number($('skeletonThicknessScale').value),curve:inputs.map(i=>Number(i.value))};const base=baseControls.read(draft.base);if(base)draft.base=base;else delete draft.base;dirty=true;draw();status();};
 function status(){$('skeletonThicknessStatus').textContent=drag?'正在编辑曲线，松手后自动更新':dirty?'输入中，确认数值后自动更新':'当前工程参数 · 支持撤销，修改数值不累乘。';}
 function draw(){
  const w=canvas.width,h=canvas.height,left=42,right=w-18,top=15,bottom=h-32;
  const max=drag?.max||chartMax();
  ctx.clearRect(0,0,w,h);ctx.font='18px sans-serif';
  for(let i=0;i<=4;i++){const y=bottom-(bottom-top)*i/4;ctx.strokeStyle='#34483d';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillStyle='#b6cabc';ctx.fillText((max*i/4).toFixed(1),2,y+5);}
  if(view?.inherited&&!dirty&&view.envelope.length){
   ctx.fillStyle='#406d6266';ctx.beginPath();view.envelope.forEach((p,i)=>{const x=left+(right-left)*p.t,y=bottom-(bottom-top)*p.max/max;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
   [...view.envelope].reverse().forEach(p=>ctx.lineTo(left+(right-left)*p.t,bottom-(bottom-top)*p.min/max));ctx.closePath();ctx.fill();
  }
  const plot=view?.inherited&&!dirty?view.envelope.map(p=>[p.t,p.value]):draft.curve.map((v,i)=>[i/4,v]);
  ctx.strokeStyle='#efd074';ctx.lineWidth=3;ctx.beginPath();plot.forEach(([t,v],i)=>{const x=left+(right-left)*t,y=bottom-(bottom-top)*v/max;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();
  draft.curve.forEach((v,i)=>{ctx.beginPath();ctx.arc(left+(right-left)*i/4,bottom-(bottom-top)*v/max,7,0,Math.PI*2);ctx.fillStyle='#efd074';ctx.fill();});
  ctx.fillStyle='#b6cabc';ctx.fillText('枝根 0%',left,h-7);ctx.fillText('枝梢 100%',right-95,h-7);
 }
 function chartMax(){return Math.max(2,Math.ceil(Math.max(...draft.curve,...(view?.inherited&&!dirty?view.envelope.map(p=>p.max):[]))*1.2));}
 function load(bones=carriers()){view=skeletonThicknessView(bones,api.getSettings(),api.getAuthoring().workbench,level);draft=structuredClone(view.rule);$('skeletonThicknessScale').value=draft.scale;inputs.forEach((e,i)=>e.value=Number(draft.curve[i].toPrecision(6)));baseControls.load(bones);dirty=false;
  const sizes=view.roots.map(r=>r*200),range=sizes.length?` 当前根部直径 ${Math.min(...sizes).toFixed(2)}–${Math.max(...sizes).toFixed(2)} cm。`:'';
  $('skeletonThicknessSource').textContent=(view.inherited?(view.mixed?'保留原有枝形：本级渐变不同，阴影显示实际范围，数值为参考中值。':'保留原有枝形：显示当前实际渐变的采样值。')+'首次修改将统一本级沿枝比例。':'当前工程的实际粗细配置。')+range;
  draw();status();}
 $('skeletonThicknessLevel').onchange=()=>{if(!commit()){ $('skeletonThicknessLevel').value=level;return;}level=Number($('skeletonThicknessLevel').value);load();refresh();};
 for(const input of allInputs){
  input.oninput=()=>{dirty=true;if(allInputs.every(e=>e.disabled||e.value!==''&&e.checkValidity()))read();else status();};
  input.onchange=()=>commit();
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(commit())input.blur();}};
 }
 const location=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
 canvas.onpointerdown=e=>{if(e.button!==0||!commit())return;const p=location(e),max=chartMax();const index=draft.curve.findIndex((v,i)=>Math.hypot(p.x-(42+460*i/4),p.y-(218-203*v/max))<20);if(index<0)return;drag={index,max};canvas.setPointerCapture(e.pointerId);e.preventDefault();status();};
 canvas.onpointermove=e=>{if(!drag)return;const p=location(e),v=Math.max(.001,Math.min(10,(218-p.y)/203*drag.max));inputs[drag.index].value=(Math.max(.001,Math.round(v*1000)/1000)).toString();read();};
 canvas.onpointerup=()=>{if(!drag)return;drag=null;commit();draw();};
 canvas.onpointercancel=()=>{drag=null;load();};
 function commit(reset=false){
  if(!api.isTree()||!reset&&!dirty)return true;
  if(!reset&&!valid())return false;
  try{const current=skeletonThicknessState(api.getAuthoring().workbench).levels[level];
   if(!reset)read();
   const rule=reset?(current.source||{scale:1,curve:[1,1,1,1,1]}):{...draft,mode:'RADIUS_CURVE'};
   if(JSON.stringify(rule)!==JSON.stringify(current))api.transact(reset?'重置本级骨架参数':'修改骨架粗细配置',a=>{const state=skeletonThicknessState(a.workbench);state.levels[level]=rule;a.workbench={...a.workbench,skeleton_thickness:state};},{bypassLayers:true});
   dirty=false;stamp='';refresh();return true;
  }catch(e){api.toast(e.message,true);return false;}
 }
 $('skeletonThicknessReset').onclick=()=>commit(true);
 function refresh(){panel.hidden=!api.isTree();root.visible=!panel.hidden&&panel.open&&$('skeletonThicknessHighlight').checked;
  if(!root.visible){if(highlightedBranches){line.geometry.dispose();line.geometry=new THREE.BufferGeometry();highlightedBranches=null;root.userData.branchIds=[];}}
  if(panel.hidden){viewBranches=null;view=null;stamp='';return;}const branches=api.getAsset()?.masterBranches||[],bones=carriers(),allTargets=bones.filter(b=>Math.min(3,b.order)===level),targets=baseControls.filter(allTargets,skeletonThicknessState(api.getAuthoring().workbench).levels[level]),count=allTargets.length;
  if(root.visible&&(highlightedBranches!==branches||highlightedLevel!==level)){
   const positions=[];for(const b of targets)for(let n=1;n<b.points.length;n++)positions.push(...b.points[n-1].toArray(),...b.points[n].toArray());
   line.geometry.dispose();line.geometry=new THREE.BufferGeometry();line.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));line.geometry.computeBoundingSphere();
   root.userData.branchIds=targets.map(b=>b.stableId);highlightedBranches=branches;highlightedLevel=level;
  }
  $('skeletonThicknessCount').textContent=`本级 ${count} 根骨架枝；${api.getAuthoring().branch_instances.length} 个已安装单元受保护。`;
  const next=JSON.stringify(skeletonThicknessState(api.getAuthoring().workbench));if(next!==stamp||branches!==viewBranches&&!dirty&&!drag){stamp=next;viewBranches=branches;load(bones);}
  $('skeletonThicknessReset').disabled=!count;
 }
 return {root,refresh,get pending(){return dirty||Boolean(drag);},resetInputs(){drag=null;dirty=false;stamp='';viewBranches=null;view=null;},flushPending(){drag=null;if(!commit())throw Error('请先修正骨架配置中的无效数值');},reveal(){panel.open=true;panel.scrollIntoView({block:'start'});}};
}
