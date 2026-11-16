export function mountHelpWiki() {
  if (document.getElementById('helpWikiOpen')) return;
  const toolbar = document.querySelector('.topbar .build-actions');
  if (!toolbar) return;

  const open = document.createElement('button');
  open.type = 'button';
  open.id = 'helpWikiOpen';
  open.className = 'icon-text';
  open.title = '在独立窗口中打开使用手册';
  open.innerHTML = '<i data-lucide="book-open" aria-hidden="true"></i><span>帮助</span>';
  toolbar.append(open);

  const url = new URL('./help-wiki-reader.html', import.meta.url);
  let readerWindow;
  open.onclick = () => {
    if (readerWindow && !readerWindow.closed) {
      readerWindow.focus();
      return;
    }
    const width = Math.min(520, Math.max(360, Math.round(screen.availWidth * .34)));
    const height = Math.min(840, screen.availHeight - 48);
    const left = (screen.availLeft || 0) + screen.availWidth - width - 24;
    const top = (screen.availTop || 0) + 32;
    const opened = window.open(url.href, 'shuyaer-help', `popup,resizable=yes,width=${width},height=${height},left=${left},top=${top}`);
    // The desktop host reuses its own reader window.
    if (!window.chrome?.webview) readerWindow = opened;
  };
}
