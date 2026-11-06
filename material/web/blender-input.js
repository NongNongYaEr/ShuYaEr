import {BLENDER_NAV_HINT,viewKey,viewLabel,setAxisView,changed} from './blender-navigation.js';
import {installUVNavigation,resetUVView,frameUVSelected} from './uv-view.js';

export const isTextEntry=element=>!!element&&(element.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(element.tagName));
// Editor shortcuts follow the pointer; document commands remain available outside editors.
export function setupBlenderInput({renderer:r,root=document,isBusy=()=>false,isClosing=()=>false,save,open,cancelTask,notify=()=>{},brushTarget=()=>null,authoring=null}={}){
 const events=new AbortController(),$=id=>root.getElementById(id),canvas=r.canvas;
 const listen=(el,type,fn,options={})=>el.addEventListener(type,fn,{...options,signal:events.signal});
 canvas.tabIndex=0;canvas.dataset.blenderEditor='3d';canvas.setAttribute('aria-label','三维材质视口；Blender 默认键位');
 let editor=canvas,modal=null,menuOpen=false,returnFocus=null,menuEditor=canvas;
 const uvControllers=new Map();for(const id of ['currentUV','candidateUV','partUV','partSuggestionUV']){const c=$(id);if(c)uvControllers.set(c,installUVNavigation(c,{signal:events.signal}));}
 const status=root.createElement('span');status.id='blenderViewLabel';status.className='blender-view-label';root.querySelector('.viewport-label')?.append(status);
 const previousChanged=r.onViewChanged;r.onViewChanged=()=>{previousChanged?.();status.textContent=viewLabel(r);};r.onViewChanged();
 const panel=root.createElement('div');panel.id='blenderCommandMenu';panel.className='blender-command-menu';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','操作搜索与视图');
 const search=root.createElement('input');search.type='search';search.placeholder='搜索操作（F3）';search.setAttribute('aria-label','搜索操作');const rows=root.createElement('div'),hint=root.createElement('p');hint.className='control-note';hint.textContent='↑ ↓ 选择 · Enter 执行 · Esc 关闭';panel.append(search,rows,hint);root.body.append(panel);
 const brushStatus=root.createElement('div');brushStatus.id='blenderBrushStatus';brushStatus.className='blender-brush-status';brushStatus.hidden=true;$('dropZone').append(brushStatus);
 const click=id=>()=>$(id)?.click(),toggle=name=>()=>root.body.classList.toggle(name);
 const activateTool=(id,stage)=>()=>{const mode=$('workspaceMode');mode.value='professional';mode.onchange({target:mode});root.querySelector('[data-stage-button="'+stage+'"]').click();$(id).click();};
 const commands=[
  ['UV 显示全部','Home',()=>resetUVView(menuEditor?.dataset.blenderEditor==='uv'?menuEditor:$('currentUV')),'uv'],['UV 聚焦所选','小键盘 .',()=>frameUVSelected(menuEditor?.dataset.blenderEditor==='uv'?menuEditor:$('currentUV')),'uv'],
  ['显示全部','Home',()=>r.frameAll(),'view'],['聚焦所选','小键盘 .',()=>{if(!r.frameSelected())notify('先在树表面点选位置，或选择一个部位。');},'view'],
  ['前视图','小键盘 1',()=>setAxisView(r,'front'),'view'],['右视图','小键盘 3',()=>setAxisView(r,'right'),'view'],['顶视图','小键盘 7',()=>setAxisView(r,'top'),'view'],
  ['后视图','Ctrl 小键盘 1',()=>setAxisView(r,'back'),'view'],['左视图','Ctrl 小键盘 3',()=>setAxisView(r,'left'),'view'],['底视图','Ctrl 小键盘 7',()=>setAxisView(r,'bottom'),'view'],
  ['透视 / 正交','小键盘 5',()=>{r.orthographic=!r.orthographic;changed(r);},'view'],
  ['材质预览','Z',()=>root.querySelector('[data-mode="-1"]').click(),'display'],['白模预览','Z',()=>root.querySelector('[data-mode="3"]').click(),'display'],['颜色检查','Z',()=>root.querySelector('[data-mode="0"]').click(),'display'],['法线检查','Z',()=>root.querySelector('[data-mode="1"]').click(),'display'],['粗糙度检查','Z',()=>root.querySelector('[data-mode="4"]').click(),'display'],['UV 棋盘检查','Z',()=>root.querySelector('[data-mode="6"]').click(),'display'],
  ['打开工程','Ctrl O',open,'project'],['保存本机工程','Ctrl S',()=>save({download:false}),'project'],['另存工程包 .treeproj','Ctrl Shift S',()=>save({download:true}),'project'],['撤销','Ctrl Z',click('undo'),'project'],['重做','Ctrl Shift Z',click('redo'),'project'],
  ['材质画笔','B',()=>{root.querySelector('[data-stage-button=material]').click();authoring?.materialPaint?.();},'tool'],
  ['蒙版画笔','',authoring?()=>{root.querySelector('[data-stage-button=material]').click();authoring.paint();}:activateTool('paintTool','material'),'tool'],['部位刷选','',authoring?()=>{root.querySelector('[data-stage-button=material]').click();authoring.parts();}:activateTool('partTool','material'),'tool'],['接缝标记','',activateTool('uvSeamTool','model'),'tool'],['流向校正','',activateTool('flowTool','material'),'tool'],['导出材质贴图','',click('exportTop'),'tool'],
  ['工具面板','T',toggle('blender-tools-hidden'),'view'],['属性面板','N',toggle('blender-properties-hidden'),'view'],['最大化视口','Ctrl Space',toggle('blender-maximized'),'view']
 ];
 let visible=[],active=0,category=null;
 function closeMenu(){if(!menuOpen)return;menuOpen=false;panel.hidden=true;returnFocus?.focus?.({preventScroll:true});}
 function execute(c){closeMenu();if(isClosing()||isBusy())return;c[2]?.();}
 function renderMenu(){const query=search.value.trim().toLocaleLowerCase();visible=commands.filter(c=>(!category||c[3]===category)&&(!query||(c[0]+' '+c[1]).toLocaleLowerCase().includes(query)));active=Math.min(active,Math.max(0,visible.length-1));rows.replaceChildren(...visible.map((c,i)=>{const b=root.createElement('button');b.type='button';b.dataset.command=c[0];b.classList.toggle('active',i===active);b.disabled=isBusy();const text=root.createElement('span'),key=root.createElement('kbd');text.textContent=c[0];key.textContent=c[1];b.append(text,key);b.onclick=()=>execute(c);return b;}));if(!visible.length){const p=root.createElement('p');p.textContent='没有匹配的操作';rows.append(p);}}
 function showMenu({kind=null,x,y}={}){if(isClosing()||modal)return;r.finishInteraction?.();menuOpen=true;menuEditor=editor||canvas;returnFocus=root.activeElement;category=kind;search.value='';active=0;panel.hidden=false;panel.style.left=Math.max(8,Math.min(x??innerWidth/2-170,innerWidth-360))+'px';panel.style.top=Math.max(8,Math.min(y??innerHeight*.18,innerHeight-440))+'px';renderMenu();search.focus({preventScroll:true});}
 for(const c of uvControllers.keys())listen(c,'contextmenu',e=>{e.preventDefault();editor=c;showMenu({kind:'uv',x:e.clientX,y:e.clientY});});
 listen(search,'input',()=>{active=0;renderMenu();});
 function endBrush(cancel){if(!modal)return false;const m=modal;modal=null;if(cancel)m.input.value=m.before;brushStatus.hidden=true;return true;}
 function startBrush(strength){if(isBusy())return;const target=brushTarget(strength);if(!target){notify(strength?'强度调整仅用于遮罩画笔。':'先启用遮罩画笔或部位刷选，再按 F 调整半径。');return;}r.finishInteraction?.();modal={input:target,before:target.value,start:Number(target.value),x:r.lastPointer?.clientX??canvas.getBoundingClientRect().left+canvas.clientWidth/2,strength};brushStatus.hidden=false;brushStatus.textContent=(strength?'强度':'半径')+' '+target.value+' · 移动鼠标调整 · 左键确认 · 右键 / Esc 取消';}
 r.onPointerAction=e=>{if(!modal)return false;if(e.button===0||e.button===2){e.preventDefault();endBrush(e.button===2);}return true;};
 r.onPointerMotion=e=>{if(!modal)return false;const {input,start,x,strength}=modal,min=input.min!==''?Number(input.min):.01,max=input.max!==''?Number(input.max):20,value=strength?start+(e.clientX-x)/300:start*Math.exp((e.clientX-x)*.01);input.value=String(Number(Math.max(min,Math.min(max,value)).toFixed(3)));brushStatus.textContent=(strength?'强度 ':'半径 ')+input.value+(strength?'':' 米')+' · 左键确认 · 右键 / Esc 取消';return true;};
 r.onWheelAction=()=>!!modal;r.onContextMenu=e=>showMenu({x:e.clientX,y:e.clientY});
 listen(root,'pointerover',e=>{const c=e.target.closest?.('canvas[data-blender-editor]');editor=c||null;});
 listen(root,'pointerdown',e=>{if(menuOpen&&!panel.contains(e.target))closeMenu();if(modal&&e.target!==canvas)endBrush(true);},{capture:true});
 listen(globalThis,'blur',()=>{endBrush(true);closeMenu();r.cancelInteraction?.();for(const c of uvControllers.values())c.cancel();});
 const menuButton=root.createElement('button');menuButton.id='blenderControls';menuButton.type='button';menuButton.textContent='Blender 操作';menuButton.title=BLENDER_NAV_HINT+' · F3 搜索 · Z 显示菜单 · T / N 面板';menuButton.onclick=()=>showMenu();root.querySelector('.view-options').append(menuButton);
 function keydown(e){if(isClosing()){e.preventDefault();return;}if(e.isComposing||e.key==='Process')return;
  if(modal){e.preventDefault();if(e.key==='Escape')endBrush(true);else if(e.key==='Enter')endBrush(false);return;}
  if(menuOpen){if(['Escape','Enter','ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(e.key==='Escape')closeMenu();else if(e.key==='Enter'){if(visible[active])execute(visible[active]);}else{active=(active+(e.key==='ArrowDown'?1:-1)+Math.max(1,visible.length))%Math.max(1,visible.length);renderMenu();rows.children[active]?.scrollIntoView({block:'nearest'});}return;}return;}
  if($('projectDialog')?.open){if((e.ctrlKey||e.metaKey)&&['s','o','z'].includes(e.key.toLowerCase()))e.preventDefault();if(e.key==='Escape'&&isBusy())cancelTask();return;}
  if(isTextEntry(root.activeElement)||isTextEntry(e.target))return;
  const key=e.key.toLowerCase(),ctrl=e.ctrlKey||e.metaKey;
  if(e.key==='Escape'){const cancelled=r.cancelInteraction?.();for(const c of uvControllers.values())c.cancel();if(isBusy())cancelTask();if(cancelled||isBusy())e.preventDefault();return;}
  if(ctrl&&!e.altKey&&['s','o','z'].includes(key)){e.preventDefault();if(isBusy()||e.repeat)return;r.finishInteraction?.();if(key==='s')save({download:e.shiftKey});if(key==='o')open();if(key==='z')$(e.shiftKey?'redo':'undo').click();return;}
  if(e.key==='F3'){e.preventDefault();if(!e.repeat)showMenu();return;}
  if(!editor)return;
  if(editor.dataset.blenderEditor==='uv'){if(e.code==='Home'||e.code==='NumpadDecimal'){e.preventDefault();e.code==='Home'?resetUVView(editor):frameUVSelected(editor);}return;}
  if(ctrl&&e.code==='Space'){e.preventDefault();if(!e.repeat)root.body.classList.toggle('blender-maximized');return;}
  if(viewKey(r,e)){e.preventDefault();return;}
  if(ctrl||e.altKey)return;
  if(key==='f'){e.preventDefault();if(!e.repeat)startBrush(e.shiftKey);}
  else if((key==='b'||key==='e')&&authoring?.brush&&root.body.dataset.workspaceStage==='material'){e.preventDefault();if(!e.repeat)authoring.brush(key==='e'?'erase':'paint');}
  else if(key==='z'){e.preventDefault();if(!e.repeat)showMenu({kind:'display'});}
  else if(key==='t'||key==='n'){e.preventDefault();if(!e.repeat)root.body.classList.toggle(key==='t'?'blender-tools-hidden':'blender-properties-hidden');}
 }
 listen(root,'keydown',keydown);
 $('resetView').title='显示全部（Home）';$('saveProject').title='保存本机工程（Ctrl S）；另存工程包（Ctrl Shift S）';$('loadProject').title='打开工程（Ctrl O）';
 return {showMenu,get modal(){return modal&&{strength:modal.strength,value:modal.input.value};},dispose(){endBrush(true);closeMenu();for(const c of uvControllers.values())c.cancel();events.abort();panel.remove();status.remove();brushStatus.remove();menuButton.remove();r.onViewChanged=previousChanged;r.onPointerAction=r.onPointerMotion=r.onWheelAction=r.onContextMenu=null;root.body.classList.remove('blender-tools-hidden','blender-properties-hidden','blender-maximized');}};
}
