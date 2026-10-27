export function reviewUnitSourceRecovery(report) {
  const s=report.summary,dialog=document.createElement('dialog');
  dialog.id='unitSourceRecoveryDialog';dialog.setAttribute('aria-labelledby','unitSourceRecoveryTitle');
  dialog.style.cssText='width:min(640px,90vw);max-height:85vh;overflow:auto;background:#25282b;color:#f0f0e9;border:1px solid #555a60;border-radius:12px;padding:24px';
  dialog.innerHTML='<h2 id="unitSourceRecoveryTitle">恢复单元枝源模型</h2><p data-summary></p><p data-detail></p><p>恢复后的木枝、叶花果和材质统一使用对应源素材版本，旧的内部编辑不再保留。恢复会更新当前树，可一步撤销；随后另存「源单元枝修复」工程再导出。原工程文件保留。</p><details><summary>查看需要恢复的单元枝</summary><div data-list style="max-height:200px;overflow:auto;font-size:12px"></div></details><footer style="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px"><button data-action="restore">恢复源模型并另存导出</button><button data-action="legacy">保留旧造型导出</button><button data-action="cancel">取消</button></footer>';
  dialog.querySelector('[data-summary]').textContent=`当前 ${s.instances} 个实例中，有 ${s.restore} 个旧记录需要恢复。恢复后预计使用 ${s.sourceModels} 个源模型。`;
  dialog.querySelector('[data-detail]').textContent=s.unresolved
    ? `有 ${s.unresolved} 个单元枝无法确定来源，暂不能自动恢复；可取消后处理，或明确保留旧造型导出。`
    : `${s.inferred} 个缺失来源的副本按枝干结构及叶花果组合匹配。${s.shapeResets} 个记录带有内部形变，恢复时会回到源素材枝型，枝干采样点最大变化约 ${(s.maxShapeChange*100).toFixed(1)} cm；挂点保持，整体姿态采用最接近的旋转和缩放。`;
  const list=dialog.querySelector('[data-list]');
  for(const item of report.items.filter(i=>i.restoresShape||i.unit.sourceRecovery)){
    const row=document.createElement('p');row.textContent=`${item.unit.id} → ${item.item.name} · 枝干最大变化 ${(item.pose.maxError*100).toFixed(2)} cm`;list.append(row);
  }
  for(const item of report.unresolved){const row=document.createElement('p');row.textContent=item.id+' · '+item.reason;list.append(row);}
  const restore=dialog.querySelector('[data-action="restore"]');restore.disabled=!!s.unresolved;
  for(const button of dialog.querySelectorAll('button'))button.style.cssText='padding:9px 12px;border:1px solid #565b61;border-radius:6px;background:#33373b;color:#f2f2ec;cursor:pointer';
  restore.style.background='#ffda50';restore.style.color='#24241e';
  document.body.append(dialog);
  return new Promise(resolve=>{
    const finish=action=>{dialog.close();dialog.remove();resolve(action);};
    dialog.oncancel=e=>{e.preventDefault();finish('cancel');};
    dialog.addEventListener('keydown',e=>e.stopPropagation());
    dialog.addEventListener('keyup',e=>e.stopPropagation());
    for(const button of dialog.querySelectorAll('button'))button.onclick=()=>finish(button.dataset.action);
    dialog.showModal();(s.unresolved?dialog.querySelector('[data-action="cancel"]'):restore).focus();
  });
}
