// The trunk dialog owns navigation and actions. Only its middle editing region
// is occupied by the native material control; no second application is shown.
export function createTrunkMaterialComponent({dialog,render:refresh,status,getView,setView}){
 const q=s=>dialog.querySelector(s),layout=q('.trunk-layout'),pending=new Map();let state={active:false,busy:false,stage:'material'},lastBounds='';
 const post=value=>window.chrome?.webview?.postMessage(JSON.stringify({topic:'shuyaer-v050',...value}));
 const previous=document.createElement('button'),next=document.createElement('button');previous.dataset.componentPrev='';previous.textContent='上一步：模型准备';next.dataset.componentNext='';next.className='trunk-primary';q('.trunk-footer').append(previous,next);
 function bounds(){if(!dialog.open)return;const r=layout.getBoundingClientRect(),value={x:r.x,y:r.y,width:r.width,height:r.height,dpr:devicePixelRatio||1},key=JSON.stringify(value);if(key===lastBounds)return;lastBounds=key;post({action:'material-component-bounds',bounds:value});}
 const observer=new ResizeObserver(bounds);observer.observe(layout);window.addEventListener('resize',bounds);
 function command(command,stage){const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('当前步骤尚未完成，请查看处理提示。'));},300000);pending.set(id,{resolve,reject,timer});post({action:'material-component-command',id,command,stage});});}
 function render(){dialog.classList.toggle('trunk-component-active',state.active);dialog.dataset.materialStage=state.active?state.stage:'';previous.hidden=next.hidden=!state.active;
  if(!state.active)return;
  for(const key of ['project','library','use','replace-sculpt'])q('[data-'+key+']').hidden=true;
  for(const b of dialog.querySelectorAll('[data-flow]')){b.disabled=state.busy;b.setAttribute('aria-current',(b.dataset.flow===(state.stage==='export'?'export':state.stage==='model'?'model':'material'))?'step':'false');}
  for(const key of ['import','name','close','material-version'])q('[data-'+key+']').disabled=state.busy;
  previous.disabled=next.disabled=state.busy;previous.textContent=state.stage==='export'?'上一步：表面材质':state.stage==='model'?'原始模型与校准':'上一步：模型准备';next.textContent=state.nextLabel||'下一步：检查与保存';
  if(state.message)status(state.message,!!state.error);
 }
 function update(value){const wasActive=state.active;state={...state,...value};if(value.view)setView(value.view);if(!state.active){for(const key of ['project','library','use'])q('[data-'+key+']').hidden=false;}if(wasActive!==state.active)refresh();bounds();render();if(value.message)status(value.message,!!value.error);}
 previous.onclick=()=>command(state.stage==='model'?'leave':'stage',state.stage==='export'?'material':'model').catch(e=>status(e.message,true));next.onclick=()=>command('next').catch(e=>status(e.message,true));
 return {render,bounds,update,command,get active(){return state.active;},get view(){return getView();},settled(id,error){const item=pending.get(id);if(!item)return false;clearTimeout(item.timer);pending.delete(id);if(error)item.reject(Error(error));else item.resolve();return true;}};
}
