const $=id=>document.getElementById(id);
export function createSurfaceWorkbenchLayout({section,vinePanel,state,cancel,getMode}){
 const model=document.createElement('details');model.id='surfaceModelSettings';model.innerHTML='<summary>承载模型 · 导入与单位</summary>';section.querySelector('h2').after(model);
 for(const el of [$( 'surfaceUnits').closest('.field-grid'),$('surfaceExample'),$('surfaceImport'),$('surfaceFile')])if(el)model.append(el);
 section.querySelector(':scope > p.vine-note')?.remove();
 const controls=$('surfaceControls'),head=document.createElement('div');head.innerHTML=`<label>当前编辑范围<select id="surfaceEditScope"><option value="WHOLE">整面攀爬 · 自动层</option><option value="ZONE">刷区域 · 当前区域</option><option value="ROUTE">画路线 · 所选路线</option></select></label><p id="surfaceScopeNote" class="vine-note"></p>`;controls.prepend(head);
 const zone=$('surfaceRegionPanel'),route=$('surfaceGuideName').closest('details'),ruler=$('growthRulerPanel');
 const routeWrap=document.createElement('div');route.before(routeWrap);routeWrap.append(route);route.querySelector('summary').after($('surfaceGuides'));route.append($('surfaceDeleteGuide'));
 const defaults=document.createElement('details');defaults.id='surfaceRouteDefaults';defaults.innerHTML='<summary>旧路线继承参数 · 高级</summary><p class="vine-note">仅影响仍继承共用配置的旧路线。新画参数统一在右侧“下一笔配方”中设置。</p><div class="field-grid"></div>';routeWrap.append(defaults);
 for(const id of ['surface_length','surface_spread','surface_density'])defaults.querySelector('.field-grid').append($(id).closest('label'));
 const common=document.createElement('details');common.id='surfaceCommonSettings';common.innerHTML='<summary>共用 · 模型与贴面设置</summary><p class="vine-note">承载显示、离面距离、禁生区作用于全部贴面生成层。</p><div class="field-grid"></div>';controls.append(common);
 for(const id of ['surface_offset','surface_opacity','surfaceDisplay','surfaceVisible','surfaceFlip'])common.querySelector('.field-grid').append($(id).closest('label'));
 common.append($('surfaceFit'),$('surfaceRemove'),$('surfaceClearMask'));
 const hang=$('surfaceAutoHang').closest('details');hang.id='surfaceHangGroup';hang.open=false;hang.querySelector('summary').textContent='共用 · 到边缘后垂落';
 const leaf=document.createElement('details');leaf.id='surfaceGlobalLeaves';leaf.open=true;leaf.innerHTML='<summary>共用 · 叶片尺寸与叶量</summary><p class="vine-note">所有藤蔓共用真实叶片素材；自动层、区域和路线都会受影响。素材选择仍在“当前植物的单元模型与贴图”。</p><div class="field-grid"></div>';
 for(const id of ['surfaceLeafSize','surfaceLeafDensity'])leaf.querySelector('.field-grid').append($(id).closest('label'));
 ruler.before(leaf);
 let scope='WHOLE',lastMesh=null;$('surfaceEditScope').onchange=()=>{cancel();scope=$('surfaceEditScope').value;refresh();};
 function refresh(){const s=state(),hasRuler=!!s?.growth_ruler;if(lastMesh!==s?.mesh.id){model.open=!s;lastMesh=s?.mesh.id;}ruler.hidden=!s||scope!=='WHOLE';zone.hidden=scope!=='ZONE';routeWrap.hidden=scope!=='ROUTE';leaf.hidden=!hasRuler;
  $('surfaceScopeNote').textContent={WHOLE:'只调整自动整面层；区域与手绘仍保留。全局叶片与共用设置单独标注。',ZONE:'只调整当前命名区域；可独立锁定、隔离。叶片尺寸与叶量仍继承全局，不提供虚假的局部覆盖。',ROUTE:'左侧选择绘制方式，右侧管理路线选区和下一笔配方。单选拖点，多选批量调参；叶片设置仍作用于所有藤蔓。'}[scope];
  const painting=['REGION','ERASE_REGION','BLOCK','UNBLOCK'].includes(getMode());$('surfaceBrush').closest('.field-grid').hidden=!painting;$('surfaceBrushStrength').closest('.field-grid').hidden=!painting;
  for(const b of section.querySelectorAll('[data-surface-tool]')){const t=b.dataset.surfaceTool;b.hidden=['REGION','ERASE_REGION'].includes(t)?scope!=='ZONE':['ROOT','DOWN','DRAW','EAVE','CONTINUE'].includes(t)?scope!=='ROUTE':false;}
  for(const id of ['vine_leaf_size','vine_foliage']){const input=vinePanel.querySelector('#'+id);if(input)input.closest('label').hidden=hasRuler;}
 }
 return {refresh,showTool(tool){if(['REGION','ERASE_REGION'].includes(tool))scope='ZONE';else if(['ROOT','DOWN','DRAW','EAVE','CONTINUE','EDIT'].includes(tool))scope='ROUTE';$('surfaceEditScope').value=scope;refresh();}};
}
