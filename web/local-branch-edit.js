export const LOCAL_BRANCH_FIELDS = {
  localLength: ['length', 1], localRadius: ['radius', 1], localBend: ['bend', 1], localLeaves: ['leaf_density', 1],
  localRotX: ['rotation', 0, 0], localRotY: ['rotation', 0, 1], localRotZ: ['rotation', 0, 2], localOffsetZ: ['offset', 0, 2],
};

// Every preview is measured against the gesture's starting overrides. In a
// mixed selection, edit only the touched property and retain the others.
export function previewLocalBranchField(next, baseline, ids, field, value, relative) {
  const [key, fallback, index] = LOCAL_BRANCH_FIELDS[field];
  for (const id of ids) {
    const before = baseline.overrides[id];
    if (before) next.overrides[id] = structuredClone(before); else delete next.overrides[id];
    const current = (index === undefined ? before?.[key] : before?.[key]?.[index]) ?? fallback;
    const target = relative ? (index === undefined ? current * value : current + value) : value;
    if (target === current) continue;
    const override = next.overrides[id] ||= {};
    if (index === undefined) override[key] = target;
    else { override[key] = [...(before?.[key] || [0, 0, 0])]; override[key][index] = target; }
  }
}

export function bindLocalBranchEdit(api) {
  const $ = id => document.getElementById(id);
  let gesture = null;
  const valid = input => input.value.trim() !== '' && Number.isFinite(Number(input.value)) && input.validity.valid;
  function preview(input) {
    if (!valid(input)) return false;
    const value = Number(input.value);
    if (gesture && gesture.field !== input.id) api.commit();
    if (!gesture) {
      const ids = api.targets(); if (!ids.length) return false;
      api.begin();
      gesture = {field:input.id, ids, baseline:structuredClone(api.authoring()), relative:$('localApplyMode').value === 'RELATIVE'};
      // Committing a previous field refreshes controls; retain this event's value.
      input.value = String(value);
    }
    if (gesture.value === value) return true;
    gesture.value = value;
    api.preview(next => previewLocalBranchField(next, gesture.baseline, gesture.ids, input.id, value, gesture.relative));
    return true;
  }
  function commit(input) {
    if (!valid(input)) { if (gesture) api.cancel(); else api.refresh(); return; }
    if (preview(input)) api.commit();
  }
  for (const id of Object.keys(LOCAL_BRANCH_FIELDS)) {
    const input = $(id); input.dataset.liveBranch = 'true';
    input.addEventListener('input', () => preview(input));
    input.addEventListener('change', () => commit(input));
    input.addEventListener('parameter-edit-cancel', () => { if (gesture) api.cancel(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commit(input); input.blur(); } });
  }
  for (const [id, key] of [['localLocked','locked'],['localHidden','hidden']]) {
    $(id).addEventListener('change', () => {
      const value = $(id).checked;
      if (gesture) api.commit();
      const ids = api.targets();
      api.transact('已自动更新枝条属性', next => {
        for (const stableId of ids) {
          const previous = next.overrides[stableId] || {};
          if (Boolean(previous[key]) === value) continue;
          const override = next.overrides[stableId] ||= {}; override[key] = value;
          if (key === 'locked' && value && !previous.curve_knots) {
            override.curve_knots = api.points(stableId); override.frozen_points = null;
          }
        }
      });
    });
  }
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) { api.cancel(); event.preventDefault(); }
  }, true);
  window.addEventListener('blur', () => { if (gesture) api.cancel(); });
  return {get active(){return Boolean(gesture)}, finish(){gesture=null}, commit(){if(gesture)api.commit()}};
}
