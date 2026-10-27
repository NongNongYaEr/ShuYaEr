import { TREE_SPECIES } from './tree-species-library.js';
import { regenerateSpeciesStructure } from './branch-species-controls.js';
import { normalizeShapeOperation } from './shape-operation-data.js';

const field=(id,label,value,min,max,step)=>`<label>${label}<input id="${id}" type="number" value="${value}" min="${min}"${Number.isFinite(max)?` max="${max}"`:''} step="${/Count|Seed/.test(id)?step:'any'}"></label>`;
const $=id=>document.getElementById(id);
const nextSeed=()=>1+Math.floor(Math.random()*2147483645);
export function createBranchQuickControls(api, section) {
 const panel=document.createElement('details');panel.id='branchQuickPanel';panel.open=true;
 panel.innerHTML=`<summary>当前枝条 · 常用参数</summary>
 <label>姿态作用范围<select id="quickScope"><option value="ALL">整根枝条</option><option value="SELECTED">选中分枝及子枝</option></select></label><p id="quickTarget" class="vine-note"></p>
 <div class="field-grid">${field('quickLength','长度倍率',1,.25,3,.05)}${field('quickRadius','粗细倍率',1,.25,Infinity,.05)}${field('quickWidth','展开倍率',1,.2,3,.05)}${field('quickDroop','下垂 / 负值上扬',0,-1,1,.05)}</div>
 <div class="field-grid">${field('quickTipRadius','末端粗细倍率',1,.5,Infinity,.1)}</div><p class="vine-note">两项粗细倍率均可直接输入更大的数值。末端倍率从每段枝条后半段平滑生效；1 保持原样，2–3 仅为起步建议。叶片尺寸不变。</p>
 <details><summary>高级姿态</summary><div class="field-grid">${field('quickBend','横向弧度',0,-1,1,.05)}${field('quickFlatness','厚度倍率',1,.1,1,.05)}</div></details>
 <p class="vine-note">以上倍率相对当前造型；连接位置固定，整根枝条的根部随粗细倍率变化。单独调整侧枝时保留接头粗细过渡。应用为独立造型层，可撤销。</p><div class="wb-row"><button id="quickPoseApply" type="button">应用姿态微调</button><button id="quickPoseReset" type="button">重置输入</button></div>
 <p class="vine-note">以下叶片参数作用于整根枝条，修改后更新，不改变枝型。</p>
 <div class="field-grid">${field('quickLeafSize','<span id="quickLeafSizeLabel">叶片 / 复叶大小（m）</span>',.08,.01,1.2,.01)}${field('quickLeafDensity','叶片密度（片/m）',30,0,400,1)}</div>
 <details><summary>高级叶片与花果</summary><div class="field-grid">${field('quickLeafStart','枝段根部留空',.12,0,.9,.01)}${field('quickLeafVariation','叶片大小变化',.2,0,.8,.01)}${field('quickLeafTwist','叶片扭转变化（°）',14,0,180,1)}${field('quickLeafDroop','叶片下垂',.12,0,1,.01)}${field('quickLeafOutward','叶片向外展开',.7,0,1,.01)}${field('quickTipCluster','向枝梢集中',0,0,1,.01)}</div>
 <div id="quickOrganFields"><div class="field-grid">${field('quickOrganAmount','花果密度',.65,0,1,.05)}${field('quickOrganScale','花果大小倍率',1,.1,4,.1)}</div></div></details>
 <details><summary>树种结构 · 重新生成</summary><p id="quickStructureNote" class="vine-note"></p><div class="field-grid">${field('quickBranchCount','一级侧枝数量',8,2,18,1)}${field('quickShootCount','每枝细梢数量',3,0,6,1)}${field('quickBranchAngle','分叉角（°）',45,10,85,1)}${field('quickNaturalVariation','自然变化',.5,0,1,.05)}${field('quickStructureSeed','枝型随机种子',12037,1,2147483646,1)}</div>
 <details><summary>分叉分布与粗细过渡</summary><div class="field-grid">${field('quickBranchStart','分叉起点',.15,0,.9,.01)}${field('quickBranchEnd','分叉终点',.92,.1,1,.01)}${field('quickTwigThickness','接头粗细倍率',1,.2,3,.05)}${field('quickWoodTip','枝梢/枝根半径比',.24,.05,.9,.01)}${field('quickAxisBend','主轴侧弯倍率',1,0,3,.05)}${field('quickAxisArch','主轴拱起倍率',1,0,3,.05)}</div><p class="vine-note">沿母枝从根到梢，控制侧枝长度和分叉角的变化倍率。</p><label>侧枝长度曲线</label><div class="field-grid">${[0,1,2,3,4].map(i=>field('quickLC'+i,i*25+'%',1,.05,3,.05)).join('')}</div><label>分叉角曲线</label><div class="field-grid">${[0,1,2,3,4].map(i=>field('quickAC'+i,i*25+'%',1,.2,2,.05)).join('')}</div></details>
 <button id="quickStructureRandom" type="button">换一个枝型种子</button><p class="vine-note">重新生成将替换枝干结构与局部枝形；保留叶花果素材和规则。手工单元保留为待重新挂接，避免错挂到新枝。可撤销。</p>
 <label class="wb-check"><input id="quickRebuildAck" type="checkbox">本次允许替换枝干结构</label><button id="quickStructureApply" type="button">按以上参数重新生成结构</button></details>
 <details><summary>独立随机控制</summary><p class="vine-note">种子不变即可复现；更换叶片或花果种子不会重新生成枝型。</p><div class="field-grid">${field('quickFoliageSeed','叶片种子',32044,1,2147483646,1)}${field('quickOrganSeed','花果种子',32044,1,2147483646,1)}</div><div class="wb-row"><button id="quickFoliageRandom" type="button">只换叶片分布</button><button id="quickOrganRandom" type="button">只换花果分布</button></div></details>`;
 section.querySelector('.wb-branch-only').before(panel);
 let running=false,structureIdentity='',structureSupported=false,editingLayerId='';
 const validate=ids=>ids.every(id=>{const e=$(id);if(e.value!==''&&e.checkValidity())return true;e.reportValidity();return false;});
 const action=fn=>async()=>{if(running||api.isBusy())return;running=true;try{await api.flush();await fn();}catch(e){api.toast(e.message,true);}finally{running=false;refresh();}};
 const poseFields={quickLength:'length',quickWidth:'width',quickRadius:'radius',quickTipRadius:'tipRadius',quickDroop:'droop',quickBend:'bend',quickFlatness:'flatness'};
 function resetPose(){editingLayerId='';$('quickScope').disabled=false;$('quickPoseApply').textContent='应用姿态微调';for(const [id,key] of Object.entries(poseFields))$(id).value=['droop','bend'].includes(key)?0:1;}
 document.addEventListener('branch-quick-edit',event=>{
  const layer=api.getAuthoring().sculpt_layers.find(l=>l.id===event.detail);if(!layer||!api.isBranch())return;
  editingLayerId=layer.id;panel.open=true;for(const [id,key] of Object.entries(poseFields))$(id).value=layer.operation[key]??(['droop','bend'].includes(key)?0:1);$('quickScope').disabled=true;$('quickPoseApply').textContent='更新该姿态层';panel.scrollIntoView({block:'start'});refresh();
  if ($('quickPoseOptions')) { $('quickPoseOptions').open=true; queueMicrotask(()=>$('quickPoseApply').scrollIntoView({block:'center'})); }
 });
 $('quickPoseReset').onclick=resetPose;
 $('quickPoseApply').onclick=action(()=>{
  if(!validate(Object.keys(poseFields)))return;
  const branches=api.getAsset().masterBranches;
  const editing=api.getAuthoring().sculpt_layers.find(l=>l.id===editingLayerId);
  const targets=editing?editing.operation.targets:$('quickScope').value==='SELECTED'?[...api.getSelections()]:branches.filter(b=>b.parentId<0).map(b=>b.stableId);
  if(!targets.length)throw Error('请先在视图中选择分枝');
  if(targets.some(id=>!branches.some(b=>b.stableId===id)))throw Error('部分作用分枝已不存在，请重新绑定造型目标');
  if(targets.some(id=>!api.isEditable(id)||branches.find(b=>b.stableId===id)?.symmetryGroup))throw Error('请先将关联或镜像分枝转为可编辑副本');
  const values=Object.fromEntries(Object.entries(poseFields).map(([id,key])=>[key,Number($(id).value)]));
  if(!editing&&Object.entries(values).every(([k,v])=>v===(['droop','bend'].includes(k)?0:1)))return;
  const operation=normalizeShapeOperation({type:'QUICK',targets,...values});
  api.transact('应用枝条姿态微调',a=>{if(editing)a.sculpt_layers.find(l=>l.id===editing.id).operation=operation;else a.sculpt_layers.push({id:'QUICK_'+crypto.randomUUID().replaceAll('-',''),name:'常用姿态微调',enabled:true,strength:1,branches:{},operation});},{bypassLayers:true});resetPose();
 });
 const leafFields={quickLeafSize:'leaf_scale',quickLeafDensity:'leaf_density',quickLeafStart:'leaf_zone_start',quickLeafVariation:'leaf_scale_variation',quickLeafTwist:'leaf_twist',quickLeafDroop:'leaf_droop',quickLeafOutward:'leaf_outward',quickTipCluster:'tip_cluster'};
 for(const [id,key] of Object.entries(leafFields))$(id).onchange=action(()=>{
  if(!validate([id]))return;
  const calibratedSize=id==='quickLeafSize'&&!!api.getAuthoring().plant_unit_assembly?.entries.length;
  const value=Number($(id).value)*(calibratedSize ? .1 : 1);
  api.updateSettings('调整枝条叶片',{[key]:value},key==='leaf_zone_start'?a=>{for(const l of a.attachment_layers)if(['LEAF','NEEDLE'].includes(l.type))l.start=Math.min(value,l.end);}:null);
 });
 for(const [id,key] of [['quickOrganAmount','amount'],['quickOrganScale','scale']])$(id).onchange=action(()=>{if(validate([id]))api.transact('调整花果参数',a=>a.tree_organs[key]=Number($(id).value),{bypassLayers:true});});
 for(const [input,button,key] of [['quickFoliageSeed','quickFoliageRandom','foliage'],['quickOrganSeed','quickOrganRandom','organs']]){
  const change=()=>{if(validate([input]))api.transact(key==='foliage'?'只更换叶片分布':'只更换花果分布',a=>a.seeds[key]=Number($(input).value),{bypassLayers:true});};
  $(input).onchange=action(change);$(button).onclick=action(()=>{$(input).value=nextSeed();change();});
 }
 $('quickStructureRandom').onclick=()=>{$('quickStructureSeed').value=nextSeed();};
 $('quickStructureApply').onclick=action(async()=>{
  if(!structureSupported)throw Error('当前工程不支持树种结构重建；仍可使用姿态和叶片参数');
  if(!$('quickRebuildAck').checked)throw Error('请勾选本次允许替换枝干结构；姿态微调无需替换结构');
  if(!validate(['quickBranchCount','quickShootCount','quickBranchAngle','quickNaturalVariation','quickStructureSeed','quickBranchStart','quickBranchEnd','quickTwigThickness','quickWoodTip','quickAxisBend','quickAxisArch',...[0,1,2,3,4].flatMap(i=>['quickLC'+i,'quickAC'+i])]))return;
  if(Number($('quickBranchStart').value)>=Number($('quickBranchEnd').value))throw Error('分叉起点必须小于终点');
  const doc=regenerateSpeciesStructure(api.capture(),{seed:Number($('quickStructureSeed').value),structure:{branch_count:Number($('quickBranchCount').value),shoot_count:Number($('quickShootCount').value),angle:Number($('quickBranchAngle').value),variation:Number($('quickNaturalVariation').value),branch_start:Number($('quickBranchStart').value),branch_end:Number($('quickBranchEnd').value),thickness:Number($('quickTwigThickness').value),tip_ratio:Number($('quickWoodTip').value),axis_bend:Number($('quickAxisBend').value),axis_arch:Number($('quickAxisArch').value),length_curve:[0,1,2,3,4].map(i=>Number($('quickLC'+i).value)),angle_curve:[0,1,2,3,4].map(i=>Number($('quickAC'+i).value))}});
  await api.applyPlantAssets(doc);$('quickRebuildAck').checked=false;structureIdentity='';api.toast('枝干结构已重新生成，叶片素材与贴图已保留；可撤销');
 });
 $('quickScope').onchange=refresh;
 function refresh(){
  panel.hidden=!api.isBranch();if(panel.hidden)return;
  const a=api.getAuthoring(),s=api.getSettings(),ids=[...api.getSelections()];
  if(editingLayerId&&!a.sculpt_layers.some(l=>l.id===editingLayerId))resetPose();
  $('quickTarget').textContent=$('quickScope').value==='SELECTED'?`当前选中 ${ids.length} 个分枝，包含其子枝`:'保留根部连接点，调整整个枝簇';
  if(editingLayerId)$('quickTarget').textContent='正在编辑已有姿态层；倍率相对此层之前的造型，重置输入可退出编辑';
  const calibrated=!!a.plant_unit_assembly?.entries.length;
  $('quickLeafSizeLabel').textContent=calibrated?'已校准叶片 · 整体尺寸倍率':'叶片 / 复叶大小（m）';
  $('quickLeafSize').min=calibrated ? .1 : .01;$('quickLeafSize').max=calibrated ? 12 : 1.2;
  for(const [id,key] of Object.entries(leafFields))if(document.activeElement!==$(id))$(id).value=id==='quickLeafSize'&&calibrated?Number((s[key]/.1).toFixed(4)):s[key];
  for(const [id,key] of [['quickOrganAmount','amount'],['quickOrganScale','scale']])if(document.activeElement!==$(id))$(id).value=a.tree_organs[key];
  $('quickOrganFields').hidden=!a.tree_organs.units.length;
  $('quickOrganRandom').disabled=!a.tree_organs.units.length;$('quickOrganSeed').disabled=!a.tree_organs.units.length;
  for(const [id,key] of [['quickFoliageSeed','foliage'],['quickOrganSeed','organs']])if(document.activeElement!==$(id))$(id).value=a.seeds[key];
  const species=a.recipe.tags.find(t=>TREE_SPECIES[t]),spec=TREE_SPECIES[species],style=a.recipe.tags.find(t=>['MAIN','SIDE','TIP','BALL','HEDGE'].includes(t));
  for(const id of ['quickLeafDensity','quickLeafStart','quickTipCluster']){
   $(id).disabled=!!spec?.plantSupport;
   $(id).title=spec?.plantSupport?'叶柄型植物每根叶柄承接一个单元；在“创建”中选择完整株丛、小株丛或幼株调整数量。':'';
  }
  structureSupported=!!spec&&spec.category!=='POTTED'&&['MAIN','SIDE','TIP'].includes(style)&&!a.plant_form;
  $('quickStructureApply').disabled=!structureSupported;$('quickStructureRandom').disabled=!structureSupported;
  $('quickStructureNote').textContent=structureSupported?`当前树种：${spec.name}。${spec.growth?.summary||''} 以下为下一次重新生成的参数。`:spec?.category==='POTTED'?`此植物使用专用株型。${spec.growth?.summary||''} 请在“创建”中选择株型。`:'此功能适用于树种主枝、侧枝与细梢；修剪造型请使用新建尺寸。';
  const identity=JSON.stringify([species,style,a.species_structure]);
  if(identity!==structureIdentity){structureIdentity=identity;$('quickRebuildAck').checked=false;const c=a.species_structure?.structure||{};
   for(const [id,key,fallback]of [['quickBranchStart','branch_start',style==='TIP'?.28:.15],['quickBranchEnd','branch_end',.92],['quickTwigThickness','thickness',1],['quickWoodTip','tip_ratio',spec?.growth?.woodTipRatio??.24],['quickAxisBend','axis_bend',1],['quickAxisArch','axis_arch',1]])$(id).value=c[key]??fallback;
   for(let i=0;i<5;i++){$('quickLC'+i).value=c.length_curve?.[i]??1;$('quickAC'+i).value=c.angle_curve?.[i]??1;}
   $('quickBranchCount').value=c.branch_count??(style==='TIP'?3:Math.min(18,(spec?.branchCount||6)+2));$('quickShootCount').value=c.shoot_count??Math.min(6,spec?.shoots||3);$('quickBranchAngle').value=c.angle??45;$('quickNaturalVariation').value=c.variation??.5;$('quickStructureSeed').value=a.species_structure?.seed??s.seed;
  }
 }
 return {refresh};
}
