import * as THREE from 'three';

// A control point is a screen-space circle anchored to one local 3D point.
// Mesh (rather than Sprite) keeps the existing handle routing and disposal.
const vertexShader = `
uniform vec2 viewportSize;
uniform float markerRadius;
uniform float markerHalo;
varying vec2 markerPixel;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float extent = markerRadius + markerHalo + 1.0;
  markerPixel = position.xy * extent;
  if (clip.w <= 0.000001 || clip.z < -clip.w || clip.z > clip.w) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;
  }
  clip.xy += markerPixel / viewportSize * 2.0 * clip.w;
  gl_Position = clip;
}`;

const fragmentShader = `
uniform float markerPivot;
uniform vec3 markerColor;
uniform vec3 haloColor;
uniform float markerRadius;
uniform float markerHalo;
varying vec2 markerPixel;
void main() {
  float distancePixels = length(markerPixel);
  float alpha = 1.0 - smoothstep(markerRadius + markerHalo - 0.25, markerRadius + markerHalo + 0.75, distancePixels);
  if (alpha <= 0.0) discard;
  float core = 1.0 - smoothstep(markerRadius - 0.5, markerRadius + 0.5, distancePixels);
  if (markerPivot > 0.5) {
    float glyphDistance = min(abs(distancePixels - markerRadius * 0.75), min(abs(markerPixel.x), abs(markerPixel.y)));
    alpha *= 1.0 - smoothstep(2.0, 3.5, glyphDistance);
    if (alpha <= 0.0) discard;
    core = 1.0 - smoothstep(0.75, 1.75, glyphDistance);
  }
  gl_FragColor = vec4(mix(haloColor, markerColor, core), alpha);
  #include <colorspace_fragment>
}`;

const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

function copyPosition(position) {
  const coordinates = position?.isVector3 ? [position.x, position.y, position.z] : Array.isArray(position) ? position.slice(0, 3)
    : position && [position.x, position.y, position.z];
  if (!coordinates || coordinates.length !== 3 || !coordinates.every(Number.isFinite)) return null;
  const value = new THREE.Vector3(...coordinates);
  return value && [value.x, value.y, value.z].every(Number.isFinite) ? value : null;
}

function setColor(target, value, fallback) {
  if (value?.isColor && [value.r, value.g, value.b].every(Number.isFinite)) return target.copy(value);
  if (Number.isFinite(value) && value >= 0 && value <= 0xffffff) return target.setHex(value);
  if (typeof value === 'string' && (/^#[\da-f]{3}([\da-f]{3})?$/i.test(value) || Object.hasOwn(THREE.Color.NAMES, value.toLowerCase()))) return target.set(value);
  return target.copy(fallback);
}

/** Radius and halo are CSS pixels. Optional screenRadius/screenHalo/screenColor/screenHaloColor
 * userData fields can restyle the overlay without touching any model recipe. */
export function createSectionProfileMarker(position, color, { radius = 5.5, halo = 2, haloColor = 0x11171b, renderOrder = 125, pivot = false } = {}) {
  const anchor = copyPosition(position), initialRadius = clamp(radius, 2, 32, 5.5), initialHalo = clamp(halo, 0, 8, 2);
  const initialColor = setColor(new THREE.Color(), color, new THREE.Color(0xffdc71));
  const initialHaloColor = setColor(new THREE.Color(), haloColor, new THREE.Color(0x11171b));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const material = new THREE.ShaderMaterial({
    uniforms: { markerPivot: { value: pivot ? 1 : 0 }, viewportSize: { value: new THREE.Vector2(1, 1) }, pixelRatio: { value: 1 },
      markerRadius: { value: initialRadius }, markerHalo: { value: initialHalo },
      markerColor: { value: initialColor.clone() }, haloColor: { value: initialHaloColor.clone() } },
    vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const marker = new THREE.Mesh(geometry, material), viewport = new THREE.Vector4(), size = new THREE.Vector2();
  marker.position.copy(anchor || new THREE.Vector3()); marker.visible = Boolean(anchor); marker.frustumCulled = false;
  marker.renderOrder = Number.isFinite(renderOrder) ? renderOrder : 125;
  marker.userData.screenRadius = initialRadius; marker.userData.screenHalo = initialHalo; marker.userData.screenColor = initialColor.clone(); marker.userData.screenHaloColor = initialHaloColor.clone();
  marker.raycast = () => {}; // The controller selects the projected center.
  marker.onBeforeRender = renderer => {
    const ratio = renderer.getRenderTarget?.() ? 1 : Math.max(1e-6, renderer.getPixelRatio?.() || 1), uniforms = material.uniforms;
    if (typeof renderer.getCurrentViewport === 'function') {
      renderer.getCurrentViewport(viewport);
      uniforms.viewportSize.value.set(Math.max(1, viewport.z / ratio), Math.max(1, viewport.w / ratio));
    } else {
      renderer.getSize(size); uniforms.viewportSize.value.set(Math.max(1, size.x), Math.max(1, size.y));
    }
    uniforms.pixelRatio.value = ratio;
    uniforms.markerRadius.value = clamp(marker.userData.screenRadius, 2, 32, initialRadius);
    uniforms.markerHalo.value = clamp(marker.userData.screenHalo, 0, 8, initialHalo);
    setColor(uniforms.markerColor.value, marker.userData.screenColor, initialColor);
    setColor(uniforms.haloColor.value, marker.userData.screenHaloColor, initialHaloColor);
  };
  return marker;
}
