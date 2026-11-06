import {createTrunkAnalysisInput} from './trunk-auto-skeleton.js';
import {trunkCalibrationMatrix,validateTrunkGuides} from './imported-trunk-data.js';

// The worker hands its result to the repair workspace.
export function createTrunkAutoController({dialog,icon,getModel,canStart,enterGuides,setBusy,refresh,preview,stage,status}){
 const entry=document.createElement('button');entry.className='trunk-auto-entry';entry.dataset.autoOpen='';entry.innerHTML=icon('scan')+'<span><strong>自动识别骨架</strong><small>提取主干与分叉，再手动微调</small></span>'+icon('arrow-up-right');dialog.querySelector('[data-overview]').after(entry);
 const card=document.createElement('div');card.className='trunk-auto-card';card.hidden=true;card.innerHTML='<header>'+icon('scan')+'<div><strong>自动识别骨架</strong><small>先预览，确认后替换当前骨架</small></div><button data-auto-hide aria-label="收起识别设置">'+icon('x')+'</button></header><div data-auto-settings><p>使用当前校准方向和尺寸分析整棵树。原始网格、UV 与材质保留。</p><label>识别精度<select data-auto-quality><option value="fast">快速 · 先看整体</option><option value="standard" selected>标准 · 推荐</option><option value="fine">精细 · 保留更小分叉</option></select></label><label>枝干细节<select data-auto-detail><option value="major">主要枝干 · 过滤更多短枝</option><option value="standard" selected>常规分叉 · 推荐</option><option value="fine">细小枝梢 · 较多控制枝</option></select></label><label>控制点密度<select data-auto-density><option value="simple">简洁 · 便于整体调整</option><option value="standard" selected>均衡 · 推荐</option><option value="fine">精细 · 更多转折点</option></select></label><small>以连通木干为识别对象。贴近的分叉、悬空网格和极细枝梢仍需检查；根须默认过滤。</small><button data-auto-start class="trunk-auto-primary">'+icon('scan')+'生成候选骨架</button></div><div data-auto-progress hidden role="status"><strong data-auto-phase>准备分析…</strong><progress max="1" value="0"></progress><small>后台分析中，可继续旋转与缩放视角。</small><button data-auto-cancel>取消识别</button></div><p data-auto-error role="alert" hidden></p>';
 const section=dialog.querySelector('[data-section="2"]');section.prepend(card);const manual=document.createElement('div');manual.className='trunk-manual-guides';while(card.nextSibling)manual.append(card.nextSibling);section.append(manual);
 const banner=document.createElement('div');banner.className='trunk-auto-banner';banner.hidden=true;banner.innerHTML='<strong data-auto-banner-title></strong><span>尚未应用 · 在右侧确认或保留原骨架</span>';dialog.querySelector('[data-host]').append(banner);
 const q=s=>card.querySelector(s);let worker=null,opened=false,sequence=0,lastError='',phase='';
 const baseControl=document.createElement('label');
 baseControl.innerHTML='<span>根部识别</span><select data-auto-base><option value="auto">自动保护根盘 · 推荐</option><option value="legacy">保留低位分叉</option></select>';
 q('[data-auto-density]').closest('label').after(baseControl);
 q('[data-auto-settings] small').textContent='根盘保护会过滤只在根区延伸的末端。需要单独控制低位分叉时，可切换识别方式。';
 function render(){
  const active=!!worker;
  entry.disabled=!getModel()||(!active&&!canStart());
  entry.setAttribute('aria-expanded',String(opened));
  card.hidden=!opened;
  q('[data-auto-settings]').hidden=active;
  q('[data-auto-progress]').hidden=!active;
  q('[data-auto-hide]').disabled=active;
  manual.hidden=active;
  q('[data-auto-error]').hidden=!lastError;
  q('[data-auto-error]').textContent=lastError;
  banner.hidden=!active;
  banner.querySelector('strong').textContent='正在识别骨架 · '+phase;
  banner.querySelector('span').textContent='后台计算中 · 当前骨架保留';
  q('[data-auto-start]').disabled=!canStart();
 }
 function open(){if(!getModel()||(!worker&&!canStart()))return;enterGuides();opened=true;render();card.scrollIntoView({block:'nearest'});}
 function release(){sequence++;worker?.terminate();worker=null;setBusy(false);}
 function discard(){release();lastError='';preview(null);refresh();render();status('已取消识别，原骨架与模型保留。');}
 function start(){if(!canStart()||!getModel())return;lastError='';phase='准备分析';opened=true;const input=createTrunkAnalysisInput(getModel(),trunkCalibrationMatrix(getModel().calibration)),options={quality:q('[data-auto-quality]').value,detail:q('[data-auto-detail]').value,density:q('[data-auto-density]').value,baseMode:q('[data-auto-base]').value};enterGuides();preview(null,true);setBusy(true);const ticket=++sequence;
  const fail=message=>{if(ticket!==sequence)return;release();lastError=message;opened=true;preview(null);refresh();render();status(message,true);};
  try{
   worker=new Worker(new URL('./trunk-auto-worker.js',import.meta.url),{type:'module'});
   worker.onmessage=event=>{
    if(ticket!==sequence)return;
    const data=event.data;
    if(data.progress){phase=data.progress.phase;q('[data-auto-phase]').textContent=phase;q('progress').value=data.progress.progress;render();return;}
    if(data.error){fail(data.error);return;}
    try{validateTrunkGuides(data.result.guides);}catch(error){fail(error.message);return;}
    release();opened=false;preview(null);
    try{stage(data.result);}catch(error){lastError=error.message;opened=true;refresh();status(error.message,true);}
   };
   worker.onerror=event=>{event.preventDefault();fail(event.message||'后台识别失败，请重试');};
   worker.postMessage({input,options});refresh();render();status('正在后台识别主干与分叉，可继续观察模型。');
  }catch(error){fail(error.message);}
 }
 entry.onclick=open;
 q('[data-auto-hide]').onclick=()=>{opened=false;render();};
 q('[data-auto-start]').onclick=start;
 q('[data-auto-cancel]').onclick=discard;
 render();
 return {render,open,start,get running(){return !!worker;},reset(){release();opened=false;lastError='';preview(null);render();}};
}
