import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGlbExportScene, prepareGlbBarkTexture } from '../web/glb-export.js';

function canvasStub() {
  return {
    width: 0, height: 0, pixels: null,
    getContext(type) {
      assert.equal(type, '2d');
      return {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: image => { this.pixels = image.data.slice(); },
      };
    },
  };
}

test('roughness export uses a drawable image with exact green-channel pixels and physical UV transform', () => {
  const pixels = new Uint8Array([101, 17, 200, 255, 20, 91, 35, 255]);
  const source = new THREE.DataTexture(pixels, 2, 1, THREE.RGBAFormat);
  source.name = 'roughness';
  source.repeat.set(7, 9); source.offset.set(.1, .2); source.center.set(.5, .5);
  source.rotation = Math.PI / 2; source.wrapS = source.wrapT = THREE.RepeatWrapping;
  source.updateMatrix();
  const copy = prepareGlbBarkTexture(source, { canvasFactory: canvasStub });
  try {
    assert.ok(copy.isCanvasTexture);
    assert.equal(copy.isDataTexture, undefined);
    assert.deepEqual(Array.from(copy.image.pixels), Array.from(pixels));
    assert.deepEqual(copy.repeat, source.repeat); assert.deepEqual(copy.offset, source.offset);
    assert.deepEqual(copy.center, source.center); assert.deepEqual(copy.matrix, source.matrix);
    assert.equal(copy.rotation, source.rotation); assert.equal(copy.flipY, source.flipY);
    assert.equal(copy.colorSpace, THREE.NoColorSpace);
    assert.equal(copy.wrapS, source.wrapS); assert.equal(copy.wrapT, source.wrapT);
    assert.equal(source.image.data, pixels); assert.equal(source.isDataTexture, true);
  } finally { copy.dispose(); source.dispose(); }
});

test('GLB clones share one export canvas, release it once and keep visible source textures alive', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: tag => { assert.equal(tag, 'canvas'); return canvasStub(); } };
  const source = new THREE.DataTexture(new Uint8Array([5, 79, 200, 255]), 1, 1, THREE.RGBAFormat);
  const material = new THREE.MeshStandardMaterial({ roughnessMap: source });
  material.userData.bark_material = { style: 'IMPORTED' };
  const geometry = new THREE.BoxGeometry();
  const root = new THREE.Group(); root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  let sourceDisposals = 0;
  source.addEventListener('dispose', () => sourceDisposals++);
  let exported;
  try {
    exported = createGlbExportScene(root, { rasterizeBarkTextures: true });
    const copies = []; exported.scene.traverse(o => { if (o.isMesh) copies.push(o.material); });
    assert.equal(copies.length, 2); assert.equal(copies[0], copies[1]);
    assert.notEqual(copies[0], material); assert.notEqual(copies[0].roughnessMap, source);
    assert.equal(copies[0].userData.bark_material, undefined);
    assert.deepEqual(Array.from(copies[0].roughnessMap.image.pixels), [5, 79, 200, 255]);
    let exportDisposals = 0; copies[0].roughnessMap.addEventListener('dispose', () => exportDisposals++);
    exported.dispose(); exported = null;
    assert.equal(exportDisposals, 1); assert.equal(sourceDisposals, 0);
    assert.equal(material.roughnessMap, source); assert.deepEqual(material.userData.bark_material, { style: 'IMPORTED' });
  } finally {
    exported?.dispose(); geometry.dispose(); material.dispose(); source.dispose();
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});
