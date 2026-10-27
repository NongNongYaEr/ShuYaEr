// Capture before OrbitControls and editing handlers. A gesture owns its pointer
// until mouse-up, even when modifiers are released or Escape cancels the box.
export function bindTemporaryBranchSelection({ canvas, selection, canBegin, beforeBegin, status, shouldHandle = () => true }) {
  let pointerId = null, active = false;
  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const cancel = () => { if (active) { active = false; selection.cancel(); } };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    if (!shouldHandle(event)) { pointerId = null; return; }
    if (!event.shiftKey && !event.ctrlKey) { pointerId = null; return; }
    consume(event); pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    if (!canBegin()) return;
    beforeBegin(); active = selection.beginTemporary(event);
  }, true);
  canvas.addEventListener('pointermove', event => {
    if (pointerId !== event.pointerId) return;
    consume(event); if (active) selection.move(event);
  }, true);
  canvas.addEventListener('pointerup', event => {
    if (pointerId !== event.pointerId || event.button !== 0) return;
    consume(event); const finish = active; active = false; pointerId = null;
    if (finish) selection.end(event);
    else if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }, true);
  for (const name of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(name, event => {
    if (pointerId !== event.pointerId) return;
    consume(event); cancel();
  }, true);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !active) return;
    consume(event); cancel(); status('临时框选已取消，继续使用原工具', 'ready');
  }, true);
  window.addEventListener('blur', () => {
    cancel();
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = null;
  });
}
