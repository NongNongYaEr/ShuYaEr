// A workbench temporarily owns presentation, never the main scene/document.
// Token ownership prevents a stale close callback from restoring another view.
export function createViewportContext(initial,install){
  let current=initial,owner=null;
  return {get current(){return current;},enter(next){
    if(owner)throw Error('请先关闭当前 3D 工作台');
    if(!next?.scene||!next?.camera||!next?.renderer||!next?.canvas)throw Error('工作台视口配置不完整');
    const previous=current,token={};current=next;owner=token;
    try{install(next);}catch(error){current=previous;owner=null;install(previous);throw error;}
    let restored=false;
    return ()=>{if(restored)return;restored=true;if(owner!==token)return;owner=null;current=previous;install(previous);};
  }};
}
