import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { baseBranchAnchorFrame, createBaseBranchAssembly, normalizeBaseBranchAssembly } from '../web/base-branch-assembly.js';
import { rehangBaseBranchPlacements } from '../web/base-branch-surface-edit.js';
import { appendPlantBaseBranchVariant, geometryExtent, normalizePlantUnitPack } from '../web/plant-unit-data.js';

const fixture = new URL('../web/assets/models/base-branch-sample.plantunits.json', import.meta.url);
const sourcePack = normalizePlantUnitPack(JSON.parse(readFileSync(fixture, 'utf8')));
const source = sourcePack.base_branches[0];

function bend(base, id, amount) {
  const move = ([x, y, z]) => [x + amount * y ** 2, y, z];
  const original = base.geometry.position;
  const position = [];
  for (let i = 0; i < original.length; i += 3) position.push(...move(original.slice(i, i + 3).map(value => value * base.size_m)));
  const geometry = {...base.geometry, position};
  const tip = base.tip.map(value => value * base.size_m);
  return {id, name: id, geometry, tip:move(tip), size_m:geometryExtent(geometry).longest, variant_from:{base_id:base.id},
    shape_guides:[{id:'G0',parent:'',attach:0,points:Array.from({length:48},(_, i)=>move(tip.map(value=>value*i/47))),start_radius:.04,end_radius:.01}]};
}

test('new variant appends to latest pack, reuses original atlas and UV, and reopens its saved guide', async () => {
  const extra = {...source, id:'NEWER_BASE'};
  const latest = {...sourcePack, revision: sourcePack.revision + 1, base_branches:[...sourcePack.base_branches, extra]};
  const candidate = bend(source, 'BENT', .4);
  const next = await appendPlantBaseBranchVariant(sourcePack, latest, candidate);
  assert.equal(next.id, sourcePack.id);
  assert.equal(next.revision, latest.revision + 1);
  assert.deepEqual(next.base_branches.map(base => base.id), [...latest.base_branches.map(base=>base.id), 'BENT']);
  assert.deepEqual(next.material, sourcePack.material);
  assert.deepEqual(next.units, sourcePack.units);
  assert.deepEqual(next.base_branches[0], source);
  const reloaded = normalizePlantUnitPack(JSON.parse(JSON.stringify(next)));
  const branch = reloaded.base_branches.at(-1);
  assert.deepEqual(branch.geometry.index, source.geometry.index);
  assert.deepEqual(branch.geometry.uv, source.geometry.uv);
  assert.equal(branch.variant_from.base_id, source.id);
  assert.equal(branch.variant_from.root_id, source.id);
  assert.equal(branch.variant_from.pack_id, sourcePack.id);
  assert.match(branch.variant_from.topology, /^[a-f0-9]{64}$/);
  assert.equal(branch.shape_guides[0].points.length, 48);
  assert.ok(Math.abs(branch.shape_guides[0].start_radius * branch.size_m - .04) < 1e-12);
  const assembly = createBaseBranchAssembly(reloaded, branch.id);
  assert.equal(assembly.guide.length, 32);
  const expected = candidate.tip;
  assert.ok(assembly.guide.at(-1).every((value, i) => Math.abs(value - [expected[1],-expected[0],expected[2]][i]) < 1e-10));
});

test('save rejects a stale source or changed surface indices or UVs', async () => {
  const candidate = bend(source, 'BENT', .4);
  const uv = candidate.geometry.uv.slice(); uv[0] += .05;
  const index = candidate.geometry.index.slice(); [index[0], index[1]] = [index[1], index[0]];
  await assert.rejects(appendPlantBaseBranchVariant(sourcePack, sourcePack, {...candidate, geometry:{...candidate.geometry,uv}}), /UV/);
  await assert.rejects(appendPlantBaseBranchVariant(sourcePack, sourcePack, {...candidate, geometry:{...candidate.geometry,index}}), /UV/);
  await assert.rejects(appendPlantBaseBranchVariant(sourcePack, {...sourcePack, material:{...sourcePack.material,color:''}}, candidate), /已更新/);
  const altered = {...source, size_m: source.size_m * 1.1};
  await assert.rejects(appendPlantBaseBranchVariant(sourcePack, {...sourcePack, base_branches:[altered]}, candidate), /已更新/);
  await assert.rejects(appendPlantBaseBranchVariant(sourcePack, sourcePack, {...candidate,id:source.id}), /ID 重复/);
});

test('same-lineage swaps keep exact face anchors and authored poses on new wood, including a local copy', async () => {
  const copied = await appendPlantBaseBranchVariant(sourcePack, sourcePack, bend(source,'BENT_A',.5), {id:'local-copy',revision:1});
  const branch = copied.base_branches.at(-1);
  const latest = await appendPlantBaseBranchVariant(copied, copied, bend(branch,'BENT_B',-.2));
  assert.equal(latest.base_branches.at(-1).variant_from.root_id, source.id);
  const original = createBaseBranchAssembly(sourcePack, source.id);
  const first = createBaseBranchAssembly(copied, branch.id);
  const second = createBaseBranchAssembly(latest, 'BENT_B');
  let placement;
  for (let face = 0; face < source.geometry.index.length / 3; face++) {
    const candidate = {id:'mounted',unit_id:original.units[0].id,face,barycentric:[.2,.3,.5],roll:33,scale:1.4,rotation:[0,.6,0,.8]};
    const before = baseBranchAnchorFrame(original,candidate), after = baseBranchAnchorFrame(first,candidate);
    if (before && after && before.position.distanceTo(after.position) > .04) { placement=candidate; break; }
  }
  assert.ok(placement);
  const prior = normalizeBaseBranchAssembly({...original,placements:[placement]});
  const swap = rehangBaseBranchPlacements(prior, first);
  assert.equal(swap.exactCount, 1);
  assert.deepEqual(swap.placements, prior.placements);
  assert.deepEqual(swap.guide, first.guide);
  const reswap = rehangBaseBranchPlacements({...first,placements:swap.placements}, second);
  assert.equal(reswap.exactCount, 1);
  assert.deepEqual(reswap.placements, prior.placements);
  const unrelated = {...first, pack_id:'unrelated',base:{...first.base,id:'independent',variant_from:undefined}};
  assert.equal(rehangBaseBranchPlacements(prior, unrelated).exactCount,0);
});
