import * as T from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/surface/loaders/GLTFLoader.js';
import { createTrunkFormPrototype } from './trunk-form-prototype.js';

const $ = id => document.getElementById(id);
const viewport = $('viewport'), renderer = new T.WebGLRenderer({ canvas:$('canvas'), antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
const scene = new T.Scene(); scene.background = new T.Color('#555b50');
const camera = new T.PerspectiveCamera(36, 1, .05, 120); camera.up.set(0,0,1);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
scene.add(new T.HemisphereLight('#e1eddf', '#4a3420', 2));
const sun = new T.DirectionalLight('#fff0cc', 3.2); sun.position.set(5,-6,10); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera, {left:-9,right:9,top:9,bottom:-9,near:.1,far:30}); sun.shadow.bias=-.00025;
scene.add(sun); const fill = new T.DirectionalLight('#bbdbcd',1.2); fill.position.set(-6,3,6); scene.add(fill);
const ground = new T.Mesh(new T.CircleGeometry(13,80), new T.MeshStandardMaterial({color:'#777567',roughness:1})); ground.position.z=-.025;ground.receiveShadow=true;scene.add(ground);
const ring = new T.Mesh(new T.RingGeometry(3.85,3.87,100), new T.MeshBasicMaterial({color:'#a6ae93',side:T.DoubleSide}));ring.position.z=-.015;scene.add(ring);
const loader = new GLTFLoader(), textures = new T.TextureLoader(), cache = new Map();
const descriptions = {
  Baseline:['原有主干','现有中心线与截面生成，作为形体对照。'],
  Grooved:['深纵沟主干','不对称纵脊与深沟直接改变网格，保留承重骨架和完整单元枝。'],
  Buttress:['板根主干','根脊从地面向主干收拢，采用一个连续表面；这还不是多股根系融合。'],
  Refined:['固定网格基座','先烘焙并保存主干网格，再读取同一网格与六类完整单元枝组合。']
};
let current, options, trunk, active='Grooved', generation=0, dirty=true;
const fields=['grooveDepth','ridgeCount','rootFlare','buttressStrength','bulgeStrength'];
function setVisible(){
  current?.root.traverse(o=>{if(o.isMesh){o.visible=!$('onlyTrunk').checked || o===trunk;
    for(const m of [o.material].flat())m.wireframe=$('wireframe').checked && o===trunk;
  }}); dirty=true;
}
function updateFields(){for(const key of fields){const value=Number(options?.[key]??0);$(key).value=value;$(key+'Value').textContent=key==='ridgeCount'?value.toFixed(0):value.toFixed(2);$(key).disabled=active==='Baseline'||active==='Refined';}$('reset').disabled=active==='Baseline'||active==='Refined';}
function geometryUpdate(){
  if(!trunk || active==='Baseline'||active==='Refined')return;
  const made=createTrunkFormPrototype(options); trunk.geometry.dispose();trunk.geometry=made.geometry;
  $('detail').textContent=`当前主干 ${made.geometry.index.count/3} 个三角面 · 调节尚未写入导出包`;dirty=true;
}
function focus(rootOnly=false){
  if(!current)return;
  const box=new T.Box3().setFromObject(rootOnly?trunk:current.root),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
  controls.target.copy(rootOnly ? center.clone().setZ(Math.min(center.z,1.1)) : center);
  const distance=rootOnly?5.7:Math.max(size.x,size.y,size.z)*1.65;
  camera.position.copy(controls.target).add(new T.Vector3(.78,-1,.42).normalize().multiplyScalar(distance)); controls.update();dirty=true;
}
async function validation(){
  let output='软件端包与网格校验已完成。';
  try{
    const r=await fetch('/samples/ue-summary.json',{cache:'no-store'});if(r.ok){const report=await r.json();
      const row=report.samples?.find(s=>s.name===active);
      if(row?.passed && report.actual_pve_generation_verified && report.fresh_process_reload &&
        row.source_sha256===current?.data.validation?.source_sha256){
        output='<strong>UE / PVE 样本生成与重载通过</strong><br>风动与最终网格导出仍待验证。';
      }else if(row)output='UE 验证尚未通过或样本已更新，请查看报告。';
    }
  }catch{}
  const pve=current?.data.pve||'PVE_Complete/whole.pve-skeleton.json';
  $('validation').innerHTML=output+'<br>6 类完整单元枝 · 24 个实例<br>独立叶花果装配：0<br><a href="/samples/'+active+'/'+pve+'" target="_blank">查看本样本 PVE 入口</a>';
}
async function loadSample(name){
  const stamp=++generation;active=name;$('caption').textContent='正在载入…';
  document.querySelectorAll('[data-sample]').forEach(b=>b.classList.toggle('active',b.dataset.sample===name));
  try{
    if(!cache.has(name)){
      const base='/samples/'+name+'/';const r=await fetch(base+'prototype.json');if(!r.ok)throw Error('请先运行主干样本准备脚本');const data=await r.json();
      const loaded=await loader.loadAsync(base+(data.glb||'preview.glb'));
      const root=new T.Group();root.rotation.x=Math.PI/2;root.add(loaded.scene);
      const leaf=await textures.loadAsync(base+(data.atlas||'PVE_Complete/leaf_atlas_color.png'));leaf.colorSpace=T.SRGBColorSpace;leaf.flipY=false;
      root.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
        for(const m of [o.material].flat())if(m.name==='M_Leaf'||m.name.startsWith('M_Leaf')){m.map=leaf;m.alphaTest=data.leafCutoff??.42;m.side=T.DoubleSide;m.needsUpdate=true;}
      });root.updateMatrixWorld(true);cache.set(name,{data,root});
    }
    if(stamp!==generation)return;
    if(current)scene.remove(current.root);current=cache.get(name);scene.add(current.root);
    trunk=current.root.getObjectByName(current.data.trunk_mesh_name||'PrototypeTrunk_ROOT');
    if(!trunk)throw Error('预览模型缺少独立主干');
    if(!trunk.userData.prototypeOwnMaterial){trunk.material=Array.isArray(trunk.material)?trunk.material.map(m=>m.clone()):trunk.material.clone();trunk.userData.prototypeOwnMaterial=true;}
    options=structuredClone(current.data.parameters||current.data.options||{});
    [$('panelTitle').textContent,$('description').textContent]=descriptions[name];
    $('caption').textContent=descriptions[name][0];
    $('summary').textContent='6 类完整香樟单元枝 · 24 次装配 · 左键旋转 / 右键平移 / 滚轮缩放';
    $('detail').textContent=`主干 ${trunk.geometry.index.count/3} 个三角面 · 连续表面`;
    updateFields();geometryUpdate();setVisible();focus($('onlyTrunk').checked);await validation();
  }catch(e){if(stamp===generation){$('caption').textContent='样本载入失败';$('detail').textContent=e.message;$('detail').classList.add('error');}throw e;}
}
fields.forEach(key=>$(key).addEventListener('input',()=>{options[key]=Number($(key).value);$(key+'Value').textContent=key==='ridgeCount'?options[key].toFixed(0):options[key].toFixed(2);geometryUpdate();}));
document.querySelectorAll('[data-sample]').forEach(b=>b.addEventListener('click',()=>loadSample(b.dataset.sample).catch(console.error)));
$('reset').addEventListener('click',()=>{options=structuredClone(current.data.parameters||current.data.options);updateFields();geometryUpdate();});
$('onlyTrunk').addEventListener('change',()=>{setVisible();focus($('onlyTrunk').checked);});$('wireframe').addEventListener('change',setVisible);
$('focusRoot').addEventListener('click',()=>focus(true));$('fit').addEventListener('click',()=>{$('onlyTrunk').checked=false;setVisible();focus(false);});
new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}).observe(viewport);
controls.addEventListener('change',()=>{dirty=true;});
renderer.setAnimationLoop(()=>{controls.update();if(dirty){renderer.render(scene,camera);dirty=false;}});
window.__trunkFeasibility={loadSample,scene,camera,controls,get state(){return {active,options,trunk,current};},focus,geometryUpdate};
const requested=new URLSearchParams(location.search).get('sample');
loadSample(Object.hasOwn(descriptions,requested)?requested:'Grooved').catch(console.error);
