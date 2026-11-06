const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const openOwnedNative=require('./owned-native-browser.cjs');

async function verify(page,fixture){
 const panel=page.locator('#trunkPreparationDialog');
 const ui=selector=>panel.locator(selector);
 const state=()=>page.evaluate(()=>{
  const p=window.__branchForge.trunkPreparation;
  return {committed:p.model.guides,working:p.workingModel.guides,selection:p.selection,source:p.model.source.sha256};
 });
 const checkMarkers=async()=>{
  const mismatches=await page.evaluate(()=>{
   const p=window.__branchForge.trunkPreparation,selected=new Set(p.selection.map(({guide,index})=>guide+':'+index));
   return [...p.panel.querySelectorAll('.trunk-guide-controls [data-guide-point]')].flatMap(button=>{
    const key=button.dataset.guideId+':'+button.dataset.guidePoint,expected=selected.has(key);
    return button.classList.contains('selected')!==expected||button.getAttribute('aria-pressed')!==String(expected)?[key]:[];
   });
  });
  assert.deepEqual(mismatches,[],'projected markers must reflect the selection on every view');
 };
 await page.evaluate(()=>window.__branchForge.trunkPreparation.open());
 await ui('.trunk-start-panel input[value=rig]').check();
 await ui('[data-file]').setInputFiles(fixture);
 await page.waitForFunction(()=>window.__branchForge.trunkPreparation.model&&document.querySelector('#trunkPreparationDialog').dataset.busy==='false');
 const initial=await state();
 await ui('[data-next]').click();
 await page.waitForFunction(()=>window.__branchForge.trunkPreparation.autoState==='preview');
 const candidate=await state();
 assert.equal(await ui('.delete-guide').count(),0,'an ordinary candidate must never use the delete highlight');
 assert.deepEqual(candidate.committed,initial.committed);
 assert(candidate.working.length>1);
 const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
 await page.setViewportSize({width:1080,height:820});
 await ui('[data-auto-apply]').click({trial:true});
 await page.setViewportSize(viewport);
 await ui('[data-weight-open]').click();
 assert(await ui('[data-weight-scan]').isVisible(),'weight tools remain outside the hidden manual guide controls');
 await ui('[data-weight-scan]').click();
 await page.waitForFunction(()=>document.querySelector('#trunkPreparationDialog [data-weight-report]').textContent.startsWith('发现 '));
 assert(await ui('[data-weight-feedback]').isVisible());
 await ui('[data-weight-open]').click();
 assert.deepEqual((await state()).working,candidate.working);
 await ui('[data-repair-compare]').click();
 assert.equal(await ui('[data-repair-compare]').getAttribute('aria-pressed'),'true');
 await ui('[data-repair-baseline]').selectOption('original');
 await ui('[data-repair-compare]').click();
 const through=ui('[data-guide-through]'),canvas=ui('[data-host] canvas');
 assert(await through.isChecked(),'bone editing must default to through selection');
 const main=candidate.working[0].id;
 const point=i=>ui('[data-guide-id="'+main+'"][data-guide-point="'+i+'"]');
 for(const direction of ['front','side','top']){
  await ui('[data-axis-view]').selectOption(direction);
  await checkMarkers();
 }
 await ui('[data-axis-view]').selectOption('front');
 const center=async locator=>{
  const r=await locator.boundingBox();
  return [r.x+r.width/2,r.y+r.height/2];
 };
 const bounds=await canvas.boundingBox();
 const boxAll=async()=>{
  await canvas.focus();
  await page.keyboard.press('b');
  await page.mouse.move(bounds.x+2,bounds.y+2);
  await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width-2,bounds.y+bounds.height-2,{steps:8});
  await page.mouse.up();
  return (await state()).selection;
 };
 const throughSelection=await boxAll();
 await through.uncheck();
 const depthSelection=await boxAll();
 const key=p=>p.guide+':'+p.index,visibleKeys=new Set(depthSelection.map(key));
 assert(throughSelection.length>depthSelection.length,'a box must include points hidden by the mesh at the same camera angle');
 const handles=await ui('[data-guide-point]:not([hidden])').evaluateAll(buttons=>buttons.map(button=>{
  const r=button.getBoundingClientRect();
  return {guide:button.dataset.guideId,index:Number(button.dataset.guidePoint),x:r.x+r.width/2,y:r.y+r.height/2};
 }));
 const selectedKeys=new Set(throughSelection.map(key));
 const hiddenPoint=handles.find(p=>selectedKeys.has(key(p))&&!visibleKeys.has(key(p))&&handles.every(q=>p===q||Math.hypot(p.x-q.x,p.y-q.y)>3));
 assert(hiddenPoint,'the fixture must expose a separately clickable occluded point');
 await through.check();
 await page.mouse.click(hiddenPoint.x,hiddenPoint.y);
 assert.deepEqual((await state()).selection.map(key),[key(hiddenPoint)]);
 await page.keyboard.press('b');
 await page.mouse.click(...await center(point(1)));
 assert.deepEqual((await state()).selection.map(key),[main+':1'],'a click in box mode still hits the point under the mouse');
 await point(1).click();
 await point(2).click({modifiers:['Shift']});
 assert.deepEqual((await state()).selection.map(p=>p.index),[1,2]);
 await point(2).click({modifiers:['Control']});
 assert.deepEqual((await state()).selection.map(p=>p.index),[1]);
 await checkMarkers();
 // Start a modifier box on a handle. This gesture must never move the handle.
 const a=await point(2).boundingBox();
 await page.keyboard.down('Shift');
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
 await page.mouse.down();
 await page.mouse.move(a.x+a.width/2+18,a.y+a.height/2+18,{steps:6});
 await page.mouse.up();
 await page.keyboard.up('Shift');
 assert((await state()).selection.some(p=>p.guide===main&&p.index===2));
 assert.deepEqual((await state()).working,candidate.working);
 await checkMarkers();

 const project=async(guide,index,t)=>page.evaluate(async({guide,index,t})=>{
  const {Vector3}=await import('/vendor/three.module.min.js');
  const p=window.__branchForge.trunkPreparation,rect=p.panel.querySelector('[data-host]').getBoundingClientRect();
  const points=p.workingModel.guides.find(g=>g.id===guide).points;
  const pos=new Vector3(...points[index]).lerp(new Vector3(...points[index+1]),t).project(p.view.camera);
  return [rect.left+(pos.x+1)*rect.width/2,rect.top+(1-pos.y)*rect.height/2];
 },{guide,index,t});
 await ui('[data-guide-target="segment"]').click();
 await page.mouse.click(...await project(main,1,.5));
 assert.equal(await ui('[data-edit-target]').textContent(),'已选 1 段');
 await ui('[data-subdivide-count]').fill('2');
 await ui('[data-subdivide]').click();
 const subdivided=await state();
 assert.equal(subdivided.working[0].points.length,candidate.working[0].points.length+2);
 assert.equal(subdivided.selection.length,2);
 assert.deepEqual(subdivided.working.slice(1),candidate.working.slice(1));
 await ui('[data-host] canvas').focus();
 await page.keyboard.press('g');
 await page.keyboard.press('x');
 await page.keyboard.type('0.012');
 await page.keyboard.press('Enter');
 const moved=await state();
 assert.notDeepEqual(moved.working,subdivided.working);
 assert.deepEqual(moved.working.slice(1),subdivided.working.slice(1));
 await page.keyboard.press('Delete');
 assert.equal((await state()).working[0].points.length,candidate.working[0].points.length);
 await ui('[data-undo]').click();
 assert.deepEqual((await state()).working,moved.working);
 assert.equal(await ui('.delete-guide').count(),0);

 const ids=new Set(moved.working.map(g=>g.parent));
 const leaf=moved.working.find(g=>g.parent&&!ids.has(g.id));
 await ui('[data-guide-target="branch"]').click();
 const leafPointer=await project(leaf.id,leaf.points.length-2,.8);
 await page.mouse.click(...leafPointer);
 assert.equal(await ui('[data-edit-target]').textContent(),'已选 1 枝');
 assert(await ui('[data-guides] button.selected').getByText('控制枝 '+leaf.id,{exact:true}).isVisible());
 await ui('[data-host] canvas').focus();
 await page.keyboard.press('Delete');
 const popup=ui('[data-delete-review]');
 const assertPopupNear=async([x,y])=>{
  const r=await popup.boundingBox(),dialog=await panel.boundingBox();
  assert(r,'delete confirmation is visible');
  assert(Math.max(r.x-x,x-r.x-r.width,0)<=12&&Math.max(r.y-y,y-r.y-r.height,0)<=12,'confirmation opens beside the pointer');
  assert(r.x>=dialog.x&&r.y>=dialog.y&&r.x+r.width<=dialog.x+dialog.width&&r.y+r.height<=dialog.y+dialog.height,'confirmation fits inside the workbench');
 };
 await assertPopupNear(leafPointer);
 assert.equal(await ui('.delete-guide').count(),1);
 assert.deepEqual((await state()).working,moved.working);
 await page.keyboard.press('Escape');
 assert(await popup.isHidden());
 assert.equal(await ui('.delete-guide').count(),0);
 assert.deepEqual((await state()).working,moved.working);
 const panelBounds=await panel.boundingBox(),corner=[panelBounds.x+panelBounds.width-4,panelBounds.y+panelBounds.height-4];
 await page.mouse.move(...corner);
 await page.keyboard.press('Delete');
 await assertPopupNear(corner);
 await ui('[data-delete-family]').click();
 assert.equal((await state()).working.length,moved.working.length-1);
 await ui('[data-undo]').click();
 assert.deepEqual((await state()).working,moved.working);
 await ui('[data-redo]').click();
 const revised=await state();
 assert.equal(revised.working.length,moved.working.length-1);
 assert.deepEqual(revised.committed,initial.committed);
 // A two-point side branch must be deletable without switching tools.
 const parentIds=new Set(revised.working.map(g=>g.parent));
 const short=revised.working.filter(g=>g.parent&&!parentIds.has(g.id)).sort((a,b)=>a.points.length-b.points.length)[0];
 assert(short);
 await ui('[data-guide-target="point"]').click();
 await ui('[data-guide-select]').selectOption(short.id);
 for(let count=short.points.length;count>=2;count--){
  await ui('[data-point-strip] button').last().click();
  if(count===2){
   const deletePoint=ui('[data-remove-point]');
   await deletePoint.scrollIntoViewIfNeeded();
   const pointer=await center(deletePoint);
   await deletePoint.click();
   await assertPopupNear(pointer);
  }else{
   await canvas.focus();
   await page.keyboard.press('Delete');
  }
  const current=(await state()).working.find(g=>g.id===short.id);
  assert.equal(current.points.length,Math.max(2,count-1));
 }
 assert(await ui('[data-delete-review]').isVisible());
 assert.match(await ui('[data-delete-count]').textContent(),/剩余点数不足/);
 await ui('[data-delete-family]').click();
 assert(!(await state()).working.some(g=>g.id===short.id));
 await ui('[data-undo]').click();
 assert.equal((await state()).working.find(g=>g.id===short.id).points.length,2);
 for(let i=2;i<short.points.length;i++)await ui('[data-undo]').click();
 assert.deepEqual((await state()).working,revised.working);
 const persisted=()=>page.evaluate(async()=>{
  const p=window.__branchForge.trunkPreparation;
  await p.flush();
  return (await (await fetch('/api/trunk-preparation-draft?id='+p.draft.id)).json()).edits.guides;
 });
 assert.deepEqual(await persisted(),initial.committed);

 await ui('[data-repair-test]').click();
 assert.equal(await ui('[data-repair-test]').getAttribute('aria-pressed'),'true');
 await ui('[data-repair-angle]').evaluate(el=>{el.value='-15';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await ui('[data-repair-angle-label]').textContent(),'-15°');
 await ui('[data-repair-test]').click();
 const native=await page.evaluate(()=>window.__branchForge.trunkPreparation.view.waitForPresentation({timeout:15000}));
 assert(native.presentationReady&&native.native);
 const draftRoute='**/api/trunk-preparation-draft?id=*';
 const rejectSave=route=>route.request().method()==='POST'
  ?route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'验收：模拟草稿写入失败'})})
  :route.continue();
 await page.route(draftRoute,rejectSave);
 await ui('[data-auto-apply]').click();
 await page.waitForFunction(()=>document.querySelector('#trunkPreparationDialog [data-status]').textContent==='验收：模拟草稿写入失败');
 await page.unroute(draftRoute,rejectSave);
 const retry=await state();
 assert.deepEqual(retry.committed,initial.committed);
 assert.deepEqual(retry.working,revised.working);
 await ui('[data-auto-apply]').click();
 await page.waitForFunction(()=>!document.querySelector('#trunkPreparationDialog').classList.contains('trunk-repairing'));
 const committed=await state();
 assert.deepEqual(committed.committed,revised.working);
 assert.deepEqual(await persisted(),revised.working);
 assert.equal(committed.source,initial.source);
 await ui('[data-repair-open]').click();
 assert(await ui('[data-auto-discard]').isVisible());
 await ui('[data-auto-discard]').click();
 assert.deepEqual((await state()).committed,committed.committed);
 await ui('[data-undo]').click();
 assert.deepEqual((await state()).committed,initial.committed);
 await ui('[data-redo]').click();
 assert.deepEqual((await state()).committed,committed.committed);
 await ui('[data-rig-inspect]').click();
 const jointDot=point(1),dotBox=await jointDot.boundingBox();
 assert(dotBox,'inspection must show the same control point markers as guide editing');
 await page.mouse.click(dotBox.x+dotBox.width/2,dotBox.y+dotBox.height/2);
 assert.equal(await ui('.rig-joints [data-guide-point].selected').count(),1);
 await ui('[data-joint-guide]').selectOption(main);
 await ui('[data-joint-segment]').selectOption('1');
 const line=ui('[data-guide-line="'+main+'"] .trunk-guide-line-base'),restLine=await line.getAttribute('d');
 await ui('[data-pose]').fill('14');
 assert(await jointDot.isVisible());
 assert.notEqual(await line.getAttribute('d'),restLine);
 await ui('[data-reset-pose]').click();
 assert.equal(await line.getAttribute('d'),restLine);
 await canvas.focus();
 const keyboardTurn=async angle=>{
  await page.keyboard.press('r');
  assert(await ui('.trunk-transform-hud').isVisible());
  await page.keyboard.press('y');await page.keyboard.type(angle);
  await page.waitForFunction(degrees=>document.querySelector('[data-joint-angle-label]').value===degrees+'°',angle);
 };
 await keyboardTurn('23');assert.notEqual(await line.getAttribute('d'),restLine);
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>document.querySelector('[data-joint-angle-label]').value==='0°');
 assert.equal(await line.getAttribute('d'),restLine);
 await keyboardTurn('19');await page.keyboard.press('Enter');
 assert.notEqual(await line.getAttribute('d'),restLine);
 await page.keyboard.press('ArrowUp');assert.equal(await ui('[data-joint-segment]').inputValue(),'2');
 assert.equal(await line.getAttribute('d'),restLine);
 const cameraView=()=>page.evaluate(()=>window.__branchForge.trunkPreparation.view.getView());
 const beforeFocus=await cameraView();await page.keyboard.press('f');assert.notDeepEqual((await cameraView()).target,beforeFocus.target);
 await ui('[data-joint-segment]').selectOption('1');
 const focusedRestLine=await line.getAttribute('d');
 await ui('[data-joint-axis]').selectOption('y');
 await ui('[data-joint-angle]').fill('28');
 await page.waitForFunction(()=>document.querySelector('#trunkPreparationDialog [data-joint-angle-label]').value==='28°');
 assert.notEqual(await line.getAttribute('d'),focusedRestLine);
 assert.deepEqual(await persisted(),committed.committed,'joint inspection is a transient pose');
 await ui('[data-reset-pose]').click();
 assert.equal(await line.getAttribute('d'),focusedRestLine);
 const beforeBack=await state(),cameraBeforeBack=await cameraView();
 await ui('[data-joint-angle]').fill('18');
 await page.waitForFunction(()=>document.querySelector('[data-joint-angle-label]').value==='18°');
 await ui('.trunk-property-scroll').evaluate(scroll=>{scroll.scrollTop=scroll.scrollHeight;});
 await ui('[data-rig-back]').click();
 assert.equal(await panel.getAttribute('data-preparation-step'),'2');
 assert.deepEqual(await state(),beforeBack);
 assert.deepEqual(await cameraView(),cameraBeforeBack);
 assert(await ui('[data-rig-back]').isHidden());
 await ui('[data-rig-inspect]').click();
 assert.equal(await ui('[data-joint-angle-label]').textContent(),'0°');
 assert.equal(await line.getAttribute('d'),focusedRestLine);
 await ui('[data-close]').click();
 await panel.waitFor({state:'hidden'});
 await page.evaluate(()=>window.__branchForge.trunkPreparation.open());
 assert.deepEqual((await state()).committed,committed.committed);
 await ui('[data-close]').click();
 await panel.waitFor({state:'hidden'});
 return {ok:true,backend:native.native.backend,generated:candidate.working.length,committed:committed.working.length,
  narrowLayout:true,shiftPointAndBox:true,occludedPointAndBox:true,axisMove:true,viewportSegmentAndBranch:true,pointerDeletePopup:true,deleteAndUndo:true,
  comparison:true,testBend:true,jointInspection:true,backFromJointInspection:true,jointMarkersAndShortcuts:true,shortBranchDeleteFromPointMode:true,failedSaveKeepsCandidate:true,reopen:true};
}

module.exports=verify;
if(require.main===module)(async()=>{
 const fixture=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]||'.runtime/rig-repair-test/plant-host');
 fs.mkdirSync(out,{recursive:true});
 const {entry}=JSON.parse(fs.readFileSync('release-config.json','utf8'));
 const host=await openOwnedNative({out,executable:path.resolve(entry)});
 try{
  const report=await verify(host.page,fixture);
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
  console.log(report);
 }finally{await host.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
