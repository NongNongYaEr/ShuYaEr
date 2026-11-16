import assert from 'node:assert/strict';
import test from 'node:test';
import {createBrushGeometry} from '../material/web/brush-preview-geometry.js';
import {fitManualDecal} from '../material/web/manual-decal-fit.js';

const nominal={widthMeters:.06,heightMeters:.09,depthMeters:.015,maxBendDegrees:60};
const anchor={face:0,bary:[.5,.45,.05]};

function mesh(positions,indices) {
 return {pos:new Float32Array(positions),indices:new Uint32Array(indices),height:1,min:[-1,0,-1]};
}

function plane(back=null) {
 const front=[-1,0,0, 1,0,0, 1,1,0, -1,1,0];
 const faces=[0,1,2, 0,2,3];
 if (back===null) return mesh(front,faces);
 const positions=[...front,...front.map((value,index)=>index%3===2?-back:value)];
 return mesh(positions,[...faces,4,6,5, 4,7,6]);
}

function cylinder(radius) {
 const positions=[],indices=[],sides=32;
 for (const y of [0,1]) {
  for (let i=0;i<sides;i++) {
   const angle=i*Math.PI*2/sides;
   positions.push(radius*Math.cos(angle),y,radius*Math.sin(angle));
  }
 }
 for (let i=0;i<sides;i++) {
  const next=(i+1)%sides;
  indices.push(i,sides+i,sides+next, i,sides+next,next);
 }
 return mesh(positions,indices);
}

test('roomy plane retains nominal size, and a nearby disconnected sheet does not affect its fit',()=>{
 const base={face:0,bary:[.45,.1,.45]};
 const fit=fitManualDecal(plane(),base,1,nominal);
 assert.equal(fit.widthMeters,nominal.widthMeters);
 assert.equal(fit.heightMeters,nominal.heightMeters);
 assert.ok(fit.depthMeters>=.001&&fit.depthMeters<.005);
 assert.deepEqual(fitManualDecal(plane(.002),base,1,nominal),fit);
});

test('a broad connected thin shell reduces depth while preserving its footprint',()=>{
 const sheet=plane(.004);
 sheet.indices=new Uint32Array([...sheet.indices,0,4,5, 0,5,1, 1,5,6, 1,6,2, 2,6,7, 2,7,3, 3,7,4, 3,4,0]);
 const fit=fitManualDecal(sheet,{face:0,bary:[.45,.1,.45]},1,nominal);
 assert.equal(fit.widthMeters,nominal.widthMeters);
 assert.equal(fit.heightMeters,nominal.heightMeters);
 assert.ok(fit.depthMeters>=.001&&fit.depthMeters<.002);
});

test('narrower cylinder fits a smaller decal and caps depth before its back surface',()=>{
 const thick=fitManualDecal(cylinder(.12),anchor,1,nominal);
 const thin=fitManualDecal(cylinder(.014),anchor,1,nominal);
 assert.equal(thick.widthMeters,nominal.widthMeters);
 assert.equal(thick.heightMeters,nominal.heightMeters);
 assert.ok(thin.widthMeters>.005&&thin.widthMeters<thick.widthMeters*.6);
 // The narrow face has more curvature. Compare depth to its shell rather
 // than to the gentler face, whose footprint needs less room to bend.
 assert.ok(thin.depthMeters<.42*.028);
 assert.ok(Math.abs(thin.heightMeters/thin.widthMeters-nominal.heightMeters/nominal.widthMeters)<1e-12);
});

test('provided geometry cache and independent indexing produce identical fits',()=>{
 const indexed=cylinder(.014);
 const prepared=createBrushGeometry(indexed);
 const prebuilt=fitManualDecal(indexed,anchor,1,nominal,prepared);
 assert.deepEqual(fitManualDecal(indexed,anchor,1,nominal),prebuilt);
 assert.deepEqual(fitManualDecal(cylinder(.014),anchor,1,nominal),prebuilt);
});

test('legacy bend angle does not shrink a planar decal before it is placed',()=>{
 const mesh=cylinder(.028);
 assert.deepEqual(fitManualDecal(mesh,anchor,1,{...nominal,maxBendDegrees:5}),
  fitManualDecal(mesh,anchor,1,{...nominal,maxBendDegrees:85}));
});
