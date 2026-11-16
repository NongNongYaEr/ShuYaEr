const screenStep = 3;
const maxSegmentSamples = 400;
const existingAnchorClearance = .005;
const coincidentDistanceSquared = 1e-10;

function hasNearbyAnchor(hit, anchors, minimum) {
  const limit = minimum ** 2;
  return anchors.some(other => {
    const distance = other.point.distanceToSquared(hit.point);
    if (distance >= limit) return false;
    const sameFace = hit.anchor && other.anchor && hit.anchor.face === other.anchor.face;
    return distance <= coincidentDistanceSquared || sameFace || hit.normal.dot(other.normal) >= .25;
  });
}

export function canPlaceBaseBranchLeaf(hit, existing, spacing) {
  // Stroke spacing controls new leaves. A deliberate second pass can fill
  // nearby wood or the opposite side without stacking onto the same anchor.
  return !hasNearbyAnchor(hit, existing, Math.min(existingAnchorClearance, spacing * .95));
}

export function createBaseBranchLeafStroke({ spacing, capacity, existing = [], add }) {
  const placed = [];
  let cursor = null, previous = null, remaining = spacing, count = 0;

  function place(hit) {
    if (count >= capacity || !canPlaceBaseBranchLeaf(hit, existing, spacing)
      || hasNearbyAnchor(hit, placed, spacing * .95)) return;
    placed.push(hit);
    count++;
    add(hit);
  }

  function sample(x, y, pick) {
    const hit = pick(x, y);
    if (!hit) {
      previous = null;
      remaining = spacing;
      return;
    }
    const start = previous;
    previous = { ...hit, x, y };
    const distance = start?.point.distanceTo(hit.point) || 0;
    // Adjacent screen samples can jump to a different branch behind the first.
    // Reset the path length at those transitions, as when the ray hits empty space.
    if (!start || distance > Math.max(.001, Math.max(start.metresPerPixel, hit.metresPerPixel) * screenStep * 6)) {
      place(hit);
      remaining = spacing;
      return;
    }
    for (; remaining <= distance && count < capacity; remaining += spacing) {
      const t = remaining / distance;
      const next = t > .999999 ? hit : pick(start.x + (x - start.x) * t, start.y + (y - start.y) * t);
      if (!next) {
        previous = null;
        remaining = spacing;
        return;
      }
      place(next);
    }
    remaining -= distance;
  }

  return {
    move(x, y, pick) {
      if (count >= capacity) return;
      const start = cursor;
      cursor = { x, y };
      if (!start) { sample(x, y, pick); return; }
      const steps = Math.min(maxSegmentSamples, Math.ceil(Math.hypot(x - start.x, y - start.y) / screenStep));
      for (let i = 1; i <= steps && count < capacity; i++) {
        sample(start.x + (x - start.x) * i / steps, start.y + (y - start.y) * i / steps, pick);
      }
    },
    get count() { return count; },
  };
}
