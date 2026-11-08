import {MathUtils, Vector3} from 'three';

const PRESETS = {
  default: {label:'默认 · 现有灯光', sky:0xcde3d2, earth:0x2b312a, fill:1.65,
    key:[0xfff1cf,3.25,[-3.5,-4.2,7.5]], rim:[0x9bbbc3,1.15,[5,4,3]]},
  overcast: {label:'阴天 · 均匀柔光', sky:0xe5eef6, earth:0x586064, fill:2.05,
    key:[0xf4f7ff,1.35,[-3.5,-4.2,8.5]], rim:[0xd8e8ee,.75,[5,4,3.5]]},
  side: {label:'侧光 · 强化起伏', sky:0xd6e5df, earth:0x303b35, fill:1.15,
    key:[0xffecd3,3.65,[-6,-2.4,3.8]], rim:[0xb2c5d7,.95,[5,4,3]]},
  warm: {label:'暖阳 · 展示用光', sky:0xd9e4f6, earth:0x4d4536, fill:1.4,
    key:[0xffca88,3.4,[-4.8,-5.2,3.7]], rim:[0xb6c9eb,1.15,[5,4,4.2]]},
  studio: {label:'棚拍 · 轮廓光', sky:0xe2e7ee, earth:0x38414a, fill:1.55,
    key:[0xf9f5ef,2.3,[-4,-5,5.8]], rim:[0xd7e9ff,2.65,[4.3,4.8,4.5]]},
};
const UP = new Vector3(0,0,1);
export const STUDIO_ENVIRONMENTS = {
  gallery: {label:'暖灰展厅', description:'暖灰背景 · 展示整体', backdrop:0xddd6ce,
    nativeBackdrop:[.72,.66,.60], floor:0xfff3e7, shadow:25,
    sky:0xf9f4ee, earth:0x9da7b0, fill:1.46,
    key:[0xffe9d6,3.12,[-3.6,-3,11.8]], rim:[0xe5efff,1.32,[4.4,5,5.4]]},
  mist: {label:'雾白柔光', description:'中性柔光 · 查看材质颜色', backdrop:0xe7ebee,
    nativeBackdrop:[.84,.89,.94], floor:0xf2f7ff, shadow:34,
    sky:0xf7faff, earth:0xc7d0d8, fill:2.16,
    key:[0xf8fbff,1.85,[-1.5,-3.1,12.6]], rim:[0xe7f1ff,1.04,[4.1,4.4,6.6]]},
  amber: {label:'琥珀侧光', description:'琥珀侧光 · 突出纹理和轮廓', backdrop:0xb8a491,
    nativeBackdrop:[.49,.38,.30], floor:0xe1c8ae, shadow:18,
    sky:0xf1ece7, earth:0xa4a8ba, fill:1.12,
    key:[0xffd0a0,3.8,[7,-4.4,7.8]], rim:[0xffe9cd,1.46,[-6.3,4.6,5.8]]},
};

function applyLighting({hemisphere,key,rim}, values, angle, fill=1, keyStrength=1) {
  hemisphere.color.setHex(values.sky);
  hemisphere.groundColor.setHex(values.earth);
  hemisphere.intensity = values.fill * fill;
  const radians = MathUtils.degToRad(angle % 360);
  for (const [light,[color,intensity,position]] of [[key,values.key],[rim,values.rim]]) {
    light.color.setHex(color);
    light.intensity = light === key ? intensity * keyStrength : intensity;
    light.position.set(...position).applyAxisAngle(UP,radians).add(light.target.position);
  }
}

export function mountViewportLighting({statusbar,hemisphere,key,rim,appearance,openStudio}) {
  const button = document.createElement('button');
  button.id = 'viewportLightingOpen';
  button.className = 'viewport-lighting-button';
  button.type = 'button';
  button.title = '灯光环境';
  button.setAttribute('aria-label','灯光环境');
  button.setAttribute('aria-haspopup','dialog');
  button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-controls','viewportLightingPanel');
  button.innerHTML = '<i data-lucide="sun" aria-hidden="true"></i>';
  const quality = statusbar.querySelector('.native-render-controls label');
  if (quality) quality.after(button);
  else statusbar.firstElementChild.append(button);

  const panel = document.createElement('section');
  panel.id = 'viewportLightingPanel';
  panel.className = 'viewport-lighting-panel';
  panel.hidden = true;
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-label','灯光环境');
  panel.innerHTML = '<label for="viewportLightingPreset">灯光预设</label><select id="viewportLightingPreset"></select>'
    + '<div class="viewport-lighting-angle"><label for="viewportLightingAngle">光向</label><button type="button" id="viewportLightingReset">归零</button></div>'
    + '<div class="viewport-lighting-input"><input id="viewportLightingAngle" type="range" min="0" max="360" step="1">'
    + '<label><input id="viewportLightingDegrees" aria-label="光向角度" type="number" min="0" max="360" step="1">°</label></div>'
    + '<button type="button" class="viewport-lighting-studio" id="viewportPhotoStudio"><i data-lucide="camera" aria-hidden="true"></i>摄影棚模式</button>'
    + '<small role="status" class="viewport-lighting-status" hidden></small>';
  document.body.append(panel);
  const [select,reset,range,degrees,studioButton,note] = panel.querySelectorAll('select,button,input,small');
  for (const [id,value] of Object.entries(PRESETS)) select.add(new Option(value.label,id));

  const lights = {hemisphere,key,rim};
  let state = appearance.viewportLighting;
  let studio = null;
  function updateLights() {
    if (studio) applyLighting(lights,STUDIO_ENVIRONMENTS[studio.preset],studio.angle,studio.fill / 100,studio.key / 100);
    else applyLighting(lights,PRESETS[state.preset] ?? PRESETS.default,state.angle);
  }
  function show(value) {
    state = value;
    select.value = value.preset;
    range.value = degrees.value = value.angle;
    range.setAttribute('aria-valuetext',value.angle+'°');
    if (!studio) updateLights();
  }
  function commit(value) {
    show(value);
    appearance.setViewportLighting(value);
  }
  function place() {
    const anchor = button.getBoundingClientRect();
    const {width,height} = panel.getBoundingClientRect();
    panel.style.left = Math.max(8,Math.min(anchor.right-width,window.innerWidth-width-8))+'px';
    const top = anchor.top-height >= 14 ? anchor.top-height-6 : Math.min(anchor.bottom+6,window.innerHeight-height-8);
    panel.style.top = Math.max(8,top)+'px';
  }
  function close(restoreFocus=false) {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded','false');
    if (restoreFocus) button.focus({preventScroll:true});
  }
  button.onclick = () => {
    if (!panel.hidden) return close(true);
    panel.hidden = false;
    button.setAttribute('aria-expanded','true');
    place();
    select.focus({preventScroll:true});
  };
  select.onchange = () => commit({...state,preset:select.value});
  range.oninput = () => show({...state,angle:range.valueAsNumber});
  range.onchange = () => commit({...state,angle:range.valueAsNumber});
  degrees.onchange = () => {
    const value = degrees.valueAsNumber;
    if (Number.isFinite(value)) commit({...state,angle:MathUtils.clamp(Math.round(value),0,360)});
    else degrees.value = state.angle;
  };
  reset.onclick = () => commit({...state,angle:0});
  studioButton.onclick = () => { if (openStudio()) close(); };
  window.addEventListener('pointerdown',event => {
    if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close();
  },true);
  window.addEventListener('keydown',event => {
    if (event.key !== 'Escape' || panel.hidden || document.querySelector('dialog[open]')) return;
    close(true);
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);
  window.addEventListener('resize',() => { if (!panel.hidden) place(); });
  window.addEventListener('tree-duck-viewport-lighting',event => show(event.detail));
  window.addEventListener('tree-duck-appearance-save',() => {
    const error = appearance.saveState.error;
    note.hidden = !error;
    note.textContent = error ? '灯光偏好保存未完成。' : '';
    note.title = error;
    if (!panel.hidden) place();
  });
  show(state);
  return {setStudio(settings){ studio = settings; updateLights(); }};
}
