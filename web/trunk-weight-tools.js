import {FIXED_TRUNK_ROOT,withTrunkWeightEdits} from './trunk-weight-data.js';
import {checkTrunkWeightBudget} from './trunk-weight-repair.js';

async function scanInWorker(model,automatic,previous){
 const worker=new Worker(new URL('./trunk-weight-worker.js',import.meta.url),{type:'module'});
 try{
  return await new Promise((resolve,reject)=>{
   worker.onmessage=event=>event.data.error?reject(Error(event.data.error)):resolve(event.data);
   worker.onerror=event=>reject(Error(event.message||'权重扫描失败'));
   const {calibration,guides,binding}=model,geometryKey=model.material_workflow?.geometryKey;
   const primitives=model.primitives.map(({id,geometry:{position,normal,tangent,index}})=>({id,geometry:{position,normal,tangent,index}}));
   worker.postMessage({model:{calibration,guides,binding,source:{sha256:model.source.sha256},material_workflow:{geometryKey},primitives},automatic,previous});
  });
 }finally{worker.terminate();}
}

export function createTrunkWeightTools({dialog,getModel,getView,getSelected,canOpen,isBusy,isDrawing,setBusy,setDrawing,commit,refresh,status,safe}){
 const q=selector=>dialog.querySelector(selector),entry=document.createElement('button'),panel=document.createElement('div');
 entry.type='button';entry.dataset.weightOpen='';entry.textContent='权重修复';
 q('[data-section="2"]').prepend(entry);
 panel.className='trunk-weight-panel';panel.hidden=true;entry.after(panel);
 panel.innerHTML=`
  <div class="trunk-point-actions"><button type="button" data-weight-scan>扫描异常</button><button type="button" data-weight-auto class="trunk-primary">自动修复</button></div>
  <div class="trunk-weight-feedback" data-weight-feedback role="status" aria-live="polite" hidden><strong></strong><small></small></div>
  <small data-weight-report role="status">扫描正反两个方向的试弯结果。</small>
  <button type="button" data-weight-focus hidden>聚焦最明显的拉伸</button>
  <label>笔刷<select data-weight-tool><option value="bind">刷到控制枝</option><option value="fix">固定到根点</option><option value="restore">恢复自动绑定</option></select></label>
  <label data-weight-guide-row>目标控制枝<select data-weight-guide></select></label>
  <label>笔刷半径 <output data-weight-size-label></output><input type="range" data-weight-size min="5" max="100" step="1" value="38"></label>
  <small>沿可见表面绘制 · Ctrl 吸取归属 · Shift 恢复自动 · [ / ] 调半径</small>
  <div class="trunk-weight-legend"><span>目标枝</span><span>固定到根点</span><span>拉伸异常</span><span data-weight-applied hidden>本次自动改绑</span></div>
  <label>试弯<select data-weight-angle><option value="0">静止 · 可绘制</option><option value="8">+8°</option><option value="-8">−8°</option><option value="20">+20°</option><option value="-20">−20°</option></select></label>
  <button type="button" data-weight-compare aria-pressed="false">对照进入时的绑定</button>`;
 let session=null,radius=38,guideOptions=null;

 function leave(){
  if(!session)return false;
  const {representation}=session;session=null;
  const view=getView();view.setWeightMode(null);view.restoreOriginal();view.setRepresentation(representation);view.setEditMode('guide');
  return true;
 }
 function enter(){
  if(!canOpen())return;
  const model=getModel(),view=getView();checkTrunkWeightBudget(model);
  session={before:model,model,representation:q('[data-representation]').value,guide:getSelected()?.guide||model.guides[0].id,tool:'bind',angle:0,comparing:false,scan:null};
  view.setDisplay('result');view.restoreOriginal();view.setRepresentation('overlay');view.setEditMode('inspect');
  refresh();status('可先自动修复根部串绑，再用笔刷修正局部。');
 }
 function setRadius(value){radius=Math.min(100,Math.max(5,Number(value)));refresh();}
 function canDraw(){return !!session&&!isBusy()&&!session.angle&&!session.comparing;}
 function render(guideStep,locked){
  entry.hidden=!guideStep;entry.disabled=session?isBusy()||isDrawing():locked||!canOpen();
  entry.setAttribute('aria-pressed',String(!!session));entry.textContent=session?'完成权重修复':'权重修复';
  panel.hidden=!session;dialog.classList.toggle('trunk-weight-editing',!!session);
  if(!session)return;
  q('[data-step-title]').textContent='权重修复';q('[data-transform-kind]').textContent='权重笔刷';
  q('[data-transform-help]').textContent='左键绘制 · 中键观察';
  const model=getModel(),{guide,tool,angle,comparing,scan,feedback,applied}=session,disabled=isBusy()||isDrawing();
  q('[data-view-note]').textContent=comparing?'对照进入时的绑定':angle?'试弯预览 · 返回静止后可绘制':'颜色显示顶点跟随的控制枝';
  if(guideOptions!==model.guides){
   guideOptions=model.guides;
   q('[data-weight-guide]').replaceChildren(...model.guides.map(g=>new Option(g.parent?'控制枝 '+g.id:'主控制枝',g.id)));
  }
  q('[data-weight-guide-row]').hidden=tool!=='bind';q('[data-weight-guide]').value=guide;
  q('[data-weight-tool]').value=tool;q('[data-weight-size]').value=radius;q('[data-weight-size-label]').value=radius+' px';
  q('[data-weight-angle]').value=angle;
  for(const name of ['tool','guide','size','scan','auto','focus','angle'])q('[data-weight-'+name+']').disabled=disabled;
  const card=q('[data-weight-feedback]');card.hidden=!feedback;
  if(feedback){card.dataset.kind=feedback.kind;card.querySelector('strong').textContent=feedback.title;card.querySelector('small').textContent=feedback.detail;}
  q('[data-weight-auto]').textContent=feedback?.kind==='running'&&feedback.automatic?'正在自动修复…':'自动修复';
  q('[data-weight-scan]').textContent=feedback?.kind==='running'&&!feedback.automatic?'正在扫描…':'扫描异常';
  q('[data-weight-applied]').hidden=!applied||comparing;
  q('[data-weight-focus]').hidden=!scan?.worst;
  q('[data-weight-report]').textContent=scan?'发现 '+scan.count+' 条明显拉伸边。':'扫描正反两个方向的试弯结果。';
  const compare=q('[data-weight-compare]');compare.disabled=disabled||session.before.binding===model.binding;
  compare.setAttribute('aria-pressed',String(comparing));compare.textContent=comparing?'返回修复结果':'对照进入时的绑定';
  getView().setWeightMode({guide,radius,scan:comparing?null:scan,applied:comparing?null:applied,reference:comparing?session.before:null,
   target:tool==='fix'?FIXED_TRUNK_ROOT:tool==='restore'?null:guide});
 }
 function modelChanged(){
  if(!session||session.model===getModel())return;
  session.model=getModel();
  if(!session.model.guides.some(g=>g.id===session.guide))session.guide=session.model.guides[0].id;
  session.scan=null;session.feedback=null;session.applied=null;session.angle=0;session.comparing=false;getView().restoreOriginal();
 }
 function preview(){
  refresh();
  const view=getView();
  if(session.angle)view.showPose(session.angle,session.comparing?session.before:getModel());
  else{view.restoreOriginal();refresh();}
 }
 async function scan(automatic){
  if(!session||isBusy()||isDrawing())return;
  const current=session,model=getModel();let result;
  current.feedback={kind:'running',automatic,title:automatic?'正在自动修复':'正在扫描异常',detail:'正反试弯中，检查表面是否被不同控制枝拉开。'};
  setBusy(true);refresh();status('正在比较正反试弯，检查局部拉伸…');
  try{result=await scanInWorker(model,automatic,current.scan);}
  catch(error){current.feedback={kind:'error',title:automatic?'自动修复失败':'扫描失败',detail:error.message};throw error;}
  finally{setBusy(false);refresh();}
  if(current!==session||model!==getModel()){refresh();return;}
  if(result.changed){
   commit({...model,binding:result.binding},'自动改绑 '+result.changed+' 个根部顶点，可一步撤销。');
   current.feedback={kind:'success',title:'已自动改绑 '+result.changed+' 个顶点',detail:'异常拉伸边 '+result.beforeCount+' → '+result.scan.count+'。绿色显示本次改绑，可一步撤销。'};
  }else if(!result.scan.count){
   current.feedback={kind:'success',title:'未发现明显拉伸',detail:'正反试弯已完成，当前绑定无需自动调整。'};
  }else{
   current.feedback={kind:'review',title:automatic?'本次没有应用自动改绑':'扫描完成',detail:'剩余 '+result.scan.count+' 条明显拉伸边。可聚焦标记处检查或用笔刷调整。'};
  }
  if(!result.changed)status(current.feedback.title+'。'+current.feedback.detail);
  current.scan=result.scan;current.applied=result.applied;refresh();
 }
 function stroke(edits){
  if(!canDraw())return;
  const result=withTrunkWeightEdits(getModel(),edits);
  if(result.changed)commit(result.model,'已调整 '+result.changed+' 个顶点的绑定，可撤销这一笔。');
 }

 entry.onclick=safe(()=>{if(leave())refresh();else enter();});
 q('[data-weight-scan]').onclick=safe(()=>scan(false));q('[data-weight-auto]').onclick=safe(()=>scan(true));
 q('[data-weight-focus]').onclick=()=>{if(session?.scan?.worst)getView().focusWeightPoint(session.scan.worst.point);};
 q('[data-weight-guide]').onchange=event=>{session.guide=event.target.value;refresh();};
 q('[data-weight-tool]').onchange=event=>{session.tool=event.target.value;refresh();};
 q('[data-weight-size]').oninput=event=>setRadius(event.target.value);
 q('[data-weight-angle]').onchange=safe(event=>{session.angle=Number(event.target.value);preview();});
 q('[data-weight-compare]').onclick=safe(()=>{session.comparing=!session.comparing;preview();});
 return {get active(){return !!session;},leave,render,modelChanged,
  view:{canDraw,commit:stroke,drawing:value=>{setDrawing(value);refresh();},radius:setRadius,
   sample:id=>{if(id&&session){session.guide=id;session.tool='bind';refresh();status('已吸取控制枝 '+id+'。');}}}};
}
