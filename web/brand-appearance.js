// Read before first paint; appearance is local UI state, never project data.
(() => {
  const valid = ['graphite', 'cream', 'forest'];
  let current = 'graphite';
  const defaultViewportBackground='#0b100d';
  const defaultGroundColor='#101711';
  let groundColor=defaultGroundColor;
  let viewportBackground=defaultViewportBackground;
  const backgroundColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value.trim())?value.trim().toLowerCase():null;
  try { const saved=localStorage.getItem('tree-duck-palette'); if(valid.includes(saved))current=saved; } catch {}
  try { viewportBackground=backgroundColor(localStorage.getItem('tree-duck-viewport-background'))||defaultViewportBackground; } catch {}
  try { groundColor=backgroundColor(localStorage.getItem('tree-duck-ground-color'))||defaultGroundColor; } catch {}
  let initialized=false,revision=0,lastSaved='',saveError='',saving=0,saveTimer=null,writeQueue=Promise.resolve(),cacheChangedAt=0,hasCache=false;
  try{cacheChangedAt=Number(localStorage.getItem('tree-duck-appearance-changed-at'))||0;hasCache=['tree-duck-palette','tree-duck-viewport-background','tree-duck-ground-color'].some(key=>localStorage.getItem(key)!==null);}catch{}
  const snapshot=()=>({palette:current,background:viewportBackground,ground:groundColor});
  const signature=value=>JSON.stringify(value);
  const notify=()=>window.dispatchEvent(new CustomEvent('tree-duck-appearance-save'));
  async function request(method,settings){
    const response=await fetch('/api/appearance',{method,cache:'no-store',...(settings?{headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)}:{})});
    let data;try{data=await response.json();}catch{}
    if(!response.ok||!data?.success)throw Error(data?.message||'设置服务不可用，请完整退出并重启树鸭儿后重试');
    return data;
  }
  async function save(){
    clearTimeout(saveTimer);await window.treeDuckAppearance.ready;
    const settings=snapshot(),modifiedAt=cacheChangedAt;saving++;saveError='';notify();
    const operation=writeQueue.catch(()=>{}).then(async()=>{await request('POST',{...settings,modified_at:modifiedAt});lastSaved=signature(settings);});
    writeQueue=operation;
    try{await operation;return true;}catch(error){saveError=error.message;throw error;}finally{saving--;notify();}
  }
  function changed(){revision++;cacheChangedAt=Math.max(Date.now(),cacheChangedAt+1);try{localStorage.setItem('tree-duck-appearance-changed-at',String(cacheChangedAt));}catch{}saveError='';notify();clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(()=>{}),300);}
  document.documentElement.dataset.palette=current;
  window.treeDuckAppearance={
    save,
    get saveState(){return {loading:!initialized,saving:saving>0,dirty:signature(snapshot())!==lastSaved,error:saveError};},
    get current(){return current},
    get viewportBackground(){return viewportBackground},
    get defaultViewportBackground(){return defaultViewportBackground},
    get groundColor(){return groundColor},
    get defaultGroundColor(){return defaultGroundColor},
    setGroundColor(value){
      const color=backgroundColor(value);if(!color)return false;
      groundColor=color;
      try{localStorage.setItem('tree-duck-ground-color',color)}catch{}
      window.dispatchEvent(new CustomEvent('tree-duck-ground-color',{detail:color}));changed();return true;
    },
    setViewportBackground(value){
      const color=backgroundColor(value);if(!color)return false;
      viewportBackground=color;
      try{localStorage.setItem('tree-duck-viewport-background',color)}catch{}
      window.dispatchEvent(new CustomEvent('tree-duck-viewport-background',{detail:color}));changed();return true;
    },
    set(value){
      if(!valid.includes(value))return;
      current=value;document.documentElement.dataset.palette=value;
      try{localStorage.setItem('tree-duck-palette',value)}catch{}
      window.dispatchEvent(new CustomEvent('tree-duck-appearance',{detail:value}));
      changed();
    },
  };
  window.treeDuckAppearance.ready=(async()=>{
    try{
      const response=await request('GET'),settings=response.settings;
      if(!valid.includes(settings?.palette)||!backgroundColor(settings?.background)||!backgroundColor(settings?.ground))throw Error('已保存设置无法读取，请重新保存设置');
      lastSaved=response.saved?signature({palette:settings.palette,background:backgroundColor(settings.background),ground:backgroundColor(settings.ground)}):'';
      const newerCache=cacheChangedAt>Number(settings.modified_at||0)&&signature(snapshot())!==lastSaved;
      if(!revision&&response.saved&&!newerCache){
        current=settings.palette;viewportBackground=backgroundColor(settings.background);groundColor=backgroundColor(settings.ground);document.documentElement.dataset.palette=current;
        cacheChangedAt=Number(settings.modified_at)||0;
        try{localStorage.setItem('tree-duck-palette',current);localStorage.setItem('tree-duck-viewport-background',viewportBackground);localStorage.setItem('tree-duck-ground-color',groundColor);localStorage.setItem('tree-duck-appearance-changed-at',String(cacheChangedAt));}catch{}
        window.dispatchEvent(new CustomEvent('tree-duck-appearance',{detail:current}));window.dispatchEvent(new CustomEvent('tree-duck-viewport-background',{detail:viewportBackground}));window.dispatchEvent(new CustomEvent('tree-duck-ground-color',{detail:groundColor}));
      }
      if(!revision&&(newerCache||!response.saved&&hasCache))saveTimer=setTimeout(()=>save().catch(()=>{}),0);
    }catch(error){saveError='读取设置失败：'+error.message;}
    finally{initialized=true;notify();}
  })();
})();
