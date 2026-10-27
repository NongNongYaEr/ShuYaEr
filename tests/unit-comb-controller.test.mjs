import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { evaluatedInstanceFrame } from '../web/branch-instance-operations.js';
import { createUnitCombController } from '../web/unit-comb-controller.js';
import { legacyUnitBranches, legacyUnitInstances } from '../web/legacy-unit-placement.js';
import { applySculptLayers } from '../web/generator-geometry.js';
import { resolveUnitEditScope } from '../web/unit-branch-boundary.js';
import { buildUnitAssemblySelection } from '../web/unit-assembly-selection.js';

function fixture() {
  const previous=globalThis.document,nodes=new Map();
  class Element {
    constructor(){this.children=[];this.style={};this.attributes=new Map();const classes=new Set();this.classList={add:v=>classes.add(v),contains:v=>classes.has(v),toggle(v,on){if(on??!classes.has(v))classes.add(v);else classes.delete(v);}};this.hidden=false;this.selectors=new Map();this.listeners=new Map();}
    append(...nodes){this.children.push(...nodes);for(const node of nodes)node.parentElement=this;}
    setAttribute(key,value){this.attributes.set(key,value);}removeAttribute(key){this.attributes.delete(key);}remove(){}
    querySelector(selector){if(!this.selectors.has(selector))this.selectors.set(selector,new Element());return this.selectors.get(selector);}
    addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);}
    dispatchEvent(event){for(const listener of this.listeners.get(event.type)||[])listener(event);}
    getBoundingClientRect(){return{left:0,top:0,width:800,height:800};}
    setPointerCapture(id){this.pointer=id;}hasPointerCapture(id){return this.pointer===id;}releasePointerCapture(){this.pointer=null;}
  }
  globalThis.document={createElement:()=>new Element(),createElementNS:()=>new Element(),getElementById:id=>nodes.get(id)||null};
  const orientation=new Element();orientation.value='DRAG';nodes.set('unitCombOrientation',orientation);
  for(const [id,value] of Object.entries({unitBrushEffect:'TURN',unitBrushSpreadMode:'OUT',unitBrushSizeMode:'GROW',unitBrushAngleLimit:25,unitBrushSizeLimit:20,unitBrushSeed:1,
    unitBrushSample:'',unitBrushSampleStatus:'',unitBrushCenter:'',unitBrushCenterStatus:'',unitBrushShuffle:''})){
    const node=new Element();node.value=String(value);nodes.set(id,node);
  }
  const canvas=new Element();canvas.parentElement=new Element();canvas.offsetLeft=canvas.offsetTop=0;
  const shape={connector:{position:[0,0,0],direction:[1,0,0]},branches:[{id:'R1',parent:'',points:[[0,0,0],[1,0,0]],length:1,start_radius:.02,end_radius:.004}]};
  const authoring=normalizeAuthoring({branch_library:[{id:'SOURCE',revision:1,name:'complete',shape,sample:{style:'shared'}}],
    branch_instances:['ONE','TWO'].map((id,n)=>({id,linked:true,asset_id:'SOURCE',pinned_revision:1,parent:'ROOT',attach:.5+n*.3,scale:1,
      frame:{position:[0,n*.6,0],direction:[1,0,0],parent_position:[0,n*.6,0],parent_tangent:[0,1,0]}}))});
  const make=(id,stableId,parentId,points,instanceId='')=>({id,stableId,parentId,points,controlPoints:points.map(p=>p.clone()),children:[],length:1,startRadius:.02,endRadius:.004,instanceId});
  const root=make(0,'ROOT',-1,[new THREE.Vector3(0,-1,0),new THREE.Vector3(0,1,0)]),branches=[root];
  for(const [n,instance] of authoring.branch_instances.entries()){
    const frame=evaluatedInstanceFrame(instance,authoring.branch_library[0].shape,[root],{});
    branches.push(make(n+1,instance.id+'.R1',0,[frame.position.clone(),frame.position.clone().add(frame.direction)],instance.id));root.children.push(n+1);
  }
  const group=new THREE.Group(),markerRoot=new THREE.Group(),asset={group,masterBranches:branches},camera=new THREE.PerspectiveCamera(45,1,.01,100);markerRoot.add(group);
  camera.position.set(0,0,6);camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.updateProjectionMatrix();
  let scope='SELECTED',selection=new Set(['ONE.R1']),mode='UNIT',transactions=0;
  const previews=[],history=[],messages=[],pending=[];const controls={enabled:true,target:new THREE.Vector3()};
  const api={canvas,camera,controls,markerRoot,getAsset:()=>asset,getAuthoring:()=>authoring,getSettings:()=>({}),getSelectedIds:()=>selection,getScope:()=>scope,selectionMode:()=>mode,
    brushOptions:()=>({radius:180,strength:.8,hardness:.5,scope:'THROUGH'}),status:(text,state)=>messages.push([text,state]),
    scheduleFrame:fn=>{pending.push(fn);return pending.length;},cancelFrame(){},createPreview(){const preview={restores:0,updates:0,stats:{mode:'GPU'},restore(){this.restores++;},update(snapshot,matrices){this.updates++;this.matrices=new Map(matrices);}};previews.push(preview);return preview;},
    transact(label,mutate,options){transactions++;history.push(structuredClone(authoring));mutate(authoring);api.lastTransaction={label,options};},
    commitPreview(preview,apply){apply();preview.restore();return true;}};
  const controller=createUnitCombController(api);
  const event=(x=500,y=400,extra={})=>({clientX:x,clientY:y,pointerId:1,button:0,...extra});
  return{controller,api,authoring,branches,controls,previews,history,messages,event,camera,group,orientation,nodes,canvas,markerRoot,get transactions(){return transactions;},
    flush(){while(pending.length)pending.shift()();},select(ids){selection=new Set(ids);controller.refreshTargets();},scope(value){scope=value;controller.refreshTargets();},mode(value){mode=value;},restore(){controller.cancel();globalThis.document=previous;}};
}

test('unit comb preview is transient; a continuous stroke commits once through complete-instance placement',()=>{
  const f=fixture();try{
    const before=structuredClone(f.authoring),runtime=f.branches.map(b=>b.points.map(p=>p.toArray()));
    assert.equal(f.controller.begin(f.event()),true);assert.equal(f.controller.active,true);assert.equal(f.controls.enabled,false);
    for(let y=390;y>=290;y-=10)f.controller.move(f.event(500,y));f.flush();
    assert.deepEqual(f.authoring,before,'live GPU preview never mutates the saved authoring');
    assert.equal(f.transactions,0);assert.ok(f.previews[0].updates>0);assert.ok(f.previews[0].matrices.has(1));assert.equal(f.previews[0].matrices.has(0),false);
    f.controller.end(f.event(500,290));
    assert.equal(f.transactions,1);assert.equal(f.controller.active,false);assert.equal(f.controls.enabled,true);assert.equal(f.previews[0].restores,1);
    assert.deepEqual(f.api.lastTransaction.options,{bypassLayers:true,deferControls:true});
    assert.notDeepEqual(f.authoring.branch_instances[0].frame,before.branch_instances[0].frame);
    assert.deepEqual(f.authoring.branch_instances[1],before.branch_instances[1]);
    for(const field of ['shape','asset_id','pinned_revision','scale','radius_scale','parent','attach'])assert.deepEqual(f.authoring.branch_instances[0][field],before.branch_instances[0][field],field);
    for(const field of ['branch_library','overrides','sculpt_layers','leaf_edits','unit_editing'])assert.deepEqual(f.authoring[field],before[field],field+' unchanged');
    assert.deepEqual(f.branches.map(b=>b.points.map(p=>p.toArray())),runtime,'preview never edits CPU source curves');
    Object.assign(f.authoring,f.history[0]);assert.deepEqual(f.authoring,before,'one history entry restores the entire stroke');
  }finally{f.restore();}
});

test('old complete copies commit the accumulated whole stroke, reload and preserve sources and ordinary instances',()=>{
  const f=fixture();try{
    const branch=f.branches[1];branch.instanceId='';branch.unitOwner='OLD_ONE';branch.copySnapshot=true;branch.parentT=.5;
    branch.sourceInstanceId='ONE';branch.sourceAssetId='SOURCE';
    f.authoring.branch_instances=f.authoring.branch_instances.filter(instance=>instance.id!=='ONE');
    f.api.getUnitBranches=()=>legacyUnitBranches(f.authoring,f.branches);
    f.api.getUnitInstances=()=>[...f.authoring.branch_instances,...legacyUnitInstances(f.authoring,f.branches)];
    f.nodes.get('unitBrushEffect').value='SCALE';f.nodes.get('unitBrushSizeLimit').value='20';
    f.select([branch.stableId]);const before=structuredClone(f.authoring),tip=branch.points.at(-1).clone(),pivot=branch.points[0].clone();
    assert.equal(f.controller.begin(f.event()),true);assert.equal(f.controller.active,true);
    for(let y=390;y>=290;y-=10)f.controller.move(f.event(500,y));f.flush();
    assert.deepEqual(f.authoring,before,'live placement never writes the old snapshot or source');
    f.controller.end(f.event(500,290));assert.equal(f.transactions,1);
    const matrix=f.previews[0].matrices.get(branch.id).matrix.clone();
    assert.deepEqual(f.authoring.branch_instances,before.branch_instances);assert.deepEqual(f.authoring.branch_library,before.branch_library);
    assert.equal(f.authoring.sculpt_layers.length,1);assert.equal(f.authoring.sculpt_layers[0].operation.type,'UNIT_PLACEMENT');
    const loaded=normalizeAuthoring(JSON.parse(JSON.stringify(f.authoring)));
    assert.deepEqual(loaded.sculpt_layers[0].operation,f.authoring.sculpt_layers[0].operation);
    const binding={continuousCarrier:true};
    const runtime=f.branches.map(b=>({...b,mountFrameBinding:binding,points:b.points.map(p=>p.clone()),controlPoints:b.controlPoints.map(p=>p.clone())}));
    applySculptLayers(runtime,loaded.sculpt_layers,loaded.overrides);
    assert.ok(runtime[1].points[0].distanceTo(pivot)<1e-8,'root fixed after reload');
    assert.ok(runtime[1].points.at(-1).distanceTo(tip.applyMatrix4(matrix))<1e-7,'saved shape matches cumulative preview, not last dab');
    assert.deepEqual(runtime[2].points.map(p=>p.toArray()),f.branches[2].points.map(p=>p.toArray()),'unselected ordinary model unchanged');
    assert.ok(runtime[1].length>branch.length);assert.ok(runtime[1].startRadius>branch.startRadius);
    assert.equal(runtime[0].mountFrameBinding,binding,'unrelated carrier bindings remain intact');
    assert.equal(runtime[2].mountFrameBinding,binding,'unselected whole-model carrier bindings remain intact');
    assert.equal(runtime[1].mountFrameBinding,undefined,'only the transformed old frame is rebuilt');
  }finally{f.restore();}
});

test('smart depth uses the explicit selection as a through pool, ALL stays surface, and empty selection never expands',()=>{
  const f=fixture();try{
    f.api.brushOptions=()=>({radius:180,strength:.8,hardness:.5});
    assert.equal(f.controller.debug.options.depthMode,'THROUGH');
    f.scope('ALL');assert.equal(f.controller.debug.options.depthMode,'SURFACE');
    f.scope('SELECTED');f.select([]);f.api.getSelectionSummary=()=>({selected:0,reason:'请先框选，空选区不刷全树'});
    f.controller.begin(f.event());assert.equal(f.controller.active,false);assert.equal(f.transactions,0);
    assert.match(f.messages.at(-1)[0],/空选区不刷全树/);
  }finally{f.restore();}
});

test('brush feedback batches identical influence without dropping complete unit axes or changing selection',()=>{
  const f=fixture();try{
    f.api.brushOptions=()=>({radius:600,strength:.8,hardness:1,scope:'THROUGH'});f.scope('ALL');
    f.controller.hoverAt(f.event(400,400));
    const overlay=f.canvas.parentElement.children.find(node=>node.id==='unitCombOverlay'),paths=overlay.children[0].children;
    assert.equal(paths.length,1,'same influence shares one SVG path');
    assert.equal((paths[0].attributes.get('d').match(/M/g)||[]).length,2,'both complete axes remain drawn');
    assert.equal(f.transactions,0);assert.deepEqual([...f.api.getSelectedIds()],['ONE.R1']);
  }finally{f.restore();}
});

test('dense working points reproject exactly after each dab and cancel/restart preserves the prepared complete models',()=>{
  const f=fixture();try{
    const before=structuredClone(f.authoring),runtime=f.branches.map(branch=>branch.points.map(point=>point.toArray()));
    f.api.brushOptions=()=>({radius:600,strength:.8,hardness:1,scope:'THROUGH'});f.scope('ALL');
    let current=[];f.api.showActiveUnits=entries=>{current=entries;};
    const overlay=f.canvas.parentElement.children.find(node=>node.id==='unitCombOverlay');
    const assertProjectedAxes=()=>{
      const actual=overlay.children[0].children.map(node=>node.attributes.get('d')||'').join(' ')
        .match(/[ML]([^ML]+)/g).map(part=>part.slice(1).trim().split(',').map(Number));
      f.group.updateWorldMatrix(true,false);f.camera.updateMatrixWorld();
      const expected=current.flatMap(entry=>entry.displayLines.flatMap(line=>line.map(point=>{
        const projected=point.clone().applyMatrix4(f.group.matrixWorld).project(f.camera);
        return [(projected.x*.5+.5)*800,(.5-projected.y*.5)*800];
      })));
      assert.equal(actual.length,expected.length,'every complete main axis is drawn');
      actual.forEach((point,index)=>point.forEach((value,axis)=>assert.ok(Math.abs(value-expected[index][axis])<1e-8,'feedback uses the current precise working points')));
    };
    f.controller.hoverAt(f.event(500,400));f.controller.begin(f.event(500,400));assertProjectedAxes();
    for(let y=385;y>=310;y-=15){f.controller.move(f.event(500,y));f.flush();assertProjectedAxes();}
    assert.deepEqual(f.authoring,before);assert.deepEqual(f.branches.map(branch=>branch.points.map(point=>point.toArray())),runtime);
    f.controller.cancel();assert.equal(f.transactions,0);
    f.controller.hoverAt(f.event(500,400));f.controller.begin(f.event(500,400));assertProjectedAxes();
    assert.deepEqual(current.map(entry=>entry.sampleLines.map(line=>line.map(point=>point.toArray()))),runtime.slice(1).map(points=>[points]),'new stroke starts from original prepared geometry');
    f.controller.cancel();assert.deepEqual(f.authoring,before);
  }finally{f.restore();}
});

test('ALL respects the resolved isolated child pool before parent deduplication, including internal-only visibility and an empty pool',()=>{
  const f=fixture();try{
    f.authoring.branch_instances[1].parent='ONE.R1';f.branches[2].parentId=1;
    f.branches[1].children.push(2);
    const twig={...f.branches[2],id:3,stableId:'TWO.INTERNAL',parentId:2,children:[],
      points:f.branches[2].points.map(p=>p.clone()),controlPoints:f.branches[2].controlPoints.map(p=>p.clone())};
    f.branches.push(twig);f.branches[2].children.push(3);
    const visible=new Set(['TWO.INTERNAL']);f.api.isVisible=id=>visible.has(id);
    f.api.getTargetIds=()=>resolveUnitEditScope(f.branches,f.authoring.branch_instances,[], 'ALL',{isVisible:f.api.isVisible});
    let shown=[];f.api.showActiveUnits=entries=>{shown=entries;};
    f.scope('ALL');
    const summary=buildUnitAssemblySelection({instances:f.authoring.branch_instances,branches:f.branches,scope:'ALL',isVisible:f.api.isVisible});
    assert.deepEqual([...summary.eligibleRoots],['TWO.R1']);
    assert.equal(shown.length,summary.summary.eligible,'visible child remains brushable with its parent hidden');
    const before=structuredClone(f.authoring.branch_instances);
    f.controller.begin(f.event(500,320));f.controller.move(f.event(500,260));f.controller.end(f.event(500,260));
    assert.equal(f.transactions,1);assert.deepEqual(f.authoring.branch_instances[0],before[0]);
    assert.notDeepEqual(f.authoring.branch_instances[1].frame,before[1].frame,'only the resolved child moves');
    f.api.getTargetIds=()=>new Set();f.controller.refreshTargets();
    assert.equal(shown.length,0);f.controller.begin(f.event());assert.equal(f.controller.active,false);assert.equal(f.transactions,1,'empty resolved ALL pool never expands');
  }finally{f.restore();}
});

test('cancel, mode change and document replacement restore preview exactly without a transaction',()=>{
  const f=fixture();try{
    const before=structuredClone(f.authoring);
    for(const reason of ['cancel','mode','document']){
      f.controller.begin(f.event());f.controller.move(f.event(500,350));f.flush();assert.equal(f.controller.active,true);
      if(reason==='cancel')assert.equal(f.controller.cancel(),true);
      if(reason==='mode'){f.mode('BONE');f.controller.move(f.event(500,340));f.controller.toolChanged();f.mode('UNIT');}
      if(reason==='document'){const get=f.api.getAuthoring;f.api.getAuthoring=()=>({...f.authoring});f.controller.move(f.event(500,340));f.api.getAuthoring=get;}
      assert.equal(f.controller.active,false);assert.equal(f.previews.at(-1).restores,1);assert.equal(f.controls.enabled,true);assert.deepEqual(f.authoring,before);
    }
    assert.equal(f.transactions,0);assert.equal(f.controller.cancel(),false);
  }finally{f.restore();}
});

test('empty selection does not fall back to all; ALL combing adjusts independent units with one transaction',()=>{
  const f=fixture();try{
    f.select([]);f.controller.begin(f.event());assert.equal(f.controller.active,false);assert.equal(f.previews.length,0);
    f.select(['ROOT']);f.controller.begin(f.event());assert.equal(f.controller.active,false);assert.equal(f.previews.length,0);
    f.scope('ALL');const before=structuredClone(f.authoring.branch_instances);
    f.controller.begin(f.event(500,320));for(let y=310;y>=260;y-=10)f.controller.move(f.event(500,y));f.controller.end(f.event(500,260));
    assert.equal(f.transactions,1);for(let n=0;n<2;n++)assert.notDeepEqual(f.authoring.branch_instances[n].frame,before[n].frame);
    f.mode('BONE');assert.equal(f.controller.begin(f.event()),false);assert.equal(f.transactions,1);
  }finally{f.restore();}
});

test('a click or a foreign pointer does not create history or commit another pointer stroke',()=>{
  const f=fixture();try{
    f.controller.begin(f.event());f.controller.end(f.event());assert.equal(f.transactions,0);assert.equal(f.previews[0].restores,1);
    f.controller.begin(f.event());f.controller.move(f.event(500,330,{pointerId:2}));f.controller.end(f.event(500,330,{pointerId:2}));
    assert.equal(f.controller.active,true);assert.equal(f.transactions,0);f.controller.cancel();assert.equal(f.previews[1].restores,1);
  }finally{f.restore();}
});

test('direction selector change cancels a live preview and preserves the current saved document and history',()=>{
  const f=fixture();try {
    const before=structuredClone(f.authoring);
    f.controller.begin(f.event());f.controller.move(f.event(500,360));f.flush();assert.equal(f.controller.active,true);
    f.orientation.value='DOWN';f.orientation.dispatchEvent({type:'change'});
    assert.equal(f.controller.active,false);assert.equal(f.previews[0].restores,1);assert.equal(f.transactions,0);assert.deepEqual(f.authoring,before);assert.equal(f.controls.enabled,true);
    f.controller.begin(f.event());f.controller.move(f.event(500,440));f.controller.end(f.event(500,440));
    assert.equal(f.transactions,1);assert.ok(f.authoring.branch_instances[0].frame.direction[2]<0,'even reverse screen drag steers toward world down');
    Object.assign(f.authoring,f.history[0]);assert.deepEqual(f.authoring,before,'undo restores the full gravity stroke');
  } finally {f.restore();}
});

test('DOWN uses model world transform rather than camera orientation for gravity',()=>{
  const f=fixture();try {
    f.orientation.value='DOWN';f.group.rotation.x=Math.PI/2;f.group.updateMatrixWorld(true);
    f.camera.position.set(0,0,-6);f.camera.lookAt(0,0,0);f.camera.updateMatrixWorld();
    f.controller.begin(f.event(300,400));assert.equal(f.controller.active,true);
    f.controller.move(f.event(300,440));f.controller.end(f.event(300,440));assert.equal(f.transactions,1);
    const instance=f.authoring.branch_instances[0],frame=evaluatedInstanceFrame(instance,f.authoring.branch_library[0].shape,f.branches,{});
    const worldAxis=frame.direction.clone().transformDirection(f.group.matrixWorld);
    assert.ok(worldAxis.z<0,'world down remains negative Z after reversed camera and rotated model container');
  } finally {f.restore();}
});

test('ROLL skips uncalibrated sources with explicit feedback and never fabricates source metadata',()=>{
  const f=fixture();try {
    const before=structuredClone(f.authoring);f.orientation.value='ROLL';f.controller.begin(f.event());
    assert.equal(f.controller.active,false);assert.equal(f.previews.length,0);assert.equal(f.transactions,0);assert.deepEqual(f.authoring,before);
    assert.match(f.messages.at(-1)[0],/未标定悬垂方向.*枝条工作台/);
    f.authoring.branch_library[0].shape.connector.hang_direction=[0,0,1];f.controller.refreshTargets();
    const calibrated=structuredClone(f.authoring);f.controller.begin(f.event());assert.equal(f.controller.active,true);
    f.controller.move(f.event(500,350));f.controller.end(f.event(500,350));assert.equal(f.transactions,1);
    const frame=evaluatedInstanceFrame(f.authoring.branch_instances[0],f.authoring.branch_library[0].shape,f.branches,{});
    assert.ok(frame.direction.distanceTo(new THREE.Vector3(1,0,0))<1e-8,'rolling keeps the complete branch long axis');
    assert.deepEqual(f.authoring.branch_library,calibrated.branch_library);Object.assign(f.authoring,f.history[0]);assert.deepEqual(f.authoring,calibrated);
  } finally {f.restore();}
});

test('direction sampling reads an unselected locked complete unit without changing selection or history, with world-stable references',()=>{
  const f=fixture();try{
    f.nodes.get('unitBrushEffect').value='ALIGN';
    const source=f.authoring.branch_instances[1];source.assembly_locked=true;
    const branch=f.branches[2];branch.points[1].copy(branch.points[0]).add(new THREE.Vector3(0,1,0));
    branch.controlPoints=branch.points.map(p=>p.clone());
    f.group.rotation.z=Math.PI/2;f.group.updateWorldMatrix(true,true);
    f.api.hitUnit=()=>source;
    const before=structuredClone(f.authoring),selection=[...f.api.getSelectedIds()];
    f.nodes.get('unitBrushSample').onclick();
    assert.equal(f.controller.debug.picking,'SAMPLE');assert.equal(f.controller.active,true);
    assert.equal(f.nodes.get('unitBrushSample').attributes.get('aria-pressed'),'true');
    f.controller.begin(f.event(400,300));
    assert.equal(f.controller.debug.picking,'');assert.equal(f.controller.active,false);
    assert.ok(new THREE.Vector3(...f.controller.debug.references.sampleDirectionWorld).distanceTo(new THREE.Vector3(-1,0,0))<1e-10);
    assert.ok(new THREE.Vector3(...f.controller.debug.options.sampleDirection).distanceTo(new THREE.Vector3(0,1,0))<1e-10);
    assert.equal(f.controller.referenceMarkers.parent,f.markerRoot);assert.ok(!f.group.children.includes(f.controller.referenceMarkers),'reference markers are outside exported model');
    assert.equal(f.controller.referenceMarkers.visible,true);assert.equal(f.nodes.get('unitBrushSample').attributes.get('aria-pressed'),'false');
    f.camera.position.set(3,4,6);f.camera.lookAt(0,0,0);f.camera.updateMatrixWorld();
    const sampled=f.controller.debug.references;f.controller.hoverAt(f.event(200,300));
    assert.deepEqual(f.controller.debug.references,sampled,'changing the camera does not turn the sampled reference');
    f.group.rotation.z=0;f.group.updateWorldMatrix(true,true);
    assert.ok(new THREE.Vector3(...f.controller.debug.options.sampleDirection).distanceTo(new THREE.Vector3(-1,0,0))<1e-10,'world sample converts to the current model space');
    assert.deepEqual([...f.api.getSelectedIds()],selection);assert.deepEqual(f.authoring,before);assert.equal(f.transactions,0);assert.equal(f.previews.length,0);
    f.nodes.get('unitBrushEffect').value='TURN';f.nodes.get('unitBrushEffect').dispatchEvent({type:'change'});
    assert.equal(f.controller.referenceMarkers.visible,false,'direction marker only belongs to ALIGN');
  }finally{f.restore();}
});

test('fixed center uses visible-unit depth or target plane and remains fixed across cameras, tools and mode switches',()=>{
  const f=fixture();try{
    f.nodes.get('unitBrushEffect').value='SPREAD';const before=structuredClone(f.authoring);
    f.controls.target.set(.1,.2,2);f.api.hitUnit=()=>null;
    f.nodes.get('unitBrushCenter').onclick();assert.equal(f.controller.debug.picking,'CENTER');
    const click=f.event(650,120),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(click.clientX/800*2-1,1-click.clientY/800*2),f.camera);
    const expected=ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(f.camera.getWorldDirection(new THREE.Vector3()),f.controls.target),new THREE.Vector3());
    f.controller.begin(click);assert.equal(f.controller.active,false);
    const world=new THREE.Vector3(...f.controller.debug.references.centerPointWorld);assert.ok(world.distanceTo(expected)<1e-10);
    assert.equal(f.controller.referenceMarkers.visible,true);f.controller.hide();assert.equal(f.controller.referenceMarkers.visible,true,'hiding hover feedback retains the fixed marker');
    f.camera.position.set(3,2,7);f.camera.lookAt(0,0,0);f.camera.updateMatrixWorld();f.controller.hoverAt(f.event(200,150));
    assert.deepEqual(f.controller.debug.references.centerPointWorld,world.toArray());
    f.controller.toolChanged('SELECT');assert.equal(f.controller.referenceMarkers.visible,false);f.controller.toolChanged('COMB');assert.equal(f.controller.referenceMarkers.visible,true);
    f.mode('BONE');f.controller.refreshTargets();assert.equal(f.controller.referenceMarkers.visible,false);f.mode('UNIT');f.controller.refreshTargets();assert.equal(f.controller.referenceMarkers.visible,true);
    assert.deepEqual(f.authoring,before);assert.equal(f.transactions,0);f.controller.resetReferences();
    assert.equal(f.controller.debug.references.centerPointWorld,null);assert.equal(f.controller.referenceMarkers.visible,false);
  }finally{f.restore();}
});

test('reference picker Esc and right-click cancel without changing old references, document or selection',()=>{
  const f=fixture();try{
    const before=structuredClone(f.authoring),selection=[...f.api.getSelectedIds()];
    f.nodes.get('unitBrushEffect').value='ALIGN';f.nodes.get('unitBrushSample').onclick();
    assert.equal(f.controller.key({key:'Escape'}),true);assert.equal(f.controller.active,false);assert.equal(f.controller.debug.references.sampleDirectionWorld,null);
    f.nodes.get('unitBrushCenter').onclick();let prevented=false;
    f.canvas.dispatchEvent({type:'pointerdown',button:2,preventDefault(){prevented=true;}});
    assert.equal(prevented,true);assert.equal(f.controller.active,false);assert.equal(f.controller.debug.picking,'');
    assert.equal(f.nodes.get('unitBrushCenter').attributes.get('aria-pressed'),'false');
    f.controller.begin(f.event());assert.equal(f.controller.active,false);assert.match(f.messages.at(-1)[0],/取样主轴/);
    f.nodes.get('unitBrushEffect').value='SPREAD';f.controller.begin(f.event());assert.equal(f.controller.active,false);assert.match(f.messages.at(-1)[0],/固定中心/);
    assert.deepEqual(f.authoring,before);assert.deepEqual([...f.api.getSelectedIds()],selection);assert.equal(f.transactions,0);assert.equal(f.previews.length,0);
  }finally{f.restore();}
});

test('every new brush field change cancels a live preview and shuffle only changes the seed',()=>{
  const f=fixture();try{
    const before=structuredClone(f.authoring);
    for(const id of ['unitBrushEffect','unitBrushSpreadMode','unitBrushSizeMode','unitBrushAngleLimit','unitBrushSizeLimit','unitBrushSeed']){
      f.nodes.get('unitBrushEffect').value='TURN';f.controller.begin(f.event());f.controller.move(f.event(500,350));f.flush();assert.equal(f.controller.active,true);
      f.nodes.get(id).dispatchEvent({type:'input'});assert.equal(f.controller.active,false);assert.equal(f.previews.at(-1).restores,1);
      assert.deepEqual(f.authoring,before);assert.equal(f.transactions,0);assert.equal(f.controls.enabled,true);
    }
    const seed=f.nodes.get('unitBrushSeed');seed.value='8';f.nodes.get('unitBrushShuffle').onclick();
    assert.equal(seed.value,'9');assert.equal(f.controller.debug.options.seed,9);assert.deepEqual(f.authoring,before);assert.equal(f.transactions,0);
    f.nodes.get('unitBrushAngleLimit').value='200';f.nodes.get('unitBrushSizeLimit').value='95';
    assert.equal(f.controller.debug.options.angleLimitDegrees,90);assert.equal(f.controller.debug.options.sizeLimitPercent,80);
  }finally{f.restore();}
});

test('whole-size and deterministic jitter strokes preview locally, commit once, undo completely and keep each new stroke clean',()=>{
  const f=fixture();try{
    const before=structuredClone(f.authoring);
    f.nodes.get('unitBrushEffect').value='SCALE';f.nodes.get('unitBrushSizeLimit').value='20';
    f.controller.begin(f.event());assert.equal(f.controller.debug.effect,'SCALE');
    for(let y=390;y>=200;y-=10)f.controller.move(f.event(500,y));f.flush();
    assert.deepEqual(f.authoring,before);assert.equal(f.transactions,0);assert.equal(f.controller.debug.preview.mode,'GPU');
    f.controller.end(f.event(500,200));assert.equal(f.transactions,1);
    const installed=f.authoring.branch_instances[0];assert.ok(installed.scale>1&&installed.scale<=1.2+1e-10);
    for(const field of ['parent','attach','radius_scale','asset_id','pinned_revision'])assert.deepEqual(installed[field],before.branch_instances[0][field]);
    for(const field of ['branch_library','overrides','sculpt_layers','leaf_edits','unit_editing'])assert.deepEqual(f.authoring[field],before[field]);
    assert.ok(!Object.hasOwn(installed,'stroke'),'transient brush baselines never enter the saved document');
    Object.assign(f.authoring,f.history[0]);f.controller.refreshTargets();assert.deepEqual(f.authoring,before);
    f.nodes.get('unitBrushEffect').value='JITTER';f.nodes.get('unitBrushSeed').value='17';
    const results=[];
    for(let n=0;n<2;n++){
      f.controller.begin(f.event());f.controller.move(f.event(500,280));f.controller.end(f.event(500,280));
      results.push(structuredClone(f.authoring.branch_instances[0]));Object.assign(f.authoring,structuredClone(before));f.controller.refreshTargets();
    }
    assert.deepEqual(results[0],results[1],'same seed and identical stroke produce the same whole-unit placement after undo');
    assert.notDeepEqual(results[0].frame,before.branch_instances[0].frame);assert.equal(results[0].scale,before.branch_instances[0].scale);
    assert.equal(f.transactions,3);
  }finally{f.restore();}
});
