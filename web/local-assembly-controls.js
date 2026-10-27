import * as THREE from 'three';
import { copy } from './branch-workbench-data.js';
import { skeletonBranches } from './skeleton-thickness.js';
import { assemblyTargets, assemblyProtection, localAssemblyState, localAssemblyPlan } from './local-assembly-data.js';

export function createLocalAssemblyControls(api) {
  const panel=document.createElement('details');panel.id='localAssemblyPanel';panel.className='wb-tree-only local-assembly';
  panel.innerHTML='<summary>局部装配与精修保护</summary><p class="vine-note">框选主枝，或刷选屏幕区域；只修改范围内可自动调整的单元枝。刷选穿过屏幕深度，请核对选中枝与统计；Shift 擦除选区。</p><label>作用范围<select id="laScope"><option value="SELECTED">选中的承重枝</option><option value="SUBTREE">选中枝与下级</option><option value="BRUSH">刷选的承重枝</option><option value="TREE">整棵树</option></select></label><div class="wb-row"><button id="laBrush">刷选区域</button><button id="laClearBrush">清除刷选</button></div><label>刷选半径（屏幕像素）<input id="laBrushRadius" type="range" min="12" max="140" step="2" value="48"></label><div class="field-grid"><label>起点（%）<input id="laStart" type="number" min="0" max="99" value="0"></label><label>终点（%）<input id="laEnd" type="number" min="1" max="100" value="100"></label></div><label>分区<select id="laRole"><option value="ANY">全部分区</option><option value="MATURE">偏内部 · 深绿</option><option value="MIXED">中间 · 混合</option><option value="YOUNG">末端 · 嫩绿</option></select></label><p id="laSummary" role="status"></p><label>局部目标单元枝数量<input id="laCount" type="number" min="0" max="1600" step="1" value="0"></label><label>使用素材<select id="laAsset"><option value="">沿用三类样本</option></select></label><div class="wb-row"><button id="laPreviewCount">预览数量</button><button id="laPreviewReplace">预览替换</button></div><label>沿枝疏密<select id="laProfile"><option value="UNIFORM">均匀</option><option value="TIP">靠近枝梢</option><option value="ROOT">靠近枝根</option></select></label><div class="wb-row"><button id="laPreviewLayout">预览铺设</button><button id="laVoid">预览保留空隙</button></div><button id="laClearVoid">解除此范围的空隙</button><div class="wb-row"><button id="laLock">锁定范围内单元枝</button><button id="laUnlock">解除手动锁定</button></div><p class="vine-note">锁定保留样本、版本与挂点；精修、独立副本和附属挂接自动保护。解锁不会抹去精修。改变承重枝形时，单元枝仍跟随母枝。</p><details><summary>范围内的保护原因</summary><div id="laProtectedList"></div><button id="laSelectProtected">选中受保护单元枝</button></details><div id="laPreviewActions" hidden><p id="laImpact" role="status"></p><div class="wb-row"><button id="laCommit" class="accent">确认局部修改</button><button id="laCancel">取消预览</button></div></div>';
  document.getElementById('wbAssemblyZones').closest('.wb-assembly').after(panel);
  const $=id=>panel.querySelector('#'+id);
  const brush=document.createElement('div');brush.className='assembly-brush-ring';brush.hidden=true;api.canvas.parentElement.append(brush);
  let brushActive=false,drag=null,painted=new Set(),preview=null,lastAsset=null,lastSignature='';
  const valid=()=>api.isTree()&&!api.getSkeletonEditMode()&&!api.isBusy()&&api.getAsset();
  const options=()=>({start:Number($('laStart').value)/100,end:Number($('laEnd').value)/100,role:$('laRole').value,count:Number($('laCount').value),assetId:$('laAsset').value,profile:$('laProfile').value});
  const targets=()=>assemblyTargets(api.getAsset()?.masterBranches||[],api.getAuthoring(),$('laScope').value==='BRUSH'?painted:api.getSelections(),$('laScope').value);
  function cancel(){if(!preview)return false;preview=null;api.cancel();refresh();return true;}
  function stopBrush(){brushActive=false;brush.hidden=true;if(drag){api.controls.enabled=drag.controls;api.canvas.releasePointerCapture?.(drag.id);drag=null;} $('laBrush').classList.remove('active');}
  async function plan(action){if(!valid()||preview)return;try{
    stopBrush();const requested=options(),ids=targets();await api.flush();const a=copy(api.getAuthoring()),result=localAssemblyPlan(a,api.getAsset().masterBranches,ids,{...requested,action});
    preview={baseline:api.getAuthoring(),result};api.begin();api.preview(next=>Object.assign(next,a));
    $('laImpact').textContent=`${ids.length} 根承重枝 · 新增 ${result.added.length} · 移除 ${result.removed.length} · 调整 ${result.changed.length} · 保护 ${result.protectedCount}。确认后记一次撤销。`;
    refresh();
  }catch(e){api.toast(e.message,true);}}
  const actions={laPreviewCount:'COUNT',laPreviewReplace:'REPLACE',laPreviewLayout:'DISTRIBUTE',laVoid:'VOID',laClearVoid:'CLEAR_VOID',laLock:'LOCK',laUnlock:'UNLOCK'};
  for(const [id,action] of Object.entries(actions))$(id).onclick=()=>plan(action);
  $('laCommit').onclick=()=>{if(preview){preview=null;api.commit();refresh();api.toast('局部装配已确认，可撤销');}};$('laCancel').onclick=cancel;
  $('laBrush').onclick=()=>{if(!valid()||preview)return;brushActive=!brushActive;if(brushActive){api.setTool('SELECT');$('laScope').value='BRUSH';panel.open=true;$('laBrush').classList.add('active');api.toast('在视口拖动刷选承重枝；Shift 擦除选区，Esc 退出');}else stopBrush();};
  $('laClearBrush').onclick=()=>{stopBrush();painted.clear();lastSignature='';refresh();};
  api.canvas.addEventListener('pointercancel',()=>{if(drag)stopBrush();});api.canvas.addEventListener('lostpointercapture',()=>{if(drag)stopBrush();});window.addEventListener('blur',()=>{if(drag)stopBrush();});
  $('laSelectProtected').onclick=()=>{try{const state=localAssemblyState(api.getAuthoring(),targets(),options()),ids=new Set(state.protected.map(i=>i.id));const roots=(api.getAsset()?.masterBranches||[]).filter(b=>ids.has(b.instanceId)&&b.parentId>=0&&!ids.has(api.getAsset().masterBranches.find(p=>p.id===b.parentId)?.instanceId)).map(b=>b.stableId);api.setSelections(roots);}catch(e){api.toast(e.message,true);}};
  for(const id of ['laScope','laStart','laEnd','laRole'])$(id).onchange=()=>{if(brushActive&&$('laScope').value!=='BRUSH')stopBrush();lastSignature='';refresh();};
  function refresh(){
    panel.hidden=!api.isTree();if(preview&&!api.isEditing())preview=null;
    if(lastAsset&&lastAsset!==api.getAsset()&&!preview&&lastAsset.authoring!==api.getAuthoring())stopBrush();lastAsset=api.getAsset();
    if(!api.isTree()){cancel();stopBrush();}
    $('laPreviewActions').hidden=!preview;
    for(const e of panel.querySelectorAll('input,select,button'))e.disabled=!!preview&&!['laCommit','laCancel'].includes(e.id)||!valid();
    if(!valid()||!panel.open&&!preview&&!brushActive)return;
    const library=api.library(),select=$('laAsset'),value=select.value;
    const libSig=library.map(a=>a.id+':'+a.name).join('|');if(select.dataset.signature!==libSig){select.replaceChildren(new Option('沿用三类样本',''),...library.map(a=>new Option(a.name,a.id)));select.value=library.some(a=>a.id===value)?value:'';select.dataset.signature=libSig;}
    try{const ids=targets(),state=localAssemblyState(api.getAuthoring(),ids,options());
      const signature=JSON.stringify([ids,state.total.map(i=>[i.id,i.assembly_locked,state.protection.get(i.id)]),options().start,options().end,options().role]);if(signature===lastSignature)return;lastSignature=signature;
      $('laSummary').textContent=`${ids.length} 根承重枝 · ${state.total.length} 根单元枝 · 可调 ${state.editable.length} · 保护 ${state.protected.length}`;
      if(document.activeElement!==$('laCount')&&!preview)$('laCount').value=state.total.length;
      const reasons=new Map();for(const i of state.protected){const reason=state.protection.get(i.id)||'联动枝群';reasons.set(reason,(reasons.get(reason)||0)+1);}
      $('laProtectedList').textContent=[...reasons].map(([reason,count])=>`${reason}：${count} 枝`).join('\n')||'当前范围无受保护单元枝';
    }catch(e){$('laSummary').textContent=e.message;}
  }
  panel.addEventListener('toggle',()=>{if(panel.open)refresh();});
  function paint(event){const rect=api.canvas.getBoundingClientRect(),radius=Number($('laBrushRadius').value),center=new THREE.Vector2(event.clientX-rect.left,event.clientY-rect.top);brush.hidden=false;brush.style.cssText=`left:${center.x-radius}px;top:${center.y-radius}px;width:${radius*2}px;height:${radius*2}px`;
    const bones=skeletonBranches(api.getAsset().masterBranches).filter(b=>!b.symmetryGroup&&api.isVisible(b.stableId));const affected=[];
    for(const b of bones){let previous=null;for(const point of b.points){const p=point.clone().applyMatrix4(api.modelRoot.matrixWorld).project(api.camera);if(p.z < -1||p.z>1){previous=null;continue;}const pixel=new THREE.Vector2((p.x+1)*rect.width/2,(1-p.y)*rect.height/2);if(previous){const v=pixel.clone().sub(previous),t=Math.max(0,Math.min(1,center.clone().sub(previous).dot(v)/Math.max(v.lengthSq(),1e-6)));if(previous.clone().addScaledVector(v,t).distanceTo(center)<=radius){affected.push(b.stableId);break;}}previous=pixel;}}
    for(const id of affected)event.shiftKey?painted.delete(id):painted.add(id);api.setSelections([...painted]);lastSignature='';refresh();
  }
  return {refresh,cancel,plan,stop:stopBrush,get active(){return brushActive||!!preview||!!drag;},get preview(){return preview;},
    begin(e){if(!brushActive||!valid()||e.button!==0)return false;drag={id:e.pointerId,controls:api.controls.enabled};api.controls.enabled=false;api.canvas.setPointerCapture(e.pointerId);paint(e);return true;},
    move(e){if(!brushActive)return false;if(drag&&e.pointerId===drag.id)paint(e);return true;},
    end(e){if(!drag||e.pointerId!==drag.id)return false;api.controls.enabled=drag.controls;api.canvas.releasePointerCapture?.(e.pointerId);drag=null;return true;},
    key(e){if(e.key==='Escape'&&(preview||brushActive)){cancel();stopBrush();return true;}return false;}};
}
