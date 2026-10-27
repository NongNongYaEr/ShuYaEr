export const trunkWorkflowStage=({part,contourScope}={})=>part==='DETAIL'?'DETAIL':contourScope==='FINAL'?'CONTOUR':'SHAPE';

export const TRUNK_WORKFLOW_LABELS=Object.freeze({SHAPE:'主点塑形',CONTOUR:'子点精修',DETAIL:'表面细节'});
const descriptions={
  SHAPE:'默认 10 个主点，默认精确移动所选主点，子点随大形调整；打大体时手动开启柔和推拉。',
  CONTOUR:'默认精确移动所选子点，精修沟底与凸脊；主点轮廓保留，可增减点。',
  DETAIL:'在当前承重枝表面独立添加或编辑纵沟、脊线、树瘤和疤结。',
};

export function trunkWorkflowShortcut(event={}, {enabled=false,typing=false,dialogOpen=false}={}){
  if(!enabled||typing||dialogOpen||event.defaultPrevented||event.repeat||event.isComposing||!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return null;
  return ({Digit1:'SHAPE',Digit2:'CONTOUR',Digit3:'DETAIL',KeyM:'MESH'})[event.code]||({'1':'SHAPE','2':'CONTOUR','3':'DETAIL',m:'MESH'})[event.key?.toLowerCase()]||null;
}

export function trunkWorkflowMarkup(surface){
  const attrs=surface==='panel'?['data-trunk-part="SECTION"','', 'data-trunk-part="DETAIL"']:surface==='section'?['data-section-action="sections" data-contour-scope="BASE"','data-contour-scope="FINAL"','data-section-action="details"']:['data-detail-action="sections"','data-detail-action="contour"','data-detail-action="details"'];
  return `<nav class="trunk-workflow-steps" aria-label="树干编辑分区">${['SHAPE','CONTOUR','DETAIL'].map((stage,i)=>`<button type="button" data-trunk-stage="${stage}" ${attrs[i]} title="Alt+${i+1} · ${TRUNK_WORKFLOW_LABELS[stage]}：${descriptions[stage]}" aria-keyshortcuts="Alt+${i+1}"><span>${i+1}</span>${TRUNK_WORKFLOW_LABELS[stage]}</button>`).join('')}</nav>`;
}

export function updateTrunkWorkflow(node,{stage,disabled=false}={}){
  node.dataset.trunkStage=stage;
  node.querySelectorAll('[data-trunk-stage]').forEach(button=>{
    const active=button.dataset.trunkStage===stage;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
    if(active)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
    button.disabled=disabled;
  });
}
