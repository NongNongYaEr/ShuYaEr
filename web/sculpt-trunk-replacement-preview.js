import {resourceEscape as esc,resourceIcon as icon,trapResourceDialogFocus} from './resource-ui.js';
import {sculptReplacementTargets,planSculptTrunkReplacement} from './sculpt-trunk-replacement.js';
export function createSculptTrunkReplacementPreview(api){
 const dialog=document.createElement('dialog');dialog.id='sculptTrunkReplacementDialog';dialog.className='sculpt-replacement-dialog';dialog.innerHTML='<header><div><small>雕刻结果 → 当前整树</small><h2>预览树干替换</h2></div><button data-close aria-label="关闭替换预览">'+icon('x')+'</button></header><label>替换目标<select data-target></select></label><div class="sr-images"><figure><img data-before alt="当前整树"><figcaption>当前整树</figcaption></figure><figure><img data-after alt="替换后预览"><figcaption>替换雕刻网格后</figcaption></figure></div><p data-summary></p><p>沿用当前树的校准、控制骨架、造型和完整单元枝装配，更新挂点对应的网格位置。原树干素材保留；应用后可撤销。重新整理的骨架可通过“以此树干开始创作”用于新树。</p><footer><span data-status role="status"></span><button data-cancel>取消</button><button data-apply>应用到当前树</button></footer>';
 document.body.append(dialog);trapResourceDialogFocus(dialog);const q=s=>dialog.querySelector(s);
 let model=null,baseline=null,proposal=null,token=null,controller=null,resolve=null;
 function close(result=false){
  controller?.abort();controller=null;proposal=null;baseline=null;model=null;
  dialog.close();resolve?.(result);resolve=null;
 }
 function checkCurrent(){if(api.token()!==token)throw Error('当前树已改变，请关闭并重新预览。');}
 async function preview(){
  controller?.abort();
  const operation=new AbortController();controller=operation;proposal=null;
  q('[data-apply]').disabled=true;q('[data-target]').disabled=true;
  q('[data-before]').removeAttribute('src');q('[data-after]').removeAttribute('src');q('[data-summary]').textContent='';
  try{
   checkCurrent();
   const candidate=planSculptTrunkReplacement(baseline,model,q('[data-target]').value);
   q('[data-status]').textContent=candidate.lightsToRefit?'正在让灯带重新贴合雕刻后的树皮…':'正在生成完整树的前后预览…';
   const images=await api.preview(candidate,operation.signal);
   operation.signal.throwIfAborted();checkCurrent();
   if(!images.before||!images.after)throw Error('预览未完成，请重试。');
   q('[data-before]').src=images.before;q('[data-after]').src=images.after;
   q('[data-summary]').textContent=candidate.mounts+' 个树干实例 · '+candidate.anchors+' 个挂接引用 · '+candidate.units+' 个完整单元枝保持模型复用'+(candidate.lightsToRefit?' · 灯带已重新贴合':'');
   q('[data-status]').textContent='检查轮廓与挂点后应用';proposal=candidate;q('[data-apply]').disabled=false;
  }catch(error){if(!operation.signal.aborted)q('[data-status]').textContent=error.message;}
  finally{if(controller===operation){controller=null;q('[data-target]').disabled=false;}}
 }
 q('[data-target]').onchange=preview;q('[data-close]').onclick=q('[data-cancel]').onclick=()=>close();
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 q('[data-apply]').onclick=()=>{if(!proposal||controller)return;try{checkCurrent();api.apply(proposal);close(true);}catch(error){q('[data-status]').textContent=error.message;}};
 return {open(value){
  if(dialog.open)return false;
  model=value;baseline=api.authoring();token=api.token();
  const targets=sculptReplacementTargets(baseline,value);if(!targets.length)throw Error('当前树中没有同源的树干实例');
  q('[data-target]').innerHTML=targets.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+' · V'+m.revision+'</option>').join('');
  if(targets.some(m=>m.id===value.sculpt_parent?.id))q('[data-target]').value=value.sculpt_parent.id;
  dialog.showModal();const result=new Promise(r=>resolve=r);void preview();return result;
 }};
}
