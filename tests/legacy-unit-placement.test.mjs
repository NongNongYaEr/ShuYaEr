import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { legacyUnitBranches, legacyUnitInstances, makeLegacyUnitPlacement, normalizeLegacyUnitPlacement, evaluateLegacyUnitPlacement } from '../web/legacy-unit-placement.js';
import { evaluatedInstanceFrame } from '../web/branch-instance-operations.js';
import { prepareUnitCombEntries, combUnitInstance } from '../web/unit-instance-combing.js';
import { normalizeBranchShape } from '../web/branch-workbench-data.js';
import { resolveUnit } from '../web/unit-authoring.js';
import { appendBranchDuplicate, normalizeBranchDuplicate } from '../web/branch-duplicate.js';
import { buildUnitAssemblySelection } from '../web/unit-assembly-selection.js';

const near = (a,b,message='') => assert.ok(a.distanceTo(b)<1e-7,`${message} ${a.distanceTo(b)}`);
const owner='DUP_NEW_DUP_OLD_REAL', childOwner='DUP_NESTED_REAL';
function fixture() {
  const origin=new THREE.Vector3(2,-1,1),roll=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.8),mount=new THREE.Matrix4().compose(origin,roll,new THREE.Vector3(1,1,1));
  const unit=(id,kind)=>({id,kind,parent:'DUP_NEW_1',t:.6,offset:[.1,.12,-.07],direction:[0,1,0],normal:[0,0,1],twist:0,scale:.2,base_scale:.2,source_id:kind==='LEAF'?'LEAF':'FRUIT',source:0,metadata:{sourceInstanceId:'REAL',sourceAssetId:'SOURCE',organRole:kind==='LEAF'?'LEAF':'FRUIT'}});
  const branch=(id,stableId,parentId,points,unitOwner='')=>({id,stableId,parentId,parentT:.5,order:1,
    points:points.map(point=>new THREE.Vector3(...point)),controlPoints:points.map(point=>new THREE.Vector3(...point)),children:[],length:1,startRadius:.06,endRadius:.02,parentRadius:.1,
    radiusProfile:[1,1,1],sections:[{t:0,radius:1,oval:1.2,roll:14}],instanceId:'',unitOwner,copySnapshot:true,sourceAssetId:'SOURCE',sourceInstanceId:'REAL',sourceBranchId:'REAL.R1',
    mountMatrix:mount.clone(),surfaceNormals:points.map(()=>new THREE.Vector3(0,0,1).applyQuaternion(roll)),copiedLeaves:[],copiedOrgans:[]});
  const carrier=branch(0,'ROOT',-1,[[0,0,0],[0,0,2]]);carrier.copySnapshot=false;carrier.sourceAssetId=carrier.sourceInstanceId='';carrier.mountMatrix=new THREE.Matrix4().makeRotationZ(.4);
  const root=branch(1,'DUP_NEW_0',0,[[2,-1,1],[3,-1,1]]),twig=branch(2,'DUP_NEW_1',1,[[2.5,-1,1],[2.8,-.5,1.3]],owner);
  root.skeletonRadius={base:.06,curve:[1,.8,.6,.4,.2],junctionFlare:.1};root.junction={enabled:true,length:.15,flare:.2};
  twig.copiedLeaves=[unit('LEAF_COPY','LEAF')];twig.copiedOrgans=[unit('FRUIT_COPY','ORGAN')];
  const nested=branch(3,'DUP_NEW_2',2,[[2.65,-.75,1.15],[2.65,-.6,1.6]],childOwner);
  const actual=branch(4,'REAL.R1',0,[[-1,0,1],[-2,0,1]],'REAL');actual.instanceId='REAL';actual.copySnapshot=false;
  const ghost=branch(5,'GHOST.R',0,[[4,0,1],[5,0,1]],'MISSING');ghost.copySnapshot=false;ghost.sourceAssetId=ghost.sourceInstanceId='';
  carrier.children=[1,4,5];root.children=[2];twig.children=[3];
  const shape=normalizeBranchShape({branches:[{id:'R1',parent:'',points:[[0,0,0],[1,0,0]],length:1,start_radius:.06,end_radius:.02}],connector:{position:[0,0,0],direction:[1,0,0],hang_direction:[0,0,-1]}});
  const authoring={branch_instances:[{id:'REAL',asset_id:'SOURCE',linked:true,pinned_revision:2,parent:'ROOT',attach:.5,scale:1,variation:0,seed:1,roll:0}],branch_library:[{id:'SOURCE',name:'原完整枝',revision:2,shape}],sculpt_layers:[],branch_arrays:[]};
  return {branches:[carrier,root,twig,nested,actual,ghost],authoring,origin,roll,shape,sources:{LEAF:[{id:'LEAF'}],ORGAN:[{id:'FRUIT',role:'FRUIT'}]}};
}
function entries(f) {
  const branches=legacyUnitBranches(f.authoring,f.branches),virtual=legacyUnitInstances(f.authoring,f.branches),authoring={...f.authoring,branch_instances:[...f.authoring.branch_instances,...virtual]};
  return prepareUnitCombEntries({authoring,branches,settings:{},selection:[owner,childOwner],sampleBranches:'ALL'});
}
function matrixAt(point,angle=.6,scale=1) {return new THREE.Matrix4().compose(point,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),angle),new THREE.Vector3().setScalar(scale)).multiply(new THREE.Matrix4().makeTranslation(-point.x,-point.y,-point.z));}

test('old DUP roots are recovered with the complete wood and source identity, while normal models and unknown flags are never migrated',()=>{
  const f=fixture(),snapshot=JSON.stringify(f.authoring),wood=f.branches.map(b=>b.points.map(p=>p.toArray()));
  const annotated=legacyUnitBranches(f.authoring,f.branches),virtual=legacyUnitInstances(f.authoring,f.branches);
  assert.equal(annotated[1].unitOwner,owner,'recover the true copied root from its nearest explicit matching owner');
  assert.equal(f.branches[1].unitOwner,'','runtime annotation does not rewrite the original branch');
  assert.deepEqual(virtual.map(i=>i.id),[owner,childOwner]);
  const i=virtual[0];assert.equal(i.legacyRootId,'DUP_NEW_0');assert.deepEqual(i.legacyBranchIds,['DUP_NEW_0','DUP_NEW_1']);
  assert.equal(i.parent,'');assert.equal(i.legacyParent,'ROOT');assert.equal(i.scale,1);assert.equal(i.radius_scale,1);
  assert.equal(i.sourceAssetId,'SOURCE');assert.equal(i.sourceInstanceId,'REAL');assert.equal(i.asset_id,'SOURCE');assert.equal(i.linked,false);
  const frame=evaluatedInstanceFrame(i,i.shape,annotated,{});near(frame.position,f.origin);near(frame.direction,new THREE.Vector3(1,0,0));
  for(let n=0;n<i.shape.branches.length;n++)i.shape.branches[n].points.forEach((p,j)=>near(new THREE.Vector3(...p).applyMatrix4(frame.matrix),f.branches[n+1].points[j]));
  near(new THREE.Vector3(...i.shape.connector.hang_direction),new THREE.Vector3(0,0,-1).applyQuaternion(f.roll));
  assert.equal(JSON.stringify(f.authoring),snapshot);assert.deepEqual(f.branches.map(b=>b.points.map(p=>p.toArray())),wood);
  const planned=entries(f);assert.deepEqual(planned.map(e=>e.id),[owner],'nested complete child follows the parent once');assert.equal(planned[0].rootId,'DUP_NEW_0');
  assert.deepEqual(planned[0].familyIds,[owner,childOwner]);
  const turned=combUnitInstance(planned[0],{delta:new THREE.Vector3(0,.2,0),worldRadius:1});assert.ok(turned);near(planned[0].frame.position,f.origin.clone().applyMatrix4(turned.matrix));
});

test('four genuine old copies share the same whole-unit selection, cards and eligible brush set',()=>{
  const f=fixture(),branches=[f.branches[0],f.branches[4],f.branches[5]];
  for(let n=0;n<4;n++){
    const offset=new THREE.Vector3(0,n*2,0),rootId=20+n*2;
    for(let j=0;j<2;j++){
      const old=f.branches[j+1],stableId=`COPY_${n}_${j}`;
      branches.push({...old,id:rootId+j,stableId,parentId:j?rootId:0,children:j?[]:[rootId+1],unitOwner:j?`COPY_${n}_REAL`:'',
        points:old.points.map(p=>p.clone().add(offset)),controlPoints:old.controlPoints.map(p=>p.clone().add(offset)),
        mountMatrix:new THREE.Matrix4().makeTranslation(...offset.toArray()).multiply(old.mountMatrix),
        copiedLeaves:old.copiedLeaves.map(item=>({...item,parent:stableId})),copiedOrgans:old.copiedOrgans.map(item=>({...item,parent:stableId}))});
    }
  }
  const annotated=legacyUnitBranches(f.authoring,branches),virtual=legacyUnitInstances(f.authoring,branches),
    instances=[...f.authoring.branch_instances,...virtual],selection=virtual.map(i=>i.legacyRootId),
    model=buildUnitAssemblySelection({instances,branches:annotated,library:f.authoring.branch_library,selection});
  assert.equal(virtual.length,4);assert.equal(model.summary.selected,4);assert.equal(model.summary.actualSelected,0);
  assert.equal(model.summary.legacySelected,4);assert.equal(model.summary.legacyEditable,4);assert.equal(model.summary.editable,4);
  assert.equal(model.summary.unsupportedLegacy,0);assert.equal(model.legacy.cards.length,4);
  assert.deepEqual(new Set(model.selectedIds),new Set(virtual.map(i=>i.id)));
  assert.deepEqual(new Set(model.eligibleRoots),new Set(selection));
  for(const card of model.legacy.cards){assert.equal(card.selected,1);assert.equal(card.eligible,1);assert.equal(card.state,'ALL');}
  const authoring={...f.authoring,branch_instances:instances},planned=prepareUnitCombEntries({authoring,branches:annotated,settings:{},selection,sampleBranches:'ALL'});
  assert.deepEqual(new Set(planned.map(e=>e.rootId)),new Set(model.eligibleRoots),'tools and cards use the same complete roots');
  const matrixUpdates=planned.map(e=>({id:e.id,matrix:matrixAt(e.frame.position,.2)})),operation=makeLegacyUnitPlacement(planned,matrixUpdates,{authoring:f.authoring,branches});
  assert.equal(operation.records.length,4,'one complete placement record per genuine copied unit');
  const unknown=buildUnitAssemblySelection({instances,branches:annotated,selection:['GHOST.R']});
  assert.equal(unknown.summary.unsupportedLegacy,1);assert.equal(unknown.summary.editable,0,'untraceable legacy flags stay protected');
});

test('nested genuine copied units follow once and an explicit locked child blocks the parent in both cards and geometry',()=>{
  const f=fixture(),selection=['DUP_NEW_0','DUP_NEW_2'];
  const derive=()=>{const branches=legacyUnitBranches(f.authoring,f.branches),instances=[...f.authoring.branch_instances,...legacyUnitInstances(f.authoring,f.branches)];return buildUnitAssemblySelection({instances,branches,selection});};
  const open=derive();assert.equal(open.summary.selected,2);assert.equal(open.summary.legacySelected,2);
  assert.equal(open.summary.editable,1);assert.equal(open.summary.linkedChildren,1);assert.deepEqual(open.eligibleRoots,['DUP_NEW_0']);
  f.branches[3].assembly_locked=true;const locked=derive();
  assert.equal(locked.summary.selected,2);assert.equal(locked.summary.selectedLocked,1);assert.equal(locked.summary.selectedBlocked,2);
  assert.equal(locked.summary.editable,0);assert.equal(locked.summary.legacyEditable,0);assert.match(locked.summary.reason,/锁定/);
  assert.equal(makeLegacyUnitPlacement(entries(f),[{id:owner,matrix:matrixAt(f.origin,.2)}],{authoring:f.authoring,branches:f.branches}),null);
});

test('mixed actual and copied parents cannot move a child through an incompatible persistence path, but either child remains independently editable',()=>{
  for(const actualParent of [true,false]){
    const f=fixture();
    if(actualParent)f.branches[1].parentId=f.branches[4].id;
    else {f.branches[4].parentId=f.branches[2].id;f.authoring.branch_instances[0].parent='DUP_NEW_1';}
    const branches=legacyUnitBranches(f.authoring,f.branches),virtual=legacyUnitInstances(f.authoring,f.branches),authoring={...f.authoring,branch_instances:[...f.authoring.branch_instances,...virtual]};
    const prepare=selection=>prepareUnitCombEntries({authoring,branches,settings:{},selection,sampleBranches:'ALL'});
    assert.equal(prepare([actualParent?'REAL.R1':'DUP_NEW_0']).length,0,'mixed ancestor must not preview a family that cannot reload uniformly');
    assert.deepEqual(prepare([actualParent?'DUP_NEW_0':'REAL.R1']).map(entry=>entry.id),[actualParent?owner:'REAL']);
  }
});

test('captured legacy branch IDs match breadth-first local geometry rather than incidental runtime storage order',()=>{
  const f=fixture();f.branches[3].unitOwner=owner;
  const root=f.branches[1],sibling={...f.branches[2],id:8,stableId:'DUP_NEW_3',parentId:root.id,
    points:[new THREE.Vector3(2.3,-1,1),new THREE.Vector3(2.3,-1,1.7)],controlPoints:[new THREE.Vector3(2.3,-1,1),new THREE.Vector3(2.3,-1,1.7)],copiedLeaves:[],copiedOrgans:[]};
  f.branches.push(sibling);const annotated=legacyUnitBranches(f.authoring,f.branches),legacy=legacyUnitInstances(f.authoring,f.branches)[0],frame=evaluatedInstanceFrame(legacy,legacy.shape,annotated,{});
  assert.deepEqual(legacy.legacyBranchIds,['DUP_NEW_0','DUP_NEW_1','DUP_NEW_3','DUP_NEW_2']);
  legacy.shape.branches.forEach((branch,n)=>{const runtime=annotated.find(b=>b.stableId===legacy.legacyBranchIds[n]);branch.points.forEach((p,j)=>near(new THREE.Vector3(...p).applyMatrix4(frame.matrix),runtime.points[j]));});
});

test('saved UNIT_PLACEMENT rotates and scales complete copied wood, leaves and fruit with roll preserved and no source mutations',()=>{
  const f=fixture(),planned=entries(f),before=JSON.stringify(f.authoring),matrix=matrixAt(f.origin,.6,1.4);
  const operation=makeLegacyUnitPlacement(planned,[{id:owner,matrix,after:{unused:true}}],{authoring:f.authoring,branches:f.branches});
  assert.ok(operation);assert.deepEqual(operation.records[0].targets,['DUP_NEW_0','DUP_NEW_1','DUP_NEW_2']);
  assert.equal(operation.records[0].owner,owner);assert.equal(operation.records[0].root,'DUP_NEW_0');assert.equal(operation.records[0].parent,'ROOT');
  assert.equal(operation.records[0].sourceAssetId,'SOURCE');assert.equal(operation.records[0].sourceInstanceId,'REAL');
  const normalized=normalizeLegacyUnitPlacement(JSON.parse(JSON.stringify(operation))),after=evaluateLegacyUnitPlacement(f.branches,normalized,1,{authoring:f.authoring});
  for(const branch of f.branches){const next=after.find(b=>b.stableId===branch.stableId),moved=operation.targets.includes(branch.stableId);
    branch.points.forEach((p,j)=>near(next.points[j],moved?p.clone().applyMatrix4(matrix):p));
    branch.controlPoints.forEach((p,j)=>near(next.controlPoints[j],moved?p.clone().applyMatrix4(matrix):p));
    assert.equal(next.sourceAssetId,branch.sourceAssetId);assert.equal(next.sourceInstanceId,branch.sourceInstanceId);assert.equal(next.sourceBranchId,branch.sourceBranchId);
    if(!moved){assert.equal(next,branch);continue;}
    for(const key of ['length','startRadius','endRadius','parentRadius'])assert.ok(Math.abs(next[key]-branch[key]*1.4)<1e-12);
    assert.deepEqual(next.sections,branch.sections);assert.ok(next.mountMatrix.equals(matrix.clone().multiply(branch.mountMatrix)));
    branch.surfaceNormals.forEach((normal,j)=>near(next.surfaceNormals[j],normal.clone().transformDirection(matrix)));
    for(const [key,kind]of [['copiedLeaves','LEAF'],['copiedOrgans','ORGAN']])for(let j=0;j<branch[key].length;j++){
      const oldPose=resolveUnit(branch[key][j],branch,f.sources[kind]),newPose=resolveUnit(next[key][j],next,f.sources[kind]);
      near(newPose.position,oldPose.position.clone().applyMatrix4(matrix),kind+' offset must scale in its frame');
      near(newPose.direction,oldPose.direction.clone().transformDirection(matrix));near(newPose.normal,oldPose.normal.clone().transformDirection(matrix));
      assert.ok(Math.abs(newPose.scale-oldPose.scale*1.4)<1e-12);assert.equal(next[key][j].base_scale,branch[key][j].base_scale*1.4);
      assert.deepEqual(next[key][j].metadata,branch[key][j].metadata);assert.deepEqual(next[key][j].direction,branch[key][j].direction,'no double rotation in local unit data');
    }
  }
  near(after[1].points[0],f.origin);assert.equal(after[1].skeletonRadius.base,.06*1.4);assert.equal(after[1].junction.length,.15*1.4);
  assert.equal(JSON.stringify(f.authoring),before);assert.equal(f.branches[2].copiedLeaves[0].scale,.2,'original copied record remains immutable');
});

test('placement replays on the current carrier tangent and root, independently of camera or saved world pivot',()=>{
  const f=fixture(),matrix=matrixAt(f.origin,.5),operation=makeLegacyUnitPlacement(entries(f),[{id:owner,matrix}],{branches:f.branches,authoring:f.authoring});
  const expected=evaluateLegacyUnitPlacement(f.branches,operation,1,{authoring:f.authoring}),carry=new THREE.Matrix4().compose(new THREE.Vector3(-3,2,1),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.9),new THREE.Vector3(1,1,1));
  const carried=f.branches.map(b=>({...b,points:b.points.map(p=>p.clone().applyMatrix4(carry)),controlPoints:b.controlPoints.map(p=>p.clone().applyMatrix4(carry)),mountMatrix:carry.clone().multiply(b.mountMatrix)}));
  const after=evaluateLegacyUnitPlacement(carried,operation,1,{authoring:f.authoring});
  for(let n=1;n<=3;n++)expected[n].points.forEach((p,j)=>near(after[n].points[j],p.clone().applyMatrix4(carry)));
  near(after[1].points[0],carried[1].points[0]);
  const half=evaluateLegacyUnitPlacement(f.branches,operation,.5,{authoring:f.authoring}),halfMatrix=matrixAt(f.origin,.25);
  f.branches[2].points.forEach((p,j)=>near(half[2].points[j],p.clone().applyMatrix4(halfMatrix)));
});

test('whole-family locking and exclusions cannot be bypassed by moving the parent, and overlapping parent/child records apply once',()=>{
  const f=fixture(),planned=entries(f),matrix=matrixAt(f.origin,.6),operation=makeLegacyUnitPlacement(planned,[{id:owner,matrix}],{branches:f.branches,authoring:f.authoring});
  for(const options of [{excluded:['DUP_NEW_2']},{excluded:[childOwner]},{locked:['DUP_NEW_2']},{isLocked:i=>i.id===childOwner}]){
    assert.equal(makeLegacyUnitPlacement(planned,[{id:owner,matrix}],{...options,branches:f.branches,authoring:f.authoring}),null);
    assert.equal(evaluateLegacyUnitPlacement(f.branches,operation,1,{...options,authoring:f.authoring}),f.branches);
  }
  f.branches[3].override={locked:true,frozen_points:[[0,0,0],[1,0,0]]};assert.ok(makeLegacyUnitPlacement(planned,[{id:owner,matrix}],{branches:f.branches,authoring:f.authoring}),'old curve freeze is not an assembly lock');
  f.branches[3].override.assembly_locked=true;assert.equal(evaluateLegacyUnitPlacement(f.branches,operation,1,{authoring:f.authoring}),f.branches);delete f.branches[3].override.assembly_locked;
  const child=f.branches[3],overlap=normalizeLegacyUnitPlacement({...operation,records:[...operation.records,{...operation.records[0],owner:childOwner,root:child.stableId,parent:'DUP_NEW_1',targets:[child.stableId],rotation:[0,0,Math.sin(.4),Math.cos(.4)]}]});
  const once=evaluateLegacyUnitPlacement(f.branches,operation,1,{authoring:f.authoring}),twice=evaluateLegacyUnitPlacement(f.branches,overlap,1,{authoring:f.authoring});
  once[3].points.forEach((p,j)=>near(twice[3].points[j],p,'nested parent selection has one transform'));
});

test('invalid matrices/records and arbitrary unknown owners cannot create complete-unit edits',()=>{
  const f=fixture(),planned=entries(f),translation=new THREE.Matrix4().makeTranslation(1,0,0),nonuniform=new THREE.Matrix4().makeScale(2,1,1),shear=new THREE.Matrix4().set(1,.3,0,0,0,1,0,0,0,0,1,0,0,0,0,1);
  for(const matrix of [translation,nonuniform,shear,new THREE.Matrix4().makeScale(-1,-1,-1)])assert.equal(makeLegacyUnitPlacement(planned,[{id:owner,matrix}],{branches:f.branches,authoring:f.authoring}),null);
  assert.equal(normalizeLegacyUnitPlacement({type:'UNIT_PLACEMENT',records:[{owner,root:'DUP_NEW_0',targets:['DUP_NEW_0'],rotation:[0,0,0,0],scale:1}]}),null);
  const ghost={type:'UNIT_PLACEMENT',records:[{owner:'MISSING',root:'GHOST.R',targets:['GHOST.R'],rotation:[0,0,Math.sin(.3),Math.cos(.3)],scale:1,parent_tangent:[0,0,1]}]};
  assert.equal(evaluateLegacyUnitPlacement(f.branches,ghost,1,{authoring:f.authoring}),f.branches);
});

test('JSON reload of old DUP records plus placement reproduces complete geometry without rewriting the construction source',()=>{
  const f=fixture(),records=f.branches.slice(1,4).map((b,n)=>({id:b.stableId,parent:n===0?'ROOT':f.branches.find(p=>p.id===b.parentId).stableId,root:n===0,
    owner:b.unitOwner,parentT:b.parentT,order:b.order,sourceAssetId:b.sourceAssetId,sourceInstanceId:b.sourceInstanceId,sourceBranchId:b.sourceBranchId,
    points:b.points.map(p=>p.toArray()),controlPoints:b.controlPoints.map(p=>p.toArray()),mountMatrix:b.mountMatrix.toArray(),surfaceNormals:b.surfaceNormals.map(p=>p.toArray()),
    properties:Object.fromEntries(['length','startRadius','endRadius','parentRadius','radiusProfile','sections','skeletonRadius','junction'].filter(k=>b[k]!=null).map(k=>[k,b[k]])),leaves:b.copiedLeaves,organs:b.copiedOrgans,frame:null}));
  const source=JSON.stringify({type:'DUPLICATE',records}),duplicate=normalizeBranchDuplicate(JSON.parse(source)),branches=[f.branches[0]],matrix=matrixAt(f.origin,.3,1.2);
  appendBranchDuplicate(branches,duplicate);const a={...f.authoring,sculpt_layers:[{operation:duplicate}]},virtual=legacyUnitInstances(a,branches),legacy=virtual[0];
  const operation=makeLegacyUnitPlacement([{id:legacy.id,instance:legacy,rootId:legacy.legacyRootId,branches}],[{id:legacy.id,matrix}],{branches,authoring:a});assert.ok(operation);
  const after=evaluateLegacyUnitPlacement(branches,operation,1,{authoring:a}),reloaded=[{...f.branches[0],children:[]}];appendBranchDuplicate(reloaded,normalizeBranchDuplicate(JSON.parse(source)));
  const restored=evaluateLegacyUnitPlacement(reloaded,normalizeLegacyUnitPlacement(JSON.parse(JSON.stringify(operation))),1,{authoring:a});
  for(let n=1;n<after.length;n++)after[n].points.forEach((p,j)=>near(restored[n].points[j],p));
  assert.equal(JSON.stringify({type:'DUPLICATE',records}),source);assert.deepEqual(f.authoring.branch_library[0].shape,f.shape);
});
