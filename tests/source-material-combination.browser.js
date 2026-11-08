(async()=>{
 const lab=window.treeLab,api=window.treeMaterialModule,library=lab.surfaceStudio.library;
 const original=api.getSnapshot();
 if(!original?.materialBase||original.surface.effects.length)throw Error('Need a fresh original-material project');
 const {layerIndex}=await import('/surface-layers.js');
 const {EFFECT_DRAG_MIME}=await import('/effect-library-ui.js');
 library.showEffects({reveal:true});
 const family=document.querySelector('[aria-label="叠加效果系列"]');
 family.value='combinations';family.dispatchEvent(new Event('change'));
 const card=id=>document.querySelector('[data-preset-id="builtin-sculpt-combo-'+id+'"]');
 const wait=async(predicate,label)=>{
  const until=performance.now()+90000;
  while(!predicate()){
   if(performance.now()>until)throw Error(label+' · '+document.getElementById('toast')?.textContent);
   await new Promise(resolve=>setTimeout(resolve,80));
  }
 };
 const entry=id=>library.entries.find(e=>e.recipeId===id.toUpperCase());
 const baseSignature=project=>JSON.stringify({
  materialBase:project.materialBase,source:project.resources.source,working:project.resources.working,
  bark:project.resources.bark,height:project.resources.height,roughness:project.resources.roughness,normal:project.resources.normal,
  settings:project.settings
 });
 const verify=async(id,count)=>{
  const preset=entry(id);
  await wait(()=>api.getSnapshot().surface.effects.length===count&&!lab.busy,'Combo did not apply: '+preset.name);
  const project=api.getSnapshot();
  if(baseSignature(project)!==baseSignature(original))throw Error('Combination changed the original base');
  const group=[...layerIndex(project.surface).values()].findLast(e=>e.node.kind==='group'&&e.node.name===preset.name)?.node;
  if(!group||group.children.filter(n=>n.kind==='effect').length!==preset.effectCount)throw Error('Combination lost a layer: '+preset.name);
  return {name:preset.name,layers:preset.effectCount,id:group.id};
 };
 const first=card('c01'),target=document.getElementById('surfaceOutline'),transfer=new DataTransfer();
 if(!first?.draggable||!target)throw Error('Combination drag target was missing');
 first.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer}));
 if(transfer.getData(EFFECT_DRAG_MIME)!==first.dataset.presetId)throw Error('Combination did not start dragging');
 target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));
 target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
 first.dispatchEvent(new DragEvent('dragend',{bubbles:true,cancelable:true,dataTransfer:transfer}));
 const drag=await verify('c01',4);
 first.click();
 const baseOption=document.querySelector('[aria-label="同时应用推荐基础材质"]'),recipeControls=baseOption.closest('.library-combination-controls');
 if(!baseOption.disabled||!baseOption.closest('label').hidden||!recipeControls.textContent.includes('保留原材质，只添加效果'))
  throw Error('Locked base was not explained in combination controls');

 card('c02').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}));
 const doubleClick=await verify('c02',9);
 card('c03').click();
 const add=[...document.querySelectorAll('.library-selection-info button')].find(b=>b.textContent==='添加所选');
 if(!add||add.disabled)throw Error('Add selected combination was unavailable');
 add.click();
 const button=await verify('c03',12);

 const {EFFECT_LIBRARY_BUILTINS}=await import('/effect-library.js');
 const replacement=EFFECT_LIBRARY_BUILTINS.find(e=>e.recipeId==='C04');
 await lab.applyMaterialCombination(replacement,{includeBase:true,mode:'replace',targetId:button.id});
 const direct=await verify('c04',12);
 await wait(()=>!lab.busy&&!lab.surfaceWorkbench.state.pending&&!lab.processingFeedback?.background?.pending&&!lab.surfaceStudio.materialPreviews.state.pending,'Surface preparation did not settle');
 if(lab.surfaceWorkbench.state.error)throw Error(lab.surfaceWorkbench.state.error);
 await lab.renderer.gl.whenIdle();
 await api.flushDraft();await api.restoreProject(original.id);
 const restored=api.getSnapshot();
 if(baseSignature(restored)!==baseSignature(original)||restored.surface.effects.length!==12)
  throw Error('Reopening lost the overlay combination or the original base');
 return {passed:true,basePreserved:true,drag,doubleClick,button,direct,reopenedLayers:restored.surface.effects.length};
})()
