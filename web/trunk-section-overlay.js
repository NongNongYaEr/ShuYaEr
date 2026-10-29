import * as THREE from 'three';

// Editable outlines use screen-space triangles: WebGL line width is commonly
// fixed to one pixel on Windows. These objects only belong to the tool overlay.
const vertexShader = `
attribute vec3 segmentStart;
attribute vec3 segmentEnd;
attribute vec2 corner;
uniform vec2 viewportSize;
uniform float lineWidth;
varying vec2 startPixel;
varying vec2 endPixel;
void main() {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(segmentStart, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(segmentEnd, 1.0);
  float da = a.z + a.w;
  float db = b.z + b.w;
  if (da < 0.0 && db < 0.0) {
    startPixel = vec2(0.0); endPixel = vec2(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;
  }
  // Clip before division to avoid enormous quads when a segment crosses the
  // camera's near plane. Full near/far clipping still happens in the GPU.
  if (da < 0.0) a = mix(a, b, da / (da - db));
  if (db < 0.0) b = mix(b, a, db / (db - (a.z + a.w)));
  if (a.w <= 0.000001 || b.w <= 0.000001) {
    startPixel = vec2(0.0); endPixel = vec2(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;
  }
  startPixel = (a.xy / a.w * 0.5 + 0.5) * viewportSize;
  endPixel = (b.xy / b.w * 0.5 + 0.5) * viewportSize;
  vec2 delta = endPixel - startPixel;
  float lengthPixels = length(delta);
  vec2 along = lengthPixels > 0.00001 ? delta / lengthPixels : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  float extent = lineWidth * 0.5 + 1.0;
  vec2 pixel = mix(startPixel, endPixel, corner.x)
    + across * corner.y * extent + along * (corner.x * 2.0 - 1.0) * extent;
  vec4 clip = mix(a, b, corner.x);
  clip.xy = (pixel / viewportSize * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
}`;

const fragmentShader = `
uniform vec3 lineColor;
uniform float lineWidth;
uniform float pixelRatio;
uniform vec2 viewportOrigin;
varying vec2 startPixel;
varying vec2 endPixel;
void main() {
  vec2 point = gl_FragCoord.xy / pixelRatio - viewportOrigin;
  vec2 segment = endPixel - startPixel;
  float t = clamp(dot(point - startPixel, segment) / max(dot(segment, segment), 0.000001), 0.0, 1.0);
  float distancePixels = length(point - (startPixel + segment * t));
  float alpha = 1.0 - smoothstep(lineWidth * 0.5, lineWidth * 0.5 + 1.0, distancePixels);
  if (alpha <= 0.0) discard;
  gl_FragColor = vec4(lineColor, alpha);
  #include <colorspace_fragment>
}`;

function copyPoint(point) {
  const value = point?.isVector3 ? point.clone() : Array.isArray(point) && point.length >= 3 ? new THREE.Vector3(...point) : null;
  return value && [value.x, value.y, value.z].every(Number.isFinite) ? value : null;
}

function overlayMaterial(color, width) {
  return new THREE.ShaderMaterial({
    uniforms: {
      lineColor: { value: new THREE.Color(color) }, lineWidth: { value: width },
      viewportSize: { value: new THREE.Vector2(1, 1) }, viewportOrigin: { value: new THREE.Vector2() }, pixelRatio: { value: 1 },
    },
    vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
    toneMapped: false, side: THREE.DoubleSide,
  });
}

function updateLineViewport(mesh, renderer) {
  const ratio = renderer.getRenderTarget?.() ? 1 : Math.max(1e-6, renderer.getPixelRatio?.() || 1);
  const uniforms = mesh.material.uniforms;
  if (typeof renderer.getCurrentViewport === 'function') {
    const viewport = new THREE.Vector4(); renderer.getCurrentViewport(viewport);
    uniforms.viewportSize.value.set(Math.max(1, viewport.z / ratio), Math.max(1, viewport.w / ratio));
    uniforms.viewportOrigin.value.set(viewport.x / ratio, viewport.y / ratio);
  } else {
    const size = new THREE.Vector2(); renderer.getSize(size);
    uniforms.viewportSize.value.set(Math.max(1, size.x), Math.max(1, size.y)); uniforms.viewportOrigin.value.set(0, 0);
  }
  uniforms.pixelRatio.value = ratio;
}

// One pair of instanced draws for an arbitrary set of independent segments.
// Endpoints share the caller's retained CPU array; idle frames do not copy or
// rebuild a selected subtree. This stream is an editor overlay, never a model.
export function createSectionSegmentOverlay(sourceMaterial, {width=1.5, haloWidth=4, renderOrder=95} = {}) {
  const object = new THREE.Group(), geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
  geometry.setAttribute('corner', new THREE.Float32BufferAttribute([0,-1,1,-1,1,1,0,-1,1,1,0,1], 2));
  geometry.instanceCount = 0;
  let stream = null, source = null, version = -1;
  for (const [color, lineWidth, layer] of [[0x11171b,haloWidth,0],[sourceMaterial.color,width,1]]) {
    const mesh = new THREE.Mesh(geometry, overlayMaterial(color, lineWidth));
    mesh.frustumCulled = false; mesh.renderOrder = renderOrder + layer; mesh.raycast = () => {};
    mesh.onBeforeRender = renderer => {
      if (layer) mesh.material.uniforms.lineColor.value.copy(sourceMaterial.color);
      updateLineViewport(mesh, renderer);
    };
    object.add(mesh);
  }
  return {object, update(position, count) {
    geometry.instanceCount = Math.floor(count / 2); object.visible = count > 0;
    if (!position) return;
    if (source !== position.array) {
      source = position.array; stream = new THREE.InstancedInterleavedBuffer(source, 6, 1).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('segmentStart', new THREE.InterleavedBufferAttribute(stream, 3, 0));
      geometry.setAttribute('segmentEnd', new THREE.InterleavedBufferAttribute(stream, 3, 3)); version = -1;
    }
    if (version !== position.version) {
      stream.clearUpdateRanges();
      for (const range of position.updateRanges) stream.addUpdateRange(range.start, range.count);
      stream.needsUpdate = true; version = position.version;
    }
  }, dispose() { geometry.dispose(); object.children.forEach(mesh => mesh.material.dispose()); }};
}

/** Pixel widths are CSS pixels, including on a Retina/HiDPI canvas. The
 * returned Group keeps a cloned local polyline for matching screen picking. */
export function createSectionOverlayLine(points, color, { loop = false, width = 3, haloWidth = 5, renderOrder = 120 } = {}) {
  const root = new THREE.Group();
  const polyline = Array.isArray(points) ? points.map(copyPoint) : [];
  if (polyline.some(point => !point)) {
    root.userData.polyline = []; root.userData.loop = Boolean(loop); return root;
  }
  root.userData.polyline = polyline; root.userData.loop = Boolean(loop);
  if (polyline.length < 2) return root;
  const starts = [], ends = [], corners = [], positions = [];
  const quad = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]];
  const segmentCount = polyline.length - 1 + Number(Boolean(loop));
  for (let i = 0; i < segmentCount; i++) {
    const a = polyline[i], b = polyline[(i + 1) % polyline.length];
    if (a.distanceToSquared(b) < 1e-18) continue;
    for (const corner of quad) {
      starts.push(a.x, a.y, a.z); ends.push(b.x, b.y, b.z); corners.push(...corner);
      positions.push(...(corner[0] ? b : a).toArray());
    }
  }
  if (!starts.length) return root;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('segmentStart', new THREE.Float32BufferAttribute(starts, 3));
  geometry.setAttribute('segmentEnd', new THREE.Float32BufferAttribute(ends, 3));
  geometry.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
  const coreWidth = Number.isFinite(width) ? Math.max(.5, width) : 3;
  const outerWidth = Number.isFinite(haloWidth) ? Math.max(coreWidth, haloWidth) : coreWidth + 2;
  const viewport = new THREE.Vector4(), size = new THREE.Vector2();
  for (const [lineColor, lineWidth, layer] of [[0x11171b, outerWidth, 0], [color, coreWidth, 1]]) {
    const mesh = new THREE.Mesh(geometry, overlayMaterial(lineColor, lineWidth));
    mesh.frustumCulled = false; mesh.renderOrder = renderOrder + layer;
    mesh.raycast = () => {}; // The screen-space strip is picked by its polyline.
    mesh.onBeforeRender = renderer => {
      const ratio = renderer.getRenderTarget?.() ? 1 : Math.max(1e-6, renderer.getPixelRatio?.() || 1);
      const uniforms = mesh.material.uniforms;
      if (typeof renderer.getCurrentViewport === 'function') {
        renderer.getCurrentViewport(viewport);
        uniforms.viewportSize.value.set(Math.max(1, viewport.z / ratio), Math.max(1, viewport.w / ratio));
        uniforms.viewportOrigin.value.set(viewport.x / ratio, viewport.y / ratio);
      } else {
        renderer.getSize(size);
        uniforms.viewportSize.value.set(Math.max(1, size.x), Math.max(1, size.y));
        uniforms.viewportOrigin.value.set(0, 0);
      }
      uniforms.pixelRatio.value = ratio;
    };
    root.add(mesh);
  }
  return root;
}

function screenPoint(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  if (value.w !== undefined && (!Number.isFinite(value.w) || value.w <= 0)) return null;
  if (value.z !== undefined && (!Number.isFinite(value.z) || value.z < -1 || value.z > 1)) return null;
  return value;
}

/** Return the nearest screen distance in CSS pixels, or null. Projection
 * returns client x/y and optionally clip z/w; clipped endpoints are skipped
 * conservatively rather than allowing an invisible huge segment to be hit. */
export function hitSectionPolyline(points, pointer, project, { loop = true, radius = 10 } = {}) {
  const x = pointer?.x ?? pointer?.clientX, y = pointer?.y ?? pointer?.clientY;
  if (!Array.isArray(points) || points.length < 2 || typeof project !== 'function' ||
    !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return null;
  const projected = points.map(point => screenPoint(project(point)));
  let nearest = Infinity;
  for (let i = 0; i < projected.length - 1 + Number(Boolean(loop)); i++) {
    const a = projected[i], b = projected[(i + 1) % projected.length];
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 1e-18 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared)) : 0;
    const distance = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
    nearest = Math.min(nearest, distance);
  }
  return nearest <= radius ? nearest : null;
}
