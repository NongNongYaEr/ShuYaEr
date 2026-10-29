import * as THREE from 'three';
import {createSectionOverlayLine} from './trunk-section-overlay.js';

// Keep the original THREE.Line as the exact geometric picking target. Its
// children draw a contrasting CSS-pixel strip, including in the DX12 overlay.
export function createCurveGuide(points, {tangent = false} = {}) {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({transparent:true, opacity:0, depthTest:false, depthWrite:false}));
  line.add(createSectionOverlayLine(points, tangent ? 0xa9bfff : 0x86d5cf,
    {width:tangent ? 1.25 : 2, haloWidth:tangent ? 3 : 4, renderOrder:tangent ? 101 : 96}));
  return line;
}

const dark = new THREE.MeshBasicMaterial({color:0x18272e, transparent:true, depthTest:false, depthWrite:false, fog:false, toneMapped:false});
const selectedRing = new THREE.MeshBasicMaterial({color:0xffd35b, transparent:true, depthTest:false, depthWrite:false, fog:false, toneMapped:false});
const pinnedRing = new THREE.MeshBasicMaterial({color:0xff8b7c, transparent:true, depthTest:false, depthWrite:false, fog:false, toneMapped:false});

export function addCurveHandleOutline(handle, {active = false, selected = false, pinned = false} = {}) {
  // Transparent strips are drawn after opaque objects regardless of their
  // renderOrder. Put point faces and rings in that same queue, after the lines.
  handle.material.transparent = true; handle.material.depthTest = false;
  handle.material.depthWrite = false; handle.material.toneMapped = false;
  const add = (material, scale, order) => {
    const layer = new THREE.Mesh(handle.geometry, material);
    layer.scale.setScalar(scale); layer.renderOrder = order;
    layer.raycast = () => {}; layer.userData.category = 'curve_handle_outline';
    handle.add(layer);
  };
  handle.renderOrder = 106;
  add(dark, active ? 1.45 : 1.28, 104);
  if (active || selected || pinned) add(pinned ? pinnedRing : selectedRing, active ? 1.25 : 1.12, 105);
  return handle;
}

export function disposeCurveGuide(line) {
  const geometries = new Set(), materials = new Set();
  line.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
