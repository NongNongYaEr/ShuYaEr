import { BRANCH_USE_PRESETS, generateBranchCandidates } from './branch-variant-data.js';
import { speciesStructureContext } from './branch-species-controls.js';
import { TREE_SPECIES } from './tree-species-library.js';
const $=id=>document.getElementById(id);
const stage=value=>document.dispatchEvent(new CustomEvent('branch-workflow-show',{detail:value}));
export function createBranchVariantWorkspace(api, section) {
 const panel=document.createElement('details');panel.id='branchVariantPanel';panel.open=true;
 panel.innerHTML='<summary>枝条套装 · 用途与变体</summary><p class="vine-note">基于当前树种，一次生成不同轮廓；预览与筛选不改变当前草稿。</p><p id="branchVariantAvailability" class="vine-note"></p><button id="branchVariantOpen" type="button">生成 / 查看候选枝条</button>';
 section.append(panel);
 const dialog=document.createElement('dialog');dialog.id='branchVariantDialog';
 dialog.innerHTML=`<header class="bv-header"><div><h2>枝条套装</h2><p>选择用途 → 生成候选 → 勾选满意的 → 导出高模 GLB</p></div><button id="bvClose" type="button" aria-label="关闭候选窗口">关闭</button></header>
 <div class="bv-config"><label>用途<select id="bvPreset">${Object.entries(BRANCH_USE_PRESETS).map(([k,v])=>`<option value="${k}" ${k==='HORIZONTAL'?'selected':''}>${v.label}</option>`).join('')}</select></label><label>候选数量<select id="bvCount"><option>6</option><option>8</option><option>12</option></select></label><label>变化幅度<input id="bvVariation" type="number" value=".5" min="0" max="1" step=".1"></label><label>套装种子<input id="bvSeed" type="number" value="12037" min="1" max="2147483646" step="1"></label><button id="bvRandomSeed" type="button">换一组种子</button><button id="bvGenerate" type="button" class="accent">生成候选</button></div>
 <div class="bv-options"><label><input id="bvVaryLeaves" type="checkbox">同时变化叶片分布</label><label><input id="bvVaryOrgans" type="checkbox">同时变化花果分布</label><span id="bvPresetDescription"></span></div>
 <div class="bv-selection"><button id="bvSelectAll" type="button">全选可导出项</button><button id="bvSelectNone" type="button">清空选择</button><span id="bvSelectionCount">尚未生成候选</span><button id="bvCancelJob" type="button" hidden>停止后续任务</button></div>
 <p id="bvProgress" role="status" aria-live="polite">每个候选独立保存枝型与素材，修改当前草稿不会改变已生成候选。</p>
 <main id="bvGrid" class="bv-grid"><p class="bv-empty">选择用途后点击“生成候选”，在这里对比枝条轮廓。</p></main>
 <footer class="bv-footer"><div><p id="bvDestination"></p><p>每项一个 GLB，内嵌贴图；不附带其他 LOD 或 JSON。同名文件会覆盖。</p><p>候选暂存于本次会话。载入候选会替换草稿，可撤销；需要长期保留请保存工程。</p></div><button id="bvChooseOutput" type="button">设置输出位置</button><button id="bvExport" type="button" class="accent" disabled>导出所选 GLB</button></footer>`;
 document.body.append(dialog);
 let candidates=[],running=false,cancelled=false,supported=false;
 function busy(value){running=value;for(const id of ['bvGenerate','bvPreset','bvCount','bvVariation','bvSeed','bvRandomSeed','bvVaryLeaves','bvVaryOrgans','bvClose','bvChooseOutput'])$(id).disabled=value;$('bvCancelJob').hidden=!value;renderSelection();}
 function renderSelection(){const count=candidates.filter(c=>c.selected&&c.preview?.report.ok).length;$('bvSelectionCount').textContent=candidates.length?`已选 ${count} / ${candidates.length} 项`:'尚未生成候选';$('bvExport').disabled=running||!count;$('bvExport').textContent=`导出所选 GLB${count?'（'+count+'）':''}`;for(const e of $('bvGrid').querySelectorAll('input,button'))e.disabled=running||(e.type==='checkbox'&&e.dataset.valid==='false');}
 function card(candidate){
  const item=document.createElement('article');item.className='bv-card';item.dataset.candidate=candidate.id;
  const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=!!candidate.selected;check.dataset.valid=String(!!candidate.preview?.report.ok);check.disabled=!candidate.preview?.report.ok;check.setAttribute('aria-label','选择 '+candidate.name);check.onchange=()=>{candidate.selected=check.checked;renderSelection();};
  const title=document.createElement('strong');title.textContent=candidate.name;label.append(check,title);item.append(label);
  if(candidate.preview){const img=document.createElement('img');img.src=candidate.preview.image;img.alt=candidate.name+'实际模型预览';item.append(img);const detail=document.createElement('p');detail.textContent=`${candidate.preview.report.triangles.toLocaleString()} 三角面 · ${candidate.preview.report.leaves} 叶单元`;item.append(detail);}
  const status=document.createElement('p');status.className='bv-card-status';status.textContent=candidate.error||(!candidate.document.authoring.leaf_material.color?'待单元 · 程序结构预览':'真实素材 · 共用图集');item.append(status);candidate.statusElement=status;
  if(candidate.preview?.report.warnings.length){const issues=document.createElement('p');issues.textContent=candidate.preview.report.warnings.join('；');issues.className='bv-warning';item.append(issues);}
  const load=document.createElement('button');load.type='button';load.textContent='载入调整';load.disabled=running;load.onclick=async()=>{if(running)return;busy(true);try{await api.flush();await api.applyPlantAssets(structuredClone(candidate.document));dialog.close();stage('ADJUST');api.toast('已载入候选，原草稿可撤销恢复');}catch(e){api.toast(e.message,true);}finally{busy(false);}};item.append(load);return item;
 }
 async function generate(){if(running)return;cancelled=false;busy(true);try{
  for(const id of ['bvVariation','bvSeed'])if(!$(id).value||!$(id).checkValidity()){ $(id).reportValidity();throw Error('请填写有效的变化幅度与种子'); }
  await api.flush();const doc=api.capture();const next=generateBranchCandidates(doc,{count:Number($('bvCount').value),preset:$('bvPreset').value,seed:Number($('bvSeed').value),variation:Number($('bvVariation').value),varyFoliage:$('bvVaryLeaves').checked,varyOrgans:$('bvVaryOrgans').checked});
  candidates=[];$('bvGrid').replaceChildren();
  for(let i=0;i<next.length;i++){if(cancelled)break;$('bvProgress').textContent=`正在生成预览 ${i+1} / ${next.length}…`;const candidate=next[i];try{candidate.preview=await api.thumbnailDocument(candidate.document);candidate.selected=candidate.preview.report.ok;}catch(e){candidate.error='预览失败：'+e.message;candidate.selected=false;}candidates.push(candidate);$('bvGrid').append(card(candidate));renderSelection();await new Promise(resolve=>setTimeout(resolve,0));}
  $('bvProgress').textContent=`${cancelled?'已停止，保留已完成项':'生成完成'} · ${candidates.length} 个候选。当前草稿未被替换。`;
 }catch(e){$('bvProgress').textContent=e.message;api.toast(e.message,true);}finally{busy(false);}}
 $('bvGenerate').onclick=generate;$('bvCancelJob').onclick=()=>{cancelled=true;$('bvProgress').textContent='完成当前项后停止…';};
 $('bvClose').onclick=()=>dialog.close();dialog.oncancel=e=>{if(running){e.preventDefault();cancelled=true;$('bvProgress').textContent='完成当前项后停止…';}};
 $('bvRandomSeed').onclick=()=>{$('bvSeed').value=1+Math.floor(Math.random()*2147483645);};
 $('bvPreset').onchange=()=>{$('bvPresetDescription').textContent=BRANCH_USE_PRESETS[$('bvPreset').value].description;};$('bvPreset').onchange();
 for(const [id,value] of [['bvSelectAll',true],['bvSelectNone',false]])$(id).onclick=()=>{if(running)return;for(const c of candidates)c.selected=value&&!!c.preview?.report.ok;$('bvGrid').replaceChildren(...candidates.map(card));renderSelection();};
 $('bvChooseOutput').onclick=()=>{dialog.close();stage('EXPORT');api.toast('设置输出路径后，可回到创建继续导出已选候选');};
 $('bvExport').onclick=async()=>{if(running)return;const chosen=candidates.filter(c=>c.selected&&c.preview?.report.ok);if(!chosen.length)return;busy(true);cancelled=false;try{
  const result=await api.exportCandidateDocuments(chosen,(index,total,candidate)=>{$('bvProgress').textContent=`正在导出 ${index+1}/${total} · ${candidate.name}`;},()=>cancelled);
  for(const entry of result){const c=candidates.find(c=>c.id===entry.id);if(c)c.statusElement.textContent=entry.error?'导出失败：'+entry.error:'已导出：'+entry.path;}
  const good=result.filter(x=>!x.error).length,bad=result.length-good;$('bvProgress').textContent=`已导出 ${good} 项${bad?'，失败 '+bad+' 项':''}${cancelled?'；已停止后续导出':''}。`;
 }catch(e){$('bvProgress').textContent='导出失败：'+e.message;}finally{busy(false);}};
 function open(){refresh();stage('CREATE');if(!supported&&!candidates.length){api.toast('请先新建或载入一个树种枝条，再生成候选',true);return;}if(!dialog.open)dialog.showModal();$('bvDestination').textContent='输出目录：'+api.getOutputDirectory();$('bvGenerate').disabled=!supported||running;}
 $('branchVariantOpen').onclick=open;
 function refresh(){panel.hidden=!api.isBranch();try{const c=speciesStructureContext({settings:api.getSettings(),authoring:api.getAuthoring()});supported=true;$('branchVariantAvailability').textContent='当前可生成：'+(TREE_SPECIES[c.species]?.name||c.species)+' · '+(c.style==='TIP'?'细梢':'枝条');}catch{supported=false;$('branchVariantAvailability').textContent='先在上方创建树种主枝、侧枝或细梢。修剪球、绿篱、盆栽使用各自造型参数。';}if(!running)$('bvGenerate').disabled=!supported;}
 return {refresh,open,get busy(){return running;}};
}
