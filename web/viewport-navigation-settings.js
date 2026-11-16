import {
  getViewportNavigationMode,
  setViewportNavigationMode,
  subscribeViewportNavigation,
  viewportNavigationPresets,
} from './viewport-navigation.js';

const endpoint = '/api/viewport-navigation';
const isPreset = mode => Object.hasOwn(viewportNavigationPresets, mode);

function mountSettings() {
  const dialog = document.getElementById('brandAppearanceDialog');
  if (!dialog) return;

  const section = document.createElement('section');
  section.id = 'viewportNavigationSettings';
  section.className = 'brand-background-settings viewport-navigation-settings';
  section.setAttribute('aria-labelledby', 'viewportNavigationTitle');
  section.innerHTML = `
    <div class="brand-background-heading">
      <div>
        <h3 id="viewportNavigationTitle">视口导航</h3>
        <p id="viewportNavigationScope">切换整树、模型和材质工坊 3D 视口的鼠标操作，立即生效。</p>
      </div>
      <label>操作方式
        <select id="viewportNavigationMode" aria-describedby="viewportNavigationScope"></select>
      </label>
    </div>
    <dl class="viewport-navigation-bindings">
      <div><dt>旋转</dt><dd data-binding="orbit"></dd></div>
      <div><dt>平移</dt><dd data-binding="pan"></dd></div>
      <div><dt>缩放</dt><dd data-binding="zoom"></dd></div>
    </dl>
    <div class="viewport-navigation-save">
      <p role="status"></p>
      <button type="button" hidden>重试保存</button>
    </div>`;
  dialog.querySelector('.brand-caption').before(section);

  const select = section.querySelector('select');
  const status = section.querySelector('[role="status"]');
  const retry = section.querySelector('.viewport-navigation-save button');
  for (const [mode, preset] of Object.entries(viewportNavigationPresets)) {
    select.add(new Option(preset.label, mode));
  }
  subscribeViewportNavigation(() => {
    const mode = getViewportNavigationMode();
    select.value = mode;
    for (const binding of section.querySelectorAll('[data-binding]')) {
      binding.textContent = viewportNavigationPresets[mode][binding.dataset.binding];
    }
  });

  let writeRevision = 0;
  let pendingWrite = Promise.resolve();
  function save(mode) {
    const revision = ++writeRevision;
    status.textContent = '正在保存导航设置…';
    retry.hidden = true;
    pendingWrite = pendingWrite.then(async () => {
      if (revision !== writeRevision) return;
      try {
        const response = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        if (!response.ok || !(await response.json()).success) throw Error('Save failed');
        if (revision === writeRevision) status.textContent = '导航设置已保存。';
      } catch {
        if (revision !== writeRevision) return;
        status.textContent = '导航设置保存失败。';
        retry.hidden = false;
      }
    });
  }
  select.addEventListener('change', () => {
    if (!isPreset(select.value)) return;
    setViewportNavigationMode(select.value);
    save(select.value);
  });
  retry.addEventListener('click', () => save(getViewportNavigationMode()));

  async function restore() {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) return;
      const { mode } = await response.json();
      if (!writeRevision && isPreset(mode)) setViewportNavigationMode(mode);
    } catch {
      // Keep the browser preference when the local settings service is unavailable.
    } finally {
      section.dataset.ready = 'true';
    }
  }
  restore();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountSettings, { once: true });
} else {
  mountSettings();
}
