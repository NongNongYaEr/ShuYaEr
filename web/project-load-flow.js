export function createProjectLoadFlow() {
  const dialog=document.createElement('dialog');dialog.id='projectLoadDialog';dialog.setAttribute('aria-labelledby','projectLoadTitle');
  const stages=['读取工程','整理素材与预览','生成植物模型','完成载入'];
  dialog.innerHTML='<img src="/brand/guide-projects-v1.png" alt=""><h2 id="projectLoadTitle">正在打开工程</h2><strong></strong><ol>'+stages.map(label=>`<li>${label}</li>`).join('')+'</ol><p role="status" aria-live="polite"></p><footer><button type="button" data-load-close>返回</button><button type="button" class="accent" data-load-retry>重试</button></footer>';
  document.body.append(dialog);let active=false,retry=null,stage=0;
  const progress=async(index,detail='')=>{stage=index;dialog.querySelectorAll('li').forEach((li,i)=>li.dataset.state=i<index?'done':i===index?'active':'waiting');dialog.querySelector('p').textContent=detail;await new Promise(r=>setTimeout(r,0));};
  async function run(name,operation){if(active)throw Error('正在打开另一个工程，请稍候');active=true;retry=()=>run(name,operation);dialog.querySelector('strong').textContent=name;dialog.querySelector('h2').textContent='正在打开工程';dialog.setAttribute('aria-busy','true');if(!dialog.open)dialog.showModal();
    try{await progress(0);const result=await operation(progress);await progress(3,'模型已就绪');dialog.close();return result;}
    catch(error){dialog.querySelector('h2').textContent='打开工程未完成';dialog.querySelector('p').textContent=`${stages[stage]}失败：${error.message}\n返回后可保留在资源库中检查文件，或重试本次载入。`;throw error;}
    finally{active=false;dialog.setAttribute('aria-busy','false');}
  }
  dialog.querySelector('[data-load-close]').onclick=()=>dialog.close();dialog.querySelector('[data-load-retry]').onclick=()=>retry?.().catch(()=>{});
  dialog.oncancel=e=>{if(active)e.preventDefault();};dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('keyup',e=>e.stopPropagation());
  return {run,get active(){return active;},get stage(){return stage;}};
}
