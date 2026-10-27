// Explicit, non-destructive migration of old expanded units to source instances.
// node --experimental-loader ./vendor-loader.mjs scripts/restore-pve-unit-sources.mjs
//   --project input.branch.json --out repaired.branch.json --restore-source-shapes
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as k from '../web/branch-kernel.js';
import {normalizeAuthoring,migrateProjectDocument} from '../web/authoring-state.js';
import {activeProject} from '../web/project-library-data.js';
import {planUnitSourceRecovery,recoverUnitSources} from '../web/unit-source-recovery.js';
import {resolvePveExportPlan} from '../web/pve-export-plan.js';
const arg=name=>process.argv[process.argv.indexOf(name)+1];
if(!process.argv.includes('--project')||!process.argv.includes('--out'))throw Error('需要 --project 原工程 --out 新工程');
const input=path.resolve(arg('--project')),output=path.resolve(arg('--out'));
if(input.toLowerCase()===output.toLowerCase())throw Error('恢复必须另存新工程，不能覆盖原文件');
const bytes=fs.readFileSync(input),doc=migrateProjectDocument(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''))),current=activeProject(doc);
const settings=k.normalizeSettings(current.settings),authoring=normalizeAuthoring({...current.authoring,branch_library:doc.authoring.branch_library},settings.seed);
const sources=(current.leaf_meshes||doc.leaf_meshes||[]).map(s=>({...s,geometry:k.deserializeGeometry(s.geometry)}));
let before,after;
try {
  before=k.buildBranchAsset(settings,null,sources,0,authoring,{instanced:true});
  const report=planUnitSourceRecovery(before,sources);
  const summary={...report.summary,original_project:input,original_sha256:createHash('sha256').update(bytes).digest('hex'),
    units:report.items.map(i=>({instance:i.unit.id,source:i.item.id,revision:i.item.revision,inferred:!!i.unit.sourceRecovery,
      reset_internal_shape:i.restoresShape,max_branch_point_change_m:i.pose.maxError,rms_branch_point_change_m:i.pose.rms})),unresolved_units:report.unresolved};
  console.log(JSON.stringify(report.summary));
  if(report.summary.shapeResets&&!process.argv.includes('--restore-source-shapes'))throw Error('包含旧内部形变；请根据上述变化数量和幅度，使用 --restore-source-shapes 明确恢复源枝型');
  const next=recoverUnitSources(before,sources,report);
  const repairedSettings={...current.settings,object_name:path.basename(output).replace(/\.branch\.json$/i,'')};
  const repaired={...doc,settings:repairedSettings,authoring:next,saved_at:new Date().toISOString()};
  if(repaired.workspaces?.tree)repaired.workspaces={...repaired.workspaces,active:'TREE',tree:{...repaired.workspaces.tree,settings:repairedSettings,authoring:next}};
  const reloaded=activeProject(migrateProjectDocument(JSON.parse(JSON.stringify(repaired))));
  after=k.buildBranchAsset(settings,null,sources,0,reloaded.authoring,{instanced:true});
  const plan=resolvePveExportPlan(after);
  if(plan.units.length!==report.plan.units.length||plan.units.some(u=>u.variantRequired))throw Error('重载未恢复全部源实例，未写出工程');
  for(const branch of report.plan.structuralBranches){const actual=plan.byStable.get(branch.stableId);
    if(!actual||actual.points.length!==branch.points.length||branch.points.some((p,i)=>p.distanceTo(actual.points[i])>1e-7))throw Error('承重枝曲线变化，未写出工程：'+branch.stableId);
  }
  const nextUnits=new Map(plan.units.map(u=>[u.id,u]));
  for(const unit of report.plan.units)if(unit.root.points[0].distanceTo(nextUnits.get(unit.id).root.points[0])>1e-7)throw Error('挂接根位置变化，未写出工程：'+unit.id);
  summary.verified={reload:true,models:new Set(plan.units.map(u=>u.sourceAsset.id)).size,instances:plan.units.length,structural_curves_unchanged:true,unit_root_positions_unchanged:true,
    leaves_before:before.masterPlacements.length,leaves_after:after.masterPlacements.length,organs_before:before.treeOrgans.length,organs_after:after.treeOrgans.length};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(repaired,null,2));
  fs.writeFileSync(output.replace(/\.branch\.json$/i,'')+'.recovery.json',JSON.stringify(summary,null,2));
  console.log(JSON.stringify({output,...summary.verified}));
} finally {k.disposeBranchAsset(before);k.disposeBranchAsset(after);sources.forEach(s=>s.geometry.dispose());}
