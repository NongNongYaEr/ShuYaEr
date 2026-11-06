(async()=>{
 const api=window.treeMaterialModule,lab=window.treeLab,studio=lab.surfaceStudio,library=studio.library;
 const wait=async fn=>{const end=Date.now()+120000;while(!fn()){if(Date.now()>end)throw Error('端面等待超时 '+window.__featuredPhase);await new Promise(r=>setTimeout(r,100));}};
 const settle=async()=>{await new Promise(r=>setTimeout(r,200));await wait(()=>!lab.busy&&!lab.surfaceWorkbench.state.pending);if(lab.surfaceWorkbench.state.error)throw Error(lab.surfaceWorkbench.state.error);};
 const {captureNativeMaterial}=await import('./native-material-capture.js');api.setStage('material');library.showBase({reveal:true});
 window.__featuredPhase='基础材质收藏与最近使用';const baseCard=document.querySelector('.asset[data-sculpt-id="b01-1"]');if(!baseCard)throw Error('缺少结构基材');await baseCard.onclick();await settle();
 const baseFilter=document.querySelector('[aria-label="基础材质收藏筛选"]'),baseFavorite=document.querySelector('[aria-label="收藏当前基础材质"]'),selectedMaterial=JSON.stringify(api.getSnapshot());baseFavorite.click();baseFilter.value='favorites';baseFilter.dispatchEvent(new Event('change'));if(baseCard.hidden)throw Error('基础材质收藏筛选失败');if(JSON.stringify(api.getSnapshot())!==selectedMaterial)throw Error('基础材质收藏修改了工程');baseFavorite.click();baseFilter.value='recent';baseFilter.dispatchEvent(new Event('change'));if(baseCard.hidden||document.querySelector('#assets .asset')!==baseCard)throw Error('基础材质最近使用未置顶');baseFilter.value='all';baseFilter.dispatchEvent(new Event('change'));library.showEffects({reveal:true});
 const select=document.querySelector('[aria-label="叠加效果系列"]');select.value='local';select.dispatchEvent(new Event('change'));
 if(document.querySelectorAll('.effect-library-card').length!==4)throw Error('局部端面分类应有4项');
 const before=api.getSnapshot(),entries=library.entries.filter(e=>e.manualPlacement),reports=[];window.__sculptSwatches={};
 const r=lab.renderer,m=r.model;r.mode=-1;r.showGuides=false;r.showFlowLines=false;r.lightMode='studio';r.focus=[(m.max[0]-m.min[0])/m.height/2,.23,(m.max[2]-m.min[2])/m.height/2];r.radius=.32;r.pan=[0,0,0];r.dirty=true;
 // Hidden WebView RAF may be throttled; draw the requested camera before picking.
 r.soloEffectId='probe-empty';const baseline=(await captureNativeMaterial(r)).url;r.soloEffectId=null;
 const difference=async(url,reference)=>{const load=async src=>{const im=new Image();im.src=src;await im.decode();return im;},[a,b]=await Promise.all([load(reference),load(url)]),c=document.createElement('canvas');c.width=a.width;c.height=a.height;const ctx=c.getContext('2d');ctx.drawImage(a,0,0);const first=ctx.getImageData(0,0,c.width,c.height).data;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(b,0,0);const second=ctx.getImageData(0,0,c.width,c.height).data;let count=0;for(let at=0;at<first.length;at+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(first[at+k]-second[at+k])))>3)count++;return count;};
 const rect=r.canvas.getBoundingClientRect(),hits=[];
 for(let y=.35;y<.7;y+=.04)for(let x=.3;x<.7;x+=.04){const hit=r.pick(rect.left+x*rect.width,rect.top+y*rect.height);if(hit)hits.push(hit);}if(hits.length<4)throw Error('缺少可点击表面');
 for(let i=0;i<entries.length;i++){
  const entry=entries[i];window.__featuredPhase='添加 '+entry.name;await library.add(entry.id,{});await settle();
  let effect=api.getSnapshot().surface.effects.find(e=>e.name===entry.name);if(effect.params.burlCount!==0||effect.manualDecal)throw Error('未点击时不应出现自动贴花');
  if(!document.querySelector('.surface-context').textContent.includes('点击树表面'))throw Error('未直接进入定位状态');
  r.soloEffectId=effect.id;const empty=(await captureNativeMaterial(r)).url;
  r.onPickUV(hits[Math.floor((.3+i*.12)*hits.length)]);await settle();effect=api.getSnapshot().surface.effects.find(e=>e.id===effect.id);
  if(!effect.manualDecal||effect.params.burlCount!==1||effect.manualDecal.maxBendDegrees!==35)throw Error('源面位置没有保存');
  for(const [label,value] of [['宽度 · m',.9],['高度 · m',.9],['旋转 · °',i*23]]){
   const input=[...document.querySelectorAll('#surfaceInspector label')].find(n=>n.firstChild?.textContent===label)?.querySelector('input');if(!input)throw Error('缺少'+label);input.value=String(value);input.dispatchEvent(new Event('change'));await settle();
  }
  r.soloEffectId=effect.id;const shot=await captureNativeMaterial(r),changedPixels=await difference(shot.url,empty);if(changedPixels<100)throw Error('端面没有实际可见像素 '+entry.name+' '+changedPixels);window.__sculptSwatches['endgrain-'+(61+i)]=shot.url;
  studio.materialPreviews.update(lab.project);await wait(()=>studio.materialPreviews.peek(effect.id)?.ready);
  window.__sculptSwatches['decal-'+(61+i)]=studio.materialPreviews.peek(effect.id).url;
  reports.push({style:61+i,face:effect.manualDecal.anchor.face,rotation:i*23,affectedFaces:r.localPatchCompilation.affectedFaces,nativePixels:shot.coveredPixels,changedPixels});
 }
 r.soloEffectId=null;r.dirty=true;const saved=api.getSnapshot();await api.flushDraft();await api.restoreProject(saved.id);await settle();
 if(api.getSnapshot().surface.effects.filter(e=>e.manualDecal).length!==4)throw Error('四端面恢复失败');
 window.__featuredPhase='4K GLB';const resolution=document.getElementById('resolution');resolution.value='4096';resolution.dispatchEvent(new Event('change'));await settle();const output=await api.exportFinalGLB();if(output.resolution!==4096)throw Error('未按4K导出');const after=api.getSnapshot();
 if(before.resources.source!==after.resources.source||before.resources.working!==after.resources.working)throw Error('端面修改了几何或UV');
 return{passed:true,backend:r.gl.nativeBackend,styles:reports,directPlacement:true,restored:true,baseFavoritesAndRecent:true,sourcePreserved:true,uvPreserved:true,output};
})()
