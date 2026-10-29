import { SCULPT_TOOLS } from './tree-sculpt.js';

const STORAGE = 'treeDuck.sculptBrushes.v1';
// Selection, trunk protection and document geometry stay shared and are never
// restored from a brush preset.
const fields = ['sculptRadius', 'sculptStrength', 'sculptHardness', 'sculptFlexibility', 'sculptLength', 'sculptScope', 'sculptDepth', 'sculptDirection'];
export function createSculptBrushWorkflow({canvas, controls, getTool, blocked, refresh, hidePreview = () => {}, status, brushTools = SCULPT_TOOLS, hudId = 'brushAdjustHud', storageKey = STORAGE}) {
  const $ = id => document.getElementById(id);
  const read = () => Object.fromEntries(fields.map(id => [id, $(id).value]));
  const defaults = read();
  let profiles = {}, current = '', loading = false, gesture = null, pointer = null, saveTimer = 0, swallowed = null, suppressContextUntil = 0;
  try { const stored = JSON.parse(localStorage.getItem(storageKey)); if (stored?.version === 1 && stored.brushes && typeof stored.brushes === 'object' && !Array.isArray(stored.brushes)) profiles = stored.brushes; } catch {}
  const persist = () => { clearTimeout(saveTimer); saveTimer = 0; try {localStorage.setItem(storageKey, JSON.stringify({version:1, brushes:profiles}));} catch {} };
  function remember() {
    if (loading || gesture || !brushTools.has(current)) return;
    profiles[current] = read(); clearTimeout(saveTimer); saveTimer = setTimeout(persist, 180);
  }
  function write(id, value) {
    const input = $(id);
    if (input.tagName === 'SELECT') {
      if (![...input.options].some(option => option.value === value)) return;
      input.value = value;
    } else {
      const n = Number(value); if (!Number.isFinite(n)) return;
      input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), n)));
    }
    input.dispatchEvent(new Event('input', {bubbles:true}));
  }
  function switchTool(next) {
    cancel(); remember(); current = next;
    if (!brushTools.has(next)) return;
    const values = profiles[next] || {...defaults, ...(next === 'SMOOTH_BRUSH' ? {sculptStrength:'0.35'} : {})};
    loading = true; try {for (const id of fields) write(id, values[id] ?? defaults[id]);} finally {loading = false;}
    remember();
  }
  for (const id of fields) $(id).addEventListener('input', remember);
  const hud = document.createElement('div'); hud.id = hudId; hud.className = 'brush-adjust-hud'; hud.hidden = true;
  hud.innerHTML = '<svg aria-hidden="true"><circle class="brush-adjust-ring"></circle></svg><div role="status"><strong></strong><span>移动鼠标调整 · 左键 / Enter 确认 · 右键 / Esc 取消</span></div>';
  canvas.parentElement.append(hud);
  const consume = event => {event.preventDefault(); event.stopImmediatePropagation();};
  function draw() {
    if (!gesture) return;
    const bounds = canvas.getBoundingClientRect(), x = gesture.x - bounds.left, y = gesture.y - bounds.top;
    hud.style.left = `${canvas.offsetLeft}px`; hud.style.top = `${canvas.offsetTop}px`;
    hud.style.width = `${bounds.width}px`; hud.style.height = `${bounds.height}px`;
    const ring = hud.querySelector('circle'); ring.setAttribute('cx', x); ring.setAttribute('cy', y); ring.setAttribute('r', $('sculptRadius').value);
    const label = hud.lastElementChild;
    label.style.left = `${Math.max(8, Math.min(bounds.width - 300, x + 18))}px`;
    label.style.top = `${Math.max(8, Math.min(bounds.height - 64, y + 24))}px`;
    label.querySelector('strong').textContent = gesture.id === 'sculptRadius' ? `笔刷半径 ${$('sculptRadius').value} px` : `笔刷强度 ${Math.round(Number($('sculptStrength').value) * 100)}%`;
  }
  function finish(apply) {
    if (!gesture) return false;
    const completed = gesture; gesture = null; loading = true;
    try { if (!apply) write(completed.id, completed.before); } finally {loading = false;}
    hud.hidden = true; controls.enabled = completed.controls; canvas.focus({preventScroll:true});
    remember(); refresh(); status(apply ? '笔刷参数已调整' : '笔刷参数已恢复', 'ready'); return true;
  }
  const cancel = () => finish(false);
  window.addEventListener('keydown', event => {
    if (gesture) {
      consume(event);
      if (event.key === 'Escape') cancel(); else if (event.key === 'Enter') finish(true);
      return;
    }
    if (event.key.toLowerCase() !== 'f' || event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.isComposing
      || event.target?.isContentEditable || event.target?.matches?.('input,textarea,select') || document.querySelector('dialog[open]')
      || !brushTools.has(getTool()) || blocked() || !pointer?.onCanvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (pointer.x < bounds.left || pointer.x > bounds.right || pointer.y < bounds.top || pointer.y > bounds.bottom) return;
    consume(event);
    const id = event.shiftKey ? 'sculptStrength' : 'sculptRadius';
    gesture = {id, x:pointer.x, y:pointer.y, before:$(id).value, controls:controls.enabled};
    controls.enabled = false; hidePreview(); hud.hidden = false; draw(); status(event.shiftKey ? '调整笔刷强度 · 左键确认，Esc 取消' : '调整笔刷半径 · 左键确认，Esc 取消', 'busy');
  }, true);
  window.addEventListener('pointermove', event => {
    if (swallowed === event.pointerId) {consume(event); return;}
    if (!gesture) {pointer = {x:event.clientX, y:event.clientY, onCanvas:event.target === canvas}; return;}
    consume(event);
    const n = Number(gesture.before), dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    const value = gesture.id === 'sculptRadius' ? Math.round(Math.hypot(n + dx, dy)) : Math.round((n + dx / 300) * 100) / 100;
    loading = true; try {write(gesture.id, value);} finally {loading = false;}
    draw();
  }, true);
  window.addEventListener('pointerdown', event => {
    if (!gesture) return;
    consume(event); swallowed = event.pointerId; suppressContextUntil = performance.now() + 500;
    finish(event.button === 0);
  }, true);
  const release = event => {if (swallowed === event.pointerId) {consume(event); swallowed = null;}};
  window.addEventListener('pointerup', release, true); window.addEventListener('pointercancel', event => {release(event);cancel();}, true);
  window.addEventListener('contextmenu', event => {
    if (gesture || performance.now() < suppressContextUntil) {consume(event); cancel();}
  }, true);
  window.addEventListener('blur', () => {cancel(); swallowed = null; pointer = null;});
  window.addEventListener('resize', cancel);
  window.addEventListener('pagehide', () => {cancel(); persist();});
  return {switchTool, cancel, get adjusting() {return Boolean(gesture);}, get restoring() {return loading;},
    smoothSettings() {const values = profiles.SMOOTH_BRUSH || {...defaults, sculptStrength:'0.35'}; return {strength:Number(values.sculptStrength), hardness:Number(values.sculptHardness), flexibility:Number(values.sculptFlexibility), preserveLength:Number(values.sculptLength)};}};
}
