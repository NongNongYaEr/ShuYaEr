import * as THREE from './vendor/three.module.min.js';

export const CALIBRATED_PREVIEW_ROTATION=Math.PI/2;

const cm=value=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);
function niceStep(value){const power=10**Math.floor(Math.log10(Math.max(value,1e-8))),n=value/power;return (n>=5?5:n>=2?2:1)*power;}

export function createPreparationGuides(host,scene,camera){
  const root=new THREE.Group();root.name='calibration-guides';scene.add(root);
  const layer=document.createElement('div');layer.className='pup-reference-layer';layer.hidden=true;
  layer.innerHTML='<div class="pup-reference-info"><strong data-reference-title></strong><p data-reference-note></p><p class="pup-size-preview-note" data-size-preview-note hidden></p><div data-axis-legend><span class="axis-x">X 横向</span><span class="axis-y">Y 生长</span><span class="axis-z">Z 正面</span></div></div><div class="pup-reference-labels"></div><div class="pup-scale-ruler"><span data-ruler-label></span><i data-ruler-line></i><small data-grid-label></small></div><div class="pup-dimension-readout" data-readout></div>';
  host.append(layer);const q=s=>layer.querySelector(s),labels=[];
  let mode='',bounds=null,dimensions=null,comparison=null,currentGroup=null,drawGroup=root,currentRatio=1,baseCurrentBounds=null,scaleBase=null;
  function clear(){delete layer.dataset.rotating;for(const child of [...root.children]){root.remove(child);child.traverse(object=>{object.geometry?.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material?.dispose();});}labels.length=0;currentGroup=null;drawGroup=root;currentRatio=1;scaleBase=null;baseCurrentBounds=null;q('.pup-reference-labels').replaceChildren();}
  function label(text,point,color='#dbe6df',name=''){const node=document.createElement('span');node.className='pup-world-label';node.textContent=text;node.style.color=color;if(name)node.dataset.reference=name;q('.pup-reference-labels').append(node);labels.push({node,point:new THREE.Vector3(...point),scalable:mode==='calibrated'&&drawGroup===currentGroup});}
  function line(points,color){const item=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.85}));item.renderOrder=20;drawGroup.add(item);return item;}
  function showSource(unit,referenceCm=null){
    clear();root.rotation.set(0,0,0);mode='source';bounds=dimensions=comparison=null;q('[data-size-preview-note]').hidden=true;layer.hidden=!unit;root.visible=!!unit;q('[data-reference-title]').textContent='原始姿态';q('[data-reference-note]').textContent='点位在原模型上；切换校准预览查看方向与真实大小。';q('[data-axis-legend]').hidden=true;q('.pup-scale-ruler').hidden=true;q('[data-readout]').hidden=true;
    if(!unit)return;
    if(unit.base)label('挂接底点',unit.base,'#ffdc6a','base');if(unit.tip)label('朝向点',unit.tip,'#85dcf0','tip');
    const ref=unit.size_reference;if(ref?.a)label('参照 A',ref.a,'#b4e4f1','measure-a');if(ref?.b)label('参照 B',ref.b,'#b4e4f1','measure-b');
    if(ref?.a&&ref.b){line([ref.a,ref.b],'#8bd9eb');const middle=ref.a.map((v,i)=>(v+ref.b[i])/2);label(referenceCm==null?'尺寸参照段':'当前 '+cm(referenceCm)+' cm',middle,'#e0f6ff','measure-length');}
  }
  function showCalibrated(unit,feedback=null){
    clear();root.rotation.set(CALIBRATED_PREVIEW_ROTATION,0,0);mode='calibrated';layer.hidden=false;root.visible=true;q('[data-axis-legend]').hidden=false;q('.pup-scale-ruler').hidden=false;q('[data-readout]').hidden=false;
    const box=new THREE.Box3(),point=new THREE.Vector3();for(let i=0;i<unit.geometry.position.length;i+=3)box.expandByPoint(point.fromArray(unit.geometry.position,i).multiplyScalar(unit.size_m));
    const size=box.getSize(new THREE.Vector3()),longest=Math.max(size.x,size.y,size.z),margin=longest*.14,axisLength=longest*.26;
    dimensions={x:size.x*100,y:size.y*100,z:size.z*100,longest:longest*100};scaleBase={size_m:unit.size_m,dimensions:{...dimensions},feedbackRatio:feedback?.ratio??1};bounds=box.clone().expandByScalar(margin*1.4).expandByPoint(new THREE.Vector3());
    baseCurrentBounds=bounds.clone();
    comparison=(feedback?.changed||feedback?.interactive)&&feedback.showComparison!==false?feedback.baseline:null;
    const note=q('[data-size-preview-note]');note.hidden=!feedback;note.textContent=feedback?.changed?(feedback.scaleChanged?'当前尺寸已实时预览':'朝向／范围已更新，实际比例保持')+' · '+cm(feedback.baseline.dimensions.y)+' → '+cm(dimensions.y)+' cm（×'+cm(feedback.ratio)+'）':feedback?.approved?'当前尺寸已确认':'当前校准待确认';
    if(comparison){const before=new THREE.Box3(new THREE.Vector3(...comparison.bounds.min),new THREE.Vector3(...comparison.bounds.max)),extent=before.getSize(new THREE.Vector3()),geometry=new THREE.EdgesGeometry(new THREE.BoxGeometry(extent.x,extent.y,extent.z)),wire=new THREE.LineSegments(geometry,new THREE.LineDashedMaterial({color:'#cfad75',dashSize:longest*.035,gapSize:longest*.022,depthTest:false,transparent:true,opacity:.7}));wire.position.copy(before.getCenter(new THREE.Vector3()));wire.computeLineDistances();wire.renderOrder=18;root.add(wire);bounds.union(before);label((comparison.kind==='confirmed'?'上次确认 ':'初始参照 ')+cm(comparison.dimensions.y)+' cm',[before.min.x,before.max.y,before.max.z+margin],'#dfbc84','size-before');}
    q('[data-reference-title]').textContent='竖立校准 · 厘米';q('[data-reference-note]').textContent='底点 = 原点 (0, 0, 0) · 尺寸为模型包围范围';
    q('[data-readout]').textContent='长 Y '+cm(dimensions.y)+' cm　宽 X '+cm(dimensions.x)+' cm　厚 Z '+cm(dimensions.z)+' cm';
    currentGroup=new THREE.Group();root.add(currentGroup);drawGroup=currentGroup;
    for(const [axis,direction,color,text] of [['x',[1,0,0],'#f5998e','+X 横向'],['y',[0,1,0],'#b5d97a','+Y 生长'],['z',[0,0,1],'#83c9f2','+Z 正面']]){
      const arrow=new THREE.ArrowHelper(new THREE.Vector3(...direction),new THREE.Vector3(),axisLength,color,axisLength*.18,axisLength*.08);arrow.line.geometry=arrow.line.geometry.clone();arrow.cone.geometry=arrow.cone.geometry.clone();arrow.name='axis-'+axis;arrow.traverse(o=>{if(o.material){o.material.depthTest=false;o.material.transparent=true;o.material.opacity=.95;o.renderOrder=30;}});drawGroup.add(arrow);const end=direction.map(v=>v*axisLength);bounds.expandByPoint(new THREE.Vector3(...end));baseCurrentBounds.expandByPoint(new THREE.Vector3(...end));label(text,end,color,'axis-'+axis);
    }
    const origin=new THREE.Mesh(new THREE.SphereGeometry(longest*.009,12,8),new THREE.MeshBasicMaterial({color:'#ffdc6a',depthTest:false}));origin.renderOrder=35;drawGroup.add(origin);label('底点 · 0', [0,0,0],'#ffdc6a','origin');
    const outline=new THREE.Box3Helper(box,'#64796e');outline.material.transparent=true;outline.material.opacity=.3;outline.material.depthTest=false;drawGroup.add(outline);
    const z=box.max.z+margin,x=box.max.x+margin,y=Math.min(0,box.min.y)-longest*.005;
    line([[box.min.x,y,z],[box.max.x,y,z]],'#e8b79a');line([[box.min.x,box.min.y,z],[box.min.x,y-margin*.15,z]],'#64796e');line([[box.max.x,box.min.y,z],[box.max.x,y-margin*.15,z]],'#64796e');label('宽 '+cm(dimensions.x)+' cm',[(box.min.x+box.max.x)/2,y,z],'#f0c5ac','dimension-x');
    line([[x,box.min.y,z],[x,box.max.y,z]],'#b5d97a');line([[box.max.x,box.min.y,z],[x+margin*.15,box.min.y,z]],'#64796e');line([[box.max.x,box.max.y,z],[x+margin*.15,box.max.y,z]],'#64796e');label('长 '+cm(dimensions.y)+' cm',[x,(box.min.y+box.max.y)/2,z],'#cfe6ad','dimension-y');
    const gridBox=box.clone();if(comparison)gridBox.union(new THREE.Box3(new THREE.Vector3(...comparison.bounds.min),new THREE.Vector3(...comparison.bounds.max)));const gridLongest=Math.max(longest,comparison?.size_m||0),step=niceStep(gridLongest/7),center=gridBox.getCenter(new THREE.Vector3()),gridSize=Math.ceil((gridLongest+margin*4)/step/2)*2*step,grid=new THREE.GridHelper(gridSize,Math.round(gridSize/step),'#536e60','#344a3e');grid.position.set(Math.round(center.x/step)*step,Math.min(0,box.min.y)-longest*.012,Math.round(center.z/step)*step);grid.material.transparent=true;grid.material.opacity=.45;grid.material.depthWrite=false;root.add(grid);q('[data-grid-label]').textContent='每格 '+cm(step*100)+' cm';
  }
  function previewSize(size_m){
    if(!scaleBase||!currentGroup)return;currentRatio=size_m/scaleBase.size_m;currentGroup.scale.setScalar(currentRatio);dimensions=Object.fromEntries(Object.entries(scaleBase.dimensions).map(([k,v])=>[k,v*currentRatio]));bounds=new THREE.Box3(baseCurrentBounds.min.clone().multiplyScalar(currentRatio),baseCurrentBounds.max.clone().multiplyScalar(currentRatio));if(comparison)bounds.union(new THREE.Box3(new THREE.Vector3(...comparison.bounds.min),new THREE.Vector3(...comparison.bounds.max)));
    q('[data-readout]').textContent='长 Y '+cm(dimensions.y)+' cm　宽 X '+cm(dimensions.x)+' cm　厚 Z '+cm(dimensions.z)+' cm';for(const label of labels){const name=label.node.dataset.reference;if(name==='dimension-x')label.node.textContent='宽 '+cm(dimensions.x)+' cm';if(name==='dimension-y')label.node.textContent='长 '+cm(dimensions.y)+' cm';}const note=q('[data-size-preview-note]');note.hidden=false;note.textContent='缩放预览中 · 当前长 '+cm(dimensions.y)+' cm'+(comparison?' · 对'+(comparison.kind==='confirmed'?'上次确认':'初始参照')+' ×'+cm(scaleBase.feedbackRatio*currentRatio):'');
  }
  function rotationPreview(){layer.dataset.rotating='true';if(currentGroup)currentGroup.visible=false;q('[data-readout]').textContent='旋转预览 · 底点固定 · 完成后更新长宽厚';q('[data-size-preview-note]').hidden=false;q('[data-size-preview-note]').textContent='正在调整保存后的模型朝向';}
  function project(){
    if(layer.hidden)return;camera.updateMatrixWorld(true);root.updateMatrixWorld(true);const w=host.clientWidth,h=host.clientHeight,occupied=[];
    for(const item of labels){const p=item.point.clone().multiplyScalar(item.scalable?currentRatio:1).applyMatrix4(root.matrixWorld).project(camera);item.node.hidden=p.z<-1||p.z>1;if(item.node.hidden)continue;let x=(p.x+1)*w/2,y=(1-p.y)*h/2;const name=item.node.dataset.reference;if(name==='axis-z'){x-=58;y+=10;}if(name==='origin')y+=25;if(name==='axis-y')y-=12;if(name==='dimension-x')y+=12;if(name==='dimension-y')x+=15;for(const other of occupied)if(Math.abs(other.x-x)<85&&Math.abs(other.y-y)<23)y+=25;x=Math.max(60,Math.min(w-60,x));y=Math.max(22,Math.min(h-45,y));occupied.push({x,y});item.node.style.left=x+'px';item.node.style.top=y+'px';}
    if(mode==='calibrated'){
      const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),a=new THREE.Vector3().project(camera),b=right.clone().multiplyScalar(.01).project(camera),pixelsPerCm=Math.hypot((b.x-a.x)*w/2,(b.y-a.y)*h/2);
      if(pixelsPerCm>1e-6){const rulerCm=niceStep(115/pixelsPerCm);q('[data-ruler-label]').textContent=cm(rulerCm)+' cm · 原点深度';q('[data-ruler-line]').style.width=Math.max(1,rulerCm*pixelsPerCm)+'px';}
    }
  }
  return {showSource,showCalibrated,previewSize,rotationPreview,project,get bounds(){root.updateMatrixWorld(true);return bounds?.clone().applyMatrix4(root.matrixWorld);},get state(){return {mode,dimensions,comparison};},withoutGuides(fn){const visible=root.visible;root.visible=false;try{return fn();}finally{root.visible=visible;}},dispose(){clear();scene.remove(root);layer.remove();}};
}
