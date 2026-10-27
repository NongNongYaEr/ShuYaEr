import test from 'node:test';
import assert from 'node:assert/strict';
import {moveTrunkSectionPoints} from '../web/trunk-section-point-group.js';
import {normalizeDirectTrunkSectionProfile} from '../web/trunk-form.js';
const profile=()=>Array.from({length:16},(_,i)=>({id:'P'+i,angle:i*22.5,radius:2}));
const xy=p=>({x:Math.cos(p.angle*Math.PI/180)*p.radius,y:Math.sin(p.angle*Math.PI/180)*p.radius});
const options={positionAt:xy,radiusFor:(p,angle,radius)=>radius};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('plane translation moves selected points by a common vector and leaves unrelated IDs and values exact',()=>{
 const p=profile(),before=structuredClone(p),ids=['P3','P4','P5'],r=moveTrunkSectionPoints(p,ids,{...options,dx:.07,dy:.13});assert.equal(r.fraction,1);
 for(let i=0;i<p.length;i++){if(ids.includes(p[i].id)){close(xy(r.profile[i]).x-xy(p[i]).x,.07);close(xy(r.profile[i]).y-xy(p[i]).y,.13);}else assert.deepEqual(r.profile[i],p[i]);}assert.deepEqual(p,before);
});
test('periodic seam groups preserve identities through normalization and wrap ordering',()=>{
 const p=profile(),ids=['P15','P0','P1'],r=moveTrunkSectionPoints(p,ids,{...options,dx:.08,dy:-.1});assert.equal(r.fraction,1);
 const saved=normalizeDirectTrunkSectionProfile(r.profile);assert.equal(saved.length,16);for(const id of ids){const a=xy(p.find(p=>p.id===id)),b=xy(saved.find(p=>p.id===id));close(b.x-a.x,.08);close(b.y-a.y,-.1);}assert.deepEqual(normalizeDirectTrunkSectionProfile(JSON.parse(JSON.stringify(saved))),saved);
});
test('ordering contact clamps the whole group by one fraction and reverse motion responds immediately',()=>{
 const p=profile(),ids=['P2','P3','P4'],r=moveTrunkSectionPoints(p,ids,{...options,dx:-4,dy:1});assert.ok(r.fraction>0&&r.fraction<1);
 for(const id of ids){const a=xy(p.find(p=>p.id===id)),b=xy(r.profile.find(p=>p.id===id));close(b.x-a.x,-4*r.fraction);close(b.y-a.y,r.fraction);}
 const reverse=moveTrunkSectionPoints(p,ids,{...options,dx:-4*r.fraction+.01,dy:r.fraction});assert.ok(reverse.fraction>0);assert.notDeepEqual(reverse.profile,r.profile);
 const sorted=normalizeDirectTrunkSectionProfile(r.profile);assert.equal(sorted.length,p.length);assert.ok(sorted.every((p,i)=>i===0||p.angle-sorted[i-1].angle>=.2-1e-8));
});
test('surface compensation converts actual physical points to existing radius fields',()=>{
 const p=profile(),surface=a=>3+.2*Math.cos(a*3),ids=['P4','P5'],positionAt=p=>{const a=p.angle*Math.PI/180,r=p.radius*surface(a);return {x:Math.cos(a)*r,y:Math.sin(a)*r};},r=moveTrunkSectionPoints(p,ids,{positionAt,radiusFor:(p,a,size)=>size/surface(a),dx:.03,dy:.1});assert.equal(r.fraction,1);
 for(const id of ids){const a=positionAt(p.find(p=>p.id===id)),b=positionAt(r.profile.find(p=>p.id===id));close(b.x-a.x,.03);close(b.y-a.y,.1);}for(const p of r.profile)assert.deepEqual(Object.keys(p).sort(),['angle','id','radius']);
});
test('invalid, empty, stale or zero moves retain exact source values and radius limits stop a group',()=>{
 const p=profile();for(const args of [{dx:NaN,dy:1},{dx:0,dy:0},{dx:1,dy:1,positionAt:()=>null}])assert.deepEqual(moveTrunkSectionPoints(p,['P0'],{...options,...args}).profile,p);
 assert.deepEqual(moveTrunkSectionPoints(p,[],{...options,dx:1}).profile,p);assert.deepEqual(moveTrunkSectionPoints(p,['stale'],{...options,dx:1}).profile,p);
 const r=moveTrunkSectionPoints(p,p.map(p=>p.id),{...options,dx:200,max:4});assert.ok(r.fraction<1);assert.ok(r.profile.every(p=>p.radius>=.001&&p.radius<=4));
});
