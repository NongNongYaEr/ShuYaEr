import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {normalizeSettings,buildBranchAsset,disposeBranchAsset} from '../web/branch-kernel.js';
import {unitPaintRadialDirection,unitPaintPlacement,unitPaintPlacementOccupancy,acceptsUnitPaintPlacement,unitPaintAxisCandidates} from '../web/unit-paint-placement.js';
import {createUnitPaintAxisPicker} from '../web/unit-paint-axis.js';
import {readImportedTrunkGlb} from '../web/imported-trunk-glb.js';
import {prepareImportedTrunk,importedTrunkShape} from '../web/imported-trunk-runtime.js';
import {importedTrunkFixture} from './imported-trunk-fixture.mjs';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {resolveTrunkAttachmentFrames,trunkInstanceSurfaceFrame} from '../web/imported-trunk-attachments.js';
import {sampleLine} from '../web/tree-sculpt.js';
const settings=normalizeSettings({wind_strength:0,leaf_density:0,child_count:0}),branch=(id='ROOT',radius=.25)=>({id:0,stableId:id,points:[new T.Vector3(),new T.Vector3(0,0,4)],length:4,startRadius:radius,endRadius:radius,order:0}),v=(x,y,z)=>new T.Vector3(x,y,z);
test('radial growth covers all azimuths with a stable camera-independent direction',()=>{
 const b=branch(),dirs=Array.from({length:18},(_,n)=>unitPaintRadialDirection(b,n/20,.15));
 assert(dirs.some(d=>d.x>.5)&&dirs.some(d=>d.x<-.5));assert(dirs.some(d=>d.y>.5)&&dirs.some(d=>d.y<-.5));assert(dirs.every(d=>Math.abs(d.z)<1e-12&&Math.abs(d.length()-1)<1e-12));assert.deepEqual(unitPaintRadialDirection(b,.3).toArray(),unitPaintRadialDirection(b,.3).toArray());
});
test('clearance permits empty opposite sides but blocks the same carrier and side without moving its root',()=>{
 const b=branch(),i={parent:'ROOT',attach:.5},p=v(0,0,2),front=unitPaintPlacement(i,b,p,v(1,0,0),settings),back=unitPaintPlacement(i,b,p,v(-1,0,0),settings);
 assert(!acceptsUnitPaintPlacement(front,[front],.15));assert(acceptsUnitPaintPlacement(back,[front],.15));assert.deepEqual(front.position.toArray(),back.position.toArray());assert.deepEqual(p.toArray(),[0,0,2]);
 const other={...front,parent:'NEIGHBOUR'};assert(acceptsUnitPaintPlacement(front,[other],.15));
});
test('thin stems retain physical spacing even on their empty opposite side',()=>{
 const b=branch('ROOT',.01),i={parent:'ROOT',attach:.5},front=unitPaintPlacement(i,b,v(0,0,2),v(1,0,0),settings),back=unitPaintPlacement(i,b,v(0,0,2),v(-1,0,0),settings);assert(!acceptsUnitPaintPlacement(back,[front],.15));
 assert(!acceptsUnitPaintPlacement({...back,clearance:v(NaN,0,0)},[front],.15));
});
test('axis brush returns front and back carriers without requiring a surface ray, but honours radius, depth clip and empty scope',()=>{
 const b=branch(),screen=[{branch:b,points:[{x:10,y:0,z:0},{x:10,y:100,z:0}]},{branch:branch('BACK'),points:[{x:12,y:0,z:.8},{x:12,y:100,z:.8}]},{branch:branch('OUTSIDE'),points:[{x:100,y:0,z:0},{x:100,y:100,z:0}]}];
 assert.deepEqual(unitPaintAxisCandidates(screen,[10,50],20).map(c=>c.parent),['ROOT','BACK']);assert.equal(unitPaintAxisCandidates([],[10,50],20).length,0);assert.equal(unitPaintAxisCandidates(screen.map(e=>({...e,points:e.points.map(p=>({...p,z:2}))})),[10,50],20).length,0);
});
test('saved occupancy evaluates a source model as one complete oriented placement',()=>{
 const b=branch(),shape={connector:{position:[0,0,0],direction:[1,0,0]},branches:[]},a={branch_library:[{id:'SOURCE',revision:1,shape}],branch_instances:[{id:'I',asset_id:'SOURCE',linked:true,parent:'ROOT',attach:.5,angle:90,azimuth:0,roll:0,scale:1,seed:1,variation:0}]},entries=unitPaintPlacementOccupancy(a,[b],settings);
 assert.equal(entries.length,1);assert.equal(entries[0].parent,'ROOT');assert(entries[0].position.distanceTo(v(0,0,2))<1e-12);assert(!acceptsUnitPaintPlacement(entries[0],entries,.15));
});
test('perspective depth correction places the root at the cursor on a slanted carrier',()=>{
 const b=branch(),screen=[{branch:b,points:[{x:10,y:0,z:0,depth:2},{x:20,y:0,z:.8,depth:8}]}],candidate=unitPaintAxisCandidates(screen,[18,0],1)[0];assert(Math.abs(candidate.attach-.5)<1e-12);
});
test('axis-only imported targets preserve fixed topology and follow the requested carrier through save and bending',async()=>{
 const model=prepareImportedTrunk(await readImportedTrunkGlb(await importedTrunkFixture())),{shape,mount}=importedTrunkShape(model),a=normalizeAuthoring({branch_shape:shape,imported_trunks:{version:1,assets:[model],mounts:[mount]}}),asset=buildBranchAsset(settings,null,[],0,a);
 try{const b=asset.masterBranches[0],pick=createUnitPaintAxisPicker(asset.authoring,asset.masterBranches),target=pick(b.stableId,.62);assert.equal(target.parent,b.stableId);assert.equal(target.trunk_anchor.origin,'AXIS');assert.equal(target.trunk_anchor.axis_t,.62);assert(target.surface_frame.position.distanceTo(sampleLine(b.points,.62))<1e-12);
 const i={id:'TEST',parent:target.parent,attach:target.attach,trunk_anchor:JSON.parse(JSON.stringify(target.trunk_anchor)),frame:{...target.frame,position:target.surface_binding.rest.position.toArray(),direction:[1,0,0]},scale:1,seed:1,variation:0};a.branch_instances=[i];resolveTrunkAttachmentFrames(a,asset.masterBranches);assert(trunkInstanceSurfaceFrame(i,b).position.distanceTo(sampleLine(b.points,.62))<1e-12);
 b.points=b.points.map(p=>p.clone().add(v(p.z*.2,0,0)));resolveTrunkAttachmentFrames(a,asset.masterBranches);assert(trunkInstanceSurfaceFrame(i,b).position.distanceTo(sampleLine(b.points,.62))<1e-12);
 }finally{disposeBranchAsset(asset);}
});
