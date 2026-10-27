import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSectionProfileMarker } from '../web/trunk-section-marker.js';

test('section point uses a Mesh with a cloned 3D anchor and overlay-only rendering', () => {
  const position = new THREE.Vector3(2, 4, 6), color = new THREE.Color(0xffdc71), before = color.toArray();
  const marker = createSectionProfileMarker(position, color);
  assert.equal(marker.isMesh, true); assert.equal(marker.visible, true); assert.equal(marker.frustumCulled, false);
  assert.deepEqual(marker.position.toArray(), [2, 4, 6]); assert.equal(marker.renderOrder, 125);
  assert.equal(marker.material.depthTest, false); assert.equal(marker.material.depthWrite, false); assert.equal(marker.material.toneMapped, false);
  assert.equal(marker.geometry.attributes.position.count, 4); assert.equal(marker.geometry.index.count, 6);
  position.x = 99; color.setHex(0x000000);
  assert.equal(marker.position.x, 2); assert.deepEqual(marker.material.uniforms.markerColor.value.toArray(), before);
  const ray = new THREE.Raycaster(new THREE.Vector3(2, 4, 20), new THREE.Vector3(0, 0, -1));
  marker.updateMatrixWorld(); assert.deepEqual(ray.intersectObject(marker), []);
});

test('default marker radius remains in CSS pixels at different device ratios and viewport sizes', () => {
  const marker = createSectionProfileMarker([0, 0, 0], '#ffdc71');
  for (const ratio of [1, 1.25, 2, 3]) {
    marker.onBeforeRender({ getPixelRatio: () => ratio, getRenderTarget: () => null,
      getCurrentViewport: target => target.set(40 * ratio, 20 * ratio, 960 * ratio, 720 * ratio) });
    assert.deepEqual(marker.material.uniforms.viewportSize.value.toArray(), [960, 720]);
    assert.equal(marker.material.uniforms.markerRadius.value, 5.5); assert.equal(marker.material.uniforms.markerHalo.value, 2);
    assert.equal(marker.material.uniforms.pixelRatio.value, ratio);
  }
  marker.onBeforeRender({ getPixelRatio: () => 2, getSize: target => target.set(800, 600) });
  assert.deepEqual(marker.material.uniforms.viewportSize.value.toArray(), [800, 600]);
});

test('offscreen rendering uses target pixels rather than the screen device ratio', () => {
  const marker = createSectionProfileMarker([0, 0, 0], 0xffffff);
  marker.onBeforeRender({ getPixelRatio: () => 2, getRenderTarget: () => ({}), getCurrentViewport: target => target.set(0, 0, 512, 256) });
  assert.deepEqual(marker.material.uniforms.viewportSize.value.toArray(), [512, 256]); assert.equal(marker.material.uniforms.pixelRatio.value, 1);
});

test('controller userData can restyle fixed screen points without changing the local anchor', () => {
  const marker = createSectionProfileMarker({ x: 1, y: 2, z: 3 }, 0xffffff);
  marker.userData.screenRadius = 7; marker.userData.screenHalo = 3; marker.userData.screenColor = '#88d3ca';
  marker.userData.kind = 'profile'; marker.userData.id = 'SECTION_1';
  marker.onBeforeRender({ getPixelRatio: () => 1, getSize: target => target.set(960, 720) });
  assert.equal(marker.material.uniforms.markerRadius.value, 7); assert.equal(marker.material.uniforms.markerHalo.value, 3);
  assert.deepEqual(marker.material.uniforms.markerColor.value.toArray(), new THREE.Color('#88d3ca').toArray());
  assert.deepEqual(marker.position.toArray(), [1, 2, 3]); assert.equal(marker.userData.kind, 'profile');
});

test('invalid dimensions and colors safely fall back or clamp to usable controls', () => {
  const marker = createSectionProfileMarker([0, 0, 0], 'invalid-color', { radius: NaN, halo: Infinity, renderOrder: NaN });
  assert.equal(marker.material.uniforms.markerRadius.value, 5.5); assert.equal(marker.material.uniforms.markerHalo.value, 2); assert.equal(marker.renderOrder, 125);
  marker.userData.screenRadius = -20; marker.userData.screenHalo = 200; marker.userData.screenColor = NaN;
  marker.onBeforeRender({ getPixelRatio: () => 1, getSize: target => target.set(960, 720) });
  assert.equal(marker.material.uniforms.markerRadius.value, 2); assert.equal(marker.material.uniforms.markerHalo.value, 8);
  assert.deepEqual(marker.material.uniforms.markerColor.value.toArray(), new THREE.Color(0xffdc71).toArray());
});

test('invalid 3D anchors never render a misleading control at the origin', () => {
  for (const position of [null, undefined, [], [1, 2], [1, NaN, 3], { x: Infinity, y: 0, z: 0 }]) {
    const marker = createSectionProfileMarker(position, 0xffffff);
    assert.equal(marker.isMesh, true); assert.equal(marker.visible, false);
  }
});

test('regular overlay disposal releases both quad geometry and shader material', () => {
  const marker = createSectionProfileMarker([0, 0, 0], 0xffffff); let disposedGeometry = 0, disposedMaterial = 0;
  marker.geometry.addEventListener('dispose', () => disposedGeometry++); marker.material.addEventListener('dispose', () => disposedMaterial++);
  marker.geometry.dispose(); marker.material.dispose(); assert.equal(disposedGeometry, 1); assert.equal(disposedMaterial, 1);
});


test('a selected halo can be independently restyled without mutating caller colors or its anchor', () => {
  const color = new THREE.Color(0xffa23c), marker = createSectionProfileMarker([1, 2, 3], 0xffffff, { haloColor: color });
  color.setHex(0x000000);
  assert.equal(marker.material.uniforms.haloColor.value.getHex(), 0xffa23c);
  marker.userData.screenHaloColor = '#fff4de';
  const renderer = { getPixelRatio: () => 2, getSize: target => target.set(960, 720) };
  marker.onBeforeRender(renderer);
  assert.equal(marker.material.uniforms.haloColor.value.getHex(), 0xfff4de);
  assert.equal(marker.material.uniforms.markerColor.value.getHex(), 0xffffff);
  marker.userData.screenHaloColor = { isColor: true, r: NaN, g: 1, b: 1 };
  marker.onBeforeRender(renderer);
  assert.equal(marker.material.uniforms.haloColor.value.getHex(), 0xffa23c);
  assert.deepEqual(marker.position.toArray(), [1, 2, 3]);
  marker.geometry.dispose(); marker.material.dispose();
});
