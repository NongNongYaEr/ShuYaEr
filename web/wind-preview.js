import * as T from './vendor/three.module.min.js';
import {createGpuMeshPreview} from './gpu-edit-preview.js';
import {createSculptSnapshot,sampleLine,lineTangent} from './tree-sculpt.js';
import {WIND_PRESETS,normalizeWindPreview,createWindPose} from './wind-preview-data.js';

export function createWindPreview(api){
 const $=id=>document.getElementById(id),canvas=api.canvas;
 const launch=document.createElement('button');launch.id='openWindPreview';launch.className='wind-launch';launch.title='风动模拟 · 在当前视窗大致预览';launch.innerHTML='<i data-lucide="wind"></i><span>风动预览</span>';$('snapshotBtn').before(launch);
 const entry=document.createElement('section');entry.className='wind-entry';entry.innerHTML='<h2>风动模拟</h2><p>观察主干与枝条的分层摆动，完整单元枝随挂点运动。</p><button id="windPreviewEntry">打开风动预览 →</button>';
 document.querySelector('[data-page="state"] .workspace-page-intro').after(entry);
 const panel=document.createElement('section');panel.id='windInspector';panel.hidden=true;panel.setAttribute('aria-label','风动模拟参数');
 const field=(id,name,value)=>`<div class="wind-field"><label for="wind_${id}">${name}</label><output id="wind_${id}Value">${value}%</output><input id="wind_${id}" data-wind="${id}" type="range" min="0" max="1" step="0.01" value="${value/100}"></div>`;
 panel.innerHTML=`<header><div><small>表现预览 · 临时模拟</small><h2>风动模拟</h2></div><button id="windClose" aria-label="关闭风动预览" title="关闭 · Esc">×</button></header><section><h3>选择风的感觉</h3><div class="wind-presets">${Object.entries(WIND_PRESETS).map(([id,p])=>`<button data-wind-preset="${id}">${p.name}</button>`).join('')}</div>${field('strength','风力',50)}${field('gust','阵风变化',45)}${field('turbulence','随机变化',30)}</section><section><h3>吹向</h3><div class="wind-direction"><div class="wind-compass" aria-hidden="true"><span id="windCompassArrow">↑</span></div><label><input id="wind_direction" data-wind="direction" type="number" min="0" max="360" step="5" aria-label="风吹向角度"> °</label></div><p class="wind-note">0° 吹向 +X，90° 吹向 +Y</p><label class="wind-toggle"><input id="wind_showDirection" data-wind="showDirection" type="checkbox" checked>显示风向箭头</label></section><section><h3>摆动层次</h3>${field('trunk','主干摆幅',35)}${field('branch','侧枝柔软度',65)}${field('unit','单元枝整体摆幅',35)}</section><div class="wind-footer"><button id="windReset">恢复自然风设置</button><p class="wind-note">用于软件内大致观察。根部固定，单元枝保持整支造型；参数随工程保存。</p></div>`;
 document.querySelector('.inspector-scroll').prepend(panel);
 const bar=document.createElement('div');bar.id='windPlayback';bar.hidden=true;bar.setAttribute('role','group');bar.setAttribute('aria-label','风动播放控制');bar.innerHTML='<button id="windPlay" class="wind-primary">▶ 播放</button><button id="windStop">■ 静止</button><button id="windRestart" title="从头播放">↻ 重播</button><button id="windStep" title="暂停后前进一步">单步</button><select id="wind_speed" data-wind="speed" aria-label="风动播放速度"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select><output id="windTime">0.0 s</output><small>空格 播放/暂停 · 中键观察</small>';
 const badge=document.createElement('div');badge.id='windModeBadge';badge.hidden=true;badge.setAttribute('role','status');canvas.parentElement.append(bar,badge);
 const arrow=new T.ArrowHelper(new T.Vector3(1,0,0),new T.Vector3(),1,0xb2ddc6,.18,.09);arrow.name='风向参照';arrow.visible=false;api.markerRoot.add(arrow);
 let previousTab=null;
 let opened=false,playing=false,preparing=false,time=0,last=null,lastDraw=-Infinity,source=null,preview=null,snapshot=null,pose=null,frame=null,error='',phase='REST',epoch=0;
 const settings=()=>normalizeWindPreview(api.getAuthoring()?.wind_preview);
 function sync(){const p=settings();for(const control of panel.querySelectorAll('[data-wind]')){const k=control.dataset.wind;if(control.type==='checkbox')control.checked=p[k];else if(document.activeElement!==control)control.value=p[k];const output=$('wind_'+k+'Value');if(output)output.textContent=Math.round(p[k]*100)+'%';}
  $('wind_speed').value=String(p.speed);$('windCompassArrow').style.transform=`rotate(${p.direction+90}deg)`;for(const b of panel.querySelectorAll('[data-wind-preset]'))b.classList.toggle('active',b.dataset.windPreset===p.preset);
  $('windPlay').textContent=preparing?'准备中…':playing?'Ⅱ 暂停':'▶ 播放';$('windPlay').disabled=preparing;$('windStep').disabled=playing||preparing;$('windTime').textContent=time.toFixed(1)+' s';badge.textContent=error||({REST:'风动预览 · 静止造型',PREPARING:'风动预览 · 正在准备',PLAYING:'风动预览 · 正在播放',PAUSED:'风动预览 · 已暂停'}[phase]);
  panel.hidden=bar.hidden=badge.hidden=!opened;launch.classList.toggle('active',opened);launch.setAttribute('aria-pressed',String(opened));document.body.classList.toggle('wind-preview-open',opened);
  arrow.visible=opened&&p.showDirection&&Boolean(source);if(source&&pose){const points=[...snapshot.values()].filter(b=>!pose.index.ownerOf(b.stableId)).flatMap(b=>b.points);if(points.length){const box=new T.Box3().setFromPoints(points),h=Math.max(.2,box.max.z-box.min.z),length=Math.max(.25,h*.18);arrow.position.set(box.min.x-h*.22,(box.min.y+box.max.y)/2,box.min.z+h*.12);arrow.setLength(length,length*.18,length*.1);arrow.setDirection(new T.Vector3(Math.cos(T.MathUtils.degToRad(p.direction)),Math.sin(T.MathUtils.degToRad(p.direction)),0));}}
 }
 function stop(){epoch++;playing=false;preparing=false;last=null;time=0;lastDraw=-Infinity;preview?.restore();preview=null;snapshot=null;pose=null;frame=null;source=null;phase='REST';error='';arrow.visible=false;sync();}
 function close(){stop();opened=false;sync();if(previousTab?.isConnected&&document.querySelector('[data-tab="state"]')?.classList.contains('active'))previousTab.click();previousTab=null;}
 function open(){if(!opened){previousTab=document.querySelector('.tab-button.active');document.querySelector('[data-tab="state"]')?.click();}opened=true;error='';sync();api.onOpen?.();}
 function fail(e){stop();error=e.message||String(e);phase='REST';sync();api.status(error,'error');}
 function render(){if(!preview||!pose)return;frame=pose.evaluate(time,settings());preview.update(frame.updated,frame.transforms);}
 async function play(){
  if(preparing)return;if(playing){playing=false;last=null;phase='PAUSED';sync();return;}
  opened=true;
  if(preview&&source===api.getAsset()&&source.activeEditPreview===preview){playing=true;phase='PLAYING';last=null;sync();return;}
  stop();opened=true;const ticket=++epoch;preparing=true;phase='PREPARING';sync();
  try{await api.prepare();if(ticket!==epoch)return;source=api.getAsset();if(!source?.masterBranches?.length)throw Error('请先打开或生成植物模型');if(source.activeEditPreview)throw Error('请先完成当前造型调整');
   await new Promise(r=>requestAnimationFrame(r));if(ticket!==epoch)return;
   snapshot=createSculptSnapshot(source.masterBranches,api.getAuthoring().overrides,{bindings:false});pose=createWindPose(snapshot,api.getAuthoring().branch_instances);
   preview=createGpuMeshPreview(source,snapshot,{sampleLine,lineTangent,rigidUnits:true,anchorFollowers:false});if(!preview)throw Error('当前模型超出风动预览预算，请降低预览精度后重试');
   render();preparing=false;playing=true;phase='PLAYING';last=null;sync();api.status('风动预览 · 中键观察，空格暂停；编辑时恢复静止造型','ready');
  }catch(e){if(ticket===epoch)fail(e);}
 }
 function change(patch){api.save(normalizeWindPreview({...settings(),...patch}));if(preview&&!playing)render();sync();}
 launch.onclick=$('windPreviewEntry').onclick=open;$('windClose').onclick=close;$('windPlay').onclick=play;$('windStop').onclick=stop;
 $('windRestart').onclick=()=>{stop();play();};$('windStep').onclick=async()=>{if(!preview){await play();playing=false;}if(!preview)return;phase='PAUSED';last=null;time+=1/30;render();sync();};
 $('windReset').onclick=()=>change({...WIND_PRESETS.NATURAL,preset:'NATURAL',direction:0,speed:1});
 panel.addEventListener('click',e=>{const preset=e.target.closest('[data-wind-preset]')?.dataset.windPreset;if(preset)change({...WIND_PRESETS[preset],preset});});
 for(const c of [...panel.querySelectorAll('[data-wind]'),$('wind_speed')])c.addEventListener('input',()=>change({[c.dataset.wind]:c.type==='checkbox'?c.checked:Number(c.value)}));
 canvas.addEventListener('pointerdown',e=>{if(e.button===0&&opened)close();},true);
 document.addEventListener('keydown',e=>{if(!opened||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;if(e.code==='Space'){e.preventDefault();e.stopImmediatePropagation();play();}else if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}else if(/^[grsbcv]$/i.test(e.key)){close();}},true);
 document.addEventListener('click',e=>{if(preview&&e.target.closest('#saveProjectBtn,#brandExportOpen,#buildBtn,#openResourceCenter,#newBtn,#openBranchWorkbench,#openVineWorkspace'))stop();},true);
 document.addEventListener('visibilitychange',()=>{last=null;});window.lucide?.createIcons({root:launch});
 sync();
 return {open,close,stop,sync,play,tick(now){
   if(!opened||preparing)return;if(source&&(source!==api.getAsset()||source.activeEditPreview!==preview||source.group.userData.pending_rebuild)){stop();return;}
   if(!playing||document.visibilityState!=='visible'){last=null;return;}if(api.blocked()){stop();return;}
   if(last!==null)time+=Math.min(.1,Math.max(0,(now-last)/1000))*settings().speed;last=now;
   if(now-lastDraw<1000/30)return;lastDraw=now;try{render();$('windTime').textContent=time.toFixed(1)+' s';}catch(e){fail(e);}
  },get state(){return {opened,playing,preparing,phase,time,error,branches:snapshot?.size||0,units:pose?.index.roots.size||0,stats:preview?.stats||null};},get frame(){return frame;},get snapshot(){return snapshot;},vertex:(...args)=>preview?.vertex(...args)};
}
