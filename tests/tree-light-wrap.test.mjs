import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../web/vendor/three.module.min.js';
import { createRouteClearance } from '../web/v080-lights/route-clearance.js';
import { trunkSurfaceIndex } from '../web/v080-lights/surface.js';
import { wrapImportedGuide } from '../web/v080-lights/wrap.js';

const pitch = .08;
const radius = .00245;
const gap = .0018;

function indexGeometry(geometry) {
  return trunkSurfaceIndex(THREE, {
    matrix: new THREE.Matrix4().toArray(),
    primitives: [{position: geometry.attributes.position.array, index: geometry.index.array}],
  });
}

function bend(station) {
  if (station <= .6) return [[0, 0, station], [0, 0, 1]];
  const angle = (station - .6) / 1.2;
  return [[1.2 * (1 - Math.cos(angle)), 0, .6 + 1.2 * Math.sin(angle)],
    [Math.sin(angle), 0, Math.cos(angle)]];
}

function bentGeometry(width) {
  const rings = 120, sides = 64, position = [], indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    const [center, tangent] = bend(ring * 2.25 / rings);
    for (let side = 0; side < sides; side++) {
      const angle = side * 2 * Math.PI / sides, x = width * Math.cos(angle);
      position.push(center[0] + x * tangent[2], width * Math.sin(angle), center[2] - x * tangent[0]);
      if (ring < rings) {
        const a = ring * sides + side, b = ring * sides + (side + 1) % sides;
        indices.push(a, b, b + sides, a, b + sides, a + sides);
      }
    }
  }
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  mesh.setIndex(indices);
  return mesh;
}

function verifyCordClearance(surface, tracks) {
  const point = new THREE.Vector3();
  for (const track of tracks) {
    for (let i = 1; i < track.length; i++) {
      for (const position of [.25, .5, .75]) {
        point.lerpVectors(track[i - 1].point, track[i].point, position);
        const distance = surface.distance(point, .03);
        assert.ok(distance >= radius - 1e-7, 'the cord never intersects a bark triangle');
        assert.ok(distance < .03, 'continued segments stay attached to the bark');
      }
    }
  }
}

test('a wide faceted trunk keeps one continuous bark-hugging strip', () => {
  const width = 1.4;
  const geometry = new THREE.CylinderGeometry(width, width, 2.5, 18, 1, true)
    .rotateX(Math.PI / 2).translate(0, 0, 1.25);
  const surface = indexGeometry(geometry);
  const guide = {id: 'wide', points: [[0, 0, 0], [0, 0, 2.5]], start_radius: width, end_radius: width};
  const {tracks} = wrapImportedGuide(THREE, surface, guide, {
    pitch, radius, gap, from: 0, to: 1, range: [.1, 2.4], sections: [],
  });
  assert.equal(tracks.length, 1);
  assert.ok(tracks[0].at(-1).station - tracks[0][0].station > 2.29);
  verifyCordClearance(surface, tracks);
});

test('turns stay separated where a sparsely sampled trunk bends', () => {
  const width = .35;
  const surface = indexGeometry(bentGeometry(width));
  const guide = {id: 'bend', points: [0, .58, .9, 1.35, 1.47, 1.9, 2.25].map(s => bend(s)[0]),
    start_radius: width, end_radius: width};
  const {tracks} = wrapImportedGuide(THREE, surface, guide, {
    pitch, radius, gap, from: 0, to: 1, range: [.15, 1.68], sections: [],
  });
  const track = tracks[0];
  assert.ok(track.at(-1).station - track[0].station > 1.32, 'one strip spans the bend');
  const nextTurn = new THREE.Vector3();
  let next = 1;
  for (const current of track) {
    const station = current.station + pitch;
    while (next < track.length && track[next].station < station) next++;
    if (next === track.length) break;
    const a = track[next - 1], b = track[next];
    nextTurn.lerpVectors(a.point, b.point, (station - a.station) / (b.station - a.station));
    assert.ok(current.point.distanceTo(nextTurn) > pitch / 2,
      'adjacent turns retain useful spacing around the bend');
  }
  verifyCordClearance(surface, tracks);
});

function ridgedBark({cut = false} = {}) {
  const width = .35, height = 1.25, depth = .16;
  const circle = Math.PI * 2, sides = 80, layers = 24;
  const ridge = .08, wall = .007;
  const angles = Array.from({length: sides}, (_, i) => i * circle / sides)
    .filter(angle => angle > ridge + wall && angle < circle - ridge - wall);
  angles.push(0, ridge, ridge + wall, circle - ridge - wall, circle - ridge);
  angles.sort((a, b) => a - b);
  const position = [], index = [];
  for (let layer = 0; layer <= layers; layer++) {
    const z = height * layer / layers;
    for (const [i, angle] of angles.entries()) {
      const onRidge = Math.min(angle, circle - angle) <= ridge;
      const barkRadius = width + (onRidge ? depth * (1 - z / height * .5) : 0);
      position.push(barkRadius * Math.cos(angle), barkRadius * Math.sin(angle), z);
      if (layer === layers || (cut && angle >= 2.2 && angle <= 2.52)) continue;
      const count = angles.length, a = layer * count + i, b = layer * count + (i + 1) % count;
      index.push(a, b, b + count, a, b + count, a + count);
    }
  }
  const surface = trunkSurfaceIndex(THREE, {
    matrix: new THREE.Matrix4().toArray(), primitives: [{position, index}],
  });
  const guide = {id: 'ridge', points: [[0, 0, 0], [0, 0, height]], start_radius: width, end_radius: width};
  const {tracks, report} = wrapImportedGuide(THREE, surface, guide, {
    pitch, radius, gap, from: 0, to: 1, range: [.1, 1.14], sections: [],
  });
  return {surface, tracks, report};
}

test('a steep root ridge keeps a continuous attached cord through the contour change', () => {
  const {surface, tracks, report} = ridgedBark();
  assert.ok(report.contourBridges > 0);
  assert.equal(tracks.length, 1);
  assert.ok(tracks[0].at(-1).station - tracks[0][0].station > 1.03);
  verifyCordClearance(surface, tracks);
});

test('a genuine opening in the bark remains a gap even with contour recovery', () => {
  const {surface, tracks, report} = ridgedBark({cut: true});
  assert.ok(report.contourBridges > 0, 'stretches next to the root ridge still join');
  assert.ok(tracks.length > 1, 'the strip cannot span the missing bark');
  assert.ok(tracks.some((track, i) => i > 0 &&
    tracks[i - 1].at(-1).point.distanceTo(track[0].point) > .08));
  verifyCordClearance(surface, tracks);
});

test('new routes keep one cord diameter from other turns along the whole segment', () => {
  const point = (x, y, z) => ({point: new THREE.Vector3(x, y, z)});
  const route = createRouteClearance(THREE, [[point(-1, 0, 0), point(1, 0, 0)]], radius);
  assert.equal(route.tryConnect([point(0, -1, radius), point(0, 1, radius)]), false);
  assert.equal(route.tryConnect([point(0, -1, .01), point(0, 1, .01)]), true);
  assert.equal(route.tryConnect([point(-1, .1, .012), point(1, .1, .012)]), false);
});
