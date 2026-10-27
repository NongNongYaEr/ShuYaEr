import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSurfaceGrowth } from '../web/surface-growth-data.js';
import { createSurfaceGrowth } from '../web/surface-growth-geometry.js';
import { simplifyGuideAnchors } from '../web/surface-guide-shape.js';
const wall = { id: 'guide-wall', position: [-4,0,0,4,0,0,4,0,8,-4,0,8], index: [0,1,2,0,2,3] };
const vine = { stem:.004, leaf_size:.08 };
const fixture = guides => normalizeSurfaceGrowth({mesh:wall,spread:.15,density:2,guides});
const guide = (id, x = 0) => ({id,flow:'DOWN',anchors:[{face:1,point:[x,0,7]},{face:1,point:[x-.4,0,5]},{face:0,point:[x,0,2]}],bundle:{count:3,width:.8,follow:.7}});
const run = s => createSurfaceGrowth(s,vine,721).branches;

test('downward bundles produce separate connected strands on the front of the wall and taper toward their tips',()=>{
  const s=fixture([guide('down')]), branches=run(s), mains=branches.filter(b=>!b.parent);
  assert.equal(mains.length,3);
  for(const b of mains){assert.ok(b.points[0][2]>b.points.at(-1)[2]+4);assert.ok(b.start_radius>b.end_radius);assert.ok(b.points.every(p=>Math.abs(p[1]+.012)<1e-6));}
  assert.ok(Math.max(...mains.map(b=>b.points[0][0]))-Math.min(...mains.map(b=>b.points[0][0]))>.7);
  for(const child of branches.filter(b=>b.parent)){const parent=branches.find(b=>b.id===child.parent);assert.ok(parent.points.some(p=>Math.hypot(...p.map((v,i)=>v-child.points[0][i]))<1e-6));}
});
test('editing, disabling, and deleting one bundle leave another bundle identical; JSON reload retains settings and geometry',()=>{
  const s=fixture([guide('a',-1),guide('b',1)]), before=run(s).filter(b=>b.id.startsWith('S_b'));
  s.guides[0].bundle.width=1.5;s.guides[0].bundle.count=5;s.guides[0].anchors[1].point[0]-=.3;
  assert.deepEqual(run(s).filter(b=>b.id.startsWith('S_b')),before);
  s.guides[0].enabled=false;assert.deepEqual(run(s),before);
  assert.deepEqual(run(normalizeSurfaceGrowth(JSON.parse(JSON.stringify(s)))),run(s));
  s.guides.shift();assert.deepEqual(run(s),before);
});
test('single root direction and reversing hand-drawn anchors determine the growing end without flipping model coordinates',()=>{
  const s=fixture([{id:'root',flow:'DOWN',anchors:[{face:1,point:[0,0,5]}]}]);
  let b=run(s)[0];assert.ok(b.points.at(-1)[2]<b.points[0][2]-1.9);
  s.guides[0].flow='UP';b=run(s)[0];assert.ok(b.points.at(-1)[2]>b.points[0][2]+1.9);
  const a=fixture([guide('a')]);a.guides[0].anchors.reverse();b=run(a)[0];assert.ok(b.points.at(-1)[2]>b.points[0][2]);
});
test('bundle width changes geometry, follow strength changes bends, legacy routes stay single, and invalid counts are bounded',()=>{
  const s=fixture([guide('a')]), original=run(s);s.guides[0].bundle.width=1.4;assert.notDeepEqual(run(s),original);
  const wide=run(s);s.guides[0].bundle.follow=1;assert.notDeepEqual(run(s),wide);
  delete s.guides[0].bundle;assert.equal(run(normalizeSurfaceGrowth(s)).filter(b=>!b.parent).length,1);
  s.guides[0].bundle={count:999,width:-2,follow:5};assert.deepEqual(normalizeSurfaceGrowth(s).guides[0].bundle,{count:8,width:0,follow:1});
});
test('hand drawing simplification retains deliberate bends and exact endpoints with far fewer editable controls',()=>{
  const samples=Array.from({length:100},(_,i)=>({face:0,point:[i/20,0,i<50?i/20:(100-i)/20]}));
  const short=simplifyGuideAnchors(samples);assert.ok(short.length<=4);assert.deepEqual(short[0],samples[0]);assert.deepEqual(short.at(-1),samples.at(-1));assert.equal(samples.length,100);
});
test('downward point planting follows an inclined retaining wall and never jumps onto a nearby disconnected back face',()=>{
  const s=normalizeSurfaceGrowth({mesh:{id:'slope',position:[-4,0,0,4,0,0,4,2,8,-4,2,8,-4,.1,0,4,.1,0,4,2.1,8,-4,2.1,8],index:[0,1,2,0,2,3,4,5,6,4,6,7]},length:4,density:0,guides:[{id:'down',flow:'DOWN',bundle:{count:3,width:1,follow:.6},anchors:[{face:1,point:[0,1.75,7]}]}]});
  const branches=run(s);assert.equal(branches.length,3);
  for(const b of branches){assert.ok(b.points.at(-1)[2]<b.points[0][2]-3);assert.ok(b.points.every(p=>p[1]-p[2]/4<0&&p[1]-p[2]/4>-.02));}
});
