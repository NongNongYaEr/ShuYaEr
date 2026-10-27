import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { unitBranchIndex } from '../web/unit-branch-boundary.js';
import { createBranchDeformation } from '../web/branch-deformation-controller.js';
import { createBranchFormTools } from '../web/branch-form-controller.js';
import { createBranchStroke } from '../web/branch-stroke-controller.js';
import { createBranchInfluence } from '../web/branch-influence-controller.js';
import { createBranchSymmetryEditor } from '../web/branch-symmetry-controller.js';
import { createWorkbenchTools } from '../web/branch-workbench-tools.js';

// These tests drive actual controller entry points without a renderer. A
// rejected tool must not build a model, start a gesture, or mutate the project.
function mockDom() {
  const nodes = new Map(), oldDocument = globalThis.document, oldWindow = globalThis.window, oldOption = globalThis.Option;
  class Element extends EventTarget {
    constructor(tag = 'div') { super(); this.tagName = tag.toUpperCase(); this.hidden = false; this.value = ''; this.checked = false; this.disabled = false; this.dataset = {}; this.style = {}; this.children = []; this.validity = { valid: true }; this.classList = { add() {}, remove() {}, toggle() {} }; }
    set id(value) { this._id = value; nodes.set(value, this); }
    get id() { return this._id; }
    append(...children) { this.children.push(...children); for (const child of children) if (child && typeof child === 'object') child.parentElement = this; }
    prepend(...children) { this.append(...children); }
    before() {}
    set innerHTML(html) { this.html = html; for (const m of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) { const node = new Element(m[1]); node.id = m[3]; node.value = m[2].match(/\bvalue="([^"]*)"/)?.[1] || ''; node.type = m[2].match(/\btype="([^"]*)"/)?.[1] || ''; node.checked = /\bchecked\b/.test(m[2]); node.parentElement = this; nodes.set(node.id, node); } }
    get innerHTML() { return this.html || ''; }
    querySelector(selector) { return selector.startsWith('#') ? get(selector.slice(1).split(/[\s\[]/)[0]) : new Element(); }
    querySelectorAll() { return []; }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    add(option) { this.append(option); }
    setAttribute() {}
    getBoundingClientRect() { return { left: 0, top: 0, x: 0, y: 0, width: 1000, height: 1000 }; }
    getClientRects() { return [this.getBoundingClientRect()]; }
    hasPointerCapture() { return false; }
    setPointerCapture() {}
    releasePointerCapture() {}
  }
  const get = id => { if (!nodes.has(id)) { const n = new Element(); n.id = id; n.parentElement = new Element(); nodes.set(id, n); } return nodes.get(id); };
  globalThis.document = { createElement: tag => new Element(tag), getElementById: get, querySelector: selector => selector.startsWith('#') ? get(selector.slice(1)) : new Element(), body: new Element() };
  globalThis.document.body.dataset.workbench = 'TREE'; get('busyOverlay').hidden = true;
  globalThis.window = new EventTarget(); globalThis.Option = class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } };
  const canvas = new Element('canvas'); canvas.parentElement = new Element(); canvas.ownerDocument = globalThis.document;
  return { canvas, get, restore() { globalThis.document = oldDocument; globalThis.window = oldWindow; globalThis.Option = oldOption; } };
}

function fixture() {
  const dom = mockDom(), make = (id, stableId, parentId, extra = {}) => {
    const points = [new THREE.Vector3(id / 2, 0, id / 3), new THREE.Vector3(id / 2 + .2, 0, id / 3 + 1)];
    return { id, stableId, parentId, parentT: .5, points, controlPoints: points.map(p => p.clone()), sampleBindings: [0, 1], children: [], startRadius: .05, endRadius: .01, length: 1, order: id ? 1 : 0, sections: [], radiusProfile: { points: [[0, 1], [1, 1]], interpolation: 'LINEAR' }, ...extra };
  };
  const branches = [make(0, 'ROOT', -1), make(1, 'SIDE', 0), make(2, 'I.R1', 1, { instanceId: 'I' }), make(3, 'I.R2', 2, { instanceId: 'I' }), make(4, 'MANUAL', 3, { manual: true }), make(5, 'OLD_CHILD', 4, { manual: true }), make(6, 'OTHER', 0)];
  for (const b of branches) branches.find(p => p.id === b.parentId)?.children.push(b.id);
  const authoring = normalizeAuthoring(), instances = [{ id: 'I' }], owners = unitBranchIndex(branches, instances).owners;
  const asset = { group: new THREE.Group(), masterBranches: branches, branches, authoring, settings: { taper: 1 } }, camera = new THREE.PerspectiveCamera(45, 1, .01, 100), modelRoot = new THREE.Group(); modelRoot.add(asset.group);
  let selection = new Set(['I.R1']), transactions = 0, begins = 0;
  const messages = [], context = { mode: '', register() {}, setMode(mode) { this.mode = mode; }, refresh() {} };
  const api = { canvas: dom.canvas, camera, modelRoot, controls: { enabled: true }, selectionHelpers: [], getAsset: () => asset, getAuthoring: () => authoring, getSettings: () => ({ leaf_density: 0 }), getSelection: () => [...selection][0], getSelections: () => selection,
    setSelections(ids) { selection = new Set(ids); }, select(id) { selection = new Set(id ? [id] : []); }, setTool() {}, isBranch: () => document.body.dataset.workbench === 'BRANCH', isEditable: id => api.isBranch() || !owners.has(id), toast: message => messages.push(message), isEditing: () => false,
    begin() { begins++; }, preview(mutate) { mutate(authoring); }, commit() {}, cancel() {}, transact(label, mutate) { transactions++; mutate(authoring); }, onDiameter() {}, onTool() {}, fit() {} };
  return { dom, api, context, authoring, branches, messages, select: ids => selection = new Set(ids), get transactions() { return transactions; }, get begins() { return begins; } };
}

test('TREE rejects all unit internals and legacy manual descendants without fallback, history, or content changes', () => {
  const f = fixture();
  try {
    const deform = createBranchDeformation(f.api, f.context), form = createBranchFormTools(f.api, f.context, deform), stroke = createBranchStroke(f.api, f.context), influence = createBranchInfluence(f.api, f.context), symmetry = createBranchSymmetryEditor(f.api, f.context), tools = createWorkbenchTools(f.api);
    const before = JSON.stringify(f.authoring);
    for (const id of ['I.R1', 'I.R2', 'MANUAL', 'OLD_CHILD']) {
      f.select([id]);
      for (const mode of ['CAGE', 'GUIDE', 'SPACE']) { deform.activate(mode); assert.equal(deform.active, false); }
      for (const mode of ['POSE', 'VOLUME']) { form.open(mode); assert.equal(form.active, false); }
      for (const mode of ['EXTEND', 'FORK', 'FILL', 'CLICK']) { stroke.open('', mode); assert.equal(stroke.active, false); }
      influence.open(); assert.equal(influence.active, false);
      f.dom.get('openBranchSymmetry').onclick(); f.dom.get('symmetryNew').onclick();
      assert.equal(tools.getBranch(), null, 'protected explicit selection must not resolve ROOT');
      tools.activate('SECTION'); tools.setRadius(40); tools.setSectionValue('oval', 2); assert.equal(tools.active, false);
    }
    assert.equal(JSON.stringify(f.authoring), before); assert.equal(f.transactions, 0); assert.equal(f.begins, 0); assert.ok(f.messages.length >= 36);
    symmetry.deactivate();
  } finally { f.dom.restore(); }
});

test('bone influence children cannot write unit masks; BRANCH permits internal controls; new symmetry marks the bone boundary', () => {
  const f = fixture();
  try {
    const influence = createBranchInfluence(f.api, f.context), tools = createWorkbenchTools(f.api), symmetry = createBranchSymmetryEditor(f.api, f.context);
    f.select(['SIDE']); influence.open(); assert.equal(influence.active, true); f.dom.get('influenceChildren').checked = true; assert.equal(influence.apply(), true);
    assert.deepEqual(Object.keys(f.authoring.overrides), ['SIDE']);
    f.dom.get('symmetryNew').onclick(); assert.equal(f.authoring.symmetry_groups[0].source, 'SIDE'); assert.equal(f.authoring.symmetry_groups[0].protect_units, true);
    tools.activate('SECTION'); assert.equal(tools.active, true);
    f.select(['I.R2']); tools.refresh(); assert.equal(tools.getBranch(), null); assert.equal(tools.active, false, 'changing to a unit releases internal tool state');
    document.body.dataset.workbench = 'BRANCH'; assert.equal(tools.getBranch().stableId, 'I.R2');
    tools.setRadius(10); assert.ok(f.authoring.overrides['I.R2'].radius_profile);
    influence.open(); assert.equal(influence.active, true); influence.cancel(); symmetry.deactivate();
  } finally { f.dom.restore(); }
});

test('legacy operation targets and volume stamps stay readable but cannot be reopened against protected internals', () => {
  const f = fixture();
  try {
    f.authoring.sculpt_layers = [{ id: 'LEGACY', operation: { type: 'POSE', targets: ['I.R1'] }, branches: {} }, { id: 'STAMP', operation: { type: 'VOLUME', targets: ['SIDE'], stamps: [{ branch: 'MANUAL', t: .5 }] }, branches: {} }];
    f.authoring.influence_regions = [{ id: 'R', targets: ['MANUAL'], children: true }];
    const deform = createBranchDeformation(f.api, f.context), form = createBranchFormTools(f.api, f.context, deform), influence = createBranchInfluence(f.api, f.context), before = JSON.stringify(f.authoring);
    f.select(['SIDE']); deform.activate('POSE', 'LEGACY'); assert.equal(form.active, false); form.open('VOLUME', 'STAMP'); assert.equal(form.active, false); influence.open('R'); assert.equal(influence.active, false);
    assert.equal(JSON.stringify(f.authoring), before); assert.equal(f.transactions, 0); assert.equal(f.begins, 0);
  } finally { f.dom.restore(); }
});
