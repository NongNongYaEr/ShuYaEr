import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTrunkFormPreviewGeometry,normalizeSettings,DEFAULT_SETTINGS} from '../web/branch-kernel.js';
import {createDirectTrunkForm,createTrunkFormPreset,normalizeTrunkForm} from '../web/trunk-form.js';
import {createTrunkMeshPreset} from '../web/trunk-mesh-density.js';
import {editTrunkSectionLayer,trunkSectionMainPoints} from '../web/trunk-section-layers.js';

const settings=normalizeSettings({...DEFAULT_SETTINGS,leaf_density:0,twist:22});
const branch=()=>({id:0,stableId:'ROOT',parentId:-1,order:0,length:27.6,startRadius:.54,endRadius:.095,
 points:[[0,0,0],[.7,.1,4.7],[.9,-.3,7.1],[.7,-1.3,19.6],[-3.5,.7,25.3]].map(p=>new THREE.Vector3(...p)),
 sections:[],phase:.2,windPhase:.4,windStiffness:1,children:[]});
const profile=count=>Array.from({length:count},(_,i)=>({id:'CHILD_'+i,angle:i*360/count,radius:1+.13*Math.cos(i/count*Math.PI*26)}));
const fixture=()=>createDirectTrunkForm({...createTrunkFormPreset('BUTTRESS'),geometry_version:2,mesh:createTrunkMeshPreset('STANDARD'),
 buttresses:[{id:'ROOT_A',angle:13,length:4.8,height:.32,width:15,strength:1},{id:'ROOT_B',angle:52,length:4.6,height:.26,width:19,strength:1}],
 sections:[{id:'LOWER',t:.227378,radius:1.05,oval:1,roll:57.6,span:.18,profile:profile(75)},
 {id:'EDIT',t:.331068,radius:1.05,oval:1,roll:59.7,span:.18,profile:profile(11)},
 {id:'UPPER',t:.62473,radius:1.05,oval:1,roll:46.1,span:.18,profile:profile(8)}],
 details:[{id:'CREASE',type:'GROOVE',t:.4,angle:310,height:.1,width:8,strength:.2}]});
function compareSharedSkin(live,final){
 const lp=live.attributes.position,fp=final.attributes.position;let shared=0;
 for(const a of live.userData.radiusRings){const b=final.userData.radiusRings.find(r=>Math.abs(r.t-a.t)<1e-12);if(!b)continue;
  assert.equal(a.count,b.count);assert.deepEqual(a.sampleAngles,b.sampleAngles);
  for(let i=0;i<a.count*3;i++)assert.equal(lp.array[a.offset*3+i],fp.array[b.offset*3+i]);shared++;
 }
 assert.ok(shared>=65,`only ${shared} shared rings`);
}
for(const main of [true,false])test(`${main?'main':'child'} drag keeps buttresses and shared skin in the bounded final-view preview`,()=>{
 const b=branch(),original=fixture(),recipe=structuredClone(original),s=recipe.sections[1],points=main?trunkSectionMainPoints(s):s.profile;
 recipe.sections[1]=editTrunkSectionLayer(s,points.map((p,i)=>({...p,radius:p.radius*(i===0?1.2:1)})),{main});
 const before=JSON.stringify(recipe),live=createTrunkFormPreviewGeometry(b,settings,recipe,0,{view:'FINAL',vertexLimit:48000}),
 final=createTrunkFormPreviewGeometry(b,settings,normalizeTrunkForm(JSON.parse(before))),
 baseline=createTrunkFormPreviewGeometry(b,settings,original);
 try{
  assert.ok(live.attributes.position.count<=48000);assert.ok(final.attributes.position.count>48000);
  assert.equal(live.userData.trunkMeshSampling.interactive_preview,true);compareSharedSkin(live,final);
  // The edited upper ring must not remove or alter the lower root ring.
  const root=live.userData.radiusRings[0],source=baseline.userData.radiusRings[0];assert.equal(root.count,source.count);
  assert.deepEqual(live.attributes.position.array.slice(root.offset*3,(root.offset+root.count)*3),baseline.attributes.position.array.slice(source.offset*3,(source.offset+source.count)*3));
  const radius=(g,r)=>{let max=0;for(let i=0;i<r.count;i++)max=Math.max(max,Math.hypot(...Array.from(g.attributes.position.array.slice((r.offset+i)*3,(r.offset+i+1)*3)).map((v,k)=>v-r.center[k])));return max;};
  assert.ok(radius(live,root)>b.startRadius*4,'root flare disappeared during preview');
  assert.equal(JSON.stringify(recipe),before);assert.deepEqual(recipe.buttresses,original.buttresses);assert.deepEqual(recipe.details,original.details);
 }finally{live.dispose();final.dispose();baseline.dispose();}
});
