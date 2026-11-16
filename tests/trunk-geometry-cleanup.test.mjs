import test from 'node:test';
import assert from 'node:assert/strict';
import {importedTrunkFixture,repackFixture,unpackFixture} from './imported-trunk-fixture.mjs';
import {readImportedTrunkGlb} from '../web/imported-trunk-glb.js';
import {prepareImportedTrunk} from '../web/imported-trunk-runtime.js';
import {trunkSurfaceAnchor,evaluateTrunkAnchor} from '../web/imported-trunk-data.js';
import {trunkSourceBinding} from '../web/imported-trunk-binding.js';
import {FIXED_TRUNK_ROOT,trunkWeightRepairs,withTrunkWeightEdits} from '../web/trunk-weight-data.js';
import {createDirectTrunkCleanCopy,inspectDirectTrunkGeometry} from '../web/trunk-geometry-cleanup.js';
import {restoreTrunkEdits,trunkEditable,validateTrunkReady} from '../web/trunk-preparation-data.js';
import {decodeSculptArray,encodeSculptArray,restoreSculptGeometry,sculptIndexHash} from '../web/model-sculpt-patch.js';
import {sculptVertexGroups} from '../web/model-sculpt-topology.js';

async function degenerateTrunk() {
  const file = unpackFixture(await importedTrunkFixture());
  const index = file.json.accessors[file.json.meshes[0].primitives[0].indices];
  const view = file.json.bufferViews[index.bufferView];
  const offset = (view.byteOffset || 0) + (index.byteOffset || 0);
  const bytes = {5121:1,5123:2,5125:4}[index.componentType];
  assert(bytes);
  const vertex = file.bin.readUIntLE(offset, bytes);
  file.bin.writeUIntLE(vertex, offset + bytes, bytes);
  file.bin.writeUIntLE(vertex, offset + 2 * bytes, bytes);
  const original = repackFixture(file);
  return prepareImportedTrunk(await readImportedTrunkGlb(original, {name:'零面积树干.glb'}));
}

test('direct binding cleans a copy while preserving the source GLB, anchors and vertex bindings', async () => {
  const raw = await degenerateTrunk();
  const primitive = raw.primitives[0], vertex = primitive.geometry.index[3];
  const source = withTrunkWeightEdits(raw, new Map([[primitive.id,new Map([[vertex,FIXED_TRUNK_ROOT]])]])).model;
  const original = JSON.stringify(source);
  const anchor = trunkSurfaceAnchor(source,primitive.id,1,[.2,.3,.5]);
  const before = evaluateTrunkAnchor(source,anchor).position.toArray();
  const plan = inspectDirectTrunkGeometry(source);
  assert.equal(plan.faces,1);
  assert.deepEqual(plan.removed.get(primitive.id),[0]);
  const cleaned = validateTrunkReady(createDirectTrunkCleanCopy(source,plan));
  assert.notEqual(cleaned.id,source.id);
  assert.equal(cleaned.triangles,plan.total-1);
  assert.equal(inspectDirectTrunkGeometry(cleaned).faces,0);
  assert.equal(cleaned.source,source.source);
  assert.equal(cleaned.materials,source.materials);
  for(const attribute of ['position','normal','uv','tangent']) {
    assert.equal(cleaned.primitives[0].geometry[attribute],primitive.geometry[attribute]);
  }
  assert.deepEqual(cleaned.primitives[0].geometry.index,primitive.geometry.index.slice(3));
  assert.equal(trunkWeightRepairs(cleaned).get(primitive.id).get(vertex),FIXED_TRUNK_ROOT);
  assert.equal(trunkSourceBinding(cleaned).primitives[0].factors[vertex],0);
  const repairedAnchor = trunkSurfaceAnchor(cleaned,primitive.id,0,[.2,.3,.5]);
  assert.deepEqual(evaluateTrunkAnchor(cleaned,repairedAnchor).position.toArray(),before);
  assert.deepEqual(evaluateTrunkAnchor(source,anchor).position.toArray(),before);
  assert.equal(JSON.stringify(source),original);

  const edits = JSON.parse(JSON.stringify(trunkEditable(cleaned)));
  for (const canonical of [raw,JSON.parse(JSON.stringify(cleaned))]) {
    const restored = restoreTrunkEdits(canonical,edits);
    assert.equal(restored.id,cleaned.id);
    assert.equal(restored.triangles,cleaned.triangles);
    assert.deepEqual(restored.primitives,cleaned.primitives);
    assert.equal(trunkWeightRepairs(restored).get(primitive.id).get(vertex),FIXED_TRUNK_ROOT);
  }
});

test('direct binding reloads a sculpt patch on cleaned topology and excludes retired primitive bindings', async () => {
  const source = await degenerateTrunk();
  const first = source.primitives[0], retired = source.primitives.at(-1);
  const raw = {...source,primitives:source.primitives.map(p => {
    if (p !== retired) return p;
    const vertex = p.geometry.index[0];
    return {...p,geometry:{...p.geometry,index:[vertex,vertex,vertex]}};
  })};
  const {geometry} = first, vertex = geometry.index[3];
  const sculpt = {version:1,primitives:[{
    id:first.id,vertices:geometry.position.length/3,topology:sculptIndexHash(geometry.index),
    ids:encodeSculptArray(Uint32Array.of(vertex)),
    position:encodeSculptArray(Float32Array.of(geometry.position[vertex*3]+.02,...geometry.position.slice(vertex*3+1,vertex*3+3))),
    normal:encodeSculptArray(Float32Array.from(geometry.normal.slice(vertex*3,vertex*3+3))),
    tangent:encodeSculptArray(Float32Array.from(geometry.tangent.slice(vertex*4,vertex*4+4))),
  }]};
  const vertices = raw.primitives.reduce((sum,p)=>sum+p.geometry.position.length/3,0);
  const painted = withTrunkWeightEdits({...raw,
    primitives:restoreSculptGeometry(raw.primitives,sculpt),sculpt,sculptMask:encodeSculptArray(new Uint8Array(vertices).fill(1)),
    binding:{primitive_guides:{[first.id]:['G0'],[retired.id]:['G0']}},
  },new Map([[retired.id,new Map([[0,FIXED_TRUNK_ROOT]])]])).model;
  const cleaned = validateTrunkReady(createDirectTrunkCleanCopy(painted));
  assert(!cleaned.primitives.some(p=>p.id===retired.id));
  assert.equal(cleaned.binding.primitive_guides[retired.id],undefined);
  assert.equal(trunkWeightRepairs(cleaned).size,0);
  assert.equal(cleaned.sculpt.primitives[0].topology,sculptIndexHash(cleaned.primitives[0].geometry.index));
  assert.deepEqual(restoreTrunkEdits(raw,trunkEditable(cleaned)).primitives,cleaned.primitives);
  assert.throws(()=>createDirectTrunkCleanCopy({...raw,primitives:[raw.primitives.at(-1)]}),/全部没有面积/);

  const position = Float32Array.from(painted.primitives.flatMap(p=>p.geometry.position));
  const {groups,representatives} = sculptVertexGroups(position);
  const groupMask = Uint8Array.from(representatives,(_,i)=>i%256);
  const legacy = createDirectTrunkCleanCopy({...painted,sculptMask:encodeSculptArray(groupMask)});
  const retained = cleaned.primitives.reduce((sum,p)=>sum+p.geometry.position.length/3,0);
  assert.deepEqual(decodeSculptArray(legacy.sculptMask,Uint8Array),
    Uint8Array.from(groups.subarray(0,retained),group=>groupMask[group]));
});
