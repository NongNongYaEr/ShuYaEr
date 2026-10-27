// App-owned confirmation stays above library dialogs and isolates editor keys.
export function createAppConfirm(id) {
  const dialog = document.createElement('dialog');
  dialog.id = id; dialog.className = 'app-confirm';
  dialog.setAttribute('aria-labelledby', `${id}Title`);
  dialog.setAttribute('aria-describedby', `${id}Message`);
  dialog.innerHTML = `<header><div><span class="app-confirm-kicker">树鸭儿 · 工程与样板</span><h2 id="${id}Title"></h2></div><img src="/brand/guide-projects-v1.png" alt="" aria-hidden="true"></header>
    <div class="app-confirm-body"><div class="app-confirm-item"><i data-lucide="folder-open" aria-hidden="true"></i><div><strong data-confirm-name></strong><small data-confirm-detail></small></div></div><p id="${id}Message"></p></div>
    <label class="app-confirm-input" hidden>名称<input maxlength="80" autocomplete="off"></label>
    <footer><button type="button" data-confirm-cancel autofocus>取消</button><button type="button" data-confirm-save hidden>保存后打开</button><button type="button" data-confirm-accept>继续打开</button></footer>`;
  document.body.append(dialog);
  window.lucide?.createIcons({ nodes: [dialog] });
  let resolve = null;
  function close(accepted = false) {
    if (!dialog.open) return;
    dialog.close(accepted ? 'accept' : 'cancel');
  }
  dialog.querySelector('[data-confirm-cancel]').onclick = () => close();
  dialog.querySelector('[data-confirm-accept]').onclick = () => {
    const input=dialog.querySelector('input');
    if(!input.closest('label').hidden && !input.reportValidity())return;
    close(true);
  };
  dialog.querySelector('[data-confirm-save]').onclick = () => dialog.close('save');
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { const done = resolve; resolve = null; done?.(dialog.returnValue==='save'?'save':dialog.returnValue==='accept'?(dialog.querySelector('.app-confirm-input').hidden?true:dialog.querySelector('input').value.trim()):false); });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('keyup', event => event.stopPropagation());
  return function confirm({ title, name, detail = '', message, accept = '继续打开', danger = false, save = false, input = null }) {
    if (resolve) return Promise.resolve(false);
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('[data-confirm-name]').textContent = name;
    dialog.querySelector('[data-confirm-detail]').textContent = detail;
    dialog.querySelector('p').textContent = message;
    dialog.querySelector('[data-confirm-accept]').textContent = accept;
    dialog.querySelector('[data-confirm-save]').hidden=!save;
    dialog.querySelector('.app-confirm-input').hidden=input===null;
    dialog.querySelector('input').value=input||'';dialog.querySelector('input').required=input!==null;
    dialog.classList.toggle('app-confirm-danger', danger);
    dialog.returnValue = '';
    return new Promise(done => { resolve = done; dialog.showModal(); dialog.querySelector('[data-confirm-cancel]').focus(); });
  };
}
