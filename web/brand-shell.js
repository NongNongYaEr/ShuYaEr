// Presentation only: original editor/export controls and project formats stay owned by their modules.
(() => {
  const $ = id => document.getElementById(id);
  const desktopStartup=window.__treeDuckDesktopStartup===true && typeof window.chrome?.webview?.postMessage==='function';
  const startupMessage=(type,text='')=>{if(desktopStartup)window.chrome.webview.postMessage('tree-duck:startup-'+type+text);};
  let readyScheduled=false,startupFailed=false;
  const splash = document.createElement('section');
  splash.id = 'brandStartup'; splash.setAttribute('aria-label', '树鸭儿启动状态');
  // Desktop keeps its native splash until the editor has painted; never show a second one.
  if(desktopStartup)splash.style.display='none';
  splash.innerHTML = `<div class="brand-startup-card"><div class="brand-startup-copy"><img src="/brand/tree-duck-v5-256.png" alt=""><h1>树鸭儿</h1><p>把灵感，种成风景。</p><small>树木塑形 / 枝条创作 / 藤蔓生长</small></div><div class="brand-startup-status"><span class="brand-loading-dot"></span><span id="brandStartupStatus" role="status">正在准备植物工作台…</span></div><span class="brand-signature">鸭儿出品 · 为创作而生</span><button id="brandStartupDismiss">进入工作台</button></div>`;
  document.body.append(splash);
  // Never invent percentages or delay readiness for the illustration.
  const statusObserver = new MutationObserver(() => {
    $('brandStartupStatus').textContent = $('statusText')?.textContent || '正在准备植物工作台…';
    startupMessage('status:',$('brandStartupStatus').textContent.slice(0,300));
  });
  if ($('statusText')) statusObserver.observe($('statusText'), {childList:true,subtree:true,characterData:true});
  const dismiss = () => { splash.remove(); statusObserver.disconnect(); };
  $('brandStartupDismiss').onclick = dismiss;
  window.treeDuckUI = {ready() {
    if(readyScheduled||startupFailed)return;
    readyScheduled=true;
    // initialize() has built the model; allow the viewport and layout to paint before handoff.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(startupFailed)return;
      dismiss();startupMessage('ready');
    }));
  }, error(message) {
    if(startupFailed)return;
    startupFailed=true;
    statusObserver.disconnect();
    startupMessage('error:',String(message).slice(0,1000));
    if (!splash.isConnected) return;
    $('brandStartupStatus').textContent = '启动未完成：' + message;
    splash.classList.add('failed');
    $('brandStartupDismiss').textContent = '查看工作台';
  }};
  window.addEventListener('error', event => window.treeDuckUI.error(event.message || '界面资源加载失败'));

  const home = document.createElement('dialog'); home.id = 'brandHomeDialog'; home.className = 'brand-dialog'; home.setAttribute('aria-labelledby','brandHomeTitle');
  home.innerHTML = `<div class="brand-home-hero"><div class="brand-home-copy"><span class="brand-kicker">鸭儿 · 植物创作工坊</span><h2 id="brandHomeTitle">今天，种一点<br>不一样的风景。</h2><p>从一根枝条，到一片绿意。</p><div class="brand-home-actions"><button class="icon-text accent" data-launch="openProjectLibrary">从样板开始</button><button class="icon-text" data-launch="projectInput">打开工程</button></div></div><button data-brand-close aria-label="关闭欢迎页">×</button></div><div class="brand-home-body"><div class="brand-home-heading"><h3>选择你的创作方式</h3><button data-brand-close class="icon-text">继续当前创作 →</button></div><div class="brand-home-cards"><button data-launch="treeWorkspaceBtn"><i data-lucide="trees"></i><strong>整树造型</strong><span>塑造主干与树冠，装配样本枝。</span></button><button data-launch="branchWorkspaceBtn"><i data-lucide="git-branch"></i><strong>枝条工作台</strong><span>从枝干到叶花果，细雕每个单元。</span></button><button data-launch="vineWorkspaceBtn"><i data-lucide="sprout"></i><strong>藤蔓植物</strong><span>沿模型生长，布置自然攀爬。</span></button></div><div class="brand-home-footer"><span>选中后使用 <kbd>G</kbd> 移动 · <kbd>R</kbd> 旋转 · <kbd>S</kbd> 缩放</span><label>界面密度<select id="brandDensity" aria-label="界面密度"><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></label></div></div>`;
  document.body.append(home);
  // CSS-only scene motion: no editor render loop, stopped while hidden or reduced-motion.
  for(const host of [splash.querySelector('.brand-startup-card'),home.querySelector('.brand-home-hero')]){
    const scene=document.createElement('div');scene.className='brand-scene';scene.setAttribute('aria-hidden','true');
    scene.innerHTML='<span class="brand-floating-leaf"></span><span class="brand-floating-leaf"></span><span class="brand-floating-leaf"></span>';
    host.prepend(scene);
    const toggle=document.createElement('button');toggle.className='brand-motion-toggle';toggle.type='button';
    toggle.setAttribute('aria-label','插画动效');host.append(toggle);
  }
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let sceneMotion=true;try{sceneMotion=localStorage.getItem('tree-duck-scene-motion')!=='off'}catch{}
  const syncSceneMotion=()=>{
    const running=sceneMotion&&!reducedMotion.matches;
    document.documentElement.dataset.brandMotion=running?'on':'off';
    document.documentElement.dataset.brandPaused=document.hidden?'true':'false';
    document.querySelectorAll('.brand-motion-toggle').forEach(button=>{
      button.textContent=running?'暂停动效':'开启动效';button.setAttribute('aria-pressed',String(running));
      button.disabled=reducedMotion.matches;
      button.title=reducedMotion.matches?'已遵循系统减少动态效果设置':'切换插画动效，不影响模型预览';
    });
  };
  document.querySelectorAll('.brand-motion-toggle').forEach(button=>button.onclick=()=>{
    sceneMotion=!sceneMotion;try{localStorage.setItem('tree-duck-scene-motion',sceneMotion?'on':'off')}catch{}syncSceneMotion();
  });
  reducedMotion.addEventListener('change',syncSceneMotion);
  document.addEventListener('visibilitychange',syncSceneMotion);syncSceneMotion();
  const appearance=document.createElement('dialog');appearance.id='brandAppearanceDialog';appearance.className='brand-dialog';appearance.setAttribute('aria-labelledby','brandAppearanceTitle');
  appearance.innerHTML=`<div class="brand-dialog-heading"><div><span class="brand-kicker">让工作台适合你</span><h2 id="brandAppearanceTitle">选一种创作心情</h2></div><button data-brand-close aria-label="关闭外观设置">×</button></div><p class="brand-caption">配色立即生效，并在这台设备上记住。模型、贴图与导出颜色保持原样。</p><div class="brand-palette-options" role="group" aria-label="界面配色"><button data-palette-choice="graphite" aria-pressed="false"><span class="palette-preview palette-graphite" aria-hidden="true"><i></i><b></b><em></em></span><strong>石墨黄 <small>默认</small></strong><span>中性深灰，让植物与黄色更突出。</span></button><button data-palette-choice="cream" aria-pressed="false"><span class="palette-preview palette-cream" aria-hidden="true"><i></i><b></b><em></em></span><strong>奶油白</strong><span>温暖明亮，适合喜欢浅色界面的你。</span></button><button data-palette-choice="forest" aria-pressed="false"><span class="palette-preview palette-forest" aria-hidden="true"><i></i><b></b><em></em></span><strong>森林绿</strong><span>低饱和绿，延续植物工坊的气质。</span></button></div><div class="brand-appearance-note"><i data-lucide="sun-medium"></i><span>背景、地面与界面配色分别设置，植物材质、灯光和模型导出保持原样。</span></div>`;
  document.body.append(appearance);
  const backgroundSettings=document.createElement('section');backgroundSettings.className='brand-background-settings';backgroundSettings.setAttribute('aria-labelledby','brandBackgroundTitle');
  backgroundSettings.innerHTML=`<div class="brand-background-heading"><div><h3 id="brandBackgroundTitle">视口背景</h3><p>选择适合观察植物的底色，实时生效并在这台设备上记住。</p></div><button id="brandBackgroundReset" type="button">恢复默认</button></div>
    <div class="brand-background-controls"><label>背景颜色<input id="brandBackgroundColor" type="color" aria-label="视口背景颜色"></label><label>颜色值<input id="brandBackgroundHex" type="text" maxlength="7" spellcheck="false" autocomplete="off" placeholder="#0b100d"></label><div class="brand-background-presets" role="group" aria-label="背景预设"><button type="button" data-background-color="#0b100d" aria-pressed="false"><i style="--swatch:#0b100d"></i>深绿</button><button type="button" data-background-color="#34383d" aria-pressed="false"><i style="--swatch:#34383d"></i>石墨灰</button><button type="button" data-background-color="#c4c8c4" aria-pressed="false"><i style="--swatch:#c4c8c4"></i>浅灰</button></div></div><p id="brandBackgroundError" role="alert" hidden>请输入完整颜色值，例如 #34383d。</p>`;
  appearance.querySelector('.brand-appearance-note').before(backgroundSettings);
  const syncBackground=()=>{const value=window.treeDuckAppearance.viewportBackground;$('brandBackgroundColor').value=value;$('brandBackgroundHex').value=value;$('brandBackgroundError').hidden=true;for(const button of appearance.querySelectorAll('[data-background-color]'))button.setAttribute('aria-pressed',String(button.dataset.backgroundColor===value));};
  $('brandBackgroundColor').oninput=()=>window.treeDuckAppearance.setViewportBackground($('brandBackgroundColor').value);
  $('brandBackgroundHex').onchange=()=>{$('brandBackgroundError').hidden=window.treeDuckAppearance.setViewportBackground($('brandBackgroundHex').value);};
  $('brandBackgroundHex').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('brandBackgroundHex').blur();}};
  $('brandBackgroundReset').onclick=()=>window.treeDuckAppearance.setViewportBackground(window.treeDuckAppearance.defaultViewportBackground);
  for(const button of appearance.querySelectorAll('[data-background-color]'))button.onclick=()=>window.treeDuckAppearance.setViewportBackground(button.dataset.backgroundColor);
  window.addEventListener('tree-duck-viewport-background',syncBackground);syncBackground();
  const groundSettings=document.createElement('div');groundSettings.className='brand-ground-settings';
  groundSettings.innerHTML=`<div class="brand-background-heading"><div><h3 id="brandGroundTitle">地面颜色</h3><p>单独调整承接阴影的地面，与背景自由搭配。</p></div><button id="brandGroundReset" type="button">恢复默认</button></div>
    <div class="brand-background-controls"><label>地面颜色<input id="brandGroundColor" type="color" aria-label="视口地面颜色"></label><label>颜色值<input id="brandGroundHex" type="text" maxlength="7" spellcheck="false" autocomplete="off" placeholder="#101711"></label><div class="brand-background-presets" role="group" aria-label="地面预设"><button type="button" data-ground-color="#101711" aria-pressed="false"><i style="--swatch:#101711"></i>深绿</button><button type="button" data-ground-color="#383d40" aria-pressed="false"><i style="--swatch:#383d40"></i>石墨灰</button><button type="button" data-ground-color="#9da49b" aria-pressed="false"><i style="--swatch:#9da49b"></i>浅灰</button></div></div><p id="brandGroundError" role="alert" hidden>请输入完整颜色值，例如 #383d40。</p>`;
  groundSettings.setAttribute('role','group');groundSettings.setAttribute('aria-labelledby','brandGroundTitle');backgroundSettings.append(groundSettings);
  const syncGround=()=>{const value=window.treeDuckAppearance.groundColor;$('brandGroundColor').value=value;$('brandGroundHex').value=value;$('brandGroundError').hidden=true;for(const button of appearance.querySelectorAll('[data-ground-color]'))button.setAttribute('aria-pressed',String(button.dataset.groundColor===value));};
  $('brandGroundColor').oninput=()=>window.treeDuckAppearance.setGroundColor($('brandGroundColor').value);
  $('brandGroundHex').onchange=()=>{$('brandGroundError').hidden=window.treeDuckAppearance.setGroundColor($('brandGroundHex').value);};
  $('brandGroundHex').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('brandGroundHex').blur();}};
  $('brandGroundReset').onclick=()=>window.treeDuckAppearance.setGroundColor(window.treeDuckAppearance.defaultGroundColor);
  for(const button of appearance.querySelectorAll('[data-ground-color]'))button.onclick=()=>window.treeDuckAppearance.setGroundColor(button.dataset.groundColor);
  window.addEventListener('tree-duck-ground-color',syncGround);syncGround();
  const appearanceFooter=document.createElement('footer');appearanceFooter.className='brand-appearance-footer';
  appearanceFooter.innerHTML='<p id="brandAppearanceSaveStatus" role="status" aria-live="polite"></p><button id="brandAppearanceSave" type="button" class="accent">保存设置</button>';appearance.append(appearanceFooter);
  const syncSave=()=>{const state=window.treeDuckAppearance.saveState;$('brandAppearanceSave').disabled=state.loading||state.saving;$('brandAppearanceSave').textContent=state.saving?'正在保存…':'保存设置';$('brandAppearanceSaveStatus').textContent=state.loading?'正在读取设置…':state.saving?'正在保存配色、背景和地面…':state.error?'保存未完成：'+state.error:state.dirty?'修改即时生效，自动保存；也可点击保存设置。':'设置已保存，重新启动后自动恢复。';$('brandAppearanceSaveStatus').classList.toggle('save-error',!!state.error);};
  $('brandAppearanceSave').onclick=()=>window.treeDuckAppearance.save().catch(()=>{});
  window.addEventListener('tree-duck-appearance-save',syncSave);syncSave();
  const appearanceButton=document.createElement('button');appearanceButton.id='brandAppearanceOpen';appearanceButton.className='brand-appearance-button';appearanceButton.title='外观与配色';appearanceButton.setAttribute('aria-label','外观与配色');appearanceButton.setAttribute('aria-haspopup','dialog');appearanceButton.innerHTML='<i data-lucide="palette"></i>';
  $('brandExportOpen').before(appearanceButton);
  const homeAppearance=document.createElement('button');homeAppearance.id='brandHomeAppearance';homeAppearance.className='icon-text';homeAppearance.textContent='外观与配色';home.querySelector('.brand-home-footer').append(homeAppearance);
  const syncAppearance=()=>appearance.querySelectorAll('[data-palette-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.paletteChoice===window.treeDuckAppearance.current)));
  const showAppearance=()=>{syncAppearance();appearance.showModal();};appearanceButton.onclick=showAppearance;homeAppearance.onclick=showAppearance;
  appearance.querySelectorAll('[data-palette-choice]').forEach(b=>b.onclick=()=>window.treeDuckAppearance.set(b.dataset.paletteChoice));
  window.addEventListener('tree-duck-appearance',syncAppearance);syncAppearance();
  let density='comfortable'; try { density=localStorage.getItem('tree-duck-ui-density')==='compact'?'compact':'comfortable'; } catch {}
  document.documentElement.dataset.uiDensity=density; $('brandDensity').value=density;
  $('brandDensity').onchange=()=>{document.documentElement.dataset.uiDensity=$('brandDensity').value;try{localStorage.setItem('tree-duck-ui-density',$('brandDensity').value)}catch{}};
  const exportDialog=$('brandExportDialog');
  $('brandHome').onclick=()=>{home.showModal();window.lucide?.createIcons();};
  $('brandExportOpen').onclick=()=>exportDialog.showModal();
  for(const dialog of [home,exportDialog,appearance]) {
    dialog.querySelectorAll('[data-brand-close]').forEach(b=>b.onclick=()=>dialog.close());
    // Prevent G/R/S and other editor shortcuts from editing a model behind a dialog.
    dialog.addEventListener('keydown',e=>e.stopPropagation());
    dialog.addEventListener('keyup',e=>e.stopPropagation());
  }
  home.querySelectorAll('[data-launch]').forEach(button=>button.onclick=()=>{
    const target=$(button.dataset.launch); if(!target || target.disabled) return;
    home.close(); target.click();
  });
  // Close synchronously before existing async export handlers can open their save dialog.
  exportDialog.addEventListener('click',e=>{if(e.target.closest('button[id^="export"]:not(:disabled)'))exportDialog.close();},true);
  document.querySelector('label[for="projectInput"]').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('projectInput').click();}});
  document.querySelectorAll('.topbar button').forEach(b=>{if(!b.title)b.title=b.textContent.trim();});
  window.lucide?.createIcons();
})();
