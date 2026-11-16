import * as THREE from '../vendor/three.module.min.js';
import {setNativePreviewMaterial} from '../native-preview-material.js';
import {setNativePreviewUv,clearNativePreviewUv} from '../native-preview-geometry.js';
import {TREE_LIGHT_GROUP} from '../tree-light-mesh.js';
import {normalizeTreeLightFlow} from '../tree-light-data.js';

const laps=2;
const steps=128;
const app=()=>window.__branchForge;
const fields=document.querySelector('#treeLightPanel fieldset');
const row=document.createElement('section');
row.innerHTML=`
  <hr>
  <div class="actions"><button type="button" data-play aria-pressed="false">播放流水灯</button></div>
  <label>流水速度 <input type="number" data-speed min="0.05" max="3" step="0.05" value="0.30" title="每秒经过的路线比例"></label>
  <label>流水方向 <select data-direction><option value="1">沿布线路线</option><option value="-1">逆布线路线</option></select></label>`;
fields.append(row);
const button=row.querySelector('[data-play]');
const speed=row.querySelector('[data-speed]');
const direction=row.querySelector('[data-direction]');

let active=null,owner=null,group=null,settings=null,last=0,phase=0,frame=0,playing=false,observed,saveTimer=0;
function mask(){
  const values=new Uint8Array(steps*4);
  for(let i=0;i<steps;i++){
    const u=(i+.5)/steps,trail=Math.max(0,1-Math.abs(u-.48)/(u<.48?.43:.16));
    const value=Math.round(255*(.035+.965*trail**2.2));
    values.set([value,value,value,255],i*4);
  }
  const texture=new THREE.DataTexture(values,steps,1);
  texture.repeat.x=laps;
  texture.channel=1;
  texture.wrapS=THREE.RepeatWrapping;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;
  texture.needsUpdate=true;
  return texture;
}

function detach(){
  if(!active)return;
  const {meshes,material,color,previousMap,native,texture,nativeTexture}=active;
  for(const mesh of meshes){
    clearNativePreviewUv(mesh);
  }
  material.color.copy(color);
  material.emissiveMap=previousMap;
  material.needsUpdate=true;
  setNativePreviewMaterial(material,material);
  native.dispose();
  texture.dispose();
  nativeTexture.dispose();
  active=null;
}

function attach(target){
  const meshes=target?.children||[];
  if(!meshes.length)return;
  const material=meshes[0].material,texture=mask();
  const color=material.color.clone(),previousMap=material.emissiveMap;
  material.color.multiplyScalar(.18);
  material.emissiveMap=texture;
  material.needsUpdate=true;
  const native=material.clone(),nativeTexture=texture.clone();
  nativeTexture.channel=0;
  native.emissiveMap=nativeTexture;
  setNativePreviewMaterial(material,native);
  for(const mesh of meshes){
    setNativePreviewUv(mesh,mesh.geometry.attributes.uv1);
  }
  active={meshes,material,color,previousMap,native,texture,nativeTexture};
  applyPhase();
}

function applyPhase(){
  const wrapped=phase*laps-Math.floor(phase*laps);
  active.texture.offset.x=-wrapped;
  // The retained material table reuses a bounded set of GPU phase records.
  active.nativeTexture.offset.x=-Math.floor(wrapped*steps)/steps;
}

function update(now){
  frame=requestAnimationFrame(update);
  const a=app();
  const tree=a?.asset?.group.getObjectByName(TREE_LIGHT_GROUP);
  const flow=a?.authoring.tree_light_flow;
  if(flow!==observed){
    observed=flow;
    settings=normalizeTreeLightFlow(flow);
    speed.value=settings.speed;
    direction.value=settings.direction;
  }
  if(tree!==group||a?.asset!==owner){
    if(owner&&a?.asset!==owner&&playing)setPlaying(false);
    detach();
    group=tree;
    owner=a?.asset;
  }
  const available=!!group?.children.length&&a.workbench.mode==='TREE';
  button.disabled=speed.disabled=direction.disabled=!available;
  if(playing&&!available)setPlaying(false);
  if(playing&&available&&!document.hidden){
    if(!active)attach(group);
    const delta=last?Math.min(.07,(now-last)/1000):0;
    phase=(phase+settings.direction*settings.speed*delta+1)%1;
    if(active)applyPhase();
    last=now;
  }else{
    detach();
    last=0;
  }
}

function edit(commit){
  clearTimeout(saveTimer);
  if(!speed.checkValidity())return;
  settings=normalizeTreeLightFlow({speed:speed.valueAsNumber,direction:Number(direction.value)});
  const current=owner;
  const save=()=>{
    if(!group?.children.length||current!==app()?.asset)return;
    app().setTreeLightFlow(settings);
    observed=app().authoring.tree_light_flow;
  };
  if(commit)save();
  else saveTimer=setTimeout(save,150);
}

function setPlaying(value){
  playing=value;
  button.setAttribute('aria-pressed',String(playing));
  button.textContent=playing?'停止流水灯':'播放流水灯';
  if(!playing)detach();
}

settings=normalizeTreeLightFlow();
row.addEventListener('input',event=>event.stopPropagation());
row.addEventListener('change',event=>event.stopPropagation());
button.addEventListener('click',()=>setPlaying(!playing));
speed.addEventListener('input',()=>edit(false));
speed.addEventListener('change',()=>edit(true));
direction.addEventListener('change',()=>edit(true));
frame=requestAnimationFrame(update);
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);cancelAnimationFrame(frame);detach();},{once:true});
