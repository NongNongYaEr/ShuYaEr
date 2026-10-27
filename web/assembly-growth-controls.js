import * as THREE from 'three';
import { sampleLine } from './tree-sculpt.js';
import { growthRule, growthTargets, growthEligibility, setGrowthRule } from './assembly-growth.js';
import { proceduralGrowthEligibility, setProceduralGrowthRule } from './procedural-growth.js';

export function createAssemblyGrowthControls(api) {
  const $=id=>document.getElementById(id), panel=document.createElement('section');
  panel.id='assemblyGrowthPanel'; panel.className='assembly-growth';
  panel.innerHTML=`<h3>单元枝 · 生长范围</h3>
    <label>调整对象<select id="agSource"><option value="PROCEDURAL">程序分枝</option><option value="ASSEMBLY">单元枝装配</option></select></label>
    <label>作用范围<select id="agScope"><option value="CURRENT">当前主枝</option><option value="SUBTREE">当前枝及下级主枝</option><option value="TREE">整树主枝</option></select></label>
    <div class="field-grid"><label>起点（%）<input id="agStart" type="number" min="0" max="99" step="1" value="0"></label><label>终点（%）<input id="agEnd" type="number" min="1" max="100" step="1" value="100"></label></div>
    <label>沿枝疏密<select id="agProfile"><option value="UNIFORM">均匀分布</option><option value="TIP">向枝梢渐密</option><option value="ROOT">向枝根渐密</option></select></label>
    <label>边缘渐疏（%）<input id="agFeather" type="number" min="0" max="45" step="1" value="12"></label>
    <button id="agHandles" type="button" aria-pressed="false">在枝上拖动起止点</button>
    <p class="hint">0% 为枝根，100% 为枝梢；范围约束小枝的连接点，保留数量、尺寸和姿态。主枝自身的叶片不由此项控制。</p>
    <p id="agStatus" class="hint" aria-live="polite"></p><button id="agLibrary" type="button">单元枝素材与数量…</button>`;
  $('branchEditor').prepend(panel);
  const root=new THREE.Group();root.name='assembly-growth-handles';api.modelRoot.add(root);root.visible=false;
  const line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffd54a,depthTest:false,transparent:true,opacity:.85}));line.renderOrder=125;root.add(line);
  const handles=['起点','终点'].map((name,index)=>{
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const c=canvas.getContext('2d');
    c.fillStyle=index?'#93dbd4':'#ffdb52';c.beginPath();c.arc(64,32,13,0,Math.PI*2);c.fill();c.strokeStyle='#24282b';c.lineWidth=4;c.stroke();
    c.font='18px sans-serif';c.fillText(name,82,39);
    const texture=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false}));
    sprite.name=name;sprite.renderOrder=126;root.add(sprite);return sprite;
  });
  let gesture=null,drag=null,enabled=false,selectionKey=null;
  const ids=()=>growthTargets(api.getAsset()?.masterBranches || [],api.getSelection(),$('agScope').value);
  const selected=()=>api.getAsset()?.masterBranches.find(b=>b.stableId===api.getSelection());
  const fieldMap={agStart:'start',agEnd:'end',agFeather:'feather',agProfile:'profile'};
  const sourceKey=()=>$('agSource').value==='ASSEMBLY'?'assembly_growth':'procedural_growth';
  const rule=()=>growthRule(api.getAuthoring().workbench?.[sourceKey()]?.regions?.[api.getSelection()]);
  function draw() {
    const b=selected(); root.visible=enabled&&!panel.hidden&&Boolean(b)&&api.canUse();if(!root.visible)return;
    const r=rule();handles[0].position.copy(sampleLine(b.points,r.start));handles[1].position.copy(sampleLine(b.points,r.end));
    line.geometry.dispose();line.geometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:49},(_,i)=>sampleLine(b.points,r.start+(r.end-r.start)*i/48)));
    update();
  }
  function update() {
    if(!root.visible)return;
    const height=api.canvas.clientHeight||1;
    for(const h of handles){const world=h.getWorldPosition(new THREE.Vector3());const distance=world.distanceTo(api.camera.position);
      const px=api.camera.isOrthographicCamera?(api.camera.top-api.camera.bottom)/api.camera.zoom/height:2*distance*Math.tan(THREE.MathUtils.degToRad(api.camera.fov)/2)/height;
      h.scale.set(px*80,px*40,1);
    }
  }
  function refresh() {
    const targets=ids();panel.hidden=!api.isTree()||!growthTargets(api.getAsset()?.masterBranches || [],api.getSelection(),'CURRENT').length;
    if(panel.hidden){root.visible=false;return;}
    const assembly=growthEligibility(api.getAuthoring(),targets),procedural=proceduralGrowthEligibility(api.getAuthoring(),api.getAsset().masterBranches,targets);
    const key=api.getSelection()+'|'+$('agScope').value;
    if(!gesture&&key!==selectionKey){selectionKey=key;$('agSource').value=assembly.total.length?'ASSEMBLY':'PROCEDURAL';}
    const e=$('agSource').value==='ASSEMBLY'?assembly:procedural;
    $('agSource').options[0].textContent=`程序分枝 · ${procedural.total.length} 枝`;$('agSource').options[1].textContent=`单元枝装配 · ${assembly.total.length} 枝`;
    const blocked=!api.canUse(),empty=!e.editable.length;panel.querySelectorAll('input,select,button').forEach(el=>el.disabled=blocked);$('agLibrary').disabled=false;
    for(const id of [...Object.keys(fieldMap),'agHandles'])$(id).disabled=blocked||empty;
    panel.querySelectorAll('.parameter-slider,.parameter-reset').forEach(el=>el.disabled=blocked||empty);
    if(!gesture){const r=rule();for(const [id,key]of Object.entries(fieldMap))$(id).value=key==='profile'?r[key]:Math.round(r[key]*100);}
    const regions=api.getAuthoring().workbench?.[sourceKey()]?.regions||{};
    const mixed=new Set(targets.map(id=>JSON.stringify(growthRule(regions[id])))).size>1;
    $('agStatus').textContent=blocked?'枝干编辑中暂停范围调节；返回整树预览后调节。':`${targets.length} 根主枝 · 可调整 ${e.editable.length} 枝 · 保留 ${e.protectedCount} 枝。${mixed?'范围不同；修改的参数会统一到所选范围。':''}${!e.total.length?'当前没有这类单元枝；请切换调整对象或作用范围。':!e.editable.length?'当前均为手工精修、固定样板或受保护对象，不会挪动。':''}`;
    $('agHandles').classList.toggle('active',enabled);$('agHandles').setAttribute('aria-pressed',String(enabled));
    $('agHandles').textContent=enabled?'结束起止点调节':'在枝上拖动起止点';draw();
  }
  function begin() {
    if(gesture)return true;if(!ids().length||!api.canUse())return false;
    const e=$('agSource').value==='ASSEMBLY'?growthEligibility(api.getAuthoring(),ids()):proceduralGrowthEligibility(api.getAuthoring(),api.getAsset().masterBranches,ids());if(!e.editable.length)return false;
    api.commit();api.begin();gesture={baseline:api.getAuthoring(),targets:ids(),branches:api.getAsset().masterBranches,source:sourceKey()};return true;
  }
  function preview(patch) {
    if(!begin())return false;
    const g=gesture;
    for(const id of g.targets){const r={...growthRule(g.baseline.workbench?.[g.source]?.regions?.[id]),...patch};if(r.start>=r.end){$('agStatus').textContent='部分主枝的起点不小于终点，请先扩大区间或单独调整。';return false;}}
    api.preview(next=>{
      next.branch_instances=structuredClone(g.baseline.branch_instances);
      next.workbench=structuredClone(g.baseline.workbench || {});
      if(g.source==='assembly_growth')setGrowthRule(next,g.branches,g.targets,patch);
      else setProceduralGrowthRule(next,g.targets,patch);
    });
    refresh();return true;
  }
  function release() {const old=drag;drag=null;if(old){api.controls.enabled=old.controls;if(api.canvas.hasPointerCapture(old.id))api.canvas.releasePointerCapture(old.id);}}
  function finish(){gesture=null;release();}
  function commit(){if(!gesture)return;api.commit();refresh();}
  function cancel(){if(!gesture)return false;api.cancel();refresh();return true;}
  function change(id){const el=$(id),key=fieldMap[id];if(el.value===''||!el.validity.valid)return false;
    const patch={[key]:key==='profile'?el.value:Number(el.value)/100};
    if(key==='start'&&patch.start>=Number($('agEnd').value)/100||key==='end'&&patch.end<=Number($('agStart').value)/100){$('agStatus').textContent='终点需大于起点。';return false;}
    return preview(patch);
  }
  for(const id of Object.keys(fieldMap)) {
    const el=$(id);el.dataset.liveBranch='true';
    el.addEventListener('input',()=>change(id));el.addEventListener('change',()=>{if(change(id))commit();else {cancel();refresh();}});
    el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(change(id))commit();else cancel();el.blur();}});
    el.addEventListener('parameter-edit-cancel',cancel);
  }
  $('agScope').onchange=()=>{commit();refresh();};$('agLibrary').onclick=()=>{$('openBranchAssembly').click();};
  $('agSource').onchange=()=>{commit();refresh();};
  $('agHandles').onclick=()=>{commit();const next=!enabled;api.setTool('SELECT');enabled=next;refresh();};
  const project=p=>{const q=p.clone();api.modelRoot.localToWorld(q);q.project(api.camera);const r=api.canvas.getBoundingClientRect();return {x:r.left+(q.x+1)*r.width/2,y:r.top+(1-q.y)*r.height/2,z:q.z};};
  function pointerDown(event) {
    if(!root.visible||!api.canUse()||event.button!==0)return false;
    const hits=handles.map((h,n)=>{const p=project(h.position);return {n,p,d:Math.hypot(p.x-event.clientX,p.y-event.clientY)};}).filter(h=>h.p.z>=-1&&h.p.z<=1&&h.d<18).sort((a,b)=>a.d-b.d);
    if(!hits.length||!begin())return false;
    drag={id:event.pointerId,index:hits[0].n,points:selected().points.map(p=>p.clone()),controls:api.controls.enabled};
    api.controls.enabled=false;api.canvas.setPointerCapture(event.pointerId);event.preventDefault();return true;
  }
  function move(event) {
    if(!drag)return false;
    let nearest={d:Infinity,t:0};const points=drag.points,lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+points[i].distanceTo(points[i-1]));
    for(let i=1;i<points.length;i++) {
      const a=project(points[i-1]),b=project(points[i]);if(a.z< -1||a.z>1||b.z< -1||b.z>1)continue;
      const dx=b.x-a.x,dy=b.y-a.y,u=THREE.MathUtils.clamp(((event.clientX-a.x)*dx+(event.clientY-a.y)*dy)/(dx*dx+dy*dy||1),0,1),d=Math.hypot(event.clientX-a.x-u*dx,event.clientY-a.y-u*dy);
      if(d<nearest.d)nearest={d,t:(lengths[i-1]+u*(lengths[i]-lengths[i-1]))/(lengths.at(-1)||1)};
    }
    if(!Number.isFinite(nearest.d))return true;
    const r=rule(),key=drag.index?'end':'start',v=drag.index?Math.max(r.start+.01,nearest.t):Math.min(r.end-.01,nearest.t);
    const value=Math.round(v*100)/100;$(drag.index?'agEnd':'agStart').value=Math.round(value*100);preview({[key]:value});return true;
  }
  function end(){if(!drag)return false;release();commit();return true;}
  function deactivate(){cancel();enabled=false;refresh();}
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&gesture){e.preventDefault();cancel();}},true);
  window.addEventListener('blur',cancel);api.canvas.addEventListener('pointercancel',cancel);api.canvas.addEventListener('lostpointercapture',()=>{if(drag)cancel();});
  return {refresh,update,finish,commit,cancel,deactivate,begin:pointerDown,move,end,root,handles,get active(){return enabled},get dragging(){return Boolean(drag)}};
}
