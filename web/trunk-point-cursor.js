/** Transient UI only: no geometry, history, or saved project state. */
export function createTrunkPointCursor(){
  const node=document.createElement('div');node.className='trunk-point-cursor';node.hidden=true;node.setAttribute('aria-hidden','true');document.body.append(node);
  return {show(point,action,blocked=false,label=''){node.hidden=!point||!action;if(node.hidden)return;node.dataset.action=action;node.classList.toggle('blocked',blocked);node.textContent=action==='ADD'?'+':'−';node.style.left=point.x+'px';node.style.top=point.y+'px';node.title=label||(blocked?'已到控制点数量限制':action==='ADD'?'Shift 点击黄线加点':'Alt 点击蓝点删点');},hide(){node.hidden=true;}};
}
