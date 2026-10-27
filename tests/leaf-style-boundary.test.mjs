import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeafResources } from '../web/leaf-resources.js';
import { createFloweringWorkspace } from '../web/flowering-workspace.js';
import { normalizeFlowering } from '../web/flowering-data.js';
import { canEditLeafStyle, isLeafStyleControl, restoreLeafStyleControls, createLeafStyleBoundaryUi } from '../web/leaf-style-boundary.js';

function fixture() {
  const saved = Object.fromEntries(['document','window','indexedDB','Option','MutationObserver','createImageBitmap'].map(key => [key, globalThis[key]]));
  const nodes = new Map(), classes = () => { const set = new Set(); return { add: value => set.add(value), contains: value => set.has(value), toggle(value, enabled) { if (enabled) set.add(value); else set.delete(value); } }; };
  class Element extends EventTarget {
    constructor(tag = 'div') { super(); this.tagName = tag.toUpperCase(); this.value = ''; this.disabled = false; this.hidden = false; this.children = []; this.dataset = {}; this.validity = { valid: true }; this.classList = classes(); this.attributes = new Map(); this.parentElement = { before() {} }; }
    set id(value) { this._id = value; nodes.set(value, this); }
    get id() { return this._id; }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.children = children; }
    set innerHTML(html) { this.html = html; for (const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) { const node = new Element(match[1]); node.id = match[3]; node.value = match[2].match(/\bvalue="([^"]*)"/)?.[1] || ''; node.type = match[2].match(/\btype="([^"]*)"/)?.[1] || ''; } }
    getAttribute(key) { return this.attributes.get(key); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    click() { this.clicked = (this.clicked || 0) + 1; return this.onclick?.(); }
    closest() { return null; }
    after() {}
    querySelector() { return new Element(); }
    querySelectorAll() { return []; }
    getContext() { return { drawImage() {} }; }
    toDataURL() { return 'data:image/png;base64,AAAA'; }
  }
  const get = id => { if (!nodes.has(id)) { const node = new Element(); node.id = id; } return nodes.get(id); };
  const page = new Element(), body = new Element(); body.dataset.workbench = 'TREE';
  globalThis.document = { body, head: new Element(), activeElement: null, createElement: tag => new Element(tag), getElementById: get, querySelector: () => page };
  globalThis.window = new EventTarget();
  globalThis.Option = class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } };
  globalThis.MutationObserver = class { constructor(fn) { this.fn = fn; } observe() {} };
  const initial = { id: 'SHARED', name: '共享叶片', meshes: [{ id: 'LEAF' }], material: { color: 'data:image/png;base64,AAAA', cutoff: .4, roughness: .72 } }, items = new Map([[initial.id, initial]]);
  let storeWrites = 0;
  globalThis.indexedDB = { open() { const req = {}; queueMicrotask(() => { req.result = { close() {}, transaction() { const tx = { objectStore() { const action = fn => { const request = { result: fn() }; queueMicrotask(() => tx.oncomplete?.()); return request; }; return { getAll: () => action(() => [...items.values()]), put: v => action(() => { storeWrites++; items.set(v.id, structuredClone(v)); }), delete: id => action(() => { storeWrites++; items.delete(id); }) }; } }; return tx; } }; req.onsuccess(); }); return req; } };
  let mode = 'TREE', transactions = 0, begins = 0, replacements = 0;
  const authoring = { leaf_material: structuredClone(initial.material), foliage_masks: [{ id: 'OLD_MASK', mode: 'EXCLUDE' }], recipe: { tags: ['LEGACY'] } }, messages = [];
  const api = { isTree: () => mode === 'TREE', getAuthoring: () => authoring, toast: message => messages.push(message), begin() { begins++; }, preview(fn) { fn(authoring); }, commit() {}, transact(label, fn) { transactions++; fn(authoring); }, async flush() {}, capture: () => ({ leaf_meshes: structuredClone(initial.meshes) }), async replaceLeaves(meshes, material) { replacements++; authoring.leaf_material = structuredClone(material); } };
  const controller = createLeafResources(api);
  return { api, authoring, controller, get, page, Element, items, messages, setMode(value) { mode = value; body.dataset.workbench = value; controller.refresh(); }, get transactions() { return transactions; }, get begins() { return begins; }, get replacements() { return replacements; }, get storeWrites() { return storeWrites; }, restore() { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('TREE rejects actual shared leaf mutations, restores blocked values and keeps library management available', async () => {
  const f = fixture();
  try {
    await settle(); f.controller.refresh(); const before = JSON.stringify(f.authoring);
    for (const id of ['leafResourceImport','leafTextureLoad','leafNormalLoad','leafTextureClear']) f.get(id).onclick();
    for (const id of ['leafCutoff','leafRoughness']) { document.activeElement = f.get(id); f.get(id).value = '.9'; f.get(id).oninput(); f.get(id).onchange(); assert.equal(Number(f.get(id).value), id === 'leafCutoff' ? .4 : .72); }
    f.get('leafTextureInput').files = [{ name: 'texture.png', type: 'image/png', size: 20 }]; await f.get('leafTextureInput').onchange();
    f.get('leafResourceList').value = 'SHARED'; await f.get('leafResourceUse').onclick();
    assert.equal(f.transactions, 0); assert.equal(f.begins, 0); assert.equal(f.replacements, 0); assert.equal(f.get('leafInput').clicked || 0, 0); assert.equal(JSON.stringify(f.authoring), before);
    assert.equal(f.get('leafResourceUse').disabled, true); assert.equal(f.get('leafResourceDelete').disabled, false);
    f.get('leafResourceName').value = '另存共享套装'; await f.get('leafResourceSave').onclick(); assert.equal(f.items.size, 2); assert.equal(f.storeWrites, 1);
    await f.get('leafResourceDelete').onclick(); assert.equal(f.items.size, 1); assert.equal(f.storeWrites, 2); assert.equal(JSON.stringify(f.authoring), before);
  } finally { f.restore(); }
});

test('BRANCH and VINE still edit/apply shared styles; an asynchronous texture cannot leak into a switched TREE', async () => {
  const f = fixture();
  try {
    await settle();
    for (const mode of ['BRANCH','VINE']) { f.setMode(mode); assert.equal(f.get('leafResourceUse').disabled, false); f.get('leafResourceList').value = 'SHARED'; await f.get('leafResourceUse').onclick(); f.get('leafRoughness').value = '.6'; f.get('leafRoughness').oninput(); f.get('leafRoughness').onchange(); assert.equal(f.authoring.leaf_material.roughness, .6); }
    assert.equal(f.replacements, 2); assert.equal(f.begins, 2);
    let finish, closed = false; globalThis.createImageBitmap = () => new Promise(resolve => { finish = resolve; });
    f.get('leafTextureInput').files = [{ name: 'new.png', type: 'image/png', size: 20 }]; const pending = f.get('leafTextureInput').onchange();
    f.setMode('TREE'); const before = JSON.stringify(f.authoring); finish({ width: 8, height: 8, close() { closed = true; } }); await pending;
    assert.equal(closed, true); assert.equal(f.transactions, 0); assert.equal(JSON.stringify(f.authoring), before);
  } finally { f.restore(); }
});

test('TREE leaf guide routes a selected reusable model to its source and unlocks colors outside TREE', () => {
  const f = fixture();
  try {
    const internal = new f.Element(); internal.id = 'OLD_MASK_PANEL'; f.page.append(internal);
    const flowerLibrary = new f.Element(); flowerLibrary.id = 'flowerResourcePanel'; f.page.append(flowerLibrary);
    let selected = false, opened = 0;
    const ui = createLeafStyleBoundaryUi({ ...f.api, canEditSource: () => selected, editSource() { opened++; } });
    assert.equal(f.get('treeLeafStyleBoundary').hidden, false); assert.equal(internal.classList.contains('leaf-style-internal'), true); assert.equal(flowerLibrary.classList.contains('leaf-style-internal'), false);
    assert.equal(f.get('treeLeafStyleEditSource').disabled, true); selected = true; ui.refresh(); f.get('treeLeafStyleEditSource').onclick(); assert.equal(opened, 1);
    assert.equal(f.get('leafColor').disabled, true); assert.equal(isLeafStyleControl(f.get('leafColor')), true); assert.equal(isLeafStyleControl(f.get('barkColor')), false);
    f.get('leafColor').value = '#ff0000'; f.get('barkColor').value = '#123456';
    restoreLeafStyleControls({ leaf_color: '#008800', bark_color: '#885522' }, { leaf_color: 'leafColor', bark_color: 'barkColor' }, f.get);
    assert.equal(f.get('leafColor').value, '#008800'); assert.equal(f.get('barkColor').value, '#123456', 'a group reset may still change skeleton bark color');
    f.setMode('BRANCH'); ui.refresh(); assert.equal(f.get('treeLeafStyleBoundary').hidden, true); assert.equal(f.get('leafColor').disabled, false); assert.equal(canEditLeafStyle(f.api), true);
  } finally { f.restore(); }
});

test('shared flower library cannot apply or preview internal styles in TREE, while BRANCH controls remain live', async () => {
  const f = fixture();
  try {
    f.authoring.flowering = normalizeFlowering();
    const api = { ...f.api, canvas: new f.Element(), controls: { enabled: true }, isActive: () => true, getAsset: () => ({ blooms: [], report: {} }), setTool() {} };
    const flowers = createFloweringWorkspace(api, new f.Element()); await settle(); flowers.refresh();
    const before = JSON.stringify(f.authoring);
    for (const id of ['flowerBuiltin','flowerClearMaps','bloomRestore','flowerImport']) f.get(id).onclick();
    for (const id of ['flowerCutoff','flowerRoughness','bloom_amount']) { f.get(id).value = '.9'; f.get(id).oninput(); f.get(id).onchange(); }
    f.get('flowerLibrary').value = 'SHARED'; f.get('flowerUse').onclick();
    assert.equal(f.transactions, 0); assert.equal(f.begins, 0); assert.equal(JSON.stringify(f.authoring), before); assert.equal(f.get('flowerUse').disabled, true); assert.equal(f.get('flowerDelete').disabled, false);
    f.setMode('BRANCH'); flowers.refresh(); f.get('flowerRoughness').value = '.5'; f.get('flowerRoughness').oninput(); f.get('flowerRoughness').onchange(); assert.equal(f.authoring.flowering.material.roughness, .5); assert.equal(f.begins, 1);
  } finally { f.restore(); }
});
