import { createDefaultSurfaceRuler } from './surface-defaults.js';
import { upgradeSurfaceRecipe,applySurfacePreset,SURFACE_PRESETS,resetSurfaceGroup } from './surface-recipe.js';
const $=id=>document.getElementById(id);
// Move existing controls, preserving their bindings and single source of truth.
export function createSurfaceRulerLayout({panel,api,state,transact}){
 const host=$('growthRulerFields');
 panel.querySelector('summary').textContent='整面攀爬配置';
 const intro=document.createElement('div');intro.innerHTML=`<p id="surfaceRecipeStatus" class="vine-note"></p><button id="surfaceRecipeUpgrade">切换独立参数规则（可撤销）</button><p id="surfaceRecipeWarning" class="vine-note">旧工程保持原效果。切换会改变自动叶层分布，建议先另存工程；手绘与区域配置保留。</p>`;host.prepend(intro);
 const make=(id,title,open=false)=>{const d=document.createElement('details');d.id=id;d.open=open;d.innerHTML=`<summary>${title}</summary><div class="field-grid"></div>`;host.append(d);return d;};
 const range=make('surfaceRangeGroup','1 · 生长范围'),stems=make('surfaceStemGroup','2 · 藤干形态'),leaf=$('surfaceLeafPanel'),outline=make('surfaceOutlineGroup','4 · 整体轮廓'),performance=make('surfacePerformanceGroup','5 · 性能与检查');
 leaf.querySelector('summary').textContent='3 · 叶片铺设';leaf.open=false;stems.after(leaf);
 const move=(group,ids)=>ids.forEach(id=>group.querySelector('.field-grid').append($(id).closest('label')));
 move(range,['growthRulerBottom','growthRulerTop']);move(stems,['growthRulerCoverage','growthStemWander','growthStemSpan']);move(outline,['growthRulerRagged','growthFrontierSpan','growthRulerDepth','growthRulerClump']);move(performance,['growthRulerBudget','growthRulerLeaves']);
 const name=(id,text)=>{$(id).closest('label').firstChild.textContent=text;};
 name('growthRulerCoverage','旧版综合密度（非覆盖率）');name('growthRulerDepth','叶层厚薄起伏（m）');name('growthRulerClump','叶簇范围（m）');name('growthRulerRagged','顶部高低差（m）');name('growthFrontierSpan','顶部起伏宽度（m）');
 stems.querySelector('.field-grid').insertAdjacentHTML('afterbegin',`<label>主藤疏密（0–1）<input id="surfaceMainDensity" type="number" min="0" max="1" step=".05"></label><label>侧枝繁茂（0–1）<input id="surfaceSideDensity" type="number" min="0" max="1" step=".05"></label>`);
 const mode=document.createElement('label');mode.innerHTML=`叶层分布<select id="surfaceDistribution"><option value="UNIFORM">均匀分布</option><option value="CLUMP">成簇分布</option></select>`;leaf.querySelector('summary').after(mode);
 const curve=document.createElement('details');curve.innerHTML='<summary>高级 · 沿高度的叶量比例</summary>';curve.append($('growthHeightDensity'));leaf.append(curve);
 const presets=document.createElement('details');presets.innerHTML=`<summary>效果预设 · 查看将修改的参数</summary><label>参数预设<select id="surfacePreset">${Object.entries(SURFACE_PRESETS).map(([key,p])=>`<option value="${key}">${p.name}</option>`).join('')}</select></label><p id="surfacePresetNote" class="vine-note"></p><button id="surfacePresetApply">使用此预设（可撤销）</button>`;intro.after(presets);
 $('surfacePreset').onchange=()=>{$('surfacePresetNote').textContent=SURFACE_PRESETS[$('surfacePreset').value].note;};$('surfacePreset').onchange();
 $('surfacePresetApply').onclick=()=>transact('使用藤蔓参数预设',s=>applySurfacePreset(s,$('surfacePreset').value));
 $('surfaceRecipeUpgrade').onclick=()=>transact('切换独立藤蔓参数规则',s=>{s.growth_ruler=upgradeSurfaceRecipe(s.growth_ruler);});
 for(const[id,key]of [['surfaceMainDensity','main_density'],['surfaceSideDensity','side_density'],['surfaceDistribution','distribution']])$(id).onchange=()=>{const input=$(id);if(input.value===''||!input.checkValidity())return refresh();transact('调整自动整面层',s=>{s.growth_ruler={...s.growth_ruler,[key]:input.tagName==='SELECT'?input.value:+input.value};});};
 const actions=(group,key,seed,text)=>{const row=document.createElement('div');row.className='wb-row';row.innerHTML=`<button id="surfaceReset_${key}">恢复本组默认</button><button id="surfaceReroll_${key}">${text}</button>`;group.append(row);row.children[0].onclick=()=>transact('恢复藤蔓本组默认',s=>{s.growth_ruler=resetSurfaceGroup(s.growth_ruler,key);});row.children[1].onclick=()=>transact(text,s=>{s.growth_ruler[seed]=s.growth_ruler[seed]%2147482899+101;});};
 actions(stems,'stems','stem_seed','换藤形');actions(leaf,'leaves','leaf_seed','换叶片排列');actions(outline,'outline','gap_seed','换留空分布');
 const defaults=createDefaultSurfaceRuler();for(const[id,key]of Object.entries({surfaceMainDensity:'main_density',surfaceSideDensity:'side_density',growthRulerBottom:'bottom',growthRulerTop:'top',growthRulerCoverage:'coverage',growthStemWander:'stem_wander',growthStemSpan:'stem_span',growthRulerRagged:'canopy_ragged',growthFrontierSpan:'frontier_span',growthRulerDepth:'canopy_depth',growthRulerClump:'canopy_clump',growthRulerBudget:'budget',growthRulerLeaves:'leaf_budget'}))$(id).defaultValue=defaults[key];
 const notes=document.createElement('p');notes.className='vine-note';notes.textContent='仅自动整面层。主藤疏密控制起点间隔；侧枝繁茂控制分叉间隔。0 可关闭相应藤干；叶量变化不改变藤形。';stems.append(notes);
 const outlineNote=document.createElement('p');outlineNote.className='vine-note';outlineNote.textContent='顶部高低差与起伏宽度共同控制藤干和叶层的上沿；0 为齐平。叶簇范围与厚薄控制小范围起伏。';outline.append(outlineNote);
 performance.append($('growthRulerStatus'));const diagnostics=document.createElement('div');diagnostics.id='surfaceDiagnostics';performance.append(diagnostics);
 const status=document.createElement('p');status.id='surfaceRecipeSummary';status.className='vine-note';intro.after(status);
 // The former wall of mixed instructions is replaced by per-group explanations.
 for(const p of [...host.children])if(p.matches('p.vine-note')&&!p.id)p.remove();
 function refresh(){const r=state()?.growth_ruler;if(!r)return;const modern=r.recipe_version===2;
  $('surfaceRecipeStatus').textContent=modern?'独立参数规则 · 自动整面层':'旧版生成规则 · 保留当前工程效果';$('surfaceRecipeUpgrade').hidden=modern;$('surfaceRecipeWarning').hidden=modern;
  $('growthRulerCoverage').closest('label').hidden=modern;
  for(const[id,key]of [['surfaceMainDensity','main_density'],['surfaceSideDensity','side_density'],['surfaceDistribution','distribution']]){const el=$(id);el.closest('label').hidden=!modern;if(document.activeElement!==el)el.value=r[key];}
  presets.hidden=!modern;for(const id of ['stems','leaves','outline']){$('surfaceReset_'+id).disabled=!modern;$('surfaceReroll_'+id).disabled=!modern;}
  const rep=api.getAsset()?.report.surface_canopy,st=rep?.stages;
  const limits=[];if(st?.geometry>st?.support)limits.push('部分位置缺少可挂接藤干');if(st?.edits>st?.spacing)limits.push('最小间距筛除了叶片');if(rep?.budgetRemoved)limits.push('达到叶片上限');if(rep?.samplingLimited)limits.push('预算降低了候选采样量');
  $('surfaceRecipeSummary').textContent=`自动叶层 ${rep?.count||0} 片 · 叶量 ${api.getAuthoring().vine?.foliage??0}/100 · 顶部叶量 ${Math.round(r.height_density[4]*100)}%${limits.length?' · '+limits.join('；'):''}`;
  const stages=[['candidates','进入采样'],['range','范围与禁生区后'],['distribution','叶量与分布后'],['geometry','转角权重与表面安全后'],['support','真实藤干挂接后'],['edits','挂接层与手工约束后'],['spacing','最小间距后'],['output','预算后最终片数']];
  diagnostics.replaceChildren();const note=document.createElement('p');note.className='vine-note';note.textContent='以下为顺序筛选数量，只统计自动叶层候选；不等于表面遮挡百分比。间距较大可降低叶量；缺少支撑时应调整藤干。';diagnostics.append(note);
  if(st){const table=document.createElement('table');table.style.cssText='width:100%;font-size:12px';for(const[key,label]of stages){const tr=table.insertRow();tr.insertCell().textContent=label;tr.insertCell().textContent=st[key].toLocaleString();}diagnostics.append(table);}
  const curveNote=$('growthHeightDensity').querySelector('p');curveNote.textContent=modern?'横轴：起长 → 本处顶部轮廓。纵轴为叶量比例，1 = 100%，0.2 = 20%；不改变藤干、叶片大小或挂接距离。全 1 表示不额外衰减，不代表遮满表面。':'旧版曲线同时改变叶簇宽度与数量；切换独立参数规则后，曲线仅影响叶量。';
 }
 return {refresh};
}
