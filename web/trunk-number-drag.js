// Number scrubbing uses the existing field preview/commit handlers. It owns
// only the pointer gesture; authoring, normalization and undo stay with callers.
export function scrubNumber(value, pixels, {step=1,min=-Infinity,max=Infinity,shift=false,alt=false}={}) {
  return Math.max(min,Math.min(max,value+pixels*step*(alt ? .1 : shift ? 5 : 1)));
}

export function createTrunkNumberDrag({inputs,canStart=()=>true,begin=()=>null,cancel,onStart=()=>{},onEnd=()=>{},step=input=>Number(input.step)||1,integer=()=>false}) {
  let drag=null;
  const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
  function end(restore=false){
    const d=drag;if(!d)return;drag=null;d.label.classList.remove('scrubbing');
    if(d.label.hasPointerCapture?.(d.pointerId))d.label.releasePointerCapture(d.pointerId);
    if(!d.started){onEnd();return;}
    if(restore){d.input.value=d.before;cancel(d.context);}else d.input.dispatchEvent(new Event('change',{bubbles:true}));
    onEnd();
  }
  for(const input of inputs){
    const parent=input.closest('label');if(!parent)continue;
    let label=parent.querySelector('span');
    if(!label){label=document.createElement('span');for(const child of [...parent.childNodes]){if(child===input)break;if(child.nodeType===Node.TEXT_NODE)label.append(child);}parent.prepend(label);}
    label.classList.add('trunk-number-drag');label.title='左右拖动微调 · Shift 大步 / Alt 精调 · 松手确认 / Esc 取消';
    label.addEventListener('pointerenter',()=>{label.title=input.disabled||input.readOnly?'此参数当前不可编辑':input.value===''?'先输入共同数值，再拖动调整':!input.checkValidity()?'先修正数值，或 Esc 取消当前调节':'左右拖动微调 · Shift 大步 / Alt 精调 · 松手确认 / Esc 取消';});
    label.addEventListener('pointerdown',e=>{
      if(e.button!==0||drag||input.disabled||input.readOnly||input.value===''||!input.checkValidity()||!canStart(input))return;
      drag={input,label,pointerId:e.pointerId,startX:e.clientX,lastX:e.clientX,value:Number(input.value),before:input.value,started:false};
      label.setPointerCapture(e.pointerId);consume(e);
    });
    label.addEventListener('pointermove',e=>{
      const d=drag;if(!d||d.label!==label||d.pointerId!==e.pointerId)return;consume(e);
      if(!d.started){if(Math.abs(e.clientX-d.startX)<3)return;if(!canStart(input)){end();return;}d.context=begin(input);d.started=true;onStart();input.focus({preventScroll:true});label.classList.add('scrubbing');}
      const min=input.min===''?-Infinity:Number(input.min),max=input.max===''?Infinity:Number(input.max);
      d.value=scrubNumber(d.value,e.clientX-d.lastX,{step:step(input),min,max,shift:e.shiftKey,alt:e.altKey});d.lastX=e.clientX;
      const value=integer(input)?Math.round(d.value):Number(d.value.toFixed(5));
      if(value===Number(input.value))return;
      input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    label.addEventListener('pointerup',e=>{if(drag?.label===label&&drag.pointerId===e.pointerId){consume(e);end();}});
    label.addEventListener('pointercancel',()=>{if(drag?.label===label)end(true);});
    label.addEventListener('lostpointercapture',()=>{if(drag?.label===label)end(true);});
    label.addEventListener('click',e=>e.preventDefault());
  }
  window.addEventListener('keydown',e=>{
    if(!drag||e.isComposing)return;
    if(['Shift','Alt','Control','Meta'].includes(e.key))return;
    consume(e);if(e.key==='Escape')end(true);else if(e.key==='Enter')end();
  },true);
  window.addEventListener('blur',()=>end(true));
  window.addEventListener('resize',()=>end(true));
  return{cancel:()=>end(true),get active(){return Boolean(drag);}};
}
