import {createUnitPaintController} from './unit-paint-controller.js';
import {createUnitDensityController} from './unit-density-controller.js';
const $=id=>document.getElementById(id);
export function createUnitBrushTools(api,context){
 const paint=createUnitPaintController(api,context),density=createUnitDensityController(api,context),rail=document.querySelector('.viewport-tool-rail');
 const make=(id,icon,label)=>{const b=document.createElement('button');b.type='button';b.id=id;b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed','false');b.innerHTML=`<i data-lucide="${icon}"></i>`;rail.append(b);return b;};
 const add=make('unitPaintTool','paintbrush','刷生成完整单元枝 · Alt 擦除'),densityButton=make('unitDensityTool','sprout','密度刷 · 加密 / Alt 疏化'),size=make('unitSizeTool','scaling','大小刷 · 放大 / Alt 缩小');
 const badge=document.createElement('span');badge.id='unitBrushActionBadge';badge.className='unit-brush-action-badge';badge.hidden=true;$('branchEditScopeBar').append(badge);
 let opening=false;
 add.onclick=async()=>{if(opening)return;opening=true;try{await paint.open();}catch(error){api.toast(error.message,true);}finally{opening=false;refresh();}};
 densityButton.onclick=async()=>{if(opening)return;opening=true;try{await density.open();}catch(error){api.toast(error.message,true);}finally{opening=false;refresh();}};
 size.onclick=async()=>{if(opening)return;opening=true;try{await api.unitMode();if(!api.isTree()||api.getSkeletonEditMode())return;
  $('branchEditScope').value='DIRECT';$('branchEditScope').dispatchEvent(new Event('change',{bubbles:true}));
  $('unitBrushEffect').value='SCALE';$('unitBrushEffect').dispatchEvent(new Event('change',{bubbles:true}));api.setTool('COMB');context.setMode('COMB');
 }catch(error){api.toast(error.message,true);}finally{opening=false;refresh();}};
 function refresh(){
  const tree=api.isTree(),isPaint=tree&&api.canvas.dataset.viewportTool==='UNIT_PAINT',isSize=tree&&api.getTreeEditMode()==='UNIT'&&api.canvas.dataset.viewportTool==='COMB'&&$('unitBrushEffect').value==='SCALE';
  const isDensity=tree&&api.canvas.dataset.viewportTool==='UNIT_DENSITY';
  const group=add.closest('details');if(group){group.hidden=!tree;if(isPaint||isSize||isDensity)group.open=true;}
  const comb=rail.querySelector('[data-viewport-tool="COMB"]');if(comb){const active=tree&&api.canvas.dataset.viewportTool==='COMB'&&!isSize;comb.classList.toggle('active',active);comb.setAttribute('aria-pressed',String(active));}
  for(const[button,active]of [[add,isPaint],[densityButton,isDensity],[size,isSize]]){button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.disabled=!tree||api.getSkeletonEditMode()||opening;}
  badge.hidden=!isPaint&&!isSize&&!isDensity;
  if(!isPaint)badge.classList.remove('erasing');
  if(isPaint){const item=api.selectedAsset();badge.textContent=paint.debug.erase?'− 擦除完整单元枝 · Alt 按住':'刷生成 · '+(item?item.name+' · V'+item.revision:'先在左侧选择素材')+' · Alt 擦除';badge.classList.toggle('erasing',paint.debug.erase);$('branchEditScopeCount').textContent=($('unitPaintScope').value==='SELECTED'?'指定母枝':'可见母枝')+' · '+($('unitPaintHitMode').value==='AXIS'?'穿透刷取':'表面刷取')+' · '+($('unitPaintOrientation').value==='RADIAL'?'环绕360°':'表面朝向');}
  else if(isSize)badge.textContent='大小刷 · '+($('unitBrushSizeMode').value==='SHRINK'?'− 缩小':'＋ 放大 · Alt 临时缩小');
  else if(isDensity){badge.textContent='密度刷 · '+(density.debug.thin?'− 疏化':'＋ 加密')+' · Alt 临时反向';badge.classList.toggle('erasing',density.debug.thin);$('branchEditScopeCount').textContent=($('unitDensityScope').value==='SELECTED'?'当前选区 · 含挂接子枝':'全部可见')+' · '+Math.round(Number($('unitDensityStrength').value))+'% / 笔';}
 }
 document.addEventListener('tree-assembly-refreshed',refresh);
 document.addEventListener('unit-paint-mode',refresh);
 document.addEventListener('unit-density-mode',refresh);
 document.addEventListener('unit-brush-direction',e=>{if(!badge.hidden&&api.canvas.dataset.viewportTool==='COMB')badge.textContent='大小刷 · '+(e.detail.sizeMode==='SHRINK'?'− 缩小'+(e.detail.temporary?' · Alt 按住':''):'＋ 放大 · Alt 临时缩小');});
 for(const id of ['unitBrushEffect','unitBrushSizeMode'])$(id).addEventListener('change',refresh);
 new MutationObserver(refresh).observe(api.canvas,{attributes:true,attributeFilter:['data-viewport-tool']});
 return {paint,density,refresh,toolChanged:next=>{paint.toolChanged(next);density.toolChanged(next);refresh();},reset:()=>{paint.reset();density.reset();},releaseDisplay:owner=>{paint.releaseDisplay(owner);density.releaseDisplay(owner);},get pending(){return paint.debug.pending||density.debug.pending;},get committing(){return paint.debug.committing||density.debug.committing;},get active(){return paint.active||density.active;}};
}
