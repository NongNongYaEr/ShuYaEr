import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSceneOverlayPattern, normalizeSceneOverlayText, sceneBiteFootprintCm, sceneBrandFootprintCm
} from '../material/web/scene-overlay-pattern.js';

function grid(sample, role) {
  return Array.from({length: 41 * 41}, (_, index) => sample((index % 41) / 20 - 1, 1 - Math.floor(index / 41) / 20, role));
}

const coverage = values => values.reduce((sum, value) => sum + value, 0);

test('spray labels preserve case, punctuation and literal arrow direction', () => {
  assert.equal(normalizeSceneOverlayText('  A-17  林↗\n z  '), 'A-17  ↗ z');
  assert.equal(normalizeSceneOverlayText('X'.repeat(60)), 'X'.repeat(24));
  assert.equal(normalizeSceneOverlayText(null), '');
  const label = grid(createSceneOverlayPattern('spray', {text: 'A-17 ↗'}));
  assert.ok(coverage(label) > 60);
  assert.notDeepEqual(label, grid(createSceneOverlayPattern('spray', {text: 'a-17 ↘'})));
  const up = createSceneOverlayPattern('spray', {text: '↑'});
  const down = createSceneOverlayPattern('spray', {text: '↓'});
  assert.ok(up(-0.34, 0.34) > 0.7);
  assert.ok(down(-0.34, 0.34) < 0.1);
  assert.ok(down(-0.34, -0.34) > 0.7);
  assert.equal(coverage(grid(createSceneOverlayPattern('spray', {text: '  '}))), 0);
});

test('spray and boot wear remove coverage reproducibly after serialization', () => {
  for (const [style, params] of [['spray', {text: 'A-17'}], ['boot', {}]]) {
    const fresh = grid(createSceneOverlayPattern(style, {...params, wear: 0}));
    const saved = {...params, wear: 0.74};
    const worn = grid(createSceneOverlayPattern(style, saved));
    assert.ok(coverage(worn) < 0.84 * coverage(fresh));
    assert.ok(coverage(worn) > 0.3 * coverage(fresh));
    assert.deepEqual(worn, grid(createSceneOverlayPattern(style, JSON.parse(JSON.stringify(saved)))));
  }
  const boot = createSceneOverlayPattern('boot');
  assert.ok(boot(0.25, 0.22) > 0.9);
  assert.equal(boot(0.2, -0.25), 0);
  assert.ok(boot(-0.20, -0.58) > 0.9);
});

test('brand width grows only the rim around the burning symbol', () => {
  const none = createSceneOverlayPattern('brand', {size: 20, width: 0});
  const narrow = createSceneOverlayPattern('brand', {size: 20, width: 0.5});
  const wide = createSceneOverlayPattern('brand', {size: 20, width: 2});
  assert.equal(coverage(grid(none, 'rim')), 0);
  assert.deepEqual(grid(wide), grid(narrow));
  assert.ok(wide(0, -0.31) > 0.9);
  assert.equal(wide(0, -0.31, 'rim'), 0);
  const rimArea = (sample, width) => coverage(grid(sample, 'rim')) * sceneBrandFootprintCm(20, width, 'rim') ** 2;
  assert.ok(rimArea(wide, 2) > 2 * rimArea(narrow, 0.5));
  const broad = createSceneOverlayPattern('brand', {size: 20, width: 13});
  assert.ok(rimArea(broad, 13) > 2 * rimArea(wide, 2));
});

test('bite spacing moves the two tooth gouges independently of the coating color', () => {
  const width = 2.2;
  const close = 3.2;
  const distant = 10;
  const narrow = createSceneOverlayPattern('bite', {width, spacing: close});
  const wide = createSceneOverlayPattern('bite', {width, spacing: distant});
  const center = spacing => (width + spacing) * 0.5;
  const localU = (world, spacing) => 2 * world / sceneBiteFootprintCm(width, spacing);
  assert.equal(narrow(0, 0), 0);
  assert.equal(narrow(-localU(center(close), close), 0), 1);
  assert.equal(narrow(localU(center(close), close), 0), 1);
  assert.equal(wide(localU(center(close), distant), 0), 0);
  assert.equal(wide(localU(center(distant), distant), 0), 1);
  assert.deepEqual(grid(wide), grid(createSceneOverlayPattern('bite', {width, spacing: distant, color: '#fff'})));
});

test('leaf print concentrates in veins and litter draws multiple separated shapes', () => {
  const leaf = createSceneOverlayPattern('leaf-print');
  const litter = createSceneOverlayPattern('litter');
  assert.ok(leaf(0.06, 0) > leaf(0.25, 0) + 0.25);
  assert.ok(litter(-0.31, 0.29) > 0.25);
  assert.ok(litter(0.39, 0.32) > 0.25);
  assert.equal(litter(0, 0.10), 0);
  assert.notDeepEqual(grid(leaf), grid(litter));
});

test('procedural decals provide bounded coverage and leave unsupported styles to the caller', () => {
  assert.equal(createSceneOverlayPattern('saw'), null);
  for (const style of ['spray', 'boot', 'brand', 'bite', 'leaf-print', 'litter']) {
    const sample = createSceneOverlayPattern(style, {text: '123'});
    const values = grid(sample);
    assert.ok(coverage(values) > 0);
    assert.ok(values.every(value => value >= 0 && value <= 1));
    assert.equal(sample(1.001, 0), 0);
    assert.equal(sample(0, -Infinity), 0);
    assert.equal(sample(NaN, 0.5), 0);
  }
});
