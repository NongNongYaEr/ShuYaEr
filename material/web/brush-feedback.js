import {createBrushGeometry,inverseMatrix,projectBrushPoint,brushRay,brushOperation} from './brush-preview-geometry.js';
import {cameraBasis} from './blender-navigation.js';
export function createBrushFeedback(api){
 const r=api.renderer,canvas=r.canvas,zone=canvas.parentElement,events=new AbortController(),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),label=document.createElement('div');
 svg.id='brushFootprint';svg.classList.add('brush-footprint');svg.setAttribute('aria-hidden','true');label.id='brushFootprintLabel';label.className='brush-footprint-label';
 const paths={};for(const name of ['reference','outer-shadow','inner-shadow','outer','inner','cross']){const p=document.createElementNS(ns,'path');p.dataset.brushPath=name;svg.append(p);paths[name]=p;}zone.append(svg,label);
 let mesh=null,displayPositions=null,geometry=null,pointer=null,hover=false,keys={},navigating=false,down=false,anchor=null,modalBefore=false,frame=0,lastAt=0,lastKey='',state={visible:false},disposed=false;
 const listen=(el,type,fn,options={})=>el.addEventListener(type,fn,{...options,signal:events.signal}),hide=()=>{svg.style.display=label.style.display='none';canvas.classList.remove('brush-feedback-active');state={...state,visible:false};};hide();
 listen(canvas,'pointermove',e=>{if(!(e.buttons&4)&&!(r.emulateThreeButton&&(e.buttons&1)&&e.altKey))navigating=false;if(!(e.buttons&1))down=false;pointer={x:e.clientX,y:e.clientY};hover=true;keys={ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey};});
 listen(canvas,'lostpointercapture',()=>{navigating=down=false;lastKey='';});listen(canvas,'pointerenter',e=>{hover=true;pointer={x:e.clientX,y:e.clientY};});listen(canvas,'pointerleave',()=>{hover=false;});
 listen(canvas,'pointerdown',e=>{pointer={x:e.clientX,y:e.clientY};hover=true;keys={ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey};if(e.button===1||e.altKey)navigating=true;else if(e.button===0&&!api.modal())down=true;},{capture:true});
 for(const type of ['pointerup','pointercancel'])listen(window,type,()=>{navigating=down=false;lastKey='';},{capture:true});
 for(const type of ['keydown','keyup'])listen(document,type,e=>{keys={ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey};if(e.key==='Escape')down=false;if(api.modal()&&!modalBefore){anchor=pointer?{...pointer}:null;modalBefore=true;}lastKey='';});
 listen(window,'blur',()=>{hover=false;pointer=null;anchor=null;keys={};down=navigating=false;hide();});
 const line=(a,b)=>`M${a[0].toFixed(2)},${a[1].toFixed(2)}L${b[0].toFixed(2)},${b[1].toFixed(2)}`;
 function update(){
  const context=api.context(),modal=!!api.modal();if(modal&&!modalBefore)anchor=pointer?{...pointer}:null;if(!modal)anchor=null;modalBefore=modal;
  if(!context||!r.model||!r.lastVP||api.busy()||navigating||keys.altKey||!hover&&!anchor){hide();state.reason=!context?'inactive':!r.model?'no-model':!r.lastVP?'no-frame':api.busy()?'busy':navigating?'navigation':keys.altKey?'alt':'outside';return;}
  const source=api.source();if(!source){hide();return;}if(mesh!==source||displayPositions!==r.positions){geometry=createBrushGeometry(source,{positions:r.positions,indices:r.model.indices,min:r.model.min,height:r.model.height});mesh=source;displayPositions=r.positions;lastKey='';}
  api.syncControls?.();const rect=canvas.getBoundingClientRect(),position=anchor||pointer;if(!position||rect.width<=0||rect.height<=0){hide();return;}
  const key=JSON.stringify([position,keys,down,rect.left,rect.top,rect.width,rect.height,Array.from(r.lastVP),context,api.height(),modal]);if(key===lastKey&&state.visible)return;lastKey=key;
  const inverse=inverseMatrix(r.lastVP),ray=brushRay(inverse,rect,r.model,position.x,position.y),hit=geometry.pick(ray),operation=context.freezeOperation?context.operation:brushOperation({...keys,shiftKey:!context.material&&keys.shiftKey},context.operation),color=operation==='erase'?'#ff907d':operation==='smooth'?'#6cddf4':'#b8e875',name=operation==='erase'?'擦除':operation==='smooth'?'平滑':'增加';
  svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);svg.style.left=(rect.left-zone.getBoundingClientRect().left-zone.clientLeft)+'px';svg.style.top=(rect.top-zone.getBoundingClientRect().top-zone.clientTop)+'px';svg.style.width=rect.width+'px';svg.style.height=rect.height+'px';svg.style.setProperty('--brush-color',color);svg.dataset.operation=operation;svg.dataset.down=String(down);
  svg.style.display=label.style.display='block';canvas.classList.toggle('brush-feedback-active',!!hit);
  const local=[position.x-rect.left,position.y-rect.top];
  if(!hit){for(const p of Object.values(paths))p.setAttribute('d','');paths.cross.setAttribute('d',line([local[0]-6,local[1]-6],[local[0]+6,local[1]+6])+line([local[0]-6,local[1]+6],[local[0]+6,local[1]-6]));label.textContent='未命中树表面';label.style.color='#d9d9d9';state={visible:true,hit:false,operation};}
  else{
   const footprint=geometry.footprint(hit,{radiusMeters:context.radius,hardness:context.hardness,actualHeightMeters:api.height(),operation}),project=p=>projectBrushPoint(p,r.lastVP,rect,r.model),center=project(hit.point),epsilon=Math.max(geometry.topology.height*2e-5,1e-8);
   const visible=segment=>{const mid=segment[0].map((v,i)=>(v+segment[1][i])/2),p=project(mid);if(!p)return false;const ray=brushRay(inverse,rect,r.model,p[0]+rect.left,p[1]+rect.top),front=geometry.pick(ray);return !front||front.distance>=Math.hypot(...mid.map((v,i)=>v-ray.origin[i]))-epsilon;};
   const toPath=segments=>segments.filter(visible).map(segment=>{const a=project(segment[0]),b=project(segment[1]);return a&&b?line(a,b):'';}).join('');
   const outer=toPath(footprint.outer),inner=toPath(footprint.inner);paths.outer.setAttribute('d',outer);paths['outer-shadow'].setAttribute('d',outer);paths.inner.setAttribute('d',inner);paths['inner-shadow'].setAttribute('d',inner);
   const basis=cameraBasis(r),points=Array.from({length:65},(_,i)=>{const a=i/64*Math.PI*2;return project(hit.point.map((v,k)=>v+footprint.radius*(basis.right[k]*Math.cos(a)+basis.up[k]*Math.sin(a))));});paths.reference.setAttribute('d',points.slice(1).map((p,i)=>p&&points[i]?line(points[i],p):'').join(''));
   paths.cross.setAttribute('d',center?line([center[0]-4,center[1]],[center[0]+4,center[1]])+line([center[0],center[1]-4],[center[0],center[1]+4]):'');
   label.textContent=`${context.label?context.label+' · ':''}${name} · 半径 ${Number(context.radius.toPrecision(4))} m\n强度 ${Math.round(context.strength*100)}% · 硬度 ${Math.round(context.hardness*100)}%`;label.style.color=color;
   state={visible:true,hit:true,face:hit.face,point:hit.point,normalizedPoint:hit.normalizedPoint,bary:hit.bary,operation,radius:context.radius,hardness:context.hardness,strength:context.strength,outerSegments:footprint.outer.length,innerSegments:footprint.inner.length,reference:paths.reference.getAttribute('d'),outer,inner,down,modal};
  }
  state.pointer=[position.x,position.y];state.view=Array.from(r.lastVP);
  const zoneRect=zone.getBoundingClientRect();label.style.left=(rect.left-zoneRect.left-zone.clientLeft+Math.max(4,Math.min(rect.width-205,local[0]+18)))+'px';label.style.top=(rect.top-zoneRect.top-zone.clientTop+Math.max(4,Math.min(rect.height-56,local[1]+20)))+'px';
 }
 function tick(now){if(disposed)return;if(now-lastAt>=40){lastAt=now;try{update();}catch(error){hide();state.error=error.message;}}frame=requestAnimationFrame(tick);}frame=requestAnimationFrame(tick);
 return{get state(){return state;},refresh(){lastKey='';},dispose(){disposed=true;cancelAnimationFrame(frame);events.abort();svg.remove();label.remove();canvas.classList.remove('brush-feedback-active');mesh=displayPositions=geometry=null;}};
}
