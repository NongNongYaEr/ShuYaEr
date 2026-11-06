// Module chrome uses V040's original palette/panel CSS and icon library.
// These settings are presentation only; no material document fields are changed.
export function setupV040Shell({renderer,root=document}={}){
 const events=new AbortController(),palette=root.getElementById('materialPalette'),valid=['graphite','cream','forest'];let value='graphite';try{value=localStorage.getItem('tree-duck-palette')||value;}catch{}if(!valid.includes(value))value='graphite';root.documentElement.dataset.palette=value;palette.value=value;
 palette.onchange=()=>{if(!valid.includes(palette.value))return;root.documentElement.dataset.palette=palette.value;try{localStorage.setItem('tree-duck-palette',palette.value);}catch{}};
 const home=root.getElementById('materialHome');home.onclick=()=>root.querySelector('[data-stage-button="model"]')?.click();
 const backend=root.getElementById('renderBackend');backend.textContent=renderer.gl.nativeBackend?'DX12 · V040':'WebGL · 诊断';backend.title=window.__treeMaterialNativeStatus?.adapter||'材质视口';
 window.lucide?.createIcons();root.body.classList.add('v040-material-shell');
 window.addEventListener('tree-material:render-error',event=>{const toast=root.getElementById('toast');if(!toast)return;toast.textContent=event.detail;toast.classList.add('error');toast.classList.remove('hidden');},{signal:events.signal});
 return()=>{events.abort();palette.onchange=null;home.onclick=null;};
}
