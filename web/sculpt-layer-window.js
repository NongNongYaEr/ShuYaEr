// Presentation only. Keep the complete flat evaluation stack in the project;
// collapsing old rows must not bake geometry or remove disabled operations.
export function createSculptLayerWindow() {
  const pageSize=24;let visible=pageSize,lastTail='',lastLength=0;
  return function render(container,layers,refresh,{operationsOnly=false}={}) {
    const tail=layers.at(-1)?.id || '';
    if(tail!==lastTail || layers.length!==lastLength)visible=pageSize;
    lastTail=tail;lastLength=layers.length;
    const entries=layers.map((layer,index)=>[index,layer]).filter(([,layer])=>!operationsOnly||layer.operation);
    const hidden=Math.max(0,entries.length-visible);
    if(entries.length>pageSize){
      const toolbar=document.createElement('div');toolbar.className='sculpt-layer-window';toolbar.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin:8px 0';
      const info=document.createElement('small');info.textContent=hidden?`较早 ${hidden} 条已折叠，仍参与生成`:'已展开全部编辑记录';info.style.cssText='flex-basis:100%;line-height:1.5';toolbar.append(info);
      if(hidden){const more=document.createElement('button');more.type='button';more.style.cssText='width:auto;min-height:28px;white-space:nowrap;padding:4px 10px';more.textContent='展开较早 24 条';more.onclick=()=>{visible+=pageSize;refresh();};toolbar.append(more);}
      if(visible>pageSize){const fold=document.createElement('button');fold.type='button';fold.style.cssText='width:auto;min-height:28px;white-space:nowrap;padding:4px 10px';fold.textContent='折叠较早记录';fold.onclick=()=>{visible=pageSize;refresh();};toolbar.append(fold);}
      container.append(toolbar);
    }
    return entries.slice(hidden);
  };
}

export const requiresRetainedLayers = layers => layers.some(l=>l.enabled &&
  ['DUPLICATE','MOUNT','ROOT_SCALE','POINT_ROTATE','POINT_SCALE','POINT_SLIDE','CONTROL_CURVE','RADIUS'].includes(l.operation?.type));
