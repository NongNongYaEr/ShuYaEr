import { createSurfaceRulerLayout } from './surface-ruler-layout.js';
import { createHeightDensityEditor } from './surface-height-density-editor.js';
import { createSurfaceLeafEditor } from './surface-leaf-editor.js';
import { createDefaultSurfaceRuler,SURFACE_RULER_DEFAULTS,SURFACE_LEAF_DEFAULTS } from './surface-defaults.js';
import { normalizeVine } from './vine-data.js';
import * as THREE from 'three';
import { normalizeGrowthRuler } from './surface-growth-ruler-data.js';
const $=id=>document.getElementById(id);
export function createGrowthRulerEditor({api,section,state,transact,refresh,endTools}){
 const panel=document.createElement('details');panel.open=true;panel.id='growthRulerPanel';panel.innerHTML=`<summary>两点生长尺 · 整体攀爬</summary><button id="growthRulerStart">启用两点生长尺</button><p class="vine-note">拖动尺子控制起长与顶部高度；松手生成，Esc 取消。</p><div id="growthRulerFields" hidden><div class="wb-row"><label class="wb-check"><input id="growthRulerEnabled" type="checkbox">启用自动攀爬</label><label class="wb-check"><input id="growthRulerVisible" type="checkbox">显示控制尺</label></div><div class="field-grid"><label>起长高度 Z（m）<input id="growthRulerBottom" type="number" step=".001"></label><label>生长高度 Z（m）<input id="growthRulerTop" type="number" step=".001"></label><label>覆盖密度<input id="growthRulerCoverage" type="number" min="0" max="1" step=".05"></label><label>整面枝段预算<input id="growthRulerBudget" type="number" min="20" max="2400" step="20"></label><label>藤干弯曲幅度（m）<input id="growthStemWander" type="number" min="0" max=".8" step=".02"></label><label>弯曲段长（m）<input id="growthStemSpan" type="number" min=".4" max="4" step=".1"></label><label>叶层片数上限<input id="growthRulerLeaves" type="number" min="0" max="160000" step="1000"></label><label>叶簇起伏（m）<input id="growthRulerDepth" type="number" min="0" max=".8" step=".02"></label><label>叶簇大小（m）<input id="growthRulerClump" type="number" min=".15" max="3" step=".05"></label><label>轮廓起伏宽度（m）<input id="growthFrontierSpan" type="number" min=".3" max="10" step=".1"></label><label>轮廓错落（m）<input id="growthRulerRagged" type="number" min="0" max="3" step=".05"></label></div><p id="growthRulerStatus" class="vine-note"></p><p class="vine-note">上拉生长，下拉回收；松手生成，Esc 取消。藤干弯曲幅度控制游走，段长控制弯曲疏密；手绘路线保留。叶簇起伏控制厚薄，叶簇大小控制成片范围，轮廓错落控制整簇高低差，起伏宽度控制峰谷横向范围，藤干与叶层共同遵循，生长高度为上限，0 为齐平。凸角自动绕角覆盖；叶片尺寸保持原值。叶层单独限量并共享网格预览；较大模型请留意实际面数。</p></div>`;
 section.querySelector('.vine-tools').before(panel);
 const densityEditor=createHeightDensityEditor({host:panel.querySelector('#growthRulerFields'),state,transact});
 const leafEditor=createSurfaceLeafEditor({host:panel.querySelector('#growthRulerFields'),api,state,transact});
 const layout=createSurfaceRulerLayout({panel,api,state,transact});
 const root=new THREE.Group();root.name='SurfaceGrowthRuler';root.userData.editorOnly=true;api.scene.add(root);
 const material=new THREE.LineBasicMaterial({color:'#ebd275',depthTest:false,depthWrite:false,fog:false});
 const line=new THREE.LineSegments(new THREE.BufferGeometry(),material);line.raycast=()=>{};line.renderOrder=50;root.add(line);
 const handles=['bottom','top'].map((kind,i)=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),new THREE.MeshBasicMaterial({color:i?'#f3d164':'#ed9878',depthTest:false,depthWrite:false,fog:false}));mesh.name='GrowthRuler_'+kind;mesh.userData.growthHandle=kind;mesh.renderOrder=51;root.add(mesh);return mesh;});
 const labels=['起长','生长'].map(text=>{const node=document.createElement('div');node.textContent=text;node.style.cssText='position:absolute;pointer-events:none;color:#f5db86;background:#101810dd;padding:3px 6px;border-radius:4px;font-size:12px;white-space:nowrap;z-index:20;display:none';api.canvas.parentElement.append(node);return node;});
 const ray=new THREE.Raycaster(),bounds=new THREE.Box3(),size=new THREE.Vector3();let mesh=null,drag=null;
 const enabled=()=>api.isActive()&&state()?.enabled&&state()?.growth_ruler?.enabled&&state()?.growth_ruler?.visible;
 function measure(){const source=state()?.mesh;if(!source)return false;if(source!==mesh){bounds.setFromArray(source.position);bounds.getSize(size);mesh=source;}return true;}
 function pickRay(e){const r=api.canvas.getBoundingClientRect();api.camera.updateMatrixWorld();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),api.camera);return ray.ray;}
 function draw(){
  root.visible=!!enabled();labels.forEach(n=>n.style.display=root.visible?'block':'none');if(!root.visible||!measure())return;
  const r=drag?.value||state().growth_ruler,center=bounds.getCenter(new THREE.Vector3()),rect=api.canvas.getBoundingClientRect(),parent=api.canvas.parentElement.getBoundingClientRect();
  const right=new THREE.Vector3(1,0,0).applyQuaternion(api.camera.quaternion);right.z=0;if(right.lengthSq()<.01)right.set(1,0,0);right.normalize();
  const span=Math.abs(right.x)*size.x+Math.abs(right.y)*size.y,origin=center.clone().addScaledVector(right,-span*.5-Math.max(.3,size.z*.055));
  const at=origin.clone().setZ((r.bottom+r.top)/2),worldPerPixel=api.camera.isPerspectiveCamera?2*at.distanceTo(api.camera.position)*Math.tan(THREE.MathUtils.degToRad(api.camera.fov*.5))/Math.max(1,rect.height):(api.camera.top-api.camera.bottom)/api.camera.zoom/Math.max(1,rect.height),radius=worldPerPixel*9;
  handles.forEach((h,i)=>{h.position.copy(origin).setZ(i?r.top:r.bottom);h.scale.setScalar(radius);});
  const points=[...handles[0].position.toArray(),...handles[1].position.toArray()],step=Math.max(.1,10**Math.floor(Math.log10(Math.max(.1,(r.top-r.bottom)/8))));
  for(let z=Math.ceil(r.bottom/step)*step,n=0;z<r.top&&n++<80;z+=step){const p=origin.clone().setZ(z),q=p.clone().addScaledVector(right,worldPerPixel*7);points.push(...p.toArray(),...q.toArray());}
  const old=line.geometry.getAttribute('position');if(!old||old.count!==points.length/3){line.geometry.dispose();line.geometry=new THREE.BufferGeometry();line.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));}else{old.array.set(points);old.needsUpdate=true;}line.geometry.computeBoundingSphere();
  handles.forEach((h,i)=>{const p=h.position.clone().project(api.camera),node=labels[i];node.textContent=`${i?'生长':'起长'} ${h.position.z.toFixed(2)} m${drag?' · 松手生成':''}`;node.style.display=p.z>=-1&&p.z<=1?'block':'none';node.style.left=`${rect.left-parent.left+(p.x+1)*rect.width/2+15}px`;node.style.top=`${rect.top-parent.top+(1-p.y)*rect.height/2-10}px`;});root.updateMatrixWorld(true);
 }
 $('growthRulerStart').onclick=()=>{if(!measure())return;endTools();const old=state().growth_ruler,bottom=Math.round((bounds.min.z+.02)*1000)/1000;api.transact('启用两点生长尺',a=>{const s=a.surface_growth;s.growth_ruler=old?{...old,enabled:true,visible:true}:createDefaultSurfaceRuler({bottom,top:Math.round(Math.min(bounds.max.z,bottom+SURFACE_RULER_DEFAULTS.top-SURFACE_RULER_DEFAULTS.bottom)*1000)/1000});if(!old)a.vine=normalizeVine({...a.vine,...SURFACE_LEAF_DEFAULTS});},{bypassLayers:true});};
 for(const[id,key]of Object.entries({growthRulerEnabled:'enabled',growthRulerVisible:'visible',growthRulerBottom:'bottom',growthRulerTop:'top',growthRulerCoverage:'coverage',growthRulerBudget:'budget',growthStemWander:'stem_wander',growthStemSpan:'stem_span',growthRulerLeaves:'leaf_budget',growthRulerDepth:'canopy_depth',growthRulerClump:'canopy_clump',growthRulerRagged:'canopy_ragged',growthFrontierSpan:'frontier_span'}))$(id).onchange=()=>{
  const input=$(id),r=state()?.growth_ruler;if(!r)return;if(input.type!=='checkbox'&&(input.value===''||!input.checkValidity()))return refresh();finish(true);
  transact('调整两点生长尺',s=>{const next={...s.growth_ruler,[key]:input.type==='checkbox'?input.checked:+input.value};if(key==='bottom')next.bottom=Math.min(next.bottom,next.top-.05);s.growth_ruler=normalizeGrowthRuler(next);});
 };
 function finish(cancel){if(!drag)return;const done=drag;drag=null;api.controls.enabled=done.controls;if(api.canvas.hasPointerCapture(done.pointer))api.canvas.releasePointerCapture(done.pointer);if(!cancel&&done.changed)transact('拖动两点生长尺',s=>{s.growth_ruler=done.value;});draw();}
 // Parent capture runs before brush/sculpt canvas handlers, keeping a handle drag exclusive.
 const target=api.canvas.parentElement;
 target.addEventListener('pointerdown',e=>{
  if(e.target!==api.canvas||e.button!==0||!enabled()||e.shiftKey||e.ctrlKey)return;draw();pickRay(e);const hit=ray.intersectObjects(handles,false)[0];if(!hit)return;
  const normal=api.camera.position.clone().sub(hit.object.position).setZ(0);if(normal.lengthSq()<1e-8)return;normal.normalize();const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,hit.object.position),point=ray.ray.intersectPlane(plane,new THREE.Vector3());if(!point)return;
  e.preventDefault();e.stopImmediatePropagation();drag={pointer:e.pointerId,kind:hit.object.userData.growthHandle,plane,start:point.z,initial:{...state().growth_ruler},value:{...state().growth_ruler},controls:api.controls.enabled,changed:false};api.controls.enabled=false;api.canvas.setPointerCapture(e.pointerId);
 },true);
 target.addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();e.stopImmediatePropagation();const p=pickRay(e).intersectPlane(drag.plane,new THREE.Vector3());if(!p)return;const next=Math.round((drag.initial[drag.kind]+p.z-drag.start)*1000)/1000;drag.value[drag.kind]=drag.kind==='top'?Math.max(drag.value.bottom+.05,Math.min(bounds.max.z+.1,next)):Math.max(bounds.min.z-.1,Math.min(drag.value.top-.05,next));drag.changed=Math.abs(drag.value[drag.kind]-drag.initial[drag.kind])>1e-5;draw();},true);
 target.addEventListener('pointerup',e=>{if(!drag)return;e.preventDefault();e.stopImmediatePropagation();finish(false);},true);
 for(const type of ['pointercancel','lostpointercapture'])api.canvas.addEventListener(type,()=>finish(true));window.addEventListener('blur',()=>finish(true));
 api.controls.addEventListener('change',draw);const observer=new ResizeObserver(draw);observer.observe(api.canvas);
 function sync(){densityEditor.refresh();leafEditor.refresh();layout.refresh();panel.hidden=!state();$('growthRulerFields').hidden=!state()?.growth_ruler;const r=state()?.growth_ruler;if(r){$('growthRulerStart').textContent='显示 / 启用两点生长尺';for(const[id,key]of Object.entries({growthRulerEnabled:'enabled',growthRulerVisible:'visible',growthRulerBottom:'bottom',growthRulerTop:'top',growthRulerCoverage:'coverage',growthRulerBudget:'budget',growthStemWander:'stem_wander',growthStemSpan:'stem_span',growthRulerLeaves:'leaf_budget',growthRulerDepth:'canopy_depth',growthRulerClump:'canopy_clump',growthRulerRagged:'canopy_ragged',growthFrontierSpan:'frontier_span'})){const input=$(id);if(input.type==='checkbox')input.checked=r[key];else if(document.activeElement!==input)input.value=Number(r[key].toFixed(3));}const count=api.getAsset()?.masterBranches.filter(b=>b.stableId.startsWith('Z_ruler_')).length||0;$('growthRulerStatus').textContent=`覆盖高度 ${(r.top-r.bottom).toFixed(2)} m · 当前 ${count} 枝段 · 整面预算 ${r.budget} · 叶层 ${api.getAsset()?.report.surface_canopy?.count||0} / ${r.leaf_budget} 片${api.getAsset()?.report.surface_canopy?.budgetRemoved?" · 达到片数上限，已按预算筛选":""}。`;}
  draw();
 }
 return {refresh:sync,cancel:()=>finish(true),get dragging(){return !!drag;},key(e){if(drag&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(true);return true;}return false;}};
}



