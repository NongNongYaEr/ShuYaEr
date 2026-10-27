import test from 'node:test';
import assert from 'node:assert/strict';
import {trunkSectionPointPivot,transformTrunkSectionPoints} from '../web/trunk-section-point-transform.js';
import {normalizeDirectTrunkSectionProfile} from '../web/trunk-form.js';
import {trunkSectionMainPoints,editTrunkSectionLayer} from '../web/trunk-section-layers.js';
const profile=()=>Array.from({length:16},(_,i)=>({id:'P'+i,angle:i*22.5,radius:2}));
const xy=p=>({x:Math.cos(p.angle*Math.PI/180)*p.radius,y:Math.sin(p.angle*Math.PI/180)*p.radius});
const options={positionAt:xy,radiusFor:(p,a,size)=>size};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('pivot uses actual selected identities, centroid for groups and origin for a single point',()=>{
 const p=profile();assert.deepEqual(trunkSectionPointPivot(p,['P2','stale'],xy),{x:0,y:0,scope:'SECTION'});
 const pivot=trunkSectionPointPivot(p,['P2','P4','P2'],xy);close(pivot.x,(xy(p[2]).x+xy(p[4]).x)/2);close(pivot.y,(xy(p[2]).y+xy(p[4]).y)/2);
 assert.equal(trunkSectionPointPivot(p,[],xy),null);assert.equal(trunkSectionPointPivot(p,['stale'],xy),null);
});
test('group rotation is rigid around its fixed centroid and unselected points remain exact',()=>{
 const p=profile(),ids=['P2','P3','P4'],pivot=trunkSectionPointPivot(p,ids,xy),before=structuredClone(p),r=transformTrunkSectionPoints(p,ids,{...options,pivot,action:'ROTATE',value:8});assert.equal(r.value,8);assert.equal(r.limited,false);
 const a=8*Math.PI/180;for(let i=0;i<p.length;i++){if(!ids.includes(p[i].id)){assert.deepEqual(r.profile[i],p[i]);continue;}const q=xy(p[i]),n=xy(r.profile[i]);close(n.x,pivot.x+(q.x-pivot.x)*Math.cos(a)-(q.y-pivot.y)*Math.sin(a));close(n.y,pivot.y+(q.x-pivot.x)*Math.sin(a)+(q.y-pivot.y)*Math.cos(a));}
 assert.deepEqual(p,before);
});
test('scale uses the same selected centroid, preserves spacing ratios and never scales unselected points',()=>{
 const p=profile(),ids=['P15','P0','P1'],pivot=trunkSectionPointPivot(p,ids,xy),r=transformTrunkSectionPoints(p,ids,{...options,pivot,action:'SCALE',value:Math.log(1.2)});assert.equal(r.limited,false);
 for(let i=0;i<p.length;i++){if(!ids.includes(p[i].id)){assert.deepEqual(r.profile[i],p[i]);continue;}const q=xy(p[i]),n=xy(r.profile[i]);close(n.x,pivot.x+(q.x-pivot.x)*1.2);close(n.y,pivot.y+(q.y-pivot.y)*1.2);}
 assert.equal(normalizeDirectTrunkSectionProfile(r.profile).length,p.length);
});
test('single point rotation and scale use section origin and obey neighbouring order',()=>{
 const p=profile(),pivot=trunkSectionPointPivot(p,['P0'],xy),r=transformTrunkSectionPoints(p,['P0'],{...options,pivot,action:'ROTATE',value:3});close(r.profile[0].angle,3);close(r.profile[0].radius,2);
 const s=transformTrunkSectionPoints(p,['P0'],{...options,pivot,action:'SCALE',value:Math.log(1.4)});close(s.profile[0].radius,2.8);close(s.profile[0].angle,0);
});
test('large rotation stops at the first contact rather than jumping through neighbours; reverse responds immediately',()=>{
 const p=profile(),ids=['P0'],pivot={x:0,y:0},r=transformTrunkSectionPoints(p,ids,{...options,pivot,action:'ROTATE',value:360});assert.equal(r.limited,true);close(r.value,22.3);
 const back=transformTrunkSectionPoints(p,ids,{...options,pivot,action:'ROTATE',previous:r.value,value:r.value-1});close(back.value,r.value-1);assert.equal(back.limited,false);
 assert.deepEqual(transformTrunkSectionPoints(p,ids,{...options,pivot,action:'ROTATE',previous:back.value,value:0}).profile,p);
});
test('all selected points may rotate beyond the seam with periodic identities retained',()=>{
 const p=profile(),ids=p.map(p=>p.id),pivot={x:0,y:0},r=transformTrunkSectionPoints(p,ids,{...options,pivot,action:'ROTATE',value:205});assert.equal(r.value,205);assert.equal(r.limited,false);const normalized=normalizeDirectTrunkSectionProfile(r.profile);assert.equal(normalized.length,p.length);
 for(const q of p)close(normalized.find(n=>n.id===q.id).angle,(q.angle+205)%360);
 assert.deepEqual(normalizeDirectTrunkSectionProfile(JSON.parse(JSON.stringify(normalized))),normalized);
});
test('radius and layer constraints limit the whole scale by one value, including immediate reversal',()=>{
 const p=profile(),ids=p.map(p=>p.id),pivot={x:0,y:0},r=transformTrunkSectionPoints(p,ids,{...options,pivot,action:'SCALE',value:Math.log(10),max:3});assert.equal(r.limited,true);close(Math.exp(r.value),1.5);assert.ok(r.profile.every(p=>p.radius<=3));
 const back=transformTrunkSectionPoints(p,ids,{...options,pivot,action:'SCALE',previous:r.value,value:r.value-.05,max:3});assert.equal(back.limited,false);assert.ok(back.profile[0].radius<3);
 const layer=transformTrunkSectionPoints(p,ids,{...options,pivot,action:'SCALE',value:Math.log(2),accept:points=>points.every(p=>p.radius<=2.1)});assert.equal(layer.limited,true);close(layer.profile[0].radius,2.1);
});
test('physical surface compensation is shared by rotate/scale and keeps the existing point schema',()=>{
 const p=profile(),ids=['P0','P1'],surface=a=>3+.2*Math.cos(a*3),positionAt=p=>{const q=xy(p),s=surface(p.angle*Math.PI/180);return{x:q.x*s,y:q.y*s};},pivot=trunkSectionPointPivot(p,ids,positionAt),r=transformTrunkSectionPoints(p,ids,{positionAt,radiusFor:(p,a,size)=>size/surface(a),pivot,action:'ROTATE',value:2});assert.equal(r.limited,false);
 for(const n of r.profile){assert.deepEqual(Object.keys(n).sort(),['angle','id','radius']);if(!ids.includes(n.id))assert.deepEqual(n,p.find(p=>p.id===n.id));}
 const q=positionAt(p[0]),n=positionAt(r.profile[0]),a=2*Math.PI/180;close(n.x,pivot.x+(q.x-pivot.x)*Math.cos(a)-(q.y-pivot.y)*Math.sin(a));
});
test('main transforms carry child shape; child transforms retain main controls and unrelated child values',()=>{
 const section={profile:profile()},main=trunkSectionMainPoints(section),ids=main.slice(2,5).map(p=>p.id),pivot=trunkSectionPointPivot(main,ids,xy),r=transformTrunkSectionPoints(main,ids,{...options,pivot,action:'ROTATE',value:4}),next=editTrunkSectionLayer(section,r.profile,{main:true});assert.ok(next);assert.equal(next.profile.length,section.profile.length);assert.notDeepEqual(next.profile,section.profile);
 const fine=transformTrunkSectionPoints(next.profile,['P2'],{...options,pivot:{x:0,y:0},action:'SCALE',value:.04}),refined=editTrunkSectionLayer(next,fine.profile);assert.deepEqual(refined.profile_coarse,next.profile_coarse);for(const p of refined.profile)if(p.id!=='P2')assert.deepEqual(p,next.profile.find(n=>n.id===p.id));
});
test('empty, stale, invalid and zero transforms cannot author a shape',()=>{
 const p=profile();for(const ids of [[],['stale']])assert.deepEqual(transformTrunkSectionPoints(p,ids,{...options,pivot:{x:0,y:0},action:'ROTATE',value:20}).profile,p);
 for(const extra of [{value:NaN},{pivot:{x:NaN,y:0}},{action:'invalid'},{positionAt:()=>null},{value:0}])assert.deepEqual(transformTrunkSectionPoints(p,['P0'],{...options,pivot:{x:0,y:0},action:'ROTATE',value:20,...extra}).profile,p);
});
