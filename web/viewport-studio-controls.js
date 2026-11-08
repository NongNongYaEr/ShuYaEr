import {STUDIO_ENVIRONMENTS} from './viewport-lighting.js';

const presetDefaults = {fill:100,angle:0,key:100,softness:100,grid:true};

export function createStudioControls(viewport,{onChange,onPreview,onFit,onClose}) {
  const panel = document.createElement('section');
  panel.className = 'photo-studio-panel';
  panel.id = 'photoStudioControls';
  panel.hidden = true;
  panel.setAttribute('aria-label','摄影棚调光');
  panel.innerHTML = `
    <header class="photo-studio-panel-head">
      <div><small><i data-lucide="aperture" aria-hidden="true"></i> PHOTO STUDIO</small><h2>摄影棚</h2></div>
      <button type="button" data-studio="close" title="退出摄影棚" aria-label="退出摄影棚"><i data-lucide="x" aria-hidden="true"></i></button>
    </header>
    <fieldset>
      <legend>灯光环境</legend>
      <div class="photo-studio-presets" data-studio="presets"></div>
      <p class="photo-studio-description" data-studio="description"></p>
    </fieldset>
    <div class="photo-studio-field">
      <div class="photo-studio-field-head"><label for="photoStudioFill">环境补光</label><output data-studio="fill-value" for="photoStudioFill"></output></div>
      <input id="photoStudioFill" type="range" min="35" max="170" step="1" aria-label="环境补光">
    </div>
    <div class="photo-studio-rotation">
      <div class="photo-studio-dial" aria-hidden="true"><i></i></div>
      <div class="photo-studio-field">
        <div class="photo-studio-field-head"><label for="photoStudioAngle">光向</label><span class="photo-studio-degrees"><input data-studio="degrees" type="number" min="0" max="360" step="1" aria-label="光向角度">°</span></div>
        <input id="photoStudioAngle" type="range" min="0" max="360" step="1" aria-label="光向">
      </div>
    </div>
    <details class="photo-studio-fine">
      <summary>细调<i data-lucide="chevron-down" aria-hidden="true"></i></summary>
      <div class="photo-studio-fine-fields">
        <div class="photo-studio-field">
          <div class="photo-studio-field-head"><label for="photoStudioKey">主光强度</label><output data-studio="key-value" for="photoStudioKey"></output></div>
          <input id="photoStudioKey" type="range" min="30" max="160" step="1">
        </div>
        <div class="photo-studio-field">
          <div class="photo-studio-field-head"><label for="photoStudioSoftness">阴影柔度</label><output data-studio="softness-value" for="photoStudioSoftness"></output></div>
          <input id="photoStudioSoftness" type="range" min="35" max="150" step="1">
        </div>
        <label class="photo-studio-grid" for="photoStudioGrid">地面网格<input id="photoStudioGrid" type="checkbox"></label>
      </div>
    </details>
    <footer class="photo-studio-actions">
      <button type="button" class="photo-studio-preview" data-studio="preview" aria-keyshortcuts="H"><i data-lucide="eye" aria-hidden="true"></i> 纯画面预览 <kbd>H</kbd></button>
      <div class="photo-studio-commands">
        <button type="button" data-studio="fit"><i data-lucide="focus" aria-hidden="true"></i> 重新构图</button>
        <button type="button" data-studio="reset"><i data-lucide="rotate-ccw" aria-hidden="true"></i> 恢复预设</button>
      </div>
    </footer>`;
  viewport.append(panel);

  const find = name => panel.querySelector('[data-studio="' + name + '"]');
  const ranges = [
    ['fill',panel.querySelector('#photoStudioFill')],
    ['key',panel.querySelector('#photoStudioKey')],
    ['softness',panel.querySelector('#photoStudioSoftness')],
  ];
  const angle = panel.querySelector('#photoStudioAngle');
  const grid = panel.querySelector('#photoStudioGrid');
  const degrees = find('degrees');
  const description = find('description');
  let settings = {preset:'gallery',...presetDefaults};
  const presets = new Map();
  for (const [key,environment] of Object.entries(STUDIO_ENVIRONMENTS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.studioPreset = key;
    const image = document.createElement('img');
    image.src = './studio-previews/' + key + '.jpg';
    image.alt = '';
    image.draggable = false;
    button.append(image,environment.label);
    button.onclick = () => update({preset:key});
    find('presets').append(button);
    presets.set(key,button);
  }
  function refresh() {
    for (const [name,range] of ranges) {
      range.value = settings[name];
      const value = settings[name] + '%';
      find(name+'-value').value = value;
      range.setAttribute('aria-valuetext',value);
    }
    angle.value = degrees.value = settings.angle;
    angle.setAttribute('aria-valuetext',settings.angle + '°');
    grid.checked = settings.grid;
    description.textContent = STUDIO_ENVIRONMENTS[settings.preset].description;
    panel.style.setProperty('--light-angle',settings.angle + 'deg');
    for (const [key,button] of presets) button.setAttribute('aria-pressed',String(key === settings.preset));
  }
  function update(values) {
    settings = {...settings,...values};
    refresh();
    onChange(settings);
  }
  for (const [name,range] of ranges) range.oninput = () => update({[name]:range.valueAsNumber});
  grid.onchange = () => update({grid:grid.checked});
  angle.oninput = () => update({angle:angle.valueAsNumber});
  degrees.onchange = () => {
    if (Number.isFinite(degrees.valueAsNumber)) update({angle:Math.max(0,Math.min(360,Math.round(degrees.valueAsNumber)))});
    else degrees.value = settings.angle;
  };
  find('reset').onclick = () => update(presetDefaults);
  find('preview').onclick = onPreview;
  find('fit').onclick = onFit;
  find('close').onclick = onClose;
  refresh();
  return {panel,get settings(){ return settings; }};
}
