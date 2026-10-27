// A transient viewport menu. Selecting a command changes selection only;
// opening/dismissing it never starts a brush or changes the camera/tool.
export function createViewportSelectionMenu({canvas, enabled, canOpen, choose}) {
  const menu = document.createElement('div');
  menu.id = 'brushSelectionMenu'; menu.className = 'viewport-selection-menu';
  menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', '笔刷选区');
  menu.innerHTML = '<div class="viewport-selection-menu-title">笔刷选区</div>'
    + '<button type="button" role="menuitem" data-brush-selection="NONE"><i data-lucide="square-dashed"></i>清空所有选择</button>'
    + '<button type="button" role="menuitem" data-brush-selection="ALL"><i data-lucide="square-check-big"></i>选择所有</button>'
    + '<div class="viewport-selection-menu-hint">选择所有可编辑枝干 · 保持当前笔刷</div>';
  document.body.append(menu); window.lucide?.createIcons({root:menu});
  let origin = null, dragged = false;
  const close = () => {menu.hidden = true;};
  canvas.addEventListener('pointerdown', event => {
    close(); origin = event.button === 2 ? [event.clientX, event.clientY] : null; dragged = false;
  }, true);
  canvas.addEventListener('pointermove', event => {
    if (origin && event.buttons === 2 && Math.hypot(event.clientX-origin[0],event.clientY-origin[1]) > 4) {dragged = true; close();}
  }, true);
  const open = event => {
    close();
    if (!enabled() || dragged || !canOpen(event)) return false;
    event.preventDefault(); menu.hidden = false;
    menu.style.left = `${Math.max(8,Math.min(event.clientX,window.innerWidth-menu.offsetWidth-8))}px`;
    menu.style.top = `${Math.max(8,Math.min(event.clientY,window.innerHeight-menu.offsetHeight-8))}px`;
    menu.querySelector('button').focus({preventScroll:true}); return true;
  };
  menu.addEventListener('pointerdown', event => event.stopPropagation());
  menu.addEventListener('click', event => {
    const action = event.target.closest('[data-brush-selection]')?.dataset.brushSelection;
    if (!action) return;
    close(); choose(action); canvas.focus({preventScroll:true});
  });
  menu.addEventListener('keydown', event => {
    if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const buttons = [...menu.querySelectorAll('button')], at = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    buttons[next].focus();
  });
  document.addEventListener('pointerdown', event => {if(!menu.contains(event.target))close();}, true);
  window.addEventListener('keydown', event => {
    if (menu.hidden) return;
    if (event.key === 'Escape') {event.preventDefault();event.stopImmediatePropagation();close();canvas.focus({preventScroll:true});}
    else if (event.key === 'Tab') close();
  }, true);
  window.addEventListener('blur', close); window.addEventListener('resize', close);
  return {open,close};
}
