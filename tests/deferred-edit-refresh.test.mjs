import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeferredEditRefresh } from '../web/deferred-edit-refresh.js';

function scheduler() {
  let next = 0; const active = new Map(), history = new Map();
  return {
    schedule(callback) { const id = next++; active.set(id, callback); history.set(id, callback); return id; },
    cancelSchedule(id) { active.delete(id); },
    fire(id = active.keys().next().value) { const callback = history.get(id); active.delete(id); callback?.(); },
    get count() { return active.size; },
    get first() { return active.keys().next().value; },
  };
}
function fixture(validity = () => 'READY') {
  const clock = scheduler(), rendered = [], checked = [];
  const deferred = createDeferredEditRefresh({ schedule: clock.schedule, cancelSchedule: clock.cancelSchedule,
    canRun(token) { checked.push(token); return validity(token); }, refresh(token) { rendered.push(token); } });
  return { clock, rendered, checked, deferred };
}

test('continuous replacements coalesce the latest token and canceled callbacks cannot flush a newer job', () => {
  const f = fixture(), first = { seq: 1 }, second = { seq: 2 }, third = { seq: 3 };
  f.deferred.replace(first); const oldTimer = f.clock.first;
  f.deferred.replace(second); f.deferred.replace(third);
  assert.equal(f.deferred.pending, third); assert.equal(f.clock.count, 1);
  f.clock.fire(oldTimer);
  assert.deepEqual(f.checked, []); assert.equal(f.deferred.pending, third); assert.equal(f.clock.count, 1);
  f.clock.fire(); assert.deepEqual(f.rendered, [third]); assert.equal(f.deferred.pending, null); assert.equal(f.clock.count, 0);
  assert.equal(f.deferred.flush(), true);
});

test('sequence, asset and authoring identity changes discard stale noncritical refreshes', () => {
  for (const field of ['seq', 'asset', 'authoring']) {
    const current = { seq: 17, asset: {}, authoring: {} }, token = { ...current };
    const f = fixture(candidate => Object.keys(current).every(key => candidate[key] === current[key]) ? 'READY' : 'STALE');
    f.deferred.replace(token); current[field] = field === 'seq' ? 18 : {};
    f.clock.fire(); assert.deepEqual(f.rendered, []); assert.equal(f.deferred.pending, null); assert.equal(f.clock.count, 0);
    f.deferred.replace(token); assert.equal(f.deferred.flush(), true); assert.equal(f.clock.count, 0);
  }
});

test('an active stroke postpones refresh, and BUSY flush retains the token and one retry timer', () => {
  let activeStroke = true; const f = fixture(() => activeStroke ? 'BUSY' : 'READY'), token = { seq: 2 };
  f.deferred.replace(token); f.clock.fire();
  assert.equal(f.deferred.pending, token); assert.equal(f.clock.count, 1); assert.deepEqual(f.rendered, []);
  assert.equal(f.deferred.flush(), false); assert.equal(f.deferred.pending, token); assert.equal(f.clock.count, 1);
  const oldRetry = f.clock.first, next = { seq: 3 };
  f.deferred.replace(next); f.clock.fire(oldRetry);
  assert.equal(f.deferred.pending, next); assert.equal(f.clock.count, 1); assert.deepEqual(f.rendered, []);
  activeStroke = false; assert.equal(f.deferred.flush(), true);
  assert.deepEqual(f.rendered, [next]); assert.equal(f.clock.count, 0);
});

test('invalidate removes pending refresh and fences timer callbacks already queued by the scheduler', () => {
  const f = fixture(); f.deferred.replace({ seq: 1 }); const timer = f.clock.first;
  f.deferred.invalidate(); f.clock.fire(timer);
  assert.deepEqual(f.checked, []); assert.deepEqual(f.rendered, []); assert.equal(f.deferred.pending, null); assert.equal(f.clock.count, 0);
  f.deferred.replace({ seq: 2 }); f.clock.fire(); assert.equal(f.rendered[0].seq, 2);
});

test('READY consumes its old token before a reentrant refresh schedules the next job', () => {
  const clock = scheduler(), rendered = [], old = { seq: 1 }, next = { seq: 2 }; let deferred;
  deferred = createDeferredEditRefresh({ schedule: clock.schedule, cancelSchedule: clock.cancelSchedule, canRun: () => 'READY',
    refresh(token) { assert.equal(deferred.pending, null); rendered.push(token); if (token === old) deferred.replace(next); } });
  deferred.replace(old); assert.equal(deferred.flush(), true);
  assert.deepEqual(rendered, [old]); assert.equal(deferred.pending, next); assert.equal(clock.count, 1);
  clock.fire(); assert.deepEqual(rendered, [old, next]); assert.equal(deferred.pending, null);
});

test('refresh exceptions consume the old token but preserve a replacement created before throwing', () => {
  const clock = scheduler(), rendered = [], next = { seq: 2 }, old = { seq: 1 }; let deferred;
  deferred = createDeferredEditRefresh({ schedule: clock.schedule, cancelSchedule: clock.cancelSchedule, canRun: () => 'READY',
    refresh(token) { if (token === old) { deferred.replace(next); throw new Error('old UI refresh failed'); } rendered.push(token); } });
  deferred.replace(old); assert.throws(() => clock.fire(), /old UI refresh failed/);
  assert.equal(deferred.pending, next); assert.equal(clock.count, 1);
  clock.fire(); assert.deepEqual(rendered, [next]); assert.equal(deferred.pending, null);
  const failure = fixture();
  const throwing = createDeferredEditRefresh({ schedule: failure.clock.schedule, cancelSchedule: failure.clock.cancelSchedule, canRun: () => 'READY', refresh() { throw new Error('failed'); } });
  throwing.replace(old); assert.throws(() => throwing.flush(), /failed/); assert.equal(throwing.pending, null); assert.equal(failure.clock.count, 0);
});

test('reentrant canRun replacement/invalidation and validity exceptions never consume or refresh a newer document', () => {
  const clock = scheduler(), rendered = [], next = { seq: 2 }, old = { seq: 1 }; let deferred;
  deferred = createDeferredEditRefresh({ schedule: clock.schedule, cancelSchedule: clock.cancelSchedule,
    canRun(token) { if (token === old) { deferred.replace(next); return 'STALE'; } return 'READY'; }, refresh: token => rendered.push(token) });
  deferred.replace(old); assert.equal(deferred.flush(), false); assert.equal(deferred.pending, next); assert.equal(clock.count, 1);
  clock.fire(); assert.deepEqual(rendered, [next]);
  const throwing = createDeferredEditRefresh({ schedule: clock.schedule, cancelSchedule: clock.cancelSchedule,
    canRun(token) { if (token === old) { throwing.replace(next); throw new Error('validity failed'); } return 'READY'; }, refresh: token => rendered.push(token) });
  throwing.replace(old); assert.throws(() => throwing.flush(), /validity failed/); assert.equal(throwing.pending, next);
  clock.fire(); assert.deepEqual(rendered, [next, next]);
});
