import * as THREE from 'three';
import { getViewportNavigationMode, viewportNavigationAction } from './viewport-navigation.js';

const dragThreshold = 4;
const anchorTolerance = 3;

export function createBaseBranchSelection({ canvas, camera, modelRoot, controls, active, getTargets, changed }) {
  const box = canvas.ownerDocument.createElement('div');
  box.id = 'baseBranchSelectionBox';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;pointer-events:none;border:1px solid #e7c966;background:#e7c96622;z-index:50;box-sizing:border-box';
  box.hidden = true;
  canvas.ownerDocument.body.append(box);

  const ray = new THREE.Raycaster();
  const screen = new THREE.Vector2();
  let selected = new Set(), gesture = null, revision = 0;

  function primary() {
    return [...selected].at(-1) || '';
  }

  function replace(ids) {
    const next = new Set(ids);
    const previous = [...selected];
    if (next.size === previous.length && [...next].every((id, index) => id === previous[index])) return false;
    selected = next;
    revision++;
    changed([...selected], primary());
    return true;
  }

  function viewportBounds(event, origin = event) {
    const viewport = canvas.getBoundingClientRect();
    return {
      left: Math.max(viewport.left, Math.min(event.clientX, origin.clientX)),
      top: Math.max(viewport.top, Math.min(event.clientY, origin.clientY)),
      right: Math.min(viewport.right, Math.max(event.clientX, origin.clientX)),
      bottom: Math.min(viewport.bottom, Math.max(event.clientY, origin.clientY)),
    };
  }

  function visible(object) {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return true;
  }

  function clickTarget(event, targets, bounds) {
    const x = (event.clientX - bounds.left) / bounds.width, y = (event.clientY - bounds.top) / bounds.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return [];
    const byObject = new Map(targets.map(target => [target.object, target.id]));
    for (const object of byObject.keys()) object.updateWorldMatrix(true, false);
    ray.setFromCamera(screen.set(x * 2 - 1, 1 - y * 2), camera);
    const hit = ray.intersectObjects([...byObject.keys()], false)[0];
    return hit ? [byObject.get(hit.object)] : [];
  }

  function boxTargets(event, origin, targets, bounds) {
    const selection = viewportBounds(event, origin);
    return targets.filter(({ point }) => {
      const projected = point.clone().project(camera);
      if (projected.z < -1 || projected.z > 1 || !Number.isFinite(projected.z)) return false;
      const x = bounds.left + (projected.x + 1) * bounds.width / 2;
      const y = bounds.top + (1 - projected.y) * bounds.height / 2;
      return x >= selection.left - anchorTolerance && x <= selection.right + anchorTolerance
        && y >= selection.top - anchorTolerance && y <= selection.bottom + anchorTolerance;
    }).map(({ id }) => id);
  }

  function begin(event) {
    if (gesture || event.defaultPrevented || event.button !== 0 || event.isPrimary === false || event.metaKey
      || (!event.shiftKey && !event.ctrlKey) || !active()) return false;
    const preset = getViewportNavigationMode();
    if (viewportNavigationAction(preset, event) || event.altKey && !(preset === 'maya' && event.ctrlKey)) return false;
    if (!getTargets().length) return false;
    gesture = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      subtract: event.ctrlKey,
      controlsEnabled: controls.enabled,
    };
    canvas.focus({ preventScroll: true });
    controls.enabled = false;
    if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
    return true;
  }

  function move(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return false;
    if (!active()) return cancel(event);
    const { left, top, right, bottom } = viewportBounds(event, gesture);
    const width = right - left, height = bottom - top;
    box.hidden = Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) < dragThreshold;
    if (!box.hidden) Object.assign(box.style, {
      left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
    });
    return true;
  }

  function cancel(event) {
    if (!gesture || (event?.pointerId !== undefined && event.pointerId !== gesture.pointerId)) return false;
    const { pointerId, controlsEnabled } = gesture;
    gesture = null;
    box.hidden = true;
    controls.enabled = controlsEnabled;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    return true;
  }

  function end(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return false;
    const origin = gesture;
    cancel(event);
    if (!active()) return true;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return true;
    camera.updateMatrixWorld();
    modelRoot.updateWorldMatrix(true, false);
    const targets = getTargets().filter(target => visible(target.object));
    const click = Math.hypot(event.clientX - origin.clientX, event.clientY - origin.clientY) < dragThreshold;
    const ids = click ? clickTarget(event, targets, bounds) : boxTargets(event, origin, targets, bounds);
    const next = new Set(selected);
    for (const id of ids) {
      if (origin.subtract) next.delete(id);
      else next.add(id);
    }
    replace(next);
    return true;
  }

  return {
    get ids() { return [...selected]; },
    get revision() { return revision; },
    get primary() { return primary(); },
    get dragging() { return Boolean(gesture); },
    replace,
    clear: () => replace([]),
    has: id => selected.has(id),
    begin, move, end, cancel,
  };
}
