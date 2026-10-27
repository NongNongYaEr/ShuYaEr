// Noncritical UI work may follow geometry, but must never interrupt a newer
// edit. Tokens are opaque; the caller decides whether their document is current.
export function createDeferredEditRefresh({ schedule = callback => setTimeout(callback, 180), cancelSchedule = clearTimeout, canRun, refresh }) {
  let pending = null, hasPending = false, revision = 0, timer = null, timerRevision = 0;

  function cancelTimer() {
    const previous = timer; timer = null; timerRevision++;
    if (previous !== null) cancelSchedule(previous);
  }
  function consume(expectedRevision) {
    if (!hasPending || revision !== expectedRevision) return;
    pending = null; hasPending = false; revision++;
  }
  function arm() {
    cancelTimer();
    if (!hasPending) return;
    const generation = timerRevision; let fired = false;
    const handle = schedule(() => {
      fired = true;
      if (generation !== timerRevision) return;
      timer = null; run();
    });
    // Also tolerate a synchronous test scheduler/reentrant replacement without
    // overwriting the handle of a newer job created during the callback.
    if (!fired && generation === timerRevision) timer = handle;
  }
  function run() {
    if (!hasPending) return true;
    const token = pending, current = revision; let state;
    try { state = canRun(token); }
    catch (error) { consume(current); throw error; }
    // A reentrant validity check can replace/invalidate its own old token.
    if (!hasPending || current !== revision) return !hasPending;
    if (state === 'BUSY') { arm(); return false; }
    consume(current);
    if (state === 'STALE') return true;
    if (state !== 'READY') throw new Error('Deferred edit refresh canRun must return STALE, BUSY or READY');
    // Consume before invoking UI work. A replacement scheduled by refresh (even
    // one which then throws) remains the next job rather than being cleared.
    refresh(token); return true;
  }

  return {
    replace(token) { pending = token; hasPending = true; revision++; arm(); },
    invalidate() { cancelTimer(); pending = null; hasPending = false; revision++; },
    flush() { cancelTimer(); return run(); },
    get pending() { return hasPending ? pending : null; },
  };
}
