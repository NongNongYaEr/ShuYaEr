import { copy } from './branch-workbench-data.js';
const $ = (id) => document.getElementById(id);
export function createAssetVersions(api) {
  const panel = document.createElement('details'); panel.id = 'assetVersionPanel'; panel.open = true;
  panel.innerHTML = `<summary>素材版本</summary><label>历史版本<select id="assetVersionSelect"></select></label><div class="wb-row"><button id="assetVersionCompare"><i data-lucide="columns-2"></i>对比造型</button><button id="assetVersionRestore"><i data-lucide="history"></i>恢复为新版</button></div><div id="assetVersionImpact"></div><label>当前实例版本<select id="instanceVersionSelect"></select></label>`;
  $('wbEditAsset').parentElement.after(panel);
  const dialog = document.createElement('dialog'); dialog.id = 'assetVersionDialog';
  dialog.innerHTML = `<h3 id="assetVersionTitle"></h3><div class="asset-version-images"><figure><img id="assetVersionBefore" alt="之前的枝条造型"><figcaption id="assetVersionBeforeLabel"></figcaption></figure><figure><img id="assetVersionAfter" alt="之后的枝条造型"><figcaption id="assetVersionAfterLabel"></figcaption></figure></div><div id="assetVersionAffected"></div><div class="wb-row"><button id="assetVersionCancel">取消</button><button id="assetVersionConfirm">更新素材</button></div>`; document.body.append(dialog);
  let resolve = null, selectedRevision = 0;
  const versions = (item) => [...(item?.versions || []), ...(item ? [item] : [])];
  const impacted = (id) => api.allInstances().filter((i) => i.asset_id === id && i.linked && !i.pinned_revision);
  function close(result = false) { if (dialog.open) dialog.close(); const finish = resolve; resolve = null; finish?.(result); }
  function show(before, after, title, confirmation = true) {
    close(false); $('assetVersionTitle').textContent = title;
    for (const [item, suffix] of [[before, 'Before'], [after, 'After']]) { $('assetVersion' + suffix).src = item.thumbnail || api.thumbnailShape(item.shape); $('assetVersion' + suffix + 'Label').textContent = `v${item.revision} · ${item.shape.branches.length} 枝段`; }
    const list = $('assetVersionAffected'); list.replaceChildren(); const items = confirmation ? impacted(before.id) : [];
    const count = document.createElement('p'); count.textContent = confirmation ? `${items.length} 个跟随最新版本的实例` : '历史造型对比'; list.append(count);
    items.forEach((i) => { const row = document.createElement('div'); row.textContent = `${i.workspace} · ${i.id}`; list.append(row); });
    $('assetVersionConfirm').textContent = confirmation ? '更新素材' : '关闭'; $('assetVersionCancel').hidden = !confirmation;
    dialog.showModal(); return new Promise((done) => resolve = done);
  }
  $('assetVersionConfirm').onclick = () => close(true); $('assetVersionCancel').onclick = () => close(false); dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
  $('assetVersionSelect').onchange = () => { selectedRevision = +$('assetVersionSelect').value; refresh(); };
  $('assetVersionCompare').onclick = () => { const item = api.selectedAsset(), before = versions(item).find((v) => v.revision === selectedRevision); if (item && before) show(before, item, item.name, false); };
  $('assetVersionRestore').onclick = async () => { const item = api.selectedAsset(); if (!item || selectedRevision === item.revision) return; try { await api.restoreVersion(item.id, selectedRevision); } catch (e) { api.toast(e.message, true); } };
  $('instanceVersionSelect').onchange = () => {
    const instance = api.selectedInstance(); if (!instance) return;
    const item = api.library().find((a) => a.id === instance.asset_id), revision = +$('instanceVersionSelect').value;
    const shape = versions(item).find((v) => v.revision === revision)?.shape || item?.shape;
    if (!shape) return;
    api.transact('设置实例素材版本', (a) => { const i = a.branch_instances.find((i) => i.id === instance.id); i.pinned_revision = revision; i.shape = copy(shape); i.linked = true; }, { bypassLayers: true });
  };
  function refresh() {
    const item = api.selectedAsset(), values = versions(item), select = $('assetVersionSelect');
    if (!values.some((v) => v.revision === selectedRevision)) selectedRevision = values.at(-2)?.revision || item?.revision || 0;
    select.replaceChildren(...values.map((v) => new Option(`v${v.revision}${v.revision === item.revision ? ' · 最新' : ''}`, v.revision))); select.value = selectedRevision;
    $('assetVersionCompare').disabled = !item; $('assetVersionRestore').disabled = !item || selectedRevision === item.revision;
    $('assetVersionImpact').textContent = item ? `${impacted(item.id).length} 个实例跟随最新版本` : '未选择素材';
    const instance = api.selectedInstance(), linked = api.library().find((i) => i.id === instance?.asset_id), pin = $('instanceVersionSelect');
    pin.replaceChildren(new Option('跟随最新版本', '0'), ...versions(linked).map((v) => new Option(`固定 v${v.revision}`, v.revision)));
    if (instance?.pinned_revision && !versions(linked).some((v) => v.revision === instance.pinned_revision)) pin.add(new Option(`固定 v${instance.pinned_revision} · 工程副本`, instance.pinned_revision));
    pin.value = instance?.pinned_revision || 0; pin.disabled = !linked || !instance?.linked;
  }
  return { refresh, close, confirmUpdate: (before, after) => show(before, after, `更新 ${after.name}`) };
}
