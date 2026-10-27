import * as T from 'three';
import { buildBranchAsset, normalizeSettings, deserializeGeometry, disposeBranchAsset } from './branch-kernel.js';
import { normalizeAuthoring } from './authoring-state.js';
import { resolvePveExportPlan } from './pve-export-plan.js';
import { instanceFromMatrix } from './branch-instance-operations.js';

// Root-anchored least-squares proper similarity. An old local bend is reported
// as a residual, never silently presented as a lossless instance conversion.
export function fitSourceUnitPose(source, target) {
  if(source.length!==target.length||source.length<3)return null;
  if([...source,...target].some(p=>!p.toArray().every(Number.isFinite)))return null;
  const a=source.map(p=>p.clone().sub(source[0])),b=target.map(p=>p.clone().sub(target[0]));
  const s=Array.from({length:3},()=>[0,0,0]);let norm=0;
  for(let i=0;i<a.length;i++) {norm+=a[i].lengthSq();for(let x=0;x<3;x++)for(let y=0;y<3;y++)s[x][y]+=a[i].getComponent(x)*b[i].getComponent(y);}
  if(norm<1e-14)return null;
  const [[xx,xy,xz],[yx,yy,yz],[zx,zy,zz]]=s;
  const n=[[xx+yy+zz,yz-zy,zx-xz,xy-yx],[yz-zy,xx-yy-zz,xy+yx,zx+xz],[zx-xz,xy+yx,-xx+yy-zz,yz+zy],[xy-yx,zx+xz,yz+zy,-xx-yy+zz]];
  const v=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>+(i===j)));
  for(let step=0;step<64;step++) {
    let p=0,q=1;for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)if(Math.abs(n[i][j])>Math.abs(n[p][q])){p=i;q=j;}
    if(Math.abs(n[p][q])<1e-13*Math.max(1,norm))break;
    const angle=.5*Math.atan2(2*n[p][q],n[q][q]-n[p][p]),c=Math.cos(angle),t=Math.sin(angle),app=n[p][p],aqq=n[q][q],apq=n[p][q];
    for(let i=0;i<4;i++)if(i!==p&&i!==q){const ip=n[i][p],iq=n[i][q];n[i][p]=n[p][i]=c*ip-t*iq;n[i][q]=n[q][i]=t*ip+c*iq;}
    n[p][p]=c*c*app-2*c*t*apq+t*t*aqq;n[q][q]=t*t*app+2*c*t*apq+c*c*aqq;n[p][q]=n[q][p]=0;
    for(let i=0;i<4;i++){const ip=v[i][p],iq=v[i][q];v[i][p]=c*ip-t*iq;v[i][q]=t*ip+c*iq;}
  }
  let best=0;for(let i=1;i<4;i++)if(n[i][i]>n[best][best])best=i;
  const rotation=new T.Quaternion(v[1][best],v[2][best],v[3][best],v[0][best]).normalize();
  const scale=a.reduce((sum,p,i)=>sum+p.clone().applyQuaternion(rotation).dot(b[i]),0)/norm;
  if(!(scale>0))return null;
  const matrix=new T.Matrix4().compose(target[0],rotation,new T.Vector3().setScalar(scale)).multiply(new T.Matrix4().makeTranslation(...source[0].clone().negate().toArray()));
  const errors=source.map((p,i)=>p.clone().applyMatrix4(matrix).distanceTo(target[i]));
  return {matrix,scale,maxError:Math.max(...errors),rms:Math.sqrt(errors.reduce((a,b)=>a+b*b,0)/errors.length)};
}

const signature=(placements,sources)=>JSON.stringify(Object.entries(placements.reduce((counts,p)=>{
  const id=sources[p.source]?.id;if(!id)throw Error('缺少叶花果源网格，不能恢复来源');counts[id]=(counts[id]||0)+1;return counts;
},{})).sort(([a],[b])=>a.localeCompare(b)));

export function planUnitSourceRecovery(asset, leafSources) {
  const plan=resolvePveExportPlan(asset),candidates=new Map(),items=[],unresolved=[];
  const library=asset.authoring.branch_library;
  try {
    const prototype=item=>{
      const key=item.id+':'+item.revision;
      if(candidates.has(key))return candidates.get(key);
      if(!item.sample)return null;
      const sources=item.sample.leaf_meshes.map(s=>({...s,geometry:deserializeGeometry(s.geometry)}));
      const built=buildBranchAsset(normalizeSettings({...item.sample.settings,preview_lod:0}),null,sources,0,normalizeAuthoring(item.sample.authoring,item.sample.settings.seed),{resolveSources:true});
      const entry={item,built,sources};candidates.set(key,entry);return entry;
    };
    for(const unit of plan.units.filter(u=>u.variantRequired)) {
      if(unit.nested){unresolved.push({id:unit.id,reason:'存在嵌套旧模型，需分别指定来源'});continue;}
      const choices=unit.sourceRecovery?library:[unit.sourceAsset],matches=[];
      for(const item of choices) {
        const entry=prototype(item);if(!entry)continue;
        const bs=entry.built.masterBranches;
        if(bs.length!==unit.branches.length||bs.some((b,i)=>b.points.length!==unit.branches[i].points.length))continue;
        const sourceIndex=new Map(bs.map((b,i)=>[b.id,i])),targetIndex=new Map(unit.branches.map((b,i)=>[b.id,i]));
        if(bs.some((b,i)=>sourceIndex.get(b.parentId)!==targetIndex.get(unit.branches[i].parentId)))continue;
        if(unit.sourceRecovery && (signature(unit.leaves,leafSources)!==signature(entry.built.masterPlacements,item.sample.leaf_meshes)
          || signature(unit.organs,asset.authoring.tree_organs.units)!==signature(entry.built.treeOrgans,entry.built.authoring.tree_organs.units)))continue;
        const pose=fitSourceUnitPose(bs.flatMap(b=>b.points),unit.branches.flatMap(b=>b.points));if(!pose)continue;
        // Source-less historical records may also carry old bends. Require a
        // unique leaf/organ inventory, matching topology and a close skeleton;
        // the review explicitly reports this inferred source and shape reset.
        if(unit.sourceRecovery&&pose.maxError>Math.max(.001,unit.root.length*.1))continue;
        matches.push({unit,item,pose,branches:bs});
      }
      if(matches.length!==1){unresolved.push({id:unit.id,reason:matches.length?'多个素材相符，不能自动指定':'找不到可验证的完整源模型'});continue;}
      const found=matches[0];
      const radius=unit.root.startRadius/(found.branches[0].startRadius*found.pose.scale);
      items.push({...found,radius,restoresShape:found.pose.maxError>2e-5});
    }
    return {plan,items,unresolved,summary:{instances:plan.units.length,restore:items.length,sourceModels:new Set(plan.units.filter(u=>!u.variantRequired).map(u=>u.sourceAsset.id).concat(items.map(i=>i.item.id))).size,
      inferred:items.filter(i=>i.unit.sourceRecovery).length,shapeResets:items.filter(i=>i.restoresShape).length,
      maxShapeChange:Math.max(0,...items.map(i=>i.pose.maxError)),unresolved:unresolved.length}};
  } finally {for(const entry of candidates.values()){disposeBranchAsset(entry.built);entry.sources.forEach(s=>s.geometry.dispose());}}
}

// Explicit recovery only. Work on a new authoring object; callers present the
// report, rebuild, and save a separate project before exporting its source units.
export function recoverUnitSources(asset, leafSources, report=planUnitSourceRecovery(asset,leafSources)) {
  if(report.unresolved.length)throw Error('尚有无法确定来源的单元枝：'+report.unresolved.map(x=>x.id).join('、'));
  const a=structuredClone(asset.authoring),removed=new Set(report.items.flatMap(({unit})=>unit.branches.map(b=>b.stableId)));
  const owned=id=>removed.has(id)||[...removed].some(branch=>typeof id==='string'&&id.startsWith(branch+':'));
  a.overrides=Object.fromEntries(Object.entries(a.overrides).filter(([id])=>!owned(id)));
  a.manual_branches=a.manual_branches.filter(b=>!owned(b.id)&&!owned(b.parent));
  a.sculpt_layers=a.sculpt_layers.flatMap(layer=>{
    layer.branches=Object.fromEntries(Object.entries(layer.branches).filter(([id])=>!owned(id)));
    const op=layer.operation;
    if(op) {
      op.targets=(op.targets||[]).filter(id=>!owned(id));
      if(op.type==='DUPLICATE'){op.records=op.records.filter(r=>!owned(r.id));op.targets=op.records.filter(r=>r.root).map(r=>r.id);}
      if(op.type==='UNIT_PLACEMENT')op.records=op.records.filter(r=>!owned(r.root));
      if(op.stamps)op.stamps=op.stamps.filter(s=>!owned(s.branch));
      if(!op.targets.length)layer.operation=null;
    }
    return layer.operation||Object.keys(layer.branches).length?[layer]:[];
  });
  a.topology.suppressed=a.topology.suppressed.filter(id=>!owned(id));
  for(const field of ['reparent','attach'])a.topology[field]=Object.fromEntries(Object.entries(a.topology[field]).filter(([id])=>!owned(id)));
  a.leaf_edits.added=a.leaf_edits.added.filter(v=>!owned(v.parent));a.leaf_edits.removed=a.leaf_edits.removed.filter(id=>!owned(id));
  a.unit_editing.items=a.unit_editing.items.filter(v=>!owned(v.parent));a.unit_editing.removed=a.unit_editing.removed.filter(id=>!owned(id));
  a.unit_editing.rules=a.unit_editing.rules.flatMap(r=>{
    if(!r.targets.length)return [r];
    const targets=r.targets.filter(id=>!owned(id));return targets.length?[{...r,targets}]:[];
  });
  const scaleRecords=a.workbench?.assembly_scale?.records;
  for(const {unit,item,pose,radius} of report.items) {
    if(radius<.05||radius>5)throw Error('旧单元枝粗细超出可恢复范围：'+unit.id);
    const old=a.branch_instances.find(i=>i.id===unit.id);
    const base={...old,id:unit.id,asset_id:item.id,linked:true,pinned_revision:item.revision,shape:null,
      parent:unit.parent.stableId,attach:unit.root.parentT,variation:0,scale:pose.scale,radius_scale:radius,
      junction:{enabled:false},shootRole:old?.shootRole||unit.root.shootRole||'ANY',seed:old?.seed||1,
      assembly_locked:old?.assembly_locked||unit.root.override?.assembly_locked||false,
      assembly_manual:true,assembly_refined:false};
    const instance=instanceFromMatrix(base,item.shape,unit.parent,pose.matrix);
    if(old)a.branch_instances[a.branch_instances.indexOf(old)]=instance;else a.branch_instances.push(instance);
    if(scaleRecords)delete scaleRecords[unit.id];
  }
  return normalizeAuthoring(a,asset.settings.seed);
}

export function verifyUnitSourceRecovery(beforePlan, after) {
  const plan=resolvePveExportPlan(after);
  if(plan.units.length!==beforePlan.units.length||plan.units.some(u=>u.variantRequired))throw Error('仍有旧编辑限制源模型复用，未应用恢复；请保留旧造型或先处理这些编辑');
  for(const branch of beforePlan.structuralBranches){const actual=plan.byStable.get(branch.stableId);
    if(!actual||actual.points.length!==branch.points.length||branch.points.some((p,i)=>p.distanceTo(actual.points[i])>1e-7))throw Error('恢复改变了承重枝曲线，已停止：'+branch.stableId);
  }
  const units=new Map(plan.units.map(u=>[u.id,u]));
  for(const unit of beforePlan.units)if(!units.has(unit.id)||unit.root.points[0].distanceTo(units.get(unit.id).root.points[0])>1e-7)throw Error('恢复改变了挂接根位置，已停止：'+unit.id);
  return plan;
}
