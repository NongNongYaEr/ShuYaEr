// A source-face anchor is portable across UV edits, never across source meshes.
export function validateManualDecal(raw,source){
 if(raw==null)return null;const p=structuredClone(raw),a=p.anchor;
 if(p.version!==1||p.sourceSHA256!==source||!Number.isInteger(a?.face)||a.face<0||a.face>2000000||!Array.isArray(a.bary)||a.bary.length!==3||a.bary.some(x=>!Number.isFinite(x)||x<0||x>1)||Math.abs(a.bary.reduce((s,x)=>s+x,0)-1)>1e-5)throw Error('手动贴花锚点不属于当前源模型。');
 for(const[k,min,max]of [['widthMeters',.005,3],['heightMeters',.005,3],['rotation',-180,180],['depthMeters',.001,.5],['maxBendDegrees',5,85],['feather',.02,.45]])if(!Number.isFinite(p[k])||p[k]<min||p[k]>max)throw Error('手动贴花参数无效：'+k);
 return{version:1,sourceSHA256:source,anchor:{face:a.face,bary:a.bary.slice()},...Object.fromEntries(['widthMeters','heightMeters','rotation','depthMeters','maxBendDegrees','feather'].map(k=>[k,p[k]]))};
}
export function makeManualDecal(document,effect,hit){
 const old=effect.manualDecal,width=Math.max(.02,Math.min(1.5,(effect.params.burlMinSizeCm+effect.params.burlMaxSizeCm)/200));
 return validateManualDecal({version:1,sourceSHA256:document.resources.source,widthMeters:old?.widthMeters??width,heightMeters:old?.heightMeters??width,rotation:old?.rotation??0,depthMeters:old?.depthMeters??Math.max(.01,Math.min(.15,width*.2)),maxBendDegrees:old?.maxBendDegrees??((effect.params.burlStyle===9||effect.params.burlStyle>=61)?35:60),feather:old?.feather??.12,anchor:{face:hit.face,bary:hit.bary}},document.resources.source);
}
