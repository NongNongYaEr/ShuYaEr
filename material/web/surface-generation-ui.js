import {GENERATION_MODES,GENERATION_PRESETS,generationState,applyGeneration} from './surface-generation.js';
import {generationPrimary,generationSignature} from './studio-flow-state.js';
import {layerIsLocked} from './surface-layers.js';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
export function createGenerationPanel(api){
 const drafts=new Map();let documentId=null;
 function state(e){const d=api.document();if(documentId!==d.id){drafts.clear();documentId=d.id;}const signature=generationSignature(d,e);let entry=drafts.get(e.id);if(!entry||entry.signature!==signature){const value=generationState(d,e.id);entry={signature,value,initial:structuredClone(value),dirty:false};drafts.set(e.id,entry);}return entry;}
 function render(parent,e){
  const d=api.document(),entry=state(e),v=entry.value,box=node('section',null,'generation-panel'),area=d.surface.areas.find(a=>a.id===e.scopeRef),mask=d.surface.masks.find(m=>m.id===e.maskRef),hasRange=area?.kind==='surface'||mask?.items.some(r=>r.type==='paint'),isPainting=()=>api.painting()?.effectId===e.id;
  box.dataset.generationEffect=e.id;box.classList.toggle('is-painting',isPainting());const locked=layerIsLocked(d.surface,e.id)||api.busy();
  const intro=node('div',null,'generation-heading');intro.append(node('strong',isPainting()?'涂出生成区域':'自动分布'),node('small',isPainting()?'在树表面拖动绘制，Ctrl 擦除、Shift 平滑':'由规则生成；直接刷材质请用顶部画笔'));box.append(intro);
  const form=node('details',null,'generation-form');form.open=!isPainting();form.append(node('summary','调整分布参数'));box.append(form);
  const change=(key,value,redraw=false)=>{if(v[key]===value)return;v[key]=value;entry.dirty=Object.keys(v).some(k=>v[k]!==entry.initial[k]);if(redraw)api.sync();else updateStatus();};
  function action(parent,label,fn,id){const b=node('button',label);b.type='button';if(id)b.dataset.generationAction=id;b.disabled=locked;b.onclick=()=>{try{if(!api.busy())fn();}catch(error){api.notify(error.message,true);}};parent.append(b);return b;}
  const modes=node('div',null,'generation-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','生成方式');for(const[k,label]of Object.entries(GENERATION_MODES)){const b=action(modes,label,()=>{api.stopPaint();change('mode',k);api.sync();});b.dataset.generationMode=k;b.classList.toggle('active',v.mode===k);b.setAttribute('aria-pressed',String(v.mode===k));}form.append(modes);
  function select(parent,label,key,options){const row=node('label',null,'surface-field'),input=node('select');row.append(node('span',label));input.dataset.generationField=key;for(const[value,text]of options){const o=node('option',text);o.value=value;input.append(o);}input.value=v[key]??'';input.disabled=locked;input.onchange=()=>change(key,input.value,true);row.append(input);parent.append(row);return input;}
  function number(parent,label,key,min,max,step){const row=node('label',null,'surface-field'),input=node('input');row.append(node('span',label));input.type='number';input.min=min;input.max=max;input.step=key==='seed'?1:'any';input.value=Number(v[key].toPrecision(6));input.dataset.generationField=key;input.disabled=locked;input.oninput=()=>{if(input.value!==''&&input.validity.valid)change(key,Number(input.value));};input.onchange=()=>{if(!input.validity.valid||input.value===''){input.value=v[key];api.notify(label+'超出范围。',true);}else change(key,Number(input.value));};row.append(input);parent.append(row);}
  select(form,'分布样式','preset',Object.entries(GENERATION_PRESETS).map(([id,p])=>[id,p.name]));form.append(node('p',GENERATION_PRESETS[v.preset].description,'surface-note'));
  if(v.mode==='selection'){
   const areas=d.surface.areas.filter(a=>!a.ownedBy||a.id===e.scopeRef),options=[['height','按高度选择'],...d.parts.groups.filter(p=>p.faces.length).map(p=>['part:'+p.id,'部位 · '+p.name]),...areas.filter(a=>a.kind!=='height'||!a.ownedBy).map(a=>['area:'+a.id,'区域 · '+a.name])];select(form,'作用范围','rangeRef',options);
   if(v.rangeRef==='height'){number(form,'下边界 · m','minMeters',0,d.actualHeightMeters,.05);number(form,'上边界 · m','maxMeters',.01,d.actualHeightMeters,.05);}
   action(form,'编辑模型部位…',()=>api.parts(),'parts');
  }
  if(v.mode==='painted')form.append(node('p','这里只涂生成区域，系统在区域内按规则铺材质。要直接刷苔藓，请用顶部材质笔刷。','surface-note'));
  if(v.preset!=='uniform'){number(form,'覆盖密度','density',0,1,.01);number(form,'斑块尺寸 · m','sizeMeters',.01,10,.01);}
  if(v.preset==='root')number(form,'生长高度 · m','rootHeightMeters',.01,d.actualHeightMeters,.05);
  const details=node('details',null,'generation-fine');details.append(node('summary','边缘与随机变化'));if(v.preset!=='uniform'){number(details,'边缘过渡','softness',.001,.5,.01);number(details,'随机种子','seed',0,10000,1);}if(v.mode==='selection'&&v.rangeRef==='height')number(details,'范围柔边 · m','featherMeters',0,d.actualHeightMeters*.25,.01);form.append(details);
  const dependency=GENERATION_PRESETS[v.preset].dependency;if(dependency&&!api.analysis()[dependency])action(form,'准备模型 AO',()=>api.prepare(dependency),'prepare');
  const footer=node('div',null,'generation-footer'),status=node('p',null,'generation-status');status.setAttribute('role','status');footer.append(status);const actions=node('div',null,'generation-actions');footer.append(actions);box.append(footer);
  function apply(paint=false){api.stopPaint();const next=applyGeneration(api.document(),e.id,v);drafts.delete(e.id);api.apply(next,e.id);if(paint)api.paintCurrent(e.id);}
  const primary=action(actions,'',()=>{const a=choice();if(a.action==='finish')api.finishPaint();else if(a.action==='paint')api.paintCurrent(e.id);else if(a.action==='apply-paint')apply(true);else if(a.action==='apply')apply();},'apply');primary.classList.add('generation-primary');
  const reset=action(actions,'还原调节',()=>{drafts.delete(e.id);api.sync();},'reset');const preview=action(actions,'查看覆盖',()=>api.preview(),'preview');preview.title='只检查当前层覆盖结果，不改变材质或分布';
  function choice(){return generationPrimary({mode:v.mode,dirty:entry.dirty,hasRange:!!hasRange,painting:isPainting(),custom:v.custom,locked});}
  function updateStatus(){const a=choice();primary.textContent=a.label;primary.disabled=locked||a.disabled;reset.hidden=!entry.dirty;status.textContent=entry.dirty?'有未应用调节 · 更新后生效':isPainting()?'绘制中 · 完成后可继续调节样式':v.custom?'当前使用已有规则，可直接绘制或选择新样式':v.mode==='painted'&&area&&!area.strokes.length?'范围为空 · 点击绘制，再到树上涂画':'已应用 · '+GENERATION_MODES[v.mode]+' / '+GENERATION_PRESETS[v.preset].name;}
  updateStatus();if(v.custom||entry.dirty)form.append(node('p','应用新样式会替换本层规则，共享蒙版自动分离；Ctrl Z 可撤销。','surface-note'));parent.append(box);
 }
 return{rebaseDraft(id){const entry=drafts.get(id),e=api.document()?.surface.effects.find(e=>e.id===id);if(entry&&e)entry.signature=generationSignature(api.document(),e);},render,hasDraft:e=>state(e).dirty,usePart(effectId,partId){const e=api.document()?.surface.effects.find(e=>e.id===effectId);if(!e)return;const entry=state(e);entry.value.mode='selection';entry.value.rangeRef='part:'+partId;entry.dirty=true;},reset(){drafts.clear();documentId=null;}};
}
