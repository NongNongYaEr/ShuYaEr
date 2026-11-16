import {projectBrushPoint} from './brush-preview-geometry.js';
import {localPatchFrame} from './local-patch-analysis.js';
import {patchPreset} from './local-patch-rules.js';

const colors={
 normal:[.77,.89,.79,.86],hidden:[.5,.55,.59,.64],
 selected:[1,.8,.3,1],selectedHidden:[.82,.67,.46,.86],
 hover:[.38,.82,1,1],hoverHidden:[.52,.69,.77,.83],
 preview:[.64,1,.55,1],invalid:[1,.42,.34,1],
 scaleFrame:[.68,.82,.66,.8],
 widthAxis:[1,.48,.57,1],heightAxis:[.37,.94,.74,1],depthAxis:[.84,.65,1,1],
};
const axisStyles={x:'widthAxis',y:'heightAxis',z:'depthAxis'};
const preset=patchPreset('burl');
const pickRadius=13;
const displayPoint=(point,model)=>point.map((v,k)=>(v-model.min[k])/model.height);
const scaleAxisOf=({depthOnly=false,scaleAxis=depthOnly?'z':null})=>typeof scaleAxis==='string'&&Object.hasOwn(axisStyles,scaleAxis)?scaleAxis:null;

function anchorCenter(source,point){
 const {face,bary}=point?.anchor||{};
 if(!Number.isInteger(face)||face<0||face>=source.indices.length/3||
   !Array.isArray(bary)||bary.length!==3||bary.some(v=>!Number.isFinite(v)||v<0||v>1)||
   Math.abs(bary.reduce((sum,v)=>sum+v,0)-1)>1e-5)return null;
 return Array.from({length:3},(_,k)=>bary.reduce((sum,weight,i)=>sum+weight*source.pos[source.indices[face*3+i]*3+k],0));
}

export function decalPointScreen(renderer,point,source=renderer.decalPointOverlay?.source){
 const {model,lastVP,canvas}=renderer;
 if(!source||!model||!lastVP||model.sourceSHA256!==source.sourceSHA256)return null;
 const center=anchorCenter(source,point);
 if(!center)return null;
 const rect=canvas.getBoundingClientRect();
 if(!rect.width||!rect.height)return null;
 const screen=projectBrushPoint(center,lastVP,rect,model);
 if(!screen)return null;
 return{x:rect.left+screen[0],y:rect.top+screen[1],point:displayPoint(center,model)};
}

export function decalPointLines(model,config){
 const {points=[],selectedId,hoveredId,preview,source,actualHeightMeters}=config;
 const scaleAxis=scaleAxisOf(config);
 const buckets=new Map(),visible=[];
 const bucket=(style,throughAlpha=0)=>{
  const key=style+'/'+throughAlpha;
  if(!buckets.has(key))buckets.set(key,{style,throughAlpha,lines:[]});
  return buckets.get(key).lines;
 };
 const add=(point,style,outline,focusAxis,showThrough)=>{
  if(!anchorCenter(source,point))return;
  if(![point.widthMeters,point.heightMeters,point.rotation].every(Number.isFinite)||point.widthMeters<=0||point.heightMeters<=0)return;
  let frame;
  try{frame=localPatchFrame(source,{...preset,...point},actualHeightMeters);}catch{return;}
  const shorter=Math.min(point.widthMeters,point.heightMeters),lift=Math.min(.0003,Math.max(.00002,shorter*.012/actualHeightMeters))*model.height;
  const crossSize=Math.min(.06,Math.max(.012,shorter*.08))*source.height/actualHeightMeters;
  const at=(u,v,depth)=>displayPoint(frame.center.map((c,k)=>c+u*frame.U[k]+v*frame.V[k]+depth*frame.normal[k]),model);
  const marker=bucket(style);
  marker.push(...at(-crossSize,0,lift),...at(crossSize,0,lift),...at(0,-crossSize,lift),...at(0,crossSize,lift));
  const {halfWidth:w,halfHeight:h,depth}=frame;
  if(outline&&Number.isFinite(depth)&&depth>0){
   const corners=[[-w,-h],[w,-h],[w,h],[-w,h]];
   const front=corners.map(([u,v])=>at(u,v,depth)),back=corners.map(([u,v])=>at(u,v,-depth));
   const faceStyle=focusAxis?'scaleFrame':style;
   const frontLines=bucket(faceStyle),backLines=bucket(faceStyle,showThrough ? .16 : 0);
   const axisLines=focusAxis?bucket(axisStyles[focusAxis],showThrough ? .42 : 0):null;
   const struts=focusAxis==='z'?axisLines:bucket(faceStyle,showThrough ? .23 : 0);
   for(let i=0;i<corners.length;i++){
    const next=(i+1)%corners.length;
    const focusedEdge=focusAxis===(i%2===0?'x':'y');
    (focusedEdge?axisLines:frontLines).push(...front[i],...front[next]);
    (focusedEdge?axisLines:backLines).push(...back[i],...back[next]);
    struts.push(...front[i],...back[i]);
   }
   if(axisLines){
    const extent=focusAxis==='x'?[w,0,0]:focusAxis==='y'?[0,h,0]:[0,0,depth];
    axisLines.push(...at(...extent.map(value=>-value)),...at(...extent));
   }
  }
 };
 for(const point of points){
  if(preview?.id===point.id)continue;
  const selected=selectedId===point.id,hovered=hoveredId===point.id,hidden=point.enabled===false;
  const style=selected?(hidden?'selectedHidden':'selected'):hovered?(hidden?'hoverHidden':'hover'):hidden?'hidden':'normal';
  add(point,style,selected||hovered,selected?scaleAxis:null,selected&&!hidden);
  visible.push(point);
 }
 if(preview){
  const valid=preview.valid!==false;
  add(preview,valid?'preview':'invalid',true,valid?scaleAxis:null,true);
 }
 const positions=[],groups=[];
 for(const {style,throughAlpha,lines} of buckets.values()){
  const color=colors[style];
  groups.push({first:positions.length/3,count:lines.length/3,color,
   throughColor:throughAlpha?[...color.slice(0,3),throughAlpha]:null});
  positions.push(...lines);
 }
 return{positions:new Float32Array(positions),groups,visible};
}

export function setDecalPointOverlay(renderer,config){
 const current=renderer.decalPointOverlay,g=renderer.gl,model=renderer.model;
 if(!config?.source||!model||config.source.sourceSHA256!==model.sourceSHA256||
   !Number.isFinite(config.actualHeightMeters)||config.actualHeightMeters<=0){
  if(!current)return;
  g.deleteBuffer(current.buffer);
  g.deleteVertexArray(current.vao);
  renderer.decalPointOverlay=null;
  renderer.dirty=true;
  return;
 }
 const {points=[],selectedId,hoveredId,preview,source,actualHeightMeters}=config;
 const key=JSON.stringify([points,selectedId,hoveredId,preview,actualHeightMeters,scaleAxisOf(config)]);
 if(current?.key===key&&current.source===source&&current.model===model)return;
 const {positions,groups,visible}=decalPointLines(model,config);
 if(!positions.length){setDecalPointOverlay(renderer,null);return;}
 const vao=current?.vao||g.createVertexArray(),buffer=current?.buffer||g.createBuffer();
 g.bindVertexArray(vao);
 g.bindBuffer(g.ARRAY_BUFFER,buffer);
 g.bufferData(g.ARRAY_BUFFER,positions,g.DYNAMIC_DRAW);
 g.enableVertexAttribArray(0);
 g.vertexAttribPointer(0,3,g.FLOAT,false,0,0);
 g.bindVertexArray(renderer.vao);
 renderer.decalPointOverlay={key,source,model,groups,visible,vao,buffer,selectedId,vertexCount:positions.length/3};
 renderer.dirty=true;
}

export function drawDecalPointOverlay(renderer){
 const overlay=renderer.decalPointOverlay;
 if(!overlay?.vertexCount||overlay.model!==renderer.model)return;
 const g=renderer.gl,l=renderer.guideLocations;
 g.useProgram(renderer.guideProgram);
 g.bindVertexArray(overlay.vao);
 g.uniformMatrix4fv(l.vp,false,renderer.lastVP);
 g.uniform1i(l.bake,0);
 g.enable(g.DEPTH_TEST);
 g.depthMask(false);
 g.depthFunc(g.LEQUAL);
 g.enable(g.BLEND);
 g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);
 try{
  if(overlay.groups.some(group=>group.throughColor)){
   // Show the box where it intersects the mesh, then emphasize visible edges.
   g.disable(g.DEPTH_TEST);
   for(const {throughColor,first,count} of overlay.groups){
    if(!throughColor)continue;
    g.uniform4fv(l.color,throughColor);
    g.drawArrays(g.LINES,first,count);
   }
   g.enable(g.DEPTH_TEST);
  }
  for(const {color,first,count} of overlay.groups){
   g.uniform4fv(l.color,color);
   g.drawArrays(g.LINES,first,count);
  }
 }finally{
  g.enable(g.DEPTH_TEST);
  g.depthMask(true);
  g.depthFunc(g.LESS);
  g.disable(g.BLEND);
 }
}

export function pickDecalPoint(renderer,clientX,clientY){
 const overlay=renderer.decalPointOverlay;
 if(!overlay||overlay.model!==renderer.model)return null;
 const rect=renderer.canvas.getBoundingClientRect();
 if(clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return null;
 const candidates=[];
 for(const point of overlay.visible){
  const screen=decalPointScreen(renderer,point,overlay.source);
  if(!screen)continue;
  const distance=Math.hypot(clientX-screen.x,clientY-screen.y);
  if(distance<=pickRadius)candidates.push({point,screen,distance});
 }
 candidates.sort((a,b)=>a.distance-b.distance||Number(b.point.id===overlay.selectedId)-Number(a.point.id===overlay.selectedId));
 for(const {point,screen} of candidates){
  const hit=renderer.pick(screen.x,screen.y,{accelerated:true});
  if(hit&&(hit.face===point.anchor.face||Math.hypot(...hit.point.map((v,k)=>v-screen.point[k]))<.0003))return point.id;
 }
 return null;
}
