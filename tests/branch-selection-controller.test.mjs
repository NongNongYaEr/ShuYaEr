import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBranchSelectionController } from '../web/branch-selection-controller.js';
import { normalizeAuthoring } from '../web/authoring-state.js';

function fixture({ selected = [], extraHits = null, selectable = () => true } = {}) {
  const previous = { document: globalThis.document, window: globalThis.window, cancel: globalThis.cancelAnimationFrame };
  const nodes = new Map();
  class Element extends EventTarget {
    constructor() { super(); this.hidden = false; this.style = {}; this.dataset = {}; this.value = ''; this.checked = false; this.offsetLeft = this.offsetTop = 0; this.attributes = new Map(); this.classList = { toggle() {} }; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
    closest() { return this.parentElement ||= new Element(); }
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 800 }; }
    setPointerCapture(id) { this.pointer = id; }
    hasPointerCapture(id) { return this.pointer === id; }
    releasePointerCapture() { this.pointer = null; }
  }
  globalThis.document = Object.assign(new EventTarget(), { getElementById(id) { if (!nodes.has(id)) { const node = new Element(); node.parentElement = new Element(); nodes.set(id, node); } return nodes.get(id); }, querySelectorAll: () => [] });
  globalThis.window = new EventTarget();
  globalThis.cancelAnimationFrame = () => {};
  const $ = globalThis.document.getElementById;
  $('busyOverlay').hidden = true;
  $('regionOperation').value = 'REPLACE';
  $('bundlePivot').value = 'ACTIVE_ROOT';
  const canvas = new Element(), camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .01, 100);
  camera.position.set(0, 0, 6); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const make = (id, stableId, parentId, xy, owner = '') => ({ id, stableId, parentId, points: xy.map(([x,y]) => new THREE.Vector3(x,y,0)),
    controlPoints: xy.map(([x,y]) => new THREE.Vector3(x,y,0)), children: [], instanceId: owner, length: 1, startRadius: .02, endRadius: .004 });
  const branches = [make(0, 'ONE.R', -1, [[1.4,0],[1.8,0]], 'ONE'), make(1, 'ONE.T', 0, [[0,0],[.2,0]], 'ONE'),
    make(2, 'TWO.R', -1, [[-1.8,0],[-1.4,0]], 'TWO')];
  branches[0].children = [1];
  const asset = { group: new THREE.Group(), branches: [], masterBranches: branches, elements: [], placements: [], treeOrgans: [] };
  const authoring = normalizeAuthoring({});
  const controls = { enabled: true }, modelRoot = new THREE.Group(), skeletonRoot = new THREE.Group();
  modelRoot.add(asset.group);
  let selection = new Set(selected), exclusions = new Set(), includeChildren = true, tool = 'COMB', transactions = 0, temporaryDone = 0;
  const selections = [], clicks = [], messages = [], callbacks = [], completed = [];
  const selectionId = branch => branch.instanceId ? branch.instanceId + '.R' : branch.stableId;
  const controller = createBranchSelectionController({ canvas, camera, controls, modelRoot, skeletonRoot, getAsset: () => asset,
    getAuthoring: () => authoring, getSelection: () => selection, getSelectionExclusions: () => exclusions, getWorkspace: () => 'TREE',
    getTool: () => tool, selectableBranch: selectable, selectionId,
    getRegionHits: extraHits && (context => { callbacks.push(context); return extraHits(context); }),
    includeSelectionChildren: () => includeChildren,
    setSelection(ids, options = {}) { selection = new Set(ids); exclusions = new Set(options.excluded || []); selections.push({ ids: [...selection], excluded: [...exclusions] }); },
    temporarySelectionDone(options) { temporaryDone++; completed.push(options); },
    temporaryClick(event, operation) { clicks.push({ event, operation }); return true; },
    transact() { transactions++; }, status: (text, state) => messages.push([text, state]) });
  const event = (x, y, extra = {}) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, shiftKey: false, ctrlKey: false, ...extra });
  const box = (modifiers = {}) => { controller.beginTemporary(event(375,375,modifiers)); controller.move(event(465,425)); controller.end(event(465,425)); };
  return { controller, canvas, controls, asset, authoring, nodes, selections, clicks, messages, callbacks, completed, event, box,
    get selection() { return selection; }, get exclusions() { return exclusions; }, get temporaryDone() { return temporaryDone; }, get transactions() { return transactions; }, get tool() { return tool; },
    select(ids, excluded = []) { selection = new Set(ids); exclusions = new Set(excluded); }, includeChildren(value) { includeChildren = value; }, setTool(value) {tool=value;},
    restore() { controller.cancel(); globalThis.document = previous.document; globalThis.window = previous.window; globalThis.cancelAnimationFrame = previous.cancel; } };
}

test('a preview LOD does not remove a complete unit whose internal twig intersects the box', () => {
  const f = fixture();
  try {
    const before = JSON.stringify(f.authoring), coordinates = f.asset.masterBranches.map(b => b.points.map(p => p.toArray()));
    assert.equal(f.asset.branches.length, 0);
    f.box({ shiftKey: true });
    assert.deepEqual([...f.selection], ['ONE.R']);
    assert.equal(f.temporaryDone, 1); assert.equal(f.transactions, 0); assert.equal(f.tool, 'COMB'); assert.equal(f.controls.enabled, true);
    assert.deepEqual(f.asset.masterBranches.map(b => b.points.map(p => p.toArray())), coordinates);
    assert.equal(JSON.stringify(f.authoring), before);
  } finally { f.restore(); }
});

test('organ-region hits canonicalize to complete roots and cannot bypass candidate filtering', () => {
  const f = fixture({ selectable: branch => branch.instanceId === 'ONE', extraHits: ({ project, polygon }) => {
    const projected = project(new THREE.Vector3()); assert.deepEqual(projected.slice(0,2), [400,400]); assert.ok(Math.abs(projected[2]) <= 1);
    assert.equal(polygon.length, 4);
    return ['ONE.T', 'ONE.R', 'TWO.R', 'missing'];
  } });
  try {
    f.controller.beginTemporary(f.event(480, 280, { shiftKey: true }));
    f.controller.move(f.event(530, 330)); f.controller.end(f.event(530, 330));
    assert.deepEqual([...f.selection], ['ONE.R']);
    assert.ok(f.callbacks.every(context => context.asset === f.asset && context.branches.every(b => b.instanceId === 'ONE')));
  } finally { f.restore(); }
});

test('Shift adds, Ctrl takes precedence and stays subtraction after the modifier is released', () => {
  const f = fixture({ selected: ['TWO.R'] });
  try {
    f.box({ shiftKey: true }); assert.deepEqual([...f.selection], ['TWO.R', 'ONE.R']);
    f.box({ shiftKey: true, ctrlKey: true }); assert.deepEqual([...f.selection], ['TWO.R']);
    assert.equal(f.exclusions.size, 0); assert.equal(f.clicks.length, 0); assert.equal(f.controls.enabled, true);
    assert.match(f.messages.at(-1)[0], /减选完成/);
    f.select(['ONE.R'], ['ONE.T']); f.box({ shiftKey: true });
    assert.equal(f.exclusions.size, 0, 'adding the complete unit clears exclusions for all of its internal branches');
    assert.equal(f.tool, 'COMB'); assert.equal(f.transactions, 0);
  } finally { f.restore(); }
});

test('a temporary modifier click reaches the complete-unit picker with the original operation', () => {
  const f = fixture({ selected: ['ONE.R'] });
  try {
    const down = f.event(420,400,{ ctrlKey: true, shiftKey: true });
    f.controller.beginTemporary(down); f.controller.end(f.event(421,401));
    assert.equal(f.clicks.length, 1); assert.equal(f.clicks[0].operation, 'SUBTRACT'); assert.equal(f.clicks[0].event.ctrlKey, false);
    assert.equal(f.temporaryDone, 0); assert.equal(f.controls.enabled, true); assert.equal(f.controller.active, false);
    assert.equal(f.canvas.hasPointerCapture(1), false); assert.equal(f.selections.length, 0); assert.equal(f.tool, 'COMB');
  } finally { f.restore(); }
});

test('cancelled temporary regions do not publish a selection or a click', () => {
  const f = fixture({ selected: ['TWO.R'] });
  try {
    f.controller.beginTemporary(f.event(375,375,{ shiftKey: true })); f.controller.move(f.event(465,425));
    assert.equal(f.controller.cancel(), true);
    assert.deepEqual([...f.selection], ['TWO.R']); assert.equal(f.selections.length, 0); assert.equal(f.clicks.length, 0);
    assert.equal(f.controls.enabled, true); assert.equal(f.canvas.hasPointerCapture(1), false); assert.equal(f.controller.active, false);
  } finally { f.restore(); }
});

test('Ctrl empty rectangles clear all selections and exclusions only in brush tools and keep the frozen Ctrl operation', () => {
  const f=fixture();try{
    const document=JSON.stringify(f.authoring),points=f.asset.masterBranches.map(b=>b.points.map(p=>p.toArray()));
    for(const tool of ['COMB','GRAB','BEND_BRUSH','PUSH_PULL','SMOOTH_BRUSH','SPREAD','TWIST_BRUSH','GUIDE','PROTECT','RETRACT']){
      f.setTool(tool);f.select(['ONE.R','TWO.R'],['ONE.T']);
      f.controller.beginTemporary(f.event(300,250,{ctrlKey:true}));f.controller.move(f.event(340,290));f.controller.end(f.event(340,290));
      assert.deepEqual([...f.selection],[]);assert.equal(f.exclusions.size,0);assert.deepEqual(f.completed.at(-1),{clear:true});
      assert.match(f.messages.at(-1)[0],/已清空所有选择/);assert.equal(f.tool,tool);assert.equal(f.transactions,0);assert.equal(f.clicks.length,0);
      assert.equal(f.controller.active,false);assert.equal(f.controls.enabled,true);assert.equal(f.canvas.hasPointerCapture(1),false);
    }
    assert.equal(JSON.stringify(f.authoring),document);assert.deepEqual(f.asset.masterBranches.map(b=>b.points.map(p=>p.toArray())),points);
  }finally{f.restore();}
});

test('Shift empty boxes, Ctrl clicks, cancelled Ctrl boxes and non-brush Ctrl boxes preserve selections', () => {
  const f=fixture({selected:['ONE.R','TWO.R']});try{
    f.controller.beginTemporary(f.event(300,250,{shiftKey:true}));f.controller.end(f.event(340,290));
    assert.deepEqual([...f.selection],['ONE.R','TWO.R']);assert.deepEqual(f.completed.at(-1),{clear:false});
    f.controller.beginTemporary(f.event(300,250,{ctrlKey:true}));f.controller.end(f.event(301,251));
    assert.deepEqual([...f.selection],['ONE.R','TWO.R']);assert.equal(f.clicks.length,1);
    f.controller.beginTemporary(f.event(300,250,{ctrlKey:true}));f.controller.move(f.event(340,290));f.controller.cancel();
    assert.deepEqual([...f.selection],['ONE.R','TWO.R']);
    f.setTool('BUNDLE_MOVE');f.controller.beginTemporary(f.event(300,250,{ctrlKey:true}));f.controller.end(f.event(340,290));
    assert.deepEqual([...f.selection],['ONE.R','TWO.R']);assert.deepEqual(f.completed.at(-1),{clear:false});assert.equal(f.transactions,0);
  }finally{f.restore();}
});

test('an isolated visible internal twig remains a whole-unit hit and Ctrl subtract never clears unrelated selections',()=>{
  const f=fixture({selected:['ONE.R','TWO.R']});try{
    f.controller.isolate(['ONE.T']);f.box({ctrlKey:true});
    assert.deepEqual([...f.selection],['TWO.R']);assert.deepEqual(f.completed.at(-1),{clear:false});
    assert.match(f.messages.at(-1)[0],/减选完成/);assert.equal(f.transactions,0);
  }finally{f.restore();}
});
