import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrunkDetail } from '../web/trunk-details.js';
import { TRUNK_DETAIL_COMBINATIONS } from '../web/trunk-detail-presets.js';
import { placeTrunkDetailPreset, redrawTrunkDetail } from '../web/trunk-detail-edit.js';

test('preset movement uses stable preview identities and preserves group spacing at both branch ends',()=>{
  const shape=TRUNK_DETAIL_COMBINATIONS.find(p=>p.id==='builtin-fine-crack').shape;
  const ids=['PLACE_1','PLACE_2'],centre=placeTrunkDetailPreset(shape,{t:.5,angle:355},ids);
  for(const t of [0,.01,.4,.99,1]){
    const moved=placeTrunkDetailPreset(shape,{t,angle:355},ids);
    assert.deepEqual(moved.map(d=>d.id),ids);
    const offset=moved[0].path[0].t-centre[0].path[0].t;
    for(let i=0;i<moved.length;i++){
      assert.equal(moved[i].path.length,centre[i].path.length);
      for(let j=0;j<moved[i].path.length;j++){
        assert.ok(Math.abs(moved[i].path[j].t-centre[i].path[j].t-offset)<1e-12);
        assert.equal(moved[i].path[j].angle,centre[i].path[j].angle);
      }
    }
    const anchors=moved.flatMap(d=>d.path);
    assert.ok(anchors.every(p=>p.t>=0&&p.t<=1));
    assert.ok(new Set(moved[0].path.map(p=>p.t)).size>1,'do not collapse a path at an endpoint');
  }
});

test('redrawing retains identity, type, paused state, seed and dimensions without mutating its source',()=>{
  const detail=createTrunkDetail('SCAR',{id:'EXISTING',enabled:false,t:.3,angle:340,width:17,height:.06,strength:.14,seed:43,path:[{t:.2,angle:330,pressure:.7},{t:.4,angle:350,pressure:1}]});
  const source=structuredClone(detail),redrawn=redrawTrunkDetail(detail,{t:.62,angle:6});
  for(const key of ['id','type','enabled','width','height','strength','seed'])assert.equal(redrawn[key],source[key]);
  assert.deepEqual(redrawn.path,[]);assert.equal(redrawn.t,.62);assert.equal(redrawn.angle,6);assert.deepEqual(detail,source);
});

test('small reusable combinations use the existing six detail operators and compact authored sizes',()=>{
  for(const id of ['builtin-fine-crack','builtin-small-scar','builtin-knot-cluster']){
    const preset=TRUNK_DETAIL_COMBINATIONS.find(p=>p.id===id);assert.ok(preset);
    assert.ok(preset.shape.details.length>=2);
    assert.ok(preset.shape.details.every(d=>d.width<=30&&d.height<=.07));
    assert.ok(preset.shape.details.every(d=>d.path.length<=4));
  }
});
