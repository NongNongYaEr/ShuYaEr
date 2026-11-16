import {lightPoseKey,packLightTrack} from '../tree-light-data.js';
import {TREE_LIGHT_GROUP} from '../tree-light-mesh.js';
import {isProceduralLightBranch,proceduralLightCarriers} from '../tree-light-carriers.js';
import {treeLightSurfaceInput} from './surface-input.js';

const viewport=document.querySelector('.viewport-area');
const app=()=>window.__branchForge;
const entry=document.createElement('button');
entry.type='button';
entry.id='treeLightOpen';
entry.textContent='灯带';
entry.title='为当前树干生成灯带和流水预览';
entry.setAttribute('aria-controls','treeLightPanel');
entry.setAttribute('aria-expanded','false');
viewport.querySelector('.viewport-tools').append(entry);

const style=document.createElement('style');
style.textContent=`
  #treeLightPanel{position:absolute;z-index:80;top:58px;right:12px;width:min(290px,calc(100% - 24px));max-height:calc(100% - 70px);overflow:auto;background:var(--panel,#24272c);border:1px solid var(--line,#444951);border-radius:8px;color:var(--text,#f0e8d4);box-shadow:0 10px 26px #0006;font-size:12px;padding:11px;box-sizing:border-box}
  #treeLightOpen{white-space:nowrap;min-width:max-content}
  #treeLightPanel[hidden],#treeLightOpen[hidden],#treeLightPanel [hidden]{display:none}
  #treeLightPanel header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  #treeLightPanel header strong{font-size:14px}
  #treeLightPanel fieldset{margin:10px 0 0;padding:0;border:0;min-width:0}
  #treeLightPanel small,#treeLightPanel output{display:block;color:var(--muted,#bababa);line-height:1.6}
  #treeLightPanel label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0}
  #treeLightPanel input:not([type=checkbox]),#treeLightPanel select{box-sizing:border-box;width:112px;min-width:0}
  #treeLightPanel input[type=color]{height:25px;padding:2px}
  #treeLightPanel .actions,#treeLightPanel .presets{display:flex;gap:5px;margin:6px 0}
  #treeLightPanel .actions button,#treeLightPanel .presets button{flex:1;min-width:0;padding:5px 4px;font-size:11px}
  #treeLightPanel button[aria-pressed=true]{background:#e9bd61;color:#211b10}
  #treeLightPanel output{margin-top:7px}
  #treeLightPanel hr{border:0;border-top:1px solid var(--line,#444951);margin:8px 0}
`;
document.head.append(style);
const panel=document.createElement('section');
panel.id='treeLightPanel';
panel.setAttribute('aria-label','树干灯带');
panel.hidden=true;
panel.innerHTML=`
  <header><strong>树干灯带</strong><button type="button" data-close aria-label="关闭灯带设置">×</button></header>
  <label>启用灯带 <input type="checkbox" data-enable></label>
  <label data-target-row hidden>树干 <select data-target aria-label="灯带所在树干"></select></label>
  <small>灯带随工程保存，导出 GLB 保留两套 UV。</small>
  <form><fieldset disabled hidden>
    <label>绕线位置 <select name="scope"><option value="main">仅主干</option><option value="major">主干和粗枝</option><option value="all">全部识别枝干</option><option value="selected">当前选中枝</option></select></label>
    <label>离地起点 · m <input name="bottom" type="number" min="0" step="0.01" value="0" required></label>
    <label>离地终点 · m <input name="top" type="number" min="0.01" step="0.01" required></label>
    <small data-height></small>
    <div class="presets" role="group" aria-label="圈距预设">
      <button type="button" data-pitch="2">紧密 2 cm</button><button type="button" data-pitch="8">常规 8 cm</button><button type="button" data-pitch="16">疏绕 16 cm</button>
    </div>
    <label>沿枝干每圈 · cm <input name="pitch" type="number" min="1" max="50" step="0.1" value="8" required></label>
    <label>缠绕方向 <select name="direction"><option value="1">正绕</option><option value="-1">反绕</option></select></label>
    <label>灯带直径 · mm <input name="width" type="number" min="1" max="12" step="0.1" value="4.9" required></label>
    <label>贴皮留缝 · mm <input name="gap" type="number" min="0.2" max="15" step="0.1" value="1.8" required></label>
    <label>灯光颜色 <input name="color" type="color" value="#ffad44"></label>
    <label>发光强度 <input name="intensity" type="number" min="0.1" max="8" step="0.1" value="3.6" required></label>
    <div class="actions"><button type="submit">立即更新</button><button type="reset">恢复初始参数</button></div>
  </fieldset><output role="status"></output></form>`;
viewport.append(panel);

const form=panel.querySelector('form'),fields=form.querySelector('fieldset'),output=form.querySelector('output');
const enable=panel.querySelector('[data-enable]'),targetSelect=panel.querySelector('[data-target]');
const targetRow=panel.querySelector('[data-target-row]'),presets=[...panel.querySelectorAll('[data-pitch]')];
let source=null,active=null,worker=null,observed=null,draftOwner=null,importedData,proceduralAvailable,flowModule;
let sequence=0,epoch=0,runningId=0,debounce=0,ready=false,running=false,queued=false,dirty=false,failure='';
let selection=null,pinned=null;
const status=message=>{output.value=message;};
const enabled=()=>!!(observed||draftOwner);

function togglePanel(open){
  panel.hidden=!open;
  entry.setAttribute('aria-expanded',String(open));
  if(open){
    flowModule??=import('./flow-preview.js').catch(error=>{flowModule=null;status(error.message);});
    watch();
  }
}

function cancelWork(){
  clearTimeout(debounce);
  sequence++;
  epoch++;
  worker?.terminate();
  worker=null;
  active=null;
  ready=running=queued=dirty=false;
  failure='';
}

function markPreset(){
  for(const button of presets)button.setAttribute('aria-pressed',String(button.dataset.pitch===form.elements.pitch.value));
}

function restoreFields(record){
  const defaults={scope:'main',bottom:0,top:'',pitch:8,direction:1,width:4.9,gap:1.8,color:'#ffad44',intensity:3.6};
  const p=record?.params;
  const values=p?{...p,width:p.radius*2000,gap:p.gap*1000,pitch:p.pitch*100}:defaults;
  form.elements.top.defaultValue='';
  for(const [name,value] of Object.entries(values)){
    if(form.elements[name])form.elements[name].value=typeof value==='number'?Number(value.toFixed(4)):value;
  }
  pinned=p?.selectedGuide??null;
  selection=null;
  markPreset();
}

function pickTarget(imported,record,procedural){
  const choices=(imported?.mounts||[]).flatMap((mount,index)=>{
    const model=imported.assets.find(value=>value.id===mount.asset_id&&value.revision===mount.revision);
    return model?[{key:'imported:'+mount.id,label:(model.name||'导入树干')+' · '+(index+1),
      mount:mount.id,id:model.id,revision:model.revision,guides:model.guides}]:[];
  });
  if(procedural)choices.push({key:'procedural',label:'整树枝干',kind:'procedural'});
  const key=record?.kind==='procedural'?'procedural':record?.mount?'imported:'+record.mount:targetSelect.value;
  const choice=choices.find(item=>item.key===key)||choices[0];
  targetSelect.replaceChildren(...choices.map(item=>new Option(item.label,item.key)));
  targetRow.hidden=choices.length<2;
  if(choice)targetSelect.value=choice.key;
  source=choice?{...choice,lamps:new Set(record?.replaces)}:null;
}

function targetFor(a){
  const tree=a.asset;
  if(tree.skeletonOnly)return null;
  tree.group.updateWorldMatrix(true,true);
  const wood=[],guides=[];
  if(source.kind==='procedural'){
    const carriers=proceduralLightCarriers(tree);
    const byId=new Map(carriers.branches.map(branch=>[branch.id,branch.stableId]));
    wood.push(...carriers.wood);
    guides.push(...carriers.branches.map(branch=>({id:branch.stableId,parent:byId.get(branch.parentId),branch})));
  }else{
    const mount=a.authoring.imported_trunks?.mounts.find(m=>m.id===source.mount&&m.asset_id===source.id&&m.revision===source.revision);
    if(!mount)return null;
    tree.group.traverseVisible(mesh=>{
      if(mesh.userData.trunk_mount_id===mount.id&&mesh.geometry&&!source.lamps.has(mesh.userData.trunk_primitive_id))wood.push(mesh);
    });
    const branches=new Map(tree.masterBranches.map(branch=>[branch.stableId,branch]));
    for(const guide of source.guides){
      const branch=branches.get(mount.guide_map[guide.id]);
      if(branch)guides.push({id:guide.id,parent:guide.parent,branch});
    }
  }
  if(!wood.length||!guides.length)return null;
  const ground=a.groundHeight;
  const signature=[ground,...wood.map(mesh=>[
    mesh.geometry.uuid,mesh.geometry.attributes.position.version,...mesh.matrixWorld.elements
  ].join(','))].join('|');
  return {tree,wood,guides,ground,signature};
}

function settings(){
  const v=new FormData(form);
  const bottom=Number(v.get('bottom')),top=Number(v.get('top')),pitch=Number(v.get('pitch'))/100;
  const radius=Number(v.get('width'))/2000,gap=Number(v.get('gap'))/1000;
  if(!form.checkValidity())throw Error('请检查灯带参数，圈距可设为 1–50 cm。');
  if(top<=bottom)throw Error('离地终点要高于起点。');
  if(pitch<radius*2)throw Error('每圈间距需要大于或等于灯带直径。');
  const scope=v.get('scope'),selectedGuide=scope==='selected'?(selection||pinned):null;
  if(scope==='selected'&&!selectedGuide)throw Error('请在树上选中一根可编辑的枝干。');
  return {bottom,top,pitch,radius,gap,scope,selectedGuide,direction:Number(v.get('direction')),
    color:v.get('color'),intensity:Number(v.get('intensity'))};
}

function schedule(delay=320){
  if(!active||!enabled())return;
  dirty=true;
  failure='';
  clearTimeout(debounce);
  const id=++sequence;
  queued=false;
  markPreset();
  status('等待更新…');
  debounce=setTimeout(()=>{
    if(id!==sequence)return;
    queued=true;
    run();
  },delay);
}

function requestUpdate(delay){
  if(active&&!worker){dirty=true;bind(active);}
  else schedule(delay);
}

function current(a){
  return enabled()&&a?.workbench.mode==='TREE'&&a.asset===active?.tree&&!a.workbench.busy
    &&!a.asset.group.userData.pending_rebuild&&(observed?a.authoring.tree_lights===observed:a.authoring===draftOwner);
}

function run(){
  if(!queued||running||!ready||!active||!current(app()))return;
  queued=false;
  try{
    const options=settings();
    running=true;
    runningId=sequence;
    status('正在沿树皮计算灯带…');
    worker.postMessage({type:'generate',id:sequence,epoch,...options});
  }catch(error){failure=error.message;status(failure);}
}

function showResult(group){
  const data=group?.userData.preview;
  if(!data?.span){status('这个范围没有可贴合的灯带。');return;}
  const [from,to]=data.span.map(z=>z.toFixed(2));
  status('离地 '+from+'–'+to+' m · 约 '+data.turns.toFixed(1)+' 圈 · '+group.children.length+' 段');
}

function applyResult(data){
  const a=app();
  if(!current(a)){queued=true;return;}
  const params=settings();
  const placement=source.kind==='procedural'?{kind:'procedural'}:{asset:source.id,revision:source.revision,mount:source.mount};
  const record={version:1,...placement,pose:active.pose,ground:active.ground,
    replaces:[...source.lamps],params,tracks:data.tracks.map(({guide,turns,points})=>({guide,turns,points:packLightTrack(points)}))};
  const group=a.commitTreeLights(record,active.tree);
  observed=a.authoring.tree_lights;
  draftOwner=null;
  pinned=params.selectedGuide;
  dirty=false;
  showResult(group);
}

function bind(target){
  worker?.terminate();
  worker=null;
  active=target;
  ready=running=false;
  const nextEpoch=++epoch;
  if(!target){fields.disabled=true;status('回到树干实体预览后可继续调节。');return;}
  const {mesh,guides,height}=treeLightSurfaceInput(target);
  target.pose=lightPoseKey(guides,target.ground);
  const top=form.elements.top;
  if(!top.defaultValue){
    const first=top.value;
    const initialHeight=source.kind==='procedural'?Math.min(height,3):height;
    top.defaultValue=Math.max(.01,Math.ceil(initialHeight*100)/100).toFixed(2);
    top.value=first||top.defaultValue;
  }
  panel.querySelector('[data-height]').textContent='当前树梢离地 '+height.toFixed(2)+' m';
  fields.disabled=false;
  if(!dirty&&observed?.pose===target.pose){showResult(target.tree.group.getObjectByName(TREE_LIGHT_GROUP));return;}
  worker=new Worker(new URL('./controls-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(data.epoch!==epoch)return;
    if(data.type==='ready'){ready=true;run();return;}
    if(data.type==='error'&&data.id===undefined){failure=data.message;status(failure);return;}
    if(data.type==='progress'){
      if(data.id===sequence)status('正在贴合树皮 · '+data.current+' / '+data.total+' 根枝干');
      return;
    }
    running=false;
    if(data.id===sequence){
      try{
        if(data.type==='error')throw Error(data.message);
        applyResult(data);
      }catch(error){failure=error.message;status(failure);}
    }
    run();
  };
  worker.onerror=()=>{worker?.terminate();worker=null;ready=running=false;failure='灯带计算中断，请重新更新。';status(failure);};
  worker.postMessage({type:'init',epoch:nextEpoch,mesh,guides,ground:target.ground,height},
    mesh.primitives.flatMap(p=>[p.position.buffer,p.index.buffer]));
  schedule(0);
}

function watch(){
  const a=app();
  if(!a?.asset)return;
  const treeMode=a.workbench.mode==='TREE';
  const bark=document.getElementById('barkMaterialOpen');
  if(bark&&bark.nextElementSibling!==entry)bark.after(entry);
  entry.hidden=!treeMode;
  entry.disabled=a.workbench.busy;
  if(!treeMode&&!panel.hidden)togglePanel(false);
  if(!treeMode||a.workbench.busy||!document.getElementById('busyOverlay')?.hidden)return;
  const record=a.authoring.tree_lights||null,imported=a.authoring.imported_trunks;
  const procedural=a.asset.masterBranches.some(isProceduralLightBranch);
  if(record!==observed||imported!==importedData||procedural!==proceduralAvailable||draftOwner&&a.authoring!==draftOwner){
    cancelWork();
    draftOwner=null;
    observed=record;
    importedData=imported;
    proceduralAvailable=procedural;
    pickTarget(imported,record,procedural);
    restoreFields(record);
  }
  enable.checked=enabled();
  entry.classList.toggle('active',enable.checked);
  enable.disabled=!source||a.asset.skeletonOnly;
  targetSelect.disabled=enable.checked;
  fields.hidden=!enable.checked;
  if(!source||!enable.checked){
    fields.disabled=true;
    status(source?'灯带已关闭。':'请先生成整树或装配树干，随后可启用灯带。');
    return;
  }
  const target=targetFor(a);
  if(!target&&!active){fields.disabled=true;status('回到树干实体预览后可继续调节。');return;}
  const selected=target?.guides.find(({branch})=>branch.stableId===a.selectedCurvePoint.branchId)?.id;
  if(selected!==selection){
    selection=selected;
    if(selected&&form.elements.scope.value==='selected'&&selected!==pinned)requestUpdate();
  }
  if(target?.tree!==active?.tree||target?.signature!==active?.signature){bind(target);return;}
  run();
}

entry.addEventListener('click',()=>togglePanel(panel.hidden));
panel.querySelector('[data-close]').addEventListener('click',()=>togglePanel(false));
panel.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.stopPropagation();togglePanel(false);entry.focus();}
});
targetSelect.addEventListener('change',()=>{pickTarget(importedData,null,proceduralAvailable);restoreFields(null);});
enable.addEventListener('change',()=>{
  const a=app();
  if(!source||!a?.asset||a.workbench.busy){enable.checked=enabled();return;}
  try{
    if(enable.checked){draftOwner=a.authoring;dirty=true;}
    else{
      cancelWork();
      draftOwner=null;
      if(observed)a.removeTreeLights(a.asset);
      observed=a.authoring.tree_lights||null;
      if(!observed)source.lamps.clear();
    }
    watch();
  }catch(error){enable.checked=enabled();status(error.message);}
});
form.addEventListener('input',()=>requestUpdate());
form.addEventListener('submit',event=>{event.preventDefault();if(active){dirty=true;bind(active);}});
form.addEventListener('reset',()=>setTimeout(()=>{if(active){dirty=true;bind(active);}},0));
for(const button of presets)button.addEventListener('click',()=>{
  form.elements.pitch.value=button.dataset.pitch;
  requestUpdate(0);
});
const timer=setInterval(()=>{
  try{watch();}catch(error){failure=error.message;status(failure);}
},220);
window.__treeLightControls={async flush(){
  watch();
  if(!enabled()||!dirty)return;
  clearTimeout(debounce);
  if(!running||runningId!==sequence){queued=true;run();}
  const deadline=performance.now()+120000;
  while(enabled()&&dirty&&!failure&&performance.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,80));
  }
  if(failure)throw Error(failure);
  if(enabled()&&dirty)throw Error('灯带还在计算，请稍后重试。');
}};
window.addEventListener('pagehide',()=>{clearInterval(timer);cancelWork();},{once:true});
