// Host-neutral seam: the standalone desktop and the future V040 module can
// supply different API roots without changing the material renderer/baker.
const config=window.__treeMaterialHostConfig||{};
export const desktopHost=!!config.desktop;
export const endpoint=name=>(config.apiBase||'/api').replace(/\/$/,'')+'/'+name;
export function notifyReady(){window.dispatchEvent(new CustomEvent('tree-material:ready'));if(window.chrome?.webview)window.chrome.webview.postMessage(JSON.stringify({topic:'tree-material-lab',action:'ready'}));}
export function notifyExport(result){window.dispatchEvent(new CustomEvent('tree-material:exported',{detail:result}));}
export function openOutputFolder(folder){if(window.chrome?.webview)window.chrome.webview.postMessage(JSON.stringify({topic:'tree-material-lab',action:'open-output',folder}));}
