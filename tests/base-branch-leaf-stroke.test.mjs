import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { baseBranchAnchor, baseBranchAnchorFrame, baseBranchGeometry, createBaseBranchAssembly } from '../web/base-branch-assembly.js';
import { canPlaceBaseBranchLeaf, createBaseBranchLeafStroke } from '../web/base-branch-leaf-stroke.js';
import { createBaseBranchSurfaceProjector } from '../web/base-branch-surface-edit.js';

const point = (x, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const metre = .002;
const forward = point(0,0,1), backward = point(0,0,-1);
const continuousSurface = (x, y) => ({ point: point(x * metre, y * metre), normal: forward, metresPerPixel: metre });

test('leaf strokes resample a fast drag by physical distance and respect existing anchors and capacity', () => {
  const placed = [];
  const brush = createBaseBranchLeafStroke({ spacing: .04, capacity: 4, existing: [continuousSurface(20,0)], add: ({ point: hit }) => placed.push(hit.x) });
  brush.move(0, 0, continuousSurface);
  brush.move(140, 0, continuousSurface);
  brush.move(0, 0, continuousSurface);
  assert.deepEqual(placed.map(x => Math.round(x * 100)), [0, 8, 12, 16]);
});

test('a later pass can fill wood closer than the stroke interval or paint the other side, while exact repeats stay blocked', () => {
  const spacing = .08;
  const first = continuousSurface(0,0);
  const opposite = { ...first, point: point(0,0,-.003), normal: backward };
  const nearby = continuousSurface(20,0);
  const sameSideOverlap = continuousSurface(1,0);
  const seamDuplicate = { ...first, normal: backward };
  const anchors = [first];
  assert.ok(canPlaceBaseBranchLeaf(opposite,anchors,spacing));
  assert.ok(canPlaceBaseBranchLeaf(nearby,anchors,spacing));
  assert.ok(!canPlaceBaseBranchLeaf(sameSideOverlap,anchors,spacing));
  assert.ok(!canPlaceBaseBranchLeaf(seamDuplicate,anchors,spacing));
  for (const target of [opposite,nearby,sameSideOverlap,seamDuplicate]) {
    const added = [];
    const brush = createBaseBranchLeafStroke({ spacing, capacity: 5, existing: anchors, add: hit => added.push(hit) });
    brush.move(0,0,() => target);
    assert.equal(added.length, Number(canPlaceBaseBranchLeaf(target,anchors,spacing)));
  }
});

test('the leaf stroke resets its spacing at empty pixels and on a jump to wood behind the surface', () => {
  const placed = [];
  const brush = createBaseBranchLeafStroke({ spacing: .06, capacity: 50, add: ({ point: hit }) => placed.push(hit) });
  const surface = (x, y) => {
    if (x > 22 && x < 59) return null;
    const hit = continuousSurface(x, y);
    if (x >= 90) hit.point.z = .5;
    return hit;
  };
  brush.move(0, 0, surface);
  brush.move(120, 0, surface);
  brush.move(0, 0, surface);
  assert.deepEqual(placed.map(p => [Math.round(p.x * 100), p.z]), [[0, 0], [12, 0], [18, .5], [24, .5]]);
});

const kit = new URL('../assets/plant-unit-library/5ea361caa1bafd3eecae12733d39f80793519b9a5b9399a8f62e8434199df61a.plantunits.json', import.meta.url);

test('a scaled real base branch returns the nearest face, barycentric anchor and normal through its surface index', () => {
  const pack = JSON.parse(readFileSync(kit, 'utf8'));
  const base = pack.base_branches.find(item => item.name === '基础枝 13');
  assert.ok(base, pack.name);
  const assembly = { ...createBaseBranchAssembly(pack, base.id), scale: 1.75 };
  const geometry = baseBranchGeometry(assembly);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const projector = createBaseBranchSurfaceProjector(assembly);
  const caster = new THREE.Raycaster();
  const targets = [];
  const positions = geometry.getAttribute('position');
  geometry.computeBoundingBox();
  for (let index = 0; index < 120; index++) {
    const vertex = (7919 * index) % positions.count;
    const aim = new THREE.Vector3().fromBufferAttribute(positions, vertex).add(point(.000135, -.000157, .00017));
    const origin = aim.clone().add(point(.71, -.84, 2.7));
    targets.push(new THREE.Ray(origin, aim.clone().sub(origin).normalize()));
  }
  for (const side of [THREE.DoubleSide, THREE.FrontSide, THREE.BackSide]) {
    material.side = side;
    let hits = 0;
    for (const ray of targets) {
      caster.ray.copy(ray);
      const expected = caster.intersectObject(mesh, false)[0];
      const actual = projector.raycast(ray, { side, withNormal: true });
      assert.equal(Boolean(actual), Boolean(expected));
      if (!actual) continue;
      hits++;
      const anchor = baseBranchAnchor(assembly, expected.faceIndex, expected.point);
      assert.equal(actual.anchor.face, anchor.face);
      assert.ok(actual.anchor.barycentric.every((n, i) => Math.abs(n - anchor.barycentric[i]) < 1e-4));
      assert.ok(actual.point.distanceTo(expected.point) < 1e-6);
      assert.ok(actual.normal.distanceTo(baseBranchAnchorFrame(assembly, actual.anchor).normal) < 1e-6);
    }
    assert.ok(hits > 30);
  }
  geometry.dispose();
  material.dispose();
});
