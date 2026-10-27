import test from 'node:test';
import assert from 'node:assert/strict';
import {BARK_PRESETS,DEFAULT_BARK_PRESET,normalizeBarkMaterial,normalizeBarkPreset} from '../web/bark-materials.js';
import {libraryBarkCatalog} from '../web/library-bark.js';
import {createBarkPreviewSample} from '../web/bark-preview-sample.js';

test('all built-in and missing-size bark recipes use 2 by 2.5 metres; saved explicit dimensions survive',()=>{
  for(const recipe of [DEFAULT_BARK_PRESET,...BARK_PRESETS,...libraryBarkCatalog.map(r=>r.preset),normalizeBarkMaterial({style:'IMPORTED'})]){
    assert.equal(recipe.scale_u_m,2);assert.equal(recipe.scale_v_m,2.5);
  }
  const saved=normalizeBarkMaterial({...BARK_PRESETS[0],scale_u_m:.31,scale_v_m:1.17});
  assert.deepEqual(normalizeBarkMaterial(JSON.parse(JSON.stringify(saved))),saved);
  const personal=normalizeBarkPreset({id:'bark-0123456789abcdef0123456789abcdef',name:'旧个人配方',shape:saved});
  assert.deepEqual(personal.recipe,saved);
});

test('material sample is a smooth finite metre-sized loft with continuous physical UVs and independent geometry',()=>{
  const a=createBarkPreviewSample(),b=createBarkPreviewSample();
  try{
    const rings=a.geometry.userData.radiusRings;
    assert.ok(rings.length>=40);assert.equal(rings[0].count,64);
    assert.equal(a.branch.points[0].z,0);assert.equal(a.branch.points.at(-1).z,3);
    for(let i=1;i<a.branch.points.length-1;i++){
      const before=a.branch.points[i].clone().sub(a.branch.points[i-1]).normalize(),after=a.branch.points[i+1].clone().sub(a.branch.points[i]).normalize();
      assert.ok(before.angleTo(after)<.02,'no polygonal elbows in the material sample');
    }
    assert.equal(a.geometry.userData.barkSurface.version,1);
    for(const name of ['position','normal','uv','tangent'])assert.ok(a.geometry.attributes[name].array.every(Number.isFinite));
    assert.deepEqual(a.geometry.attributes.position.array,b.geometry.attributes.position.array);
    a.geometry.attributes.position.array[0]+=10;assert.notEqual(a.geometry.attributes.position.array[0],b.geometry.attributes.position.array[0]);
    assert.ok(a.geometry.attributes.position.count<7000);
  }finally{a.geometry.dispose();b.geometry.dispose();}
});
