// Shortcut meaning is scoped to trunk-form editing. The controller owns
// selection, preview, commit and event consumption; this module never mutates
// authoring or repurposes the complete-unit transforms outside that context.
export const TRUNK_SECTION_MODE_ACTIONS = Object.freeze(['SLIDE', 'TWIST', 'RADIUS', 'PROFILE']);

const plainActions = Object.freeze({
  g: 'SLIDE', r: 'TWIST', s: 'RADIUS', c: 'PROFILE',
  n: 'ADD', delete: 'REMOVE', f: 'FOCUS', p: 'PRESETS', v: 'EXIT',
  pageup: 'PREVIOUS', '[': 'PREVIOUS', pagedown: 'NEXT', ']': 'NEXT',
});
const codeKeys = Object.freeze({
  KeyG: 'g', KeyR: 'r', KeyS: 's', KeyC: 'c', KeyD: 'd', KeyN: 'n', KeyF: 'f', KeyP: 'p', KeyV: 'v',
  Delete: 'delete', PageUp: 'pageup', PageDown: 'pagedown', BracketLeft: '[', BracketRight: ']',
  Escape: 'escape', Enter: 'enter', NumpadEnter: 'enter',
});

export function trunkSectionShortcut(event = {}, {
  enabled = false, active = false, typing = false, dialogOpen = false,
} = {}) {
  if (!enabled || event.defaultPrevented || event.isComposing || dialogOpen) return null;
  // Saving, undo/redo and operating-system combinations stay in their existing
  // routes, including while a section gesture or text edit is active.
  if (event.ctrlKey || event.metaKey) return null;
  const key = typeof event.key === 'string' && event.key
    ? event.key.toLowerCase() : codeKeys[event.code] || '';
  const modified = event.shiftKey || event.altKey;
  if (typing) return active && !modified && !event.repeat && key === 'escape' ? 'CANCEL' : null;

  let action = null;
  if (event.altKey) {
    if (!event.shiftKey) action = {g:'SLIDE',r:'TWIST',s:'RADIUS'}[key] || null;
  } else if (event.shiftKey) {
    if (key === 'p') action = 'SAVE_PRESET';
    else if (key === 'd') action = 'DUPLICATE';
  } else if (key === 'escape') action = 'ESCAPE';
  else if (key === 'enter') action = active ? 'CONFIRM' : null;
  else action = plainActions[key] || null;

  // Navigation alone may repeat. Holding N/Delete, a mode key or Enter must
  // never create/remove multiple sections or confirm another operation.
  if (event.repeat && action !== 'PREVIOUS' && action !== 'NEXT') return null;
  return action;
}
